'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FlaskConical, Layers, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ThemeToggle } from '@/components/theme';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { authMode } from '@/lib/config';
import { useSession } from './session';

export const DEV_USERS = [
  { email: 'alice@acme.test', name: 'Alice', role: 'Owner / admin' },
  { email: 'bob@acme.test', name: 'Bob', role: 'Member (Engineering)' },
  { email: 'carol@acme.test', name: 'Carol', role: 'Member (Finance)' },
  { email: 'dave@acme.test', name: 'Dave', role: 'Auditor' },
] as const;

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

function safeNext(n: string | null) {
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
}

function DevPanel({ onDone }: { onDone: () => void }) {
  const { signIn } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section
      aria-labelledby="dev-signin"
      className="rounded-lg border border-dashed border-warn/60 bg-warn-soft/50 p-4"
    >
      <h2 id="dev-signin" className="flex items-center gap-2 text-[13px] font-semibold text-warn">
        <FlaskConical className="size-4" aria-hidden /> Development sign-in
      </h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        Local only. Signs in as a seeded user through the backend dev token endpoint. This panel
        cannot exist in a production build.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {DEV_USERS.map((u) => (
          <li key={u.email}>
            <Button
              variant="secondary"
              className="h-auto w-full flex-col items-start gap-0 py-2 text-left"
              disabled={!!busy}
              onClick={async () => {
                setBusy(u.email);
                setError(null);
                try {
                  await signIn({ kind: 'dev', email: u.email });
                  onDone();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Sign-in failed');
                } finally {
                  setBusy(null);
                }
              }}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                {busy === u.email && <Loader2 className="animate-spin" aria-hidden />}
                Sign in as {u.name}
              </span>
              <span className="text-xs font-normal text-muted">{u.role}</span>
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { signIn, provider } = useSession();
  const [forgot, setForgot] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, getValues, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (forgot) {
    return (
      <form
        className="grid gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const email = getValues('email');
          if (!z.string().email().safeParse(email).success) {
            setError('email', { message: 'Enter a valid email address' });
            return;
          }
          try {
            await provider?.requestPasswordReset?.(email);
            toast.success('If that address has an account, a reset email is on its way.');
            setForgot(false);
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not send the reset email');
          }
        }}
      >
        <Field id="email" label="Work email" error={formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        {formError && (
          <p role="alert" className="text-xs text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg">
          Send reset email
        </Button>
        <Button variant="link" onClick={() => setForgot(false)}>
          Back to sign in
        </Button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setFormError(null);
        try {
          await signIn({ kind: 'password', email: v.email, password: v.password });
          onDone();
        } catch (e) {
          setFormError(e instanceof Error ? e.message : 'Sign-in failed');
        }
      })}
    >
      <Field id="email" label="Work email" error={formState.errors.email?.message}>
        {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
      </Field>
      <Field id="password" label="Password" error={formState.errors.password?.message}>
        {(p) => (
          <Input {...p} type="password" autoComplete="current-password" {...register('password')} />
        )}
      </Field>
      {formError && (
        <p role="alert" className="text-xs text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Sign in
      </Button>
      <Button variant="link" onClick={() => setForgot(true)}>
        Forgot your password?
      </Button>
    </form>
  );
}

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { configError } = useSession();
  const reason = params.get('reason');
  const done = () => router.replace(safeNext(params.get('next')));

  return (
    <main className="relative grid min-h-dvh place-items-center bg-bg p-4">
      <div className="absolute right-3 top-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-fg">
            <Layers className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Enterprise DMS</h1>
            <p className="text-[13px] text-muted">
              Documents, versions and sharing for your organization.
            </p>
          </div>
        </div>
        {reason === 'expired' && (
          <p role="status" className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            Your session expired. Sign in again to continue.
          </p>
        )}
        {configError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {configError}
          </p>
        ) : (
          <div className="grid gap-5 rounded-lg border border-line bg-surface p-5 shadow-sm">
            {authMode === 'dev' ? <DevPanel onDone={done} /> : <PasswordForm onDone={done} />}
          </div>
        )}
      </div>
    </main>
  );
}
