import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemActionsProvider } from '@/components/file-browser/item-actions';
import { ItemsTable } from '@/components/file-browser/items-table';
import { ApiError, type TreeItem } from '@/lib/api-client';
import { renderApp } from './test-utils';

const ALL: TreeItem['permissions'] = [
  'view',
  'preview',
  'download',
  'rename',
  'move',
  'copy',
  'share',
  'manage_access',
  'delete',
  'create_child',
];

const item = (over: Partial<TreeItem>): TreeItem => ({
  id: 'i1',
  kind: 'document',
  name: 'plan.pdf',
  updated_at: new Date().toISOString(),
  permissions: ALL,
  size_bytes: 1024,
  content_type: 'application/pdf',
  status: 'available',
  starred: false,
  locked: false,
  locked_by_me: false,
  is_team_folder: false,
  ...over,
});

function table(props: Partial<React.ComponentProps<typeof ItemsTable>> = {}) {
  return renderApp(
    <ItemActionsProvider>
      <ItemsTable
        caption="Test files"
        items={[]}
        isLoading={false}
        emptyState={<p>This folder is empty</p>}
        {...props}
      />
    </ItemActionsProvider>,
  );
}

describe('ItemsTable states', () => {
  it('loading: shows an accessible skeleton, no table', () => {
    table({ items: undefined, isLoading: true });
    expect(screen.getByRole('status', { name: 'Loading files' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('empty: shows the supplied empty state', () => {
    table();
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();
  });

  it('error: friendly message with Retry', async () => {
    const onRetry = vi.fn();
    table({
      error: new ApiError({ status: 500, code: 'internal_error', message: 'x', requestId: 'r1' }),
      onRetry,
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('forbidden / not found: neutral state without leaking existence', () => {
    table({ error: new ApiError({ status: 403, code: 'forbidden', message: 'x' }) });
    expect(screen.getByText(/not found, or you do not have access/i)).toBeInTheDocument();
  });

  it('lists folders before files and renders status chips honestly', () => {
    table({
      items: [
        item({ id: 'a', name: 'zeta.pdf', status: 'processing' }),
        item({ id: 'b', name: 'virus.pdf', status: 'quarantined' }),
        item({
          id: 'c',
          kind: 'folder',
          name: 'Folder A',
          content_type: null,
          size_bytes: null,
          status: null,
        }),
      ],
    });
    const rows = screen.getAllByTestId('item-row');
    expect(rows[0]).toHaveAttribute('data-kind', 'folder');
    expect(within(rows[1]!).getByText('Scanning…')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Quarantined')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('link', { name: 'Folder A' })).toHaveAttribute(
      'href',
      '/files/c',
    );
    expect(within(rows[1]!).getByRole('link', { name: 'zeta.pdf' })).toHaveAttribute(
      'href',
      '/documents/a',
    );
  });

  it('sortable headers call back and expose aria-sort', async () => {
    const onSortChange = vi.fn();
    table({ items: [item({})], sort: { key: 'name', order: 'asc' }, onSortChange });
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await userEvent.click(screen.getByRole('button', { name: /Modified/ }));
    expect(onSortChange).toHaveBeenCalledWith('updated_at');
  });

  it('selection reports ids', async () => {
    const onSelectionChange = vi.fn();
    table({ items: [item({})], selection: {}, onSelectionChange });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select plan.pdf' }));
    expect(onSelectionChange).toHaveBeenCalledWith({ i1: true });
  });
});

describe('row actions menu is permission gated', () => {
  async function openMenu(it: TreeItem) {
    table({ items: [it] });
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${it.name}` }));
    return screen.findByRole('menu');
  }
  const state = (menu: HTMLElement, name: RegExp) => within(menu).getByRole('menuitem', { name });

  it('full permissions: everything enabled', async () => {
    const menu = await openMenu(item({}));
    for (const n of [
      /Download/,
      /Preview/,
      /Rename/,
      /^Move…$/,
      /Copy/,
      /Share/,
      /Manage access/,
      /Move to trash/,
    ]) {
      expect(state(menu, n)).not.toHaveAttribute('data-disabled');
    }
  });

  it('read-only: mutating actions are disabled', async () => {
    const menu = await openMenu(item({ permissions: ['view', 'preview', 'download'] }));
    expect(state(menu, /Download/)).not.toHaveAttribute('data-disabled');
    for (const n of [/Rename/, /^Move…$/, /Copy/, /Share/, /Manage access/, /Move to trash/]) {
      expect(state(menu, n)).toHaveAttribute('data-disabled');
    }
  });

  it('a document that is still scanning cannot be downloaded, previewed or shared', async () => {
    const menu = await openMenu(item({ status: 'processing' }));
    for (const n of [/Download/, /Preview/, /Share/])
      expect(state(menu, n)).toHaveAttribute('data-disabled');
    expect(state(menu, /Rename/)).not.toHaveAttribute('data-disabled');
  });

  it('is reachable by keyboard', async () => {
    table({ items: [item({})] });
    screen.getByRole('button', { name: 'Actions for plan.pdf' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
