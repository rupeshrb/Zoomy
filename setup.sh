#!/usr/bin/env bash
#
# One-click local setup / run for Zoomy (macOS / Linux).
#
# Verifies prerequisites, starts the Docker data tier (Kafka, Redis, MongoDB,
# Postgres), installs frontend dependencies, then launches the backend and
# frontend (and optionally the desktop agent) as background processes.
#
# Usage:
#   ./setup.sh                 # full stack
#   ./setup.sh --infra-only    # only the Docker data tier
#   ./setup.sh --skip-agent    # do not launch the desktop agent
#
# Note: the native anti-cheat detection is Windows-only; on macOS/Linux the
# desktop agent runs but the OS-level window scan no-ops.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/web-application/backend"
FRONTEND="$ROOT/web-application/frontend"
INFRA="$ROOT/web-application/infra"
AGENT="$ROOT/desktop-application/safe-agent-proctor"
LOGDIR="$ROOT/.run-logs"

INFRA_ONLY=0
SKIP_AGENT=0
for arg in "$@"; do
  case "$arg" in
    --infra-only) INFRA_ONLY=1 ;;
    --skip-agent) SKIP_AGENT=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---- 1. Prerequisite check -------------------------------------------------
step 'Checking prerequisites'
missing=()
have docker || missing+=('Docker (docker)')
have mvn    || missing+=('Maven (mvn)')
have node   || missing+=('Node.js (node)')
have java   || missing+=('JDK 21 (java) — set JAVA_HOME')
if [ "${#missing[@]}" -ne 0 ]; then
  echo 'Missing prerequisites:'
  printf '  - %s\n' "${missing[@]}"
  echo 'Install them and re-run. See the component READMEs for versions.'
  exit 1
fi
echo 'All prerequisites found.'

# ---- 2. Data tier ----------------------------------------------------------
step 'Starting Docker data tier (Kafka, Redis, MongoDB, Postgres)'
( cd "$INFRA" && docker compose up -d )

if [ "$INFRA_ONLY" -eq 1 ]; then
  echo; echo 'Data tier is up. Re-run without --infra-only to start the apps.'
  exit 0
fi

# ---- 3. Frontend dependencies ---------------------------------------------
step 'Installing frontend dependencies (npm install)'
if [ ! -d "$FRONTEND/node_modules" ]; then ( cd "$FRONTEND" && npm install ); else echo 'node_modules present — skipping install.'; fi

# ---- 4. Launch the apps as background processes ----------------------------
mkdir -p "$LOGDIR"

step 'Launching backend (http://localhost:8080, gRPC 9090)'
( cd "$BACKEND" && nohup mvn -DskipTests spring-boot:run > "$LOGDIR/backend.log" 2>&1 & echo $! > "$LOGDIR/backend.pid" )

step 'Launching frontend (http://localhost:4200)'
( cd "$FRONTEND" && nohup npm start > "$LOGDIR/frontend.log" 2>&1 & echo $! > "$LOGDIR/frontend.pid" )

if [ "$SKIP_AGENT" -eq 0 ]; then
  step 'Launching desktop Safe Agent (native scan no-ops off Windows)'
  ( cd "$AGENT" && nohup mvn -q javafx:run > "$LOGDIR/agent.log" 2>&1 & echo $! > "$LOGDIR/agent.pid" )
fi

cat <<EOF

Zoomy is starting up.
  Web app : http://localhost:4200
  API     : http://localhost:8080/actuator/health
  Logs    : $LOGDIR/*.log

Stop everything with:  kill \$(cat $LOGDIR/*.pid) ; ( cd "$INFRA" && docker compose stop )
The first backend/agent build downloads Maven dependencies and may take a few minutes.
EOF
