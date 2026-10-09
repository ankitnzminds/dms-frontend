'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, call } from '@/lib/api-client';
import type { SortKey, SortOrder } from '@/features/files/hooks';

export type ViewMode = 'details' | 'compact' | 'tiles' | 'grid';
export type ColumnId = 'type' | 'modified' | 'modified_by' | 'size' | 'status';

export interface ViewPrefs {
  view: ViewMode;
  sort: SortKey;
  order: SortOrder;
  columns: ColumnId[];
}

export const DEFAULT_PREFS: ViewPrefs = {
  view: 'details',
  sort: 'name',
  order: 'asc',
  columns: ['type', 'modified', 'modified_by', 'size', 'status'],
};

export const ALL_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'type', label: 'Type' },
  { id: 'modified', label: 'Modified' },
  { id: 'modified_by', label: 'Modified by' },
  { id: 'size', label: 'Size' },
  { id: 'status', label: 'Status' },
];

const KEY = 'file-manager.view';
const MAX_LOCATIONS = 40; // keeps the stored value far below the 16 KB limit

interface Stored {
  default?: Partial<ViewPrefs>;
  locations?: Record<string, Partial<ViewPrefs>>;
  order?: string[];
}

const VIEWS: ViewMode[] = ['details', 'compact', 'tiles', 'grid'];
const SORTS: SortKey[] = ['name', 'updated_at', 'size', 'type', 'modified_by'];

/** Defensive merge: ignores anything the server returns that we do not understand. */
export function resolvePrefs(stored: Stored | undefined, locationId: string): ViewPrefs {
  const pick = (p?: Partial<ViewPrefs>): Partial<ViewPrefs> => {
    const out: Partial<ViewPrefs> = {};
    if (p?.view && VIEWS.includes(p.view)) out.view = p.view;
    if (p?.sort && SORTS.includes(p.sort)) out.sort = p.sort;
    if (p?.order === 'asc' || p?.order === 'desc') out.order = p.order;
    if (Array.isArray(p?.columns))
      out.columns = p!.columns.filter((c): c is ColumnId => ALL_COLUMNS.some((x) => x.id === c));
    return out;
  };
  return { ...DEFAULT_PREFS, ...pick(stored?.default), ...pick(stored?.locations?.[locationId]) };
}

export function mergeLocation(
  stored: Stored | undefined,
  locationId: string,
  prefs: ViewPrefs,
): Stored {
  const order = [locationId, ...(stored?.order ?? []).filter((x) => x !== locationId)].slice(
    0,
    MAX_LOCATIONS,
  );
  const locations: Record<string, Partial<ViewPrefs>> = {};
  for (const id of order)
    locations[id] = id === locationId ? prefs : (stored?.locations?.[id] ?? {});
  return { default: stored?.default, locations, order };
}

/**
 * View, sort and columns per location, persisted through GET/PUT /me/preferences/file-manager.view.
 * Changes apply instantly and are saved (debounced) in the background.
 */
export function useViewPrefs(locationId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['preferences', KEY],
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const r = await call<{ value?: Stored }>(
        api.GET('/api/v1/me/preferences/{key}', { params: { path: { key: KEY } }, signal }),
      );
      return (r.value ?? {}) as Stored;
    },
  });
  const save = useMutation({
    mutationFn: (value: Stored) =>
      call(
        api.PUT('/api/v1/me/preferences/{key}', {
          params: { path: { key: KEY } },
          body: { value: value as Record<string, unknown> },
        }),
      ),
  });

  const stored = q.data;
  const [local, setLocal] = useState<ViewPrefs | null>(null);
  const prefs = useMemo(
    () => local ?? resolvePrefs(stored, locationId),
    [local, stored, locationId],
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storedRef = useRef(stored);
  useEffect(() => {
    storedRef.current = stored;
  }, [stored]);

  const update = useCallback(
    (patch: Partial<ViewPrefs>) => {
      const next = { ...resolvePrefs(storedRef.current, locationId), ...(local ?? {}), ...patch };
      setLocal(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const merged = mergeLocation(storedRef.current, locationId, next);
        qc.setQueryData(['preferences', KEY], merged);
        save.mutate(merged);
      }, 600);
    },
    [local, locationId, qc, save],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { prefs, update, ready: !q.isPending, saving: save.isPending, saveError: save.isError };
}
