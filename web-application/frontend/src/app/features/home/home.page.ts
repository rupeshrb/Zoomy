import {
  Component, computed, ElementRef, inject, signal, ViewChild, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { MeetingService, Meeting } from '../../core/meeting.service';
import { isSafeBrowser } from '../../core/safe-browser';
import { MButtonComponent } from '../../shared/ui/m-button.component';
import { MTextFieldComponent } from '../../shared/ui/m-text-field.component';
import { MIconComponent } from '../../shared/ui/m-icon.component';
import { MDialogComponent } from '../../shared/ui/m-dialog.component';
import {
  RoomSettingsDialog, RoomSettings, DEFAULT_ROOM_SETTINGS, saveRoomSettings
} from '../meeting/components/room-settings';

interface Slide {
  icon: string;
  title: string;
  body: string;
  gradient: string;
}

@Component({
  selector: 'page-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MButtonComponent, MTextFieldComponent, MIconComponent, MDialogComponent,
    RoomSettingsDialog
  ],
  template: `
    <div class="page">
      <!-- Left: heading + CTAs -->
      <div class="hero">
        <h1>Premium video meetings.<br/><span class="accent">Now for everyone.</span></h1>
        <p class="lead">Zoomy gives you secure, professional meetings — plus a proctored interview
          mode for hiring teams.</p>

        <!-- Big primary CTAs -->
        <div class="cta">
          <div class="new-wrap">
            <button m-button variant="filled" size="lg"
                    [icon]="'video_call'" (click)="toggleMenu($event)">
              New meeting
            </button>
            <div class="menu" *ngIf="menuOpen()" (click)="$event.stopPropagation()">
              <button class="menu-item" (click)="newMeeting('NORMAL')">
                <m-icon name="video_call" />
                <div>
                  <div class="t">Start a normal meeting</div>
                  <div class="d">Standard video meeting</div>
                </div>
              </button>
              <button class="menu-item" (click)="newMeeting('INTERVIEW')">
                <m-icon name="verified_user" />
                <div>
                  <div class="t">Start an interview meeting</div>
                  <div class="d">Proctored, requires Safe Browser</div>
                </div>
              </button>
              <button class="menu-item" (click)="createForLater()">
                <m-icon name="schedule" />
                <div>
                  <div class="t">Create a meeting for later</div>
                  <div class="d">Copy the link to share</div>
                </div>
              </button>
            </div>
          </div>

          <div class="join">
            <button m-button variant="outline" size="lg"
                    [icon]="'keyboard'" (click)="openJoinDialog()">
              Join meeting
            </button>
          </div>

          <p class="error" *ngIf="joinError()">{{ joinError() }}</p>
        </div>

        <p class="muted">
          <a href="javascript:;">Learn more</a> about Zoomy
        </p>
      </div>

      <!-- Right: feature carousel -->
      <div class="art">
        <div class="art-card" [style.background]="currentSlide().gradient">
          <div class="art-icon">
            <m-icon [name]="currentSlide().icon" [size]="64" />
          </div>
          <h3>{{ currentSlide().title }}</h3>
          <p>{{ currentSlide().body }}</p>
          <div class="dots">
            <button
              *ngFor="let s of slides; let i = index"
              class="d"
              [class.active]="i === slideIdx()"
              (click)="goSlide(i)"
              [attr.aria-label]="'Slide ' + (i+1)"
            ></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Share-link dialog -->
    <m-dialog
      [open]="!!linkDialog()"
      [title]="linkDialog()?.mode === 'INTERVIEW' ? 'Interview meeting created' : 'Meeting created'"
      (close)="linkDialog.set(null)"
      [width]="520"
    >
      <p class="dialog-sub">
        Send this link to your
        {{ linkDialog()?.mode === 'INTERVIEW' ? 'candidate' : 'participants' }}.
      </p>
      <div class="link-row">
        <input #linkBox readonly [value]="linkDialog() ? shareUrl(linkDialog()!) : ''" />
        <button m-button variant="icon" (click)="copy(linkBox)" title="Copy">
          <m-icon name="content_copy" />
        </button>
      </div>
      <p class="warn" *ngIf="linkDialog()?.mode === 'INTERVIEW'">
        <m-icon name="info" [size]="18" />
        Candidates must join from the
        <strong>Zoomy Safe Browser</strong> desktop app.
      </p>
      <div dialog-actions>
        <button m-button variant="text" (click)="linkDialog.set(null)">Close</button>
        <button m-button variant="filled" (click)="enterMeeting(linkDialog()!)" *ngIf="linkDialog()">
          Join now
        </button>
      </div>
    </m-dialog>

    <!-- Room settings (pre-create) -->
    <room-settings-dialog
      [open]="settingsOpen()"
      [value]="pendingSettings()"
      [title]="pendingMode() === 'INTERVIEW' ? 'New interview meeting' : 'New meeting'"
      subtitle="Pick which tools should be available in this room. You can change this later from the meeting controls."
      saveLabel="Create meeting"
      (close)="cancelSettings()"
      (save)="confirmCreate($event)"
    />

    <!-- Join-by-code dialog -->
    <m-dialog
      [open]="joinDialogOpen()"
      title="Join a meeting"
      (close)="closeJoinDialog()"
      [width]="440"
    >
      <p class="dialog-sub">Enter the meeting code (or paste a Zoomy link) and your name.</p>
      <form class="join-form" (ngSubmit)="confirmJoin()" autocomplete="off">
        <m-text-field
          label="Display name"
          icon="person"
          [(ngModel)]="joinName"
          name="joinName"
        />
        <m-text-field
          label="Meeting code or link"
          icon="keyboard"
          [(ngModel)]="codeInput"
          name="joinCode"
        />
        <m-text-field
          label="Meeting password (optional)"
          type="password"
          icon="lock"
          [(ngModel)]="joinPassword"
          name="joinPassword"
        />
        <p class="error" *ngIf="joinError()">{{ joinError() }}</p>
      </form>
      <div dialog-actions>
        <button m-button variant="text" type="button" (click)="closeJoinDialog()">Cancel</button>
        <button m-button variant="filled" type="button"
                (click)="confirmJoin()"
                [disabled]="!codeInput.trim() || joining()">
          {{ joining() ? 'Joining…' : 'Join meeting' }}
        </button>
      </div>
    </m-dialog>
  `,
  styles: [`
    :host { display: block; }
    .page {
      display: grid; grid-template-columns: 1.05fr 1fr;
      gap: 48px; align-items: center;
      padding: 56px 56px; max-width: 1400px; margin: 0 auto;
      min-height: calc(100vh - 64px);
    }
    .hero h1 {
      font-family: var(--m-font); font-weight: 400;
      font-size: clamp(30px, 4.2vw, 48px);
      line-height: 1.12; margin: 0 0 16px; color: var(--m-text-ink);
      letter-spacing: -0.5px;
    }
    .hero h1 .accent { color: var(--m-primary-700); }
    .lead { color: var(--m-text-ink-muted); font-size: 17px; max-width: 540px; margin: 0 0 36px; }

    .cta { display: flex; flex-direction: column; gap: 20px; margin-bottom: 36px; max-width: 580px; }
    .new-wrap { position: relative; align-self: flex-start; }
    .join { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .code { min-width: 280px; flex: 1 1 280px; }
    .error { color: var(--m-danger); font-size: 13px; margin: -8px 0 0; }

    .menu {
      position: absolute; top: 56px; left: 0;
      background: var(--m-bg-light); color: var(--m-text-ink);
      border: 1px solid var(--m-divider-light);
      border-radius: 16px; box-shadow: var(--m-e3);
      padding: 8px; min-width: 320px; z-index: 30;
    }
    .menu-item {
      display: flex; align-items: center; gap: 16px; width: 100%; text-align: left;
      padding: 12px 16px; border: 0; background: transparent; cursor: pointer;
      border-radius: 8px; color: var(--m-text-ink);
    }
    .menu-item:hover { background: var(--m-hover-ink); }
    .menu-item .t { font-size: 14px; font-weight: 500; }
    .menu-item .d { font-size: 12px; color: var(--m-text-ink-muted); }

    .muted { color: var(--m-text-ink-muted); font-size: 14px; margin: 0; }

    /* Carousel card */
    .art { display: flex; justify-content: center; }
    .art-card {
      border-radius: 50%;
      width: min(440px, 90vw); aspect-ratio: 1;
      padding: 56px 40px; text-align: center;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      box-shadow: var(--m-e2);
      color: #202124;
      transition: background .6s ease;
    }
    .art-icon {
      width: 84px; height: 84px; border-radius: 50%;
      background: rgba(255,255,255,.6);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px;
      box-shadow: 0 4px 16px rgba(0,0,0,.06);
    }
    .art-card h3 { font-weight: 500; font-size: 22px; margin: 0 0 8px; }
    .art-card p { color: #3c4043; margin: 0 0 24px; max-width: 280px; }
    .dots { display: flex; gap: 10px; height: 10px; align-items: center; }
    .dots .d {
      width: 8px; height: 8px; border-radius: 999px; border: 0; padding: 0;
      background: rgba(0,0,0,.22); cursor: pointer;
      transition: width .35s cubic-bezier(.4,0,.2,1), background-color .35s ease;
      flex: 0 0 auto;
    }
    .dots .d:hover { background: rgba(0,0,0,.45); }
    .dots .d.active { background: #1a73e8; width: 28px; }

    .dialog-sub { color: var(--m-text-ink-muted); margin: 0 0 16px; }
    .link-row {
      display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 16px;
      background: var(--m-surface-light); border-radius: 8px;
    }
    .link-row input {
      flex: 1; border: 0; background: transparent; font-size: 14px;
      color: var(--m-text-ink); outline: none;
    }
    .warn {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 16px 0 0; padding: 12px;
      background: rgba(251,188,4,.12); color: var(--m-text-ink);
      border: 1px solid rgba(251,188,4,.4);
      border-radius: 8px; font-size: 13px;
    }
    .join-form { display: flex; flex-direction: column; gap: 14px; }

    @media (max-width: 960px) {
      .page { grid-template-columns: 1fr; padding: 32px 20px; gap: 32px; }
      .art-card { padding: 40px 24px; }
    }
  `],
  host: { '(document:click)': 'menuOpen.set(false)' }
})
export class HomePage implements OnDestroy {
  private router = inject(Router);
  private meet = inject(MeetingService);
  private auth = inject(AuthService);
  @ViewChild('linkBox') linkBox?: ElementRef<HTMLInputElement>;

  codeInput = '';
  joinName = '';
  joinPassword = '';
  menuOpen = signal(false);
  joinDialogOpen = signal(false);
  linkDialog = signal<Meeting | null>(null);
  joining = signal(false);
  joinError = signal('');

  // Pre-create room-settings dialog state
  settingsOpen   = signal(false);
  pendingMode    = signal<'NORMAL' | 'INTERVIEW'>('NORMAL');
  pendingForLater= signal(false);
  pendingSettings= signal<RoomSettings>({ ...DEFAULT_ROOM_SETTINGS });

  // ---- carousel ----
  readonly slides: Slide[] = [
    {
      icon: 'verified_user',
      title: 'Your meeting is safe',
      body: 'No one can join a meeting unless invited or admitted by the host.',
      gradient: 'radial-gradient(circle at 30% 30%, #d2e3fc 0%, #e8f0fe 60%, #ffffff 100%)'
    },
    {
      icon: 'work',
      title: 'Built for interviews',
      body: 'AI proctoring, whiteboard, code IDE and a Safe Browser shell — all in one place.',
      gradient: 'radial-gradient(circle at 70% 30%, #fce8e6 0%, #fde7e0 60%, #ffffff 100%)'
    },
    {
      icon: 'devices',
      title: 'Works everywhere',
      body: 'Join from the web on any device, or use the Zoomy desktop app for proctored sessions.',
      gradient: 'radial-gradient(circle at 30% 70%, #e6f4ea 0%, #ceead6 60%, #ffffff 100%)'
    },
    {
      icon: 'auto_awesome',
      title: 'Modern collaboration',
      body: 'Shared notes, live whiteboard and a real Monaco-powered code editor for pair coding.',
      gradient: 'radial-gradient(circle at 70% 70%, #fef7e0 0%, #feefc3 60%, #ffffff 100%)'
    }
  ];
  slideIdx = signal(0);
  currentSlide = computed(() => this.slides[this.slideIdx()]);
  private timer?: any;

  constructor() { this.startAuto(); }
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  private startAuto() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.slideIdx.set((this.slideIdx() + 1) % this.slides.length);
    }, 5000);
  }
  goSlide(i: number) { this.slideIdx.set(i); this.startAuto(); }

  // ---- menu/meeting ----
  toggleMenu(e: MouseEvent) { e.stopPropagation(); this.menuOpen.set(!this.menuOpen()); }

  newMeeting(mode: 'NORMAL' | 'INTERVIEW') {
    this.menuOpen.set(false);
    this.pendingMode.set(mode);
    this.pendingForLater.set(false);
    this.pendingSettings.set({ ...DEFAULT_ROOM_SETTINGS });
    this.settingsOpen.set(true);
  }

  createForLater() {
    this.menuOpen.set(false);
    this.pendingMode.set('NORMAL');
    this.pendingForLater.set(true);
    this.pendingSettings.set({ ...DEFAULT_ROOM_SETTINGS });
    this.settingsOpen.set(true);
  }

  cancelSettings() { this.settingsOpen.set(false); }

  async confirmCreate(settings: RoomSettings) {
    this.settingsOpen.set(false);
    try {
      const mode = this.pendingMode();
      const m = await this.meet.create({ mode });
      saveRoomSettings(m.id, settings);
      if (this.pendingForLater() || mode === 'INTERVIEW') {
        this.linkDialog.set(m);
      } else {
        this.router.navigate(['/meeting', m.id, 'lobby'], { queryParams: { role: 'host' } });
      }
    } catch (e: any) {
      this.joinError.set(e?.message || 'Could not create meeting');
    }
  }

  shareUrl(m: Meeting): string { return this.meet.buildShareLink(m); }

  enterMeeting(m: Meeting) {
    this.linkDialog.set(null);
    this.router.navigate(['/meeting', m.id, 'lobby'], { queryParams: { role: 'host' } });
  }

  copy(input: HTMLInputElement) {
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
  }

  async join() {
    this.joinError.set('');
    this.joining.set(true);
    try {
      const m = await this.meet.resolveLink(this.codeInput);
      if (!m) { this.joinError.set('Meeting not found. Check the code and try again.'); return; }

      if (m.mode === 'INTERVIEW' && !isSafeBrowser()) {
        this.router.navigate(['/safe-browser-required'],
          { queryParams: { next: `/meeting/${m.id}/lobby`, id: m.id } });
        return;
      }
      this.router.navigate(['/meeting', m.id, 'lobby']);
    } finally {
      this.joining.set(false);
    }
  }

  openJoinDialog() {
    this.joinError.set('');
    this.joinName = this.auth.user()?.name || '';
    this.joinDialogOpen.set(true);
  }

  closeJoinDialog() {
    this.joinDialogOpen.set(false);
    this.joinError.set('');
  }

  async confirmJoin() {
    if (!this.codeInput.trim() || this.joining()) return;
    this.joinError.set('');
    this.joining.set(true);
    try {
      const m = await this.meet.resolveLink(this.codeInput);
      if (!m) {
        this.joinError.set('Meeting not found. Check the code and try again.');
        return;
      }
      if (m.mode === 'INTERVIEW' && !isSafeBrowser()) {
        this.joinDialogOpen.set(false);
        this.router.navigate(['/safe-browser-required'],
          { queryParams: { next: `/meeting/${m.id}/lobby`, id: m.id } });
        return;
      }
      this.joinDialogOpen.set(false);
      this.router.navigate(['/meeting', m.id, 'lobby'], {
        queryParams: {
          name: this.joinName?.trim() || undefined,
          pw: this.joinPassword || undefined
        }
      });
    } finally {
      this.joining.set(false);
    }
  }
}
