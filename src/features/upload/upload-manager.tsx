'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import {
  api,
  apiRoot,
  authHeaders,
  call,
  putBytes,
  resolveUploadUrl,
  sha256Hex,
  type UploadFinalize,
  type UploadSession,
} from '@/lib/api-client';
import { UploadEngine, type UploadDeps, type UploadItem } from './upload-engine';

/** Real dependencies: typed API client + XHR PUT with progress. */
export function createLiveDeps(onDone: (i: UploadItem) => void): UploadDeps {
  return {
    sha256: sha256Hex,
    onDone,
    initiate: async ({ item, sha256, idempotencyKey, signal }) => {
      const body = {
        filename: item.name,
        size_bytes: item.file.size,
        content_type: item.file.type || null,
        sha256,
      };
      const header = { 'Idempotency-Key': idempotencyKey };
      if (item.documentId) {
        return call<UploadSession>(
          api.POST('/api/v1/documents/{document_id}/uploads', {
            params: { path: { document_id: item.documentId }, header },
            body: { ...body, expected_latest_version: item.expectedLatestVersion ?? null },
            signal,
          }),
        );
      }
      return call<UploadSession>(
        api.POST('/api/v1/folders/{folder_id}/uploads', {
          params: { path: { folder_id: item.folderId! }, header },
          body,
          signal,
        }),
      );
    },
    put: async ({ session, file, onProgress, signal }) =>
      putBytes({
        url: resolveUploadUrl(session.upload_url, apiRoot),
        body: file,
        headers: await authHeaders(),
        onProgress,
        signal,
      }),
    finalize: (id, signal) =>
      call<UploadFinalize>(
        api.POST('/api/v1/uploads/{session_id}/finalize', { params: { path: { session_id: id } }, signal }),
      ),
    cancelSession: async (id) => {
      await api.DELETE('/api/v1/uploads/{session_id}', { params: { path: { session_id: id } } });
    },
  };
}

interface Ctx {
  items: readonly UploadItem[];
  engine: UploadEngine;
}
const UploadCtx = createContext<Ctx | null>(null);

export function UploadProvider({
  children,
  engine: injected,
}: {
  children: React.ReactNode;
  /** Tests inject an engine with fake dependencies. */
  engine?: UploadEngine;
}) {
  const qc = useQueryClient();
  const engine = useMemo(
    () =>
      injected ??
      new UploadEngine(
        createLiveDeps((item) => {
          void qc.invalidateQueries({ queryKey: ['children'] });
          void qc.invalidateQueries({ queryKey: ['usage'] });
          void qc.invalidateQueries({ queryKey: ['recent'] });
          if (item.result?.document_id) {
            void qc.invalidateQueries({ queryKey: ['document', item.result.document_id] });
            void qc.invalidateQueries({ queryKey: ['versions', item.result.document_id] });
          }
        }),
      ),
    [qc, injected],
  );
  const items = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const value = useMemo(() => ({ items, engine }), [items, engine]);
  return <UploadCtx.Provider value={value}>{children}</UploadCtx.Provider>;
}

export function useUploads() {
  const ctx = useContext(UploadCtx);
  if (!ctx) throw new Error('useUploads must be used inside UploadProvider');
  return ctx;
}
