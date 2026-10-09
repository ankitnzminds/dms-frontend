/**
 * Runtime configuration. Only NEXT_PUBLIC_* values are read (they are inlined at build time).
 * Never add privileged secrets here.
 */
export type AuthMode = 'dev' | 'supabase';

const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const rawMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? 'dev';

export const authMode: AuthMode = rawMode === 'supabase' ? 'supabase' : 'dev';

/** API base INCLUDING the /api/v1 prefix, without trailing slash. */
export const apiBaseUrl = rawBase.replace(/\/+$/, '');

/**
 * The generated paths already start with /api/v1, so the HTTP client is rooted at the API origin.
 * If the configured base has some other path prefix we keep it (reverse-proxy setups).
 */
export const apiRoot = apiBaseUrl.replace(/\/api\/v1$/, '');

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
};

if (process.env.NODE_ENV === 'production' && authMode === 'dev') {
  // Defence in depth: next.config.ts already fails the build.
  throw new Error('Development sign-in cannot be enabled in a production build.');
}
