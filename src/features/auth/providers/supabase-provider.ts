import type { SupabaseClient } from '@supabase/supabase-js';
import { setRememberPreference } from './remember-storage';
import { AuthError, type AuthProvider, type SignInCredentials, type SsoProvider } from './types';

/**
 * Supabase email+password provider. The Supabase client owns session persistence and refresh;
 * we only read the current access token and forward it to the DMS API as a Bearer token.
 *
 * NOTE: unit-tested with a mocked client only; not exercised against a live Supabase project.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly id = 'supabase';

  private recovery = false;
  private readonly recoveryListeners = new Set<() => void>();

  constructor(
    private readonly client: Pick<SupabaseClient, 'auth'>,
    private readonly resetRedirectTo?: string,
  ) {
    // The recovery event fires once, while the client reads the link; remember it for pages mounting later.
    this.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.recovery = true;
        this.recoveryListeners.forEach((l) => l());
      }
    });
  }

  async getAccessToken(): Promise<string | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }

  async refresh(): Promise<string | null> {
    const { data, error } = await this.client.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }

  async signIn(c: SignInCredentials): Promise<void> {
    setRememberPreference(c.remember !== false);
    const { error } = await this.client.auth.signInWithPassword({
      email: c.email,
      password: c.password,
    });
    if (error) {
      throw new AuthError(
        error.status === 400 || /invalid/i.test(error.message)
          ? 'Incorrect email or password.'
          : error.message,
        'invalid_credentials',
      );
    }
  }

  async signInWithSso(provider: SsoProvider, returnTo: string): Promise<void> {
    setRememberPreference(true);
    const { error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: returnTo },
    });
    if (error) throw new AuthError('Single sign-on is not available right now.', 'sso_failed');
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  onChange(listener: (signedIn: boolean) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(!!session);
    });
    return () => data.subscription.unsubscribe();
  }

  isPasswordRecovery(): boolean {
    return this.recovery;
  }

  onPasswordRecovery(listener: () => void) {
    this.recoveryListeners.add(listener);
    return () => void this.recoveryListeners.delete(listener);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw new AuthError(error.message, 'update_failed');
    this.recovery = false;
  }

  async changePassword(current: string, next: string): Promise<void> {
    const { data } = await this.client.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new AuthError('Your session expired. Sign in again.', 'no_session');
    // Prove the caller knows the current password before accepting a new one.
    const check = await this.client.auth.signInWithPassword({ email, password: current });
    if (check.error)
      throw new AuthError('Your current password is incorrect.', 'invalid_credentials');
    await this.updatePassword(next);
    // Password changed: end the sessions on other devices; this one stays.
    await this.client.auth.signOut({ scope: 'others' });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: this.resetRedirectTo,
    });
    if (error) throw new AuthError(error.message, 'reset_failed');
  }
}
