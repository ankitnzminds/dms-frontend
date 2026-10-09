import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReceivedShareRow } from '@/components/sharing/received-share-row';
import type { ReceivedShare } from '@/lib/api-client';

const base: ReceivedShare = {
  share_id: 's1',
  resource_id: 'doc-1',
  resource_type: 'document',
  name: 'Q3 contract.pdf',
  content_type: 'application/pdf',
  size_bytes: 2048,
  shared_at: '2026-01-01T00:00:00Z',
  shared_by: { id: 'u1', display_name: 'Alice Owner', email: 'alice@acme.test' },
  expires_at: new Date(Date.now() + 6.5 * 86400000).toISOString(),
  actions: ['view', 'preview', 'download'],
  status: 'active',
  breadcrumb: [
    { folder_id: 'root', name: 'Organization Files', navigable: true },
    { folder_id: null, name: 'Legal', navigable: false },
  ],
};

function renderRow(s: ReceivedShare) {
  return render(
    <TooltipProvider>
      <table>
        <tbody>
          <ReceivedShareRow share={s} />
        </tbody>
      </table>
    </TooltipProvider>,
  );
}

describe('ReceivedShareRow', () => {
  it('active: openable, shows permission chips, expiry countdown and a mixed breadcrumb', () => {
    renderRow(base);
    const row = screen.getByTestId('received-share-row');
    expect(row).toHaveAttribute('data-status', 'active');
    expect(within(row).getByRole('link', { name: 'Q3 contract.pdf' })).toHaveAttribute('href', '/documents/doc-1');
    expect(within(row).getByRole('link', { name: /Open/ })).toBeInTheDocument();
    for (const chip of ['View', 'Preview', 'Download']) expect(within(row).getByText(chip)).toBeInTheDocument();
    expect(within(row).getByText(/Expires in 7 days/)).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    // root is navigable -> link; "Legal" is not -> text only
    expect(within(row).getByRole('link', { name: 'Organization Files' })).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: /Legal/ })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Download Q3 contract.pdf' })).toBeEnabled();
  });

  it('only offers what `actions` grants (view-only: download disabled)', () => {
    renderRow({ ...base, actions: ['view', 'preview'] });
    expect(screen.getByRole('button', { name: 'Download Q3 contract.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview Q3 contract.pdf' })).toBeEnabled();
  });

  it('expired: explicit state, not openable, no links at all', () => {
    renderRow({ ...base, status: 'expired', actions: [], breadcrumb: [], expires_at: new Date(Date.now() - 86400000).toISOString() });
    const row = screen.getByTestId('received-share-row');
    expect(within(row).getByText('Expired', { selector: 'span' })).toBeInTheDocument();
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).getByText('Not openable')).toBeInTheDocument();
  });

  it('revoked: shows "Access revoked", not openable', () => {
    renderRow({ ...base, status: 'revoked', actions: [], breadcrumb: [] });
    const row = screen.getByTestId('received-share-row');
    expect(row).toHaveAttribute('data-status', 'revoked');
    expect(within(row).getByText('Access revoked')).toBeInTheDocument();
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    expect(within(row).getByText('Not openable')).toBeInTheDocument();
  });
});
