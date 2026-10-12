'use client';

import { ChatPanel } from './chat-panel';

/** Fills the content area exactly (same height as the menu); only the message list scrolls inside. */
export function AssistantView() {
  return (
    <div className="fill-main flex overflow-hidden rounded-xl border border-line bg-surface">
      <ChatPanel variant="page" />
    </div>
  );
}
