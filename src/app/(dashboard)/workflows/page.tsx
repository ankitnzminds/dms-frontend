import { NotAvailable } from '@/components/layout/not-available';

export default function WorkflowsPage() {
  return (
    <NotAvailable
      title="Workflows & approvals"
      summary="Route documents through review and approval steps with owners, due dates and a decision history."
      planned={['Approval requests on a document', 'Reviewer assignment and reminders', 'Decision history on the audit trail']}
    />
  );
}
