#!/usr/bin/env bash
# run-s113op-oracle.sh — S113 OPERATOR 4, THE ORACLE UPPER BOUND. Own bundle path; never share a runner.
#
# The STL lives in research/exchange/, which is gitignored and therefore absent from a fresh worktree.
# PF_S113OP_STL is an ABSOLUTE path into the primary checkout (read-only) rather than a copy, so the run is
# provably against the SAME bytes S108/S110/S111/S112/S113 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s113opOracle.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/S113OP_ORACLE_${PF_S113OP_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
export PF_S113OP_STL="${PF_S113OP_STL:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
