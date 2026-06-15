import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { MButtonComponent } from '../../shared/ui/m-button.component';
import { MTextFieldComponent } from '../../shared/ui/m-text-field.component';
import { MIconComponent } from '../../shared/ui/m-icon.component';

@Component({
  selector: 'page-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MButtonComponent, MTextFieldComponent, MIconComponent],
  template: `
    <div class="bg">
      <div class="card">
        <div class="brand">
          <span class="logo">
            <span class="dot d1"></span><span class="dot d2"></span>
            <span class="dot d3"></span><span class="dot d4"></span>
          </span>
          <span class="brand-name">Zoomy</span>
        </div>

        <h1>Sign in</h1>
        <p class="sub">Use your Zoomy Account</p>

        <form (ngSubmit)="submit()" autocomplete="on">
          <m-text-field
            label="Email"
            type="email"
            autocomplete="username"
            [(ngModel)]="email"
            name="email"
            [error]="fieldError() === 'email' ? error() : ''"
            [invalid]="fieldError() === 'email'"
          />
          <m-text-field
            class="pwd"
            label="Password"
            type="password"
            [revealToggle]="true"
            autocomplete="current-password"
            [(ngModel)]="password"
            name="password"
            [error]="fieldError() === 'password' ? error() : ''"
            [invalid]="fieldError() === 'password'"
          />

          <div class="alert" *ngIf="error() && !fieldError()">{{ error() }}</div>

          <div class="links">
            <a href="javascript:;">Forgot password?</a>
          </div>

          <div class="actions">
            <a m-button variant="text" routerLink="/signup">Create account</a>
            <span class="m-spacer"></span>
            <button m-button variant="filled" type="submit" [disabled]="busy()">
              {{ busy() ? 'Signing in…' : 'Next' }}
            </button>
          </div>

          <div class="divider"><span>or</span></div>

          <button m-button variant="outline" type="button" class="google" (click)="google()" disabled title="Coming soon">
            <m-icon name="account_circle" [size]="20" />
            Continue with Google
          </button>
        </form>
      </div>

      <footer>
        <span>English (United States)</span>
        <a href="javascript:;">Help</a>
        <a href="javascript:;">Privacy</a>
        <a href="javascript:;">Terms</a>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .bg {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 16px;
      background:
        radial-gradient(1200px 600px at 20% 0%, rgba(232,240,254,.7) 0%, transparent 60%),
        radial-gradient(900px 500px at 100% 100%, rgba(252,232,230,.7) 0%, transparent 60%),
        var(--m-bg-light);
      color: var(--m-text-ink);
    }
    .card {
      background: var(--m-bg-light);
      border: 1px solid var(--m-divider-light);
      border-radius: 24px;
      padding: 28px 36px;
      width: 100%; max-width: 420px;
      box-shadow: var(--m-e2);
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo { width: 28px; height: 28px; position: relative; display: inline-block; }
    .dot { position: absolute; width: 12px; height: 12px; border-radius: 4px; }
    .dot.d1 { top: 0; left: 0; background: #4285f4; }
    .dot.d2 { top: 0; right: 0; background: #ea4335; }
    .dot.d3 { bottom: 0; left: 0; background: #34a853; }
    .dot.d4 { bottom: 0; right: 0; background: #fbbc04; }
    .brand-name { font-family: var(--m-font); font-size: 20px; color: var(--m-text-ink); }

    h1 { margin: 16px 0 4px; font-family: var(--m-font); font-weight: 400; font-size: 24px; color: var(--m-text-ink); }
    .sub { margin: 0 0 18px; color: var(--m-text-ink-muted); font-size: 14px; }

    form { display: flex; flex-direction: column; gap: 12px; }
    .pwd { margin-top: 0; }
    .links { font-size: 13px; }
    .actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }

    .alert {
      background: rgba(234, 67, 53, 0.08);
      color: var(--m-danger);
      border: 1px solid rgba(234, 67, 53, 0.4);
      border-radius: 8px; padding: 10px 12px; font-size: 13px;
    }

    .divider {
      display: flex; align-items: center; gap: 12px; margin: 16px 0 6px;
      color: var(--m-text-ink-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1px;
    }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--m-divider-light); }
    .google { width: 100%; justify-content: center; }

    footer {
      display: flex; gap: 24px; margin-top: 16px;
      color: var(--m-text-ink-muted); font-size: 12px;
    }
    footer a { color: var(--m-text-ink-muted); }
    footer a:hover { color: var(--m-text-ink); text-decoration: none; }

    @media (max-width: 600px) {
      .card { padding: 24px 20px; border-radius: 18px; }
      h1 { font-size: 22px; }
      footer { flex-wrap: wrap; gap: 16px; justify-content: center; }
    }
  `]
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private theme = inject(ThemeService);

  email = '';
  password = '';
  busy = signal(false);
  error = signal('');
  fieldError = signal<'email' | 'password' | null>(null);

  ngOnInit() {
    // Login screen should always follow auto(system) mode.
    this.theme.set('system');
  }

  async submit() {
    this.error.set(''); this.fieldError.set(null);
    if (!this.email.includes('@')) { this.error.set('Enter a valid email'); this.fieldError.set('email'); return; }
    if (!this.password) { this.error.set('Enter your password'); this.fieldError.set('password'); return; }
    this.busy.set(true);
    try {
      await this.auth.login(this.email.trim().toLowerCase(), this.password);
      const next = this.route.snapshot.queryParamMap.get('next') || '/home';
      this.router.navigateByUrl(next);
    } catch (e: any) {
      this.error.set(e?.message || 'Login failed');
    } finally {
      this.busy.set(false);
    }
  }

  google() { /* placeholder */ }
}
