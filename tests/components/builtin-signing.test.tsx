import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuiltinSignDialog } from '@/components/signatures/builtin-sign-dialog';
import { SignatureRequestCard } from '@/components/signatures/request-card';
import type { SignatureRequest } from '@/features/signatures/hooks';
import { API, server } from '../msw-server';
import { renderApp } from './test-utils';

vi.mock('@/features/auth/session', () => ({
  useMe: () => ({ data: { email: 'bob@acme.test', role: 'member', capabilities: [] } }),
}));

const req = (over: Partial<SignatureRequest> = {}): SignatureRequest => ({
  id: 'r1',
  title: 'NDA',
  state: 'sent',
  document_id: 'd1',
  document_name: 'nda.docx',
  provider: 'builtin',
  message: null,
  failure_reason: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  requested_by: { id: 'u1', email: 'alice@acme.test', display_name: 'Alice' },
  signers: [
    {
      email: 'bob@acme.test',
      name: 'Bob',
      internal: true,
      level: 1,
      optional: false,
      is_super_signer: false,
      waiting: false,
      status: 'pending',
      signed_at: null,
    },
  ],
  events: [],
  artifact: null,
  source_version_number: 3,
  my_signing_available: true,
  ...over,
});

const STATEMENT = { version: 'v-test', text: 'I agree that typing my name is my signature.' };

function mockStatement() {
  server.use(http.get(`${API}/signature-statement`, () => HttpResponse.json(STATEMENT)));
}

describe('built-in signing dialog', () => {
  it('cannot sign until the statement is accepted and a name is typed, then sends both', async () => {
    mockStatement();
    let body: unknown = null;
    server.use(
      http.post(`${API}/signature-requests/r1/sign`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<BuiltinSignDialog request={req()} open onOpenChange={() => {}} />);
    expect(await screen.findByText(STATEMENT.text)).toBeInTheDocument();
    const sign = screen.getByRole('button', { name: 'Sign' });
    expect(sign).toBeDisabled();
    await userEvent.click(
      screen.getByRole('checkbox', { name: /agree to the signature statement/ }),
    );
    expect(sign).toBeDisabled(); // still needs a name
    await userEvent.type(screen.getByLabelText(/Type your full name/), 'Bob Example');
    expect(sign).toBeEnabled();
    await userEvent.click(sign);
    await waitFor(() =>
      expect(body).toEqual({
        agreed: true,
        statement_version: 'v-test',
        typed_name: 'Bob Example',
      }),
    );
  });

  it('shows the server reason when signing is refused and does not pretend it worked', async () => {
    mockStatement();
    server.use(
      http.post(`${API}/signature-requests/r1/sign`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_state', message: 'The request is cancelled.' } },
          { status: 409 },
        ),
      ),
    );
    renderApp(<BuiltinSignDialog request={req()} open onOpenChange={() => {}} />);
    await screen.findByText(STATEMENT.text);
    await userEvent.click(
      screen.getByRole('checkbox', { name: /agree to the signature statement/ }),
    );
    await userEvent.type(screen.getByLabelText(/Type your full name/), 'Bob');
    await userEvent.click(screen.getByRole('button', { name: 'Sign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer open for signing/);
  });

  it('declining is a separate step with its own confirmation', async () => {
    mockStatement();
    let declined: unknown = null;
    server.use(
      http.post(`${API}/signature-requests/r1/decline`, async ({ request }) => {
        declined = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp(<BuiltinSignDialog request={req()} open onOpenChange={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(screen.getByText(/Declining ends this request for everyone/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Reason/), 'Wrong amount');
    await userEvent.click(screen.getByRole('button', { name: /Decline to\s*sign/ }));
    await waitFor(() => expect(declined).toEqual({ reason: 'Wrong amount' }));
  });
});

describe('built-in requests on the signature card', () => {
  beforeEach(() =>
    server.use(http.get(`${API}/signature-requests/r1`, () => HttpResponse.json(req()))),
  );

  it('offers Review and sign (not the provider overlay or a status refresh) to the signer', () => {
    renderApp(<SignatureRequestCard initial={req()} canCancel={false} />);
    expect(screen.getByRole('button', { name: /Review and sign/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refresh status/ })).not.toBeInTheDocument();
  });

  it('says plainly that a completed built-in signature is an electronic record, not a signed PDF', () => {
    renderApp(
      <SignatureRequestCard
        initial={req({
          state: 'completed',
          my_signing_available: false,
          signers: [
            {
              email: 'bob@acme.test',
              name: 'Bob',
              internal: true,
              level: 1,
              optional: false,
              is_super_signer: false,
              waiting: false,
              status: 'signed',
              signed_at: '2026-01-02T00:00:00Z',
            },
          ],
        })}
        canCancel={false}
      />,
    );
    expect(screen.getByTestId('builtin-record')).toHaveTextContent(
      /not a certificate-based PDF signature/,
    );
    expect(screen.queryByTestId('signed-artifact')).not.toBeInTheDocument();
  });
});
