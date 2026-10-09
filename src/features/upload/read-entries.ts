import type { TreeEntry } from './upload-engine';

export const MAX_TREE_ENTRIES = 5000;

/** Minimal shapes of the (non-standard) FileSystem Entry API, so tests can fake them. */
export interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (ok: (e: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
}

export class TooManyEntriesError extends Error {
  constructor() {
    super(`That is more than ${MAX_TREE_ENTRIES} items. Upload it in smaller parts.`);
  }
}

const readAll = (reader: NonNullable<ReturnType<NonNullable<FsEntry['createReader']>>>) =>
  new Promise<FsEntry[]>((resolve, reject) => {
    const out: FsEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(out);
        out.push(...batch);
        next(); // readEntries returns at most ~100 entries per call
      }, reject);
    next();
  });

const fileOf = (e: FsEntry) =>
  new Promise<File>((resolve, reject) =>
    e.file ? e.file(resolve, reject) : reject(new Error('not a file')),
  );

/** Walk one entry depth-first, appending to `out`. Empty directories become path-only entries. */
export async function walkEntry(entry: FsEntry, parent: string[], out: TreeEntry[]): Promise<void> {
  const path = [...parent, entry.name];
  if (entry.isFile) {
    out.push({ path, file: await fileOf(entry) });
  } else if (entry.isDirectory && entry.createReader) {
    const children = await readAll(entry.createReader());
    if (children.length === 0) out.push({ path });
    for (const c of children) {
      await walkEntry(c, path, out);
      if (out.length > MAX_TREE_ENTRIES) throw new TooManyEntriesError();
    }
  }
}

/**
 * Collect everything from a drop. `webkitGetAsEntry()` MUST be called synchronously inside the drop event,
 * so we take the entries first and only then await. Falls back to the flat file list when unsupported.
 */
export async function collectDropped(dt: DataTransfer): Promise<TreeEntry[]> {
  const entries: FsEntry[] = [];
  const items = Array.from(dt.items ?? []);
  for (const it of items) {
    if (it.kind !== 'file') continue;
    const e = (
      it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }
    ).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  if (entries.length === 0) {
    return Array.from(dt.files ?? []).map((file) => ({ path: [file.name], file }));
  }
  const out: TreeEntry[] = [];
  for (const e of entries) await walkEntry(e, [], out);
  return out;
}

/** Entries from <input type=file webkitdirectory> (or a plain multi-file input). */
export function entriesFromFileList(files: FileList | File[]): TreeEntry[] {
  return Array.from(files).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return { path: rel ? rel.split('/').filter(Boolean) : [file.name], file };
  });
}

/** True when the drag carries OS files (as opposed to our internal item drag). */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files');
}

export const INTERNAL_DND = 'application/x-dms-items';
