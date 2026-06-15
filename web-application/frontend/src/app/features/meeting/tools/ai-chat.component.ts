import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MIconComponent } from '../../../shared/ui/m-icon.component';

interface AiMsg { from: 'you' | 'ai'; text: string; at: string; }

@Component({
  selector: 'iv-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MIconComponent],
  template: `
    <div class="ai">
      <div class="head">
        <span class="badge">
          <m-icon name="auto_awesome" [size]="16" />
          Zoomy AI
        </span>
        <span class="hint">Ask anything — summaries, follow-up questions, quick facts.</span>
      </div>
      <div #scroll class="thread">
        <div class="empty" *ngIf="msgs().length === 0">
          <m-icon name="auto_awesome" [size]="28" />
          <div class="t">Hi! I'm Zoomy AI.</div>
          <div class="s">Try: "Summarize the meeting so far", "Draft an agenda for the next 10 minutes", or "Explain async/await in one paragraph".</div>
          <div class="chips">
            <button (click)="quick($event)">Summarize last 5 minutes</button>
            <button (click)="quick($event)">Draft action items</button>
            <button (click)="quick($event)">Suggest interview questions</button>
          </div>
        </div>
        <div class="row" *ngFor="let m of msgs()" [class.mine]="m.from==='you'">
          <div class="avatar" *ngIf="m.from==='ai'"><m-icon name="auto_awesome" [size]="16" /></div>
          <div class="bubble">
            <div class="meta">{{ m.from === 'ai' ? 'Zoomy AI' : 'You' }} · {{ m.at }}</div>
            <div class="text">{{ m.text }}</div>
          </div>
        </div>
        <div class="row" *ngIf="thinking()">
          <div class="avatar"><m-icon name="auto_awesome" [size]="16" /></div>
          <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>
        </div>
      </div>
      <form class="composer" (ngSubmit)="send()">
        <input [(ngModel)]="draft" name="msg" placeholder="Ask Zoomy AI…" autocomplete="off" />
        <button type="submit" class="go" [class.ready]="!!draft.trim()" [disabled]="!draft.trim() || thinking()">
          <m-icon name="send" />
        </button>
      </form>
    </div>
  `,
  styles: [`
    .ai { display: flex; flex-direction: column; height: 100%; background: var(--m-surface); color: var(--m-text);
          border-radius: 8px; overflow: hidden; }
    .head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--m-divider); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
             background: var(--m-brand-grad); color: #fff; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .hint { font-size: 12px; color: var(--m-text-muted); }
    .thread { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .empty { margin: auto; text-align: center; max-width: 420px; color: var(--m-text-muted); display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .empty m-icon { color: var(--m-accent); }
    .empty .t { color: var(--m-text); font-size: 18px; font-weight: 600; margin-top: 4px; }
    .empty .s { font-size: 13px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
    .chips button { font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 999px;
                    border: 1px solid var(--m-divider); background: var(--m-surface-2); color: var(--m-text); cursor: pointer; }
    .chips button:hover { background: var(--m-elevated); }
    .row { display: flex; gap: 8px; align-items: flex-start; max-width: 90%; }
    .row.mine { align-self: flex-end; flex-direction: row-reverse; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--m-brand-grad); color: #fff;
              display: inline-flex; align-items: center; justify-content: center; flex: 0 0 28px; }
    .bubble { padding: 8px 14px; border-radius: 14px 14px 14px 4px; background: var(--m-surface-2); color: var(--m-text);
              font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .row.mine .bubble { background: var(--m-brand-grad); color: #fff; border-radius: 14px 14px 4px 14px; }
    .meta { font-size: 11px; opacity: .7; margin-bottom: 2px; }
    .typing { display: inline-flex; gap: 4px; padding: 2px 0; }
    .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--m-text-muted); animation: blink 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .15s; }
    .typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
    .composer { display: flex; gap: 6px; padding: 10px; border-top: 1px solid var(--m-divider); background: var(--m-surface); }
    .composer input { flex: 1; padding: 10px 16px; background: var(--m-surface-2); color: var(--m-text);
                      border: 1px solid transparent; border-radius: 24px; outline: none; font-size: 14px; }
    .composer input:focus { border-color: var(--m-primary-700); background: var(--m-surface); }
    .go { width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent;
          color: var(--m-text-muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    .go.ready { background: var(--m-brand-grad); color: #fff; }
    .go[disabled] { cursor: default; opacity: .6; }
  `]
})
export class AiChatComponent {
  @ViewChild('scroll') scrollRef?: ElementRef<HTMLDivElement>;
  msgs = signal<AiMsg[]>([]);
  draft = '';
  thinking = signal(false);

  quick(e: Event) {
    const t = (e.target as HTMLButtonElement).textContent?.trim() || '';
    this.draft = t;
    this.send();
  }

  send() {
    const text = this.draft.trim();
    if (!text || this.thinking()) return;
    const at = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    this.msgs.update(m => [...m, { from: 'you', text, at }]);
    this.draft = '';
    this.thinking.set(true);
    this.scrollSoon();
    setTimeout(() => {
      const reply = this.localReply(text);
      this.msgs.update(m => [...m, {
        from: 'ai', text: reply,
        at: new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      }]);
      this.thinking.set(false);
      this.scrollSoon();
    }, 700 + Math.min(text.length * 8, 1200));
  }

  private scrollSoon() {
    setTimeout(() => {
      const el = this.scrollRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }

  /** Offline canned reply so the assistant works without a backend wired up yet. */
  private localReply(q: string): string {
    const lower = q.toLowerCase();
    if (lower.includes('summar')) {
      return 'Quick summary (demo): the call has been running for a few minutes. Connect Zoomy AI to a transcript provider in api → AiService for real meeting summaries.';
    }
    if (lower.includes('action') || lower.includes('todo')) {
      return 'Suggested action items (demo):\n• Confirm next sync time\n• Share the deck before Friday\n• Owner: assign in chat — Zoomy AI will pull them once a transcript service is connected.';
    }
    if (lower.includes('agenda')) {
      return 'Suggested 10-minute agenda:\n1. Recap last week (2m)\n2. Blockers (3m)\n3. Decisions needed today (3m)\n4. Next steps & owners (2m)';
    }
    if (lower.includes('interview') || lower.includes('question')) {
      return 'Try: "Walk me through a time you debugged a production incident.", "How would you design a URL shortener?", "What\'s a recent technical decision you regret?"';
    }
    return 'Zoomy AI (demo mode): I heard "' + q + '". Wire me to OpenAI or your own LLM in api → AiController to get real answers.';
  }
}
