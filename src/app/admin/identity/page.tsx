import Link from 'next/link';
import { NotAvailable } from '@/components/layout/not-available';

export default function IdentityPage() {
  return (
    <>
      <NotAvailable
        title="SSO sign-in setup"
        summary="Single sign-on (SAML / OIDC) is configured in your authentication provider (Supabase), not in this application. Provisioning users and groups from a directory is available."
        planned={['SAML / OIDC sign-in configuration screens', 'Session and device management']}
      />
      <p className="mt-4 text-[13px]">
        <Link className="text-accent underline underline-offset-2" href="/admin/directory">
          Open directory provisioning
        </Link>{' '}
        to sync users and groups.
      </p>
    </>
  );
}
