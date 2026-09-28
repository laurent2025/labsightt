/**
 * Server test suite: authentication, authorization, the audit chain, and the
 * reporting workflow gates. These are the controls the client cannot enforce.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';
import { openDatabase, installImmutabilityGuards } from './db.js';
import { createUser } from './auth.js';
import { verifyPassword, hashPassword, validatePasswordStrength } from './crypto.js';
import { appendAudit, verifyChain, GENESIS_HASH } from './audit.js';
import { encryptPHI, decryptPHI } from './encryption.js';

// Encryption is mandatory, so a key must exist before any module is imported.
beforeAll(() => {
  process.env.PHI_ENCRYPTION_KEY ||= 'test-only-phi-key-do-not-use-in-production';
});

let app;
let db;

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
  app = createApp({ dbPath: ':memory:' });
  db = app.locals.db;
  await seedUsers();
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
    patch: (url, body) => agent.patch(url).set('Cookie', cookie).send(body ?? {})
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

describe('role-based access control', () => {
  it('lets a technologist create a patient but not manage users', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    expect((await client.post('/api/patients', { patientNumber: 'PT-9', fullName: 'A B' })).status).toBe(201);
    expect((await client.get('/api/admin/users')).status).toBe(403);
  });

  it('keeps the audit log away from technologists', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    expect((await client.get('/api/audit')).status).toBe(403);
  });

  it('gives supervisors the audit log but not user administration', async () => {
    const client = authed(await login('super1', 'super-password-1234'));
    expect((await client.get('/api/audit')).status).toBe(200);
    expect((await client.get('/api/admin/users')).status).toBe(403);
  });

  it('reserves user creation for a director', async () => {
    const client = authed(await login('dir1', 'director-password-1234'));
    const res = await client.post('/api/admin/users', {
      username: 'tech2',
      displayName: 'Second Tech',
      role: 'technologist',
      password: 'another-password-99'
    });
    expect(res.status).toBe(201);
  });

  it('refuses to create a user with a weak password', async () => {
    const client = authed(await login('dir1', 'director-password-1234'));
    const res = await client.post('/api/admin/users', {
      username: 'weak',
      displayName: 'Weak',
      role: 'technologist',
      password: 'short'
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown role', async () => {
    const client = authed(await login('dir1', 'director-password-1234'));
    const res = await client.post('/api/admin/users', {
      username: 'ghostrole',
      displayName: 'Ghost',
      role: 'admin',
      password: 'a-long-enough-password'
    });
    expect(res.status).toBe(400);
  });

  it('records denied access in the audit log', async () => {
    const tech = authed(await login('tech1', 'tech-password-1234'));
    await tech.get('/api/admin/users');
    const sup = authed(await login('super1', 'super-password-1234'));
    const audit = await sup.get('/api/audit');
    expect(audit.body.entries.some(e => e.action === 'ACCESS_DENIED')).toBe(true);
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

  it('reports integrity over HTTP for supervisors', async () => {
    const client = authed(await login('super1', 'super-password-1234'));
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
    const sup = authed(await login('super1', 'super-password-1234'));
    const sample = await makeSample(tech);
    insertAnalysis('ana-test', sample.id, 'in_review', 1);
    insertDetection('det-1', 'ana-test', { confirmed: 1 });
    await tech.post('/api/reports', { analysisId: 'ana-test' });

    const audit = await sup.get('/api/audit');
    expect(audit.body.entries.some(e => e.action === 'REPORT_GENERATED')).toBe(true);
  });

  it('refuses verification by a technologist on role grounds', async () => {
    insertReport('rpt-1', 'RPT-1', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));
    expect((await client.post('/api/reports/rpt-1/verify')).status).toBe(403);
  });

  it('refuses verification by the originating technologist even once promoted', async () => {
    insertReport('rpt-1', 'RPT-1', userId('tech1'));
    // Promote the originating technologist so the role check passes and only
    // the identity check remains.
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('supervisor', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));

    const res = await client.post('/api/reports/rpt-1/verify');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/two-person|cannot be verified by the technologist/i);
  });

  it('records a refused self-verification in the audit log', async () => {
    insertReport('rpt-1', 'RPT-1', userId('tech1'));
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('supervisor', userId('tech1'));
    const client = authed(await login('tech1', 'tech-password-1234'));
    await client.post('/api/reports/rpt-1/verify');

    const sup = authed(await login('super1', 'super-password-1234'));
    const audit = await sup.get('/api/audit');
    const refusal = audit.body.entries.find(e => e.action === 'VERIFICATION_REFUSED');
    expect(refusal).toBeDefined();
    expect(refusal.details).toMatch(/self-verification/i);
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
});
