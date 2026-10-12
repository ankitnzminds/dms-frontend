'use client';

import { Search, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { ResourceActionsProvider } from '@/components/explorer/resource-actions';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PreviewPanel } from '@/components/file-preview/preview-panel';
import { ReceivedShareRow } from '@/components/sharing/received-share-row';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/checkbox';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { downloadDocument } from '@/features/files/download';
import { useReceivedShares } from '@/features/sharing/hooks';
import { friendlyMessage, type ReceivedShare } from '@/lib/api-client';

const PAGE = 25;

export default function SharedWithMePage() {
  const [inactive, setInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<ReceivedShare | null>(null);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  // No server-side search here: while searching, load up to 200 shares and match them in the page
  // (item name, who shared it, or where it sits).
  const q = useReceivedShares({
    includeInactive: inactive,
    limit: term ? 200 : PAGE,
    offset: term ? 0 : offset,
  });
  const items = useMemo(() => {
    const all = q.data?.items ?? [];
    if (!term) return all;
    return all.filter((s) =>
      [
        s.name,
        s.shared_by.display_name ?? '',
        s.shared_by.email ?? '',
        ...s.breadcrumb.map((b) => b.name ?? ''),
      ].some((v) => v.toLowerCase().includes(term)),
    );
  }, [q.data, term]);

  return (
    <ResourceActionsProvider>
      <PageHeader
        title="Shared with me"
        description="Items others shared with you. Access applies to the item only - the folders above it are shown as context and stay private unless you are separately given access."
        actions={
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive"
              checked={inactive}
              onCheckedChange={(c) => (setInactive(c), setOffset(0))}
            />
            <Label htmlFor="show-inactive" className="font-normal">
              Show expired &amp; revoked
            </Label>
          </div>
        }
      />
      <div className="mb-3 flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search files and folders"
            placeholder="Search files and folders"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="shared-with-me-search"
          />
        </div>
        {term && q.data && (
          <p className="text-xs text-muted" aria-live="polite">
            {items.length} of {q.data.items.length}
            {q.data.total > q.data.items.length ? ' (the first 200 shares)' : ''}
          </p>
        )}
      </div>
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading shared items" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Share2}
            title={
              term
                ? 'No shared items match your search'
                : inactive
                  ? 'Nothing has been shared with you'
                  : 'Nothing is shared with you right now'
            }
            description={
              term
                ? 'Try another file or folder name, or a person.'
                : 'When a colleague shares a file or folder with you, it appears here.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-[13px]">
                <caption className="sr-only">Items shared with you</caption>
                <colgroup>
                  <col />
                  <col className="hidden w-[20%] lg:table-column" />
                  <col className="hidden w-[26%] md:table-column" />
                  <col className="w-32" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium text-muted">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Name and location
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
                      Shared by
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">
                      Permissions
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <ReceivedShareRow
                      key={s.share_id}
                      share={s}
                      interactive
                      onPreview={setPreview}
                      onDownload={(sh) =>
                        downloadDocument(sh.resource_id).catch((e) =>
                          toast.error(friendlyMessage(e)),
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {!term && (
              <PaginationBar
                total={q.data.total}
                limit={PAGE}
                offset={offset}
                count={q.data.items.length}
                onOffsetChange={setOffset}
              />
            )}
          </>
        )}
      </Panel>
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent title={preview.name} className="max-w-4xl">
            <DialogBody>
              <PreviewPanel
                documentId={preview.resource_id}
                contentType={preview.content_type ?? 'application/octet-stream'}
                name={preview.name}
                canDownload={preview.actions.includes('download')}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </ResourceActionsProvider>
  );
}
