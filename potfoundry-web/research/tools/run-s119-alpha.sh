#!/usr/bin/env bash
# run-s119-alpha.sh — fit the growth exponent per artefact class across a set of scored rungs.
#   bash research/tools/run-s119-alpha.sh <LABEL> <TAG...>
set -uo pipefail
cd "$(dirname "$0")/../.."
LABEL="${1:?usage: run-s119-alpha.sh <LABEL> <TAG...>}"
shift
OUTDIR=research/exchange/_strataConformBisect/s119
W="$(pwd -W)"            # Windows-form absolute path: node cannot open /c/... paths
LIST=""
for t in "$@"; do
  f="$W/$OUTDIR/LADDER_${t}.json"
  if [ ! -f "$OUTDIR/LADDER_${t}.json" ]; then echo "MISSING rung $t — not included"; continue; fi
  LIST="${LIST:+$LIST,}$f"
done
BUNDLE=research/bridge/out/_run_s119Alpha.cjs
npx esbuild research/tools/s119Alpha.ts --bundle --platform=node --format=cjs --target=node20 --outfile="$BUNDLE" >/dev/null \
  || { echo '*** BUNDLE FAILED ***'; exit 1; }
REPORT="$OUTDIR/ALPHA_${LABEL}.report.txt"
PF_S119A_JSONS="$LIST" PF_S119A_LABEL="$LABEL" node "$BUNDLE" 2>&1 | tee "$REPORT"
echo "report written to $REPORT"
