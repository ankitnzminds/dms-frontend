'use client';

import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { removeFromClipboard, getClipboard } from '@/features/explorer/clipboard';
import {
  hasProblems,
  isNameConflict,
  summarize,
  useBulkCopy,
  useBulkDelete,
  useBulkMove,
  type BulkItemResult,
  type BulkResult,
  type ItemRef,
  type OnConflict,
} from '@/features/explorer/hooks';
import { friendlyMessage } from '@/lib/api-client';

export interface NamedItem extends ItemRef {
  name: string;
}
type Op = 'move' | 'copy';

interface OpsApi {
  /** Run a bulk move/copy into `target` with the conflict prompt and a per-item report. */
  transfer: (
    op: Op,
    items: NamedItem[],
    target: { id: string; name: string },
    opts?: { onConflict?: OnConflict },
  ) => Promise<BulkResult | null>;
  /** Drag and drop: confirms larger / folder moves first. */
  drop: (op: Op, items: NamedItem[], target: { id: string; name: string }) => void;
  /** Paste the in-app clipboard into a folder. */
  paste: (target: { id: string; name: string }) => Promise<BulkResult | null>;
  /** Pick a destination, then transfer. */
  transferTo: (op: Op, items: NamedItem[], startFolderId?: string) => void;
  /** Confirm, then move items to the trash with a per-item report. */
  trash: (items: NamedItem[]) => void;
  busy: boolean;
}

const Ctx = createContext<OpsApi | null>(null);
export const useExplorerOps = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useExplorerOps must be used inside ExplorerOpsProvider');
  return c;
};

type ConflictChoice = 'rename' | 'skip' | 'cancel';

export function ExplorerOpsProvider({ children }: { children: React.ReactNode }) {
  const move = useBulkMove();
  const copy = useBulkCopy();
  const del = useBulkDelete();
  const [busy, setBusy] = useState(false);

  const [conflict, setConflict] = useState<null | { op: Op; target: string; items: NamedItem[] }>(
    null,
  );
  const resolver = useRef<((c: ConflictChoice) => void) | null>(null);
  const [report, setReport] = useState<null | {
    title: string;
    names: Map<string, string>;
    result: BulkResult;
  }>(null);
  const [picker, setPicker] = useState<null | { op: Op; items: NamedItem[]; start?: string }>(null);
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [trashItems, setTrashItems] = useState<NamedItem[] | null>(null);
  const [dropAsk, setDropAsk] = useState<null | {
    op: Op;
    items: NamedItem[];
    target: { id: string; name: string };
  }>(null);

  const askConflict = (op: Op, target: string, items: NamedItem[]) =>
    new Promise<ConflictChoice>((resolve) => {
      resolver.current = resolve;
      setConflict({ op, target, items });
    });
  const answer = (c: ConflictChoice) => {
    resolver.current?.(c);
    resolver.current = null;
    setConflict(null);
  };

  const transfer = useCallback<OpsApi['transfer']>(
    async (op, items, target, opts) => {
      const mut = op === 'move' ? move : copy;
      const names = new Map(items.map((i) => [i.id, i.name]));
      setBusy(true);
      try {
        const refs = items.map(({ kind, id }) => ({ kind, id }));
        const first = await mut.mutateAsync({
          items: refs,
          target: target.id,
          onConflict: opts?.onConflict ?? 'fail',
        });
        let results: BulkItemResult[] = first.results;
        const conflicts = first.results.filter(isNameConflict);
        if (conflicts.length) {
          const choice = await askConflict(
            op,
            target.name,
            conflicts.map((c) => ({ kind: c.kind, id: c.id, name: names.get(c.id) ?? c.id })),
          );
          if (choice === 'rename') {
            const second = await mut.mutateAsync({
              items: conflicts.map(({ kind, id }) => ({ kind, id })),
              target: target.id,
              onConflict: 'rename',
            });
            const byId = new Map(second.results.map((r) => [r.id, r]));
            results = results.map((r) => byId.get(r.id) ?? r);
          } else if (choice === 'skip') {
            const ids = new Set(conflicts.map((c) => c.id));
            results = results.map((r) =>
              ids.has(r.id)
                ? {
                    ...r,
                    status: 'skipped' as const,
                    message: 'Skipped because the name already exists.',
                  }
                : r,
            );
          } else {
            results = results.map((r) =>
              isNameConflict(r)
                ? { ...r, message: 'Not done: you cancelled at the name conflict.' }
                : r,
            );
          }
        }
        const merged: BulkResult = {
          results,
          succeeded: results.filter((r) => r.status === 'ok').length,
          skipped: results.filter((r) => r.status === 'skipped').length,
          failed: results.filter((r) => r.status === 'error').length,
        };
        const verb = op === 'move' ? 'moved' : 'copied';
        if (op === 'move')
          removeFromClipboard(results.filter((r) => r.status === 'ok').map((r) => r.id));
        if (hasProblems(merged)) {
          setReport({
            title: `${op === 'move' ? 'Move' : 'Copy'} to "${target.name}": ${summarize(merged, verb)}`,
            names,
            result: merged,
          });
        } else {
          toast.success(
            `${merged.succeeded} item${merged.succeeded === 1 ? '' : 's'} ${verb} to "${target.name}"`,
          );
        }
        return merged;
      } catch (e) {
        toast.error(friendlyMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [move, copy],
  );

  const paste = useCallback<OpsApi['paste']>(
    async (target) => {
      const cb = getClipboard();
      if (!cb || cb.items.length === 0) {
        toast.message('The clipboard is empty.');
        return null;
      }
      return transfer(cb.op === 'cut' ? 'move' : 'copy', cb.items, target);
    },
    [transfer],
  );

  const transferTo = useCallback<OpsApi['transferTo']>((op, items, start) => {
    setPicked(null);
    setPicker({ op, items, start });
  }, []);

  const trash = useCallback<OpsApi['trash']>((items) => setTrashItems(items), []);

  const drop = useCallback<OpsApi['drop']>(
    (op, items, target) => {
      const list = items.filter((i) => i.id !== target.id);
      if (list.length === 0) return;
      // Confirm risky drops: several items, or any folder (it takes its whole subtree with it).
      if (list.length >= 5 || list.some((i) => i.kind === 'folder'))
        setDropAsk({ op, items: list, target });
      else void transfer(op, list, target);
    },
    [transfer],
  );

  const api = useMemo(
    () => ({ transfer, drop, paste, transferTo, trash, busy }),
    [transfer, drop, paste, transferTo, trash, busy],
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      {picker && (
        <Dialog open onOpenChange={(o) => !o && setPicker(null)}>
          <DialogContent
            title={`${picker.op === 'move' ? 'Move' : 'Copy'} ${picker.items.length === 1 ? `"${picker.items[0]!.name}"` : `${picker.items.length} items`}`}
            description="Choose a destination folder you can add items to."
          >
            <DialogBody>
              <FolderPicker
                onChange={setPicked}
                startFolderId={picker.start}
                excludeIds={picker.items.filter((i) => i.kind === 'folder').map((i) => i.id)}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setPicker(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!picked?.canCreate || busy}
                onClick={() => {
                  const p = picker;
                  const t = picked!;
                  setPicker(null);
                  void transfer(p.op, p.items, { id: t.id, name: t.name });
                }}
              >
                {p_label(picker.op)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {conflict && (
        <Dialog open onOpenChange={(o) => !o && answer('cancel')}>
          <DialogContent
            title={`${conflict.items.length} item${conflict.items.length === 1 ? '' : 's'} already exist in "${conflict.target}"`}
            description="Items with the same name are already in the destination. Replacing is not supported."
          >
            <DialogBody>
              <ul
                className="max-h-48 list-disc overflow-y-auto pl-5 text-[13px]"
                aria-label="Conflicting names"
              >
                {conflict.items.map((i) => (
                  <li key={i.id} className="truncate">
                    {i.name}
                  </li>
                ))}
              </ul>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => answer('cancel')}>
                Cancel
              </Button>
              <Button onClick={() => answer('skip')}>Skip these</Button>
              <Button variant="primary" onClick={() => answer('rename')} autoFocus>
                Keep both
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {report && (
        <Dialog open onOpenChange={(o) => !o && setReport(null)}>
          <DialogContent title={report.title} className="max-w-xl">
            <DialogBody>
              <ul className="grid gap-1.5 text-[13px]" aria-label="Per-item results">
                {report.result.results.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-2"
                    data-testid="bulk-result"
                    data-status={r.status}
                  >
                    {r.status === 'ok' ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                    ) : r.status === 'skipped' ? (
                      <MinusCircle className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                    ) : (
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate">{report.names.get(r.id) ?? r.id}</span>
                      <span className="block text-xs text-muted">
                        {r.status === 'ok'
                          ? r.new_name
                            ? `Done (saved as "${r.new_name}")`
                            : 'Done'
                          : (r.message ?? r.code ?? r.status)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setReport(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!dropAsk}
        onOpenChange={(o) => !o && setDropAsk(null)}
        title={`${dropAsk?.op === 'move' ? 'Move' : 'Copy'} ${dropAsk?.items.length === 1 ? `"${dropAsk.items[0]!.name}"` : `${dropAsk?.items.length} items`} to "${dropAsk?.target.name}"?`}
        description={
          dropAsk?.items.some((i) => i.kind === 'folder')
            ? 'Folders move with everything inside them.'
            : 'Review the destination before continuing.'
        }
        confirmLabel={dropAsk?.op === 'move' ? 'Move' : 'Copy'}
        onConfirm={() => {
          const a = dropAsk!;
          setDropAsk(null);
          void transfer(a.op, a.items, a.target);
        }}
      />

      <ConfirmDialog
        open={!!trashItems}
        onOpenChange={(o) => !o && setTrashItems(null)}
        title={
          trashItems?.length === 1
            ? `Move "${trashItems[0]!.name}" to trash?`
            : `Move ${trashItems?.length ?? 0} items to trash?`
        }
        description="You can restore them from Trash. Folders take everything inside them."
        confirmLabel="Move to trash"
        destructive
        pending={del.isPending}
        onConfirm={async () => {
          const items = trashItems!;
          const names = new Map(items.map((i) => [i.id, i.name]));
          try {
            const r = await del.mutateAsync(items.map(({ kind, id }) => ({ kind, id })));
            setTrashItems(null);
            removeFromClipboard(r.results.filter((x) => x.status === 'ok').map((x) => x.id));
            if (hasProblems(r))
              setReport({
                title: `Move to trash: ${summarize(r, 'moved to trash')}`,
                names,
                result: r,
              });
            else toast.success(`${r.succeeded} item${r.succeeded === 1 ? '' : 's'} moved to trash`);
          } catch (e) {
            setTrashItems(null);
            toast.error(friendlyMessage(e));
          }
        }}
      >
        {del.isPending && <Loader2 className="mt-2 animate-spin" aria-hidden />}
      </ConfirmDialog>
    </Ctx.Provider>
  );
}

const p_label = (op: Op) => (op === 'move' ? 'Move here' : 'Copy here');
