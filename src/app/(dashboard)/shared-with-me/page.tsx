'use client';

import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { PreviewPanel } from '@/components/file-preview/preview-panel';
import { ReceivedShareRow } from '@/components/sharing/received-share-row';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
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
  const q = useReceivedShares({ includeInactive: inactive, limit: PAGE, offset });

  return (
    <>
      <PageHeader
        title="Shared with me"
        description="Items others shared with you. Access applies to the item only - the folders above it are shown as context and stay private unless you are separately given access."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="show-inactive" checked={inactive} onCheckedChange={(c) => (setInactive(c), setOffset(0))} />
            <Label htmlFor="show-inactive" className="font-normal">
              Show expired &amp; revoked
            </Label>
          </div>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading shared items" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Share2}
            title={inactive ? 'Nothing has been shared with you' : 'Nothing is shared with you right now'}
            description="When a colleague shares a file or folder with you, it appears here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-[13px]">
                <caption className="sr-only">Items shared with you</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">Name and location</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Shared by</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Permissions</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((s) => (
                    <ReceivedShareRow
                      key={s.share_id}
                      share={s}
                      onPreview={setPreview}
                      onDownload={(sh) => downloadDocument(sh.resource_id).catch((e) => toast.error(friendlyMessage(e)))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar total={q.data.total} limit={PAGE} offset={offset} count={q.data.items.length} onOffsetChange={setOffset} />
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
    </>
  );
}
