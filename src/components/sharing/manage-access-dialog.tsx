'use client';

import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/session';
import {
  useAddGrant,
  useAcl,
  useGroups,
  useRevokeGrant,
  type ResourceKind,
} from '@/features/sharing/hooks';
import { MemberPicker } from '@/features/members/member-picker';
import { AccessCheck, AclImpact } from './access-check';
import { friendlyMessage, type ActionName, type PermissionGrant } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { actionLabel, isAdminRole } from '@/lib/permissions';

const GRANTABLE: ActionName[] = [
  'view',
  'preview',
  'download',
  'comment',
  'edit_metadata',
  'rename',
  'upload_version',
  'copy',
  'move',
  'share',
  'delete',
  'manage_access',
];

function subjectLabel(g: PermissionGrant) {
  if (g.subject_type === 'organization') return 'Everyone in the organization';
  return g.subject_name ?? `${g.subject_type} ${g.subject_id?.slice(0, 8)}`;
}

export function ManageAccessDialog({
  kind,
  id,
  name,
  permissions,
  open,
  onOpenChange,
}: {
  kind: ResourceKind;
  id: string;
  name: string;
  permissions: readonly string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const acl = useAcl(kind, id, open);
  const add = useAddGrant(kind, id);
  const revoke = useRevokeGrant(kind, id);
  const { data: me } = useMe();
  const groups = useGroups();
  const [pickedUser, setPickedUser] = useState<{ id: string; label: string } | null>(null);

  const [subjectType, setSubjectType] = useState<'group' | 'user' | 'organization'>('group');
  const [subjectId, setSubjectId] = useState('');
  const [actions, setActions] = useState<ActionName[]>(['view', 'preview']);
  const [inherit, setInherit] = useState(true);
  const [days, setDays] = useState('none');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<PermissionGrant | null>(null);

  const options = GRANTABLE.filter(
    (a) => permissions.includes(a) || permissions.includes('administer'),
  );
  const broad = subjectType === 'organization' || (kind === 'folder' && inherit);
  const needsSubject = subjectType !== 'organization';
  const canSubmit = actions.length > 0 && (!needsSubject || !!subjectId) && (!broad || ack);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Manage access to "${name}"`}
        description="Direct access grants on this item."
        className="max-w-2xl"
      >
        <DialogBody className="grid gap-5">
          <section aria-label="Current access">
            {acl.isPending ? (
              <SkeletonRows rows={3} label="Loading access list" />
            ) : acl.isError ? (
              <ErrorState error={acl.error} onRetry={() => acl.refetch()} className="py-6" />
            ) : acl.data.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted">
                No direct grants. Access comes from inherited folder permissions.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {acl.data.map((g) => (
                  <li key={g.id} className="flex items-start gap-3 px-3 py-2" data-testid="acl-row">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {subjectLabel(g)} <Badge tone="outline">{g.subject_type}</Badge>
                        {g.inherit && (
                          <Badge tone="info" className="ml-1">
                            Inherited by subfolders
                          </Badge>
                        )}
                        {g.revoked_at && (
                          <Badge tone="danger" className="ml-1">
                            Revoked
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {g.actions.map((a) => (
                          <Badge key={a}>{actionLabel(a)}</Badge>
                        ))}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {g.expires_at ? `Expires ${formatDate(g.expires_at)}` : 'No expiry'}
                      </p>
                    </div>
                    {!g.revoked_at && (
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        aria-label={`Revoke access for ${subjectLabel(g)}`}
                        onClick={() => setToRevoke(g)}
                      >
                        <Trash2 /> Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form
            className="grid gap-3 rounded-md border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              add.mutate(
                {
                  subject_type: subjectType,
                  subject_id: needsSubject ? subjectId : null,
                  actions,
                  inherit: kind === 'folder' ? inherit : false,
                  expires_at:
                    days === 'none'
                      ? null
                      : new Date(Date.now() + Number(days) * 86400000).toISOString(),
                },
                {
                  onSuccess: () => {
                    toast.success('Access granted');
                    setSubjectId('');
                    setPickedUser(null);
                    setAck(false);
                  },
                  onError: (er) => setError(friendlyMessage(er)),
                },
              );
            }}
          >
            <h3 className="text-[13px] font-semibold">Add access</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="acl-type">Who</Label>
                <Select
                  id="acl-type"
                  value={subjectType}
                  onChange={(e) => {
                    setSubjectType(e.target.value as typeof subjectType);
                    setSubjectId('');
                    setPickedUser(null);
                    setAck(false);
                  }}
                >
                  <option value="group">A group</option>
                  <option value="user">A person</option>
                  <option value="organization">Everyone in the organization</option>
                </Select>
              </div>
              {subjectType === 'group' && (
                <div className="grid gap-1">
                  <Label htmlFor="acl-subject">Group</Label>
                  <Select
                    id="acl-subject"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {groups.data?.items.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {subjectType === 'user' && (
                <div className="grid gap-1">
                  <MemberPicker
                    label="Member"
                    inputId="acl-member"
                    onSelect={(u) => {
                      setSubjectId(u.id);
                      setPickedUser({ id: u.id, label: u.display_name ?? u.email ?? u.id });
                    }}
                  />
                  {pickedUser && (
                    <p className="text-xs text-muted" data-testid="acl-picked">
                      Selected: <strong>{pickedUser.label}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-[13px] font-medium">Permissions</legend>
              <div className="grid gap-1 sm:grid-cols-3">
                {options.map((a) => (
                  <div key={a} className="flex items-center gap-2">
                    <Checkbox
                      id={`grant-${a}`}
                      checked={actions.includes(a)}
                      onCheckedChange={(c) =>
                        setActions(c ? [...actions, a] : actions.filter((x) => x !== a))
                      }
                    />
                    <Label htmlFor={`grant-${a}`} className="font-normal">
                      {actionLabel(a)}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="acl-expiry">Expires</Label>
                <Select id="acl-expiry" value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="none">Never</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                </Select>
              </div>
              {kind === 'folder' && (
                <div className="flex items-center gap-2 self-end pb-1.5">
                  <Checkbox
                    id="acl-inherit"
                    checked={inherit}
                    onCheckedChange={(c) => setInherit(c === true)}
                  />
                  <Label htmlFor="acl-inherit" className="font-normal">
                    Apply to everything inside this folder
                  </Label>
                </div>
              )}
            </div>
            {broad && (
              <div role="alert" className="rounded-md bg-warn-soft p-3 text-xs text-warn">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="size-4" aria-hidden /> This is a broad grant
                </p>
                <p className="mt-1">
                  {subjectType === 'organization'
                    ? 'Everyone in your organization'
                    : 'The selected people'}{' '}
                  will get these permissions
                  {kind === 'folder' && inherit
                    ? ' on this folder and every item inside it, including items added later'
                    : ''}
                  .
                </p>
                {isAdminRole(me?.role) && (
                  <AclImpact
                    kind={kind}
                    id={id}
                    subjectType={subjectType}
                    subjectId={needsSubject ? subjectId || null : null}
                    inherit={kind === 'folder' ? inherit : false}
                  />
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Checkbox
                    id="acl-ack"
                    checked={ack}
                    onCheckedChange={(c) => setAck(c === true)}
                  />
                  <Label htmlFor="acl-ack" className="font-normal text-warn">
                    I understand who will get access
                  </Label>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <div className="justify-self-end">
              <Button type="submit" variant="primary" disabled={!canSubmit || add.isPending}>
                {add.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Grant access
              </Button>
            </div>
          </form>
          {isAdminRole(me?.role) && <AccessCheck kind={kind} id={id} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={!!toRevoke}
        onOpenChange={(o) => !o && setToRevoke(null)}
        title="Revoke this access?"
        description={
          toRevoke
            ? `${subjectLabel(toRevoke)} will immediately lose these permissions on "${name}".`
            : ''
        }
        confirmLabel="Revoke access"
        destructive
        pending={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(toRevoke!.id, {
            onSuccess: () => {
              toast.success('Access revoked');
              setToRevoke(null);
            },
            onError: (e) => toast.error(friendlyMessage(e)),
          })
        }
      />
    </Dialog>
  );
}
