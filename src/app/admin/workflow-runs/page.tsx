import type { Metadata } from 'next';
import { WorkflowRunsView } from '@/features/workflow-studio/workflow-runs-view';

export const metadata: Metadata = { title: 'Workflow runs' };

export default function Page() {
  return <WorkflowRunsView />;
}
