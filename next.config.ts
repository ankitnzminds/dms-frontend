import type { NextConfig } from 'next';

const authMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? 'dev';
const isProd = process.env.NODE_ENV === 'production';

// Hard guard: the development sign-in must never ship in a production build.
// There is deliberately no escape hatch; E2E runs against `next dev`.
if (isProd && authMode === 'dev') {
  throw new Error(
    'NEXT_PUBLIC_AUTH_MODE=dev is not allowed in a production build. Use NEXT_PUBLIC_AUTH_MODE=supabase.',
  );
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const apiOrigin = new URL(apiBase).origin;
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : '';

// Optional same-origin proxy (server-side env, never exposed to the browser). Handy when the API does not
// CORS-allow the origin the app runs on (e.g. another app already owns :3000), and for single-origin deployments.
const proxyTarget = process.env.API_PROXY_TARGET?.replace(/[/]+$/, '');
// Download/preview links returned by the API are absolute URLs on the real backend origin.
const backendOrigin = proxyTarget ? new URL(proxyTarget).origin : apiOrigin;

// Where the e-signature provider's signing page may be framed from (the provider URL is issued by the backend
// at runtime and is deliberately not hard-coded here). Default: any https origin; narrow it per deployment,
// e.g. SIGNING_FRAME_SRC="https://sign.example.com".
const signingFrameSrc = process.env.SIGNING_FRAME_SRC ?? 'https:';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin} ${backendOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${supabaseOrigin}${isProd ? '' : ' ws:'}`.trim(),
  `frame-src ${apiOrigin} ${backendOrigin} ${signingFrameSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return proxyTarget
      ? [{ source: '/api/v1/:path*', destination: `${proxyTarget}/api/v1/:path*` }]
      : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
