/**
 * Database schema and migrations.
 *
 * Uses Node's built-in `node:sqlite` so the system has no native build
 * dependencies. Migrations are versioned and applied in order, exactly once,
 * inside a transaction.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial-schema',
    up: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        role          TEXT NOT NULL CHECK (role IN ('technologist','supervisor','director')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE sessions (
        token_hash  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        ip          TEXT,
        user_agent  TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE patients (
        id                 TEXT PRIMARY KEY,
        patient_number     TEXT NOT NULL UNIQUE,
        full_name          TEXT NOT NULL,
        age                INTEGER NOT NULL,
        gender             TEXT NOT NULL,
        referring_doctor   TEXT,
        referring_facility TEXT,
        clinical_notes     TEXT,
        created_at         TEXT NOT NULL,
        created_by         TEXT REFERENCES users(id)
      );

      CREATE TABLE samples (
        id                  TEXT PRIMARY KEY,
        patient_id          TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        sample_type         TEXT NOT NULL,
        slide_label         TEXT NOT NULL,
        stain_method        TEXT NOT NULL,
        objective           TEXT NOT NULL,
        eyepiece            TEXT NOT NULL,
        total_magnification TEXT NOT NULL,
        fields_examined     INTEGER NOT NULL,
        field_area_mm2      REAL NOT NULL,
        collection_datetime TEXT NOT NULL,
        image_path          TEXT,
        notes               TEXT,
        created_at          TEXT NOT NULL,
        created_by          TEXT REFERENCES users(id)
      );
      CREATE INDEX idx_samples_patient ON samples(patient_id);

      CREATE TABLE IF NOT EXISTS sample_slides (
        id          TEXT PRIMARY KEY,
        sample_id   TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        image_data  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        created_by  TEXT REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sample_slides_sample
        ON sample_slides(sample_id, created_at);

      CREATE TABLE analyses (
        id              TEXT PRIMARY KEY,
        sample_id       TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        model_id        TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('processing','in_review','confirmed','verified')),
        total_detections INTEGER NOT NULL DEFAULT 0,
        started_at      TEXT NOT NULL,
        completed_at    TEXT,
        initiated_by    TEXT REFERENCES users(id)
      );
      CREATE INDEX idx_analyses_sample ON analyses(sample_id);

      CREATE TABLE detections (
        id          TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        class_name  TEXT NOT NULL,
        confidence  REAL NOT NULL,
        x           REAL NOT NULL,
        y           REAL NOT NULL,
        width       REAL NOT NULL,
        height      REAL NOT NULL,
        confirmed   INTEGER NOT NULL DEFAULT 0,
        rejected    INTEGER NOT NULL DEFAULT 0,
        manual      INTEGER NOT NULL DEFAULT 0,
        note        TEXT,
        adjudicated_by TEXT REFERENCES users(id),
        adjudicated_at TEXT
      );
      CREATE INDEX idx_detections_analysis ON detections(analysis_id);

      CREATE TABLE reports (
        id                 TEXT PRIMARY KEY,
        report_number      TEXT NOT NULL UNIQUE,
        analysis_id        TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        technologist_id    TEXT NOT NULL REFERENCES users(id),
        technologist_name  TEXT NOT NULL,
        supervisor_name    TEXT,
        status             TEXT NOT NULL CHECK (status IN ('draft','pending_verification','verified','released')),
        technologist_notes TEXT,
        clinical_impression TEXT,
        generated_at       TEXT NOT NULL,
        verified_at        TEXT,
        verified_by        TEXT REFERENCES users(id),
        released_at        TEXT
      );
      CREATE INDEX idx_reports_analysis ON reports(analysis_id);

      -- Append-only, hash-chained. No UPDATE or DELETE is ever issued against
      -- this table; tamper-evidence comes from the prev_hash linkage.
      CREATE TABLE audit_log (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        id         TEXT NOT NULL UNIQUE,
        timestamp  TEXT NOT NULL,
        actor_id   TEXT REFERENCES users(id),
        actor_name TEXT,
        action     TEXT NOT NULL,
        entity     TEXT,
        entity_id  TEXT,
        details    TEXT,
        prev_hash  TEXT NOT NULL,
        row_hash   TEXT NOT NULL
      );
      CREATE INDEX idx_audit_actor ON audit_log(actor_id);
      CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
    `,
  },
  {
    version: 2,
    name: 'query-path-indexes',
    up: `
      -- Every list endpoint sorts by a timestamp descending. Without these the
      -- database sorts the whole table on each request, which is the single
      -- biggest cost once a laboratory accumulates real volume.
      CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_samples_created ON samples(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analyses_started ON analyses(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reports_generated ON reports(generated_at DESC);

      -- Case-insensitive lookup for the patient search box.
      CREATE INDEX IF NOT EXISTS idx_patients_number_nocase ON patients(patient_number COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_patients_name_nocase ON patients(full_name COLLATE NOCASE);

      -- Adjudication lookups and the "which analyses are still open" filter.
      CREATE INDEX IF NOT EXISTS idx_detections_pending ON detections(analysis_id, confirmed, rejected);
      CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
      CREATE INDEX IF NOT EXISTS idx_reports_tech ON reports(technologist_id);

      -- Session cleanup sweeps expired rows on every status poll.
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `,
  },
  {
    version: 3,
    name: 'patient-name-blind-index',
    up: `
      -- Patient names are encrypted at rest, so a LIKE search over the name
      -- column can never match. This holds a keyed hash of the name, which
      -- restores exact-match lookup without storing the plaintext.
      ALTER TABLE patients ADD COLUMN full_name_index TEXT;
      CREATE INDEX IF NOT EXISTS idx_patients_name_index ON patients(full_name_index);
    `,
  },
  {
    version: 4,
    name: 'soft-delete-reports',
    up: `
      ALTER TABLE reports ADD COLUMN deleted_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_reports_visible ON reports(deleted_at, generated_at DESC);
    `,
  },
  {
    version: 5,
    name: 'soft-delete-patients',
    up: `
      ALTER TABLE patients ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_patients_active_created ON patients(active, created_at desc);
    `,
  },
  {
    version: 6,
    name: 'audit-actor-id-without-local-fk',
    up: `
      -- With Supabase auth enabled, audit actors are Supabase user ids that do
      -- not exist in the local users table, so the local foreign key made every
      -- appendAudit call fail and turned every clinical write into a 500.
      -- Rebuild audit_log without the constraint; the hash chain, not the
      -- foreign key, is the integrity control.
      CREATE TABLE audit_log_new (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        id         TEXT NOT NULL UNIQUE,
        timestamp  TEXT NOT NULL,
        actor_id   TEXT,
        actor_name TEXT,
        action     TEXT NOT NULL,
        entity     TEXT,
        entity_id  TEXT,
        details    TEXT,
        prev_hash  TEXT NOT NULL,
        row_hash   TEXT NOT NULL
      );
      INSERT INTO audit_log_new (
        seq, id, timestamp, actor_id, actor_name, action, entity, entity_id, details, prev_hash, row_hash
      )
      SELECT
        seq, id, timestamp, actor_id, actor_name, action, entity, entity_id, details, prev_hash, row_hash
      FROM audit_log;
      DROP TABLE audit_log;
      ALTER TABLE audit_log_new RENAME TO audit_log;
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
     `,
   },
   {
     version: 7,
     name: 'users-role-admin-member',
     up: `
       -- The admin-role system adds 'admin' and 'member' to the legacy role
       -- column. SQLite cannot widen a CHECK constraint in place, so rebuild
       -- the table. Child FKs (sessions, patients, ...) reference users by
       -- name and rebind to the renamed table.
       CREATE TABLE users_new (
         id            TEXT PRIMARY KEY,
         username      TEXT NOT NULL UNIQUE,
         display_name  TEXT NOT NULL,
         role          TEXT NOT NULL CHECK (role IN ('technologist','supervisor','director','admin','member')),
         password_hash TEXT NOT NULL,
         password_salt TEXT NOT NULL,
         active        INTEGER NOT NULL DEFAULT 1,
         created_at    TEXT NOT NULL,
         last_login_at TEXT
       );
       INSERT INTO users_new (
         id, username, display_name, role, password_hash, password_salt, active, created_at, last_login_at
       )
       SELECT id, username, display_name, role, password_hash, password_salt, active, created_at, last_login_at
       FROM users;
       DROP TABLE users;
       ALTER TABLE users_new RENAME TO users;
     `,
   },
   {
     version: 8,
     name: 'detection-image-ref',
     up: `
       -- A specimen may be scanned on several uploaded images, and each
       -- detection must remember which image it came from. The microscope
       -- viewer shows only the boxes that belong to the slide being reviewed
       -- while the report keeps every finding from every image.
       ALTER TABLE detections ADD COLUMN image_ref TEXT;
       CREATE INDEX IF NOT EXISTS idx_detections_image
       ON detections(analysis_id, image_ref);
     `,
   },
   {
     version: 9,
     name: 'sample-slide-images',
     up: `
       CREATE TABLE IF NOT EXISTS sample_slides (
         id          TEXT PRIMARY KEY,
         sample_id   TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
         name        TEXT NOT NULL,
         image_data  TEXT NOT NULL,
         created_at  TEXT NOT NULL,
         created_by  TEXT REFERENCES users(id)
       );
       CREATE INDEX IF NOT EXISTS idx_sample_slides_sample
         ON sample_slides(sample_id, created_at);
     `,
   },
 ];

export function openDatabase(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);

  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
  }

  migrate(db);
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    // Rebuilds like `users` drop the parent of live foreign keys, which
    // SQLite refuses while enforcement is on; the documented procedure
    // toggles enforcement outside the transaction.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(migration.up);
      db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      db.exec('PRAGMA foreign_keys = ON');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${err.message}`);
    }
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Append-only triggers. These make it impossible for the application (or a
 * stray migration) to rewrite history, so the hash chain is the only thing
 * standing between an editor and the record.
 */
export function installImmutabilityGuards(db) {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update
    BEFORE UPDATE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
    BEFORE DELETE ON audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit_log is append-only');
    END;
  `);
}
