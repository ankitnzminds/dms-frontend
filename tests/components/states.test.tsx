import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotAvailable } from '@/components/layout/not-available';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ApiError } from '@/lib/api-client';

describe('state components', () => {
  it('ErrorState shows a friendly message, request id in technical details, and Retry', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        error={
          new ApiError({
            status: 500,
            code: 'internal_error',
            message: 'boom',
            requestId: 'req-123',
          })
        }
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this');
    expect(screen.getByText('req-123')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it.each([403, 404])('treats %i neutrally (not found, or you do not have access)', (status) => {
    render(
      <ErrorState
        error={
          new ApiError({ status, code: status === 404 ? 'not_found' : 'forbidden', message: 'x' })
        }
      />,
    );
    expect(screen.getByText(/not found, or you do not have access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('EmptyState renders title, description and action', () => {
    render(
      <EmptyState title="Nothing here" description="Add something" action={<button>Add</button>} />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('NotAvailable pages are clearly labelled and have no controls', () => {
    render(<NotAvailable title="Workflows" summary="Soon" planned={['A', 'B']} />);
    expect(screen.getAllByText('Not available yet').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
