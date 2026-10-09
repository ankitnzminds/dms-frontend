'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Inline "choose another name" form for name_conflict. */
export function RenameRetry({ initial, onSubmit }: { initial: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(() => suggest(initial));
  const id = useId();
  return (
    <form
      className="mt-1.5 flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && name.trim() !== initial) onSubmit(name.trim());
      }}
    >
      <label htmlFor={id} className="sr-only">
        New file name
      </label>
      <Input id={id} value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
      <Button type="submit" size="sm" variant="primary" disabled={!name.trim() || name.trim() === initial}>
        Upload as
      </Button>
    </form>
  );
}

export function suggest(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (1)${name.slice(dot)}` : `${name} (1)`;
}
