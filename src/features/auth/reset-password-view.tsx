'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { AuthShell, PRIMARY_BUTTON } from './auth-shell';
import {
  newPasswordSchema,
  PASSWORD_HINT,
  PasswordField,
  passwordErrorText,
} from './password-fields';
import { useSession } from './session';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

/** How long we wait for the provider to report a valid recovery link before calling it invalid. */
const LINK_WAIT_MS = 4000;

/**
 * Step 3-4 of recovery. The identity provider's emailed link is time-limited and single-use; arriving through it
 * gives a recovery session, which is the only thing allowed to set a new password here.
 */
export function ResetPasswordView() {
  const { provider, configError } = useSession();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const supported = !!provider?.updatePassword && !!provider.onPasswordRecovery;

  useEffect(() => {
    if (!provider?.onPasswordRecovery) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reacting to the provider's recovery state */
    if (typeof window !== 'undefined' && /error(_code)?=/.test(window.location.hash)) {
      setPhase('invalid');
      return;
    }
    if (provider.isPasswordRecovery?.()) {
      setPhase('ready');
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const off = provider.onPasswordRecovery(() => setPhase('ready'));
    const t = setTimeout(() => setPhase((p) => (p === 'checking' ? 'invalid' : p)), LINK_WAIT_MS);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [provider]);

  const body = configError ? (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
      {configError}
    </p>
  ) : !supported ? (
    <p role="status" className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
      Password recovery is not available with this sign-in method.
    </p>
  ) : phase === 'checking' ? (
    <p role="status" className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your reset link…
    </p>
  ) : phase === 'invalid' ? (
    <div className="grid gap-3 text-center" data-testid="reset-invalid">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <p role="alert" className="text-[14px]">
        This reset link is invalid, has expired, or was already used.
      </p>
      <Link
        href="/forgot-password"
        className="text-[13px] font-medium text-[#155EEF] hover:underline"
      >
        Request a new link
      </Link>
    </div>
  ) : phase === 'done' ? (
    <div className="grid gap-4 text-center" data-testid="reset-done">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
        <CheckCircle2 className="size-6" aria-hidden />
      </span>
      <p role="status" className="text-[14px]">
        Your password was updated. Use the new password to sign in.
      </p>
      <Button
        variant="primary"
        size="lg"
        className={PRIMARY_BUTTON}
        onClick={() => router.replace('/login?reason=password_reset')}
      >
        Return to Sign In
      </Button>
    </div>
  ) : (
    <form
      className="grid gap-[clamp(0.6rem,2vh,1rem)]"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setError(null);
        try {
          await provider!.updatePassword!(v.password);
          // Leave the recovery session: signing in again proves the new password works.
          await provider!.signOut();
          setPhase('done');
        } catch (e) {
          setError(passwordErrorText(e, 'Could not update the password. Request a new link.'));
        }
      })}
    >
      <PasswordField
        id="new-password"
        label="New password"
        autoComplete="new-password"
        placeholder="Enter a new password"
        reg={register('password')}
        error={formState.errors.password?.message}
      />
      <PasswordField
        id="confirm-password"
        label="Confirm new password"
        autoComplete="new-password"
        placeholder="Repeat the new password"
        reg={register('confirm')}
        error={formState.errors.confirm?.message}
      />
      <p className="text-xs text-muted">{PASSWORD_HINT}</p>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className={PRIMARY_BUTTON}
        disabled={formState.isSubmitting}
      >
        {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        {formState.isSubmitting ? 'Updating…' : 'Reset password'}
      </Button>
    </form>
  );

  return (
    <AuthShell subtitle={phase === 'done' ? 'Password updated' : 'Choose a new password'}>
      {body}
    </AuthShell>
  );
}
