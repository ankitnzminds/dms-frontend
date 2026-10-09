'use client';

import { UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { dragHasFiles } from '@/features/upload/read-entries';
import { cn } from '@/lib/utils';
import { useUploadPickers } from './pickers';

/**
 * Wraps content; dropping OS files OR whole folders anywhere on it uploads into `folderId`
 * (rows that are folders handle their own drops and stop propagation). The Upload menu is the keyboard path.
 */
export function DropZone({
  folderId,
  enabled,
  children,
  className,
}: {
  folderId: string;
  enabled: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { dropInto } = useUploadPickers();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    // The surrounding page exposes the same function via the Upload menu, so this wrapper is a progressive enhancement.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn('relative', className)}
      data-testid="drop-zone"
      onDragEnter={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => dragHasFiles(e.dataTransfer) && e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        void dropInto(e.dataTransfer, folderId);
      }}
    >
      {children}
      {over && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent-soft/80"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-accent-soft-fg">
            <UploadCloud className="size-5" /> Drop files or folders to upload here
          </p>
        </div>
      )}
    </div>
  );
}
