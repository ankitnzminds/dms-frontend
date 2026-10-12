import type { Metadata } from 'next';
import { ForgotPasswordView } from '@/features/auth/forgot-password-view';

export const metadata: Metadata = {
  title: 'Forgot password',
  referrer: 'no-referrer',
};

export default function Page() {
  return <ForgotPasswordView />;
}
