import type { Metadata } from 'next';
import { ChangePasswordView } from '@/features/auth/change-password-view';

export const metadata: Metadata = { title: 'Change password' };

export default function Page() {
  return <ChangePasswordView />;
}
