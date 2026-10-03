/**
 * Vercel serverless entry for the RenziAI API.
 *
 * Exports the same Express app as `server/main.js`, minus the long-lived
 * process concerns (no listen, no SQLite bootstrap accounts). Clinical data
 * lives in Supabase (USE_SUPABASE_DB / USE_SUPABASE_AUTH must be true here);
 * the local SQLite database is used in-memory for the audit chain only, so
 * each function instance keeps its own short-lived chain.
 *
 * The browser calls `/api/*` on the same origin; `vercel.json` rewrites those
 * paths to this function, keeping the session cookie same-origin.
 */
import { createApp } from '../server/index.js';
import { selfTest } from '../server/encryption.js';
import { createLogger } from '../server/operations.js';

if (!selfTest()) {
  throw new Error(
    'PHI encryption self-test failed. Set PHI_ENCRYPTION_KEY in the Vercel project environment ' +
      '(it must match the key that encrypted any existing Supabase data).'
  );
}

if (process.env.USE_SUPABASE_DB !== 'true' || process.env.USE_SUPABASE_AUTH !== 'true') {
  throw new Error(
    'This deployment targets Vercel, which has no persistent local storage. ' +
      'Set USE_SUPABASE_DB=true and USE_SUPABASE_AUTH=true.'
  );
}

const app = createApp({ dbPath: ':memory:', logger: createLogger({ pretty: false }) });

// Log which credentials are present (never their values) so a missing key is
// visible in the Vercel function log instead of surfacing as a 503 mid-request.
console.log(
  `[api] env-check: supabase_db=${process.env.USE_SUPABASE_DB === 'true'} ` +
    `supabase_auth=${process.env.USE_SUPABASE_AUTH === 'true'} ` +
    `supabase_url=${Boolean(process.env.SUPABASE_URL)} ` +
    `service_key=${Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} ` +
    `phi_key=${Boolean(process.env.PHI_ENCRYPTION_KEY)} ` +
    `roboflow_key=${Boolean(process.env.ROBOFLOW_API_KEY)}`
);

// Plain handler wrapper: Vercel's Node runtime passes Node http req/res pairs,
// and Express handles the request lifecycle (including its error middleware)
// without needing to be `listen`-ed.
export default function handler(req, res) {
  app(req, res, () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error.' });
    }
  });
}
