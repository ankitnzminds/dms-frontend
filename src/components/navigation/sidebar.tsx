'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, ExternalLink, Layers } from 'lucide-react';
import { useState } from 'react';
import { useMe } from '@/features/auth/session';
import { isAdminRole } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { adminNav, mainNav, type NavSection } from './nav-config';
import { treeKeyHandler, useTreeOpen } from '@/features/explorer/tree-state';
import {
  FolderTree,
  QuickAccessList,
  RecentList,
  SharedTree,
  TeamFolderTree,
  useSharedByMeRoots,
  useSharedWithMeRoots,
} from './folder-tree';

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  if (href === '/my-files') return pathname === '/my-files' || pathname.startsWith('/files/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const COLLAPSE_KEY = 'dms.nav.collapsed';

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function SidebarNav({
  onNavigate,
  rail,
}: {
  onNavigate?: () => void;
  /** Icon-only rail (the desktop sidebar when it is collapsed). */
  rail?: boolean;
}) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const auditor = me?.role === 'auditor';

  const visibleAdmin: NavSection[] = adminNav.filter((s) =>
    s.requires === 'admin' ? admin : s.requires === 'auditor-or-admin' ? admin || auditor : true,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : readCollapsed(),
  );
  function toggle(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable: the toggle still works for this visit */
      }
      return next;
    });
  }
  // In the admin area the admin menu comes first and the file trees start folded, so it is never
  // pushed below the fold by a long Recent list or folder tree.
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const sections = inAdmin ? [...visibleAdmin, ...mainNav] : [...mainNav, ...visibleAdmin];
  const treesOpen = !inAdmin;

  if (rail) {
    return (
      <nav
        aria-label="Primary"
        className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((section, si) => (
          <div key={si} className="flex w-full flex-col items-center gap-0.5">
            {si > 0 && <hr className="my-1.5 w-6 border-line" aria-hidden />}
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text',
                    active && 'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft',
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
      {sections.map((section, si) => (
        <div key={si} className="mt-4 first:mt-1">
          {section.title && section.collapsible ? (
            <button
              type="button"
              aria-expanded={
                !collapsed.has(section.title) ||
                section.items.some((i) => isActive(pathname, i.href))
              }
              onClick={() => toggle(section.title!)}
              className="flex w-full items-center justify-between px-2 pb-1 text-xs font-medium uppercase tracking-wide text-faint hover:text-text"
            >
              {section.title}
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform',
                  collapsed.has(section.title) &&
                    !section.items.some((i) => isActive(pathname, i.href)) &&
                    '-rotate-90',
                )}
                aria-hidden
              />
            </button>
          ) : (
            section.title && (
              <p className="px-2 pb-1 text-xs font-medium text-faint">{section.title}</p>
            )
          )}
          <ul
            className={cn(
              'grid gap-0.5',
              section.collapsible &&
                section.title &&
                collapsed.has(section.title) &&
                !section.items.some((i) => isActive(pathname, i.href)) &&
                'hidden',
            )}
          >
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              if (item.href === '/my-files' || item.href === '/team-folders') {
                return (
                  <TreeRootItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={Icon}
                    active={active}
                    onNavigate={onNavigate}
                    defaultOpen={treesOpen}
                  >
                    {item.href === '/my-files' ? <FolderTree /> : <TeamFolderTree />}
                  </TreeRootItem>
                );
              }
              if (item.href === '/shared-with-me') {
                return (
                  <SharedWithMeItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={Icon}
                    active={active}
                    onNavigate={onNavigate}
                    defaultOpen={treesOpen}
                  />
                );
              }
              if (item.href === '/shared-by-me') {
                return (
                  <SharedByMeItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={Icon}
                    active={active}
                    onNavigate={onNavigate}
                    defaultOpen={treesOpen}
                  />
                );
              }
              if (item.href === '/recent' || item.href === '/starred') {
                return (
                  <CollapsibleNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={Icon}
                    active={active}
                    onNavigate={onNavigate}
                    defaultOpen={treesOpen}
                  >
                    {item.href === '/recent' ? <RecentList /> : <QuickAccessList />}
                  </CollapsibleNavItem>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text',
                      active &&
                        'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {item.unavailable && (
                      <span className="ml-auto rounded-sm border border-line-strong px-1 text-[10px] leading-4 text-muted">
                        Soon
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type RootProps = Omit<React.ComponentProps<typeof TreeRootItem>, 'children' | 'hasChildren'>;

function SharedWithMeItem(p: RootProps) {
  const { roots, total } = useSharedWithMeRoots();
  return (
    <TreeRootItem {...p} hasChildren={roots.length > 0}>
      <SharedTree
        roots={roots}
        total={total}
        scope="with"
        label="Shared with me"
        viewAllHref="/shared-with-me"
      />
    </TreeRootItem>
  );
}

function SharedByMeItem(p: RootProps) {
  const { roots, total } = useSharedByMeRoots();
  return (
    <TreeRootItem {...p} hasChildren={roots.length > 0}>
      <SharedTree
        roots={roots}
        total={total}
        scope="by"
        label="Shared by me"
        viewAllHref="/shared-by-me"
      />
    </TreeRootItem>
  );
}

/**
 * My Files / Team Folders: the name opens the page; only the arrow expands or collapses the tree below
 * it (right arrow = collapsed, down arrow = expanded), exactly like every folder node under it.
 */
function TreeRootItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  hasChildren = true,
  defaultOpen = true,
  children,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  active: boolean;
  onNavigate?: () => void;
  /** False: nothing is listed below, so there is no arrow. */
  hasChildren?: boolean;
  /** Open until the person folds it themselves (their choice is remembered). */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useTreeOpen(`root:${href}`, defaultOpen);
  const keys = treeKeyHandler(open, setOpen);
  return (
    <li>
      <div
        className={cn(
          'group flex h-8 items-center rounded-md text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text',
          active &&
            'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg',
        )}
      >
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          onKeyDown={keys}
          className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Link>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
            onClick={() => setOpen(!open)}
            onKeyDown={keys}
            className="mr-1 grid size-6 shrink-0 place-items-center rounded-sm hover:text-text"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', open && 'rotate-90')}
              aria-hidden
            />
          </button>
        ) : (
          <span className="mr-1 size-6 shrink-0" aria-hidden />
        )}
      </div>
      {open && hasChildren && children}
    </li>
  );
}

/**
 * Recent / Quick Access: the heading (or its arrow) shows or hides the preview list; the small "open"
 * link goes to the full page, so the page stays reachable from the sidebar either way.
 */
function CollapsibleNavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  defaultOpen = true,
  children,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  active: boolean;
  onNavigate?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useTreeOpen(`nav:${href}`, defaultOpen);
  return (
    <li>
      <div
        className={cn(
          'group flex h-8 items-center rounded-md text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text',
          active &&
            'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
          onClick={() => setOpen(!open)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          <ChevronRight
            className={cn('ml-auto size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        </button>
        <Link
          href={href}
          onClick={onNavigate}
          aria-label={`Open ${label} page`}
          aria-current={active ? 'page' : undefined}
          className="mr-1 grid size-6 shrink-0 place-items-center rounded-sm hover:text-text"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
      {open && children}
    </li>
  );
}

export function Brand({
  compact,
  onToggle,
}: {
  /** Icon-only (collapsed sidebar). */
  compact?: boolean;
  /** Desktop only: the logo icon itself hides / shows the side menu. */
  onToggle?: () => void;
}) {
  const mark = (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
      <Layers className="size-3.5" aria-hidden />
    </span>
  );
  if (!onToggle) {
    // Mobile drawer: the logo is just the way home.
    return (
      <Link
        href="/dashboard"
        className="flex h-[52px] items-center gap-2 px-4 font-semibold tracking-tight"
        aria-label="NZM DMS"
      >
        {mark}
        <span className="text-[15px]">NZM DMS</span>
      </Link>
    );
  }
  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={compact ? 'Show sidebar' : 'Hide sidebar'}
      aria-expanded={!compact}
      title={compact ? 'Show sidebar' : 'Hide sidebar'}
      data-testid="sidebar-toggle"
      className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-surface-2"
    >
      {mark}
    </button>
  );
  return compact ? (
    <div className="flex h-[52px] items-center justify-center">{toggle}</div>
  ) : (
    <div className="flex h-[52px] items-center gap-1 px-3">
      {toggle}
      <Link
        href="/dashboard"
        className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight"
      >
        NZM DMS
      </Link>
    </div>
  );
}
