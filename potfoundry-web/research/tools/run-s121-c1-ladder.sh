#!/usr/bin/env bash
# run-s121-c1-ladder.sh — S121 TASK C1: is FIX 1 inert AT EVERY DENSITY, or only at the shipping one?
#
#   bash research/tools/run-s121-c1-ladder.sh
#
# The fix's driver matrix A/Bs at ONE density (triCap 2.5 M). The campaign's own rule is that a single
# density is not an A/B when a ladder is possible. The tread residual is a function of how many RING edges
# the refinement loop happened to split, which is a direct function of the triangle budget — so density is
# exactly the axis on which "inert" could stop being true. Three budgets, OFF and ON, from the driver's own
# seed (PF_CB_GRIDU=200 / PF_CB_GRIDV=140), CelticTriquetra (the only one of the two styles with treads).
#
# Every arm's STL is scanned by MY OWN exhaustive scanner, and the OFF/ON md5 pair is compared directly.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect
OUT=$D/s121
mkdir -p "$OUT"

arm () {
  local CAP="$1" TREAD="$2"
  # NOTE: `local A=.. B=$(..A..)` does NOT make A visible inside the command substitution, so this MUST be a
  # separate statement. Getting it wrong collapses both arms onto one tag and the second silently overwrites
  # the first — which is exactly what happened on the first attempt at this ladder.
  local TAG; if [ "$TREAD" = "1" ]; then TAG="C1L${CAP}ON"; else TAG="C1L${CAP}OFF"; fi
  export PF_STRATA_CB=1 PF_CB_STYLE=CelticTriquetra PF_CB_STAGE=ring PF_CB_DIRECTED=1 PF_CB_TOL=0.01
  export PF_CB_GRIDU=200 PF_CB_GRIDV=140 PF_CB_MAXSECS=7200 NODE_OPTIONS=--max-old-space-size=12288
  export PF_CB_S118_CENSUS=1 PF_CB_S120_LINEAGE=1 PF_CB_AUDIT_WORKERS=4
  export PF_CB_TRICAP="$CAP" PF_CB_S121_TREADFIX="$TREAD" PF_CB_S121_SEEDFIX=0
  local LOG="$OUT/C1_LADDER_${TAG}.log"
  local t0; t0=$(date +%s)
  PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config vitest.stratal.config.ts > "$LOG" 2>&1
  local RC=$?
  echo "--- triCap ${CAP}  TREADFIX=${TREAD}   vitest exit ${RC}   wall $(( $(date +%s) - t0 )) s"
  if grep -qE "1 skipped|0 passed|The service was stopped|JavaScript heap out of memory" "$LOG"; then
    echo "  *** VOID SIGNATURE — NOT A RESULT ***"; return 3; fi
  grep -aE "^grid " "$LOG" | head -1
  grep -aE "^  soup: |RESIDUAL —|WALL fan children|densify/re-zip" "$LOG" | head -4
  local stl="$D/celtictriquetra_ring_D--H_${TAG}.stl"
  if [ ! -f "$stl" ]; then echo "  *** NO STL ***"; return 6; fi
  echo "  md5 $(md5sum "$stl" | awk '{print $1}')"
  # THE SOUP LAYOUT IS [wall | S121 fan children | treads | caps]. With the fix ON the fan children sit
  # BETWEEN the wall and the treads, so the wall range handed to the scanner must include them or the tread
  # range is shifted and the attribution lies. (It did lie on the first attempt: it reported "treads over 0"
  # while the driver reported 350 tread ears over the cap.)
  local wall; wall=$(grep -aoE "= [0-9]+ outer wall" "$LOG" | head -1 | grep -oE "[0-9]+")
  local fan;  fan=$(grep -aoE "\+ [0-9]+ S121 wall fan children" "$LOG" | head -1 | grep -oE "[0-9]+")
  local tre;  tre=$(grep -aoE "\+ [0-9]+ treads" "$LOG" | head -1 | grep -oE "[0-9]+")
  fan=${fan:-0}
  echo "  soup ranges: wall ${wall} + fan ${fan} + treads ${tre}"
  node research/exchange/_strataConformBisect/s121/c1StlScan.cjs "$(pwd)/$stl" 50 "$(( wall + fan ))" "$tre" \
    > "$OUT/C1_LADDER_STLAR_${TAG}.txt" 2>&1
  grep -aE "OVER THE CAP|TREADS \[|WALL  |TREADS carry" "$OUT/C1_LADDER_STLAR_${TAG}.txt"
}

for CAP in 250000 625000; do
  arm "$CAP" 0
  arm "$CAP" 1
done
echo "=== S121 C1 LADDER DONE ==="
