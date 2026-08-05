#!/usr/bin/env bash
# S91 — ONE SLOT'S QUEUE OF FLIP ARMS. Runs `Style:stem` pairs sequentially, ARM=none then ARM=con.
#
#   bash research/tools/s91-flip-queue.sh <slotName> "Style:stem,Style:stem,..."
#
# ARM=none first, ALWAYS: its written STL is the flag-OFF control for K-L-GATE (geometry byte-identity
# against the input), and its census is an independent BEFORE column measured in its own process. If the
# control is not byte-identical, nothing else in that style's arm counts.
#
# Two slots max (8 cores shared with two other agents + the user). Each arm pins PriorityClass because
# Windows EcoQoS throttles detached node jobs to ~0.61 of a core.
set -uo pipefail
cd "$(dirname "$0")/../.."
SLOT="${1:?usage: s91-flip-queue.sh <slotName> \"Style:stem,...\"}"
LIST="${2:?}"
LOG="research/exchange/_strataConformBisect/S91_QUEUE_${SLOT}.log"
mkdir -p "$(dirname "$LOG")"
echo "=== S91 queue slot ${SLOT} started $(date -Iseconds) ===" | tee -a "$LOG"

IFS=',' read -ra PAIRS <<< "$LIST"
for p in "${PAIRS[@]}"; do
  STYLE="${p%%:*}"
  STEM="${p#*:}"
  SHORT="$(echo "$STYLE" | tr -d 'aeiou' | cut -c1-6)"
  for ARM in none con; do
    TAG="S91${SHORT}$( [ "$ARM" = none ] && echo OFF || echo ON )"
    echo "--- $(date -Iseconds)  ${STYLE} ${ARM} -> ${TAG}" | tee -a "$LOG"
    PF_S91F_BUNDLE=0 bash research/tools/run-s91-flip-arm.sh "$TAG" "$STYLE" "$STEM" "$ARM" >> "$LOG" 2>&1
    echo "--- $(date -Iseconds)  ${STYLE} ${ARM} DONE rc=$?" | tee -a "$LOG"
  done
done
echo "=== S91 queue slot ${SLOT} finished $(date -Iseconds) ===" | tee -a "$LOG"
