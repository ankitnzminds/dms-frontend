'use client';

import { KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { AccessTable } from './access-table';
import { useMyAccess } from './api';

const PAGE = 25;

export function MyAccessView() {
  const [expiring, setExpiring] = useState(false);
  const [offset, setOffset] = useState(0);
  const q = useMyAccess(expiring ? 14 : undefined, PAGE, offset);
  const items = q.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="My access"
        description="What has been given to you, directly, through your groups, or to the whole organization. Items you own in your own space are not listed."
        actions={
          <>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={expiring}
                onChange={(e) => {
                  setExpiring(e.target.checked);
                  setOffset(0);
                }}
              />
              Expiring within 14 days
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh"
              onClick={() => void q.refetch()}
            >
              <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />
            </Button>
          </>
        }
      />
      <Panel className="min-w-0">
        {q.isPending ? (
          <SkeletonRows rows={5} label="Loading your access" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title={
              expiring ? 'Nothing of yours expires soon' : 'Nothing has been shared with you yet'
            }
            description="Need access to something? Open it and use Request access."
          />
        ) : (
          <>
            <AccessTable items={items} showSubject={false} caption="Access granted to me" />
            <PaginationBar
              total={q.data?.total ?? 0}
              limit={PAGE}
              offset={offset}
              count={items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>
    </>
  );
}
