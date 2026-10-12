'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { PRIMARY_BUTTON } from './auth-shell';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PasswordField,
  passwordErrorText,
} from './password-fields';
import { useSession } from './session';

const schema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: z
      .string()
      .min(1, 'Enter a new password')
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
    confirm: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match',
  })
  .refine((v) => v.password !== v.current, {
    path: ['password'],
    message: 'The new password must be different from the current one',
  });

/**
 * Self-service password change for the signed-in person (users and administrators alike). The identity provider
 * verifies the current password and applies its policy; other devices are signed out afterwards. This never
 * touches anyone else's account.
 */
export function ChangePasswordView() {
  const { provider } = useSession();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState,
    reset,
    setError: setFieldError,
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { current: '', password: '', confirm: '' },
  });
  const supported = !!provider?.changePassword;

  return (
    <>
      <PageHeader
        title="Change password"
        description="Choose a new password for your own account."
      />
      <Panel className="max-w-md p-5">
        {!supported ? (
          <p role="status" className="text-[13px] text-muted" data-testid="change-unavailable">
            Passwords are managed by your organization&apos;s identity provider, so they cannot be
            changed here with the current sign-in method.
          </p>
        ) : done ? (
          <div className="grid gap-3 text-center" data-testid="change-done">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
              <CheckCircle2 className="size-6" aria-hidden />
            </span>
            <p role="status" className="text-[14px] font-medium">
              Your password was changed.
            </p>
            <p className="text-xs text-muted">
              Your other devices and browsers were signed out. This one stays signed in.
            </p>
            <Button asChild variant="primary" className={PRIMARY_BUTTON}>
              <Link href="/dashboard">Back to the dashboard</Link>
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={handleSubmit(async (v) => {
              setError(null);
              try {
                await provider!.changePassword!(v.current, v.password);
                reset();
                setDone(true);
              } catch (e) {
                const msg = e instanceof Error ? e.message : '';
                if (/current password is incorrect/i.test(msg))
                  setFieldError('current', { message: 'Your current password is incorrect' });
                else
                  setError(
                    passwordErrorText(e, 'Could not change the password. Try again shortly.'),
                  );
              }
            })}
          >
            <PasswordField
              id="current-password"
              label="Current password"
              autoComplete="current-password"
              reg={register('current')}
              error={formState.errors.current?.message}
            />
            <PasswordField
              id="new-password"
              label="New password"
              autoComplete="new-password"
              reg={register('password')}
              error={formState.errors.password?.message}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              autoComplete="new-password"
              reg={register('confirm')}
              error={formState.errors.confirm?.message}
            />
            <p className="text-xs text-muted">{PASSWORD_HINT}</p>
            {error && (
              <p
                role="alert"
                className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              className={PRIMARY_BUTTON}
              disabled={formState.isSubmitting}
            >
              {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
              {formState.isSubmitting ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        )}
      </Panel>
    </>
  );
}
