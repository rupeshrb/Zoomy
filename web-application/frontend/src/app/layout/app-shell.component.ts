import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ThemeService, ThemeMode } from '../core/theme.service';
import { MIconComponent } from '../shared/ui/m-icon.component';
import { MAvatarComponent } from '../shared/ui/m-avatar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MIconComponent, MAvatarComponent],
  template: `
    <header class="topbar">
      <div class="brand" (click)="goHome()" title="Zoomy home">
        <span class="logo" aria-hidden="true">
          <span class="dot d1"></span><span class="dot d2"></span>
          <span class="dot d3"></span><span class="dot d4"></span>
        </span>
        <span class="brand-name">Zoomy</span>
      </div>

      <div class="time">{{ now() }}</div>

      <div class="right">
        <button class="iconbtn" (click)="toggleTheme()" [title]="themeTitle()">
          <m-icon [name]="themeIcon()" />
        </button>
        <span class="divider"></span>

        <div class="avatar-wrap" (click)="menuOpen.set(!menuOpen()); $event.stopPropagation()">
          <m-avatar [name]="user()?.name || 'U'" [color]="user()?.avatarColor || null" [size]="36" />
          <div class="menu" *ngIf="menuOpen()" (click)="$event.stopPropagation()">
            <div class="menu-head">
              <m-avatar [name]="user()?.name || 'U'" [color]="user()?.avatarColor || null" [size]="64" />
              <div class="who">
                <div class="n">Hi, {{ firstName() }}!</div>
                <div class="e">{{ user()?.email }}</div>
              </div>
            </div>

            <div class="menu-section">
              <button class="menu-item" (click)="cycleTheme()">
                <m-icon [name]="themeIcon()" [size]="20" />
                <div class="grow">
                  <div class="t">Appearance</div>
                  <div class="d">{{ themeLabel() }}</div>
                </div>
                <m-icon name="chevron_right" [size]="18" />
              </button>
              <button class="menu-item">
                <m-icon name="account_circle" [size]="20" />
                Profile
              </button>
              <button class="menu-item">
                <m-icon name="settings" [size]="20" /> Settings
              </button>
            </div>

            <div class="menu-section">
              <button class="menu-item danger" (click)="signOut()" [disabled]="signingOut()">
                <m-icon name="logout" [size]="20" />
                {{ signingOut() ? 'Signing out…' : 'Sign out' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; background: var(--m-bg-light); color: var(--m-text-ink); }
    .topbar {
      display: flex; align-items: center; gap: 8px;
      height: 64px; padding: 0 16px;
      background: var(--m-bg-light);
      border-bottom: 1px solid transparent;
      position: sticky; top: 0; z-index: 40;
    }
    .brand { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px; border-radius: 12px; transition: background .15s; }
    .brand:hover { background: var(--m-hover-ink); }
    .logo { width: 32px; height: 32px; position: relative; display: inline-block; }
    .dot { position: absolute; width: 14px; height: 14px; border-radius: 4px; }
    .dot.d1 { top: 0; left: 0; background: #4285f4; }
    .dot.d2 { top: 0; right: 0; background: #ea4335; }
    .dot.d3 { bottom: 0; left: 0; background: #34a853; }
    .dot.d4 { bottom: 0; right: 0; background: #fbbc04; }
    .brand-name { font-family: var(--m-font); font-size: 22px; color: var(--m-text-ink); letter-spacing: -.5px; }

    .time { flex: 1; text-align: center; color: var(--m-text-ink-muted); font-size: 14px; }

    .right { display: flex; align-items: center; gap: 4px; }
    .iconbtn {
      width: 40px; height: 40px; border-radius: 50%;
      border: 0; background: transparent; color: var(--m-text-ink-muted);
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .iconbtn:hover { background: var(--m-hover-ink); color: var(--m-text-ink); }
    .divider { width: 1px; height: 24px; background: var(--m-divider-light); margin: 0 6px; }

    .avatar-wrap { position: relative; padding: 4px; cursor: pointer; }
    .menu {
      position: absolute; right: 0; top: 56px;
      width: 320px; background: var(--m-bg-light); color: var(--m-text-ink);
      border: 1px solid var(--m-divider-light);
      border-radius: 16px; box-shadow: var(--m-e3);
      padding: 8px; z-index: 50;
    }
    .menu-head {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 16px 0; border-bottom: 1px solid var(--m-divider-light);
    }
    .who .n { font-size: 16px; font-weight: 500; text-align: center; }
    .who .e { font-size: 13px; color: var(--m-text-ink-muted); text-align: center; }
    .menu-section { padding: 8px 0; border-bottom: 1px solid var(--m-divider-light); }
    .menu-section:last-child { border-bottom: 0; }
    .menu-item {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 10px 12px; border: 0; background: transparent; cursor: pointer;
      border-radius: 8px; color: var(--m-text-ink); font-size: 14px; text-align: left;
    }
    .menu-item .grow { flex: 1; }
    .menu-item .t { font-weight: 500; }
    .menu-item .d { font-size: 12px; color: var(--m-text-ink-muted); }
    .menu-item:hover { background: var(--m-hover-ink); }
    .menu-item.danger { color: var(--m-danger); }

    main { flex: 1; background: var(--m-bg-light); color: var(--m-text-ink); }

    @media (max-width: 720px) {
      .time { display: none; }
      .iconbtn[title="Support"], .iconbtn[title="Feedback"] { display: none; }
      .divider { display: none; }
    }
    @media (max-width: 480px) {
      .brand-name { display: none; }
    }
  `],
  host: { '(document:click)': 'menuOpen.set(false)' }
})
export class AppShellComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);

  user = this.auth.user;
  menuOpen = signal(false);
  signingOut = signal(false);

  firstName = computed(() => {
    const n = this.user()?.name || '';
    return n.split(/\s+/)[0] || 'there';
  });

  // theme helpers
  themeIcon = computed(() => {
    const m = this.theme.mode();
    return m === 'dark' ? 'dark_mode' : m === 'light' ? 'light_mode' : 'brightness_auto';
  });
  themeLabel = computed(() => {
    const m = this.theme.mode();
    return m === 'dark' ? 'Dark theme' : m === 'light' ? 'Light theme' : 'System default';
  });
  themeTitle = computed(() => `Theme: ${this.themeLabel()} (click to cycle)`);

  toggleTheme() { this.theme.toggle(); }
  cycleTheme() { this.theme.toggle(); }

  now() {
    const d = new Date();
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
    return d.toLocaleString(undefined, opts).replace(',', ' ·');
  }

  goHome() { this.router.navigate(['/home']); }
  async signOut() {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    // Login page should always follow system auto mode after sign-out.
    this.theme.set('system');
    try { await this.auth.logout(); }
    finally {
      this.signingOut.set(false);
      this.router.navigate(['/login']);
    }
  }
}
