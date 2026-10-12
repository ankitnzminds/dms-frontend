'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requestDownloadUrl } from '@/features/files/download';
import { useDocument } from '@/features/files/hooks';
import { useUploads } from '@/features/upload/upload-manager';
import { friendlyMessage } from '@/lib/api-client';
import { can } from '@/lib/permissions';

const MAX_BYTES = 1024 * 1024; // larger files are better edited in the office editor

const TYPES: Record<string, string> = {
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
};

/**
 * Type straight into a text, Markdown or CSV file. Saving uploads the text as a NEW VERSION through the normal
 * upload pipeline (permissions, lock, virus scan, quota and version history all apply), so earlier versions
 * stay and can be compared or restored.
 */
export function TextEditor({
  documentId,
  name,
  onClose,
}: {
  documentId: string;
  name: string;
  onClose: () => void;
}) {
  const doc = useDocument(documentId);
  const { engine } = useUploads();
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    requestDownloadUrl(documentId, { inline: true })
      .then(({ url }) => fetch(url))
      .then(async (r) => {
        if (!r.ok) throw new Error('fetch failed');
        const buf = await r.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) throw new Error('too large');
        const t = new TextDecoder('utf-8').decode(buf);
        if (!cancelled) {
          setOriginal(t);
          setText(t);
        }
      })
      .catch((e: Error) => {
        if (!cancelled)
          setError(
            e.message === 'too large'
              ? 'This file is too large to edit here (limit 1 MB). Use the office editor.'
              : 'The file could not be loaded.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (original !== null) box.current?.focus();
  }, [original]);

  const d = doc.data;
  const lockedByOther = !!d?.lock && !d.lock.is_mine;
  const allowed = !!d && can(d.permissions, 'upload_version') && !lockedByOther;
  const reason = !d
    ? null
    : lockedByOther
      ? 'This file is locked by someone else, so it cannot be changed.'
      : !can(d.permissions, 'upload_version')
        ? 'You do not have permission to change this file.'
        : null;
  const dirty = original !== null && text !== original;

  const save = () => {
    if (!d || !allowed || !dirty) return;
    setSaving(true);
    try {
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
      const file = new File([text], name, { type: TYPES[ext] ?? 'text/plain' });
      if (file.size === 0) {
        toast.error('A file cannot be saved empty. Add some text first.');
        setSaving(false);
        return;
      }
      engine.enqueueVersion(file, d.id, d.latest_version_number);
      toast.message(`Saving "${name}" as a new version…`);
      onClose();
    } catch (e) {
      toast.error(friendlyMessage(e));
      setSaving(false);
    }
  };

  if (error)
    return (
      <div className="grid gap-2 p-4">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    );
  if (original === null || !d) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-2" data-testid="text-editor">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px]">
        <Badge>{allowed ? 'Editing' : 'Read only'}</Badge>
        <span className="text-muted">
          {reason ?? 'Saving creates a new version; earlier versions are kept.'}
        </span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!dirty || window.confirm('Discard your changes?')) onClose();
          }}
        >
          <X /> Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!allowed || !dirty || saving}
          data-testid="text-save"
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save />} Save
        </Button>
      </div>
      <textarea
        ref={box}
        aria-label={`Contents of ${name}`}
        className="min-h-[60vh] w-full resize-y rounded-md border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        value={text}
        readOnly={!allowed}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            save();
          }
        }}
        data-testid="text-editor-input"
      />
    </div>
  );
}
