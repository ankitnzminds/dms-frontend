'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isApiError, type Page, type Schemas } from '@/lib/api-client';

export type SignatureRequest = Schemas['SignatureRequestOut'];
export type SignatureCapabilities = Schemas['SignatureCapabilities'];

export const TERMINAL_STATES = ['completed', 'declined', 'cancelled', 'expired', 'failed'] as const;
export const isTerminal = (s: SignatureRequest['state']) =>
  (TERMINAL_STATES as readonly string[]).includes(s);

export function useSignatureCapabilities() {
  return useQuery({
    queryKey: ['signature-capabilities'],
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      call<SignatureCapabilities>(api.GET('/api/v1/signature-capabilities', { signal })),
  });
}

/** Why requesting a signature is unavailable (null when it is available). */
export function signatureUnavailableReason(
  c: SignatureCapabilities | undefined,
  isAdmin: boolean,
): string | null {
  if (!c) return 'Checking e-signature availability…';
  if (!c.available)
    return 'E-signature is not available: no signing provider is configured for this service.';
  if (!c.enabled)
    return isAdmin
      ? 'E-signature is turned off. Turn it on in Administration > Settings.'
      : 'E-signature is turned off for your organization. Ask an administrator.';
  return null;
}

const REQUEST_ERRORS: Record<string, string> = {
  pdf_required: 'Only PDF documents can be sent for signature.',
  feature_disabled: 'E-signature is turned off for your organization.',
  signatures_unavailable: 'The signing provider is not available right now. Try again later.',
  policy_blocked: 'This document’s classification does not allow it to be sent for signature.',
  external_signers_disabled:
    'One of the signers is outside the organization, and external signers are not allowed.',
};
export function signatureErrorMessage(e: unknown): string | null {
  return isApiError(e) ? (REQUEST_ERRORS[e.code] ?? null) : null;
}

export function useDocumentSignatures(documentId: string | undefined) {
  return useQuery({
    queryKey: ['signature-requests', 'doc', documentId],
    enabled: !!documentId,
    queryFn: ({ signal }) =>
      call<SignatureRequest[]>(
        api.GET('/api/v1/documents/{document_id}/signature-requests', {
          params: { path: { document_id: documentId! } },
          signal,
        }),
      ),
  });
}

export function useSignatureRequests(
  scope: 'mine' | 'to_sign' | 'all',
  limit: number,
  offset: number,
) {
  return useQuery({
    queryKey: ['signature-requests', scope, limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<SignatureRequest>>(
        api.GET('/api/v1/signature-requests', {
          params: { query: { scope, limit, offset } },
          signal,
        }),
      ),
  });
}

export function useSignatureRequest(id: string | undefined, poll: boolean) {
  return useQuery({
    queryKey: ['signature-request', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<SignatureRequest>(
        api.GET('/api/v1/signature-requests/{request_id}', {
          params: { path: { request_id: id! } },
          signal,
        }),
      ),
    refetchInterval: (q) =>
      poll && q.state.data && !isTerminal(q.state.data.state) ? 3000 : false,
  });
}

function useSig<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of ['signature-requests', 'signature-request', 'versions', 'document'])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export const useCreateSignatureRequest = (documentId: string) =>
  useSig((b: Schemas['SignatureRequestIn']) =>
    call<SignatureRequest>(
      api.POST('/api/v1/documents/{document_id}/signature-requests', {
        params: { path: { document_id: documentId } },
        body: b,
      }),
    ),
  );

export const useCancelSignatureRequest = () =>
  useSig(async (id: string) => {
    await api.POST('/api/v1/signature-requests/{request_id}/cancel', {
      params: { path: { request_id: id } },
    });
  });

/** Re-reads the authoritative status from the provider (webhooks cannot reach every deployment). */
export const useRefreshSignatureRequest = () =>
  useSig((id: string) =>
    call<SignatureRequest>(
      api.POST('/api/v1/signature-requests/{request_id}/refresh', {
        params: { path: { request_id: id } },
      }),
    ),
  );

/**
 * Returns a SECRET one-time signing link. Deliberately NOT a React Query call (no cache entry, no
 * mutation-cache copy): the caller must use the string immediately and drop it. Never log or persist it.
 */
export async function fetchSigningUrl(requestId: string): Promise<string> {
  const r = await call<Schemas['SigningSessionOut']>(
    api.POST('/api/v1/signature-requests/{request_id}/signing-session', {
      params: { path: { request_id: requestId } },
    }),
  );
  return r.url;
}
