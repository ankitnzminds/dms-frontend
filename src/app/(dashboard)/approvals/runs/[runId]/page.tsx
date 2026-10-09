import { RunView } from '@/features/workflows/run-view';

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunView runId={runId} />;
}
