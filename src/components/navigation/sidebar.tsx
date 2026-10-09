'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Layers } from 'lucide-react';
import { useState } from 'react';
import { useMe } from '@/features/auth/session';
import { isAdminRole } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { adminNav, mainNav, type NavSection } from './nav-config';
import { FolderTree, QuickAccessList } from './folder-tree';

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

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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
  const sections =
    auditor && !admin ? [...mainNav, ...visibleAdmin] : [...mainNav, ...visibleAdmin];

  return (
    <nav aria-label="Primary" className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
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
                  {item.href === '/my-files' && <FolderTree />}
                  {item.href === '/starred' && <QuickAccessList />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex h-[52px] items-center gap-2 px-4 font-semibold tracking-tight"
    >
      <span className="grid size-6 place-items-center rounded-md bg-accent text-accent-fg">
        <Layers className="size-3.5" aria-hidden />
      </span>
      <span className="text-[15px]">Enterprise DMS</span>
    </Link>
  );
}
