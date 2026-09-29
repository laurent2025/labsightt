/**
 * LabSight API server.
 *
 * Holds the patient record, enforces the reporting workflow, and proxies
 * inference so the model credential never reaches the browser.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { openDatabase, installImmutabilityGuards } from './db.js';
import {
  authenticate,
  createSession,
  destroySession,
  createUser,
  findUserById,
  publicUser,
  requireAuth,
  requireRole,
  setSessionCookie,
  clearSessionCookie,
  purgeExpiredSessions
} from './auth.js';
import { appendAudit, verifyChain, chainHead } from './audit.js';
import { runInference, inferenceStatus, InferenceError } from './inference.js';
import { newId, validatePasswordStrength } from './crypto.js';
import { encryptPHI, decryptPHI, blindIndex } from './encryption.js';
import { requestContext, createLoginLimiter, healthRoutes } from './operations.js';
import * as repo from './repository.js';

export function createApp({ dbPath = ':memory:', logger = () => {} } = {}) {
  const db = openDatabase(dbPath);
  installImmutabilityGuards(db);

  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');

  // Response hardening headers. These must be set per-response via middleware;
  // `app.set()` only configures Express and would silently send nothing.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Specimen images arrive as base64 and can be large.
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  app.use(requestContext(logger));

  const auth = requireAuth(db);
  const loginLimiter = createLoginLimiter();

  healthRoutes(app, db);

  app.get('/api/system/status', auth, (req, res) => {
    purgeExpiredSessions(db);
    const status = {
      service: 'labsight-api',
      phiEncrypted: true,
      serverTime: new Date().toISOString()
    };

    if (req.user) {
      status.audit = chainHead(db);
      status.inference = inferenceStatus();
    }

    res.json(status);
  });

  // ---------------------------------------------------------------- auth ----

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      // Throttle before doing any cryptographic work, so a spray of guesses
      // costs the attacker nothing beyond one cheap lookup.
      const limit = loginLimiter.check(req.ip, username.toLowerCase());
      if (!limit.allowed) {
        appendAudit(db, {
          actorName: username.slice(0, 64),
          action: 'LOGIN_THROTTLED',
          entity: 'user',
          details: `Too many attempts from ${req.ip}`
        });
        res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000));
        return res.status(429).json({
          error: 'Too many sign-in attempts. Wait before trying again.'
        });
      }

      const user = await authenticate(db, username, password);
      if (!user) {
        appendAudit(db, {
          actorName: username.slice(0, 64),
          action: 'LOGIN_FAILED',
          entity: 'user',
          details: 'Invalid credentials'
        });
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }

      const { token, expiresAt } = createSession(db, user, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        user.id
      );
      appendAudit(db, {
        actorId: user.id,
        actorName: user.display_name,
        action: 'LOGIN_SUCCEEDED',
        entity: 'user',
        entityId: user.id
      });

      setSessionCookie(res, token, expiresAt);
      res.json({ user: publicUser(user), expiresAt: expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    destroySession(db, req.cookies?.labsight_session);
    appendAudit(db, {
      actorId: req.user.id,
      actorName: req.user.display_name,
      action: 'LOGOUT',
      entity: 'user',
      entityId: req.user.id
    });
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', auth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.post('/api/auth/password', auth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      const user = findUserById(db, req.user.id);
      const { verifyPassword, hashPassword } = await import('./crypto.js');

      if (!(await verifyPassword(currentPassword ?? '', user.password_hash, user.password_salt))) {
        appendAudit(db, {
          actorId: user.id,
          actorName: user.display_name,
          action: 'PASSWORD_CHANGE_REFUSED',
          entity: 'user',
          entityId: user.id,
          details: 'Current password was incorrect'
        });
        return res.status(403).json({ error: 'Current password is incorrect.' });
      }
      const problems = validatePasswordStrength(newPassword ?? '');
      if (problems.length) {
        return res.status(400).json({ error: `New password ${problems.join('; ')}.` });
      }

      const { hash, salt } = await hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(
        hash,
        salt,
        user.id
      );
      appendAudit(db, {
        actorId: user.id,
        actorName: user.display_name,
        action: 'PASSWORD_CHANGED',
        entity: 'user',
        entityId: user.id
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ patients ----

  app.get('/api/patients', auth, (req, res) => {
    const { items, total, limit, offset } = repo.listPatients(db, {
      limit: req.query.limit,
      offset: req.query.offset,
      search: req.query.search
    });
    res.json({ patients: items, pagination: { total, limit, offset } });
  });

  app.post('/api/patients', auth, (req, res, next) => {
    try {
      const { patientNumber, fullName, age, gender, referringDoctor, referringFacility, clinicalNotes } =
        req.body ?? {};

      if (!patientNumber || !fullName) {
        return res.status(400).json({ error: 'Patient number and full name are required.' });
      }
      if (db.prepare('SELECT 1 FROM patients WHERE patient_number = ?').get(patientNumber)) {
        return res.status(409).json({ error: `Patient number ${patientNumber} already exists.` });
      }

      const id = newId('pat');
      db.prepare(`
        INSERT INTO patients (id, patient_number, full_name, full_name_index, age, gender,
                              referring_doctor, referring_facility, clinical_notes, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        patientNumber.trim(),
        encryptPHI(fullName),
        blindIndex(fullName),
        Number(age) || 0,
        gender ?? 'Other',
        encryptPHI(referringDoctor),
        encryptPHI(referringFacility),
        encryptPHI(clinicalNotes),
        new Date().toISOString(),
        req.user.id
      );

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'PATIENT_ACCESSIONED',
        entity: 'patient',
        entityId: id,
        // The number is an identifier, not a diagnosis; the name is not logged.
        details: `Patient number ${patientNumber}`
      });
      res.status(201).json({ patient: repo.getPatient(db, id) });
    } catch (err) {
      next(err);
    }
  });

app.patch('/api/patients/:id', auth, (req, res, next) => {
    try {
      const existing = db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Patient not found.' });

      // Encrypt every field before it reaches the database.
      const updates = { ...req.body };
      for (const field of ['fullName', 'referringDoctor', 'referringFacility', 'clinicalNotes']) {
        if (updates[field] !== undefined) updates[field] = encryptPHI(updates[field]);
      }

      const patient = repo.updatePatient(db, req.params.id, updates);
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'PATIENT_UPDATED',
        entity: 'patient',
        entityId: req.params.id,
        details: `Fields changed: ${Object.keys(updates).join(', ') || 'none'}`
      });
      res.json({ patient });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/patients/:id', auth, requireRole('director'), (req, res, next) => {
    try {
      const existing = db.prepare('SELECT id, full_name FROM patients WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Patient not found.' });

      // Soft delete: set active = 0
      db.prepare('UPDATE patients SET active = 0 WHERE id = ?').run(req.params.id);

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'PATIENT_DELETED',
        entity: 'patient',
        entityId: req.params.id,
        details: `Soft deleted patient: ${decryptPHI(existing.full_name)}`
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------- samples ----

  app.get('/api/samples', auth, (req, res) => {
    const { items, total, limit, offset } = repo.listSamples(db, {
      limit: req.query.limit,
      offset: req.query.offset,
      patientId: req.query.patientId
    });
    res.json({ samples: items, pagination: { total, limit, offset } });
  });

  app.post('/api/samples', auth, (req, res, next) => {
    try {
      const b = req.body ?? {};
      if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(b.patientId)) {
        return res.status(400).json({ error: 'A valid patientId is required.' });
      }
      const fieldsExamined = Number(b.fieldsExamined);
      if (!Number.isInteger(fieldsExamined) || fieldsExamined <= 0) {
        return res.status(400).json({ error: 'fieldsExamined must be a positive integer.' });
      }

      const id = newId('sam');
      db.prepare(`
        INSERT INTO samples (id, patient_id, sample_type, slide_label, stain_method, objective,
                             eyepiece, total_magnification, fields_examined, field_area_mm2,
                             collection_datetime, image_path, notes, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        b.patientId,
        b.sampleType ?? 'stool',
        b.slideLabel ?? newId('SLD'),
        b.stainMethod ?? '',
        b.objective ?? '40x',
        b.eyepiece ?? '10x',
        b.totalMagnification ?? '400x',
        fieldsExamined,
        Number(b.fieldAreaMm2) || 0,
        b.collectionDatetime ?? new Date().toISOString(),
        b.imageUrl ?? null,
        encryptPHI(b.notes),
        new Date().toISOString(),
        req.user.id
      );

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'SPECIMEN_ACCESSIONED',
        entity: 'sample',
        entityId: id,
        details: `Slide ${b.slideLabel ?? id}, ${fieldsExamined} field(s) at ${b.totalMagnification ?? '400x'}`
      });
      res.status(201).json({ sample: repo.getSample(db, id) });
    } catch (err) {
      next(err);
    }
  });

  // ----------------------------------------------------------- analyses ----

  app.get('/api/analyses', auth, (req, res) => {
    const { items, total, limit, offset } = repo.listAnalyses(db, {
      limit: req.query.limit,
      offset: req.query.offset,
      sampleId: req.query.sampleId,
      status: req.query.status
    });
    res.json({ analyses: items, pagination: { total, limit, offset } });
  });

  /**
   * Runs inference and persists the proposals. They are stored UNADJUDICATED;
   * they carry no clinical weight until a person rules on each one.
   */
  app.post('/api/analyses', auth, async (req, res, next) => {
    const startedAt = new Date().toISOString();
    try {
      const { sampleId, imageBase64, confidence } = req.body ?? {};
      if (!db.prepare('SELECT 1 FROM samples WHERE id = ?').get(sampleId)) {
        return res.status(400).json({ error: 'A valid sampleId is required.' });
      }

      const id = newId('ana');
      db.prepare(`
        INSERT INTO analyses (id, sample_id, model_id, status, total_detections, started_at, initiated_by)
        VALUES (?, ?, 'server-configured', 'processing', 0, ?, ?)
      `).run(id, sampleId, startedAt, req.user.id);

      let detections;
      try {
        detections = await runInference(db, req.user, imageBase64, {
          confidence: Number(confidence) || 0.5
        });
      } catch (err) {
        // The analysis row is kept so the failed attempt is visible, but it is
        // never given invented detections.
        db.prepare('UPDATE analyses SET status = ?, completed_at = ? WHERE id = ?').run(
          'in_review',
          new Date().toISOString(),
          id
        );
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'INFERENCE_FAILED',
          entity: 'analysis',
          entityId: id,
          details: err.message
        });
        throw err;
      }

      // One prepared statement, reused for the batch, rather than re-parsing
      // the INSERT for every detection.
      const insert = db.prepare(`
        INSERT INTO detections (id, analysis_id, class_name, confidence, x, y, width, height, confirmed, rejected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `);
      db.exec('BEGIN');
      try {
        for (const d of detections) {
          insert.run(newId('det'), id, d.class, d.confidence, d.x, d.y, d.width, d.height);
        }
        db.prepare('UPDATE analyses SET total_detections = ?, status = ?, completed_at = ? WHERE id = ?').run(
          detections.length,
          'in_review',
          new Date().toISOString(),
          id
        );
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      res.status(201).json({ analysis: repo.getAnalysis(db, id) });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------- detections ----

  app.patch('/api/detections/:id', auth, async (req, res, next) => {
    try {
      const detection = db.prepare('SELECT * FROM detections WHERE id = ?').get(req.params.id);
      if (!detection) return res.status(404).json({ error: 'Detection not found.' });

      const analysis = db
        .prepare('SELECT status FROM analyses WHERE id = ?')
        .get(detection.analysis_id);
      if (analysis.status === 'verified') {
        return res.status(409).json({ error: 'This analysis has been verified and can no longer be edited.' });
      }

      const confirmed = req.body?.confirmed;
      const rejected = req.body?.rejected;
      if (typeof confirmed !== 'boolean' && typeof rejected !== 'boolean') {
        return res.status(400).json({ error: 'Provide a boolean "confirmed" or "rejected" value.' });
      }
      const nextConfirmed = confirmed === true;
      const nextRejected = rejected === true;
      if (nextConfirmed && nextRejected) {
        return res.status(400).json({ error: 'A detection cannot be both confirmed and rejected.' });
      }

      db.prepare(`
        UPDATE detections
        SET confirmed = ?, rejected = ?, adjudicated_by = ?, adjudicated_at = ?
        WHERE id = ?
      `).run(nextConfirmed ? 1 : 0, nextRejected ? 1 : 0, req.user.id, new Date().toISOString(), req.params.id);

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: nextConfirmed ? 'DETECTION_CONFIRMED' : nextRejected ? 'DETECTION_REJECTED' : 'DETECTION_RESET',
        entity: 'detection',
        entityId: req.params.id,
        details: `${detection.class_name} at confidence ${detection.confidence.toFixed(3)}`
      });

      res.json({
        detection: repo.mapDetection(
          db.prepare('SELECT * FROM detections WHERE id = ?').get(req.params.id)
        )
      });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ reports ----

  app.get('/api/reports', auth, (req, res) => {
    const { items, total, limit, offset } = repo.listReports(db, {
      limit: req.query.limit,
      offset: req.query.offset,
      status: req.query.status
    });
    res.json({
      reports: items,
      pagination: { total, limit, offset }
    });
  });

  /** Full report payload for the printable/exportable view. */
  app.get('/api/reports/:id', auth, (req, res) => {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!row || row.deleted_at) return res.status(404).json({ error: 'Report not found.' });

    const context = repo.reportContext(db, row);
    res.json({
      report: {
        ...repo.mapReport(row),
        patient: context?.patient ?? null,
        sample: context?.sample ?? null,
        findings: context?.findings ?? []
      }
    });
  });

  /**
   * Generates a report. Refused unless every detection in the analysis has
   * been adjudicated. The client mirrors this check for a faster message, but
   * this is the one that counts.
   */
  app.post('/api/reports', auth, (req, res, next) => {
    try {
      const analysisId = req.body?.analysisId;
      const analysis = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId);
      if (!analysis) return res.status(400).json({ error: 'A valid analysisId is required.' });

      const pending = db
        .prepare('SELECT COUNT(*) AS n FROM detections WHERE analysis_id = ? AND confirmed = 0 AND rejected = 0')
        .get(analysisId).n;

      if (pending > 0) {
        return res.status(409).json({
          error: `${pending} detection(s) have not been adjudicated. Confirm or reject every candidate before generating a report.`,
          pendingAdjudication: pending
        });
      }

      const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(analysis.sample_id);
      if (!sample) return res.status(400).json({ error: 'The specimen for this analysis is missing.' });

      const id = newId('rpt');
      const reportNumber = `RPT-${new Date().getFullYear()}-${id.slice(-6).toUpperCase()}`;

      db.prepare(`
        INSERT INTO reports (id, report_number, analysis_id, technologist_id, technologist_name,
                             supervisor_name, status, technologist_notes, clinical_impression, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', ?, ?, ?)
      `).run(
        id,
        reportNumber,
        analysisId,
        req.user.id,
        req.user.display_name,
        req.body?.supervisorName ?? null,
        encryptPHI(req.body?.technologistNotes),
        encryptPHI(req.body?.clinicalImpression),
        new Date().toISOString()
      );

      db.prepare('UPDATE analyses SET status = ? WHERE id = ?').run('confirmed', analysisId);

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'REPORT_GENERATED',
        entity: 'report',
        entityId: id,
        details: reportNumber
      });

      res.status(201).json({ report: { ...repo.getReport(db, id), sample: repo.mapSample(sample) } });
    } catch (err) {
      next(err);
    }
  });

  /** Verifies a report by any signed-in user other than its author. */
  app.post('/api/reports/:id/verify', auth, (req, res, next) => {
    try {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report || report.deleted_at) return res.status(404).json({ error: 'Report not found.' });
      if (report.status === 'verified' || report.status === 'released') {
        return res.status(409).json({ error: 'This report has already been verified.' });
      }
      if (report.technologist_id === req.user.id) {
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'VERIFICATION_REFUSED',
          entity: 'report',
          entityId: report.id,
          details: 'Self-verification attempt: verifier is the originating technologist'
        });
        return res.status(403).json({
          error: 'Two-person integrity: a report cannot be verified by the technologist who produced it.'
        });
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE reports SET status = ?, verified_at = ?, verified_by = ? WHERE id = ?').run(
        'verified',
        now,
        req.user.id,
        report.id
      );
      db.prepare('UPDATE analyses SET status = ? WHERE id = ?').run('verified', report.analysis_id);

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'REPORT_VERIFIED',
        entity: 'report',
        entityId: report.id,
        details: 'Verified by a second person'
      });

      res.json({ report: repo.getReport(db, report.id) });
    } catch (err) {
      next(err);
    }
  });

app.post('/api/reports/:id/release', auth, requireRole('director'), (req, res, next) => {
    try {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report || report.deleted_at) return res.status(404).json({ error: 'Report not found.' });
      if (report.status !== 'verified') {
        return res.status(409).json({ error: 'Only a verified report can be released.' });
      }
      db.prepare('UPDATE reports SET status = ?, released_at = ? WHERE id = ?').run(
        'released',
        new Date().toISOString(),
        report.id
      );
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'REPORT_RELEASED',
        entity: 'report',
        entityId: report.id
      });
      res.json({ report: repo.getReport(db, report.id) });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ report PATCH (update) ----
  app.patch('/api/reports/:id', auth, (req, res, next) => {
    try {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report || report.deleted_at) return res.status(404).json({ error: 'Report not found.' });

      // Only technologist who created it (or supervisor/director) can edit before verification
      if (report.status === 'verified' || report.status === 'released') {
        return res.status(409).json({ error: 'Cannot edit a verified or released report.' });
      }
      if (report.technologist_id !== req.user.id && !['supervisor', 'director'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only the report author or a supervisor can edit this report.' });
      }

      const fieldColumns = {
        technologistNotes: 'technologist_notes',
        clinicalImpression: 'clinical_impression'
      };
      const filteredUpdates = Object.entries(req.body ?? {})
        .filter(([field]) => Object.hasOwn(fieldColumns, field));

      if (filteredUpdates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      const setClause = filteredUpdates.map(([field]) => `${fieldColumns[field]} = ?`).join(', ');
      const values = [...filteredUpdates.map(([, value]) => encryptPHI(value)), req.params.id];
      db.prepare(`UPDATE reports SET ${setClause} WHERE id = ?`).run(...values);

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'REPORT_UPDATED',
        entity: 'report',
        entityId: req.params.id,
        details: `Fields changed: ${filteredUpdates.map(([field]) => field).join(', ')}`
      });

      res.json({ report: repo.getReport(db, req.params.id) });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ report DELETE (soft) ----
  app.delete('/api/reports/:id', auth, requireRole('director'), (req, res, next) => {
    try {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report || report.deleted_at) return res.status(404).json({ error: 'Report not found.' });
      db.prepare('UPDATE reports SET deleted_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        req.params.id
      );

      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'REPORT_DELETED',
        entity: 'report',
        entityId: req.params.id,
        details: `Soft deleted report: ${report.report_number}`
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------- audit ----

  app.get('/api/audit', auth, requireRole('supervisor'), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?').all(limit);
    res.json({ entries: rows.map(mapAudit), integrity: verifyChain(db) });
  });

  app.get('/api/audit/verify', auth, requireRole('supervisor'), (_req, res) => {
    res.json(verifyChain(db));
  });

  // ------------------------------------------------------- administration ----

  app.get('/api/admin/users', auth, requireRole('director'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all();
    res.json({
      users: rows.map(u => ({
        ...publicUser(u),
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at
      }))
    });
  });

  app.post('/api/admin/users', auth, requireRole('director'), async (req, res, next) => {
    try {
      const { username, displayName, role, password } = req.body ?? {};
      if (!username || !displayName || !role) {
        return res.status(400).json({ error: 'username, displayName and role are required.' });
      }
      const problems = validatePasswordStrength(password ?? '');
      if (problems.length) {
        return res.status(400).json({ error: `Password ${problems.join('; ')}.` });
      }

      const user = await createUser(db, { username, displayName, role, password });
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'USER_CREATED',
        entity: 'user',
        entityId: user.id,
        details: `${username} as ${role}`
      });
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      if (/already taken/.test(err.message)) return res.status(409).json({ error: err.message });
      if (/^Unknown role/.test(err.message)) return res.status(400).json({ error: err.message });
      next(err);
    }
  });

  // ------------------------------------------------------------- errors ----

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  app.use((err, req, res, _next) => {
    if (err instanceof InferenceError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
    logger({
      level: 'error',
      event: 'unhandled_error',
      requestId: req.requestId,
      error: err?.message,
      stack: err?.stack
    });
    // The stack is logged, never returned: it can disclose schema details.
    res.status(500).json({
      error: 'Internal server error.',
      requestId: req.requestId
    });
  });

  app.locals.db = db;
  return app;
}

function mapAudit(row) {
  return {
    seq: row.seq,
    id: row.id,
    timestamp: row.timestamp,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    details: row.details,
    rowHash: row.row_hash,
    prevHash: row.prev_hash
  };
}

