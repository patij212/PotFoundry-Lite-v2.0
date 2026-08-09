#!/usr/bin/env bash
# run-s121-stepeps.sh — S121 TASK C2: the PF_CB_STEP_EPS_UM ladder, ON THE DRIVER.
#
#   bash research/tools/run-s121-stepeps.sh
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════════
# WHY THIS LADDER EXISTS
# The tread scorecard shows the tread's position residual against the TRUE stepped solid is, for
# almost every tread facet, exactly the driver's own `stepEps` offset: the wall bands are held off the
# step by PF_CB_STEP_EPS_UM on each side, so the annulus the emitter builds sits stepEps away from the
# plane it is supposed to be in. It also shows the tread's 3-D aspect is ~ chord / (2*stepEps).
# Those two are the SAME KNOB pulling in OPPOSITE directions, and nobody has measured the exchange
# rate. A single A/B could not; a ladder can.
#
# SCOPE: this script SETS ENVIRONMENT and invokes THE DRIVER (research/bridge/_strataConformBisectL
# .test.ts via vitest.stratal.config.ts) with its OWN default seed (PF_CB_GRIDU=200/PF_CB_GRIDV=140)
# and its own loop. It seeds nothing, refines nothing, builds no mesh of its own. Every arm is the
# published recipe with ONE constant changed, and the 4 um arm must reproduce the published baseline
# BYTE FOR BYTE (md5 ca7e8bb32baec7a24b934e77eb6bb82c) or the whole ladder is VOID.
#
# ⚠ NEVER run two vitest processes at once, and never run `npx esbuild` while one is live: the esbuild
#   service is shared through the junctioned node_modules and a concurrent invocation kills the arm.
set -uo pipefail
cd "$(dirname "$0")/../.."

D=research/exchange/_strataConformBisect
OUT=$D/s121
mkdir -p "$OUT"

run_eps () {
  local EPS="$1"
  local TAG="S121_EPS${EPS}"
  local LOG="$OUT/DRV_CelticTriquetra_EPS${EPS}.log"
  export PF_STRATA_CB=1
  export PF_CB_STYLE=CelticTriquetra
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
  export PF_CB_TRICAP=2500000
  export PF_CB_STEP_EPS_UM="$EPS"
  echo "=============================================================================="
  echo "S121 STEP_EPS LADDER  CelticTriquetra  PF_CB_STEP_EPS_UM=${EPS}"
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1
  echo "  vitest exit $?   wall $(( $(date +%s) - t0 )) s"
  if grep -qE "1 skipped|0 passed" "$LOG"; then echo "  *** DID NOT RUN — NOT A RESULT ***"; return 3; fi
  if grep -qE "The service was stopped|service is no longer running" "$LOG"; then
    echo "  *** VOID — esbuild service torn down by a CONCURRENT esbuild INVOCATION. RE-RUN. ***"; return 4; fi
  if grep -qE "JavaScript heap out of memory|FATAL ERROR" "$LOG"; then echo "  *** VOID — OOM ***"; return 5; fi
  grep -E "^  soup: |RESIDUAL|z-steps|boundary edges" "$LOG" | head -6
  local stl; stl=$(ls -1 "$D/celtictriquetra_ring"*"_${TAG}.stl" 2>/dev/null | head -1)
  if [ -n "$stl" ]; then
    echo "  md5 $(md5sum "$stl" | awk '{print $1}')  $stl"
    node research/tools/s120StlAr.cjs "$(pwd)/$stl" 50 > "$OUT/STLAR_CT_EPS${EPS}.txt" 2>&1
    grep -E "OVER THE CAP|worst 3-D AR" "$OUT/STLAR_CT_EPS${EPS}.txt"
  else
    echo "  *** NO STL WRITTEN — NOT A RESULT ***"; return 6
  fi
  return 0
}

for E in "${@:-1 16}"; do run_eps "$E"; done
echo "=== S121 STEP_EPS LADDER DONE ==="
