#!/usr/bin/env bash
# run-s114-archaeology.sh — S114 DRIVER ARCHAEOLOGY. Own bundle path; never share a runner.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"
TOOL=research/tools/s114DriverArchaeology.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
OUTDIR=research/exchange/_strataConformBisect/straddle
REPORT="$OUTDIR/S114_ARCHAEOLOGY_${PF_S114_TAGSHORT:-GOTH}.report.txt"
mkdir -p "$OUT" "$OUTDIR"
PRIMARY=C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web
export PF_S114_STL="${PF_S114_STL:-$PRIMARY/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl}"
export PF_S114_ART="${PF_S114_ART:-$PRIMARY/research/exchange/_strataConformBisect}"
export PF_S114_NDJSON="${PF_S114_NDJSON:-$(pwd)/research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson}"
export PF_S114_TIGHTEN="${PF_S114_TIGHTEN:-$PRIMARY/research/exchange/_phase2/S24i1.loci.json}"
echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
