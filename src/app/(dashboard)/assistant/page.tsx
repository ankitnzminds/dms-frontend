import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AssistantView } from '@/features/chat/assistant-view';

export const metadata: Metadata = { title: 'Assistant' };

export default function Page() {
  return (
    <Suspense>
      <AssistantView />
    </Suspense>
  );
}
