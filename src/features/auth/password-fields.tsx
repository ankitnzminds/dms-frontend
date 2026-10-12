'use client';

import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { IconField } from './auth-shell';

export const MIN_PASSWORD_LENGTH = 8;

/** Shown next to every "new password" field. The identity provider enforces its own (possibly stricter) policy. */
export const PASSWORD_HINT = `Use at least ${MIN_PASSWORD_LENGTH} characters. The server may require more.`;

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Enter a new password')
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
    confirm: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match',
  });

/** Password input with a leading lock and a working show / hide toggle. */
export function PasswordField({
  id,
  label,
  error,
  reg,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  error?: string;
  reg: UseFormRegisterReturn;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <IconField
      id={id}
      label={label}
      icon={Lock}
      error={error}
      trailing={
        <button
          type="button"
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-[#155EEF]"
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      }
    >
      {(p) => (
        <input
          {...p}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          {...reg}
        />
      )}
    </IconField>
  );
}

/** Friendly text for a failed recovery / update request; never echoes provider internals. */
export function passwordErrorText(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : '';
  if (/rate|too many|seconds|limit/i.test(m))
    return 'Too many requests. Wait a minute and try again.';
  if (/fetch|network|connect/i.test(m))
    return 'Cannot reach the server. Check your connection and try again.';
  if (/different from the old|same as/i.test(m))
    return 'Choose a password you have not used before.';
  if (/weak|at least|characters|password should/i.test(m)) return m;
  return fallback;
}
