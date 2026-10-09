'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Blocks } from './blocks';
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
  usePatchConversation,
  useRun,
  useSendMessage,
  type ChatMessage,
  type Conversation,
} from './hooks';

export interface ChatContext {
  documentId?: string;
  folderId?: string;
  label?: string;
}

const SUGGESTIONS = [
  'Find documents about contracts',
  'What is waiting for my approval?',
  'What can you help me with?',
];

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

function RenameDialog({ c, onClose }: { c: Conversation; onClose: () => void }) {
  const patch = usePatchConversation();
  const [title, setTitle] = useState(c.title);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Rename conversation">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            patch.mutate(
              { id: c.id, body: { title: title.trim() } },
              { onSuccess: onClose, onError: (er) => toast.error(friendlyMessage(er)) },
            );
          }}
        >
          <DialogBody>
            <Field id="conv-title" label="Title">
              {(p) => (
                <Input {...p} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!title.trim() || patch.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConversationList({
  activeId,
  onSelect,
  onNew,
  className,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
}) {
  const [archived, setArchived] = useState(false);
  const q = useConversations(archived);
  const patch = usePatchConversation();
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  return (
    <nav aria-label="Conversations" className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center gap-1 p-2">
        <Button
          size="sm"
          variant="primary"
          className="flex-1"
          onClick={onNew}
          data-testid="chat-new"
        >
          <MessageSquarePlus /> New chat
        </Button>
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {q.isPending ? (
          <li className="p-2">
            <Skeleton className="h-8" />
          </li>
        ) : q.isError ? (
          <li className="p-2 text-xs text-danger" role="alert">
            Could not load conversations.{' '}
            <button className="underline" onClick={() => q.refetch()}>
              Retry
            </button>
          </li>
        ) : q.data.items.length === 0 ? (
          <li className="p-3 text-xs text-muted">No conversations yet.</li>
        ) : (
          q.data.items.map((c) => (
            <li
              key={c.id}
              className={cn(
                'group flex items-center rounded-md',
                activeId === c.id ? 'bg-accent-soft' : 'hover:bg-surface-2',
              )}
              data-testid="chat-conversation"
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                onClick={() => onSelect(c.id)}
                aria-current={activeId === c.id ? 'true' : undefined}
              >
                <span className="block truncate text-[13px] font-medium">
                  {c.title || 'New conversation'}
                </span>
                <span className="block text-xs text-muted">
                  {formatRelative(c.updated_at)}
                  {c.status === 'archived' ? ' · archived' : ''}
                </span>
              </button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Rename ${c.title}`}
                onClick={() => setRenaming(c)}
              >
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`${c.status === 'archived' ? 'Restore' : 'Archive'} ${c.title}`}
                onClick={() =>
                  patch.mutate(
                    { id: c.id, body: { status: c.status === 'archived' ? 'active' : 'archived' } },
                    { onError: (e) => toast.error(friendlyMessage(e)) },
                  )
                }
              >
                {c.status === 'archived' ? <ArchiveRestore /> : <Archive />}
              </Button>
            </li>
          ))
        )}
      </ul>
      <label className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-muted">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{' '}
        Show archived
      </label>
      {renaming && <RenameDialog c={renaming} onClose={() => setRenaming(null)} />}
    </nav>
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
}: {
  context?: ChatContext | null;
  onClearContext?: () => void;
  variant?: 'page' | 'drawer';
  initialConversationId?: string | null;
}) {
  const qc = useQueryClient();
  const status = useChatStatus();
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [showList, setShowList] = useState(variant === 'page');
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
      className={cn('flex min-h-0 flex-1', variant === 'page' ? 'gap-0' : 'flex-col')}
      data-testid="chat-panel"
    >
      {variant === 'page' ? (
        <ConversationList
          activeId={activeId}
          onSelect={(id) => (setActiveId(id), setRunId(null), setNote(null))}
          onNew={() => (setActiveId(null), setRunId(null), setNote(null))}
          className="hidden w-64 shrink-0 border-r border-line md:flex"
        />
      ) : (
        showList && (
          <div className="max-h-56 border-b border-line">
            <ConversationList
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
            <div className="grid gap-3 py-6 text-center">
              <Bot className="mx-auto size-8 text-muted" aria-hidden />
              <p className="text-sm font-semibold">Ask about your documents</p>
              <p className="mx-auto max-w-sm text-[13px] text-muted">
                I only see what you are allowed to see, and I always ask before changing anything.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} size="sm" onClick={() => setDraft(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
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
        <form
          className="flex items-end gap-2 border-t border-line p-3"
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
            placeholder="Ask a question or tell me what to do"
            className="min-h-10 flex-1 resize-none rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] placeholder:text-faint"
            data-testid="chat-input"
          />
          {busy && runId ? (
            <Button
              type="button"
              variant="secondary"
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
              disabled={!draft.trim() || busy}
              data-testid="chat-send"
            >
              <Send /> Send
            </Button>
          )}
        </form>
        <p className="px-3 pb-2 text-[11px] text-faint">
          <Check className="mr-1 inline size-3" aria-hidden />
          Answers can be wrong. Check the cited sources before relying on them.
        </p>
      </div>
    </div>
  );
}
