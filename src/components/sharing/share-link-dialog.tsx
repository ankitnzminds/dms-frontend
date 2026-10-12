'use client';

import {
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Label } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMe } from '@/features/auth/session';
import { MemberPicker } from '@/features/members/member-picker';
import { useGroups, type ResourceKind } from '@/features/sharing/hooks';
import {
  SHARE_PERMS,
  trackLink,
  useAddShareGroup,
  useInvite,
  useOpenShare,
  useRemoveRecipient,
  useRemoveShare,
  useRotateLink,
  useSetSharePermissions,
  useShareHistory,
  useShareOptions,
  useUpdateShare,
  type SharePerm,
  type ShareOut,
  type ShareUpdate,
} from '@/features/sharing/link-hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { isAdminRole } from '@/lib/permissions';

type Recipient = ShareOut['recipients'][number];
const rkey = (r: Pick<Recipient, 'type' | 'id'>) => `${r.type}:${r.id}`;

interface Draft {
  name: string;
  expiry: 'never' | 'at';
  expiresAt: string;
  quota: 'unlimited' | 'limited';
  quotaMb: string;
  notify: boolean;
  restricted: boolean;
  owner: { id: string; label: string } | null;
  matrix: Record<string, SharePerm[]>;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function baseline(s: ShareOut): Draft {
  return {
    name: s.name ?? s.resource_name ?? '',
    expiry: s.expires_at ? 'at' : 'never',
    expiresAt: toLocalInput(s.expires_at),
    quota: s.upload_quota_mb ? 'limited' : 'unlimited',
    quotaMb: s.upload_quota_mb ? String(s.upload_quota_mb) : '',
    notify: s.notify_email,
    restricted: s.restricted,
    owner: s.owner ? { id: s.owner.id, label: s.owner.display_name ?? s.owner.email ?? '' } : null,
    matrix: Object.fromEntries(s.recipients.map((r) => [rkey(r), r.permissions as SharePerm[]])),
  };
}

// ============================================================ Invite Users
export function InviteUsersDialog({
  shareId,
  open,
  onOpenChange,
  defaultEmail = false,
  existing,
}: {
  shareId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultEmail?: boolean;
  existing: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Invite Users"
        description="They start with View access only. You can change what each person may do afterwards."
      >
        {open && (
          <InviteBody
            shareId={shareId}
            onOpenChange={onOpenChange}
            defaultEmail={defaultEmail}
            existing={existing}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteBody({
  shareId,
  onOpenChange,
  defaultEmail,
  existing,
}: {
  shareId: string;
  onOpenChange: (o: boolean) => void;
  defaultEmail: boolean;
  existing: string[];
}) {
  const invite = useInvite(shareId);
  const [picked, setPicked] = useState<{ id: string; label: string; email: string }[]>([]);
  const [sendEmail, setSendEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <DialogBody className="grid gap-3">
        <MemberPicker
          label="Search by name, user name or email"
          inputId="invite-search"
          excludeIds={[...picked.map((p) => p.id), ...existing]}
          onSelect={(u) =>
            setPicked((p) => [
              ...p,
              { id: u.id, label: u.display_name ?? u.email ?? u.id, email: u.email ?? '' },
            ])
          }
        />
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Selected ({picked.length})</p>
          {picked.length === 0 ? (
            <p className="text-xs text-faint">Nobody selected yet.</p>
          ) : (
            <ul className="grid gap-1">
              {picked.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-[13px]"
                >
                  <span className="flex-1 truncate">{p.label}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${p.label}`}
                    onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox
            checked={sendEmail}
            onCheckedChange={(c) => setSendEmail(c === true)}
            aria-label="Send email"
          />
          <span>
            Send Email
            <span className="block text-xs text-muted">
              Sent only if an email provider is configured and notifications are on for this share.
              The email contains no link token.
            </span>
          </span>
        </label>
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
          disabled={picked.length === 0 || invite.isPending}
          onClick={() =>
            invite.mutate(
              { emails: picked.map((p) => p.email), sendEmail },
              {
                onSuccess: (r) => {
                  toast.success(
                    `Added ${r.invited.length} user${r.invited.length === 1 ? '' : 's'}` +
                      (r.email === 'not_configured'
                        ? '. No email was sent: email delivery is not configured.'
                        : ''),
                  );
                  if (r.skipped.length) toast.message(r.skipped.join(' '));
                  onOpenChange(false);
                },
                onError: (e) => setError(friendlyMessage(e)),
              },
            )
          }
        >
          {invite.isPending && <Loader2 className="animate-spin" aria-hidden />} Add Users to this
          Share
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================================ Add Group
export function AddGroupDialog({
  shareId,
  open,
  onOpenChange,
  existing,
}: {
  shareId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Group" description="Groups start with View access only.">
        {open && <AddGroupBody shareId={shareId} onOpenChange={onOpenChange} existing={existing} />}
      </DialogContent>
    </Dialog>
  );
}

function AddGroupBody({
  shareId,
  onOpenChange,
  existing,
}: {
  shareId: string;
  onOpenChange: (o: boolean) => void;
  existing: string[];
}) {
  const groups = useGroups();
  const add = useAddShareGroup(shareId);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<string>('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = (groups.data?.items ?? []).filter(
    (g) => g.name.toLowerCase().includes(filter.toLowerCase()) && !existing.includes(g.id),
  );
  const everyone = picked === '__everyone';
  return (
    <>
      <DialogBody className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="group-filter">Filter groups by name</Label>
          <Input id="group-filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul
          className="scroll-thin max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line"
          role="radiogroup"
          aria-label="Groups"
        >
          <li>
            <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-[13px] hover:bg-surface-2">
              <input
                type="radio"
                name="grp"
                checked={everyone}
                onChange={() => setPicked('__everyone')}
              />
              <span>
                <strong>EVERYONE</strong>
                <span className="block text-xs text-warn">
                  Every member of the organization. External people are not included.
                </span>
              </span>
            </label>
          </li>
          {items.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-surface-2">
                <input
                  type="radio"
                  name="grp"
                  checked={picked === g.id}
                  onChange={() => setPicked(g.id)}
                />
                <span className="flex-1">{g.name}</span>
                <span className="text-xs text-muted">{g.member_count} members</span>
              </label>
            </li>
          ))}
          {items.length === 0 && !groups.isPending && (
            <li className="px-3 py-3 text-center text-xs text-muted">No matching groups.</li>
          )}
        </ul>
        {everyone && (
          <label className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
            <Checkbox
              checked={confirm}
              onCheckedChange={(c) => setConfirm(c === true)}
              aria-label="Confirm EVERYONE"
            />
            <span>
              I understand that everyone in the organization will be able to open this item.
            </span>
          </label>
        )}
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
          disabled={!picked || (everyone && !confirm) || add.isPending}
          onClick={() =>
            add.mutate(
              { groupId: everyone ? null : picked, everyone, confirmBroad: confirm },
              {
                onSuccess: () => (toast.success('Group added'), onOpenChange(false)),
                onError: (e) => setError(friendlyMessage(e)),
              },
            )
          }
        >
          {add.isPending && <Loader2 className="animate-spin" aria-hidden />} Add
        </Button>
      </DialogFooter>
    </>
  );
}

// ============================================================ matrix table
function Matrix({
  rows,
  draft,
  onToggle,
  onRemove,
  label,
  empty,
}: {
  rows: Recipient[];
  draft: Draft;
  onToggle: (r: Recipient, perm: SharePerm, on: boolean) => void;
  onRemove: (r: Recipient) => void;
  label: string;
  empty: string;
}) {
  if (rows.length === 0)
    return (
      <p className="rounded-md bg-surface-2 px-3 py-4 text-center text-[13px] text-muted">
        {empty}
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[34rem] border-collapse text-[13px]">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs text-muted">
            <th scope="col" className="px-3 py-1.5 font-medium">
              Name
            </th>
            {SHARE_PERMS.map(([k, l, help]) => (
              <th key={k} scope="col" className="px-2 py-1.5 text-center font-medium" title={help}>
                {l}
              </th>
            ))}
            <th scope="col" className="px-2 py-1.5">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const held = draft.matrix[rkey(r)] ?? [];
            return (
              <tr key={rkey(r)} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5">
                  <p className="font-medium">{r.name ?? r.email}</p>
                  {r.email && r.name && <p className="text-xs text-muted">{r.email}</p>}
                </td>
                {SHARE_PERMS.map(([k, l]) => (
                  <td key={k} className="px-2 py-1.5 text-center">
                    <Checkbox
                      checked={held.includes(k)}
                      aria-label={`${l} for ${r.name ?? r.email}`}
                      onCheckedChange={(c) => onToggle(r, k, c === true)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <Button
                    size="icon-sm"
                    variant="danger-ghost"
                    aria-label={`Remove ${r.name ?? r.email}`}
                    onClick={() => onRemove(r)}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================ history
function HistoryTab({ shareId }: { shareId: string }) {
  const [offset, setOffset] = useState(0);
  const q = useShareHistory(shareId, offset);
  if (q.isPending) return <SkeletonRows rows={4} label="Loading share history" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.items.length === 0)
    return (
      <EmptyState title="No history yet" description="Events appear here as the share changes." />
    );
  return (
    <div className="grid gap-2">
      <ol className="divide-y divide-line rounded-md border border-line">
        {q.data.items.map((h) => (
          <li
            key={h.id}
            className="grid gap-0.5 px-3 py-2 text-[13px]"
            data-testid="share-history-row"
          >
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{h.summary}</span>
              {h.outcome !== 'success' && <Badge tone="warn">{h.outcome}</Badge>}
            </p>
            <p className="text-xs text-muted">
              {h.actor?.display_name ?? h.actor?.email ?? 'Someone outside the organization'} ·{' '}
              {formatDateTime(h.occurred_at)}
              {h.ip_address ? ` · ${h.ip_address}` : ''}
            </p>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {offset + 1}–{offset + q.data.items.length} of {q.data.total}
        </span>
        <span className="flex gap-1">
          <Button
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            disabled={offset + 20 >= q.data.total}
            onClick={() => setOffset(offset + 20)}
          >
            Next
          </Button>
        </span>
      </div>
    </div>
  );
}

// ============================================================ the dialog
export function ShareLinkDialog({
  kind,
  id,
  name,
  open,
  onOpenChange,
  shareId: given,
}: {
  kind: ResourceKind;
  id: string;
  name: string;
  /** Edit this specific share (e.g. from "Shared by me") instead of opening the item's share. */
  shareId?: string;
  /** The caller's permissions (kept for call-site compatibility; the server decides). */
  permissions?: readonly string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const opener = useOpenShare();
  const [opened, setShareId] = useState<string | null>(null);
  const shareId = given ?? opened;
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);
  const closeRef = useRef<() => void>(() => onOpenChange(false));

  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (started.current || given) return;
    started.current = true;
    opener.mutate(
      { kind, id },
      {
        onSuccess: (s) => setShareId(s.id),
        onError: (e) => setFailed(friendlyMessage(e)),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, id, given]);

  const title = `Share link for ${kind === 'folder' ? 'folder' : 'file'} ${name}`;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeRef.current()}>
      <DialogContent
        className="max-w-3xl"
        title={title}
        description="Who can open this item, and what they can do."
        onInteractOutside={(e) => e.preventDefault()}
      >
        {failed ? (
          <>
            <DialogBody>
              <p role="alert" className="text-[13px] text-danger">
                {failed}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : shareId ? (
          <Body
            shareId={shareId}
            kind={kind}
            onClose={() => onOpenChange(false)}
            registerClose={(fn) => (closeRef.current = fn)}
          />
        ) : (
          <DialogBody>
            <SkeletonRows rows={4} label="Opening share" />
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  shareId,
  kind,
  onClose,
  registerClose,
}: {
  shareId: string;
  kind: ResourceKind;
  onClose: () => void;
  registerClose: (fn: () => void) => void;
}) {
  const q = useShareOptions(shareId);
  const me = useMe();
  const update = useUpdateShare(shareId);
  const rotate = useRotateLink(shareId);
  const setPerms = useSetSharePermissions(shareId);
  const removeRecipient = useRemoveRecipient(shareId);
  const removeShare = useRemoveShare(shareId);

  const share = q.data;
  const base = useMemo(() => (share ? baseline(share) : null), [share]);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Earliest allowed expiry, fixed when the dialog opens (no past dates or times).
  const [minExpiry] = useState(() => toLocalInput(new Date(Date.now() + 60_000).toISOString()));
  const [tab, setTab] = useState('options');
  const [people, setPeople] = useState('users');
  const [editName, setEditName] = useState(false);
  const [editOwner, setEditOwner] = useState(false);
  const [invite, setInvite] = useState<null | { email: boolean }>(null);
  const [addGroup, setAddGroup] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirtyRef = useRef(false);
  // adopt the server's values whenever they change and nothing is being edited
  useEffect(() => {
    if (base && !isDirtyRef.current) setDraft(base);
  }, [base]);
  const dirty = !!(draft && base && JSON.stringify(draft) !== JSON.stringify(base));
  useEffect(() => {
    isDirtyRef.current = dirty;
  });
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());
  useEffect(() => {
    registerClose(requestClose);
  });

  if (q.isPending || !draft || !base)
    return (
      <DialogBody>
        <SkeletonRows rows={5} label="Loading share options" />
      </DialogBody>
    );
  if (q.isError || !share)
    return (
      <DialogBody>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </DialogBody>
    );

  const canChangeOwner =
    share.can_manage && (isAdminRole(me.data?.role) || me.data?.user_id === share.owner?.id);
  const users = share.recipients.filter((r) => r.type === 'user');
  const groups = share.recipients.filter((r) => r.type !== 'user');
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function save(): Promise<boolean> {
    if (!draft || !base || !share) return true;
    setError(null);
    const body: ShareUpdate = {};
    if (draft.name.trim() && draft.name.trim() !== base.name) body.name = draft.name.trim();
    if (draft.owner && draft.owner.id !== base.owner?.id) body.owner_id = draft.owner.id;
    if (draft.expiry !== base.expiry || draft.expiresAt !== base.expiresAt) {
      if (draft.expiry === 'never') body.never_expires = true;
      else if (draft.expiresAt) {
        // The picker already blocks past times; this also catches a typed value or a stale tab.
        if (new Date(draft.expiresAt).getTime() <= Date.now() + 60_000)
          return (setError('Choose an expiry date and time in the future.'), false);
        body.expires_at = new Date(draft.expiresAt).toISOString();
      } else return (setError('Choose when the share expires.'), false);
    }
    if (draft.quota !== base.quota || draft.quotaMb !== base.quotaMb) {
      if (draft.quota === 'unlimited') body.unlimited_quota = true;
      else {
        const n = Number(draft.quotaMb);
        if (!Number.isInteger(n) || n < 1)
          return (setError('Enter the upload quota as a whole number of MB.'), false);
        body.upload_quota_mb = n;
      }
    }
    if (draft.notify !== base.notify) body.notify_email = draft.notify;
    if (draft.restricted !== base.restricted) body.restricted = draft.restricted;
    const changedPrincipals = share.recipients
      .filter(
        (r) =>
          JSON.stringify(draft.matrix[rkey(r)] ?? []) !==
          JSON.stringify(base.matrix[rkey(r)] ?? []),
      )
      .map((r) => ({ type: r.type, id: r.id, permissions: draft.matrix[rkey(r)] ?? [] }));
    try {
      if (Object.keys(body).length) await update.mutateAsync(body);
      if (changedPrincipals.length) {
        if (changedPrincipals.some((p) => p.permissions.length === 0))
          return (
            setError('Every person or group needs at least View. Remove them instead.'),
            false
          );
        await setPerms.mutateAsync(changedPrincipals);
      }
      toast.success('Share saved');
      isDirtyRef.current = false;
      await q.refetch();
      return true;
    } catch (e) {
      setError(friendlyMessage(e));
      return false;
    }
  }

  const toggle = (r: Recipient, perm: SharePerm, on: boolean) =>
    set({
      matrix: {
        ...draft.matrix,
        [rkey(r)]: SHARE_PERMS.map(([k]) => k).filter((k) =>
          k === perm ? on : (draft.matrix[rkey(r)] ?? []).includes(k),
        ) as SharePerm[],
      },
    });

  const copy = async () => {
    if (!share.link_url) return;
    try {
      await navigator.clipboard.writeText(share.link_url);
      toast.success('Link copied. It only works for people it is shared with.');
      void trackLink(share.id, 'copied');
    } catch {
      toast.error('Could not copy the link.');
    }
  };
  const busy = update.isPending || setPerms.isPending;

  return (
    <>
      <DialogBody className="grid gap-4">
        <section aria-label="Share link" className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="share-link-field" className="w-24 shrink-0">
              Share Link
            </Label>
            <Input
              id="share-link-field"
              readOnly
              value={share.link_url ?? ''}
              placeholder={share.link_enabled ? 'Link unavailable' : 'The link is off'}
              className="min-w-0 flex-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Link2 /> Modify Link
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {share.link_enabled ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      update.mutate(
                        { link_enabled: false },
                        {
                          onSuccess: () => toast.success('Link turned off'),
                          onError: (e) => toast.error(friendlyMessage(e)),
                        },
                      )
                    }
                  >
                    Turn the link off
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() =>
                      update.mutate(
                        { link_enabled: true },
                        {
                          onSuccess: () => toast.success('Link turned on'),
                          onError: (e) => toast.error(friendlyMessage(e)),
                        },
                      )
                    }
                  >
                    Turn the link on
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={!share.link_enabled}
                  reason={!share.link_enabled ? 'Turn the link on first.' : undefined}
                  onSelect={() =>
                    rotate.mutate(undefined, {
                      onSuccess: () =>
                        toast.success('New link issued. The old one no longer works.'),
                      onError: (e) => toast.error(friendlyMessage(e)),
                    })
                  }
                >
                  <RefreshCw /> Issue a new link…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Share with people"
              title="Share with people"
              onClick={() => setInvite({ email: false })}
            >
              <UserPlus />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Copy link"
              title="Copy link"
              disabled={!share.link_url}
              onClick={() => void copy()}
            >
              <Copy />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Open link in a new tab"
              title="Open link in a new tab"
              disabled={!share.link_url}
              onClick={() => {
                window.open(share.link_url!, '_blank', 'noopener,noreferrer');
                void trackLink(share.id, 'opened');
              }}
            >
              <ExternalLink />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Send by email"
              title="Invite by email"
              onClick={() => setInvite({ email: true })}
            >
              <Mail />
            </Button>
          </div>
          <p className="pl-[6.5rem] text-xs text-muted">
            {kind === 'folder' ? 'Shared Folder' : 'Shared Item'}:{' '}
            <span className="font-mono">{share.resource_path ?? share.resource_name}</span>
            {' · '}
            Access follows the permissions below; showing a path does not give access to parent
            folders.
          </p>
        </section>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="options">Share Options</TabsTrigger>
            <TabsTrigger value="history">Share History</TabsTrigger>
          </TabsList>
          <TabsContent value="options" className="grid gap-4">
            <dl className="grid gap-3 text-[13px] sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted">Share Name</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {editName ? (
                  <Input
                    aria-label="Share name"
                    className="w-64"
                    value={draft.name}
                    maxLength={200}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                ) : (
                  <span className="font-medium">{draft.name}</span>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditName((v) => !v)}>
                  {editName ? 'Done' : 'Change'}
                </Button>
              </dd>
              <dt className="text-muted">Share Owner</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {editOwner && canChangeOwner ? (
                  <MemberPicker
                    label="New owner"
                    inputId="owner-picker"
                    onSelect={(u) => (
                      set({ owner: { id: u.id, label: u.display_name ?? u.email ?? u.id } }),
                      setEditOwner(false)
                    )}
                  />
                ) : (
                  <span className="font-medium">{draft.owner?.label}</span>
                )}
                {canChangeOwner && !editOwner && (
                  <Button size="sm" variant="ghost" onClick={() => setEditOwner(true)}>
                    Change
                  </Button>
                )}
              </dd>
              <dt className="text-muted">Expires</dt>
              <dd className="grid gap-1.5">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="expiry"
                    checked={draft.expiry === 'never'}
                    onChange={() => set({ expiry: 'never' })}
                  />{' '}
                  Never Expires
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  <input
                    type="radio"
                    name="expiry"
                    checked={draft.expiry === 'at'}
                    onChange={() => set({ expiry: 'at' })}
                  />{' '}
                  Expires
                  <Input
                    type="datetime-local"
                    aria-label="Expiry date and time"
                    className="w-56"
                    min={minExpiry}
                    disabled={draft.expiry !== 'at'}
                    value={draft.expiresAt}
                    onChange={(e) => set({ expiresAt: e.target.value })}
                  />
                </label>
              </dd>
              {kind === 'folder' && (
                <>
                  <dt className="text-muted">Total Upload Quota (MB)</dt>
                  <dd className="grid gap-1.5">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="quota"
                        checked={draft.quota === 'unlimited'}
                        onChange={() => set({ quota: 'unlimited' })}
                      />{' '}
                      Unlimited
                    </label>
                    <label className="flex flex-wrap items-center gap-2">
                      <input
                        type="radio"
                        name="quota"
                        checked={draft.quota === 'limited'}
                        onChange={() => set({ quota: 'limited' })}
                      />
                      <Input
                        type="number"
                        min={1}
                        aria-label="Upload quota in MB"
                        className="w-28"
                        disabled={draft.quota !== 'limited'}
                        value={draft.quotaMb}
                        onChange={(e) => set({ quotaMb: e.target.value })}
                      />
                      <span className="text-xs text-muted">
                        {(share.upload_used_bytes / 1024 / 1024).toFixed(1)} MB used. Applies to
                        uploads by the people on this share.
                      </span>
                    </label>
                  </dd>
                </>
              )}
              <dt className="text-muted">Send Email Notifications</dt>
              <dd className="flex items-center gap-2">
                <Switch
                  checked={draft.notify}
                  onCheckedChange={(v) => set({ notify: v })}
                  aria-label="Send email notifications"
                />
                <span>{draft.notify ? 'On' : 'Off'}</span>
                <span className="text-xs text-muted">
                  Delivery depends on the server&apos;s email provider.
                </span>
              </dd>
              <dt className="text-muted">Who can use it</dt>
              <dd className="grid gap-1.5">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="restricted"
                    checked={draft.restricted}
                    onChange={() => set({ restricted: true })}
                  />{' '}
                  Allow selected users or groups
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="restricted"
                    checked={!draft.restricted}
                    onChange={() => set({ restricted: false })}
                  />
                  <span>
                    Anyone in the organization with the link
                    <span className="block text-xs text-muted">
                      Signed-in members who open the link are added to this share. People outside
                      the organization need a policy that allows public links.
                    </span>
                  </span>
                </label>
              </dd>
            </dl>

            <Tabs value={people} onValueChange={setPeople}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList className="border-0">
                  <TabsTrigger value="users">
                    <Users className="mr-1 inline size-3.5" aria-hidden /> Users ({users.length})
                  </TabsTrigger>
                  <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
                </TabsList>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setInvite({ email: false })}>
                    <UserPlus /> Invite Users
                  </Button>
                  <Button size="sm" onClick={() => setAddGroup(true)}>
                    Add Group
                  </Button>
                </span>
              </div>
              <TabsContent value="users">
                <Matrix
                  rows={users}
                  draft={draft}
                  label="Users and their permissions"
                  empty="No users yet. Invite people to give them access."
                  onToggle={toggle}
                  onRemove={(r) =>
                    removeRecipient.mutate(
                      { type: r.type, id: r.id },
                      {
                        onSuccess: () => toast.success('Removed'),
                        onError: (e) => toast.error(friendlyMessage(e)),
                      },
                    )
                  }
                />
              </TabsContent>
              <TabsContent value="groups">
                <Matrix
                  rows={groups}
                  draft={draft}
                  label="Groups and their permissions"
                  empty="No groups yet."
                  onToggle={toggle}
                  onRemove={(r) =>
                    removeRecipient.mutate(
                      { type: r.type, id: r.id },
                      {
                        onSuccess: () => toast.success('Removed'),
                        onError: (e) => toast.error(friendlyMessage(e)),
                      },
                    )
                  }
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab shareId={share.id} />
          </TabsContent>
        </Tabs>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="danger-ghost"
          className="mr-auto"
          onClick={() => setConfirmRemove(true)}
          disabled={share.status === 'revoked'}
        >
          <Trash2 /> Remove Share
        </Button>
        {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
        <Button variant="secondary" onClick={requestClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            if (!dirty || (await save())) onClose();
          }}
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />} OK
        </Button>
      </DialogFooter>

      <InviteUsersDialog
        shareId={share.id}
        open={!!invite}
        onOpenChange={(o) => !o && setInvite(null)}
        defaultEmail={invite?.email}
        existing={users.map((u) => u.id)}
      />
      <AddGroupDialog
        shareId={share.id}
        open={addGroup}
        onOpenChange={setAddGroup}
        existing={groups.map((g) => g.id)}
      />

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent
          title="Save changes?"
          description="You changed this share but have not saved."
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>
              Cancel
            </Button>
            <Button onClick={() => (setConfirmClose(false), onClose())}>Don&apos;t Save</Button>
            <Button
              variant="primary"
              onClick={async () => {
                setConfirmClose(false);
                if (await save()) onClose();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove this share?"
        description="The link stops working and everyone on this share loses the access it gave them, immediately. The item itself is not deleted."
        confirmLabel="Remove Share"
        destructive
        pending={removeShare.isPending}
        onConfirm={() =>
          removeShare.mutate(undefined, {
            onSuccess: () => (toast.success('Share removed'), setConfirmRemove(false), onClose()),
            onError: (e) => (
              toast.error(isApiError(e) ? e.message : friendlyMessage(e)),
              setConfirmRemove(false)
            ),
          })
        }
      />
    </>
  );
}
