import { NotAvailable } from '@/components/layout/not-available';

export default function AdminWorkflowsPage() {
  return (
    <NotAvailable
      title="Workflow administration"
      summary="Define approval templates and who may start them."
      planned={['Approval templates', 'Role-based reviewer rules', 'SLA and escalation settings']}
    />
  );
}
