'use client';

import { Check, Loader2, ShieldQuestion, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MemberPicker } from '@/features/members/member-picker';
import { useGroups, type ResourceKind } from '@/features/sharing/hooks';
import {
  ACL_PERMS,
  useAclView,
  useCheckAccess,
  useInheritancePreview,
  useRevokeAclGrant,
  useSetInheritance,
  useSetPrincipal,
  type AclPerm,
  type InheritancePreview,
  type PermissionGrantOut,
} from '@/features/sharing/link-hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { ManageAccessDialog } from './manage-access-dialog';

const LABEL = Object.fromEntries(ACL_PERMS) as Record<AclPerm, string>;

function who(g: { subject_type: string; subject_name?: string | null }) {
  return g.subject_type === 'organization'
    ? 'Everyone in the organization'
    : (g.subject_name ?? 'Unknown');
}

function Ticks({ perms }: { perms: string[] }) {
  return (
    <>
      {ACL_PERMS.map(([k, l]) => (
        <td key={k} className="px-2 py-1.5 text-center">
          {perms.includes(k) ? (
            <Check className="mx-auto size-4 text-ok" aria-label={`${l}: yes`} />
          ) : (
            <X className="mx-auto size-4 text-faint" aria-label={`${l}: no`} />
          )}
        </td>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ inheritance switch
function InheritanceDialog({
  folderId,
  next,
  preview,
  onClose,
}: {
  folderId: string;
  next: boolean;
  preview: InheritancePreview;
  onClose: () => void;
}) {
  const set = useSetInheritance(folderId);
  const [mode, setMode] = useState<'convert' | 'remove'>('convert');
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={next ? 'Turn inheritance on?' : 'Turn inheritance off?'}
        description={preview.note}
      >
        <DialogBody className="grid gap-3">
          {preview.affected.length > 0 && (
            <ul className="grid max-h-48 gap-1 overflow-y-auto text-[13px]">
              {preview.affected.map((a) => (
                <li key={a.grant_id} className="rounded-md bg-surface-2 px-2 py-1">
                  <strong>{who(a)}</strong> · from “{a.source_folder_name}” ·{' '}
                  {a.permissions.map((p) => LABEL[p as AclPerm] ?? p).join(', ') || 'no columns'}
                </li>
              ))}
            </ul>
          )}
          {!next && preview.affected.length > 0 && (
            <fieldset className="grid gap-1.5 text-[13px]">
              <legend className="mb-1 font-medium">What should happen to that access?</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="inh"
                  checked={mode === 'convert'}
                  onChange={() => setMode('convert')}
                />
                <span>
                  Copy it as direct permissions on this folder
                  <span className="block text-xs text-muted">
                    Nobody loses access. Recommended.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="inh"
                  checked={mode === 'remove'}
                  onChange={() => setMode('remove')}
                />
                <span>
                  Remove it
                  <span className="block text-xs text-warn">
                    These people lose access to this folder and what is inside it.
                  </span>
                </span>
              </label>
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={!next && mode === 'remove' && preview.affected.length ? 'danger' : 'primary'}
            disabled={set.isPending}
            onClick={() =>
              set.mutate(
                {
                  inherit: next,
                  convert: !next && mode === 'convert',
                  confirm: !next && mode === 'remove',
                },
                {
                  onSuccess: () => (
                    toast.success(next ? 'Inheritance turned on' : 'Inheritance turned off'),
                    onClose()
                  ),
                  onError: (e) => setError(friendlyMessage(e)),
                },
              )
            }
          >
            {set.isPending && <Loader2 className="animate-spin" aria-hidden />} Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ add users / groups
function AddPrincipalDialog({
  kind,
  id,
  mode,
  existingIds,
  onClose,
}: {
  kind: ResourceKind;
  id: string;
  mode: 'users' | 'groups';
  existingIds: string[];
  onClose: () => void;
}) {
  const groups = useGroups();
  const set = useSetPrincipal(kind, id);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [broad, setBroad] = useState(false);
  const add = (subjectType: 'user' | 'group' | 'organization', subjectId: string | null) =>
    set.mutate(
      { subjectType, subjectId, permissions: ['read'] },
      {
        onSuccess: () => (toast.success('Added with Read access'), onClose()),
        onError: (e) => setError(friendlyMessage(e)),
      },
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={mode === 'users' ? 'Add Users' : 'Add Groups'}
        description="New entries start with Read access only. Change the columns afterwards."
      >
        <DialogBody className="grid gap-3">
          {mode === 'users' ? (
            <MemberPicker
              label="Search by name or email"
              inputId="perm-user"
              excludeIds={existingIds}
              onSelect={(u) => add('user', u.id)}
            />
          ) : (
            <>
              <div className="grid gap-1">
                <Label htmlFor="perm-group-filter">Filter groups by name</Label>
                <Input
                  id="perm-group-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <ul className="scroll-thin max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {(groups.data?.items ?? [])
                  .filter(
                    (g) =>
                      g.name.toLowerCase().includes(filter.toLowerCase()) &&
                      !existingIds.includes(g.id),
                  )
                  .map((g) => (
                    <li key={g.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                      <span className="flex-1">{g.name}</span>
                      <Button size="sm" disabled={set.isPending} onClick={() => add('group', g.id)}>
                        Add
                      </Button>
                    </li>
                  ))}
                <li className="px-3 py-2 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="flex-1">
                      <strong>Everyone in the organization</strong>
                      <span className="block text-xs text-warn">
                        Gives every member access to this item.
                      </span>
                    </span>
                    <Button
                      size="sm"
                      disabled={!broad || set.isPending || existingIds.includes('organization')}
                      onClick={() => add('organization', null)}
                    >
                      Add
                    </Button>
                  </div>
                  <label className="mt-1 flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={broad}
                      onCheckedChange={(c) => setBroad(c === true)}
                      aria-label="Confirm broad access"
                    />
                    I understand this is broad access
                  </label>
                </li>
              </ul>
            </>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ tabs
function Security({ kind, id, canManage }: { kind: ResourceKind; id: string; canManage: boolean }) {
  const q = useAclView(kind, id);
  const setPrincipal = useSetPrincipal(kind, id);
  const revoke = useRevokeAclGrant(kind, id);
  const preview = useInheritancePreview(id);
  const [sub, setSub] = useState('users');
  const [adding, setAdding] = useState<null | 'users' | 'groups'>(null);
  const [inh, setInh] = useState<null | { next: boolean; preview: InheritancePreview }>(null);
  const [advanced, setAdvanced] = useState(false);

  if (q.isPending) return <SkeletonRows rows={5} label="Loading permissions" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const acl = q.data;
  const users = acl.direct.filter((g) => g.subject_type === 'user');
  const groups = acl.direct.filter((g) => g.subject_type !== 'user');
  const inheritedUsers = acl.inherited.filter((g) => g.subject_type === 'user');
  const inheritedGroups = acl.inherited.filter((g) => g.subject_type !== 'user');

  function toggle(g: PermissionGrantOut, perm: AclPerm, on: boolean) {
    const next = ACL_PERMS.map(([k]) => k).filter((k) =>
      k === perm ? on : g.permissions.includes(k),
    ) as AclPerm[];
    if (next.length === 0) return toast.error('Keep at least one permission, or remove the entry.');
    setPrincipal.mutate(
      {
        subjectType: g.subject_type,
        subjectId: g.subject_id ?? null,
        permissions: next,
        inherit: g.inherit,
      },
      { onError: (e) => toast.error(friendlyMessage(e)) },
    );
  }

  const table = (rows: PermissionGrantOut[], empty: string) =>
    rows.length === 0 ? (
      <p className="rounded-md bg-surface-2 px-3 py-4 text-center text-[13px] text-muted">
        {empty}
      </p>
    ) : (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[30rem] border-collapse text-[13px]">
          <caption className="sr-only">Direct permissions</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs text-muted">
              <th scope="col" className="px-3 py-1.5 font-medium">
                Name
              </th>
              {ACL_PERMS.map(([k, l]) => (
                <th key={k} scope="col" className="px-2 py-1.5 text-center font-medium">
                  {l}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.id}
                className="border-b border-line last:border-0"
                data-testid="direct-permission-row"
              >
                <td className="px-3 py-1.5">
                  <p className="font-medium">{who(g)}</p>
                  {g.expires_at && (
                    <p className="text-xs text-muted">Expires {formatDate(g.expires_at)}</p>
                  )}
                </td>
                {ACL_PERMS.map(([k, l]) => (
                  <td key={k} className="px-2 py-1.5 text-center">
                    <Checkbox
                      checked={g.permissions.includes(k)}
                      disabled={!canManage || setPrincipal.isPending}
                      aria-label={`${l} for ${who(g)}`}
                      onCheckedChange={(c) => toggle(g, k, c === true)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <Button
                    size="icon-sm"
                    variant="danger-ghost"
                    aria-label={`Remove ${who(g)}`}
                    disabled={!canManage || revoke.isPending}
                    onClick={() =>
                      revoke.mutate(g.id, {
                        onSuccess: () => toast.success('Removed'),
                        onError: (e) => toast.error(friendlyMessage(e)),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const inheritedTable = (rows: typeof acl.inherited) =>
    rows.length === 0 ? (
      <p className="text-xs text-muted">Nothing is inherited here.</p>
    ) : (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[30rem] border-collapse text-[13px]">
          <caption className="sr-only">Inherited permissions</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs text-muted">
              <th scope="col" className="px-3 py-1.5 font-medium">
                Name
              </th>
              {ACL_PERMS.map(([k, l]) => (
                <th key={k} scope="col" className="px-2 py-1.5 text-center font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.grant_id}
                className="border-b border-line last:border-0"
                data-testid="inherited-permission-row"
              >
                <td className="px-3 py-1.5">
                  <p className="font-medium">{who(g)}</p>
                  <p className="text-xs text-muted">Inherited from “{g.source_folder_name}”</p>
                </td>
                <Ticks perms={g.permissions} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="grid gap-4">
      {acl.inherit_enabled !== null && (
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox
            checked={acl.inherit_enabled}
            disabled={!canManage || preview.isPending}
            aria-label="Inherit Folder Level Security"
            onCheckedChange={(c) =>
              preview.mutate(c === true, {
                onSuccess: (p) => setInh({ next: c === true, preview: p }),
                onError: (e) => toast.error(friendlyMessage(e)),
              })
            }
          />
          <span>
            Inherit Folder Level Security
            <span className="block text-xs text-muted">
              {acl.inherit_enabled
                ? 'Permissions set on parent folders also apply here.'
                : 'Parent folder permissions do not apply here. Only the entries below do.'}
            </span>
          </span>
        </label>
      )}
      <Tabs value={sub} onValueChange={setSub}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="border-0">
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            disabled={!canManage}
            onClick={() => setAdding(sub === 'users' ? 'users' : 'groups')}
          >
            <UserPlus /> {sub === 'users' ? 'Add Users' : 'Add Groups'}
          </Button>
        </div>
        <TabsContent value="users">{table(users, 'No users have direct permissions.')}</TabsContent>
        <TabsContent value="groups">
          {table(groups, 'No groups have direct permissions.')}
        </TabsContent>
      </Tabs>
      <section aria-label="Inherited permissions" className="grid gap-2">
        <h3 className="text-[13px] font-semibold">Inherited Permissions</h3>
        {inheritedTable([...inheritedUsers, ...inheritedGroups])}
        {acl.note && <p className="text-xs text-warn">{acl.note}</p>}
      </section>
      <p className="text-xs text-muted">
        Need finer control (comment, rename, move, copy, upload versions…)?{' '}
        <button
          type="button"
          className="text-accent underline-offset-2 hover:underline"
          onClick={() => setAdvanced(true)}
        >
          Open advanced permissions
        </button>
      </p>
      {adding && (
        <AddPrincipalDialog
          kind={kind}
          id={id}
          mode={adding}
          existingIds={acl.direct.map((g) => g.subject_id ?? 'organization')}
          onClose={() => setAdding(null)}
        />
      )}
      {inh && (
        <InheritanceDialog
          folderId={id}
          next={inh.next}
          preview={inh.preview}
          onClose={() => setInh(null)}
        />
      )}
      {advanced && (
        <ManageAccessDialog
          open
          kind={kind}
          id={id}
          name={acl.resource_name}
          permissions={['administer', 'manage_access']}
          onOpenChange={(o) => !o && setAdvanced(false)}
        />
      )}
    </div>
  );
}

function CheckAccessTab({ kind, id }: { kind: ResourceKind; id: string }) {
  const [email, setEmail] = useState('');
  const check = useCheckAccess(kind, id);
  const r = check.data;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">
        Shows what a person can do here and why. It is a diagnostic: it grants nothing and uses the
        same rules as every request.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) check.mutate(email.trim());
        }}
      >
        <div className="grid min-w-64 flex-1 gap-1">
          <Label htmlFor="check-email">User email or account</Label>
          <Input
            id="check-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <Button type="submit" variant="primary" disabled={!email.trim() || check.isPending}>
          {check.isPending ? <Loader2 className="animate-spin" /> : <ShieldQuestion />} Check user
          access
        </Button>
      </form>
      {check.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {isApiError(check.error) && check.error.status === 404
            ? 'No such person in this organization.'
            : friendlyMessage(check.error)}
        </p>
      )}
      {r && (
        <div className="grid gap-2 text-[13px]" aria-live="polite">
          <p>
            <strong>{r.user_email}</strong>{' '}
            {r.account_state === 'inactive' ? <Badge tone="danger">Inactive account</Badge> : null}
          </p>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[26rem] border-collapse">
              <caption className="sr-only">Effective permissions</caption>
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs text-muted">
                  {ACL_PERMS.map(([k, l]) => (
                    <th key={k} scope="col" className="px-2 py-1.5 text-center font-medium">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Ticks perms={r.permissions} />
                </tr>
              </tbody>
            </table>
          </div>
          {Object.entries(r.capabilities).map(([cap, sources]) => (
            <p key={cap} className="text-xs">
              <strong>{LABEL[cap as AclPerm] ?? cap}</strong>: {sources.join('; ') || 'granted'}
            </p>
          ))}
          {r.permissions.length === 0 && (
            <p className="text-xs text-muted">This person has no access to this item.</p>
          )}
          {r.note && <p className="text-xs text-warn">{r.note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Manage Folder Permissions (and the same for a file): Security tab with the inheritance switch, direct
 * Read/Write/Share/Delete/Manage entries for users and groups, the inherited entries and where they come from;
 * and a Check Access tab. Edits apply immediately and are enforced by the server.
 */
export function FolderPermissionsDialog({
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
  const canManage = permissions.includes('manage_access') || permissions.includes('administer');
  const acl = useAclView(kind, id, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        title={kind === 'folder' ? 'Manage Folder Permissions' : 'Manage File Permissions'}
        description={acl.data?.path ?? name}
      >
        <DialogBody>
          <Tabs defaultValue="security">
            <TabsList>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="check">Check Access</TabsTrigger>
            </TabsList>
            <TabsContent value="security">
              {open && <Security kind={kind} id={id} canManage={canManage} />}
            </TabsContent>
            <TabsContent value="check">
              {open && <CheckAccessTab kind={kind} id={id} />}
            </TabsContent>
          </Tabs>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
