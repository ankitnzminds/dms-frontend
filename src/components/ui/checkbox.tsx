'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as C, Switch as S } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Checkbox({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent text-accent-fg disabled:opacity-50',
        className,
      )}
      {...p}
    >
      <C.Indicator>
        {p.checked === 'indeterminate' ? <Minus className="size-3" /> : <Check className="size-3" />}
      </C.Indicator>
    </C.Root>
  );
}

export function Switch({ className, ...p }: React.ComponentPropsWithoutRef<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50',
        className,
      )}
      {...p}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}
