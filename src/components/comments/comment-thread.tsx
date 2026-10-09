'use client';

import { MessageSquare, MoreHorizontal, Pencil, Reply, Send, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import {
  commentErrorText,
  liveCount,
  MAX_COMMENT,
  threadify,
  useAddComment,
  useComments,
  useDeleteComment,
  useEditComment,
  type Comment,
  type CommentTarget,
} from '@/features/comments/hooks';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-soft-fg">
      {initials || '?'}
    </span>
  );
}

/** Plain-text composer. Ctrl/Cmd+Enter sends. Disabled (with the reason) when the caller cannot comment. */
export function Composer({
  label,
  placeholder,
  disabled,
  disabledReason,
  pending,
  error,
  onSubmit,
  onCancel,
  autoFocus,
  initial = '',
  submitLabel = 'Comment',
}: {
  label: string;
  placeholder?: string;
  disabled?: boolean;
  disabledReason?: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  initial?: string;
  submitLabel?: string;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const tooLong = text.length > MAX_COMMENT;
  const send = () => {
    if (!trimmed || tooLong || disabled || pending) return;
    onSubmit(trimmed);
    setText('');
  };
  return (
    <div className="grid gap-1.5">
      <label htmlFor={`cmp-${label}`} className="sr-only">
        {label}
      </label>
      <textarea
        id={`cmp-${label}`}
        ref={ref}
        rows={2}
        autoFocus={autoFocus}
        value={text}
        disabled={disabled}
        aria-invalid={tooLong || !!error}
        placeholder={disabled ? (disabledReason ?? 'Commenting is not available') : (placeholder ?? 'Write a comment…')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          } else if (e.key === 'Escape' && onCancel) onCancel();
        }}
        className="w-full resize-y rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] placeholder:text-faint disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-80"
        data-testid="comment-input"
      />
      {error && (
        <p role="alert" className="text-xs text-danger" data-testid="comment-error">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span className={cn('text-xs', tooLong ? 'text-danger' : 'text-faint')} aria-live="polite">
          {text.length > MAX_COMMENT - 200 ? `${text.length}/${MAX_COMMENT}` : disabled ? '' : 'Ctrl+Enter to send'}
        </span>
        <span className="ml-auto flex gap-1.5">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={disabled || !trimmed || tooLong || pending} onClick={send} data-testid="comment-send">
            <Send /> {submitLabel}
          </Button>
        </span>
      </div>
    </div>
  );
}

function CommentItem({
  c,
  target,
  canReply,
  onReply,
  isReply,
}: {
  c: Comment;
  target: CommentTarget;
  canReply: boolean;
  onReply?: () => void;
  isReply?: boolean;
}) {
  const edit = useEditComment(target);
  const del = useDeleteComment(target);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = c.author?.display_name ?? c.author?.email ?? 'Someone';
  const pendingTemp = c.id.startsWith('tmp-');

  return (
    <li className={cn('flex gap-2.5', isReply && 'ml-9')} data-testid="comment" data-deleted={c.deleted || undefined} data-comment-id={c.id}>
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold">{c.deleted ? 'Deleted comment' : name}</span>
          <time dateTime={c.created_at} title={formatDateTime(c.created_at)} className="text-xs text-muted">
            {pendingTemp ? 'sending…' : formatRelative(c.created_at)}
          </time>
          {c.edited_at && !c.deleted && (
            <span className="text-xs text-faint" title={formatDateTime(c.edited_at)}>
              (edited)
            </span>
          )}
        </p>
        {c.deleted ? (
          <p className="text-[13px] italic text-muted">This comment was deleted.</p>
        ) : editing ? (
          <Composer
            label={`Edit comment by ${name}`}
            initial={c.body}
            autoFocus
            submitLabel="Save"
            pending={edit.isPending}
            error={error}
            onCancel={() => (setEditing(false), setError(null))}
            onSubmit={(body) =>
              edit.mutate(
                { id: c.id, body },
                { onSuccess: () => (setEditing(false), setError(null)), onError: (e) => setError(commentErrorText(e)) },
              )
            }
          />
        ) : (
          // Plain text only: React escapes it, whitespace/newlines are preserved. Never HTML.
          <p className="whitespace-pre-wrap break-words text-[13px]" data-testid="comment-body">
            {c.body}
          </p>
        )}
        {!c.deleted && !editing && (
          <div className="mt-0.5 flex items-center gap-1">
            {canReply && !isReply && onReply && (
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onReply} aria-label={`Reply to ${name}`}>
                <Reply /> Reply
              </Button>
            )}
            {(c.can_edit || c.can_delete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`Comment actions for ${name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {c.can_edit && (
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                  )}
                  {c.can_delete && (
                    <DropdownMenuItem destructive onSelect={() => setConfirmDel(true)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        <ConfirmDialog
          open={confirmDel}
          onOpenChange={setConfirmDel}
          title="Delete this comment?"
          description="The text is removed for everyone. Replies stay in the thread."
          confirmLabel="Delete comment"
          destructive
          pending={del.isPending}
          onConfirm={() =>
            del.mutate(c.id, {
              onSuccess: () => setConfirmDel(false),
              onError: (e) => {
                setConfirmDel(false);
                toast.error(commentErrorText(e));
              },
            })
          }
        />
      </div>
    </li>
  );
}

/** Threaded comments for a file or folder (one reply level), with a composer. */
export function CommentThread({ target }: { target: CommentTarget }) {
  const q = useComments(target);
  const { data: me } = useMe();
  const add = useAddComment(target, me ? { id: me.user_id, name: me.display_name ?? me.email, email: me.email } : null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  if (q.isPending)
    return (
      <div role="status" aria-label="Loading comments" className="grid gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-6" />;

  const { items, can_comment } = q.data;
  const threads = threadify(items);
  const reason = 'You can view comments but you do not have permission to comment on this item.';

  return (
    <section aria-label="Comments" className="grid gap-4" data-testid="comments">
      {threads.length === 0 ? (
        <div className="grid justify-items-center gap-1 py-6 text-center">
          <MessageSquare className="size-6 text-faint" aria-hidden />
          <p className="text-[13px] font-medium">No comments yet</p>
          <p className="text-xs text-muted">{can_comment ? 'Start the conversation about this item.' : 'Comments from people with access will appear here.'}</p>
        </div>
      ) : (
        <ul className="grid gap-4" aria-label="Comment thread">
          {threads.map(({ root, replies }) => (
            <li key={root.id} className="grid gap-3">
              <ul className="grid gap-3">
                <CommentItem c={root} target={target} canReply={can_comment && !root.deleted} onReply={() => (setReplyTo(replyTo === root.id ? null : root.id), setReplyError(null))} />
                {replies.map((r) => (
                  <CommentItem key={r.id} c={r} target={target} canReply={false} isReply />
                ))}
              </ul>
              {replyTo === root.id && (
                <div className="ml-9">
                  <Composer
                    label={`Reply to ${root.author?.display_name ?? 'comment'}`}
                    placeholder="Write a reply…"
                    autoFocus
                    submitLabel="Reply"
                    pending={add.isPending}
                    error={replyError}
                    onCancel={() => setReplyTo(null)}
                    onSubmit={(body) =>
                      add.mutate({ body, parent_id: root.id }, { onSuccess: () => setReplyTo(null), onError: (e) => setReplyError(commentErrorText(e)) })
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line pt-3">
        {!can_comment && (
          <p role="note" className="mb-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted" data-testid="cannot-comment">
            {reason}
          </p>
        )}
        <Composer
          label="New comment"
          disabled={!can_comment}
          disabledReason={reason}
          pending={add.isPending}
          error={error}
          onSubmit={(body) => (setError(null), add.mutate({ body }, { onError: (e) => setError(commentErrorText(e)) }))}
        />
      </div>
    </section>
  );
}

/** Small count badge for tab labels (non-deleted comments only; nothing when zero). */
export function CommentCount({ kind, id }: { kind: 'document' | 'folder'; id: string }) {
  const q = useComments({ kind, id });
  const n = liveCount(q.data);
  if (!n) return null;
  return (
    <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 text-[11px] text-accent-soft-fg" data-testid="comment-count">
      {n}
    </span>
  );
}
