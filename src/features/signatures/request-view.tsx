'use client';

import { PageHeader } from '@/components/layout/page-header';
import { SignatureRequestCard } from '@/components/signatures/request-card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { isAdminRole } from '@/lib/permissions';
import { useSignatureRequest } from './hooks';

export function SignatureRequestView({ id }: { id: string }) {
  const q = useSignatureRequest(id, false);
  const { data: me } = useMe();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-48" />;
  const r = q.data;
  return (
    <>
      <PageHeader title={r.title} description="Signature request" />
      <SignatureRequestCard
        initial={r}
        canCancel={isAdminRole(me?.role) || r.requested_by.id === me?.user_id}
      />
    </>
  );
}
