#!/usr/bin/env bash
# run-s119t1-score.sh — S119 TASK 1: the S118 one-mesh scorecard (topology + perpendicular position),
# pointed at the s119 output directory and given its OWN bundle so it cannot collide with another agent.
#
#   PF_S118_STL=<ABSOLUTE> PF_S118_TAG=<tag> PF_S118_STYLE=<Style> bash research/tools/run-s119t1-score.sh
#
# DEFAULTS SET HERE, and they are choices, not conveniences:
#   PF_S118_ORIENT=0  the orientation sweep costs ~300 s/mesh and S119 TASK 1 is a POSITION + FOOTPRINT
#                     question. Set PF_S118_ORIENT=1 to re-enable it.
#   PF_S118_PERPMODE=fast  the reduced perpendicular pass. It is EXHAUSTIVE (100% adjudication) and is
#                     pinned equal to `full` on COUNT/AREA/MAX by _s118ScoreValidate.test.ts.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s118Score.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s119t1Score.cjs"
OUTDIR=research/exchange/_strataConformBisect/s119
REPORT="$OUTDIR/S119_SCORE_${PF_S118_TAG:-RUN}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
if [ "${PF_S119T1_NOBUNDLE:-0}" = "1" ]; then
  echo "-- reusing bundle $BUNDLE --"
  [ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE ***"; exit 1; }
else
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi
export PF_S118_OUTDIR="$OUTDIR"
export PF_S118_ORIENT="${PF_S118_ORIENT:-0}"
export PF_S118_PERPMODE="${PF_S118_PERPMODE:-fast}"
export NODE_OPTIONS="${PF_S118_NODEOPTS:---max-old-space-size=12288}"
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
