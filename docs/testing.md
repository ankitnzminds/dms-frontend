# Testing

| Layer     | Tooling                              | Location           | Command        |
| --------- | ------------------------------------ | ------------------ | -------------- |
| Unit      | Vitest                               | `tests/unit`       | `npm run test` |
| Component | Vitest + React Testing Library + msw | `tests/components` | `npm run test` |
| E2E       | Playwright (Chromium) + axe-core     | `tests/e2e`        | `npm run e2e`  |

## Unit / component

- `api-client.test.ts` - header injection, error parsing, 422 field errors, GET-only retries (503, network
  error, retry budget), writes never retried, 401 refresh-once-and-replay (incl. body replay), sign-out
  without refresh loops, 429 + Retry-After, abort.
- `auth-providers.test.ts` - dev provider (refuses production, in-memory token, re-mint, sign-out) and
  Supabase provider against a **mocked** client.
- `upload-engine.test.ts` - progress, sha256 + Idempotency-Key, name_conflict rename-retry, quota_exceeded,
  > 100 MB guard, cancel, concurrency, stale_version retry.
- `logic.test.ts`, `errors.test.ts` - share form schema/request builder, permission-driven action
  availability, formatting, pagination, notification links, audit CSV, friendly messages.
- Components: `path-trail` (navigable vs plain text), `items-table` (loading/empty/error/forbidden, sort,
  selection, permission-gated and keyboard-reachable row menus), `share-dialog` (validation,
  unknown_recipient, success only after API), `received-share-row` (active/expired/revoked),
  `upload-panel` (progress, conflict, quota, blocked type, cancel), `confirm-dialog`, `bulk-delete`,
  state components.
- HTTP in component tests is mocked with msw (`tests/msw-server.ts`); unhandled requests fail the test.

## E2E (real backend)

Prerequisites: backend dev stack on `http://localhost:8000`
(`cd ../enterprise-dms-backend && .venv\Scripts\python.exe scripts\dev_stack.py`).

`playwright.config.ts` starts `next dev` on **port 3100** with `API_PROXY_TARGET` pointing at the backend, so
the suite does not depend on port 3000 being free or on CORS. `reuseExistingServer` is off on purpose (a
different app on a reused port would silently be tested). Override with `E2E_PORT` / `E2E_BACKEND_URL`.
Names are suffixed with a per-run id (`E2E_RUN_ID`) so repeated runs against the same dev database do not
collide.

Specs:

- `share-flow.spec.ts` - the mandatory scenario with real clicks: sign in as alice; create `dir1 > dirB`;
  upload a `%PDF-1.4` file; wait for scanning -> available; upload a new version (v2 clean/current); share
  with bob (view + download, 30 days); as bob (separate browser context) see it in Shared with Me with the
  breadcrumb `Organization Files > dir1 > dirB` where `dir1`/`dirB` are plain text (the org root is
  separately authorized for every member, so the API marks it navigable and it is a link); direct URLs to
  dir1/dirB give the neutral not-found state; bob downloads and the saved bytes/filename are asserted;
  alice revokes; bob no longer sees it, sees "Access revoked" when inactive are shown, cannot open it, and
  the API refuses a download URL; alice's audit log shows `share.created`, `share.revoked`,
  `document.downloaded`.
- `quarantine.spec.ts` - uploads a file containing `DMS-TEST-INFECTED-FILE-SIGNATURE` (the backend dev/test
  scanner marker; the real EICAR string is deliberately not used because antivirus deletes it), sees
  `quarantined`, download is disabled, admin Quarantine lists it.
- `file-management.spec.ts` - folder conflicts/validation, rename, star/unstar, copy, move (folder picker),
  search with breadcrumb, trash + restore, restore name-conflict dialog, bulk delete with per-item summary,
  inline image preview.
- `admin-and-shell.spec.ts` - invite/suspend/reactivate, self-modification guard, groups CRUD + members,
  settings validation/save, Storage and Not-available pages, audit filters, auditor/member role gating,
  theme persistence, notifications, global search, phone-width drawer (no horizontal overflow),
  unauthenticated redirect.
- `a11y.spec.ts` - axe-core WCAG 2.0/2.1 A+AA on login, dashboard, files, shared-by-me, admin users, audit,
  not-available, in light and dark themes (0 violations).

## Not covered / limits

- Supabase mode is not exercised against a live project.
- PDF rendering inside the preview `<iframe>` was not verified in-app: the backend's `frame-ancestors`
  allows only `http://localhost:3000`, which could not be used (port occupied by another app). Chrome does
  render the same inline URL when opened top-level.
- Only Chromium is run. No visual-regression or screen-reader testing; axe is automated only.
- Multi-organization switching and pending-invitation acceptance are implemented but not E2E-tested (the
  seed data has a single organization).

Additional spec: `access-and-conflicts.spec.ts` - Manage access (broad-grant acknowledgement, grant,
revoke), `stale_version` on rename -> Reload -> success (the entity is changed through the API while the
dialog is open), and the share dialog's `unknown_recipient` explanation.

Run history for this document (Windows 11, Node 24, backend dev stack): `npm run test` 94 passed;
`npm run e2e` 22 passed (19 earlier suites + 3 in this spec).
