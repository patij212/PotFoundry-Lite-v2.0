#!/usr/bin/env bash
# run-s113-opflip.sh — S113 OPERATOR 1: the edge flip. Own bundle path; never share a runner.
#
# The mesh lives in research/exchange/, gitignored and absent from a fresh worktree, so PF_S113_STL is an
# ABSOLUTE path into the primary checkout (read-only) rather than a copy — the run is provably against the
# SAME bytes S108/S110/S111/S112/S113 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s113opFlip.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/S113_OPFLIP_${PF_S113_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
