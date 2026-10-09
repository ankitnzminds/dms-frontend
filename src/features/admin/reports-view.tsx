'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { api, call } from '@/lib/api-client';
import { titleCase } from '@/lib/format';

export type ReportSummary = Record<string, unknown>;

export function useReportSummary(days: number) {
  return useQuery({
    queryKey: ['admin', 'report', days],
    queryFn: ({ signal }) =>
      call<ReportSummary>(
        api.GET('/api/v1/admin/reports/summary', { params: { query: { days } }, signal }),
      ),
  });
}

/** Defensive: only finite numbers from `{label: n}` objects. */
export function numericEntries(v: unknown): Array<[string, number]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
  );
}

export function topActions(v: unknown): Array<{ action: string; count: number }> {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is { action: string; count: number } =>
      !!x && typeof x.action === 'string' && typeof x.count === 'number',
  );
}

function Bars({
  title,
  data,
  empty,
}: {
  title: string;
  data: Array<[string, number]>;
  empty: string;
}) {
  const max = Math.max(1, ...data.map(([, n]) => n));
  return (
    <Panel className="p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-1.5">
          {data.map(([k, n]) => (
            <li
              key={k}
              className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-[13px]"
              data-testid="bar-row"
            >
              <span className="truncate text-muted">{titleCase(k)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
              <span className="tabular text-right font-medium">{n.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function ReportsView() {
  const [days, setDays] = useState(30);
  const q = useReportSummary(days);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Real counts from the last period. Nothing here is estimated."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="rep-days" className="text-[13px]">
              Period
            </label>
            <Select
              id="rep-days"
              className="w-36"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {q.isPending ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Bars
            title="Documents by classification"
            data={numericEntries(q.data.documents_by_classification)}
            empty="No documents yet."
          />
          <Bars
            title="Documents by status"
            data={numericEntries(q.data.documents_by_status)}
            empty="No documents yet."
          />
          <Bars title="Shares" data={numericEntries(q.data.shares)} empty="No shares." />
          <Bars
            title="Approval runs"
            data={numericEntries(q.data.workflow_runs)}
            empty="No approval runs in this period."
          />
          <Bars
            title="Signature requests"
            data={numericEntries(q.data.signature_requests)}
            empty="No signature requests in this period."
          />
          <Bars
            title="Legal holds"
            data={numericEntries(q.data.legal_holds)}
            empty="No legal holds."
          />
          <Bars
            title="Audit events by outcome"
            data={numericEntries(q.data.audit_events_by_outcome)}
            empty="No audit events in this period."
          />
          <Bars
            title="Most frequent actions"
            data={topActions(q.data.top_actions).map((a) => [a.action, a.count])}
            empty="No activity in this period."
          />
          <Panel className="p-4 md:col-span-2">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Retention policies enabled</dt>
                <dd className="text-[17px] font-semibold tabular" data-testid="stat-retention">
                  {typeof q.data.retention_policies_enabled === 'number'
                    ? q.data.retention_policies_enabled
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Denied access attempts</dt>
                <dd className="text-[17px] font-semibold tabular" data-testid="stat-denied">
                  {typeof q.data.denied_attempts === 'number' ? q.data.denied_attempts : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Period</dt>
                <dd className="text-[17px] font-semibold tabular">
                  {typeof q.data.period_days === 'number' ? `${q.data.period_days} days` : '-'}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      )}
    </>
  );
}
