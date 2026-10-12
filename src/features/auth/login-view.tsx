'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuthShell, IconField, PRIMARY_BUTTON } from './auth-shell';
import { AuthError, type SsoProvider } from './providers';
import { useSession } from './session';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

type Role = 'user' | 'admin';

export function safeNext(n: string | null) {
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login')
    ? n
    : '/dashboard';
}

function RoleSwitch({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const opts: [Role, string, LucideIcon][] = [
    ['user', 'User', UserRound],
    ['admin', 'Admin', ShieldCheck],
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Sign in as"
      className="grid grid-cols-2 gap-0 rounded-[0.75em]"
    >
      {opts.map(([r, label, Icon]) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={role === r}
          onClick={() => onChange(r)}
          className={cn(
            'flex h-[3.1em] items-center justify-center gap-[0.55em] border text-[1.05em] font-medium transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#155EEF]',
            r === 'user' ? 'rounded-l-[0.75em]' : 'rounded-r-[0.75em]',
            role === r
              ? 'z-[1] border-[#155EEF] bg-[#155EEF]/10 text-[#155EEF]'
              : 'border-line bg-surface-2 text-muted hover:text-text',
          )}
        >
          <Icon className="size-[1.25em]" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" className="size-[1.45em]" aria-hidden>
      <rect width="10" height="10" fill="#f25022" />
      <rect x="11" width="10" height="10" fill="#7fba00" />
      <rect y="11" width="10" height="10" fill="#00a4ef" />
      <rect x="11" y="11" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[1.45em]" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.5 7l7.3 5.7c4.3-4 6.9-9.9 6.9-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.9 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function SsoButtons({ next }: { next: string | null }) {
  const { provider } = useSession();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<SsoProvider | null>(null);
  const supported = !!provider?.signInWithSso;
  const go = async (p: SsoProvider) => {
    setNote(null);
    if (!provider?.signInWithSso) {
      setNote(
        'Single sign-on is not set up for this environment. Sign in with your email and password.',
      );
      return;
    }
    setBusy(p);
    try {
      const back = new URL('/login', window.location.origin);
      back.searchParams.set('sso', '1');
      if (next) back.searchParams.set('next', next);
      await provider.signInWithSso(p, back.toString());
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Single sign-on is not available right now.');
      setBusy(null);
    }
  };
  const base =
    'flex h-[3.1em] items-center justify-center gap-[0.65em] rounded-[0.75em] border border-line-strong bg-surface text-[1.05em] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[#155EEF] disabled:opacity-60';
  return (
    <div className="grid gap-[0.9em]">
      <div className="flex items-center gap-[1em] text-[0.95em] text-muted">
        <span className="h-px flex-1 bg-line" />
        Or continue with
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-2 gap-[0.9em]">
        <button
          type="button"
          className={base}
          disabled={!!busy || !supported}
          onClick={() => void go('azure')}
        >
          {busy === 'azure' ? <Loader2 className="size-[1.3em] animate-spin" /> : <MicrosoftMark />}{' '}
          Microsoft
        </button>
        <button
          type="button"
          className={base}
          disabled={!!busy || !supported}
          onClick={() => void go('google')}
        >
          {busy === 'google' ? <Loader2 className="size-[1.3em] animate-spin" /> : <GoogleMark />}{' '}
          Google
        </button>
      </div>
      {(note || !supported) && (
        <p role="status" className="text-[0.85em] text-muted">
          {note ??
            'Single sign-on is not set up for this environment. Use your email and password.'}
        </p>
      )}
    </div>
  );
}

function SignInForm({ onDone, next }: { onDone: (role: Role) => void; next: string | null }) {
  const { signIn, provider } = useSession();
  const [role, setRole] = useState<Role>('user');
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: true },
  });
  // Recovery is the identity provider's own flow; without one (development sign-in) there is nothing to link to.
  const canReset = !!provider?.requestPasswordReset;
  const submitLabel = role === 'admin' ? 'Sign in as Admin' : 'Sign in as User';

  return (
    <div className="grid gap-[1.1em]">
      <RoleSwitch role={role} onChange={setRole} />
      <form
        className="grid gap-[1.05em]"
        noValidate
        onSubmit={handleSubmit(async (v) => {
          setFormError(null);
          try {
            const creds = { email: v.email.trim(), password: v.password, remember: v.remember };
            try {
              await signIn(creds);
            } catch (first) {
              // A space pasted before or after the password is the usual reason for a rejected sign-in:
              // retry once without it (a password that really has edge spaces still works on the first try).
              const trimmed = v.password.trim();
              if (
                first instanceof AuthError &&
                first.code === 'invalid_credentials' &&
                trimmed &&
                trimmed !== v.password
              ) {
                await signIn({ ...creds, password: trimmed });
              } else {
                throw first;
              }
            }
            onDone(role);
          } catch (e) {
            setFormError(e instanceof Error ? e.message : 'Sign-in failed');
          }
        })}
      >
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
              autoComplete="username"
              placeholder={role === 'admin' ? 'admin@nzmdms.com' : 'Enter your email address'}
              {...register('email')}
            />
          )}
        </IconField>
        <IconField
          id="password"
          label="Password"
          icon={Lock}
          error={formState.errors.password?.message}
          trailing={
            <button
              type="button"
              className="absolute right-[0.5em] top-1/2 grid size-[2.3em] -translate-y-1/2 place-items-center rounded-md text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-[#155EEF]"
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
              onClick={() => setShow((s) => !s)}
            >
              {show ? <EyeOff className="size-[1.3em]" /> : <Eye className="size-[1.3em]" />}
            </button>
          }
        >
          {(p) => (
            <input
              {...p}
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              {...register('password')}
            />
          )}
        </IconField>
        <div className="-mt-[0.1em] flex items-center justify-between gap-3 text-[0.95em]">
          <label className="flex items-center gap-[0.6em] text-muted">
            <span className="relative grid size-[1.35em] place-items-center">
              <input
                type="checkbox"
                className="peer absolute inset-0 size-full appearance-none rounded-[0.3em] border border-line-strong bg-surface checked:border-[#155EEF] checked:bg-[#155EEF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155EEF]"
                {...register('remember')}
              />
              <Check
                className="pointer-events-none relative size-[0.95em] text-white opacity-0 peer-checked:opacity-100"
                strokeWidth={3}
                aria-hidden
              />
            </span>
            Remember me
          </label>
          {canReset && (
            <Link
              href="/forgot-password"
              className="font-medium text-[#155EEF] hover:underline focus-visible:outline-2 focus-visible:outline-[#155EEF]"
            >
              Forgot password?
            </Link>
          )}
        </div>
        {formError && (
          <p
            role="alert"
            data-testid="login-error"
            className="rounded-md bg-danger-soft px-3 py-2 text-[0.9em] text-danger"
          >
            {formError}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className={PRIMARY_BUTTON}
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ArrowRight aria-hidden />
          )}
          {formState.isSubmitting ? 'Signing in…' : submitLabel}
        </Button>
      </form>

      <SsoButtons next={next} />

      {role === 'admin' && (
        <aside
          className="flex gap-[0.95em] rounded-[1em] bg-[#155EEF]/8 p-[1.05em] text-[0.9em]"
          data-testid="admin-notice"
        >
          <span className="grid size-[2.9em] shrink-0 place-items-center rounded-full bg-[#155EEF]/15 text-[#155EEF]">
            <ShieldCheck className="size-[1.5em]" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">Restricted access</span>
            <span className="block text-muted">
              Admin accounts have access to organization settings, user management, and system
              configuration.
            </span>
          </span>
        </aside>
      )}
    </div>
  );
}

const NOTICES: Record<string, string> = {
  expired: 'Your session ended. Sign in again to continue.',
  signed_out: 'You were signed out.',
  password_reset: 'Your password was updated. Sign in with the new password.',
  password_changed: 'Your password was changed. Sign in again.',
};

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { configError, status } = useSession();
  const reason = params.get('reason');
  const next = params.get('next');
  // An explicit ?next= wins; otherwise "Admin" opens the administration area (the server still decides
  // whether this account may see it) and "User" opens the dashboard.
  const done = (role: Role) => {
    router.replace(next ? safeNext(next) : role === 'admin' ? '/admin' : '/dashboard');
  };
  // Coming back from an external single sign-on provider: the session exists, so continue into the app.
  const returnedFromSso = params.get('sso') === '1' && status === 'signedIn';
  useEffect(() => {
    if (returnedFromSso) router.replace(safeNext(next));
  }, [returnedFromSso, next, router]);

  return (
    <AuthShell
      subtitle={configError ? 'Enterprise Document Management' : 'Sign in to your account'}
    >
      {reason && NOTICES[reason] && (
        <p role="status" className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[0.9em] text-info">
          {NOTICES[reason]}
        </p>
      )}
      {configError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[0.9em] text-danger">
          {configError}
        </p>
      ) : (
        <SignInForm onDone={done} next={next} />
      )}
      <p className="mt-4 hidden items-center justify-center gap-1.5 text-xs text-faint max-lg:flex">
        <KeyRound className="size-3.5" aria-hidden /> Secure sign-in
      </p>
    </AuthShell>
  );
}
