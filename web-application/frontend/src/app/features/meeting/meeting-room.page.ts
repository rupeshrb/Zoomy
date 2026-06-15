import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { Subscription } from 'rxjs';

import { MeetingService, Meeting } from '../../core/meeting.service';
import { SafeAgentClient } from '../../core/safe-agent.client';
import { isSafeBrowser } from '../../core/safe-browser';
import { AuthService } from '../../core/auth.service';
import { RoomService, RoomParticipant, RoomControlEvent } from '../../core/room.service';
import { GazeObserverService } from '../../core/gaze-observer.service';
import { MeetingStageComponent, Tile } from './components/meeting-stage.component';
import { MeetingControlsComponent } from './components/meeting-controls.component';
import {
  MeetingSideDrawerComponent, DrawerTab, Participant, ChatMessage,
  DrawerTool, HostControl, ParticipantAction
} from './components/meeting-side-drawer.component';
import { InterviewAdminPanel, HostCommand } from './interview/interview-admin.panel';
import { WhiteboardComponent } from './tools/whiteboard.component';
import { NotepadComponent } from './tools/notepad.component';
import { CodeIdeComponent } from './tools/code-ide.component';

import { ProctorEvent } from '../../proctor/proctor-event.model';
import { MIconComponent } from '../../shared/ui/m-icon.component';
import {
  RoomSettingsDialog, RoomSettings, loadRoomSettings, saveRoomSettings, DEFAULT_ROOM_SETTINGS
} from './components/room-settings';

@Component({
  selector: 'page-meeting-room',
  standalone: true,
  imports: [
    CommonModule,
    MeetingStageComponent,
    MeetingControlsComponent,
    MeetingSideDrawerComponent,
    InterviewAdminPanel,
    WhiteboardComponent,
    NotepadComponent,
    CodeIdeComponent,
    MIconComponent,
    RoomSettingsDialog
  ],
  template: `
    <div class="room" [class.tool-focus]="ivTool() && ivSize()==='focus'" [class.tool-full]="ivTool() && ivSize()==='full'">
      <div class="agent-banner" *ngIf="agentReconnectNeeded()">
        <m-icon name="gpp_maybe" [size]="18" />
        <span *ngIf="agentClosed()">Your Safe Agent was closed. Reopen the desktop app to stay compliant — your interviewer has been notified.</span>
        <span *ngIf="!agentClosed()">Your Safe Agent disconnected. Reconnect to stay compliant — your interviewer has been notified.</span>
        <button class="agent-reconnect" (click)="reconnectAgent()" [disabled]="agentReconnecting()">
          <m-icon name="autorenew" [size]="16" />
          {{ agentReconnecting() ? 'Reconnecting…' : (agentClosed() ? 'I reopened it' : 'Reconnect') }}
        </button>
      </div>
      <main>
        <div class="stage-wrap" [class.with-drawer]="drawerTab() || ivTool()" [class.stage-hidden]="ivTool() && ivSize()!=='split'">
          <meeting-stage [tiles]="tiles()" (pinToggle)="togglePin($event)" />

          <!-- Interview tool panel docks bottom of stage when active -->
          <div class="iv-dock" *ngIf="ivTool()" [attr.data-size]="ivSize()"
               [style.height.px]="ivSize()==='split' ? ivDockH() : null">
            <!-- Drag this bar to resize the tool panel (split mode only) -->
            <div class="iv-resize" *ngIf="ivSize()==='split'"
                 (pointerdown)="startToolResize($event)" title="Drag to resize">
              <span></span>
            </div>
            <div class="iv-head">
              <div class="iv-tabs">
                <button *ngIf="tools().whiteboard" [class.on]="ivTool()==='whiteboard'" (click)="setTool('whiteboard')">
                  <m-icon name="brush" [size]="18" /> Whiteboard
                </button>
                <button *ngIf="tools().notepad" [class.on]="ivTool()==='notepad'" (click)="setTool('notepad')">
                  <m-icon name="sticky_note_2" [size]="18" /> Notepad
                </button>
                <button *ngIf="tools().code" [class.on]="ivTool()==='code'" (click)="setTool('code')">
                  <m-icon name="code" [size]="18" /> Code
                </button>
              </div>
              <div class="iv-size">
                <button class="iv-sz" [class.on]="ivSize()==='split'" (click)="ivSize.set('split')" title="Split with video tiles">
                  <m-icon name="splitscreen" [size]="18" />
                </button>
                <button class="iv-sz" [class.on]="ivSize()==='focus'" (click)="ivSize.set('focus')" title="Hide video tiles">
                  <m-icon name="aspect_ratio" [size]="18" />
                </button>
                <button class="iv-sz" [class.on]="ivSize()==='full'" (click)="ivSize.set('full')" title="Full screen">
                  <m-icon name="fullscreen" [size]="18" />
                </button>
              </div>
              <button class="iv-close" (click)="setTool(null)" title="Close tool">
                <m-icon name="close" />
              </button>
            </div>
            <div class="iv-body" [ngSwitch]="ivTool()">
              <iv-whiteboard *ngSwitchCase="'whiteboard'" />
              <iv-notepad    *ngSwitchCase="'notepad'"
                             [meetingMode]="meeting()?.mode || 'NORMAL'"
                             [role]="role"
                             [meetingId]="meeting()?.id || ''"
                             [userId]="selfId" />
              <iv-code-ide   *ngSwitchCase="'code'" />
            </div>
          </div>
        </div>

        <meeting-side-drawer
          [tab]="drawerTab()"
          [participants]="participants()"
          [messages]="messages()"
          [meetingCode]="meeting()?.code || ''"
          [meetingPassword]="sharePassword()"
          [selfId]="selfId"
          [isHost]="role==='host'"
          [isInterview]="isInterview()"
          [aiEnabled]="aiAllowed()"
          [tools]="tools()"
          [hostState]="hostState"
          [chatLocked]="chatLocked()"
          [lockedIds]="lockedMics()"
          (close)="drawerTab.set(null)"
          (send)="onSendMessage($event)"
          (launchTool)="setTool($event)"
          (hostControl)="onHostControl($event)"
          (participantAction)="onParticipantAction($event)"
          (aiToggle)="onAiToggle($event)"
        >
          <div drawer-interview *ngIf="drawerTab()==='interview'">
            <div class="iv-tab-buttons">
              <button class="iv-tab-btn" [class.on]="ivView()==='tools'" (click)="ivView.set('tools')">Tools</button>
              <button class="iv-tab-btn" [class.on]="ivView()==='admin'" (click)="ivView.set('admin')" *ngIf="role==='host'">Admin</button>
            </div>
            <div *ngIf="ivView()==='tools'" class="tool-launch">
              <button class="tl" *ngIf="tools().whiteboard" (click)="setTool('whiteboard')">
                <m-icon name="brush" [size]="28" /> Whiteboard
              </button>
              <button class="tl" *ngIf="tools().notepad" (click)="setTool('notepad')">
                <m-icon name="sticky_note_2" [size]="28" /> Notepad
              </button>
              <button class="tl" *ngIf="tools().code" (click)="setTool('code')">
                <m-icon name="code" [size]="28" /> Code IDE
              </button>
            </div>
            <iv-admin-panel
              *ngIf="ivView()==='admin' && role==='host'"
              [candidateName]="candidateName()"
              [muted]="hostState.muted" [camOff]="hostState.camOff" [chatLocked]="hostState.chatLocked"
              [alerts]="proctorAlerts()"
              [agentConnected]="candidateAgentConnected()"
              [gazeOn]="gazeOn()"
              [envScanOn]="envScanOn()"
              [gazePct]="candidateGazePct()"
              [gazeLabel]="candidateGazeLabel()"
              [gazeVPct]="candidateGazeVPct()"
              [gazeVLabel]="candidateGazeVLabel()"
              [scanStatus]="scanStatus()"
              (command)="onHostCommand($event)"
            />
          </div>
        </meeting-side-drawer>
      </main>

      <meeting-controls
        [micOn]="micOn()" [micLocked]="micLocked()" [camOn]="camOn()" [ccOn]="ccOn()"
        [handUp]="handUp()" [sharing]="sharing()"
        [time]="time()" [code]="meeting()?.code || ''"
        [peopleCount]="participants().length"
        [showInterview]="isInterview()"
        [showAi]="showAi()"
        [showSettings]="role==='host'"
        (toggle)="onToggle($event)"
        (openTab)="onOpenTab($event)"
        (openSettings)="openRoomSettings()"
      />
    </div>

    <room-settings-dialog
      [open]="settingsOpen()"
      [value]="tools()"
      title="Room settings"
      subtitle="Toggle which tools are available in this meeting. Changes apply to everyone."
      saveLabel="Save changes"
      (close)="settingsOpen.set(false)"
      (save)="applyRoomSettings($event)"
    />

    <div class="toasts">
      <div class="toast" *ngFor="let t of toasts()">
        <m-icon [name]="t.icon" [size]="18" />
        <span>{{ t.text }}</span>
      </div>
    </div>
  `,
  styles: [`
    /* Meeting room follows the global theme.
       Dark theme: keep the immersive dark surfaces.
       Light theme: remap dark tokens to the light/themed palette
       so chat, controls, drawer, tools all flip together. */
    :host {
      display: block; height: 100vh; overflow: hidden;
      background: var(--m-bg); color: var(--m-text);
    }
    :host-context(html:not([data-theme="dark"])) {
      --m-bg:         #f6f8fc;
      --m-surface:    #ffffff;
      --m-surface-2:  #eef1f6;
      --m-elevated:   #e3e8f0;
      --m-overlay:    rgba(255,255,255,.78);
      --m-divider:    #e0e4eb;
      --m-outline:    #c2c7d0;
      --m-text:       #1f2230;
      --m-text-muted: #5a6273;
      --m-text-strong:#0a0d18;
      --m-primary:    #1a73e8;
      --m-primary-ink:#ffffff;
    }
    .room { display: flex; flex-direction: column; height: 100%; }
    .agent-banner {
      flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; background: #d93025; color: #fff;
      font-size: 13px; font-weight: 500;
    }
    .agent-banner m-icon { color: #fff; }
    .agent-banner span { flex: 1; min-width: 0; }
    .agent-reconnect {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border: 0; border-radius: 999px; cursor: pointer;
      background: #fff; color: #d93025; font-weight: 600; font-size: 13px;
      font-family: inherit; transition: opacity .15s;
    }
    .agent-reconnect:hover:not(:disabled) { opacity: .9; }
    .agent-reconnect:disabled { opacity: .6; cursor: default; }
    .agent-reconnect m-icon { color: #d93025; }
    main { flex: 1; display: flex; gap: 0; min-height: 0; }
    .stage-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

    .iv-dock {
      flex: 0 0 auto; min-height: 0; margin: 0 8px 8px;
      background: var(--m-surface); border-radius: 16px;
      display: flex; flex-direction: column; overflow: hidden;
      box-shadow: var(--m-e2);
      border: 1px solid var(--m-divider);
    }
    /* Draggable resize bar (split mode): drag up/down to grow/shrink the panel */
    .iv-resize {
      flex: 0 0 auto; height: 14px; cursor: ns-resize; touch-action: none;
      display: flex; align-items: center; justify-content: center;
      background: var(--m-surface-2); transition: background-color .15s;
    }
    .iv-resize:hover, .iv-resize:active { background: var(--m-elevated); }
    .iv-resize span { width: 44px; height: 4px; border-radius: 999px; background: var(--m-outline); transition: background-color .15s, width .15s; }
    .iv-resize:hover span, .iv-resize:active span { background: var(--m-primary-700); width: 64px; }
    /* Focus: tool fills the stage area, video tiles hidden, controls bar still visible */
    .stage-wrap.stage-hidden meeting-stage { display: none; }
    .iv-dock[data-size="focus"] { flex: 1 1 auto; margin: 8px; }
    /* Full screen: tool fills the entire room, hiding controls and drawer too */
    .room.tool-full .iv-dock { position: fixed; inset: 0; margin: 0; border-radius: 0; border: 0; z-index: 100; }
    .room.tool-full meeting-controls,
    .room.tool-full meeting-side-drawer { display: none; }

    .iv-head { display: flex; align-items: center; padding: 6px 6px 6px 12px; border-bottom: 1px solid var(--m-divider); gap: 6px; }
    .iv-tabs { display: flex; gap: 4px; flex: 1; min-width: 0; }
    .iv-size { display: inline-flex; align-items: center; gap: 2px; padding: 2px;
               background: var(--m-surface-2); border-radius: 999px; }
    .iv-sz {
      width: 32px; height: 32px; border: 0; background: transparent; color: var(--m-text-muted);
      border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: background-color .15s, color .15s;
    }
    .iv-sz:hover { background: var(--m-elevated); color: var(--m-text); }
    .iv-sz.on { background: var(--m-brand-grad-soft); color: var(--m-primary-700); }
    .iv-tabs button {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border: 0; background: transparent; color: var(--m-text-muted);
      border-radius: 999px; cursor: pointer; font-family: inherit; font-size: 13px;
    }
    .iv-tabs button:hover { background: var(--m-surface-2); color: var(--m-text); }
    .iv-tabs button.on { background: var(--m-brand-grad-soft); color: var(--m-primary-700); font-weight: 500; }
    .iv-close { width: 36px; height: 36px; border: 0; background: transparent; color: var(--m-text);
                cursor: pointer; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
    .iv-close:hover { background: var(--m-surface-2); }
    .iv-body { flex: 1; min-height: 0; padding: 8px; }
    .iv-body > * { display: block; height: 100%; }

    .iv-tab-buttons { display: flex; gap: 4px; background: var(--m-surface-2); padding: 4px; border-radius: 999px; margin-bottom: 12px; }
    .iv-tab-btn {
      flex: 1; padding: 8px; border: 0; background: transparent;
      color: var(--m-text-muted); border-radius: 999px; cursor: pointer; font-size: 13px;
    }
    .iv-tab-btn.on { background: var(--m-surface); color: var(--m-text); box-shadow: var(--m-e1); }

    .tool-launch { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .tl {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 18px; background: var(--m-surface-2); color: var(--m-text);
      border: 1px solid var(--m-divider); border-radius: 14px; cursor: pointer; font-size: 13px;
      transition: background-color .15s, transform .04s, border-color .15s;
    }
    .tl:hover { background: var(--m-elevated); border-color: var(--m-outline); }
    .tl m-icon { color: var(--m-accent); }
    .tl.code m-icon { color: var(--m-accent-2); }
    .tl.board m-icon { color: var(--m-primary); }

    .toasts {
      position: fixed; left: 50%; bottom: 92px; transform: translateX(-50%);
      display: flex; flex-direction: column; gap: 8px; z-index: 200;
      pointer-events: none;
    }
    .toast {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--m-surface); color: var(--m-text);
      border: 1px solid var(--m-divider); box-shadow: var(--m-e2);
      padding: 10px 16px; border-radius: 999px; font-size: 13px;
      animation: toast-in .18s ease-out;
    }
    .toast m-icon { color: var(--m-primary); }
    @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    @media (max-width: 900px) {
      main { flex-direction: column; }
      .iv-dock { flex: 0 0 40vh; margin: 0; border-radius: 0; }
    }
  `]
})
export class MeetingRoomPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private meet = inject(MeetingService);
  private auth = inject(AuthService);
  private room = inject(RoomService);
  private gaze = inject(GazeObserverService);
  private safeAgent = inject(SafeAgentClient);
  @ViewChild('self') selfRef?: ElementRef<HTMLVideoElement>;

  meeting = signal<Meeting | null>(null);
  role: 'host' | 'guest' = 'guest';
  selfId = this.room.participantId;

  toasts = signal<{ id: number; text: string; icon: string }[]>([]);
  sharePassword = signal('');
  private toastSeq = 0;
  private pinnedId: string | null = null;
  private subs: Subscription[] = [];

  micOn = signal(true);
  camOn = signal(true);
  ccOn = signal(false);
  handUp = signal(false);
  sharing = signal(false);

  drawerTab = signal<DrawerTab | null>(null);
  ivView = signal<'tools' | 'admin'>('tools');
  ivTool = signal<'whiteboard' | 'notepad' | 'code' | null>(null);
  ivSize = signal<'split' | 'focus' | 'full'>('split');
  /** Height (px) of the interview tool dock in split mode — drag-resizable, persisted. */
  ivDockH = signal(this.loadDockHeight());

  private loadDockHeight(): number {
    const v = Number(localStorage.getItem('zoomy.ivDockH'));
    return Number.isFinite(v) && v >= 180 ? v : 360;
  }

  /**
   * AI assistant availability for the candidate / participant.
   * - Normal meetings: always allowed.
   * - Interview meetings: host must explicitly enable it.
   *   The host can always open the AI tab themselves.
   */
  aiAllowed = signal(true);

  tiles = signal<Tile[]>([]);
  participants = signal<Participant[]>([]);
  messages = signal<ChatMessage[]>([]);
  proctorAlerts = signal<ProctorEvent[]>([]);

  hostState = { muted: false, camOff: false, chatLocked: false };

  /** Proctor toggles (interview mode only). */
  gazeOn = signal(true);
  envScanOn = signal(true);

  /** Live environment-scan result for the interviewer ('idle'|'scanning'|'clean'|'detected'). */
  scanStatus = signal<'idle' | 'scanning' | 'clean' | 'detected'>('idle');

  /** Candidate: their Safe Agent dropped mid-interview and must be reopened. */
  agentReconnectNeeded = signal(false);
  agentReconnecting = signal(false);
  /** True once we've confirmed the proctor agent was actually present. */
  private agentEverConnected = false;
  /** Consecutive watch ticks the agent looked gone (rides over brief blips). */
  private agentFailTicks = 0;
  /** The agent process is closed (loopback unreachable) vs. just backend-dropped. */
  agentClosed = signal(false);
  private agentWatch?: any;
  /** Last agent-protection state we broadcast to the room (avoid spamming). */
  private agentBroadcastState?: boolean;
  /** Throttle silent auto-reconnect attempts (epoch ms of last try). */
  private agentAutoReconnectAt = 0;

  /** Host: is THIS candidate's desktop proctor agent currently connected? */
  candidateAgentConnected = signal<boolean | null>(null);

  /** Live candidate gaze readout fed to the interview admin panel. */
  candidateGazePct = signal(50);
  candidateGazeLabel = signal<'Left' | 'Center' | 'Right'>('Center');
  candidateGazeVPct = signal(50);
  candidateGazeVLabel = signal<'Up' | 'Center' | 'Down'>('Center');
  private lastGazeSent = 0;
  /** Host-side sustained look-away tracking -> fires an alert after 4s off-screen. */
  private gazeAwaySince = 0;
  private gazeAwayAlerted = false;

  /** Chat lock state applied to everyone (host-controlled). */
  chatLocked = signal(false);

  /** This participant's mic is force-muted + locked by the host (can't self-unmute). */
  micLocked = signal(false);

  /** Host view: participant ids whose mics are currently locked (force-muted). */
  lockedMics = signal<string[]>([]);

  /** Per-meeting tool availability (host-controlled). */
  tools = signal<RoomSettings>({ ...DEFAULT_ROOM_SETTINGS });
  settingsOpen = signal(false);

  private clock?: any;
  private _time = signal(this.fmt());
  time = this._time;

  private stream?: MediaStream;

  isInterview = () => this.meeting()?.mode === 'INTERVIEW';
  candidateName = () => this.participants().find(p => !p.isHost)?.name || 'Candidate';
  showAi = () => this.tools().ai && (!this.isInterview() || this.role === 'host' || this.aiAllowed());

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    const m = await this.meet.info(id);
    if (!m) { this.router.navigate(['/home']); return; }
    this.meeting.set(m);
    this.role = (this.route.snapshot.queryParamMap.get('role') as 'host'|'guest') || 'guest';

    // Password gate: guests reaching /meeting/:id directly (e.g. shared link)
    // must pass the lobby first when the meeting is password protected.
    if (this.role !== 'host' && m.passwordEnabled && sessionStorage.getItem('zoomy.access.' + m.id) !== '1') {
      this.router.navigate(['/meeting', m.id, 'lobby']);
      return;
    }

    // Interview gate: a candidate must have the desktop Safe Agent connected.
    // Catches direct /meeting/:id deep-links that skip the lobby (e.g. a
    // non-password interview link). The host is never gated; dev bypass skips it.
    if (m.mode === 'INTERVIEW' && this.role !== 'host' && !isSafeBrowser()) {
      const agentOk = await this.meet.safeAgentConnected(m.id);
      if (!agentOk) {
        this.router.navigate(['/safe-browser-required'],
          { queryParams: { next: `/meeting/${m.id}/lobby`, id: m.id } });
        return;
      }
    }

    // Load per-meeting tool availability set by the host at creation time.
    this.tools.set(loadRoomSettings(m.id));

    // Host can share the meeting password from the info panel (kept locally only).
    if (this.role === 'host' && m.passwordEnabled) {
      this.sharePassword.set(sessionStorage.getItem('zoomy.pw.' + m.id) || '');
    }

    // AI assistant: free for normal meetings, host opt-in for interviews.
    this.aiAllowed.set(m.mode !== 'INTERVIEW');

    this.micOn.set(this.route.snapshot.queryParamMap.get('mic') !== '0');
    this.camOn.set(this.route.snapshot.queryParamMap.get('cam') !== '0');

    this.clock = setInterval(() => this._time.set(this.fmt()), 30_000);

    await this.attachLocal();
    this.connectRoom();
    void this.startGaze();
    // Candidates in an interview: watch that their Safe Agent stays connected.
    if (this.isInterview() && this.role !== 'host') this.startAgentWatch();
  }

  ngOnDestroy() {
    clearInterval(this.clock);
    clearInterval(this.agentWatch);
    this.subs.forEach(s => s.unsubscribe());
    this.stopGaze();
    this.room.leave();
    this.stream?.getTracks().forEach(t => t.stop());
    // Drop any in-flight resize listeners.
    this.dockResizeCleanup?.();
  }

  private fmt() {
    return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  private async attachLocal() {
    // Acquire only the devices the user enabled in the lobby. Anything turned
    // off is not requested, so the camera/mic stays fully released until used.
    const want: MediaStreamConstraints = { audio: this.micOn(), video: this.camOn() };
    if (!want.audio && !want.video) {
      this.room.setLocalStream(undefined);
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(want);
    } catch { /* perms denied — show avatar */ }
    this.room.setLocalStream(this.stream);
  }

  /** Connect to the live room: presence, chat and media sync for everyone. */
  private connectRoom() {
    const me = this.auth.user();
    const m = this.meeting();
    if (!m) return;

    this.subs.push(this.room.participants$.subscribe(list => this.rebuildFromRoom(list)));

    this.subs.push(this.room.joined$.subscribe(p =>
      this.pushToast(`${p.name || 'Someone'} joined`, 'person_add')));
    this.subs.push(this.room.left$.subscribe(p =>
      this.pushToast(`${p.name || 'Someone'} left`, 'person_remove')));

    // A remote participant started/stopped presenting — spotlight their screen.
    this.subs.push(this.room.media$.subscribe(p => {
      if (p.participantId === this.selfId) return;
      const screenId = p.participantId + ':screen';
      if (p.screenOn) {
        this.pushToast(`${p.name || 'Someone'} is presenting`, 'present_to_all');
        this.setPin(screenId);
      } else if (this.pinnedId === screenId) {
        this.setPin(null);
      }
    }));

    // A remote participant's camera/mic stream arrived/changed — bind its tile.
    this.subs.push(this.room.remoteStream$.subscribe(({ participantId, stream }) => {
      this.tiles.update(arr => arr.map(t =>
        t.id === participantId ? { ...t, stream } : t));
    }));

    // A remote participant's shared screen arrived/changed — bind its screen tile.
    this.subs.push(this.room.remoteScreen$.subscribe(({ participantId, stream }) => {
      this.tiles.update(arr => arr.map(t =>
        t.id === participantId + ':screen' ? { ...t, stream } : t));
    }));

    // Proctoring signals raised on participants' devices land in the host's alert feed.
    this.subs.push(this.room.proctor$.subscribe(ev => {
      if (ev.fromParticipantId === this.selfId) return;

      // Proctor-agent connection state drives a persistent host indicator. A
      // "connected" event is reassuring (status only, no alert clutter); a
      // "disconnected" event is a real compliance signal (status + alert + toast).
      if (ev.kind === 'AGENT_CONNECTED' || ev.kind === 'AGENT_DISCONNECTED') {
        const up = ev.kind === 'AGENT_CONNECTED';
        this.candidateAgentConnected.set(up);
        if (up) {
          if (this.role === 'host') this.pushToast(`${ev.fromName || 'Candidate'}'s proctor agent connected`, 'verified_user');
          return;   // don't list a positive event among the violation alerts
        }
      }

      this.proctorAlerts.update(a => [{
        sessionId: m.id,
        candidateId: ev.fromParticipantId,
        source: (ev.source as ProctorEvent['source']) || 'BROWSER',
        kind: ev.kind as ProctorEvent['kind'],
        severity: (ev.severity as ProctorEvent['severity']) || 'WARN',
        message: `${ev.fromName || 'Participant'}: ${ev.message}`,
        occurredAt: ev.at || new Date().toISOString()
      }, ...a].slice(0, 100));
      // Reflect environment-scan results in the interviewer's scan widget.
      if (ev.kind === 'ENV_SCAN_CLEAN') this.scanStatus.set('clean');
      else if (ev.kind === 'ENV_SCAN_DETECTED') this.scanStatus.set('detected');
      if (this.role === 'host') {
        const icon = ev.severity === 'CRITICAL' ? 'gpp_maybe' : 'visibility';
        this.pushToast(`${ev.fromName || 'Participant'}: ${ev.message}`, icon);
      }
    }));

    // Forward this device's own gaze/presence signals to the room (for the host).
    this.subs.push(this.gaze.event.subscribe(sig => {
      const me2 = this.auth.user();
      this.room.sendProctor({
        fromName: me2?.name || 'You',
        source: 'BROWSER',
        kind: sig.kind,
        severity: sig.severity,
        message: sig.message
      });
    }));

    // Stream this device's continuous gaze reading to the interviewer (throttled).
    this.subs.push(this.gaze.reading.subscribe(r => {
      if (!this.isInterview()) return;   // readout only exists in interview mode
      const now = Date.now();
      if (now - this.lastGazeSent < 180) return;
      this.lastGazeSent = now;
      this.room.sendGaze(r.x, r.y, r.label, r.vlabel);
    }));

    // Host: receive a candidate's live gaze reading for the admin readout.
    this.subs.push(this.room.gaze$.subscribe(g => {
      if (g.fromParticipantId === this.selfId) return;
      // Map -1..+1 to 0..100% across each axis.
      this.candidateGazePct.set(Math.round((g.x + 1) * 50));
      this.candidateGazeLabel.set((g.label as 'Left' | 'Center' | 'Right') || 'Center');
      this.candidateGazeVPct.set(Math.round((g.y + 1) * 50));
      this.candidateGazeVLabel.set((g.vlabel as 'Up' | 'Center' | 'Down') || 'Center');

      // Raise ONE proctor alert when the candidate keeps looking away for 4s+,
      // re-armed once they look back at the screen.
      const lookingAway = (g.label && g.label !== 'Center') || (g.vlabel && g.vlabel !== 'Center');
      const now = Date.now();
      if (!lookingAway) {
        this.gazeAwaySince = 0;
        this.gazeAwayAlerted = false;
      } else if (this.gazeAwaySince === 0) {
        this.gazeAwaySince = now;
      } else if (!this.gazeAwayAlerted && now - this.gazeAwaySince >= 4000) {
        this.gazeAwayAlerted = true;
        const secs = Math.round((now - this.gazeAwaySince) / 1000);
        const dir = [g.vlabel, g.label].filter(d => d && d !== 'Center').join(' ').toLowerCase() || 'away';
        const name = this.participants().find(p => p.id === g.fromParticipantId)?.name || 'Candidate';
        this.proctorAlerts.update(a => [{
          sessionId: m.id,
          candidateId: g.fromParticipantId,
          source: 'BROWSER' as const,
          kind: 'GAZE_OFF_SCREEN' as const,
          severity: 'WARN' as const,
          message: `${name}: Looked ${dir} from the screen for ${secs}s+`,
          occurredAt: new Date().toISOString()
        }, ...a].slice(0, 100));
        if (this.role === 'host') this.pushToast(`${name} looked away for ${secs}s+`, 'visibility_off');
      }
    }));

    // Participants apply host control commands addressed to them (or ALL).
    this.subs.push(this.room.control$.subscribe(c => this.applyControl(c)));

    this.subs.push(this.room.chat$.subscribe(msg => {
      const mine = msg.fromParticipantId === this.selfId;
      this.messages.update(arr => [...arr, {
        from: mine ? (me?.name || 'You') : msg.fromName,
        text: msg.text,
        at: new Date(msg.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        mine
      }]);
    }));

    void this.room.connect(m.id, {
      userId: me?.id || this.selfId,
      name: me?.name || 'You',
      role: this.role,
      micOn: this.micOn(),
      camOn: this.camOn()
    });
  }

  /** Map authoritative room participants into stage tiles + people list. */
  private rebuildFromRoom(list: RoomParticipant[]) {
    const me = this.auth.user();
    const tiles: Tile[] = [];
    for (const p of list) {
      const isSelf = p.participantId === this.selfId;
      // Camera/avatar tile (one per participant, always present).
      tiles.push({
        id: p.participantId,
        name: isSelf ? (me?.name || p.name || 'You') : p.name,
        isLocal: isSelf,
        stream: isSelf ? (this.stream ?? null) : this.room.remoteStreamFor(p.participantId),
        muted: !p.micOn,
        camOff: !p.camOn,
        screen: false,
        isHost: p.role === 'HOST',
        pinned: this.pinnedId === p.participantId
      });
      // Separate screen tile while this participant is presenting.
      if (p.screenOn) {
        const screenId = p.participantId + ':screen';
        tiles.push({
          id: screenId,
          name: `${isSelf ? (me?.name || 'You') : p.name} · screen`,
          isLocal: isSelf,
          stream: isSelf ? (this.screenStream ?? null) : this.room.remoteScreenFor(p.participantId),
          screen: true,
          isHost: p.role === 'HOST',
          pinned: this.pinnedId === screenId
        });
      }
    }
    this.tiles.set(tiles);
    this.participants.set(list.map(p => ({
      id: p.participantId,
      name: p.participantId === this.selfId ? (me?.name || p.name || 'You') : p.name,
      isHost: p.role === 'HOST',
      muted: !p.micOn,
      camOff: !p.camOn
    })));
  }

  /** Click a tile to spotlight it; click the spotlighted tile again to clear. */
  togglePin(id: string) {
    this.setPin(this.pinnedId === id ? null : id);
  }

  private pushToast(text: string, icon: string) {
    const id = ++this.toastSeq;
    this.toasts.update(t => [...t, { id, text, icon }]);
    setTimeout(() => this.toasts.update(t => t.filter(x => x.id !== id)), 4000);
  }

  private seedDemoProctorAlerts() {
    setTimeout(() => this.proctorAlerts.update(a => [{
      sessionId: this.meeting()!.id, candidateId: 'r1',
      source: 'BROWSER', kind: 'GAZE_OFF_SCREEN', severity: 'WARN',
      message: 'Sustained gaze away from screen (offset=0.42)',
      occurredAt: new Date().toISOString()
    }, ...a]), 4500);
    setTimeout(() => this.proctorAlerts.update(a => [{
      sessionId: this.meeting()!.id, candidateId: 'r1',
      source: 'SAFE_BROWSER', kind: 'HIDDEN_OVERLAY_WINDOW', severity: 'CRITICAL',
      message: 'Window "Cluely" pid=14820 displayAffinity=0x11',
      occurredAt: new Date().toISOString()
    }, ...a]), 9000);
  }

  onToggle(k: 'mic'|'cam'|'captions'|'hand'|'share'|'leave') {
    switch (k) {
      case 'mic': this.toggleMic(); break;
      case 'cam': this.toggleCam(); break;
      case 'captions': this.ccOn.set(!this.ccOn()); break;
      case 'hand': this.handUp.set(!this.handUp()); break;
      case 'share': this.toggleShare(); break;
      case 'leave': this.leave(); break;
    }
  }

  /**
   * Acquire the microphone when turned on and fully release it when off, then
   * publish the change to peers so others start/stop hearing this participant.
   */
  private async toggleMic() {
    // The host can lock this participant's mic; they cannot self-unmute then.
    if (this.micLocked()) {
      this.pushToast('Your mic is locked by the host', 'lock');
      return;
    }
    const next = !this.micOn();
    this.micOn.set(next);

    if (!next) {
      this.stream?.getAudioTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
      this.room.setLocalStream(this.stream);
      this.afterMediaChange();
      return;
    }

    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const track = mic.getAudioTracks()[0];
      if (track) {
        if (this.stream) {
          this.stream.getAudioTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
          this.stream.addTrack(track);
        } else {
          this.stream = mic;
        }
        this.refreshSelfStream();
      }
    } catch {
      this.micOn.set(false);
    }
    this.room.setLocalStream(this.stream);
    this.afterMediaChange();
  }

  /** Mute this device's mic immediately, bypassing the lock guard (host-forced). */
  private async forceMuteSelf() {
    if (!this.micOn()) return;
    this.micOn.set(false);
    this.stream?.getAudioTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
    this.room.setLocalStream(this.stream);
    this.afterMediaChange();
  }

  /**
   * Fully releases the camera when turned off (stops the video track so the
   * hardware capture light goes out) and re-acquires it when turned on.
   * Just disabling the track keeps the device in use and the light on.
   */
  private async toggleCam() {
    const next = !this.camOn();
    this.camOn.set(next);

    if (!next) {
      // Turn OFF: stop and drop the video track to release the device.
      this.stream?.getVideoTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
      this.stopGaze();
      this.room.setLocalStream(this.stream);
      this.afterMediaChange();
      return;
    }

    // Turn ON: acquire a fresh video track and graft it onto the live stream.
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = cam.getVideoTracks()[0];
      if (track) {
        if (this.stream) {
          this.stream.getVideoTracks().forEach(t => { t.stop(); this.stream!.removeTrack(t); });
          this.stream.addTrack(track);
        } else {
          this.stream = cam;
        }
        this.refreshSelfStream();
      }
    } catch {
      // Re-acquire failed (perms revoked / device busy): reflect that camera is off.
      this.camOn.set(false);
    }
    this.room.setLocalStream(this.stream);
    this.afterMediaChange();
    void this.startGaze();
  }

  /** Re-point the local self tile at the current stream so the video re-binds. */
  private refreshSelfStream() {
    this.tiles.update(arr => arr.map(t => t.isLocal && !t.screen ? { ...t, stream: this.stream ?? null } : t));
  }

  /** The dedicated local screen-capture stream while presenting. */
  private screenStream?: MediaStream;
  private get selfScreenId() { return this.selfId + ':screen'; }

  /**
   * Screen share as a SEPARATE stream: the camera keeps running in its own
   * tile, and the screen is published as an additional stream that renders as
   * its own tile for every participant. Auto-spotlights the screen.
   */
  private async toggleShare() {
    if (this.sharing()) { this.stopShare(); return; }
    try {
      const disp: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      const screenTrack = disp.getVideoTracks()[0];
      if (!screenTrack) return;
      this.screenStream = disp;

      this.sharing.set(true);
      this.room.setScreenStream(disp);     // publish screen as its own stream
      this.addSelfScreenTile();
      this.setPin(this.selfScreenId);      // spotlight the screen for everyone locally
      this.afterMediaChange();             // broadcasts screenOn=true

      // Fired when the user clicks the browser's native "Stop sharing".
      screenTrack.onended = () => this.stopShare();
    } catch { /* user cancelled the picker */ }
  }

  private stopShare() {
    if (!this.sharing()) return;
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.screenStream = undefined;

    this.sharing.set(false);
    this.room.setScreenStream(undefined);  // stop publishing the screen
    this.removeSelfScreenTile();
    if (this.pinnedId === this.selfScreenId) this.setPin(null);
    this.afterMediaChange();               // broadcasts screenOn=false
  }

  /** Add (or refresh) the local screen tile next to the camera tile. */
  private addSelfScreenTile() {
    const me = this.auth.user();
    const tile: Tile = {
      id: this.selfScreenId,
      name: `${me?.name || 'You'} · screen`,
      isLocal: true,
      screen: true,
      stream: this.screenStream ?? null,
      isHost: this.role === 'host',
      pinned: this.pinnedId === this.selfScreenId
    };
    this.tiles.update(arr => {
      const without = arr.filter(t => t.id !== this.selfScreenId);
      return [...without, tile];
    });
  }

  private removeSelfScreenTile() {
    this.tiles.update(arr => arr.filter(t => t.id !== this.selfScreenId));
  }

  /** Deterministically set (or clear) the spotlighted tile. */
  private setPin(id: string | null) {
    this.pinnedId = id;
    this.tiles.update(arr => arr.map(t => ({ ...t, pinned: t.id === id })));
  }

  private gazeRunning = false;

  /**
   * Run the in-browser gaze/presence observer on this device's own camera.
   * Only non-host participants self-observe; the host views the aggregated
   * signals. Skipped while presenting (no camera) or with the camera off.
   */
  private async startGaze() {
    if (this.role === 'host') return;
    if (!this.gazeOn()) return;
    if (this.sharing() || !this.camOn()) return;
    if (this.gazeRunning) return;
    if (!this.stream?.getVideoTracks().length) return;
    this.gazeRunning = true;
    try {
      await this.gaze.start(this.stream);
    } catch {
      this.gazeRunning = false;
    }
  }

  private stopGaze() {
    if (!this.gazeRunning) return;
    this.gaze.stop();
    this.gazeRunning = false;
  }


  /** Reflect local mic/cam/screen state locally and broadcast to the room. */
  private afterMediaChange() {
    this.updateSelfTile();
    this.room.sendMedia(this.micOn(), this.camOn(), this.sharing());
  }

  private updateSelfTile() {
    this.tiles.update(arr => arr.map(t => t.id === this.selfId
      ? { ...t, muted: !this.micOn(), camOff: !this.camOn() } : t));
  }

  onOpenTab(t: 'info'|'people'|'chat'|'activities'|'interview'|'ai') {
    this.drawerTab.set(this.drawerTab() === t ? null : t);
    if (t === 'interview' && this.role === 'host') this.ivView.set('admin');
    else if (t === 'interview') this.ivView.set('tools');
  }

  setTool(t: 'whiteboard'|'notepad'|'code'|null) {
    if (t && !this.tools()[t]) return; // disabled by host
    this.ivTool.set(t);
  }

  // ---- Interview tool dock drag-to-resize (split mode) ----
  private dockResizeCleanup?: () => void;

  /**
   * Drag the bar at the top of the interview tool dock to grow/shrink it.
   * Closure-based so start geometry is captured per-drag; listeners live on
   * window so the drag keeps tracking even if the pointer leaves the handle.
   */
  startToolResize(e: PointerEvent) {
    e.preventDefault();
    const dock = (e.currentTarget as HTMLElement).closest('.iv-dock') as HTMLElement | null;
    if (!dock) return;
    const wrap = dock.parentElement as HTMLElement | null;       // .stage-wrap
    const startY = e.clientY;
    const startH = dock.getBoundingClientRect().height;
    // Keep at least ~150px of video tiles above; never taller than the stage.
    const maxH = wrap ? Math.max(220, wrap.clientHeight - 150) : 700;

    const onMove = (ev: PointerEvent) => {
      const h = Math.max(180, Math.min(startH + (startY - ev.clientY), maxH)); // drag up => taller
      this.ivDockH.set(Math.round(h));
    };
    const onUp = () => this.endToolResize();
    this.dockResizeCleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  }

  private endToolResize() {
    this.dockResizeCleanup?.();
    this.dockResizeCleanup = undefined;
    try { localStorage.setItem('zoomy.ivDockH', String(this.ivDockH())); } catch { /* ignore */ }
  }

  openRoomSettings() { if (this.role === 'host') this.settingsOpen.set(true); }

  applyRoomSettings(s: RoomSettings) {
    const m = this.meeting();
    if (m) saveRoomSettings(m.id, s);
    this.tools.set(s);
    // Close any open tool that just got disabled.
    const cur = this.ivTool();
    if (cur && !s[cur]) this.ivTool.set(null);
    this.settingsOpen.set(false);
    // Push the new tool availability to every participant in real time.
    this.room.sendControl('room-settings', 'ALL', true, JSON.stringify(s));
  }

  /** Host toggles whether the candidate may use the AI assistant. */
  onAiToggle(allowed: boolean) {
    this.aiAllowed.set(allowed);
    this.room.sendControl('ai-allow', 'ALL', allowed);
    this.pushToast(allowed ? 'AI enabled for candidate' : 'AI disabled for candidate', 'auto_awesome');
  }

  onSendMessage(text: string) {
    this.room.sendChat(text);
  }

  onHostCommand(c: HostCommand) {
    const candidate = this.participants().find(p => !p.isHost);
    const target = candidate?.id ?? 'ALL';
    switch (c.kind) {
      case 'cam-off':
        this.hostState.camOff = !this.hostState.camOff;
        this.room.sendControl('cam-off', target, this.hostState.camOff);
        break;
      case 'lock-chat':
        this.hostState.chatLocked = !this.hostState.chatLocked;
        this.chatLocked.set(this.hostState.chatLocked);
        this.room.sendControl('chat-lock', 'ALL', this.hostState.chatLocked);
        break;
      case 'force-fullscreen':
        this.room.sendControl('fullscreen', target, true);
        this.pushToast('Asked candidate to enter fullscreen', 'fullscreen');
        break;
      case 'end': this.endForAll(); break;
      case 'gaze-toggle': this.gazeOn.set(!!c.value); break;
      case 'env-scan-toggle': this.envScanOn.set(!!c.value); break;
      case 'env-scan-now': this.runEnvScan(); break;
    }
  }

  /**
   * Trigger a REAL environment scan on the candidate's Safe Agent (over gRPC):
   * the host control 'rescan' reaches the desktop agent, which scans for hidden
   * overlays / cheat processes / virtual cams and reports a clean/detected
   * result back into the proctor feed.
   */
  private runEnvScan() {
    this.scanStatus.set('scanning');
    this.room.sendControl('rescan', 'ALL', true);
    // If no agent answers (e.g. dev bypass, agent closed), don't spin forever.
    setTimeout(() => { if (this.scanStatus() === 'scanning') this.scanStatus.set('idle'); }, 10_000);
  }

  /**
   * Candidate-side watchdog: while in an interview, confirm the Safe Agent stays
   * connected. If it drops, show a persistent reconnect banner (the interviewer
   * is notified separately by the backend). The meeting itself keeps running.
   */
  private startAgentWatch() {
    const id = this.meeting()?.id;
    if (!id) return;
    const startedAt = Date.now();
    const GRACE_MS = 12_000;   // let the agent (re)connect on first load before we nag

    const tick = async () => {
      // The agent's loopback /status is the authoritative, INSTANT signal:
      //   running   = the desktop app is open
      //   connected = it has a live gRPC proctoring session with the backend
      // It flips the moment the candidate closes or loses the agent and, unlike
      // the backend check, isn't subject to a stale window or user-id keying.
      const local = await this.safeAgent.status();
      const running = !!local?.running;
      const connected = !!local?.connected;

      // Tell the interviewer about real protection-state changes (covers the
      // "never connected" and "dropped" cases without relying on the gRPC
      // stream-close timing on the backend).
      this.broadcastAgentState(running && connected);

      if (running && connected) {
        this.agentEverConnected = true;
        this.agentFailTicks = 0;
        if (this.agentReconnectNeeded()) {
          this.agentReconnectNeeded.set(false);
          this.agentClosed.set(false);
          this.pushToast('Safe Agent reconnected — you are protected', 'verified_user');
        }
        return;
      }

      // Agent is OPEN but not connected (e.g. its 15-min token expired): try to
      // self-heal silently with a freshly-minted token before nagging the user.
      if (running && this.agentEverConnected && Date.now() - this.agentAutoReconnectAt > 15_000) {
        this.agentAutoReconnectAt = Date.now();
        void this.reconnectAgent(true);
      }

      // Not protected. Stay quiet during the initial grace window (so we don't
      // flash a banner while the agent is still connecting) UNLESS we had already
      // confirmed it once — then the drop is real and we surface it immediately.
      if (!this.agentEverConnected && Date.now() - startedAt < GRACE_MS) return;

      this.agentClosed.set(!running);   // app closed vs. running-but-disconnected
      this.agentFailTicks++;
      // Closed app → flag at once; a transient blip while running → tolerate one tick.
      if (!running || this.agentFailTicks >= 2) this.flagAgentDrop();
    };
    void tick();
    this.agentWatch = setInterval(tick, 4000);
  }

  /** Notify the interviewer (once per change) of the candidate's proctor state. */
  private broadcastAgentState(protectedNow: boolean) {
    if (this.agentBroadcastState === protectedNow) return;
    const name = this.auth.user()?.name || 'Candidate';
    const sent = this.room.sendProctor({
      fromName: name,
      source: 'SAFE_BROWSER',
      kind: protectedNow ? 'AGENT_CONNECTED' : 'AGENT_DISCONNECTED',
      severity: protectedNow ? 'INFO' : 'CRITICAL',
      message: protectedNow
        ? 'Safe Agent connected — anti-cheat monitoring is active.'
        : 'Safe Agent is not connected — anti-cheat monitoring is paused.'
    });
    // Only latch the state once it actually reached the room, so a not-yet-ready
    // STOMP connection on the first tick retries instead of silently swallowing it.
    if (sent) this.agentBroadcastState = protectedNow;
  }

  /** Raise the persistent "reopen your proctor" banner once (with a toast). */
  private flagAgentDrop() {
    if (this.agentReconnectNeeded()) return;
    this.agentReconnectNeeded.set(true);
    this.pushToast(
      this.agentClosed()
        ? 'Your Safe Agent was closed — reopen it to stay compliant'
        : 'Your Safe Agent disconnected — reconnect to stay compliant',
      'gpp_maybe');
  }

  /**
   * Candidate clicks "Reconnect" in the disconnect banner: re-hand the current
   * session to the locally-running Safe Agent so it rejoins this same meeting.
   * The stored access token is almost always expired by now (15-min TTL), so we
   * mint a FRESH one with the refresh token first — otherwise the agent's gRPC
   * Connect is rejected with "Invalid or expired token". `silent` is used by the
   * watchdog's auto-heal so it doesn't pop toasts on every attempt.
   */
  async reconnectAgent(silent = false) {
    const id = this.meeting()?.id;
    if (!id) return;
    if (this.agentReconnecting()) return;
    this.agentReconnecting.set(true);
    try {
      let token = this.auth.accessToken();
      try {
        token = await this.auth.refresh();    // 7-day refresh token → fresh 15-min access token
      } catch {
        // keep the current token; if it's also expired the handshake will report it
      }
      if (!token) {
        if (!silent) this.pushToast('Please sign in again to reconnect', 'gpp_maybe');
        return;
      }
      const res = await this.safeAgent.handshake(token, id, this.auth.user()?.name);
      if (res.ok) {
        this.agentReconnectNeeded.set(false);
        this.agentClosed.set(false);
        this.agentFailTicks = 0;
        this.agentEverConnected = true;
        if (!silent) this.pushToast('Safe Agent reconnected', 'verified_user');
      } else if (!silent) {
        this.pushToast(res.error || 'Could not reconnect the Safe Agent', 'gpp_maybe');
      }
    } catch {
      if (!silent) this.pushToast('Safe Agent not found — please reopen the desktop app', 'gpp_maybe');
    } finally {
      this.agentReconnecting.set(false);
    }
  }

  onHostControl(c: HostControl) {
    switch (c.kind) {
      case 'mute-all': this.muteAll(); break;
      case 'lock-chat':
        this.hostState.chatLocked = !this.hostState.chatLocked;
        this.chatLocked.set(this.hostState.chatLocked);
        this.room.sendControl('chat-lock', 'ALL', this.hostState.chatLocked);
        break;
      case 'force-fullscreen':
        this.room.sendControl('fullscreen', 'ALL', true);
        document.documentElement.requestFullscreen?.().catch(() => {});
        break;
      case 'end': this.endForAll(); break;
    }
  }

  /**
   * Mute-all toggle (host): if any other participant is still unlocked, force
   * mute + lock everyone; if all are already locked, release everyone. A locked
   * participant cannot un-mute themselves until the host unlocks.
   */
  private muteAll() {
    const others = this.participants().filter(p => p.id !== this.selfId);
    if (others.length === 0) return;
    const allLocked = others.every(p => this.lockedMics().includes(p.id));
    if (allLocked) {
      this.lockedMics.set([]);
      this.room.sendControl('mute', 'ALL', false);
      this.hostState.muted = false;
      this.pushToast('Unlocked everyone’s mic', 'mic');
    } else {
      this.lockedMics.set(others.map(p => p.id));
      this.room.sendControl('mute', 'ALL', true);
      this.hostState.muted = true;
      this.pushToast('Muted everyone', 'mic_off');
    }
  }

  /** Toggle force-mute + lock for a single participant (host). */
  private muteParticipant(pid: string) {
    if (this.lockedMics().includes(pid)) {
      this.lockedMics.update(a => a.filter(x => x !== pid));
      this.room.sendControl('mute', pid, false);
    } else {
      this.lockedMics.update(a => [...a, pid]);
      this.room.sendControl('mute', pid, true);
    }
  }

  onParticipantAction(a: ParticipantAction) {
    if (a.kind === 'mute') {
      this.muteParticipant(a.participantId);
    } else if (a.kind === 'cam-off') {
      const camOff = !this.participants().find(p => p.id === a.participantId)?.camOff;
      this.room.sendControl('cam-off', a.participantId, camOff);
      this.participants.update(arr => arr.map(p => p.id === a.participantId ? { ...p, camOff } : p));
      this.tiles.update(arr => arr.map(t => t.id === a.participantId ? { ...t, camOff } : t));
    } else if (a.kind === 'pin') {
      this.setPin(this.pinnedId === a.participantId ? null : a.participantId);
    } else if (a.kind === 'remove') {
      this.room.sendControl('remove', a.participantId, true);
      this.lockedMics.update(arr => arr.filter(x => x !== a.participantId));
      this.tiles.update(arr => arr.filter(t => t.id !== a.participantId));
      this.participants.update(arr => arr.filter(p => p.id !== a.participantId));
    }
  }

  /** Host ends the meeting for everyone. */
  private endForAll() {
    this.room.sendControl('end', 'ALL', true);
    this.leave();
  }

  /**
   * Apply a host control command on this participant. Commands are addressed to
   * a specific participantId or 'ALL'; we ignore our own broadcasts. Forced mic
   * and camera only go OFF (a host can mute you but not un-mute you).
   */
  private applyControl(c: RoomControlEvent) {
    if (c.from === this.selfId) return;                        // skip our own broadcasts
    if (c.target !== 'ALL' && c.target !== this.selfId) return;

    switch (c.kind) {
      case 'mute':
        if (c.value) {
          // Host muted this participant and locked their mic button.
          if (this.micOn()) void this.forceMuteSelf();
          this.micLocked.set(true);
          this.pushToast('You were muted by the host', 'mic_off');
        } else {
          // Host released the lock — the participant may unmute again.
          this.micLocked.set(false);
          this.pushToast('The host unlocked your mic', 'mic');
        }
        break;
      case 'cam-off':
        if (c.value && this.camOn()) { void this.toggleCam(); this.pushToast('Host turned off your camera', 'videocam_off'); }
        break;
      case 'chat-lock':
        this.chatLocked.set(c.value);
        this.pushToast(c.value ? 'Chat was locked by the host' : 'Chat unlocked', 'forum');
        break;
      case 'fullscreen':
        if (c.value) document.documentElement.requestFullscreen?.().catch(() => {});
        break;
      case 'ai-allow':
        this.aiAllowed.set(c.value);
        this.pushToast(c.value ? 'AI assistant enabled by the host' : 'AI assistant disabled', 'auto_awesome');
        break;
      case 'room-settings':
        if (c.json) {
          try {
            this.tools.set(JSON.parse(c.json));
            const cur = this.ivTool();
            if (cur && !this.tools()[cur]) this.ivTool.set(null);
            this.pushToast('Room tools updated by the host', 'tune');
          } catch { /* ignore malformed settings */ }
        }
        break;
      case 'remove':
        this.pushToast('You were removed from the meeting', 'logout');
        setTimeout(() => this.leave(), 700);
        break;
      case 'end':
        this.pushToast('The host ended the meeting', 'call_end');
        setTimeout(() => this.leave(), 700);
        break;
    }
  }

  leave() {
    this.stopGaze();
    this.room.leave();
    this.stream?.getTracks().forEach(t => t.stop());
    this.router.navigate(['/home']);
  }
}
