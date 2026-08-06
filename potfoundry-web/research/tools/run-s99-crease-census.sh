#!/usr/bin/env bash
# Copied from research/tools/_run-template.sh. Bundle path is DERIVED from the tool name.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s99CreaseCensus.ts

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
mkdir -p "$OUT"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@"
