'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api, call, type Schemas } from '@/lib/api-client';

export type DirectorySource = Schemas['DirectorySourceOut'];
export type SyncRun = Schemas['SyncRunOut'];

/** Only `env:DMS_DIR_<NAME>` references are accepted: the secret itself is never typed into the app. */
export const SECRET_REF_RE = /^env:DMS_DIR_[A-Z0-9_]{1,80}$/;

export const snapshotSchema = z.object({
  users: z
    .array(
      z.object({
        external_id: z.string().min(1, 'external_id is required'),
        email: z.string().email('email must be a valid address'),
        display_name: z.string().nullish(),
        active: z.boolean().optional(),
      }),
    )
    .min(1, 'The snapshot needs at least one user'),
  groups: z
    .array(
      z.object({
        external_id: z.string().min(1),
        name: z.string().min(1, 'group name is required'),
        member_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

/** Parse + validate a snapshot JSON file's text. Returns data or readable errors. */
export function parseSnapshot(
  text: string,
): { ok: true; data: Schemas['SnapshotIn'] } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  const r = snapshotSchema.safeParse(raw);
  if (!r.success)
    return {
      ok: false,
      errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`),
    };
  const ids = new Set<string>();
  const dup: string[] = [];
  for (const u of r.data.users) {
    if (ids.has(u.external_id)) dup.push(`Duplicate user external_id "${u.external_id}"`);
    ids.add(u.external_id);
  }
  if (dup.length) return { ok: false, errors: dup.slice(0, 8) };
  return { ok: true, data: r.data as Schemas['SnapshotIn'] };
}

export function useDirectorySources() {
  return useQuery({
    queryKey: ['directory', 'sources'],
    queryFn: ({ signal }) =>
      call<DirectorySource[]>(api.GET('/api/v1/admin/directory/sources', { signal })),
  });
}

function useDir<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directory'] }),
  });
}

export const useCreateSource = () =>
  useDir((b: Schemas['DirectorySourceIn']) =>
    call<DirectorySource>(api.POST('/api/v1/admin/directory/sources', { body: b })),
  );
export const useUpdateSource = () =>
  useDir((v: { id: string; body: Schemas['DirectorySourceUpdate'] }) =>
    call<DirectorySource>(
      api.PATCH('/api/v1/admin/directory/sources/{source_id}', {
        params: { path: { source_id: v.id } },
        body: v.body,
      }),
    ),
  );
export const useDeleteSource = () =>
  useDir(async (id: string) => {
    await api.DELETE('/api/v1/admin/directory/sources/{source_id}', {
      params: { path: { source_id: id } },
    });
  });
export const useUploadSnapshot = () =>
  useDir((v: { id: string; body: Schemas['SnapshotIn'] }) =>
    call<DirectorySource>(
      api.PUT('/api/v1/admin/directory/sources/{source_id}/snapshot', {
        params: { path: { source_id: v.id } },
        body: v.body,
      }),
    ),
  );
export const useStartSync = () =>
  useDir((v: { id: string; dryRun: boolean }) =>
    call<SyncRun>(
      api.POST('/api/v1/admin/directory/sources/{source_id}/sync', {
        params: { path: { source_id: v.id } },
        body: { dry_run: v.dryRun },
      }),
    ),
  );

export function useSourceRuns(sourceId: string | undefined) {
  return useQuery({
    queryKey: ['directory', 'runs', sourceId],
    enabled: !!sourceId,
    queryFn: ({ signal }) =>
      call<SyncRun[]>(
        api.GET('/api/v1/admin/directory/sources/{source_id}/runs', {
          params: { path: { source_id: sourceId! } },
          signal,
        }),
      ),
  });
}

/** Polls one run until it leaves `running`. */
export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['directory', 'run', runId],
    enabled: !!runId,
    queryFn: ({ signal }) =>
      call<SyncRun>(
        api.GET('/api/v1/admin/directory/runs/{run_id}', {
          params: { path: { run_id: runId! } },
          signal,
        }),
      ),
    refetchInterval: (q) => (q.state.data && q.state.data.state !== 'running' ? false : 1500),
  });
}

/** Split run stats into numeric counters and notes for display. */
export function splitStats(stats: Record<string, unknown>) {
  const counters = Object.entries(stats).filter(
    (e): e is [string, number] => typeof e[1] === 'number',
  );
  const notes = Array.isArray(stats.notes) ? (stats.notes as unknown[]).map(String) : [];
  return { counters, notes };
}
