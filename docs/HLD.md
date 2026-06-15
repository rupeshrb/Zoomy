# Zoomy — High-Level Design (HLD)

> Architecture-level view of the Zoomy proctored video-interview platform.
> For class/method-level detail see [LLD.md](LLD.md). For the gRPC hosting
> question see [GRPC-HOSTING.md](GRPC-HOSTING.md).

---

## 1. Purpose & scope

Zoomy is a real-time video-interview platform whose distinguishing feature is a
**native anti-cheat companion agent**. The interview runs in an ordinary browser
for both parties, while a small desktop agent on the candidate's machine performs
operating-system-level cheat detection that browsers cannot, and streams proof to
the interviewer in real time.

The system has **three deployable units** plus a shared **data tier**:

| Unit | Tech | Runs where |
|------|------|-----------|
| Frontend (web client) | Angular 18 | Candidate & interviewer browsers |
| Backend (API + gRPC server) | Spring Boot 3 / Java 21 | Server (cloud/VM) |
| Desktop agent | JavaFX 21 + JNA | Candidate's Windows machine |
| Data tier | Kafka, Redis, MongoDB | Server (Docker) |

---

## 2. C4 Level-1 — System context

```mermaid
flowchart TB
    interviewer([Interviewer])
    candidate([Candidate])

    subgraph Zoomy["Zoomy Platform"]
        web["Web App (Angular)"]
        api["Backend (Spring Boot)\nREST + WebSocket + gRPC"]
        agent["Desktop Safe Agent (JavaFX)"]
        data[("Data tier\nKafka · Redis · MongoDB")]
    end

    interviewer -->|"uses browser"| web
    candidate -->|"uses browser"| web
    candidate -->|"runs alongside browser"| agent

    web <-->|"REST / WebSocket"| api
    web <-->|"WebRTC media (P2P)"| web
    agent <-->|"gRPC :9090"| api
    web -->|"loopback handshake 127.0.0.1:7070"| agent
    api --> data
```

---

## 3. C4 Level-2 — Container view

```mermaid
flowchart LR
    subgraph Browser["Browser (candidate + interviewer)"]
        ng["Angular SPA"]
        mp["MediaPipe gaze AI (WASM, on-device)"]
        ng --- mp
    end

    subgraph Server["Application server"]
        rest["REST controllers\n(auth, meetings, rooms)"]
        stomp["STOMP / WebSocket broker\n(signaling, chat, proctor)"]
        grpc["gRPC SafeBrowserService\n(:9090)"]
        kprod["Kafka producer\n(proctor-events)"]
    end

    subgraph Desktop["Candidate desktop"]
        fx["JavaFX UI"]
        loop["Loopback HTTP listener\n(127.0.0.1:7070)"]
        scan["ProctorScanner (JNA / Win32)"]
        fx --- loop --- scan
    end

    subgraph Data["Data tier (Docker)"]
        kafka[("Kafka")]
        redis[("Redis")]
        mongo[("MongoDB")]
    end

    ng -->|"HTTPS REST"| rest
    ng <-->|"WSS STOMP"| stomp
    ng -->|"hand off session"| loop
    fx -->|"gRPC Connect + Session"| grpc

    rest --> mongo
    stomp --> redis
    grpc --> kprod --> kafka
    grpc -->|"bridge findings"| stomp
```

---

## 4. Three transport styles (and why)

Zoomy intentionally uses three real-time transports, each chosen for its job.

```mermaid
flowchart TB
    subgraph WebRTC["WebRTC — peer media"]
        a1["Audio / video / screen, P2P mesh"]
    end
    subgraph STOMP["STOMP/WebSocket — coordination"]
        b1["Signaling, presence, chat, host controls,\ngaze telemetry, live proctor alerts"]
    end
    subgraph GRPC["gRPC — desktop agent control"]
        c1["Bi-directional: findings up,\nhost commands down"]
    end
```

| Transport | Carries | Why this and not the others |
|-----------|---------|------------------------------|
| **WebRTC** | Audio/video/screen | Lowest-latency P2P media; no server in the media path for small rooms. |
| **STOMP/WebSocket** | Signaling, chat, presence, proctor alerts | Topic pub/sub fits room broadcast; the browser speaks it natively. |
| **gRPC** | Desktop agent ↔ backend | Strongly-typed, efficient, full-duplex streaming for a long-lived native client. A browser cannot speak native gRPC, which is fine — only the desktop agent uses it. |

---

## 5. Key end-to-end flow — interview with proctoring

```mermaid
sequenceDiagram
    autonumber
    participant C as Candidate browser
    participant A as Desktop agent
    participant API as Backend
    participant H as Interviewer browser

    C->>API: REST login (JWT)
    C->>API: open interview link
    API-->>C: gate → "Safe Agent required"
    C->>A: loopback handshake (token, meetingId) 127.0.0.1:7070
    A->>API: gRPC Connect(JWT, meetingId)
    API-->>A: ConnectResponse(agentId, ok)
    A->>API: gRPC Session — heartbeat + scan loop
    API-->>H: STOMP proctor alert "AGENT_CONNECTED"
    Note over A: every 4s native window scan
    A->>API: ProctorSignal(HIDDEN_OVERLAY_WINDOW, CRITICAL)
    API->>API: Kafka publish proctor-event
    API-->>H: STOMP proctor alert (live)
    H->>API: "Scan now" host command
    API-->>A: HostCommand(rescan) via gRPC
    A->>API: fresh findings
    C-->>API: WebRTC media ↔ H (P2P)
```

---

## 6. Quality attributes

| Attribute | How it's met |
|-----------|--------------|
| **Real-time** | WebRTC for media; STOMP fan-out for alerts; gRPC streaming for the agent. |
| **Security** | JWT (15-min access + 7-day refresh), Redis rate limiting (fail-open), OWASP-safe error bodies, on-device AI (no webcam frames leave the browser). |
| **Resilience** | Agent auto-reconnect with token refresh; STOMP session-disconnect → auto-leave; Kafka decouples ingestion from fan-out. |
| **Scalability path** | Mesh→SFU for big rooms; Redis for presence; Kafka for durable event stream; stateless backend behind a load balancer (sticky for WS/gRPC). |
| **Portability** | Data tier in Docker Compose; agent packaged as a native `.exe` via jpackage. |

---

## 7. Deployment topology (hosted)

```mermaid
flowchart TB
    subgraph Internet
        cb["Candidate browser"]
        ca["Candidate desktop agent"]
        ib["Interviewer browser"]
    end

    subgraph Cloud["Cloud / VM"]
        lb["Load balancer / reverse proxy\n(TLS termination, HTTP/2)"]
        subgraph App["App server(s)"]
            be["Spring Boot\n:8080 REST+WS · :9090 gRPC"]
        end
        subgraph DataTier["Managed / containerized data"]
            k[("Kafka")]
            r[("Redis")]
            m[("MongoDB")]
        end
    end

    cb -->|"HTTPS / WSS 443"| lb
    ib -->|"HTTPS / WSS 443"| lb
    ca -->|"gRPC/TLS 9090 or 443"| lb
    lb --> be
    be --> k & r & m
```

> The candidate's browser→agent link stays on `127.0.0.1:7070` (same machine), so
> it is unaffected by hosting. Only the **agent→backend gRPC** leg crosses the
> internet — see [GRPC-HOSTING.md](GRPC-HOSTING.md).
