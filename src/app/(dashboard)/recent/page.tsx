'use client';

import { Clock } from 'lucide-react';
import { TreeListPage } from '@/components/file-browser/tree-list-page';
import { useRecent } from '@/features/files/hooks';

export default function RecentPage() {
  return (
    <TreeListPage
      title="Recent"
      description="Documents you recently previewed or downloaded."
      icon={Clock}
      emptyTitle="Nothing opened recently"
      emptyDescription="Documents you preview or download will show up here."
      useData={useRecent}
    />
  );
}
