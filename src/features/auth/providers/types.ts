export type SignInCredentials =
  | { kind: 'password'; email: string; password: string }
  | { kind: 'dev'; email: string };

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
  /** Optional: send a password-reset email. */
  requestPasswordReset?(email: string): Promise<void>;
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
