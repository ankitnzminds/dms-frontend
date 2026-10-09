import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from '@/components/sharing/share-dialog';
import { server, API } from '../msw-server';
import { apiError, renderApp } from './test-utils';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));

const ORG = { id: 'o', name: 'Acme', slug: 'a', status: 'active', quota_bytes: null, root_folder_id: 'r', settings: {} };
const GROUPS = { items: [{ id: 'g-eng', name: 'Engineering', kind: 'department', description: null, member_count: 3, created_at: '2026-01-01T00:00:00Z' }], total: 1, limit: 100, offset: 0 };

let posted: unknown = null;

beforeEach(() => {
  posted = null;
  toast.success.mockClear();
  server.use(
    http.get(`${API}/organization`, () => HttpResponse.json(ORG)),
    http.get(`${API}/admin/groups`, () => HttpResponse.json(GROUPS)),
  );
});

function open(permissions = ['view', 'preview', 'download', 'edit_metadata', 'rename', 'upload_version', 'share']) {
  const onOpenChange = vi.fn();
  renderApp(<ShareDialog kind="document" id="doc-1" name="plan.pdf" permissions={permissions} open onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

const emailBox = () => screen.getByLabelText('People (work email addresses)');

describe('ShareDialog', () => {
  it('explains that sharing grants access to the item only', () => {
    open();
    expect(screen.getByRole('dialog')).toHaveTextContent(/do not get access to its folder/i);
  });

  it('validates: needs at least one recipient', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Add at least one person or group')).toBeInTheDocument();
    expect(posted).toBeNull();
  });

  it('validates the email format inline', async () => {
    open();
    await userEvent.type(emailBox(), 'not-an-email{Enter}');
    expect(await screen.findByText(/is not a valid email address/)).toBeInTheDocument();
  });

  it('limits presets to what the caller holds', () => {
    open(['view', 'preview', 'share']);
    expect(screen.getByRole('radio', { name: /^Viewer\s*Can view and preview/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Viewer \+ download/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Editor/ })).toBeDisabled();
  });

  it('shows unknown_recipient precisely and keeps the dialog open', async () => {
    server.use(
      http.post(`${API}/documents/doc-1/shares`, () =>
        HttpResponse.json(apiError(422, 'unknown_recipient', 'No active member found for stranger@evil.test'), { status: 422 }),
      ),
    );
    const { onOpenChange } = open();
    await userEvent.type(emailBox(), 'stranger@evil.test{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    const alert = await screen.findByText(/sharing outside the organization is not enabled/i);
    expect(alert).toHaveTextContent('No active member found for stranger@evil.test');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('toasts success only after the API confirms, sending the right body', async () => {
    server.use(
      http.post(`${API}/documents/doc-1/shares`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            id: 's1', actions: ['view', 'preview', 'download'], created_at: '2026-01-01T00:00:00Z',
            created_by: { id: 'u', email: 'a@b.c' }, expires_at: null, recipients: [{ type: 'user', id: 'u2', email: 'bob@acme.test' }],
            resource_id: 'doc-1', resource_name: 'plan.pdf', resource_type: 'document', revoked_at: null, status: 'active',
          },
          { status: 201 },
        );
      }),
    );
    const { onOpenChange } = open();
    await userEvent.type(emailBox(), 'Bob@Acme.test{Enter}');
    await userEvent.click(await screen.findByLabelText(/Engineering/));
    expect(toast.success).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Shared "plan.pdf"')));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const body = posted as { recipients: unknown[]; actions: string[]; expires_at: string | null };
    expect(body.recipients).toEqual([{ type: 'user', email: 'bob@acme.test' }, { type: 'group', id: 'g-eng' }]);
    expect(body.actions).toEqual(['view', 'preview', 'download']);
    expect(body.expires_at).toEqual(expect.any(String)); // 30 day preset by default
  });
});
