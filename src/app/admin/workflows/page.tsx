import type { Metadata } from 'next';
import { WorkflowsAdminView } from '@/features/workflows/workflows-admin-view';

export const metadata: Metadata = { title: 'Workflows' };

export default function Page() {
  return <WorkflowsAdminView />;
}
