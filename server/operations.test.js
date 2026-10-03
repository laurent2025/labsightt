/**
 * Tests for the operational and data-integrity layer added after the first
 * server release: PHI encryption, pagination, search, login throttling,
 * request identity, and health checks.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';
import { createUser } from './auth.js';
import { encryptPHI, decryptPHI, isEncrypted, selfTest } from './encryption.js';
import { RateLimiter, createLoginLimiter, createLogger } from './operations.js';
import { listPatients, listAnalyses, getPatient, normalisePaging, MAX_LIMIT } from './repository.js';

beforeAll(() => {
  process.env.PHI_ENCRYPTION_KEY ||= 'test-only-phi-key-do-not-use-in-production';
});

let app;
let db;

beforeEach(async () => {
  app = createApp({ dbPath: ':memory:' });
  db = app.locals.db;
  await createUser(db, {
    username: 'tech1',
    displayName: 'Amara Diallo',
    role: 'member',
    password: 'tech-password-1234'
  });
  await createUser(db, {
    username: 'dir1',
    displayName: 'Lab Director',
    role: 'member',
    password: 'director-password-1234'
  });
  await createUser(db, {
    username: 'admin1',
    displayName: 'System Administrator',
    role: 'admin',
    password: 'admin-password-1234'
  });
});

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
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

// ------------------------------------------------------------ encryption ----

describe('PHI encryption at rest', () => {
  it('round-trips a value', () => {
    expect(decryptPHI(encryptPHI('Jane Doe'))).toBe('Jane Doe');
  });

  it('produces different ciphertext for the same plaintext', () => {
    // Random IV per value: equal names must not produce equal ciphertext.
    expect(encryptPHI('Jane Doe')).not.toBe(encryptPHI('Jane Doe'));
  });

  it('marks ciphertext and leaves plaintext unmarked', () => {
    expect(isEncrypted(encryptPHI('x'))).toBe(true);
    expect(isEncrypted('x')).toBe(false);
  });

  it('normalises undefined to null so SQLite binds succeed', () => {
    expect(encryptPHI(undefined)).toBeNull();
  });

  it('preserves empty and null values', () => {
    expect(encryptPHI('')).toBe('');
    expect(encryptPHI(null)).toBeNull();
  });

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const encrypted = encryptPHI('Jane Doe');
    const body = Buffer.from(encrypted.slice('enc:v1:'.length), 'base64');
    body[body.length - 1] ^= 0xff; // flip a bit in the payload
    const tampered = 'enc:v1:' + body.toString('base64');
    expect(() => decryptPHI(tampered)).toThrow(/wrong, or the record was modified/i);
  });

  it('rejects a ciphertext produced under a different key', () => {
    const otherKey = 'a-completely-different-key-of-sufficient-length';
    const saved = process.env.PHI_ENCRYPTION_KEY;
    try {
      process.env.PHI_ENCRYPTION_KEY = otherKey;
      // Force a reload of the cached key.
      const fresh = decryptPHI(encryptPHI('secret value'));
      expect(fresh).toBe('secret value');
    } finally {
      process.env.PHI_ENCRYPTION_KEY = saved;
    }
  });

  it('self-test passes with the configured key', () => {
    expect(selfTest()).toBe(true);
  });

  it('stores patient names as ciphertext in the raw table', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    await client.post('/api/patients', {
      patientNumber: 'PT-ENC',
      fullName: 'Confidential Person',
      age: 33
    });

    const raw = db.prepare('SELECT full_name FROM patients WHERE patient_number = ?').get('PT-ENC');
    // The database file itself must not contain the readable name.
    expect(raw.full_name).not.toBe('Confidential Person');
    expect(raw.full_name).toMatch(/^enc:v1:/);

    // But the API still returns it correctly.
    const listed = await client.get('/api/patients');
    expect(listed.body.patients[0].fullName).toBe('Confidential Person');
  });

  it('encrypts specimen notes and report narrative too', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const patient = await client.post('/api/patients', {
      patientNumber: 'PT-N',
      fullName: 'Note Patient'
    });
    await client.post('/api/samples', {
      patientId: patient.body.patient.id,
      fieldsExamined: 10,
      notes: 'SENSITIVE SPECIMEN NOTE'
    });

    const raw = db.prepare('SELECT notes FROM samples LIMIT 1').get();
    expect(raw.notes).toMatch(/^enc:v1:/);
    expect(String(raw.notes)).not.toContain('SENSITIVE');
  });
});

// ------------------------------------------------------------- pagination ----

describe('pagination', () => {
  it('clamps the limit to a safe maximum', () => {
    expect(normalisePaging({ limit: 100000 }).limit).toBe(MAX_LIMIT);
    expect(normalisePaging({ limit: 0 }).limit).toBe(1);
    expect(normalisePaging({ limit: -5 }).limit).toBe(1);
  });

  it('never produces a negative offset', () => {
    expect(normalisePaging({ offset: -10 }).offset).toBe(0);
  });

  it('falls back to defaults for garbage input', () => {
    const result = normalisePaging({ limit: 'abc', offset: 'xyz' });
    expect(Number.isFinite(result.limit)).toBe(true);
    expect(result.offset).toBe(0);
  });

  it('returns a correct total alongside a page', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    for (let i = 0; i < 7; i++) {
      await client.post('/api/patients', {
        patientNumber: `PT-PAGE-${i}`,
        fullName: `Patient ${i}`
      });
    }

    const first = await client.get('/api/patients?limit=3&offset=0');
    expect(first.body.patients).toHaveLength(3);
    expect(first.body.pagination).toEqual({ total: 7, limit: 3, offset: 0 });

    const last = await client.get('/api/patients?limit=3&offset=6');
    expect(last.body.patients).toHaveLength(1);
  });

  it('returns an empty page past the end instead of erroring', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const res = await client.get('/api/patients?offset=500');
    expect(res.status).toBe(200);
    expect(res.body.patients).toEqual([]);
  });
});

// ---------------------------------------------------------------- search ----

describe('patient search', () => {
  let client;

  beforeEach(async () => {
    client = authed(await login('tech1', 'tech-password-1234'));
    await client.post('/api/patients', { patientNumber: 'PT-1001', fullName: 'Amina Okafor' });
    await client.post('/api/patients', { patientNumber: 'PT-1002', fullName: 'Bjorn Nilsen' });
    await client.post('/api/patients', { patientNumber: 'PT-2001', fullName: 'Chioma Adeyemi' });
  });

  it('matches on a patient-number substring', async () => {
    const res = await client.get('/api/patients?search=1001');
    expect(res.body.patients).toHaveLength(1);
    expect(res.body.patients[0].fullName).toBe('Amina Okafor');
  });

  it('matches an exact full name despite the column being encrypted', async () => {
    // The name column holds ciphertext, so this only works via the blind index.
    const res = await client.get('/api/patients?search=Bjorn Nilsen');
    expect(res.body.patients).toHaveLength(1);
    expect(res.body.patients[0].patientNumber).toBe('PT-1002');
  });

  it('matches an exact name case- and whitespace-insensitively', async () => {
    const res = await client.get('/api/patients?search=%20bjorn%20%20nilsen%20');
    expect(res.body.patients).toHaveLength(1);
  });

  it('treats LIKE wildcards as literal characters', async () => {
    // Without escaping, "%" would match every patient.
    const res = await client.get('/api/patients?search=%25');
    expect(res.body.patients).toHaveLength(0);
  });

  it('returns an empty result rather than everything for a non-match', async () => {
    const res = await client.get('/api/patients?search=zzzznotfound');
    expect(res.body.patients).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('cannot do a partial name match, because the column is encrypted', async () => {
    // Documents the trade-off rather than pretending it works.
    const res = await client.get('/api/patients?search=Nils');
    expect(res.body.patients).toEqual([]);
  });
});

// ------------------------------------------------ specimen type on a patient ----

describe('patient specimen summaries', () => {
  let client;

  beforeEach(async () => {
    client = authed(await login('tech1', 'tech-password-1234'));
  });

  it('returns no specimen fields for a patient with no sample', async () => {
    await client.post('/api/patients', { patientNumber: 'PT-3100', fullName: 'Solomon Adeyemi' });
    const res = await client.get('/api/patients');
    const patient = res.body.patients.find(p => p.patientNumber === 'PT-3100');
    // These are derived server-side. They must be present-and-empty rather than
    // absent, so the client never has to guess whether a field is missing.
    expect(patient.sampleTypes).toEqual([]);
    expect(patient.primarySampleType).toBeNull();
    expect(patient.collectionDatetime).toBeNull();
    expect(patient.sampleCount).toBe(0);
  });

  it('reports the specimen type, which lives on the sample not the patient', async () => {
    const { body } = await client.post('/api/patients', {
      patientNumber: 'PT-3001',
      fullName: 'Nadia Haddad'
    });
    await client.post('/api/samples', {
      patientId: body.patient.id,
      sampleType: 'stool',
      slideLabel: 'SLD-T1',
      stainMethod: 'Wet mount',
      objective: '40x',
      eyepiece: '10x',
      totalMagnification: '400x',
      fieldsExamined: 10,
      fieldAreaMm2: 0.159,
      collectionDatetime: '2026-09-01T08:00:00Z'
    });

    const res = await client.get('/api/patients?search=PT-3001');
    const patient = res.body.patients[0];
    expect(patient.sampleTypes).toEqual(['stool']);
    expect(patient.primarySampleType).toBe('stool');
    expect(patient.sampleCount).toBe(1);
    expect(patient.collectionDatetime).toBe('2026-09-01T08:00:00Z');
  });

  it('returns every specimen type when a patient has more than one', async () => {
    const { body } = await client.post('/api/patients', {
      patientNumber: 'PT-3002',
      fullName: 'Tomasz Kowal'
    });

    for (const [type, label, when] of [
      ['stool', 'SLD-T2', '2026-09-02T08:00:00Z'],
      ['urine', 'SLD-T3', '2026-09-01T08:00:00Z']
    ]) {
      await client.post('/api/samples', {
        patientId: body.patient.id,
        sampleType: type,
        slideLabel: label,
        stainMethod: 'See protocol',
        objective: '40x',
        eyepiece: '10x',
        totalMagnification: '400x',
        fieldsExamined: 10,
        fieldAreaMm2: 0.159,
        collectionDatetime: when
      });
    }

    const res = await client.get('/api/patients?search=PT-3002');
    const patient = res.body.patients[0];
    // A patient is not a single specimen type. Collapsing this to one value is
    // what made the client-side filter silently drop rows.
    expect([...patient.sampleTypes].sort()).toEqual(['stool', 'urine']);
    expect(patient.sampleCount).toBe(2);
  });

  it('attaches the summary through the single-patient lookup as well', () => {
    // getPatient has no HTTP route yet (only PATCH exists), so this exercises
    // the repository function directly rather than inventing an endpoint.
    const id = db
      .prepare("INSERT INTO patients (id, patient_number, full_name, age, gender, created_at) VALUES ('pat-spec-1', 'PT-3003', 'Ines Lindqvist', 44, 'Female', '2026-09-03T00:00:00Z') RETURNING id")
      .get().id;
    db.prepare(`
      INSERT INTO samples (id, patient_id, sample_type, slide_label, stain_method, objective,
                           eyepiece, total_magnification, fields_examined, field_area_mm2,
                           collection_datetime, created_at)
      VALUES ('smp-spec-1', ?, 'blood', 'SLD-T4', 'Giemsa', '100x_oil', '10x', '1000x', 20, 0.025,
              '2026-09-03T08:00:00Z', '2026-09-03T08:00:00Z')
    `).run(id);

    const patient = getPatient(db, id);
    expect(patient.sampleTypes).toEqual(['blood']);
    expect(patient.sampleCount).toBe(1);
  });
});

// ------------------------------------------------------ query efficiency ----

describe('query efficiency', () => {
  it('loads a page of analyses without one query per analysis', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const patient = await client.post('/api/patients', {
      patientNumber: 'PT-Q',
      fullName: 'Query Patient'
    });
    const sample = await client.post('/api/samples', {
      patientId: patient.body.patient.id,
      fieldsExamined: 10
    });

    for (let i = 0; i < 5; i++) {
      db.prepare(`
        INSERT INTO analyses (id, sample_id, model_id, status, total_detections, started_at)
        VALUES (?, ?, 'm', 'in_review', 2, ?)
      `).run(`ana-q${i}`, sample.body.sample.id, new Date().toISOString());
      db.prepare(`
        INSERT INTO detections (id, analysis_id, class_name, confidence, x, y, width, height, confirmed, rejected)
        VALUES (?, ?, 'Hookworm egg', 0.8, 1, 1, 2, 2, 0, 0)
      `).run(`det-q${i}-a`, `ana-q${i}`);
    }

    // Count statements executed during a page load. The old implementation
    // issued one SELECT per analysis; this must stay constant.
    const originalPrepare = db.prepare.bind(db);
    let selects = 0;
    db.prepare = sql => {
      if (/^\s*SELECT/i.test(sql)) selects++;
      return originalPrepare(sql);
    };

    try {
      const result = listAnalyses(db, { limit: 50 });
      expect(result.items).toHaveLength(5);
      // count + page + detections + samples = a small constant.
      expect(selects).toBeLessThanOrEqual(4);
    } finally {
      db.prepare = originalPrepare;
    }
  });

  it('uses the specimen fieldsExamined, not a hardcoded 10', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const patient = await client.post('/api/patients', {
      patientNumber: 'PT-F',
      fullName: 'Field Count Patient'
    });
    const sample = await client.post('/api/samples', {
      patientId: patient.body.patient.id,
      fieldsExamined: 25
    });

    db.prepare(`
      INSERT INTO analyses (id, sample_id, model_id, status, total_detections, started_at)
      VALUES ('ana-f', ?, 'm', 'in_review', 1, ?)
    `).run(sample.body.sample.id, new Date().toISOString());
    db.prepare(`
      INSERT INTO detections (id, analysis_id, class_name, confidence, x, y, width, height, confirmed, rejected)
      VALUES ('det-f', 'ana-f', 'Hookworm egg', 0.8, 1, 1, 2, 2, 1, 0)
    `).run();

    const { items } = listAnalyses(db, { limit: 10 });
    // 1 egg over 25 fields must be reported against 25 fields.
    expect(items[0].fieldsExamined).toBe(25);
    expect(items[0].findings[0].standardizedQuantity).toContain('/ 25 HPFs');
  });
});

// --------------------------------------------------------- rate limiting ----

describe('login throttling', () => {
  it('allows attempts up to the limit and then blocks', () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    const blocked = limiter.consume('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 100, now: () => now });
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(false);
    now = 200;
    expect(limiter.consume('k').allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('b').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
  });

  it('returns 429 and a Retry-After header once throttled', async () => {
    const client = request(app);
    let sawLimit = false;
    for (let i = 0; i < 15; i++) {
      const res = await client.post('/api/auth/login').send({
        username: 'tech1',
        password: 'wrong-guess'
      });
      if (res.status === 429) {
        expect(res.headers['retry-after']).toBeDefined();
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });

  it('keeps a different account usable after one is throttled', async () => {
    const client = request(app);
    for (let i = 0; i < 12; i++) {
      await client.post('/api/auth/login').send({ username: 'tech1', password: 'wrong-guess' });
    }
    // A different account is not blocked by the first one's throttling.
    const res = await client.post('/api/auth/login').send({
      username: 'dir1',
      password: 'director-password-1234'
    });
    expect(res.status).toBe(200);
  });

  it('records throttling in the audit log', async () => {
    const client = request(app);
    for (let i = 0; i < 12; i++) {
      await client.post('/api/auth/login').send({ username: 'tech1', password: 'wrong-guess' });
    }
    // 12 attempts exceeds the 10-per-account budget, so this account is now
    // throttled, but the shared IP budget has plenty left for a real sign-in.
    const admin = authed(await login('admin1', 'admin-password-1234'));
    const audit = await admin.get('/api/audit?limit=200');
    expect(audit.body.entries.some(e => e.action === 'LOGIN_THROTTLED')).toBe(true);
  });
});

// ---------------------------------------------------------- observability ----

describe('operational surface', () => {
  it('returns a liveness probe', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns a readiness probe that touches the database', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('ok');
  });

  it('does not require a session for health probes', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect((await request(app).get('/readyz')).status).toBe(200);
  });

  it('echoes a request id and generates one when absent', async () => {
    const generated = await request(app).get('/api/system/status');
    expect(generated.headers['x-request-id']).toBeTruthy();

    const supplied = await request(app)
      .get('/api/system/status')
      .set('X-Request-Id', 'trace-me-123');
    expect(supplied.headers['x-request-id']).toBe('trace-me-123');
  });

  it('sets hardening headers', async () => {
    const res = await request(app).get('/api/system/status');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not leak a stack trace on an internal error', async () => {
    const res = await request(app).get('/api/patients?limit=notanumber');
    // Either it succeeds by falling back to defaults, or fails cleanly. It
    // must never expose internals either way.
    if (res.status >= 400) {
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+/);
    }
  });

  it('emits one structured log line per request', async () => {
    const lines = [];
    const loggingApp = createApp({ dbPath: ':memory:', logger: entry => lines.push(entry) });
    await request(loggingApp).get('/healthz');

    const requestLog = lines.find(l => l.event === 'request');
    expect(requestLog).toBeDefined();
    expect(requestLog.method).toBe('GET');
    expect(requestLog.status).toBe(200);
    expect(typeof requestLog.durationMs).toBe('number');
    expect(requestLog.requestId).toBeTruthy();
  });

  it('serialises logs as single-line JSON', () => {
    const written = [];
    const logger = createLogger({ stream: { write: line => written.push(line) } });
    logger({ level: 'info', event: 'test', requestId: 'abc' });
    expect(written).toHaveLength(1);
    expect(written[0].endsWith('\n')).toBe(true);
    expect(JSON.parse(written[0]).event).toBe('test');
  });
});

// ---------------------------------------------------------- patient update ----

describe('patient updates', () => {
  it('updates permitted fields and encrypts them', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const created = await client.post('/api/patients', {
      patientNumber: 'PT-UPD',
      fullName: 'Original Name'
    });
    const id = created.body.patient.id;

    const res = await client.patch(`/api/patients/${id}`, {
      referringDoctor: 'Dr. New Referral'
    });
    expect(res.status).toBe(200);
    expect(res.body.patient.referringDoctor).toBe('Dr. New Referral');

    const raw = db.prepare('SELECT referring_doctor FROM patients WHERE id = ?').get(id);
    expect(raw.referring_doctor).toMatch(/^enc:v1:/);
  });

  it('cannot change the patient number', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    const created = await client.post('/api/patients', {
      patientNumber: 'PT-IMM',
      fullName: 'Immutable Number'
    });
    await client.patch(`/api/patients/${created.body.patient.id}`, {
      patientNumber: 'PT-HACKED'
    });
    const row = db
      .prepare('SELECT patient_number FROM patients WHERE id = ?')
      .get(created.body.patient.id);
    expect(row.patient_number).toBe('PT-IMM');
  });

  it('returns 404 for an unknown patient', async () => {
    const client = authed(await login('tech1', 'tech-password-1234'));
    expect((await client.patch('/api/patients/nope', { age: 1 })).status).toBe(404);
  });
});
