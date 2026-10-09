import { AuthError, type AuthProvider, type SignInCredentials } from './types';

const STORAGE_KEY = 'dms.dev.email';

/**
 * LOCAL DEVELOPMENT ONLY. Exchanges an email for a token via POST {api}/dev/token.
 * The token is kept in memory only; the email (not a secret) is remembered in sessionStorage so a
 * page reload can transparently mint a new token. Construction is refused in production builds.
 */
export class DevAuthProvider implements AuthProvider {
  readonly id = 'dev';
  private token: string | null = null;
  private listeners = new Set<(signedIn: boolean) => void>();

  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = typeof window !==
    'undefined'
      ? window.sessionStorage
      : null,
    isProduction: boolean = process.env.NODE_ENV === 'production',
  ) {
    if (isProduction) throw new Error('DevAuthProvider cannot be used in a production build.');
  }

  private email(): string | null {
    try {
      return this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private async mint(email: string): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiBaseUrl}/dev/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      throw new AuthError('Cannot reach the API to mint a development token.', 'network_error');
    }
    if (!res.ok) {
      throw new AuthError(
        res.status === 404
          ? 'The development token endpoint is not available (is the backend running with AUTH_PROVIDER=local?).'
          : `Could not sign in as ${email} (HTTP ${res.status}).`,
        'dev_token_failed',
      );
    }
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) throw new AuthError('Development token response was malformed.');
    return body.access_token;
  }

  async getAccessToken(): Promise<string | null> {
    if (this.token) return this.token;
    const email = this.email();
    if (!email) return null;
    try {
      this.token = await this.mint(email);
    } catch {
      return null;
    }
    return this.token;
  }

  async refresh(): Promise<string | null> {
    const email = this.email();
    if (!email) return null;
    try {
      this.token = await this.mint(email);
      return this.token;
    } catch {
      this.token = null;
      return null;
    }
  }

  async signIn(c: SignInCredentials): Promise<void> {
    if (c.kind !== 'dev') throw new AuthError('Only development sign-in is available in dev mode.');
    this.token = await this.mint(c.email);
    try {
      this.storage?.setItem(STORAGE_KEY, c.email);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
    this.emit(true);
  }

  async signOut(): Promise<void> {
    this.token = null;
    try {
      this.storage?.removeItem(STORAGE_KEY);
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
