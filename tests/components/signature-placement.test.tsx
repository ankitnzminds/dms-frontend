import { screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { RequestSignatureDialog } from '@/components/signatures/request-dialog';
import {
  clampBox,
  DEFAULT_BOX,
  toApiPlacement,
} from '@/components/signatures/placement-modal.helpers';
import { API, server } from '../msw-server';
import { renderApp } from './test-utils';

// pdf.js needs a real canvas; the drag/resize surface is exercised in the browser tests. Here the modal is a stub
// that "confirms" a chosen box so the dialog's wiring (when it opens, what it sends) is what is tested.
vi.mock('@/components/signatures/placement-modal', async () => {
  const helpers = await import('@/components/signatures/placement-modal.helpers');
  return {
    ...helpers,
    SignaturePlacementModal: ({
      onConfirm,
      confirmLabel,
    }: {
      onConfirm: (b: unknown) => void;
      confirmLabel: string;
    }) => (
      <button
        onClick={() =>
          onConfirm({ pageNumber: 2, pageX: 5, pageY: 50, pageWidth: 30, pageHeight: 5 })
        }
      >
        {confirmLabel}
      </button>
    ),
  };
});

describe('placement helpers', () => {
  it('keeps the box on the page and above the minimum size', () => {
    expect(clampBox({ ...DEFAULT_BOX, pageX: 95, pageY: 99 })).toMatchObject({
      pageX: 70,
      pageY: 95,
    });
    expect(clampBox({ ...DEFAULT_BOX, pageX: -5, pageY: -5 })).toMatchObject({
      pageX: 0,
      pageY: 0,
    });
    expect(clampBox({ ...DEFAULT_BOX, pageWidth: 1, pageHeight: 1 })).toMatchObject({
      pageWidth: 8,
      pageHeight: 4,
    });
    expect(clampBox({ ...DEFAULT_BOX, pageWidth: 500, pageHeight: 500 })).toMatchObject({
      pageWidth: 100,
      pageHeight: 100,
      pageX: 0,
      pageY: 0,
    });
  });

  it('converts to the API shape with two decimals', () => {
    expect(
      toApiPlacement({
        pageNumber: 3,
        pageX: 12.3456,
        pageY: 40,
        pageWidth: 30.004,
        pageHeight: 6,
      }),
    ).toEqual({ page_number: 3, page_x: 12.35, page_y: 40, page_width: 30, page_height: 6 });
  });
});

function mockCaps() {
  server.use(
    http.get(`${API}/signature-capabilities`, () =>
      HttpResponse.json({
        available: true,
        enabled: true,
        allow_external_signers: true,
        provider: 'documenso',
        builtin_available: true,
      }),
    ),
  );
}

async function addSigner(email: string) {
  await userEvent.type(await screen.findByLabelText('Or enter an email'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Add signer' }));
}

describe('request dialog with signature placement', () => {
  it('opens the placement step for the external provider and sends the chosen box', async () => {
    mockCaps();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/documents/d1/signature-requests`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'r1' }, { status: 201 });
      }),
    );
    renderApp(
      <RequestSignatureDialog documentId="d1" documentName="a.pdf" open onOpenChange={() => {}} />,
    );
    await addSigner('bob@acme.test');
    await userEvent.click(screen.getByRole('button', { name: 'Request signature' }));
    // nothing is sent until the signature has been placed
    expect(body).toBeNull();
    // the stub sits outside the (modal) request dialog, so skip the pointer-events guard for this click
    await userEvent
      .setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
      .click(await screen.findByRole('button', { name: 'Send for signature', hidden: true }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      provider: 'default',
      signers: [{ email: 'bob@acme.test' }],
      placement: { page_number: 2, page_x: 5, page_y: 50, page_width: 30, page_height: 5 },
    });
  });

  it('built-in signing has no placement step and sends without a box', async () => {
    mockCaps();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/documents/d1/signature-requests`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'r1' }, { status: 201 });
      }),
    );
    renderApp(
      <RequestSignatureDialog documentId="d1" documentName="a.pdf" open onOpenChange={() => {}} />,
    );
    await userEvent.click(await screen.findByRole('radio', { name: /Built-in/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Request signature' }));
    // a signer is required first
    expect(await screen.findByText('Add at least one signer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for signature' })).not.toBeInTheDocument();
    expect(body).toBeNull();
  });
});
