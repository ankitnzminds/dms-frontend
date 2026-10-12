'use client';

import { History, KeyRound, LogOut, Menu, MonitorOff, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useMe, useSession } from '@/features/auth/session';
import { OrgSwitcher } from '@/features/organizations/org-switcher';
import { ActivityPanel } from '@/features/activity/activity-panel';
import { NotificationsMenu } from './notifications-menu';

function GlobalSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const go = (q: string) => {
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(value);
      }}
    >
      <Search
        className="pointer-events-none absolute left-2.5 top-2 size-4 text-faint"
        aria-hidden
      />
      <Input
        type="search"
        aria-label="Search files and folders"
        placeholder="Search files and folders"
        className="pl-8"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => go(v), 450);
        }}
      />
    </form>
  );
}

function UserMenu() {
  const { data: me } = useMe();
  const { signOut, provider } = useSession();
  const router = useRouter();
  const initials = (me?.display_name ?? me?.email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-soft-fg">
            {initials}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid">
          <span className="truncate text-[13px] font-semibold text-text">
            {me?.display_name ?? me?.email}
          </span>
          <span className="truncate font-normal">{me?.email}</span>
          {me?.role && (
            <span
              className="mt-1 w-fit rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium capitalize text-accent-soft-fg"
              data-testid="role-badge"
            >
              {me.role}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {provider?.changePassword && (
          <DropdownMenuItem onSelect={() => router.push('/account/password')}>
            <KeyRound /> Change password
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await signOut({ everywhere: true });
            router.replace('/login?reason=signed_out');
          }}
        >
          <MonitorOff /> Sign out of all devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const [activity, setActivity] = useState(false);
  return (
    <div className="z-30 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur md:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <Menu />
      </Button>
      <Suspense fallback={<div className="w-full max-w-md" />}>
        <GlobalSearch />
      </Suspense>
      <div className="ml-auto flex items-center gap-1">
        <OrgSwitcher />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Activity"
          title="Activity"
          onClick={() => setActivity(true)}
          data-testid="activity-button"
        >
          <History />
        </Button>
        <NotificationsMenu />
        <ThemeToggle />
        <UserMenu />
      </div>
      <ActivityPanel open={activity} onOpenChange={setActivity} />
    </div>
  );
}
