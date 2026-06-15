# Zoomy Frontend (Angular Web App)

The browser client for Zoomy — the meeting room, lobby, interview admin panel,
and the in-browser AI proctoring pipeline. Both the **interviewer** and the
**candidate** use this app in a normal browser; the candidate additionally runs
the desktop Safe Agent alongside it.

- **Framework:** Angular 18 (standalone components, signals)
- **Dev server:** http://localhost:4200
- **Real-time:** WebRTC (mesh) for media + STOMP/SockJS for signaling
- **On-device AI:** MediaPipe FaceLandmarker for gaze / face proctoring

---

## What lives here

| Area | Description |
|------|-------------|
| **Meeting room** | Adaptive Google-Meet-style grid, pin/spotlight, screen share as a separate stream, chat, hand-raise. |
| **WebRTC mesh** | One `RTCPeerConnection` per peer with perfect-negotiation (`core/room.service.ts`). |
| **Signaling** | STOMP over SockJS to the backend (`/app/room/{id}/…`, `/topic/room/{id}/…`). |
| **Interview mode** | Admin panel with live proctor signals, 2-D gaze pad, environment-scan control, and a desktop-agent status banner. |
| **AI proctoring** | `core/gaze-observer.service.ts` runs MediaPipe FaceLandmarker (self-hosted WASM + model) to detect off-screen gaze, multiple faces, no face. |
| **Safe Agent gate** | Interview candidates are routed to `safe-browser-required` until the desktop agent connects (`core/safe-agent.client.ts`). |
| **Editor / tools** | Monaco-based code IDE and notepad tools in the side drawer. |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 18 or 20 LTS | Includes npm. |
| **Angular CLI** | 18 | Installed locally via `devDependencies`; use `npx`. |
| **Running backend** | — | Start [`../backend`](../backend) first (port 8080). |

> **Windows / PowerShell:** the execution policy blocks `npm.ps1`. Always use
> **`npm.cmd`** and **`npx.cmd`** (or run from `cmd`).

---

## Run locally

```powershell
# 1. Install dependencies (first time only)
npm.cmd install

# 2. Start the dev server (http://localhost:4200)
npm.cmd start
```

```bash
# macOS / Linux
npm install
npm start
```

The dev server proxies API calls to `http://localhost:8080`. Open
**http://localhost:4200**, sign up / sign in, and create a meeting.

---

## Build

```powershell
npx.cmd ng build --configuration=development   # dev build → dist/
npx.cmd ng build                               # production build
```

---

## Self-hosted MediaPipe assets

The gaze pipeline loads its WASM runtime and the `face_landmarker.task` model
from our **own origin** (no public CDN), so proctoring works offline and leaks
no data:

- `src/assets/mediapipe/wasm/` — copied from `@mediapipe/tasks-vision` by the
  `angular.json` asset globs.
- `src/assets/mediapipe/face_landmarker.task` — the committed model (~3.6 MB).

If you change the `angular.json` asset config, restart the dev server so the
assets are re-copied.

---

## Notable runtime notes

- **SockJS + `global`:** `src/index.html` sets `window.global = window` before the
  app boots (sockjs-client references Node's `global`).
- **CORS:** the app may run on `localhost:4200` or `127.0.0.1:4200`; the backend
  allows both origin patterns.
- **Camera light:** turning the camera off fully stops the track (`track.stop()`),
  so the hardware indicator turns off — not just a muted frame.
