import { DocumentView } from '@/components/file-browser/document-view';

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentView documentId={documentId} />;
}
