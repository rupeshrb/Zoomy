import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MIconComponent } from './m-icon.component';

@Component({
  selector: 'm-dialog',
  standalone: true,
  imports: [CommonModule, MIconComponent],
  template: `
    <div class="scrim" *ngIf="open" (click)="onScrim()">
      <div class="surface" [style.maxWidth.px]="width" (click)="$event.stopPropagation()">
        <header *ngIf="title">
          <h2>{{ title }}</h2>
          <button class="x" (click)="close.emit()" aria-label="Close">
            <m-icon name="close" />
          </button>
        </header>
        <section class="body"><ng-content /></section>
        <footer><ng-content select="[dialog-actions]" /></footer>
      </div>
    </div>
  `,
  styles: [`
    .scrim {
      position: fixed; inset: 0; background: var(--m-overlay);
      display: flex; align-items: center; justify-content: center;
      z-index: 100; padding: 16px;
      animation: fade .12s ease-out;
    }
    .surface {
      background: var(--m-bg-light); color: var(--m-text-ink);
      border-radius: var(--m-r-lg); box-shadow: var(--m-e4);
      width: 100%; min-width: 280px; overflow: hidden;
      animation: pop .14s ease-out;
    }
    :host-context(.m-dark) .surface { background: var(--m-surface); color: var(--m-text); }
    header {
      display: flex; align-items: center; gap: 12px;
      padding: 20px 16px 4px 24px;
    }
    h2 { flex: 1; margin: 0; font-family: var(--m-font); font-weight: 500; font-size: 20px; }
    .x { width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent;
         color: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .x:hover { background: var(--m-hover-ink); }
    :host-context(.m-dark) .x:hover { background: rgba(255,255,255,.08); }
    .body { padding: 8px 24px 24px; }
    footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px 16px; }
    footer:empty { display: none; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pop { from { transform: scale(.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `]
})
export class MDialogComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() width = 480;
  @Input() dismissOnScrim = true;
  @Output() close = new EventEmitter<void>();

  onScrim() { if (this.dismissOnScrim) this.close.emit(); }
}
