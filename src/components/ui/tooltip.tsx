'use client';

import { Tooltip as T } from 'radix-ui';
import * as React from 'react';

export const TooltipProvider = T.Provider;

/** Tooltip wrapper. For disabled controls pass `asSpan` so hover/focus still works. */
export function Tip({
  label,
  children,
  side = 'top',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="animate-fade z-[70] max-w-64 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-pop"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/**
 * Wraps a (possibly disabled) control so the reason is discoverable by hover AND keyboard.
 * When `reason` is falsy the child is rendered untouched.
 */
export function DisabledReason({
  reason,
  children,
}: {
  reason?: string | null;
  children: React.ReactNode;
}) {
  if (!reason) return <>{children}</>;
  return (
    <Tip label={reason}>
      <span tabIndex={0} className="inline-flex rounded-md" aria-label={reason}>
        {children}
      </span>
    </Tip>
  );
}
