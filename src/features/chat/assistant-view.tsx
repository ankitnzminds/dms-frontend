'use client';

import { useSearchParams } from 'next/navigation';
import { ChatPanel } from './chat-panel';
import { useChatLauncher } from './launcher';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Fills the content area exactly (same height as the menu); only the message list scrolls inside. */
export function AssistantView() {
  // "?c=<id>" resumes the conversation that was open in the side drawer (the backend re-checks access).
  const c = useSearchParams().get('c');
  const { minimize, enabled } = useChatLauncher();
  return (
    <div className="fill-main flex overflow-hidden rounded-xl border border-line bg-surface">
      <ChatPanel
        variant="page"
        initialConversationId={c && UUID_RE.test(c) ? c : null}
        onMinimize={enabled ? minimize : undefined}
      />
    </div>
  );
}
