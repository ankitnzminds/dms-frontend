'use client';

import { Loader2, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/checkbox';
import { useMe } from '@/features/auth/session';
import { useFolder, useSearch } from '@/features/files/hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { isAdminRole } from '@/lib/permissions';
import {
  useAddHoldItem,
  useCreateHold,
  useCreateRetention,
  useDeleteRetention,
  useHoldItems,
  useLegalHolds,
  useReleaseHold,
  useRemoveHoldItem,
  useRetentionPolicies,
  useUpdateRetention,
  type LegalHold,
  type RetentionPolicy,
} from './hooks';

function ScopeName({ id }: { id: string | null }) {
  const f = useFolder(id ?? undefined);
  if (!id) return <>Whole organization</>;
  return <>{f.data?.name ?? 'A folder'}</>;
}

/* ------------------------------ retention ------------------------------ */

function RetentionDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateRetention();
  const [name, setName] = useState('');
  const [days, setDays] = useState('365');
  const [description, setDescription] = useState('');
  const [scoped, setScoped] = useState(false);
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
    days?: string;
    folder?: string;
    server?: string;
  }>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Give the policy a name';
    if (!/^[1-9]\d*$/.test(days)) errs.days = 'Enter a whole number of days (1 or more)';
    if (scoped && !folder) errs.folder = 'Choose a folder';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate(
      {
        name: name.trim(),
        min_retention_days: Number(days),
        description: description.trim() || null,
        scope_folder_id: scoped ? folder!.id : null,
      },
      {
        onSuccess: () => {
          toast.success(`Created policy "${name.trim()}"`);
          onClose();
        },
        onError: (er) => setErrors({ server: friendlyMessage(er) }),
      },
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="New retention policy"
        description="Documents cannot be deleted forever until they are this old."
      >
        <form noValidate onSubmit={submit}>
          <DialogBody className="grid gap-3">
            <Field id="rp-name" label="Name" error={errors.name}>
              {(p) => (
                <Input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              )}
            </Field>
            <Field id="rp-days" label="Minimum retention (days)" error={errors.days}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              )}
            </Field>
            <Field id="rp-desc" label="Description (optional)">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              )}
            </Field>
            <div className="flex items-center gap-2">
              <Switch id="rp-scoped" checked={scoped} onCheckedChange={setScoped} />
              <Label htmlFor="rp-scoped" className="font-normal">
                Limit to one folder (and everything inside it)
              </Label>
            </div>
            {scoped && (
              <div className="grid gap-1">
                <FolderPicker onChange={setFolder} />
                {folder && (
                  <p className="text-xs text-muted" data-testid="rp-scope">
                    Applies to: <strong>{folder.name}</strong>
                  </p>
                )}
                {errors.folder && (
                  <p role="alert" className="text-xs text-danger">
                    {errors.folder}
                  </p>
                )}
              </div>
            )}
            {errors.server && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {errors.server}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />} Create policy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetentionTab({ canEdit }: { canEdit: boolean }) {
  const q = useRetentionPolicies();
  const update = useUpdateRetention();
  const del = useDeleteRetention();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<RetentionPolicy | null>(null);
  const [editing, setEditing] = useState<{ p: RetentionPolicy; days: string } | null>(null);
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="max-w-prose text-[13px] text-muted">
          A retention policy blocks permanent deletion of documents until they reach the minimum
          age. The longest applicable policy wins.
        </p>
        {canEdit && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus /> New policy
          </Button>
        )}
      </div>
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={3} label="Loading retention policies" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            title="No retention policies"
            description="Without a policy, trashed items can be deleted forever by their owners and administrators."
          />
        ) : (
          <ul className="divide-y divide-line" aria-label="Retention policies">
            {q.data.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid="retention-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {p.name} {!p.enabled && <Badge tone="warn">Disabled</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    Keep at least {p.min_retention_days} days · Applies to:{' '}
                    <ScopeName id={p.scope_folder_id} />
                  </p>
                </div>
                {canEdit && (
                  <>
                    <Switch
                      aria-label={`${p.name} enabled`}
                      checked={p.enabled}
                      disabled={update.isPending}
                      onCheckedChange={(c) =>
                        update.mutate(
                          { id: p.id, body: { enabled: c } },
                          {
                            onSuccess: () =>
                              toast.success(c ? 'Policy enabled' : 'Policy disabled'),
                            onError: (e) => toast.error(friendlyMessage(e)),
                          },
                        )
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() => setEditing({ p, days: String(p.min_retention_days) })}
                    >
                      Change days
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      aria-label={`Delete policy ${p.name}`}
                      onClick={() => setToDelete(p)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {adding && <RetentionDialog onClose={() => setAdding(false)} />}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent title={`Change retention for "${editing.p.name}"`}>
            <DialogBody>
              <Field id="rp-edit-days" label="Minimum retention (days)">
                {(p) => (
                  <Input
                    {...p}
                    autoFocus
                    inputMode="numeric"
                    value={editing.days}
                    onChange={(e) => setEditing({ ...editing, days: e.target.value })}
                  />
                )}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!/^[1-9]\d*$/.test(editing.days) || update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: editing.p.id, body: { min_retention_days: Number(editing.days) } },
                    {
                      onSuccess: () => (toast.success('Retention updated'), setEditing(null)),
                      onError: (e) => toast.error(friendlyMessage(e)),
                    },
                  )
                }
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete "${toDelete?.name}"?`}
        description="Items it protected become deletable again (unless another policy or a legal hold applies)."
        confirmLabel="Delete policy"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(toDelete!.id, {
            onSuccess: () => (toast.success('Policy deleted'), setToDelete(null)),
            onError: (e) => (toast.error(friendlyMessage(e)), setToDelete(null)),
          })
        }
      />
    </>
  );
}

/* ------------------------------ legal holds ------------------------------ */

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function HoldItems({ hold, canEdit }: { hold: LegalHold; canEdit: boolean }) {
  const items = useHoldItems(hold.id);
  const add = useAddHoldItem(hold.id);
  const remove = useRemoveHoldItem(hold.id);
  const [text, setText] = useState('');
  const term = useDebounced(text.trim());
  const search = useSearch({ q: term, limit: 6, offset: 0 });
  const active = hold.status === 'active';
  return (
    <div className="grid gap-3">
      {canEdit && active && (
        <div className="grid gap-1">
          <Label htmlFor={`hold-find-${hold.id}`}>Add a file or folder to this hold</Label>
          <Input
            id={`hold-find-${hold.id}`}
            placeholder="Search by name"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {term && search.data && (
            <ul className="rounded-md border border-line" aria-label="Search results">
              {search.data.items.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted">No matches.</li>
              )}
              {search.data.items.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">
                    {r.name} <span className="text-xs text-muted">({r.kind})</span>
                  </span>
                  <Button
                    size="sm"
                    disabled={add.isPending}
                    onClick={() =>
                      add.mutate(
                        { resource_id: r.id, resource_type: r.kind },
                        {
                          onSuccess: () => (
                            toast.success(`Added "${r.name}" to the hold`),
                            setText('')
                          ),
                          onError: (e) => toast.error(friendlyMessage(e)),
                        },
                      )
                    }
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {items.isPending ? (
        <SkeletonRows rows={2} label="Loading held items" />
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => items.refetch()} className="py-4" />
      ) : items.data.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing is under this hold yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line" aria-label="Held items">
          {items.data.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-2 px-3 py-2 text-[13px]"
              data-testid="hold-item"
            >
              <span className="min-w-0 flex-1 truncate">
                {i.resource_name ?? i.resource_id}{' '}
                <span className="text-xs text-muted">({i.resource_type})</span>
              </span>
              {canEdit && active && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${i.resource_name ?? 'item'} from the hold`}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(i.id, { onError: (e) => toast.error(friendlyMessage(e)) })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HoldsTab({ canEdit }: { canEdit: boolean }) {
  const q = useLegalHolds();
  const create = useCreateHold();
  const release = useReleaseHold();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [open, setOpen] = useState<LegalHold | null>(null);
  const [releasing, setReleasing] = useState<LegalHold | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="max-w-prose text-[13px] text-muted">
          Items under a legal hold (and everything inside held folders) cannot be moved to trash or
          deleted forever until the hold is released.
        </p>
        {canEdit && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus /> New hold
          </Button>
        )}
      </div>
      {!canEdit && (
        <p className="mb-3 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
          Read-only: auditors can review holds but not change them.
        </p>
      )}
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={3} label="Loading legal holds" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="No legal holds"
            description="Create a hold, then add the files or folders it covers."
          />
        ) : (
          <ul className="divide-y divide-line" aria-label="Legal holds">
            {q.data.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid="hold-row"
                data-status={h.status}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {h.name}{' '}
                    <Badge tone={h.status === 'active' ? 'danger' : 'neutral'}>
                      {h.status === 'active' ? 'Active' : 'Released'}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted">
                    {h.item_count} item{h.item_count === 1 ? '' : 's'} · created{' '}
                    {formatDate(h.created_at)}
                    {h.released_at &&
                      ` · released ${formatDate(h.released_at)}: ${h.release_reason}`}
                  </p>
                  {h.description && <p className="text-xs text-muted">{h.description}</p>}
                </div>
                <Button size="sm" onClick={() => setOpen(h)}>
                  Items
                </Button>
                {canEdit && h.status === 'active' && (
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    onClick={() => (setReason(''), setReasonError(null), setReleasing(h))}
                  >
                    <Unlock /> Release…
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {creating && (
        <Dialog open onOpenChange={(o) => !o && setCreating(false)}>
          <DialogContent title="New legal hold">
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                create.mutate(
                  { name: name.trim(), description: desc.trim() || null },
                  {
                    onSuccess: () => {
                      toast.success(`Created hold "${name.trim()}"`);
                      setName('');
                      setDesc('');
                      setCreating(false);
                    },
                    onError: (er) => toast.error(friendlyMessage(er)),
                  },
                );
              }}
            >
              <DialogBody className="grid gap-3">
                <Field id="lh-name" label="Name">
                  {(p) => (
                    <Input
                      {...p}
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Field>
                <Field id="lh-desc" label="Description (optional)">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={2}
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                    />
                  )}
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
                  Create hold
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent title={`Items under "${open.name}"`} className="max-w-xl">
            <DialogBody>
              <HoldItems hold={open} canEdit={canEdit} />
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => setOpen(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {releasing && (
        <Dialog open onOpenChange={(o) => !o && setReleasing(null)}>
          <DialogContent
            title={`Release "${releasing.name}"?`}
            description="Held items become deletable again. A reason is required and is recorded in the audit log."
          >
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!reason.trim()) return setReasonError('Enter a reason for releasing this hold');
                release.mutate(
                  { id: releasing.id, reason: reason.trim() },
                  {
                    onSuccess: () => (toast.success('Hold released'), setReleasing(null)),
                    onError: (er) =>
                      setReasonError(
                        isApiError(er) && er.code === 'hold_released'
                          ? 'This hold was already released.'
                          : friendlyMessage(er),
                      ),
                  },
                );
              }}
            >
              <DialogBody>
                <Field id="lh-reason" label="Reason" error={reasonError ?? undefined}>
                  {(p) => (
                    <Textarea
                      {...p}
                      autoFocus
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  )}
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setReleasing(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger" disabled={release.isPending}>
                  Release hold
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function GovernanceView() {
  const { data: me } = useMe();
  const canEdit = isAdminRole(me?.role);
  return (
    <>
      <PageHeader
        title="Governance"
        description="Retention policies and legal holds protect documents from deletion."
        actions={!canEdit ? <Badge tone="info">Read-only</Badge> : undefined}
      />
      <Tabs defaultValue="retention">
        <TabsList aria-label="Governance sections">
          <TabsTrigger value="retention">Retention policies</TabsTrigger>
          <TabsTrigger value="holds">Legal holds</TabsTrigger>
        </TabsList>
        <TabsContent value="retention">
          <RetentionTab canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="holds">
          <HoldsTab canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </>
  );
}
