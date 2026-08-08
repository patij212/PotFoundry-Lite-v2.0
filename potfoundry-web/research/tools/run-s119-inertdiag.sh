#!/usr/bin/env bash
# run-s119-inertdiag.sh — DIAGNOSE THE FAILED ACCEPT-INERTNESS PREDICTION.
#
#   bash research/tools/run-s119-inertdiag.sh <TAG> <ACCEPT> <CENSUS 0|1> <CFG>
#
# S119 "the deciding run" pre-registered that a CAP-BOUND run is INDEPENDENT of PF_CB_ACCEPT, because
# the heap pops strictly worst-first and a lower ACCEPT can only admit candidates BELOW the current pop
# threshold. MEASURED: at TRICAP 1,250,000 the control produced EXACTLY 656,110 facets from EXACTLY
# alloc 1,250,002 — the same two integers as the published S119CT05X rung — but a DIFFERENT md5
# (24dcbf39... vs 851bcf37...). Three things differ between those two runs at once:
#   (1) PF_CB_ACCEPT     0.000875  vs  0.007
#   (2) PF_CB_S118_CENSUS      1  vs  unset
#   (3) the driver FILE  live (0d96ecc4, S119 landed, flag OFF)  vs  frozen HEAD copy (dc18a587)
# A three-way confound is not a diagnosis. This runner isolates them one at a time, all else pinned to
# the S119CT05X recipe exactly (TOL 0.01, grid 200x140, TRICAP 1,250,000, DIRECTED, ring).
set -uo pipefail
cd "$(dirname "$0")/../.."
TAG="${1:?usage: run-s119-inertdiag.sh <TAG> <ACCEPT> <CENSUS 0|1> <CFG>}"
ACCEPT="${2:?}"
CENSUS="${3:?}"
CFG="${4:-vitest.stratal.config.ts}"
OUT=research/exchange/_strataConformBisect/s119
mkdir -p "$OUT"

export PF_STRATA_CB=1
export PF_CB_STYLE=CelticTriquetra
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TOL=0.01
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140
export PF_CB_TRICAP=1250000
export PF_CB_MAXSECS=36000
export NODE_OPTIONS=--max-old-space-size=6144
export PF_CB_S119_PARAMSEL=0
export PF_CB_S119_ATTRIB=0
if [ "$ACCEPT" != "default" ]; then export PF_CB_ACCEPT="$ACCEPT"; fi
if [ "$CENSUS" = "1" ]; then export PF_CB_S118_CENSUS=1; fi

echo "INERTDIAG ${TAG}: ACCEPT=${ACCEPT} CENSUS=${CENSUS} CFG=${CFG}"
t0=$(date +%s)
PF_CB_TAG_SUFFIX="_${TAG}" npx vitest run --config "$CFG" > "$OUT/DIAG_${TAG}.log" 2>&1
echo "  vitest exit $?   wall $(( $(date +%s) - t0 )) s"
grep -qE "1 skipped|0 passed" "$OUT/DIAG_${TAG}.log" && { echo "  *** DID NOT RUN ***"; exit 3; }
grep -E "^grid |^splits |^unresolved" "$OUT/DIAG_${TAG}.log" | head -3
md5sum "research/exchange/_strataConformBisect/celtictriquetra_ring_D--H_${TAG}.stl"
