import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MDialogComponent } from '../../../shared/ui/m-dialog.component';
import { MButtonComponent } from '../../../shared/ui/m-button.component';
import { MIconComponent } from '../../../shared/ui/m-icon.component';

/**
 * Per-meeting tool availability. Host picks these at meeting creation
 * (or edits later from the in-room settings dialog). Stored in localStorage
 * keyed by meeting id so guests pick the same flags up when they join.
 */
export interface RoomSettings {
  ai: boolean;
  code: boolean;
  notepad: boolean;
  whiteboard: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  ai: true, code: true, notepad: true, whiteboard: true
};

const KEY = (id: string) => `zoomy.room-settings:${id}`;

export function loadRoomSettings(meetingId: string): RoomSettings {
  if (!meetingId) return { ...DEFAULT_ROOM_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY(meetingId));
    if (!raw) return { ...DEFAULT_ROOM_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RoomSettings>;
    return { ...DEFAULT_ROOM_SETTINGS, ...parsed };
  } catch { return { ...DEFAULT_ROOM_SETTINGS }; }
}

export function saveRoomSettings(meetingId: string, s: RoomSettings) {
  if (!meetingId) return;
  try { localStorage.setItem(KEY(meetingId), JSON.stringify(s)); } catch {}
}

interface ToolDef {
  key: keyof RoomSettings;
  icon: string;
  title: string;
  desc: string;
}

const TOOLS: ToolDef[] = [
  { key: 'ai',         icon: 'auto_awesome',   title: 'AI assistant',  desc: 'Built-in chat assistant for summaries, agendas, hints.' },
  { key: 'code',       icon: 'code',           title: 'Code IDE',      desc: 'Monaco editor for live coding (JS, Python, Java).' },
  { key: 'notepad',    icon: 'sticky_note_2',  title: 'Notepad',       desc: 'Personal scratchpad — auto-saved per participant.' },
  { key: 'whiteboard', icon: 'brush',          title: 'Whiteboard',    desc: 'Shared sketching surface for diagrams and notes.' }
];

@Component({
  selector: 'room-settings-dialog',
  standalone: true,
  imports: [CommonModule, MDialogComponent, MButtonComponent, MIconComponent],
  template: `
    <m-dialog [open]="open" [title]="title" (close)="onCancel()" [width]="520">
      <p class="sub">{{ subtitle }}</p>
      <div class="list">
        <label class="row" *ngFor="let t of tools" [class.off]="!model[t.key]">
          <div class="icon"><m-icon [name]="t.icon" /></div>
          <div class="text">
            <div class="t">{{ t.title }}</div>
            <div class="d">{{ t.desc }}</div>
          </div>
          <button type="button" class="sw" [class.on]="model[t.key]"
                  (click)="toggle(t.key)" [attr.aria-pressed]="model[t.key]"
                  [title]="model[t.key] ? 'Enabled' : 'Disabled'">
            <span class="knob"></span>
          </button>
        </label>
      </div>
      <p class="hint">
        <m-icon name="info" [size]="16" />
        Only the host can change these. Disabled tools are hidden for everyone.
      </p>
      <div dialog-actions>
        <button m-button variant="text" (click)="onCancel()">Cancel</button>
        <button m-button variant="filled" (click)="onSave()">{{ saveLabel }}</button>
      </div>
    </m-dialog>
  `,
  styles: [`
    .sub { color: var(--m-text-ink-muted); margin: 0 0 16px; font-size: 14px; }
    :host-context(.m-dark) .sub { color: var(--m-text-muted); }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .row {
      display: flex; align-items: center; gap: 14px;
      padding: 12px 14px; border-radius: 12px;
      background: var(--m-surface-light);
      transition: background-color .15s, opacity .15s;
    }
    :host-context(.m-dark) .row { background: var(--m-surface-2); }
    .row.off { opacity: .55; }
    .icon {
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--m-brand-grad-soft); color: var(--m-primary-700);
      display: inline-flex; align-items: center; justify-content: center;
      flex: 0 0 38px;
    }
    .text { flex: 1; min-width: 0; }
    .t { font-size: 14px; font-weight: 500; }
    .d { font-size: 12px; color: var(--m-text-ink-muted); margin-top: 2px; }
    :host-context(.m-dark) .d { color: var(--m-text-muted); }

    .sw {
      width: 40px; height: 22px; border-radius: 999px;
      background: var(--m-outline); border: 0; cursor: pointer;
      position: relative; padding: 0; transition: background-color .15s;
      flex: 0 0 40px;
    }
    .sw.on { background: var(--m-primary); }
    .knob {
      position: absolute; top: 2px; left: 2px;
      width: 18px; height: 18px; border-radius: 50%; background: #fff;
      transition: transform .18s cubic-bezier(.4,0,.2,1);
      box-shadow: 0 1px 3px rgba(0,0,0,.3);
    }
    .sw.on .knob { transform: translateX(18px); }

    .hint {
      display: flex; align-items: center; gap: 6px;
      margin: 14px 0 0; font-size: 12px;
      color: var(--m-text-ink-muted);
    }
    :host-context(.m-dark) .hint { color: var(--m-text-muted); }
  `]
})
export class RoomSettingsDialog implements OnChanges {
  @Input() open = false;
  @Input() value: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  @Input() title = 'Room settings';
  @Input() subtitle = 'Choose which collaboration tools are available in this meeting.';
  @Input() saveLabel = 'Save';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<RoomSettings>();

  tools = TOOLS;
  model: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };

  ngOnChanges(ch: SimpleChanges) {
    if (ch['value'] || ch['open']) {
      this.model = { ...DEFAULT_ROOM_SETTINGS, ...(this.value || {}) };
    }
  }

  toggle(k: keyof RoomSettings) { this.model = { ...this.model, [k]: !this.model[k] }; }

  onCancel() { this.close.emit(); }
  onSave()   { this.save.emit({ ...this.model }); }
}
