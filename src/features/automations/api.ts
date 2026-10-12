'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type Automation = Schemas['AutomationOut'];
export type AutomationCreate = Schemas['AutomationCreate'];
export type AutomationUpdate = Schemas['AutomationUpdate'];
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
    call<Automation>(api.POST('/api/v1/admin/automations', { body })),
  );
}

export function useUpdateAutomation() {
  return useAutoMutation((v: { id: string; body: AutomationUpdate }) =>
    call<Automation>(
      api.PATCH('/api/v1/admin/automations/{automation_id}', {
        params: { path: { automation_id: v.id } },
        body: v.body,
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
  return call<Report>(api.POST('/api/v1/admin/automations/validate', { body }));
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
  return useQuery({
    queryKey: [...KEY, 'run', id],
    enabled: !!id,
    refetchInterval: 4_000,
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
