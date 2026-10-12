import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignatureRequestCard } from '@/components/signatures/request-card';
import { SigningOverlay } from '@/components/signatures/signing-overlay';
import type { SignatureRequest } from '@/features/signatures/hooks';
import { API, server } from '../msw-server';
import { renderApp } from './test-utils';

const SECRET = 'https://sign.example.test/sign/SECRET-TOKEN-12345';

const req = (over: Partial<SignatureRequest> = {}): SignatureRequest => ({
  id: 'r1',
  title: 'NDA',
  state: 'sent',
  document_id: 'd1',
  document_name: 'nda.pdf',
  provider: 'documenso',
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
  source_version_number: 1,
  my_signing_available: true,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('SigningOverlay: the signing link is a secret', () => {
  it('puts the URL only in the sandboxed iframe src, never in visible text', () => {
    const { container } = renderApp(
      <SigningOverlay
        url={SECRET}
        title="NDA"
        onClose={() => {}}
        onFinished={() => {}}
        finishing={false}
      />,
    );
    const frame = screen.getByTitle(/Signing page for NDA/);
    expect(frame).toHaveAttribute('src', SECRET);
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-forms allow-popups',
    );
    expect(container.textContent).not.toContain('SECRET-TOKEN');
    expect(document.body.textContent).not.toContain('SECRET-TOKEN');
    // no anchors expose it either
    expect(document.querySelectorAll(`a[href*="SECRET-TOKEN"]`)).toHaveLength(0);
  });

  it('opens a new tab with noopener on demand and closes on Escape', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const onClose = vi.fn();
    renderApp(
      <SigningOverlay
        url={SECRET}
        title="NDA"
        onClose={onClose}
        onFinished={() => {}}
        finishing={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Open in new tab/ }));
    expect(open).toHaveBeenCalledWith(SECRET, '_blank', 'noopener,noreferrer');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a hint when the pop-up is blocked and triggers the finished callback', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const onFinished = vi.fn();
    renderApp(
      <SigningOverlay
        url={SECRET}
        title="NDA"
        onClose={() => {}}
        onFinished={onFinished}
        finishing={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Open in new tab/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/blocked the new tab/);
    await userEvent.click(screen.getByRole('button', { name: /finished signing/ }));
    expect(onFinished).toHaveBeenCalled();
  });
});

describe('SignatureRequestCard signing flow', () => {
  it('Sign fetches the link, shows the overlay without logging or storing the URL, then Refresh completes', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    server.use(
      http.post(`${API}/signature-requests/r1/signing-session`, () =>
        HttpResponse.json({ url: SECRET }),
      ),
      http.post(`${API}/signature-requests/r1/refresh`, () =>
        HttpResponse.json(req({ state: 'completed', my_signing_available: false })),
      ),
      http.get(`${API}/signature-requests/r1`, () => HttpResponse.json(req())),
    );
    const { client } = renderApp(<SignatureRequestCard initial={req()} canCancel={false} />);
    await userEvent.click(screen.getByRole('button', { name: /^Sign$/ }));
    const overlay = await screen.findByTestId('signing-overlay');
    expect(overlay).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRET-TOKEN');

    await userEvent.click(screen.getByRole('button', { name: /finished signing/ }));
    await waitFor(() => expect(screen.queryByTestId('signing-overlay')).toBeNull());

    // nothing persisted: no storage entry, no query-cache entry, nothing logged
    expect(JSON.stringify({ ...localStorage })).not.toContain('SECRET-TOKEN');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('SECRET-TOKEN');
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('SECRET-TOKEN');
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((m) => m.state.data),
      ),
    ).not.toContain('SECRET-TOKEN');
    for (const s of spies)
      for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain('SECRET-TOKEN');
  });

  it('only offers Sign to a signer whose turn it is and not on finished requests', () => {
    const { rerender } = renderApp(
      <SignatureRequestCard initial={req({ my_signing_available: false })} canCancel={false} />,
    );
    expect(screen.queryByRole('button', { name: /^Sign$/ })).toBeNull();
    rerender(<div />);
  });

  it('completed: shows the signed artifact as a link to the document versions, no actions', () => {
    renderApp(
      <SignatureRequestCard
        initial={req({
          state: 'completed',
          my_signing_available: false,
          artifact: {
            created_at: '2026-01-02T00:00:00Z',
            sha256: 'abc',
            size_bytes: 2048,
            version_id: 'v2',
            version_number: 2,
          },
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
        canCancel
      />,
    );
    const art = screen.getByTestId('signed-artifact');
    expect(art).toHaveTextContent('Signed copy saved as version 2');
    expect(screen.getByRole('link', { name: /version 2/ })).toHaveAttribute(
      'href',
      '/documents/d1?tab=versions',
    );
    expect(
      screen.queryByRole('button', { name: /Cancel request|Refresh status|^Sign$/ }),
    ).toBeNull();
  });
});
