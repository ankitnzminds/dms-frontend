'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isApiError, type Page, type Schemas } from '@/lib/api-client';

export type ChatStatus = Schemas['ChatStatus'];
export type Conversation = Schemas['ConversationOut'];
export type ChatMessage = Schemas['MessageOut'];
export type Citation = Schemas['CitationOut'];
export type ChatRun = Schemas['app__schemas__chat__RunOut'];
export type PendingAction = Schemas['PendingActionOut'];

export const RUN_POLL_MS = 700;
export const TERMINAL_RUN = ['completed', 'failed', 'cancelled'] as const;
/** Polling pauses at awaiting_confirmation (the user must act on a card). */
export const isRunSettled = (s: ChatRun['status']) =>
  s === 'awaiting_confirmation' || (TERMINAL_RUN as readonly string[]).includes(s);

export function useChatStatus() {
  return useQuery({
    queryKey: ['chat', 'status'],
    staleTime: 60_000,
    retry: false,
    queryFn: ({ signal }) => call<ChatStatus>(api.GET('/api/v1/chat/status', { signal })),
  });
}

export function useConversations(includeArchived = false) {
  return useQuery({
    queryKey: ['chat', 'conversations', includeArchived],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<Conversation>>(
        api.GET('/api/v1/chat/conversations', {
          params: { query: { include_archived: includeArchived, limit: 50, offset: 0 } },
          signal,
        }),
      ),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Schemas['ConversationCreate']) =>
      call<Conversation>(api.POST('/api/v1/chat/conversations', { body: b })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
  });
}

export function usePatchConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: Schemas['ConversationPatch'] }) =>
      call<Conversation>(
        api.PATCH('/api/v1/chat/conversations/{conversation_id}', {
          params: { path: { conversation_id: v.id } },
          body: v.body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'messages', conversationId],
    enabled: !!conversationId,
    queryFn: ({ signal }) =>
      call<Page<ChatMessage>>(
        api.GET('/api/v1/chat/conversations/{conversation_id}/messages', {
          params: { path: { conversation_id: conversationId! }, query: { limit: 200, offset: 0 } },
          signal,
        }),
      ),
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: (v: { conversationId: string; body: Schemas['MessageCreate'] }) =>
      call<Schemas['MessageAccepted']>(
        api.POST('/api/v1/chat/conversations/{conversation_id}/messages', {
          params: { path: { conversation_id: v.conversationId } },
          body: v.body,
        }),
      ),
  });
}

/** Runs are asynchronous. Poll about every 700 ms until settled (no faked token streaming). */
export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'run', runId],
    enabled: !!runId,
    gcTime: 0,
    queryFn: ({ signal }) =>
      call<ChatRun>(
        api.GET('/api/v1/chat/runs/{run_id}', { params: { path: { run_id: runId! } }, signal }),
      ),
    refetchInterval: (q) =>
      q.state.data && isRunSettled(q.state.data.status) ? false : RUN_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call<ChatRun>(
        api.POST('/api/v1/chat/runs/{run_id}/cancel', { params: { path: { run_id: id } } }),
      ),
    onSuccess: (r) => qc.setQueryData(['chat', 'run', r.id], r),
  });
}

export function useFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { messageId: string; feedback: 'up' | 'down' | null }) => {
      await api.PUT('/api/v1/chat/messages/{message_id}/feedback', {
        params: { path: { message_id: v.messageId } },
        body: { feedback: v.feedback },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'messages'] }),
  });
}

export function usePendingAction(id: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'action', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      call<PendingAction>(
        api.GET('/api/v1/chat/actions/{action_id}', {
          params: { path: { action_id: id! } },
          signal,
        }),
      ),
    retry: false,
  });
}

function useAct(path: 'confirm' | 'cancel') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; payloadHash?: string }) =>
      path === 'confirm'
        ? call<PendingAction>(
            api.POST('/api/v1/chat/actions/{action_id}/confirm', {
              params: { path: { action_id: v.id } },
              body: { payload_hash: v.payloadHash ?? '' },
            }),
          )
        : call<PendingAction>(
            api.POST('/api/v1/chat/actions/{action_id}/cancel', {
              params: { path: { action_id: v.id } },
            }),
          ),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: ['chat', 'action', v.id] });
      void qc.invalidateQueries({ queryKey: ['chat', 'messages'] });
      // an executed action may have changed files, shares, requests, tasks ...
      for (const k of [
        'children',
        'tree',
        'favorites',
        'folder',
        'document',
        'shares',
        'access-requests',
        'my-tasks',
        'trash',
      ])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
export const useConfirmAction = () => useAct('confirm');
export const useCancelAction = () => useAct('cancel');

const RUN_ERRORS: Record<string, string> = {
  rate_limited: 'The assistant is busy right now. Try again in a moment.',
  model_unavailable: 'The assistant is temporarily unavailable.',
  budget_exceeded: 'The assistant stopped before finishing. Try a simpler request.',
  step_limit: 'The assistant stopped before finishing. Try a simpler request.',
  provider_error: 'The assistant could not complete that. Try again.',
};
/** User-safe text for a failed run; never leaks internals. */
export function runErrorText(code: string | null | undefined): string {
  return (code && RUN_ERRORS[code]) || 'The assistant could not complete that request. Try again.';
}

/** Friendly text for confirm failures (409 codes, 403/404 re-authorization). */
export function actionErrorText(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'action_expired') return 'This action expired. Ask again for a fresh preview.';
    if (e.code === 'action_stale')
      return 'Things changed since this preview was created. Ask again for a fresh preview.';
    if (e.code === 'action_mismatch')
      return 'This confirmation does not match the previewed action. Ask again for a fresh preview.';
    if (e.code === 'action_not_pending') return 'This action was already handled.';
    if (e.status === 403 || e.status === 404)
      return 'You no longer have permission to do this, or the item changed. Ask again for a fresh preview.';
    if (e.status === 429) return 'Too many requests. Wait a moment and try again.';
  }
  return 'That action could not be completed. Ask again for a fresh preview.';
}
