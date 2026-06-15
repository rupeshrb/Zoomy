import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MIconComponent } from '../../../shared/ui/m-icon.component';

@Component({
  selector: 'meeting-controls',
  standalone: true,
  imports: [CommonModule, MIconComponent],
  template: `
    <div class="bar">
      <div class="left">
        <span class="time">{{ time }}</span>
        <span class="dot"></span>
        <span class="code">{{ code }}</span>
      </div>

      <div class="center">
        <button class="pill" [class.danger]="!micOn" [class.locked]="micLocked"
                (click)="toggle.emit('mic')" [disabled]="micLocked"
                [title]="micLocked ? 'Muted by host' : (micOn ? 'Mute' : 'Unmute')">
          <m-icon [name]="micLocked ? 'mic_off' : (micOn ? 'mic' : 'mic_off')" />
          <span class="lock-badge" *ngIf="micLocked"><m-icon name="lock" [size]="11" /></span>
        </button>
        <button class="pill" [class.danger]="!camOn" (click)="toggle.emit('cam')" [title]="camOn ? 'Stop video' : 'Start video'">
          <m-icon [name]="camOn ? 'videocam' : 'videocam_off'" />
        </button>
        <button class="pill" (click)="toggle.emit('captions')" [class.active]="ccOn" title="Captions">
          <m-icon name="closed_caption" />
        </button>
        <button class="pill" (click)="toggle.emit('hand')" [class.active]="handUp" title="Raise hand">
          <m-icon name="front_hand" />
        </button>
        <button class="pill" (click)="toggle.emit('share')" [class.active]="sharing" title="Present">
          <m-icon name="present_to_all" />
        </button>
        <button class="pill leave" (click)="toggle.emit('leave')" title="Leave call">
          <m-icon name="call_end" />
        </button>
      </div>

      <div class="right">
        <button class="rbtn" (click)="openTab.emit('info')" title="Meeting details">
          <m-icon name="info" />
        </button>
        <button class="rbtn" (click)="openTab.emit('people')" title="People">
          <m-icon name="people" />
          <span class="badge" *ngIf="peopleCount > 0">{{ peopleCount }}</span>
        </button>
        <button class="rbtn" (click)="openTab.emit('chat')" title="Chat">
          <m-icon name="chat" />
        </button>
        <button class="rbtn" *ngIf="showInterview" (click)="openTab.emit('interview')" title="Interview tools">
          <m-icon name="verified_user" />
        </button>
        <button class="rbtn ai" *ngIf="showAi" (click)="openTab.emit('ai')" title="AI assistant">
          <m-icon name="auto_awesome" />
        </button>
        <button class="rbtn" (click)="openTab.emit('activities')" title="Activities">
          <m-icon name="emoji_events" />
        </button>
        <button class="rbtn" *ngIf="showSettings" (click)="openSettings.emit()" title="Room settings">
          <m-icon name="settings" />
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .bar {
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: center; gap: 16px;
      height: var(--m-controls-h); padding: 0 24px;
      background: var(--m-bg);
    }
    .left { display: flex; align-items: center; gap: 10px; color: var(--m-text-muted); font-size: 14px; }
    .left .dot { width: 3px; height: 3px; background: var(--m-text-muted); border-radius: 50%; }
    .center { display: flex; align-items: center; gap: 10px; }
    .right { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }

    .pill {
      width: 48px; height: 48px; border-radius: 50%;
      border: 1px solid transparent; background: var(--m-surface-2); color: var(--m-text);
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: background-color .15s, transform .04s;
    }
    .pill:hover { background: var(--m-elevated); }
    .pill:active { transform: scale(.96); }
    .pill.active { background: var(--m-primary); color: var(--m-primary-ink); }
    .pill.danger { background: var(--m-danger); color: #fff; }
    /* Host-locked mic: red, non-interactive, padlock badge. */
    .pill.locked { position: relative; background: var(--m-danger); color: #fff; cursor: not-allowed; opacity: .9; }
    .pill.locked:hover { background: var(--m-danger); }
    .pill .lock-badge {
      position: absolute; right: -2px; bottom: -2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #1f2024; color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 2px var(--m-bg);
    }
    .pill.leave {
      width: 64px; border-radius: 28px; background: var(--m-danger); color: #fff;
      margin-left: 8px;
    }
    .pill.leave:hover { background: color-mix(in srgb, var(--m-danger) 88%, white); }

    .rbtn {
      position: relative; width: 40px; height: 40px; border-radius: 50%;
      border: 0; background: transparent; color: var(--m-text);
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    }
    .rbtn:hover { background: var(--m-surface-2); }
    .rbtn.ai m-icon { color: var(--m-accent); }
    .badge {
      position: absolute; top: 4px; right: 4px; background: var(--m-danger); color: white;
      font-size: 10px; min-width: 16px; height: 16px; border-radius: 8px;
      display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
    }

    @media (max-width: 720px) {
      .bar { grid-template-columns: 1fr; padding: 8px; height: auto; gap: 8px; }
      .left, .right { justify-content: center; }
      .pill { width: 44px; height: 44px; }
      .pill.leave { width: 56px; }
    }
  `]
})
export class MeetingControlsComponent {
  @Input() micOn = true;
  @Input() micLocked = false;
  @Input() camOn = true;
  @Input() ccOn = false;
  @Input() handUp = false;
  @Input() sharing = false;
  @Input() time = '';
  @Input() code = '';
  @Input() peopleCount = 0;
  @Input() showInterview = false;
  @Input() showAi = true;
  @Input() showSettings = false;
  @Output() toggle = new EventEmitter<'mic'|'cam'|'captions'|'hand'|'share'|'leave'>();
  @Output() openTab = new EventEmitter<'info'|'people'|'chat'|'activities'|'interview'|'ai'>();
  @Output() openSettings = new EventEmitter<void>();
}
