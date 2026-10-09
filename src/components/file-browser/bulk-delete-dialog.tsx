'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { useDeleteItem } from '@/features/files/hooks';
import { friendlyMessage } from '@/lib/api-client';

export interface BulkItem {
  kind: 'folder' | 'document';
  id: string;
  name: string;
}
type Result = { item: BulkItem; ok: boolean; message?: string };

/** Confirms, then deletes one by one (no bulk endpoint) and reports a per-item result. */
export function BulkDeleteDialog({
  items: liveItems,
  open,
  onOpenChange,
  onFinished,
}: {
  items: BulkItem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFinished?: (failedIds: string[]) => void;
}) {
  const del = useDeleteItem();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  // The selection shrinks as the list refetches after each delete, so freeze it for the run.
  const [frozen, setFrozen] = useState<BulkItem[] | null>(null);
  const items = frozen ?? liveItems;

  async function run() {
    const batch = liveItems;
    setFrozen(batch);
    setRunning(true);
    const out: Result[] = [];
    for (const item of batch) {
      try {
        await del.mutateAsync({ kind: item.kind, id: item.id });
        out.push({ item, ok: true });
      } catch (e) {
        out.push({ item, ok: false, message: friendlyMessage(e) });
      }
      setResults([...out]);
    }
    setRunning(false);
    onFinished?.(out.filter((r) => !r.ok).map((r) => r.item.id));
  }

  const done = results && results.length === items.length && !running;
  const okCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !running && (onOpenChange(o), !o && (setResults(null), setFrozen(null)))}
    >
      <DialogContent
        title={
          done
            ? 'Delete complete'
            : `Move ${items.length} item${items.length === 1 ? '' : 's'} to trash?`
        }
        description={
          done
            ? undefined
            : 'Items can be restored from Trash. Folders take everything inside them.'
        }
      >
        <DialogBody>
          {results ? (
            <div>
              <p role="status" aria-live="polite" className="mb-2 text-[13px] font-medium">
                {done
                  ? `${okCount} of ${items.length} moved to trash${okCount < items.length ? `; ${items.length - okCount} failed` : ''}.`
                  : `Working… ${results.length} of ${items.length}`}
              </p>
              <ul className="grid gap-1 text-[13px]">
                {results.map((r) => (
                  <li key={r.item.id} className="flex items-start gap-2">
                    {r.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                    ) : (
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate">{r.item.name}</span>
                      {!r.ok && <span className="block text-xs text-danger">{r.message}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-[13px]">
              {items.map((i) => (
                <li key={i.id} className="truncate">
                  {i.name}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          {done ? (
            <Button
              variant="primary"
              onClick={() => (onOpenChange(false), setResults(null), setFrozen(null))}
            >
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={running} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={running} onClick={run}>
                {running && <Loader2 className="animate-spin" aria-hidden />}
                Move to trash
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
