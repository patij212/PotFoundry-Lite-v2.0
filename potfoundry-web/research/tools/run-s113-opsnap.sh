#!/usr/bin/env bash
# run-s113-opsnap.sh — S113 OPERATOR 3: VERTEX SNAP. Own bundle path; never share a runner.
#
# The mesh lives in research/exchange/, which is gitignored and therefore absent from a fresh worktree.
# PF_S113_STL is set to an ABSOLUTE path into the primary checkout (read-only) rather than copied, so the
# run is provably against the SAME bytes S108-S113 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s113opSnap.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/S113OP_SNAP_${PF_S113_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
