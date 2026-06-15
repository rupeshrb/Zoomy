import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MIconComponent } from '../../../shared/ui/m-icon.component';
import { MAvatarComponent } from '../../../shared/ui/m-avatar.component';
import { MButtonComponent } from '../../../shared/ui/m-button.component';
import { AiChatComponent } from '../tools/ai-chat.component';

export interface Participant { id: string; name: string; isHost: boolean; muted: boolean; camOff: boolean; }
export interface ChatMessage { from: string; text: string; at: string; mine?: boolean; }

export type DrawerTab = 'people' | 'chat' | 'activities' | 'interview' | 'info' | 'ai';
export type DrawerTool = 'whiteboard' | 'notepad' | 'code';
export interface HostControl {
  kind: 'mute-all' | 'lock-chat' | 'force-fullscreen' | 'end';
}
export interface ParticipantAction {
  kind: 'mute' | 'cam-off' | 'pin' | 'remove' | 'make-host';
  participantId: string;
}

@Component({
  selector: 'meeting-side-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, MIconComponent, MAvatarComponent, MButtonComponent, AiChatComponent],
  template: `
    <aside class="drawer" *ngIf="tab" [@.disabled]="false"
           [style.width.px]="drawerWidth">
      <!-- Drag this left edge to widen the panel (up to 30% wider). -->
      <div class="drawer-resize" (pointerdown)="startResize($event)"
           (dblclick)="resetWidth()" title="Drag to resize"></div>
      <header>
        <h3>{{ titleFor(tab) }}</h3>
        <button class="x" (click)="close.emit()" title="Close">
          <m-icon name="close" />
        </button>
      </header>

      <ng-container [ngSwitch]="tab">
        <section *ngSwitchCase="'people'" class="body">
          <div class="ppl-head">
            <button m-button variant="tonal" size="sm">
              <m-icon name="person_add" [size]="18" /> Add people
            </button>
            <button m-button variant="text" size="sm" *ngIf="isHost" (click)="hostControl.emit({ kind: 'mute-all' })">
              <m-icon [name]="allLocked ? 'mic' : 'mic_off'" [size]="18" /> {{ allLocked ? 'Unmute all' : 'Mute all' }}
            </button>
          </div>
          <div class="ppl">
            <div class="ppl-row" *ngFor="let p of participants">
              <m-avatar [name]="p.name" [size]="36" />
              <div class="ppl-info">
                <div class="n">{{ p.name }} <span class="you" *ngIf="p.id === selfId">(you)</span></div>
                <div class="d">
                  <span class="role-pill" [class.host]="p.isHost">{{ p.isHost ? 'Host' : 'Participant' }}</span>
                  <m-icon [name]="p.muted ? 'mic_off' : 'mic'" [size]="14" [class.dim]="!p.muted" [class.warn]="p.muted" />
                  <m-icon [name]="p.camOff ? 'videocam_off' : 'videocam'" [size]="14" [class.dim]="!p.camOff" [class.warn]="p.camOff" />
                </div>
              </div>
              <div class="ppl-actions" *ngIf="isHost && p.id !== selfId">
                <button class="pa" [class.locked]="isLocked(p.id)"
                        title="{{ isLocked(p.id) ? 'Unmute (locked)' : 'Mute' }}"
                        (click)="participantAction.emit({ kind: 'mute', participantId: p.id })">
                  <m-icon [name]="isLocked(p.id) ? 'mic_off' : 'mic'" [size]="18" />
                </button>
                <button class="pa" title="{{ p.camOff ? 'Enable cam' : 'Disable cam' }}" (click)="participantAction.emit({ kind: 'cam-off', participantId: p.id })">
                  <m-icon [name]="p.camOff ? 'videocam_off' : 'videocam'" [size]="18" />
                </button>
                <button class="pa" title="Pin" (click)="participantAction.emit({ kind: 'pin', participantId: p.id })">
                  <m-icon name="push_pin" [size]="18" />
                </button>
                <button class="pa danger" title="Remove" (click)="participantAction.emit({ kind: 'remove', participantId: p.id })">
                  <m-icon name="person_remove" [size]="18" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section *ngSwitchCase="'chat'" class="body chat">
          <div class="msgs">
            <div *ngIf="messages.length === 0" class="empty">
              <m-icon name="lock" [size]="20" />
              Messages are visible only to people in the call.
            </div>
            <div class="msg" *ngFor="let m of messages" [class.mine]="m.mine">
              <div class="meta"><strong>{{ m.from }}</strong><span>{{ m.at }}</span></div>
              <div class="bubble">{{ m.text }}</div>
            </div>
          </div>
          <form class="composer" (ngSubmit)="onSend()">
            <input [(ngModel)]="draft" name="msg"
                   [placeholder]="chatLocked && !isHost ? 'Chat is locked by the host' : 'Send a message to everyone'"
                   [disabled]="chatLocked && !isHost" autocomplete="off" />
            <button type="button" class="emoji" title="Emoji"><m-icon name="add_reaction" /></button>
            <button type="submit" class="send" [class.ready]="!!draft.trim()"
                    [disabled]="!draft.trim() || (chatLocked && !isHost)">
              <m-icon name="send" />
            </button>
          </form>
        </section>

        <section *ngSwitchCase="'info'" class="body">
          <p class="lbl">Meeting code</p>
          <div class="code-row">
            <span class="m-mono">{{ meetingCode }}</span>
            <button m-button variant="text" size="sm" (click)="copyLink()">Copy</button>
          </div>
          <p class="hint">Share this code with anyone you want to invite.</p>

          <ng-container *ngIf="meetingPassword">
            <p class="lbl" style="margin-top:18px">Meeting password</p>
            <div class="code-row">
              <span class="m-mono">{{ showPassword ? meetingPassword : '••••••••' }}</span>
              <button m-button variant="text" size="sm" (click)="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button>
              <button m-button variant="text" size="sm" (click)="copyPassword()">{{ pwCopied ? 'Copied' : 'Copy' }}</button>
            </div>
            <p class="hint">This meeting is password protected. Share the password only with invited participants.</p>
          </ng-container>
        </section>

        <section *ngSwitchCase="'activities'" class="body activities">
          <p class="lbl">Collaboration tools</p>
          <div class="tool-grid">
            <button class="tool board" *ngIf="tools.whiteboard" (click)="launchTool.emit('whiteboard')">
              <m-icon name="brush" [size]="28" />
              <div class="t">Whiteboard</div>
              <div class="d">Sketch ideas together</div>
            </button>
            <button class="tool note" *ngIf="tools.notepad" (click)="launchTool.emit('notepad')">
              <m-icon name="sticky_note_2" [size]="28" />
              <div class="t">Notepad</div>
              <div class="d">{{ isInterview ? 'Shared with interviewer' : 'Private to you' }}</div>
            </button>
            <button class="tool code" *ngIf="tools.code" (click)="launchTool.emit('code')">
              <m-icon name="code" [size]="28" />
              <div class="t">Code IDE</div>
              <div class="d">Live coding (JS, Py, Java)</div>
            </button>
            <p class="empty-tools" *ngIf="!tools.whiteboard && !tools.notepad && !tools.code">
              The host has disabled collaboration tools for this meeting.
            </p>
            <button class="tool engage" disabled>
              <m-icon name="quiz" [size]="28" />
              <div class="t">Polls &amp; Q&amp;A</div>
              <div class="d">Coming soon</div>
            </button>
          </div>

          <ng-container *ngIf="isHost">
            <p class="lbl mt">Candidate / participant controls</p>
            <div class="cand-controls">
              <button class="cc" [class.on]="hostState.chatLocked" (click)="hostControl.emit({ kind: 'lock-chat' })">
                <m-icon name="forum" />
                <span>{{ hostState.chatLocked ? 'Unlock chat' : 'Lock chat' }}</span>
              </button>
              <button class="cc" (click)="hostControl.emit({ kind: 'force-fullscreen' })">
                <m-icon name="fullscreen" />
                <span>Force fullscreen</span>
              </button>
              <button class="cc danger" (click)="hostControl.emit({ kind: 'end' })">
                <m-icon name="call_end" />
                <span>End for all</span>
              </button>
            </div>
          </ng-container>
        </section>

        <section *ngSwitchCase="'interview'" class="body">
          <ng-content select="[drawer-interview]"></ng-content>
        </section>

        <section *ngSwitchCase="'ai'" class="body ai-body">
          <div class="ai-host-toggle" *ngIf="isInterview && isHost">
            <div class="aht-text">
              <div class="aht-t">Allow candidate to use AI assistant</div>
              <div class="aht-d">When off, only you (the interviewer) can see this tab.</div>
            </div>
            <button class="sw" [class.on]="aiEnabled" (click)="aiToggle.emit(!aiEnabled)"
                    [attr.aria-pressed]="aiEnabled" title="Toggle AI for candidate">
              <span class="knob"></span>
            </button>
          </div>
          <iv-ai-chat class="ai-pane" />
        </section>
      </ng-container>
    </aside>
  `,
  styles: [`
    :host { display: contents; }
    .drawer {
      width: var(--m-drawer-w);
      background: var(--m-surface); color: var(--m-text);
      border-radius: 16px; margin: 8px 8px 8px 0;
      display: flex; flex-direction: column;
      overflow: hidden; box-shadow: var(--m-e2);
      border: 1px solid var(--m-divider);
      position: relative;
    }
    /* Left-edge grab handle to widen the panel (up to 30% wider). */
    .drawer-resize {
      position: absolute; top: 0; left: -3px; bottom: 0; width: 10px;
      cursor: ew-resize; z-index: 5; touch-action: none;
    }
    .drawer-resize::before {
      content: ''; position: absolute; top: 50%; left: 3px; transform: translateY(-50%);
      width: 4px; height: 44px; border-radius: 999px;
      background: var(--m-outline); opacity: 0; transition: opacity .15s, background-color .15s;
    }
    .drawer-resize:hover::before { opacity: 1; background: var(--m-primary-700); }
    header { display: flex; align-items: center; padding: 12px 8px 12px 20px; gap: 8px; border-bottom: 1px solid var(--m-divider); }
    h3 { flex: 1; margin: 0; font-family: var(--m-font); font-weight: 600; font-size: 16px; letter-spacing: -.2px; }
    .x {
      width: 40px; height: 40px; border-radius: 50%; border: 0;
      background: transparent; color: var(--m-text); cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .x:hover { background: var(--m-surface-2); }
    .body { flex: 1; padding: 12px 14px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }

    .ppl-head { display: flex; align-items: center; gap: 6px; padding: 0 0 6px; }
    .ppl-row {
      display: flex; align-items: center; gap: 12px; padding: 8px;
      border-radius: 12px; transition: background-color .15s;
    }
    .ppl-row:hover { background: var(--m-surface-2); }
    .ppl-info { flex: 1; min-width: 0; }
    .n { font-size: 14px; font-weight: 500; }
    .you { color: var(--m-text-muted); font-weight: 400; }
    .d { font-size: 12px; color: var(--m-text-muted); display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .d m-icon.dim { opacity: .5; }
    .d m-icon.warn { color: var(--m-danger); opacity: 1; }
    .role-pill {
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px;
      padding: 2px 8px; border-radius: 999px; background: var(--m-surface-2); color: var(--m-text-muted);
    }
    .role-pill.host { background: var(--m-brand-grad-soft); color: var(--m-primary-700); }
    .ppl-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
    .ppl-row:hover .ppl-actions { opacity: 1; }
    .pa {
      width: 32px; height: 32px; border-radius: 50%; border: 0;
      background: transparent; color: var(--m-text-muted); cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .pa:hover { background: var(--m-elevated); color: var(--m-text); }
    .pa.danger:hover { background: rgba(234,67,53,.14); color: var(--m-danger); }
    .pa.locked { background: rgba(234,67,53,.14); color: var(--m-danger); }

    .chat { padding: 0; gap: 0; }
    .msgs { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 14px; }
    .empty { color: var(--m-text-muted); font-size: 13px; display: flex; gap: 8px; align-items: center;
             padding: 14px; background: var(--m-surface-2); border-radius: 12px; }
    .msg { display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
    .msg.mine { align-self: flex-end; align-items: flex-end; }
    .msg .meta { display: flex; gap: 8px; font-size: 11px; color: var(--m-text-muted); padding: 0 4px; }
    .bubble {
      padding: 10px 14px; border-radius: 16px 16px 16px 4px;
      max-width: 100%; font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word;
      background: var(--m-surface-2); color: var(--m-text);
      border-left: 3px solid var(--m-accent);
    }
    .msg.mine .bubble {
      background: var(--m-brand-grad); color: #fff;
      border-radius: 16px 16px 4px 16px; border-left: 0;
      box-shadow: 0 2px 8px rgba(124,92,255,.25);
    }
    .composer {
      display: flex; align-items: center; gap: 6px;
      border-top: 1px solid var(--m-divider); padding: 10px;
      background: var(--m-surface);
    }
    .composer input {
      flex: 1; padding: 10px 16px; background: var(--m-surface-2); color: var(--m-text);
      border: 1px solid transparent; border-radius: 24px; outline: none; font-size: 14px;
      transition: border-color .15s, background-color .15s;
    }
    .composer input:focus { border-color: var(--m-primary-700); background: var(--m-surface); }
    .emoji, .send {
      width: 40px; height: 40px; border-radius: 50%; border: 0;
      background: transparent; color: var(--m-text-muted); cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .emoji:hover { background: var(--m-surface-2); color: var(--m-text); }
    .send.ready { background: var(--m-brand-grad); color: #fff; }
    .send.ready:hover { filter: brightness(1.05); }
    .send[disabled] { color: var(--m-text-muted); cursor: default; }

    .lbl { color: var(--m-text-muted); font-size: 11px; margin: 0; text-transform: uppercase; letter-spacing: .6px; font-weight: 600; }
    .lbl.mt { margin-top: 8px; }
    .code-row { display: flex; align-items: center; gap: 8px; font-size: 18px; }
    .hint { color: var(--m-text-muted); font-size: 13px; margin: 0; }

    .activities { gap: 14px; }
    .empty-tools { grid-column: 1 / -1; color: var(--m-text-muted); font-size: 13px; margin: 0; }
    .tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .tool {
      display: flex; flex-direction: column; gap: 4px;
      padding: 14px; border-radius: 14px; cursor: pointer; text-align: left;
      background: var(--m-surface-2); color: var(--m-text);
      border: 1px solid var(--m-divider);
      transition: background-color .15s, transform .04s, border-color .15s;
    }
    .tool:hover:not([disabled]) { background: var(--m-elevated); border-color: var(--m-outline); transform: translateY(-1px); }
    .tool[disabled] { opacity: .5; cursor: not-allowed; }
    .tool m-icon { color: var(--m-text); }
    .tool.board m-icon { color: var(--m-primary); }
    .tool.note m-icon { color: var(--m-warn); }
    .tool.code m-icon { color: var(--m-accent-2); }
    .tool.ai m-icon { color: var(--m-accent); }
    .tool .t { font-size: 13px; font-weight: 600; }
    .tool .d { font-size: 11px; color: var(--m-text-muted); }

    .cand-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .cc {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 8px; border: 1px solid var(--m-divider); background: var(--m-surface-2);
      color: var(--m-text); border-radius: 12px; cursor: pointer; font-size: 12px;
      transition: background-color .15s;
    }
    .cc:hover { background: var(--m-elevated); }
    .cc.on { background: var(--m-brand-grad-soft); color: var(--m-primary-700); border-color: transparent; }
    .cc.danger { color: var(--m-danger); }
    .cc.danger:hover { background: rgba(234,67,53,.14); }

    .ai-body { padding: 0; gap: 0; }
    .ai-pane { flex: 1; min-height: 0; display: block; }
    .ai-host-toggle {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; border-bottom: 1px solid var(--m-divider);
      background: var(--m-brand-grad-soft);
    }
    .aht-text { flex: 1; min-width: 0; }
    .aht-t { font-size: 12px; font-weight: 600; color: var(--m-text); }
    .aht-d { font-size: 11px; color: var(--m-text-muted); margin-top: 2px; }
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

    @media (max-width: 900px) {
      .drawer { margin: 0; border-radius: 0; height: 50vh; }
      .ppl-actions { opacity: 1; }
    }
  `]
})
export class MeetingSideDrawerComponent {
  @Input() tab: DrawerTab | null = null;
  @Input() participants: Participant[] = [];
  @Input() messages: ChatMessage[] = [];
  @Input() meetingCode = '';
  @Input() meetingPassword = '';
  @Input() selfId = '';
  @Input() isHost = false;
  @Input() isInterview = false;
  @Input() aiEnabled = true;
  @Input() tools: { whiteboard: boolean; notepad: boolean; code: boolean; ai: boolean } =
    { whiteboard: true, notepad: true, code: true, ai: true };
  @Input() hostState: { muted: boolean; camOff: boolean; chatLocked: boolean } = { muted: false, camOff: false, chatLocked: false };
  /** When true, the chat composer is disabled for this participant (host locked it). */
  @Input() chatLocked = false;
  /** Participant ids whose mics the host has force-muted + locked. */
  @Input() lockedIds: string[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() send = new EventEmitter<string>();
  @Output() launchTool = new EventEmitter<DrawerTool>();
  @Output() hostControl = new EventEmitter<HostControl>();
  @Output() participantAction = new EventEmitter<ParticipantAction>();
  @Output() aiToggle = new EventEmitter<boolean>();

  draft = '';
  showPassword = false;
  pwCopied = false;

  // ---- Drawer resize (drag the left edge to widen, up to 30% wider) ----
  private static readonly BASE_W = 320;                       // matches --m-drawer-w
  private static readonly MIN_W = 300;
  private static readonly MAX_W = Math.round(320 * 1.3);      // 416 — at most 30% wider
  /** null = use the default token width; a number = user-resized px width. */
  drawerWidth: number | null = this.loadWidth();

  private loadWidth(): number | null {
    try {
      const v = Number(localStorage.getItem('zoomy.drawerWidth'));
      if (v >= MeetingSideDrawerComponent.MIN_W && v <= MeetingSideDrawerComponent.MAX_W) return v;
    } catch { /* ignore */ }
    return null;
  }

  /** Begin dragging the left edge of the drawer to resize its width. */
  startResize(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = this.drawerWidth ?? MeetingSideDrawerComponent.BASE_W;
    const onMove = (ev: PointerEvent) => {
      // Drawer sits on the right, so dragging the handle LEFT widens it.
      const next = startW + (startX - ev.clientX);
      this.drawerWidth = Math.max(
        MeetingSideDrawerComponent.MIN_W,
        Math.min(next, MeetingSideDrawerComponent.MAX_W));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      try {
        if (this.drawerWidth != null) localStorage.setItem('zoomy.drawerWidth', String(this.drawerWidth));
      } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
  }

  /** Double-click the handle to snap back to the default width. */
  resetWidth() {
    this.drawerWidth = null;
    try { localStorage.removeItem('zoomy.drawerWidth'); } catch { /* ignore */ }
  }

  /** Whether a given participant's mic is host-locked. */
  isLocked(id: string): boolean { return this.lockedIds.includes(id); }

  /** True when every other (non-self) participant's mic is locked. */
  get allLocked(): boolean {
    const others = this.participants.filter(p => p.id !== this.selfId);
    return others.length > 0 && others.every(p => this.lockedIds.includes(p.id));
  }

  titleFor(t: DrawerTab) {
    return { people: 'People', chat: 'In-call messages', info: 'Meeting details',
             activities: 'Activities', interview: 'Interview tools', ai: 'AI assistant' }[t];
  }

  onSend() {
    if (this.chatLocked && !this.isHost) return;
    const text = this.draft.trim();
    if (!text) return;
    this.send.emit(text);
    this.draft = '';
  }

  copyLink() { navigator.clipboard?.writeText(`${location.origin}/j/${this.meetingCode}`); }

  copyPassword() {
    if (!this.meetingPassword) return;
    navigator.clipboard?.writeText(this.meetingPassword);
    this.pwCopied = true;
    setTimeout(() => this.pwCopied = false, 1500);
  }
}
