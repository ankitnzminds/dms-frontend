import type { Metadata } from 'next';
import { CanvasEditor } from '@/features/automations/canvas-editor';

export const metadata: Metadata = { title: 'Workflow editor' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CanvasEditor id={id} />;
}
