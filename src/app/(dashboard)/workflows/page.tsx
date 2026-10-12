import type { Metadata } from 'next';
import { MyWorkflowsView } from '@/features/workflow-studio/my-workflows-view';

export const metadata: Metadata = { title: 'Workflows' };

export default function WorkflowsPage() {
  return <MyWorkflowsView />;
}
