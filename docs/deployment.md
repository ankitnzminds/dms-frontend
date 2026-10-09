# Build and deployment

## Production build

`NEXT_PUBLIC_*` variables are inlined at build time. The build **fails** with `NEXT_PUBLIC_AUTH_MODE=dev`.

```bash
NEXT_PUBLIC_AUTH_MODE=supabase \
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 \
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
npm run build
node .next/standalone/server.js     # needs .next/static and public/ copied next to it (the Dockerfile does this)
```

Verified locally: `npm run build` succeeds (25 routes) and the standalone server starts and serves
`/login` with the security headers below.

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
  -t enterprise-dms-frontend .
docker run -p 3000:3000 enterprise-dms-frontend
```

Multi-stage (`deps` -> `build` -> `runtime`), Next standalone output, runs as the non-root `nextjs` user,
has a healthcheck on `/login`. **The Dockerfile was written but not built here: the Docker daemon was not
running on the development machine.** The CI `docker` job builds it.

## Security headers (set in `next.config.ts`)

CSP (`default-src 'self'`; `connect-src` = self + API origin + Supabase origin; `frame-src`/`img-src`
include the API origin for previews; `object-src 'none'`; `frame-ancestors 'none'`), `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. `script-src` keeps `'unsafe-inline'`
(Next hydration scripts and the theme-init script, no nonces yet) and `'unsafe-eval'` only in development.

## Backend requirements for a real deployment

- CORS must allow the frontend origin, and the API's inline-preview CSP `frame-ancestors` must include it
  (otherwise the PDF iframe is blocked; the "open in new tab" link still works). The backend now takes this
  from its `FRAME_ANCESTORS` setting; verified in-app for `http://localhost:3100`.
- The e-signature provider's signing page is framed in a full-screen overlay. The provider URL is issued by the
  backend at runtime and is not hard-coded here, so `frame-src` also allows the origins in `SIGNING_FRAME_SRC`
  (server env read by `next.config.ts`; default `https:`). Narrow it per deployment, e.g.
  `SIGNING_FRAME_SRC=https://sign.example.com`.
- The access token must be a JWT the backend trusts (Supabase JWT in production).

## Optional same-origin proxy

Setting `API_PROXY_TARGET=https://backend.internal` (server-side env, runtime for `next start`/dev, build
time for standalone) adds a rewrite `/api/v1/*` -> backend. Then set `NEXT_PUBLIC_API_BASE_URL` to the
frontend's own origin + `/api/v1`. Useful when CORS cannot be configured, and used by the E2E suite.
Large uploads through the Next proxy are subject to Next's proxy body limits; prefer a real reverse proxy
for production.

## CI (`.github/workflows/ci.yml`)

`verify` (lint, typecheck, unit tests, `api:check`, build, `npm audit --omit=dev`), `docker` (image build),
and `e2e`, which checks out the backend repository and starts its dev stack. **The e2e job requires
configuration** (repository variable `BACKEND_REPO`, optional `BACKEND_REF`, secret `BACKEND_REPO_TOKEN`
for private repos) and the backend install/start steps are untested; it is skipped until configured.
