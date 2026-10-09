'use client';

import { UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { useUploads } from '@/features/upload/upload-manager';
import { cn } from '@/lib/utils';

/** Wraps content; dropping files anywhere on it enqueues uploads (the Upload button is the keyboard path). */
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
  const { engine } = useUploads();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  if (!enabled) return <div className={className}>{children}</div>;
  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    // The surrounding page exposes the same function via the Upload button, so this wrapper is a progressive enhancement.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn('relative', className)}
      data-testid="drop-zone"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) engine.enqueueFiles(files, folderId);
      }}
    >
      {children}
      {over && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent-soft/80"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-accent-soft-fg">
            <UploadCloud className="size-5" /> Drop files to upload here
          </p>
        </div>
      )}
    </div>
  );
}
