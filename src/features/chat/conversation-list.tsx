'use client';

import {
  Archive,
  ArchiveRestore,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { friendlyMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useConversations, usePatchConversation, type Conversation } from './hooks';

const GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const;
type Group = (typeof GROUPS)[number];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which recency bucket a timestamp falls in, by calendar day. */
export function groupOf(iso: string, now = new Date()): Group {
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Previous 7 days';
  if (days <= 30) return 'Previous 30 days';
  return 'Older';
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return groupOf(iso) === 'Today'
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
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

/**
 * Conversation history: search, recency groups, rename / archive menu. Conversations come from the server
 * (scoped to the signed-in user and organization); the list shows the most recent 50, newest activity first.
 * Search filters the loaded titles. There is no delete: the service keeps conversations (archive hides them).
 */
export function ConversationList({
  activeId,
  onSelect,
  onNew,
  className,
  compact = false,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
  /** Small floating window: no branding block or big button, just search and the list. */
  compact?: boolean;
}) {
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState('');
  const q = useConversations(archived);
  const patch = usePatchConversation();
  const [renaming, setRenaming] = useState<Conversation | null>(null);

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = (q.data?.items ?? [])
      .filter((c) => !needle || (c.title || 'New conversation').toLowerCase().includes(needle))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const map = new Map<Group, Conversation[]>();
    for (const c of items) {
      const g = groupOf(c.updated_at);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return GROUPS.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [q.data, search]);

  return (
    <nav aria-label="Conversations" className={cn('flex min-h-0 flex-col', className)}>
      {!compact && (
        <div className="flex items-start gap-3 p-4 pb-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
              DMS Assistant
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-soft-fg">
                Beta
              </span>
            </p>
            <p className="text-xs text-muted">Ask about your documents, policies and workflows</p>
          </div>
        </div>
      )}
      <div className={cn('grid gap-2 px-4 pb-3', compact && 'pt-3')}>
        {!compact && (
          <Button variant="primary" onClick={onNew} data-testid="chat-new">
            <MessageSquarePlus /> New Conversation
          </Button>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search conversations"
            placeholder="Search conversations…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {q.isPending ? (
          <div className="grid gap-2 p-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : q.isError ? (
          <p className="p-3 text-xs text-danger" role="alert">
            Could not load conversations.{' '}
            <button className="underline" onClick={() => q.refetch()}>
              Retry
            </button>
          </p>
        ) : grouped.length === 0 ? (
          <p className="p-3 text-xs text-muted">
            {search.trim() ? 'No conversations match.' : 'No conversations yet.'}
          </p>
        ) : (
          grouped.map(([g, list]) => (
            <section key={g} aria-label={g} className="mb-2">
              <h3 className="px-2 pb-1 pt-2 text-xs font-medium text-muted">{g}</h3>
              <ul>
                {list.map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      'group relative flex items-center rounded-lg',
                      activeId === c.id
                        ? 'bg-accent-soft'
                        : 'hover:bg-surface-2 focus-within:bg-surface-2',
                    )}
                    data-testid="chat-conversation"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left"
                      onClick={() => onSelect(c.id)}
                      aria-current={activeId === c.id ? 'true' : undefined}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent">
                        <MessageSquare className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-medium">
                            {c.title || 'New conversation'}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted group-hover:hidden group-focus-within:hidden">
                            {timeLabel(c.updated_at)}
                          </span>
                        </span>
                        {c.status === 'archived' && (
                          <span className="block text-xs text-muted">Archived</span>
                        )}
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="mr-1 hidden group-hover:inline-flex group-focus-within:inline-flex"
                          aria-label={`Actions for ${c.title || 'conversation'}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => setRenaming(c)}>
                          <Pencil /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            patch.mutate(
                              {
                                id: c.id,
                                body: { status: c.status === 'archived' ? 'active' : 'archived' },
                              },
                              { onError: (e) => toast.error(friendlyMessage(e)) },
                            )
                          }
                        >
                          {c.status === 'archived' ? <ArchiveRestore /> : <Archive />}
                          {c.status === 'archived' ? 'Restore' : 'Archive'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <label className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{' '}
        Show archived
      </label>
      {renaming && <RenameDialog c={renaming} onClose={() => setRenaming(null)} />}
    </nav>
  );
}
