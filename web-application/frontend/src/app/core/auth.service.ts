import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Observable, throwError, catchError } from 'rxjs';
import { API_CONFIG, DEFAULT_API_CONFIG } from './api.config';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  roles?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

interface AuthResponseBody {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: User;
}

const KEY_TOKENS = 'zoomy.auth.tokens';
const KEY_USER   = 'zoomy.auth.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private cfg = inject(API_CONFIG, { optional: true }) ?? DEFAULT_API_CONFIG;

  private readonly _user   = signal<User | null>(this.loadUser());
  private readonly _tokens = signal<AuthTokens | null>(this.loadTokens());

  readonly user        = this._user.asReadonly();
  readonly isLoggedIn  = computed(() => this._user() !== null && this._tokens() !== null);

  // ----- public API -----

  accessToken(): string | null { return this._tokens()?.accessToken ?? null; }
  refreshTokenValue(): string | null { return this._tokens()?.refreshToken ?? null; }

  async login(email: string, password: string): Promise<User> {
    const body = await firstValueFrom(this.post<AuthResponseBody>('/api/auth/login', { email, password }));
    this.applyTokens(body);
    return body.user;
  }

  async signup(email: string, password: string, name: string): Promise<User> {
    const body = await firstValueFrom(this.post<AuthResponseBody>('/api/auth/signup', { email, password, name }));
    this.applyTokens(body);
    return body.user;
  }

  /** Returns a promise resolving to the new access token, or rejects. */
  refresh(): Promise<string> {
    const rt = this.refreshTokenValue();
    if (!rt) return Promise.reject(new Error('No refresh token'));
    return firstValueFrom(this.post<AuthResponseBody>('/api/auth/refresh', { refreshToken: rt }))
      .then(body => {
        this.applyTokens(body);
        return body.accessToken;
      });
  }

  async logout(): Promise<void> {
    const rt = this.refreshTokenValue();
    try {
      if (rt) await firstValueFrom(this.post('/api/auth/logout', { refreshToken: rt }));
    } catch { /* best-effort */ }
    this.clearLocal();
  }

  /** Hydrate /me from backend if we have a token. */
  async hydrate(): Promise<void> {
    if (!this.accessToken()) return;
    try {
      const u = await firstValueFrom(this.http.get<User>(`${this.cfg.baseUrl}/api/auth/me`));
      this._user.set(u);
      localStorage.setItem(KEY_USER, JSON.stringify(u));
    } catch {
      // token may be expired; interceptor will retry refresh on next protected call
    }
  }

  // ----- internals -----

  private applyTokens(body: AuthResponseBody) {
    const tokens: AuthTokens = {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: Date.now() + body.expiresInSeconds * 1000
    };
    this._tokens.set(tokens);
    this._user.set(body.user);
    localStorage.setItem(KEY_TOKENS, JSON.stringify(tokens));
    localStorage.setItem(KEY_USER, JSON.stringify(body.user));
  }

  private clearLocal() {
    this._tokens.set(null);
    this._user.set(null);
    localStorage.removeItem(KEY_TOKENS);
    localStorage.removeItem(KEY_USER);
  }

  private loadTokens(): AuthTokens | null {
    try { const v = localStorage.getItem(KEY_TOKENS); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }
  private loadUser(): User | null {
    try { const v = localStorage.getItem(KEY_USER); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.cfg.baseUrl}${path}`, body).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 0) {
          const origin = typeof window !== 'undefined' ? window.location.origin : 'this browser origin';
          return throwError(() => new Error(`Cannot reach API at ${this.cfg.baseUrl}. Check backend is running and CORS allows ${origin}.`));
        }
        const msg = err.error?.error || err.error?.message || err.message || 'Request failed';
        return throwError(() => new Error(msg));
      })
    );
  }
}
