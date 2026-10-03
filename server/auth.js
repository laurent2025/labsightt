/**
 * Authentication middleware for LenziAI sessions.
 *
 * The client can no longer assert an identity: every request must present a
 * valid session cookie; all authenticated users have equal access.
 */
import { generateSessionToken, hashToken, verifyPassword, newId } from './crypto.js';
import {
  getSupabaseClient,
  getSupabaseProfile,
  ensureSupabaseProfile,
  getSupabaseUserByToken
} from './supabase.js';

export const ROLES = ['admin', 'member'];

export const SESSION_COOKIE = 'labsight_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_SESSIONS_PER_USER = 5;

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
    email: row.email ?? null,
    role: row.role === 'admin' ? 'admin' : 'member',
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
  const sessions = db.prepare('SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at ASC').all(user.id);
  if (sessions.length >= MAX_SESSIONS_PER_USER) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessions[0].token_hash);
  }

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
    : 'lax';

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

// Profiles change rarely, and every authenticated request used to add two
// Supabase round-trips for them. That call burst on page refresh was the main
// source of transient 500s, so resolve each user's profile once and cache it
// for the lifetime of the server process.
const profileCache = new Map();

/**
 * Drops one user's cached profile so the next request re-reads it from the
 * database. Call after admin operations that mutate the profile (role change,
 * suspension), so the change takes effect without a server restart.
 */
export function clearProfileCache(userId) {
  profileCache.delete(userId);
}

/**
 * Rejects the request unless the authenticated user is an administrator.
 * Must run after requireAuth so req.user is populated.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access is required for this operation.' });
  }
  next();
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

      let profile = profileCache.get(user.id) ?? null;
      if (!profile) {
        try {
          profile = await ensureSupabaseProfile(getSupabaseClient({ admin: true }), user);
          profileCache.set(user.id, profile);
        } catch (err) {
          return res.status(503).json({ error: 'Account profile could not be verified. Contact support.' });
        }
      }
      // Access is granted only to accounts an administrator has approved:
      // email confirmed (Supabase Auth) + approved (profiles.approved). A 403
      // with a stable code keeps the session cookie valid so an approved
      // account regains access on the very next request after approval.
      if (profile.approved !== true) {
        return res.status(403).json({
          code: 'NOT_APPROVED',
          error: 'This account is waiting for administrator approval. An administrator must approve it before you can sign in.'
        });
      }
      req.user = { id: user.id, email: profile.email, username: profile.username, displayName: profile.display_name, display_name: profile.display_name, role: profile.role === 'admin' ? 'admin' : 'member', active: true };
      return next();
    }

    const user = resolveSession(db, req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    // Normalize the legacy role column so callers can rely on 'admin'|'member'.
    req.user = { ...user, role: user.role === 'admin' ? 'admin' : 'member' };
    next();
  };
}

