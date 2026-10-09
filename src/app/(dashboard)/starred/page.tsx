'use client';

import { Star } from 'lucide-react';
import { TreeListPage } from '@/components/file-browser/tree-list-page';
import { useStarred } from '@/features/files/hooks';

export default function StarredPage() {
  return (
    <TreeListPage
      title="Starred"
      description="Files you starred for quick access."
      icon={Star}
      emptyTitle="No starred files"
      emptyDescription="Star a file from its actions menu to pin it here."
      useData={useStarred}
    />
  );
}
