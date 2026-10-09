import type { Metadata } from 'next';
import { AdminsView } from '@/features/admin-users/admins-view';

export const metadata: Metadata = { title: 'Admins' };

export default function Page() {
  return <AdminsView />;
}
