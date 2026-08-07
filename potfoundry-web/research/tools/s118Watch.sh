#!/usr/bin/env bash
# S118 — emit one line per completed full-scale arm, then exit when all four are in.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect/s118
ARMS="CelticTriquetra_full_cen CelticTriquetra_full_adm GothicArches_full_cen GothicArches_full_adm"
while true; do
  done_n=0
  for a in $ARMS; do
    f="$D/$a.log"
    if [ -f "$f" ] && grep -q "FINAL SOUP" "$f" 2>/dev/null; then
      done_n=$(( done_n + 1 ))
      if [ ! -f "$D/.$a.seen" ]; then
        touch "$D/.$a.seen"
        echo "ARM COMPLETE: $a"
      fi
    fi
    # a crashed arm is a terminal state too — say so rather than stay silent
    if [ -f "$f" ] && grep -qE "FATAL|heap out of memory|RangeError|\*\*\* DID NOT RUN" "$f" 2>/dev/null \
       && [ ! -f "$D/.$a.fail" ]; then
      touch "$D/.$a.fail"
      echo "ARM FAILED: $a"
    fi
  done
  [ "$done_n" -ge 4 ] && { echo "ALL FOUR ARMS DONE"; break; }
  sleep 30
done
