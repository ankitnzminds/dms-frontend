'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MoreHorizontal, Plus, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage, isApiError, type Group } from '@/lib/api-client';
import {
  useAddGroupMember,
  useAdminGroups,
  useAdminMembers,
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useRemoveGroupMember,
  useUpdateGroup,
} from './hooks';

const groupSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Use 120 characters or fewer'),
  kind: z.enum(['group', 'department', 'team']),
  description: z.string().trim().max(500).optional(),
});
type GroupForm = z.infer<typeof groupSchema>;

function GroupDialog({
  group,
  open,
  onOpenChange,
}: {
  group: Group | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const form = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    values: {
      name: group?.name ?? '',
      kind: group?.kind ?? 'group',
      description: group?.description ?? '',
    },
  });
  const pending = create.isPending || update.isPending;
  const onError = (e: unknown) => {
    if (isApiError(e) && e.code === 'name_conflict')
      form.setError('name', { message: 'A group with this name already exists.' });
    else if (isApiError(e) && e.fieldErrors.name)
      form.setError('name', { message: e.fieldErrors.name });
    else toast.error(friendlyMessage(e));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={group ? 'Edit group' : 'New group'}>
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => {
            const body = { name: v.name, description: v.description || null };
            const ok = (msg: string) => () => (toast.success(msg), onOpenChange(false));
            if (group)
              update.mutate(
                { id: group.id, body },
                { onSuccess: ok(`Saved "${v.name}"`), onError },
              );
            else
              create.mutate(
                { ...body, kind: v.kind },
                { onSuccess: ok(`Created "${v.name}"`), onError },
              );
          })}
        >
          <DialogBody className="grid gap-3">
            <Field id="g-name" label="Name" error={form.formState.errors.name?.message}>
              {(p) => <Input {...p} autoFocus {...form.register('name')} />}
            </Field>
            {!group && (
              <Field id="g-kind" label="Type">
                {(p) => (
                  <Select {...p} {...form.register('kind')}>
                    <option value="group">Group</option>
                    <option value="team">Team</option>
                    <option value="department">Department</option>
                  </Select>
                )}
              </Field>
            )}
            <Field id="g-desc" label="Description (optional)">
              {(p) => <Textarea {...p} rows={2} {...form.register('description')} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}{' '}
              {group ? 'Save' : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const members = useGroupMembers(group.id);
  const all = useAdminMembers({ q: '', limit: 100, offset: 0 });
  const add = useAddGroupMember(group.id);
  const remove = useRemoveGroupMember(group.id);
  const [pick, setPick] = useState('');
  const inGroup = new Set(members.data?.map((m) => m.user_id));
  const candidates =
    all.data?.items.filter((m) => !inGroup.has(m.user_id) && m.membership_status === 'active') ??
    [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Members of ${group.name}`}>
        <DialogBody className="grid gap-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pick) return;
              add.mutate(pick, {
                onSuccess: () => (toast.success('Member added'), setPick('')),
                onError: (er) => toast.error(friendlyMessage(er)),
              });
            }}
          >
            <Field id="gm-add" label="Add a person" className="flex-1">
              {(p) => (
                <Select {...p} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Select a person…</option>
                  {candidates.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name ?? m.email} ({m.email})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" variant="primary" disabled={!pick || add.isPending}>
              Add
            </Button>
          </form>
          {members.isPending ? (
            <SkeletonRows rows={3} label="Loading members" />
          ) : members.isError ? (
            <ErrorState error={members.error} onRetry={() => members.refetch()} className="py-4" />
          ) : members.data.length === 0 ? (
            <p className="text-center text-[13px] text-muted">No members yet.</p>
          ) : (
            <ul
              className="divide-y divide-line rounded-md border border-line"
              aria-label="Group members"
            >
              {members.data.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {m.display_name ?? m.email}
                    </span>
                    <span className="block truncate text-xs text-muted">{m.email}</span>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${m.email} from ${group.name}`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(m.user_id, {
                        onSuccess: () => toast.success('Member removed'),
                        onError: (er) => toast.error(friendlyMessage(er)),
                      })
                    }
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsView() {
  const list = useAdminGroups();
  const del = useDeleteGroup();
  const [edit, setEdit] = useState<{ group: Group | null } | null>(null);
  const [members, setMembers] = useState<Group | null>(null);
  const [toDelete, setToDelete] = useState<Group | null>(null);

  return (
    <>
      <PageHeader
        title="Groups"
        description="Groups make it easy to share with many people at once."
        actions={
          <Button variant="primary" onClick={() => setEdit({ group: null })}>
            <Plus /> New group
          </Button>
        }
      />
      <Panel>
        {list.isPending ? (
          <SkeletonRows rows={4} label="Loading groups" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No groups yet"
            description="Create a group, then add people to it."
          />
        ) : (
          <ul className="divide-y divide-line" aria-label="Groups">
            {list.data.items.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3" data-testid="group-row">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {g.name} <Badge tone="outline">{g.kind}</Badge>
                  </p>
                  <p className="text-xs text-muted">
                    {g.member_count} member{g.member_count === 1 ? '' : 's'}
                    {g.description ? ` · ${g.description}` : ''}
                  </p>
                </div>
                <Button size="sm" onClick={() => setMembers(g)}>
                  Members
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${g.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEdit({ group: g })}>
                      Rename / edit…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setToDelete(g)}>
                      Delete group…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {edit && <GroupDialog group={edit.group} open onOpenChange={(o) => !o && setEdit(null)} />}
      {members && <MembersDialog group={members} onClose={() => setMembers(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete "${toDelete?.name}"?`}
        description="Anything shared with this group stops applying to its members. The people themselves are not affected."
        confirmLabel="Delete group"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(toDelete!.id, {
            onSuccess: () => (toast.success('Group deleted'), setToDelete(null)),
            onError: (e) => (toast.error(friendlyMessage(e)), setToDelete(null)),
          })
        }
      />
    </>
  );
}
