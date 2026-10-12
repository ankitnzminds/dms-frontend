'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MoreHorizontal, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
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
import { Field, Input, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, isApiError, type Member } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import {
  useAdminMembers,
  useInviteMember,
  useRevokeSessions,
  useUpdateMember,
  type MemberFilters,
} from './hooks';

const PAGE = 25;
const ROLES = ['owner', 'admin', 'member', 'auditor'] as const;

const inviteSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email address').email('Enter a valid email address'),
  display_name: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
});
type InviteForm = z.infer<typeof inviteSchema>;

function statusTone(s: Member['membership_status']) {
  return s === 'active' ? 'ok' : s === 'invited' ? 'info' : s === 'suspended' ? 'warn' : 'danger';
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const invite = useInviteMember();
  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', display_name: '', role: 'member' },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && form.reset())}>
      <DialogContent
        title="Invite a person"
        description="They join this organization with the role you choose."
      >
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            invite.mutate(
              { email: v.email, display_name: v.display_name || null, role: v.role },
              {
                onSuccess: () => {
                  toast.success(`Invited ${v.email}`);
                  onOpenChange(false);
                  form.reset();
                },
                onError: (e) => {
                  if (isApiError(e) && e.fieldErrors.email)
                    form.setError('email', { message: e.fieldErrors.email });
                  else if (isApiError(e) && e.code === 'already_member')
                    form.setError('email', { message: 'That person is already a member.' });
                  else toast.error(friendlyMessage(e));
                },
              },
            ),
          )}
        >
          <DialogBody className="grid gap-3">
            <Field id="inv-email" label="Email" error={form.formState.errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="off" {...form.register('email')} />}
            </Field>
            <Field
              id="inv-name"
              label="Display name (optional)"
              error={form.formState.errors.display_name?.message}
            >
              {(p) => <Input {...p} {...form.register('display_name')} />}
            </Field>
            <Field id="inv-role" label="Role">
              {(p) => (
                <Select {...p} {...form.register('role')}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={invite.isPending}>
              {invite.isPending && <Loader2 className="animate-spin" aria-hidden />} Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Pending =
  | { kind: 'suspend' | 'reactivate' | 'remove' | 'revoke'; m: Member }
  | { kind: 'role'; m: Member; role: Member['role'] };

export function UsersView() {
  const { data: me } = useMe();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<MemberFilters['status']>(undefined);
  const [role, setRole] = useState<MemberFilters['role']>(undefined);
  const [offset, setOffset] = useState(0);
  const [invite, setInvite] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [newRole, setNewRole] = useState<Member['role']>('member');
  const [rolePick, setRolePick] = useState<Member | null>(null);

  const list = useAdminMembers({ q, status, role, limit: PAGE, offset });
  const update = useUpdateMember();
  const revoke = useRevokeSessions();

  const busy = update.isPending || revoke.isPending;
  const done = (msg: string) => ({
    onSuccess: () => {
      toast.success(msg);
      setPending(null);
      setRolePick(null);
    },
    onError: (e: unknown) => {
      setPending(null);
      toast.error(friendlyMessage(e));
    },
  });

  function confirm() {
    if (!pending) return;
    const id = pending.m.user_id;
    const name = pending.m.display_name ?? pending.m.email;
    if (pending.kind === 'revoke') revoke.mutate(id, done(`Signed ${name} out everywhere`));
    else if (pending.kind === 'role')
      update.mutate(
        { userId: id, body: { role: pending.role } },
        done(`${name} is now ${pending.role}`),
      );
    else {
      const next =
        pending.kind === 'suspend' ? 'suspended' : pending.kind === 'remove' ? 'removed' : 'active';
      update.mutate(
        { userId: id, body: { status: next } },
        done(
          `${name} ${pending.kind === 'reactivate' ? 'reactivated' : pending.kind === 'suspend' ? 'suspended' : 'removed'}`,
        ),
      );
    }
  }

  const copy =
    pending &&
    {
      revoke: [
        'Sign this person out everywhere?',
        'All of their active sessions end immediately. They can sign in again.',
        'Revoke sessions',
      ],
      suspend: [
        'Suspend this person?',
        'They cannot sign in or access anything until reactivated.',
        'Suspend',
      ],
      reactivate: [
        'Reactivate this person?',
        'They regain the access their role and shares allow.',
        'Reactivate',
      ],
      remove: [
        'Remove this person?',
        'They lose access to this organization. Their documents stay in place.',
        'Remove',
      ],
      role: [
        'Change role?',
        `Their role changes to ${pending.kind === 'role' ? pending.role : ''}.`,
        'Change role',
      ],
    }[pending.kind];

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite people and manage their role and access."
        actions={
          <Button variant="primary" onClick={() => setInvite(true)}>
            <UserPlus /> Invite person
          </Button>
        }
      />
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Filter users"
        onSubmit={(e) => e.preventDefault()}
      >
        <Field id="u-q" label="Search" className="w-56">
          {(p) => (
            <Input
              {...p}
              type="search"
              placeholder="Name or email"
              value={q}
              onChange={(e) => (setQ(e.target.value), setOffset(0))}
            />
          )}
        </Field>
        <Field id="u-status" label="Status">
          {(p) => (
            <Select
              {...p}
              value={status ?? ''}
              onChange={(e) => (
                setStatus((e.target.value || undefined) as MemberFilters['status']),
                setOffset(0)
              )}
            >
              <option value="">Any status</option>
              {['active', 'invited', 'suspended', 'removed'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="u-role" label="Role">
          {(p) => (
            <Select
              {...p}
              value={role ?? ''}
              onChange={(e) => (
                setRole((e.target.value || undefined) as MemberFilters['role']),
                setOffset(0)
              )}
            >
              <option value="">Any role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
      <Panel>
        {list.isPending ? (
          <SkeletonRows rows={5} label="Loading users" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No people match"
            description="Change the filters or invite someone."
          />
        ) : (
          <>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full min-w-[34rem] border-collapse text-[13px]">
                <caption className="sr-only">Organization members</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">
                      Person
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Role
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                      Last sign-in
                    </th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((m) => {
                    const self = m.user_id === me?.user_id;
                    const reason = self ? 'You cannot change your own account.' : undefined;
                    return (
                      <tr
                        key={m.user_id}
                        className="border-b border-line last:border-0"
                        data-testid="member-row"
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium">
                            {m.display_name ?? m.email} {self && <Badge tone="outline">You</Badge>}
                          </p>
                          <p className="text-xs text-muted">{m.email}</p>
                        </td>
                        <td className="px-3 py-2 capitalize">{m.role}</td>
                        <td className="px-3 py-2">
                          <Badge tone={statusTone(m.membership_status)}>
                            {m.membership_status}
                          </Badge>
                        </td>
                        <td className="hidden px-3 py-2 text-muted md:table-cell">
                          {m.last_login_at ? formatRelative(m.last_login_at) : 'Never'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Actions for ${m.email}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={self}
                                reason={reason}
                                onSelect={() => (setNewRole(m.role), setRolePick(m))}
                              >
                                Change role…
                              </DropdownMenuItem>
                              {m.membership_status === 'suspended' ? (
                                <DropdownMenuItem
                                  disabled={self}
                                  reason={reason}
                                  onSelect={() => setPending({ kind: 'reactivate', m })}
                                >
                                  Reactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled={self || m.membership_status === 'removed'}
                                  reason={reason}
                                  onSelect={() => setPending({ kind: 'suspend', m })}
                                >
                                  Suspend…
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                disabled={self}
                                reason={reason}
                                onSelect={() => setPending({ kind: 'revoke', m })}
                              >
                                Revoke sessions…
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                destructive
                                disabled={self || m.membership_status === 'removed'}
                                reason={reason}
                                onSelect={() => setPending({ kind: 'remove', m })}
                              >
                                Remove from organization…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              total={list.data.total}
              limit={PAGE}
              offset={offset}
              count={list.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>

      <InviteDialog open={invite} onOpenChange={setInvite} />

      <Dialog open={!!rolePick} onOpenChange={(o) => !o && setRolePick(null)}>
        <DialogContent title={`Change role for ${rolePick?.display_name ?? rolePick?.email}`}>
          <DialogBody>
            <Field id="role-pick" label="Role">
              {(p) => (
                <Select
                  {...p}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Member['role'])}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRolePick(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={newRole === rolePick?.role}
              onClick={() => (
                setPending({ kind: 'role', m: rolePick!, role: newRole }),
                setRolePick(null)
              )}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={copy?.[0] ?? ''}
        description={pending ? `${pending.m.display_name ?? pending.m.email}: ${copy?.[1]}` : ''}
        confirmLabel={copy?.[2] ?? 'Confirm'}
        destructive={pending?.kind === 'remove' || pending?.kind === 'suspend'}
        pending={busy}
        onConfirm={confirm}
      />
    </>
  );
}
