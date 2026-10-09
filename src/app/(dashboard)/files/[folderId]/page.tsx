import { FolderView } from '@/components/file-browser/folder-view';

export default async function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return <FolderView key={folderId} folderId={folderId} />;
}
