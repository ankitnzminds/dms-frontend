import { createClient } from '@supabase/supabase-js';
import { apiBaseUrl, authMode, supabaseConfig } from '@/lib/config';
import { DevAuthProvider } from './dev-provider';
import { SupabaseAuthProvider } from './supabase-provider';
import type { AuthProvider } from './types';

export * from './types';

let instance: AuthProvider | null = null;
let configError: string | null = null;

/** Lazily builds the provider for NEXT_PUBLIC_AUTH_MODE. Returns null + configError when misconfigured. */
export function getAuthProvider(): AuthProvider | null {
  if (instance || configError) return instance;
  if (authMode === 'dev') {
    instance = new DevAuthProvider(apiBaseUrl);
  } else {
    if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
      configError =
        'Supabase sign-in is selected but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set.';
      return null;
    }
    const client = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    instance = new SupabaseAuthProvider(
      client,
      typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
    );
  }
  return instance;
}

export function getAuthConfigError() {
  getAuthProvider();
  return configError;
}
