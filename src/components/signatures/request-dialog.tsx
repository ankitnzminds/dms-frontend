'use client';

import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SignaturePlacementModal, toApiPlacement } from './placement-modal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { MemberPicker } from '@/features/members/member-picker';
import {
  chainNeedsBuiltin,
  signatureErrorMessage,
  useCreateSignatureRequest,
  useSignatureCapabilities,
  useSignatureChain,
} from '@/features/signatures/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { isEmail } from '@/features/sharing/schemas';
import { titleCase } from '@/lib/format';

type Signer = { email: string; name: string };

export function RequestSignatureDialog({
  documentId,
  documentName,
  open,
  onOpenChange,
  isPdf = true,
  folderId,
}: {
  documentId: string;
  documentName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Only PDFs can go to the external provider; any file type can be signed with built-in signing. */
  isPdf?: boolean;
  /** The document's folder: when it has a signature chain, the chain decides the signers. */
  folderId?: string;
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
  const chain = useSignatureChain(folderId);
  const hasChain = (chain.data?.levels.length ?? 0) > 0;
  const forceBuiltin = chainNeedsBuiltin(chain.data);
  const externalOk = !!caps.data?.available;
  const builtinOk = !!caps.data?.builtin_available;
  const [chosen, setChosen] = useState<'builtin' | 'default'>('default');
  // The effective choice never points at something unavailable (e.g. a DOCX can only use built-in).
  const provider: 'builtin' | 'default' =
    (forceBuiltin || chosen === 'builtin') && builtinOk
      ? 'builtin'
      : externalOk
        ? 'default'
        : 'builtin';
  const builtin = provider === 'builtin';
  // the external provider needs to know WHERE the signature goes: pick it on a preview first
  const [placing, setPlacing] = useState(false);
  const payload = () => ({
    // with a chain the server uses the folder's signers and ignores this list
    signers: hasChain ? [] : signers.map((s) => ({ email: s.email, name: s.name || null })),
    title: title.trim() || null,
    message: message.trim() || null,
    provider,
  });
  const done = {
    onSuccess: () => {
      toast.success('Signature requested');
      setSigners([]);
      setPlacing(false);
      onOpenChange(false);
    },
    onError: (er: unknown) => {
      setPlacing(false);
      setError(signatureErrorMessage(er) ?? friendlyMessage(er));
    },
  };

  function addSigner(s: Signer) {
    const e = s.email.trim().toLowerCase();
    if (!isEmail(e)) return setSignerError('Enter a valid email address');
    if (signers.some((x) => x.email === e)) return setSignerError('That signer is already added');
    setSigners([...signers, { email: e, name: s.name.trim() }]);
    setSignerError(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={`Request signature on "${documentName}"`}
          description={
            builtin
              ? 'Each colleague reviews the exact version and signs with a typed name. This is an electronic-signature record kept in this system, not a certificate-based PDF signature.'
              : 'Each signer receives a link to sign this PDF. The signed copy is saved as a new version.'
          }
        >
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (!hasChain && signers.length === 0)
                return setSignerError('Add at least one signer');
              if (builtin) create.mutate(payload(), done);
              else setPlacing(true);
            }}
          >
            <DialogBody className="grid gap-3">
              {externalOk && builtinOk && !forceBuiltin && (
                <fieldset className="grid gap-1.5 text-[13px]">
                  <legend className="mb-1 text-xs font-medium text-muted">
                    How should it be signed?
                  </legend>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="sig-provider"
                      checked={provider === 'default'}
                      onChange={() => setChosen('default')}
                    />
                    <span>
                      <strong>
                        {caps.data?.provider ? titleCase(caps.data.provider) : 'Signing service'}
                      </strong>{' '}
                      — PDF, external signers allowed, signed PDF saved as a new version
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="sig-provider"
                      checked={provider === 'builtin'}
                      onChange={() => setChosen('builtin')}
                    />
                    <span>
                      <strong>Built-in</strong> — colleagues only, any file type, typed-name consent
                    </span>
                  </label>
                </fieldset>
              )}
              {!isPdf && !builtin && (
                <p className="text-xs text-muted">
                  This file is not a PDF. A PDF copy is made for signing (text only: layout, fonts
                  and images inside Word/Excel files are not kept); your original stays as it is.
                </p>
              )}
              {hasChain && chain.data ? (
                <div className="grid gap-1.5 text-[13px]" data-testid="chain-preview">
                  <p className="text-xs font-medium text-muted">
                    This folder has a signature chain. Levels sign in order; everyone inside a level
                    signs in parallel.
                  </p>
                  {chain.data.levels.map((lv, i) => (
                    <p key={i} className="flex flex-wrap items-center gap-1.5">
                      <strong>L{i + 1}:</strong>
                      {lv.map((s) => (
                        <span
                          key={s.user_id}
                          className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-fg"
                        >
                          {s.is_super_signer ? '⚡ ' : ''}
                          {s.name}
                          {s.optional ? ' (optional)' : ''}
                        </span>
                      ))}
                    </p>
                  ))}
                  {forceBuiltin && (
                    <p className="text-xs text-muted">
                      Optional and super signers are signed with built-in signing.
                    </p>
                  )}
                </div>
              ) : (
                <>
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
                    onSelect={(u) =>
                      u.email && addSigner({ email: u.email, name: u.display_name ?? '' })
                    }
                  />
                  <div
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    hidden={builtin}
                  >
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
                  {caps.data && (builtin || !caps.data.allow_external_signers) && (
                    <p className="text-xs text-muted">
                      Signers must belong to your organization; external signers are not allowed.
                    </p>
                  )}
                </>
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
                {create.isPending && <Loader2 className="animate-spin" aria-hidden />}{' '}
                {hasChain ? 'Start signature chain' : 'Request signature'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {placing && (
        <SignaturePlacementModal
          documentId={documentId}
          open
          confirmLabel={hasChain ? 'Start signature chain' : 'Send for signature'}
          onCancel={() => setPlacing(false)}
          onConfirm={async (box) => {
            await create.mutateAsync({ ...payload(), placement: toApiPlacement(box) }).then(
              () => done.onSuccess(),
              (er) => {
                done.onError(er);
                throw er;
              },
            );
          }}
        />
      )}
    </>
  );
}
