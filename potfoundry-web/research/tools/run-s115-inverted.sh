#!/usr/bin/env bash
# run-s115-inverted.sh — S115 THE INVERTED CLASS. Own bundle path; never share a runner.
# Meshes live in the PRIMARY checkout's research/exchange/ (gitignored, absent from this worktree), so
# PF_S115_STL is always an ABSOLUTE path into it — read-only, provably the same bytes S114 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s115Inverted.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s115inverted
REPORT="$OUTDIR/S115_${PF_S115_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
