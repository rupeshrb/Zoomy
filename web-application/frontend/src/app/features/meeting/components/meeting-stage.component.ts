import {
  Component, Input, Output, EventEmitter, ElementRef, ViewChild,
  AfterViewInit, OnChanges, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAvatarComponent } from '../../../shared/ui/m-avatar.component';
import { MIconComponent } from '../../../shared/ui/m-icon.component';

export interface Tile {
  id: string;
  name: string;
  stream?: MediaStream | null;
  isLocal?: boolean;
  muted?: boolean;
  camOff?: boolean;
  isHost?: boolean;
  pinned?: boolean;
  /** True when this tile carries a shared screen instead of a camera. */
  screen?: boolean;
  /** True when this participant is the active speaker (highlight ring). */
  speaking?: boolean;
}

/**
 * Adaptive video grid (Google Meet style).
 * - Picks the rows x cols arrangement that maximises tile size for the
 *   measured container, so 1-2-3-4-... tiles always fill the stage nicely.
 * - Paginates when there are more tiles than `maxPerPage`, with prev/next.
 * - A pinned/presenter tile spotlights large with the rest in a side rail.
 */
@Component({
  selector: 'meeting-stage',
  standalone: true,
  imports: [CommonModule, MAvatarComponent, MIconComponent],
  template: `
    <div class="stage" [class.spotlight]="pinned">
      <div class="featured" *ngIf="pinned">
        <ng-container *ngTemplateOutlet="tile; context: { $implicit: pinned, big: true }"></ng-container>
      </div>

      <div #gridEl class="grid" [class.rail]="!!pinned"
           [style.grid-template-columns]="pinned ? null : colsTemplate"
           [style.grid-template-rows]="pinned ? null : rowsTemplate">
        <ng-container *ngFor="let t of renderTiles(); trackBy: trackById">
          <ng-container *ngTemplateOutlet="tile; context: { $implicit: t }"></ng-container>
        </ng-container>
      </div>

      <div class="pager" *ngIf="!pinned && pageCount > 1">
        <button class="pg" (click)="prevPage()" [disabled]="page === 0" title="Previous page">
          <m-icon name="chevron_left" [size]="20" />
        </button>
        <span class="pg-label">{{ page + 1 }} / {{ pageCount }}</span>
        <button class="pg" (click)="nextPage()" [disabled]="page >= pageCount - 1" title="Next page">
          <m-icon name="chevron_right" [size]="20" />
        </button>
      </div>
    </div>

    <ng-template #tile let-t let-big="big">
      <div class="tile" [class.big]="big" [class.local]="t.isLocal"
           [class.cam-off]="!t.screen && (t.camOff || !t.stream)"
           [class.screen]="t.screen" [class.speaking]="t.speaking"
           (click)="pinToggle.emit(t.id)">
        <video *ngIf="t.stream" [class.hidden]="!t.screen && t.camOff"
               [srcObject]="t.stream" autoplay playsinline [muted]="t.isLocal"></video>
        <div class="avatar-wrap" *ngIf="!t.screen && (t.camOff || !t.stream)">
          <m-avatar [name]="t.name" [size]="big ? 120 : 72" />
        </div>
        <div class="label">
          <m-icon *ngIf="t.screen" name="present_to_all" [size]="14" />
          <m-icon *ngIf="!t.screen && t.muted" name="mic_off" [size]="14" />
          <span>{{ t.name }}<span *ngIf="t.isLocal" class="you"> (you)</span><span *ngIf="t.screen" class="you"> · screen</span></span>
          <m-icon *ngIf="t.isHost" name="shield" [size]="14" />
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; flex: 1; padding: 8px; min-height: 0; overflow: hidden; }
    .stage { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 8px; }
    .stage.spotlight .featured { flex: 1; min-height: 0; }
    .featured .tile { width: 100%; height: 100%; }

    /* Adaptive tiled grid: columns/rows are set inline from the fit algorithm. */
    .grid {
      flex: 1; min-height: 0; display: grid; gap: 8px;
      align-content: stretch; justify-content: stretch;
    }
    .grid.rail {
      flex: 0 0 132px; grid-auto-flow: column;
      grid-template-columns: none !important; grid-template-rows: none !important;
      grid-auto-columns: 200px; overflow-x: auto; align-content: center;
    }

    .tile {
      position: relative; background: #1f2024; border-radius: 12px; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 100%; min-height: 0; min-width: 0; cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
      transition: box-shadow .12s ease;
    }
    .tile.speaking { box-shadow: inset 0 0 0 3px var(--m-primary, #1a73e8); }
    .grid.rail .tile { aspect-ratio: 16/9; height: 132px; width: 200px; }
    .tile.big { height: 100%; }
    .tile.screen { background: #0b0c0e; }
    video { width: 100%; height: 100%; object-fit: cover; }
    /* Screen shares must show the whole frame, not crop it. */
    .tile.screen video { object-fit: contain; }
    /* Keep the element in the DOM (audio keeps playing) but hide the picture
       when the camera is off — the avatar overlay shows instead. */
    video.hidden { display: none; }
    .tile.local:not(.screen) video { transform: scaleX(-1); }
    .avatar-wrap { display: flex; align-items: center; justify-content: center; }

    .label {
      position: absolute; left: 12px; bottom: 12px;
      display: flex; align-items: center; gap: 6px;
      background: rgba(0,0,0,.55); color: white; padding: 4px 10px;
      border-radius: 8px; font-size: 12px; font-weight: 500;
      backdrop-filter: blur(4px); max-width: calc(100% - 24px);
    }
    .label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .you { color: rgba(255,255,255,.6); font-weight: 400; }

    .pager {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 12px;
      padding-top: 2px;
    }
    .pg {
      width: 36px; height: 36px; border: 0; border-radius: 50%; cursor: pointer;
      background: var(--m-surface-2, #2a2b2f); color: var(--m-text, #e8eaed);
      display: inline-flex; align-items: center; justify-content: center;
      transition: background-color .12s ease;
    }
    .pg:hover:not(:disabled) { background: var(--m-elevated, #3a3b40); }
    .pg:disabled { opacity: .4; cursor: default; }
    .pg-label { font-size: 13px; color: var(--m-text-muted, #9aa0a6); min-width: 48px; text-align: center; }
  `]
})
export class MeetingStageComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() tiles: Tile[] = [];
  /** Maximum tiles shown per page before paginating. */
  @Input() maxPerPage = 12;
  /** Emitted when a tile is clicked, so the host page can pin/spotlight it. */
  @Output() pinToggle = new EventEmitter<string>();

  @ViewChild('gridEl') gridEl?: ElementRef<HTMLElement>;

  page = 0;
  pageCount = 1;
  colsTemplate = '1fr';
  rowsTemplate = '1fr';

  private gridW = 0;
  private gridH = 0;
  private ro?: ResizeObserver;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    this.recompute();
  }

  ngAfterViewInit() {
    const el = this.gridEl?.nativeElement;
    if (el && 'ResizeObserver' in window) {
      this.ro = new ResizeObserver(entries => {
        const r = entries[0]?.contentRect;
        if (!r) return;
        this.gridW = r.width;
        this.gridH = r.height;
        this.computeFit();
        this.cdr.detectChanges();
      });
      this.ro.observe(el);
    }
  }

  ngOnDestroy() {
    this.ro?.disconnect();
  }

  get pinned(): Tile | null {
    return this.tiles.find(t => t.pinned) ?? null;
  }

  /** Tiles eligible for the grid (everything except the spotlighted one), ordered. */
  private ordered(): Tile[] {
    const rank = (t: Tile) => (t.screen ? 0 : t.isLocal ? 1 : t.isHost ? 2 : 3);
    return this.tiles.filter(t => !t.pinned).sort((a, b) => rank(a) - rank(b));
  }

  /** The tiles to actually render: all (rail) when pinned, else the current page. */
  renderTiles(): Tile[] {
    const list = this.ordered();
    if (this.pinned) return list;
    const start = this.page * this.maxPerPage;
    return list.slice(start, start + this.maxPerPage);
  }

  prevPage() {
    if (this.page > 0) { this.page--; this.computeFit(); }
  }

  nextPage() {
    if (this.page < this.pageCount - 1) { this.page++; this.computeFit(); }
  }

  /** Recompute pagination bounds and the grid fit. */
  private recompute() {
    const total = this.ordered().length;
    this.pageCount = Math.max(1, Math.ceil(total / this.maxPerPage));
    if (this.page > this.pageCount - 1) this.page = this.pageCount - 1;
    if (this.page < 0) this.page = 0;
    this.computeFit();
  }

  /**
   * Choose the columns x rows arrangement that maximises tile area for the
   * current page's tile count within the measured container.
   */
  private computeFit() {
    const n = this.renderTiles().length;
    if (n <= 0) { this.colsTemplate = '1fr'; this.rowsTemplate = '1fr'; return; }

    // Fallback before the container is measured: near-square arrangement.
    if (!this.gridW || !this.gridH) {
      const c = Math.ceil(Math.sqrt(n));
      this.colsTemplate = `repeat(${c}, 1fr)`;
      this.rowsTemplate = `repeat(${Math.ceil(n / c)}, 1fr)`;
      return;
    }

    const gap = 8;
    const aspect = 16 / 9;
    let best = { cols: 1, rows: n, area: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cellW = (this.gridW - gap * (cols - 1)) / cols;
      const cellH = (this.gridH - gap * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) continue;
      // Tile keeps 16:9 inside the cell; area is what the viewer perceives.
      let w = cellW, h = cellW / aspect;
      if (h > cellH) { h = cellH; w = cellH * aspect; }
      const area = w * h;
      if (area > best.area) best = { cols, rows, area };
    }
    this.colsTemplate = `repeat(${best.cols}, 1fr)`;
    this.rowsTemplate = `repeat(${best.rows}, 1fr)`;
  }

  trackById = (_: number, t: Tile) => t.id;
}
