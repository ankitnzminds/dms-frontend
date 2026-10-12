import { AuthError, type AuthProvider, type SignInCredentials } from './types';

const STORAGE_KEY = 'dms.dev.token';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * LOCAL DEVELOPMENT ONLY. Signs in with email + the shared dev password via POST {api}/dev/login.
 * The short-lived token lives in sessionStorage (per tab, gone when the tab closes) so a reload keeps the
 * session; the password is never stored. There is no silent re-mint: an expired or revoked token ends the
 * session. Construction is refused in production builds.
 */
export class DevAuthProvider implements AuthProvider {
  readonly id = 'dev';
  private listeners = new Set<(signedIn: boolean) => void>();

  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly storage: Store | null = typeof window !== 'undefined'
      ? window.sessionStorage
      : null,
    isProduction: boolean = process.env.NODE_ENV === 'production',
    /** Where a "remembered" token goes (survives closing the browser). */
    private readonly persistent: Store | null = typeof window !== 'undefined'
      ? window.localStorage
      : null,
  ) {
    if (isProduction) throw new Error('DevAuthProvider cannot be used in a production build.');
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(STORAGE_KEY) ?? this.persistent?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private memory: string | null = null;

  async getAccessToken(): Promise<string | null> {
    return this.memory ?? this.read();
  }

  /** Dev tokens cannot be refreshed without the password: an expired token ends the session. */
  async refresh(): Promise<string | null> {
    return null;
  }

  async signIn(c: SignInCredentials): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBaseUrl}/dev/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, password: c.password }),
      });
    } catch {
      throw new AuthError(
        'Cannot reach the server. Check your connection and try again.',
        'network_error',
      );
    }
    if (!res.ok) {
      if (res.status === 404)
        throw new AuthError(
          'Development sign-in is not available (is the backend running with AUTH_PROVIDER=local?).',
          'dev_login_unavailable',
        );
      if (res.status === 401 || res.status === 422)
        throw new AuthError('Incorrect email or password.', 'invalid_credentials');
      if (res.status === 429)
        throw new AuthError('Too many attempts. Wait a moment and try again.', 'rate_limited');
      throw new AuthError(`Sign-in failed (HTTP ${res.status}).`, 'sign_in_failed');
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new AuthError('The sign-in response was malformed.');
    this.memory = body.access_token;
    try {
      // "Remember me" keeps the (short-lived) token across browser restarts; otherwise it ends with the tab.
      const keep = c.remember !== false && this.persistent;
      (keep ? this.persistent : this.storage)?.setItem(STORAGE_KEY, body.access_token);
      (keep ? this.storage : this.persistent)?.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: the session lasts until reload */
    }
    this.emit(true);
  }

  async signOut(): Promise<void> {
    this.memory = null;
    try {
      this.storage?.removeItem(STORAGE_KEY);
      this.persistent?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.emit(false);
  }

  onChange(listener: (signedIn: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(v: boolean) {
    this.listeners.forEach((l) => l(v));
  }
}
