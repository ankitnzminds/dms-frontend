import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BulkDeleteDialog } from '@/components/file-browser/bulk-delete-dialog';
import { API, server } from '../msw-server';
import { apiError, renderApp } from './test-utils';

describe('BulkDeleteDialog', () => {
  it('asks for confirmation first, then reports a per-item result', async () => {
    const calls: string[] = [];
    server.use(
      http.delete(`${API}/documents/:id`, ({ params }) => {
        calls.push(String(params.id));
        return params.id === 'bad'
          ? HttpResponse.json(apiError(403, 'forbidden'), { status: 403 })
          : new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${API}/folders/:id`, ({ params }) => {
        calls.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onFinished = vi.fn();
    renderApp(
      <BulkDeleteDialog
        open
        onOpenChange={() => {}}
        onFinished={onFinished}
        items={[
          { kind: 'document', id: 'ok', name: 'a.pdf' },
          { kind: 'document', id: 'bad', name: 'b.pdf' },
          { kind: 'folder', id: 'fold', name: 'Folder' },
        ]}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Move 3 items to trash?' })).toBeInTheDocument();
    expect(calls).toEqual([]); // nothing deleted before confirmation

    await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 3 moved to trash; 1 failed.'));
    expect(calls).toEqual(['ok', 'bad', 'fold']);
    expect(screen.getByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledWith(['bad']);
  });
});
