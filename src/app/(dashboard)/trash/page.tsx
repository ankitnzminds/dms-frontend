'use client';

import { Flame, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PathTrail } from '@/components/navigation/path-trail';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useRestoreItem, useTrash } from '@/features/files/hooks';
import { purgeErrorMessage, usePurge } from '@/features/governance/hooks';
import { friendlyMessage, isApiError, type TrashItem } from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';

const PAGE = 25;

export default function TrashPage() {
  const [offset, setOffset] = useState(0);
  const q = useTrash(PAGE, offset);
  const restore = useRestoreItem();
  const [target, setTarget] = useState<TrashItem | null>(null);
  const [rename, setRename] = useState<{ item: TrashItem; name: string; message: string } | null>(
    null,
  );
  const [blocked, setBlocked] = useState<string | null>(null);
  const purge = usePurge();
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  function doRestore(item: TrashItem, newName?: string) {
    restore.mutate(
      { kind: item.kind, id: item.id, newName },
      {
        onSuccess: (r) => {
          toast.success(`Restored "${r.name}"`);
          setTarget(null);
          setRename(null);
          setBlocked(null);
        },
        onError: (e) => {
          setTarget(null);
          if (isApiError(e) && e.code === 'name_conflict') {
            setRename({
              item,
              name: newName ?? item.name,
              message:
                'Something with this name already exists in the original location. Choose a new name to restore it.',
            });
          } else if (isApiError(e) && e.code === 'parent_deleted') {
            setRename(null);
            setBlocked(
              `The folder "${item.name}" used to live in is also in the trash. Restore that folder first.`,
            );
          } else {
            toast.error(friendlyMessage(e));
          }
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title="Trash"
        description="Deleted items can be restored to their original location. Deleting forever removes an item for good, unless a legal hold or retention policy protects it."
      />
      {blocked && (
        <p role="alert" className="mb-3 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {blocked}
        </p>
      )}
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading trash" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Items you delete will wait here until you restore them."
          />
        ) : (
          <>
            <ul className="divide-y divide-line" aria-label="Deleted items">
              {q.data.items.map((t) => (
                <li
                  key={`${t.kind}-${t.id}`}
                  className="flex items-start gap-3 px-3 py-2.5"
                  data-testid="trash-row"
                >
                  <ItemIcon kind={t.kind} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{t.name}</p>
                    <p className="text-xs text-muted">
                      Deleted {formatDateTime(t.deleted_at)}
                      {t.kind === 'document' && ` · ${formatBytes(t.size_bytes)}`}
                    </p>
                    {t.original_breadcrumb.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-faint">
                        <span>was in</span> <PathTrail segments={t.original_breadcrumb} size="sm" />
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => setTarget(t)}>
                    <Undo2 /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    aria-label={`Delete ${t.name} forever`}
                    onClick={() => {
                      setPurgeError(null);
                      setPurgeTarget(t);
                    }}
                  >
                    <Flame /> Delete forever
                  </Button>
                </li>
              ))}
            </ul>
            <PaginationBar
              total={q.data.total}
              limit={PAGE}
              offset={offset}
              count={q.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(o) => !o && setPurgeTarget(null)}
        title={`Delete "${purgeTarget?.name}" forever?`}
        description={
          <>
            This permanently removes{' '}
            {purgeTarget?.kind === 'folder'
              ? 'the folder and everything inside it'
              : 'the file and all of its versions'}
            . <strong>It cannot be undone.</strong>
            {purgeError && (
              <span
                role="alert"
                className="mt-2 block rounded-md bg-danger-soft px-2 py-1.5 text-danger"
              >
                {purgeError}
              </span>
            )}
          </>
        }
        confirmLabel="Delete forever"
        destructive
        pending={purge.isPending}
        onConfirm={() =>
          purge.mutate(
            { kind: purgeTarget!.kind, id: purgeTarget!.id },
            {
              onSuccess: () => {
                toast.success(`Deleted "${purgeTarget!.name}" forever`);
                setPurgeTarget(null);
              },
              onError: (e) => setPurgeError(purgeErrorMessage(e) ?? friendlyMessage(e)),
            },
          )
        }
      />

      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Restore "${target?.name}"?`}
        description="It returns to its original location, with the same access it had before."
        confirmLabel="Restore"
        pending={restore.isPending}
        onConfirm={() => doRestore(target!)}
      />

      {rename && (
        <Dialog open onOpenChange={(o) => !o && setRename(null)}>
          <DialogContent title="Choose a new name" description={rename.message}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rename.name.trim()) doRestore(rename.item, rename.name.trim());
              }}
            >
              <DialogBody>
                <Field id="restore-name" label="New name">
                  {(p) => (
                    <Input
                      {...p}
                      autoFocus
                      value={rename.name}
                      onChange={(e) => setRename({ ...rename, name: e.target.value })}
                    />
                  )}
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setRename(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={restore.isPending || !rename.name.trim()}
                >
                  Restore with this name
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
