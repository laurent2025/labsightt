/**
 * Server entrypoint.
 *
 * Refuses to start without a PHI encryption key: a misconfigured deployment
 * must fail loudly rather than quietly write patient identifiers in plaintext.
 */
import { createApp } from './index.js';
import { openDatabase, installImmutabilityGuards } from './db.js';
import { createUser } from './auth.js';
import { appendAudit } from './audit.js';
import { selfTest } from './encryption.js';
import { createLogger, installGracefulShutdown } from './operations.js';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT || 4000);
const DB_PATH = process.env.DB_PATH || './data/labsight.db';
const PRETTY_LOGS = process.env.LOG_FORMAT === 'pretty';

// Verify the key round-trips before opening the database, so a typo fails at
// boot rather than on the first patient record.
if (!selfTest()) {
  console.error('PHI encryption self-test failed. Check PHI_ENCRYPTION_KEY.');
  process.exit(1);
}

const logger = createLogger({ pretty: PRETTY_LOGS });

const db = openDatabase(DB_PATH);
installImmutabilityGuards(db);

const app = createApp({ dbPath: DB_PATH, logger });

/**
 * Legacy SQLite fallback accounts, only when Supabase Auth is disabled.
 *
 * These role-labelled accounts are not used by the Supabase signup flow.
 * All users, including Supabase signups, receive the same access and any of
 * them may verify a report (including their own).
 *
 * Passwords come from the environment. A missing one is generated and printed,
 * never defaulted to a guessable constant.
 */
const BOOTSTRAP_ROLES = [
  {
    role: 'technologist',
    defaultUsername: 'tech',
    displayName: 'Laboratory Technologist',
    userVar: 'BOOTSTRAP_TECH_USER',
    passVar: 'BOOTSTRAP_TECH_PASSWORD'
  },
  {
    role: 'supervisor',
    defaultUsername: 'supervisor',
    displayName: 'Supervising Technologist',
    userVar: 'BOOTSTRAP_SUPERVISOR_USER',
    passVar: 'BOOTSTRAP_SUPERVISOR_PASSWORD'
  },
  {
    role: 'director',
    defaultUsername: 'director',
    displayName: 'Lab Director',
    userVar: 'BOOTSTRAP_DIRECTOR_USER',
    passVar: 'BOOTSTRAP_DIRECTOR_PASSWORD'
  }
];

/**
 * Creates any missing account for legacy SQLite development.
 *
 * Idempotent by username, not gated on the table being empty: an install that
 * already has a director but no supervisor gets the supervisor without anyone
 * having to delete the database. An existing username is never modified, so
 * this cannot reset a password an operator has already changed.
 */
async function bootstrapRoles() {
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');
  const created = [];
  const generated = [];

  for (const spec of BOOTSTRAP_ROLES) {
    // BOOTSTRAP_ADMIN_* predates the per-role variables and is still honoured
    // for the director, so an existing .env keeps working.
    const legacyUser = spec.role === 'director' ? process.env.BOOTSTRAP_ADMIN_USER : undefined;
    const legacyPass = spec.role === 'director' ? process.env.BOOTSTRAP_ADMIN_PASSWORD : undefined;

    const username = process.env[spec.userVar] || legacyUser || spec.defaultUsername;

    if (exists.get(username)) continue;

    const fromEnv = process.env[spec.passVar] || legacyPass;
    const password = fromEnv || `${randomBytes(9).toString('base64url')}-Lab1`;
    if (!fromEnv) generated.push(username);

    await createUser(db, {
      username,
      displayName: spec.displayName,
      role: spec.role,
      password
    });

    appendAudit(db, {
      actorName: 'system',
      action: 'SYSTEM_BOOTSTRAPPED',
      entity: 'user',
      details: `Initial ${spec.role} account "${username}" created`
    });

    created.push({ username, role: spec.role, password, generated: !fromEnv });
  }

  if (created.length === 0) return;

  console.log(`\n  Created ${created.length} account(s):`);
  for (const account of created) {
    console.log(`    ${account.username.padEnd(22)} ${account.role.padEnd(13)} ${account.password}`);
  }
  if (generated.length > 0) {
    console.log(
      `\n  Passwords for ${generated.join(', ')} were generated. Set the matching` +
        '\n  BOOTSTRAP_*_PASSWORD variables in .env to choose them yourself.'
    );
  }
  console.log('  Change these after signing in. They are recorded in the audit log.\n');
}

if (process.env.USE_SUPABASE_AUTH === 'true') {
  console.log('Supabase email authentication enabled; SQLite bootstrap accounts are disabled.');
} else {
  await bootstrapRoles();
}

const server = app.listen(PORT, () => {
  const configured = Boolean(process.env.ROBOFLOW_API_KEY);
  console.log(`LabSight API listening on http://localhost:${PORT}`);
  console.log(`  database:   ${DB_PATH}`);
  console.log(`  PHI:        encrypted at rest (AES-256-GCM)`);
  console.log(`  inference:  ${configured ? 'configured' : 'NOT CONFIGURED (set ROBOFLOW_API_KEY)'}`);
});

installGracefulShutdown(server, db, logger);
