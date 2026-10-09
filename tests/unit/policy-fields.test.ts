import { describe, expect, it } from 'vitest';
import { joinBytes, POLICY_TABS, splitBytes } from '@/features/admin-users/policy-fields';

describe('policy byte fields', () => {
  it('round-trips whole units', () => {
    expect(splitBytes(2 * 1024 ** 3)).toEqual({ amount: 2, unit: 'GB' });
    expect(joinBytes(2, 'GB')).toBe(2 * 1024 ** 3);
    expect(splitBytes(0)).toEqual({ amount: 0, unit: 'MB' });
  });

  it('keeps fractional megabytes instead of rounding to zero', () => {
    expect(joinBytes(1.5, 'MB')).toBe(1_572_864);
    expect(splitBytes(1_572_864).amount).toBe(1.5);
  });
});

describe('policy catalogue', () => {
  it('has unique keys per tab and covers every tab the backend knows', () => {
    expect(POLICY_TABS.map((t) => t.id)).toEqual([
      'general',
      'mfa',
      'user_policy',
      'client_app',
      'device_config',
      'notifications',
    ]);
    for (const tab of POLICY_TABS) {
      const keys = tab.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
