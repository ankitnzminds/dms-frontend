'use client';

import { AlertCircle, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TechnicalDetails } from '@/components/ui/states';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { useSession } from './session';

const COPY: Record<string, { title: string; body: string }> = {
  not_provisioned: {
    title: 'Your account is not set up yet',
    body: 'You signed in successfully, but no account exists for you in this system. Ask your administrator to invite you.',
  },
  no_membership: {
    title: 'You are not part of an organization',
    body: 'Your account is not a member of any organization. Ask an administrator to add you, or accept a pending invitation.',
  },
  account_inactive: {
    title: 'Your account is inactive',
    body: 'Your account or membership has been suspended or removed. Contact your administrator.',
  },
  organization_required: {
    title: 'Choose an organization',
    body: 'Your account belongs to several organizations and none was selected. Reload the page and pick one.',
  },
  session_revoked: {
    title: 'Your session was ended',
    body: 'An administrator revoked your sessions. Sign in again to continue.',
  },
};

export function AccountProblem({ error }: { error: unknown }) {
  const { signOut } = useSession();
  const router = useRouter();
  const code = isApiError(error) ? error.code : 'unknown';
  const copy = COPY[code] ?? {
    title: 'We could not load your account',
    body: friendlyMessage(error),
  };
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div role="alert" className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-pop">
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-warn-soft text-warn">
          <AlertCircle className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="mt-1.5 text-[13px] text-muted">{copy.body}</p>
        <div className="mt-3 flex justify-center">
          <TechnicalDetails error={error} />
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
