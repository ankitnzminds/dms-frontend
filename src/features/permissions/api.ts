'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, call, type Page, type Schemas } from '@/lib/api-client';

export type AccessEntry = Schemas['AccessEntry'];

export interface OrgAccessFilters {
  source: 'all' | 'grant' | 'share';
  expiringWithinDays?: number;
  userId: string;
  groupId: string;
  q: string;
  limit: number;
  offset: number;
}

export function useOrgAccess(f: OrgAccessFilters) {
  return useQuery({
    queryKey: ['permissions', 'org-access', f],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<AccessEntry>>(
        api.GET('/api/v1/admin/permissions/access', {
          params: {
            query: {
              source: f.source,
              expiring_within_days: f.expiringWithinDays,
              user_id: f.userId || undefined,
              group_id: f.groupId || undefined,
              q: f.q || undefined,
              limit: f.limit,
              offset: f.offset,
            },
          },
          signal,
        }),
      ),
  });
}

export function useMyAccess(expiringWithinDays: number | undefined, limit: number, offset: number) {
  return useQuery({
    queryKey: ['permissions', 'my-access', expiringWithinDays, limit, offset],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<Page<AccessEntry>>(
        api.GET('/api/v1/me/access', {
          params: { query: { expiring_within_days: expiringWithinDays, limit, offset } },
          signal,
        }),
      ),
  });
}
