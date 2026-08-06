#!/usr/bin/env bash
# Copied from research/tools/_run-template.sh. Bundle path DERIVED from the tool name.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s95WallRender.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
REPORT="research/exchange/_strataConformBisect/s95/S95_RENDER.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo "report written to $REPORT"
