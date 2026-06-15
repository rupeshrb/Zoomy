import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** A single gaze/presence signal derived from the local camera. */
export interface GazeSignal {
  kind: 'GAZE_OFF_SCREEN' | 'NO_FACE' | 'MULTIPLE_FACES';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
}

/** Continuous horizontal+vertical-gaze telemetry for the live interviewer readout. */
export interface GazeReading {
  /** -1 (viewer's left) … 0 (centre) … +1 (viewer's right). */
  x: number;
  /** -1 (up) … 0 (centre) … +1 (down). */
  y: number;
  /** Horizontal zone. */
  label: 'Left' | 'Center' | 'Right';
  /** Vertical zone. */
  vlabel: 'Up' | 'Center' | 'Down';
  /** True when a single face is currently tracked (reading is valid). */
  faces: number;
}

/**
 * MediaPipe WASM runtime + FaceLandmarker model, both self-hosted from our own
 * origin (copied into assets at build time) — no public CDN dependency, so the
 * observer works on locked-down/offline networks and keeps everything private.
 */
const WASM_URL = 'assets/mediapipe/wasm';
const MODEL_URL = 'assets/mediapipe/face_landmarker.task';

// Detection cadence and debounce windows (ms).
const INTERVAL_MS = 160;
const AWAY_MS = 1200;     // sustained look-away before flagging
const NO_FACE_MS = 1500;  // sustained empty frame before flagging
const MULTI_MS = 1000;    // sustained extra face before flagging
const COOLDOWN_MS = 6000; // min gap between repeats of the same signal

/**
 * In-browser gaze / presence observer (proctoring).
 *
 * Runs Google MediaPipe FaceLandmarker locally on the user's own camera —
 * no video ever leaves the device. It emits coarse signals (looking away,
 * no face, multiple faces) that the meeting room forwards to the host.
 *
 * The model + WASM are dynamically imported so they are only downloaded when
 * proctoring actually starts (keeps the main bundle small).
 */
@Injectable({ providedIn: 'root' })
export class GazeObserverService {
  /** Emits whenever a debounced gaze/presence signal is raised. */
  readonly event = new Subject<GazeSignal>();

  /** Emits a continuous horizontal-gaze reading on every analysed frame. */
  readonly reading = new Subject<GazeReading>();

  private landmarker?: { detectForVideo: Function; close: Function };
  private video?: HTMLVideoElement;
  private timer?: any;
  private running = false;

  private awaySince = 0;
  private noFaceSince = 0;
  private multiSince = 0;
  private lastEmit: Record<string, number> = {};

  /** Begin observing the given local camera stream. Safe to call repeatedly. */
  async start(stream: MediaStream): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      const opts = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' as const },
        runningMode: 'VIDEO' as const,
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      };
      try {
        this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts) as any;
      } catch {
        // Some machines/headless envs lack a GPU delegate — fall back to CPU.
        this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          ...opts, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' as const }
        }) as any;
      }
    } catch {
      // Model/WASM failed to load (assets missing) — observer stays idle.
      this.running = false;
      return;
    }

    if (!this.running) { try { this.landmarker?.close(); } catch { /* */ } return; }

    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    try { await v.play(); } catch { /* autoplay edge cases */ }
    this.video = v;
    this.loop();
  }

  /** Stop observing and release the model. */
  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    try { this.landmarker?.close(); } catch { /* */ }
    this.landmarker = undefined;
    if (this.video) { this.video.srcObject = null; this.video = undefined; }
    this.awaySince = this.noFaceSince = this.multiSince = 0;
  }

  private loop = () => {
    if (!this.running || !this.landmarker || !this.video) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      try {
        const res = this.landmarker.detectForVideo(v, performance.now());
        this.analyze(res);
      } catch { /* transient inference error */ }
    }
    this.timer = setTimeout(this.loop, INTERVAL_MS);
  };

  private analyze(res: any) {
    const faces: any[] = res?.faceLandmarks ?? [];
    const now = Date.now();

    if (faces.length === 0) {
      this.multiSince = 0; this.awaySince = 0;
      this.reading.next({ x: 0, y: 0, label: 'Center', vlabel: 'Center', faces: 0 });
      if (!this.noFaceSince) this.noFaceSince = now;
      else if (now - this.noFaceSince > NO_FACE_MS) this.emit('NO_FACE', 'WARN', 'No face detected on camera');
      return;
    }
    this.noFaceSince = 0;

    if (faces.length > 1) {
      this.awaySince = 0;
      this.reading.next({ x: 0, y: 0, label: 'Center', vlabel: 'Center', faces: faces.length });
      if (!this.multiSince) this.multiSince = now;
      else if (now - this.multiSince > MULTI_MS) this.emit('MULTIPLE_FACES', 'CRITICAL', `${faces.length} faces detected in frame`);
      return;
    }
    this.multiSince = 0;

    // Continuous 2-D gaze reading for the live interviewer readout.
    const x = this.gazeX(res, faces[0]);
    const y = this.gazeY(res, faces[0]);
    const label: GazeReading['label'] = x < -0.28 ? 'Left' : x > 0.28 ? 'Right' : 'Center';
    const vlabel: GazeReading['vlabel'] = y < -0.30 ? 'Up' : y > 0.30 ? 'Down' : 'Center';
    this.reading.next({ x, y, label, vlabel, faces: 1 });

    if (this.isLookingAway(res, faces[0])) {
      if (!this.awaySince) this.awaySince = now;
      else if (now - this.awaySince > AWAY_MS) this.emit('GAZE_OFF_SCREEN', 'WARN', this.awayReason(label, vlabel));
    } else {
      this.awaySince = 0;
    }
  }

  /** Human-readable reason for the off-screen alert based on direction. */
  private awayReason(h: GazeReading['label'], v: GazeReading['vlabel']): string {
    if (v === 'Down') return 'Looking down (away from screen)';
    if (v === 'Up') return 'Looking up (away from screen)';
    if (h !== 'Center') return `Looking ${h.toLowerCase()} (away from screen)`;
    return 'Looking away from the screen';
  }

  /**
   * Continuous horizontal gaze in -1..+1 from the interviewer's perspective
   * (the un-mirrored remote video they see): negative = candidate looking to
   * the viewer's left, positive = viewer's right. Combines eye-gaze blendshapes
   * with head-turn geometry; both share the same sign convention.
   */
  private gazeX(res: any, landmarks: any[]): number {
    let eyeX = 0;
    const cats = res?.faceBlendshapes?.[0]?.categories as Array<{ categoryName: string; score: number }> | undefined;
    if (cats) {
      const m: Record<string, number> = {};
      for (const c of cats) m[c.categoryName] = c.score;
      const subjRight = ((m['eyeLookOutRight'] || 0) + (m['eyeLookInLeft'] || 0)) / 2;  // viewer's left
      const subjLeft = ((m['eyeLookOutLeft'] || 0) + (m['eyeLookInRight'] || 0)) / 2;   // viewer's right
      eyeX = subjLeft - subjRight;
    }

    let headX = 0;
    if (landmarks && landmarks.length > 454) {
      const nose = landmarks[1], rightCheek = landmarks[234], leftCheek = landmarks[454];
      const dr = Math.hypot(nose.x - rightCheek.x, nose.y - rightCheek.y);
      const dl = Math.hypot(nose.x - leftCheek.x, nose.y - leftCheek.y);
      // nose drifts toward the cheek the head turns away from; sign matches eyeX.
      headX = (dr - dl) / (dr + dl || 1);
    }

    return Math.max(-1, Math.min(1, eyeX * 1.5 + headX * 0.9));
  }

  /**
   * Continuous vertical gaze in -1 (up) .. +1 (down). Combines eye-gaze
   * blendshapes (eyeLookUp/Down) with head pitch estimated from the nose's
   * vertical offset relative to the eye line vs. the eye→chin span.
   */
  private gazeY(res: any, landmarks: any[]): number {
    let eyeY = 0;
    const cats = res?.faceBlendshapes?.[0]?.categories as Array<{ categoryName: string; score: number }> | undefined;
    if (cats) {
      const m: Record<string, number> = {};
      for (const c of cats) m[c.categoryName] = c.score;
      const down = ((m['eyeLookDownLeft'] || 0) + (m['eyeLookDownRight'] || 0)) / 2;
      const up = ((m['eyeLookUpLeft'] || 0) + (m['eyeLookUpRight'] || 0)) / 2;
      eyeY = down - up;
    }

    let headY = 0;
    if (landmarks && landmarks.length > 454) {
      const nose = landmarks[1], leftEye = landmarks[33], rightEye = landmarks[263], chin = landmarks[152];
      const eyeMidY = (leftEye.y + rightEye.y) / 2;
      const span = (chin.y - eyeMidY) || 1;        // eye-line → chin vertical span
      // Nose sits ~38% down that span when facing forward; deviation = pitch.
      headY = ((nose.y - eyeMidY) / span - 0.38) * 2.2;
    }

    return Math.max(-1, Math.min(1, eyeY * 1.4 + headY * 0.9));
  }

  /** Combine eye-gaze blendshapes with head-turn geometry into an away flag. */
  private isLookingAway(res: any, landmarks: any[]): boolean {
    let eyeAway = false;
    const cats = res?.faceBlendshapes?.[0]?.categories as Array<{ categoryName: string; score: number }> | undefined;
    if (cats) {
      const m: Record<string, number> = {};
      for (const c of cats) m[c.categoryName] = c.score;
      const gazeRight = ((m['eyeLookOutRight'] || 0) + (m['eyeLookInLeft'] || 0)) / 2;
      const gazeLeft = ((m['eyeLookOutLeft'] || 0) + (m['eyeLookInRight'] || 0)) / 2;
      const gazeDown = ((m['eyeLookDownLeft'] || 0) + (m['eyeLookDownRight'] || 0)) / 2;
      const gazeUp = ((m['eyeLookUpLeft'] || 0) + (m['eyeLookUpRight'] || 0)) / 2;
      eyeAway = Math.max(gazeLeft, gazeRight) > 0.55 || gazeDown > 0.6 || gazeUp > 0.62;
    }

    let headAway = false;
    if (landmarks && landmarks.length > 454) {
      const nose = landmarks[1], left = landmarks[234], right = landmarks[454];
      const dl = Math.hypot(nose.x - left.x, nose.y - left.y);
      const dr = Math.hypot(nose.x - right.x, nose.y - right.y);
      const ratio = (dl - dr) / (dl + dr || 1);
      headAway = Math.abs(ratio) > 0.3;
    }

    // Strong vertical pitch (looking down at notes/phone, or up) also counts.
    const vAway = Math.abs(this.gazeY(res, landmarks)) > 0.5;

    return eyeAway || headAway || vAway;
  }

  private emit(kind: GazeSignal['kind'], severity: GazeSignal['severity'], message: string) {
    const now = Date.now();
    if (now - (this.lastEmit[kind] || 0) < COOLDOWN_MS) return;
    this.lastEmit[kind] = now;
    this.event.next({ kind, severity, message });
  }
}
