#!/usr/bin/env bash
# run-s115-funnelh.sh — S115: re-run the Gothic S112/S113 funnel at honest h. Own bundle path; never share a runner.
#
# The STL lives in research/exchange/, which is gitignored and therefore absent from a fresh worktree.
# PF_S115_STL is an ABSOLUTE path into the primary checkout (read-only) rather than a copy, so the run is
# provably against the SAME bytes S108..S114 measured.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s115GothicFunnelH.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/s115funnelh
REPORT="$OUTDIR/S115_FUNNELH_${PF_S115_TAG:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
export PF_S115_STL="${PF_S115_STL:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
