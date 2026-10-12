'use client';

import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  FileSignature,
  Folder,
  FolderPlus,
  HardDrive,
  Inbox,
  ListChecks,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Share2,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useAuditEvents } from '@/features/admin/hooks';
import { useMyActivity } from '@/features/activity/api';
import { useMe } from '@/features/auth/session';
import { useOrgUsage, useRecent } from '@/features/files/hooks';
import { useNotifications } from '@/features/notifications/hooks';
import { useAccessRequests } from '@/features/requests/hooks';
import { useReceivedShares } from '@/features/sharing/hooks';
import { useSignatureRequests } from '@/features/signatures/hooks';
import { useMyTasks } from '@/features/workflows/hooks';
import {
  fmtCount,
  formatBytes,
  formatDate,
  formatDateTime,
  formatRelative,
  titleCase,
} from '@/lib/format';
import { actionLabel, isAdminRole } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (v: number) => (v > 0 && v < 1 ? '< 1%' : `${v.toFixed(v < 10 && v > 0 ? 1 : 0)}%`);
const OUTCOME_TONE = { success: 'ok', denied: 'warn', failure: 'danger' } as const;

function CardHead({
  icon: Icon,
  title,
  href,
  hrefLabel = 'View all',
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{title}</span>
      </h2>
      {href && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent hover:underline"
        >
          {hrefLabel} <ChevronRight className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  href,
  sub,
  tone = 'bg-accent-soft text-accent-soft-fg',
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  href?: string;
  sub?: string;
  tone?: string;
  testId?: string;
}) {
  const body = (
    <>
      <span className={cn('grid size-9 place-items-center rounded-lg', tone)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="mt-3 block text-xs text-muted">{label}</span>
      <span className="block text-2xl font-semibold leading-tight tabular">{value}</span>
      {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
    </>
  );
  const cls = 'min-w-0 rounded-xl border border-line bg-surface p-4 shadow-sm';
  return href ? (
    <Link
      href={href}
      data-testid={testId}
      className={cn(cls, 'transition-colors hover:border-line-strong hover:bg-surface-2')}
    >
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}

export function DashboardView() {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const usage = useOrgUsage();
  const recent = useRecent(6, 0);
  const shared = useReceivedShares({ includeInactive: false, limit: 5, offset: 0 });
  const notes = useNotifications({ limit: 1, unreadOnly: true, poll: true });
  const tasks = useMyTasks('pending', 1, 0);
  const toSign = useSignatureRequests('to_sign', 1, 0, 'active');
  const requests = useAccessRequests('to_decide', 'pending', 1, 0);
  const audit = useAuditEvents({ limit: 6, offset: 0 }, admin);
  const mine = useMyActivity(!admin);

  const name = me?.display_name ?? me?.email ?? '';
  const first = me?.display_name?.split(' ')[0];
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0]!.toUpperCase())
      .join('') || '?';
  const refresh = () => {
    for (const q of [usage, recent, shared, notes, tasks, toSign, requests, admin ? audit : mine])
      void q.refetch();
  };
  const u = usage.data;

  return (
    <div className="grid min-w-0 gap-4 pb-6">
      <header
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#0f1b3d] px-5 py-4 text-white shadow-sm"
        data-testid="dashboard-hero"
      >
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#1d4fd8] text-base font-semibold">
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              Welcome{first ? `, ${first}` : ''}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-white/75">
              {/* the heading already shows a display name; show the e-mail instead of repeating it */}
              <span className="truncate">{first && first === name ? me?.email : name}</span>
              {me?.role && (
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs">
                  {titleCase(me.role)}
                </span>
              )}
              {me?.organization_name && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="size-3.5" aria-hidden /> {me.organization_name}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden items-center gap-2 text-[13px] text-white/75 sm:flex">
            <CalendarDays className="size-4" aria-hidden />
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <Button variant="primary" onClick={refresh} aria-label="Refresh dashboard">
            <RefreshCw className={usage.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </header>

      <section
        aria-label="Key figures"
        className={cn(
          'grid grid-cols-2 gap-3 sm:grid-cols-3',
          admin ? 'xl:grid-cols-6' : 'xl:grid-cols-4',
        )}
      >
        {admin && (
          <>
            <Kpi icon={FileText} label="Total Documents" value={u ? fmtCount(u.documents) : '…'} />
            <Kpi
              icon={Folder}
              label="Total Folders"
              value={u ? fmtCount(u.folders) : '…'}
              tone="bg-warn-soft text-warn"
            />
            <Kpi
              icon={Users}
              label="Team Members"
              value={u ? fmtCount(u.users) : '…'}
              href="/admin/users"
              tone="bg-info-soft text-info"
            />
          </>
        )}
        {!admin && (
          <Kpi
            icon={Share2}
            label="Shared with me"
            value={shared.data ? fmtCount(shared.data.total) : '…'}
            href="/shared-with-me"
          />
        )}
        <Kpi
          icon={HardDrive}
          label="Storage Usage"
          value={
            u
              ? u.quota_bytes
                ? fmtPct(pct(u.used_bytes, u.quota_bytes))
                : formatBytes(u.used_bytes)
              : '…'
          }
          sub={
            u
              ? u.quota_bytes
                ? `${formatBytes(u.used_bytes)} of ${formatBytes(u.quota_bytes)}`
                : 'No quota set'
              : undefined
          }
          href={admin ? '/admin/storage' : undefined}
          tone="bg-ok-soft text-ok"
        />
        <Kpi
          icon={ListChecks}
          label="Pending Approvals"
          value={tasks.data ? fmtCount(tasks.data.total) : '…'}
          href="/approvals"
          tone="bg-warn-soft text-warn"
        />
        <Kpi
          icon={FileSignature}
          label="Awaiting Signature"
          value={toSign.data ? fmtCount(toSign.data.total) : '…'}
          href="/signatures"
          tone="bg-danger-soft text-danger"
        />
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <Panel className="p-5 shadow-sm lg:col-span-7">
          <CardHead
            icon={HardDrive}
            title="Storage"
            href={admin ? '/admin/storage' : undefined}
            hrefLabel="Storage management"
          />
          {usage.isPending ? (
            <Skeleton className="h-24" />
          ) : usage.isError ? (
            <ErrorState error={usage.error} onRetry={() => usage.refetch()} className="py-4" />
          ) : (
            <StorageOverview u={usage.data} admin={admin} />
          )}
        </Panel>

        <Panel className="p-5 shadow-sm lg:col-span-5">
          <CardHead
            icon={Bell}
            title="Notifications & pending tasks"
            href="/notifications"
            hrefLabel="Open"
          />
          {notes.isPending ? (
            <Skeleton className="h-8" />
          ) : notes.isError ? (
            <ErrorState error={notes.error} onRetry={() => notes.refetch()} className="py-3" />
          ) : (
            <p className="text-[13px]">
              {notes.data.unread_count === 0 ? (
                'You are all caught up.'
              ) : (
                <>
                  You have <strong>{notes.data.unread_count}</strong> unread.{' '}
                  <Link className="text-accent underline underline-offset-2" href="/notifications">
                    Read them
                  </Link>
                </>
              )}
            </p>
          )}
          <ul className="mt-3 grid gap-1 text-[13px]" aria-label="Needs your attention">
            <Task testId="attn-approvals" icon={ListChecks} href="/approvals">
              {tasks.data
                ? `${tasks.data.total} approval${tasks.data.total === 1 ? '' : 's'} waiting for you`
                : 'Approvals'}
            </Task>
            <Task testId="attn-signatures" icon={FileSignature} href="/signatures">
              {toSign.data
                ? `${toSign.data.total} document${toSign.data.total === 1 ? '' : 's'} to sign`
                : 'Signatures'}
            </Task>
            <Task testId="attn-requests" icon={Inbox} href="/requests">
              {requests.data
                ? `${requests.data.total} access request${requests.data.total === 1 ? '' : 's'} to decide`
                : 'Access requests'}
            </Task>
            {admin && u && (
              <Task icon={ShieldAlert} href="/admin/quarantine" danger={!!u.quarantined_documents}>
                {u.quarantined_documents
                  ? `${u.quarantined_documents} quarantined file${u.quarantined_documents === 1 ? '' : 's'}`
                  : 'No quarantined files'}
              </Task>
            )}
          </ul>
        </Panel>

        <Panel className="min-w-0 p-5 shadow-sm lg:col-span-8">
          <CardHead icon={Clock} title="Recently opened" href="/recent" />
          {recent.isPending ? (
            <Skeleton className="h-32" />
          ) : recent.isError ? (
            <ErrorState error={recent.error} onRetry={() => recent.refetch()} className="py-6" />
          ) : recent.data.items.length === 0 ? (
            <EmptyState
              title="Nothing opened recently"
              description="Documents you preview or download show up here."
              className="py-8"
            />
          ) : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[26rem] text-[13px]">
                <caption className="sr-only">Recently opened</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="py-2 pl-3 font-medium">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.data.items.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className="max-w-64 py-2 pr-3">
                        <Link
                          href={r.kind === 'folder' ? `/files/${r.id}` : `/documents/${r.id}`}
                          className="flex min-w-0 items-center gap-2 font-medium hover:text-accent hover:underline"
                        >
                          <ItemIcon
                            kind={r.kind}
                            contentType={r.content_type}
                            name={r.name}
                            size={18}
                          />
                          <span className="truncate" title={r.name}>
                            {r.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {r.kind === 'folder' ? 'Folder' : 'Document'}
                      </td>
                      <td className="px-3 py-2 tabular text-muted">
                        {typeof r.size_bytes === 'number' ? formatBytes(r.size_bytes) : '—'}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 text-muted">
                        {formatRelative(r.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="p-5 shadow-sm lg:col-span-4">
          <CardHead icon={ScrollText} title="Quick actions" />
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                [Upload, 'Upload file', '/my-files', 'bg-accent-soft text-accent-soft-fg'],
                [FolderPlus, 'Create folder', '/my-files', 'bg-warn-soft text-warn'],
                [Share2, 'Share document', '/shared-by-me', 'bg-info-soft text-info'],
                [ListChecks, 'View approvals', '/approvals', 'bg-ok-soft text-ok'],
                ...(admin
                  ? ([
                      [ScrollText, 'View audit log', '/admin/audit', 'bg-danger-soft text-danger'],
                    ] as const)
                  : []),
                [Bot, 'Access assistant', '/assistant', 'bg-surface-3 text-text'],
              ] as readonly (readonly [LucideIcon, string, string, string])[]
            ).map(([Icon, label, href, tone]) => (
              <Link
                key={label}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg p-3 text-center text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent',
                  tone,
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-text">{label}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel className="p-5 shadow-sm lg:col-span-5">
          <CardHead
            icon={Share2}
            title={`Shared with me${shared.data ? ` (${shared.data.total})` : ''}`}
            href="/shared-with-me"
          />
          {shared.isPending ? (
            <Skeleton className="h-24" />
          ) : shared.isError ? (
            <ErrorState error={shared.error} onRetry={() => shared.refetch()} className="py-6" />
          ) : shared.data.items.length === 0 ? (
            <EmptyState
              title="Nothing shared with you"
              description="Files and folders others share with you appear here."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-line">
              {shared.data.items.map((s) => {
                const perms = s.actions.filter((a) => a !== 'discover');
                return (
                  <li key={s.share_id} className="flex items-start gap-2.5 py-2">
                    <ItemIcon
                      kind={s.resource_type}
                      name={s.name}
                      contentType={s.content_type}
                      size={18}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        className="block truncate text-[13px] font-medium hover:text-accent hover:underline"
                        href={
                          s.resource_type === 'document'
                            ? `/documents/${s.resource_id}`
                            : `/files/${s.resource_id}`
                        }
                      >
                        {s.name}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        From {s.shared_by.display_name ?? s.shared_by.email} ·{' '}
                        {formatDate(s.shared_at)}
                      </p>
                    </div>
                    <span
                      className="hidden shrink-0 text-right text-xs text-muted sm:block"
                      title={perms.map(actionLabel).join(', ')}
                    >
                      {perms.slice(0, 2).map(actionLabel).join(', ')}
                      {perms.length > 2 ? ` +${perms.length - 2}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel className="min-w-0 p-5 shadow-sm lg:col-span-7">
          <CardHead
            icon={ScrollText}
            title="Recent activity"
            href={admin ? '/admin/audit' : undefined}
          />
          {admin ? (
            audit.isPending ? (
              <Skeleton className="h-32" />
            ) : audit.isError ? (
              <ErrorState error={audit.error} onRetry={() => audit.refetch()} className="py-6" />
            ) : audit.data.items.length === 0 ? (
              <EmptyState title="No activity yet" className="py-8" />
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[34rem] text-[13px]">
                  <caption className="sr-only">Recent activity</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Resource</th>
                      <th className="py-2 pl-3 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {audit.data.items.map((e) => (
                      <tr key={e.id} className="hover:bg-surface-2">
                        <td className="whitespace-nowrap py-2 pr-3 text-muted">
                          {formatDateTime(e.created_at)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                        <td className="max-w-40 truncate px-3 py-2 text-muted">
                          {e.actor_email ?? 'System'}
                        </td>
                        <td className="px-3 py-2 text-muted">{e.resource_type ?? '—'}</td>
                        <td className="py-2 pl-3">
                          <Badge tone={OUTCOME_TONE[e.outcome]}>{e.outcome}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : mine.isPending ? (
            <Skeleton className="h-32" />
          ) : mine.isError ? (
            <ErrorState error={mine.error} onRetry={() => mine.refetch()} className="py-6" />
          ) : mine.data.length === 0 ? (
            <EmptyState title="No activity yet" className="py-8" />
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {mine.data.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    You {a.verb}{' '}
                    <strong className="font-medium">{a.target_name ?? 'an item'}</strong>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatRelative(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Task({
  icon: Icon,
  href,
  children,
  danger,
  testId,
}: {
  icon: LucideIcon;
  href: string;
  children: React.ReactNode;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <li data-testid={testId}>
      <Link
        href={href}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2',
          danger ? 'text-danger' : 'text-accent',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">{children}</span>
        <ChevronRight className="size-3.5 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

function StorageOverview({
  u,
  admin,
}: {
  u: NonNullable<ReturnType<typeof useOrgUsage>['data']>;
  admin: boolean;
}) {
  const total = u.used_bytes + u.reserved_bytes;
  const q = u.quota_bytes;
  const usedPct = q ? Math.min(100, pct(u.used_bytes, q)) : 0;
  const resPct = q ? Math.min(100 - usedPct, pct(u.reserved_bytes, q)) : 0;
  const hot = q ? pct(total, q) > 90 : false;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tabular">
          {formatBytes(u.used_bytes)}{' '}
          <span className="text-sm font-normal text-muted">
            {q ? `of ${formatBytes(q)} used` : 'used (no quota set)'}
          </span>
        </p>
        {q && (
          <p className="text-xs text-muted tabular">
            Free {formatBytes(Math.max(0, q - total))}
            {u.reserved_bytes > 0 && ` · ${formatBytes(u.reserved_bytes)} reserved by uploads`}
          </p>
        )}
      </div>
      {q ? (
        <div className="mt-3 flex items-center gap-3">
          <div
            role="meter"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={q}
            aria-valuenow={u.used_bytes}
            aria-valuetext={`${formatBytes(u.used_bytes)} of ${formatBytes(q)} used`}
            className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn('h-full', hot ? 'bg-danger' : 'bg-accent')}
              style={{ width: `${usedPct}%` }}
            />
            <div className="stripe-progress h-full text-accent" style={{ width: `${resPct}%` }} />
          </div>
          <span className="w-12 text-right text-sm font-medium tabular">
            {fmtPct(pct(u.used_bytes, q))}
          </span>
        </div>
      ) : null}
      {admin && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          {(
            [
              ['Documents', u.documents],
              ['Folders', u.folders],
              ['Versions', u.versions],
              ['Scanning', u.pending_scans],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted">{k === 'Scanning' ? 'Waiting for scan' : k}</dt>
              <dd className="text-lg font-semibold tabular">{fmtCount(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
