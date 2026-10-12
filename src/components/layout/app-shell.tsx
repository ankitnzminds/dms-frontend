'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
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
import { useTreeOpen } from '@/features/explorer/tree-state';
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
  // Desktop sidebar: shown by default; the choice is remembered for this tab.
  const [sidebarOpen, setSidebarOpen] = useTreeOpen('layout:sidebar', true);

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
          <div
            className={cn(
              'fixed inset-0 overflow-hidden bg-bg md:grid md:grid-rows-[minmax(0,1fr)] md:p-2',
              sidebarOpen ? 'md:grid-cols-[var(--sidebar-w)_1fr]' : 'md:grid-cols-[3.5rem_1fr]',
              'md:gap-2',
            )}
          >
            <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-line bg-surface md:flex md:rounded-lg md:border">
              <Brand compact={!sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
              <SidebarNav rail={!sidebarOpen} />
            </aside>
            <Dialog open={drawer} onOpenChange={setDrawer}>
              <DialogContent side="left" title="Navigation" hideTitle className="flex flex-col">
                <Brand />
                <SidebarNav onNavigate={() => setDrawer(false)} />
              </DialogContent>
            </Dialog>
            <div className="flex h-full min-h-0 min-w-0 flex-col md:overflow-hidden md:rounded-lg md:border md:border-line">
              <Topbar onMenu={() => setDrawer(true)} />
              <InvitationBanner />
              {/* Header and sidebar stay put; only this area scrolls when its content is taller than the screen. */}
              <main
                id="main"
                tabIndex={-1}
                className="main-scroll relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 outline-none sm:p-5"
              >
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
