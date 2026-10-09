'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type WorkflowDefinition = Schemas['WorkflowDefinitionOut'];
export type StepSpec = Schemas['StepSpec'];
export type AssigneeSpec = Schemas['AssigneeSpec'];
export type Run = Schemas['RunOut'];
export type Task = Schemas['TaskOut'];

export function useWorkflows(includeArchived = false) {
  return useQuery({
    queryKey: ['workflows', includeArchived],
    queryFn: ({ signal }) =>
      call<WorkflowDefinition[]>(
        api.GET('/api/v1/workflows', {
          params: { query: { include_archived: includeArchived } },
          signal,
        }),
      ),
  });
}

function useWf<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of ['workflows', 'workflow-runs', 'workflow-run', 'my-tasks'])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export const useCreateWorkflow = () =>
  useWf((b: Schemas['WorkflowDefinitionIn']) =>
    call<WorkflowDefinition>(api.POST('/api/v1/admin/workflows', { body: b })),
  );
export const useNewWorkflowVersion = () =>
  useWf((v: { id: string; steps: StepSpec[] }) =>
    call<WorkflowDefinition>(
      api.POST('/api/v1/admin/workflows/{definition_id}/versions', {
        params: { path: { definition_id: v.id } },
        body: { steps: v.steps },
      }),
    ),
  );
export const useUpdateWorkflow = () =>
  useWf((v: { id: string; body: Schemas['WorkflowDefinitionUpdate'] }) =>
    call<WorkflowDefinition>(
      api.PATCH('/api/v1/admin/workflows/{definition_id}', {
        params: { path: { definition_id: v.id } },
        body: v.body,
      }),
    ),
  );

export function useDocumentRuns(documentId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-runs', documentId],
    enabled: !!documentId,
    queryFn: ({ signal }) =>
      call<Run[]>(
        api.GET('/api/v1/documents/{document_id}/workflow-runs', {
          params: { path: { document_id: documentId! } },
          signal,
        }),
      ),
    refetchInterval: (q) => (q.state.data?.some((r) => r.state === 'in_progress') ? 8000 : false),
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-run', runId],
    enabled: !!runId,
    queryFn: ({ signal }) =>
      call<Run>(
        api.GET('/api/v1/workflow-runs/{run_id}', { params: { path: { run_id: runId! } }, signal }),
      ),
    refetchInterval: (q) => (q.state.data?.state === 'in_progress' ? 8000 : false),
  });
}

export const useStartRun = (documentId: string) =>
  useWf((b: Schemas['StartRunIn']) =>
    call<Run>(
      api.POST('/api/v1/documents/{document_id}/workflow-runs', {
        params: { path: { document_id: documentId } },
        body: b,
      }),
    ),
  );
export const useCancelRun = () =>
  useWf(async (v: { id: string; comment?: string }) => {
    await api.POST('/api/v1/workflow-runs/{run_id}/cancel', {
      params: { path: { run_id: v.id } },
      body: v.comment ? { comment: v.comment } : undefined,
    });
  });
export const useResubmitRun = () =>
  useWf((v: { id: string }) =>
    call<Run>(
      api.POST('/api/v1/workflow-runs/{run_id}/resubmit', { params: { path: { run_id: v.id } } }),
    ),
  );

export function useMyTasks(status: string, limit: number, offset: number) {
  return useQuery({
    queryKey: ['my-tasks', status, limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<Task>>(
        api.GET('/api/v1/workflow-tasks/mine', {
          params: { query: { status: status || undefined, limit, offset } as never },
          signal,
        }),
      ),
    refetchInterval: 30_000,
  });
}

export const useDecideTask = () =>
  useWf((v: { id: string; decision: 'approve' | 'reject'; comment?: string }) =>
    call<Task>(
      api.POST('/api/v1/workflow-tasks/{task_id}/decision', {
        params: { path: { task_id: v.id } },
        body: { decision: v.decision, comment: v.comment || null },
      }),
    ),
  );
export const useDelegateTask = () =>
  useWf((v: { id: string; userId: string; comment?: string }) =>
    call<Task>(
      api.POST('/api/v1/workflow-tasks/{task_id}/delegate', {
        params: { path: { task_id: v.id } },
        body: { user_id: v.userId, comment: v.comment || null },
      }),
    ),
  );

/** Human text for a step's condition. */
export function describeCondition(c: Schemas['StepCondition'] | null | undefined): string | null {
  if (!c) return null;
  const field = c.field === 'metadata' ? `metadata.${c.key ?? '?'}` : c.field;
  const val = Array.isArray(c.value) ? c.value.join(', ') : String(c.value);
  return `Runs only when ${field} ${c.op} ${val}`;
}

export function describeAssignee(a: AssigneeSpec, names: Record<string, string> = {}): string {
  if (a.type === 'role') return `Role: ${a.role ?? '?'}`;
  const label = a.id ? (names[a.id] ?? a.id.slice(0, 8)) : '?';
  return a.type === 'group' ? `Group: ${label}` : label;
}
