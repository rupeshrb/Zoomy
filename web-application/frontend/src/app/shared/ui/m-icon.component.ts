import { Component, Input } from '@angular/core';

@Component({
  selector: 'm-icon',
  standalone: true,
  template: `<span class="material-symbols-rounded" [style.fontSize.px]="size" [class.filled]="filled">{{ name }}</span>`,
  styles: [`
    :host { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
    .filled { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  `]
})
export class MIconComponent {
  @Input() name = '';
  @Input() size: number = 24;
  @Input() filled = false;
}
