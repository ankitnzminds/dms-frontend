import { NotAvailable } from '@/components/layout/not-available';

export default function IdentityPage() {
  return (
    <NotAvailable
      title="Identity & SSO"
      summary="Sign-in is currently handled by the configured authentication provider. Single sign-on and directory sync are not configurable from this app yet."
      planned={['SAML / OIDC single sign-on configuration', 'Directory (SCIM) user and group sync', 'Session and device management']}
    />
  );
}
