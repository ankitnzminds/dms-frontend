'use client';

import { Ban, CheckCircle2, FileSignature, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  fetchSigningUrl,
  isTerminal,
  useCancelSignatureRequest,
  useRefreshSignatureRequest,
  useSignatureRequest,
  type SignatureRequest,
} from '@/features/signatures/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { formatBytes, formatDateTime, titleCase } from '@/lib/format';
import { SigningOverlay } from './signing-overlay';

const TONE = {
  creating: 'info',
  sent: 'info',
  completed: 'ok',
  declined: 'danger',
  cancelled: 'neutral',
  expired: 'warn',
  failed: 'danger',
} as const;

export function SignatureStateBadge({ state }: { state: SignatureRequest['state'] }) {
  return (
    <Badge tone={TONE[state]}>{state === 'sent' ? 'Awaiting signatures' : titleCase(state)}</Badge>
  );
}

/** Detail + actions for one signature request (signers, events, signed artifact, sign/refresh/cancel). */
export function SignatureRequestCard({
  initial,
  canCancel,
  showDocumentLink = true,
}: {
  initial: SignatureRequest;
  canCancel: boolean;
  showDocumentLink?: boolean;
}) {
  const [poll, setPoll] = useState(false);
  const q = useSignatureRequest(initial.id, poll);
  const r = q.data ?? initial;
  const refresh = useRefreshSignatureRequest();
  const cancel = useCancelSignatureRequest();
  // The signing URL lives only in this state while the overlay is open.
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const closeOverlay = useCallback(() => setSigningUrl(null), []);

  // After signing, the provider may need a little while to seal the document. Webhooks cannot reach every
  // deployment, so keep asking the backend to re-read the authoritative status (bounded, every 5 s).
  const attempts = useRef(0);
  const refreshNow = refresh.mutate; // stable reference in React Query
  const open = !isTerminal(r.state);
  useEffect(() => {
    if (!poll || !open) return;
    attempts.current = 0;
    const t = setInterval(() => {
      if (++attempts.current > 24) {
        clearInterval(t);
        setPoll(false);
        return;
      }
      refreshNow(r.id);
    }, 5000);
    return () => clearInterval(t);
  }, [poll, open, r.id, refreshNow]);

  async function openSigning() {
    setOpening(true);
    try {
      setSigningUrl(await fetchSigningUrl(r.id));
    } catch (e) {
      toast.error(friendlyMessage(e));
    } finally {
      setOpening(false);
    }
  }

  function finished() {
    refresh.mutate(r.id, {
      onSuccess: (n) => {
        setSigningUrl(null);
        if (n.state === 'completed') toast.success('Signing complete');
        else {
          toast.message('Status updated. Waiting for the remaining signers.');
          setPoll(true);
        }
      },
      onError: (e) => toast.error(friendlyMessage(e)),
    });
  }

  return (
    <article
      className="rounded-lg border border-line bg-surface p-4"
      data-testid="signature-card"
      data-state={r.state}
      aria-label={`Signature request ${r.title}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <FileSignature className="size-4 text-muted" aria-hidden />
        <h3 className="text-sm font-semibold">{r.title}</h3>
        <SignatureStateBadge state={r.state} />
        <span className="text-xs text-muted">
          requested by {r.requested_by.display_name ?? r.requested_by.email} on{' '}
          {formatDateTime(r.created_at)}
          {r.source_version_number != null && ` · version ${r.source_version_number}`}
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {r.my_signing_available && !isTerminal(r.state) && (
            <Button size="sm" variant="primary" disabled={opening} onClick={openSigning}>
              {opening ? <Loader2 className="animate-spin" /> : <FileSignature />} Sign
            </Button>
          )}
          {!isTerminal(r.state) && (
            <Button
              size="sm"
              disabled={refresh.isPending}
              onClick={() =>
                refresh.mutate(r.id, {
                  onSuccess: (n) =>
                    toast.success(
                      n.state === 'completed' ? 'Signing complete' : 'Status refreshed',
                    ),
                  onError: (e) => toast.error(friendlyMessage(e)),
                })
              }
            >
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
              status
            </Button>
          )}
          {canCancel && !isTerminal(r.state) && (
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirmCancel(true)}>
              <Ban /> Cancel request
            </Button>
          )}
        </span>
      </header>
      {poll && open && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-2 text-xs text-muted"
        >
          <Loader2 className="size-3 animate-spin" aria-hidden /> Waiting for the signing provider
          to finalize the document…
        </p>
      )}
      {r.message && <p className="mt-1 text-xs italic text-muted">“{r.message}”</p>}
      {r.failure_reason && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {r.failure_reason}
        </p>
      )}
      {showDocumentLink && (
        <p className="mt-1 text-xs">
          <Link className="text-accent hover:underline" href={`/documents/${r.document_id}`}>
            {r.document_name ?? 'Open document'}
          </Link>
        </p>
      )}

      <ul className="mt-3 grid gap-1" aria-label="Signers">
        {r.signers.map((s) => (
          <li
            key={s.email}
            className="flex flex-wrap items-center gap-2 text-[13px]"
            data-status={s.status}
          >
            <span className="font-medium">{s.name || s.email}</span>
            <span className="text-xs text-muted">
              {s.email}
              {s.internal ? '' : ' (external)'}
            </span>
            <Badge
              tone={s.status === 'signed' ? 'ok' : s.status === 'declined' ? 'danger' : 'neutral'}
            >
              {titleCase(s.status)}
            </Badge>
            {s.signed_at && (
              <span className="text-xs text-muted">{formatDateTime(s.signed_at)}</span>
            )}
          </li>
        ))}
      </ul>

      {r.artifact && (
        <p
          className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok"
          data-testid="signed-artifact"
        >
          <CheckCircle2 className="size-4" aria-hidden />
          Signed copy saved as{' '}
          <Link className="font-medium underline" href={`/documents/${r.document_id}?tab=versions`}>
            version {r.artifact.version_number ?? ''}
          </Link>{' '}
          ({formatBytes(r.artifact.size_bytes)})
        </p>
      )}

      {r.events.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted">Timeline ({r.events.length})</summary>
          <ul className="mt-1.5 grid gap-1">
            {r.events.map((e, i) => (
              <li key={i}>
                <span className="text-muted">{formatDateTime(e.received_at)}</span> ·{' '}
                {titleCase(e.event_type)} · {titleCase(e.status)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {signingUrl && (
        <SigningOverlay
          url={signingUrl}
          title={r.title}
          onClose={closeOverlay}
          onFinished={finished}
          finishing={refresh.isPending}
        />
      )}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this signature request?"
        description="Signers will no longer be able to sign. This cannot be undone; you can send a new request."
        confirmLabel="Cancel request"
        destructive
        pending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(r.id, {
            onSuccess: () => {
              toast.success('Signature request cancelled');
              setConfirmCancel(false);
            },
            onError: (e) => {
              toast.error(friendlyMessage(e));
              setConfirmCancel(false);
            },
          })
        }
      />
    </article>
  );
}
