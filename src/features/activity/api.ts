'use client';

import { useQuery } from '@tanstack/react-query';
import { api, call, type Schemas } from '@/lib/api-client';

export type MyActivity = Schemas['MyActivityItem'];
export type OrgActivity = Schemas['ActivityEventOut'];

/** The signed-in user's own recent actions. */
export function useMyActivity(enabled: boolean) {
  return useQuery({
    queryKey: ['activity', 'mine'],
    enabled,
    staleTime: 10_000,
    queryFn: ({ signal }) =>
      call<MyActivity[]>(
        api.GET('/api/v1/me/activity', { params: { query: { limit: 50 } }, signal }),
      ),
  });
}

/** Everyone's file activity (administrators and auditors only; the server enforces it), optionally one user. */
export function useOrgActivity(enabled: boolean, userId: string | null) {
  return useQuery({
    queryKey: ['activity', 'org', userId],
    enabled,
    staleTime: 10_000,
    queryFn: ({ signal }) =>
      call<Schemas['ActivityPage']>(
        api.GET('/api/v1/admin/activity', {
          params: { query: { user_id: userId ?? undefined, category: 'files', limit: 100 } },
          signal,
        }),
      ),
  });
}

const PHRASES: Record<string, string> = {
  'document.created': 'created',
  'document.version_created': 'uploaded a new version of',
  'document.version_restored': 'restored a version of',
  'document.renamed': 'renamed',
  'document.metadata_updated': 'edited the details of',
  'document.moved': 'moved',
  'document.copied': 'copied',
  'document.deleted': 'moved to the trash',
  'document.restored': 'restored',
  'document.locked': 'checked out',
  'document.unlocked': 'checked in',
  'document.preview_url_issued': 'viewed',
  'document.download_url_issued': 'downloaded',
  'document.previewed': 'viewed',
  'document.downloaded': 'downloaded',
  'folder.created': 'created folder',
  'folder.renamed': 'renamed folder',
  'folder.moved': 'moved folder',
  'folder.copied': 'copied folder',
  'folder.deleted': 'moved to the trash',
  'folder.restored': 'restored folder',
  'folder.downloaded': 'downloaded folder',
  'comment.created': 'commented on',
};

/** "document.moved" -> "moved"; unknown actions fall back to a readable form of the code. */
export const describeAction = (action: string) => PHRASES[action] ?? action.replace(/[._]/g, ' ');
