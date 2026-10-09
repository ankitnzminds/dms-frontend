import { NotAvailable } from '@/components/layout/not-available';

export default function SignaturesPage() {
  return (
    <NotAvailable
      title="E-signatures"
      summary="Collect legally binding signatures on documents without leaving the system."
      planned={['Signature requests with signing order', 'Signed copies stored as immutable versions', 'Signing certificates and audit trail']}
    />
  );
}
