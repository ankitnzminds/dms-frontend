import {
  ApiError,
  MAX_UPLOAD_BYTES,
  isApiError,
  type UploadFinalize,
  type UploadSession,
} from '@/lib/api-client';

export type UploadStatus =
  | 'queued'
  | 'hashing'
  | 'starting'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'skipped';

export interface UploadItem {
  id: string;
  file: File;
  /** Display / server filename (may be edited after a name conflict). */
  name: string;
  /** Target (base) folder for new documents. */
  folderId?: string;
  /** Sub-folders below `folderId` (from a dropped / chosen folder); created with ensure-path. */
  relativeDir?: string[];
  /** Folder-only item: just create the (empty) directory, no file. */
  mkdirOnly?: boolean;
  /** "create_file" needs the Create File right instead of Upload. */
  intent?: 'upload' | 'create_file';
  /** Set for "upload new version". */
  documentId?: string;
  expectedLatestVersion?: number;
  status: UploadStatus;
  /** 0..1 */
  progress: number;
  error?: { code: string; message: string; requestId: string | null; status: number };
  skipReason?: string;
  sessionId?: string;
  result?: UploadFinalize;
}

/** A directory entry flattened from a dropped/chosen tree. `path` is relative to the base folder. */
export interface TreeEntry {
  path: string[];
  file?: File;
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
  /** Find-or-create nested folders below `baseFolderId`; resolves to the deepest folder id. */
  ensurePath?: (baseFolderId: string, path: string[]) => Promise<string>;
  /** Existing document with this name in a folder (for "upload as new version"). */
  findDocument?: (
    folderId: string,
    name: string,
  ) => Promise<{ id: string; latestVersion: number } | null>;
  onDone?: (item: UploadItem) => void;
  uuid?: () => string;
  concurrency?: number;
}

type Listener = () => void;

export const EMPTY_FILE_REASON = 'Empty files cannot be uploaded.';

/**
 * Framework-free upload queue: [ensure-path] -> hash -> initiate (Idempotency-Key) -> PUT raw bytes
 * (progress) -> finalize. Pause stops NEW uploads from starting (running ones finish); cancel aborts.
 * Exposes a stable snapshot for useSyncExternalStore.
 */
export class UploadEngine {
  private items: UploadItem[] = [];
  private listeners = new Set<Listener>();
  private controllers = new Map<string, AbortController>();
  private dirCache = new Map<string, Promise<string>>();
  /** ensure-path calls run one at a time: concurrent creation of a shared parent races on the server. */
  private ensureChain: Promise<unknown> = Promise.resolve();
  private running = 0;
  private snapshot: readonly UploadItem[] = [];
  paused = false;

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

  private push(i: Omit<UploadItem, 'id' | 'status' | 'progress'> & Partial<UploadItem>): string {
    const id = this.newId();
    const empty = !i.mkdirOnly && i.file.size === 0;
    this.items.push({
      status: empty ? 'skipped' : 'queued',
      progress: 0,
      skipReason: empty ? EMPTY_FILE_REASON : undefined,
      ...i,
      id,
    } as UploadItem);
    return id;
  }

  enqueueFiles(
    files: File[],
    folderId: string,
    intent: 'upload' | 'create_file' = 'upload',
  ): string[] {
    const ids = files.map((file) => this.push({ file, name: file.name, folderId, intent }));
    this.commit();
    this.pump();
    return ids;
  }

  /** Whole folder trees (chosen or dropped). Directories without any file are created as empty folders. */
  enqueueTree(entries: TreeEntry[], baseFolderId: string): string[] {
    const ids: string[] = [];
    for (const e of entries) {
      if (e.file) {
        ids.push(
          this.push({
            file: e.file,
            name: e.file.name,
            folderId: baseFolderId,
            relativeDir: e.path.slice(0, -1),
          }),
        );
      } else if (e.path.length) {
        ids.push(
          this.push({
            file: new File([], e.path[e.path.length - 1]!),
            name: e.path[e.path.length - 1]!,
            folderId: baseFolderId,
            relativeDir: e.path,
            mkdirOnly: true,
          }),
        );
      }
    }
    this.commit();
    this.pump();
    return ids;
  }

  enqueueVersion(file: File, documentId: string, expectedLatestVersion: number): string {
    const id = this.push({ file, name: file.name, documentId, expectedLatestVersion });
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

  /** Name conflict: skip this file. */
  skip(id: string, reason = 'Skipped because a file with this name already exists.') {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.status !== 'error') return;
    this.patch(id, { status: 'skipped', skipReason: reason, error: undefined });
  }

  /**
   * Name conflict: upload as a NEW VERSION of the existing document (needs its latest version number).
   * Returns false (and leaves the item errored) when the existing document cannot be found.
   */
  async asNewVersion(id: string): Promise<boolean> {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.status !== 'error' || !it.folderId || !this.deps.findDocument) return false;
    try {
      const folder = it.relativeDir?.length
        ? await this.resolveDir(it.folderId, it.relativeDir)
        : it.folderId;
      const doc = await this.deps.findDocument(folder, it.name);
      if (!doc) return false;
      this.patch(id, {
        documentId: doc.id,
        expectedLatestVersion: doc.latestVersion,
        status: 'queued',
        progress: 0,
        error: undefined,
      });
      this.pump();
      return true;
    } catch {
      return false;
    }
  }

  pause() {
    this.paused = true;
    this.commit();
  }
  resume() {
    this.paused = false;
    this.commit();
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

  cancelAll() {
    for (const i of this.items)
      if (['queued', 'hashing', 'starting', 'uploading', 'finalizing'].includes(i.status))
        this.cancel(i.id);
  }

  dismiss(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.commit();
  }

  clearFinished() {
    this.items = this.items.filter((i) => !['done', 'cancelled', 'skipped'].includes(i.status));
    this.commit();
  }

  private pump() {
    if (this.paused) return;
    const max = this.deps.concurrency ?? 3;
    while (this.running < max) {
      const next = this.items.find((i) => i.status === 'queued');
      if (!next) {
        if (this.running === 0) this.dirCache.clear();
        return;
      }
      this.running++;
      this.patch(next.id, { status: next.mkdirOnly ? 'starting' : 'hashing' });
      void this.run(next.id).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private resolveDir(base: string, dir: string[]): Promise<string> {
    if (!this.deps.ensurePath) {
      return Promise.reject(
        new ApiError({
          status: 0,
          code: 'unsupported',
          message: 'Folder upload is not available.',
        }),
      );
    }
    const key = `${base}/${dir.join('/').toLowerCase()}`;
    let p = this.dirCache.get(key);
    if (!p) {
      const ensure = this.deps.ensurePath;
      const attempt = async (): Promise<string> => {
        try {
          return await ensure(base, dir);
        } catch (e) {
          // A concurrent creation can surface as a conflict; the folder exists now, so look it up again.
          if (isApiError(e) && e.code === 'name_conflict') return await ensure(base, dir);
          throw e;
        }
      };
      const run = this.ensureChain.then(attempt, attempt);
      this.ensureChain = run.catch(() => undefined);
      p = run.catch((e) => {
        this.dirCache.delete(key); // a failed creation may be retried
        if (isApiError(e) && !e.isAborted)
          throw new ApiError({
            status: e.status,
            code: 'folder_failed',
            message: 'Could not create the folder for this file.',
            requestId: e.requestId,
          });
        throw e;
      });
      this.dirCache.set(key, p);
    }
    return p;
  }

  private async run(id: string) {
    const ctrl = new AbortController();
    this.controllers.set(id, ctrl);
    const item = () => this.items.find((i) => i.id === id)!;
    let sessionId: string | undefined;
    try {
      const it0 = item();
      if (it0.mkdirOnly) {
        await this.resolveDir(it0.folderId!, it0.relativeDir ?? []);
        this.patch(id, { status: 'done', progress: 1 });
        this.deps.onDone?.(item());
        return;
      }
      const { file } = it0;
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ApiError({
          status: 413,
          code: 'payload_too_large',
          message: 'File exceeds the 100 MB limit.',
        });
      }
      let targetFolder = it0.folderId;
      if (!it0.documentId && it0.relativeDir?.length) {
        targetFolder = await this.resolveDir(it0.folderId!, it0.relativeDir);
      }
      const sha = await this.deps.sha256(file);
      if (ctrl.signal.aborted)
        throw new ApiError({ status: 0, code: 'aborted', message: 'cancelled' });

      this.patch(id, { status: 'starting' });
      const session = await this.deps.initiate({
        item: { ...item(), folderId: targetFolder, relativeDir: undefined },
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

/** Overall progress (0..1) weighted by bytes across files that take part in the queue. */
export function overallProgress(items: readonly UploadItem[]): {
  fraction: number;
  done: number;
  total: number;
} {
  const relevant = items.filter(
    (i) => !i.mkdirOnly && i.status !== 'skipped' && i.status !== 'cancelled',
  );
  const total = relevant.reduce((s, i) => s + i.file.size, 0);
  const loaded = relevant.reduce(
    (s, i) => s + (i.status === 'done' ? i.file.size : i.file.size * i.progress),
    0,
  );
  return {
    fraction: total ? Math.min(1, loaded / total) : relevant.length ? 1 : 0,
    done: relevant.filter((i) => i.status === 'done').length,
    total: relevant.length,
  };
}
