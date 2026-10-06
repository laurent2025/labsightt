/**
 * LenziAI API server.
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
  destroyAllSessionsForUser,
  findUserById,
  publicUser,
  requireAuth,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  clearProfileCache,
  purgeExpiredSessions
} from './auth.js';
import { appendAudit, verifyChain, chainHead } from './audit.js';
import { runInference, inferenceStatus, InferenceError } from './inference.js';
import { newId, validatePasswordStrength } from './crypto.js';
import { encryptPHI, decryptPHI, blindIndex } from './encryption.js';
import { requestContext, createLoginLimiter, healthRoutes } from './operations.js';
import * as repo from './repository.js';
import {
  getSupabaseClient,
  hasSupabaseConfig,
  hasSupabaseDatabaseConfig,
  getSupabaseProfile,
  ensureSupabaseProfile,
  listSupabasePatients,
  createSupabasePatient,
  updateSupabasePatient,
  deleteSupabasePatient,
  listSupabaseSamples,
  getSupabaseSample,
  createSupabaseSample,
  listSupabaseAnalyses,
  getSupabaseAnalysis,
  createSupabaseAnalysis,
  saveSupabaseDetections,
  finalizeSupabaseAnalysis,
  adjudicateSupabaseDetection,
  setSupabaseUserApproval,
  listSupabaseReports,
  getSupabaseReport,
  createSupabaseReport,
  verifySupabaseReport,
  releaseSupabaseReport,
  updateSupabaseReport,
  deleteSupabaseReport
} from './supabase.js';

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

  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  );
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin || !allowedOrigins.has(origin)) return next();

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Specimen images arrive as base64 and can be large.
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  app.use(requestContext(logger));

  app.use('/api', (req, res, next) => {
    if (process.env.USE_SUPABASE_AUTH === 'true' && (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      return res.status(503).json({ error: 'Supabase auth is enabled but its API server configuration is incomplete.' });
    }
    if (process.env.USE_SUPABASE_DB === 'true' && !hasSupabaseDatabaseConfig()) {
      return res.status(503).json({ error: 'Supabase database is enabled but SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' });
    }
    next();
  });

  const auth = requireAuth(db);
  const loginLimiter = createLoginLimiter();

  function isAdminOrOwner(req) {
    return req.user?.role === 'admin';
  }

  function ownerFilter(tableAlias = 't') {
    return `${tableAlias}.created_by = ?`;
  }

  async function assertSupabaseOwnership(supabase, table, idColumn, idValue, ownerColumn, userId) {
    const { data, error } = await supabase
      .from(table)
      .select(ownerColumn)
      .eq(idColumn, idValue)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    return data[ownerColumn] === userId;
  }

  healthRoutes(app, db);

  app.get('/api/system/status', auth, (req, res) => {
    purgeExpiredSessions(db);
    const status = {
      service: 'renziai-api',
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
      const { email, username, password } = req.body ?? {};
      const supabaseAuth = process.env.USE_SUPABASE_AUTH === 'true';
      const loginIdentifier = supabaseAuth ? email : username;
      if (typeof loginIdentifier !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Enter both your work email and password to sign in.' });
      }

      if (supabaseAuth && hasSupabaseConfig()) {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(503).json({ error: 'The authentication service is not fully configured. Please contact your Lab Director or IT administrator.' });
        }
        const normalizedEmail = loginIdentifier.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return res.status(400).json({ error: 'Enter a valid email address.' });
        }
        const limit = loginLimiter.check(req.ip, normalizedEmail);
        if (!limit.allowed) {
          res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000));
          const waitSecs = Math.ceil(limit.retryAfterMs / 1000);
          return res.status(429).json({ error: `Too many sign-in attempts. Please wait ${waitSecs} seconds before trying again.` });
        }
        const supabase = getSupabaseClient({ admin: true });
        let authResult;
        try {
          authResult = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        } catch (err) {
          console.error('[login] signInWithPassword threw:', err.message);
          return res.status(503).json({ error: 'Authentication service error. Try again later.' });
        }
        const { data, error } = authResult;
        if (error || !data.user || !data.session) {
          const unconfirmed =
            error?.code === 'email_not_confirmed' ||
            /not confirmed|unverified/i.test(String(error?.message ?? ''));
          return res.status(401).json({
            error: unconfirmed
              ? 'Your email address has not been verified yet. Open the confirmation email we sent and click the link, then return here to sign in.'
              : 'The email or password entered is incorrect. Check for extra spaces and ensure the password matches what was saved for this email address.'
          });
        }

        // Fresh admin client: the `supabase` client now holds this user's
        // session, so any further query on it would be RLS-scoped to that user
        // instead of running with the service role.
        let profile;
        try {
          profile = await ensureSupabaseProfile(getSupabaseClient({ admin: true }), data.user);
        } catch (profileErr) {
          console.error('[login] profile verification failed:', profileErr.message);
          return res.status(503).json({ error: 'Your account profile could not be loaded. Please sign out and sign in again. If the problem continues, contact your Lab Director.' });
        }

        // Access requires admin approval in addition to email confirmation.
        // 403 (not 401) so the client keeps the rejected login on screen with
        // the approval message instead of cycling through session handling.
        if (profile.approved !== true) {
          return res.status(403).json({
            code: 'NOT_APPROVED',
            error: 'This account is waiting for administrator approval. An administrator must approve it before you can sign in.'
          });
        }

        const expiresAt = new Date(
          (data.session.expires_at ?? Math.floor(Date.now() / 1000) + (data.session.expires_in ?? 8 * 60 * 60)) * 1000
        );
        setSessionCookie(res, data.session.access_token, expiresAt);
        return res.json({
          user: { id: data.user.id, username: profile.username, displayName: profile.display_name, email: profile.email ?? null, role: profile.role === 'admin' ? 'admin' : 'member', active: true },
          expiresAt: expiresAt.toISOString()
        });
      }

      // Throttle before doing any cryptographic work, so a spray of guesses
      // costs the attacker nothing beyond one cheap lookup.
      const limit = loginLimiter.check(req.ip, loginIdentifier.toLowerCase());
      if (!limit.allowed) {
        appendAudit(db, {
          actorName: loginIdentifier.slice(0, 64),
          action: 'LOGIN_THROTTLED',
          entity: 'user',
          details: `Too many attempts from ${req.ip}`
        });
        res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000));
        return res.status(429).json({
          error: 'Too many sign-in attempts. Wait before trying again.'
        });
      }

      const user = await authenticate(db, loginIdentifier, password);
      if (!user) {
        appendAudit(db, {
          actorName: loginIdentifier.slice(0, 64),
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

  app.post('/api/auth/signup', async (req, res, next) => {
    try {
      if (process.env.USE_SUPABASE_AUTH !== 'true' || !hasSupabaseConfig()) {
        return res.status(503).json({ error: 'Email sign-up is not enabled for this deployment. Please contact your Lab Director or IT administrator to request access.' });
      }
      const { email, password, displayName } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || typeof displayName !== 'string') {
        return res.status(400).json({ error: 'Please provide your work email, full name, and a password to request an account.' });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedName = displayName.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Please enter a valid work email address (for example: jane.doe@hospital.org).' });
      }
      if (normalizedName.length < 2 || normalizedName.length > 120) {
        return res.status(400).json({ error: 'Please enter your full name (between 2 and 120 characters).' });
      }
      const problems = validatePasswordStrength(password);
      if (problems.length) return res.status(400).json({ error: `Password does not meet the policy: ${problems.join('; ')}.` });

      const limit = loginLimiter.check(req.ip, `signup:${normalizedEmail}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000));
        const waitSecs = Math.ceil(limit.retryAfterMs / 1000);
        return res.status(429).json({ error: `Too many account requests. Please wait ${waitSecs} seconds before trying again.` });
      }

      const supabase = getSupabaseClient({ admin: true });
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { display_name: normalizedName },
          ...(process.env.SUPABASE_AUTH_REDIRECT_URL
            ? { emailRedirectTo: process.env.SUPABASE_AUTH_REDIRECT_URL }
            : {})
        }
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
          return res.status(200).json({ ok: true, message: 'If the address is eligible, a verification email will arrive shortly.' });
        }
        return res.status(400).json({ error: error.message });
      }

      // Eagerly create the profile row so login never fails even when the
      // database trigger has not been applied.
      if (signUpData?.user) {
        try {
          // signUp may attach the new user's session to `supabase`; the profile
          // write must stay on the service role, so use a fresh admin client.
          await ensureSupabaseProfile(getSupabaseClient({ admin: true }), signUpData.user);
        } catch (profileErr) {
          console.error('[signup] profile pre-creation failed (non-fatal):', profileErr.message);
        }
      }

      return res.status(201).json({
        ok: true,
        message: 'Check your email for a verification link. Once verified, you can sign in to LenziAI.'
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', auth, async (req, res) => {
    if (process.env.USE_SUPABASE_AUTH === 'true' && hasSupabaseConfig()) {
      const supabase = getSupabaseClient();
      if (req.cookies?.labsight_session) {
        await supabase.auth.signOut();
      }
    } else {
      destroySession(db, req.cookies?.labsight_session);
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'LOGOUT',
        entity: 'user',
        entityId: req.user.id
      });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', auth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.post('/api/auth/password', auth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body ?? {};
      if (process.env.USE_SUPABASE_AUTH === 'true' && hasSupabaseConfig()) {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(503).json({ error: 'Password changes require the server to be fully configured. Please contact your Lab Director or IT administrator.' });
        }
        const problems = validatePasswordStrength(newPassword ?? '');
        if (problems.length) {
          return res.status(400).json({ error: `The new password does not meet the policy: ${problems.join('; ')}.` });
        }
        const supabase = getSupabaseClient({ admin: true });
        const { error: verificationError } = await supabase.auth.signInWithPassword({
          email: req.user.email,
          password: currentPassword ?? ''
        });
        if (verificationError) return res.status(403).json({ error: 'The current password you entered is incorrect. Please try again.' });

        const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
        if (error) throw error;
        const { error: revokeError } = await supabase.auth.admin.revokeRefreshTokensForUser(req.user.id);
        if (revokeError) console.error('[password] token revoke failed:', revokeError.message);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'PASSWORD_CHANGED',
          entity: 'user',
          entityId: req.user.id,
          details: 'Password changed; sessions invalidated'
        });
        return res.json({ ok: true });
      }

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
        return res.status(403).json({ error: 'The current password you entered is incorrect. Please try again.' });
      }
      const problems = validatePasswordStrength(newPassword ?? '');
      if (problems.length) {
        return res.status(400).json({ error: `The new password does not meet the policy: ${problems.join('; ')}.` });
      }

      const { hash, salt } = await hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(
        hash,
        salt,
        user.id
      );
      destroyAllSessionsForUser(db, user.id);
      appendAudit(db, {
        actorId: user.id,
        actorName: user.display_name,
        action: 'PASSWORD_CHANGED',
        entity: 'user',
        entityId: user.id,
        details: 'Password changed; all sessions invalidated'
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ patients ----

  app.get('/api/patients', auth, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        if (req.user.role !== 'admin') {
          const { data, error } = await supabase
            .from('patients')
            .select('id')
            .eq('created_by', req.user.id);
          if (error) throw error;
          const allowedIds = new Set((data ?? []).map(r => r.id));
          const { items, total, limit, offset } = await listSupabasePatients(supabase, {
            limit: req.query.limit,
            offset: req.query.offset,
            search: req.query.search,
            allowedIds: Array.from(allowedIds)
          });
          return res.json({ patients: items, pagination: { total, limit, offset } });
        }

        const { items, total, limit, offset } = await listSupabasePatients(supabase, {
          limit: req.query.limit,
          offset: req.query.offset,
          search: req.query.search
        });
        return res.json({ patients: items, pagination: { total, limit, offset } });
      }

      const { items, total, limit, offset } = repo.listPatients(db, {
        limit: req.query.limit,
        offset: req.query.offset,
        search: req.query.search,
        createdBy: req.user.role !== 'admin' ? req.user.id : null
      });
      return res.json({ patients: items, pagination: { total, limit, offset } });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/patients/export', auth, async (req, res, next) => {
    try {
      const term = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      let patients = [];
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        if (req.user.role !== 'admin') {
          const { data, error } = await supabase
            .from('patients')
            .select('id')
            .eq('created_by', req.user.id);
          if (error) throw error;
          const allowedIds = new Set((data ?? []).map(r => r.id));
          const result = await listSupabasePatients(supabase, {
            limit: 2000,
            offset: 0,
            search: term,
            allowedIds: Array.from(allowedIds)
          });
          patients = result.items ?? [];
        } else {
          const result = await listSupabasePatients(supabase, {
            limit: 2000,
            offset: 0,
            search: term
          });
          patients = result.items ?? [];
        }
      } else {
        const result = repo.listPatients(db, {
          limit: 2000,
          offset: 0,
          search: term,
          createdBy: req.user.role !== 'admin' ? req.user.id : null
        });
        patients = result.items ?? [];
      }

      const rows = buildPatientExportRows(patients);
      const csv = serializePatientCsv(rows);
      const filename = `patients_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/patients', auth, async (req, res, next) => {
    try {
      const { patientNumber, fullName, age, gender, referringDoctor, referringFacility, clinicalNotes } =
        req.body ?? {};

      if (!patientNumber || !fullName) {
        return res.status(400).json({ error: 'Please provide both the patient ID / MRN and the full patient name to continue.' });
      }

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const duplicate = await supabase
          .from('patients')
          .select('id')
          .eq('patient_number', String(patientNumber).trim())
          .maybeSingle();

        if (duplicate.error) throw duplicate.error;
        if (duplicate.data) {
          return res.status(409).json({ error: `Patient ID "${patientNumber}" is already registered. Please check the ID or use a different one.` });
        }

        const patient = await createSupabasePatient(supabase, {
          patientNumber,
          fullName,
          age,
          gender,
          referringDoctor,
          referringFacility,
          clinicalNotes,
          createdBy: req.user.id
        });

        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'PATIENT_ACCESSIONED',
          entity: 'patient',
          entityId: patient.id,
          details: `Patient number ${patientNumber}`
        });
        return res.status(201).json({ patient });
      }

      if (db.prepare('SELECT 1 FROM patients WHERE patient_number = ?').get(patientNumber)) {
        return res.status(409).json({ error: `Patient ID "${patientNumber}" is already registered. Please check the ID or use a different one.` });
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
        details: `Patient number ${patientNumber}`
      });
      res.status(201).json({ patient: repo.getPatient(db, id) });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/patients/:id', auth, async (req, res, next) => {
    try {
      const existing = db.prepare('SELECT id, created_by FROM patients WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'This patient record could not be found. It may have been archived.' });
      if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Only the operator who registered this patient can update their record.' });
      }

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        if (req.user.role !== 'admin') {
          const owned = await assertSupabaseOwnership(supabase, 'patients', 'id', req.params.id, 'created_by', req.user.id);
          if (!owned) return res.status(403).json({ error: 'Only the operator who registered this patient can update their record.' });
        }
        const patient = await updateSupabasePatient(supabase, req.params.id, req.body ?? {});
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'PATIENT_UPDATED',
          entity: 'patient',
          entityId: req.params.id,
          details: `Fields changed: ${Object.keys(req.body ?? {}).join(', ') || 'none'}`
        });
        return res.json({ patient });
      }

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

  app.delete('/api/patients/:id', auth, async (req, res, next) => {
    try {
      const existing = db.prepare('SELECT id, created_by FROM patients WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'This patient record could not be found. It may have been archived.' });
      if (req.user.role !== 'admin' && existing.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Only the operator who registered this patient can archive their record.' });
      }

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        await deleteSupabasePatient(supabase, req.params.id);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'PATIENT_DELETED',
          entity: 'patient',
          entityId: req.params.id,
          details: 'Soft deleted patient via Supabase'
        });
        return res.status(204).send();
      }

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

  app.get('/api/samples', auth, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const { items, total, limit, offset } = await listSupabaseSamples(supabase, {
          limit: req.query.limit,
          offset: req.query.offset,
          patientId: req.query.patientId
        });
        return res.json({ samples: items, pagination: { total, limit, offset } });
      }

      const { items, total, limit, offset } = repo.listSamples(db, {
        limit: req.query.limit,
        offset: req.query.offset,
        patientId: req.query.patientId,
        createdBy: req.user.role !== 'admin' ? req.user.id : null
      });
      return res.json({ samples: items, pagination: { total, limit, offset } });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/samples', auth, async (req, res, next) => {
    try {
      const b = req.body ?? {};
      const fieldsExamined = Number(b.fieldsExamined);
      if (!Number.isInteger(fieldsExamined) || fieldsExamined <= 0) {
        return res.status(400).json({ error: 'Please enter a valid number of fields examined (at least 1).' });
      }

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const sample = await createSupabaseSample(supabase, {
          patientId: b.patientId,
          sampleType: b.sampleType,
          slideLabel: b.slideLabel,
          stainMethod: b.stainMethod,
          objective: b.objective,
          eyepiece: b.eyepiece,
          totalMagnification: b.totalMagnification,
          fieldsExamined,
          fieldAreaMm2: b.fieldAreaMm2,
          collectionDatetime: b.collectionDatetime,
          imageUrl: b.imageUrl,
          notes: b.notes,
          createdBy: req.user.id
        });

        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'SPECIMEN_ACCESSIONED',
          entity: 'sample',
          entityId: sample.id,
          details: `Slide ${sample.slideLabel ?? sample.id}, ${fieldsExamined} field(s) at ${sample.totalMagnification ?? '400x'}`
        });
        return res.status(201).json({ sample });
      }

      const patientOwner = db.prepare('SELECT created_by FROM patients WHERE id = ?').get(b.patientId);
      if (!patientOwner) {
        return res.status(400).json({ error: 'Please select a valid patient before accessioning a specimen.' });
      }
      if (req.user.role !== 'admin' && patientOwner.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only accession specimens for patients you have registered.' });
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

    app.get('/api/samples/:id', auth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          const owner = db.prepare('SELECT created_by FROM samples WHERE id = ?').get(req.params.id);
        if (!owner || owner.created_by !== req.user.id) {
          const patientOwner = db.prepare('SELECT created_by FROM patients WHERE id = (SELECT patient_id FROM samples WHERE id = ?)').get(req.params.id);
          if (!patientOwner || patientOwner.created_by !== req.user.id) {
            return res.status(403).json({ error: 'You can only view specimens for patients you have registered.' });
          }
        }
        }

        if (hasSupabaseDatabaseConfig()) {
          const supabase = getSupabaseClient({ admin: true });
          if (req.user.role !== 'admin') {
            const owned = await assertSupabaseOwnership(supabase, 'samples', 'id', req.params.id, 'created_by', req.user.id);
            if (!owned) {
              const { data: sampleRow } = await supabase.from('samples').select('patient_id').eq('id', req.params.id).maybeSingle();
              if (sampleRow) {
                const patientOwned = await assertSupabaseOwnership(supabase, 'patients', 'id', sampleRow.patient_id, 'created_by', req.user.id);
                if (!patientOwned) return res.status(403).json({ error: 'You can only view specimens for patients you have registered.' });
              } else {
                return res.status(404).json({ error: 'This specimen could not be found. It may have been removed.' });
              }
            }
          }
          const sample = await getSupabaseSample(supabase, req.params.id);
          if (!sample) return res.status(404).json({ error: 'Sample not found.' });
          return res.json({ sample });
        }

        const sample = repo.getSample(db, req.params.id);
        if (!sample) return res.status(404).json({ error: 'This specimen could not be found. It may have been removed.' });
        return res.json({ sample });
      } catch (err) {
        next(err);
      }
    });

   // ----------------------------------------------------------- analyses ----

  app.get('/api/analyses', auth, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const { items, total, limit, offset } = await listSupabaseAnalyses(supabase, {
          limit: req.query.limit,
          offset: req.query.offset,
          sampleId: req.query.sampleId,
          status: req.query.status
        });
        return res.json({ analyses: items, pagination: { total, limit, offset } });
      }

      const { items, total, limit, offset } = repo.listAnalyses(db, {
        limit: req.query.limit,
        offset: req.query.offset,
        sampleId: req.query.sampleId,
        status: req.query.status,
        createdBy: req.user.role !== 'admin' ? req.user.id : null
      });
      return res.json({ analyses: items, pagination: { total, limit, offset } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Runs inference and persists the proposals. They are stored UNADJUDICATED;
   * they carry no clinical weight until a person rules on each one.
   */
  app.post('/api/analyses', auth, async (req, res, next) => {
    const startedAt = new Date().toISOString();
    try {
      const { sampleId, imageBase64, confidence } = req.body ?? {};

      if (typeof imageBase64 === 'string') {
        const base64Length = imageBase64.length;
        if (base64Length > 15 * 1024 * 1024) {
          return res.status(413).json({ error: 'Image payload is too large. Maximum size is 15 MB.' });
        }
        const decodedLength = Math.floor(base64Length * 0.75);
        if (decodedLength > 20 * 1024 * 1024) {
          return res.status(413).json({ error: 'Decoded image would exceed 20 MB.' });
        }
      }

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        if (req.user.role !== 'admin') {
          const { data: sampleRow } = await supabase.from('samples').select('patient_id, created_by').eq('id', sampleId).maybeSingle();
          if (!sampleRow) return res.status(400).json({ error: 'A valid sampleId is required.' });
          if (sampleRow.created_by !== req.user.id) {
            const { data: patientRow } = await supabase.from('patients').select('created_by').eq('id', sampleRow.patient_id).maybeSingle();
            if (!patientRow || patientRow.created_by !== req.user.id) {
              return res.status(403).json({ error: 'You do not have permission to analyse this specimen.' });
            }
          }
        }
        // A specimen may be re-scanned so features the first pass
        // missed are captured. The schema permits only one active
        // (non-verified) analysis per sample, so a re-scan reuses
        // that row: its previous detections are replaced by the
        // fresh inference, and the updated findings flow into the
        // next report generated for this analysis.
        const { data: existingRow, error: existingError } = await supabase
          .from('analyses')
          .select('id')
          .eq('sample_id', sampleId)
          .neq('status', 'verified')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingError) throw existingError;

        let analysisId;
        if (existingRow) {
          analysisId = existingRow.id;
          await supabase.from('detections').delete().eq('analysis_id', analysisId);
          const { error: resetError } = await supabase
            .from('analyses')
            .update({
              started_at: startedAt,
              completed_at: null,
              total_detections: 0,
              status: 'processing'
            })
            .eq('id', analysisId);
          if (resetError) throw resetError;
          appendAudit(db, {
            actorId: req.user.id,
            actorName: req.user.display_name,
            action: 'ANALYSIS_RERUN',
            entity: 'analysis',
            entityId: analysisId,
            details: 'Field re-scanned; previous candidates replaced'
          });
        } else {
          analysisId = `ana_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await createSupabaseAnalysis(supabase, {
            id: analysisId,
            sampleId,
            initiatedBy: req.user.id,
            startedAt
          });
        }

        let detections;
        try {
          detections = await runInference(db, req.user, imageBase64, {
            confidence: Number(confidence) || 0.5
          });
        } catch (err) {
          await finalizeSupabaseAnalysis(supabase, analysisId, {
            totalDetections: 0,
            status: 'in_review',
            completedAt: new Date().toISOString()
          });
          appendAudit(db, {
            actorId: req.user.id,
            actorName: req.user.display_name,
            action: 'INFERENCE_FAILED',
            entity: 'analysis',
            entityId: analysisId,
            details: String(err?.message ?? err)
          });
          throw err;
        }

        await saveSupabaseDetections(supabase, analysisId, detections);
        const finalised = await finalizeSupabaseAnalysis(supabase, analysisId, {
          totalDetections: detections.length,
          status: 'in_review',
          completedAt: new Date().toISOString()
        });
        const analysis = await getSupabaseAnalysis(supabase, analysisId);
        return res.status(existingRow ? 200 : 201).json({ analysis });
      }

      const sampleOwner = db.prepare('SELECT created_by FROM samples WHERE id = ?').get(sampleId);
      if (!sampleOwner) {
        return res.status(400).json({ error: 'Please select a valid specimen before running analysis.' });
      }
      if (req.user.role !== 'admin' && sampleOwner.created_by !== req.user.id) {
        const patientOwner = db.prepare('SELECT created_by FROM patients WHERE id = (SELECT patient_id FROM samples WHERE id = ?)').get(sampleId);
        if (!patientOwner || patientOwner.created_by !== req.user.id) {
          return res.status(403).json({ error: 'You can only analyse specimens for patients you have registered.' });
        }
      }

      // Re-scan support (SQLite branch): same rule as above —
      // reuse the sample's active analysis and replace its
      // detections so a re-scan captures missed features.
      const existing = db.prepare(`
        SELECT id FROM analyses
        WHERE sample_id = ? AND status != 'verified'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(sampleId);

      let id;
      if (existing) {
        id = existing.id;
        db.prepare('DELETE FROM detections WHERE analysis_id = ?').run(id);
        db.prepare(`
          UPDATE analyses
          SET started_at = ?, completed_at = NULL, total_detections = 0, status = 'processing'
          WHERE id = ?
        `).run(startedAt, id);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'ANALYSIS_RERUN',
          entity: 'analysis',
          entityId: id,
          details: 'Field re-scanned; previous candidates replaced'
        });
      } else {
        id = newId('ana');
        db.prepare(`
          INSERT INTO analyses (id, sample_id, model_id, status, total_detections, started_at, initiated_by)
          VALUES (?, ?, 'server-configured', 'processing', 0, ?, ?)
        `).run(id, sampleId, startedAt, req.user.id);
      }

      let detections;
      try {
        detections = await runInference(db, req.user, imageBase64, {
          confidence: Number(confidence) || 0.5
        });
      } catch (err) {
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

      res.status(existing ? 200 : 201).json({ analysis: repo.getAnalysis(db, id) });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------- detections ----

  app.patch('/api/detections/:id', auth, async (req, res, next) => {
    try {
      const confirmed = req.body?.confirmed;
      const rejected = req.body?.rejected;
      if (typeof confirmed !== 'boolean' && typeof rejected !== 'boolean') {
        return res.status(400).json({ error: 'Please provide confirmed: true or rejected: true to record your decision.' });
      }
      const nextConfirmed = confirmed === true;
      const nextRejected = rejected === true;
      if (nextConfirmed && nextRejected) {
        return res.status(400).json({ error: 'A detection cannot be both confirmed and rejected. Please choose one decision.' });
      }

      if (hasSupabaseDatabaseConfig()) {
        // In database mode detection rows are written to Supabase only — the
        // local mirror is never populated, so an existence check against it
        // would 404 every adjudication. Resolve existence, lock state, and
        // ownership in Supabase instead.
        const supabase = getSupabaseClient({ admin: true });

        const { data: detRow, error: detError } = await supabase
          .from('detections')
          .select('*')
          .eq('id', req.params.id)
          .maybeSingle();
        if (detError) throw detError;
        if (!detRow) return res.status(404).json({ error: 'This detection could not be found. It may have been removed or the analysis may have changed.' });

        const { data: analysisRow, error: analysisError } = await supabase
          .from('analyses')
          .select('status, initiated_by, sample_id')
          .eq('id', detRow.analysis_id)
          .maybeSingle();
        if (analysisError) throw analysisError;
        if (analysisRow?.status === 'verified') {
          return res.status(409).json({ error: 'This analysis has already been verified. Verified analyses are locked to preserve the audit trail.' });
        }

        // Any signed-in user may adjudicate findings; the actor is recorded
        // as adjudicated_by and in the audit chain.
        const result = await adjudicateSupabaseDetection(supabase, req.params.id, {
          confirmed: nextConfirmed,
          rejected: nextRejected,
          userId: req.user.id
        });
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: nextConfirmed ? 'DETECTION_CONFIRMED' : nextRejected ? 'DETECTION_REJECTED' : 'DETECTION_RESET',
          entity: 'detection',
          entityId: req.params.id,
          details: `${result.class} at confidence ${result.confidence.toFixed(3)}`
        });
        return res.json({ detection: result });
      }

      const detection = db.prepare('SELECT * FROM detections WHERE id = ?').get(req.params.id);
      if (!detection) return res.status(404).json({ error: 'This detection could not be found. It may have been removed or the analysis may have changed.' });

      const analysis = db
        .prepare('SELECT status, initiated_by, sample_id FROM analyses WHERE id = ?')
        .get(detection.analysis_id);
      if (analysis.status === 'verified') {
        return res.status(409).json({ error: 'This analysis has already been verified. Verified analyses are locked to preserve the audit trail.' });
      }
      // Any signed-in user may adjudicate findings; the actor is recorded
      // as adjudicated_by and in the audit chain.

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

  app.get('/api/reports', auth, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const { items, total, limit, offset } = await listSupabaseReports(supabase, {
          limit: req.query.limit,
          offset: req.query.offset,
          status: req.query.status
        });
        return res.json({ reports: items, pagination: { total, limit, offset } });
      }

      const { items, total, limit, offset } = repo.listReports(db, {
        limit: req.query.limit,
        offset: req.query.offset,
        status: req.query.status,
        createdBy: req.user.role !== 'admin' ? req.user.id : null
      });
      return res.json({ reports: items, pagination: { total, limit, offset } });
    } catch (err) {
      next(err);
    }
  });

  /** Full report payload for the printable/exportable view. */
  app.get('/api/reports/:id', auth, async (req, res, next) => {
    try {
      // Database mode first: reports written to Supabase have no local row, so
      // a local existence check here would 404 before the Supabase path.
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const report = await getSupabaseReport(supabase, req.params.id);
        if (!report) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
        if (req.user.role !== 'admin') {
          const { data: analysisRow } = await supabase.from('analyses').select('initiated_by').eq('id', report.analysisId).maybeSingle();
          if (analysisRow?.initiated_by !== req.user.id && report.technologistId !== req.user.id) {
            return res.status(403).json({ error: 'You can only view reports for specimens you have registered or analysed.' });
          }
        }
        return res.json({ report });
      }

      const row = db.prepare('SELECT * FROM reports WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
      if (req.user.role !== 'admin') {
        const analysis = db.prepare('SELECT initiated_by FROM analyses WHERE id = ?').get(row.analysis_id);
        if (analysis && analysis.initiated_by !== req.user.id && row.technologist_id !== req.user.id) {
          return res.status(403).json({ error: 'You can only view reports for specimens you have registered or analysed.' });
        }
      }

      const context = repo.reportContext(db, row);
      res.json({
        report: {
          ...repo.mapReport(row),
          patient: context?.patient ?? null,
          sample: context?.sample ?? null,
          findings: context?.findings ?? []
        }
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Generates a report. Refused unless every detection in the analysis has
   * been adjudicated. The client mirrors this check for a faster message, but
   * this is the one that counts.
   */
  app.post('/api/reports', auth, async (req, res, next) => {
    try {
      const analysisId = req.body?.analysisId;

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        if (req.user.role !== 'admin') {
          const { data: analysisRow } = await supabase.from('analyses').select('initiated_by').eq('id', analysisId).maybeSingle();
          if (!analysisRow || analysisRow.initiated_by !== req.user.id) {
            return res.status(403).json({ error: 'You can only generate reports for analyses you have initiated.' });
          }
        }
        const report = await createSupabaseReport(supabase, {
          analysisId,
          technologistId: req.user.id,
          technologistName: req.user.display_name,
          supervisorName: req.body?.supervisorName ?? null,
          technologistNotes: req.body?.technologistNotes ?? '',
          clinicalImpression: req.body?.clinicalImpression ?? ''
        });

        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'REPORT_GENERATED',
          entity: 'report',
          entityId: report.id,
          details: report.reportNumber
        });

        return res.status(201).json({ report });
      }

      const analysis = db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysisId);
      if (!analysis) return res.status(400).json({ error: 'Please select a valid analysis before generating a report.' });
      // Any signed-in user can generate and sign a report; the generator is
      // recorded as technologist and in the audit chain.

      const pending = db
        .prepare('SELECT COUNT(*) AS n FROM detections WHERE analysis_id = ? AND confirmed = 0 AND rejected = 0')
        .get(analysisId).n;

      if (pending > 0) {
        return res.status(409).json({
          error: `${pending} detection${pending === 1 ? '' : 's'} still need${pending === 1 ? 's' : ''} to be adjudicated. Please confirm or reject every candidate before generating a report.`,
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

  /** Verifies a report; any signed-in user may verify. */
  // Any signed-in user can sign/verify a report; the acting user is recorded
  // as verified_by and in the audit chain.
  app.post('/api/reports/:id/verify', auth, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const existing = await getSupabaseReport(supabase, req.params.id);
        if (!existing) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
        if (existing.status === 'verified' || existing.status === 'released') {
          return res.status(409).json({ error: 'This report has already been verified. Verified reports are locked to preserve the audit trail.' });
        }

        const report = await verifySupabaseReport(supabase, req.params.id, req.user.id);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'REPORT_VERIFIED',
          entity: 'report',
          entityId: report.id,
          details: 'Verified'
        });
        return res.json({ report });
      }

      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report || report.deleted_at) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
      if (report.status === 'verified' || report.status === 'released') {
        return res.status(409).json({ error: 'This report has already been verified. Verified reports are locked to preserve the audit trail.' });
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
        details: 'Verified'
      });

      res.json({ report: repo.getReport(db, report.id) });
    } catch (err) {
      next(err);
    }
  });

  // Any signed-in user can release a verified report; the actor is audited.
  app.post('/api/reports/:id/release', auth, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const existing = await getSupabaseReport(supabase, req.params.id);
        if (!existing) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
        if (existing.status !== 'verified') {
          return res.status(409).json({ error: 'Only a verified report can be released. Please verify the report first.' });
        }
        const report = await releaseSupabaseReport(supabase, req.params.id);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'REPORT_RELEASED',
          entity: 'report',
          entityId: report.id
        });
        return res.json({ report });
      }

      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report || report.deleted_at) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
      if (report.status !== 'verified') {
        return res.status(409).json({ error: 'Only a verified report can be released. Please verify the report first.' });
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
  app.patch('/api/reports/:id', auth, async (req, res, next) => {
    try {
      // Database mode first: Supabase-written reports have no local row, so a
      // local existence check here would 404 before the Supabase path.
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const existing = await getSupabaseReport(supabase, req.params.id);
        if (!existing) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
        // Any signed-in user may record notes and the clinical impression on
        // a report that has not been verified yet.
        if (existing.status === 'verified' || existing.status === 'released') {
          return res.status(409).json({ error: 'Verified and released reports cannot be edited. This preserves the integrity of the signed report.' });
        }
        const filteredUpdates = Object.keys(req.body ?? {}).filter(key => ['technologistNotes', 'clinicalImpression'].includes(key));
        if (filteredUpdates.length === 0) {
          return res.status(400).json({ error: 'Please provide at least one field to update: technologist notes or clinical impression.' });
        }

        const updatePayload = {};
        if (req.body.technologistNotes !== undefined) updatePayload.technologistNotes = req.body.technologistNotes;
        if (req.body.clinicalImpression !== undefined) updatePayload.clinicalImpression = req.body.clinicalImpression;

        const report = await updateSupabaseReport(supabase, req.params.id, updatePayload);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'REPORT_UPDATED',
          entity: 'report',
          entityId: req.params.id,
          details: `Fields changed: ${filteredUpdates.join(', ')}`
        });
        return res.json({ report });
      }

      const row = db.prepare('SELECT * FROM reports WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
      // Any signed-in user may record notes and the clinical impression on
      // a report that has not been verified yet.

      if (row.status === 'verified' || row.status === 'released') {
        return res.status(409).json({ error: 'Verified and released reports cannot be edited. This preserves the integrity of the signed report.' });
      }
      const fieldColumns = {
        technologistNotes: 'technologist_notes',
        clinicalImpression: 'clinical_impression'
      };
      const filteredUpdates = Object.entries(req.body ?? {})
        .filter(([field]) => Object.hasOwn(fieldColumns, field));

      if (filteredUpdates.length === 0) {
        return res.status(400).json({ error: 'Please provide at least one field to update: technologist notes or clinical impression.' });
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
  app.delete('/api/reports/:id', auth, async (req, res, next) => {
    try {
      // Database mode first: Supabase-written reports have no local row, so a
      // local existence check here would 404 before the Supabase path.
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const existing = await getSupabaseReport(supabase, req.params.id);
        if (!existing) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
        if (req.user.role !== 'admin') {
          const { data: analysisRow } = await supabase.from('analyses').select('initiated_by').eq('id', existing.analysisId).maybeSingle();
          if (analysisRow?.initiated_by !== req.user.id && existing.technologistId !== req.user.id) {
            return res.status(403).json({ error: 'Only the operator who created this report can remove it.' });
          }
        }
        await deleteSupabaseReport(supabase, req.params.id);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'REPORT_DELETED',
          entity: 'report',
          entityId: req.params.id,
          details: `Soft deleted report: ${existing.reportNumber}`
        });
        return res.status(204).send();
      }

      const row = db.prepare('SELECT * FROM reports WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'This report could not be found. It may have been removed or released.' });
      if (req.user.role !== 'admin') {
        const analysis = db.prepare('SELECT initiated_by FROM analyses WHERE id = ?').get(row.analysis_id);
        if (analysis && analysis.initiated_by !== req.user.id && row.technologist_id !== req.user.id) {
          return res.status(403).json({ error: 'Only the operator who created this report can remove it.' });
        }
      }

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
        details: `Soft deleted report: ${row.report_number}`
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ admin users ----
  // Admin operations: view the account list, approve or revoke an account's
  // access (profiles.approved), edit a role, and revoke sign-in while keeping
  // clinical history intact. Every operation is recorded in the audit chain.

  function userAuditStats(database) {
    const rows = database.prepare('SELECT actor_id, action, timestamp FROM audit_log ORDER BY seq ASC').all();
    const stats = new Map();
    for (const row of rows) {
      if (!row.actor_id) continue;
      const st = stats.get(row.actor_id) ?? { count: 0, lastAction: null, lastActionAt: null };
      st.count += 1;
      st.lastAction = row.action;
      st.lastActionAt = row.timestamp;
      stats.set(row.actor_id, st);
    }
    return stats;
  }

  function mapAdminUser(row, stats) {
    const st = stats.get(row.id) ?? { count: 0, lastAction: null, lastActionAt: null };
    return {
      id: row.id,
      username: row.username,
      email: row.email ?? null,
      displayName: row.displayName,
      role: row.role === 'admin' ? 'admin' : 'member',
      active: Boolean(row.active),
      createdAt: row.createdAt ?? null,
      lastLoginAt: row.lastLoginAt ?? null,
      auditCount: st.count,
      lastAction: st.lastAction,
      lastActionAt: st.lastActionAt
    };
  }

  app.get('/api/admin/users', auth, requireAdmin, async (req, res, next) => {
    try {
      const stats = userAuditStats(db);

      if (process.env.USE_SUPABASE_AUTH === 'true') {
        const supabase = getSupabaseClient({ admin: true });
        const { data, error } = await supabase.auth.admin.listUsers({ page: 0, perPage: 200 });
        if (error) throw error;
        const authUsers = data.users ?? [];
        const ids = authUsers.map(u => u.id);
        let profileRows = [];
        if (ids.length) {
          const { data: pData, error: pError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', ids);
          if (pError) throw pError;
          profileRows = pData ?? [];
        }
        const profileMap = new Map(profileRows.map(p => [p.id, p]));
        const users = authUsers.map(u => {
          const p = profileMap.get(u.id);
          const email = u.email ?? null;
          const localPart = (email ?? '').split('@')[0] || 'user';
          return mapAdminUser({
            id: u.id,
            username: p?.username ?? localPart,
            email,
            displayName: p?.display_name || u.user_metadata?.display_name || localPart,
            role: p?.role,
            // active now mirrors admin approval: unapproved accounts cannot sign in.
            active: p ? p.approved === true : false,
            createdAt: u.created_at ?? null,
            lastLoginAt: u.last_sign_in_at ?? null
          }, stats);
        });
        return res.json({ users });
      }

      const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
      const users = rows.map(row =>
        mapAdminUser(
          {
            id: row.id,
            username: row.username,
            email: null,
            displayName: row.display_name,
            role: row.role,
            active: row.active,
            createdAt: row.created_at,
            lastLoginAt: row.last_login_at ?? null
          },
          stats
        )
      );
      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/admin/users/:id/role', auth, requireAdmin, async (req, res, next) => {
    try {
      const role = req.body?.role;
      if (role !== 'admin' && role !== 'member') {
        return res.status(400).json({ error: "role must be 'admin' or 'member'." });
      }
      const targetId = req.params.id;
      // The API vocabulary is admin/member; the Supabase schema stores
      // admin/user under a check constraint, so translate on the way in.
      const storedRole = role === 'admin' ? 'admin' : 'user';

      if (process.env.USE_SUPABASE_AUTH === 'true') {
        const supabase = getSupabaseClient({ admin: true });
        const { data: authUser, error: userError } = await supabase.auth.admin.getUserById(targetId);
        if (userError || !authUser) return res.status(404).json({ error: 'User not found.' });

        // Update the role only, when the profile row already exists, so an
        // existing profile is never clobbered with derived values.
        const { data: existing, error: readError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', targetId)
          .maybeSingle();
        if (readError) throw readError;

        let updated;
        if (existing) {
          const { data, error } = await supabase
            .from('profiles')
            .update({ role: storedRole })
            .eq('id', targetId)
            .select('id, role')
            .single();
          if (error) throw error;
          updated = data;
        } else {
          const email = (authUser.email ?? '').toLowerCase();
          const localPart = email.split('@')[0] || 'user';
          const { data, error } = await supabase
            .from('profiles')
            .upsert(
              {
                id: targetId,
                email,
                username: localPart,
                display_name: authUser.user_metadata?.display_name || localPart,
                role: storedRole
              },
              { onConflict: 'id' }
            )
            .select('id, role')
            .single();
          if (error) throw error;
          updated = data;
        }

        clearProfileCache(targetId);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'USER_ROLE_CHANGED',
          entity: 'user',
          entityId: targetId,
          details: `Role set to ${role}`
        });
        return res.json({ user: { id: updated.id, role } });
      }

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
      if (!target) return res.status(404).json({ error: 'User not found.' });
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'USER_ROLE_CHANGED',
        entity: 'user',
        entityId: targetId,
        details: `${target.display_name} role set to ${role}`
      });
      return res.json({ user: { id: targetId, role } });
    } catch (err) {
      next(err);
    }
  });

  // Grant access: sets profiles.approved = true so the account can sign in.
  // Mirrors the database function approve_lab_user (admin-only, audited).
  app.post('/api/admin/users/:id/approve', auth, requireAdmin, async (req, res, next) => {
    try {
      const targetId = req.params.id;

      if (process.env.USE_SUPABASE_AUTH === 'true') {
        const supabase = getSupabaseClient({ admin: true });
        const { data: authUser, error: userError } = await supabase.auth.admin.getUserById(targetId);
        if (userError || !authUser) return res.status(404).json({ error: 'User not found.' });

        const { data: existing, error: readError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', targetId)
          .maybeSingle();
        if (readError) throw readError;

        if (existing) {
          await setSupabaseUserApproval(supabase, targetId, { approved: true, approvedBy: req.user.id });
        } else {
          // Auth user exists but the profile row is missing (the trigger never
          // ran): create it approved so sign-in works immediately.
          const email = (authUser.email ?? '').toLowerCase();
          const localPart = email.split('@')[0] || 'user';
          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: targetId,
                email,
                username: `${localPart}_${targetId.slice(0, 8)}`,
                display_name: authUser.user_metadata?.display_name || localPart,
                role: 'user',
                approved: true,
                approved_at: new Date().toISOString(),
                approved_by: req.user.id
              },
              { onConflict: 'id' }
            );
          if (upsertError) throw upsertError;
        }
        clearProfileCache(targetId);
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'USER_APPROVED',
          entity: 'user',
          entityId: targetId,
          details: 'Account approved for access'
        });
        return res.json({ ok: true, id: targetId, approved: true });
      }

      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
      if (!target) return res.status(404).json({ error: 'User not found.' });
      return res.status(400).json({ error: 'Account approval is only available when Supabase auth is enabled.' });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/admin/users/:id', auth, requireAdmin, async (req, res, next) => {
    try {
      const targetId = req.params.id;
      if (targetId === req.user.id) {
        return res.status(400).json({ error: 'You cannot remove your own account.' });
      }

      if (process.env.USE_SUPABASE_AUTH === 'true') {
        const supabase = getSupabaseClient({ admin: true });
        // Revocation rather than deletion: clinical records keep their
        // references to the auth user id, and audit history must stay
        // attributable. The session stops working immediately.
        const { data: existing, error: readError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', targetId)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing) return res.status(404).json({ error: 'User not found.' });

        await setSupabaseUserApproval(supabase, targetId, { approved: false, approvedBy: null });
        clearProfileCache(targetId);
        try {
          const { error: revokeError } = await supabase.auth.admin.revokeRefreshTokensForUser(targetId);
          if (revokeError) console.error('[revoke-approval] token revoke failed:', revokeError.message);
        } catch {
          // non-fatal
        }
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'USER_APPROVAL_REVOKED',
          entity: 'user',
          entityId: targetId,
          details: 'Approval revoked by administrator'
        });
        return res.json({ ok: true, id: targetId, approved: false });
      }

      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
      if (!target) return res.status(404).json({ error: 'User not found.' });
      db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(targetId);
      destroyAllSessionsForUser(db, targetId);
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'USER_DISABLED',
        entity: 'user',
        entityId: targetId,
        details: `${target.display_name} account disabled`
      });
      return res.json({ ok: true, id: targetId, approved: false });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------- admin analyses ----
  // Administrative oversight of microscopy runs: view, edit status, or
  // delete analyses across the whole server. Every mutation is recorded
  // in the hash-chained audit trail.

  app.get('/api/admin/analyses', auth, requireAdmin, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Number(req.query.offset) || 0;
        let query = supabase
          .from('analyses')
          .select('*', { count: 'exact' })
          .order('started_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (req.query.status) query = query.eq('status', req.query.status);
        if (req.query.sampleId) query = query.eq('sample_id', req.query.sampleId);
        const { data: analyses, error, count } = await query;
        if (error) throw error;
        const rows = analyses ?? [];
        const sampleIds = [...new Set(rows.map(row => row.sample_id))];
        const patientIds = new Set();
        const sampleMap = new Map();
        if (sampleIds.length) {
          const { data: sampleRows, error: sampleError } = await supabase
            .from('samples')
            .select('id, patient_id, sample_type, slide_label, stain_method, total_magnification, collection_datetime')
            .in('id', sampleIds);
          if (sampleError) throw sampleError;
          for (const s of sampleRows ?? []) {
            sampleMap.set(s.id, s);
            patientIds.add(s.patient_id);
          }
        }
        const patientMap = new Map();
        if (patientIds.size) {
          const { data: patientRows, error: patientError } = await supabase
            .from('patients')
            .select('id, patient_number, full_name, gender, age')
            .in('id', [...patientIds]);
          if (patientError) throw patientError;
          for (const p of patientRows ?? []) patientMap.set(p.id, p);
        }
        const items = rows.map(row => {
          const sample = sampleMap.get(row.sample_id);
          const patient = sample ? patientMap.get(sample.patient_id) : null;
          return {
            id: row.id,
            sampleId: row.sample_id,
            patientId: sample?.patient_id ?? null,
            patientNumber: patient?.patient_number ?? null,
            patientName: patient ? decryptPHI(patient.full_name) : null,
            sampleType: sample?.sample_type ?? null,
            slideLabel: sample?.slide_label ?? null,
            status: row.status,
            totalDetections: row.total_detections ?? 0,
            startedAt: row.started_at,
            completedAt: row.completed_at ?? null,
            initiatedBy: row.initiated_by ?? null,
            modelId: row.model_id ?? null,
            modelName: row.model_name ?? null
          };
        });
        return res.json({ items, total: count ?? rows.length, limit, offset });
      }

      const where = [];
      const params = [];
      if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
      if (req.query.sampleId) { where.push('a.sample_id = ?'); params.push(req.query.sampleId); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const rows = db
        .prepare(`SELECT a.*, s.patient_id, s.sample_type, s.slide_label, s.total_magnification, s.collection_datetime FROM analyses a LEFT JOIN samples s ON s.id = a.sample_id ${whereSql} ORDER BY a.started_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);
      const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM analyses a ${whereSql}`).get(...params);
      const items = rows.map(row => {
        const patient = row.patient_id ? db.prepare('SELECT patient_number, full_name, gender, age FROM patients WHERE id = ?').get(row.patient_id) : null;
        return {
          id: row.id,
          sampleId: row.sample_id,
          patientId: row.patient_id ?? null,
          patientNumber: patient?.patient_number ?? null,
          patientName: patient ? decryptPHI(patient.full_name) : null,
          sampleType: row.sample_type ?? null,
          slideLabel: row.slide_label ?? null,
          status: row.status,
          totalDetections: row.total_detections ?? 0,
          startedAt: row.started_at,
          completedAt: row.completed_at ?? null,
          initiatedBy: row.initiated_by ?? null,
          modelId: row.model_id ?? null,
          modelName: row.model_name ?? null
        };
      });
      return res.json({ items, total: totalRow.n, limit, offset });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/admin/analyses/:id', auth, requireAdmin, async (req, res, next) => {
    try {
      const allowed = ['processing', 'in_review', 'confirmed', 'verified'];
      const nextStatus = String(req.body?.status ?? '');
      if (!allowed.includes(nextStatus)) {
        return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}.` });
      }
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : null;

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const { data: existing, error: readError } = await supabase
          .from('analyses')
          .select('id, status, sample_id')
          .eq('id', req.params.id)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing) return res.status(404).json({ error: 'Analysis not found.' });

        const { data: updated, error: updateError } = await supabase
          .from('analyses')
          .update({ status: nextStatus, completed_at: nextStatus === 'verified' ? new Date().toISOString() : existing.completed_at })
          .eq('id', req.params.id)
          .select('id, status, completed_at')
          .single();
        if (updateError) throw updateError;

        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'ANALYSIS_STATUS_CHANGED',
          entity: 'analysis',
          entityId: req.params.id,
          details: `Admin set status to ${nextStatus}${notes ? `; notes: ${notes}` : ''}`
        });
        return res.json({ analysis: updated });
      }

      const existing = db.prepare('SELECT id, status FROM analyses WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Analysis not found.' });
      db.prepare('UPDATE analyses SET status = ?, completed_at = ? WHERE id = ?').run(
        nextStatus,
        nextStatus === 'verified' ? new Date().toISOString() : existing.completed_at,
        req.params.id
      );
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'ANALYSIS_STATUS_CHANGED',
        entity: 'analysis',
        entityId: req.params.id,
        details: `Admin set status to ${nextStatus}${notes ? `; notes: ${notes}` : ''}`
      });
      return res.json({ analysis: { id: req.params.id, status: nextStatus } });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/analyses/recover', auth, requireAdmin, async (req, res, next) => {
    try {
      const staleThresholdMs = Number(req.body?.staleThresholdMs ?? 60 * 60 * 1000);
      if (!Number.isFinite(staleThresholdMs) || staleThresholdMs <= 0) {
        return res.status(400).json({ error: 'staleThresholdMs must be a positive number.' });
      }
      const cutoff = new Date(Date.now() - staleThresholdMs).toISOString();

      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const { data: stale, error: readError } = await supabase
          .from('analyses')
          .select('id, started_at')
          .eq('status', 'processing')
          .lt('started_at', cutoff);
        if (readError) throw readError;
        const ids = (stale ?? []).map(row => row.id);
        if (ids.length > 0) {
          const { error: updateError } = await supabase
            .from('analyses')
            .update({ status: 'in_review', completed_at: new Date().toISOString() })
            .in('id', ids);
          if (updateError) throw updateError;
        }
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'ANALYSIS_RECOVERED',
          entity: 'analysis',
          details: `Recovered ${ids.length} stale processing analysis(ies)`
        });
        return res.json({ recovered: ids.length });
      }

      const stale = db.prepare('SELECT id FROM analyses WHERE status = ? AND started_at < ?').all('processing', cutoff);
      const ids = stale.map(row => row.id);
      if (ids.length > 0) {
        db.prepare('UPDATE analyses SET status = ?, completed_at = ? WHERE status = ? AND started_at < ?').run(
          'in_review',
          new Date().toISOString(),
          'processing',
          cutoff
        );
      }
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'ANALYSIS_RECOVERED',
        entity: 'analysis',
        details: `Recovered ${ids.length} stale processing analysis(ies)`
      });
      res.json({ recovered: ids.length });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/admin/analyses/:id', auth, requireAdmin, async (req, res, next) => {
    try {
      if (hasSupabaseDatabaseConfig()) {
        const supabase = getSupabaseClient({ admin: true });
        const { data: existing, error: readError } = await supabase
          .from('analyses')
          .select('id, status, sample_id')
          .eq('id', req.params.id)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing) return res.status(404).json({ error: 'Analysis not found.' });
        if (existing.status === 'verified') {
          return res.status(409).json({ error: 'Cannot delete a verified analysis. Contact data governance.' });
        }
        const { error: delError } = await supabase
          .from('detections')
          .delete()
          .eq('analysis_id', req.params.id);
        if (delError) throw delError;
        const { error: analysisDelError } = await supabase
          .from('analyses')
          .delete()
          .eq('id', req.params.id);
        if (analysisDelError) throw analysisDelError;
        appendAudit(db, {
          actorId: req.user.id,
          actorName: req.user.display_name,
          action: 'ANALYSIS_DELETED',
          entity: 'analysis',
          entityId: req.params.id,
          details: `Admin removed analysis ${req.params.id}`
        });
        return res.status(204).send();
      }

      const existing = db.prepare('SELECT id, status FROM analyses WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Analysis not found.' });
      if (existing.status === 'verified') {
        return res.status(409).json({ error: 'Cannot delete a verified analysis. Contact data governance.' });
      }
      db.prepare('DELETE FROM detections WHERE analysis_id = ?').run(req.params.id);
      db.prepare('DELETE FROM analyses WHERE id = ?').run(req.params.id);
      appendAudit(db, {
        actorId: req.user.id,
        actorName: req.user.display_name,
        action: 'ANALYSIS_DELETED',
        entity: 'analysis',
        entityId: req.params.id,
        details: `Admin removed analysis ${req.params.id}`
      });
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------- audit ----

  // The audit trail records every clinical write; only administrators may
  // read it or re-verify the hash chain.
  app.get('/api/audit', auth, requireAdmin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?').all(limit);
    res.json({ entries: rows.map(mapAudit), integrity: verifyChain(db) });
  });

  app.get('/api/audit/verify', auth, requireAdmin, (_req, res) => {
    res.json(verifyChain(db));
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

function csvField(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializePatientCsv(rows) {
  const headers = [
    'Patient MRN',
    'Full Name',
    'Age',
    'Gender',
    'Referring Doctor',
    'Referring Facility',
    'Clinical Notes',
    'Specimen Types',
    'Earliest Collection',
    'Specimen Count',
    'Accessioned Date'
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      csvField(row.patientNumber),
      csvField(row.fullName),
      csvField(row.age),
      csvField(row.gender),
      csvField(row.referringDoctor),
      csvField(row.referringFacility),
      csvField(row.clinicalNotes),
      csvField((row.sampleTypes || []).join('; ')),
      csvField(row.collectionDatetime ? new Date(row.collectionDatetime).toISOString() : ''),
      csvField(row.sampleCount || 0),
      csvField(row.createdAt ? new Date(row.createdAt).toISOString() : '')
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

function buildPatientExportRows(patients) {
  if (!patients || patients.length === 0) return [];
  const rows = patients.map(p => ({
    patientNumber: p.patientNumber,
    fullName: p.fullName,
    age: p.age,
    gender: p.gender,
    referringDoctor: p.referringDoctor,
    referringFacility: p.referringFacility,
    clinicalNotes: p.clinicalNotes,
    sampleTypes: p.sampleTypes || [],
    collectionDatetime: p.collectionDatetime,
    sampleCount: p.sampleCount || 0,
    createdAt: p.createdAt
  }));
  return rows;
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

