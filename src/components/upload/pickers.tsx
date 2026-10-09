'use client';

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  entriesFromFileList,
  collectDropped,
  TooManyEntriesError,
} from '@/features/upload/read-entries';
import { useUploads } from '@/features/upload/upload-manager';
import { friendlyMessage } from '@/lib/api-client';

interface PickerApi {
  pickFiles: (folderId: string) => void;
  pickFolder: (folderId: string) => void;
  /** The folder currently open; used when a chooser is driven without an explicit target. */
  setDefaultTarget: (folderId: string | null) => void;
  /** Upload everything from a drop (files and whole folders) into `folderId`. */
  dropInto: (dt: DataTransfer, folderId: string) => Promise<void>;
}
const Ctx = createContext<PickerApi | null>(null);
export const useUploadPickers = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUploadPickers must be used inside UploadPickersProvider');
  return c;
};

/** Hidden file/folder inputs shared by the toolbar, menus and drop handlers. */
export function UploadPickersProvider({ children }: { children: React.ReactNode }) {
  const { engine } = useUploads();
  const target = useRef<string | null>(null);
  const fallback = useRef<string | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement | null>(null);

  const setFolderInput = useCallback((el: HTMLInputElement | null) => {
    folder.current = el;
    // `webkitdirectory` is non-standard; set the attribute directly.
    el?.setAttribute('webkitdirectory', '');
    el?.setAttribute('directory', '');
  }, []);

  const api = useMemo<PickerApi>(
    () => ({
      setDefaultTarget: (id) => {
        fallback.current = id;
      },
      pickFiles: (id) => {
        target.current = id;
        files.current?.click();
      },
      pickFolder: (id) => {
        target.current = id;
        folder.current?.click();
      },
      dropInto: async (dt, id) => {
        try {
          const entries = await collectDropped(dt);
          if (entries.length === 0) return;
          engine.enqueueTree(entries, id);
        } catch (e) {
          toast.error(e instanceof TooManyEntriesError ? e.message : friendlyMessage(e));
        }
      },
    }),
    [engine],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <input
        ref={files}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose files to upload"
        data-testid="upload-input"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          const to = target.current ?? fallback.current;
          if (list.length && to) engine.enqueueFiles(list, to);
          target.current = null;
          e.target.value = '';
        }}
      />
      <input
        ref={setFolderInput}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a folder to upload"
        data-testid="upload-folder-input"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          const to = target.current ?? fallback.current;
          if (list.length && to) {
            if (list.length > 5000)
              toast.error('That folder has more than 5000 files. Upload it in smaller parts.');
            else engine.enqueueTree(entriesFromFileList(list), to);
          }
          target.current = null;
          e.target.value = '';
        }}
      />
    </Ctx.Provider>
  );
}
