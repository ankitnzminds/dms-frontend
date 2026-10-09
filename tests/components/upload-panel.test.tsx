import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadPanel } from '@/components/upload/upload-panel';
import { UploadEngine, type UploadDeps } from '@/features/upload/upload-engine';
import { ApiError } from '@/lib/api-client';
import { renderApp } from './test-utils';

const session = {
  id: 's1',
  folder_id: 'f',
  document_id: null,
  filename: 'a.pdf',
  declared_size: 3,
  content_type: 'x',
  state: 'initiated' as const,
  expires_at: '2026-01-01T00:00:00Z',
  upload_url: '/api/v1/uploads/s1/content',
};

function engineWith(over: Partial<UploadDeps> = {}) {
  return new UploadEngine({
    sha256: async () => 'h',
    initiate: async () => session,
    put: async () => {},
    finalize: async () => ({
      document_id: 'd1',
      version_id: 'v',
      version_number: 1,
      message: 'ok',
      status: 'pending_scan' as const,
    }),
    cancelSession: async () => {},
    ...over,
  });
}
const file = (n = 'report.pdf') => new File(['abc'], n, { type: 'application/pdf' });

describe('UploadPanel', () => {
  it('renders nothing when the queue is empty', () => {
    renderApp(<UploadPanel />, { engine: engineWith() });
    expect(screen.queryByRole('region', { name: 'Uploads' })).toBeNull();
  });

  it('shows real progress with an accessible progressbar and a polite live summary', async () => {
    let report!: (l: number, t: number) => void;
    let finish!: () => void;
    const engine = engineWith({
      put: ({ onProgress }) => {
        report = onProgress;
        return new Promise<void>((r) => (finish = r));
      },
    });
    renderApp(<UploadPanel />, { engine });
    act(() => void engine.enqueueFiles([file()], 'f'));
    await waitFor(() => expect(report).toBeDefined());
    act(() => report(30, 100));
    const bar = await screen.findByRole('progressbar', { name: /report\.pdf/ });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(screen.getByRole('status')).toHaveTextContent('Uploading 1 file');
    act(() => finish());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Uploads complete'));
    expect(screen.getByText(/scanning for malware/i)).toBeInTheDocument();
  });

  it('name_conflict: explains and offers rename-and-upload', async () => {
    const initiate = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: 'name_conflict', message: 'exists' }),
      )
      .mockResolvedValue(session);
    const engine = engineWith({ initiate });
    renderApp(<UploadPanel />, { engine });
    act(() => void engine.enqueueFiles([file()], 'f'));
    expect(
      await screen.findByText('A file with this name already exists here.'),
    ).toBeInTheDocument();
    const input = screen.getByLabelText('New file name');
    expect(input).toHaveValue('report (1).pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Upload as' }));
    await waitFor(() =>
      expect(screen.getByTestId('upload-row')).toHaveAttribute('data-status', 'done'),
    );
    expect(initiate.mock.calls[1]![0].item.name).toBe('report (1).pdf');
  });

  it('quota_exceeded: shows the storage message and a retry control', async () => {
    const engine = engineWith({
      initiate: async () => {
        throw new ApiError({ status: 409, code: 'quota_exceeded', message: 'q' });
      },
    });
    renderApp(<UploadPanel />, { engine });
    act(() => void engine.enqueueFiles([file()], 'f'));
    const row = await screen.findByTestId('upload-row');
    await waitFor(() => expect(row).toHaveAttribute('data-status', 'error'));
    expect(within(row).getByRole('alert')).toHaveTextContent(
      'Not enough storage left in your organization.',
    );
    expect(
      within(row).getByRole('button', { name: /Retry upload of report\.pdf/ }),
    ).toBeInTheDocument();
  });

  it('blocked file type and oversize have specific messages', async () => {
    const engine = engineWith({
      initiate: async () => {
        throw new ApiError({ status: 422, code: 'blocked_file_type', message: 'x' });
      },
    });
    renderApp(<UploadPanel />, { engine });
    act(() => void engine.enqueueFiles([file('x.exe')], 'f'));
    expect(await screen.findByText('This file type is not allowed.')).toBeInTheDocument();
    act(
      () =>
        void engine.enqueueFiles(
          [{ name: 'huge.bin', size: 200 * 1024 * 1024, type: '' } as unknown as File],
          'f',
        ),
    );
    expect(await screen.findByText(/100 MB/)).toBeInTheDocument();
  });

  it('cancel is available while uploading', async () => {
    const engine = engineWith({
      put: ({ signal }) =>
        new Promise((_r, rej) =>
          signal.addEventListener('abort', () =>
            rej(new ApiError({ status: 0, code: 'aborted', message: 'c' })),
          ),
        ),
    });
    renderApp(<UploadPanel />, { engine });
    act(() => void engine.enqueueFiles([file()], 'f'));
    await userEvent.click(
      await screen.findByRole('button', { name: /Cancel upload of report\.pdf/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('upload-row')).toHaveAttribute('data-status', 'cancelled'),
    );
  });
});
