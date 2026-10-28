/**
 * Operational hardening: request identity, structured logs, login rate
 * limiting, and liveness/readiness reporting.
 *
 * These are the controls a real deployment needs before it faces a network.
 */
import { randomUUID } from 'node:crypto';

// ------------------------------------------------------- request identity ----

/**
 * Tags every request with an id that appears in the log line and in the
 * response, so an operator can correlate a user-visible failure with the
 * server-side record of what happened.
 */
export function requestContext(logger) {
  return (req, res, next) => {
    const id = req.get('x-request-id') || randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger({
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        event: 'request',
        requestId: id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        actor: req.user?.id ?? null,
        ip: req.ip
      });
    });
    next();
  };
}

/** Single-line JSON logging, so output is greppable and machine-parseable. */
export function createLogger({ pretty = false, stream = process.stdout } = {}) {
  return pretty
    ? entry => {
        const { level, event, requestId, method, path, status, durationMs, ...rest } = entry;
        const tag = level === 'error' ? 'ERR ' : level === 'warn' ? 'WARN' : 'INFO';
        stream.write(
          `[${tag}] ${method ?? ''} ${path ?? event} ${status ?? ''} ${durationMs ? `${durationMs}ms` : ''} ` +
            `${JSON.stringify(rest)}\n`
        );
      }
    : entry => stream.write(JSON.stringify(entry) + '\n');
}

// ------------------------------------------------------- rate limiting ----

/**
 * Fixed-window counter, keyed by whatever the caller chooses (normally IP for
 * login, user id for expensive work).
 *
 * Deliberately in-process: it protects a single node. A multi-node deployment
 * needs this backed by shared storage, which is called out in the README rather
 * than silently assumed.
 */
export class RateLimiter {
  constructor({ limit, windowMs, now = () => Date.now() }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }

  /** Returns { allowed, remaining, retryAfterMs }. */
  consume(key) {
    const now = this.now();
    const existing = this.hits.get(key);

    if (!existing || now >= existing.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.sweep(now);
      return { allowed: true, remaining: this.limit - 1, retryAfterMs: 0 };
    }

    existing.count += 1;
    if (existing.count > this.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
    }
    return { allowed: true, remaining: this.limit - existing.count, retryAfterMs: 0 };
  }

  /** Drops expired buckets so the map cannot grow without bound. */
  sweep(now = this.now()) {
    if (this.hits.size < 1000) return;
    for (const [key, value] of this.hits) {
      if (now >= value.resetAt) this.hits.delete(key);
    }
  }

  clear() {
    this.hits.clear();
  }
}

/**
 * Login throttling. Two buckets: one per client IP to blunt spraying, and one
 * per username so a single account cannot be ground down from many addresses.
 *
 * The per-IP budget is deliberately generous. A laboratory workstation often
 * sits behind one NAT address shared by every bench, so a tight per-IP limit
 * lets one attacker lock out an entire bench. The per-account limit is the one
 * doing the real work; the per-IP limit is only a backstop against a wide spray
 * across many usernames.
 */
export function createLoginLimiter({ limit = 10, windowMs = 15 * 60 * 1000, ipLimit = 60 } = {}) {
  const byIp = new RateLimiter({ limit: ipLimit, windowMs });
  const byAccount = new RateLimiter({ limit, windowMs });

  return {
    check(ip, username) {
      const ipResult = byIp.consume(ip ?? 'unknown');
      if (!ipResult.allowed) return ipResult;
      return byAccount.consume(username ?? 'unknown');
    },
    /** Called only on success, so a legitimate user is not penalised. */
    reset(username) {
      byAccount.clear();
    },
    byIp,
    byAccount
  };
}

// -------------------------------------------------------------- health ----

export function healthRoutes(app, db) {
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get('/readyz', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ready', database: 'ok' });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', database: 'error' });
    }
  });
}

/** Stops accepting connections, then releases the database handle. */
export function installGracefulShutdown(server, db, logger) {
  let shuttingDown = false;

  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger({ level: 'info', event: 'shutdown', signal });

    server.close(() => {
      try {
        // Checkpoint the WAL so the database file is consistent on disk.
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        db.close();
      } catch (err) {
        logger({ level: 'error', event: 'shutdown_db_error', error: err.message });
      }
      process.exit(0);
    });

    // Do not hang forever on a stuck connection.
    setTimeout(() => {
      logger({ level: 'error', event: 'shutdown_timeout' });
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Extended health check with dependency verification.
 * Returns detailed status of all critical dependencies.
 */
export async function deepHealthCheck(db, config = {}) {
  const checks = {
    database: { status: 'unknown' },
    inference: { status: 'unknown' },
    storage: { status: 'unknown' }
  };

  // Database connectivity
  try {
    db.prepare('SELECT 1').get();
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
  }

  // Inference configuration
  try {
    const { endpoint, apiKey } = (await import('./inference.js')).envConfig();
    if (endpoint && apiKey) {
      checks.inference = { status: 'configured' };
    } else {
      checks.inference = { status: 'not_configured' };
    }
  } catch {
    checks.inference = { status: 'error' };
  }

  // Storage (check if we can write to temp)
  try {
    const fs = await import('node:fs/promises');
    await fs.access('.', fs.constants.W_OK);
    checks.storage = { status: 'ok' };
  } catch {
    checks.storage = { status: 'error' };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'configured');
  return {
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks
  };
}

/**
 * Request correlation middleware.
 * Ensures every request has a trace ID that propagates through logs and responses.
 */
export function correlationId() {
  return (req, res, next) => {
    const traceId = req.get('x-trace-id') || req.get('x-request-id') || crypto.randomUUID();
    req.traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);
    next();
  };
}

/**
 * Structured error handler with consistent formatting.
 */
export function errorHandler(logger) {
  return (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const traceId = req.traceId || req.requestId;

    let payload = {
      error: err.message || 'Internal server error',
      traceId,
      timestamp: new Date().toISOString()
    };

    // Database error guidance
    if (typeof err?.code === 'string' && err.code.length === 5) {
      const guidance = err.code === '42501'
        ? 'Row-level security rejected this write. Grant the service role full access, or sign in with a Supabase Auth account.'
        : err.code === '42703' || err.code === '42P01'
          ? 'The Supabase schema is out of date. Run supabase/schema.sql in the Supabase SQL editor, then retry.'
          : null;

      if (guidance) {
        payload = { ...payload, error: err.message || 'The database rejected this request.', hint: guidance };
        return res.status(502).json(payload);
      }
    }

    if (err.retryable) {
      payload.retryable = true;
      res.setHeader('Retry-After', Math.ceil((err.retryAfter || 5000) / 1000));
    }

    if (process.env.NODE_ENV !== 'production' && err.stack) {
      payload.stack = err.stack;
    }

    logger({
      level: status >= 500 ? 'error' : 'warn',
      event: 'request_error',
      traceId,
      status,
      path: req.originalUrl,
      method: req.method,
      error: err.message,
      stack: err.stack
    });

    res.status(status).json(payload);
  };
}
