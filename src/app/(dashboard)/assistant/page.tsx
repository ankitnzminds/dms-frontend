import type { Metadata } from 'next';
import { AssistantView } from '@/features/chat/assistant-view';

export const metadata: Metadata = { title: 'Assistant' };

export default function Page() {
  return <AssistantView />;
}
