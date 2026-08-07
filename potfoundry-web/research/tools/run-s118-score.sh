#!/usr/bin/env bash
# run-s118-score.sh — S118: the one-mesh scorecard that runs at 1e7 facets.
#
# env: PF_S118_STL (ABSOLUTE) PF_S118_TAG PF_S118_STYLE [PF_S118_PERPMODE=fast|full]
#      [PF_S118_PERPSHARD=i/n] [PF_S118_ORSHARD=i/n] [PF_S118_TOPO=0] [PF_S118_ORIENT=0] [PF_S118_PERP=0]
#
# OWN BUNDLE PATH (_run_s118Score.cjs) — never overwrite another agent's live bundle.
# PF_S118_NOBUNDLE=1 reuses the bundle; USE IT WHENEVER A VITEST RUN IS LIVE (a CLI esbuild invocation
# tears down the esbuild service vitest holds through the junctioned node_modules and kills every
# concurrent arm with "Error: The service is no longer running").
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118Score.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s118Score.cjs"
OUTDIR="${PF_S118_OUTDIR:-research/exchange/_strataConformBisect/s118}"
SUF=""
if [ -n "${PF_S118_PERPSHARD:-}" ] && [ "${PF_S118_PERPSHARD}" != "0/1" ]; then SUF="_p$(echo "$PF_S118_PERPSHARD" | tr '/' 'of')"; fi
REPORT="$OUTDIR/S118_SCORE_${PF_S118_TAG:-RUN}${SUF}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S118_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export NODE_OPTIONS="${PF_S118_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
