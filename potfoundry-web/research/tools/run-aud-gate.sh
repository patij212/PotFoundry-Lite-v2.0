#!/usr/bin/env bash
# AUDIT's runner for the HARD GATE (_strataFacetTruthValidate.test.ts). Own log path per TAG so two
# gate runs never overwrite each other. Env passes straight through, e.g. PF_FT_DESCENT_K=8.
#   bash research/tools/run-aud-gate.sh BASE
#   PF_FT_DESCENT_K=8 bash research/tools/run-aud-gate.sh K8
set -uo pipefail
cd "$(dirname "$0")/../.."
TAG="${1:-BASE}"
LOG="research/exchange/_strataConformBisect/AUD_GATE_${TAG}.log"
mkdir -p "$(dirname "$LOG")"
echo "cwd: $(pwd)   tag: $TAG   PF_FT_DESCENT_K=${PF_FT_DESCENT_K:-unset}   log: $LOG"
export NODE_OPTIONS=--max-old-space-size=8192
: > "$LOG"
PF_STRATA_FTV=1 npx vitest run research/bridge/_strataFacetTruthValidate.test.ts \
  -c vitest.strata.config.ts --testTimeout=1800000 --hookTimeout=600000 >> "$LOG" 2>&1
echo "GATE EXIT $?" | tee -a "$LOG"
grep -E "^(V[0-9]|.*V[0-9]+[a-z]? )|Test Files|Tests  |✓|×|FAIL" "$LOG" | head -60
