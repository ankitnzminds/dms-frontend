'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type PolicyOut = Schemas['PolicyOut'];
export type PolicyDetail = Schemas['PolicyDetail'];
export type PolicyRevision = Schemas['RevisionOut'];
export type PolicyTemplate = Schemas['PolicyTemplate'];
export type Grammar = Schemas['Grammar'];
export type ValidationReport = Schemas['PolicyValidationReport'];
export type SimulationIn = Schemas['SimulationIn'];
export type SimulationOut = Schemas['SimulationOut'];
export type PolicyStatus = PolicyOut['status'];

const KEY = ['admin', 'policy-rules'] as const;

export function usePolicies(status: PolicyStatus | '', q: string, limit: number, offset: number) {
  return useQuery({
    queryKey: [...KEY, 'list', status, q, limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<PolicyOut>>(
        api.GET('/api/v1/admin/policy-rules', {
          params: { query: { status: status || undefined, q: q || undefined, limit, offset } },
          signal,
        }),
      ),
  });
}

export function usePolicy(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'one', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<PolicyDetail>(
        api.GET('/api/v1/admin/policy-rules/{policy_id}', {
          params: { path: { policy_id: id! } },
          signal,
        }),
      ),
  });
}

export function useGrammar() {
  return useQuery({
    queryKey: [...KEY, 'grammar'],
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) =>
      call<Grammar>(api.GET('/api/v1/admin/policy-rules/grammar', { signal })),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: [...KEY, 'templates'],
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) =>
      call<PolicyTemplate[]>(api.GET('/api/v1/admin/policy-rules/templates', { signal })),
  });
}

export function useComparePolicy(id: string | undefined, a: number | null, b: number | null) {
  return useQuery({
    queryKey: [...KEY, 'compare', id, a, b],
    enabled: !!id && !!a && !!b,
    queryFn: ({ signal }) =>
      call<Schemas['RevisionDiff']>(
        api.GET('/api/v1/admin/policy-rules/{policy_id}/compare', {
          params: { path: { policy_id: id! }, query: { a: a!, b: b! } },
          signal,
        }),
      ),
  });
}

function useMut<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

const path = (id: string) => ({ params: { path: { policy_id: id } } });

export const useCreatePolicy = () =>
  useMut((body: Schemas['PolicyCreate']) =>
    call<PolicyDetail>(api.POST('/api/v1/admin/policy-rules', { body })),
  );

export const useUpdatePolicy = () =>
  useMut((v: { id: string; body: Schemas['PolicyUpdate'] }) =>
    call<PolicyDetail>(
      api.PATCH('/api/v1/admin/policy-rules/{policy_id}', { ...path(v.id), body: v.body }),
    ),
  );

export const useValidatePolicy = () =>
  useMut((id: string) =>
    call<ValidationReport>(api.POST('/api/v1/admin/policy-rules/{policy_id}/validate', path(id))),
  );

export const usePublishPolicy = () =>
  useMut((v: { id: string; body: Schemas['PublishIn'] }) =>
    call<PolicyDetail>(
      api.POST('/api/v1/admin/policy-rules/{policy_id}/publish', { ...path(v.id), body: v.body }),
    ),
  );

export const useSetPolicyMode = () =>
  useMut((v: { id: string; mode: 'enforce' | 'observe' }) =>
    call<PolicyDetail>(
      api.PUT('/api/v1/admin/policy-rules/{policy_id}/mode', {
        ...path(v.id),
        body: { mode: v.mode },
      }),
    ),
  );

export const usePolicyLifecycle = () =>
  useMut((v: { id: string; op: 'disable' | 'enable' | 'archive' }) => {
    const p = path(v.id);
    return v.op === 'disable'
      ? call<PolicyDetail>(api.POST('/api/v1/admin/policy-rules/{policy_id}/disable', p))
      : v.op === 'enable'
        ? call<PolicyDetail>(api.POST('/api/v1/admin/policy-rules/{policy_id}/enable', p))
        : call<PolicyDetail>(api.POST('/api/v1/admin/policy-rules/{policy_id}/archive', p));
  });

export const useRollbackPolicy = () =>
  useMut((v: { id: string; toRevision: number; reason: string }) =>
    call<PolicyDetail>(
      api.POST('/api/v1/admin/policy-rules/{policy_id}/rollback', {
        ...path(v.id),
        body: { to_revision: v.toRevision, change_reason: v.reason },
      }),
    ),
  );

export const useSimulatePolicy = () =>
  useMutation({
    mutationFn: (body: SimulationIn) =>
      call<SimulationOut>(api.POST('/api/v1/admin/policy-rules/simulate', { body })),
  });
