'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/states';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useRootFolder } from '@/features/files/hooks';

export default function MyFilesPage() {
  const root = useRootFolder();
  const router = useRouter();
  useEffect(() => {
    if (root.data) router.replace(`/files/${root.data.id}`);
  }, [root.data, router]);
  if (root.isError) return <ErrorState error={root.error} onRetry={() => root.refetch()} />;
  return <SkeletonRows rows={5} label="Opening your files" />;
}
