'use client';

import { MoreHorizontal, ShieldPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Field, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useRevokeSessions, useUpdateMember } from '@/features/admin/hooks';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, type Schemas } from '@/lib/api-client';
import { formatRelative, titleCase } from '@/lib/format';
import { useAdmins, useSetEnabled } from './api';
import { AddUserDialog } from './add-user-dialog';

type Admin = Schemas['AdminOut'];
type Role = Admin['role'];

const ROLE_HELP: Record<Role, string> = {
  owner: 'Full control of the organization, including other owners.',
  admin: 'Manages people, groups, policies and content. Cannot change owners.',
  auditor: 'Read-only access to the audit log and reports.',
  member: 'Regular user.',
};

type Pending =
  { kind: 'suspend' | 'reactivate' | 'revoke'; a: Admin } | { kind: 'role'; a: Admin; role: Role };

/** Administrators are roles, not groups: they grant authority over the organization. */
export function AdminsView() {
  const { data: me } = useMe();
  const list = useAdmins();
  const update = useUpdateMember();
  const enable = useSetEnabled();
  const revoke = useRevokeSessions();
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<Admin | null>(null);
  const [role, setRole] = useState<Role>('admin');
  const [pending, setPending] = useState<Pending | null>(null);

  const busy = update.isPending || enable.isPending || revoke.isPending;
  const done = (msg: string) => ({
    onSuccess: () => (toast.success(msg), setPending(null)),
    onError: (e: unknown) => (toast.error(friendlyMessage(e)), setPending(null)),
  });
  const ownerCount =
    list.data?.filter((a) => a.role === 'owner' && a.membership_status === 'active').length ?? 0;

  function confirm() {
    if (!pending) return;
    const id = pending.a.user_id;
    const who = pending.a.display_name ?? pending.a.email;
    if (pending.kind === 'role')
      update.mutate(
        { userId: id, body: { role: pending.role } },
        done(`${who} is now ${pending.role}`),
      );
    else if (pending.kind === 'revoke') revoke.mutate(id, done(`Signed ${who} out everywhere`));
    else
      enable.mutate(
        { userId: id, enabled: pending.kind === 'reactivate' },
        done(`${who} ${pending.kind === 'reactivate' ? 'reactivated' : 'suspended'}`),
      );
  }

  const copy =
    pending &&
    {
      suspend: [
        'Suspend this administrator?',
        'They are signed out and cannot sign in until reactivated.',
        'Suspend',
      ],
      reactivate: [
        'Reactivate this administrator?',
        'They regain the access of their role.',
        'Reactivate',
      ],
      revoke: ['Sign out everywhere?', 'All of their sessions end immediately.', 'Revoke sessions'],
      role: [
        'Change role?',
        `Their role becomes ${pending.kind === 'role' ? pending.role : ''}. This changes what they can do.`,
        'Change role',
      ],
    }[pending.kind];

  return (
    <>
      <PageHeader
        title="Admins"
        description="Owners, administrators and auditors. Roles grant authority over the organization; every change is recorded."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <ShieldPlus /> Add admin
          </Button>
        }
      />
      <Panel>
        {list.isPending ? (
          <SkeletonRows rows={4} label="Loading administrators" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState title="No administrators" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-[13px]">
              <caption className="sr-only">Administrators</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Account
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                    Authentication
                  </th>
                  <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                    Last login
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((a) => {
                  const self = a.user_id === me?.user_id;
                  const lastOwner = a.role === 'owner' && ownerCount <= 1;
                  const mayManage = me?.role === 'owner' || a.role !== 'owner';
                  const reason = self
                    ? 'You cannot change your own account.'
                    : !mayManage
                      ? 'Only an owner can change an owner.'
                      : undefined;
                  const locked = self || !mayManage;
                  return (
                    <tr
                      key={a.user_id}
                      className="border-b border-line last:border-0"
                      data-testid="admin-row"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {a.display_name ?? a.email} {self && <Badge tone="outline">You</Badge>}
                        </p>
                        <p className="text-xs text-muted">{a.email}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={a.role === 'owner' ? 'accent' : 'neutral'}>
                          {titleCase(a.role)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            a.membership_status === 'active'
                              ? 'ok'
                              : a.membership_status === 'invited'
                                ? 'info'
                                : 'danger'
                          }
                        >
                          {titleCase(a.membership_status)}
                        </Badge>
                      </td>
                      <td className="hidden px-3 py-2 text-muted md:table-cell">
                        {a.authentication === 'default' ? 'Default' : a.authentication}
                      </td>
                      <td className="hidden px-3 py-2 text-muted md:table-cell">
                        {a.last_login_at ? formatRelative(a.last_login_at) : '--'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Actions for ${a.email}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={locked || lastOwner}
                              reason={
                                reason ??
                                (lastOwner ? 'The last owner cannot be demoted.' : undefined)
                              }
                              onSelect={() => (setRole(a.role), setPick(a))}
                            >
                              Change role…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={locked}
                              reason={reason}
                              onSelect={() => setPending({ kind: 'revoke', a })}
                            >
                              Revoke sessions…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {a.membership_status === 'suspended' ? (
                              <DropdownMenuItem
                                disabled={locked}
                                reason={reason}
                                onSelect={() => setPending({ kind: 'reactivate', a })}
                              >
                                Reactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                destructive
                                disabled={locked || lastOwner}
                                reason={
                                  reason ??
                                  (lastOwner ? 'The last owner cannot be suspended.' : undefined)
                                }
                                onSelect={() => setPending({ kind: 'suspend', a })}
                              >
                                Suspend…
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <AddUserDialog open={adding} onOpenChange={setAdding} defaultRole="admin" title="Add admin" />

      <Dialog open={!!pick} onOpenChange={(o) => !o && setPick(null)}>
        <DialogContent title={`Change role for ${pick?.display_name ?? pick?.email ?? ''}`}>
          <DialogBody className="grid gap-2">
            <Field id="adm-role" label="Role" hint={ROLE_HELP[role]}>
              {(p) => (
                <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {(me?.role === 'owner'
                    ? (['owner', 'admin', 'auditor', 'member'] as Role[])
                    : (['admin', 'auditor', 'member'] as Role[])
                  ).map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPick(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={role === pick?.role}
              onClick={() => (setPending({ kind: 'role', a: pick!, role }), setPick(null))}
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
        description={pending ? `${pending.a.display_name ?? pending.a.email}: ${copy?.[1]}` : ''}
        confirmLabel={copy?.[2] ?? 'Confirm'}
        destructive={
          pending?.kind === 'suspend' || (pending?.kind === 'role' && pending.role === 'member')
        }
        pending={busy}
        onConfirm={confirm}
      />
    </>
  );
}
