import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MIconComponent } from './m-icon.component';

export type MButtonVariant = 'filled' | 'tonal' | 'text' | 'outline' | 'danger' | 'icon';

@Component({
  selector: 'm-button, button[m-button], a[m-button]',
  standalone: true,
  imports: [CommonModule, MIconComponent],
  template: `
    <ng-container *ngIf="icon && !iconRight"><m-icon [name]="icon" [size]="iconSize" /></ng-container>
    <span class="m-btn-label"><ng-content /></span>
    <ng-container *ngIf="icon && iconRight"><m-icon [name]="icon" [size]="iconSize" /></ng-container>
  `,
  host: {
    '[class]': '"m-btn " + variant + (size ? " m-btn--" + size : "") + (round ? " m-btn--round" : "")',
    '[attr.role]': '"button"'
  },
  styles: [`
    :host {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; padding: 0 24px; height: 40px;
      border-radius: var(--m-r-pill);
      font-family: var(--m-font); font-size: 14px; font-weight: 500;
      letter-spacing: .25px; cursor: pointer; user-select: none;
      transition: background-color .15s, box-shadow .15s, color .15s, transform .04s;
      border: 0; background: transparent; color: var(--m-text);
      white-space: nowrap; text-decoration: none;
    }
    :host:active { transform: scale(.98); }
    :host[disabled], :host.disabled { opacity: .5; pointer-events: none; }

    :host.filled { background: var(--m-primary-700); color: #fff; }
    :host.filled:hover { box-shadow: var(--m-e2); background: color-mix(in srgb, var(--m-primary-700) 88%, black); }

    :host.tonal { background: var(--m-surface-light); color: var(--m-text-ink); }
    :host.tonal:hover { background: var(--m-surface-light-2); }

    :host.text { padding: 0 12px; color: var(--m-primary-700); }
    :host.text:hover { background: rgba(26,115,232,.08); }

    :host.outline { border: 1px solid var(--m-divider-light); color: var(--m-text-ink); }
    :host.outline:hover { background: var(--m-hover-ink); }

    :host.danger { background: var(--m-danger); color: #fff; }
    :host.danger:hover { background: color-mix(in srgb, var(--m-danger) 88%, white); }

    :host.icon {
      padding: 0; width: 40px; height: 40px; border-radius: var(--m-r-pill);
      background: transparent; color: var(--m-text-ink-muted);
    }
    :host.icon:hover { background: var(--m-hover-ink); color: var(--m-text-ink); }

    :host.m-btn--lg { height: 48px; padding: 0 28px; font-size: 15px; }
    :host.m-btn--sm { height: 32px; padding: 0 16px; font-size: 13px; }

    :host.m-btn--round { width: 56px; height: 56px; padding: 0; border-radius: var(--m-r-pill); }
    :host.m-btn--round.m-btn--lg { width: 64px; height: 64px; }

    .m-btn-label:empty { display: none; }

    @media (max-width: 600px) {
      :host { padding: 0 18px; }
    }
  `]
})
export class MButtonComponent {
  @Input() variant: MButtonVariant = 'filled';
  @Input() size: '' | 'sm' | 'lg' = '';
  @Input() icon = '';
  @Input() iconRight = false;
  @Input() iconSize = 20;
  @Input() round = false;
}
