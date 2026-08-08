#!/usr/bin/env bash
# run-s119-ladder.sh — score ONE rung of the S119 thin ladder.
#
#   PF_S119_STL=<abs> bash research/tools/run-s119-ladder.sh <TAG>
#
# Bundles research/tools/s119ThinLadder.ts to its OWN bundle path (never share a runner) and runs it.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s119ThinLadder.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s119
TAG="${1:-RUN}"
REPORT="$OUTDIR/LADDER_${TAG}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ ! -f "$BUNDLE" ] || [ "$TOOL" -nt "$BUNDLE" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS=--max-old-space-size=14336
PF_S119_TAG="$TAG" PF_S119_STYLE="${PF_S119_STYLE:-CelticTriquetra}" PF_S119_JSON="$(pwd)/$OUTDIR/LADDER_${TAG}.json" \
  node "$BUNDLE" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
