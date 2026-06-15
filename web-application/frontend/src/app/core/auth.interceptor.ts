import { inject, Injectable } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse
} from '@angular/common/http';
import { from, Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_CONFIG, DEFAULT_API_CONFIG } from './api.config';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private auth = inject(AuthService);
  private cfg  = inject(API_CONFIG, { optional: true }) ?? DEFAULT_API_CONFIG;

  // Single-flight refresh
  private refreshing = false;
  private refreshGate = new BehaviorSubject<string | null>(null);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Don't touch non-api or auth endpoints
    const isApi = req.url.startsWith(this.cfg.baseUrl);
    const isAuthEndpoint =
      req.url.endsWith('/api/auth/login') ||
      req.url.endsWith('/api/auth/signup') ||
      req.url.endsWith('/api/auth/refresh');

    if (!isApi || isAuthEndpoint) return next.handle(req);

    const token = this.auth.accessToken();
    const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

    return next.handle(authed).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status !== 401 || !this.auth.refreshTokenValue()) {
          return throwError(() => err);
        }
        // Try refresh-then-retry once
        if (!this.refreshing) {
          this.refreshing = true;
          this.refreshGate.next(null);
          return from(this.auth.refresh()).pipe(
            switchMap(newToken => {
              this.refreshing = false;
              this.refreshGate.next(newToken);
              return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }));
            }),
            catchError(refreshErr => {
              this.refreshing = false;
              this.refreshGate.next(null);
              this.auth.logout();
              return throwError(() => refreshErr);
            })
          );
        }
        // Wait for the in-flight refresh
        return this.refreshGate.pipe(
          filter((t): t is string => t !== null),
          take(1),
          switchMap(newToken =>
            next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })))
        );
      })
    );
  }
}
