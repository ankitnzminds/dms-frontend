'use client';

import { ArrowLeft, CheckCircle2, Save, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/states';
import { useAdminUsers } from '@/features/admin-users/api';
import { useAdminGroups } from '@/features/admin/hooks';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import {
  useCreatePolicy,
  useGrammar,
  usePolicy,
  usePolicyLifecycle,
  usePublishPolicy,
  useSetPolicyMode,
  useTemplates,
  useUpdatePolicy,
  useValidatePolicy,
  type ValidationReport,
} from './api';
import { ActionPicker, ConditionRows, MultiPick, SELECT, Section } from './policy-form-parts';
import {
  emptyForm,
  fromDocument,
  label,
  toDocument,
  type Effect,
  type PolicyForm,
} from './policy-model';
import { enforcement } from './policy-list-view';
import { HistoryPanel, SimulatePanel, ValidationPanel } from './policy-side-panels';

const EFFECTS: { value: Effect; title: string; text: string }[] = [
  {
    value: 'DENY',
    title: 'Deny',
    text: 'Remove these actions from the matching people. Enforced by the server.',
  },
  {
    value: 'REQUIRE_APPROVAL',
    title: 'Require approval',
    text: 'Cannot be enforced yet (nothing can hold an operation until approved). Observe-only.',
  },
  {
    value: 'ALLOW',
    title: 'Allow (explain only)',
    text: 'Never grants access and never lifts a deny; recorded for explanation and simulation only.',
  },
];

function errorLines(e: unknown): string[] {
  if (isApiError(e) && Array.isArray(e.details)) {
    return (e.details as Array<{ path?: string; message?: string }>)
      .filter((d) => d && d.message)
      .map((d) => `${d.path ?? ''} ${d.message}`.trim());
  }
  return [friendlyMessage(e)];
}

/** Loads the policy / template, then mounts the editor keyed on the saved revision so its state is reset from the server. */
export function PolicyEditorView() {
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const id = params?.id && params.id !== 'new' ? params.id : undefined;
  const policy = usePolicy(id);
  const templates = useTemplates();
  const templateKey = search?.get('template') ?? '';
  const tpl = templates.data?.find((t) => t.key === templateKey);

  if (id && policy.isError)
    return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />;
  if ((id && !policy.data) || (!id && templateKey && !tpl && !templates.isError)) {
    return <Skeleton className="h-64 w-full" />;
  }
  const initial = policy.data
    ? fromDocument(
        policy.data.name,
        policy.data.description ?? '',
        policy.data.revisions[policy.data.revisions.length - 1]!.document as Record<
          string,
          unknown
        >,
      )
    : tpl
      ? fromDocument(tpl.name, tpl.purpose, tpl.document as Record<string, unknown>)
      : emptyForm();
  const key = policy.data
    ? `p:${policy.data.id}:${policy.data.latest_revision}:${policy.data.updated_at}`
    : `t:${templateKey}`;
  return (
    <PolicyEditor
      key={key}
      id={id}
      initial={initial}
      templateKey={tpl?.key}
      category={tpl?.category}
    />
  );
}

function PolicyEditor({
  id,
  initial,
  templateKey,
  category,
}: {
  id: string | undefined;
  initial: PolicyForm;
  templateKey?: string;
  category?: string;
}) {
  const router = useRouter();
  const policy = usePolicy(id);
  const grammar = useGrammar();
  const me = useMe();
  const isOwner = me.data?.role === 'owner';

  const create = useCreatePolicy();
  const update = useUpdatePolicy();
  const validate = useValidatePolicy();
  const publish = usePublishPolicy();
  const setMode = useSetPolicyMode();
  const lifecycle = usePolicyLifecycle();

  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 100,
    offset: 0,
  });
  const groups = useAdminGroups();

  const [form, setForm] = useState<PolicyForm>(initial);
  const [dirty, setDirty] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [pickFolder, setPickFolder] = useState(false);
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [mode, setPubMode] = useState<'enforce' | 'observe'>('observe');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<'disable' | 'archive' | null>(null);

  const patch = (p: Partial<PolicyForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
    setReport(null);
  };

  const archived = policy.data?.status === 'archived';
  const lockedMandatory = !!policy.data?.mandatory && !isOwner;
  const readOnly = archived || lockedMandatory;
  const documentTypeSelected = form.resourceTypes.length > 0;

  const userOpts = useMemo(
    () =>
      (users.data?.items ?? []).map((u) => ({
        value: u.user_id,
        label: u.display_name ?? u.email,
      })),
    [users.data],
  );
  const groupOpts = useMemo(
    () => (groups.data?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
    [groups.data],
  );

  const save = () => {
    setSaveErrors([]);
    const document = toDocument(form);
    const onError = (e: unknown) => setSaveErrors(errorLines(e));
    if (!id) {
      create.mutate(
        {
          name: form.name.trim(),
          description: form.description || null,
          category: category ?? 'custom',
          document,
          change_reason: form.changeReason || null,
          template_key: templateKey ?? null,
        },
        {
          onSuccess: (p) => {
            toast.success('Draft saved');
            router.replace(`/admin/policies/${p.id}`);
          },
          onError,
        },
      );
    } else {
      update.mutate(
        {
          id,
          body: {
            name: form.name.trim(),
            description: form.description || null,
            document,
            change_reason: form.changeReason || null,
          },
        },
        {
          onSuccess: () => {
            toast.success('Draft saved');
            setDirty(false);
          },
          onError,
        },
      );
    }
  };

  const runValidate = () =>
    id &&
    validate.mutate(id, {
      onSuccess: setReport,
      onError: (e) => toast.error(friendlyMessage(e)),
    });

  if (id && policy.isPending) return <Skeleton className="h-64 w-full" />;
  if (id && policy.isError)
    return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />;
  if (grammar.isError)
    return <ErrorState error={grammar.error} onRetry={() => grammar.refetch()} />;
  if (!grammar.data) return <Skeleton className="h-64 w-full" />;
  const g = grammar.data;
  const p = policy.data;
  const canPublish = !!p && !dirty && p.latest_revision_status === 'validated' && !archived;
  const approvalOnly = form.effect === 'REQUIRE_APPROVAL';
  const e = p ? enforcement(p) : null;

  return (
    <>
      <PageHeader
        title={p ? p.name : 'New policy'}
        description={
          readOnly
            ? archived
              ? 'This policy is archived and read-only.'
              : 'Only an organization owner can change a mandatory policy.'
            : 'Build the rule, save it as a draft, validate it, test it with the simulator, then publish.'
        }
        trail={
          <Link
            href="/admin/policies"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
          >
            <ArrowLeft className="size-3" /> All policies
          </Link>
        }
        actions={
          <>
            {p && e && <Badge tone={e.tone}>{e.text}</Badge>}
            {p?.mandatory && <Badge tone="danger">Mandatory</Badge>}
            {!readOnly && (
              <Button
                size="sm"
                onClick={save}
                disabled={!form.name.trim() || create.isPending || update.isPending}
              >
                <Save /> Save draft
              </Button>
            )}
          </>
        }
      />

      {saveErrors.length > 0 && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger bg-danger-soft p-3 text-[13px] text-danger"
        >
          <p className="font-medium">This policy could not be saved:</p>
          <ul className="mt-1 list-disc pl-5">
            {saveErrors.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {p &&
        (p.latest_revision_status === 'published' || p.latest_revision_status === 'superseded') &&
        !readOnly && (
          <p className="mb-3 rounded-md border border-line bg-surface-2 p-2.5 text-xs text-muted">
            v{p.published_revision} is live and immutable. Saving opens a new draft (v
            {p.latest_revision + 1}); the live version keeps enforcing until the draft is validated
            and published.
          </p>
        )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <fieldset disabled={readOnly} className="min-w-0 space-y-3 disabled:opacity-80">
          <Section title="Basics">
            <Input
              aria-label="Policy name"
              placeholder="Policy name"
              value={form.name}
              onChange={(ev) => patch({ name: ev.target.value })}
            />
            <Input
              aria-label="Description"
              placeholder="What is this for? (optional)"
              value={form.description}
              onChange={(ev) => patch({ description: ev.target.value })}
            />
            <Input
              aria-label="Reason for this change"
              placeholder="Reason for this change (kept in the history)"
              value={form.changeReason}
              onChange={(ev) => patch({ changeReason: ev.target.value })}
            />
          </Section>

          <Section title="Effect" hint="What happens when the rule matches.">
            <div className="grid gap-2 sm:grid-cols-3">
              {EFFECTS.map((x) => (
                <label
                  key={x.value}
                  className={`cursor-pointer rounded-md border p-2.5 text-[13px] ${form.effect === x.value ? 'border-accent bg-accent-soft' : 'border-line'}`}
                >
                  <input
                    type="radio"
                    name="effect"
                    className="mr-1.5"
                    checked={form.effect === x.value}
                    onChange={() => patch({ effect: x.value })}
                  />
                  <strong>{x.title}</strong>
                  <span className="mt-1 block text-xs text-muted">{x.text}</span>
                </label>
              ))}
            </div>
            {isOwner ? (
              <label className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.mandatory}
                  disabled={form.effect === 'ALLOW'}
                  onChange={(ev) => patch({ mandatory: ev.target.checked })}
                />
                <span>
                  <strong>Mandatory security policy</strong>
                  <span className="block text-xs text-muted">
                    Also binds administrators and can only be changed by an owner.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted">
                Mandatory policies (which also bind administrators) can only be created by an owner.
              </p>
            )}
          </Section>

          <Section
            title="Applies to"
            hint="Leave everything empty to apply to every user. Choices are combined: any match applies."
          >
            <MultiPick
              ariaLabel="Users"
              empty="Add a user…"
              options={userOpts}
              value={form.users}
              onChange={(v) => patch({ users: v })}
            />
            <MultiPick
              ariaLabel="Groups"
              empty="Add a group…"
              options={groupOpts}
              value={form.groups}
              onChange={(v) => patch({ groups: v })}
            />
            <MultiPick
              ariaLabel="Roles"
              empty="Add a role…"
              options={g.roles.map((r) => ({ value: r, label: label(r) }))}
              value={form.roles}
              onChange={(v) => patch({ roles: v })}
            />
            <MultiPick
              ariaLabel="Account types"
              empty="Add an account type (full, guest, external)…"
              options={g.access_levels.map((r) => ({ value: r, label: label(r) }))}
              value={form.accessLevels}
              onChange={(v) => patch({ accessLevels: v })}
            />
            <p className="text-xs text-muted">
              Group membership is read from the server on every request, so removing someone from a
              group ends the rule for them immediately. Nested groups are not supported.
            </p>
          </Section>

          <Section title="Items and actions">
            <div className="flex flex-wrap gap-4">
              {g.resource_types.map((t) => (
                <label key={t} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={form.resourceTypes.includes(t)}
                    onChange={(ev) =>
                      patch({
                        resourceTypes: ev.target.checked
                          ? [...form.resourceTypes, t]
                          : form.resourceTypes.filter((x) => x !== t),
                      })
                    }
                  />
                  {t === 'document' ? 'Files' : 'Folders'}
                </label>
              ))}
            </div>
            <ActionPicker
              grammar={g}
              value={form.actions}
              onChange={(v) => patch({ actions: v })}
              disabled={readOnly}
            />
          </Section>

          <Section
            title="Conditions"
            hint="Optional. Without conditions the rule applies to every matching item."
          >
            {form.advancedCondition ? (
              <div className="text-xs">
                <p className="mb-1 text-warn">
                  This policy uses a nested condition the builder cannot draw. It is kept unchanged.
                </p>
                <pre className="overflow-x-auto rounded-md bg-surface-2 p-2">
                  {JSON.stringify(form.advancedCondition, null, 2)}
                </pre>
              </div>
            ) : (
              <>
                {form.conditions.length > 1 && (
                  <select
                    aria-label="Combine conditions"
                    className={`${SELECT} max-w-xs`}
                    value={form.combine}
                    onChange={(ev) => patch({ combine: ev.target.value as 'AND' | 'OR' })}
                  >
                    <option value="AND">All conditions must match (AND)</option>
                    <option value="OR">Any condition may match (OR)</option>
                  </select>
                )}
                <ConditionRows
                  grammar={g}
                  rows={form.conditions}
                  resourceTypes={form.resourceTypes}
                  onChange={(rows) => patch({ conditions: rows })}
                  disabled={readOnly || !documentTypeSelected}
                />
              </>
            )}
          </Section>

          <Section title="Scope" hint="Where the rule applies.">
            <div className="grid gap-2 sm:grid-cols-3">
              <label
                className={`cursor-pointer rounded-md border p-2.5 text-[13px] ${form.scopeType === 'organization' ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <input
                  type="radio"
                  name="scope"
                  className="mr-1.5"
                  checked={form.scopeType === 'organization'}
                  onChange={() => patch({ scopeType: 'organization', scopeId: '', scopeName: '' })}
                />
                Whole organization
              </label>
              <label
                className={`cursor-pointer rounded-md border p-2.5 text-[13px] ${form.scopeType === 'folder' ? 'border-accent bg-accent-soft' : 'border-line'}`}
              >
                <input
                  type="radio"
                  name="scope"
                  className="mr-1.5"
                  checked={form.scopeType === 'folder'}
                  onChange={() => patch({ scopeType: 'folder' })}
                />
                One folder and everything in it
              </label>
              <label
                className="cursor-not-allowed rounded-md border border-line p-2.5 text-[13px] opacity-60"
                title="A single-file scope can be set through the API; the builder has no file picker yet."
              >
                <input
                  type="radio"
                  name="scope"
                  disabled
                  className="mr-1.5"
                  checked={form.scopeType === 'file'}
                  readOnly
                />
                One file
                <span className="block text-xs text-muted">
                  {form.scopeType === 'file' ? 'Set on this policy' : 'No file picker yet'}
                </span>
              </label>
            </div>
            {form.scopeType === 'folder' && (
              <div className="flex items-center gap-2 text-[13px]">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPickFolder(true)}
                >
                  Choose folder
                </Button>
                <span className="text-muted">
                  {form.scopeName ||
                    (form.scopeId ? `Folder ${form.scopeId.slice(0, 8)}…` : 'None chosen')}
                </span>
              </div>
            )}
          </Section>
        </fieldset>

        <aside className="min-w-0 space-y-3">
          <section className="rounded-lg border border-line bg-surface p-3">
            <Tabs defaultValue="check">
              <TabsList>
                <TabsTrigger value="check">Check &amp; publish</TabsTrigger>
                <TabsTrigger value="sim">Simulate</TabsTrigger>
                {p && <TabsTrigger value="history">History</TabsTrigger>}
              </TabsList>
              <TabsContent value="check" className="space-y-3 pt-3">
                {!p ? (
                  <p className="text-xs text-muted">Save the draft first, then validate it here.</p>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={dirty || archived || validate.isPending || readOnly}
                      onClick={runValidate}
                    >
                      <CheckCircle2 /> Validate
                    </Button>
                    {dirty && (
                      <p className="text-xs text-warn">
                        You have unsaved changes: save before validating.
                      </p>
                    )}
                    <ValidationPanel report={report} />
                    <Button
                      size="sm"
                      disabled={!canPublish || readOnly}
                      onClick={() => {
                        setPubMode(approvalOnly ? 'observe' : 'observe');
                        setPublishing(true);
                      }}
                    >
                      <Send /> Publish…
                    </Button>
                    {p.status !== 'draft' && p.status !== 'archived' && (
                      <div className="space-y-2 border-t border-line pt-3 text-[13px]">
                        {p.status === 'published' && (
                          <>
                            <label className="block text-xs text-muted" htmlFor="mode">
                              Enforcement mode
                            </label>
                            <select
                              id="mode"
                              className={SELECT}
                              value={p.mode}
                              disabled={readOnly}
                              onChange={(ev) =>
                                setMode.mutate(
                                  { id: p.id, mode: ev.target.value as 'enforce' | 'observe' },
                                  {
                                    onError: (er) => toast.error(friendlyMessage(er)),
                                    onSuccess: () => toast.success('Mode updated'),
                                  },
                                )
                              }
                            >
                              <option value="observe">Observe only — log, never block</option>
                              <option value="enforce">Enforce — block matching actions</option>
                            </select>
                            <Button
                              size="sm"
                              variant="danger-ghost"
                              disabled={readOnly}
                              onClick={() => setConfirm('disable')}
                            >
                              Disable policy
                            </Button>
                          </>
                        )}
                        {p.status === 'disabled' && (
                          <>
                            <Button
                              size="sm"
                              disabled={readOnly}
                              onClick={() =>
                                lifecycle.mutate(
                                  { id: p.id, op: 'enable' },
                                  { onError: (er) => toast.error(friendlyMessage(er)) },
                                )
                              }
                            >
                              Re-enable
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-ghost"
                              disabled={readOnly}
                              onClick={() => setConfirm('archive')}
                            >
                              Archive
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {p.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="danger-ghost"
                        disabled={readOnly}
                        onClick={() => setConfirm('archive')}
                      >
                        Archive draft
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>
              <TabsContent value="sim" className="pt-3">
                <SimulatePanel grammar={g} policyId={p?.id} defaultActions={form.actions} />
              </TabsContent>
              {p && (
                <TabsContent value="history" className="pt-3">
                  <HistoryPanel policy={p} />
                </TabsContent>
              )}
            </Tabs>
          </section>
        </aside>
      </div>

      <Dialog open={pickFolder} onOpenChange={setPickFolder}>
        <DialogContent
          title="Choose the folder this policy covers"
          description="It applies to this folder and everything below it."
        >
          <DialogBody className="max-h-[50vh]">
            <FolderPicker onChange={setPicked} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickFolder(false)}>
              Cancel
            </Button>
            <Button
              disabled={!picked}
              onClick={() => {
                if (picked)
                  patch({ scopeType: 'folder', scopeId: picked.id, scopeName: picked.name });
                setPickFolder(false);
              }}
            >
              Use this folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishing} onOpenChange={setPublishing}>
        <DialogContent
          title="Publish this policy"
          description="Published revisions are immutable and audited."
        >
          <DialogBody className="space-y-3 text-[13px]">
            <p>
              {report?.affected_members != null
                ? `About ${report.affected_members} active member(s) match the subjects.`
                : 'Impact unknown: validate first.'}
            </p>
            <label className="block text-xs text-muted" htmlFor="pubmode">
              How should it apply?
            </label>
            <select
              id="pubmode"
              className={SELECT}
              value={mode}
              onChange={(ev) => setPubMode(ev.target.value as 'enforce' | 'observe')}
            >
              <option value="observe">
                Observe only (recommended first) — record what would be blocked
              </option>
              <option value="enforce" disabled={form.effect === 'REQUIRE_APPROVAL'}>
                Enforce — block matching actions now
                {form.effect === 'REQUIRE_APPROVAL' ? ' (not available for approval policies)' : ''}
              </option>
            </select>
            {mode === 'enforce' && (
              <p className="rounded-md border border-warn bg-warn-soft p-2 text-xs text-warn">
                Enforcing takes effect on the very next request for everyone it matches. Simulate
                first and consider observing for a while.
              </p>
            )}
            <Input
              aria-label="Publication note"
              placeholder="Note for the history (optional)"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishing(false)}>
              Cancel
            </Button>
            <Button
              disabled={publish.isPending}
              onClick={() =>
                p &&
                publish.mutate(
                  { id: p.id, body: { mode, change_reason: reason || null } },
                  {
                    onSuccess: () => {
                      toast.success(
                        mode === 'enforce'
                          ? 'Published and enforcing'
                          : 'Published in observe mode',
                      );
                      setPublishing(false);
                      setReason('');
                    },
                    onError: (er) => toast.error(errorLines(er).join(' ')),
                  },
                )
              }
            >
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'disable' ? 'Disable this policy?' : 'Archive this policy?'}
        description={
          confirm === 'disable'
            ? 'It stops being enforced on the next request. You can re-enable it later.'
            : 'Archived policies cannot be edited or published again.'
        }
        confirmLabel={confirm === 'disable' ? 'Disable' : 'Archive'}
        destructive
        pending={lifecycle.isPending}
        onConfirm={() => {
          if (!p || !confirm) return;
          lifecycle.mutate(
            { id: p.id, op: confirm },
            {
              onSuccess: () => setConfirm(null),
              onError: (er) => {
                toast.error(friendlyMessage(er));
                setConfirm(null);
              },
            },
          );
        }}
      />
    </>
  );
}
