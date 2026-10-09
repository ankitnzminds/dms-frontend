'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isApiError, type Schemas } from '@/lib/api-client';

export type Protection = Schemas['ProtectionOut'];
export type RetentionPolicy = Schemas['RetentionPolicyOut'];
export type LegalHold = Schemas['LegalHoldOut'];
export type LegalHoldItem = Schemas['LegalHoldItemOut'];

/** Hold / retention state of one document or folder. */
export function useProtection(kind: 'document' | 'folder', id: string | undefined) {
  return useQuery({
    queryKey: ['protection', kind, id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      kind === 'document'
        ? call<Protection>(
            api.GET('/api/v1/documents/{document_id}/protection', {
              params: { path: { document_id: id! } },
              signal,
            }),
          )
        : call<Protection>(
            api.GET('/api/v1/folders/{folder_id}/protection', {
              params: { path: { folder_id: id! } },
              signal,
            }),
          ),
  });
}

/** Message for a failed permanent delete (409 legal_hold / retention_active, 403). */
export function purgeErrorMessage(e: unknown): string | null {
  if (!isApiError(e)) return null;
  if (e.code === 'legal_hold')
    return 'This item is under a legal hold and cannot be deleted forever. Ask an administrator to release the hold.';
  if (e.code === 'retention_active') {
    const until = Array.isArray(e.details)
      ? (e.details as Array<{ until?: string | null }>)
          .map((d) => d.until)
          .filter(Boolean)
          .sort()
          .pop()
      : null;
    return `A retention policy protects this item${until ? ` until ${new Date(until).toLocaleDateString()}` : ''}. It cannot be deleted forever before then.`;
  }
  if (e.status === 403) return 'You do not have permission to delete this forever.';
  return null;
}

export function usePurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: 'document' | 'folder'; id: string }) =>
      call<Schemas['PurgeOut']>(
        api.DELETE('/api/v1/trash/{kind}/{resource_id}', {
          params: {
            path: { kind: v.kind === 'document' ? 'documents' : 'folders', resource_id: v.id },
          },
        }),
      ),
    onSuccess: () => {
      for (const k of ['trash', 'usage', 'protection'])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export function useRetentionPolicies() {
  return useQuery({
    queryKey: ['gov', 'retention'],
    queryFn: ({ signal }) =>
      call<RetentionPolicy[]>(api.GET('/api/v1/admin/retention-policies', { signal })),
  });
}

function useGov<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gov'] }),
  });
}

export const useCreateRetention = () =>
  useGov((b: Schemas['RetentionPolicyIn']) =>
    call<RetentionPolicy>(api.POST('/api/v1/admin/retention-policies', { body: b })),
  );
export const useUpdateRetention = () =>
  useGov((v: { id: string; body: Schemas['RetentionPolicyUpdate'] }) =>
    call<RetentionPolicy>(
      api.PATCH('/api/v1/admin/retention-policies/{policy_id}', {
        params: { path: { policy_id: v.id } },
        body: v.body,
      }),
    ),
  );
export const useDeleteRetention = () =>
  useGov(async (id: string) => {
    await api.DELETE('/api/v1/admin/retention-policies/{policy_id}', {
      params: { path: { policy_id: id } },
    });
  });

export function useLegalHolds() {
  return useQuery({
    queryKey: ['gov', 'holds'],
    queryFn: ({ signal }) => call<LegalHold[]>(api.GET('/api/v1/admin/legal-holds', { signal })),
  });
}
export const useCreateHold = () =>
  useGov((b: Schemas['LegalHoldIn']) =>
    call<LegalHold>(api.POST('/api/v1/admin/legal-holds', { body: b })),
  );
export const useReleaseHold = () =>
  useGov((v: { id: string; reason: string }) =>
    call<LegalHold>(
      api.POST('/api/v1/admin/legal-holds/{hold_id}/release', {
        params: { path: { hold_id: v.id } },
        body: { reason: v.reason },
      }),
    ),
  );

export function useHoldItems(holdId: string | undefined) {
  return useQuery({
    queryKey: ['gov', 'hold-items', holdId],
    enabled: !!holdId,
    queryFn: ({ signal }) =>
      call<LegalHoldItem[]>(
        api.GET('/api/v1/admin/legal-holds/{hold_id}/items', {
          params: { path: { hold_id: holdId! } },
          signal,
        }),
      ),
  });
}
export const useAddHoldItem = (holdId: string) =>
  useGov((b: Schemas['LegalHoldItemIn']) =>
    call<LegalHoldItem>(
      api.POST('/api/v1/admin/legal-holds/{hold_id}/items', {
        params: { path: { hold_id: holdId } },
        body: b,
      }),
    ),
  );
export const useRemoveHoldItem = (holdId: string) =>
  useGov(async (itemId: string) => {
    await api.DELETE('/api/v1/admin/legal-holds/{hold_id}/items/{item_id}', {
      params: { path: { hold_id: holdId, item_id: itemId } },
    });
  });
