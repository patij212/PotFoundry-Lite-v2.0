#!/usr/bin/env bash
# run-s115-crossstyle.sh — S115 cross-style mechanism partition. Own bundle path; never share a runner.
#
# The meshes live in the PRIMARY checkout's research/exchange/ (gitignored, absent from this worktree), so
# PF_S115_EXDIR is an ABSOLUTE path into it, read-only: the run is provably against the SAME bytes the
# S91/S108/S112/S113/S114 numbers were measured on.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s115CrossStyle.ts

BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"                       # derived from the tool name, never hardcoded
OUTDIR=research/exchange/_strataConformBisect/s115cross
REPORT="$OUTDIR/S115_CROSS_${PF_S115_TAG:-X}.report.txt"
mkdir -p "$OUT" "$OUTDIR"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
