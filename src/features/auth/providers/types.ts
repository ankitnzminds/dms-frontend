/** `remember`: keep the session across browser restarts (default); false ends it when the browser closes. */
export type SignInCredentials = { email: string; password: string; remember?: boolean };

export type SsoProvider = 'azure' | 'google';

/**
 * Pluggable authentication source. The DMS API only ever receives the access token (JWT),
 * so additional providers (OIDC / SAML SSO) can implement this interface without touching the app.
 */
export interface AuthProvider {
  readonly id: 'dev' | 'supabase' | (string & {});
  /** Current access token or null when signed out. May transparently refresh near expiry. */
  getAccessToken(): Promise<string | null>;
  /** Force a refresh; returns the new token or null if the session cannot be recovered. */
  refresh(): Promise<string | null>;
  signIn(credentials: SignInCredentials): Promise<void>;
  signOut(): Promise<void>;
  /** Subscribe to sign-in / sign-out / token changes. Returns an unsubscribe function. */
  onChange(listener: (signedIn: boolean) => void): () => void;
  /** Optional: sign in through an external identity provider (redirects away and back to `returnTo`). */
  signInWithSso?(provider: SsoProvider, returnTo: string): Promise<void>;
  /** Optional: send a password-reset email (the identity provider's own recovery flow). */
  requestPasswordReset?(email: string): Promise<void>;
  /** Optional: true once the user arrived through a valid recovery link (a recovery session exists). */
  isPasswordRecovery?(): boolean;
  /** Optional: be told when a recovery session is established. Returns an unsubscribe function. */
  onPasswordRecovery?(listener: () => void): () => void;
  /** Optional: set a new password for the current (recovery or signed-in) session. */
  updatePassword?(newPassword: string): Promise<void>;
  /** Optional: verify the current password, set a new one and end every other session. */
  changePassword?(current: string, next: string): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string = 'auth_error',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
