#!/usr/bin/env bash
# run-s113e-jump.sh — S113e JUMP-PROBE VALIDATION. Own bundle path; never share a runner.
#
# The mesh lives in research/exchange/, which is gitignored and therefore absent from a fresh worktree.
# PF_S113E_STL is an ABSOLUTE path into the primary checkout (read-only), so the run is provably against
# the SAME bytes S108/S110/S111/S112/S113 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s113eJumpControl.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/scopeaudit
REPORT="$OUTDIR/S113E_JUMPCTL_${PF_S113E_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
