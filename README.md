# Enterprise DMS - web frontend

Next.js (App Router) + TypeScript web client for the Enterprise Document Management System. It is an
independent repository; the FastAPI backend lives in `enterprise-dms-backend` and is only ever consumed
through its OpenAPI contract (`openapi/openapi.json`).

- One canonical folder tree per organization, stable document ids, immutable versions.
- Sharing grants access to the **original** item only. Breadcrumbs on shared items are display context:
  segments are links only when the API says `navigable: true`.
- Files are malware-scanned asynchronously; the UI shows "Scanning…" and never offers download until a
  document is `available`.

Includes search (names + contents), metadata, retention/legal holds, approval workflows, e-signature, directory
provisioning, reports and notification preferences. Status of every feature (implemented / tested / not
available) is in
[`docs/feature-status.md`](docs/feature-status.md).

## Prerequisites

- Node 22+ (developed on Node 24) and npm 10+ (`npm ci` uses the committed lockfile).
- For local development and E2E: the backend dev stack (embedded PostgreSQL + API + worker, no external
  services). See below.
- Chromium for Playwright: `npx playwright install chromium`.

## Local setup

```bash
# 1. Start the backend (Windows; creates and seeds Acme Corp (dev) on first start, ~30s)
cd ../enterprise-dms-backend
.venv\Scripts\python.exe scripts\dev_stack.py        # API on http://localhost:8000
curl http://localhost:8000/health/ready              # {"status":"ready"}

# 2. Start the frontend
cd ../enterprise-dms-frontend
npm ci
cp .env.example .env.local                           # NEXT_PUBLIC_AUTH_MODE=dev for local work
npm run dev                                          # http://localhost:3000
```

The backend only CORS-allows `http://localhost:3000`, so run the dev server on port 3000. If something else
already owns that port, use the same-origin proxy instead (no CORS involved):

```bash
API_PROXY_TARGET=http://localhost:8000 NEXT_PUBLIC_API_BASE_URL=http://localhost:3100/api/v1 npx next dev -p 3100
```

Seeded users (sign in with the **Development sign-in** panel): alice (owner/admin), bob (member,
Engineering), carol (member, Finance), dave (auditor).

## Scripts

| Script              | What it does                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`       | Next dev server on :3000                                                                   |
| `npm run build`     | Production build (standalone output). Refuses `NEXT_PUBLIC_AUTH_MODE=dev`                  |
| `npm run lint`      | ESLint (next + typescript + jsx-a11y)                                                      |
| `npm run typecheck` | `tsc --noEmit` (strict)                                                                    |
| `npm run test`      | Vitest + React Testing Library (unit + component, msw for HTTP)                            |
| `npm run e2e`       | Playwright against the **real** backend on :8000 (starts `next dev` on :3100 itself)       |
| `npm run api:types` | Regenerate `src/lib/api-client/schema.d.ts` from `openapi/openapi.json`                    |
| `npm run api:check` | Fail if the committed types differ from a fresh generation (CI drift check)                |
| `npm run api:sync`  | Copy the spec from `$DMS_BACKEND_DIR` (default `../enterprise-dms-backend`) and regenerate |
| `npm run format`    | Prettier                                                                                   |

## Structure

```
openapi/openapi.json          pinned backend contract snapshot
src/app/                      thin route files ((auth)/login, (dashboard)/..., admin/...)
src/components/{ui,layout,navigation,file-browser,file-preview,upload,sharing,admin}
src/features/{auth,organizations,files,upload,sharing,search,notifications,admin,dashboard}
src/lib/api-client/           typed client, errors, pagination, upload helper, generated schema.d.ts
src/styles/globals.css        design tokens (CSS variables), light + dark
tests/{unit,components,e2e}
docs/                         architecture, api-client, authentication, testing, deployment, feature-status
```

## Auth modes (`NEXT_PUBLIC_AUTH_MODE`)

- `dev` - local only. The login page shows a clearly marked Development sign-in panel which calls the
  backend's `POST /api/v1/dev/token`. A production build with this mode **fails at config load**
  (`next.config.ts`) and the module throws at runtime as a second guard.
- `supabase` - email + password via `@supabase/supabase-js`, token refresh, password-reset email. Uses only
  the public/publishable key. **This mode is unit-tested against a mocked client and has NOT been tested
  against a live Supabase project.**

Details: [`docs/authentication.md`](docs/authentication.md).

## Testing

```bash
npm run lint && npm run typecheck && npm run test
npm run e2e        # needs the backend dev stack on :8000
```

The optional live e-signature spec runs only with `RUN_LIVE_SIGNING=1 npm run e2e -- tests/e2e/signing-live.spec.ts`
(real hosted provider through the backend; can take ~60 s to wake). Everything else runs offline. The PDF preview
test uses real Chrome (`npx playwright install chrome`).

The malware scanner in the backend's dev stack flags any upload containing the text
`DMS-TEST-INFECTED-FILE-SIGNATURE`; the quarantine E2E uses that marker (never the real EICAR string, which
antivirus software deletes). See [`docs/testing.md`](docs/testing.md).

## Build and deploy

```bash
NEXT_PUBLIC_AUTH_MODE=supabase NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 \
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable> \
npm run build && node .next/standalone/server.js
```

A multi-stage `Dockerfile` (standalone output, non-root user) is provided; see
[`docs/deployment.md`](docs/deployment.md). `NEXT_PUBLIC_*` values are compiled into the bundle - they must
never contain secrets.

## Troubleshooting

| Symptom                                                 | Cause / fix                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Login page shows another app / "Pinnacle TPA"           | Something else owns :3000. Use the proxy command above on another port.                           |
| Browser console: CORS error to `localhost:8000`         | App is not on `http://localhost:3000`. Use the proxy, or add the origin to the backend CORS list. |
| "The development token endpoint is not available"       | Backend not running with `AUTH_PROVIDER=local`, or not started.                                   |
| Build fails: `NEXT_PUBLIC_AUTH_MODE=dev is not allowed` | Intended. Use `supabase` for production builds.                                                   |
| PDF preview frame is blank/"sad page"                   | The backend must list your app origin in its `FRAME_ANCESTORS` setting.                           |
| Everything 401s after the backend restarts              | Dev tokens are re-minted on reload; sign in again if the user changed.                            |
| `api:check` fails in CI                                 | Backend contract changed: run `npm run api:sync`, review the diff, commit.                        |
