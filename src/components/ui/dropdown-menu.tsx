'use client';

import { DropdownMenu as M } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'animate-pop z-50 min-w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface p-1 shadow-pop',
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  reason,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Item> & { destructive?: boolean; reason?: string }) {
  return (
    <M.Item
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted',
        destructive && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
        className,
      )}
      title={props.disabled ? reason : undefined}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Label>) {
  return <M.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted', className)} {...p} />;
}

export function DropdownMenuSeparator({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Separator>) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...p} />;
}
