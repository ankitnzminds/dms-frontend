import type { Metadata } from 'next';
import { GroupsView } from '@/features/admin/groups-view';

export const metadata: Metadata = { title: 'Groups' };

export default function Page() {
  return <GroupsView />;
}
