#!/usr/bin/env bash
# run-rev-s113-reachx.sh — REVIEW PROBE: does S113-OP2's reach mechanism survive on a DIFFERENT MESH?
# Own bundle path; never share a runner. STLs are ABSOLUTE paths into the primary checkout (read-only).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/revS113SplitReachXStyle.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/REVX_REACH_${PF_REVX_TAG:-X}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_REVX_SKIPBUILD:-0}" != "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
