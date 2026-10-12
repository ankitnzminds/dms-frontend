import type { Metadata } from 'next';
import { AutomationsView } from '@/features/automations/automations-view';

export const metadata: Metadata = { title: 'Manage Workflows' };

export default function Page() {
  return <AutomationsView />;
}
