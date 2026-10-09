import {
  ApiError,
  MAX_UPLOAD_BYTES,
  isApiError,
  type UploadFinalize,
  type UploadSession,
} from '@/lib/api-client';

export type UploadStatus =
  'queued' | 'hashing' | 'starting' | 'uploading' | 'finalizing' | 'done' | 'error' | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  /** Display / server filename (may be edited after a name conflict). */
  name: string;
  /** Target folder for new documents. */
  folderId?: string;
  /** Set for "upload new version". */
  documentId?: string;
  expectedLatestVersion?: number;
  status: UploadStatus;
  /** 0..1 */
  progress: number;
  error?: { code: string; message: string; requestId: string | null; status: number };
  sessionId?: string;
  result?: UploadFinalize;
}

export interface UploadDeps {
  sha256: (f: Blob) => Promise<string | null>;
  initiate: (a: {
    item: UploadItem;
    sha256: string | null;
    idempotencyKey: string;
    signal: AbortSignal;
  }) => Promise<UploadSession>;
  put: (a: {
    session: UploadSession;
    file: File;
    onProgress: (loaded: number, total: number) => void;
    signal: AbortSignal;
  }) => Promise<unknown>;
  finalize: (sessionId: string, signal: AbortSignal) => Promise<UploadFinalize>;
  cancelSession: (sessionId: string) => Promise<void>;
  onDone?: (item: UploadItem) => void;
  uuid?: () => string;
  concurrency?: number;
}

type Listener = () => void;

/**
 * Framework-free upload queue: hash -> initiate (Idempotency-Key) -> PUT raw bytes (progress)
 * -> finalize. Exposes a stable snapshot for useSyncExternalStore.
 */
export class UploadEngine {
  private items: UploadItem[] = [];
  private listeners = new Set<Listener>();
  private controllers = new Map<string, AbortController>();
  private running = 0;
  private snapshot: readonly UploadItem[] = [];

  constructor(private readonly deps: UploadDeps) {}

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getSnapshot = () => this.snapshot;

  private commit() {
    this.snapshot = [...this.items];
    this.listeners.forEach((l) => l());
  }

  private patch(id: string, p: Partial<UploadItem>) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...p } : i));
    this.commit();
  }

  private newId() {
    return this.deps.uuid ? this.deps.uuid() : crypto.randomUUID();
  }

  enqueueFiles(files: File[], folderId: string): string[] {
    const ids = files.map((file) => {
      const id = this.newId();
      this.items.push({ id, file, name: file.name, folderId, status: 'queued', progress: 0 });
      return id;
    });
    this.commit();
    this.pump();
    return ids;
  }

  enqueueVersion(file: File, documentId: string, expectedLatestVersion: number): string {
    const id = this.newId();
    this.items.push({
      id,
      file,
      name: file.name,
      documentId,
      expectedLatestVersion,
      status: 'queued',
      progress: 0,
    });
    this.commit();
    this.pump();
    return id;
  }

  /** Retry a failed/cancelled item, optionally with a new name (after name_conflict). */
  retry(id: string, newName?: string, newExpectedLatest?: number) {
    const it = this.items.find((i) => i.id === id);
    if (!it || (it.status !== 'error' && it.status !== 'cancelled')) return;
    this.patch(id, {
      status: 'queued',
      progress: 0,
      error: undefined,
      sessionId: undefined,
      name: newName?.trim() || it.name,
      expectedLatestVersion: newExpectedLatest ?? it.expectedLatestVersion,
    });
    this.pump();
  }

  cancel(id: string) {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    if (it.status === 'queued') {
      this.patch(id, { status: 'cancelled' });
      return;
    }
    this.controllers.get(id)?.abort();
  }

  dismiss(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.commit();
  }

  clearFinished() {
    this.items = this.items.filter((i) => !['done', 'cancelled'].includes(i.status));
    this.commit();
  }

  private pump() {
    const max = this.deps.concurrency ?? 2;
    while (this.running < max) {
      const next = this.items.find((i) => i.status === 'queued');
      if (!next) return;
      this.running++;
      this.patch(next.id, { status: 'hashing' });
      void this.run(next.id).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(id: string) {
    const ctrl = new AbortController();
    this.controllers.set(id, ctrl);
    const item = () => this.items.find((i) => i.id === id)!;
    let sessionId: string | undefined;
    try {
      const { file } = item();
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ApiError({
          status: 413,
          code: 'payload_too_large',
          message: 'File exceeds the 100 MB limit.',
        });
      }
      const sha = await this.deps.sha256(file);
      if (ctrl.signal.aborted)
        throw new ApiError({ status: 0, code: 'aborted', message: 'cancelled' });

      this.patch(id, { status: 'starting' });
      const session = await this.deps.initiate({
        item: item(),
        sha256: sha,
        idempotencyKey: this.newId(),
        signal: ctrl.signal,
      });
      sessionId = session.id;
      this.patch(id, { sessionId, status: 'uploading', progress: 0 });

      await this.deps.put({
        session,
        file,
        signal: ctrl.signal,
        onProgress: (loaded, total) =>
          this.patch(id, { progress: total ? Math.min(1, loaded / total) : 0 }),
      });

      this.patch(id, { status: 'finalizing', progress: 1 });
      const result = await this.deps.finalize(session.id, ctrl.signal);
      this.patch(id, { status: 'done', result });
      this.deps.onDone?.(item());
    } catch (e) {
      if (isApiError(e) && e.isAborted) {
        if (sessionId) void this.deps.cancelSession(sessionId).catch(() => {});
        this.patch(id, { status: 'cancelled' });
      } else {
        const err = isApiError(e)
          ? e
          : new ApiError({
              status: 0,
              code: 'unknown',
              message: (e as Error)?.message ?? 'Upload failed',
            });
        if (sessionId) void this.deps.cancelSession(sessionId).catch(() => {});
        this.patch(id, {
          status: 'error',
          error: {
            code: err.code,
            message: err.message,
            requestId: err.requestId,
            status: err.status,
          },
        });
      }
    } finally {
      this.controllers.delete(id);
    }
  }
}
