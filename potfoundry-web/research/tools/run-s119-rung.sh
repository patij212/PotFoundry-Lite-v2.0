#!/usr/bin/env bash
# run-s119-rung.sh — S119 TASK 2: ONE RUNG OF THE DENSITY LADDER, OUT OF THE DRIVER.
#
#   bash research/tools/run-s119-rung.sh <STYLE> <TAG> <TRICAP> <ACCEPT> <HEAPMB>
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
# SCOPE RULE COMPLIANCE. This script only SETS ENVIRONMENT and invokes the DRIVER
# (`research/bridge/_strataConformBisectL.test.ts`, via vitest.stratal.config.ts). It seeds nothing,
# refines nothing, and edits no driver line. Every mesh it produces comes out of the driver's own seed
# and the driver's own refinement loop. It is READ-ONLY with respect to the driver.
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
#
# THE LADDER LEVER, AND WHY IT DIFFERS PER STYLE — read before changing a number.
#   CelticTriquetra at the published S102 recipe is ALLOCATION-BOUND: run.json says
#   `alloc 2500000 / triCap 2500000, capped true`, i.e. the driver still had work when it stopped.
#   So PF_CB_TRICAP alone moves its density, and — crucially — the SEED, the TOLERANCE and the
#   ACCEPT threshold stay bit-identical across every rung, which makes the rungs NESTED refinements
#   of one starting mesh. That is the cleanest possible density ladder for a `count ~ N^alpha` fit.
#
#   GothicArches at the published S39CTL recipe is NOT cap-bound: `alloc 2029406 / triCap 8000000,
#   capped false` — its heap DRAINS. Raising PF_CB_TRICAP there is a no-op. Its density lever is
#   therefore PF_CB_ACCEPT (the heap admission threshold: a triangle enters the heap iff its sag
#   exceeds it), scaled down per rung. Both styles' alphas are fit against the ACHIEVED triangle
#   count N, so the two levers do not have to match for the exponents to be comparable.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
# The Gothic branch transcribes the S39CTL recipe from run-s118-arms.sh verbatim (absolute paths into
# the primary checkout, because this worktree does not carry those two research artifacts).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:?usage: run-s119-rung.sh <STYLE> <TAG> <TRICAP> <ACCEPT> <HEAPMB> [CFG]}"
TAG="${2:?}"
TRICAP="${3:?}"
ACCEPT="${4:?}"
HEAPMB="${5:-12288}"
# CFG selects WHICH COPY of the driver runs. `frozen` is the byte-for-byte HEAD copy that gives the whole
# ladder one provenance while another agent edits the live file — see vitest.s119frozen.config.ts.
CFG="${6:-vitest.s119frozen.config.ts}"

OUT=research/exchange/_strataConformBisect/s119
mkdir -p "$OUT"
LOG="$OUT/DRV_${STYLE}_${TAG}.log"

export PF_STRATA_CB=1
export PF_CB_STYLE="$STYLE"
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TOL=0.01
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140
export PF_CB_TRICAP="$TRICAP"
export PF_CB_MAXSECS=36000          # generous: a TIME-CAPPED rung is a trajectory, not a rung
export NODE_OPTIONS=--max-old-space-size="$HEAPMB"

if [ "$STYLE" = "GothicArches" ]; then
  export PF_CB_SNAP=1
  export PF_CB_TIGHTEN=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_phase2/S24i1.loci.json
  export PF_CB_ALIGNED_SEED=1
  export PF_CB_ALIGNED_ACROSS_ABS=1
  export PF_CB_ALIGNED_RINGS=7
  export PF_CB_ALIGNED_TURN_MUL=9
  export PF_CB_ALIGNED_PATCH=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
  export PF_CB_ALIGNED_PATCH_TOPN=0
  export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016
  export PF_CB_EMIT_UNRESOLVED=1
  export PF_CB_ALIGNED_RESOLVE_UM=50
  export PF_CB_CERTACCEPT=0
fi
if [ "$ACCEPT" != "default" ]; then export PF_CB_ACCEPT="$ACCEPT"; fi

echo "=============================================================================="
echo "S119 RUNG  ${STYLE}  tag ${TAG}  TRICAP=${TRICAP}  ACCEPT=${ACCEPT}  heap=${HEAPMB}MB"
echo "  ALL S118/S119 flags OFF (ADMIT/CENSUS/PARAMMID/PARAMSEL unset) == the S102 / S39CTL published config"
echo "  config ${CFG}   driver md5: $(md5sum research/bridge/_strataConformBisect*.test.ts | tr '\n' ' ')"
echo "=============================================================================="
t0=$(date +%s)
PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config "$CFG" > "$LOG" 2>&1 &
NPID=$!
sleep 8
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
RC=$?
echo "  vitest exit ${RC}   wall $(( $(date +%s) - t0 )) s"
if grep -qE "1 skipped|0 passed" "$LOG"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; exit 3; fi
grep -E "^grid |CAPPED|TIME-CAPPED" "$LOG" | head -5
echo "log: $LOG"
