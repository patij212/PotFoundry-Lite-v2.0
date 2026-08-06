#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/revS115CtlDiag.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_revS115CtlDiag.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/REV_S115_CTLDIAG.report.txt"
mkdir -p "$OUT" "$OUTDIR"
export PF_REV_STL="${PF_REV_STL:-C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo "report written to $REPORT"
