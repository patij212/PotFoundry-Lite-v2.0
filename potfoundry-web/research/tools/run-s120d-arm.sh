#!/usr/bin/env bash
# run-s120d-arm.sh — S120 TASK D: ONE RUNG, ONE ARM, OUT OF THE DRIVER.
#
#   bash research/tools/run-s120d-arm.sh <STYLE> <off|on|placebo> <TAG> <TRICAP> <ACCEPT> <HEAPMB>
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
# SCOPE RULE COMPLIANCE — READ BEFORE CHANGING A LINE.
# This script SETS ENVIRONMENT and invokes THE DRIVER (research/bridge/_strataConformBisectL.test.ts via
# vitest.stratal.config.ts, i.e. the LIVE file whose flag-OFF path is proven byte-identical to HEAD:
# md5 b739496a2cbee0a2530adcbedbe6bdbf on CelticTriquetra, run-s120d-byteid.sh). It seeds NOTHING,
# refines NOTHING, and builds no mesh of its own. The grid is the driver's OWN default 200x140 in every
# rung; Gothic additionally uses the driver's OWN S39CTL aligned seeder, transcribed unchanged.
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
#
# THE THREE ARMS — one env var apart, every other flag identical.
#   off      PF_CB_S120_RETRI=0        CONTROL. A shape-refused facet is stranded, as it is today.
#   on       PF_CB_S120_RETRI=1        TREATMENT. 1-ring min-max-aspect3 retriangulation at the strand site.
#   placebo  PF_CB_S120_RETRI=placebo  *** COST-MATCHED PLACEBO ***: identical gather, identical DP (paid
#                                      for, then DISCARDED), a random valid fan of the same hexagon
#                                      committed instead. Same 4-in/4-out, same gates. Only the CHOICE
#                                      differs — so an improvement a random fan also delivers is not the
#                                      operator's, and this arm is what can kill it.
#
# THE RUNG IS (ACCEPT, TRICAP). ACCEPT is the DEMAND threshold and therefore the density lever; TRICAP is
# the allocation cap. *** NEVER A/B A REFINEMENT LEVER AT ONE DENSITY *** — S119's apparent 76.6x penalty
# was a ONE-RUNG TRANSITION LAG that inverted to a 1.43x win at the next rung.
#
# PF_CB_S118_CENSUS=1 in EVERY arm: free, proven byte-identical in S118, and it is the instrument that
# reports the degeneracy-pole count, the scale-free thin ladder and THE MIN ARC ALTITUDE — the exact
# quantity this session was told must move.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
set -uo pipefail
cd "$(dirname "$0")/../.."

STYLE="${1:?usage: run-s120d-arm.sh <STYLE> <off|on|placebo> <TAG> <TRICAP> <ACCEPT> <HEAPMB>}"
ARM="${2:?}"
TAG="${3:?}"
TRICAP="${4:?}"
ACCEPT="${5:?}"
HEAPMB="${6:-8192}"

OUT=research/exchange/_strataConformBisect/s120d
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
export PF_CB_ACCEPT="$ACCEPT"
export PF_CB_MAXSECS=36000          # generous: a TIME-CAPPED rung is a trajectory, not a rung
export PF_CB_S118_CENSUS=1
export PF_CB_AUDIT_WORKERS="${PF_CB_AUDIT_WORKERS:-3}"
export PF_CB_S119_PARAMSEL="${PF_CB_S119_PARAMSEL:-0}"
export PF_CB_S119_ATTRIB=0
export NODE_OPTIONS=--max-old-space-size="$HEAPMB"

# THE ONE ENV VAR THAT DIFFERS BETWEEN THE ARMS.
case "$ARM" in
  off)     export PF_CB_S120_RETRI=0 ;;
  on)      export PF_CB_S120_RETRI=1 ;;
  placebo) export PF_CB_S120_RETRI=placebo ;;
  *) echo "unknown arm $ARM (off|on|placebo)"; exit 2 ;;
esac

if [ "$STYLE" = "GothicArches" ]; then
  # THE S39CTL RECIPE, transcribed verbatim from run-s120-lineage.sh. Do not "improve" any line.
  # PF_CB_ACCEPT is the ONE line this ladder overrides — it is the density lever.
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

echo "=============================================================================="
echo "S120D  ${STYLE}  arm ${ARM}  tag ${TAG}  TRICAP=${TRICAP}  ACCEPT=${ACCEPT}  heap=${HEAPMB}MB"
echo "  driver md5: $(md5sum research/bridge/_strataConformBisectL.test.ts | awk '{print $1}')"
echo "=============================================================================="
t0=$(date +%s)
PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1 &
NPID=$!
sleep 8
# Windows EcoQoS throttles detached jobs — bump the priority class (feedback_windows_ecoqos_throttle).
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
RC=$?
echo "  vitest exit ${RC}   wall $(( $(date +%s) - t0 )) s"
# ── the VOID signatures, each of which has already cost a run ──
if grep -qE "1 skipped|0 passed" "$LOG"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; exit 3; fi
if grep -qE "The service was stopped|service is no longer running" "$LOG"; then
  echo "  *** VOID — esbuild service torn down by a CONCURRENT esbuild INVOCATION. NOT A RESULT. RE-RUN. ***"; exit 4
fi
if grep -qE "JavaScript heap out of memory|FATAL ERROR" "$LOG"; then echo "  *** VOID — OOM. NOT A RESULT ***"; exit 5; fi
grep -E "^grid |CAPPED|TIME-CAPPED" "$LOG" | head -3
grep -E "^splits |^  unresolved by reason|^heap" "$LOG" | head -3
grep -E "1-ring retriangulation" -A 5 "$LOG" | head -7
echo "log: $LOG"
