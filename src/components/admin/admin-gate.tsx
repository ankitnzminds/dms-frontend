'use client';

import { usePathname } from 'next/navigation';
import { ForbiddenState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { canReadAudit, isAdminRole } from '@/lib/permissions';

/** UI-only gate: admins everywhere; auditors only on the audit log. The API enforces the real rule. */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const pathname = usePathname();
  const admin = isAdminRole(me?.role);
  const auditOk =
    ['/admin/audit', '/admin/reports', '/admin/governance'].some((x) => pathname.startsWith(x)) &&
    canReadAudit(me);
  if (!admin && !auditOk) {
    return <ForbiddenState message="This area is limited to organization administrators." />;
  }
  return <>{children}</>;
}
