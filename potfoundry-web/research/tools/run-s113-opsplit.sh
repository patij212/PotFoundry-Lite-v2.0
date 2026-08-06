#!/usr/bin/env bash
# run-s113-opsplit.sh — S113 OPERATOR 2 (targeted conform split). Own bundle path; never share a runner.
#
# The STL lives in research/exchange/, gitignored and therefore absent from a fresh worktree. PF_OPS_STL is
# an ABSOLUTE path into the primary checkout (read-only) rather than a copy, so the run is provably against
# the SAME bytes S108/S110/S111/S112/S113 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s113opSplit.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/S113OP2_SPLIT_${PF_OPS_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
export PF_OPS_STL="${PF_OPS_STL:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
