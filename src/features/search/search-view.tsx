'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ItemIcon, StatusChip } from '@/components/file-browser/file-bits';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PathTrail } from '@/components/navigation/path-trail';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useSearch } from '@/features/files/hooks';
import { formatBytes, formatRelative } from '@/lib/format';

const PAGE = 25;
const TYPES = [
  ['', 'Any type'],
  ['application/pdf', 'PDF'],
  ['image/png', 'PNG image'],
  ['image/jpeg', 'JPEG image'],
  ['text/plain', 'Plain text'],
] as const;

/** Local midnight (start) / end of day to ISO for the date filters. */
const startIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const endIso = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : undefined);

export function SearchView() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const [kind, setKind] = useState<'' | 'folder' | 'document'>('');
  const [type, setType] = useState('');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [offset, setOffset] = useState(0);

  const res = useSearch({
    q,
    kind: kind || undefined,
    content_type: type || undefined,
    modified_after: startIso(after),
    modified_before: endIso(before),
    limit: PAGE,
    offset,
  });

  const reset = () => {
    setKind('');
    setType('');
    setAfter('');
    setBefore('');
    setOffset(0);
  };

  return (
    <>
      <PageHeader
        title={q ? `Results for “${q}”` : 'Search'}
        description="Search only returns items you are allowed to see."
      />
      <form className="mb-3 flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Search filters">
        <div className="grid gap-1">
          <Label htmlFor="f-kind">Show</Label>
          <Select id="f-kind" value={kind} onChange={(e) => (setKind(e.target.value as typeof kind), setOffset(0))}>
            <option value="">Files and folders</option>
            <option value="document">Files only</option>
            <option value="folder">Folders only</option>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-type">File type</Label>
          <Select id="f-type" value={type} disabled={kind === 'folder'} onChange={(e) => (setType(e.target.value), setOffset(0))}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-after">Modified after</Label>
          <Input id="f-after" type="date" value={after} max={before || undefined} onChange={(e) => (setAfter(e.target.value), setOffset(0))} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-before">Modified before</Label>
          <Input id="f-before" type="date" value={before} min={after || undefined} onChange={(e) => (setBefore(e.target.value), setOffset(0))} />
        </div>
        <Button variant="ghost" onClick={reset}>
          Reset filters
        </Button>
      </form>
      <Panel>
        {!q.trim() ? (
          <EmptyState icon={SearchX} title="Type in the search box" description="Search by file or folder name from the bar at the top." />
        ) : res.isPending ? (
          <SkeletonRows rows={5} label="Searching" />
        ) : res.isError ? (
          <ErrorState error={res.error} onRetry={() => res.refetch()} />
        ) : res.data.items.length === 0 ? (
          <EmptyState icon={SearchX} title="No matches" description="Try a different word or loosen the filters." />
        ) : (
          <>
            <ul className="divide-y divide-line" aria-label="Search results" aria-live="polite">
              {res.data.items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-2.5" data-testid="search-result">
                  <ItemIcon kind={r.kind} contentType={r.content_type} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        className="truncate text-[13px] font-medium hover:text-accent hover:underline"
                        href={r.kind === 'folder' ? `/files/${r.id}` : `/documents/${r.id}`}
                      >
                        {r.name}
                      </Link>
                      <StatusChip status={r.status} />
                    </p>
                    {r.breadcrumb.length > 0 && <PathTrail segments={r.breadcrumb} size="sm" className="mt-0.5" />}
                  </div>
                  <div className="hidden text-right text-xs text-muted sm:block">
                    <p>{r.kind === 'document' ? formatBytes(r.size_bytes) : 'Folder'}</p>
                    <p>{formatRelative(r.updated_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <PaginationBar total={res.data.total} limit={PAGE} offset={offset} count={res.data.items.length} onOffsetChange={setOffset} />
          </>
        )}
      </Panel>
    </>
  );
}
