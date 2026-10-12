import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetadataForm } from '@/components/file-browser/metadata-form';
import { StorageView } from '@/features/admin/storage-view';
import { MemberPicker } from '@/features/members/member-picker';
import { PreferencesView } from '@/features/notifications/preferences-view';
import { GovernanceView } from '@/features/governance/governance-view';
import TrashPage from '@/app/(dashboard)/trash/page';
import type { Document } from '@/lib/api-client';
import { API, server } from '../msw-server';
import { apiError, renderApp } from './test-utils';

vi.mock('@/features/auth/session', () => ({
  useMe: () => ({ data: { role: 'auditor', capabilities: ['read_audit'] } }),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  message: vi.fn(),
}));
vi.mock('sonner', () => ({ toast, Toaster: () => null }));
beforeEach(() => Object.values(toast).forEach((f) => f.mockClear()));

describe('MemberPicker (GET /members/lookup)', () => {
  it('waits for 2 characters, lists matches, and selects by click and keyboard', async () => {
    let asked: string[] = [];
    server.use(
      http.get(`${API}/members/lookup`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')!;
        asked.push(q);
        return HttpResponse.json([
          { id: 'u2', display_name: 'Bob Member', email: 'bob@acme.test' },
          { id: 'u3', display_name: 'Bobby Tables', email: 'bobby@acme.test' },
        ]);
      }),
    );
    const onSelect = vi.fn();
    renderApp(<MemberPicker label="Find a colleague" onSelect={onSelect} />);
    const box = screen.getByRole('combobox', { name: 'Find a colleague' });
    await userEvent.type(box, 'b');
    expect(asked).toEqual([]);
    expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    await userEvent.type(box, 'o');
    const list = await screen.findByRole('listbox');
    expect(await within(list).findByText('Bob Member')).toBeInTheDocument();
    expect(asked).toEqual(['bo']);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'u3' }));
    expect(box).toHaveValue('');
    asked = [];
  });

  it('says so when nothing matches', async () => {
    server.use(http.get(`${API}/members/lookup`, () => HttpResponse.json([])));
    renderApp(<MemberPicker label="Who" onSelect={() => {}} />);
    await userEvent.type(screen.getByRole('combobox'), 'zz');
    expect(await screen.findByText('No matching members.')).toBeInTheDocument();
  });
});

const doc = (over: Partial<Document> = {}): Document =>
  ({
    id: 'd1',
    name: 'a.pdf',
    folder_id: 'f',
    owner_id: 'u',
    status: 'available',
    classification: 'internal',
    metadata: {},
    latest_version_number: 1,
    current_version: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    row_version: 3,
    breadcrumb: [],
    permissions: ['view', 'edit_metadata'],
    ...over,
  }) as Document;

const DEFS = [
  {
    id: 'a',
    key: 'client',
    label: 'Client',
    field_type: 'text',
    required: true,
    options: null,
    archived: false,
    schema_version: 1,
  },
  {
    id: 'b',
    key: 'amount',
    label: 'Amount',
    field_type: 'number',
    required: false,
    options: null,
    archived: false,
    schema_version: 1,
  },
  {
    id: 'c',
    key: 'tier',
    label: 'Tier',
    field_type: 'select',
    required: false,
    options: ['gold', 'silver'],
    archived: false,
    schema_version: 1,
  },
];

describe('MetadataForm', () => {
  beforeEach(() =>
    server.use(http.get(`${API}/metadata-definitions`, () => HttpResponse.json(DEFS))),
  );

  it('validates required and typed fields inline without calling the API', async () => {
    let patched = 0;
    server.use(http.patch(`${API}/documents/d1`, () => (patched++, HttpResponse.json(doc()))));
    renderApp(<MetadataForm doc={doc()} />);
    const client = await screen.findByLabelText(/Client/);
    await userEvent.type(screen.getByLabelText('Amount'), '12abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }));
    expect(await screen.findByText('Client is required')).toBeInTheDocument();
    expect(client).toHaveAttribute('aria-invalid', 'true');
    expect(patched).toBe(0);
  });

  it('sends typed values with expected_row_version and maps server metadata_invalid to fields', async () => {
    let body: unknown = null;
    server.use(
      http.patch(`${API}/documents/d1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          apiError(422, 'metadata_invalid', 'Invalid metadata', [
            { field: 'client', msg: 'must be an existing customer' },
          ]),
          { status: 422 },
        );
      }),
    );
    renderApp(<MetadataForm doc={doc()} />);
    await userEvent.type(await screen.findByLabelText(/Client/), 'Nobody');
    await userEvent.type(screen.getByLabelText('Amount'), '12.5');
    await userEvent.selectOptions(screen.getByLabelText('Tier'), 'gold');
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }));
    expect(await screen.findByText('must be an existing customer')).toBeInTheDocument();
    expect(body).toEqual({
      metadata: { client: 'Nobody', amount: 12.5, tier: 'gold' },
      expected_row_version: 3,
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('is read-only without edit_metadata', async () => {
    renderApp(<MetadataForm doc={doc({ permissions: ['view'] })} />);
    expect(await screen.findByLabelText(/Client/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save metadata' })).toBeNull();
  });
});

describe('usage with null admin counters', () => {
  it('Storage page shows dashes for nulled counters and real values elsewhere', async () => {
    server.use(
      http.get(`${API}/organization/usage`, () =>
        HttpResponse.json({
          quota_bytes: 1000,
          used_bytes: 100,
          reserved_bytes: 0,
          documents: 5,
          folders: 2,
          versions: null,
          pending_scans: null,
          quarantined_documents: null,
          users: null,
          groups: null,
          organization_status: 'active',
        }),
      ),
    );
    renderApp(<StorageView />);
    const docs = (await screen.findAllByText('Documents'))[0]!.closest('div')!;
    expect(docs).toHaveTextContent('5');
    expect(screen.getAllByText('Versions')[0]!.closest('div')).toHaveTextContent('-');
    expect(screen.getByText('Waiting for scan').closest('div')).toHaveTextContent('-');
    expect(screen.queryByText('NaN')).toBeNull();
  });
});

describe('Trash: delete forever', () => {
  const trash = {
    items: [
      {
        id: 'd1',
        kind: 'document',
        name: 'held.pdf',
        deleted_at: '2026-01-01T00:00:00Z',
        deleted_by: null,
        original_breadcrumb: [],
        size_bytes: 10,
      },
    ],
    total: 1,
    limit: 25,
    offset: 0,
  };
  beforeEach(() => server.use(http.get(`${API}/trash`, () => HttpResponse.json(trash))));

  it('asks for confirmation, then shows the legal-hold reason and keeps the item', async () => {
    let calls = 0;
    server.use(
      http.delete(`${API}/trash/documents/d1`, () => {
        calls++;
        return HttpResponse.json(apiError(409, 'legal_hold', 'held', [{ reason: 'legal_hold' }]), {
          status: 409,
        });
      }),
    );
    renderApp(<TrashPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete held.pdf forever' }));
    const dlg = screen.getByRole('alertdialog');
    expect(dlg).toHaveTextContent('an administrator can still recover it');
    expect(calls).toBe(0);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Delete forever' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent(/legal hold/i);
    expect(toast.success).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });

  it('shows the retention end date for retention_active', async () => {
    const until = new Date(Date.now() + 5 * 86400000).toISOString();
    server.use(
      http.delete(`${API}/trash/documents/d1`, () =>
        HttpResponse.json(apiError(409, 'retention_active', 'ret', [{ until }]), { status: 409 }),
      ),
    );
    renderApp(<TrashPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete held.pdf forever' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete forever' }),
    );
    expect(
      await screen.findByText(/retention policy protects this item until/),
    ).toBeInTheDocument();
  });

  it('succeeds with a toast only after the API confirms', async () => {
    server.use(
      http.delete(`${API}/trash/documents/d1`, () =>
        HttpResponse.json({ documents: 1, folders: 0 }),
      ),
    );
    renderApp(<TrashPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete held.pdf forever' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete forever' }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Deleted "held.pdf" forever'));
  });
});

describe('Legal holds are read-only for auditors', () => {
  it('hides mutating controls and says so', async () => {
    server.use(
      http.get(`${API}/admin/legal-holds`, () =>
        HttpResponse.json([
          {
            id: 'h1',
            name: 'Case 7',
            description: null,
            status: 'active',
            item_count: 2,
            created_at: '2026-01-01T00:00:00Z',
            released_at: null,
            release_reason: null,
          },
        ]),
      ),
      http.get(`${API}/admin/retention-policies`, () => HttpResponse.json([])),
    );
    renderApp(<GovernanceView />);
    expect(await screen.findAllByText('Read-only')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /New policy/ })).toBeNull();
  });
});

describe('Notification preferences', () => {
  it('shows groups x channels, warns when e-mail is unavailable, and PUTs the whole array', async () => {
    let put: unknown = null;
    const prefs = ['sharing', 'workflow', 'signature', 'document', 'other'].map((g) => ({
      group: g,
      in_app: true,
      email: true,
    }));
    server.use(
      http.get(`${API}/notification-preferences`, () =>
        HttpResponse.json({ email_available: false, preferences: prefs }),
      ),
      http.put(`${API}/notification-preferences`, async ({ request }) => {
        put = await request.json();
        return HttpResponse.json({ email_available: false, preferences: put });
      }),
    );
    renderApp(<PreferencesView />);
    expect(await screen.findByText(/E-mail delivery is not set up/)).toBeInTheDocument();
    expect(screen.getAllByTestId('pref-row')).toHaveLength(5);
    const save = screen.getByRole('button', { name: 'Save preferences' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Sharing: e-mail notifications' }));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Preferences saved'));
    expect(
      (put as Array<{ group: string; email: boolean }>).find((p) => p.group === 'sharing')!.email,
    ).toBe(false);
    expect((put as unknown[]).length).toBe(5);
  });
});
