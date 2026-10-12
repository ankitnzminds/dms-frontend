import type { Metadata } from 'next';
import { PolicyListView } from '@/features/policies/policy-list-view';

export const metadata: Metadata = { title: 'Policies' };

export default function Page() {
  return <PolicyListView />;
}
