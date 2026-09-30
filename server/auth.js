/**
 * Authentication middleware for LabSight sessions.
 *
 * The client can no longer assert an identity: every request must present a
 * valid session cookie; all authenticated users have equal access.
 */
import { generateSessionToken, hashToken, verifyPassword, newId } from './crypto.js';
import {
  getSupabaseClient,
  getSupabaseProfile,
  getSupabaseUserByToken
} from './supabase.js';

export const ROLES = ['technologist', 'supervisor', 'director'];

export const SESSION_COOKIE = 'labsight_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function findUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function findUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username ?? row.user_metadata?.username ?? row.email?.split('@')[0] ?? 'user',
    displayName: row.display_name ?? row.displayName ?? row.user_metadata?.display_name ?? row.email?.split('@')[0] ?? row.username ?? 'User',
    active: typeof row.active === 'boolean' ? row.active : Boolean(row.active)
  };
}

export async function createUser(db, { username, displayName, role, password }) {
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown role "${role}". Expected one of: ${ROLES.join(', ')}`);
  }
  if (findUserByUsername(db, username)) {
    throw new Error(`Username "${username}" is already taken.`);
  }
  const { hashPassword } = await import('./crypto.js');
  const { hash, salt } = await hashPassword(password);
  const id = newId('usr');
  db.prepare(`
    INSERT INTO users (id, username, display_name, role, password_hash, password_salt, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, username, displayName, role, hash, salt, new Date().toISOString());
  return findUserById(db, id);
}

/**
 * Authenticates a username/password pair.
 *
 * On an unknown username a dummy scrypt run is still performed so the response
 * time does not reveal whether the account exists.
 */
export async function authenticate(db, username, password) {
  const user = findUserByUsername(db, username);

  if (!user) {
    await verifyPassword(password ?? '', '00'.repeat(64), '00'.repeat(16));
    return null;
  }
  if (!user.active) return null;

  const ok = await verifyPassword(password ?? '', user.password_hash, user.password_salt);
  return ok ? user : null;
}

export function createSession(db, user, { ip, userAgent } = {}) {
  const token = generateSessionToken();
  const now = new Date();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    hashToken(token),
    user.id,
    now.toISOString(),
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    ip ?? null,
    userAgent ?? null
  );
  return { token, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
}

export function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function destroyAllSessionsForUser(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

export function resolveSession(db, token) {
  if (!token) return null;
  const row = db
    .prepare(`
      SELECT s.token_hash, s.expires_at, u.*
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(hashToken(token));

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  if (!row.active) return null;
  return row;
}

export function setSessionCookie(res, token, expiresAt) {
  const configuredSameSite = process.env.SESSION_COOKIE_SAME_SITE?.toLowerCase();
  const sameSite = ['strict', 'lax', 'none'].includes(configuredSameSite)
    ? configuredSameSite
    : process.env.NODE_ENV === 'production'
      ? 'none'
      : 'strict';

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    expires: expiresAt,
    path: '/'
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Rejects the request unless a valid session is present. */
export function requireAuth(db) {
  return async (req, res, next) => {
    if (process.env.USE_SUPABASE_AUTH === 'true') {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ error: 'Supabase auth requires SUPABASE_SERVICE_ROLE_KEY on the API server.' });
      }
      const supabase = getSupabaseClient({ admin: true });
      const token = req.cookies?.[SESSION_COOKIE];
      const user = token ? await getSupabaseUserByToken(supabase, token) : null;

      if (!user) {
        return res.status(401).json({ error: 'Not authenticated.' });
      }

      const profile = await getSupabaseProfile(supabase, user.id);
      if (!profile) return res.status(403).json({ error: 'Account profile could not be loaded.' });
      req.user = { id: user.id, email: profile.email, username: profile.username, displayName: profile.display_name, display_name: profile.display_name, active: true };
      return next();
    }

    const user = resolveSession(db, req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    req.user = user;
    next();
  };
}

