# Zoomy Safe Agent Proctor (Desktop Application)

A lightweight **JavaFX** desktop companion the **candidate** runs alongside their
normal browser during a proctored interview. It proves to the backend (over
**gRPC**) that anti-cheat monitoring is active and natively detects the hidden
on-screen cheating tools a browser physically cannot see.

- **Framework:** JavaFX 21 · Java 21
- **Backend link:** gRPC client → `localhost:9090`
- **Browser handoff:** loopback HTTP listener on `127.0.0.1:7070`
- **Native inspection:** JNA → Win32 (`user32`, `shell32`, `psapi`)

---

## Why a desktop app?

A sandboxed browser cannot enumerate OS windows or read another process's
screen-capture flags. The cheating tools candidates use (Cluely, Interview Coder,
LockedIn AI, Parakeet AI, Cheetah, LeetCode Wizard, …) exploit exactly that gap:

| Trick | Win32 mechanism | How the agent catches it |
|-------|-----------------|--------------------------|
| **Invisible to screen share** | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` | Reads `GetWindowDisplayAffinity` on every top-level window. |
| **Hidden from taskbar / Alt-Tab** | `WS_EX_TOOLWINDOW` | Reads `GetWindowLong(GWL_EXSTYLE)`. |
| **Click-through overlay** | `WS_EX_LAYERED \| WS_EX_TRANSPARENT \| WS_EX_TOPMOST` | Style + geometry heuristics. |
| **Known cheat binaries** | — | Executable name/title blocklist + keyword match. |

When a hidden window is found, the agent **surfaces** it where the OS allows
(restores its taskbar/Alt-Tab button, drops always-on-top, strips click-through)
and reports it upstream as proof. (Clearing another process's capture exclusion is
a documented OS restriction, so that is reported rather than forced.)

Source: `ProctorScanner.java` (native scan + reveal), `AgentClient.java` (gRPC +
scan loop), `LocalListener.java` (browser handshake), `SafeAgentApp.java` (UI).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **JDK** | 21 (with JavaFX support) | Temurin 21 + the OpenJFX Maven deps (pulled automatically). |
| **Maven** | 3.9+ | |
| **OS** | Windows 10 2004+ | Native detection is Windows-only; the app no-ops elsewhere. |
| **Running backend** | — | The agent connects to gRPC on `localhost:9090`. |

The gRPC stubs are generated at build time from
`src/main/proto/safebrowser.proto` — a self-contained copy of the backend's
contract. **Keep it in sync** with `../../web-application/backend/src/main/proto`
if the wire protocol changes.

---

## Run locally (development)

```powershell
# from this folder
mvn -q javafx:run
```

On a corporate TLS proxy, prefix builds with:

```powershell
$env:MAVEN_OPTS = "-Djavax.net.ssl.trustStoreType=Windows-ROOT"
```

The window opens, starts the loopback listener on `127.0.0.1:7070`, and waits for
the browser to hand off the interview session. Status pill states: **Waiting →
Connecting → Protected** (or **Disconnected**, with a Reconnect button).

Override targets with system properties if needed:
`-Dzoomy.grpcHost=…  -Dzoomy.grpcPort=9090  -Dzoomy.agentPort=7070`.

---

## Build a Windows executable (`.exe`)

Produce a self-contained native app image (bundles a trimmed JRE — no Java needed
on the candidate's machine) with the JDK's `jpackage`:

```powershell
# 1. Build the runnable jar + copy dependencies
mvn -q -DskipTests clean package
mvn -q dependency:copy-dependencies -DoutputDirectory=target/libs

# 2. Download the JavaFX 21 jmods once (https://gluonhq.com/products/javafx/)
#    and unzip to e.g. C:\javafx-jmods-21

# 3. Package a native app image (creates target/dist/Zoomy Safe Agent/…/Zoomy Safe Agent.exe)
jpackage `
  --type app-image `
  --name "Zoomy Safe Agent" `
  --input target/libs `
  --main-jar zoomy-safe-agent-0.1.0.jar `
  --main-class com.zoomy.agent.SafeAgentApp `
  --module-path "C:\javafx-jmods-21" `
  --add-modules javafx.controls,javafx.graphics `
  --icon src/main/resources/zoomy-logo.ico `
  --dest target/dist

# Optional: use --type exe (requires WiX Toolset) to build a double-click installer.
```

> `make-logo.ps1` regenerates `src/main/resources/zoomy-logo.png` (the in-app +
> taskbar icon). Convert it to `.ico` for the `jpackage --icon` flag.

---

## Distribution model

The candidate downloads and runs this app, signs in to the same Zoomy account,
and the browser's interview gate releases once the agent's gRPC session is live.
If the candidate closes or loses the agent mid-interview, the interviewer is
notified and the candidate is asked to reconnect.
