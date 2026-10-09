'use client';

import { PageHeader } from '@/components/layout/page-header';
import { ChatPanel } from './chat-panel';

export function AssistantView() {
  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask questions about your documents and let the assistant prepare changes for you to confirm."
      />
      <div className="flex h-[calc(100dvh-12rem)] min-h-96 overflow-hidden rounded-lg border border-line bg-surface">
        <ChatPanel variant="page" />
      </div>
    </>
  );
}
