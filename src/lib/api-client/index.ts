import { apiRoot } from '../config';
import { createApiClient, unwrap } from './client';
import type { ApiError } from './errors';

export * from './errors';
export * from './pagination';
export * from './types';
export { createApiClient, unwrap } from './client';
export { putBytes, resolveUploadUrl, sha256Hex, MAX_UPLOAD_BYTES } from './upload';

/**
 * Process-wide runtime hooks. The auth layer registers real implementations at startup
 * (see features/auth/session.tsx); tests may register their own.
 */
export interface ApiRuntime {
  getAccessToken: () => Promise<string | null>;
  getOrganizationId: () => string | null;
  refreshSession: () => Promise<string | null>;
  onSessionExpired: () => void;
  onRateLimited: (e: ApiError) => void;
}

const runtime: ApiRuntime = {
  getAccessToken: async () => null,
  getOrganizationId: () => null,
  refreshSession: async () => null,
  onSessionExpired: () => {},
  onRateLimited: () => {},
};

export function configureApiRuntime(partial: Partial<ApiRuntime>) {
  Object.assign(runtime, partial);
}

export const api = createApiClient({
  baseUrl: apiRoot,
  getAccessToken: () => runtime.getAccessToken(),
  getOrganizationId: () => runtime.getOrganizationId(),
  refreshSession: () => runtime.refreshSession(),
  onSessionExpired: () => runtime.onSessionExpired(),
  onRateLimited: (e) => runtime.onRateLimited(e),
});

/** Headers for requests made outside the typed client (raw uploads). */
export async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  const t = await runtime.getAccessToken();
  if (t) h.Authorization = `Bearer ${t}`;
  const org = runtime.getOrganizationId();
  if (org) h['X-Organization-Id'] = org;
  return h;
}

export { apiRoot };
export const call = unwrap;
