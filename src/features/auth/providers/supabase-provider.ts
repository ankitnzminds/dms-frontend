import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthError, type AuthProvider, type SignInCredentials } from './types';

/**
 * Supabase email+password provider. The Supabase client owns session persistence and refresh;
 * we only read the current access token and forward it to the DMS API as a Bearer token.
 *
 * NOTE: unit-tested with a mocked client only; not exercised against a live Supabase project.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly id = 'supabase';

  constructor(
    private readonly client: Pick<SupabaseClient, 'auth'>,
    private readonly resetRedirectTo?: string,
  ) {}

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
    if (c.kind !== 'password') throw new AuthError('Email and password are required.');
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

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  onChange(listener: (signedIn: boolean) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(!!session);
    });
    return () => data.subscription.unsubscribe();
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: this.resetRedirectTo,
    });
    if (error) throw new AuthError(error.message, 'reset_failed');
  }
}
