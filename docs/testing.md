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

Phase 2 specs (all offline except the optional live one):

- `governance.spec.ts` - legal hold created and populated through the search picker; document page shows the
  hold badge and Delete is disabled with the reason; release requires a reason; delete forever is blocked by
  a legal hold (409) and by a retention policy (409 with the end date) and works once removed; auditors see
  Governance read-only.
- `metadata-and-search.spec.ts` - admin creates typed fields (key validation, required), the document form
  validates and saves, `meta=key:value` search filter, archive; content search finds a word inside an
  uploaded .txt (waits for text extraction), shows the "Content match" badge and a `<mark>`-highlighted
  snippet with markup in the file rendered as inert text, `scope=name` excludes it; thumbnails use the
  thumbnail download variant.
- `approvals.spec.ts` - workflow builder (validation, member-lookup reviewer, rule, due days), alice submits a
  document, bob (second browser context) sees the task (links only to the document, never a folder),
  receives a notification linking to /approvals, approves; alice sees the outcome; delegation to carol,
  rejection, resubmit; plain members can use the member lookup in the share dialog and see the share policy
  hints.
- `directory-and-reports.spec.ts` - static directory source: secret-reference validation, invalid then valid
  snapshot upload, dry-run sync polled to completion (and verified to change nothing), delete; notification
  preferences persist; audit CSV export downloads a real file and is itself audited; reports page (admin and
  auditor, not member); dashboard hides admin-only counters from members.
- `pdf-preview.spec.ts` - uses real Chrome (`channel: 'chrome'`; the bundled headless shell has no PDF
  viewer): the inline PDF preview is framed by the app, the framed response is 200 application/pdf with no
  `X-Frame-Options` and no CSP framing error. A screenshot showed the PDF rendered inside the iframe.
- `signing-live.spec.ts` - **optional, skipped unless `RUN_LIVE_SIGNING=1`**. Uses the real signing provider
  wired into the backend dev stack (a hosted Documenso on a free instance that can take ~60 s to wake). Steps:
  admin enables e-signatures in Settings; alice requests a signature from bob on a PDF; bob signs inside the
  full-screen overlay; "I've finished signing" refreshes status until `completed`; the signed artifact links
  to a new document version; cleanup turns e-signatures off again. No provider URL or token exists in this
  repo. When run on 2026-10-09 it passed (3/3, ~40 s).

Unit/component additions: snippet rendering safety (HTML payloads stay inert), signing-link secrecy (never
rendered as text, not in storage, query cache, mutation cache or console), metadata form logic and component,
directory snapshot validation and secret-reference rules, workflow builder logic, purge error mapping, null
admin counters, notification deep links by type, member picker, preferences, read-only governance for auditors,
reports helpers.

## Not covered / limits

- Supabase mode is not exercised against a live project.
- The signing round trip depends on a hosted provider and therefore only runs when explicitly enabled.
- Only Chromium (plus real Chrome for the PDF test) is run. No visual-regression or screen-reader testing; axe
  is automated only.
- Multi-organization switching and pending-invitation acceptance are implemented but not E2E-tested (the
  seed data has a single organization).
- Non-dry-run directory syncs, Entra/LDAP sources (forms validated, never connected), and the e-mail channel of
  notification preferences (the backend reports `email_available: false`) are not exercised.

Run history (Windows 11, Node 24, backend dev stack): `npm run test` 129 passed (17 files);
`npm run e2e` 40 passed, 3 skipped (the optional live spec).
