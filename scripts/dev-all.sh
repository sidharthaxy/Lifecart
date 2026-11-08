#!/usr/bin/env bash
# Start everything LifeCart needs locally, and stop it all safely with Ctrl+C.
#   npm run dev:all
# 1. Starts Postgres (Homebrew postgresql@18) if it isn't already running.
# 2. Runs the app (npm run dev) at http://localhost:3000.
# 3. On Ctrl+C (or if the app exits): stops the app, then shuts Postgres down cleanly (only if this script
#    started it), so nothing keeps running on your laptop.
set -u

PG_BIN="/opt/homebrew/opt/postgresql@18/bin"
PGDATA="${PGDATA:-/opt/homebrew/var/postgresql@18}"
PG_LOG="${TMPDIR:-/tmp}/lifecart-postgres.log"
STARTED_PG=0
APP_PID=""

stop_all() {
  trap - INT TERM EXIT
  echo ""
  echo "Stopping LifeCart..."
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill -INT "$APP_PID" 2>/dev/null
    # Give the app up to 10 s to finish, then make sure it's gone.
    for _ in $(seq 1 20); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 0.5; done
    kill "$APP_PID" 2>/dev/null
  fi
  pkill -f "next-server" 2>/dev/null
  if [ "$STARTED_PG" = 1 ]; then
    echo "Stopping Postgres..."
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 && echo "Postgres stopped."
  fi
  echo "All stopped. Safe to close the terminal."
}
trap stop_all INT TERM EXIT

if [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo "Postgres 18 (Homebrew) not found at $PG_BIN. Install it with: brew install postgresql@18"
  exit 1
fi

if "$PG_BIN/pg_isready" -q; then
  echo "Postgres is already running; leaving it as it is."
else
  echo "Starting Postgres..."
  if ! "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$PG_LOG" -w -t 30 start >/dev/null; then
    echo "Postgres didn't start. Log: $PG_LOG"
    exit 1
  fi
  STARTED_PG=1
  echo "Postgres is running."
fi

echo "Starting LifeCart at http://localhost:3000  (press Ctrl+C to stop everything)"
npm run dev &
APP_PID=$!
wait "$APP_PID"
