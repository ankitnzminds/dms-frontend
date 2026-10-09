'use client';

import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/tooltip';
import { useUploads } from '@/features/upload/upload-manager';

/** Opens the file chooser and enqueues files into `folderId`. */
export function UploadButton({
  folderId,
  disabledReason,
  variant = 'primary',
}: {
  folderId: string;
  disabledReason?: string | null;
  variant?: 'primary' | 'secondary';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { engine } = useUploads();
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose files to upload"
        data-testid="upload-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) engine.enqueueFiles(files, folderId);
          e.target.value = '';
        }}
      />
      <DisabledReason reason={disabledReason}>
        <Button variant={variant} disabled={!!disabledReason} onClick={() => ref.current?.click()}>
          <Upload /> Upload
        </Button>
      </DisabledReason>
    </>
  );
}
