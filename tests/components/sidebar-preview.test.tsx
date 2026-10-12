import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarPreview } from '@/components/navigation/folder-tree';
import type { TreeItem } from '@/lib/api-client';

const make = (n: number): TreeItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    kind: i % 2 ? 'folder' : 'document',
    name: `item-${i}`,
    updated_at: new Date().toISOString(),
    permissions: ['view'],
    starred: false,
    locked: false,
    locked_by_me: false,
    is_team_folder: false,
  })) as TreeItem[];

const view = (items: TreeItem[], total: number) =>
  render(
    <SidebarPreview
      items={items}
      total={total}
      label="Recent items"
      testId="recent-list"
      viewAllHref="/recent"
    />,
  );

describe('sidebar preview (Recent / Quick Access)', () => {
  it('shows at most 10 items and a View all link to the full page when there are more', () => {
    view(make(12), 12);
    const list = screen.getByRole('list', { name: 'Recent items' });
    expect(within(list).getAllByRole('link')).toHaveLength(11); // 10 items + View all
    expect(screen.getByText('item-9')).toBeInTheDocument();
    expect(screen.queryByText('item-10')).toBeNull();
    expect(screen.getByRole('link', { name: 'View all (12)' })).toHaveAttribute('href', '/recent');
  });

  it('shows no View all when everything fits', () => {
    view(make(10), 10);
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(10);
  });

  it('links folders and files to their own pages', () => {
    view(make(2), 2);
    expect(screen.getByRole('link', { name: 'item-0' })).toHaveAttribute('href', '/documents/id-0');
    expect(screen.getByRole('link', { name: 'item-1' })).toHaveAttribute('href', '/files/id-1');
  });
});
