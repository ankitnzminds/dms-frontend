'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { AuditTable } from '@/components/admin/audit-table';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import type { AuditEvent } from '@/lib/api-client';
import { useAuditEvents, type AuditFilters } from './hooks';

const PAGE = 25;
type Draft = { action: string; outcome: string; resource_type: string; resource_id: string; actor_user_id: string; since: string; until: string };
const EMPTY: Draft = { action: '', outcome: '', resource_type: '', resource_id: '', actor_user_id: '', since: '', until: '' };

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Client-side CSV of exactly the rows currently loaded (one page). */
export function auditToCsv(items: AuditEvent[]): string {
  const head = ['time', 'action', 'outcome', 'actor_email', 'actor_user_id', 'resource_type', 'resource_id', 'request_id', 'metadata'];
  const rows = items.map((e) => [e.created_at, e.action, e.outcome, e.actor_email, e.actor_user_id, e.resource_type, e.resource_id, e.request_id, e.metadata]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function AuditView() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [offset, setOffset] = useState(0);

  const filters: AuditFilters = {
    action: applied.action || undefined,
    outcome: (applied.outcome || undefined) as AuditFilters['outcome'],
    resource_type: applied.resource_type || undefined,
    resource_id: applied.resource_id || undefined,
    actor_user_id: applied.actor_user_id || undefined,
    since: applied.since ? new Date(`${applied.since}T00:00:00`).toISOString() : undefined,
    until: applied.until ? new Date(`${applied.until}T23:59:59`).toISOString() : undefined,
    limit: PAGE,
    offset,
  };
  const q = useAuditEvents(filters);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function exportCsv() {
    if (!q.data) return;
    const blob = new Blob([auditToCsv(q.data.items)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-events-${offset + 1}-${offset + q.data.items.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Security-relevant events in this organization. Events cannot be edited."
        actions={
          <Button onClick={exportCsv} disabled={!q.data || q.data.items.length === 0}>
            <Download /> Export this page (CSV)
          </Button>
        }
      />
      <form
        className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Audit filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
          setOffset(0);
        }}
      >
        <Field id="a-action" label="Action starts with" hint="For example share. or document.">
          {(p) => <Input {...p} value={draft.action} onChange={set('action')} placeholder="share." />}
        </Field>
        <Field id="a-outcome" label="Outcome">
          {(p) => (
            <Select {...p} value={draft.outcome} onChange={set('outcome')}>
              <option value="">Any</option>
              <option value="success">success</option>
              <option value="denied">denied</option>
              <option value="failure">failure</option>
            </Select>
          )}
        </Field>
        <Field id="a-rtype" label="Resource type">
          {(p) => (
            <Select {...p} value={draft.resource_type} onChange={set('resource_type')}>
              <option value="">Any</option>
              {['document', 'folder', 'share', 'user', 'group', 'organization'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          )}
        </Field>
        <Field id="a-rid" label="Resource ID">
          {(p) => <Input {...p} value={draft.resource_id} onChange={set('resource_id')} />}
        </Field>
        <Field id="a-actor" label="Actor user ID">
          {(p) => <Input {...p} value={draft.actor_user_id} onChange={set('actor_user_id')} />}
        </Field>
        <Field id="a-since" label="From">
          {(p) => <Input {...p} type="date" value={draft.since} onChange={set('since')} />}
        </Field>
        <Field id="a-until" label="To">
          {(p) => <Input {...p} type="date" value={draft.until} onChange={set('until')} />}
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary">Apply filters</Button>
          <Button onClick={() => (setDraft(EMPTY), setApplied(EMPTY), setOffset(0))}>Reset</Button>
        </div>
      </form>
      <Panel>
        <AuditTable data={q.data} isLoading={q.isPending} error={q.error} onRetry={() => q.refetch()} onOffsetChange={setOffset} />
      </Panel>
    </>
  );
}
