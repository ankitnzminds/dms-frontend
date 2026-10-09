import type { Metadata } from 'next';
import { UsersView } from '@/features/admin-users/users-view';

export const metadata: Metadata = { title: 'Users' };

export default function Page() {
  return <UsersView />;
}
