'use client';

import type { ActionItem } from '@/features/files/availability';
import { useDocument, useFolder } from '@/features/files/hooks';
import type { Document, Folder, TreeItem } from '@/lib/api-client';

/**
 * A resource shown on a list page. Pages that already know the effective permissions (a folder listing,
 * Recent, Team Folders) pass a full TreeItem. Pages that only know which resource a row is about (Shared with
 * me) pass `{ kind, id, name }`; the real, current permissions are then loaded from the API when the row is
 * hovered, focused or its menu opened, so the menu never relies on a guess.
 */
export type ResourceRef = Pick<TreeItem, 'kind' | 'id' | 'name'> & Partial<TreeItem>;

export const isResolved = (r: ResourceRef): r is TreeItem =>
  Array.isArray(r.permissions) &&
  typeof r.updated_at === 'string' &&
  typeof r.starred === 'boolean' &&
  typeof r.locked === 'boolean';

export function folderToTreeItem(f: Folder): TreeItem {
  return {
    kind: 'folder',
    id: f.id,
    name: f.name,
    updated_at: f.updated_at,
    permissions: f.permissions,
    starred: f.is_favorite,
    locked: false,
    locked_by_me: false,
    is_team_folder: f.is_team_folder,
  };
}

export function documentToTreeItem(d: Document): TreeItem {
  return {
    kind: 'document',
    id: d.id,
    name: d.name,
    updated_at: d.updated_at,
    permissions: d.permissions,
    starred: d.starred,
    status: d.status,
    content_type: d.current_version?.content_type,
    size_bytes: d.current_version?.size_bytes,
    locked: !!d.lock,
    locked_by_me: !!d.lock?.is_mine,
    is_team_folder: false,
    owner_id: d.owner_id,
  };
}

/**
 * The TreeItem to build menus from. Uses what the page already has; otherwise loads the live resource
 * (cached, so repeated hovers cost nothing) once `enabled`.
 */
export function useResolvedItem(ref: ResourceRef, enabled: boolean) {
  const known = isResolved(ref);
  const folder = useFolder(!known && enabled && ref.kind === 'folder' ? ref.id : undefined);
  const doc = useDocument(!known && enabled && ref.kind === 'document' ? ref.id : undefined);
  if (known) return { item: ref as TreeItem, loading: false, failed: false };
  const q = ref.kind === 'folder' ? folder : doc;
  const item = q.data
    ? ref.kind === 'folder'
      ? folderToTreeItem(q.data as Folder)
      : documentToTreeItem(q.data as Document)
    : undefined;
  return { item, loading: enabled && q.isPending, failed: q.isError };
}

export const toActionItem = (t: TreeItem): ActionItem => ({
  kind: t.kind,
  id: t.id,
  name: t.name,
  permissions: t.permissions,
  starred: t.starred,
  status: t.status,
  content_type: t.content_type,
});
