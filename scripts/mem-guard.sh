#!/usr/bin/env bash
# Dev tool: kill next-server if it passes CAP MB (Activity Monitor-style memory). Logs a sample every 5s.
# Usage: bash scripts/mem-guard.sh [capMB=4000] &
CAP_MB="${1:-4000}"
while true; do
  pids=$(pgrep -f "next-server" | tr '\n' ' ')
  if [ -n "$pids" ]; then
    args=""; for p in $pids; do args="$args -pid $p"; done
    M=$(top -l 1 -stats mem $args 2>/dev/null | awk '/^[0-9.]+[KMGB]+\+?-?$/ {v=$1; gsub(/[+-]/,"",v); n=v+0; if (v ~ /G/) n*=1024; else if (v ~ /K/) n/=1024; s+=n} END {print int(s)}')
    echo "$(date +%H:%M:%S) ${M} MB"
    if [ "${M:-0}" -gt "$CAP_MB" ]; then echo "KILLED at ${M} MB"; pkill -f next-server; fi
  fi
  sleep 5
done
