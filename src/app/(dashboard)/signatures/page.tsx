import type { Metadata } from 'next';
import { SignaturesView } from '@/features/signatures/signatures-view';

export const metadata: Metadata = { title: 'Signatures' };

export default function SignaturesPage() {
  return <SignaturesView />;
}
