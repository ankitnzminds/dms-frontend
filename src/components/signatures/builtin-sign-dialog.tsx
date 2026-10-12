'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useMe } from '@/features/auth/session';
import {
  downloadSigningDocument,
  signatureErrorMessage,
  useBuiltinDecline,
  useBuiltinSign,
  useSignatureStatement,
  type SignatureRequest,
} from '@/features/signatures/hooks';
import { friendlyMessage } from '@/lib/api-client';

/**
 * Built-in signing: review the exact version, agree to the versioned statement, type your name, sign.
 * Declining is a separate step. Nothing here claims a cryptographic signature: it is an electronic record.
 */
export function BuiltinSignDialog({
  request,
  open,
  onOpenChange,
}: {
  request: SignatureRequest;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const statement = useSignatureStatement();
  const sign = useBuiltinSign();
  const decline = useBuiltinDecline();
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmSuper, setConfirmSuper] = useState(false);
  const { data: me } = useMe();
  const mine = request.signers.find((s) => s.email.toLowerCase() === me?.email?.toLowerCase());
  const isSuper = !!mine?.is_super_signer;
  const busy = sign.isPending || decline.isPending;
  const fail = (e: unknown) => setError(signatureErrorMessage(e) ?? friendlyMessage(e));

  function doSign() {
    setError(null);
    sign.mutate(
      {
        id: request.id,
        body: {
          agreed: true,
          statement_version: statement.data!.version,
          typed_name: name.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success('Signed');
          onOpenChange(false);
        },
        onError: fail,
      },
    );
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadSigningDocument(request.id, request.document_name ?? 'document');
    } catch (e) {
      toast.error(friendlyMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent
          title={declining ? 'Decline to sign' : `Sign “${request.title}”`}
          description={
            declining
              ? 'Declining ends this request for everyone. It cannot be undone.'
              : `You are signing version ${request.source_version_number ?? ''} of ${request.document_name ?? 'this document'}.`
          }
        >
          <DialogBody className="grid gap-3">
            {!declining ? (
              <>
                <Button
                  variant="secondary"
                  className="justify-self-start"
                  disabled={downloading}
                  onClick={() => void download()}
                >
                  {downloading ? <Loader2 className="animate-spin" /> : <Download />} Review the
                  document
                </Button>
                <div className="rounded-md border border-line bg-surface-2 p-3 text-[13px]">
                  {statement.data ? statement.data.text : 'Loading the signature statement…'}
                </div>
                {isSuper && (
                  <p
                    role="note"
                    className="rounded-md border border-warn bg-warn-soft px-3 py-2 text-xs text-warn"
                  >
                    Signing this instantly bypasses everyone else remaining in the chain.
                  </p>
                )}
                <label className="flex items-start gap-2 text-[13px]">
                  <Checkbox
                    checked={agreed}
                    onCheckedChange={(v) => setAgreed(v === true)}
                    aria-label="I agree to the signature statement"
                  />
                  <span>I have reviewed the document and I agree to the statement above.</span>
                </label>
                <div className="grid gap-1">
                  <Label htmlFor="sig-typed-name">Type your full name to sign</Label>
                  <Input
                    id="sig-typed-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-1">
                <Label htmlFor="sig-decline-reason">Reason (optional)</Label>
                <Textarea
                  id="sig-decline-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            {!declining ? (
              <>
                <Button variant="danger-ghost" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !agreed || !name.trim() || !statement.data}
                  onClick={() => (isSuper ? setConfirmSuper(true) : doSign())}
                >
                  {sign.isPending && <Loader2 className="animate-spin" aria-hidden />} Sign
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setDeclining(false)}>
                  Back
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    decline.mutate(
                      { id: request.id, reason: reason.trim() || null },
                      {
                        onSuccess: () => {
                          toast.success('You declined this request');
                          onOpenChange(false);
                        },
                        onError: fail,
                      },
                    );
                  }}
                >
                  {decline.isPending && <Loader2 className="animate-spin" aria-hidden />} Decline to
                  sign
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmSuper}
        onOpenChange={setConfirmSuper}
        title="Sign as super signer?"
        description="You have super-signer override power on this request. Signing it will immediately bypass every other pending signer at this level and every signer at every level below - that can't be undone. Continue?"
        confirmLabel="Sign and bypass the rest"
        destructive
        pending={sign.isPending}
        onConfirm={() => {
          setConfirmSuper(false);
          doSign();
        }}
      />
    </>
  );
}
