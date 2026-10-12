import type { Metadata } from 'next';
import { ResetPasswordView } from '@/features/auth/reset-password-view';

export const metadata: Metadata = {
  title: 'Reset password',
  // Keep the emailed link and any token out of referrers and search indexes.
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ResetPasswordView />;
}
