#!/usr/bin/env bash
# run-s114-requote.sh — S114 RE-QUOTE. Own bundle path; never share a runner.
#
# The meshes live in research/exchange/, which is gitignored and therefore absent from a fresh worktree.
# PF_S114_STL / PF_S114_NDJSON are ABSOLUTE paths into the primary checkout (read-only) so the run is
# provably against the SAME bytes S108/S110/S111/S112/S113 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s114Requote.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/requote
REPORT="$OUTDIR/S114_REQUOTE_${PF_S114_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
