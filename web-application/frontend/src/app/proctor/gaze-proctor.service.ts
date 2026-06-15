import { Injectable, NgZone } from '@angular/core';
import {
  FaceLandmarker, FilesetResolver, FaceLandmarkerResult
} from '@mediapipe/tasks-vision';
import { ProctorService } from './proctor.service';
import { ProctorEvent } from './proctor-event.model';

/**
 * Browser-side proctor signals:
 *  - Gaze direction via iris landmarks (MediaPipe FaceLandmarker)
 *  - Multi-face / no-face detection
 *  - Tab/window blur, paste, devtools heuristic
 *
 * Calls `ProctorService.emit` whenever a signal fires. Renders overlay markers
 * into the provided canvas so the candidate can SEE that proctoring is on
 * (which alone reduces cheating significantly).
 */
@Injectable({ providedIn: 'root' })
export class GazeProctorService {
  private landmarker?: FaceLandmarker;
  private rafId = 0;
  private offScreenFrames = 0;
  private noFaceFrames = 0;
  private session = { sessionId: '', candidateId: '' };

  constructor(private zone: NgZone, private proctor: ProctorService) {}

  async start(video: HTMLVideoElement, overlay: HTMLCanvasElement,
              sessionId: string, candidateId: string): Promise<void> {
    this.session = { sessionId, candidateId };

    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm');
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 3,
      outputFaceBlendshapes: true
    });

    this.hookBrowserSignals();
    this.zone.runOutsideAngular(() => this.loop(video, overlay));
  }

  stop(): void { cancelAnimationFrame(this.rafId); this.landmarker?.close(); }

  // ------------------------------------------------------------- vision loop
  private loop(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    const ctx = overlay.getContext('2d')!;
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (video.readyState < 2 || !this.landmarker) return;
      overlay.width = video.videoWidth; overlay.height = video.videoHeight;

      const res: FaceLandmarkerResult = this.landmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const faces = res.faceLandmarks?.length ?? 0;

      if (faces === 0) {
        this.noFaceFrames++;
        if (this.noFaceFrames === 30) this.fire('NO_FACE', 'WARN', 'Candidate left the frame');
        return;
      }
      this.noFaceFrames = 0;

      if (faces > 1) {
        this.fireOnce('MULTIPLE_FACES', 'CRITICAL', `${faces} faces detected in frame`);
      }

      const lm = res.faceLandmarks[0];
      // Iris landmarks: left iris 468–472, right iris 473–477 (MediaPipe FaceMesh w/ refineLandmarks)
      // FaceLandmarker has 478 landmarks when refine is on.
      const lIris = lm[468], rIris = lm[473];
      // Eye corners
      const lOuter = lm[33], lInner = lm[133];
      const rInner = lm[362], rOuter = lm[263];

      if (lIris && rIris && lOuter && lInner && rInner && rOuter) {
        // Normalized horizontal position of iris within each eye [0..1]
        const lx = (lIris.x - lOuter.x) / (lInner.x - lOuter.x);
        const rx = (rIris.x - rInner.x) / (rOuter.x - rInner.x);
        const gazeX = (lx + rx) / 2; // ~0.5 = centered

        // Draw markers
        this.drawDot(ctx, lIris, overlay, '#22c55e');
        this.drawDot(ctx, rIris, overlay, '#22c55e');

        const offCenter = Math.abs(gazeX - 0.5);
        if (offCenter > 0.30) {
          this.offScreenFrames++;
          if (this.offScreenFrames === 45) { // ~1.5s @ 30fps
            this.fire('GAZE_OFF_SCREEN', 'WARN',
              `Sustained gaze away from screen (offset=${offCenter.toFixed(2)})`);
          }
        } else {
          this.offScreenFrames = 0;
        }
      }
    };
    tick();
  }

  private drawDot(ctx: CanvasRenderingContext2D, p: {x:number;y:number},
                  c: HTMLCanvasElement, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, 4, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------- browser signals
  private firedRecently = new Map<string, number>();
  private fireOnce(kind: ProctorEvent['kind'], sev: ProctorEvent['severity'], msg: string) {
    const last = this.firedRecently.get(kind) ?? 0;
    if (Date.now() - last < 5000) return;
    this.firedRecently.set(kind, Date.now());
    this.fire(kind, sev, msg);
  }

  private fire(kind: ProctorEvent['kind'], sev: ProctorEvent['severity'], msg: string) {
    this.proctor.emit({
      ...this.session, source: 'BROWSER', kind, severity: sev, message: msg
    });
  }

  private hookBrowserSignals() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.fire('TAB_BLUR', 'WARN', 'Tab hidden');
    });
    window.addEventListener('blur',
      () => this.fire('WINDOW_BLUR', 'INFO', 'Window lost focus'));
    document.addEventListener('paste',
      e => this.fire('PASTE_DETECTED', 'WARN',
        `Pasted ${e.clipboardData?.getData('text')?.length ?? 0} chars`));

    // Crude devtools heuristic
    setInterval(() => {
      const wDiff = window.outerWidth - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      if (wDiff > 200 || hDiff > 200) this.fireOnce('DEVTOOLS_OPEN', 'INFO', 'DevTools likely open');
    }, 3000);
  }
}
