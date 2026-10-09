'use client';

import { CheckCheck, ExternalLink, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Full-screen overlay hosting the provider's signing page. `url` is a SECRET signing link: it is only
 * placed in the iframe `src` (and opened on demand), never rendered as text, logged, stored or put in
 * history. The parent drops it when the overlay closes.
 */
export function SigningOverlay({
  url,
  title,
  onClose,
  onFinished,
  finishing,
}: {
  url: string;
  title: string;
  onClose: () => void;
  onFinished: () => void;
  finishing: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Sign ${title}`}
      tabIndex={-1}
      className="fixed inset-0 z-[80] flex flex-col bg-bg outline-none"
      data-testid="signing-overlay"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Sign: {title}</h2>
        <Button
          size="sm"
          onClick={() => {
            const w = window.open(url, '_blank', 'noopener,noreferrer');
            setPopupBlocked(!w);
          }}
        >
          <ExternalLink /> Open in new tab
        </Button>
        <Button size="sm" variant="primary" disabled={finishing} onClick={onFinished}>
          {finishing ? <Loader2 className="animate-spin" /> : <CheckCheck />} I&apos;ve finished
          signing
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close signing window" onClick={onClose}>
          <X />
        </Button>
      </div>
      {popupBlocked && (
        <p role="status" className="bg-warn-soft px-3 py-1 text-xs text-warn">
          Your browser blocked the new tab. Allow pop-ups for this site, or sign in this window.
        </p>
      )}
      <iframe
        title={`Signing page for ${title}`}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 bg-white"
      />
    </div>
  );
}
