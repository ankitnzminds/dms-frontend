'use client';

import {
  Bell,
  ChevronRight,
  CloudUpload,
  Database,
  FileScan,
  FileText,
  FileType2,
  Folder,
  Gauge,
  HardDrive,
  Info,
  Layers,
  PieChart,
  RefreshCw,
  Users,
  ScanSearch,
  Trash2,
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
import { useAdminUsers, useUserQuotas } from '@/features/admin-users/api';
import { useOrgUsage } from '@/features/files/hooks';
import { fmtCount, formatBytes, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Usage = NonNullable<ReturnType<typeof useOrgUsage>['data']>;

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (v: number) => (v > 0 && v < 1 ? '< 1%' : `${v.toFixed(v < 10 && v > 0 ? 1 : 0)}%`);

const NOTE = 'mt-3 flex items-start gap-2 rounded-md bg-surface-2 p-2.5 text-xs text-muted';

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
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
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

export function StorageView() {
  const u = useOrgUsage();
  const act = useOrgActivity(true, null);
  const refresh = () => {
    void u.refetch();
    void act.refetch();
  };
  return (
    <>
      <PageHeader
        title="Storage"
        description="Quota and usage for this organization."
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
            <Button variant="secondary" onClick={refresh} disabled={u.isFetching}>
              <RefreshCw className={u.isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
          </>
        }
      />
      {u.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-52 lg:col-span-2" />
          <Skeleton className="h-52" />
        </div>
      ) : u.isError ? (
        <Panel>
          <ErrorState error={u.error} onRetry={() => u.refetch()} className="py-8" />
        </Panel>
      ) : (
        <div className="grid min-w-0 gap-4 pb-6 lg:grid-cols-6">
          <Overview u={u.data} className="lg:col-span-4" />
          <Donut u={u.data} className="lg:col-span-2" />
          <Breakdown className="lg:col-span-2" />
          <Provider className="lg:col-span-2" />
          <Summary u={u.data} className="lg:col-span-2" />
          <ByUser u={u.data} className="lg:col-span-6" />
          <Recent act={act} className="lg:col-span-4" />
          <Policies className="lg:col-span-2" />
        </div>
      )}
    </>
  );
}

function Overview({ u, className }: { u: Usage; className?: string }) {
  const s = status(u);
  const total = u.used_bytes + u.reserved_bytes;
  const p = u.quota_bytes ? Math.min(100, pct(total, u.quota_bytes)) : 0;
  const metrics: [LucideIcon, string, string, string][] = [
    [FileText, 'Documents', fmtCount(u.documents), 'Files in the organization'],
    [Layers, 'Versions', fmtCount(u.versions), 'All stored versions'],
    [Folder, 'Folders', fmtCount(u.folders), 'Folders in the organization'],
    [
      ScanSearch,
      'Waiting for scan',
      fmtCount(u.pending_scans),
      u.pending_scans ? 'Files being scanned' : 'No pending files',
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
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 xl:grid-cols-4">
        {metrics.map(([Icon, k, v, sub]) => (
          <div key={k} className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-accent">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="text-lg font-semibold leading-tight tabular">{v}</dd>
              <p className="truncate text-xs text-muted">{sub}</p>
            </div>
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
    ...(q === null ? [] : [{ k: 'Free', v: free, color: 'var(--color-surface-3)' }]),
    { k: 'Reserved by uploads', v: u.reserved_bytes, color: '#a855f7' },
  ];
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Panel className={cn('flex flex-wrap items-center justify-center gap-6 p-5', className)}>
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
              .filter((x) => x.v > 0 && x.k !== 'Free')
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
          {q !== null && <p className="text-xs text-muted">{fmtPct(pct(u.used_bytes, q))} used</p>}
        </div>
      </div>
      <ul className="grid min-w-36 gap-3 text-[13px]">
        {parts.map((x) => (
          <li key={x.k}>
            <span className="flex items-center gap-2 text-muted">
              <span className="size-2.5 rounded-full" style={{ background: x.color }} aria-hidden />
              {x.k}
            </span>
            <span className="mt-0.5 flex justify-between gap-6 tabular">
              <span className="font-medium">{formatBytes(x.v)}</span>
              <span className="text-muted">{whole > 0 ? fmtPct(pct(x.v, whole)) : '0%'}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const CATEGORIES = ['Documents', 'Versions', 'Images', 'Videos', 'Audio', 'Archives', 'Other'];

function Breakdown({ className }: { className?: string }) {
  return (
    <Panel className={cn('p-5', className)}>
      <CardTitle
        icon={PieChart}
        title="Storage breakdown"
        hint="Distribution of used storage across file types."
      />
      <p className={cn(NOTE, 'mt-0 mb-3')}>
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        The server does not report storage per file type yet, so no sizes are shown here.
      </p>
      <ul className="grid gap-2 text-[13px]" aria-label="File categories">
        {CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-3">
            <span className="w-24 text-muted">{c}</span>
            <span className="h-2 flex-1 rounded-full bg-surface-3" aria-hidden />
            <span className="w-8 text-right text-muted">—</span>
          </li>
        ))}
      </ul>
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
      <p className={NOTE}>
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
      <p className={NOTE}>
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Reserved space includes files that are currently being uploaded but not yet processed.
      </p>
    </Panel>
  );
}

const STORAGE_EVENTS: Record<string, string> = {
  'document.created': 'Uploaded',
  'document.version_created': 'New version',
  'folder.created': 'Created',
};

function Recent({
  act,
  className,
}: {
  act: ReturnType<typeof useOrgActivity>;
  className?: string;
}) {
  const rows = (act.data?.items ?? []).filter((e) => e.action in STORAGE_EVENTS).slice(0, 6);
  return (
    <Panel className={cn('min-w-0 p-5', className)}>
      <CardTitle
        icon={FileScan}
        title="Recent storage activity"
        hint="Latest files and folders contributing to storage usage."
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
        <p className="py-6 text-center text-[13px] text-muted">No recent uploads or new folders.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-[13px]">
            <caption className="sr-only">Recent storage activity</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="py-2 pl-3 font-medium">Added by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((e) => {
                const isFolder = e.target_type === 'folder' || e.action.startsWith('folder.');
                const name = e.target_label ?? 'Unnamed';
                const size = e.metadata.size_bytes;
                return (
                  <tr key={e.id} className="hover:bg-surface-2">
                    <td className="py-2 pr-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <ItemIcon kind={isFolder ? 'folder' : 'document'} name={name} size={18} />
                        <span className="truncate" title={name}>
                          {name}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{isFolder ? 'Folder' : 'Document'}</td>
                    <td className="px-3 py-2 tabular text-muted">
                      {typeof size === 'number' ? formatBytes(size) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="ok">{STORAGE_EVENTS[e.action]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {formatDateTime(e.occurred_at)}
                    </td>
                    <td className="max-w-40 truncate py-2 pl-3" title={e.actor_email ?? undefined}>
                      {e.actor_email ?? 'System'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
      <CardTitle icon={CloudUpload} title="Storage settings & policies" />
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

/** Per-person usage: what each user has stored and any personal limit (admin quota endpoint, one call per user). */
function ByUser({ u, className }: { u: Usage; className?: string }) {
  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 50,
    offset: 0,
  });
  const list = users.data?.items ?? [];
  const quotas = useUserQuotas(list.map((x) => x.user_id));
  const rows = list
    .map((x, i) => ({ user: x, q: quotas[i] }))
    .sort((a, b) => (b.q?.data?.used_bytes ?? -1) - (a.q?.data?.used_bytes ?? -1));
  return (
    <Panel className={cn('min-w-0 p-5', className)}>
      <CardTitle
        icon={Users}
        title="Storage by user"
        hint="What each person has stored, and their personal limit if one is set."
        right={
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/users">Manage users</Link>
          </Button>
        }
      />
      {users.isPending ? (
        <Skeleton className="h-32" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} className="py-4" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">No users yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-[13px]">
            <caption className="sr-only">Storage used by each user</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Used</th>
                <th className="px-3 py-2 font-medium">Personal limit</th>
                <th className="px-3 py-2 font-medium">Available</th>
                <th className="w-48 py-2 pl-3 font-medium">Share of organization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ user, q }) => {
                const d = q?.data;
                const share = d ? pct(d.used_bytes, u.used_bytes || d.organization_used_bytes) : 0;
                return (
                  <tr key={user.user_id} className="hover:bg-surface-2">
                    <td className="max-w-56 py-2 pr-3">
                      <span className="block truncate font-medium">
                        {user.display_name ?? user.email}
                      </span>
                      <span className="block truncate text-xs text-muted">{user.email}</span>
                    </td>
                    {q?.isError ? (
                      <td colSpan={4} className="px-3 py-2 text-xs text-muted">
                        Usage could not be loaded.
                      </td>
                    ) : !d ? (
                      <td colSpan={4} className="px-3 py-2">
                        <Skeleton className="h-4" />
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 tabular">{formatBytes(d.used_bytes)}</td>
                        <td className="px-3 py-2 tabular text-muted">
                          {d.quota_bytes ? formatBytes(d.quota_bytes) : 'No personal limit'}
                        </td>
                        <td className="px-3 py-2 tabular text-muted">
                          {d.available_bytes === null ? '—' : formatBytes(d.available_bytes)}
                        </td>
                        <td className="py-2 pl-3">
                          <span className="flex items-center gap-2">
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                              <span
                                className="block h-full rounded-full bg-accent"
                                style={{ width: `${Math.max(share, share > 0 ? 1 : 0)}%` }}
                              />
                            </span>
                            <span className="w-10 text-right text-xs tabular text-muted">
                              {fmtPct(share)}
                            </span>
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
