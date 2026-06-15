# Zoomy Infrastructure (Docker Compose)

The backing services the Zoomy backend depends on, packaged as a single Docker
Compose stack so you can bring the whole data tier up with one command.

---

## Services

| Service | Image | Port(s) | Used for |
|---------|-------|---------|----------|
| **Kafka** | `confluentinc/cp-kafka:7.6.1` | `9092` | Proctor-event stream (producer/consumer). |
| **Zookeeper** | `confluentinc/cp-zookeeper:7.6.1` | `2181` | Kafka coordination. |
| **Redis** | `redis:7.2-alpine` | `6379` | Hot room/presence state + API rate limiting. |
| **MongoDB** | `mongo:7` | `27017` | Durable meetings, auth, chat, proctor history. |
| **Postgres** | `postgres:16-alpine` | `5432` | Reserved for the planned analytics / pgvector tier. |

Named volumes (`redis-data`, `mongo-data`, `pg-data`) persist data across
restarts.

---

## Prerequisites

| Tool | Notes |
|------|-------|
| **Docker Desktop** (or Docker Engine + Compose v2) | Windows, macOS, or Linux. |

---

## Usage

```bash
# Start everything in the background
docker compose up -d

# Check status / logs
docker compose ps
docker compose logs -f kafka

# Stop (keep data)
docker compose stop

# Tear down (and delete volumes)
docker compose down -v
```

Run these commands from this `infra/` directory.

---

## Building the app images (optional)

The `backend` and `frontend` service definitions are included but **commented
out**. Once you want to run the app fully containerized, uncomment them — their
build contexts point at the sibling folders:

```yaml
backend:
  build: ../backend
frontend:
  build: ../frontend
```

---

## Corporate TLS proxy helper

`setup-corp-truststore.ps1` exports the Windows root certificate store into a
Java-compatible truststore. Use it on networks with a TLS-intercepting proxy so
Maven/Gradle and the JVM trust the corporate CA. For most builds it is simpler to
set `MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` instead.
