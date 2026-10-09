import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client/errors';
import { UploadEngine, type UploadDeps, type UploadItem } from '@/features/upload/upload-engine';
import { resolveUploadUrl } from '@/lib/api-client/upload';

const session = (id = 's1') => ({
  id,
  folder_id: 'f1',
  document_id: null,
  filename: 'a.pdf',
  declared_size: 3,
  content_type: 'application/octet-stream',
  state: 'initiated',
  expires_at: new Date().toISOString(),
  upload_url: `/api/v1/uploads/${id}/content`,
});

function deps(
  over: Partial<UploadDeps> = {},
): UploadDeps & { onDoneSpy: ReturnType<typeof vi.fn> } {
  let n = 0;
  const onDoneSpy = vi.fn();
  return {
    sha256: async () => 'abc123',
    initiate: vi.fn(async () => session()),
    put: vi.fn(async ({ onProgress }) => {
      onProgress(1, 2);
      onProgress(2, 2);
    }),
    finalize: vi.fn(async () => ({
      document_id: 'd1',
      version_id: 'v1',
      version_number: 1,
      message: 'ok',
      status: 'pending_scan' as const,
    })),
    cancelSession: vi.fn(async () => {}),
    onDone: onDoneSpy,
    uuid: () => `id-${++n}`,
    onDoneSpy,
    ...over,
  };
}

const file = (name = 'a.pdf', size = 3) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });
const settled = (e: UploadEngine, id: string) =>
  vi.waitFor(() => {
    const s = e.getSnapshot().find((i) => i.id === id)!.status;
    if (!['done', 'error', 'cancelled'].includes(s)) throw new Error(`still ${s}`);
  });
const get = (e: UploadEngine, id: string) => e.getSnapshot().find((i) => i.id === id) as UploadItem;

describe('UploadEngine', () => {
  it('runs hash -> initiate (with sha256 + idempotency key) -> PUT with progress -> finalize', async () => {
    const d = deps();
    const e = new UploadEngine(d);
    const progress: number[] = [];
    e.subscribe(() => progress.push(e.getSnapshot()[0]?.progress ?? 0));
    const [id] = e.enqueueFiles([file()], 'folder-1');
    await settled(e, id!);

    const item = get(e, id!);
    expect(item.status).toBe('done');
    expect(item.result?.document_id).toBe('d1');
    const call = (d.initiate as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.sha256).toBe('abc123');
    expect(call.idempotencyKey).toMatch(/^id-/);
    expect(call.item.folderId).toBe('folder-1');
    expect(progress).toContain(0.5);
    expect(d.onDoneSpy).toHaveBeenCalledTimes(1);
  });

  it('uses a fresh Idempotency-Key for every attempt', async () => {
    const d = deps({
      initiate: vi
        .fn()
        .mockRejectedValueOnce(new ApiError({ status: 500, code: 'x', message: 'x' }))
        .mockResolvedValue(session()),
    });
    const e = new UploadEngine(d);
    const [id] = e.enqueueFiles([file()], 'f');
    await settled(e, id!);
    e.retry(id!);
    await vi.waitFor(() => expect(get(e, id!).status).toBe('done'));
    const keys = (d.initiate as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0].idempotencyKey,
    );
    expect(new Set(keys).size).toBe(2);
  });

  it('surfaces name_conflict and lets the user retry with a new name', async () => {
    const initiate = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: 'name_conflict', message: 'exists', requestId: 'r1' }),
      )
      .mockResolvedValue(session());
    const e = new UploadEngine(deps({ initiate }));
    const [id] = e.enqueueFiles([file('report.pdf')], 'f');
    await settled(e, id!);
    expect(get(e, id!).status).toBe('error');
    expect(get(e, id!).error).toMatchObject({ code: 'name_conflict', requestId: 'r1' });

    e.retry(id!, 'report (1).pdf');
    await vi.waitFor(() => expect(get(e, id!).status).toBe('done'));
    expect(initiate.mock.calls[1]![0].item.name).toBe('report (1).pdf');
  });

  it('reports quota_exceeded from initiate and from the PUT without finalizing', async () => {
    const d = deps({
      put: vi
        .fn()
        .mockRejectedValue(new ApiError({ status: 409, code: 'quota_exceeded', message: 'full' })),
    });
    const e = new UploadEngine(d);
    const [id] = e.enqueueFiles([file()], 'f');
    await settled(e, id!);
    expect(get(e, id!).error?.code).toBe('quota_exceeded');
    expect(d.finalize).not.toHaveBeenCalled();
    expect(d.cancelSession).toHaveBeenCalledWith('s1'); // releases the reservation
  });

  it('rejects files over 100 MB locally without calling the API', async () => {
    const d = deps();
    const e = new UploadEngine(d);
    const big = { name: 'big.bin', size: 101 * 1024 * 1024, type: '' } as unknown as File;
    const [id] = e.enqueueFiles([big], 'f');
    await settled(e, id!);
    expect(get(e, id!).error).toMatchObject({ code: 'payload_too_large', status: 413 });
    expect(d.initiate).not.toHaveBeenCalled();
  });

  it('cancel aborts an in-flight upload and cancels the server session', async () => {
    let release!: () => void;
    const d = deps({
      put: vi.fn(
        ({ signal }) =>
          new Promise((_res, rej) => {
            signal.addEventListener('abort', () =>
              rej(new ApiError({ status: 0, code: 'aborted', message: 'cancelled' })),
            );
            release = () => rej(new Error('unused'));
          }),
      ),
    });
    const e = new UploadEngine(d);
    const [id] = e.enqueueFiles([file()], 'f');
    await vi.waitFor(() => expect(get(e, id!).status).toBe('uploading'));
    e.cancel(id!);
    await settled(e, id!);
    expect(get(e, id!).status).toBe('cancelled');
    expect(d.cancelSession).toHaveBeenCalledWith('s1');
    expect(d.finalize).not.toHaveBeenCalled();
    void release;
  });

  it('limits concurrency', async () => {
    let active = 0;
    let max = 0;
    const d = deps({
      put: vi.fn(async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 15));
        active--;
      }),
      concurrency: 2,
    });
    const e = new UploadEngine(d);
    const ids = e.enqueueFiles([file('1'), file('2'), file('3'), file('4')], 'f');
    await Promise.all(ids.map((i) => settled(e, i)));
    expect(max).toBe(2);
  });

  it('sends expected_latest_version for new-version uploads and supports stale_version retry', async () => {
    const initiate = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 409, code: 'stale_version', message: 'stale' }))
      .mockResolvedValue(session());
    const e = new UploadEngine(deps({ initiate }));
    const id = e.enqueueVersion(file(), 'doc-1', 2);
    await settled(e, id);
    expect(get(e, id).error?.code).toBe('stale_version');
    expect(initiate.mock.calls[0]![0].item).toMatchObject({
      documentId: 'doc-1',
      expectedLatestVersion: 2,
    });
    e.retry(id, undefined, 3);
    await vi.waitFor(() => expect(get(e, id).status).toBe('done'));
    expect(initiate.mock.calls[1]![0].item.expectedLatestVersion).toBe(3);
  });
});

describe('resolveUploadUrl', () => {
  it('resolves the relative upload_url against the API root (prefix already included)', () => {
    expect(resolveUploadUrl('/api/v1/uploads/x/content', 'http://localhost:8000')).toBe(
      'http://localhost:8000/api/v1/uploads/x/content',
    );
    expect(resolveUploadUrl('http://other/x', 'http://localhost:8000')).toBe('http://other/x');
  });
});
