#!/usr/bin/env bash
# S33 — price the SEED-TIME CHAIN RE-SOLVE, the cheap alternative to §4.3's in-driver vertex move.
#
# S32 (commit 20d5729d) measured §4.3's population at 15,226 deferred conformance events — 1.63x the
# published crossing count — and found 99.3% of them would move a CONSTRAINT vertex, displacement
# p50 22.75 um. A constraint vertex is supposed to BE on the locus. So the error is in the SEED's
# chain placement, and §4.3 would be correcting it lazily, mid-refinement, near the AR cap, with no
# planarity check. This prices correcting it at seed time instead, where stage-2 planarization
# already exists and no star is near the cap.
#
# The transverse re-solve primitive already exists and has never been used: L3/REPROJECT
# (_strataConformBisect.test.ts:2207-2222). Its probe geometry and end-of-probe guard are
# transcribed into the probe verbatim.
#
# THE DECISIVE NUMBER IS PSLG PLANARITY BREAKS — the one thing S32 did not score, and the one the
# seed builder records having been destroyed once already. It is EXACT here (it depends only on
# where constraint vertices land, not on the triangulation). Shape numbers are worst-case, because
# this probe moves vertices in an already-triangulated seed instead of re-triangulating.
#
# Hypotheses, the approximation and which way it errs, are in s33ChainResolve.ts's header. Read it.
#
# Control + 3 spans. ~12 min.
#
# Usage:  bash research/tools/run-s33-chain-resolve.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT=research/bridge/out
mkdir -p "$OUT"
REPORT=research/exchange/_strataConformBisect/S33_CHAIN_RESOLVE.report.txt
mkdir -p "$(dirname "$REPORT")"

echo "── bundling ──"
npx esbuild research/tools/s33ChainResolve.ts \
  --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$OUT/_run_s33chainresolve.cjs"

echo "── checking for undefined identifiers (TS2304 only) ──"
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --strict false research/tools/s33ChainResolve.ts 2>&1 | grep "TS2304" && {
    echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"

export NODE_OPTIONS=--max-old-space-size=6144

node "$OUT/_run_s33chainresolve.cjs" 2>&1 | tee "$REPORT"

echo
echo "report written to $REPORT"
