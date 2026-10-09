'use client';

import { Star } from 'lucide-react';
import { TreeListPage } from '@/components/file-browser/tree-list-page';
import { useFavorites } from '@/features/explorer/hooks';

export default function QuickAccessPage() {
  return (
    <TreeListPage
      title="Quick Access"
      description="Folders you pinned and files you starred."
      icon={Star}
      emptyTitle="Nothing pinned yet"
      emptyDescription="Use Add to Quick Access from a file or folder's menu."
      useData={useFavorites}
    />
  );
}
