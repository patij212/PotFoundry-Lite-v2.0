#!/usr/bin/env bash
# s119WaitFor.sh — block until every named file exists, then exit. One notification, no polling chatter.
#   bash research/tools/s119WaitFor.sh <path> [<path>...]
# Used to sequence the S119 ladder without a foreground sleep.
set -uo pipefail
cd "$(dirname "$0")/../.."
for i in $(seq 1 1800); do
  missing=0
  for f in "$@"; do
    if [ ! -f "$f" ]; then missing=$((missing+1)); fi
  done
  if [ "$missing" -eq 0 ]; then echo "ALL PRESENT: $*"; exit 0; fi
  sleep 20
done
echo "TIMED OUT waiting for: $*"
exit 1
