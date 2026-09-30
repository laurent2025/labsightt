# LabSight — AI-assisted clinical microscopy review

A laboratory information system for clinical microscopy: accession a specimen,
run AI detection over a slide image, adjudicate every proposed bounding box,
and produce a laboratory report that any signed-in user can verify before
it is released.

> **Not a medical device. Not clinically validated. Not accredited.** No
> performance claim in this system has been measured. Do not use it to make
> patient-care decisions.

## Architecture

Two processes. The split is what makes the security properties real.

```
Browser (Vite, :3000)  ──proxy /api──▶  API server (Node, :4000)
  React UI                                  │
  session cookie (httpOnly)                 ├─ Supabase Auth + clinical tables
  NO patient names (encrypted server-side)  ├─ PHI encryption → AES-256-GCM
  NO model credential                       ├─ name blind index → HMAC-SHA256
                                            ├─ local audit_log (append-only, hash-chained)
                                            └─ Roboflow inference (credential never leaves)
```

The browser holds no patient name and no API key. It receives a patient record
only over an authenticated request, and that response is the decrypted value
rendered for the signed-in operator. In the previous client-only build both the
key and the patient record sat in `localStorage`, which meant the key was
extractable from devtools and the record was readable by any script on the
origin. Both are now server-side.

## Getting started

**Prerequisites:** Node.js 22.5 or newer (for the built-in `node:sqlite`).

Copy the environment template, generate a PHI key, and add your Supabase project
URL and keys to `.env`. Keep the service-role key only in this server-side file.
The template enables Supabase by default.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If you do not already have `.env`, copy the template with PowerShell:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Paste the generated value into `PHI_ENCRYPTION_KEY` in `.env`, then fill in
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the matching
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. In Supabase Auth URL settings,
allow `http://localhost:3000/` as a redirect URL.

```bash
npm install
npm run dev:all
```

- Web UI: <http://localhost:3000/>
- API: <http://localhost:4000/api>

For local email verification, keep `SUPABASE_AUTH_REDIRECT_URL=http://localhost:3000/`,
`CORS_ORIGINS=http://localhost:3000`, and
`SESSION_COOKIE_SAME_SITE=strict` in `.env`. The Vite server proxies `/api` to
the local API, so do not set `VITE_API_URL` locally.

### Deploying the web client to Vercel

Vercel hosts the Vite frontend; it does not run this Express API as part of the
static deployment. Deploy the Express API separately on a Node 22.5+ host with
persistent storage for its local audit database. Use `npm start` as its start
command; this uses the host's injected environment instead of requiring a
`.env` file. Set the following variables on the API host (replace the sample values):

```env
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-rotated-service-role-key
USE_SUPABASE_AUTH=true
USE_SUPABASE_DB=true
SUPABASE_AUTH_REDIRECT_URL=https://your-app.vercel.app/
CORS_ORIGINS=https://your-app.vercel.app
SESSION_COOKIE_SAME_SITE=none
PHI_ENCRYPTION_KEY=your-generated-32-byte-key
ROBOFLOW_API_KEY=your-server-only-inference-key
```

Set these variables in the Vercel project for **Production** and **Preview** as
needed, then redeploy:

```env
VITE_API_URL=https://your-api-host.example.com/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

In Supabase Auth URL settings, set the deployed site URL and allow both
`https://your-app.vercel.app/` and `http://localhost:3000/` as redirect URLs.
The API must allow the exact Vercel origin through `CORS_ORIGINS`. Production
cookies are `Secure` and `HttpOnly`; `SameSite=None` is required for separate
frontend/API origins. Prefer a custom frontend/API domain on the same site or
proxy `/api` through the frontend because some browsers block third-party
cookies. Redeploy Vercel after changing any `VITE_` variable.

### Supabase auth and database setup

To use Supabase for authentication and clinical data, set `SUPABASE_URL` to the
project root URL (for example, `https://project-ref.supabase.co`), plus
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `USE_SUPABASE_AUTH=true`, and
`USE_SUPABASE_DB=true` on the API host. The service-role key must never be put
in a `VITE_` variable or committed to source control. Set only
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend deployment.
The SDK also normalizes a mistakenly supplied `/rest/v1/` suffix. In Supabase
Auth settings, enable email confirmations and configure the confirmation email
redirect to `SUPABASE_AUTH_REDIRECT_URL`. Signup sends a verification email; any
verified email account can then sign in with the same access as every other user.

Run the complete `supabase/schema.sql` in the Supabase SQL editor. It enables
RLS on all app tables without public policies and installs a trigger that
creates a profile for each new Auth user. The API accesses clinical data with
the server-only service-role key. Re-run the schema after upgrading this app so
the role-free profile definition and trigger are applied.

Users create accounts from the sign-in screen with an email address and
password. No role selection, invitation, approval, or separate account setup is
required. The only signup step is verifying the email address.

For reliable cookie support, use a custom domain with the frontend and API on
the same site (such as `app.example.com` and `api.example.com`) or proxy `/api`
through the frontend origin. Some browsers block third-party cookies when the
Vercel and API hosts are unrelated sites.

When `USE_SUPABASE_AUTH=true`, all interactive sign-in uses a verified email
address. The legacy SQLite username bootstrap runs only when Supabase Auth is
disabled and is not part of the recommended local or deployed setup.

Health probes for a process supervisor: `GET /healthz` (process alive) and
`GET /readyz` (database reachable and migrations applied). Both are
unauthenticated. `SIGINT`/`SIGTERM` checkpoint the WAL and close the database
before exiting.

### Synthetic evaluation data

```bash
npm run seed              # 3 patients (stool + blood + urine each)
npm run seed -- --scale 10
npm run seed -- --reset   # delete existing synthetic rows, then reseed
```

Populates every table so the workflow can be reviewed with data present:
patients, specimens, analyses across all three workflow states, adjudicated and
unadjudicated detections, and reports in verified and released states. Records
are attributed to the bootstrapped technologist and verified by the supervisor,
so the two-person flow is exercisable with the default accounts.

Every generated name is prefixed `SYNTHETIC-` and the referring facilities are
invented, so a seeded record cannot be mistaken for a real accession.

The script refuses to run against a non-empty database without `--reset`,
refuses under `NODE_ENV=production`, and requires the same `PHI_ENCRYPTION_KEY`
the server uses. `--reset` deletes only rows whose patient number starts with
`SYN-`, so it cannot reach real records. It does **not** delete the audit log:
the immutability triggers forbid it, and the reset is recorded as a new entry
instead, which leaves the chain verifiable.

A synthetic cohort is not a validation set. Running this does not make the
software a medical device, and nothing it produces is clinical evidence.

For evaluation, point `DB_PATH` at a throwaway file so seeded rows never share
a database with real work:

```bash
$env:DB_PATH = "$env:TEMP\labsight-eval.db"

To run the processes separately:

```bash
npm run server   # API
npm run dev      # web, proxying /api to :4000
```

### Enabling inference

Analysis is **refused** with a clear error until the server has a credential.
It never falls back to invented detections.

```bash
# .env  (load with: node --env-file=.env server/main.js)
ROBOFLOW_API_KEY=<your key>
```

The server defaults to the `LABSIGHT vlabsight-1-yolo26m-t1 Logic` hosted
workflow. Set `ROBOFLOW_ENDPOINT` only to override that URL.
The API key is sent only in the `Authorization: Bearer` header. Do not put it
in the workflow URL or request body. Requests send the specimen image as a
base64 workflow input, use `ROBOFLOW_TIMEOUT_MS` for the per-attempt timeout,
and retry transient provider/network failures twice with backoff. Restart the
API server after changing `.env`. For local inference, start the Roboflow
inference server before overriding the endpoint to a local URL.

See `.env.example` for every setting.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev:all` | API server and web dev server together. |
| `npm run dev` | Web dev server only. |
| `npm run server` | API server only. |
| `npm run seed` | Load synthetic evaluation data. Refuses on a non-empty database. |
| `npm run build` | Production web build. |
| `npm run verify` | Typecheck, test, build. Run before committing. |
| `npm run test` | Vitest suite (client logic + server behaviour). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | Alias of `typecheck` — see the note at the bottom. |

### On Windows

`npm` resolves to `npm.ps1`, which your execution policy blocks. Either use
`npm.cmd` (works immediately, changes nothing) or allow scripts for your user
only:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## What is enforced server-side

These are not UI conventions. Each is checked against stored server state, so
calling the API directly does not bypass them.

| Control | Enforcement |
| --- | --- |
| Authentication | scrypt password hashing, httpOnly `SameSite=Strict` session cookie, 8-hour expiry, server-side session table storing only a token hash. |
| Authorization | All authenticated users have equal access. Supabase email verification is required to sign in. |
| Encryption at rest | Patient name, date of birth, and contact fields are AES-256-GCM encrypted with a 12-byte IV and a 16-byte auth tag per value, under a key derived from `PHI_ENCRYPTION_KEY`. Tampering is detected on read. The server refuses to start if that variable is missing. |
| Report gate | Generation returns 409 while any detection in the analysis is unadjudicated. |
| Report verification | Any authenticated user may verify a report, including its originating author. |
| Release | Any authenticated user can release a verified report. |
| Locking | A verified analysis rejects further detection edits (409). |
| Access auditing | Authenticated actions are written to the audit log. |
| Credential containment | The inference key is read from the server environment only. No endpoint returns it. A client-supplied key is ignored. |
| Rate limiting | Login is limited to 10 attempts per account and 60 per IP per 15 minutes. |
| Response hardening | Every response carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a CSP, and a per-request `X-Request-Id` that is also logged. |

### Encryption, and what it does not cover

`PHI_ENCRYPTION_KEY` is a 32-byte key, supplied as 64 hex characters. The
server runs a known-answer self-test at startup (`server/encryption.js`) and
refuses to start if the primitive does not round-trip.

Encrypted fields: `patients.full_name`, `patients.date_of_birth`,
`patients.contact_info`, `samples.external_reference`, `analyses.notes`, and
the free-text clinical notes carried on reports.

**Not** encrypted: patient number, specimen type, age, gender, detection
coordinates, and every audit column. An attacker with read access to the
database file still sees a listing of patient numbers, specimen types, and
results. This reduces casual exposure; it is not full-disk encryption and not a
substitute for it.

### Search over encrypted names

Because names are encrypted, the server cannot `LIKE '%smith%'`. Instead it
stores a keyed HMAC-SHA256 blind index of the normalised name, which supports
**exact** full-name matching with no plaintext. Patient-number search is a
normal escaped partial match. Partial-name search is therefore unsupported —
offering it would require decrypting every row per keystroke or building a
trigram index, which re-introduces the leakage this design removes. The search
placeholder in the UI says "exact full name" to make that limit explicit.

### Audit trail

`audit_log` is append-only in two independent ways:

1. Each row's `row_hash` is a SHA-256 over its own contents **and the previous
   row's hash**, so any edit or deletion breaks every hash after it.
2. SQLite `BEFORE UPDATE` / `BEFORE DELETE` triggers raise `ABORT` on that table.

`GET /api/audit/verify` recomputes the whole chain. The UI reports the result
of that check rather than claiming immutability.

This is tamper-*evident*. It is not, by itself, a 21 CFR Part 11 or ISO 15189
conformance claim — those need validated procedures and a qualified quality
system on top of the mechanism.

## Honest limitations

| Area | Status |
| --- | --- |
| Encryption at rest | AES-256-GCM on the highest-sensitivity text fields only (see above). Not full-disk encryption; identifiers and results remain in the clear. Use disk encryption appropriate to your threat model. |
| Transport security | Session cookies are `Secure` only when `NODE_ENV=production`. You must terminate TLS in front of the server. |
| Transport encryption of PHI | Slide images are base64 in a JSON body over that same connection. Without TLS they are in the clear. |
| Backup / disaster recovery | Not implemented. |
| Access review, retention, purge | Not implemented. Data erasure is a manual server-side operation. |
| Model validation | None. No accuracy, sensitivity, or specificity figure is displayed anywhere, because none has been measured. |
| Clinical thresholds | The significance bands in `quantification.js` are review heuristics, not validated criteria, and are not laboratory-specific. |
| DICOM export | Metadata preview only. Not a conformant Part 10 file; no pixel data. Cannot be imported into a PACS. |
| FHIR export | Structurally valid R4 with resolvable references, but no conformance profile or implementation guide has been validated. |
| Manual detections | Recorded in the client session only. The server does not yet accept technologist-added detections, so they do not survive a reload. This is stated in the UI when it happens. |
| Multi-tenancy | Single laboratory. No tenant isolation. |
| Database concurrency | SQLite in WAL mode, single-node. Fine for one lab; not a multi-replica deployment. |
| Key management | `PHI_ENCRYPTION_KEY` is read from the environment. There is no rotation path — changing it makes existing encrypted values unreadable. Plan rotation before production. |
| Server trust boundary | A database administrator with direct file access can read and rewrite the database. The audit chain is tamper-*evident* against ordinary edits, not against an owner of the file. |

### Still requiring action outside this repository

- **Revoke the previously exposed Roboflow key** `KbxdvrheHunair86c3fL` in the Roboflow dashboard. It is gone from the source, but deleting a file does not revoke a credential.
- **Delete any database file from a pre-encryption run** — it contains patient names, dates of birth, and password hashes in plaintext. Files written by the current version are partially encrypted, not fully.
- **Store `PHI_ENCRYPTION_KEY` in a secret manager, not in `.env` on disk.** Losing it makes every encrypted field permanently unreadable.
- **Terminate TLS** and set `NODE_ENV=production` before real use.
- **Change the three bootstrap passwords.** They are fixed in `.env` and
  documented above, so anyone who has read this repository knows them.

## Project layout

```
server/
  index.js        Express app: routes, workflow gates, RBAC wiring
  main.js         Entrypoint: encryption self-test, bootstrap, listen, shutdown
  db.js           Schema, versioned migrations, indexes, append-only triggers, WAL
  auth.js         Sessions, scrypt verification, authentication middleware, expiry sweep
  crypto.js       Password hashing, token generation, strength policy
  encryption.js   AES-256-GCM PHI crypto, tamper detection, HMAC blind index
  repository.js   All SQL: pagination, search, batching, server-side quantification
  operations.js   Structured logging, rate limits, request IDs, headers, health
  audit.js        Hash-chained append + chain verification
  inference.js    Roboflow proxy (holds the credential)
scripts/
  dev.js          Runs the API and the web dev server together
  seed.js         Synthetic evaluation data (opt-in, clearly labelled)
src/
  services/
    api.ts        Typed client for the API
    integration.ts FHIR / DICOM export, model presets
    roboflow.ts   Image loading (inference itself is server-side)
  store/labStore.tsx  Session + data state, talks to the API
  lib/
    quantification.js  Shared finding logic (.d.ts for the client)
  hooks/useFocusTrap.ts, useDebounced.ts
  components/auth/LoginScreen.tsx, ChangePasswordModal.tsx
  components/ui/States.tsx  Skeleton / empty / no-results / error / pagination
```

`src/lib/quantification.js` is deliberately plain JavaScript with a sibling
`.d.ts`: the client and the server must compute identical numbers, so the
implementation is shared rather than duplicated.

All SQL lives in `server/repository.js`. Routes never build queries inline.
That is why a page of analyses with its samples, detections, and reports
resolves in at most four `SELECT` statements — the earlier inline version
issued one query per analysis to load its detections.

## Testing

`npm test` runs 123 tests across four files.

- `server/server.test.js` (40) — password hashing, login and session expiry,
  tampered cookies, RBAC boundaries, audit chain tamper detection, report
  gates, verification by any signed-in user, detection locking, and that no
  endpoint or request path can extract the model credential.
- `server/operations.test.js` (44) — encryption round-trip and tamper
  detection, blind-index determinism, repository pagination clamping and
  search, per-patient specimen summaries, patient update, rate limiting,
  `/healthz` and `/readyz`, structured log shape, and security headers.
- `src/lib/quantification.test.ts` (21) — field-of-view arithmetic against the
  closed form, clinical gradings, quantity strings, rejected-detection
  exclusion, stable IDs, non-mutation, divide-by-zero safety.
- `src/services/integration.test.ts` (18) — FHIR structure and reference
  resolvability, UUID format, confirmed-vs-candidate counts, DICOM UID syntax
  and the 128-bit bound.

### Why `lint` is an alias for `typecheck`

ESLint is not wired up. `typescript-eslint` declares a peer range of
`typescript >=4.8.4 <6.1.0`, this project is on **TypeScript 7**, and
`@typescript-eslint/parser` refuses to load under TS 7
(`typescript-eslint does not support TS 7.0`). Installing it with
`--legacy-peer-deps` yields a parser that throws on startup. Once support lands
([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)),
add ESLint back and repoint the script.

## Removed from earlier builds

These were fabrications and are gone rather than hidden:

- A "Multimodal Pathological Diagnostic Consultation" button that waited 700 ms
  and printed canned diagnostic prose. Replaced by an **Adjudication Summary**
  that states only what a technologist actually confirmed.
- A hardcoded 7-day trend chart and fixed 42/28/18/12% organism frequencies.
  Both now derive from stored cases.
- `mAPScore` values presented as "Validation mAP@0.5". No validation was ever
  performed; the field is gone.
- Hardcoded `mAP: "96.8%"` / `"96.5%"` / `"91.8%"` figures on the dashboard
  pipeline panel, and the dashed "AI Boxes" overlay that drew labelled
  detection rectangles over a stock stock photograph. The image is now labelled
  as a reference photograph with no detections, and the panel says the software
  has no accuracy figure.
- A dead `INITIAL_PATIENTS` / `INITIAL_SAMPLES` / `INITIAL_ANALYSES` /
  `INITIAL_REPORTS` / `INITIAL_AUDIT_LOGS` block and a `LAB_USERS` operator
  switcher in `src/lib/constants.ts` — invented patients, invented clinicians,
  and a technologist note claiming "10 validated high-power fields". Nothing
  imported them; they are deleted rather than left to mislead a reader.
- Three model presets pointing at workspaces that do not exist. The blood and
  urine pipeline panels now say no endpoint is configured instead of naming a
  model.
- Accreditation, Part 11, and audit-immutability claims, and an operator
  dropdown that let anyone assume any identity.
- A "Model Leaderboard" comparing three Roboflow workspaces. Only
  `labsight-yolo26m-workflow` is configured; the unavailable presets are
  documented rather than shown as if selectable.
