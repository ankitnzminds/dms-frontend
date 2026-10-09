'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type NotificationPage } from '@/lib/api-client';

export function useNotifications(
  opts: { limit?: number; offset?: number; unreadOnly?: boolean; poll?: boolean } = {},
) {
  const { limit = 20, offset = 0, unreadOnly = false, poll = false } = opts;
  return useQuery({
    queryKey: ['notifications', limit, offset, unreadOnly],
    queryFn: ({ signal }) =>
      call<NotificationPage>(
        api.GET('/api/v1/notifications', {
          params: { query: { limit, offset, unread_only: unreadOnly } },
          signal,
        }),
      ),
    refetchInterval: poll ? 30_000 : false,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.POST('/api/v1/notifications/{notification_id}/read', {
        params: { path: { notification_id: id } },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST('/api/v1/notifications/read-all')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export type NotificationPreference =
  import('@/lib/api-client').Schemas['NotificationPreferenceModel'];
type PrefsOut = import('@/lib/api-client').Schemas['NotificationPreferencesOut'];

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: ({ signal }) =>
      call<PrefsOut>(api.GET('/api/v1/notification-preferences', { signal })),
  });
}

export function useSaveNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPreference[]) =>
      call<PrefsOut>(api.PUT('/api/v1/notification-preferences', { body: prefs })),
    onSuccess: (data) => qc.setQueryData(['notification-preferences'], data),
  });
}
