import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { MIconComponent } from './m-icon.component';

let UID = 0;

@Component({
  selector: 'm-text-field',
  standalone: true,
  imports: [CommonModule, FormsModule, MIconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MTextFieldComponent), multi: true }],
  template: `
    <label [for]="id" class="wrap" [class.focused]="focused" [class.filled]="!!value" [class.has-icon]="!!icon" [class.has-trailing]="showToggle()" [class.invalid]="invalid">
      <m-icon *ngIf="icon" [name]="icon" class="leading" [size]="20" />
      <input
        [id]="id"
        [type]="effectiveType()"
        [value]="value || ''"
        [placeholder]="placeholder"
        [autocomplete]="autocomplete"
        [attr.inputmode]="inputmode"
        (input)="onInput($event)"
        (focus)="focused=true"
        (blur)="onBlur()"
      />
      <button *ngIf="showToggle()"
              type="button"
              class="trailing"
              (mousedown)="$event.preventDefault()"
              (click)="toggleReveal($event)"
              [attr.aria-label]="passwordVisible ? 'Hide password' : 'Show password'"
              [title]="passwordVisible ? 'Hide password' : 'Show password'">
        <m-icon [name]="passwordVisible ? 'visibility_off' : 'visibility'" [size]="18" />
      </button>
      <span class="label">{{ label }}</span>
    </label>
    <small *ngIf="hint && !error" class="hint">{{ hint }}</small>
    <small *ngIf="error" class="hint error">{{ error }}</small>
  `,
  styles: [`
    :host { display: block; }
    .wrap {
      position: relative; display: flex; align-items: center; gap: 8px;
      height: 48px; padding: 0 14px;
      background: transparent;
      border: 1px solid var(--m-divider-light);
      border-radius: var(--m-r-sm);
      transition: border-color .15s, background-color .15s;
      cursor: text;
    }
    .wrap.focused { border-color: var(--m-primary-700); border-width: 2px; padding: 0 13px; }
    .wrap.invalid { border-color: var(--m-danger); }
    .leading { color: var(--m-text-ink-muted); }
    input {
      flex: 1; background: transparent; border: 0; outline: none;
      color: var(--m-text-ink); font-size: 14px; padding: 18px 0 4px;
      width: 100%;
    }
    /* Hide the browser's built-in password reveal/clear icons (Edge/IE) so we
       only show our own custom eye toggle — otherwise two eyes appear. */
    input::-ms-reveal,
    input::-ms-clear { display: none; }
    .wrap.has-trailing input { padding-right: 34px; }
    .trailing {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      width: 28px; height: 28px; border: 0; border-radius: 50%;
      background: transparent; color: var(--m-text-ink-muted);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer;
    }
    .trailing:hover { background: var(--m-hover-ink); color: var(--m-text-ink); }
    input::placeholder { color: transparent; }
    .label {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--m-text-ink-muted); font-size: 14px; pointer-events: none;
      transition: transform .15s, font-size .15s, color .15s, top .15s, background-color .15s;
      background: transparent;
      padding: 0 4px;
    }
    .wrap.has-icon .label { left: 40px; }
    .wrap.focused .label, .wrap.filled .label {
      top: 0; transform: translateY(-50%); font-size: 12px; color: var(--m-primary-700);
      background: var(--m-bg-light);
    }
    .wrap.invalid .label { color: var(--m-danger); }
    /* Dark-mode override (opt-in via .m-dark ancestor) */
    :host-context(.m-dark) .wrap { border-color: var(--m-outline); }
    :host-context(.m-dark) .wrap.focused { border-color: var(--m-primary); }
    :host-context(.m-dark) input { color: var(--m-text); }
    :host-context(.m-dark) .leading { color: var(--m-text-muted); }
    :host-context(.m-dark) .label { color: var(--m-text-muted); }
    :host-context(.m-dark) .wrap.focused .label,
    :host-context(.m-dark) .wrap.filled .label { color: var(--m-primary); background: var(--m-bg); }
    .hint { display: block; margin: 6px 16px 0; font-size: 12px; color: var(--m-text-ink-muted); }
    .hint.error { color: var(--m-danger); }
    :host-context(.m-dark) .hint { color: var(--m-text-muted); }
  `]
})
export class MTextFieldComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() type: 'text' | 'email' | 'password' | 'number' | 'tel' = 'text';
  @Input() placeholder = '';
  @Input() icon = '';
  @Input() hint = '';
  @Input() error = '';
  @Input() invalid = false;
  @Input() autocomplete = 'off';
  @Input() inputmode: string | null = null;
  @Input() revealToggle = false;

  id = 'm-tf-' + ++UID;
  value: string = '';
  focused = false;
  passwordVisible = false;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: string): void { this.value = v ?? ''; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }

  onInput(e: Event) {
    this.value = (e.target as HTMLInputElement).value;
    this.onChange(this.value);
  }
  onBlur() { this.focused = false; this.onTouched(); }

  showToggle(): boolean {
    return this.revealToggle && this.type === 'password';
  }

  effectiveType(): string {
    if (!this.showToggle()) return this.type;
    return this.passwordVisible ? 'text' : 'password';
  }

  toggleReveal(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.passwordVisible = !this.passwordVisible;
  }
}
