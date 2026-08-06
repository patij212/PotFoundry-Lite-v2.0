#!/usr/bin/env bash
# run-s114-sweepd.sh — S114 all-styles sweep, QUARTER D. Own bundle path; never share a runner.
#
# The meshes live in the PRIMARY checkout's research/exchange/ (gitignored, absent from this worktree),
# so PF_S114D_EXDIR points at an ABSOLUTE path there rather than copying — the run is provably against
# the SAME bytes the prior sweeps measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s114MergeD.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s114sweep
REPORT="$OUTDIR/S114_SWEEP_D_TABLE.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
