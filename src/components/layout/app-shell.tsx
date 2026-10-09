'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { Brand, SidebarNav } from '@/components/navigation/sidebar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { UploadPanel } from '@/components/upload/upload-panel';
import { AccountProblem } from '@/features/auth/account-problem';
import { useMe, useRequireSession } from '@/features/auth/session';
import { InvitationBanner } from '@/features/organizations/invitation-banner';
import { ExplorerOpsProvider } from '@/components/explorer/ops';
import { UploadPickersProvider } from '@/components/upload/pickers';
import { ChatLauncherProvider } from '@/features/chat/launcher';
import { Topbar } from './topbar';

function ShellSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
      <div className="grid w-64 gap-3">
        <Skeleton className="h-6" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const status = useRequireSession();
  const me = useMe();
  const [drawer, setDrawer] = useState(false);

  if (status !== 'signedIn') return <ShellSkeleton />;
  if (me.isError) return <AccountProblem error={me.error} />;
  if (me.isPending) return <ShellSkeleton />;
  if (!me.data.organization_id && me.data.memberships.every((m) => m.status !== 'active')) {
    return (
      <>
        <InvitationBanner />
        <AccountProblem
          error={new ApiError({ status: 403, code: 'no_membership', message: 'No organization' })}
        />
      </>
    );
  }

  return (
    <ExplorerOpsProvider>
      <UploadPickersProvider>
        <ChatLauncherProvider>
          <div className="min-h-dvh md:grid md:grid-cols-[var(--sidebar-w)_1fr]">
            <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface md:flex">
              <Brand />
              <SidebarNav />
            </aside>
            <Dialog open={drawer} onOpenChange={setDrawer}>
              <DialogContent side="left" title="Navigation" hideTitle className="flex flex-col">
                <Brand />
                <SidebarNav onNavigate={() => setDrawer(false)} />
              </DialogContent>
            </Dialog>
            <div className="flex min-w-0 flex-col">
              <Topbar onMenu={() => setDrawer(true)} />
              <InvitationBanner />
              <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-3 outline-none sm:p-5">
                {children}
              </main>
            </div>
            <UploadPanel />
          </div>
        </ChatLauncherProvider>
      </UploadPickersProvider>
    </ExplorerOpsProvider>
  );
}
