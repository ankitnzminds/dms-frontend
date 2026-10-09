'use client';

import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideTitle,
  side,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof D.Content>, 'title'> & {
  title: string;
  description?: string;
  hideTitle?: boolean;
  /** "left" renders a mobile drawer. */
  side?: 'left';
}) {
  return (
    <D.Portal>
      <D.Overlay className="animate-fade fixed inset-0 z-50 bg-black/45" />
      <D.Content
        className={cn(
          side === 'left'
            ? 'animate-slide-in fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line bg-surface shadow-pop'
            : 'animate-pop fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] [&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-pop',
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            hideTitle ? 'sr-only' : 'flex items-start gap-3 border-b border-line px-5 py-3.5',
          )}
        >
          <div className="min-w-0 flex-1">
            <D.Title className="text-[15px] font-semibold leading-6">{title}</D.Title>
            {description ? (
              <D.Description className="text-[13px] text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          {!hideTitle && (
            <D.Close
              aria-label="Close"
              className="-mr-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4', className)} {...p} />
  );
}

export function DialogFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3',
        className,
      )}
      {...p}
    />
  );
}
