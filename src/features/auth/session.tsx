'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, call, configureApiRuntime, type Me } from '@/lib/api-client';
import { clearClipboard } from '@/features/explorer/clipboard';
import {
  getActiveOrganizationId,
  setActiveOrganizationId,
  useActiveOrganizationId,
} from '@/features/organizations/org-store';
import {
  getAuthConfigError,
  getAuthProvider,
  type AuthProvider,
  type SignInCredentials,
} from './providers';

const CHANNEL = 'dms-auth';
function postAuthEvent(e: 'signed_out_everywhere') {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(e);
    ch.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}
function onAuthEvent(cb: (e: 'signed_out_everywhere') => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (m) => m.data === 'signed_out_everywhere' && cb(m.data);
  return () => ch.close();
}

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionContextValue {
  status: Status;
  provider: AuthProvider | null;
  configError: string | null;
  signIn: (c: SignInCredentials) => Promise<void>;
  /** Ends the session. `everywhere` also revokes every token issued so far (all devices). */
  signOut: (opts?: { everywhere?: boolean }) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const provider = useMemo(() => getAuthProvider(), []);
  const configError = getAuthConfigError();

  /** Local teardown shared by explicit sign-out, 401 expiry and cross-tab sign-out. */
  const endSession = useCallback(async () => {
    await provider?.signOut();
    qc.clear();
    clearClipboard();
    setActiveOrganizationId(null);
    setStatus('signedOut');
  }, [provider, qc]);

  const signOut = useCallback(
    async (opts?: { everywhere?: boolean }) => {
      // Best effort: the server records the sign-out (and revokes all tokens for "everywhere").
      // The local session is ended even when this call fails.
      try {
        await api.POST('/api/v1/me/logout', { body: { everywhere: !!opts?.everywhere } });
      } catch {
        /* offline or already expired */
      }
      await endSession();
      if (opts?.everywhere) postAuthEvent('signed_out_everywhere');
    },
    [endSession],
  );

  useEffect(() => {
    configureApiRuntime({
      getAccessToken: async () => (provider ? provider.getAccessToken() : null),
      getOrganizationId: getActiveOrganizationId,
      refreshSession: async () => (provider ? provider.refresh() : null),
      onSessionExpired: () => {
        void endSession();
        const here = window.location.pathname + window.location.search;
        const next = here.startsWith('/login') || here === '/' ? '' : `&next=${encodeURIComponent(here)}`;
        router.replace(`/login?reason=expired${next}`);
      },
      onRateLimited: (e) => {
        toast.warning(
          e.retryAfterSeconds
            ? `Too many requests. Try again in ${e.retryAfterSeconds} seconds.`
            : 'Too many requests. Please wait a moment.',
          { id: 'rate-limited' },
        );
      },
    });
  }, [provider, endSession, router]);

  // Another tab signed out of all devices: end this session right away.
  useEffect(
    () =>
      onAuthEvent((e) => {
        if (e === 'signed_out_everywhere') {
          void endSession();
          toast.info('You were signed out on another tab.');
          router.replace('/login?reason=signed_out');
        }
      }),
    [endSession, router],
  );

  useEffect(() => {
    if (!provider) return;
    let alive = true;
    provider.getAccessToken().then((t) => {
      if (alive) setStatus(t ? 'signedIn' : 'signedOut');
    });
    const off = provider.onChange((signedIn) => {
      setStatus(signedIn ? 'signedIn' : 'signedOut');
    });
    return () => {
      alive = false;
      off();
    };
  }, [provider]);

  const signIn = useCallback(
    async (c: SignInCredentials) => {
      if (!provider) throw new Error(configError ?? 'Authentication is not configured.');
      await provider.signIn(c);
      qc.clear();
      setStatus('signedIn');
    },
    [provider, qc, configError],
  );

  const value = useMemo(
    () => ({
      status: provider ? status : ('signedOut' as Status),
      provider,
      configError,
      signIn,
      signOut,
    }),
    [status, provider, configError, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** GET /me for the active organization. */
export function useMe() {
  const { status } = useSession();
  const orgId = useActiveOrganizationId();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me', orgId],
    enabled: status === 'signedIn',
    queryFn: ({ signal }) => call<Me>(api.GET('/api/v1/me', { signal })),
    staleTime: 60_000,
    retry: false,
  });
  const me = q.data;
  useEffect(() => {
    if (!me) return;
    const active = me.memberships.filter((m) => m.status === 'active');
    const stored = getActiveOrganizationId();
    if (!stored || !active.some((m) => m.organization_id === stored)) {
      const next = me.organization_id ?? active[0]?.organization_id ?? null;
      if (next && next !== stored) {
        setActiveOrganizationId(next);
        qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      }
    }
  }, [me, qc]);
  return q;
}

/** Redirects signed-out users to /login (preserving the destination). */
export function useRequireSession() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'signedOut') {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [status, router, pathname]);
  return status;
}
