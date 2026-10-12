import type { Metadata } from 'next';
import { TeamFoldersView } from '@/features/team-folders/team-folders-view';

export const metadata: Metadata = { title: 'Manage Team Folders' };

export default function Page() {
  return <TeamFoldersView />;
}
