#!/usr/bin/env bash
# run-s120d-edge.sh — S120 TASK D: EDGE CONFORMANCE of a ladder mesh, with TASK B's ruler, UNMODIFIED.
#
#   bash research/tools/run-s120d-edge.sh <STYLE> <TAG> [<TAG> ...]
#
# *** NO ONE HAS EVER SCORED AN EDGE BEFORE TASK B. *** Every position number this campaign has published
# is PER-FACET. This runs Task B's ruler (research/tools/s120EdgeRuler.ts, validated 9/9 two-sided on
# closed forms) over a Task-D mesh and distils the four scalars the ladder table needs:
#     edges | over 0.01 mm | over 0.001 mm | MAX (PERPENDICULAR, after the golden polish)
# THE PERPENDICULAR PASS IS ON. Radial is a sound UPPER bound only, and its own C2 control (perpendicular
# > radial must never happen) is inside the tool.
#
# REUSES THE PREBUILT BUNDLE — no esbuild invocation, so this is safe beside a live vitest arm.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect
OUT=$D/s120d
BUNDLE=research/bridge/out/_run_s120EdgeRuler.cjs
mkdir -p "$OUT"
ABS="$(pwd)"
[ -f "$BUNDLE" ] || { echo "*** NO BUNDLE AT $BUNDLE — refusing to invoke esbuild while an arm may be live ***"; exit 1; }

STYLE="${1:?usage: run-s120d-edge.sh <STYLE> <TAG> [...]}"; shift
for TAG in "$@"; do
  stl=""
  for f in "$D"/*_"$TAG".stl; do [ -f "$f" ] && stl="$f"; done
  if [ -z "$stl" ]; then echo "*** $TAG — NO STL, skipping (a missing result, not a zero) ***"; continue; fi
  echo "════════ EDGE $TAG   $(basename "$stl") ════════"
  t0=$(date +%s)
  PF_S120_STL="$ABS/$stl" PF_S120_TAG="D_$TAG" PF_S120_STYLE="$STYLE" \
    PF_S120_OUTDIR="$OUT" PF_S120_NS="${PF_S120_NS:-64}" PF_S120_PRIO=1 \
    NODE_OPTIONS=--max-old-space-size=10240 \
    node "$BUNDLE" > "$OUT/EDGE_$TAG.report.txt" 2>&1
  echo "  exit $?   wall $(( $(date +%s) - t0 )) s"
  node -e "
    const j = require('$ABS/$OUT/S120_EDGE_D_$TAG.json');
    const o = {
      tag: '$TAG', nS: j.nS, edges: j.phaseR.edges, totalLenMm: j.phaseR.totalLenMm,
      overHi: j.phaseP.overHiCount, overHiLenPct: j.phaseP.overHiLenPct,
      overLo: j.phaseP.overLoCount, overLoLenPct: j.phaseP.overLoLenPct,
      max: (j.perpPolish && j.perpPolish.perpMaxAfter) || j.phaseP.max,
      c2Violations: j.phaseP.c2Violations, radialOverRead: j.phaseP.radialOverRead,
      convergence: j.convergence, wallSeconds: j.wallSeconds,
    };
    require('fs').writeFileSync('$ABS/$OUT/EDGE_$TAG.json', JSON.stringify(o));
    console.log('  ', JSON.stringify(o));
  " 2>&1 | tail -3
done
echo "edge-scored: $*"
