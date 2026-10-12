'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { AuthShell, IconField, PRIMARY_BUTTON } from './auth-shell';
import { passwordErrorText } from './password-fields';
import { useSession } from './session';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
});

export const GENERIC_SENT =
  'If an account exists with this email address, password reset instructions will be sent.';

/** Step 1 of recovery: ask the identity provider to email a reset link. The answer never reveals whether the address exists. */
export function ForgotPasswordView() {
  const { provider, configError } = useSession();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });
  const supported = !!provider?.requestPasswordReset;

  return (
    <AuthShell subtitle="Forgot your password?">
      {configError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {configError}
        </p>
      ) : !supported ? (
        <p
          role="status"
          className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info"
          data-testid="reset-unavailable"
        >
          Password recovery is handled by your organization&apos;s identity provider and is not
          available with this sign-in method. Contact your administrator.
        </p>
      ) : sent ? (
        <div className="grid gap-4 text-center" data-testid="reset-sent">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#155EEF]/10 text-[#155EEF]">
            <MailCheck className="size-6" aria-hidden />
          </span>
          <p role="status" className="text-[14px]">
            {GENERIC_SENT}
          </p>
          <p className="text-xs text-muted">
            The link expires after a short time and works once. Check your spam folder if it does
            not arrive.
          </p>
        </div>
      ) : (
        <form
          className="grid gap-[clamp(0.6rem,2vh,1rem)]"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            setError(null);
            try {
              await provider!.requestPasswordReset!(v.email.trim());
              setSent(true);
            } catch (e) {
              setError(passwordErrorText(e, 'Could not send the request. Try again shortly.'));
            }
          })}
        >
          <p className="text-center text-[13px] text-muted">
            Enter your registered email address to receive password reset instructions.
          </p>
          <IconField
            id="email"
            label="Email address"
            icon={Mail}
            error={formState.errors.email?.message}
          >
            {(p) => (
              <input
                {...p}
                type="email"
                autoComplete="email"
                placeholder="Enter your email address"
                {...register('email')}
              />
            )}
          </IconField>
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
            {formState.isSubmitting ? 'Sending…' : 'Send Reset Link'}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#155EEF] hover:underline focus-visible:outline-2 focus-visible:outline-[#155EEF]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to Sign In
        </Link>
      </p>
    </AuthShell>
  );
}
