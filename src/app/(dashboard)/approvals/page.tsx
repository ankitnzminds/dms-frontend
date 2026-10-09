import type { Metadata } from 'next';
import { ApprovalsView } from '@/features/workflows/approvals-view';

export const metadata: Metadata = { title: 'My approvals' };

export default function Page() {
  return <ApprovalsView />;
}
