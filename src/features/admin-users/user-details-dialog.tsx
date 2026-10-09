'use client';

import {
  Bell,
  Folder,
  HardDrive,
  Loader2,
  Mail,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminGroups } from '@/features/admin/hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatBytes, formatDate, formatDateTime, formatRelative, titleCase } from '@/lib/format';
import {
  useAdminUser,
  useReplaceGroups,
  useUpdateUser,
  useUserQuota,
  useUserShares,
  type AdminUser,
} from './api';
import { ActivityPanel } from './activity-panel';
import { ACCESS_LEVELS } from './add-user-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';
import { PolicyEditor } from './policy-editor';

export const STATE_TONE = {
  active: 'ok',
  invited: 'info',
  disabled: 'danger',
  locked: 'warn',
  expired: 'warn',
} as const;

// Reference-screen controls that need a feature DMS does not have. Listed, never faked.
const NOT_AVAILABLE: { label: string; why: string }[] = [
  { label: 'Profile image', why: 'Profile pictures are not supported yet.' },
  { label: 'Password expires on', why: 'Passwords are managed by the identity provider.' },
  { label: 'Change password on login', why: 'Passwords are managed by the identity provider.' },
  { label: 'Disable sync', why: 'There is no desktop sync client yet.' },
  { label: 'Backup path', why: 'There is no backup integration yet.' },
  { label: 'TOS date', why: 'Terms-of-service acceptance is not tracked yet.' },
  { label: 'Email verified (edit)', why: 'Set by the identity provider; shown read-only.' },
];

function Tile({
  icon: Icon,
  label,
  onClick,
  unavailable,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  unavailable?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!unavailable}
      title={unavailable}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-md border border-line px-2 py-2.5 text-center text-xs transition-colors enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 ${danger ? 'text-danger' : ''}`}
    >
      <Icon className="size-5" aria-hidden />
      <span className="font-medium">{label}</span>
      {unavailable && <span className="text-[10px] leading-3 text-muted">{unavailable}</span>}
    </button>
  );
}

function SummaryCard({ user }: { user: AdminUser }) {
  const quota = useUserQuota(user.user_id);
  const q = quota.data;
  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface-2/50 p-3 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold">{user.display_name ?? user.email}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <Badge tone={STATE_TONE[user.state]}>{titleCase(user.state)}</Badge>
          <Badge tone="outline">{titleCase(user.access_level)} access</Badge>
          <Badge tone="outline">{titleCase(user.role)}</Badge>
        </p>
        <p className="mt-1 text-xs text-muted">
          Last login: {user.last_login_at ? formatDateTime(user.last_login_at) : '--'} · TOS: Not
          tracked
        </p>
      </div>
      <dl className="grid min-w-52 grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <dt className="text-muted">Total quota</dt>
        <dd className="text-right tabular-nums">
          {quota.isPending
            ? '…'
            : q?.quota_bytes
              ? formatBytes(q.quota_bytes)
              : 'No personal limit'}
        </dd>
        <dt className="text-muted">Used storage</dt>
        <dd className="text-right tabular-nums">{q ? formatBytes(q.used_bytes) : '…'}</dd>
        <dt className="text-muted">Available</dt>
        <dd className="text-right tabular-nums">
          {q ? (q.available_bytes === null ? 'Unlimited' : formatBytes(q.available_bytes)) : '…'}
        </dd>
        <dd className="col-span-2 flex items-center justify-end gap-1 text-muted">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-text"
            onClick={() => void quota.refetch()}
            aria-label="Refresh usage"
          >
            <RefreshCw className={`size-3 ${quota.isFetching ? 'animate-spin' : ''}`} aria-hidden />
            {q ? `Calculated ${formatRelative(q.calculated_at)}` : 'Refresh'}
          </button>
        </dd>
      </dl>
    </div>
  );
}

function DetailsForm({
  user,
  onDirty,
  onSaved,
}: {
  user: AdminUser;
  onDirty: (d: boolean) => void;
  onSaved: () => void;
}) {
  const update = useUpdateUser();
  const initial = {
    display_name: user.display_name ?? '',
    username: user.username ?? '',
    secondary_email: user.secondary_email ?? '',
    phone: user.phone ?? '',
    notes: user.notes ?? '',
    access_level: user.access_level,
    expires: user.account_expires_at ? user.account_expires_at.slice(0, 10) : '',
    locked: user.account_locked,
  };
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  function save() {
    setErrors({});
    update.mutate(
      {
        userId: user.user_id,
        body: {
          display_name: f.display_name,
          username: f.username,
          secondary_email: f.secondary_email,
          phone: f.phone,
          notes: f.notes,
          access_level: f.access_level,
          account_locked: f.locked,
          clear_account_expiry: !f.expires && !!initial.expires,
          account_expires_at: f.expires ? new Date(`${f.expires}T23:59:59Z`).toISOString() : null,
        },
      },
      {
        onSuccess: () => {
          toast.success('User saved');
          onSaved();
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'username_taken')
            setErrors({ username: 'That user name is already in use.' });
          else if (isApiError(e) && e.code === 'invalid_username')
            setErrors({ username: e.message });
          else if (isApiError(e) && e.code === 'invalid_phone') setErrors({ phone: e.message });
          else if (isApiError(e) && e.code === 'invalid_email')
            setErrors({ secondary_email: e.message });
          else toast.error(friendlyMessage(e));
        },
      },
    );
  }

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ud-email" label="Email">
          {(p) => <Input {...p} value={user.email} readOnly />}
        </Field>
        <Field id="ud-name" label="User name" error={errors.username}>
          {(p) => (
            <Input {...p} value={f.username} onChange={(e) => set('username', e.target.value)} />
          )}
        </Field>
        <Field id="ud-display" label="Display name">
          {(p) => (
            <Input
              {...p}
              value={f.display_name}
              onChange={(e) => set('display_name', e.target.value)}
            />
          )}
        </Field>
        <Field id="ud-second" label="Secondary email" error={errors.secondary_email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={f.secondary_email}
              onChange={(e) => set('secondary_email', e.target.value)}
            />
          )}
        </Field>
        <Field
          id="ud-level"
          label="Access level"
          hint={ACCESS_LEVELS.find((a) => a.value === f.access_level)?.hint}
        >
          {(p) => (
            <Select
              {...p}
              value={f.access_level}
              onChange={(e) => set('access_level', e.target.value as typeof f.access_level)}
            >
              {ACCESS_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="ud-auth" label="Authentication">
          {(p) => (
            <Input
              {...p}
              value={user.authentication === 'default' ? 'Default' : user.authentication}
              readOnly
            />
          )}
        </Field>
        <Field
          id="ud-phone"
          label="Phone number"
          hint="International format, e.g. +14155550123"
          error={errors.phone}
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              value={f.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          )}
        </Field>
        <Field
          id="ud-expires"
          label="Account expires on"
          hint="End of that day, UTC. Leave empty for no expiry."
        >
          {(p) => (
            <Input
              {...p}
              type="date"
              value={f.expires}
              onChange={(e) => set('expires', e.target.value)}
            />
          )}
        </Field>
        <Field id="ud-source" label="Creation source">
          {(p) => <Input {...p} value={titleCase(user.creation_source)} readOnly />}
        </Field>
        <Field id="ud-verified" label="Email verified">
          {(p) => <Input {...p} value={user.email_verified ? 'Yes' : 'No'} readOnly />}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <Switch
          checked={f.locked}
          onCheckedChange={(v) => set('locked', v)}
          aria-label="Account locked"
        />
        <span>
          Account locked{' '}
          <span className="text-muted">
            — signs the person out and blocks sign-in until unlocked
          </span>
        </span>
      </label>
      <Field
        id="ud-notes"
        label="Notes"
        hint="Visible to administrators only. Not written to the audit log."
      >
        {(p) => (
          <Textarea
            {...p}
            value={f.notes}
            onChange={(e) => set('notes', e.target.value)}
            maxLength={2000}
          />
        )}
      </Field>
      <details className="rounded-md border border-line px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Not available in this DMS</summary>
        <ul className="mt-2 grid gap-1 text-muted">
          {NOT_AVAILABLE.map((n) => (
            <li key={n.label}>
              <strong className="text-text">{n.label}</strong>: {n.why}
            </li>
          ))}
        </ul>
      </details>
      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t border-line bg-surface px-1 py-2.5">
        {dirty && <span className="mr-auto text-xs text-muted">Unsaved changes</span>}
        <Button type="submit" variant="primary" disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="animate-spin" aria-hidden />} Save
        </Button>
      </div>
    </form>
  );
}

function GroupsTab({ user }: { user: AdminUser }) {
  const groups = useAdminGroups('', 200, 0);
  const replace = useReplaceGroups();
  const [selected, setSelected] = useState<Set<string>>(new Set(user.group_ids));
  const dirty =
    selected.size !== user.group_ids.length || user.group_ids.some((g) => !selected.has(g));
  if (groups.isPending) return <Skeleton className="h-24" />;
  if (groups.isError)
    return <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />;
  const items = groups.data.items;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">
        Group membership gives access only through permissions and shares granted to the group. It
        never elevates anyone’s role. Directory-synchronized groups are managed by the directory.
      </p>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">No groups yet. Create one on the Groups page.</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((g) => (
            <li key={g.id}>
              <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2">
                <Checkbox
                  checked={selected.has(g.id)}
                  onCheckedChange={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (v === true) n.add(g.id);
                      else n.delete(g.id);
                      return n;
                    })
                  }
                />
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-muted">{g.member_count} members</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty || replace.isPending}
          onClick={() =>
            replace.mutate(
              { userId: user.user_id, groupIds: [...selected] },
              {
                onSuccess: () => toast.success('Groups updated'),
                onError: (e) => toast.error(friendlyMessage(e)),
              },
            )
          }
        >
          {replace.isPending && <Loader2 className="animate-spin" aria-hidden />} Save groups
        </Button>
      </div>
    </div>
  );
}

function SharesTab({ userId, active }: { userId: string; active: boolean }) {
  const shares = useUserShares(userId, active);
  if (shares.isPending) return <Skeleton className="h-24" />;
  if (shares.isError)
    return <ErrorState error={shares.error} onRetry={() => void shares.refetch()} />;
  if (shares.data.length === 0)
    return (
      <p className="py-6 text-center text-[13px] text-muted">
        This person has not shared anything.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[32rem] border-collapse text-[13px]">
        <caption className="sr-only">Shares created by this user</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs text-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              Item
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Permission
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Recipients
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Created
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {shares.data.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium">{s.resource_name ?? titleCase(s.resource_type)}</p>
                <p className="text-xs text-muted">{titleCase(s.resource_type)}</p>
              </td>
              <td className="px-3 py-2 text-muted">{s.actions.join(', ')}</td>
              <td className="px-3 py-2">{s.recipient_count}</td>
              <td className="px-3 py-2 text-muted">{formatDate(s.created_at)}</td>
              <td className="px-3 py-2">
                {s.revoked_at ? (
                  <Badge tone="danger">Revoked</Badge>
                ) : s.expires_at && new Date(s.expires_at) < new Date() ? (
                  <Badge tone="warn">Expired</Badge>
                ) : (
                  <Badge tone="ok">
                    Active{s.expires_at ? ` · until ${formatDate(s.expires_at)}` : ''}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Admin view of one account: summary + quick actions + details/groups/shares/activity. */
export function UserDetailsDialog({
  userId,
  onClose,
  initialTab = 'details',
}: {
  userId: string | null;
  onClose: () => void;
  initialTab?: string;
}) {
  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl"
        title="User details"
        description="Profile, access, groups, policy and activity for this account."
      >
        {userId && (
          <Content key={userId} userId={userId} onClose={onClose} initialTab={initialTab} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Content({
  userId,
  onClose,
  initialTab,
}: {
  userId: string;
  onClose: () => void;
  initialTab: string;
}) {
  const q = useAdminUser(userId);
  const [tab, setTab] = useState(initialTab);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [policy, setPolicy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (q.isPending) return <Skeleton className="m-5 h-64" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const user = q.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <SummaryCard user={user} />
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          <Tile icon={Folder} label="Manage files" unavailable="Not available" />
          <Tile icon={ShieldCheck} label="Manage policy" onClick={() => setPolicy('general')} />
          <Tile icon={Share2} label="Manage shares" onClick={() => setTab('shares')} />
          <Tile icon={Smartphone} label="Mobile devices" unavailable="No device service" />
          <Tile icon={KeyRound} label="Reset password" unavailable="Identity provider" />
          <Tile icon={Mail} label="Send email" unavailable="No email provider" />
          <Tile icon={Bell} label="Notifications" onClick={() => setPolicy('notifications')} />
          <Tile icon={HardDrive} label="Backups" unavailable="Not available" />
          <Tile icon={Trash2} label="Delete account" danger onClick={() => setDeleting(true)} />
        </div>
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="shares">Shares</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <DetailsForm
              key={[
                user.display_name,
                user.username,
                user.secondary_email,
                user.phone,
                user.notes,
                user.access_level,
                user.account_expires_at,
                user.account_locked,
              ].join('|')}
              user={user}
              onDirty={setDirty}
              onSaved={() => setDirty(false)}
            />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsTab key={user.group_ids.join(',')} user={user} />
          </TabsContent>
          <TabsContent value="shares">
            <SharesTab userId={user.user_id} active={tab === 'shares'} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityPanel userId={user.user_id} compact />
          </TabsContent>
        </Tabs>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={() => (dirty ? setConfirmClose(true) : onClose())}>
          Close
        </Button>
      </div>

      <Dialog open={policy !== null} onOpenChange={(o) => !o && setPolicy(null)}>
        <DialogContent
          className="h-[85vh] max-w-3xl"
          title={`Effective policy: ${user.display_name ?? user.email}`}
          description="Overrides apply to this person only; other values come from the organization and their groups."
        >
          {policy !== null && (
            <PolicyEditor
              scope={{ kind: 'user', id: user.user_id }}
              title={`Policy for ${user.email}`}
              initialTab={policy}
              onClose={() => setPolicy(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <DeleteAccountDialog
        user={deleting ? user : null}
        onClose={() => setDeleting(false)}
        onDeleted={onClose}
      />
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard unsaved changes?"
        description="Your edits to this user have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
      />
    </div>
  );
}
