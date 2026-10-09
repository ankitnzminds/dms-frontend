import {
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderLock,
  ShieldAlert,
  AlertOctagon,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function ItemIcon({
  kind,
  contentType,
  className,
  teamFolder,
}: {
  kind: 'folder' | 'document';
  contentType?: string | null;
  className?: string;
  teamFolder?: boolean;
}) {
  const cls = cn('size-4 shrink-0', className);
  if (kind === 'folder') {
    const F = teamFolder ? FolderLock : Folder;
    return <F className={cn(cls, 'text-accent')} aria-hidden />;
  }
  const ct = (contentType ?? '').toLowerCase();
  if (ct.startsWith('image/')) return <FileImage className={cn(cls, 'text-info')} aria-hidden />;
  if (ct.includes('spreadsheet') || ct.includes('excel') || ct === 'text/csv')
    return <FileSpreadsheet className={cn(cls, 'text-ok')} aria-hidden />;
  if (ct.includes('zip') || ct.includes('compressed'))
    return <FileArchive className={cn(cls, 'text-warn')} aria-hidden />;
  if (ct.includes('pdf') || ct.startsWith('text/') || ct.includes('word'))
    return <FileText className={cn(cls, 'text-muted')} aria-hidden />;
  return <FileIcon className={cn(cls, 'text-muted')} aria-hidden />;
}

/** Honest document state. `available` renders nothing. */
export function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status || status === 'available') return null;
  if (status === 'processing')
    return (
      <Badge tone="warn" className="stripe-progress" data-status="processing">
        <Loader2 className="animate-spin" aria-hidden /> Scanning…
      </Badge>
    );
  if (status === 'quarantined')
    return (
      <Badge tone="danger" data-status="quarantined">
        <ShieldAlert aria-hidden /> Quarantined
      </Badge>
    );
  if (status === 'failed')
    return (
      <Badge tone="danger" data-status="failed">
        <AlertOctagon aria-hidden /> Failed
      </Badge>
    );
  return <Badge>{status}</Badge>;
}
