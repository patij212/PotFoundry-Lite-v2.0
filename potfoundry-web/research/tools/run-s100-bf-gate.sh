#!/usr/bin/env bash
# S100 TASK 3 — the BACK-FACING SHIP GATE. Copied from research/tools/_run-template.sh.
#
#   PF_S100_STL=<path> PF_S100_STYLE=<StyleId> PF_S100_TAG=<tag> \
#     bash research/tools/run-s100-bf-gate.sh
#
# DEFAULT MODE IS REPORT-ONLY — exit 0 whatever the verdict, so it cannot break another agent's job.
# Blocking is opt-in:  PF_S100_GATE_BLOCK=1  (FAIL -> exit 3, NOT-MEASURED -> exit 4).
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s100BackFacingGate.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}.cjs"
REPORT="${PF_S100_REPORT:-research/exchange/_strataConformBisect/s100/S100_BFGATE_${PF_S100_TAG:-DEFAULT}.report.txt}"
mkdir -p "$OUT" "$(dirname "$REPORT")"

if [ "${PF_S100_SKIPBUILD:-0}" != "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
fi

export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
GATE_EXIT="${PIPESTATUS[0]}"
echo
echo "report written to $REPORT   (gate exit ${GATE_EXIT})"
exit "$GATE_EXIT"
