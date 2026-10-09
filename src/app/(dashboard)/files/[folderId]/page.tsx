import { Explorer } from '@/components/explorer/explorer';

export default async function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return <Explorer key={folderId} folderId={folderId} />;
}
