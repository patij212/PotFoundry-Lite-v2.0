#!/usr/bin/env bash
# S98 — LEPP refinability binned by PARENT SHAPE INDEX q, WITHIN a single mesh.
# s98-owned bundle + report paths (a shared bundle path caused a cross-agent collision on 2026-08-05).
set -uo pipefail
cd "$(dirname "$0")/../.."
TOOL=research/tools/s98QRefine.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s98QRefine.cjs"
REPORT="research/exchange/_strataConformBisect/S98_QREFINE_${PF_FD_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"
echo "── bundling $TOOL ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo; echo "report -> $REPORT"
