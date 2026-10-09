import { describe, expect, it, vi } from 'vitest';
import { DevAuthProvider } from '@/features/auth/providers/dev-provider';
import { SupabaseAuthProvider } from '@/features/auth/providers/supabase-provider';
import { AuthError } from '@/features/auth/providers/types';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const tokenFetch = (token = 'jwt-1') =>
  vi.fn(
    async () => new Response(JSON.stringify({ access_token: token }), { status: 200 }),
  ) as unknown as typeof fetch;

describe('DevAuthProvider', () => {
  it('refuses to be constructed in a production build', () => {
    expect(
      () => new DevAuthProvider('http://x/api/v1', tokenFetch(), memoryStorage(), true),
    ).toThrow(/production/);
  });

  it('signs in via the dev token endpoint and keeps the token in memory only', async () => {
    const fetchImpl = tokenFetch('jwt-alice');
    const storage = memoryStorage();
    const p = new DevAuthProvider('http://x/api/v1', fetchImpl, storage, false);
    const listener = vi.fn();
    p.onChange(listener);

    expect(await p.getAccessToken()).toBeNull();
    await p.signIn({ kind: 'dev', email: 'alice@acme.test' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/api/v1/dev/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      JSON.parse((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body),
    ).toEqual({ email: 'alice@acme.test' });
    expect(await p.getAccessToken()).toBe('jwt-alice');
    expect(listener).toHaveBeenCalledWith(true);
    // only the email is stored, never the token
    expect([...storage.raw.values()]).toEqual(['alice@acme.test']);
  });

  it('re-mints a token after a reload and on refresh', async () => {
    const storage = memoryStorage();
    storage.setItem('dms.dev.email', 'bob@acme.test');
    const p = new DevAuthProvider('http://x/api/v1', tokenFetch('jwt-bob'), storage, false);
    expect(await p.getAccessToken()).toBe('jwt-bob');
    expect(await p.refresh()).toBe('jwt-bob');
  });

  it('signOut clears state and notifies', async () => {
    const storage = memoryStorage();
    const p = new DevAuthProvider('http://x/api/v1', tokenFetch(), storage, false);
    const listener = vi.fn();
    p.onChange(listener);
    await p.signIn({ kind: 'dev', email: 'alice@acme.test' });
    await p.signOut();
    expect(await p.getAccessToken()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('reports a helpful error when the dev endpoint is missing', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 404 }),
    ) as unknown as typeof fetch;
    const p = new DevAuthProvider('http://x/api/v1', fetchImpl, memoryStorage(), false);
    await expect(p.signIn({ kind: 'dev', email: 'a@b.c' })).rejects.toThrow(/AUTH_PROVIDER=local/);
  });

  it('rejects password credentials', async () => {
    const p = new DevAuthProvider('http://x/api/v1', tokenFetch(), memoryStorage(), false);
    await expect(
      p.signIn({ kind: 'password', email: 'a@b.c', password: 'x' }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

function mockSupabase() {
  const unsubscribe = vi.fn();
  let cb: ((e: string, s: unknown) => void) | undefined;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'sb-jwt' } }, error: null })),
    refreshSession: vi.fn(async () => ({
      data: { session: { access_token: 'sb-jwt-2' } },
      error: null,
    })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    onAuthStateChange: vi.fn((fn: typeof cb) => {
      cb = fn;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  return {
    client: { auth } as never,
    auth,
    emit: (s: unknown) => cb?.('SIGNED_IN', s),
    unsubscribe,
  };
}

describe('SupabaseAuthProvider (mocked client; not tested against a live project)', () => {
  it('returns the session access token and refreshes on demand', async () => {
    const m = mockSupabase();
    const p = new SupabaseAuthProvider(m.client);
    expect(await p.getAccessToken()).toBe('sb-jwt');
    expect(await p.refresh()).toBe('sb-jwt-2');
  });

  it('returns null when there is no session or an error', async () => {
    const m = mockSupabase();
    m.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    m.auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'x' },
    } as never);
    const p = new SupabaseAuthProvider(m.client);
    expect(await p.getAccessToken()).toBeNull();
    expect(await p.refresh()).toBeNull();
  });

  it('signs in with email and password and maps bad credentials to a friendly error', async () => {
    const m = mockSupabase();
    const p = new SupabaseAuthProvider(m.client);
    await p.signIn({ kind: 'password', email: 'a@b.c', password: 'pw' });
    expect(m.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });

    m.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: 'Invalid login credentials', status: 400 },
    } as never);
    await expect(p.signIn({ kind: 'password', email: 'a@b.c', password: 'bad' })).rejects.toThrow(
      'Incorrect email or password.',
    );
  });

  it('signs out, subscribes/unsubscribes, and sends password reset emails', async () => {
    const m = mockSupabase();
    const p = new SupabaseAuthProvider(m.client, 'http://app/login');
    await p.signOut();
    expect(m.auth.signOut).toHaveBeenCalled();

    const l = vi.fn();
    const off = p.onChange(l);
    m.emit({ access_token: 't' });
    m.emit(null);
    expect(l.mock.calls).toEqual([[true], [false]]);
    off();
    expect(m.unsubscribe).toHaveBeenCalled();

    await p.requestPasswordReset('a@b.c');
    expect(m.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
      redirectTo: 'http://app/login',
    });
  });
});
