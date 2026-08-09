#!/usr/bin/env bash
# run-s121-c1.sh — S121 TASK C1: the INDEPENDENT driver matrix.
#
#   bash research/tools/run-s121-c1.sh
#
# Four arms, sequential, never two vitest at once:
#   CelticTriquetra OFFOFF   — the flag-OFF byte-identity gate + the published-baseline control
#   CelticTriquetra ONON     — the headline: both fixes ON
#   GothicArches    OFFOFF   — ditto, the S39CTL aligned-seed recipe
#   GothicArches    ONON     — the headline
#
# It SETS ENVIRONMENT and invokes THE DRIVER. It seeds nothing and meshes nothing of its own; the grid is
# the driver's own default 200x140 and GothicArches uses the driver's own S39CTL aligned seeder. The env
# block is transcribed from research/tools/run-s121-arms.sh so the arms are comparable to the fix agent's.
#
# THE TAG IS DIFFERENT ON PURPOSE (S121C1_*, not S121_*): the fix agent's STLs are left in place so this
# run's output can be md5-compared against THEM as well as against the published baselines.
set -uo pipefail
cd "$(dirname "$0")/../.."

D=research/exchange/_strataConformBisect
OUT=$D/s121
mkdir -p "$OUT"

run_arm () {
  local STYLE="$1" ARM="$2" TREAD="$3" SEED="$4"
  local TAG="S121C1_${ARM}"
  local LOG="$OUT/C1_DRV_${STYLE}_${ARM}.log"

  export PF_STRATA_CB=1
  export PF_CB_STYLE="$STYLE"
  export PF_CB_STAGE=ring
  export PF_CB_DIRECTED=1
  export PF_CB_TOL=0.01
  export PF_CB_GRIDU=200
  export PF_CB_GRIDV=140
  export PF_CB_MAXSECS=7200
  export NODE_OPTIONS=--max-old-space-size=12288
  export PF_CB_S118_CENSUS=1
  export PF_CB_S120_LINEAGE=1
  export PF_CB_AUDIT_WORKERS="${PF_CB_AUDIT_WORKERS:-4}"
  export PF_CB_S121_TREADFIX="$TREAD"
  export PF_CB_S121_SEEDFIX="$SEED"

  if [ "$STYLE" = "GothicArches" ]; then
    export PF_CB_TRICAP=8000000
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
    export PF_CB_ACCEPT=0.0035
    export PF_CB_CERTACCEPT=0
  else
    export PF_CB_TRICAP=2500000
  fi

  echo "=============================================================================="
  echo "S121-C1  ${STYLE}  arm ${ARM}  TREADFIX=${TREAD} SEEDFIX=${SEED}"
  echo "  driver md5: $(md5sum research/bridge/_strataConformBisectL.test.ts | awk '{print $1}')"
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1
  local RC=$?
  echo "  vitest exit ${RC}   wall $(( $(date +%s) - t0 )) s"
  if grep -qE "1 skipped|0 passed" "$LOG"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; return 3; fi
  if grep -qE "The service was stopped|service is no longer running" "$LOG"; then
    echo "  *** VOID — esbuild service torn down. NOT A RESULT. RE-RUN. ***"; return 4
  fi
  if grep -qE "JavaScript heap out of memory|FATAL ERROR" "$LOG"; then echo "  *** VOID — OOM. NOT A RESULT ***"; return 5; fi
  grep -E "^grid |CAPPED|FINAL SOUP" "$LOG" | head -3
  grep -E "^  soup: |S121 FIX 1|RESIDUAL|WALL fan children|densify|REFUSED —" "$LOG" | head -8
  grep -E "S121 FIX 2|initial grid:" "$LOG" | head -3
  local stem; stem=$(echo "$STYLE" | tr '[:upper:]' '[:lower:]')
  local stl; stl=$(ls -1 "$D/${stem}_ring"*"_${TAG}.stl" 2>/dev/null | head -1)
  if [ -n "$stl" ]; then
    echo "  md5 $(md5sum "$stl" | awk '{print $1}')  $stl"
  else
    echo "  *** NO STL WRITTEN — NOT A RESULT ***"; return 6
  fi
  return 0
}




run_arm GothicArches    ONON   1 1
echo "=== S121 C1 ARMS DONE ==="
