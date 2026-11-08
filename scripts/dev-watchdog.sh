#!/usr/bin/env bash
# Dev tool: start `next dev`, request one page, and kill the server if its memory (as Activity Monitor counts it,
# including compressed pages) passes the cap. Usage: bash scripts/dev-watchdog.sh /money [capMB=3000] [next dev flags...]
set -u
PAGE="${1:-/}"
CAP_MB="${2:-3000}"
shift 2 2>/dev/null || shift $#
LOG="${TMPDIR:-/tmp}/lifecart-dev-watchdog.log"

npx next dev "$@" > "$LOG" 2>&1 &
NPX_PID=$!
cleanup() { pkill -f "next-server" 2>/dev/null; pkill -f "next dev" 2>/dev/null; kill $NPX_PID 2>/dev/null; }
trap cleanup EXIT

mem_mb() { # Activity Monitor-style memory of every next-server process, in MB
  local pids; pids=$(pgrep -f "next-server" | tr '\n' ' ')
  [ -z "$pids" ] && { echo 0; return; }
  local args=""; for p in $pids; do args="$args -pid $p"; done
  top -l 1 -stats mem $args 2>/dev/null | awk '/^[0-9.]+[KMGB]+\+?-?$/ {v=$1; gsub(/[+-]/,"",v); n=v+0; if (v ~ /G/) n*=1024; else if (v ~ /K/) n/=1024; else if (v ~ /B$/ && v !~ /[KMG]/) n/=1048576; s+=n} END {print int(s)}'
}

until grep -q "Ready in" "$LOG"; do sleep 1; done
echo "server ready; requesting $PAGE (cap ${CAP_MB} MB)"
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" --max-time 300 "http://localhost:3000$PAGE" > "$LOG.curl" 2>&1 &
CURL_PID=$!

PEAK=0
START=$(date +%s)
while kill -0 $CURL_PID 2>/dev/null; do
  M=$(mem_mb)
  [ "$M" -gt "$PEAK" ] && PEAK=$M
  echo "  t+$(( $(date +%s) - START ))s ${M} MB"
  if [ "$M" -gt "$CAP_MB" ]; then
    echo "KILLED: server reached ${M} MB (cap ${CAP_MB} MB)"
    kill $CURL_PID 2>/dev/null
    break
  fi
  sleep 2
done
wait $CURL_PID 2>/dev/null
cat "$LOG.curl" 2>/dev/null
echo "peak ${PEAK} MB"
echo "--- server log tail ---"
tail -8 "$LOG"
