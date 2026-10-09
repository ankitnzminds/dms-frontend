import type { Metadata } from 'next';
import { MetadataAdminView } from '@/features/metadata/metadata-admin-view';

export const metadata: Metadata = { title: 'Metadata fields' };

export default function Page() {
  return <MetadataAdminView />;
}
