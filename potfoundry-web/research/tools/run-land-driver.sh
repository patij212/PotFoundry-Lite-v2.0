#!/usr/bin/env bash
# LAND — one DRIVER arm through the L fork, one arm per invocation.
#
#   bash research/tools/run-land-driver.sh <TAG> <PF_LAND_FLIP> [RULER] [SEL_UM]
#
# The env below is TRANSCRIBED from `run-s39-one-arm.sh` (the recipe that produced S39CTL:
# 1,142,166 tris / alloc 2,029,406 / 774 unresolved / 822 s) with PF_CB_ACCEPT=0.0035 and
# PF_CB_CERTACCEPT=0 — the blind-accept control arm. Do not "improve" any line of it: the whole
# point of the control is that it is the SAME configuration.
#
# THE GATE. The flag-OFF arm must produce a mesh byte-identical to
# research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl. Until it does, no
# flag-ON number is admissible.
#
# ⚠ WALL TIME FROM A CONCURRENT RUN IS NOT COMPARABLE to a sequential control (memory-bandwidth
# contention; the heap driver's pop loop is serial). Triangle counts and verdicts ARE comparable.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:?usage: run-land-driver.sh <TAG> <PF_LAND_FLIP 0|1> [RULER plane|h1] [SEL_UM]}"
FLIP="${2:?}"
RULER="${3:-plane}"
SEL="${4:-0}"

export PF_STRATA_CB=1
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_SNAP=1
export PF_CB_TOL=0.01
export PF_CB_TRICAP=8000000
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140
export PF_CB_TIGHTEN=research/exchange/_phase2/S24i1.loci.json
export PF_CB_ALIGNED_SEED=1
export PF_CB_ALIGNED_ACROSS_ABS=1
export PF_CB_ALIGNED_RINGS=7
export PF_CB_ALIGNED_TURN_MUL=9
export PF_CB_ALIGNED_PATCH=research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
export PF_CB_ALIGNED_PATCH_TOPN=0
export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016
export PF_CB_EMIT_UNRESOLVED=1
export PF_CB_ALIGNED_RESOLVE_UM=50
export PF_CB_MAXSECS=7200
export PF_CB_ACCEPT=0.0035
export PF_CB_CERTACCEPT=0
export NODE_OPTIONS=--max-old-space-size=6144

REPORT="research/exchange/_strataConformBisect/S80_LANDDRV_${TAG}.report.txt"
mkdir -p "$(dirname "$REPORT")"

echo "=============================================================="
echo "LAND DRIVER ARM ${TAG}   PF_LAND_FLIP=${FLIP}   ruler=${RULER}   sel=${SEL}um"
echo "=============================================================="
PF_CB_TAG_SUFFIX="_${TAG}" PF_LAND_FLIP="${FLIP}" PF_LAND_FLIP_RULER="${RULER}" PF_LAND_FLIP_SEL_UM="${SEL}" \
  npx vitest run --config vitest.stratal.config.ts 2>&1 | tee "$REPORT" &
NPID=$!
sleep 5
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report written to $REPORT"
