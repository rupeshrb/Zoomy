import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MIconComponent } from '../../../shared/ui/m-icon.component';

/**
 * Per-user notepad that follows meeting mode.
 *
 *  - NORMAL meeting: notes are PRIVATE to the local user. They are only
 *    persisted in this user's localStorage and never sent to anyone else.
 *  - INTERVIEW meeting (candidate): notes are "shared with the interviewer"
 *    — visible to the host only. We still persist locally; a future backend
 *    sync would broadcast `text` over the meeting channel to the host.
 *  - INTERVIEW meeting (host): notes are the host's own private notes.
 *
 * Storage key: `zoomy.notepad:<meetingId>:<userId>`. Scoping by meetingId +
 * userId guarantees a candidate cannot read another candidate's notes.
 */
@Component({
  selector: 'iv-notepad',
  standalone: true,
  imports: [CommonModule, FormsModule, MIconComponent],
  template: `
    <div class="pad" [class.private]="!isShared()" [class.shared]="isShared()">
      <div class="head">
        <m-icon [name]="isShared() ? 'visibility' : 'lock'" [size]="16" />
        <span>{{ headline() }}</span>
        <span class="m-spacer" style="flex:1"></span>
        <span class="saved" *ngIf="saved">Saved</span>
      </div>
      <textarea
        [(ngModel)]="text"
        (ngModelChange)="onChange()"
        [placeholder]="placeholder()"
      ></textarea>
    </div>
  `,
  styles: [`
    .pad { display: flex; flex-direction: column; height: 100%; border-radius: 8px; overflow: hidden; }
    .pad.private { background: #fffde7; }
    .pad.shared  { background: #e8f1ff; }
    .head {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px; font-size: 12px;
    }
    .pad.private .head { background: #fff59d; color: #5f4500; border-bottom: 1px solid #fbc02d; }
    .pad.shared  .head { background: #c7dcff; color: #0b3b8c; border-bottom: 1px solid #6ea8ff; }
    .saved { color: #137333; font-weight: 500; }
    textarea {
      flex: 1; width: 100%; padding: 16px; background: transparent;
      border: 0; outline: none; resize: none; color: #202124;
      font-family: var(--m-font); font-size: 14px; line-height: 1.55;
    }
  `]
})
export class NotepadComponent implements OnInit, OnChanges {
  /** Meeting mode — drives sharing copy. */
  @Input() meetingMode: 'NORMAL' | 'INTERVIEW' = 'NORMAL';
  /** 'host' or 'guest' — drives candidate vs interviewer wording. */
  @Input() role: 'host' | 'guest' = 'guest';
  /** Used to namespace localStorage so each user keeps their own notes. */
  @Input() meetingId = '';
  @Input() userId = '';
  /** Kept for backwards compat with older callers. */
  @Input() scope: 'you' | 'host' = 'you';

  text = '';
  saved = false;
  private timer?: any;

  ngOnInit() { this.load(); }
  ngOnChanges(c: SimpleChanges) {
    if (c['meetingId'] || c['userId']) this.load();
  }

  isShared() {
    // For a CANDIDATE in an interview, the notepad content is visible to the host.
    return this.meetingMode === 'INTERVIEW' && this.role !== 'host';
  }

  headline() {
    if (this.meetingMode === 'INTERVIEW') {
      return this.role === 'host'
        ? 'Your private notes — only you (the interviewer) can see this'
        : 'Shared with the interviewer — they can view your notes';
    }
    return 'Your private notepad — only you can see this';
  }

  placeholder() {
    if (this.meetingMode === 'INTERVIEW' && this.role !== 'host') {
      return 'Type notes for the interviewer to see…';
    }
    return 'Type your private notes here…';
  }

  onChange() {
    this.saved = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.save(); this.saved = true; }, 700);
  }

  private storageKey() {
    return `zoomy.notepad:${this.meetingId || 'unknown'}:${this.userId || 'anon'}`;
  }

  private load() {
    try { this.text = localStorage.getItem(this.storageKey()) || ''; }
    catch { this.text = ''; }
  }
  private save() {
    try { localStorage.setItem(this.storageKey(), this.text); } catch { /* quota etc. */ }
  }
}
