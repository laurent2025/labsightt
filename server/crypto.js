/**
 * Password hashing and session tokens, built on node:crypto.
 *
 * scrypt with a per-user random salt for passwords; SHA-256 for session token
 * lookups (tokens are high-entropy random values, so a fast hash is correct
 * here and avoids a needless work factor on every request).
 */
import {
  randomBytes,
  scrypt as scryptCb,
  createHash,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(normalize(password), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  try {
    const salt = Buffer.from(storedSalt, 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    const derived = await scrypt(normalize(password), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * NFKC normalization so a password typed with a different Unicode composition
 * still verifies. Case is deliberately NOT folded.
 */
function normalize(password) {
  return String(password).normalize('NFKC');
}

export function generateSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function newId(prefix) {
  return `${prefix}-${randomBytes(9).toString('base64url')}`;
}

/**
 * Password policy. Length is the dominant factor in resistance to offline
 * cracking, so the floor is generous and complexity is only a light backstop.
 */
export function validatePasswordStrength(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 12) {
    problems.push('must be at least 12 characters');
  }
  if (typeof password === 'string' && password.length > 200) {
    problems.push('must be at most 200 characters');
  }
  if (typeof password === 'string' && /^\s|\s$/.test(password)) {
    problems.push('must not begin or end with whitespace');
  }
  return problems;
}
