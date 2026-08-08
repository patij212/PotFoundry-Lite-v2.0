#!/usr/bin/env bash
# run-s120-thin.sh — the STL-side CROSS-CHECK of the in-driver S120 lineage census.
#
#   PF_S118T_STL=<ABSOLUTE path> PF_S118T_TAG=<tag> bash research/tools/run-s120-thin.sh
#
# The registered check: the driver's in-run pole count (wall) PLUS its tread pole count must equal the
# STL-side pole count this tool reports, to within f32 write rounding. A disagreement is an INSTRUMENT
# defect and voids the census, not the mesh.
#
# NEVER BUNDLES BY DEFAULT. `npx esbuild` tears down the esbuild service a live vitest holds through the
# junctioned node_modules and kills every concurrent arm with "The service is no longer running" AFTER it
# has done its work — the log then reads "1 failed" and looks like a result. Set PF_S120_BUNDLE=1 only
# when you have checked that no vitest driver arm is live.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118ThinCensus.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s120Thin.cjs"
OUTDIR=research/exchange/_strataConformBisect/s120/lineage
REPORT="$OUTDIR/S120_THIN_${PF_S118T_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S120_BUNDLE:-0}" = "1" ]; then
  echo "-- bundling $TOOL -> $BUNDLE (ONLY SAFE WITH NO VITEST ARM LIVE) --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
elif [ ! -f "$BUNDLE" ]; then
  # the S119 bundle is the SAME tool, same source file; reuse it rather than invoke esbuild
  if [ -f "$OUT/_run_s119t1Thin.cjs" ]; then
    echo "-- reusing the S119 bundle of the same tool --"
    cp "$OUT/_run_s119t1Thin.cjs" "$BUNDLE"
  else
    echo "*** NO BUNDLE and PF_S120_BUNDLE!=1 — refusing to invoke esbuild while an arm may be live ***"; exit 1
  fi
fi
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
