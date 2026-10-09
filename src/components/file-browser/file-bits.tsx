import { ShieldAlert, AlertOctagon, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TypeIcon } from '@/components/ui/file-icons';

/** Folder / file-type icon (colour-coded by type). `size` is in px. */
export function ItemIcon({
  kind,
  contentType,
  name,
  className,
  size = 20,
}: {
  kind: 'folder' | 'document';
  contentType?: string | null;
  name?: string | null;
  className?: string;
  teamFolder?: boolean;
  size?: number;
}) {
  return <TypeIcon kind={kind} contentType={contentType} name={name} size={size} className={className} />;
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
