import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

function setup(over: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete it?"
      description="This cannot be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      {...over}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('is an accessible alertdialog with title and description', () => {
    setup();
    const d = screen.getByRole('alertdialog', { name: 'Delete it?' });
    expect(d).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('confirms only on the explicit button', async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancel and Escape do not confirm', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await userEvent.keyboard('{Escape}');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog (focus trap)', () => {
    setup();
    expect(screen.getByRole('alertdialog').contains(document.activeElement)).toBe(true);
  });

  it('disables both buttons while pending', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
