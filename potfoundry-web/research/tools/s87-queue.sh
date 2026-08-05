#!/usr/bin/env bash
# s87-queue.sh — runs a SEQUENCE of s87 units in one slot, checkpointing each before the next starts.
# Each argument is  ARM:TAG:STEM[:N]   e.g.  orient:S10A:gothicarches_ring_DS-H_S10A
# A killed slot resumes by re-running the same command: every unit resumes from its own checkpoint and
# a finished unit re-reads its ndjson / progress.json and exits in seconds.
set -uo pipefail
cd "$(dirname "$0")/../.."
for spec in "$@"; do
  IFS=':' read -r ARM TAG STEM N <<< "$spec"
  echo "════════ s87 QUEUE: $ARM $TAG ($STEM) N=${N:-default}  $(date +%H:%M:%S)"
  PF_S87_SKIPBUILD=1 PF_S87_ARM="$ARM" PF_S87_TAG="$TAG" PF_S87_STEM="$STEM" \
    ${N:+PF_S87_N=$N} bash research/tools/run-s87-ledger.sh > /dev/null 2>&1
  echo "════════ s87 QUEUE: $ARM $TAG DONE  $(date +%H:%M:%S)"
done
echo "QUEUE COMPLETE"
