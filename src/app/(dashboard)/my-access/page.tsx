import type { Metadata } from 'next';
import { MyAccessView } from '@/features/permissions/my-access-view';

export const metadata: Metadata = { title: 'My access' };

export default function Page() {
  return <MyAccessView />;
}
