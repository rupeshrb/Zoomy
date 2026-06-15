import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MIconComponent } from '../../../shared/ui/m-icon.component';

@Component({
  selector: 'iv-whiteboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MIconComponent],
  template: `
    <div class="wb">
      <div class="toolbar">
        <button class="tb" [class.on]="tool==='pen'" (click)="tool='pen'" title="Pen"><m-icon name="edit" /></button>
        <button class="tb" [class.on]="tool==='eraser'" (click)="tool='eraser'" title="Eraser"><m-icon name="ink_eraser" /></button>
        <span class="sep"></span>
        <button class="swatch" *ngFor="let c of colors" [style.background]="c" [class.on]="c===color" (click)="color=c"></button>
        <span class="sep"></span>
        <input type="range" min="2" max="24" [(ngModel)]="size" (input)="size = +$any($event.target).value" />
        <span class="m-spacer" style="flex:1"></span>
        <button class="tb" (click)="clear()" title="Clear"><m-icon name="delete" /></button>
      </div>
      <canvas #c
        (pointerdown)="down($event)" (pointermove)="move($event)"
        (pointerup)="up($event)" (pointerleave)="up($event)"></canvas>
    </div>
  `,
  styles: [`
    .wb { display: flex; flex-direction: column; height: 100%; background: #fff; border-radius: 8px; overflow: hidden; }
    .toolbar {
      display: flex; align-items: center; gap: 6px; padding: 6px 8px;
      background: #f1f3f4; border-bottom: 1px solid #dadce0; color: #202124;
    }
    .tb { width: 36px; height: 36px; border-radius: 8px; border: 0; background: transparent; color: #5f6368; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    .tb:hover { background: rgba(0,0,0,.06); }
    .tb.on { background: #e8f0fe; color: #1a73e8; }
    .swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
    .swatch.on { border-color: #1a73e8; box-shadow: 0 0 0 1px white inset; }
    .sep { width: 1px; height: 22px; background: #dadce0; margin: 0 4px; }
    canvas { flex: 1; width: 100%; height: 100%; background: #fff; cursor: crosshair; touch-action: none; }
    input[type=range] { accent-color: #1a73e8; }
  `]
})
export class WhiteboardComponent implements AfterViewInit {
  @ViewChild('c', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  tool: 'pen' | 'eraser' = 'pen';
  color = '#202124';
  size = 4;
  colors = ['#202124', '#ea4335', '#fbbc04', '#34a853', '#4285f4', '#a142f4'];

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private last?: { x: number; y: number };

  ngAfterViewInit() {
    const c = this.canvasRef.nativeElement;
    this.ctx = c.getContext('2d')!;
    const ro = new ResizeObserver(() => this.fit());
    ro.observe(c);
    this.fit();
  }

  private fit() {
    const c = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const data = c.width ? this.ctx.getImageData(0, 0, c.width, c.height) : null;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    this.ctx.scale(dpr, dpr);
    if (data) this.ctx.putImageData(data, 0, 0);
  }

  private pt(e: PointerEvent) {
    const r = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e: PointerEvent) {
    this.drawing = true; this.last = this.pt(e);
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  move(e: PointerEvent) {
    if (!this.drawing || !this.last) return;
    const p = this.pt(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.lineWidth = this.tool === 'eraser' ? this.size * 3 : this.size;
    this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.tool === 'eraser' ? '#fff' : this.color;
    this.ctx.stroke();
    this.last = p;
  }
  up(_: PointerEvent) { this.drawing = false; this.last = undefined; }

  clear() {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
  }
}
