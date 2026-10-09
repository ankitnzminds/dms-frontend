'use client';

import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { MemberPicker } from '@/features/members/member-picker';
import {
  signatureErrorMessage,
  useCreateSignatureRequest,
  useSignatureCapabilities,
} from '@/features/signatures/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { isEmail } from '@/features/sharing/schemas';

type Signer = { email: string; name: string };

export function RequestSignatureDialog({
  documentId,
  documentName,
  open,
  onOpenChange,
}: {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateSignatureRequest(documentId);
  const caps = useSignatureCapabilities();
  const [signers, setSigners] = useState<Signer[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signerError, setSignerError] = useState<string | null>(null);

  function addSigner(s: Signer) {
    const e = s.email.trim().toLowerCase();
    if (!isEmail(e)) return setSignerError('Enter a valid email address');
    if (signers.some((x) => x.email === e)) return setSignerError('That signer is already added');
    setSigners([...signers, { email: e, name: s.name.trim() }]);
    setSignerError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Request signature on "${documentName}"`}
        description="Each signer receives a link to sign this PDF. The signed copy is saved as a new version."
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (signers.length === 0) return setSignerError('Add at least one signer');
            create.mutate(
              {
                signers: signers.map((s) => ({ email: s.email, name: s.name || null })),
                title: title.trim() || null,
                message: message.trim() || null,
              },
              {
                onSuccess: () => {
                  toast.success('Signature requested');
                  setSigners([]);
                  onOpenChange(false);
                },
                onError: (er) => setError(signatureErrorMessage(er) ?? friendlyMessage(er)),
              },
            );
          }}
        >
          <DialogBody className="grid gap-3">
            {signers.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Signers">
                {signers.map((s) => (
                  <li
                    key={s.email}
                    className="inline-flex items-center gap-1 rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-fg"
                  >
                    {s.name ? `${s.name} <${s.email}>` : s.email}
                    <button
                      type="button"
                      aria-label={`Remove ${s.email}`}
                      className="rounded-sm hover:bg-accent/20"
                      onClick={() => setSigners(signers.filter((x) => x.email !== s.email))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <MemberPicker
              label="Add a colleague"
              inputId="sig-member"
              onSelect={(u) => u.email && addSigner({ email: u.email, name: u.display_name ?? '' })}
            />
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="grid gap-1">
                <Label htmlFor="sig-email">Or enter an email</Label>
                <Input
                  id="sig-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="sig-name">Name (optional)</Label>
                <Input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button
                onClick={() => {
                  addSigner({ email, name });
                  if (isEmail(email)) (setEmail(''), setName(''));
                }}
              >
                Add signer
              </Button>
            </div>
            {signerError && (
              <p role="alert" className="text-xs text-danger">
                {signerError}
              </p>
            )}
            {caps.data && !caps.data.allow_external_signers && (
              <p className="text-xs text-muted">
                Signers must belong to your organization; external signers are not allowed.
              </p>
            )}
            <Field id="sig-title" label="Title (optional)">
              {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field id="sig-msg" label="Message to signers (optional)">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Field>
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />} Request
              signature
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
