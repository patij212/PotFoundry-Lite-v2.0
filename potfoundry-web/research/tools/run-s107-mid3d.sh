#!/usr/bin/env bash
# S107 — port the driver's 3-D chord solve into the measurement instrument, and measure.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=research/bridge/out; BUNDLE="$OUT/_run_s107Mid3d.cjs"
REPORT="research/exchange/_strataConformBisect/S107_MID3D_${PF_FD_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
npx esbuild research/tools/s107Mid3d.ts --bundle --platform=node --format=cjs --target=node20 --outfile="$BUNDLE" || exit 1
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo; echo "report -> $REPORT"
