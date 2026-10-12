'use client';

import {
  Bell,
  Building2,
  Clock,
  ChevronRight,
  FolderPlus,
  ScrollText,
  Settings,
  Upload,
  Database,
  FileType2,
  FileText,
  Folder,
  Gauge,
  HardDrive,
  Info,
  Layers,
  PieChart,
  RefreshCw,
  ScanSearch,
  Trash2,
  Users,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useOrgActivity } from '@/features/activity/api';
import { useMe } from '@/features/auth/session';
import { useOrgUsage, useRecent } from '@/features/files/hooks';
import { useOrganization } from '@/features/sharing/hooks';
import { fmtCount, formatBytes, formatDateTime, formatRelative, titleCase } from '@/lib/format';
import { cn } from '@/lib/utils';

type Usage = NonNullable<ReturnType<typeof useOrgUsage>['data']>;

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (v: number) => (v > 0 && v < 1 ? '< 1%' : `${v.toFixed(v < 10 && v > 0 ? 1 : 0)}%`);

function CardTitle({
  icon: Icon,
  title,
  hint,
  right,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function status(u: Usage): { tone: 'ok' | 'warn' | 'danger'; label: string } {
  if (u.organization_status !== 'active') return { tone: 'danger', label: u.organization_status };
  if (u.quota_bytes === null) return { tone: 'ok', label: 'No quota' };
  const used = pct(u.used_bytes + u.reserved_bytes, u.quota_bytes);
  if (used >= 100) return { tone: 'danger', label: 'Quota reached' };
  if (used >= 85) return { tone: 'warn', label: 'Nearly full' };
  return { tone: 'ok', label: 'Healthy' };
}

export function AdminDashboard() {
  const u = useOrgUsage();
  const act = useOrgActivity(true, null);
  const recent = useRecent(6, 0);
  const refresh = () => {
    void u.refetch();
    void act.refetch();
    void recent.refetch();
  };
  return (
    <>
      <IdentityBar />
      <PageHeader
        title="Admin Dashboard"
        description="Monitor and manage people, storage and activity for your organization."
        actions={
          <>
            {u.dataUpdatedAt > 0 && (
              <p className="mr-1 hidden text-right text-xs text-muted sm:block">
                Last updated
                <span className="block text-text">
                  {formatDateTime(new Date(u.dataUpdatedAt).toISOString())}
                </span>
              </p>
            )}
            <Button variant="primary" onClick={refresh} disabled={u.isFetching}>
              <RefreshCw className={u.isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
          </>
        }
      />
      {u.isPending ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-60 lg:col-span-5" />
          <Skeleton className="h-60 lg:col-span-4" />
          <Skeleton className="h-60 lg:col-span-3" />
        </div>
      ) : u.isError ? (
        <Panel>
          <ErrorState error={u.error} onRetry={() => u.refetch()} className="py-8" />
        </Panel>
      ) : (
        <div className="grid min-w-0 gap-4 pb-6 lg:grid-cols-12">
          <Overview u={u.data} className="lg:col-span-12 xl:col-span-5" />
          <Donut u={u.data} className="lg:col-span-7 xl:col-span-4" />
          <Summary u={u.data} className="lg:col-span-5 xl:col-span-3" />
          <Provider className="lg:col-span-6 xl:col-span-3" />
          <RecentFiles q={recent} className="lg:col-span-6 xl:col-span-6" />
          <QuickActions className="lg:col-span-12 xl:col-span-3" />
          <Recent act={act} className="lg:col-span-12 xl:col-span-8" />
          <Policies className="lg:col-span-12 xl:col-span-4" />
        </div>
      )}
    </>
  );
}

/** Who is looking at this page: organization and the signed-in admin (from the existing session). */
function IdentityBar() {
  const { data: me } = useMe();
  const org = useOrganization();
  const name = me?.display_name ?? me?.email ?? '';
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join('');
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0f1b3d] px-4 py-3 text-white"
      data-testid="storage-identity"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#5b4bff]">
          <Building2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {org.data?.name ?? me?.organization_name ?? 'Organization'}
          </p>
          <p className="truncate text-xs text-white/70">
            {me?.role ? titleCase(me.role) : 'Member'}
            {org.data?.slug ? ` · ID: ${org.data.slug}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="grid size-8 place-items-center rounded-md hover:bg-white/10"
        >
          <Bell className="size-4" aria-hidden />
        </Link>
        <Link
          href="/admin/settings"
          aria-label="Organization settings"
          className="grid size-8 place-items-center rounded-md hover:bg-white/10"
        >
          <Settings className="size-4" aria-hidden />
        </Link>
        <div className="ml-2 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-[#1d4fd8] text-xs font-semibold">
            {initials || '?'}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-44 truncate text-sm font-medium">{name}</span>
            <span className="block text-xs text-white/70">
              {me?.role ? titleCase(me.role) : ''}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Overview({ u, className }: { u: Usage; className?: string }) {
  const s = status(u);
  const total = u.used_bytes + u.reserved_bytes;
  const p = u.quota_bytes ? Math.min(100, pct(total, u.quota_bytes)) : 0;
  const metrics: [LucideIcon, string, string, string?][] = [
    [FileText, 'Documents', fmtCount(u.documents)],
    [Folder, 'Folders', fmtCount(u.folders)],
    [Layers, 'Versions', fmtCount(u.versions)],
    [Users, 'People', fmtCount(u.users)],
    [UsersRound, 'Groups', fmtCount(u.groups)],
    [
      ScanSearch,
      'Waiting for scan',
      fmtCount(u.pending_scans),
      u.pending_scans
        ? undefined
        : u.quarantined_documents
          ? `${fmtCount(u.quarantined_documents)} quarantined`
          : 'No pending files',
    ],
  ];
  return (
    <Panel className={cn('p-5', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Database className="size-6 text-accent" aria-hidden />
        <h2 className="text-base font-semibold">Organization Storage</h2>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <p className="mt-4 text-2xl font-semibold tabular">
        {formatBytes(u.used_bytes)}{' '}
        <span className="text-base font-normal text-muted">
          {u.quota_bytes === null ? 'used (no quota set)' : `of ${formatBytes(u.quota_bytes)} used`}
        </span>
      </p>
      {u.quota_bytes !== null && (
        <div className="mt-3 flex items-center gap-4">
          <div
            role="progressbar"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p)}
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(p, p > 0 ? 1 : 0)}%` }}
            />
          </div>
          <span className="w-12 text-right text-sm font-medium tabular">{fmtPct(p)}</span>
        </div>
      )}
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3">
        {metrics.map(([Icon, k, v, sub]) => (
          <div key={k} className="min-w-0 rounded-lg bg-surface-2 p-3">
            <span className="grid size-8 place-items-center rounded-md bg-accent-soft text-accent-soft-fg">
              <Icon className="size-4" aria-hidden />
            </span>
            <dt className="mt-2 truncate text-xs text-muted">{k}</dt>
            <dd className="text-xl font-semibold leading-tight tabular">{v}</dd>
            {sub && <p className="truncate text-xs text-muted">{sub}</p>}
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function Donut({ u, className }: { u: Usage; className?: string }) {
  const q = u.quota_bytes;
  const free = q === null ? 0 : Math.max(0, q - u.used_bytes - u.reserved_bytes);
  const whole = q ?? u.used_bytes + u.reserved_bytes;
  const parts = [
    { k: 'Used', v: u.used_bytes, color: 'var(--color-accent)' },
    { k: 'Reserved by uploads', v: u.reserved_bytes, color: '#a855f7' },
    ...(q === null ? [] : [{ k: 'Free', v: free, color: 'var(--color-surface-3)' }]),
  ];
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Panel className={cn('p-5', className)}>
      <CardTitle icon={PieChart} title="Storage Breakdown" />
      <div className="flex flex-wrap items-center justify-center gap-6">
        <div className="relative size-40 shrink-0">
          <svg
            viewBox="0 0 140 140"
            className="size-full -rotate-90"
            role="img"
            aria-label="Storage usage chart"
          >
            <circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="var(--color-surface-3)"
              strokeWidth="16"
            />
            {whole > 0 &&
              parts
                .filter((x) => x.v > 0)
                .map((x) => {
                  const len = (x.v / whole) * c;
                  const el = (
                    <circle
                      key={x.k}
                      cx="70"
                      cy="70"
                      r={r}
                      fill="none"
                      stroke={x.color}
                      strokeWidth="16"
                      strokeDasharray={`${Math.max(len - 1, 0.5)} ${c}`}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += len;
                  return el;
                })}
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="text-lg font-semibold tabular">{formatBytes(u.used_bytes)}</p>
            <p className="text-xs text-muted">{q === null ? 'No quota' : `of ${formatBytes(q)}`}</p>
            {q !== null && (
              <p className="text-xs text-muted">{fmtPct(pct(u.used_bytes, q))} used</p>
            )}
          </div>
        </div>
        <ul className="grid min-w-36 gap-3 text-[13px]">
          {parts.map((x) => (
            <li key={x.k}>
              <span className="flex items-center gap-2 text-muted">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: x.color }}
                  aria-hidden
                />
                {x.k}
              </span>
              <span className="mt-0.5 flex justify-between gap-6 tabular">
                <span className="font-medium">{formatBytes(x.v)}</span>
                <span className="text-muted">{whole > 0 ? fmtPct(pct(x.v, whole)) : '0%'}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-md bg-surface-2 p-2.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Shows used, reserved and free space. The server does not report sizes per file type yet.
      </p>
    </Panel>
  );
}

function Provider({ className }: { className?: string }) {
  return (
    <Panel className={cn('p-5', className)}>
      <CardTitle
        icon={HardDrive}
        title="Storage provider"
        right={<Badge tone="warn">Not available yet</Badge>}
      />
      <p className="text-[13px] text-muted">
        Files are stored privately in the provider configured by the platform team when the service
        was deployed. Bucket, region and connection details are not reported to this page, and the
        provider cannot be changed or migrated from the app.
      </p>
      <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-2 p-2.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Provider changes are managed outside the application. Storage URLs and credentials are never
        shown here.
      </p>
    </Panel>
  );
}

function Summary({ u, className }: { u: Usage; className?: string }) {
  const q = u.quota_bytes;
  const rows: [string, string][] = [
    ['Total quota', q === null ? 'No quota' : formatBytes(q)],
    ['Used', formatBytes(u.used_bytes)],
    ['Free', q === null ? '—' : formatBytes(Math.max(0, q - u.used_bytes - u.reserved_bytes))],
    ['Reserved by uploads', formatBytes(u.reserved_bytes)],
    ['Usage percentage', q ? fmtPct(pct(u.used_bytes + u.reserved_bytes, q)) : '—'],
  ];
  return (
    <Panel className={cn('p-5', className)}>
      <CardTitle icon={Gauge} title="Storage summary" />
      <dl className="divide-y divide-line text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-2 p-2.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Reserved space includes files that are currently being uploaded but not yet processed.
      </p>
    </Panel>
  );
}

const OUTCOME_TONE = { success: 'ok', denied: 'warn', failure: 'danger' } as const;

function Recent({
  act,
  className,
}: {
  act: ReturnType<typeof useOrgActivity>;
  className?: string;
}) {
  const rows = (act.data?.items ?? []).slice(0, 6);
  return (
    <Panel className={cn('min-w-0 p-5', className)}>
      <CardTitle
        icon={ScrollText}
        title="Recent Storage Activity"
        hint="Latest file and folder events in the organization."
        right={
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/activity">View all</Link>
          </Button>
        }
      />
      {act.isPending ? (
        <Skeleton className="h-40" />
      ) : act.isError ? (
        <ErrorState error={act.error} onRetry={() => act.refetch()} className="py-4" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No recent activity.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[36rem] text-[13px]">
            <caption className="sr-only">Recent storage activity</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Resource</th>
                <th className="py-2 pl-3 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted">
                    {formatDateTime(e.occurred_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td
                    className="max-w-44 truncate px-3 py-2 text-muted"
                    title={e.actor_email ?? undefined}
                  >
                    {e.actor_email ?? 'System'}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2" title={e.target_label ?? undefined}>
                    {e.target_label ?? e.target_type ?? '—'}
                  </td>
                  <td className="py-2 pl-3">
                    <Badge tone={OUTCOME_TONE[e.outcome]}>{e.outcome}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function RecentFiles({ q, className }: { q: ReturnType<typeof useRecent>; className?: string }) {
  const rows = (q.data?.items ?? []).slice(0, 6);
  return (
    <Panel className={cn('min-w-0 p-5', className)}>
      <CardTitle
        icon={Clock}
        title="Recent Files"
        right={
          <Link href="/recent" className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        }
      />
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-4" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No recent files.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[22rem] text-[13px]">
            <caption className="sr-only">Recent files</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="py-2 pl-3 font-medium">Modified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-surface-2">
                  <td className="max-w-48 py-2 pr-3">
                    <Link
                      href={i.kind === 'folder' ? `/files/${i.id}` : `/documents/${i.id}`}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <ItemIcon
                        kind={i.kind}
                        name={i.name}
                        contentType={i.content_type}
                        size={18}
                      />
                      <span className="truncate" title={i.name}>
                        {i.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {i.kind === 'folder' ? 'Folder' : 'Document'}
                  </td>
                  <td className="px-3 py-2 tabular text-muted">
                    {typeof i.size_bytes === 'number' ? formatBytes(i.size_bytes) : '—'}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-3 text-muted">
                    {formatRelative(i.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function QuickActions({ className }: { className?: string }) {
  const items: [LucideIcon, string, string, string][] = [
    [Upload, 'Upload files', '/my-files', 'bg-accent-soft text-accent-soft-fg'],
    [FolderPlus, 'New folder', '/my-files', 'bg-warn-soft text-warn'],
    [ScrollText, 'View audit log', '/admin/audit', 'bg-danger-soft text-danger'],
    [Settings, 'Storage settings', '/admin/settings', 'bg-info-soft text-info'],
  ];
  return (
    <Panel className={cn('p-5', className)}>
      <CardTitle icon={Zap} title="Quick Actions" />
      <div className="grid grid-cols-2 gap-3">
        {items.map(([Icon, label, href, tone]) => (
          <Link
            key={label}
            href={href}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg p-4 text-center text-[13px] font-medium transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent',
              tone,
            )}
          >
            <Icon className="size-6" aria-hidden />
            <span className="text-text">{label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

const POLICIES: { icon: LucideIcon; title: string; desc: string; href?: string }[] = [
  { icon: Gauge, title: 'Quota & limits', desc: 'Manage organization storage quota' },
  { icon: FileType2, title: 'File type restrictions', desc: 'Control allowed file types' },
  {
    icon: Trash2,
    title: 'Retention & cleanup',
    desc: 'Trash retention is set in organization settings',
    href: '/admin/settings',
  },
  {
    icon: ScanSearch,
    title: 'Scan settings',
    desc: 'Review files held back by scanning',
    href: '/admin/quarantine',
  },
  { icon: Bell, title: 'Usage alerts', desc: 'Set up storage usage notifications' },
];

function Policies({ className }: { className?: string }) {
  return (
    <Panel className={cn('min-w-0 p-5', className)}>
      <CardTitle icon={Database} title="Storage settings & policies" />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
        {POLICIES.map(({ icon: Icon, title, desc, href }) => {
          const body = (
            <>
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-accent">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{title}</span>
                <span className="block truncate text-xs text-muted">{desc}</span>
              </span>
              {href ? (
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              ) : (
                <Badge tone="outline" className="shrink-0">
                  Not available yet
                </Badge>
              )}
            </>
          );
          return (
            <li key={title}>
              {href ? (
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-md p-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-md p-2 opacity-70" aria-disabled>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
