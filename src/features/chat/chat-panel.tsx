'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Check,
  Copy,
  FileText,
  HelpCircle,
  Loader2,
  MessageSquarePlus,
  Minimize2,
  PanelLeft,
  RotateCcw,
  Search,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { isAdminRole } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Blocks } from './blocks';
import { ConversationList } from './conversation-list';
import { Welcome } from './welcome';
import { MessageText } from './format';
import {
  isRunSettled,
  runErrorText,
  useCancelRun,
  useChatStatus,
  useConversations,
  useCreateConversation,
  useFeedback,
  useMessages,
  useRun,
  useSendMessage,
  type ChatMessage,
} from './hooks';

export interface ChatContext {
  documentId?: string;
  folderId?: string;
  label?: string;
}

function Bubble({
  m,
  onCopy,
  onFeedback,
  onAskAgain,
}: {
  m: ChatMessage;
  onCopy: (m: ChatMessage) => void;
  onFeedback: (m: ChatMessage, f: 'up' | 'down' | null) => void;
  onAskAgain: () => void;
}) {
  const mine = m.role === 'user';
  return (
    <li
      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
      data-testid="chat-message"
      data-role={m.role}
    >
      <div
        className={cn(
          'max-w-[92%] rounded-lg px-3 py-2 text-[13px]',
          mine ? 'bg-accent text-accent-fg' : 'border border-line bg-surface',
        )}
      >
        <span className="sr-only">{mine ? 'You said' : 'Assistant said'}:</span>
        {m.redacted ? (
          <p className="italic text-muted" data-testid="redacted-notice">
            Part of this answer is no longer shown because your access to one of its sources
            changed.
          </p>
        ) : (
          <MessageText text={m.content} citations={m.citations ?? []} />
        )}
        {!m.redacted && !mine && (
          <Blocks
            blocks={m.blocks as Record<string, unknown>[] | undefined}
            onAskAgain={onAskAgain}
          />
        )}
        {!mine && !m.redacted && (
          <div className="mt-1.5 flex items-center gap-0.5 text-muted">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Copy response"
              onClick={() => onCopy(m)}
            >
              <Copy />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Good response"
              aria-pressed={m.feedback === 'up'}
              onClick={() => onFeedback(m, m.feedback === 'up' ? null : 'up')}
            >
              <ThumbsUp className={cn(m.feedback === 'up' && 'fill-current')} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Bad response"
              aria-pressed={m.feedback === 'down'}
              onClick={() => onFeedback(m, m.feedback === 'down' ? null : 'down')}
            >
              <ThumbsDown className={cn(m.feedback === 'down' && 'fill-current')} />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The assistant. Runs are asynchronous: after sending we poll the run (~700 ms) and show its current step;
 * we never fake token streaming. Message content lives only in the React Query cache (cleared on sign-out) and
 * is never written to localStorage / sessionStorage.
 */
export function ChatPanel({
  context,
  onClearContext,
  variant = 'page',
  initialConversationId = null,
  onActiveChange,
  onMinimize,
}: {
  context?: ChatContext | null;
  onClearContext?: () => void;
  variant?: 'page' | 'drawer';
  initialConversationId?: string | null;
  /** Reports the open conversation (null = new) so the host can hand it to the full-screen view. */
  onActiveChange?: (id: string | null) => void;
  /** Full-page view only: shrink back to the side drawer on the page the user came from. */
  onMinimize?: (activeId: string | null) => void;
}) {
  const qc = useQueryClient();
  const status = useChatStatus();
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  useEffect(() => onActiveChange?.(activeId), [activeId, onActiveChange]);
  const [showList, setShowList] = useState(variant === 'page');
  const [mobileList, setMobileList] = useState(false);
  const { data: me } = useMe();
  const [draft, setDraft] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [note, setNote] = useState<null | { kind: 'failed' | 'cancelled'; code?: string | null }>(
    null,
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const handled = useRef(new Set<string>());
  const log = useRef<HTMLDivElement>(null);

  const messages = useMessages(activeId ?? undefined);
  const create = useCreateConversation();
  const sendM = useSendMessage();
  const run = useRun(runId ?? undefined);
  const cancel = useCancelRun();
  const feedback = useFeedback();

  const items = messages.data?.items ?? [];
  const convTitle = useConversations(false).data?.items.find((c) => c.id === activeId)?.title;

  // Resume a run that is still active when a conversation is opened (last message is the user's).
  useEffect(() => {
    const last = items[items.length - 1];
    if (last?.role === 'user' && last.run_id && !runId && !handled.current.has(last.run_id))
      setRunId(last.run_id);
  }, [items, runId]);

  // React when a run settles: reload messages, surface failure / cancellation.
  useEffect(() => {
    const r = run.data;
    if (!r || !isRunSettled(r.status) || handled.current.has(r.id)) return;
    handled.current.add(r.id);
    /* eslint-disable react-hooks/set-state-in-effect -- reacting to a server-side run settling */
    void qc.invalidateQueries({ queryKey: ['chat', 'messages', r.conversation_id] });
    void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    if (r.status === 'failed') setNote({ kind: 'failed', code: r.error_code });
    else if (r.status === 'cancelled') setNote({ kind: 'cancelled' });
    setPendingUser(null);
    setRunId(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [run.data, qc]);

  // Keep the newest message in view.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [items.length, runId, pendingUser, note]);

  const busy =
    sendM.isPending ||
    create.isPending ||
    (!!runId && !(run.data && isRunSettled(run.data.status)));

  const submit = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setSendError(null);
      setNote(null);
      try {
        let id = activeId;
        if (!id) {
          const c = await create.mutateAsync({
            title: null,
            context_document_id: context?.documentId ?? null,
            context_folder_id: context?.folderId ?? null,
          });
          id = c.id;
          setActiveId(id);
        }
        setPendingUser(content);
        setDraft('');
        const r = await sendM.mutateAsync({
          conversationId: id,
          body: {
            content,
            context_document_id: context?.documentId ?? null,
            context_folder_id: context?.folderId ?? null,
            scope: 'workspace',
          },
        });
        qc.setQueryData(
          ['chat', 'messages', id],
          (
            old: { items: ChatMessage[]; total: number; limit: number; offset: number } | undefined,
          ) =>
            old
              ? { ...old, items: [...old.items, r.message], total: old.total + 1 }
              : { items: [r.message], total: 1, limit: 200, offset: 0 },
        );
        setPendingUser(null);
        setRunId(r.run.id);
      } catch (e) {
        setPendingUser(null);
        setDraft(content);
        setSendError(
          isApiError(e) && e.code === 'run_in_progress'
            ? 'The assistant is still working on your previous message. Wait for it or press Stop.'
            : isApiError(e) && e.status === 429
              ? 'Too many messages. Wait a moment and try again.'
              : isApiError(e) && e.status === 401
                ? 'Your session expired. Sign in again.'
                : isApiError(e) && e.status >= 500
                  ? 'The assistant is unavailable right now. Try again shortly.'
                  : friendlyMessage(e),
        );
      }
    },
    [activeId, busy, context, create, qc, sendM],
  );

  const lastUser = [...items].reverse().find((m) => m.role === 'user');
  const retry = () => lastUser && void submit(lastUser.content);
  const step = run.data?.current_step ?? (sendM.isPending ? 'Sending' : 'Working');

  if (status.isPending)
    return (
      <div className="p-4" role="status" aria-label="Loading assistant">
        <Skeleton className="h-24" />
      </div>
    );
  if (status.isError || !status.data.enabled)
    return (
      <EmptyState
        icon={Bot}
        title="The assistant is not available"
        description={
          status.isError
            ? 'It could not be reached. Try again later.'
            : 'It is turned off for this service. Ask an administrator.'
        }
      />
    );

  return (
    <div
      className={cn('relative flex min-h-0 flex-1', variant === 'page' ? 'gap-0' : 'flex-col')}
      data-testid="chat-panel"
    >
      {variant === 'page' ? (
        <>
          {showList && (
            <ConversationList
              activeId={activeId}
              onSelect={(id) => (setActiveId(id), setRunId(null), setNote(null))}
              onNew={() => (setActiveId(null), setRunId(null), setNote(null))}
              className="hidden w-72 shrink-0 border-r border-line bg-surface-2/40 md:flex"
            />
          )}
          {mobileList && (
            <div className="absolute inset-0 z-30 flex md:hidden" data-testid="chat-mobile-list">
              <ConversationList
                activeId={activeId}
                onSelect={(id) => (
                  setActiveId(id),
                  setMobileList(false),
                  setRunId(null),
                  setNote(null)
                )}
                onNew={() => (
                  setActiveId(null),
                  setMobileList(false),
                  setRunId(null),
                  setNote(null)
                )}
                className="w-72 max-w-[85%] border-r border-line bg-surface shadow-xl"
              />
              <button
                type="button"
                aria-label="Close conversations"
                className="flex-1 bg-black/40"
                onClick={() => setMobileList(false)}
              />
            </div>
          )}
        </>
      ) : (
        showList && (
          // Compact window: the list takes over the chat area (with a way back) instead of being
          // squeezed above the messages.
          <div
            className="absolute inset-0 z-20 flex flex-col bg-surface"
            data-testid="chat-list-view"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
              <Button size="sm" variant="ghost" onClick={() => setShowList(false)}>
                <ArrowLeft /> Back to chat
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => (
                  setActiveId(null),
                  setShowList(false),
                  setRunId(null),
                  setNote(null)
                )}
              >
                <MessageSquarePlus /> New
              </Button>
            </div>
            <ConversationList
              compact
              className="flex-1"
              activeId={activeId}
              onSelect={(id) => (
                setActiveId(id),
                setShowList(false),
                setRunId(null),
                setNote(null)
              )}
              onNew={() => (setActiveId(null), setShowList(false), setRunId(null), setNote(null))}
            />
          </div>
        )
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {variant === 'page' && (
          <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
            <Button
              size="icon-sm"
              variant="ghost"
              className="md:hidden"
              aria-label="Open conversations"
              onClick={() => setMobileList(true)}
            >
              <PanelLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden md:inline-flex"
              aria-label={showList ? 'Hide conversations' : 'Show conversations'}
              aria-expanded={showList}
              onClick={() => setShowList((v) => !v)}
            >
              <PanelLeft />
            </Button>
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {(activeId && convTitle) || 'New conversation'}
            </p>
            {onMinimize && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onMinimize(activeId)}
                aria-label="Minimize assistant to side panel"
                title="Back to side panel"
                data-testid="chat-minimize"
              >
                <Minimize2 /> Minimize
              </Button>
            )}
          </div>
        )}
        {variant === 'drawer' && (
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowList((s) => !s)}
              aria-expanded={showList}
            >
              Conversations
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (setActiveId(null), setRunId(null), setNote(null))}
            >
              <MessageSquarePlus /> New
            </Button>
          </div>
        )}
        <div
          ref={log}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3"
        >
          {!activeId && items.length === 0 && !pendingUser ? (
            <Welcome
              name={me?.display_name}
              admin={isAdminRole(me?.role)}
              disabled={busy}
              onAsk={(t) => void submit(t)}
            />
          ) : messages.isPending && activeId ? (
            <Skeleton className="h-24" />
          ) : messages.isError ? (
            <div role="alert" className="grid gap-2 p-3 text-center text-[13px]">
              <p className="text-danger">This conversation could not be loaded.</p>
              <Button size="sm" onClick={() => messages.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <ul className="grid gap-3" aria-label="Messages">
              {items.map((m) => (
                <Bubble
                  key={m.id}
                  m={m}
                  onCopy={(x) =>
                    navigator.clipboard
                      ?.writeText(x.content)
                      .then(() => toast.success('Copied'))
                      .catch(() => toast.error('Could not copy'))
                  }
                  onFeedback={(x, f) =>
                    feedback.mutate(
                      { messageId: x.id, feedback: f },
                      { onError: (e) => toast.error(friendlyMessage(e)) },
                    )
                  }
                  onAskAgain={() => lastUser && setDraft(lastUser.content)}
                />
              ))}
              {pendingUser && (
                <li className="flex justify-end">
                  <div className="max-w-[92%] rounded-lg bg-accent px-3 py-2 text-[13px] text-accent-fg opacity-80">
                    {pendingUser}
                  </div>
                </li>
              )}
            </ul>
          )}
          {busy && (
            <p
              className="mt-3 flex items-center gap-2 text-[13px] text-muted"
              role="status"
              aria-live="polite"
              data-testid="chat-activity"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>{step}…</span>
            </p>
          )}
          {note && (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn"
              data-testid="chat-note"
            >
              {note.kind === 'failed' ? runErrorText(note.code) : 'You stopped this response.'}
              <Button size="sm" onClick={retry}>
                <RotateCcw /> Retry
              </Button>
            </div>
          )}
        </div>

        {sendError && (
          <p
            role="alert"
            className="mx-3 mb-1 rounded-md bg-danger-soft px-3 py-1.5 text-xs text-danger"
            data-testid="chat-send-error"
          >
            {sendError}
          </p>
        )}
        {context && (
          <p
            className="mx-3 mb-1 flex items-center gap-1 text-xs text-muted"
            data-testid="chat-context"
          >
            Asking about:{' '}
            <strong className="truncate">
              {context.label ?? (context.documentId ? 'this file' : 'this folder')}
            </strong>
            {onClearContext && (
              <button
                type="button"
                aria-label="Stop using this item as context"
                className="rounded-sm hover:text-text"
                onClick={onClearContext}
              >
                <X className="size-3" />
              </button>
            )}
          </p>
        )}
        <div className="px-3 pb-2 pt-2 sm:px-4">
          <form
            className="rounded-2xl border border-line-strong bg-surface shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(draft);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message the assistant
            </label>
            <textarea
              id="chat-input"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit(draft);
                }
              }}
              placeholder="Ask a question or tell me what to do…"
              className="block max-h-40 min-h-14 w-full resize-none bg-transparent px-4 pt-3 text-[14px] outline-none placeholder:text-faint"
              data-testid="chat-input"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
              <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Prompt starters">
                {(
                  [
                    [Search, 'Search', 'Find documents about '],
                    [FileText, 'Summarize', 'Summarize '],
                    [BarChart3, 'Analyze', 'Compare and analyze '],
                    [HelpCircle, 'Help', 'What can you help me with?'],
                  ] as const
                ).map(([Icon, label, text]) => (
                  <button
                    key={label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDraft(text);
                      document.getElementById('chat-input')?.focus();
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              {busy && runId ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 rounded-xl"
                  onClick={() =>
                    cancel.mutate(runId, { onError: (e) => toast.error(friendlyMessage(e)) })
                  }
                  data-testid="chat-stop"
                >
                  <Square /> Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  size="icon"
                  className="shrink-0 rounded-xl"
                  aria-label="Send message"
                  disabled={!draft.trim() || busy}
                  data-testid="chat-send"
                >
                  <Send />
                </Button>
              )}
            </div>
          </form>
          <p className="mt-2 text-center text-[11px] text-faint">
            <Check className="mr-1 inline size-3" aria-hidden />
            Answers can be wrong. Check the cited sources before relying on them.
          </p>
        </div>
      </div>
    </div>
  );
}
