'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, isApiError, type Schemas } from '@/lib/api-client';

export type Comment = Schemas['CommentOut'];
export type CommentList = Schemas['CommentList'];
export type CommentTarget = { kind: 'document' | 'folder'; id: string };

export const MAX_COMMENT = 4000;
const key = (t: CommentTarget) => ['comments', t.kind, t.id] as const;

export function useComments(t: CommentTarget | null) {
  return useQuery({
    queryKey: t ? key(t) : ['comments', 'none'],
    enabled: !!t,
    queryFn: ({ signal }) =>
      t!.kind === 'document'
        ? call<CommentList>(
            api.GET('/api/v1/documents/{document_id}/comments', {
              params: { path: { document_id: t!.id }, query: { limit: 200, offset: 0 } },
              signal,
            }),
          )
        : call<CommentList>(
            api.GET('/api/v1/folders/{folder_id}/comments', {
              params: { path: { folder_id: t!.id }, query: { limit: 200, offset: 0 } },
              signal,
            }),
          ),
    refetchInterval: 20_000,
  });
}

/** Number of non-deleted comments (for the tab badge). */
export const liveCount = (l: CommentList | undefined) =>
  l ? l.items.filter((c) => !c.deleted).length : 0;

type Ctx = { previous?: CommentList };

export function useAddComment(
  t: CommentTarget,
  me: { id: string; name: string; email: string } | null,
) {
  const qc = useQueryClient();
  return useMutation<Comment, unknown, { body: string; parent_id?: string | null }, Ctx>({
    mutationFn: (v) =>
      t.kind === 'document'
        ? call<Comment>(
            api.POST('/api/v1/documents/{document_id}/comments', {
              params: { path: { document_id: t.id } },
              body: { body: v.body, parent_id: v.parent_id ?? null },
            }),
          )
        : call<Comment>(
            api.POST('/api/v1/folders/{folder_id}/comments', {
              params: { path: { folder_id: t.id } },
              body: { body: v.body, parent_id: v.parent_id ?? null },
            }),
          ),
    // Optimistic: show the comment immediately, roll back on error.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(t) });
      const previous = qc.getQueryData<CommentList>(key(t));
      if (previous) {
        const temp: Comment = {
          id: `tmp-${Date.now()}`,
          resource_id: t.id,
          resource_type: t.kind,
          parent_id: v.parent_id ?? null,
          author: me ? { id: me.id, display_name: me.name, email: me.email } : null,
          body: v.body,
          created_at: new Date().toISOString(),
          edited_at: null,
          deleted: false,
          can_edit: false,
          can_delete: false,
        };
        qc.setQueryData<CommentList>(key(t), {
          ...previous,
          items: [...previous.items, temp],
          total: previous.total + 1,
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key(t), ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key(t) }),
  });
}

export function useEditComment(t: CommentTarget) {
  const qc = useQueryClient();
  return useMutation<Comment, unknown, { id: string; body: string }, Ctx>({
    mutationFn: (v) =>
      call<Comment>(
        api.PATCH('/api/v1/comments/{comment_id}', {
          params: { path: { comment_id: v.id } },
          body: { body: v.body },
        }),
      ),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(t) });
      const previous = qc.getQueryData<CommentList>(key(t));
      if (previous)
        qc.setQueryData<CommentList>(key(t), {
          ...previous,
          items: previous.items.map((c) =>
            c.id === v.id ? { ...c, body: v.body, edited_at: new Date().toISOString() } : c,
          ),
        });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key(t), ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key(t) }),
  });
}

export function useDeleteComment(t: CommentTarget) {
  const qc = useQueryClient();
  return useMutation<void, unknown, string, Ctx>({
    mutationFn: async (id) => {
      await api.DELETE('/api/v1/comments/{comment_id}', { params: { path: { comment_id: id } } });
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key(t) });
      const previous = qc.getQueryData<CommentList>(key(t));
      if (previous)
        qc.setQueryData<CommentList>(key(t), {
          ...previous,
          items: previous.items.map((c) =>
            c.id === id ? { ...c, body: '', deleted: true, can_edit: false, can_delete: false } : c,
          ),
        });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key(t), ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key(t) }),
  });
}

export function commentErrorText(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'comment_deleted')
      return 'That comment was deleted, so it cannot be changed or replied to.';
    if (e.status === 403) return 'You do not have permission to comment here.';
    if (e.status === 404) return 'This item was not found, or you do not have access.';
    if (e.status === 422) return `Comments must be between 1 and ${MAX_COMMENT} characters.`;
    if (e.status === 429) return 'Too many requests. Wait a moment and try again.';
  }
  return 'The comment could not be saved. Try again.';
}

/** Group a flat list into top-level comments with their (single level of) replies, oldest first. */
export function threadify(items: Comment[]): Array<{ root: Comment; replies: Comment[] }> {
  const byParent = new Map<string, Comment[]>();
  for (const c of items)
    if (c.parent_id) byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
  return items
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((root) => ({
      root,
      replies: (byParent.get(root.id) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
    }));
}
