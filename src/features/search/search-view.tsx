'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Thumbnail } from '@/components/file-preview/thumbnail';
import { Snippet } from './snippet';
import { useMetadataDefinitions } from '@/features/metadata/hooks';
import { X } from 'lucide-react';
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
  const [scope, setScope] = useState<'all' | 'name' | 'content'>('all');
  const defs = useMetadataDefinitions();
  const [metaKey, setMetaKey] = useState('');
  const [metaValue, setMetaValue] = useState('');
  const [metas, setMetas] = useState<string[]>([]);

  const res = useSearch({
    q,
    scope,
    meta: metas.length ? metas : undefined,
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
    setScope('all');
    setMetas([]);
  };

  return (
    <>
      <PageHeader
        title={q ? `Results for “${q}”` : 'Search'}
        description="Search only returns items you are allowed to see."
      />
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Search filters"
      >
        <div className="grid gap-1">
          <Label htmlFor="f-scope">Search in</Label>
          <Select
            id="f-scope"
            value={scope}
            onChange={(e) => (setScope(e.target.value as typeof scope), setOffset(0))}
          >
            <option value="all">Names and contents</option>
            <option value="name">Names only</option>
            <option value="content">Contents only</option>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-kind">Show</Label>
          <Select
            id="f-kind"
            value={kind}
            onChange={(e) => (setKind(e.target.value as typeof kind), setOffset(0))}
          >
            <option value="">Files and folders</option>
            <option value="document">Files only</option>
            <option value="folder">Folders only</option>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-type">File type</Label>
          <Select
            id="f-type"
            value={type}
            disabled={kind === 'folder'}
            onChange={(e) => (setType(e.target.value), setOffset(0))}
          >
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-after">Modified after</Label>
          <Input
            id="f-after"
            type="date"
            value={after}
            max={before || undefined}
            onChange={(e) => (setAfter(e.target.value), setOffset(0))}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="f-before">Modified before</Label>
          <Input
            id="f-before"
            type="date"
            value={before}
            min={after || undefined}
            onChange={(e) => (setBefore(e.target.value), setOffset(0))}
          />
        </div>
        <Button variant="ghost" onClick={reset}>
          Reset filters
        </Button>
        {(defs.data?.length ?? 0) > 0 && (
          <fieldset className="flex w-full flex-wrap items-end gap-3">
            <legend className="mb-1 text-[13px] font-medium">Metadata filter</legend>
            <div className="grid gap-1">
              <Label htmlFor="f-mkey">Field</Label>
              <Select id="f-mkey" value={metaKey} onChange={(e) => setMetaKey(e.target.value)}>
                <option value="">Choose a field…</option>
                {defs.data!.map((d) => (
                  <option key={d.id} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-mval">Value</Label>
              <Input id="f-mval" value={metaValue} onChange={(e) => setMetaValue(e.target.value)} />
            </div>
            <Button
              disabled={!metaKey || !metaValue.trim() || metas.length >= 5}
              onClick={() => {
                const f = `${metaKey}:${metaValue.trim()}`;
                if (!metas.includes(f)) setMetas([...metas, f]);
                setMetaValue('');
                setOffset(0);
              }}
            >
              Add filter
            </Button>
            {metas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Active metadata filters">
                {metas.map((m) => (
                  <li
                    key={m}
                    className="inline-flex items-center gap-1 rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-fg"
                  >
                    {m}
                    <button
                      type="button"
                      aria-label={`Remove filter ${m}`}
                      onClick={() => (setMetas(metas.filter((x) => x !== m)), setOffset(0))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}
      </form>
      <Panel>
        {!q.trim() ? (
          <EmptyState
            icon={SearchX}
            title="Type in the search box"
            description="Search by file or folder name from the bar at the top."
          />
        ) : res.isPending ? (
          <SkeletonRows rows={5} label="Searching" />
        ) : res.isError ? (
          <ErrorState error={res.error} onRetry={() => res.refetch()} />
        ) : res.data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matches"
            description="Try a different word or loosen the filters."
          />
        ) : (
          <>
            <ul className="divide-y divide-line" aria-label="Search results" aria-live="polite">
              {res.data.items.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start gap-3 px-3 py-2.5"
                  data-testid="search-result"
                >
                  {r.kind === 'document' &&
                  r.content_type?.startsWith('image/') &&
                  r.status === 'available' ? (
                    <Thumbnail
                      documentId={r.id}
                      name={r.name}
                      className="mt-0.5 size-10"
                      fallback={
                        <ItemIcon kind={r.kind} contentType={r.content_type} className="mt-0.5" />
                      }
                    />
                  ) : (
                    <ItemIcon kind={r.kind} contentType={r.content_type} className="mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        className="truncate text-[13px] font-medium hover:text-accent hover:underline"
                        href={r.kind === 'folder' ? `/files/${r.id}` : `/documents/${r.id}`}
                      >
                        {r.name}
                      </Link>
                      <StatusChip status={r.status} />
                      {r.match && (
                        <Badge
                          tone={r.match === 'name' ? 'neutral' : 'accent'}
                          data-testid="match-badge"
                        >
                          {r.match === 'both'
                            ? 'Name and content'
                            : r.match === 'content'
                              ? 'Content match'
                              : 'Name match'}
                        </Badge>
                      )}
                    </p>
                    {r.snippet && (
                      <p className="mt-0.5 text-xs text-muted">
                        <Snippet text={r.snippet} />
                      </p>
                    )}
                    {r.breadcrumb.length > 0 && (
                      <PathTrail segments={r.breadcrumb} size="sm" className="mt-0.5" />
                    )}
                  </div>
                  <div className="hidden text-right text-xs text-muted sm:block">
                    <p>{r.kind === 'document' ? formatBytes(r.size_bytes) : 'Folder'}</p>
                    <p>{formatRelative(r.updated_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <PaginationBar
              total={res.data.total}
              limit={PAGE}
              offset={offset}
              count={res.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>
    </>
  );
}
