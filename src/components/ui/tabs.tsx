'use client';

import { Tabs as T } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;

export function TabsList({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.List>) {
  return (
    <T.List
      className={cn('scroll-thin flex gap-1 overflow-x-auto border-b border-line', className)}
      {...p}
    />
  );
}

export function TabsTrigger({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        '-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted hover:text-text data-[state=active]:border-accent data-[state=active]:text-text',
        className,
      )}
      {...p}
    />
  );
}

export function TabsContent({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.Content>) {
  return <T.Content className={cn('pt-4 outline-none', className)} {...p} />;
}
