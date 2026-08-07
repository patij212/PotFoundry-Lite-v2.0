#!/usr/bin/env bash
# run-s116-ctdriver.sh — ONE CelticTriquetra driver arm through the S34 fork.
#
#   bash research/tools/run-s116-ctdriver.sh <TAGSUFFIX> <TRICAP>
#
# The env is TRANSCRIBED from run-s102-hubbed-shapeon.sh, which is the recipe that produced
# celtictriquetra_ring_D--H_S102.stl (1,282,394 tris, alloc 2,500,000/2,500,000 [CAPPED], 949 s).
# ONE flag differs between arms: PF_CB_TRICAP. Everything else is byte-for-byte the same recipe.
#
# THE CONTROL IS MANDATORY. Committed STRATA baselines are NOT reproducible (2026-07-28), so the
# flag-OFF arm here is run FRESH at the same default cap (2500000) and every CAP-arm number is read
# against THAT, not against the committed STL. Byte-identity to the committed STL is reported as a
# bonus, never assumed.
#
# WALL TIME FROM A CONCURRENT RUN IS NOT COMPARABLE. Triangle counts and verdicts ARE.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

SUF="${1:?usage: run-s116-ctdriver.sh <TAGSUFFIX> <TRICAP>}"
CAP="${2:?}"
HEAP="${3:-10240}"

export NODE_OPTIONS=--max-old-space-size=${HEAP}
export PF_STRATA_CB=1
export PF_CB_STYLE=CelticTriquetra
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TRICAP="${CAP}"
export PF_CB_TAG_SUFFIX="_${SUF}"

D=research/exchange/_strataConformBisect/s116
mkdir -p "$D"
REPORT="$D/S116_DRIVER_${SUF}.log"

echo "=============================================================="
echo "S116 CT DRIVER ARM ${SUF}   PF_CB_TRICAP=${CAP}   heap=${HEAP}MB"
echo "=============================================================="
npx vitest run -c vitest.strata.config.ts research/bridge/_strataConformBisectS34.test.ts 2>&1 | tee "$REPORT" &
NPID=$!
sleep 5
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report -> $REPORT"
ls -la research/exchange/_strataConformBisect/celtictriquetra_ring_*_${SUF}.stl 2>/dev/null
