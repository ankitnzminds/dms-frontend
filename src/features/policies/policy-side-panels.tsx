'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  History,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { useAdminUsers } from '@/features/admin-users/api';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import {
  useComparePolicy,
  useRollbackPolicy,
  useSimulatePolicy,
  type Grammar,
  type PolicyDetail,
  type SimulationOut,
  type ValidationReport,
} from './api';
import { SELECT } from './policy-form-parts';
import { label } from './policy-model';

export function ValidationPanel({ report }: { report: ValidationReport | null }) {
  if (!report) {
    return <p className="text-xs text-muted">Not validated yet. Validate before publishing.</p>;
  }
  return (
    <div className="space-y-2 text-[13px]" role="status">
      <p className="flex items-center gap-1.5 font-medium">
        {report.valid ? (
          <>
            <CheckCircle2 className="size-4 text-ok" aria-hidden /> Valid (revision{' '}
            {report.revision})
          </>
        ) : (
          <>
            <XCircle className="size-4 text-danger" aria-hidden /> Not valid
          </>
        )}
      </p>
      {report.issues.map((i, k) => (
        <p key={k} className="text-danger">
          <span className="font-mono text-xs">{i.path}</span> — {i.message}
        </p>
      ))}
      {report.warnings.map((w, k) => (
        <p key={k} className="flex gap-1.5 text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
        </p>
      ))}
      {report.valid && (
        <p className="text-muted">
          Impact: about <strong>{report.affected_members ?? 0}</strong> active member
          {report.affected_members === 1 ? '' : 's'} match the subjects
          {report.scope_name ? ` · scope: ${report.scope_name}` : ''}.
        </p>
      )}
    </div>
  );
}

const OUTCOME_TONE = { allow: 'ok', deny: 'danger', require_approval: 'warn' } as const;

export function SimulatePanel({
  grammar,
  policyId,
  defaultActions,
}: {
  grammar: Grammar;
  policyId?: string;
  defaultActions: string[];
}) {
  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 100,
    offset: 0,
  });
  const sim = useSimulatePolicy();
  const [userId, setUserId] = useState('');
  const [kind, setKind] = useState<'document' | 'folder'>('document');
  const [docId, setDocId] = useState('');
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [action, setAction] = useState(defaultActions[0] ?? 'download');
  const [withDraft, setWithDraft] = useState(!!policyId);
  const [out, setOut] = useState<SimulationOut | null>(null);
  const resourceId = kind === 'document' ? docId.trim() : (folder?.id ?? '');
  const ready = !!userId && !!resourceId;

  return (
    <div className="space-y-2.5 text-[13px]">
      <p className="text-xs text-muted">
        Shows what the server would decide. Nothing is granted, changed or executed.
      </p>
      <select
        aria-label="Simulate as"
        className={SELECT}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      >
        <option value="">Simulate as…</option>
        {(users.data?.items ?? []).map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.display_name ?? u.email}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Item type"
          className={SELECT}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'document' | 'folder')}
        >
          <option value="document">File</option>
          <option value="folder">Folder</option>
        </select>
        <select
          aria-label="Action"
          className={SELECT}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {grammar.actions.map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </select>
      </div>
      {kind === 'document' ? (
        <Input
          aria-label="File ID"
          placeholder="File ID (from the file's details)"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
        />
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-md border border-line">
          <FolderPicker onChange={setFolder} />
        </div>
      )}
      {policyId && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={withDraft}
            onChange={(e) => setWithDraft(e.target.checked)}
          />
          Include this policy&apos;s latest draft as if published
        </label>
      )}
      <Button
        size="sm"
        disabled={!ready || sim.isPending}
        onClick={() =>
          sim.mutate(
            {
              user_id: userId,
              resource_type: kind,
              resource_id: resourceId,
              action,
              draft_policy_id: withDraft && policyId ? policyId : null,
            },
            { onSuccess: setOut, onError: (e) => toast.error(friendlyMessage(e)) },
          )
        }
      >
        <FlaskConical /> Simulate
      </Button>
      {out && (
        <div className="space-y-1.5 rounded-md border border-line bg-surface-2 p-3" role="status">
          <p className="flex items-center gap-2">
            <Badge tone="outline">Simulation</Badge>
            <Badge tone={OUTCOME_TONE[out.outcome]}>{label(out.outcome)}</Badge>
            <span className="font-mono text-xs">{out.reason}</span>
          </p>
          <p className="text-muted">
            {out.user_email} · {label(out.action)} · {out.resource_name}
          </p>
          <p>
            Permission via ACL/shares: <strong>{out.holds_permission ? 'held' : 'not held'}</strong>
          </p>
          {out.matched.map((m) => (
            <p key={`${m.policy_id}-${m.revision}`} className="text-xs">
              {m.name} · v{m.revision} · {m.effect}
              {m.mandatory ? ' · mandatory' : ''} · {m.source}
            </p>
          ))}
          {out.observed_only.map((m) => (
            <p key={`o-${m.policy_id}`} className="text-xs text-info">
              Would match (observe only): {m.name} v{m.revision}
            </p>
          ))}
          {out.notes.map((n, i) => (
            <p key={i} className="text-xs text-muted">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryPanel({ policy }: { policy: PolicyDetail }) {
  const revs = [...policy.revisions].reverse();
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const diff = useComparePolicy(policy.id, a, b);
  const rollback = useRollbackPolicy();
  const [target, setTarget] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3 text-[13px]">
      <ul className="space-y-1.5">
        {revs.map((r) => (
          <li key={r.id} className="rounded-md border border-line p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <strong>v{r.revision}</strong>
              <Badge
                tone={
                  r.status === 'published'
                    ? 'ok'
                    : r.status === 'superseded'
                      ? 'outline'
                      : 'neutral'
                }
              >
                {label(r.status)}
              </Badge>
              <span className="text-xs text-muted">
                {r.published_at
                  ? `published ${formatDateTime(r.published_at)}`
                  : formatDateTime(r.created_at)}
              </span>
            </div>
            {r.change_reason && <p className="mt-1 text-xs text-muted">“{r.change_reason}”</p>}
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="cmp-a"
                  checked={a === r.revision}
                  onChange={() => setA(r.revision)}
                />{' '}
                from
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="cmp-b"
                  checked={b === r.revision}
                  onChange={() => setB(r.revision)}
                />{' '}
                to
              </label>
              {policy.status !== 'archived' && r.status !== 'draft' && r.status !== 'validated' && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-accent hover:underline"
                  onClick={() => setTarget(r.revision)}
                >
                  <RotateCcw className="size-3" /> Roll back to this
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {a && b && diff.data && (
        <div className="rounded-md border border-line bg-surface-2 p-2.5 text-xs">
          <p className="mb-1 font-medium">
            <History className="mr-1 inline size-3" aria-hidden />v{diff.data.from_revision} → v
            {diff.data.to_revision}
          </p>
          {diff.data.changes.length === 0 && <p className="text-muted">No differences.</p>}
          {diff.data.changes.map((c, i) => (
            <p key={i} className="break-words">
              <strong>{String(c.field)}</strong>: <code>{JSON.stringify(c.from)}</code> →{' '}
              <code>{JSON.stringify(c.to)}</code>
            </p>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Roll back to v${target}?`}
        description="This creates a new draft copied from that revision. It must be validated and published again; the current live version keeps enforcing until then."
        confirmLabel="Create draft"
        pending={rollback.isPending}
        onConfirm={() => {
          if (!reason.trim()) {
            toast.error('Enter a reason for the rollback.');
            return;
          }
          rollback.mutate(
            { id: policy.id, toRevision: target!, reason: reason.trim() },
            {
              onSuccess: () => {
                toast.success('Draft created from the old revision');
                setTarget(null);
                setReason('');
              },
              onError: (e) => toast.error(friendlyMessage(e)),
            },
          );
        }}
      >
        <Input
          aria-label="Reason for the rollback"
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
