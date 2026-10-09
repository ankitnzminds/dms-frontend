import { SignatureRequestView } from '@/features/signatures/request-view';

export default async function Page({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <SignatureRequestView id={requestId} />;
}
