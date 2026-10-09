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

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${supabaseOrigin}${isProd ? '' : ' ws:'}`.trim(),
  `frame-src ${apiOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
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
