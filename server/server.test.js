/**
 * Server test suite: authentication, authorization, the audit chain, and the
 * reporting workflow gates. These are the controls the client cannot enforce.
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';
import { openDatabase, installImmutabilityGuards } from './db.js';
import { createUser } from './auth.js';
import { verifyPassword, hashPassword, validatePasswordStrength } from './crypto.js';
import { appendAudit, verifyChain, GENESIS_HASH } from './audit.js';
import { encryptPHI, decryptPHI } from './encryption.js';
import { inferenceStatus, runInference } from './inference.js';

// Encryption is mandatory, so a key must exist before any module is imported.
beforeAll(() => {
  process.env.PHI_ENCRYPTION_KEY ||= 'test-only-phi-key-do-not-use-in-production';
});

let app;
let db;
let lastServerError;

async function seedUsers() {
  await createUser(db, {
    username: 'tech1',
    displayName: 'Amara Diallo',
    role: 'technologist',
    password: 'tech-password-1234'
  });
  await createUser(db, {
    username: 'super1',
    displayName: 'Kwame Mensah',
    role: 'supervisor',
    password: 'super-password-1234'
  });
  await createUser(db, {
    username: 'dir1',
    displayName: 'Lab Director',
    role: 'director',
    password: 'director-password-1234'
  });
  await createUser(db, {
    username: 'admin1',
    displayName: 'System Administrator',
    role: 'admin',
    password: 'admin-password-1234'
  });
}

function userId(username) {
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;
}

function insertAnalysis(analysisId, sampleId, status = 'in_review', detections = 0) {
  db.prepare(`
    INSERT INTO analyses (id, sample_id, model_id, status, total_detections, started_at, initiated_by)
    VALUES (?, ?, 'test-model', ?, ?, ?, ?)
  `).run(analysisId, sampleId, status, detections, new Date().toISOString(), userId('tech1'));
}

function insertDetection(id, analysisId, { confirmed = 0, rejected = 0, className = 'Hookworm egg' } = {}) {
  db.prepare(`
    INSERT INTO detections (id, analysis_id, class_name, confidence, x, y, width, height, confirmed, rejected)
    VALUES (?, ?, ?, 0.9, 1, 1, 2, 2, ?, ?)
  `).run(id, analysisId, className, confirmed, rejected);
}

function insertReport(id, reportNumber, technologistId, status = 'pending_verification') {
  // reports.analysis_id is a real foreign key, so the helper creates the
  // supporting analysis row rather than pointing at a placeholder.
  const sampleId = `sam-for-${id}`;
  const analysisId = `ana-for-${id}`;
  db.prepare(`
    INSERT INTO patients (id, patient_number, full_name, age, gender, created_at)
    VALUES (?, ?, 'Support Patient', 40, 'Female', ?)
  `).run(`pat-for-${id}`, `PT-${id}`, new Date().toISOString());
  db.prepare(`
    INSERT INTO samples (id, patient_id, sample_type, slide_label, stain_method, objective,
                         eyepiece, total_magnification, fields_examined, field_area_mm2,
                         collection_datetime, created_at)
    VALUES (?, ?, 'stool', ?, 'Trichrome', '40x', '10x', '400x', 10, 0.1963, ?, ?)
  `).run(sampleId, `pat-for-${id}`, `SLD-${id}`, new Date().toISOString(), new Date().toISOString());
  insertAnalysis(analysisId, sampleId, status === 'verified' ? 'verified' : 'in_review');

  db.prepare(`
    INSERT INTO reports (id, report_number, analysis_id, technologist_id, technologist_name,
                         status, generated_at)
    VALUES (?, ?, ?, ?, 'Amara Diallo', ?, ?)
  `).run(id, reportNumber, analysisId, technologistId, status, new Date().toISOString());
}

beforeEach(async () => {
  lastServerError = null;
  app = createApp({
    dbPath: ':memory:',
    logger: entry => {
      if (entry.event === 'unhandled_error') lastServerError = entry.error;
    }
  });
  db = app.locals.db;
  await seedUsers();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'];
}

function authed(cookie) {
  const agent = request(app);
  return {
    get: url => agent.get(url).set('Cookie', cookie),
    post: (url, body) => agent.post(url).set('Cookie', cookie).send(body ?? {}),
    patch: (url, body) => agent.patch(url).set('Cookie', cookie).send(body ?? {}),
    delete: url => agent.delete(url).set('Cookie', cookie)
  };
}

async function makeSample(client) {
  const patient = await client.post('/api/patients', {
    patientNumber: 'PT-1',
    fullName: 'Test Patient',
    age: 40,
    gender: 'Female'
  });
  const sample = await client.post('/api/samples', {
    patientId: patient.body.patient.id,
    sampleType: 'stool',
    slideLabel: 'SLD-1',
    fieldsExamined: 10,
    fieldAreaMm2: 0.1963
  });
  return sample.body.sample;
}

// ------------------------------------------------------------------ auth ----

describe('password hashing', () => {
  it('produces a different salt and hash for the same password', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const { hash, salt } = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash, salt)).toBe(true);
    expect(await verifyPassword('wrong password entirely', hash, salt)).toBe(false);
  });

  it('does not match a corrupted stored hash', async () => {
    const { salt } = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('anything', 'deadbeef'.repeat(8), salt)).toBe(false);
  });

  it('enforces a length floor', () => {
    expect(validatePasswordStrength('short')).toContain('must be at least 12 characters');
    expect(validatePasswordStrength('long-enough-password')).toEqual([]);
  });
});

describe('login', () => {
  it('issues an httpOnly session cookie on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tech1', password: 'tech-password-1234' });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain('labsight_session=');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tech1', password: 'tech-password-1234' });
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a wrong password and an unknown user identically', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tech1', password: 'not-the-password' });
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'not-the-password' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownUser.body.error);
  });

  it('rejects unauthenticated access to patient data', async () => {
    expect((await request(app).get('/api/patients')).status).toBe(401);
  });

  it('rejects a tampered session cookie', async () => {
    const cookie = await login('tech1', 'tech-password-1234');
    const value = String(cookie);
    const tampered = value.replace(/labsight_session=[^;]+/, 'labsight_session=forged-value');
    expect((await request(app).get('/api/patients').set('Cookie', tampered)).status).toBe(401);
  });

  it('invalidates the session on logout', async () => {
    const cookie = await login('tech1', 'tech-password-1234');
    const client = authed(cookie);
    expect((await client.post('/api/auth/logout')).status).toBe(200);
    expect((await client.get('/api/patients')).status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const cookie = await login('tech1', 'tech-password-1234');
    db.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
    expect((await request(app).get('/api/patients').set('Cookie', cookie)).status).toBe(401);
  });
});

// ------------------------------------------------------------------- rbac ----

describe('equal authenticated access', () => {
  it('lets any authenticated user create patients and denies admin endpoints to non-admins', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    expect((await client.post('/api/patients', { patientNumber: 'PT-9', fullName: 'A B' })).status).toBe(201);
    expect((await client.get('/api/admin/users')).status).toBe(403);
    expect((await client.get('/api/audit')).status).toBe(403);
  });

  it('denies admin endpoints to unauthenticated requests', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect((await request(app).get('/api/audit')).status).toBe(401);
  });

  it('lets any authenticated user delete patients and hides deleted patients from all lists', async () => {
    const director = authed(await login('dir1', 'director-password-1234'));
    const tech = authed(await login('tech1', 'tech-password-1234'));
    const created = await director.post('/api/patients', {
      patientNumber: 'PT-DELETE',
      fullName: 'Delete Me',
      age: 40,
      gender: 'Other'
    });
    const patientId = created.body.patient.id;

    const deletion = await tech.delete(`/api/patients/${patientId}`);
    expect(deletion.status, `${JSON.stringify(deletion.body)} ${lastServerError ?? ''}`).toBe(204);
    expect((await director.get('/api/patients')).body.patients.some(p => p.id === patientId)).toBe(false);
    expect((await director.get('/api/patients?search=PT-DELETE')).body.patients).toHaveLength(0);
  });

  it('updates patient details through the authenticated API', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const created = await client.post('/api/patients', {
      patientNumber: 'PT-EDIT',
      fullName: 'Before Edit',
      age: 30,
      gender: 'Female'
    });

    const res = await client.patch(`/api/patients/${created.body.patient.id}`, {
      fullName: 'After Edit',
      age: 31,
      gender: 'Other',
      referringDoctor: 'Dr. Updated',
      referringFacility: 'Updated Clinic',
      clinicalNotes: 'Updated notes'
    });

    expect(res.status).toBe(200);
    expect(res.body.patient.fullName).toBe('After Edit');
    expect(res.body.patient.age).toBe(31);
    expect(res.body.patient.gender).toBe('Other');
    expect(res.body.patient.referringDoctor).toBe('Dr. Updated');
    expect(res.body.patient.referringFacility).toBe('Updated Clinic');
    expect(res.body.patient.clinicalNotes).toBe('Updated notes');
  });

  it('restricts audit log reads to administrators', async () => {
    const tech = authed(await login('tech1', 'tech-password-1234'));
    expect((await tech.get('/api/audit')).status).toBe(403);
    expect((await tech.get('/api/audit/verify')).status).toBe(403);

    const admin = authed(await login('admin1', 'admin-password-1234'));
    const audit = await admin.get('/api/audit');
    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.body.entries)).toBe(true);
    expect(typeof audit.body.integrity.intact).toBe('boolean');
    expect((await admin.get('/api/audit/verify')).status).toBe(200);
  });

  it('denies user administration endpoints to every non-admin account', async () => {
    const client = authed(await login('super1', 'super-password-1234'));
    expect((await client.get('/api/admin/users')).status).toBe(403);
    expect((await client.patch('/api/admin/users/someone/role').send({ role: 'admin' })).status).toBe(403);
    expect((await client.delete('/api/admin/users/someone')).status).toBe(403);
  });
});

// ------------------------------------------------------- admin users ----

describe('admin user operations', () => {
  it('lists accounts with roles and recorded activity for an admin', async () => {
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const res = await admin.get('/api/admin/users');
    expect(res.status).toBe(200);
    const byUsername = Object.fromEntries(res.body.users.map(u => [u.username, u]));
    expect(byUsername.admin1.role).toBe('admin');
    expect(byUsername.tech1.role).toBe('member');
    expect(byUsername.tech1.active).toBe(true);
    expect(typeof byUsername.tech1.auditCount).toBe('number');
  });

  it('promotes a user to admin, which unlocks admin endpoints immediately', async () => {
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const techId = userId('tech1');

    const promote = await admin.patch(`/api/admin/users/${techId}/role`).send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe('admin');

    // The promoted session must now pass the admin gate.
    const tech = authed(await login('tech1', 'tech-password-1234'));
    expect((await tech.get('/api/audit')).status).toBe(200);

    // Demoting restores the denial for the same session.
    const demote = await admin.patch(`/api/admin/users/${techId}/role`).send({ role: 'member' });
    expect(demote.status).toBe(200);
    expect((await tech.get('/api/audit')).status).toBe(403);
  });

  it('rejects an unknown role value', async () => {
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const res = await admin.patch(`/api/admin/users/${userId('tech1')}/role`).send({ role: 'director' });
    expect(res.status).toBe(400);
  });

  it('prevents an admin from removing their own account', async () => {
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const res = await admin.delete(`/api/admin/users/${userId('admin1')}`);
    expect(res.status).toBe(400);
  });

  it('removes a user: their session dies and re-login is refused', async () => {
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const techCookie = await login('tech1', 'tech-password-1234');
    const techId = userId('tech1');

    expect((await admin.delete(`/api/admin/users/${techId}`)).status).toBe(200);

    // The existing session is invalidated immediately.
    expect((await request(app).get('/api/patients').set('Cookie', techCookie)).status).toBe(401);
    // New sign-in is refused: the account is no longer active.
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'tech1', password: 'tech-password-1234' })
      ).status
    ).toBe(401);

    // The removal is recorded in the audit chain.
    const audit = await admin.get('/api/audit?limit=200');
    expect(audit.body.entries.some(e => e.action === 'USER_DISABLED' && e.entityId === techId)).toBe(true);
  });
});

// ----------------------------------------------------------------- audit ----

describe('audit chain', () => {
  it('verifies as intact and links the first row to the genesis hash', () => {
    appendAudit(db, { action: 'TEST', actorName: 'a' });
    const result = verifyChain(db);
    expect(result.intact).toBe(true);
    expect(result.total).toBe(1);
    expect(db.prepare('SELECT prev_hash FROM audit_log LIMIT 1').get().prev_hash).toBe(GENESIS_HASH);
  });

  it('detects a modified row', () => {
    appendAudit(db, { action: 'ONE', actorName: 'a' });
    appendAudit(db, { action: 'TWO', actorName: 'b' });

    // Reach past the immutability triggers the way an attacker with file access
    // would: drop the guard, edit, put it back.
    db.exec('DROP TRIGGER audit_log_no_update');
    db.prepare('UPDATE audit_log SET details = ? WHERE action = ?').run('tampered', 'ONE');
    installImmutabilityGuards(db);

    const result = verifyChain(db);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('detects a deleted row', () => {
    appendAudit(db, { action: 'ONE' });
    appendAudit(db, { action: 'TWO' });
    db.exec('DROP TRIGGER audit_log_no_delete');
    db.prepare('DELETE FROM audit_log WHERE action = ?').run('ONE');
    installImmutabilityGuards(db);

    const result = verifyChain(db);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('refuses updates and deletes at the database level', () => {
    appendAudit(db, { action: 'ONE' });
    expect(() => db.prepare('UPDATE audit_log SET action = ?').run('HACKED')).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
  });

  it('chains each row to the previous row hash', () => {
    appendAudit(db, { action: 'ONE' });
    appendAudit(db, { action: 'TWO' });
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY seq').all();
    expect(rows[1].prev_hash).toBe(rows[0].row_hash);
  });

  it('reports integrity over HTTP for administrators', async () => {
    const client = authed(await login('admin1', 'admin-password-1234'));
    const res = await client.get('/api/audit/verify');
    expect(res.status).toBe(200);
    expect(res.body.intact).toBe(true);
  });
});

// -------------------------------------------------------------- workflow ----

describe('reporting workflow gates', () => {
  it('refuses to generate a report while candidates are unadjudicated', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    insertAnalysis('ana-test', sample.id, 'in_review', 1);
    insertDetection('det-1', 'ana-test');

    const res = await client.post('/api/reports', { analysisId: 'ana-test' });
    expect(res.status).toBe(409);
    expect(res.body.pendingAdjudication).toBe(1);
    expect(res.body.error).toMatch(/adjudicated/i);
  });

  it('generates a report once every candidate is confirmed', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    insertAnalysis('ana-test', sample.id, 'in_review', 1);
    insertDetection('det-1', 'ana-test', { confirmed: 1 });

    const res = await client.post('/api/reports', { analysisId: 'ana-test' });
    expect(res.status).toBe(201);
    expect(res.body.report.technologistId).toBe(userId('tech1'));
    expect(res.body.report.status).toBe('pending_verification');
    expect(res.body.report.patient.fullName).toBe('Test Patient');
    expect(res.body.report.sample.slideLabel).toBe('SLD-1');
    expect(Array.isArray(res.body.report.findings)).toBe(true);
  });

  it('includes patient and specimen context in the reports list response', async () => {
    insertReport('rpt-list', 'RPT-LIST', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));

    const res = await client.get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.reports[0].patient.fullName).toBe('Support Patient');
    expect(res.body.reports[0].sample.slideLabel).toBe('SLD-rpt-list');
    expect(Array.isArray(res.body.reports[0].findings)).toBe(true);
  });

  it('allows the report author to edit notes before verification', async () => {
    insertReport('rpt-edit', 'RPT-EDIT', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));
    const res = await client.patch('/api/reports/rpt-edit', {
      technologistNotes: 'Reviewed slide at 40x.',
      clinicalImpression: 'No organisms identified.'
    });

    expect(res.status).toBe(200);
    expect(res.body.report.technologistNotes).toBe('Reviewed slide at 40x.');
    expect(res.body.report.clinicalImpression).toBe('No organisms identified.');
  });

  it('lets any authenticated user soft delete reports and excludes them from report reads', async () => {
    insertReport('rpt-delete', 'RPT-DELETE', userId('tech1'));
    const tech = authed(await login('tech1', 'tech-password-1234'));
    const director = authed(await login('dir1', 'director-password-1234'));

    expect((await tech.delete('/api/reports/rpt-delete')).status).toBe(204);
    expect((await director.get('/api/reports/rpt-delete')).status).toBe(404);
    const listed = await director.get('/api/reports');
    expect(listed.body.reports.some(report => report.id === 'rpt-delete')).toBe(false);
  });

  it('treats a rejected candidate as adjudicated', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    insertAnalysis('ana-test', sample.id, 'in_review', 1);
    insertDetection('det-1', 'ana-test', { rejected: 1, className: 'Giardia lamblia cyst' });

    expect((await client.post('/api/reports', { analysisId: 'ana-test' })).status).toBe(201);
  });

  it('records a report generation in the audit log', async () => {
    const tech = authed(await login('tech1', 'tech-password-1234'));
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const sample = await makeSample(tech);
    insertAnalysis('ana-test', sample.id, 'in_review', 1);
    insertDetection('det-1', 'ana-test', { confirmed: 1 });
    await tech.post('/api/reports', { analysisId: 'ana-test' });

    const audit = await admin.get('/api/audit');
    expect(audit.body.entries.some(e => e.action === 'REPORT_GENERATED')).toBe(true);
  });

  it('allows a different technologist to verify a report', async () => {
    await createUser(db, {
      username: 'tech2',
      displayName: 'Second Technologist',
      role: 'technologist',
      password: 'tech2-password-1234'
    });
    insertReport('rpt-tech-verify', 'RPT-TECH-VERIFY', userId('tech1'));
    const verifier = authed(await login('tech2', 'tech2-password-1234'));

    const res = await verifier.post('/api/reports/rpt-tech-verify/verify');
    expect(res.status).toBe(200);
    expect(res.body.report.verifiedBy).toBe(userId('tech2'));
  });

  it('allows the originating technologist to verify their own report', async () => {
    insertReport('rpt-1', 'RPT-1', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));

    const res = await client.post('/api/reports/rpt-1/verify');
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('verified');
    expect(res.body.report.verifiedBy).toBe(userId('tech1'));
  });

  it('records author self-verification as a normal verification in the audit log', async () => {
    insertReport('rpt-self-audit', 'RPT-SELF-AUDIT', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));
    await client.post('/api/reports/rpt-self-audit/verify');

    const admin = authed(await login('admin1', 'admin-password-1234'));
    const audit = await admin.get('/api/audit');
    const entry = audit.body.entries.find(
      e => e.action === 'REPORT_VERIFIED' && e.entityId === 'rpt-self-audit'
    );
    expect(entry).toBeDefined();
  });

  it('allows a different supervisor to verify', async () => {
    insertReport('rpt-2', 'RPT-2', userId('tech1'));
    const sup = authed(await login('super1', 'super-password-1234'));
    const res = await sup.post('/api/reports/rpt-2/verify');
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('verified');
    expect(res.body.report.verifiedBy).toBe(userId('super1'));
    expect(res.body.report.verifiedBy).not.toBe(userId('tech1'));
  });

  it('allows a director to verify a report', async () => {
    insertReport('rpt-director-verify', 'RPT-DIRECTOR-VERIFY', userId('tech1'));
    const director = authed(await login('dir1', 'director-password-1234'));
    const res = await director.post('/api/reports/rpt-director-verify/verify');
    expect(res.status).toBe(200);
    expect(res.body.report.verifiedBy).toBe(userId('dir1'));
  });

  it('refuses to verify the same report twice', async () => {
    insertReport('rpt-3', 'RPT-3', userId('tech1'));
    const sup = authed(await login('super1', 'super-password-1234'));
    expect((await sup.post('/api/reports/rpt-3/verify')).status).toBe(200);
    expect((await sup.post('/api/reports/rpt-3/verify')).status).toBe(409);
  });

  it('refuses to release an unverified report', async () => {
    insertReport('rpt-4', 'RPT-4', userId('tech1'));
    const dir = authed(await login('dir1', 'director-password-1234'));
    expect((await dir.post('/api/reports/rpt-4/release')).status).toBe(409);
  });

  it('allows a director to release a verified report', async () => {
    insertReport('rpt-5', 'RPT-5', userId('tech1'), 'verified');
    const dir = authed(await login('dir1', 'director-password-1234'));
    const res = await dir.post('/api/reports/rpt-5/release');
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('released');
  });

  it('refuses to edit detections on a verified analysis', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    insertAnalysis('ana-locked', sample.id, 'verified');
    insertDetection('det-locked', 'ana-locked', { confirmed: 1 });

    const res = await client.patch('/api/detections/det-locked', { confirmed: false });
    expect(res.status).toBe(409);
  });

  it('rejects a detection that is both confirmed and rejected', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    insertAnalysis('ana-c', sample.id, 'in_review');
    insertDetection('det-c', 'ana-c');

    expect((await client.patch('/api/detections/det-c', { confirmed: true, rejected: true })).status).toBe(400);
  });

  it('records who adjudicated a detection and when', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    insertAnalysis('ana-d', sample.id, 'in_review');
    insertDetection('det-d', 'ana-d');

    const res = await client.patch('/api/detections/det-d', { confirmed: true });
    expect(res.status).toBe(200);
    expect(res.body.detection.adjudicatedBy).toBe(userId('tech1'));
    expect(res.body.detection.adjudicatedAt).toBeTruthy();
  });
});

// ------------------------------------------------------------- inference ----

describe('inference proxy', () => {
  it('defaults to the configured hosted workflow endpoint', () => {
    vi.stubEnv('ROBOFLOW_ENDPOINT', '');
    expect(inferenceStatus().endpoint).toBe(
      'https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-1-yolo26m-t1-logic'
    );
  });

  it('rejects unauthenticated access to system status', async () => {
    const res = await request(app).get('/api/system/status');
    expect(res.status).toBe(401);
  });

  it('never exposes the API key through the status endpoint', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const res = await client.get('/api/system/status');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/ROBOFLOW_API_KEY/);
    expect(res.body.inference.credentialSource).toBe('server environment');
  });

  it('does not accept a client-supplied key', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const sample = await makeSample(client);
    const res = await client.post('/api/analyses', {
      sampleId: sample.id,
      imageBase64: 'AAAA',
      apiKey: 'client-injected-key'
    });
    // Fails because the server has no inference configured, not because it
    // trusted the client key.
    expect(res.status).toBe(503);
  });

  it('sends image input with Bearer auth and parses predictions under arbitrary output keys', async () => {
    const endpoint = 'https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-1-yolo26m-t1-logic';
    const apiKey = 'test-only-provider-key';
    vi.stubEnv('ROBOFLOW_ENDPOINT', endpoint);
    vi.stubEnv('ROBOFLOW_API_KEY', apiKey);
    const providerFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { workflow_output_name: { predictions: [
        { class: 'parasite', confidence: 0.91, x: 20, y: 30, width: 10, height: 12 }
      ] } }
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', providerFetch);

    const actor = db.prepare('SELECT id, display_name FROM users WHERE username = ?').get('tech1');
    const detections = await runInference(db, actor, 'base64-image', { confidence: 0.5 });

    expect(providerFetch).toHaveBeenCalledOnce();
    const [requestUrl, init] = providerFetch.mock.calls[0];
    expect(requestUrl).toBe(endpoint);
    expect(init.headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(init.body).not.toContain(apiKey);
    expect(JSON.parse(init.body)).toEqual({
      inputs: { image: { type: 'base64', value: 'base64-image' } }
    });
    expect(detections).toEqual([
      { class: 'parasite', confidence: 0.91, x: 20, y: 30, width: 10, height: 12 }
    ]);
  });

  it('retries transient provider failures twice before succeeding', async () => {
    vi.stubEnv('ROBOFLOW_ENDPOINT', 'https://serverless.roboflow.com/workflow');
    vi.stubEnv('ROBOFLOW_API_KEY', 'test-only-provider-key');
    const providerFetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', providerFetch);

    const actor = db.prepare('SELECT id, display_name FROM users WHERE username = ?').get('tech1');
    await expect(runInference(db, actor, 'base64-image')).resolves.toEqual([]);
    expect(providerFetch).toHaveBeenCalledTimes(3);
  });
});
