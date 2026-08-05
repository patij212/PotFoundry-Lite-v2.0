#!/usr/bin/env bash
# S64 — orientation heatmap render bins (per-tool outfile _run_s64.cjs), then the PNG.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT=research/bridge/out
mkdir -p "$OUT"
npx esbuild research/tools/s64OrientRender.ts --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s64.cjs" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$OUT/_run_s64.cjs"
