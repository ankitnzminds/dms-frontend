'use client';

import { AlertDialog as A } from 'radix-ui';
import * as React from 'react';
import { Button } from './button';
import { Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

/** Accessible confirmation (role=alertdialog, focus trapped, Escape cancels). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <A.Root open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <A.Portal>
        <A.Overlay className="animate-fade fixed inset-0 z-[60] bg-black/45" />
        <A.Content className="animate-pop fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-pop">
          <A.Title className="text-[15px] font-semibold">{title}</A.Title>
          <A.Description asChild>
            <div className="mt-1.5 text-[13px] text-muted">{description}</div>
          </A.Description>
          {children}
          <div className="mt-5 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </A.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
