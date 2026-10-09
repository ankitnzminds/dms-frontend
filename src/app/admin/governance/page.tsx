import type { Metadata } from 'next';
import { GovernanceView } from '@/features/governance/governance-view';

export const metadata: Metadata = { title: 'Governance' };

export default function Page() {
  return <GovernanceView />;
}
