import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MIconComponent } from '../../../shared/ui/m-icon.component';
import { MButtonComponent } from '../../../shared/ui/m-button.component';

declare const monaco: any;

@Component({
  selector: 'iv-code-ide',
  standalone: true,
  imports: [CommonModule, FormsModule, MIconComponent, MButtonComponent],
  template: `
    <div class="ide">
      <div class="head">
        <m-icon name="code" [size]="18" />
        <select [(ngModel)]="lang" (change)="onLang()">
          <option *ngFor="let l of langs" [value]="l.id">{{ l.label }}</option>
        </select>
        <span class="m-spacer" style="flex:1"></span>
        <button m-button variant="tonal" size="sm" (click)="reset()">
          <m-icon name="restart_alt" [size]="16" /> Reset
        </button>
        <button m-button variant="filled" size="sm" (click)="run()">
          <m-icon name="play_arrow" [size]="16" /> Run
        </button>
      </div>
      <div #host class="editor"></div>
      <div class="out" *ngIf="output()">
        <div class="out-head">Output</div>
        <pre>{{ output() }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .ide { display: flex; flex-direction: column; height: 100%;
      background: #1e1e1e; border-radius: 8px; overflow: hidden; color: #d4d4d4; }
    .head {
      display: flex; align-items: center; gap: 8px; padding: 6px 12px;
      background: #2d2d2d; border-bottom: 1px solid #1f1f1f;
    }
    .head select {
      background: #3a3a3a; color: white; border: 0; padding: 6px 10px;
      border-radius: 6px; font-family: inherit;
    }
    .editor { flex: 1; min-height: 0; }
    .out { background: #181818; border-top: 1px solid #2d2d2d; max-height: 35%; overflow-y: auto; }
    .out-head {
      padding: 6px 12px; font-size: 11px; color: #9aa0a6;
      text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #2d2d2d;
    }
    pre { margin: 0; padding: 12px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  `]
})
export class CodeIdeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  langs = [
    { id: 'javascript', label: 'JavaScript' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'python', label: 'Python' },
    { id: 'java', label: 'Java' },
    { id: 'cpp', label: 'C++' }
  ];
  lang = 'javascript';
  private editor: any;
  output = (() => { let v = ''; return Object.assign((x?: string) => x === undefined ? v : (v = x), {}); })();

  private starters: Record<string, string> = {
    javascript: `// Two-sum\nfunction twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\nconsole.log(twoSum([2,7,11,15], 9));\n`,
    typescript: `function twoSum(nums: number[], target: number): number[] {\n  const seen = new Map<number, number>();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need)!, i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\nconsole.log(twoSum([2,7,11,15], 9));\n`,
    python: `def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []\n\nprint(two_sum([2, 7, 11, 15], 9))\n`,
    java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // your code\n        return new int[]{};\n    }\n}`,
    cpp: `#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nvector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int,int> seen;\n    for (int i = 0; i < (int)nums.size(); i++) {\n        if (seen.count(target - nums[i])) return {seen[target - nums[i]], i};\n        seen[nums[i]] = i;\n    }\n    return {};\n}`
  };

  ngAfterViewInit() {
    this.loadMonaco().then(() => {
      this.editor = monaco.editor.create(this.host.nativeElement, {
        value: this.starters[this.lang],
        language: this.lang,
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2
      });
    });
  }

  private async loadMonaco(): Promise<void> {
    if ((window as any).monaco) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'assets/monaco/vs/loader.js'; s.onload = () => resolve(); s.onerror = reject;
      document.head.appendChild(s);
    });
    const req = (window as any).require;
    req.config({ paths: { vs: 'assets/monaco/vs' } });
    await new Promise<void>(resolve => req(['vs/editor/editor.main'], () => resolve()));
  }

  onLang() {
    if (!this.editor) return;
    const model = this.editor.getModel();
    monaco.editor.setModelLanguage(model, this.lang);
    this.editor.setValue(this.starters[this.lang] || '');
  }

  reset() { if (this.editor) this.editor.setValue(this.starters[this.lang] || ''); }

  run() {
    if (this.lang !== 'javascript') {
      this.output('▶ Code execution for ' + this.lang + ' runs on the backend (not connected in this demo).');
      return;
    }
    const code = this.editor?.getValue() ?? '';
    const logs: string[] = [];
    const cons = { log: (...a: any[]) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')) };
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function('console', code)(cons);
      this.output(logs.join('\n') || '(no output)');
    } catch (e: any) {
      this.output('Error: ' + (e?.message || String(e)));
    }
  }

  ngOnDestroy() { this.editor?.dispose(); }
}
