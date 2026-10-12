'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { Label, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { api, call, type Schemas, type Version } from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Diff = Schemas['DiffOut'];
type Section = Schemas['DiffSectionOut'];
type Change = Record<string, unknown> & { op: string };
interface InlinePart {
  op: 'equal' | 'add' | 'remove';
  text: string;
}

function useCompare(documentId: string, from: number, to: number) {
  return useQuery({
    queryKey: ['version-compare', documentId, from, to],
    enabled: from > 0 && to > 0 && from !== to,
    staleTime: Infinity, // versions are immutable
    queryFn: ({ signal }) =>
      call<Diff>(
        api.GET('/api/v1/documents/{document_id}/versions/compare', {
          params: { path: { document_id: documentId }, query: { from, to } },
          signal,
        }),
      ),
  });
}

const OP_STYLE: Record<string, string> = {
  add: 'bg-ok-soft',
  remove: 'bg-danger-soft',
  change: 'bg-warn-soft',
  equal: '',
};
const OP_MARK: Record<string, string> = { add: '+', remove: '−', change: '~', equal: ' ' };

function Inline({ parts }: { parts: InlinePart[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span
          key={i}
          className={cn(
            p.op === 'add' && 'rounded-sm bg-ok/25 font-medium',
            p.op === 'remove' && 'rounded-sm bg-danger/25 line-through',
          )}
        >
          {p.text}
        </span>
      ))}
    </>
  );
}

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function ChangeRow({ c, mode }: { c: Change; mode: 'inline' | 'side' }) {
  if (c.op === 'skip')
    return (
      <li className="px-3 py-0.5 text-center text-[11px] text-faint">
        … {String(c.count)} unchanged line{c.count === 1 ? '' : 's'} …
      </li>
    );
  const loc = c.loc
    ? text(c.loc)
    : c.old_loc || c.new_loc
      ? `${text(c.old_loc) || '·'}→${text(c.new_loc) || '·'}`
      : '';
  const parts = c.inline as InlinePart[] | undefined;
  const oldText = text(c.old);
  const newText = text(c.new);
  const detail = c.detail ? text(c.detail) : c.kind ? text(c.kind) : null;
  const label = (
    <span className="flex w-28 shrink-0 flex-col text-[11px] text-faint">
      <span className="truncate" title={loc}>
        {loc}
      </span>
      {detail && (
        <span className="truncate text-warn" title={detail}>
          {detail}
        </span>
      )}
    </span>
  );
  if (mode === 'side' && c.op !== 'skip') {
    return (
      <li className={cn('grid grid-cols-[7rem_1fr_1fr] gap-2 px-3 py-1', OP_STYLE[c.op])}>
        {label}
        <span className={cn('whitespace-pre-wrap break-words', c.op === 'add' && 'text-faint')}>
          {parts ? <Inline parts={parts.filter((p) => p.op !== 'add')} /> : oldText}
        </span>
        <span className={cn('whitespace-pre-wrap break-words', c.op === 'remove' && 'text-faint')}>
          {parts ? <Inline parts={parts.filter((p) => p.op !== 'remove')} /> : newText}
        </span>
      </li>
    );
  }
  return (
    <li className={cn('flex gap-2 px-3 py-1', OP_STYLE[c.op])}>
      {label}
      <span aria-hidden className="w-3 shrink-0 font-mono text-muted">
        {OP_MARK[c.op]}
      </span>
      <span className="sr-only">{c.op}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {parts ? <Inline parts={parts} /> : c.op === 'remove' ? oldText : newText || oldText}
      </span>
    </li>
  );
}

function SectionView({ s, mode }: { s: Section; mode: 'inline' | 'side' }) {
  const changed = s.changes.filter((c) => c.op !== 'skip' && c.op !== 'equal').length;
  return (
    <details open={s.status !== 'unchanged'} className="rounded-md border border-line">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 bg-surface-2 px-3 py-1.5 text-[13px] font-medium">
        {s.title}
        <Badge
          tone={
            s.status === 'unchanged'
              ? 'neutral'
              : s.status === 'added'
                ? 'ok'
                : s.status === 'removed'
                  ? 'danger'
                  : 'warn'
          }
        >
          {s.status}
        </Badge>
        {changed > 0 && (
          <span className="text-xs font-normal text-muted">
            {changed} change{changed === 1 ? '' : 's'}
          </span>
        )}
      </summary>
      {s.note && <p className="px-3 py-1.5 text-xs text-muted">{s.note}</p>}
      {s.changes.length > 0 && (
        <ul className="max-h-96 overflow-auto font-mono text-xs leading-5">
          {s.changes.map((c, i) => (
            <ChangeRow key={i} c={c as Change} mode={mode} />
          ))}
        </ul>
      )}
    </details>
  );
}

function Result({ d }: { d: Diff }) {
  const [mode, setMode] = useState<'inline' | 'side'>('inline');
  const sum = d.summary;
  return (
    <div className="grid gap-3">
      <p className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone="outline">{d.kind.toUpperCase()}</Badge>
        {d.identical ? (
          <Badge tone="ok">No differences</Badge>
        ) : (
          sum && (
            <>
              <Badge tone="ok">{sum.added} added</Badge>
              <Badge tone="danger">{sum.removed} removed</Badge>
              <Badge tone="warn">{sum.changed} changed</Badge>
              <span className="text-xs text-muted">{sum.unchanged} unchanged</span>
            </>
          )
        )}
        {d.cached && <span className="text-xs text-faint">cached</span>}
        <span className="flex-1" />
        <span
          role="group"
          aria-label="View"
          className="flex overflow-hidden rounded-md border border-line text-xs"
        >
          {(['inline', 'side'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2 py-1',
                mode === m ? 'bg-accent text-accent-fg' : 'hover:bg-surface-2',
              )}
            >
              {m === 'inline' ? 'Inline' : 'Side by side'}
            </button>
          ))}
        </span>
      </p>
      {d.status !== 'ready' && (
        <p role="status" className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {d.status === 'failed' ? 'The comparison could not be completed: ' : ''}
          {d.message}
        </p>
      )}
      {d.truncated && (
        <p className="text-xs text-warn">Very large result: only the first changes are shown.</p>
      )}
      <div className="grid gap-2">
        {d.sections.map((s, i) => (
          <SectionView key={`${s.title}-${i}`} s={s} mode={mode} />
        ))}
      </div>
      {d.notes.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-medium">What this comparison covers</summary>
          <ul className="mt-1 list-disc pl-5">
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Compare any two (scan-clean) versions, format-aware. The backend explains what each format can and cannot show. */
export function CompareVersionsDialog({
  documentId,
  versions,
  open,
  onClose,
  initialFrom,
  initialTo,
}: {
  documentId: string;
  versions: Version[];
  open: boolean;
  onClose: () => void;
  initialFrom?: number;
  initialTo?: number;
}) {
  const clean = versions
    .filter((v) => v.scan_status === 'clean')
    .sort((a, b) => b.version_number - a.version_number);
  const [to, setTo] = useState(initialTo ?? clean[0]?.version_number ?? 0);
  const [from, setFrom] = useState(initialFrom ?? clean[1]?.version_number ?? 0);
  const q = useCompare(documentId, from, to);
  const meta = (n: number) => clean.find((v) => v.version_number === n);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl"
        title="Compare versions"
        description="Older on the left, newer on the right."
      >
        <DialogBody className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                ['Older', from, setFrom],
                ['Newer', to, setTo],
              ] as const
            ).map(([label, value, set]) => (
              <div key={label} className="grid gap-1">
                <Label htmlFor={`cmp-${label}`}>{label}</Label>
                <Select
                  id={`cmp-${label}`}
                  className="w-56"
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                >
                  {clean.map((v) => (
                    <option key={v.id} value={v.version_number}>
                      v{v.version_number} · {formatDateTime(v.created_at)}
                      {v.is_current ? ' (current)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            <span className="pb-1 text-xs text-muted">
              {meta(from) &&
                meta(to) &&
                `${formatBytes(meta(from)!.size_bytes)} → ${formatBytes(meta(to)!.size_bytes)}`}
            </span>
          </div>
          {from === to ? (
            <p className="text-[13px] text-muted">Pick two different versions.</p>
          ) : q.isPending ? (
            <SkeletonRows rows={4} label="Comparing" />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <Result d={q.data} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
