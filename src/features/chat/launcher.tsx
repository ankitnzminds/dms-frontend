'use client';

import { Bot, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Dialog as D } from 'radix-ui';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChatPanel, type ChatContext } from './chat-panel';
import { useChatStatus } from './hooks';

interface Launcher {
  open: (ctx?: ChatContext | null) => void;
  close: () => void;
  enabled: boolean;
}
const Ctx = createContext<Launcher | null>(null);
export const useChatLauncher = () =>
  useContext(Ctx) ?? { open: () => {}, close: () => {}, enabled: false };

const UUID = '[0-9a-f-]{36}';
/** Context from the current route (stable ids only; the backend re-authorizes every use). */
export function contextFromPath(pathname: string): ChatContext | null {
  const d = pathname.match(new RegExp(`^/documents/(${UUID})`, 'i'));
  if (d) return { documentId: d[1] };
  const f = pathname.match(new RegExp(`^/files/(${UUID})`, 'i'));
  if (f) return { folderId: f[1] };
  return null;
}

/** Global assistant entry: floating button + side drawer. Hidden when the assistant is disabled. */
export function ChatLauncherProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const status = useChatStatus();
  const enabled = !!status.data?.enabled;
  const [openState, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [nonce, setNonce] = useState(0);

  const open = useCallback((c?: ChatContext | null) => {
    setCtx(c ?? null);
    setNonce((n) => n + 1);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, close, enabled }), [open, close, enabled]);
  const onAssistantPage = pathname.startsWith('/assistant');

  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && !onAssistantPage && (
        <Button
          variant="primary"
          size="lg"
          className="fixed bottom-4 right-4 z-30 rounded-full shadow-pop"
          aria-label="Ask the assistant"
          data-testid="chat-launcher"
          onClick={() => open(contextFromPath(pathname))}
        >
          <Bot /> <span className="hidden sm:inline">Assistant</span>
        </Button>
      )}
      <D.Root open={openState} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="animate-fade fixed inset-0 z-50 bg-black/30" />
          <D.Content
            aria-describedby={undefined}
            className="animate-fade fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-pop outline-none"
            data-testid="chat-drawer"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <D.Title className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="size-4" aria-hidden /> Assistant
              </D.Title>
              <D.Close
                aria-label="Close assistant"
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="size-4" />
              </D.Close>
            </div>
            <ChatPanel
              key={nonce}
              variant="drawer"
              context={ctx}
              onClearContext={() => setCtx(null)}
            />
          </D.Content>
        </D.Portal>
      </D.Root>
    </Ctx.Provider>
  );
}
