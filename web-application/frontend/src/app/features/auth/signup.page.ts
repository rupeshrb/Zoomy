import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MButtonComponent } from '../../shared/ui/m-button.component';
import { MTextFieldComponent } from '../../shared/ui/m-text-field.component';
import { MIconComponent } from '../../shared/ui/m-icon.component';

@Component({
  selector: 'page-signup',
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

        <h1>Create your Zoomy account</h1>
        <p class="sub">Free for everyone — no credit card required.</p>

        <form (ngSubmit)="submit()" autocomplete="on">
          <m-text-field
            label="Full name"
            type="text"
            autocomplete="name"
            [(ngModel)]="name"
            name="name"
            icon="person"
            [error]="fieldError() === 'name' ? error() : ''"
            [invalid]="fieldError() === 'name'"
          />
          <m-text-field
            label="Email"
            type="email"
            autocomplete="email"
            [(ngModel)]="email"
            name="email"
            icon="mail"
            [error]="fieldError() === 'email' ? error() : ''"
            [invalid]="fieldError() === 'email'"
          />
          <m-text-field
            label="Password"
            type="password"
            autocomplete="new-password"
            [(ngModel)]="password"
            name="password"
            icon="lock"
            hint="Use 6 or more characters."
            [error]="fieldError() === 'password' ? error() : ''"
            [invalid]="fieldError() === 'password'"
          />

          <div class="alert" *ngIf="error() && !fieldError()">{{ error() }}</div>

          <p class="terms">
            By creating an account you agree to the
            <a href="javascript:;">Terms</a> and <a href="javascript:;">Privacy Policy</a>.
          </p>

          <div class="actions">
            <a m-button variant="text" routerLink="/login">I already have an account</a>
            <span class="m-spacer"></span>
            <button m-button variant="filled" type="submit" [disabled]="busy()">
              {{ busy() ? 'Creating…' : 'Create account' }}
            </button>
          </div>
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
      align-items: center; justify-content: center; padding: 24px;
      background:
        radial-gradient(1100px 540px at 80% 0%, rgba(232,245,233,.7) 0%, transparent 60%),
        radial-gradient(900px 500px at 0% 100%, rgba(232,240,254,.7) 0%, transparent 60%),
        var(--m-bg-light);
      color: var(--m-text-ink);
    }
    .card {
      background: var(--m-bg-light);
      border: 1px solid var(--m-divider-light);
      border-radius: 28px;
      padding: 48px;
      width: 100%; max-width: 480px;
      box-shadow: var(--m-e2);
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo { width: 32px; height: 32px; position: relative; display: inline-block; }
    .dot { position: absolute; width: 14px; height: 14px; border-radius: 4px; }
    .dot.d1 { top: 0; left: 0; background: #4285f4; }
    .dot.d2 { top: 0; right: 0; background: #ea4335; }
    .dot.d3 { bottom: 0; left: 0; background: #34a853; }
    .dot.d4 { bottom: 0; right: 0; background: #fbbc04; }
    .brand-name { font-family: var(--m-font); font-size: 22px; color: var(--m-text-ink); }

    h1 { margin: 24px 0 6px; font-family: var(--m-font); font-weight: 400; font-size: 26px; color: var(--m-text-ink); }
    .sub { margin: 0 0 24px; color: var(--m-text-ink-muted); font-size: 15px; }

    form { display: flex; flex-direction: column; gap: 14px; }
    .terms { font-size: 12px; color: var(--m-text-ink-muted); margin: 8px 0 0; }
    .actions { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
    .alert {
      background: rgba(234, 67, 53, 0.08);
      color: var(--m-danger);
      border: 1px solid rgba(234, 67, 53, 0.4);
      border-radius: 8px; padding: 10px 12px; font-size: 13px;
    }

    footer { display: flex; gap: 24px; margin-top: 32px; color: var(--m-text-ink-muted); font-size: 12px; }
    footer a { color: var(--m-text-ink-muted); }
    footer a:hover { color: var(--m-text-ink); text-decoration: none; }

    @media (max-width: 600px) {
      .card { padding: 32px 24px; border-radius: 20px; }
      h1 { font-size: 22px; }
      footer { flex-wrap: wrap; gap: 16px; justify-content: center; }
    }
  `]
})
export class SignupPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  name = '';
  email = '';
  password = '';
  busy = signal(false);
  error = signal('');
  fieldError = signal<'name' | 'email' | 'password' | null>(null);

  async submit() {
    this.error.set(''); this.fieldError.set(null);
    if (!this.name.trim()) { this.error.set('Name is required'); this.fieldError.set('name'); return; }
    if (!this.email.includes('@')) { this.error.set('Enter a valid email'); this.fieldError.set('email'); return; }
    if (this.password.length < 6) { this.error.set('Password must be 6+ characters'); this.fieldError.set('password'); return; }
    this.busy.set(true);
    try {
      await this.auth.signup(this.email.trim().toLowerCase(), this.password, this.name.trim());
      const next = this.route.snapshot.queryParamMap.get('next') || '/home';
      this.router.navigateByUrl(next);
    } catch (e: any) {
      this.error.set(e?.message || 'Signup failed');
    } finally {
      this.busy.set(false);
    }
  }
}
