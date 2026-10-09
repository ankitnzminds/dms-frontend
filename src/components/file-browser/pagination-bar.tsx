import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PaginationBar({
  total,
  limit,
  offset,
  count,
  onOffsetChange,
}: {
  total: number;
  limit: number;
  offset: number;
  /** Items on the current page. */
  count: number;
  onOffsetChange: (offset: number) => void;
}) {
  if (total <= limit && offset === 0) {
    return total > 0 ? (
      <p className="px-3 py-2 text-xs text-muted" aria-live="polite">
        {total} item{total === 1 ? '' : 's'}
      </p>
    ) : null;
  }
  const from = total === 0 ? 0 : offset + 1;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
      <p className="text-xs text-muted" aria-live="polite">
        {from}-{offset + count} of {total}
      </p>
      <div className="flex gap-1">
        <Button size="sm" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>
          <ChevronLeft /> Previous
        </Button>
        <Button size="sm" disabled={offset + limit >= total} onClick={() => onOffsetChange(offset + limit)}>
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
