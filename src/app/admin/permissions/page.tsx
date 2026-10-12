import type { Metadata } from 'next';
import { AdminPermissionsView } from '@/features/permissions/admin-permissions-view';

export const metadata: Metadata = { title: 'Permissions' };

export default function Page() {
  return <AdminPermissionsView />;
}
