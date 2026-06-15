import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MeetingService } from '../../core/meeting.service';
import { AuthService } from '../../core/auth.service';
import { isSafeBrowser } from '../../core/safe-browser';

/** Handles /j/:code share links. Resolves meeting, redirects to lobby or safe-browser gate. */
@Component({
  selector: 'page-join-redirect',
  standalone: true,
  template: `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--m-text-ink-muted)">
      Resolving meeting…
    </div>
  `
})
export class JoinRedirectPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private meet = inject(MeetingService);
  private auth = inject(AuthService);

  constructor() { void this.go(); }

  private async go() {
    const code = this.route.snapshot.paramMap.get('code') || '';
    const m = await this.meet.resolveLink(code);
    if (!m) { this.router.navigate(['/home']); return; }

    if (m.mode === 'INTERVIEW' && !isSafeBrowser()) {
      this.router.navigate(['/safe-browser-required'],
        { queryParams: { next: `/meeting/${m.id}/lobby`, id: m.id } });
      return;
    }
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { next: `/meeting/${m.id}/lobby` } });
      return;
    }
    this.router.navigate(['/meeting', m.id, 'lobby']);
  }
}
