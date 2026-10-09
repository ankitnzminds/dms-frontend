import { describe, expect, it } from 'vitest';
import { ApiError, friendlyMessage } from '@/lib/api-client/errors';

describe('friendlyMessage', () => {
  it('keeps specific server messages for business-rule validation errors', () => {
    const e = new ApiError({
      status: 422,
      code: 'validation_error',
      message: 'Shares may last at most 365 days.',
    });
    expect(friendlyMessage(e)).toBe('Shares may last at most 365 days.');
  });

  it('uses the generic text for generic FastAPI validation failures', () => {
    const e = new ApiError({
      status: 422,
      code: 'validation_error',
      message: 'Request validation failed.',
    });
    expect(friendlyMessage(e)).toMatch(/not valid/);
  });

  it('explains unknown_recipient without leaking more than the server said', () => {
    const e = new ApiError({ status: 422, code: 'unknown_recipient', message: 'x' });
    expect(friendlyMessage(e)).toMatch(/not an active member/);
    expect(friendlyMessage(e)).toMatch(/outside the organization is not enabled/);
  });

  it('handles network errors and non-ApiError values', () => {
    expect(
      friendlyMessage(new ApiError({ status: 0, code: 'network_error', message: 'x' })),
    ).toMatch(/Cannot reach the server/);
    expect(friendlyMessage(new Error('boom'))).toBe('boom');
    expect(friendlyMessage('weird', 'fallback')).toBe('fallback');
  });
});
