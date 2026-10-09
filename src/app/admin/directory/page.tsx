import type { Metadata } from 'next';
import { DirectoryView } from '@/features/directory/directory-view';

export const metadata: Metadata = { title: 'Directory provisioning' };

export default function Page() {
  return <DirectoryView />;
}
