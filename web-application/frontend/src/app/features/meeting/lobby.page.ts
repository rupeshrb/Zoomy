import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MeetingService, Meeting } from '../../core/meeting.service';
import { AuthService } from '../../core/auth.service';
import { isSafeBrowser } from '../../core/safe-browser';
import { MButtonComponent } from '../../shared/ui/m-button.component';
import { MIconComponent } from '../../shared/ui/m-icon.component';

@Component({
  selector: 'page-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, MButtonComponent, MIconComponent],
  template: `
    <header class="topbar">
      <div class="brand">
        <span class="logo">
          <span class="dot d1"></span><span class="dot d2"></span>
          <span class="dot d3"></span><span class="dot d4"></span>
        </span>
        <span class="name">Zoomy</span>
      </div>
      <div class="time">{{ time() }}</div>
      <button m-button variant="icon"><m-icon name="settings" /></button>
    </header>

    <main>
      <section class="stage">
        <div class="frame">
          <video #self autoplay playsinline muted></video>
          <div class="placeholder" *ngIf="!streamOn()">
            <m-icon name="videocam_off" [size]="48" />
            <p>Camera is off</p>
          </div>

          <div class="ctrls">
            <button class="pill" [class.danger]="!micOn()" (click)="toggleMic()" [title]="micOn() ? 'Mute' : 'Unmute'">
              <m-icon [name]="micOn() ? 'mic' : 'mic_off'" />
            </button>
            <button class="pill" [class.danger]="!camOn()" (click)="toggleCam()" [title]="camOn() ? 'Turn off camera' : 'Turn on camera'">
              <m-icon [name]="camOn() ? 'videocam' : 'videocam_off'" />
            </button>
          </div>
        </div>

        <p class="check" *ngIf="permError()">
          <m-icon name="info" /> Allow camera and microphone access to use them in the meeting.
        </p>
      </section>

      <aside class="info">
        <h1>{{ meeting()?.title || 'Meeting' }}</h1>
        <p class="code"><m-icon name="dialpad" [size]="18" /> {{ meeting()?.code }}</p>
        <p class="code" *ngIf="meeting()?.passwordEnabled"><m-icon name="lock" [size]="18" /> Password required</p>

        <div class="who">
          <p>Joining as <strong>{{ user()?.name }}</strong></p>
          <p class="role" *ngIf="role">
            <m-icon name="security" [size]="16" /> {{ role === 'host' ? 'Host' : 'Participant' }}
          </p>
        </div>

        <div class="pwd-host" *ngIf="role==='host'">
          <div class="pwd-head">
            <m-icon name="lock" [size]="18" />
            <strong>Meeting password</strong>
          </div>

          <label class="pwd-toggle">
            <input type="checkbox" [ngModel]="hostPasswordEnabled()" (ngModelChange)="onHostPasswordToggle($event)" />
            <span>Require password to join</span>
          </label>

          <div class="pwd-edit" *ngIf="hostPasswordEnabled()">
            <div class="pwd-mode">
              <button class="mode-btn" [class.on]="passwordMode()==='custom'" (click)="passwordMode.set('custom')">Custom</button>
              <button class="mode-btn" [class.on]="passwordMode()==='random'" (click)="useRandomPassword()">Random</button>
            </div>
            <input class="pwd-input" type="text" [(ngModel)]="hostPasswordDraft"
                   [placeholder]="passwordMode()==='random' ? 'Generated password' : 'Enter custom password'" />
            <p class="pwd-hint">Use 4-32 characters. Share this password with participants.</p>
          </div>

          <div class="pwd-actions">
            <button m-button variant="outline" size="sm" (click)="savePasswordSettings()" [disabled]="savingPassword()">
              {{ savingPassword() ? 'Saving…' : 'Save password settings' }}
            </button>
            <span class="pwd-msg" *ngIf="passwordSaveMsg()">{{ passwordSaveMsg() }}</span>
          </div>
        </div>

        <div class="pwd-join" *ngIf="role!=='host' && meeting()?.passwordEnabled">
          <label>Password</label>
          <input type="password" [(ngModel)]="joinPassword" placeholder="Enter meeting password" />
        </div>

        <div class="badge" *ngIf="isInterview()">
          <m-icon name="verified_user" /> <div>
            <div class="t">Interview mode</div>
            <div class="d">Gaze and overlay proctoring will be active during the meeting.</div>
          </div>
        </div>

        <label class="consent" *ngIf="isInterview() && role !== 'host'">
          <input type="checkbox" [(ngModel)]="consent" />
          <span>I agree to gaze tracking and overlay-detection scanning during this interview.</span>
        </label>

        <div class="actions">
          <button m-button variant="filled" size="lg" (click)="joinNow()" [disabled]="!canJoin()">
            Join now
          </button>
          <button m-button variant="text" (click)="goBack()">Cancel</button>
        </div>
        <p class="join-error" *ngIf="joinError()">{{ joinError() }}</p>

        <div class="muted">
          <m-icon name="shield" [size]="16" />
          <span *ngIf="isInterview() && safe()">Safe Browser detected — proctoring enabled</span>
          <span *ngIf="isInterview() && !safe() && role !== 'host'">Safe Browser not detected — host can still join</span>
          <span *ngIf="!isInterview()">Normal meeting</span>
        </div>
      </aside>
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100vh; background: var(--m-bg); color: var(--m-text); }

    /* Light theme: remap the immersive dark tokens used below so the lobby
       flips with the rest of the app (mirrors meeting-room.page.ts). */
    :host-context(html:not([data-theme="dark"])) {
      --m-bg:         #f6f8fc;
      --m-surface:    #ffffff;
      --m-surface-2:  #eef1f6;
      --m-elevated:   #e3e8f0;
      --m-divider:    #e0e4eb;
      --m-outline:    #c2c7d0;
      --m-text:       #1f2230;
      --m-text-muted: #5a6273;
      --m-text-strong:#0a0d18;
      --m-primary:    #1a73e8;
      --m-primary-ink:#ffffff;
    }
    .topbar {
      display: flex; align-items: center; gap: 12px; padding: 12px 20px;
      color: var(--m-text); background: var(--m-bg);
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo { width: 28px; height: 28px; position: relative; }
    .dot { position: absolute; width: 12px; height: 12px; border-radius: 4px; }
    .dot.d1 { top: 0; left: 0; background: #4285f4; }
    .dot.d2 { top: 0; right: 0; background: #ea4335; }
    .dot.d3 { bottom: 0; left: 0; background: #34a853; }
    .dot.d4 { bottom: 0; right: 0; background: #fbbc04; }
    .name { font-family: var(--m-font); font-size: 18px; }
    .time { flex: 1; text-align: center; color: var(--m-text-muted); }

    main {
      flex: 1; display: grid; grid-template-columns: 1.4fr 1fr;
      gap: 48px; padding: 24px 64px 64px; align-items: center; max-width: 1400px; margin: 0 auto;
      width: 100%;
    }

    .stage .frame {
      position: relative; aspect-ratio: 16/9; background: #000;
      border-radius: 16px; overflow: hidden; box-shadow: var(--m-e3);
    }
    video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
    .placeholder {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 8px;
      color: var(--m-text-muted); background: #1f2024;
    }
    .ctrls {
      position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%);
      display: flex; gap: 12px;
    }
    .pill {
      width: 48px; height: 48px; border-radius: 50%; border: 0;
      background: rgba(255,255,255,.16); color: #fff;
      backdrop-filter: blur(6px); cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .pill:hover { background: rgba(255,255,255,.24); }
    .pill.danger { background: var(--m-danger); }
    .device-bar {
      position: absolute; left: 16px; right: 16px; bottom: -56px;
      display: flex; gap: 8px; flex-wrap: wrap;
    }
    .device-bar select {
      flex: 1 1 200px; padding: 8px 12px; border-radius: 8px;
      background: var(--m-surface); color: var(--m-text); border: 1px solid var(--m-divider);
      font-family: inherit; font-size: 13px;
    }
    .check {
      margin: 80px 0 0; color: var(--m-text-muted); font-size: 13px;
      display: flex; align-items: center; gap: 8px;
    }

    .info { display: flex; flex-direction: column; gap: 20px; }
    h1 { margin: 0; font-weight: 400; font-size: 28px; }
    .code { margin: 0; color: var(--m-text-muted); display: flex; align-items: center; gap: 6px; }
    .who { color: var(--m-text-muted); font-size: 14px; }
    .who strong { color: var(--m-text); }
    .role { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; }

    .pwd-host {
      border: 1px solid var(--m-divider); border-radius: 12px;
      padding: 12px; background: var(--m-surface);
      display: flex; flex-direction: column; gap: 10px;
    }
    .pwd-head { display: flex; align-items: center; gap: 8px; color: var(--m-text); }
    .pwd-toggle { display: flex; align-items: center; gap: 8px; color: var(--m-text-muted); font-size: 14px; }
    .pwd-toggle input { accent-color: var(--m-primary); }
    .pwd-edit { display: flex; flex-direction: column; gap: 8px; }
    .pwd-mode { display: inline-flex; gap: 8px; }
    .mode-btn {
      border: 1px solid var(--m-divider); border-radius: 999px;
      background: var(--m-surface-2); color: var(--m-text-muted);
      padding: 6px 10px; font-size: 12px; cursor: pointer;
    }
    .mode-btn.on { background: var(--m-brand-grad-soft); color: var(--m-primary-700); border-color: transparent; }
    .pwd-input {
      background: var(--m-surface); border: 1px solid var(--m-divider);
      color: var(--m-text); border-radius: 8px; padding: 9px 10px;
      font-family: inherit; font-size: 14px;
    }
    .pwd-hint { margin: 0; font-size: 12px; color: var(--m-text-muted); }
    .pwd-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pwd-msg { font-size: 12px; color: var(--m-success); }

    .pwd-join {
      display: flex; flex-direction: column; gap: 6px;
      padding: 12px; border-radius: 10px;
      background: var(--m-surface); border: 1px solid var(--m-divider);
    }
    .pwd-join label { font-size: 13px; color: var(--m-text-muted); }
    .pwd-join input {
      background: var(--m-surface); border: 1px solid var(--m-divider);
      color: var(--m-text); border-radius: 8px; padding: 9px 10px;
      font-family: inherit; font-size: 14px;
    }

    .badge {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px; background: rgba(138,180,248,.10); border: 1px solid rgba(138,180,248,.30);
      border-radius: 12px; color: var(--m-text);
    }
    .badge m-icon { color: var(--m-primary); }
    .badge .t { font-weight: 500; }
    .badge .d { color: var(--m-text-muted); font-size: 13px; }

    .consent { display: flex; gap: 10px; align-items: flex-start; color: var(--m-text-muted); font-size: 14px; }
    .consent input { accent-color: var(--m-primary); margin-top: 2px; }

    .actions { display: flex; gap: 12px; align-items: center; }
    .join-error { margin: -8px 0 0; color: var(--m-danger); font-size: 13px; }
    .muted { color: var(--m-text-muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }

    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; padding: 20px; gap: 80px; }
      .device-bar { position: static; margin-top: 12px; }
      .check { margin-top: 12px; }
    }
  `]
})
export class LobbyPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private meet = inject(MeetingService);
  private auth = inject(AuthService);
  @ViewChild('self', { static: true }) selfRef!: ElementRef<HTMLVideoElement>;

  user = this.auth.user;
  meeting = signal<Meeting | null>(null);
  role: 'host' | 'guest' = 'guest';
  consent = false;
  joinPassword = '';
  joinError = signal('');

  hostPasswordEnabled = signal(false);
  passwordMode = signal<'custom' | 'random'>('custom');
  hostPasswordDraft = '';
  savingPassword = signal(false);
  passwordSaveMsg = signal('');

  micOn = signal(false);
  camOn = signal(false);
  streamOn = signal(false);
  hasPerms = signal(false);
  permError = signal(false);

  private stream?: MediaStream;
  private clock?: any;
  private _time = signal(this.fmtTime());
  time = this._time;

  isInterview = () => this.meeting()?.mode === 'INTERVIEW';
  safe = () => isSafeBrowser();
  canJoin = () => {
    const consentOk = !this.isInterview() || this.role === 'host' || this.consent;
    const passwordOk = !this.meeting()?.passwordEnabled || this.role === 'host' || !!this.joinPassword.trim();
    return consentOk && passwordOk;
  };

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    const m = await this.meet.info(id);
    if (!m) {
      // Meeting not found / ended — bounce to home
      this.router.navigate(['/home']);
      return;
    }
    this.meeting.set(m);
    this.role = (this.route.snapshot.queryParamMap.get('role') as 'host'|'guest') || 'guest';
    this.joinPassword = this.route.snapshot.queryParamMap.get('pw') || '';
    this.hostPasswordEnabled.set(!!m.passwordEnabled);
    this.hostPasswordDraft = '';

    // Interview gate: a candidate must have the desktop Safe Agent connected
    // before they can take a proctored interview. This catches DIRECT lobby
    // links (and join-by-id+password), which bypass the home/join-redirect
    // gates. The host is never gated; the dev bypass still skips it.
    if (m.mode === 'INTERVIEW' && this.role !== 'host' && !isSafeBrowser()) {
      const agentOk = await this.meet.safeAgentConnected(m.id);
      if (!agentOk) {
        this.router.navigate(['/safe-browser-required'],
          { queryParams: { next: `/meeting/${m.id}/lobby`, id: m.id } });
        return;
      }
    }

    this.clock = setInterval(() => this._time.set(this.fmtTime()), 1000);

    // Enter the lobby with camera and mic OFF. The user opts in with the
    // controls below — this also keeps the camera capture light off on entry.
  }

  ngOnDestroy() {
    clearInterval(this.clock);
    this.stream?.getTracks().forEach(t => t.stop());
  }

  private fmtTime() {
    return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /** Bind the local stream to the muted self-preview (muted so the user never hears their own mic). */
  private bindPreview() {
    const el = this.selfRef.nativeElement;
    el.muted = true;
    el.srcObject = this.stream ?? null;
  }

  /**
   * Acquire the mic when turned on and fully release it when turned off.
   * The self-preview stays muted so the user never hears their own audio.
   */
  async toggleMic() {
    const next = !this.micOn();
    this.micOn.set(next);

    if (!next) {
      // Turn OFF: stop and drop the audio track to release the microphone.
      this.stream?.getAudioTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
      return;
    }

    // Turn ON: acquire a fresh audio track and graft it onto the live stream.
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const track = mic.getAudioTracks()[0];
      if (!track) return;
      if (this.stream) {
        this.stream.getAudioTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
        this.stream.addTrack(track);
      } else {
        this.stream = mic;
      }
      this.bindPreview();
      this.permError.set(false);
      this.hasPerms.set(true);
    } catch {
      // Re-acquire failed (perms revoked / device busy): reflect that mic is off.
      this.micOn.set(false);
      this.permError.set(true);
    }
  }

  /**
   * Fully releases the camera when turned off (stops the video track so the
   * hardware capture light goes out) and re-acquires it when turned on.
   * Just disabling the track keeps the device in use and the light on.
   */
  async toggleCam() {
    const next = !this.camOn();
    this.camOn.set(next);

    if (!next) {
      // Turn OFF: stop and drop the video track to release the device.
      this.stream?.getVideoTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
      this.streamOn.set(false);
      return;
    }

    // Turn ON: acquire a fresh video track and graft it onto the live stream.
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      if (this.stream) {
        this.stream.getVideoTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
        this.stream.addTrack(track);
      } else {
        this.stream = cam;
      }
      this.bindPreview();
      this.hasPerms.set(true);
      this.permError.set(false);
      this.streamOn.set(true);
    } catch {
      // Re-acquire failed (perms revoked / device busy): reflect that camera is off.
      this.camOn.set(false);
      this.streamOn.set(false);
      this.permError.set(true);
    }
  }

  onHostPasswordToggle(v: boolean) {
    this.hostPasswordEnabled.set(!!v);
    this.passwordSaveMsg.set('');
    if (v && !this.hostPasswordDraft.trim()) {
      this.passwordMode.set('random');
      this.useRandomPassword();
    }
  }

  useRandomPassword() {
    this.passwordMode.set('random');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    this.hostPasswordDraft = out;
  }

  async savePasswordSettings() {
    const m = this.meeting();
    if (!m || this.role !== 'host' || this.savingPassword()) return;

    this.passwordSaveMsg.set('');
    if (this.hostPasswordEnabled()) {
      const p = this.hostPasswordDraft.trim();
      if (p.length < 4 || p.length > 32) {
        this.passwordSaveMsg.set('Password must be 4-32 characters.');
        return;
      }
    }

    this.savingPassword.set(true);
    try {
      const updated = await this.meet.updatePasswordSettings(m.id, {
        enabled: this.hostPasswordEnabled(),
        password: this.hostPasswordEnabled() ? this.hostPasswordDraft.trim() : undefined
      });
      this.meeting.set(updated);
      this.hostPasswordEnabled.set(!!updated.passwordEnabled);
      if (updated.passwordEnabled) {
        sessionStorage.setItem('zoomy.pw.' + m.id, this.hostPasswordDraft.trim());
      } else {
        sessionStorage.removeItem('zoomy.pw.' + m.id);
      }
      this.passwordSaveMsg.set(this.hostPasswordEnabled() ? 'Password enabled.' : 'Password disabled.');
    } catch (e: any) {
      this.passwordSaveMsg.set(e?.message || 'Could not save password settings.');
    } finally {
      this.savingPassword.set(false);
    }
  }

  async joinNow() {
    const m = this.meeting()!;
    this.joinError.set('');

    try {
      await this.meet.verifyLobbyAccess(m.id, this.role === 'host' ? undefined : this.joinPassword.trim());
    } catch (e: any) {
      this.joinError.set(e?.message || 'Invalid meeting password.');
      return;
    }

    // Grant access so the room page can verify this user passed the lobby gate.
    sessionStorage.setItem('zoomy.access.' + m.id, '1');
    if (this.role !== 'host' && this.joinPassword.trim()) {
      sessionStorage.setItem('zoomy.pw.' + m.id, this.joinPassword.trim());
    }

    this.router.navigate(['/meeting', m.id], {
      queryParams: {
        role: this.role,
        mic: this.micOn() ? 1 : 0,
        cam: this.camOn() ? 1 : 0
      }
    });
  }

  goBack() { this.router.navigate(['/home']); }
}
