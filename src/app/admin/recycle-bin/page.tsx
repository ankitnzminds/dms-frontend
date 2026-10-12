import type { Metadata } from 'next';
import { RecycleBinView } from '@/features/recycle-bin/recycle-bin-view';

export const metadata: Metadata = { title: 'Recycle Bin' };

export default function Page() {
  return <RecycleBinView />;
}
