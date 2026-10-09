'use client';

import { Archive, ArchiveRestore, Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useGroups } from '@/features/sharing/hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { workflowIcon } from './icons';
import {
  describeCondition,
  useCreateWorkflow,
  useNewWorkflowVersion,
  useUpdateWorkflow,
  useWorkflows,
  type WorkflowDefinition,
} from './hooks';
import {
  draftsToSteps,
  emptyStep,
  StepsEditor,
  stepsToDrafts,
  validateDrafts,
  type StepDraft,
} from './steps-editor';

function BuilderDialog({
  existing,
  onClose,
}: {
  existing: WorkflowDefinition | null;
  onClose: () => void;
}) {
  const create = useCreateWorkflow();
  const version = useNewWorkflowVersion();
  const groups = useGroups();
  const groupNames = Object.fromEntries((groups.data?.items ?? []).map((g) => [g.id, g.name]));
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [drafts, setDrafts] = useState<StepDraft[]>(() =>
    existing ? stepsToDrafts(existing.steps, groupNames) : [emptyStep()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const pending = create.isPending || version.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validateDrafts(drafts);
    setErrors(errs);
    const nErr = !existing && !name.trim() ? 'Give the workflow a name' : null;
    setNameError(nErr);
    if (nErr || Object.keys(errs).length) return;
    const steps = draftsToSteps(drafts);
    const ok = (m: string) => () => {
      toast.success(m);
      onClose();
    };
    const fail = (er: unknown) =>
      setServerError(
        isApiError(er) && er.code === 'unknown_assignee'
          ? 'One of the reviewers does not exist in this organization.'
          : isApiError(er) && er.code === 'name_conflict'
            ? 'A workflow with this name already exists.'
            : friendlyMessage(er),
      );
    if (existing)
      version.mutate(
        { id: existing.id, steps },
        { onSuccess: ok('New version saved'), onError: fail },
      );
    else
      create.mutate(
        { name: name.trim(), description: description.trim() || null, steps },
        { onSuccess: ok(`Created "${name.trim()}"`), onError: fail },
      );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl"
        title={existing ? `New version of "${existing.name}"` : 'New approval workflow'}
        description={
          existing
            ? 'Runs already in progress keep the version they started with.'
            : 'Steps run in order. Each step needs reviewers.'
        }
      >
        <form noValidate onSubmit={submit}>
          <DialogBody className="grid gap-4">
            {!existing && (
              <>
                <Field id="wf-name" label="Name" error={nameError ?? undefined}>
                  {(p) => (
                    <Input
                      {...p}
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Field>
                <Field id="wf-desc" label="Description (optional)">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
            <StepsEditor drafts={drafts} errors={errors} onChange={setDrafts} />
            {serverError && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {serverError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {existing ? 'Save new version' : 'Create workflow'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowsAdminView() {
  const [archived, setArchived] = useState(false);
  const q = useWorkflows(archived);
  const update = useUpdateWorkflow();
  const [builder, setBuilder] = useState<{ existing: WorkflowDefinition | null } | null>(null);
  const Icon = workflowIcon;

  return (
    <>
      <PageHeader
        title="Approval workflows"
        description="Define who must approve a document. People start a workflow from the document page."
        actions={
          <>
            <div className="flex items-center gap-2">
              <Switch id="wf-archived" checked={archived} onCheckedChange={setArchived} />
              <Label htmlFor="wf-archived" className="font-normal">
                Show archived
              </Label>
            </div>
            <Button variant="primary" onClick={() => setBuilder({ existing: null })}>
              <Plus /> New workflow
            </Button>
          </>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={3} label="Loading workflows" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Icon}
            title="No workflows yet"
            description="Create one to enable 'Submit for approval' on documents."
          />
        ) : (
          <ul className="divide-y divide-line" aria-label="Workflows">
            {q.data.map((w) => (
              <li
                key={w.id}
                className="px-4 py-3"
                data-testid="workflow-row"
                data-archived={w.archived}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">
                      {w.name} <Badge tone="outline">v{w.latest_version}</Badge>{' '}
                      {w.archived && <Badge tone="warn">Archived</Badge>}
                    </p>
                    {w.description && <p className="text-xs text-muted">{w.description}</p>}
                  </div>
                  {!w.archived && (
                    <Button size="sm" onClick={() => setBuilder({ existing: w })}>
                      <Pencil /> New version
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={w.archived ? 'secondary' : 'danger-ghost'}
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate(
                        { id: w.id, body: { archived: !w.archived } },
                        {
                          onSuccess: () =>
                            toast.success(w.archived ? 'Workflow restored' : 'Workflow archived'),
                          onError: (e) => toast.error(friendlyMessage(e)),
                        },
                      )
                    }
                  >
                    {w.archived ? <ArchiveRestore /> : <Archive />}{' '}
                    {w.archived ? 'Restore' : 'Archive'}
                  </Button>
                </div>
                <ol
                  className="mt-2 grid gap-1 text-xs text-muted"
                  aria-label={`Steps of ${w.name}`}
                >
                  {w.steps.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium text-text">{s.name}</span> -{' '}
                      {s.rule === 'any' ? 'any of' : 'all of'} {s.assignees.length} reviewer
                      {s.assignees.length === 1 ? '' : 's'}
                      {s.due_days ? `, due in ${s.due_days}d` : ''}
                      {describeCondition(s.condition) ? ` · ${describeCondition(s.condition)}` : ''}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {builder && (
        <BuilderDialog
          key={builder.existing?.id ?? 'new'}
          existing={builder.existing}
          onClose={() => setBuilder(null)}
        />
      )}
    </>
  );
}
