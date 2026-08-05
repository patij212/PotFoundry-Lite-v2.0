#!/usr/bin/env bash
# s85-queue.sh — run a SEQUENCE of s85PosRebase jobs in one slot, logging progress durably.
#
# Why a queue and not one launch per mesh: the environment kills long runs, and each job is individually
# resumable (per-facet ndjson + a cached selection). A slot that dies is restarted with the SAME argument
# list and skips everything already finished, because every job resumes itself.
#
#   bash research/tools/s85-queue.sh SLOTA "target:S40AR55:gothicarches_ring_DS-HT_S40AR55:GothicArches:0:300" ...
#   spec = arm:tag:stem:style:N:topk        (N ignored for the target arm, topk ignored for uniform)
#
# The bundle is NEVER built here — build it once with PF_S85_BUNDLE=1, then every slot reuses it.
set -uo pipefail
cd "$(dirname "$0")/../.."
SLOT="$1"; shift
LOG="research/exchange/_strataConformBisect/S85_QUEUE_${SLOT}.log"
mkdir -p "$(dirname "$LOG")"
say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
say "SLOT $SLOT START — $# jobs"
for spec in "$@"; do
  IFS=':' read -r ARM TAG STEM STYLE N TOPK <<< "$spec"
  say "  -> arm=$ARM tag=$TAG stem=$STEM style=$STYLE N=$N topk=$TOPK"
  PF_S85_BUNDLE=0 PF_S85_ARM="$ARM" PF_S85_TAG="$TAG" PF_S85_STEM="$STEM" PF_S85_STYLE="$STYLE" \
    PF_S85_N="${N:-50000}" PF_S85_TOPK="${TOPK:-300}" \
    bash research/tools/run-s85-pos-rebase.sh > /dev/null 2>&1
  say "     done (exit $?)"
done
say "SLOT $SLOT COMPLETE"
