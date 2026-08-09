#!/usr/bin/env bash
# run-s121-verify-625k.sh — VERIFIER's own reproduction of the FIX-1 COUNT regression, from the DRIVER.
# Nothing is replaced: the driver's own vitest config, the driver's own seed (PF_CB_GRIDU=200/GRIDV=140),
# the driver's own loop. The ONLY variable between the two arms is PF_CB_S121_TREADFIX.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect
OUT=$D/s121

arm () {
  local TREAD="$1" TAG
  if [ "$TREAD" = "1" ]; then TAG="V625ON"; else TAG="V625OFF"; fi
  export PF_STRATA_CB=1 PF_CB_STYLE=CelticTriquetra PF_CB_STAGE=ring PF_CB_DIRECTED=1 PF_CB_TOL=0.01
  export PF_CB_GRIDU=200 PF_CB_GRIDV=140 PF_CB_MAXSECS=7200 NODE_OPTIONS=--max-old-space-size=12288
  export PF_CB_AUDIT_WORKERS=4
  export PF_CB_TRICAP=625000 PF_CB_S121_TREADFIX="$TREAD" PF_CB_S121_SEEDFIX=0
  local LOG="$OUT/V_DRV_${TAG}.log"
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1
  local RC=$?
  echo "--- TREADFIX=${TREAD}  exit ${RC}  wall $(( $(date +%s) - t0 )) s"
  if grep -qaE "The service was stopped|JavaScript heap out of memory" "$LOG"; then
    echo "  *** VOID SIGNATURE (esbuild teardown / OOM) — NOT A RESULT ***"; return 3; fi
  grep -aE "^  soup: |non-manifold|reversed facets|seam-crack|boundary edges" "$LOG" | head -6
}

arm 0
arm 1
echo "=== VERIFIER 625k PAIR DONE ==="
