#!/usr/bin/env bash
# run-s115-oracleceiling.sh — S115 OPERATOR: the oracle upper bound + the prize. Own bundle path.
#
# Meshes live in the PRIMARY checkout's research/exchange/ (gitignored, absent from this worktree), so
# PF_S115O_STL is always an ABSOLUTE path into it — read-only, provably the same bytes S114/phase-1 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s115OracleCeiling.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s115oracle
REPORT="$OUTDIR/S115O_${PF_S115O_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=14336
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
