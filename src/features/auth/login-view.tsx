'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Eye,
  EyeOff,
  FileSearch,
  FlaskConical,
  Layers,
  Loader2,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';
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

/** Seeded local users. The shared password is a development value only (the panel cannot exist in production). */
export const DEV_USERS = [
  { email: 'alice@acme.test', name: 'Alice', role: 'Owner / admin' },
  { email: 'bob@acme.test', name: 'Bob', role: 'Member (Engineering)' },
  { email: 'carol@acme.test', name: 'Carol', role: 'Member (Finance)' },
  { email: 'dave@acme.test', name: 'Dave', role: 'Auditor' },
] as const;
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_PASSWORD ?? 'dev-password-123';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export function safeNext(n: string | null) {
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/dashboard';
}

const POINTS = [
  { icon: FileSearch, title: 'Find anything', body: 'Search inside file contents, not just names.' },
  { icon: MessagesSquare, title: 'Ask your documents', body: 'Get answers with citations you can open.' },
  { icon: ShieldCheck, title: 'Controlled by default', body: 'Permissions, audit trail and retention on every file.' },
];

function BrandPanel() {
  return (
    <aside
      aria-label="About Enterprise DMS"
      className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,#173a9e,#2457d6_55%,#3f7bff)] p-10 text-white lg:flex"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <span className="grid size-9 place-items-center rounded-lg bg-white/15">
          <Layers className="size-5" aria-hidden />
        </span>
        Enterprise DMS
      </div>
      <div className="relative max-w-md">
        <p className="text-3xl font-semibold leading-tight tracking-tight">
          Every document, in the right hands.
        </p>
        <ul className="mt-8 grid gap-5">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-white/15">
                <Icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-sm text-white/75">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-white/60">Documents, versions and sharing for your organization.</p>
    </aside>
  );
}

function DevPanel({ onPick }: { onPick: (email: string) => void }) {
  return (
    <section
      aria-labelledby="dev-signin"
      className="rounded-lg border border-dashed border-warn/60 bg-warn-soft/50 p-3.5"
    >
      <h2 id="dev-signin" className="flex items-center gap-2 text-[13px] font-semibold text-warn">
        <FlaskConical className="size-4" aria-hidden /> Development accounts
      </h2>
      <p className="mb-2.5 mt-1 text-xs text-muted">
        Pick a seeded user to fill the form. Password for all: <code>{DEV_PASSWORD}</code>. Local only.
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {DEV_USERS.map((u) => (
          <li key={u.email}>
            <Button
              type="button"
              variant="secondary"
              className="h-auto w-full flex-col items-start gap-0 py-1.5 text-left"
              onClick={() => onPick(u.email)}
              aria-label={`Use ${u.name} (${u.role})`}
            >
              <span className="font-semibold">{u.name}</span>
              <span className="text-xs font-normal text-muted">{u.role}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const { signIn, provider } = useSession();
  const [forgot, setForgot] = useState(false);
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState, getValues, setError, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const canReset = authMode === 'supabase' && !!provider?.requestPasswordReset;

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
        <Button type="button" variant="link" onClick={() => setForgot(false)}>
          Back to sign in
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-4"
        noValidate
        onSubmit={handleSubmit(async (v) => {
          setFormError(null);
          try {
            await signIn({ email: v.email.trim(), password: v.password });
            onDone();
          } catch (e) {
            setFormError(e instanceof Error ? e.message : 'Sign-in failed');
          }
        })}
      >
        <Field id="email" label="Work email" error={formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="username" {...register('email')} />}
        </Field>
        <Field id="password" label="Password" error={formState.errors.password?.message}>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                {...register('password')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1"
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          )}
        </Field>
        {formError && (
          <p
            role="alert"
            data-testid="login-error"
            className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {formError}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          {formState.isSubmitting ? 'Signing in' : 'Sign in'}
        </Button>
        {canReset && (
          <Button type="button" variant="link" onClick={() => setForgot(true)}>
            Forgot your password?
          </Button>
        )}
      </form>
      {authMode === 'dev' && (
        <DevPanel
          onPick={(email) => {
            setValue('email', email, { shouldValidate: true });
            setValue('password', DEV_PASSWORD, { shouldValidate: true });
            setFormError(null);
          }}
        />
      )}
    </div>
  );
}

const NOTICES: Record<string, string> = {
  expired: 'Your session ended. Sign in again to continue.',
  signed_out: 'You were signed out.',
};

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { configError } = useSession();
  const reason = params.get('reason');
  const done = () => router.replace(safeNext(params.get('next')));

  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <BrandPanel />
      <div className="relative grid place-items-center p-5">
        <div className="absolute right-3 top-3">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-fg">
              <Layers className="size-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight">Enterprise DMS</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mb-5 mt-1 text-[13px] text-muted">Use your work account to continue.</p>
          {reason && NOTICES[reason] && (
            <p role="status" className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
              {NOTICES[reason]}
            </p>
          )}
          {configError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {configError}
            </p>
          ) : (
            <SignInForm onDone={done} />
          )}
        </div>
      </div>
    </main>
  );
}
