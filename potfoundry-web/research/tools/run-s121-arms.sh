#!/usr/bin/env bash
# run-s121-arms.sh — S121: the 2x4 flag matrix, ON THE DRIVER, FROM THE DRIVER'S OWN SEED.
#
#   bash research/tools/run-s121-arms.sh
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
# SCOPE RULE COMPLIANCE — READ BEFORE CHANGING A LINE.
# This script SETS ENVIRONMENT and invokes THE DRIVER (research/bridge/_strataConformBisectL.test.ts
# via vitest.stratal.config.ts). It seeds NOTHING, refines NOTHING, builds no mesh of its own. The grid
# is the driver's OWN default 200x140; GothicArches additionally uses the driver's OWN S39CTL aligned
# seeder, transcribed VERBATIM from run-s120-lineage.sh. Do not "improve" any line of that block.
#
# THE CONTROL ARM MUST REPRODUCE THE PUBLISHED BASELINE TO THE DIGIT:
#   CelticTriquetra  1,282,394 facets  /  48,535.770 mm2   (triCap 2.5 M, CAPPED)
#   GothicArches     1,142,166 facets  /  38,453.259 mm2   (triCap 8 M, S39CTL recipe)
# If it does not, EVERY number from every other arm in this run is VOID.
#
# THE FOUR ARMS, so the two fixes can be attributed separately:
#   OFFOFF  control                      OFFON   seed fix only
#   ONOFF   tread fix only               ONON    both
# PF_CB_S120_LINEAGE=1 in EVERY arm: proven byte-identical in S120, and it is the instrument that prints
# the per-emitter tread AR census — the exact quantity this session has to move.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
set -uo pipefail
cd "$(dirname "$0")/../.."

D=research/exchange/_strataConformBisect
OUT=$D/s121
mkdir -p "$OUT"

run_arm () {
  local STYLE="$1" ARM="$2" TREAD="$3" SEED="$4"
  local TAG="S121_${ARM}"
  local LOG="$OUT/DRV_${STYLE}_${ARM}.log"

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
    # THE S39CTL RECIPE, transcribed from run-s120-lineage.sh. Do not "improve" any line.
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
  echo "S121  ${STYLE}  arm ${ARM}  TREADFIX=${TREAD} SEEDFIX=${SEED}"
  echo "  driver md5: $(md5sum research/bridge/_strataConformBisectL.test.ts | awk '{print $1}')"
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1
  local RC=$?
  echo "  vitest exit ${RC}   wall $(( $(date +%s) - t0 )) s"
  # ── the VOID signatures, each of which has already cost a run ──
  if grep -qE "1 skipped|0 passed" "$LOG"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; return 3; fi
  if grep -qE "The service was stopped|service is no longer running" "$LOG"; then
    echo "  *** VOID — esbuild service torn down by a CONCURRENT esbuild INVOCATION. NOT A RESULT. RE-RUN. ***"; return 4
  fi
  if grep -qE "JavaScript heap out of memory|FATAL ERROR" "$LOG"; then echo "  *** VOID — OOM. NOT A RESULT ***"; return 5; fi
  grep -E "^grid |CAPPED|FINAL SOUP" "$LOG" | head -3
  grep -E "^  soup: |S121 FIX 1|RESIDUAL|WALL fan children|densify|REFUSED —" "$LOG" | head -8
  grep -E "S121 FIX 2|initial grid:" "$LOG" | head -3
  local stem; stem=$(echo "$STYLE" | tr '[:upper:]' '[:lower:]')
  local stl; stl=$(ls -1 "$D/${stem}_ring"*"_${TAG}.stl" 2>/dev/null | head -1)
  if [ -n "$stl" ]; then
    echo "  md5 $(md5sum "$stl" | awk '{print $1}')  $stl"
    node research/tools/s120StlAr.cjs "$(pwd)/$stl" 50 > "$OUT/STLAR_${STYLE}_${ARM}.txt" 2>&1
    grep -E "facets |OVER THE CAP|worst 3-D AR" "$OUT/STLAR_${STYLE}_${ARM}.txt"
  else
    echo "  *** NO STL WRITTEN — NOT A RESULT ***"; return 6
  fi
  return 0
}

# CelticTriquetra OFFOFF is ALREADY PROVEN and is not re-run: its STL md5 is
# ca7e8bb32baec7a24b934e77eb6bb82c, byte-identical to the published celtictriquetra_ring_D--H_S102.stl,
# 1,282,394 facets / 48,535.770 mm2 — the full-scale flag-OFF byte-identity gate, passed against a
# COMMITTED artifact rather than a small-config surrogate. Set S121_ALL=1 to re-run it anyway.
# ARMS ALREADY BANKED under the SAME code for their flags, and not re-run (S121_ALL=1 re-runs everything):
#   CelticTriquetra OFFOFF / ONOFF / OFFON / ONON — all four land on md5 ca7e8bb32baec7a24b934e77eb6bb82c,
#     the published celtictriquetra_ring_D--H_S102.stl. Both levers are inert on this style and the S121
#     FIX 2 edge-level locus set is EMPTY here (no aligned seed), so the guard change cannot touch them.
#   GothicArches OFFOFF — md5 9d5061f111f683ce65644809ded04876, the published
#     gothicarches_ring_DS-HT_S39CTL.stl. SEEDFIX=0, so the guard change cannot touch it either.
if [ "${S121_ALL:-0}" = "1" ]; then
  run_arm CelticTriquetra OFFOFF 0 0
  run_arm CelticTriquetra ONOFF  1 0
  run_arm CelticTriquetra OFFON  0 1
  run_arm CelticTriquetra ONON   1 1
  run_arm GothicArches    OFFOFF 0 0
fi
run_arm GothicArches    ONOFF  1 0
run_arm GothicArches    OFFON  0 1
run_arm GothicArches    ONON   1 1
echo "=== S121 ARMS DONE ==="
