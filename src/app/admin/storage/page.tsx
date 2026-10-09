import type { Metadata } from 'next';
import { StorageView } from '@/features/admin/storage-view';

export const metadata: Metadata = { title: 'Storage' };

export default function Page() {
  return <StorageView />;
}
