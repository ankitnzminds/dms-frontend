import createClient from 'openapi-fetch';
import { ApiError, apiErrorFromResponse } from './errors';
import type { paths } from './schema';

export interface ApiClientConfig {
  /** Origin (+ optional prefix) the generated /api/v1/... paths are appended to. */
  baseUrl: string;
  getAccessToken: () => Promise<string | null> | string | null;
  getOrganizationId: () => string | null;
  /** Try to obtain a fresh token. Return null if impossible. Called at most once per request. */
  refreshSession?: () => Promise<string | null>;
  /** Called when the session cannot be recovered (after a failed refresh). */
  onSessionExpired?: () => void;
  onRateLimited?: (err: ApiError) => void;
  fetchImpl?: typeof fetch;
  /** Idempotent-GET retry tuning (tests set delay 0). */
  maxRetries?: number;
  retryDelayMs?: number;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });
}

function abortError() {
  return new ApiError({ status: 0, code: 'aborted', message: 'Request cancelled' });
}

/**
 * Creates a typed client (openapi-fetch over the generated `paths`) whose fetch layer:
 *  - adds Authorization + X-Organization-Id,
 *  - retries ONLY idempotent GETs on network errors / 502 / 503 / 504,
 *  - on 401 refreshes the session once and replays, otherwise signals session expiry,
 *  - surfaces 429 via a callback, and
 *  - throws a standardised ApiError for every non-2xx response.
 */
export function createApiClient(cfg: ApiClientConfig) {
  const doFetch = cfg.fetchImpl ?? ((input: Request) => fetch(input));
  const maxRetries = cfg.maxRetries ?? 2;
  const retryDelay = cfg.retryDelayMs ?? 400;

  async function withAuth(req: Request, tokenOverride?: string | null): Promise<Request> {
    const headers = new Headers(req.headers);
    const token = tokenOverride ?? (await cfg.getAccessToken());
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const org = cfg.getOrganizationId();
    if (org) headers.set('X-Organization-Id', org);
    return new Request(req, { headers });
  }

  async function send(req: Request): Promise<Response> {
    const idempotent = req.method === 'GET' || req.method === 'HEAD';
    let attempt = 0;
    for (;;) {
      const replay = req.clone();
      try {
        const res = await doFetch(req);
        if (idempotent && RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          attempt++;
          await sleep(retryDelay * 2 ** (attempt - 1), req.signal);
          req = replay;
          continue;
        }
        return res;
      } catch (e) {
        if (req.signal?.aborted || (e as Error)?.name === 'AbortError') throw abortError();
        if (idempotent && attempt < maxRetries) {
          attempt++;
          await sleep(retryDelay * 2 ** (attempt - 1), req.signal);
          req = replay;
          continue;
        }
        throw new ApiError({
          status: 0,
          code: 'network_error',
          message: 'Cannot reach the server.',
        });
      }
    }
  }

  const customFetch = async (input: Request): Promise<Response> => {
    const pristine = input.clone(); // body-bearing requests may need replaying after refresh
    let res = await send(await withAuth(input));

    if (res.status === 401 && cfg.refreshSession) {
      let fresh: string | null = null;
      try {
        fresh = await cfg.refreshSession();
      } catch {
        fresh = null;
      }
      if (fresh) {
        res = await send(await withAuth(pristine, fresh));
      }
      if (res.status === 401) {
        cfg.onSessionExpired?.();
      }
    }

    if (res.ok) return res;
    const err = await apiErrorFromResponse(res);
    if (err.status === 429) cfg.onRateLimited?.(err);
    throw err;
  };

  return createClient<paths>({ baseUrl: cfg.baseUrl, fetch: customFetch });
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Unwrap an openapi-fetch result (errors are thrown by the fetch layer already). */
export async function unwrap<T>(p: Promise<{ data?: T }>): Promise<T> {
  const r = await p;
  return r.data as T;
}
