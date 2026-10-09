'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useGroups, useCreateShare, useOrganization, type ResourceKind } from '@/features/sharing/hooks';
import {
  PRESETS,
  EXPIRY_PRESETS,
  buildShareRequest,
  isEmail,
  shareFormSchema,
  type PresetKey,
  type ShareFormValues,
} from '@/features/sharing/schemas';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { SHAREABLE_ACTIONS, actionLabel } from '@/lib/permissions';

export interface ShareDialogProps {
  kind: ResourceKind;
  id: string;
  name: string;
  /** The caller's own permissions on the item: only these can be granted onward. */
  permissions: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULTS: ShareFormValues = {
  emails: [],
  groupIds: [],
  preset: 'viewer_download',
  customActions: ['view', 'preview'],
  expiry: '30',
  customDate: '',
  message: '',
};

export function ShareDialog({ kind, id, name, permissions, open, onOpenChange }: ShareDialogProps) {
  const create = useCreateShare(kind, id);
  const org = useOrganization();
  const groups = useGroups();
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ShareFormValues>({ resolver: zodResolver(shareFormSchema), defaultValues: DEFAULTS });
  const v = form.watch();

  useEffect(() => {
    if (open) {
      form.reset(DEFAULTS);
      setDraft('');
      setDraftError(null);
      setServerError(null);
    }
  }, [open, form]);

  const settings = (org.data?.settings ?? {}) as { require_share_expiry?: boolean; max_share_days?: number };
  const requireExpiry = !!settings.require_share_expiry;
  const maxDays = typeof settings.max_share_days === 'number' ? settings.max_share_days : null;

  const grantable = useMemo(() => {
    const all: string[] = [...SHAREABLE_ACTIONS, ...(kind === 'folder' ? ['create_child'] : [])];
    return all.filter((a) => permissions.includes(a));
  }, [permissions, kind]);

  const presetAllowed = (k: PresetKey) =>
    k === 'custom' ? grantable.length > 0 : PRESETS[k].actions.every((a) => grantable.includes(a));

  const expiryOptions = EXPIRY_PRESETS.filter((o) => {
    if (o.value === 'none') return !requireExpiry && maxDays === null;
    if (/^\d+$/.test(o.value)) return maxDays === null || Number(o.value) <= maxDays;
    return true;
  });

  function commitDraft(): boolean {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    if (parts.length === 0) return true;
    const bad = parts.find((p) => !isEmail(p));
    if (bad) {
      setDraftError(`"${bad}" is not a valid email address`);
      return false;
    }
    const next = [...new Set([...v.emails, ...parts.map((p) => p.toLowerCase())])];
    form.setValue('emails', next, { shouldValidate: form.formState.isSubmitted });
    setDraft('');
    setDraftError(null);
    return true;
  }

  const submit = form.handleSubmit(
    (values) => {
      setServerError(null);
      create.mutate(buildShareRequest(values), {
        onSuccess: (s) => {
          toast.success(`Shared "${name}" with ${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}`);
          onOpenChange(false);
        },
        onError: (e) => {
          if (isApiError(e)) {
            if (e.code === 'unknown_recipient') {
              setServerError(
                `${e.message} Only active members of this organization can receive shares - sharing outside the organization is not enabled.`,
              );
              return;
            }
            if (e.status === 422) {
              const fe = Object.values(e.fieldErrors);
              setServerError(fe.length ? fe.join(' ') : friendlyMessage(e));
              return;
            }
            if (e.status === 403) {
              setServerError('You are not allowed to share this item with those permissions.');
              return;
            }
          }
          setServerError(friendlyMessage(e));
        },
      });
    },
    () => {
      if (draft.trim()) commitDraft();
    },
  );

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Share "${name}"`} description="Choose who gets access and what they can do." className="max-w-xl">
        <form
          noValidate
          onSubmit={(e) => {
            if (draft.trim() && !commitDraft()) {
              e.preventDefault();
              return;
            }
            void submit(e);
          }}
        >
          <DialogBody className="grid gap-4">
            <div className="flex gap-2 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Recipients get access to this {kind} only. They do <strong>not</strong> get access to its folder or to
                anything next to it.
              </p>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="share-email">People (work email addresses)</Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-line-strong p-1.5" >
                {v.emails.map((em) => (
                  <span key={em} className="inline-flex items-center gap-1 rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-fg">
                    {em}
                    <button
                      type="button"
                      aria-label={`Remove ${em}`}
                      className="rounded-sm hover:bg-accent/20"
                      onClick={() => form.setValue('emails', v.emails.filter((x) => x !== em))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="share-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={draft}
                  aria-invalid={!!draftError || !!errors.emails}
                  aria-describedby="share-email-msg"
                  placeholder={v.emails.length ? 'Add another' : 'name@company.com'}
                  className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-faint"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDraftError(null);
                  }}
                  onKeyDown={(e) => {
                    if (['Enter', ',', ';', ' '].includes(e.key) && draft.trim()) {
                      e.preventDefault();
                      commitDraft();
                    } else if (e.key === 'Backspace' && !draft && v.emails.length) {
                      form.setValue('emails', v.emails.slice(0, -1));
                    }
                  }}
                  onBlur={() => draft.trim() && commitDraft()}
                />
              </div>
              <p id="share-email-msg" role={draftError || errors.emails ? 'alert' : undefined} className={draftError || errors.emails ? 'text-xs text-danger' : 'text-xs text-muted'}>
                {draftError ?? errors.emails?.message ?? 'Press Enter after each address. Only members of this organization can be added.'}
              </p>
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="text-[13px] font-medium">Groups</legend>
              {groups.isPending ? (
                <p className="text-xs text-muted">Loading groups…</p>
              ) : groups.isError ? (
                <p className="text-xs text-muted">Groups could not be loaded. You can still share by email.</p>
              ) : groups.data.items.length === 0 ? (
                <p className="text-xs text-muted">No groups exist in this organization.</p>
              ) : (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {groups.data.items.map((g) => {
                    const cid = `grp-${g.id}`;
                    const checked = v.groupIds.includes(g.id);
                    return (
                      <li key={g.id} className="flex items-center gap-2">
                        <Checkbox
                          id={cid}
                          checked={checked}
                          onCheckedChange={(c) =>
                            form.setValue('groupIds', c ? [...v.groupIds, g.id] : v.groupIds.filter((x) => x !== g.id))
                          }
                        />
                        <Label htmlFor={cid} className="font-normal">
                          {g.name} <span className="text-xs text-muted">({g.member_count})</span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <fieldset className="grid gap-1.5">
              <legend className="text-[13px] font-medium">Permissions</legend>
              <div role="radiogroup" className="grid gap-1.5">
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
                  const ok = presetAllowed(k);
                  const rid = `preset-${k}`;
                  return (
                    <label
                      key={k}
                      htmlFor={rid}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${v.preset === k ? 'border-accent bg-accent-soft/50' : 'border-line'} ${ok ? '' : 'cursor-not-allowed opacity-50'}`}
                    >
                      <input
                        id={rid}
                        type="radio"
                        name="preset"
                        className="mt-1 accent-[var(--accent)]"
                        checked={v.preset === k}
                        disabled={!ok}
                        onChange={() => form.setValue('preset', k)}
                      />
                      <span>
                        <span className="block text-[13px] font-medium">{PRESETS[k].label}</span>
                        <span className="block text-xs text-muted">
                          {ok ? PRESETS[k].hint : 'You do not hold all of these permissions yourself'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {v.preset === 'custom' && (
                <div className="mt-1 grid gap-1 rounded-md border border-line p-3 sm:grid-cols-2">
                  {grantable.map((a) => (
                    <div key={a} className="flex items-center gap-2">
                      <Checkbox
                        id={`act-${a}`}
                        checked={v.customActions.includes(a)}
                        onCheckedChange={(c) =>
                          form.setValue(
                            'customActions',
                            c ? [...v.customActions, a] : v.customActions.filter((x) => x !== a),
                          )
                        }
                      />
                      <Label htmlFor={`act-${a}`} className="font-normal">
                        {actionLabel(a)}
                      </Label>
                    </div>
                  ))}
                  {errors.customActions && (
                    <p role="alert" className="text-xs text-danger sm:col-span-2">
                      {errors.customActions.message}
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="share-expiry">Access expires</Label>
                <Select id="share-expiry" {...form.register('expiry')}>
                  {expiryOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {(requireExpiry || maxDays !== null) && (
                  <p className="text-xs text-muted">
                    {requireExpiry && 'Your organization requires an expiry. '}
                    {maxDays !== null && `Maximum ${maxDays} days.`}
                  </p>
                )}
              </div>
              {v.expiry === 'custom' && (
                <div className="grid gap-1">
                  <Label htmlFor="share-date">Expiry date</Label>
                  <Input
                    id="share-date"
                    type="date"
                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                    max={maxDays !== null ? new Date(Date.now() + maxDays * 86400000).toISOString().slice(0, 10) : undefined}
                    aria-invalid={!!errors.customDate}
                    {...form.register('customDate')}
                  />
                  {errors.customDate && (
                    <p role="alert" className="text-xs text-danger">
                      {errors.customDate.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-1">
              <Label htmlFor="share-message">Message (optional)</Label>
              <Textarea id="share-message" rows={2} {...form.register('message')} />
              {errors.message && (
                <p role="alert" className="text-xs text-danger">
                  {errors.message.message}
                </p>
              )}
            </div>

            {serverError && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {serverError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Share
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
