# Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js App Router pages<br/>thin route files] --> F[features/*<br/>query hooks, schemas, forms]
    F --> C[components/*<br/>shadcn-style UI, file browser, sharing, upload]
    F --> API[lib/api-client<br/>openapi-fetch + ApiError + retry/401/429]
    UP[upload engine<br/>hash -> initiate -> PUT(XHR) -> finalize] --> API
    AUTH[AuthProvider interface<br/>dev | supabase | future SSO] --> API
    RQ[(TanStack Query cache)] --- F
  end
  API -->|Bearer JWT + X-Organization-Id| BE[(DMS FastAPI /api/v1)]
  BE --> ST[(private storage)]
  W[malware-scan worker] --> ST
  BE <--> W
  UI -. GET short-lived URL, no auth header .-> DL[/api/v1/downloads/token/]
```

## Principles

1. **The backend is the authority.** The UI reads `permissions` arrays on folders, documents and tree items
   and uses them only to enable/disable controls (`features/files/availability.ts` is the single source of
   truth for row actions). A disabled control always has a reason (tooltip, also keyboard reachable).
2. **404 means "does not exist or you may not see it".** Both render the same neutral state
   (`NotFoundState`); 403 on read views is rendered the same way.
3. **Breadcrumbs are display context.** `PathTrail` renders a link only for `navigable && folder_id`.
   Non-navigable segments are plain text with a lock glyph and screen-reader text.
4. **No fake data.** Dashboards use `/organization/usage`, `/recent`, `/shares/received`,
   `/notifications`, `/admin/audit-events`. Unimplemented backend areas are "Not available yet" pages with
   no controls.
5. **Contract-first types.** `src/lib/api-client/schema.d.ts` is generated from `openapi/openapi.json`;
   `types.ts` only aliases generated types. `npm run api:check` guards drift.

## Layers

| Layer                | Responsibility                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/app`            | Route files only; `(dashboard)` and `admin` layouts mount `AppShell` (session guard, nav, topbar).   |
| `src/features`       | Query/mutation hooks per domain, Zod schemas, view components with logic (dashboard, search, admin). |
| `src/components`     | Presentational + interaction components, no endpoint knowledge except via feature hooks.             |
| `src/lib/api-client` | HTTP boundary: headers, error normalisation, retries, 401 refresh, upload, pagination helpers.       |
| `features/auth`      | Provider interface, session context, `/me` query, account-problem pages.                             |

## Data flow notes

- **Session**: `SessionProvider` asks the `AuthProvider` for a token, registers runtime hooks with the API
  client (`configureApiRuntime`) and loads `GET /me`. The active organization id is a UI preference stored
  in `localStorage` (not a secret) and sent as `X-Organization-Id`; switching orgs clears the query cache.
- **Polling**: queries use `refetchInterval` (2.5 s) only while a visible item is `processing` or a version
  scan is `pending`; the notification bell polls every 30 s; focus refetch is on. There is no real-time
  channel.
- **Uploads** live in a framework-free `UploadEngine` (queue, concurrency 2, cancel/retry, name-conflict
  rename, stale_version reload) so uploads continue while navigating. The floating `UploadPanel` is an
  `aria-live` region.
- **Downloads/previews** request a fresh URL right before use (`download-url`), never cached
  (`gcTime: 0`), and open it as a plain navigation/`<img>`/`<iframe>` (no Authorization header needed).
- **Optimistic concurrency**: rename/move/classification fetch the entity first and send
  `expected_row_version`; `stale_version` offers Reload.
