'use client';

import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/states';
import type { Page, TreeItem } from '@/lib/api-client';
import { ResourceActionsProvider } from '@/components/explorer/resource-actions';
import { ItemsTable } from './items-table';

const PAGE_SIZE = 25;

/** Shared shell for Recent / Starred: a paginated list of tree items with row actions. */
export function TreeListPage({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
  useData,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  useData: (
    limit: number,
    offset: number,
  ) => {
    data: Page<TreeItem> | undefined;
    isPending: boolean;
    error: unknown;
    refetch: () => unknown;
  };
}) {
  const [offset, setOffset] = useState(0);
  const q = useData(PAGE_SIZE, offset);
  return (
    <ResourceActionsProvider>
      <PageHeader title={title} description={description} />
      <Panel>
        <ItemsTable
          caption={title}
          items={q.data?.items}
          isLoading={q.isPending}
          error={q.error}
          onRetry={() => q.refetch()}
          page={
            q.data && { total: q.data.total, limit: PAGE_SIZE, offset, onOffsetChange: setOffset }
          }
          emptyState={<EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />}
        />
      </Panel>
    </ResourceActionsProvider>
  );
}
