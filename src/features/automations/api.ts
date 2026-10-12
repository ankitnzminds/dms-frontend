'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type Automation = Schemas['AutomationOut'];
// the generated type marks fields that have server defaults as required; callers may leave them out
export type AutomationCreate = Omit<Schemas['AutomationCreate'], 'binding_mode' | 'priority'> &
  Partial<Pick<Schemas['AutomationCreate'], 'binding_mode' | 'priority'>>;
export type AutomationUpdate = Partial<Schemas['AutomationUpdate']>;
export type Catalogue = Schemas['CatalogueOut'];
export type CatalogueEntry = Schemas['CatalogueEntry'];
export type Run = Schemas['AutomationRunOut'];
export type Report = Schemas['ValidationReport'];
export type TriggerDef = Schemas['TriggerDef'];
export type GraphDef = Schemas['GraphDef'];
export type NodeDef = Schemas['NodeDef'];
export type EdgeDef = Schemas['EdgeDef'];

const KEY = ['automations'] as const;

export function useCatalogue() {
  return useQuery({
    queryKey: [...KEY, 'catalogue'],
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      call<Catalogue>(api.GET('/api/v1/admin/automations/catalogue', { signal })),
  });
}

export function useAutomations(f: { q: string; limit: number; offset: number }) {
  return useQuery({
    queryKey: [...KEY, 'list', f],
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
    queryFn: ({ signal }) =>
      call<Page<Automation>>(
        api.GET('/api/v1/admin/automations', {
          params: { query: { q: f.q || undefined, limit: f.limit, offset: f.offset } },
          signal,
        }),
      ),
  });
}

export function useAutomation(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'one', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<Automation>(
        api.GET('/api/v1/admin/automations/{automation_id}', {
          params: { path: { automation_id: id! } },
          signal,
        }),
      ),
  });
}

function useAutoMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateAutomation() {
  return useAutoMutation((body: AutomationCreate) =>
    call<Automation>(
      api.POST('/api/v1/admin/automations', {
        body: { binding_mode: 'additive', priority: 0, ...body },
      }),
    ),
  );
}

export function useUpdateAutomation() {
  return useAutoMutation((v: { id: string; body: AutomationUpdate }) =>
    call<Automation>(
      api.PATCH('/api/v1/admin/automations/{automation_id}', {
        params: { path: { automation_id: v.id } },
        body: { allow_invalid: false, ...v.body },
      }),
    ),
  );
}

export function usePublish() {
  return useAutoMutation((v: { id: string; confirmHighRisk: boolean }) =>
    call<Automation>(
      api.POST('/api/v1/admin/automations/{automation_id}/publish', {
        params: { path: { automation_id: v.id } },
        body: { confirm_high_risk: v.confirmHighRisk },
      }),
    ),
  );
}

export function useSetAutomationEnabled() {
  return useAutoMutation((v: { id: string; enabled: boolean }) =>
    call<Automation>(
      v.enabled
        ? api.POST('/api/v1/admin/automations/{automation_id}/enable', {
            params: { path: { automation_id: v.id } },
          })
        : api.POST('/api/v1/admin/automations/{automation_id}/disable', {
            params: { path: { automation_id: v.id } },
          }),
    ),
  );
}

export function useArchive() {
  return useAutoMutation((id: string) =>
    call<Automation>(
      api.POST('/api/v1/admin/automations/{automation_id}/archive', {
        params: { path: { automation_id: id } },
      }),
    ),
  );
}

export function useDuplicate() {
  return useAutoMutation((id: string) =>
    call<Automation>(
      api.POST('/api/v1/admin/automations/{automation_id}/duplicate', {
        params: { path: { automation_id: id } },
      }),
    ),
  );
}

/** Validate an unsaved definition (the wizard calls this on every Next). */
export function validateDefinition(body: AutomationCreate): Promise<Report> {
  return call<Report>(
    api.POST('/api/v1/admin/automations/validate', {
      body: { binding_mode: 'additive', priority: 0, ...body },
    }),
  );
}

/** Validate the saved draft of an existing workflow. */
export function validateSaved(id: string): Promise<Report> {
  return call<Report>(
    api.POST('/api/v1/admin/automations/{automation_id}/validate', {
      params: { path: { automation_id: id } },
    }),
  );
}

export interface DryRun {
  would_trigger: boolean;
  status: string;
  run: Run;
}

export function useDryRun() {
  return useMutation({
    mutationFn: (v: { id: string; resourceId: string | null }) =>
      call<unknown>(
        api.POST('/api/v1/admin/automations/{automation_id}/test', {
          params: { path: { automation_id: v.id } },
          body: { resource_id: v.resourceId },
        }),
      ) as Promise<DryRun>,
  });
}

export function useRuns(id: string | undefined, offset = 0) {
  return useQuery({
    queryKey: [...KEY, 'runs', id, offset],
    enabled: !!id,
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<Run>>(
        api.GET('/api/v1/admin/automations/{automation_id}/runs', {
          params: { path: { automation_id: id! }, query: { limit: 20, offset } },
          signal,
        }),
      ),
  });
}

export function useRun(id: string | undefined) {
  return useQuery<Run>({
    queryKey: [...KEY, 'run', id],
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data && ['succeeded', 'failed', 'cancelled', 'skipped'].includes(q.state.data.status)
        ? false
        : 4_000,
    queryFn: ({ signal }) =>
      call<Run>(
        api.GET('/api/v1/admin/automation-runs/{run_id}', {
          params: { path: { run_id: id! } },
          signal,
        }),
      ),
  });
}

export function useRetryRun() {
  return useAutoMutation((id: string) =>
    call<Run>(
      api.POST('/api/v1/admin/automation-runs/{run_id}/retry', {
        params: { path: { run_id: id } },
      }),
    ),
  );
}

export function useCancelRun() {
  return useAutoMutation((id: string) =>
    call<Run>(
      api.POST('/api/v1/admin/automation-runs/{run_id}/cancel', {
        params: { path: { run_id: id } },
      }),
    ),
  );
}

// ------------------------------------------------------------------ user side + monitoring
export type Startable = Schemas['StartableOut'];
export type RunSummary = Schemas['RunSummaryOut'];

const STUDIO = ['workflow-studio'] as const;
type ItemType = 'document' | 'folder';

/** Manual workflows the signed-in person may start on this file or folder. */
export function useStartable(type: ItemType, id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...STUDIO, 'startable', type, id],
    enabled: !!id && enabled,
    queryFn: ({ signal }) =>
      call<Startable[]>(
        api.GET('/api/v1/automations/startable', {
          params: { query: { resource_type: type, resource_id: id! } },
          signal,
        }),
      ),
  });
}

export function useStartWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; type: ItemType; resourceId: string; note: string | null }) =>
      call<Schemas['StartedOut']>(
        api.POST('/api/v1/automations/{automation_id}/start', {
          params: { path: { automation_id: v.id } },
          body: { resource_type: v.type, resource_id: v.resourceId, note: v.note },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STUDIO }),
  });
}

/** Workflows I started by hand. Refreshes while something is still running. */
export function useMyRuns(offset = 0, limit = 25) {
  return useQuery<Page<RunSummary>>({
    queryKey: [...STUDIO, 'mine', offset, limit],
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.items.some((r) => ['queued', 'running', 'waiting'].includes(r.status))
        ? 4_000
        : 30_000,
    queryFn: ({ signal }) =>
      call<Page<RunSummary>>(
        api.GET('/api/v1/automation-runs/mine', { params: { query: { limit, offset } }, signal }),
      ),
  });
}

/** What ran on a file: anyone who can see the file may follow it. */
export function useDocumentAutomationRuns(documentId: string | undefined) {
  return useQuery<RunSummary[]>({
    queryKey: [...STUDIO, 'document', documentId],
    enabled: !!documentId,
    refetchInterval: (q) =>
      q.state.data?.some((r) => ['queued', 'running', 'waiting'].includes(r.status))
        ? 4_000
        : false,
    queryFn: ({ signal }) =>
      call<RunSummary[]>(
        api.GET('/api/v1/documents/{document_id}/automation-runs', {
          params: { path: { document_id: documentId! } },
          signal,
        }),
      ),
  });
}

export type RunStatus = Run['status'];

/** Every run in the organization (administrators). */
export function useAllRuns(f: { status: RunStatus | ''; automationId: string; offset: number }) {
  return useQuery({
    queryKey: [...KEY, 'all-runs', f],
    placeholderData: keepPreviousData,
    refetchInterval: 8_000,
    queryFn: ({ signal }) =>
      call<Page<Run>>(
        api.GET('/api/v1/admin/automation-runs', {
          params: {
            query: {
              status: f.status || undefined,
              automation_id: f.automationId || undefined,
              limit: 25,
              offset: f.offset,
            },
          },
          signal,
        }),
      ),
  });
}
