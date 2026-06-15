import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MIconComponent } from '../../../shared/ui/m-icon.component';
import { MButtonComponent } from '../../../shared/ui/m-button.component';
import { MAvatarComponent } from '../../../shared/ui/m-avatar.component';
import { ProctorEvent } from '../../../proctor/proctor-event.model';

export interface HostCommand {
  kind:
    | 'mute' | 'cam-off' | 'lock-chat' | 'force-fullscreen' | 'end'
    | 'gaze-toggle' | 'env-scan-toggle' | 'env-scan-now';
  value?: boolean;
}

@Component({
  selector: 'iv-admin-panel',
  standalone: true,
  imports: [CommonModule, MIconComponent, MButtonComponent, MAvatarComponent],
  template: `
    <div class="admin">
      <section class="block">
        <h4>Candidate</h4>
        <div class="cand">
          <m-avatar [name]="candidateName" [size]="40" />
          <div class="info">
            <div class="n">{{ candidateName }}</div>
            <div class="d">
              <span class="dot" [class.ok]="connected" [class.bad]="!connected"></span>
              {{ connected ? 'Connected' : 'Offline' }}
            </div>
          </div>
        </div>
      </section>

      <!-- Proctoring — the core of interview mode. -->
      <section class="block proctor">
        <div class="row">
          <h4>Proctoring</h4>
          <span class="live" *ngIf="gazeOn || envScanOn">
            <span class="lv-dot"></span> LIVE
          </span>
        </div>

        <!-- Desktop proctor-agent connection status (persistent). -->
        <div class="agent-stat"
             [class.ok]="agentConnected === true"
             [class.bad]="agentConnected === false"
             [class.wait]="agentConnected === null">
          <m-icon [name]="agentStatIcon" [size]="18" />
          <div class="as-text">
            <div class="as-t">Proctor agent</div>
            <div class="as-d">{{ agentStatText }}</div>
          </div>
        </div>

        <!-- Gaze toggle + live eye-direction readout -->
        <div class="pcard">
          <div class="pc-head">
            <m-icon [name]="gazeOn ? 'visibility' : 'visibility_off'" />
            <div class="pc-text">
              <div class="pc-t">Gaze tracking</div>
              <div class="pc-d">Predict where the candidate is looking.</div>
            </div>
            <button class="sw" [class.on]="gazeOn"
                    (click)="cmd('gaze-toggle', !gazeOn)"
                    [attr.aria-pressed]="gazeOn" title="Toggle gaze tracking">
              <span class="knob"></span>
            </button>
          </div>
          <div class="gaze-2d" *ngIf="gazeOn">
            <!-- 2-D gaze pad: dot moves horizontally (L/R) and vertically (U/D). -->
            <div class="gp-pad">
              <div class="gp-cross-h"></div>
              <div class="gp-cross-v"></div>
              <div class="gp-center" [class.ok]="isCentered"></div>
              <div class="gp-dot" [class.warn]="!isCentered"
                   [style.left.%]="gazePct" [style.top.%]="gazeVPct"></div>
              <span class="gp-edge t">Up</span>
              <span class="gp-edge b">Down</span>
              <span class="gp-edge l">L</span>
              <span class="gp-edge r">R</span>
            </div>
            <div class="gp-readout" [class.warn]="!isCentered">
              <m-icon [name]="gazeIcon" [size]="16" />
              <span>{{ gazeText }}</span>
            </div>
          </div>
        </div>

        <!-- Environment / hidden overlay scan -->
        <div class="pcard">
          <div class="pc-head">
            <m-icon [name]="envScanOn ? 'shield' : 'gpp_maybe'" />
            <div class="pc-text">
              <div class="pc-t">Environment scan</div>
              <div class="pc-d">Detect hidden overlays, cheat windows, virtual cams.</div>
            </div>
            <button class="sw" [class.on]="envScanOn"
                    (click)="cmd('env-scan-toggle', !envScanOn)"
                    [attr.aria-pressed]="envScanOn" title="Toggle environment scan">
              <span class="knob"></span>
            </button>
          </div>
          <button class="scan-now" (click)="cmd('env-scan-now', true)" [disabled]="!envScanOn">
            <m-icon name="radar" [size]="16" /> Scan environment now
          </button>
          <div class="scan-result" *ngIf="scanStatus !== 'idle'"
               [class.clean]="scanStatus === 'clean'" [class.bad]="scanStatus === 'detected'">
            <m-icon [name]="scanIcon" [size]="16" />
            <span>{{ scanText }}</span>
          </div>
        </div>
      </section>

      <section class="block">
        <h4>Controls</h4>
        <div class="ctrl-grid">
          <button class="ctrl" [class.on]="chatLocked" (click)="cmd('lock-chat')">
            <m-icon name="forum" />
            <span>{{ chatLocked ? 'Unlock chat' : 'Lock chat' }}</span>
          </button>
          <button class="ctrl" (click)="cmd('force-fullscreen')">
            <m-icon name="fullscreen" />
            <span>Force fullscreen</span>
          </button>
        </div>
        <p class="ctrl-hint">Use the People panel’s “Mute all” to mute &amp; lock mics.</p>
        <button m-button variant="danger" class="end" icon="call_end" (click)="cmd('end')">
          End interview
        </button>
      </section>

      <section class="block">
        <div class="row">
          <h4>Proctor signals</h4>
          <span class="count" *ngIf="alerts.length">{{ alerts.length }}</span>
        </div>
        <div class="alerts">
          <div class="empty" *ngIf="alerts.length === 0">
            <m-icon name="check_circle" [size]="20" />
            No suspicious activity yet.
          </div>
          <div class="alert" *ngFor="let a of alerts" [class]="a.severity">
            <m-icon [name]="iconFor(a.kind)" [size]="18" />
            <div class="alert-body">
              <div class="k">{{ pretty(a.kind) }}</div>
              <div class="m">{{ a.message }}</div>
            </div>
            <div class="t">{{ ago(a.occurredAt) }}</div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .admin { display: flex; flex-direction: column; gap: 16px; }
    .block h4 {
      margin: 0; font-family: var(--m-font); font-size: 12px; font-weight: 500;
      color: var(--m-text-muted); text-transform: uppercase; letter-spacing: .5px;
    }
    .block > h4 { margin-bottom: 12px; }
    .cand { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 12px; background: var(--m-surface-2); }
    .info .n { font-weight: 500; }
    .info .d { font-size: 12px; color: var(--m-text-muted); display: flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--m-text-muted); }
    .dot.ok { background: var(--m-success); }
    .dot.bad { background: var(--m-danger); }

    /* Proctor block */
    .proctor { display: flex; flex-direction: column; gap: 10px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .live { display: inline-flex; align-items: center; gap: 6px;
            font-size: 10px; font-weight: 600; letter-spacing: .6px;
            color: var(--m-danger); margin-left: auto; }

    /* Desktop proctor-agent status banner */
    .agent-stat {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: 12px; border: 1px solid var(--m-divider);
      background: var(--m-surface-2);
    }
    .agent-stat > m-icon { flex: 0 0 auto; }
    .agent-stat .as-text { flex: 1 1 auto; min-width: 0; }
    .agent-stat .as-t { font-size: 13px; font-weight: 600; color: var(--m-text); }
    .agent-stat .as-d { font-size: 11px; color: var(--m-text-muted); margin-top: 2px;
                        overflow-wrap: anywhere; }
    .agent-stat.ok   { background: rgba(52,168,83,.14); border-color: rgba(52,168,83,.35); }
    .agent-stat.ok   > m-icon { color: var(--m-success); }
    .agent-stat.bad  { background: rgba(217,48,37,.16); border-color: rgba(217,48,37,.4); }
    .agent-stat.bad  > m-icon { color: var(--m-danger); }
    .agent-stat.bad .as-t { color: var(--m-danger); }
    .agent-stat.wait > m-icon { color: var(--m-text-muted); }
    .lv-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--m-danger);
              animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: .35; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.15); } }

    .pcard {
      background: var(--m-surface-2); border-radius: 12px; padding: 10px 12px;
      display: flex; flex-direction: column; gap: 10px;
      border: 1px solid var(--m-divider);
    }
    .pc-head { display: flex; align-items: center; gap: 10px; }
    .pc-head > m-icon { color: var(--m-primary); }
    .pc-text { flex: 1; min-width: 0; }
    .pc-t { font-size: 13px; font-weight: 600; color: var(--m-text); }
    .pc-d { font-size: 11px; color: var(--m-text-muted); margin-top: 2px; }
    .sw {
      width: 36px; height: 20px; border-radius: 999px; border: 0; cursor: pointer;
      background: var(--m-outline); position: relative; transition: background-color .15s;
      flex: 0 0 auto;
    }
    .sw .knob {
      position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
      background: #fff; transition: transform .15s;
    }
    .sw.on { background: var(--m-primary); }
    .sw.on .knob { transform: translateX(16px); }

    .gaze-2d { display: flex; align-items: center; gap: 12px; }
    .gp-pad {
      position: relative; width: 92px; height: 70px; flex: 0 0 auto;
      background: var(--m-elevated); border-radius: 10px; overflow: hidden;
      border: 1px solid var(--m-divider);
    }
    .gp-cross-h { position: absolute; left: 6px; right: 6px; top: 50%; height: 1px; background: var(--m-outline); opacity: .5; }
    .gp-cross-v { position: absolute; top: 6px; bottom: 6px; left: 50%; width: 1px; background: var(--m-outline); opacity: .5; }
    .gp-center {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 34px; height: 26px; border-radius: 7px;
      border: 1px dashed var(--m-outline); transition: border-color .15s;
    }
    .gp-center.ok { border-color: var(--m-success); }
    .gp-dot {
      position: absolute; transform: translate(-50%, -50%);
      width: 12px; height: 12px; border-radius: 50%;
      background: var(--m-success); box-shadow: 0 0 0 2px var(--m-surface);
      transition: left .2s ease-out, top .2s ease-out, background-color .15s;
    }
    .gp-dot.warn { background: var(--m-danger); }
    .gp-edge { position: absolute; font-size: 9px; color: var(--m-text-muted); }
    .gp-edge.t { top: 2px; left: 50%; transform: translateX(-50%); }
    .gp-edge.b { bottom: 2px; left: 50%; transform: translateX(-50%); }
    .gp-edge.l { left: 3px; top: 50%; transform: translateY(-50%); }
    .gp-edge.r { right: 3px; top: 50%; transform: translateY(-50%); }
    .gp-readout {
      flex: 1; display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600; color: var(--m-success);
    }
    .gp-readout.warn { color: var(--m-danger); }
    .gp-readout m-icon { color: inherit; }

    .scan-now {
      align-self: stretch; display: inline-flex; align-items: center; justify-content: center;
      gap: 6px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--m-divider);
      background: var(--m-surface); color: var(--m-text); cursor: pointer; font-size: 12px;
      transition: background-color .15s;
    }
    .scan-now:hover:not([disabled]) { background: var(--m-elevated); }    .scan-now[disabled] { opacity: .45; cursor: not-allowed; }
    .scan-result {
      display: flex; align-items: center; gap: 8px; margin-top: 8px;
      padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
      background: var(--m-surface-2); color: var(--m-text-muted);
    }
    .scan-result.clean { background: rgba(52,168,83,.14); color: var(--m-success); }
    .scan-result.bad { background: rgba(217,48,37,.14); color: var(--m-danger); }

    .ctrl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
    .ctrl {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 8px; border: 0; background: var(--m-surface-2);
      color: var(--m-text); border-radius: 12px; cursor: pointer; font-size: 12px;
      transition: background-color .15s;
    }
    .ctrl:hover { background: var(--m-elevated); }
    .ctrl.on { background: var(--m-primary); color: var(--m-primary-ink); }
    .end { width: 100%; justify-content: center; }
    .ctrl-hint { font-size: 11px; color: var(--m-text-muted); margin: 0 0 12px; }

    .count {
      background: var(--m-danger); color: white; font-size: 11px;
      padding: 2px 8px; border-radius: 10px; font-weight: 500;
    }
    .alerts { display: flex; flex-direction: column; gap: 6px; max-height: 360px; overflow-y: auto; }
    .empty { display: flex; align-items: center; gap: 8px; color: var(--m-text-muted); padding: 12px; }
    .empty m-icon { color: var(--m-success); }
    .alert {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
      border-radius: 10px; background: var(--m-surface-2); font-size: 13px;
    }
    .alert.WARN { background: rgba(251,188,4,.12); }
    .alert.CRITICAL { background: rgba(234,67,53,.16); }
    .alert > m-icon { flex: 0 0 auto; }
    .alert-body { flex: 1 1 auto; min-width: 0; }
    .k { font-weight: 500; overflow-wrap: anywhere; }
    .m {
      color: var(--m-text-muted); font-size: 12px; margin-top: 2px;
      overflow-wrap: anywhere; word-break: break-word;
    }
    .t { color: var(--m-text-muted); font-size: 11px; flex: 0 0 auto; white-space: nowrap; }
  `]
})
export class InterviewAdminPanel implements OnDestroy {
  @Input() candidateName = 'Candidate';
  @Input() connected = true;
  @Input() muted = false;
  @Input() camOff = false;
  @Input() chatLocked = false;
  @Input() alerts: ProctorEvent[] = [];
  /** Candidate's desktop proctor agent: true=connected, false=down, null=unknown. */
  @Input() agentConnected: boolean | null = null;
  /** Proctor toggles (controlled by parent so state survives panel re-mounts). */
  @Input() gazeOn = true;
  @Input() envScanOn = true;

  /** Live environment-scan result: idle | scanning | clean | detected. */
  @Input() scanStatus: 'idle' | 'scanning' | 'clean' | 'detected' = 'idle';

  /** Live gaze readout fed by the parent from the candidate's real telemetry. */
  @Input() gazePct = 50;                                  // 0-100 across (L→R)
  @Input() gazeLabel: 'Left' | 'Center' | 'Right' = 'Center';
  @Input() gazeVPct = 50;                                 // 0-100 down (Up→Down)
  @Input() gazeVLabel: 'Up' | 'Center' | 'Down' = 'Center';

  @Output() command = new EventEmitter<HostCommand>();

  ngOnDestroy() { /* no local timers — readout is parent-driven */ }

  /** True when the candidate is looking at the screen (both axes centred). */
  get isCentered(): boolean {
    return this.gazeLabel === 'Center' && this.gazeVLabel === 'Center';
  }

  /** Combined direction text for the readout. */
  get gazeText(): string {
    if (this.isCentered) return 'On screen';
    const parts: string[] = [];
    if (this.gazeVLabel !== 'Center') parts.push(this.gazeVLabel);
    if (this.gazeLabel !== 'Center') parts.push(this.gazeLabel);
    return parts.join(' · ') || 'On screen';
  }

  /** Directional icon for the readout. */
  get gazeIcon(): string {
    if (this.isCentered) return 'visibility';
    if (this.gazeVLabel === 'Down') return 'south';
    if (this.gazeVLabel === 'Up') return 'north';
    if (this.gazeLabel === 'Left') return 'west';
    if (this.gazeLabel === 'Right') return 'east';
    return 'visibility_off';
  }

  /** Icon for the environment-scan result row. */
  get scanIcon(): string {
    switch (this.scanStatus) {
      case 'scanning': return 'radar';
      case 'clean': return 'verified_user';
      case 'detected': return 'gpp_bad';
      default: return 'shield';
    }
  }

  /** Human text for the environment-scan result row. */
  get scanText(): string {
    switch (this.scanStatus) {
      case 'scanning': return 'Scanning the candidate’s system…';
      case 'clean': return 'No cheat detected';
      case 'detected': return 'Cheat detected — review alerts below';
      default: return '';
    }
  }

  cmd(k: HostCommand['kind'], value?: boolean) { this.command.emit({ kind: k, value }); }

  /** Icon for the desktop proctor-agent status row. */
  get agentStatIcon(): string {
    if (this.agentConnected === true) return 'verified_user';
    if (this.agentConnected === false) return 'gpp_bad';
    return 'hourglass_empty';
  }

  /** Human text for the desktop proctor-agent status row. */
  get agentStatText(): string {
    if (this.agentConnected === true) return 'Connected — anti-cheat monitoring active';
    if (this.agentConnected === false) return 'Not connected — candidate must open / reconnect the agent';
    return 'Waiting for the candidate’s proctor agent…';
  }

  pretty(k: string) { return k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

  iconFor(k: string): string {
    const map: Record<string, string> = {
      GAZE_OFF_SCREEN: 'visibility_off', MULTIPLE_FACES: 'group',
      NO_FACE: 'face', TAB_BLUR: 'tab_unselected', WINDOW_BLUR: 'desktop_windows',
      PASTE_DETECTED: 'content_paste', DEVTOOLS_OPEN: 'developer_mode',
      HIDDEN_OVERLAY_WINDOW: 'visibility_off', BLOCKLISTED_PROCESS: 'block',
      MULTIPLE_MONITORS: 'monitor', VIRTUAL_CAMERA: 'photo_camera',
      SAFE_BROWSER_TAMPERED: 'gpp_bad',
      CHEAT_TOOL: 'block', CLICKTHROUGH_OVERLAY: 'layers', STEALTH_OVERLAY: 'visibility_off',
      AGENT_DISCONNECTED: 'gpp_bad', AGENT_CONNECTED: 'verified_user'
    };
    return map[k] || 'warning';
  }

  ago(iso?: string) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return Math.max(1, Math.floor(diff)) + 's';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    return Math.floor(diff / 3600) + 'h';
  }
}
