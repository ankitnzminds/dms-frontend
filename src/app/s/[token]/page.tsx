import type { Metadata } from 'next';
import { ShareLinkLanding } from '@/features/sharing/link-landing';

export const metadata: Metadata = {
  title: 'Shared with you',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareLinkLanding token={token} />;
}
