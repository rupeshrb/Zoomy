import { Injectable, signal, effect, computed } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'zoomy.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.loadMode());
  readonly mode = this._mode.asReadonly();

  /** The actual applied theme after resolving 'system'. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const m = this._mode();
    if (m === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return m;
  });

  private mediaQuery?: MediaQueryList;
  private mediaListener = () => {
    if (this._mode() === 'system') this.apply();
  };

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', this.mediaListener);
    }
    effect(() => {
      const m = this._mode();
      try { localStorage.setItem(STORAGE_KEY, m); } catch {}
      this.apply();
    });
  }

  set(mode: ThemeMode): void { this._mode.set(mode); }

  toggle(): void {
    // Cycle: light -> dark -> system -> light
    const next: ThemeMode = this._mode() === 'light' ? 'dark'
      : this._mode() === 'dark' ? 'system' : 'light';
    this._mode.set(next);
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const r = document.documentElement;
    r.dataset['theme'] = this.resolved();
    r.style.colorScheme = this.resolved();
  }

  private loadMode(): ThemeMode {
    try {
      const v = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch {}
    return 'system';
  }

  private systemPrefersDark(): boolean {
    return !!this.mediaQuery?.matches;
  }
}
