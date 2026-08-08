#!/usr/bin/env bash
# run-s119-ladder2arm.sh — S119 THE DECIDING RUN: ONE RUNG, ONE ARM, OUT OF THE DRIVER.
#
#   bash research/tools/run-s119-ladder2arm.sh <STYLE> <ctl|param> <TAG> <TRICAP> <ACCEPT> <HEAPMB>
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
# SCOPE RULE COMPLIANCE — READ BEFORE CHANGING A LINE.
# This script SETS ENVIRONMENT and invokes THE DRIVER (research/bridge/_strataConformBisectL.test.ts,
# via vitest.stratal.config.ts, i.e. the LIVE file whose flag-OFF path is proven byte-identical to HEAD:
# md5 b739496a2cbee0a2530adcbedbe6bdbf CT / 9f6547a1933ffb21305b1b74f0ed4b7d Gothic, S119 task 1 gate).
# It seeds NOTHING, refines NOTHING, and edits NO driver line. Every mesh it produces comes out of the
# driver's own seed and the driver's own refinement loop. THE DRIVER IS READ-ONLY HERE.
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
#
# WHY BOTH ARMS RUN FROM THE *SAME* FILE: one provenance. `ctl` sets PF_CB_S119_PARAMSEL=0 explicitly
# rather than relying on the default — a gate about a default should state the default.
#
# ═══ THE RUNG DEFINITION: MATCHED ALLOCATION BUDGET, NOT MATCHED DEMAND ═══
# `PF_CB_TRICAP` caps ALLOCATION (`ta.length >= triCap` -> capped, driver :3442). `PF_CB_ACCEPT` is the
# DEMAND threshold (`bs > acceptTol` -> need 'size', :2528; `s > at` -> hpush, :3140). S119 task 2 moved
# density with ACCEPT and let the cap float, which makes the two arms land at very different triangle
# counts (S119 task 1: CT ctl 1,303,516 vs param 3,342,036 at the SAME accept) — comparable in an alpha
# fit, but NOT a side-by-side at matched budget, which is what this session was asked for.
#
# So here the rung is (ACCEPT, TRICAP) with ACCEPT held LOW ENOUGH THAT BOTH ARMS ARE CAP-BOUND, and
# TRICAP is the ladder lever. The heap pops strictly worst-first (driver :3440-3446 tracks
# `keyInversions`), and a lower ACCEPT can only ADD candidates BELOW the current pop threshold, so the
# first K pops should be unchanged and a cap-bound run should be INDEPENDENT of ACCEPT. That is an
# ASSERTION UNTIL MEASURED: rung 1 of the ctl arm is md5'd against the published S119 task-2 rung at the
# same TRICAP and a different ACCEPT. If they differ, the design is still sound (both arms share the
# setting) but the reuse claim is void and is withdrawn.
#
# PF_CB_S118_CENSUS=1 in BOTH arms: free, proven byte-identical in S118, and it is the instrument that
# reports the driver-side MIN ARC ALTITUDE — the exact quantity the degeneracy-pole question is about.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

STYLE="${1:?usage: run-s119-ladder2arm.sh <STYLE> <ctl|param> <TAG> <TRICAP> <ACCEPT> <HEAPMB>}"
ARM="${2:?}"
TAG="${3:?}"
TRICAP="${4:?}"
ACCEPT="${5:?}"
HEAPMB="${6:-10240}"

OUT=research/exchange/_strataConformBisect/s119
mkdir -p "$OUT"
LOG="$OUT/DRV2_${STYLE}_${TAG}.log"

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
export PF_CB_AUDIT_WORKERS="${PF_CB_AUDIT_WORKERS:-4}"
export NODE_OPTIONS=--max-old-space-size="$HEAPMB"

# THE ONE ENV VAR THAT DIFFERS BETWEEN THE ARMS.
# `rand`/`long3d`/`short3d` are S119 task 1's arms, reachable here so a COST-MATCHED PLACEBO can be run
# at a rung of this ladder — the discipline requires one per operator, and "any change to the selector"
# must be excluded at the density where the claim is made, not only at the one density task 1 tested.
case "$ARM" in
  ctl)     export PF_CB_S119_PARAMSEL=0 ;;
  param)   export PF_CB_S119_PARAMSEL=param ;;
  rand)    export PF_CB_S119_PARAMSEL=rand ;;
  long3d)  export PF_CB_S119_PARAMSEL=long3d ;;
  short3d) export PF_CB_S119_PARAMSEL=short3d ;;
  *) echo "unknown arm $ARM (ctl|param|rand|long3d|short3d)"; exit 2 ;;
esac
export PF_CB_S119_ATTRIB=0

if [ "$STYLE" = "GothicArches" ]; then
  # THE S39CTL RECIPE, transcribed verbatim from run-s119-arms.sh / run-s118-arms.sh. PF_CB_ACCEPT is
  # the ONE line deliberately overridden — it is this ladder's floor, set low so the cap binds.
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
echo "S119 LADDER2ARM  ${STYLE}  arm ${ARM}  tag ${TAG}  TRICAP=${TRICAP}  ACCEPT=${ACCEPT}  heap=${HEAPMB}MB"
echo "  driver md5: $(md5sum research/bridge/_strataConformBisectL.test.ts)"
echo "=============================================================================="
t0=$(date +%s)
PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1 &
NPID=$!
sleep 8
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
RC=$?
echo "  vitest exit ${RC}   wall $(( $(date +%s) - t0 )) s"
# ── the three VOID signatures, each of which has already cost a run ──
if grep -qE "1 skipped|0 passed" "$LOG"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; exit 3; fi
if grep -qE "The service was stopped|service is no longer running" "$LOG"; then
  echo "  *** VOID — esbuild service torn down by a CONCURRENT esbuild INVOCATION. NOT A RESULT. RE-RUN. ***"; exit 4
fi
if grep -qE "JavaScript heap out of memory|FATAL ERROR" "$LOG"; then echo "  *** VOID — OOM. NOT A RESULT ***"; exit 5; fi
grep -E "^grid |CAPPED|TIME-CAPPED" "$LOG" | head -3
grep -E "^edge selection|^\*\*\* edge selection" "$LOG" | head -2
grep -E "^splits |^unresolved" "$LOG" | head -2
echo "log: $LOG"
