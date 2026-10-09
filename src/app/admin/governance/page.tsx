import { NotAvailable } from '@/components/layout/not-available';

export default function GovernancePage() {
  return (
    <NotAvailable
      title="Governance & compliance"
      summary="Policy controls for how long documents are kept and how sensitive data is protected."
      planned={['Retention schedules and legal holds', 'Data loss prevention rules', 'Classification policy administration', 'External and link sharing controls']}
    />
  );
}
