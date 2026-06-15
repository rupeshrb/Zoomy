import { Component, Input } from '@angular/core';

const COLORS = ['#ea4335','#fbbc04','#34a853','#4285f4','#a142f4','#f06292','#26a69a','#ff7043'];
function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

@Component({
  selector: 'm-avatar',
  standalone: true,
  template: `<span>{{ initials }}</span>`,
  host: {
    '[style.width.px]': 'size', '[style.height.px]': 'size',
    '[style.fontSize.px]': 'size * 0.42',
    '[style.background]': 'bgColor()'
  },
  styles: [`
    :host {
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 50%; color: #fff; font-weight: 500; user-select: none;
      font-family: var(--m-font);
    }
  `]
})
export class MAvatarComponent {
  @Input() name = '?';
  @Input() color: string | null = null;
  @Input() size = 36;

  get initials(): string {
    const parts = (this.name || '?').trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '?';
    const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }
  bgColor() { return this.color ?? hashColor(this.name); }
}
