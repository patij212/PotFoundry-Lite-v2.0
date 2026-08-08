#!/usr/bin/env bash
# run-s119-alpha2arm.sh — fit the growth exponent per artefact class for ONE ARM of the S119 ladder.
#   bash research/tools/run-s119-alpha2arm.sh <LABEL> <TAG...>
#
# Identical in effect to run-s119-alpha.sh EXCEPT that it NEVER invokes esbuild: it runs the bundle the
# build phase already produced (research/bridge/out/_run_s119Alpha.cjs, built 05:42 from s119Alpha.ts
# 05:39 — verified newer than its source). A CLI esbuild call tears down the esbuild service a live
# vitest driver holds through the junctioned node_modules; S119 has already lost one arm to that, and
# this ladder scores rungs WHILE later rungs are still being driven.
set -uo pipefail
cd "$(dirname "$0")/../.."
LABEL="${1:?usage: run-s119-alpha2arm.sh <LABEL> <TAG...>}"
shift
OUTDIR=research/exchange/_strataConformBisect/s119
W="$(pwd -W)"            # Windows-form absolute path: node cannot open /c/... paths
BUNDLE=research/bridge/out/_run_s119Alpha.cjs
[ -f "$BUNDLE" ] || { echo "*** MISSING BUNDLE $BUNDLE — refusing to esbuild ***"; exit 3; }
LIST=""
for t in "$@"; do
  if [ ! -f "$OUTDIR/LADDER_${t}.json" ]; then echo "MISSING rung $t — NOT INCLUDED (not zero: not measured)"; continue; fi
  LIST="${LIST:+$LIST,}$W/$OUTDIR/LADDER_${t}.json"
done
[ -n "$LIST" ] || { echo "*** no rungs ***"; exit 2; }
REPORT="$OUTDIR/ALPHA_${LABEL}.report.txt"
PF_S119A_JSONS="$LIST" PF_S119A_LABEL="$LABEL" node "$BUNDLE" 2>&1 | tee "$REPORT"
echo "report written to $REPORT"
