import { Component, Input } from '@angular/core';

@Component({
  selector: 'm-card',
  standalone: true,
  template: `<ng-content/>`,
  host: {
    '[class]': '"m-card " + (variant || "")',
    '[style.padding]': 'pad'
  },
  styles: [`
    :host {
      display: block;
      background: var(--m-surface);
      border-radius: var(--m-r-lg);
      box-shadow: var(--m-e1);
    }
    :host.elevated { box-shadow: var(--m-e3); }
    :host.outline { background: transparent; border: 1px solid var(--m-divider); box-shadow: none; }
    :host.flat { background: var(--m-surface-2); box-shadow: none; }
    :host-context(.m-light) { background: var(--m-bg-light); }
    :host-context(.m-light).outline { border-color: var(--m-divider-light); }
    :host-context(.m-light).flat { background: var(--m-surface-light); }
  `]
})
export class MCardComponent {
  @Input() variant: '' | 'elevated' | 'outline' | 'flat' = '';
  @Input() pad: string = '16px';
}
