import type { Metadata } from 'next';
import { PreferencesView } from '@/features/notifications/preferences-view';

export const metadata: Metadata = { title: 'Notification preferences' };

export default function Page() {
  return <PreferencesView />;
}
