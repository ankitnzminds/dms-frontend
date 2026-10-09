'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Switch } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { friendlyMessage } from '@/lib/api-client';
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
  type NotificationPreference,
} from './hooks';

const GROUPS: Record<NotificationPreference['group'], { label: string; hint: string }> = {
  sharing: { label: 'Sharing', hint: 'Someone shares with you, or a share is revoked or expires' },
  workflow: { label: 'Approvals', hint: 'Tasks assigned to you and approval outcomes' },
  signature: { label: 'Signatures', hint: 'Signature requests and completed signing' },
  document: { label: 'Documents', hint: 'A file finished scanning or was quarantined' },
  other: { label: 'Other', hint: 'Everything else' },
};

export function PreferencesView() {
  const q = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const [prefs, setPrefs] = useState<NotificationPreference[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the editable copy once the server data arrives
    if (q.data) setPrefs(q.data.preferences.map((p) => ({ ...p })));
  }, [q.data]);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending || !prefs) return <Skeleton className="h-64 max-w-2xl" />;
  const emailAvailable = q.data.email_available;
  const dirty = JSON.stringify(prefs) !== JSON.stringify(q.data.preferences);

  const set = (group: NotificationPreference['group'], key: 'in_app' | 'email', v: boolean) =>
    setPrefs((cur) => cur!.map((p) => (p.group === group ? { ...p, [key]: v } : p)));

  return (
    <>
      <PageHeader
        title="Notification preferences"
        description="Choose how you hear about activity."
        actions={
          <Link className="text-[13px] text-accent hover:underline" href="/notifications">
            Back to notifications
          </Link>
        }
      />
      {!emailAvailable && (
        <p
          role="status"
          className="mb-3 max-w-2xl rounded-md bg-info-soft px-3 py-2 text-[13px] text-info"
        >
          E-mail delivery is not set up on this service yet, so e-mail choices are saved but no
          e-mails are sent.
        </p>
      )}
      <Panel className="max-w-2xl p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(prefs, {
              onSuccess: () => toast.success('Preferences saved'),
              onError: (er) => toast.error(friendlyMessage(er)),
            });
          }}
        >
          <table className="w-full text-[13px]">
            <caption className="sr-only">Notification delivery by category</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-2 font-medium">
                  Category
                </th>
                <th scope="col" className="w-20 py-2 text-center font-medium">
                  In app
                </th>
                <th scope="col" className="w-20 py-2 text-center font-medium">
                  E-mail
                </th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.group} className="border-t border-line" data-testid="pref-row">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <span className="block font-medium">{GROUPS[p.group].label}</span>
                    <span className="block text-xs text-muted">{GROUPS[p.group].hint}</span>
                  </th>
                  <td className="text-center">
                    <Switch
                      aria-label={`${GROUPS[p.group].label}: in-app notifications`}
                      checked={p.in_app}
                      onCheckedChange={(c) => set(p.group, 'in_app', c)}
                    />
                  </td>
                  <td className="text-center">
                    <Switch
                      aria-label={`${GROUPS[p.group].label}: e-mail notifications`}
                      checked={p.email}
                      onCheckedChange={(c) => set(p.group, 'email', c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Save preferences
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
