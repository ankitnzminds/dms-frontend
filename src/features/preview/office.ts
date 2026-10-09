import { useMutation, useQuery } from '@tanstack/react-query';
import { api, call, type Schemas } from '@/lib/api-client';

export type OfficeSession = Schemas['OfficeSessionOut'];
export type OfficeStatus = Schemas['OfficeStatus'];

export function useOfficeStatus() {
  return useQuery({
    queryKey: ['office', 'status'],
    queryFn: ({ signal }) => call<OfficeStatus>(api.GET('/api/v1/office/status', { signal })),
    staleTime: 5 * 60_000,
  });
}

/**
 * A session carries a scoped, short-lived token: never cached (gcTime 0) and never put in a URL.
 * Re-opening (or switching view/edit) always asks the backend again, so permissions are re-evaluated.
 */
export function useOfficeSession() {
  return useMutation({
    mutationFn: (v: { documentId: string; mode: 'view' | 'edit' }) =>
      call<OfficeSession>(
        api.POST('/api/v1/documents/{document_id}/office-session', {
          params: { path: { document_id: v.documentId } },
          body: { mode: v.mode },
        }),
      ),
  });
}
