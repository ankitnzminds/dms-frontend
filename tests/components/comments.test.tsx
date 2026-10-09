import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { CommentThread, Composer } from '@/components/comments/comment-thread';
import { threadify } from '@/features/comments/hooks';
import { server, API } from '../msw-server';
import { renderApp } from './test-utils';

vi.mock('@/features/auth/session', () => ({
  useMe: () => ({ data: { user_id: 'u-me', display_name: 'Me Myself', email: 'me@acme.test' } }),
}));

const author = { id: 'u-a', display_name: 'Alice Owner', email: 'alice@acme.test' };
const mk = (over: Record<string, unknown>) => ({
  id: 'c1',
  resource_id: 'doc-1',
  resource_type: 'document',
  parent_id: null,
  author,
  body: 'First!',
  created_at: '2026-01-01T10:00:00Z',
  edited_at: null,
  deleted: false,
  can_edit: false,
  can_delete: false,
  ...over,
});
const list = (items: unknown[], can_comment = true) => ({ items, total: items.length, can_comment });
const target = { kind: 'document' as const, id: 'doc-1' };

describe('threadify', () => {
  it('nests replies under their parent, oldest first', () => {
    const t = threadify([
      mk({ id: 'r', parent_id: 'a', created_at: '2026-01-01T12:00:00Z' }),
      mk({ id: 'b', created_at: '2026-01-02T10:00:00Z' }),
      mk({ id: 'a' }),
    ] as never);
    expect(t.map((x) => x.root.id)).toEqual(['a', 'b']);
    expect(t[0]!.replies.map((r) => r.id)).toEqual(['r']);
  });
});

describe('Composer', () => {
  it('sends on Ctrl+Enter, trims, and clears; blank text cannot be sent', async () => {
    const onSubmit = vi.fn();
    renderApp(<Composer label="New comment" onSubmit={onSubmit} />);
    const box = screen.getByLabelText('New comment');
    expect(screen.getByTestId('comment-send')).toBeDisabled();
    await userEvent.type(box, '   hello  ');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(box).toHaveValue('');
  });

  it('is disabled and explains why when commenting is not allowed', () => {
    renderApp(<Composer label="New comment" disabled disabledReason="No permission" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('New comment')).toBeDisabled();
    expect(screen.getByLabelText('New comment')).toHaveAttribute('placeholder', 'No permission');
  });
});

describe('CommentThread', () => {
  it('shows a view-only notice and a disabled composer when can_comment is false', async () => {
    server.use(http.get(`${API}/documents/doc-1/comments`, () => HttpResponse.json(list([mk({})], false))));
    renderApp(<CommentThread target={target} />);
    expect(await screen.findByText('First!')).toBeInTheDocument();
    expect(screen.getByTestId('cannot-comment')).toHaveTextContent(/do not have permission to comment/);
    expect(screen.getByLabelText('New comment')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Reply to/ })).toBeNull();
  });

  it('adds a comment optimistically and rolls it back with an error message on failure', async () => {
    server.use(
      http.get(`${API}/documents/doc-1/comments`, () => HttpResponse.json(list([]))),
      http.post(`${API}/documents/doc-1/comments`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ error: { code: 'forbidden', message: 'no', request_id: 'r', details: null } }, { status: 403 });
      }),
    );
    renderApp(<CommentThread target={target} />);
    await screen.findByText('No comments yet');
    await userEvent.type(screen.getByLabelText('New comment'), 'Looks good');
    await userEvent.click(screen.getByTestId('comment-send'));
    expect(await screen.findByText('Looks good')).toBeInTheDocument(); // optimistic
    await waitFor(() => expect(screen.queryByText('Looks good')).toBeNull()); // rolled back
    expect(await screen.findByTestId('comment-error')).toHaveTextContent(/permission/);
  });

  it('offers edit and delete only when the server says so, and soft-deletes with a confirmation', async () => {
    let deleted = false;
    const rows = () => [
      mk({ id: 'mine', body: deleted ? '' : 'my note', deleted, can_edit: !deleted, can_delete: !deleted }),
      mk({ id: 'theirs', body: 'their note', created_at: '2026-01-01T11:00:00Z' }),
    ];
    server.use(
      http.get(`${API}/documents/doc-1/comments`, () =>
        HttpResponse.json(list(rows())),
      ),
      http.delete(`${API}/comments/mine`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<CommentThread target={target} />);
    const mine = (await screen.findByText('my note')).closest('[data-testid=comment]') as HTMLElement;
    const theirs = screen.getByText('their note').closest('[data-testid=comment]') as HTMLElement;
    expect(within(theirs).queryByRole('button', { name: /Comment actions/ })).toBeNull();
    await userEvent.click(within(mine).getByRole('button', { name: /Comment actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findAllByText('This comment was deleted.')).not.toHaveLength(0);
  });

  it('renders comment text as plain text, never HTML', async () => {
    server.use(
      http.get(`${API}/documents/doc-1/comments`, () =>
        HttpResponse.json(list([mk({ body: '<img src=x onerror=alert(1)> **bold**' })])),
      ),
    );
    const { container } = renderApp(<CommentThread target={target} />);
    expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
