'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isApiError, type Page, type Schemas } from '@/lib/api-client';

export type AccessRequest = Schemas['AccessRequestOut'];
export type RequestStatus = AccessRequest['status'];

const KEYS = ['access-requests', 'access-request'];

export function useAccessRequests(
  view: 'mine' | 'to_decide',
  status: RequestStatus | '',
  limit: number,
  offset: number,
) {
  return useQuery({
    queryKey: ['access-requests', view, status, limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<AccessRequest>>(
        api.GET('/api/v1/access-requests', {
          params: { query: { view, status: status || undefined, limit, offset } },
          signal,
        }),
      ),
    refetchInterval: 30_000,
  });
}

function useReq<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of KEYS) void qc.invalidateQueries({ queryKey: [k] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export const useCreateAccessRequest = () =>
  useReq((b: Schemas['AccessRequestCreate']) =>
    call<AccessRequest>(api.POST('/api/v1/access-requests', { body: b })),
  );

export const useCancelAccessRequest = () =>
  useReq((id: string) =>
    call<AccessRequest>(
      api.POST('/api/v1/access-requests/{request_id}/cancel', {
        params: { path: { request_id: id } },
      }),
    ),
  );

export const useDecideAccessRequest = () =>
  useReq((v: { id: string; body: Schemas['AccessRequestDecision'] }) =>
    call<AccessRequest>(
      api.POST('/api/v1/access-requests/{request_id}/decision', {
        params: { path: { request_id: v.id } },
        body: v.body,
      }),
    ),
  );

const CODES: Record<string, string> = {
  already_has_access: 'You already have this access.',
  already_decided: 'This request was already decided.',
  self_approval: 'You cannot decide your own request.',
  duplicate_request: 'You already have a pending request for this item.',
};

/** Non-disclosing messages: a 404 never says whether the item exists. */
export function accessRequestError(e: unknown): string | null {
  if (!isApiError(e)) return null;
  if (CODES[e.code]) return CODES[e.code]!;
  if (e.status === 404) return 'That item was not found, or it cannot be requested.';
  return null;
}
