#!/usr/bin/env bash
# S90 TASK 1 — THE KILL EXPERIMENT. One `pos` arm on VORONOI, to test whether S88's containment
#   (posFail & orientationOK = 0, measured on 3,950 Gothic failures) survives a 36x higher base rate.
#
# PRE-REGISTERED KILL: > 2.0% of Voronoi's honest-position PROVEN-FAIL facets orientation-OK (o2 <= 10 um)
#   => containment is Gothic-only and the orientation selector is REFUTED as a sound triage.
#
# The TOOL is `s87LedgerReexam.ts` UNMODIFIED — instrument identity with every S87/S88 row. Only the
# BUNDLE PATH is made unique to me (`_run_s90sel_vorpos.cjs`), because the template's derive-from-tool-name
# rule cannot separate two agents running the SAME tool, and that is exactly the 2026-08-05 collision.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s87LedgerReexam.ts
BUNDLE=research/bridge/out/_run_s90sel_vorpos.cjs             # UNIQUE TO S90-SELECTOR. Not derived.
REPORT=research/exchange/_strataConformBisect/s90selVorPos.report.txt
mkdir -p "$(dirname "$BUNDLE")" "$(dirname "$REPORT")"

if [ "${PF_S90_BUNDLE:-1}" = "1" ]; then
  echo "-- bundling $TOOL -> $BUNDLE --"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --external:esbuild --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
  echo "-- TS2304 check --"
  npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
      echo "*** TS2304: undefined identifier. ***"; exit 1; } || echo "   none"
fi

# THE ARM. Config lifted from S85's own VORONOI row (style Voronoi, stem voronoi_ring_D--, H120 Rb40 Rt50),
# so the first 8,000 golden-stride facets are EXACTLY S85's 8,000 (C-S90-1).
export PF_S87_ARM=pos
export PF_S87_TAG=s90VOR
export PF_S87_STYLE=Voronoi
export PF_S87_STEM=voronoi_ring_D--
export PF_S87_N=${PF_S87_N:-50000}
export PF_S87_TOL_MM=0.010
export PF_S87_NMAX=512
export PF_S87_K=8
export PF_S87_RESUME=1
export NODE_OPTIONS=--max-old-space-size=6144

node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
