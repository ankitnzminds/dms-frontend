'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useCopyDocument, useUpdateItem } from '@/features/files/hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { FolderPicker, type PickedFolder } from './folder-picker';

export function MoveDialog({
  kind,
  id,
  name,
  open,
  onOpenChange,
  startFolderId,
}: {
  kind: 'folder' | 'document';
  id: string;
  name: string;
  startFolderId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateItem();
  const [target, setTarget] = useState<PickedFolder | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Move "${name}"`}
        description="Choose a destination folder you can add items to."
      >
        <DialogBody>
          {open && (
            <FolderPicker
              onChange={setTarget}
              startFolderId={startFolderId}
              excludeId={kind === 'folder' ? id : undefined}
            />
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target?.canCreate || update.isPending}
            onClick={() => {
              setError(null);
              update.mutate(
                { kind, id, parentId: target!.id },
                {
                  onSuccess: () => {
                    toast.success(`Moved "${name}" to "${target!.name}"`);
                    onOpenChange(false);
                  },
                  onError: (e) =>
                    setError(
                      isApiError(e) && e.code === 'name_conflict'
                        ? `"${target!.name}" already contains an item named "${name}". Rename it first.`
                        : friendlyMessage(e),
                    ),
                },
              );
            }}
          >
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CopyDialog({
  id,
  name,
  open,
  onOpenChange,
  startFolderId,
}: {
  id: string;
  name: string;
  startFolderId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const copy = useCopyDocument();
  const [target, setTarget] = useState<PickedFolder | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Copy "${name}"`}
        description="The copy is a new, independent document."
      >
        <DialogBody className="grid gap-3">
          {open && <FolderPicker onChange={setTarget} startFolderId={startFolderId} />}
          <Field
            id="copy-name"
            label="Name for the copy (optional)"
            hint="Leave empty to keep the original name."
          >
            {(p) => <Input {...p} value={newName} onChange={(e) => setNewName(e.target.value)} />}
          </Field>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!target?.canCreate || copy.isPending}
            onClick={() => {
              setError(null);
              copy.mutate(
                { id, target_folder_id: target!.id, name: newName.trim() || undefined },
                {
                  onSuccess: (d) => {
                    toast.success(`Copied as "${d.name}"`);
                    onOpenChange(false);
                  },
                  onError: (e) =>
                    setError(
                      isApiError(e) && e.code === 'name_conflict'
                        ? 'An item with that name already exists there. Enter a different name for the copy.'
                        : friendlyMessage(e),
                    ),
                },
              );
            }}
          >
            {copy.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Copy here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
