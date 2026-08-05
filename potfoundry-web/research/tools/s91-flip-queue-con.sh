#!/usr/bin/env bash
# S91 — CON-ONLY queue (K-L-GATE is already banked for every style by the ROUNDS=0 round-trip arms,
# S91_KLGATE.txt: all 11 geometry-md5 byte-identical, so the redundant ARM=none arms are dropped).
set -uo pipefail
cd "$(dirname "$0")/../.."
SLOT="${1:?}"; LIST="${2:?}"
LOG="research/exchange/_strataConformBisect/S91_QUEUE_${SLOT}.log"
mkdir -p "$(dirname "$LOG")"
echo "=== S91 con-queue slot ${SLOT} started $(date -Iseconds) ===" | tee -a "$LOG"
IFS=',' read -ra PAIRS <<< "$LIST"
for p in "${PAIRS[@]}"; do
  STYLE="${p%%:*}"; STEM="${p#*:}"
  TAG="S91$(echo "$STYLE" | tr -d 'aeiou' | cut -c1-6)ON"
  echo "--- $(date -Iseconds)  ${STYLE} con -> ${TAG}" | tee -a "$LOG"
  PF_S91F_BUNDLE=0 bash research/tools/run-s91-flip-arm.sh "$TAG" "$STYLE" "$STEM" con >> "$LOG" 2>&1
  echo "--- $(date -Iseconds)  ${STYLE} DONE rc=$?" | tee -a "$LOG"
done
echo "=== S91 con-queue slot ${SLOT} finished $(date -Iseconds) ===" | tee -a "$LOG"
