'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useCreateFolder, useDocument, useFolder, useUpdateItem } from '@/features/files/hooks';
import { nameSchema, type NameForm } from '@/features/files/schemas';
import { friendlyMessage, isApiError } from '@/lib/api-client';

/** Map a server error onto form fields (422 field errors / name_conflict). Returns true when handled inline. */
export function applyServerError(e: unknown, setError: UseFormSetError<NameForm>): boolean {
  if (!isApiError(e)) return false;
  if (e.code === 'name_conflict') {
    setError('name', { message: 'An item with this name already exists here. Choose another name.' });
    return true;
  }
  const fe = e.fieldErrors;
  if (fe.name) {
    setError('name', { message: fe.name });
    return true;
  }
  return false;
}

export function NewFolderDialog({
  parentId,
  open,
  onOpenChange,
}: {
  parentId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateFolder();
  const form = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name: '' } });
  useEffect(() => {
    if (open) form.reset({ name: '' });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New folder" description="Create a folder in the current location.">
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            create.mutate(
              { parent_folder_id: parentId, name: v.name },
              {
                onSuccess: (f) => {
                  toast.success(`Created folder "${f.name}"`);
                  onOpenChange(false);
                },
                onError: (e) => {
                  if (!applyServerError(e, form.setError)) toast.error(friendlyMessage(e));
                },
              },
            ),
          )}
        >
          <DialogBody>
            <Field id="new-folder-name" label="Folder name" error={form.formState.errors.name?.message}>
              {(p) => <Input {...p} autoFocus autoComplete="off" {...form.register('name')} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Create folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({
  kind,
  id,
  currentName,
  open,
  onOpenChange,
}: {
  kind: 'folder' | 'document';
  id: string;
  currentName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateItem();
  // Fetch the entity so we can send expected_row_version (optimistic concurrency).
  const folder = useFolder(open && kind === 'folder' ? id : undefined);
  const doc = useDocument(open && kind === 'document' ? id : undefined);
  const entity = kind === 'folder' ? folder : doc;
  const form = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name: currentName } });
  useEffect(() => {
    if (open) form.reset({ name: entity.data?.name ?? currentName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entity.data?.row_version]);

  const stale = update.error && isApiError(update.error) && update.error.code === 'stale_version';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Rename ${kind}`}>
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            update.mutate(
              { kind, id, name: v.name, expectedRowVersion: entity.data?.row_version },
              {
                onSuccess: () => {
                  toast.success(`Renamed to "${v.name}"`);
                  onOpenChange(false);
                },
                onError: (e) => {
                  if (isApiError(e) && e.code === 'stale_version') return;
                  if (!applyServerError(e, form.setError)) toast.error(friendlyMessage(e));
                },
              },
            ),
          )}
        >
          <DialogBody className="grid gap-3">
            <Field id="rename-name" label="Name" error={form.formState.errors.name?.message}>
              {(p) => <Input {...p} autoFocus autoComplete="off" {...form.register('name')} />}
            </Field>
            {stale && (
              <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                <span>This item was changed by someone else.</span>
                <Button
                  size="sm"
                  onClick={async () => {
                    update.reset();
                    await entity.refetch();
                  }}
                >
                  Reload
                </Button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={update.isPending || entity.isPending}>
              {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
