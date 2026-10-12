'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Schemas, type TreeItem } from '@/lib/api-client';

export type TeamFolder = Schemas['TeamFolderOut'];

/** Team folders are ordinary folders; this shapes one for the shared file/folder components. */
export const teamFolderToTreeItem = (t: TeamFolder): TreeItem =>
  // `starred` / lock state are deliberately absent: rows built from this load the live folder before
  // offering favorite / lock actions (see isResolved), so menus never guess.
  ({
    kind: 'folder',
    id: t.id,
    name: t.name,
    updated_at: t.updated_at,
    permissions: t.permissions,
    is_team_folder: true,
  }) as TreeItem;

const KEY = ['team-folders'] as const;

export function useTeamFolders() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => call<TeamFolder[]>(api.GET('/api/v1/team-folders', { signal })),
  });
}

export function useSetTeamFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      call(
        api.PUT('/api/v1/admin/team-folders/{folder_id}', {
          params: { path: { folder_id: v.id } },
          body: { enabled: v.enabled },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
