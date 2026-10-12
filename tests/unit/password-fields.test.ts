import { describe, expect, it } from 'vitest';
import { newPasswordSchema, passwordErrorText } from '@/features/auth/password-fields';

describe('new password rules', () => {
  it('requires a minimum length and a matching confirmation', () => {
    expect(newPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(
      false,
    );
    const r = newPasswordSchema.safeParse({ password: 'long-enough-1', confirm: 'different-1' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('The passwords do not match');
    expect(
      newPasswordSchema.safeParse({ password: 'long-enough-1', confirm: 'long-enough-1' }).success,
    ).toBe(true);
  });
});

describe('passwordErrorText', () => {
  it('maps rate limits and network failures, never echoing unknown provider internals', () => {
    expect(passwordErrorText(new Error('email rate limit exceeded'), 'x')).toMatch(/Too many/);
    expect(passwordErrorText(new Error('Failed to fetch'), 'x')).toMatch(/Cannot reach/);
    expect(
      passwordErrorText(new Error('AuthApiError: internal db error 500 xyz'), 'Fallback'),
    ).toBe('Fallback');
  });
});
