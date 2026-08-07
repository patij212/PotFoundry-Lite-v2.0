#!/usr/bin/env bash
# S118 — offline emit-invariant census of a written STL. See s118StlCensus.ts's header for the f32 caveat.
#
#   bash research/tools/run-s118-stlcensus.sh <path.stl> [more.stl ...]
#
# Bundle path is DERIVED FROM THE TOOL NAME (see research/tools/_run-template.sh: two agents once executed
# each other's binary because both had sed'd the same hardcoded output path).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s118StlCensus.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
REPORT="research/exchange/_strataConformBisect/s118/${BASE}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=6144
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
