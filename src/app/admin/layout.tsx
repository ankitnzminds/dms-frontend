import { AdminGate } from '@/components/admin/admin-gate';
import { AppShell } from '@/components/layout/app-shell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AdminGate>{children}</AdminGate>
    </AppShell>
  );
}
