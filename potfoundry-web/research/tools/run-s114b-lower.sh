#!/usr/bin/env bash
# run-s114b-sweep.sh — S114-B. Own bundle path; never share a runner.
#
# The meshes live in the PRIMARY checkout's research/exchange/ (gitignored, absent from a fresh worktree),
# so PF_S114B_DIR is an ABSOLUTE path into it, read-only: the run is provably against the SAME bytes the
# S91/S108/S112/S113 numbers were measured on.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s114bClassLower.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s114sweep
REPORT="$OUTDIR/S114_LOWERBOUND_B.report.txt"
mkdir -p "$OUT" "$OUTDIR"
export PF_S114B_DIR="${PF_S114B_DIR:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect}"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=12288
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
