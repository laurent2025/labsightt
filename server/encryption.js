/**
 * Application-level encryption for patient-identifiable fields.
 *
 * The SQLite file is a single file that is easy to copy, back up, or read from
 * a stolen disk. Encrypting the PHI columns means a leaked database file yields
 * ciphertext rather than a list of patients.
 *
 * Scheme: AES-256-GCM, random 96-bit IV per value, authentication tag verified
 * on read. The key is a 32-byte key supplied through PHI_ENCRYPTION_KEY and is
 * never stored in the database.
 *
 * If the key is absent the server refuses to start rather than silently
 * writing plaintext, so a misconfigured deployment fails loudly.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

let cachedKey = null;

function loadKey() {
  if (cachedKey) return cachedKey;

  const secret = process.env.PHI_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'PHI_ENCRYPTION_KEY is not set. Generate one with ' +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
        'and set it in the server environment. The server will not store patient ' +
        'identifiers in plaintext.'
    );
  }

  if (secret.length < 32) {
    throw new Error('PHI_ENCRYPTION_KEY must be at least 32 characters of high-entropy secret.');
  }

  // Derive a fixed 32-byte key. HKDF-style salt is unnecessary here because the
  // secret is required to be high entropy, not a user-chosen password.
  cachedKey = createHash('sha256').update(secret, 'utf8').digest();
  return cachedKey;
}

/** True when a stored value is ciphertext produced by this module. */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptPHI(plaintext) {
  // Normalise undefined to null: SQLite bind parameters reject `undefined`, and
  // an absent field should be stored as NULL rather than crashing the write.
  if (plaintext === undefined) return null;
  if (plaintext === null || plaintext === '') return plaintext;

  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptPHI(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;
  // Values written before encryption was enabled pass through unchanged, so an
  // existing database keeps working.
  if (!isEncrypted(stored)) return stored;

  const key = loadKey();
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const payload = raw.subarray(IV_LENGTH + TAG_LENGTH);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
  } catch {
    // GCM authentication failure means either the wrong key or tampering. Both
    // are fatal for the value, and neither may be papered over.
    throw new Error(
      'Could not decrypt a stored field: the PHI encryption key is wrong, or the record was modified.'
    );
  }
}

/** Encrypts each value of an object, leaving null/undefined alone. */
export function encryptFields(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = encryptPHI(value);
  }
  return out;
}

export function decryptFields(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = decryptPHI(value);
  }
  return out;
}

/** Verifies the configured key actually round-trips, so a typo fails at boot. */
export function selfTest() {
  const probe = `labsight-${Date.now()}`;
  return decryptPHI(encryptPHI(probe)) === probe;
}

/**
 * Blind index for searching encrypted columns.
 *
 * Encrypting a name means `LIKE '%okafor%'` can never match it: the ciphertext
 * is unrelated to the plaintext. A blind index stores a keyed hash of the value
 * so an exact lookup still works without the database holding the plaintext.
 *
 * The trade-off is inherent and is stated in the README: an index supports
 * EXACT matching only. Partial and fuzzy name search are not available on
 * encrypted data without leaking through padding or partial hashes. A
 * deterministic index is also equal for equal inputs, so an attacker holding the
 * database learns which patients share a name — an accepted trade for being
 * able to search at all.
 */
export function blindIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const key = loadKey();
  return createHmac('sha256', key)
    .update(normaliseForIndex(String(value)), 'utf8')
    .digest('hex');
}

/** Case- and whitespace-insensitive, so "Jane  Doe" matches "jane doe". */
function normaliseForIndex(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
