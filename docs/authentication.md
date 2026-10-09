# Authentication

The DMS API only needs a bearer JWT. The frontend isolates _where the token comes from_ behind
`features/auth/providers/types.ts`:

```ts
interface AuthProvider {
  id: string;
  getAccessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  signIn(credentials): Promise<void>;
  signOut(): Promise<void>;
  onChange(listener: (signedIn: boolean) => void): () => void;
  requestPasswordReset?(email: string): Promise<void>;
}
```

Add OIDC/SAML SSO by implementing the interface and selecting it in `providers/index.ts`.

## `dev` mode (local only)

- `NEXT_PUBLIC_AUTH_MODE=dev`; the login page shows a **Development sign-in** panel (alice, bob, carol,
  dave) calling `POST {API}/dev/token`.
- The token is kept **in memory only**; the e-mail (not a secret) is remembered in `sessionStorage` so a
  reload can mint a new token. `refresh()` simply mints another token.
- **Cannot be enabled in production**: `next.config.ts` throws when `NODE_ENV=production` and the mode is
  `dev` (verified: `NEXT_PUBLIC_AUTH_MODE=dev npm run build` fails), `src/lib/config.ts` throws at module
  load, and `DevAuthProvider`'s constructor refuses to run in production. There is no override flag; E2E
  runs against `next dev`.

## `supabase` mode (production path)

- Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (**publishable key only**; a
  service-role key or DB password must never be placed in this repo or any `NEXT_PUBLIC_*` variable).
- `@supabase/supabase-js` owns session persistence and auto-refresh; the app does not store tokens itself.
  The session's `access_token` is sent to the DMS API as the Bearer token. Email + password sign-in,
  sign-out and "forgot password" (reset email redirecting to `/login`) are implemented.
- If the variables are missing the login page shows a configuration error instead of crashing.
- **Not tested against a live Supabase project** (no credentials were available). Covered by unit tests
  against a mocked client (`tests/unit/auth-providers.test.ts`): token read, refresh, sign-in error mapping,
  sign-out, subscription/unsubscribe, password reset. The password-reset _landing_ flow (setting a new
  password after following the e-mail link) is not implemented; the link returns to `/login`.

## Session handling in the app

- `SessionProvider` -> `useMe()` (`GET /me`) -> `AppShell` gate. Signed-out users are redirected to
  `/login?next=...` (`next` is validated to be a same-origin path).
- 401 from the API: one refresh attempt, then sign-out and redirect (see `api-client.md`).
- Account problems map from `error.code` to dedicated screens: `not_provisioned`, `no_membership`,
  `account_inactive`, `organization_required`, `session_revoked`.
- Pending invitations (`pending_invitations` on `/me`) show an Accept banner
  (`POST /me/invitations/{organization_id}/accept`).
- Users with several active memberships get an organization switcher; the id is sent as
  `X-Organization-Id`.
- Roles: owner/admin see the admin portal; auditor sees only the audit log; members see neither. This is
  UI-only - the API enforces authorization.
