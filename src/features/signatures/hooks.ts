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
  // Built-in signing needs no external provider, so only report "unavailable" when neither exists.
  if (!c.available && !c.builtin_available)
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
  builtin_internal_only: 'Built-in signing needs every signer to be a member of your organization.',
  signature_in_progress:
    'This document already has a signature request in progress. Cancel it or wait for it to finish.',
  consent_required: 'Tick the box to agree to the signature statement.',
  statement_outdated: 'The signature statement changed. Close this window and open it again.',
  typed_name_required: 'Type your full name to sign.',
  already_responded: 'You have already responded to this request.',
  invalid_state: 'This request is no longer open for signing.',
  integrity_error: 'The document version being signed is no longer intact. Contact the sender.',
  not_your_turn: 'An earlier signing level has not finished yet. You can sign after it does.',
  chain_flags_builtin_only:
    'Optional and super signers need built-in signing: an external provider only finishes once every signer has signed.',
  chain_signer_inactive:
    'The signature chain of this folder has someone who is no longer an active member. Ask an administrator to update it.',
  signer_in_two_levels: 'A signer can appear in one level only.',
  empty_level: 'Every level needs at least one signer.',
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
  status: 'any' | 'active' | 'finished' = 'any',
) {
  return useQuery({
    queryKey: ['signature-requests', scope, limit, offset, status],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<SignatureRequest>>(
        api.GET('/api/v1/signature-requests', {
          params: { query: { scope, limit, offset, status } },
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

export function useSignatureStatement() {
  return useQuery({
    queryKey: ['signature-statement'],
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) =>
      call<Schemas['SignatureStatementOut']>(api.GET('/api/v1/signature-statement', { signal })),
  });
}

/** Built-in signing: the signer agrees to the statement and signs. Final. */
export const useBuiltinSign = () =>
  useSig(async (v: { id: string; body: Schemas['SignRequestIn'] }) => {
    await call<unknown>(
      api.POST('/api/v1/signature-requests/{request_id}/sign', {
        params: { path: { request_id: v.id } },
        body: v.body,
      }),
    );
  });

/** Built-in signing: decline (a separate, final operation). */
export const useBuiltinDecline = () =>
  useSig(async (v: { id: string; reason: string | null }) => {
    await call<unknown>(
      api.POST('/api/v1/signature-requests/{request_id}/decline', {
        params: { path: { request_id: v.id } },
        body: { reason: v.reason },
      }),
    );
  });

/** Download the exact version being signed (authenticated; nothing is cached). */
export async function downloadSigningDocument(requestId: string, filename: string) {
  const r = await api.GET('/api/v1/signature-requests/{request_id}/document', {
    params: { path: { request_id: requestId } },
    parseAs: 'blob',
  });
  if (r.error || !r.data) throw new Error('The document could not be downloaded.');
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type SignatureChain = Schemas['ChainOut'];
export type ChainSigner = Schemas['ChainSignerOut'];

/** The folder's signature chain (levels of signers). An empty `levels` means manual signer selection. */
export function useSignatureChain(folderId: string | undefined) {
  return useQuery({
    queryKey: ['signature-chain', folderId],
    enabled: !!folderId,
    queryFn: ({ signal }) =>
      call<SignatureChain>(
        api.GET('/api/v1/folders/{folder_id}/signature-chain', {
          params: { path: { folder_id: folderId! } },
          signal,
        }),
      ),
  });
}

export function useSetSignatureChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { folderId: string; body: Schemas['ChainIn'] }) =>
      call<SignatureChain>(
        api.PUT('/api/v1/folders/{folder_id}/signature-chain', {
          params: { path: { folder_id: v.folderId } },
          body: v.body,
        }),
      ),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['signature-chain', v.folderId] });
    },
  });
}

/** Does any signer of this chain need built-in signing (optional / super signer)? */
export const chainNeedsBuiltin = (c: SignatureChain | undefined) =>
  !!c?.levels.some((lv) => lv.some((s) => s.optional || s.is_super_signer));
