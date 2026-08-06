#!/usr/bin/env bash
# S102 — the pre-registered test from S101: do the HUBBED FOUR clear their back-facing area under SHAPE-ON?
# Voronoi is already measured (0.50635% off -> 0.01298% on = 39.0x). Three remain.
# KILL (pre-registered in S101): < 5x improvement by AREA on any of the four => the sliver->hub->back-facing
# chain is wrong and S98's mechanism must be re-opened.
#
# PF_STRATA_CB=1 IS MANDATORY — without it vitest SKIPS the driver and still exits 0.
cd "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web" || exit 1
export NODE_OPTIONS=--max-old-space-size=12288
export PF_STRATA_CB=1
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_TAG_SUFFIX=_S102
D=research/exchange/_strataConformBisect

# style : SHAPE-off baseline AREA % (from S101)
run_style () {   # $1 = StyleId, $2 = lowercase stem prefix, $3 = baseline area %
  echo "===================== $1  (SHAPE-off baseline ${3}%) ====================="
  PF_CB_STYLE="$1" npx vitest run -c vitest.strata.config.ts \
      research/bridge/_strataConformBisectS34.test.ts > "$D/S102_${1}.log" 2>&1
  echo "  vitest exit $?"
  if grep -qE "1 skipped|0 passed" "$D/S102_${1}.log"; then
    echo "  *** DID NOT RUN (vitest skipped) — NOT A RESULT ***"; return 1; fi
  grep -E "^grid |^unresolved:|^  soup:" "$D/S102_${1}.log" | tail -3
  local stl="$D/${2}_ring_D--H_S102.stl"
  if [ ! -f "$stl" ]; then echo "  *** no STL at $stl — listing candidates:"; ls -1 "$D/${2}_ring"*_S102.stl 2>/dev/null; return 1; fi
  PF_S100_STL="$stl" PF_S100_STYLE="$1" PF_S100_TAG="S102_$2" \
      bash research/tools/run-s100-bf-gate.sh > "$D/S102_${1}_GATE.log" 2>&1
  grep -E "facets +:|BACK-FACING FACETS|share of scope, AREA|GATE VERDICT|PRECOND radial" "$D/S102_${1}_GATE.log"
  echo
}

run_style GeometricStar    geometricstar    1.46237
run_style Crystalline      crystalline      1.09450
run_style CelticTriquetra  celtictriquetra  0.95229
echo "=== DONE. Compare each AREA against its SHAPE-off baseline; kill line is <5x on any. ==="
