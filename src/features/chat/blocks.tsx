'use client';

import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, titleCase } from '@/lib/format';
import { actionLabel } from '@/lib/permissions';
import {
  actionErrorText,
  useCancelAction,
  useConfirmAction,
  usePendingAction,
  type PendingAction,
} from './hooks';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => arr(v).filter(isObj);

const hrefFor = (kind: unknown, id: unknown) =>
  typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
    ? kind === 'folder'
      ? `/files/${id}`
      : `/documents/${id}`
    : null;

function Card({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-line bg-surface-2/60 p-3 text-[13px]"
      data-testid={testId}
    >
      <h4 className="mb-1.5 text-xs font-semibold text-muted">{title}</h4>
      {children}
    </section>
  );
}

function DocumentsBlock({ b }: { b: Obj }) {
  const items = objs(b.items);
  if (items.length === 0) return null;
  return (
    <Card title="Documents" testId="block-documents">
      <ul className="grid gap-1.5">
        {items.map((it, i) => {
          const href = hrefFor(it.kind, it.id);
          return (
            <li key={i} className="flex items-start gap-2">
              <ItemIcon
                kind={it.kind === 'folder' ? 'folder' : 'document'}
                name={str(it.name)}
                contentType={str(it.content_type)}
                size={16}
                className="mt-0.5"
              />
              <span className="min-w-0">
                {href ? (
                  <Link className="font-medium hover:text-accent hover:underline" href={href}>
                    {str(it.name) ?? 'Untitled'}
                  </Link>
                ) : (
                  <span className="font-medium">{str(it.name) ?? 'Untitled'}</span>
                )}
                <span className="block truncate text-xs text-muted">
                  {[str(it.location), str(it.content_type)].filter(Boolean).join(' · ')}
                  {str(it.updated_at) ? ` · ${formatDateTime(str(it.updated_at))}` : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SharingBlock({ b }: { b: Obj }) {
  const direct = objs(b.direct_shares);
  const grants = Array.isArray(b.permission_grants) ? objs(b.permission_grants) : null;
  const notes = arr(b.notes).filter((n): n is string => typeof n === 'string');
  return (
    <Card title="Who has access" testId="block-sharing">
      {direct.length === 0 ? (
        <p className="text-muted">No direct shares.</p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Direct shares">
          {direct.map((s, i) => (
            <li key={i}>
              <span className="font-medium">
                {objs(s.recipients)
                  .map((r) => str(r.email) ?? str(r.name) ?? 'someone')
                  .join(', ') || 'Someone'}
              </span>{' '}
              <span className="text-xs text-muted">
                {arr(s.permissions)
                  .map((p) => actionLabel(String(p)))
                  .join(', ')}
                {str(s.expires_at)
                  ? ` · expires ${formatDateTime(str(s.expires_at))}`
                  : ' · no expiry'}
                {str(s.status) ? ` · ${s.status}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {grants === null ? (
        <p className="mt-1.5 text-xs text-muted">
          Permission grants are only shown to people who manage access.
        </p>
      ) : (
        grants.length > 0 && (
          <ul className="mt-1.5 grid gap-1" aria-label="Permission grants">
            {grants.map((g, i) => (
              <li key={i} className="text-xs">
                <span className="font-medium">
                  {str(g.subject) ?? str(g.subject_type) ?? 'Someone'}
                </span>{' '}
                <span className="text-muted">
                  {arr(g.permissions)
                    .map((p) => actionLabel(String(p)))
                    .join(', ')}
                  {g.applies_to_children ? ' · applies to items inside' : ''}
                </span>
              </li>
            ))}
          </ul>
        )
      )}
      {notes.map((n, i) => (
        <p key={i} className="mt-1 text-xs text-muted">
          {n}
        </p>
      ))}
    </Card>
  );
}

function TasksBlock({ b }: { b: Obj }) {
  const items = objs(b.items);
  if (!items.length) return null;
  return (
    <Card title="Approval tasks" testId="block-tasks">
      <ul className="grid gap-1.5">
        {items.map((t, i) => (
          <li key={i}>
            {hrefFor('document', t.document_id) ? (
              <Link
                className="font-medium hover:text-accent hover:underline"
                href={hrefFor('document', t.document_id)!}
              >
                {str(t.document) ?? 'Document'}
              </Link>
            ) : (
              <span className="font-medium">{str(t.document) ?? 'Document'}</span>
            )}{' '}
            <span className="text-xs text-muted">
              {str(t.step)} · {str(t.status)}
              {t.overdue ? ' · overdue' : ''}
              {str(t.due_at) ? ` · due ${formatDateTime(str(t.due_at))}` : ''}
            </span>{' '}
            <Link className="text-xs text-accent hover:underline" href="/approvals">
              Open approvals
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RequestsBlock({ b }: { b: Obj }) {
  const items = objs(b.items);
  if (!items.length) return null;
  return (
    <Card title="Access requests" testId="block-access-requests">
      <ul className="grid gap-1.5">
        {items.map((r, i) => (
          <li key={i}>
            <span className="font-medium">{str(r.resource) ?? 'Item'}</span>{' '}
            <Badge
              tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'danger' : 'info'}
            >
              {titleCase(String(r.status ?? ''))}
            </Badge>{' '}
            <span className="text-xs text-muted">
              {arr(r.requested)
                .map((a) => actionLabel(String(a)))
                .join(', ')}
              {str(r.decision_reason) ? ` · ${r.decision_reason}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <Link className="mt-1 inline-block text-xs text-accent hover:underline" href="/requests">
        Open access requests
      </Link>
    </Card>
  );
}

const STATUS_TONE: Record<string, 'ok' | 'danger' | 'warn' | 'info' | 'neutral'> = {
  pending: 'info',
  confirmed: 'info',
  executed: 'ok',
  partially_executed: 'warn',
  failed: 'danger',
  cancelled: 'neutral',
  expired: 'warn',
  invalidated: 'warn',
};

function Place({ v }: { v: unknown }) {
  if (!isObj(v)) return null;
  return (
    <span>
      <span className="font-medium">{str(v.name) ?? 'Item'}</span>
      {str(v.location) && <span className="text-muted"> in {str(v.location)}</span>}
    </span>
  );
}

/** Exact targets, destination, recipients, permissions, expiry and impact of a server-built action preview. */
export function ActionPreview({ a }: { a: PendingAction }) {
  const p = a.preview as Obj;
  const targets = objs(p.targets);
  const recipients = objs(p.recipients);
  const perms = arr(p.permissions).map(String);
  const wf = isObj(p.workflow) ? p.workflow : null;
  return (
    <div className="grid gap-1.5">
      <p className="font-semibold">{str(p.title) ?? titleCase(a.action_type)}</p>
      {targets.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted">
            {targets.length === 1 ? 'Item' : `${targets.length} items`}
          </p>
          <ul className="grid gap-0.5" aria-label="Targets">
            {targets.map((t, i) => (
              <li key={i}>
                <Place v={t} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {isObj(p.destination) && (
        <p>
          <span className="text-xs font-medium text-muted">Destination: </span>
          <Place v={p.destination} />
        </p>
      )}
      {recipients.length > 0 && (
        <p>
          <span className="text-xs font-medium text-muted">Recipients: </span>
          {recipients.map((r) => str(r.email) ?? str(r.name) ?? str(r.id) ?? 'someone').join(', ')}
        </p>
      )}
      {perms.length > 0 && (
        <p className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-muted">Permissions: </span>
          {perms.map((x) => (
            <Badge key={x}>{actionLabel(x)}</Badge>
          ))}
        </p>
      )}
      {str(p.expires_at) && (
        <p>
          <span className="text-xs font-medium text-muted">Access expires: </span>
          {formatDateTime(str(p.expires_at))}
        </p>
      )}
      {wf && (
        <div>
          <p className="text-xs font-medium text-muted">Workflow: {str(wf.name)}</p>
          <ol className="list-decimal pl-5 text-xs" aria-label="Workflow steps">
            {objs(wf.steps).map((s, i) => (
              <li key={i}>{str(s.name) ?? `Step ${i + 1}`}</li>
            ))}
          </ol>
        </div>
      )}
      {str(p.impact) && <p className="text-muted">{str(p.impact)}</p>}
      {p.destructive === true && (
        <p className="flex items-center gap-1 text-danger">
          <AlertTriangle className="size-4" aria-hidden /> This is a destructive action.
        </p>
      )}
    </div>
  );
}

function ResultList({ result }: { result: Obj | null | undefined }) {
  const rows = objs(result?.results);
  if (!rows.length) return null;
  return (
    <ul className="mt-1 grid gap-1" aria-label="Per-item results" data-testid="action-results">
      {rows.map((r, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs" data-status={String(r.status)}>
          {r.status === 'ok' ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
          ) : r.status === 'skipped' ? (
            <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
          )}
          <span>
            {str(r.name) ?? str(r.new_name) ?? str(r.id) ?? 'Item'}:{' '}
            {r.status === 'ok' ? 'done' : (str(r.message) ?? str(r.code) ?? String(r.status))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Confirmation card bound to a server-created pending action (id + payload hash). */
export function ActionCard({ id, onAskAgain }: { id: string; onAskAgain?: () => void }) {
  const q = usePendingAction(id);
  const confirm = useConfirmAction();
  const cancel = useCancelAction();
  const a = q.data;
  const err = confirm.error ?? cancel.error;
  const [now] = useState(() => Date.now());

  if (q.isPending)
    return (
      <Card title="Action" testId="action-card">
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the preview…
        </p>
      </Card>
    );
  if (q.isError || !a)
    return (
      <Card title="Action" testId="action-card">
        <p role="alert" className="text-danger">
          This action is not available any more. Ask again for a fresh preview.
        </p>
      </Card>
    );

  const expired = a.status === 'pending' && new Date(a.expires_at).getTime() < now;
  const open = a.status === 'pending' && !expired;
  const busy = confirm.isPending || cancel.isPending;
  return (
    <Card title="Confirmation needed" testId="action-card">
      <div data-status={a.status}>
        <ActionPreview a={a} />
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Badge
            tone={STATUS_TONE[expired ? 'expired' : a.status] ?? 'neutral'}
            data-testid="action-status"
          >
            {titleCase(expired ? 'expired' : a.status)}
          </Badge>
          {open && (
            <span className="text-xs text-muted">Valid until {formatDateTime(a.expires_at)}</span>
          )}
          <span
            className="font-mono text-[11px] text-faint"
            title="Reference bound to this exact action"
          >
            ref {a.payload_hash.slice(0, 8)}
          </span>
        </p>
        {open && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={isObj(a.preview) && a.preview.destructive === true ? 'danger' : 'primary'}
              disabled={busy}
              onClick={() => confirm.mutate({ id: a.id, payloadHash: a.payload_hash })}
              data-testid="action-confirm"
            >
              {confirm.isPending && <Loader2 className="animate-spin" aria-hidden />} Confirm
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => cancel.mutate({ id: a.id })}
              data-testid="action-cancel"
            >
              Cancel
            </Button>
          </div>
        )}
        {(expired || ['expired', 'invalidated'].includes(a.status)) && (
          <p className="mt-1 text-xs text-warn">
            This preview can no longer be used. Ask again for a fresh preview.{' '}
            {onAskAgain && (
              <button type="button" className="text-accent underline" onClick={onAskAgain}>
                Ask again
              </button>
            )}
          </p>
        )}
        {err && (
          <p role="alert" className="mt-1 text-xs text-danger" data-testid="action-error">
            {actionErrorText(err)}
          </p>
        )}
        {['executed', 'partially_executed', 'failed'].includes(a.status) && (
          <div className="mt-1">
            {a.status === 'executed' && <p className="text-xs text-ok">Done.</p>}
            {a.status === 'partially_executed' && (
              <p className="text-xs text-warn">Some items could not be processed.</p>
            )}
            {a.status === 'failed' && (
              <p role="alert" className="text-xs text-danger">
                It could not be completed
                {a.error_code ? ` (${a.error_code.replace(/_/g, ' ')})` : ''}. Ask again for a fresh
                preview.
              </p>
            )}
            <ResultList result={a.result as Obj | null | undefined} />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Render server-built blocks by type; unknown types are ignored. */
export function Blocks({
  blocks,
  onAskAgain,
}: {
  blocks: Obj[] | undefined;
  onAskAgain?: () => void;
}) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-2 grid gap-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'documents':
            return <DocumentsBlock key={i} b={b} />;
          case 'sharing':
            return <SharingBlock key={i} b={b} />;
          case 'tasks':
            return <TasksBlock key={i} b={b} />;
          case 'access_requests':
            return <RequestsBlock key={i} b={b} />;
          case 'pending_action':
            return typeof b.action_id === 'string' ? (
              <ActionCard key={i} id={b.action_id} onAskAgain={onAskAgain} />
            ) : null;
          case 'action_result':
            return (
              <p key={i} className="text-xs text-muted" data-testid="block-action-result">
                Action {titleCase(String(b.status ?? 'done')).toLowerCase()}.
              </p>
            );
          case 'context': {
            const href = hrefFor(
              b.document_id ? 'document' : 'folder',
              b.document_id ?? b.folder_id,
            );
            return href ? (
              <p key={i} className="text-xs text-muted">
                Asked about{' '}
                <Link className="text-accent hover:underline" href={href}>
                  {b.document_id ? 'this file' : 'this folder'}
                </Link>
              </p>
            ) : null;
          }
          default:
            return null; // ignore unknown block types
        }
      })}
    </div>
  );
}
