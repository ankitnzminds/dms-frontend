import { describe, expect, it, vi } from 'vitest';
import { createApiClient, unwrap } from '@/lib/api-client/client';
import { ApiError, apiErrorFromResponse, friendlyMessage } from '@/lib/api-client/errors';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const ME = { user_id: 'u1', email: 'a@b.c' };

function setup(
  responses: Array<Response | Error>,
  over: Partial<Parameters<typeof createApiClient>[0]> = {},
) {
  const calls: Request[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (req: Request) => {
    calls.push(req.clone());
    const next = queue.shift();
    if (!next) throw new Error('no more mocked responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const client = createApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => 'tok-1',
    getOrganizationId: () => 'org-1',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    retryDelayMs: 0,
    ...over,
  });
  return { client, calls, fetchImpl };
}

describe('api client: headers and paths', () => {
  it('sends Authorization and X-Organization-Id and keeps the /api/v1 prefix from the spec path', async () => {
    const { client, calls } = setup([json(200, ME)]);
    const data = await unwrap(client.GET('/api/v1/me'));
    expect(data).toEqual(ME);
    expect(calls[0]!.url).toBe('http://api.test/api/v1/me');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok-1');
    expect(calls[0]!.headers.get('x-organization-id')).toBe('org-1');
  });

  it('omits the org header when none is known', async () => {
    const { client, calls } = setup([json(200, ME)], { getOrganizationId: () => null });
    await client.GET('/api/v1/me');
    expect(calls[0]!.headers.has('x-organization-id')).toBe(false);
  });
});

describe('api client: error parsing', () => {
  it('turns the backend error body into an ApiError', async () => {
    const { client } = setup([
      json(409, {
        error: {
          code: 'name_conflict',
          message: 'Name taken',
          request_id: 'req-9',
          details: { x: 1 },
        },
      }),
    ]);
    const err = await client
      .POST('/api/v1/folders', { body: { name: 'a', parent_folder_id: 'p' } })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: 'name_conflict',
      message: 'Name taken',
      requestId: 'req-9',
      details: { x: 1 },
    });
    expect(err.isConflict).toBe(true);
  });

  it('exposes 422 field errors keyed by the last loc segment', async () => {
    const res = json(422, {
      error: {
        code: 'validation_error',
        message: 'bad',
        request_id: 'r',
        details: [
          { loc: ['body', 'name'], msg: 'too short' },
          { loc: ['body', 'expires_at'], msg: 'in the past' },
        ],
      },
    });
    const err = await apiErrorFromResponse(res);
    expect(err.fieldErrors).toEqual({ name: 'too short', expires_at: 'in the past' });
  });

  it('falls back gracefully on a non-JSON body and uses x-request-id', async () => {
    const err = await apiErrorFromResponse(
      new Response('<html>boom</html>', { status: 500, headers: { 'x-request-id': 'abc' } }),
    );
    expect(err.status).toBe(500);
    expect(err.code).toBe('http_500');
    expect(err.requestId).toBe('abc');
  });

  it('maps codes to friendly messages', () => {
    expect(
      friendlyMessage(new ApiError({ status: 409, code: 'stale_version', message: 'x' })),
    ).toMatch(/Reload/);
    expect(friendlyMessage(new ApiError({ status: 404, code: 'not_found', message: 'x' }))).toMatch(
      /not found, or you do not have access/,
    );
    expect(
      friendlyMessage(new ApiError({ status: 413, code: 'payload_too_large', message: 'x' })),
    ).toMatch(/100 MB/);
    expect(
      friendlyMessage(
        new ApiError({ status: 429, code: 'rate_limited', message: 'x', retryAfterSeconds: 7 }),
      ),
    ).toMatch(/7 seconds/);
  });
});

describe('api client: retries are only for idempotent GETs', () => {
  it('retries a GET on 503 then succeeds', async () => {
    const { client, fetchImpl } = setup([
      json(503, { error: { code: 'dependency_unavailable', message: 'x' } }),
      json(200, ME),
    ]);
    expect(await unwrap(client.GET('/api/v1/me'))).toEqual(ME);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a GET on a network error', async () => {
    const { client, fetchImpl } = setup([new TypeError('failed'), json(200, ME)]);
    await client.GET('/api/v1/me');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget and throws', async () => {
    const bad = () => json(502, { error: { code: 'bad_gateway', message: 'x' } });
    const { client, fetchImpl } = setup([bad(), bad(), bad()]);
    await expect(client.GET('/api/v1/me')).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('NEVER retries a write on 503', async () => {
    const { client, fetchImpl } = setup([
      json(503, { error: { code: 'x', message: 'x' } }),
      json(201, {}),
    ]);
    await expect(
      client.POST('/api/v1/folders', { body: { name: 'a', parent_folder_id: 'p' } }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('NEVER retries a write on a network error', async () => {
    const { client, fetchImpl } = setup([new TypeError('failed'), json(201, {})]);
    await expect(
      client.POST('/api/v1/folders', { body: { name: 'a', parent_folder_id: 'p' } }),
    ).rejects.toMatchObject({
      code: 'network_error',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry client errors', async () => {
    const { client, fetchImpl } = setup([
      json(404, { error: { code: 'not_found', message: 'x' } }),
    ]);
    await expect(client.GET('/api/v1/me')).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('api client: 401 handling', () => {
  it('refreshes once and replays the request with the new token', async () => {
    const refreshSession = vi.fn(async () => 'tok-2');
    const onSessionExpired = vi.fn();
    const { client, calls } = setup(
      [json(401, { error: { code: 'unauthenticated', message: 'x' } }), json(200, ME)],
      {
        refreshSession,
        onSessionExpired,
      },
    );
    expect(await unwrap(client.GET('/api/v1/me'))).toEqual(ME);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(calls[1]!.headers.get('authorization')).toBe('Bearer tok-2');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('replays a write body after refresh', async () => {
    const { client, calls } = setup(
      [json(401, { error: { code: 'unauthenticated', message: 'x' } }), json(201, { id: 'f' })],
      {
        refreshSession: async () => 'tok-2',
      },
    );
    await client.POST('/api/v1/folders', { body: { name: 'dir', parent_folder_id: 'p' } });
    expect(await calls[1]!.json()).toEqual({ name: 'dir', parent_folder_id: 'p' });
  });

  it('signs out (once) when the refresh yields nothing', async () => {
    const onSessionExpired = vi.fn();
    const refreshSession = vi.fn(async () => null);
    const { client, fetchImpl } = setup(
      [json(401, { error: { code: 'unauthenticated', message: 'x' } })],
      {
        refreshSession,
        onSessionExpired,
      },
    );
    await expect(client.GET('/api/v1/me')).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('signs out when the replay is still 401 (no refresh loop)', async () => {
    const onSessionExpired = vi.fn();
    const refreshSession = vi.fn(async () => 'tok-2');
    const un = () => json(401, { error: { code: 'unauthenticated', message: 'x' } });
    const { client, fetchImpl } = setup([un(), un()], { refreshSession, onSessionExpired });
    await expect(client.GET('/api/v1/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});

describe('api client: 429 and cancellation', () => {
  it('honours Retry-After and notifies', async () => {
    const onRateLimited = vi.fn();
    const { client } = setup(
      [
        json(
          429,
          { error: { code: 'rate_limited', message: 'slow down' } },
          { 'retry-after': '12' },
        ),
      ],
      {
        onRateLimited,
      },
    );
    const err = await client.GET('/api/v1/me').catch((e) => e);
    expect(err.retryAfterSeconds).toBe(12);
    expect(onRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429, retryAfterSeconds: 12 }),
    );
  });

  it('maps an aborted request to code "aborted"', async () => {
    const ctrl = new AbortController();
    const fetchImpl = vi.fn(async (req: Request) => {
      if (req.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await new Promise((_r, rej) =>
        req.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
      );
      return json(200, {});
    });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      getOrganizationId: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const p = client.GET('/api/v1/me', { signal: ctrl.signal }).catch((e) => e);
    ctrl.abort();
    const err = await p;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('aborted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
