'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, call, configureApiRuntime, type Me } from '@/lib/api-client';
import {
  getActiveOrganizationId,
  setActiveOrganizationId,
  useActiveOrganizationId,
} from '@/features/organizations/org-store';
import { getAuthConfigError, getAuthProvider, type AuthProvider, type SignInCredentials } from './providers';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionContextValue {
  status: Status;
  provider: AuthProvider | null;
  configError: string | null;
  signIn: (c: SignInCredentials) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const provider = useMemo(() => getAuthProvider(), []);
  const configError = getAuthConfigError();

  const signOut = useCallback(async () => {
    await provider?.signOut();
    qc.clear();
    setStatus('signedOut');
  }, [provider, qc]);

  useEffect(() => {
    configureApiRuntime({
      getAccessToken: async () => (provider ? provider.getAccessToken() : null),
      getOrganizationId: getActiveOrganizationId,
      refreshSession: async () => (provider ? provider.refresh() : null),
      onSessionExpired: () => {
        void provider?.signOut();
        qc.clear();
        setStatus('signedOut');
        router.replace('/login?reason=expired');
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
  }, [provider, qc, router]);

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
    () => ({ status: provider ? status : ('signedOut' as Status), provider, configError, signIn, signOut }),
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
