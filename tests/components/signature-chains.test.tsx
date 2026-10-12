import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BuiltinSignDialog } from '@/components/signatures/builtin-sign-dialog';
import { SignatureRequestCard } from '@/components/signatures/request-card';
import { ChainEditor } from '@/features/signatures/chain-editor-view';
import type { SignatureRequest } from '@/features/signatures/hooks';
import { API, server } from '../msw-server';
import { renderApp } from './test-utils';

vi.mock('@/features/auth/session', () => ({
  useMe: () => ({ data: { email: 'boss@acme.test', role: 'member', capabilities: [] } }),
}));

const signer = (over: Record<string, unknown> = {}) => ({
  email: 'x@acme.test',
  name: 'X',
  internal: true,
  status: 'pending',
  signed_at: null,
  level: 1,
  optional: false,
  is_super_signer: false,
  waiting: false,
  ...over,
});

const req = (signers: ReturnType<typeof signer>[]): SignatureRequest =>
  ({
    id: 'r1',
    title: 'Contract',
    state: 'sent',
    document_id: 'd1',
    document_name: 'contract.docx',
    provider: 'builtin',
    message: null,
    failure_reason: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    requested_by: { id: 'u1', email: 'alice@acme.test', display_name: 'Alice' },
    signers,
    events: [],
    artifact: null,
    source_version_number: 2,
    my_signing_available: true,
  }) as unknown as SignatureRequest;

const userItem = (id: string, name: string) => ({
  user_id: id,
  display_name: name,
  email: `${name.toLowerCase()}@acme.test`,
  state: 'active',
});

function mockEditorApis(levels: unknown[] = []) {
  server.use(
    http.get(`${API}/folders/f1/signature-chain`, () =>
      HttpResponse.json({ folder_id: 'f1', levels }),
    ),
    http.get(`${API}/admin/users`, () =>
      HttpResponse.json({
        items: [userItem('u-carol', 'Carol'), userItem('u-dave', 'Dave')],
        total: 2,
        limit: 100,
        offset: 0,
      }),
    ),
    http.get(`${API}/admin/groups`, () =>
      HttpResponse.json({ items: [{ id: 'g1', name: 'Legal' }], total: 1, limit: 100, offset: 0 }),
    ),
  );
}

describe('signature chain editor', () => {
  it('shows the empty state, then builds levels with flags and saves them in order', async () => {
    mockEditorApis();
    let body: unknown = null;
    server.use(
      http.put(`${API}/folders/f1/signature-chain`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          folder_id: 'f1',
          levels: [
            [
              {
                user_id: 'u-carol',
                name: 'Carol',
                email: 'carol@acme.test',
                optional: false,
                is_super_signer: true,
              },
            ],
            [
              {
                user_id: 'u-dave',
                name: 'Dave',
                email: 'dave@acme.test',
                optional: true,
                is_super_signer: false,
              },
            ],
          ],
        });
      }),
    );
    renderApp(<ChainEditor folderId="f1" />);
    expect(
      await screen.findByText(
        /No chain configured - documents in this folder use manual signer selection/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Add level/ }));
    await userEvent.click(screen.getByRole('button', { name: /Add level/ }));
    const levels = screen.getAllByTestId('chain-level');
    expect(levels).toHaveLength(2);
    expect(screen.getAllByText('Everyone below signs in parallel at this step.')).toHaveLength(2);

    await userEvent.selectOptions(
      within(levels[0]!).getByLabelText('Add signer to level 1'),
      'u-carol',
    );
    await userEvent.click(within(levels[0]!).getByRole('checkbox', { name: /Super signer/ }));
    await userEvent.selectOptions(
      within(levels[1]!).getByLabelText('Add signer to level 2'),
      'u-dave',
    );
    await userEvent.click(within(levels[1]!).getByRole('checkbox', { name: /Optional/ }));
    // a person already in one level is not offered again
    expect(within(levels[1]!).queryByRole('option', { name: 'Carol' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save chain' }));
    await waitFor(() =>
      expect(body).toEqual({
        levels: [
          [{ user_id: 'u-carol', optional: false, is_super_signer: true }],
          [{ user_id: 'u-dave', optional: true, is_super_signer: false }],
        ],
        group_ids: [[], []],
      }),
    );
    expect(await screen.findByText('Signature chain saved.')).toBeInTheDocument();
  });

  it('sends groups per level and shows the server reason when saving is refused', async () => {
    mockEditorApis([
      [
        {
          user_id: 'u-carol',
          name: 'Carol',
          email: 'carol@acme.test',
          optional: false,
          is_super_signer: false,
        },
      ],
    ]);
    let body: { group_ids?: string[][] } = {};
    server.use(
      http.put(`${API}/folders/f1/signature-chain`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(
          { error: { code: 'signer_in_two_levels', message: 'x' } },
          { status: 422 },
        );
      }),
    );
    renderApp(<ChainEditor folderId="f1" />);
    const level = await screen.findByTestId('chain-level');
    await within(level).findByRole('option', { name: 'Legal' });
    await userEvent.selectOptions(within(level).getByLabelText('Add a group to level 1'), 'g1');
    expect(screen.getByText(/added to this level when you save/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save chain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/one level only/);
    expect(body.group_ids).toEqual([['g1']]);
  });
});

describe('chain requests on the signature card', () => {
  it('shows levels, optional and super signers and who is still waiting', () => {
    server.use(http.get(`${API}/signature-requests/r1`, () => HttpResponse.json({})));
    renderApp(
      <SignatureRequestCard
        initial={req([
          signer({ email: 'a@acme.test', name: 'Ann', level: 1 }),
          signer({ email: 'b@acme.test', name: 'Ben', level: 1, optional: true }),
          signer({
            email: 'c@acme.test',
            name: 'Cy',
            level: 2,
            is_super_signer: true,
            waiting: true,
          }),
          signer({
            email: 'd@acme.test',
            name: 'Di',
            level: 2,
            status: 'bypassed',
            waiting: false,
          }),
        ])}
        canCancel={false}
      />,
    );
    const rows = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-status'));
    expect(rows).toHaveLength(4);
    expect(screen.getAllByText(/^L[12]$/)).toHaveLength(4);
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText(/Super signer/)).toBeInTheDocument();
    expect(screen.getByText('Waiting for an earlier level')).toBeInTheDocument();
    expect(screen.getByText('Bypassed')).toBeInTheDocument();
  });
});

describe('super signer', () => {
  it('warns, and asks for confirmation before signing', async () => {
    server.use(
      http.get(`${API}/signature-statement`, () =>
        HttpResponse.json({ version: 'v1', text: 'I agree.' }),
      ),
      http.get(`${API}/signature-requests/r1`, () => HttpResponse.json({})),
    );
    let signed = 0;
    server.use(
      http.post(`${API}/signature-requests/r1/sign`, () => {
        signed++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(
      <BuiltinSignDialog
        request={req([signer({ email: 'boss@acme.test', name: 'Boss', is_super_signer: true })])}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(
      await screen.findByText(
        'Signing this instantly bypasses everyone else remaining in the chain.',
      ),
    ).toBeInTheDocument();
    await screen.findByText('I agree.');
    await userEvent.click(
      screen.getByRole('checkbox', { name: /agree to the signature statement/ }),
    );
    await userEvent.type(screen.getByLabelText(/Type your full name/), 'Boss');
    await userEvent.click(screen.getByRole('button', { name: 'Sign' }));
    // nothing is sent until the override is confirmed
    expect(signed).toBe(0);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /immediately bypass every other pending signer at this level and every signer at every level below/,
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /Sign and bypass the rest/,
      }),
    );
    await waitFor(() => expect(signed).toBe(1));
  });
});
