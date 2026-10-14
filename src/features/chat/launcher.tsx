'use client';

import { Bot, Maximize2, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog as D } from 'radix-ui';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChatPanel, type ChatContext } from './chat-panel';
import { useChatStatus } from './hooks';

interface Launcher {
  open: (ctx?: ChatContext | null, conversationId?: string | null) => void;
  close: () => void;
  /** From the full-page assistant: go back to the page the user came from and reopen the side drawer there. */
  minimize: (conversationId: string | null) => void;
  enabled: boolean;
}
const Ctx = createContext<Launcher | null>(null);
export const useChatLauncher = () =>
  useContext(Ctx) ?? { open: () => {}, close: () => {}, minimize: () => {}, enabled: false };

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
  const router = useRouter();
  const activeConversation = useRef<string | null>(null);
  const status = useChatStatus();
  const enabled = !!status.data?.enabled;
  const [openState, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  /** Where the full-screen view was opened from, so Minimize can return there. */
  const returnTo = useRef<string | null>(null);
  const returnCtx = useRef<ChatContext | null>(null);

  const open = useCallback((c?: ChatContext | null, conversationId?: string | null) => {
    setCtx(c ?? null);
    setConversationId(conversationId ?? null);
    setNonce((n) => n + 1);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const onActiveChange = useCallback((id: string | null) => {
    activeConversation.current = id;
  }, []);
  // Floating window: draggable by its header, kept inside the viewport (offset from its default
  // bottom-right spot; the window is full-screen on phones, where dragging is off).
  const winRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    if (window.matchMedia('(max-width: 639px)').matches) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = winRef.current;
    if (!d || !el) return;
    // Clamp so the whole window stays visible: it sits at right/bottom 20px by default.
    const r = el.getBoundingClientRect();
    const baseLeft = r.left - offset.x;
    const baseTop = r.top - offset.y;
    const x = Math.min(
      window.innerWidth - r.width - baseLeft - 8,
      Math.max(-baseLeft + 8, d.ox + e.clientX - d.px),
    );
    const y = Math.min(
      window.innerHeight - r.height - baseTop - 8,
      Math.max(-baseTop + 8, d.oy + e.clientY - d.py),
    );
    setOffset({ x, y });
  };
  const onDragEnd = () => {
    drag.current = null;
  };
  const openFullScreen = () => {
    const id = activeConversation.current;
    setOpen(false);
    returnTo.current = pathname;
    returnCtx.current = ctx;
    router.push(id ? `/assistant?c=${id}` : '/assistant');
  };
  const minimize = useCallback(
    (id: string | null) => {
      const to = returnTo.current ?? '/dashboard';
      const keep = returnCtx.current ?? contextFromPath(to.split('?')[0] ?? to);
      returnTo.current = null;
      returnCtx.current = null;
      router.push(to);
      open(keep, id);
    },
    [router, open],
  );
  const value = useMemo(
    () => ({ open, close, minimize, enabled }),
    [open, close, minimize, enabled],
  );
  const onAssistantPage = pathname.startsWith('/assistant');

  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && !onAssistantPage && !openState && (
        <button
          type="button"
          className="chat-float fixed bottom-5 right-5 z-30 size-16 rounded-[1.1rem] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Ask the assistant"
          title="Ask the assistant"
          data-testid="chat-launcher"
          onClick={() => open(contextFromPath(pathname))}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand image */}
          <img
            src="/assistant-icon.png"
            alt=""
            width={64}
            height={61}
            className="size-full object-contain drop-shadow-[0_8px_16px_rgba(37,99,235,0.45)]"
            draggable={false}
          />
        </button>
      )}
      {/* Non-modal on purpose: no overlay, no scroll lock and no focus trap, so the document behind the
          drawer stays scrollable and clickable while the user chats about it. It closes with the X or Esc. */}
      <D.Root open={openState} onOpenChange={setOpen} modal={false}>
        <D.Portal>
          <D.Content
            aria-describedby={undefined}
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onFocusOutside={(e) => e.preventDefault()}
            ref={winRef}
            style={{ translate: `${offset.x}px ${offset.y}px` }}
            className="animate-fade fixed z-50 flex flex-col overflow-hidden border border-line bg-surface shadow-pop outline-none max-sm:inset-0 sm:right-5 sm:bottom-5 sm:h-[min(640px,calc(100vh-2.5rem))] sm:w-[400px] sm:rounded-2xl"
            data-testid="chat-drawer"
          >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer-only move handle; every action inside it is a real button */}
            <div
              className="flex cursor-grab touch-none items-center justify-between border-b border-line px-3 py-2 select-none active:cursor-grabbing"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              onDoubleClick={() => setOffset({ x: 0, y: 0 })}
              title="Drag to move · double-click to reset"
            >
              <D.Title className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="size-4" aria-hidden /> Assistant
              </D.Title>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Open assistant in full screen"
                  title="Open in full screen"
                  data-testid="chat-fullscreen"
                  onClick={openFullScreen}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                >
                  <Maximize2 className="size-4" />
                </button>
                <D.Close
                  aria-label="Close assistant"
                  className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                >
                  <X className="size-4" />
                </D.Close>
              </div>
            </div>
            <ChatPanel
              key={nonce}
              variant="drawer"
              context={ctx}
              initialConversationId={conversationId}
              onActiveChange={onActiveChange}
              onClearContext={() => setCtx(null)}
            />
          </D.Content>
        </D.Portal>
      </D.Root>
    </Ctx.Provider>
  );
}
