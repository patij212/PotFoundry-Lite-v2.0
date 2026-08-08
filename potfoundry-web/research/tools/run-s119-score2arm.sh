#!/usr/bin/env bash
# run-s119-score2arm.sh — score ONE rung of the S119 two-arm ladder with BOTH instruments.
#
#   bash research/tools/run-s119-score2arm.sh <STLPREFIX> <STYLE> <TAG> <thin|cliff|both>
#     STLPREFIX  celtictriquetra_ring_D--H | gothicarches_ring_DS-HT
#
# *** IT NEVER INVOKES esbuild. *** Every bundle it runs already exists (built by the S119 build phase,
# and verified newer than its tool). A CLI esbuild invocation tears down the esbuild service a live
# vitest driver holds through the junctioned node_modules and kills it with "The service is no longer
# running" — S119 has already lost one arm to exactly that. Scoring must be able to run WHILE the next
# rung is being driven, so scoring must not touch esbuild at all.
#
# thin  = research/tools/s119ThinLadder.ts   (T2: scale-free thin + absolute needle + DEGENERACY POLES,
#         COUNT + AREA + MAX per class, exhaustive, plus the exact C0 adjudication)  -> LADDER_<TAG>.json
# cliff = research/tools/s119CliffRuler.ts   (T3: perpendicular position scored against the SOLID, not
#         against the graph of rA)                                                    -> S119_CLIFF_<TAG>.json
#
# The cliff ruler's projector grid is pinned to the values T3 published with, per style, so these numbers
# are comparable with S119_CLIFF_CT_S102 / S119_CLIFF_GOTH_CTL digit for digit.
set -uo pipefail
cd "$(dirname "$0")/../.."
PFX="${1:?usage: run-s119-score2arm.sh <stlprefix> <STYLE> <TAG> <thin|cliff|both>}"
STYLE="${2:?}"
TAG="${3:?}"
WHAT="${4:-both}"

W="$(pwd -W)"            # Windows-form absolute path: node cannot open /c/... paths
D="$W/research/exchange/_strataConformBisect"
OUTDIR=research/exchange/_strataConformBisect/s119
STL="$D/${PFX}_${TAG}.stl"
mkdir -p "$OUTDIR"

if [ ! -f "research/exchange/_strataConformBisect/${PFX}_${TAG}.stl" ]; then
  echo "*** NO STL for $TAG at $STL — NOT SCORED ***"; exit 2
fi

if [ "$WHAT" = "thin" ] || [ "$WHAT" = "both" ]; then
  echo "── THIN LADDER $TAG ──"
  B=research/bridge/out/_run_s119ThinLadder.cjs
  [ -f "$B" ] || { echo "*** MISSING BUNDLE $B — refusing to esbuild while a driver may be live ***"; exit 3; }
  NODE_OPTIONS=--max-old-space-size=14336 \
  PF_S119_STL="$STL" PF_S119_TAG="$TAG" PF_S119_STYLE="$STYLE" \
  PF_S119_JSON="$W/$OUTDIR/LADDER_${TAG}.json" \
    node "$B" > "$OUTDIR/LADDER_${TAG}.report.txt" 2>&1
  echo "  exit $?  -> $OUTDIR/LADDER_${TAG}.report.txt"
  grep -E "facets|POLE|pole>=100" "$OUTDIR/LADDER_${TAG}.report.txt" | head -4
fi

if [ "$WHAT" = "cliff" ] || [ "$WHAT" = "both" ]; then
  echo "── CLIFF RULER $TAG ──"
  B=research/bridge/out/_run_s119CliffRuler.cjs
  [ -f "$B" ] || { echo "*** MISSING BUNDLE $B — refusing to esbuild while a driver may be live ***"; exit 3; }
  if [ "$STYLE" = "GothicArches" ]; then PNTH=1024; PNZ=512; else PNTH=1536; PNZ=768; fi
  NODE_OPTIONS=--max-old-space-size=12288 \
  PF_S119C_STL="$STL" PF_S119C_TAG="$TAG" PF_S119C_STYLE="$STYLE" \
  PF_S119C_PNTH="$PNTH" PF_S119C_PNZ="$PNZ" \
    node "$B" > "$OUTDIR/S119_CLIFF_${TAG}.report.txt" 2>&1
  echo "  exit $?  -> $OUTDIR/S119_CLIFF_${TAG}.report.txt"
  grep -E "ADJUDICATION|C1 CONTROL|CLIFF-AWARE|MAX" "$OUTDIR/S119_CLIFF_${TAG}.report.txt" | head -6
fi
echo "=== scored $TAG ($WHAT) ==="
