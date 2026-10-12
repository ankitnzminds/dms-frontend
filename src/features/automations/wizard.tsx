'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import {
  useCatalogue,
  useCreateAutomation,
  useUpdateAutomation,
  validateDefinition,
  type Automation,
  type CatalogueEntry,
  type Report,
} from './api';
import {
  cleanParams,
  fieldErrors,
  generalErrors,
  initialParams,
  wizardAction,
  wizardGraph,
} from './definition';
import { ChoiceList } from './choice-list';
import { ParamsForm, type JsonSchema, type Params } from './params-form';

const STEPS = ['Condition', 'Condition details', 'Action', 'Action details', 'Name'] as const;

interface State {
  condKey: string;
  condParams: Params;
  actionKey: string;
  actionParams: Params;
  name: string;
  description: string;
  activate: boolean;
  confirmRisk: boolean;
}

/** The file or folder a workflow is being created for (from the right-click menu). */
export interface WorkflowTarget {
  name: string;
  kind: 'folder' | 'document';
  /** Path as workflows see it ("/Finance" or "/Finance/report.pdf"); null when it cannot be known. */
  path: string | null;
}

function startState(existing: Automation | null, target?: WorkflowTarget): State {
  const act = existing ? wizardAction(existing.graph) : null;
  return {
    condKey: existing?.trigger.key ?? '',
    condParams: (existing?.trigger.params as Params) ?? {},
    actionKey: act?.key ?? '',
    actionParams: act?.params ?? {},
    name: existing?.name ?? (target ? `Workflow for ${target.name}` : ''),
    description: existing?.description ?? '',
    activate: false,
    confirmRisk: false,
  };
}

const KIND_LABEL: Record<string, string> = {
  event: 'When something happens',
  timer: 'On a schedule',
  scan: 'Daily checks',
};

/**
 * "Create New Workflow": condition -> parameters -> action -> parameters -> name. Every Next is checked by the
 * server (the same validation that gates publishing), and Previous/Next keep what was typed.
 */
export function WorkflowWizard({
  open,
  onOpenChange,
  existing,
  target,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Automation | null;
  target?: WorkflowTarget;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const requestClose = () => (dirty ? setConfirmCancel(true) : onOpenChange(false));
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
        <DialogContent
          className="max-w-xl"
          title={existing ? 'Edit workflow' : 'Create New Workflow'}
          description="IF this happens THEN do that."
          onInteractOutside={(e) => e.preventDefault()}
        >
          {open && (
            <Body
              key={existing?.id ?? 'new'}
              existing={existing}
              target={target}
              onClose={() => onOpenChange(false)}
              onCancel={requestClose}
              onDirtyChange={setDirty}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Discard this workflow?"
        description="What you entered will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmCancel(false);
          setDirty(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

function Body({
  existing,
  target,
  onClose,
  onCancel,
  onDirtyChange,
}: {
  existing: Automation | null;
  target?: WorkflowTarget;
  onClose: () => void;
  onCancel: () => void;
  onDirtyChange: (d: boolean) => void;
}) {
  const cat = useCatalogue();
  const me = useMe();
  const create = useCreateAutomation();
  const update = useUpdateAutomation();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<State>(() => startState(existing, target));
  const [report, setReport] = useState<Report | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => JSON.stringify(startState(existing, target)), [existing, target]);
  const dirty = JSON.stringify(s) !== initial;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const cond = useMemo(
    () => cat.data?.conditions.find((c) => c.key === s.condKey),
    [cat.data, s.condKey],
  );
  const act = useMemo(
    () => cat.data?.actions.find((a) => a.key === s.actionKey),
    [cat.data, s.actionKey],
  );
  const isOwner = me.data?.role === 'owner';

  if (cat.isPending) return <Skeleton className="m-5 h-48" />;
  if (cat.isError || !cat.data)
    return <ErrorState error={cat.error} onRetry={() => void cat.refetch()} />;

  const set = (patch: Partial<State>) => (
    setReport(null),
    setError(null),
    setS((x) => ({ ...x, ...patch }))
  );

  function pickCondition(key: string) {
    const c = cat.data!.conditions.find((x) => x.key === key);
    const params = c ? initialParams(c.schema as JsonSchema) : {};
    // Preselect the chosen file or folder as the workflow's scope when the condition has one.
    if (target?.path && (c?.schema as JsonSchema | undefined)?.properties?.path) {
      params.path = target.path;
    }
    set({
      condKey: key,
      condParams: params,
      actionKey: '',
      actionParams: {},
    });
  }
  function pickAction(key: string) {
    const a = cat.data!.actions.find((x) => x.key === key);
    set({
      actionKey: key,
      actionParams: a ? initialParams(a.schema as JsonSchema) : {},
      confirmRisk: false,
    });
  }

  const body = (activate: boolean) => ({
    name: s.name.trim() || 'Untitled workflow',
    description: s.description.trim() || null,
    editor_mode: 'wizard' as const,
    trigger: { key: s.condKey, params: cleanParams(s.condParams) },
    graph: wizardGraph(
      s.actionKey || 'notify_users',
      s.actionKey ? s.actionParams : { include_actor: true, title: 'x' },
    ),
    activate,
    confirm_high_risk: s.confirmRisk,
    allow_invalid: false,
  });

  async function check(scope: 'trigger' | 'all'): Promise<boolean> {
    setChecking(true);
    try {
      const r = await validateDefinition(body(false));
      setReport(r);
      const relevant = r.issues.filter((i) => scope === 'all' || i.where === 'trigger');
      return relevant.length === 0;
    } catch (e) {
      setError(friendlyMessage(e));
      return false;
    } finally {
      setChecking(false);
    }
  }

  async function next() {
    setError(null);
    if (step === 0 && !s.condKey) return setError('Select a condition to continue.');
    if (step === 1 && !(await check('trigger'))) return;
    if (step === 2 && !s.actionKey) return setError('Select an action to continue.');
    if (step === 3 && !(await check('all'))) return;
    setStep(step + 1);
  }

  async function finish() {
    setError(null);
    if (!s.name.trim()) return setError('Give the workflow a name.');
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          body: {
            name: s.name.trim(),
            description: s.description.trim() || null,
            trigger: { key: s.condKey, params: cleanParams(s.condParams) },
            graph: wizardGraph(s.actionKey, s.actionParams),
            expected_row_version: existing.row_version,
            allow_invalid: false,
          },
        });
        toast.success('Workflow saved as a draft. Publish it to apply the changes.');
      } else {
        await create.mutateAsync(body(s.activate));
        toast.success(s.activate ? 'Workflow created and enabled' : 'Workflow created as a draft');
      }
      onClose();
    } catch (e) {
      if (isApiError(e) && e.code === 'name_conflict')
        setError('A workflow with this name already exists.');
      else if (isApiError(e) && e.code === 'invalid_workflow') {
        const first = (e.details as { issues?: { message: string }[] } | null)?.issues?.[0];
        setError(first?.message ?? e.message);
      } else setError(friendlyMessage(e));
    }
  }

  const triggerErrors = fieldErrors(report, 'trigger');
  const nodeErrors = fieldErrors(report, 'a1');
  const general = [...generalErrors(report, 'trigger'), ...generalErrors(report, 'a1')];
  const pending = create.isPending || update.isPending;
  const high = act?.risk === 'high';

  return (
    <>
      <DialogBody className="grid gap-4">
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={
                i === step ? 'font-semibold text-text' : i < step ? 'text-muted' : 'text-faint'
              }
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <>
            {target && (
              <p
                className="rounded-md bg-surface-2 px-3 py-2 text-xs"
                data-testid="workflow-target"
              >
                Creating a workflow for {target.kind === 'folder' ? 'folder' : 'file'}{' '}
                <strong>{target.name}</strong>
                {target.path ? ` (${target.path})` : ''}. Its location is filled in as the scope for
                conditions that have one.
              </p>
            )}
            <p className="text-[13px] font-medium">IF this happens…</p>
            <ChoiceList
              label="IF condition"
              placeholder="Search conditions"
              value={s.condKey}
              onChange={pickCondition}
              choices={cat.data.conditions.map((c) => ({
                key: c.key,
                label: c.label,
                description: c.description,
                group: KIND_LABEL[c.kind ?? ''] ?? 'Other',
                disabledReason: c.supported ? null : (c.unsupported_reason ?? 'Not supported'),
              }))}
            />
            {cond && <EntryNotes entry={cond} />}
          </>
        )}

        {step === 1 && cond && (
          <>
            <p className="text-[13px] font-medium">{cond.label}</p>
            <p className="text-xs text-muted">{cond.description}</p>
            <ParamsForm
              schema={cond.schema as JsonSchema}
              value={s.condParams}
              onChange={(v) => set({ condParams: v })}
              errors={triggerErrors}
              variables={cond.variables}
            />
            <Problems list={general} />
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-[13px] font-medium">THEN do this…</p>
            <ChoiceList
              label="THEN action"
              placeholder="Search actions"
              value={s.actionKey}
              onChange={pickAction}
              choices={cat.data.actions
                .filter((a) => a.wizard)
                .map((a) => ({
                  key: a.key,
                  label: a.label,
                  description: a.description,
                  disabledReason:
                    a.needs_resource === 'file' && cond?.provides !== 'file'
                      ? 'Needs a file: pick a condition that is about a file.'
                      : a.supported
                        ? null
                        : (a.unsupported_reason ?? 'Not supported'),
                }))}
            />
            {act && <EntryNotes entry={act} />}
          </>
        )}

        {step === 3 && act && (
          <>
            <p className="flex items-center gap-2 text-[13px] font-medium">
              {act.label} {high && <Badge tone="warn">High risk</Badge>}
            </p>
            <p className="text-xs text-muted">{act.description}</p>
            <ParamsForm
              schema={act.schema as JsonSchema}
              value={s.actionParams}
              onChange={(v) => set({ actionParams: v })}
              errors={nodeErrors}
              variables={cond?.variables}
            />
            <Problems list={general} />
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-[13px]">Name for this action</p>
            <Field id="wz-name" label="Workflow Name">
              {(p) => (
                <Input
                  {...p}
                  value={s.name}
                  maxLength={200}
                  onChange={(e) => set({ name: e.target.value })}
                />
              )}
            </Field>
            <dl className="grid gap-1 rounded-md bg-surface-2 px-3 py-2 text-xs">
              <div className="flex gap-2">
                <dt className="w-12 font-medium">IF</dt>
                <dd>{cond?.label}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-12 font-medium">THEN</dt>
                <dd>{act?.label}</dd>
              </div>
            </dl>
            {!existing && (
              <>
                <label className="flex items-start gap-2 text-[13px]">
                  <Checkbox
                    checked={s.activate}
                    onCheckedChange={(c) => set({ activate: c === true })}
                    aria-label="Publish and enable now"
                  />
                  <span>
                    Publish and enable now
                    <span className="block text-xs text-muted">
                      Off by default: the workflow is saved as a draft and does nothing until you
                      publish and enable it.
                    </span>
                  </span>
                </label>
                {s.activate && high && (
                  <label className="flex items-start gap-2 text-[13px]">
                    <Checkbox
                      checked={s.confirmRisk}
                      onCheckedChange={(c) => set({ confirmRisk: c === true })}
                      aria-label="Confirm high-risk step"
                    />
                    <span>
                      I confirm this workflow contains a high-risk step
                      <span className="block text-xs text-muted">
                        {isOwner
                          ? 'Owners can publish these.'
                          : 'Only an organization owner can publish a workflow with delete, ACL or email steps.'}
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <span className="flex-1" />
        <Button
          onClick={() => (setError(null), setStep(step - 1))}
          disabled={step === 0 || pending}
        >
          Previous
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => void next()} disabled={checking}>
            {checking && <Loader2 className="animate-spin" aria-hidden />} Next
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void finish()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Finish
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function EntryNotes({ entry }: { entry: CatalogueEntry }) {
  return (
    <div className="grid gap-1 rounded-md bg-surface-2 px-3 py-2 text-xs">
      <p>{entry.description}</p>
      {!entry.supported && <p className="text-danger">{entry.unsupported_reason}</p>}
      {entry.observation && <p className="text-muted">What DMS observes: {entry.observation}</p>}
      {entry.notes?.map((n) => (
        <p key={n} className="text-muted">
          {n}
        </p>
      ))}
    </div>
  );
}

function Problems({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <ul role="alert" className="grid gap-0.5 text-xs text-danger">
      {list.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}
