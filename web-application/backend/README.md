# Zoomy Backend (Spring Boot API + gRPC)

The server tier of the Zoomy web application. It handles authentication, meeting
lifecycle, real-time signaling, chat, proctoring telemetry, and a dedicated
**gRPC** channel for the desktop anti-cheat agent.

- **Framework:** Spring Boot 3.3.x · Java 21
- **HTTP / REST + WebSocket (STOMP):** port `8080`
- **gRPC server (desktop agent):** port `9090`
- **Datastores:** MongoDB (durable), Redis (hot state + rate limiting), Kafka (event stream)

---

## What lives here

| Area | Description |
|------|-------------|
| **Auth** | Email/password sign-up & login, JWT access (15 min) + refresh (7 days), refresh-token rotation. |
| **Meetings** | Create / resolve / end meetings, `NORMAL` vs `INTERVIEW` mode, optional password gate. |
| **Signaling** | STOMP/WebSocket relay for WebRTC offer/answer/ICE, presence, chat, host controls, gaze telemetry. |
| **Proctoring** | Ingests browser + desktop-agent anti-cheat signals and fans them out to the interviewer over STOMP. |
| **gRPC `SafeBrowserService`** | Bi-directional stream with the JavaFX desktop agent (handshake + live findings + host commands). |
| **Resilience** | Global exception handler (OWASP-safe error bodies) and a Redis-backed fixed-window rate limiter (fail-open). |

Key packages: `auth/`, `meeting/`, `room/` (STOMP controllers), `grpc/`
(`SafeBrowserGrpcService`, `SafeAgentRegistry`), `common/` (error handling +
rate limiting). The gRPC contract is `src/main/proto/safebrowser.proto`.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **JDK** | 21 (LTS) | Temurin / Eclipse Adoptium recommended. |
| **Maven** | 3.9+ | Or use the bundled wrapper if present. |
| **MongoDB** | 7.x | `mongodb://localhost:27017` |
| **Redis** | 7.x | `localhost:6379` |
| **Apache Kafka** | 7.6 (Confluent) | `localhost:9092` |

> The four backing services are provided ready-to-run by
> [`../infra/docker-compose.yml`](../infra/docker-compose.yml) — start those first.

---

## Run locally

1. **Start infrastructure** (from `../infra`): `docker compose up -d`
2. **Run the API:**

   ```powershell
   # Windows PowerShell
   $env:JAVA_HOME = "C:\path\to\jdk-21"
   $env:PATH      = "$env:JAVA_HOME\bin;$env:PATH"
   mvn -DskipTests spring-boot:run
   ```

   ```bash
   # macOS / Linux
   export JAVA_HOME=/path/to/jdk-21
   mvn -DskipTests spring-boot:run
   ```

3. The API is now on **http://localhost:8080** and gRPC on **localhost:9090**.
   Health check: `GET http://localhost:8080/actuator/health` → `{"status":"UP"}`.

### Corporate TLS proxy note
On networks with a TLS-intercepting proxy, the JDK truststore may reject Maven
downloads (`PKIX path building failed`). Build with the Windows certificate store:

```powershell
$env:MAVEN_OPTS = "-Djavax.net.ssl.trustStoreType=Windows-ROOT"
```

(See `../infra/setup-corp-truststore.ps1`.)

---

## Configuration

All settings live in `src/main/resources/application.yml` and are overridable by
environment variable. The most useful ones:

| Env var | Default | Purpose |
|---------|---------|---------|
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection. |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis. |
| `KAFKA_BOOTSTRAP` | `localhost:9092` | Kafka brokers. |
| `ZOOMY_GRPC_PORT` | `9090` | gRPC server port. |
| `JWT_SECRET` | dev value | **Must** be ≥ 32 bytes in production. |
| `ZOOMY_CORS_ORIGINS` | `http://localhost:*,http://127.0.0.1:*,…` | Allowed web origins. |
| `ZOOMY_RATELIMIT_ENABLED` | `true` | Toggle the Redis rate limiter. |

MongoDB databases: `zoomy_auth`, `zoomy_meeting`, `zoomy_proctor`, `zoomy_chat`.

---

## Build & package

```bash
mvn -DskipTests clean package      # → target/*.jar
mvn -DskipTests compile            # quick compile check
```

A `Dockerfile` is included for containerized deploys (multi-stage Temurin build).

---

## How the desktop agent connects

1. The candidate's browser hands the session to the local agent over loopback HTTP.
2. The agent calls gRPC `Connect` (JWT handshake) → `SafeAgentRegistry` records it.
3. A bi-directional `Session` stream carries anti-cheat findings **up** and host
   commands (e.g. *rescan*, *end*) **down**.
4. Findings are bridged onto `/topic/room/{id}/proctor` so the interviewer's web
   app shows them live. The browser interview gate releases once
   `GET /api/meetings/{id}/safe-agent` reports the agent connected.
