#!/usr/bin/env bash
# s120-wait.sh — block until the named file exists and is non-trivial. Watch only, no side effects.
#   bash research/tools/s120-wait.sh <relative-path> [<min-bytes>] [<max-polls>]
cd "$(dirname "$0")/../.."
P="${1:?path required}"
MIN="${2:-1}"
N="${3:-400}"
for i in $(seq 1 "$N"); do
  if [ -f "$P" ]; then
    sz=$(wc -c < "$P" 2>/dev/null || echo 0)
    if [ "$sz" -ge "$MIN" ]; then echo "READY $P ($sz bytes) after $((i*20))s"; exit 0; fi
  fi
  sleep 20
done
echo "TIMEOUT waiting for $P"
exit 1
