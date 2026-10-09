import type { Metadata } from 'next';
import { QuarantineView } from '@/features/admin/quarantine-view';

export const metadata: Metadata = { title: 'Quarantine' };

export default function Page() {
  return <QuarantineView />;
}
