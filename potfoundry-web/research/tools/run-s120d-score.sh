#!/usr/bin/env bash
# run-s120d-score.sh — S120 TASK D: score every STL a ladder segment produced.
#
#   bash research/tools/run-s120d-score.sh <TAG> [<TAG> ...]
#
# For each tag it locates the STL the driver wrote with that PF_CB_TAG_SUFFIX, then runs
#   research/tools/s120dPole.cjs   -> POLE_<TAG>.json   (poles / thin / needles / 3-D AR, COUNT+AREA+MAX)
# and CROSS-CHECKS the pole count against the second, independent instrument
#   research/bridge/out/_run_s120Thin.cjs  (research/tools/s118ThinCensus.ts, prebuilt bundle)
# printing BOTH so a divergence is visible rather than assumed away.
#
# NO esbuild ANYWHERE — both are prebuilt/plain CJS, so this is safe to run while a vitest arm is live.
set -uo pipefail
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect
OUT=$D/s120d
mkdir -p "$OUT"
ABS="$(pwd)"

for TAG in "$@"; do
  stl=""
  for f in "$D"/*_"$TAG".stl; do [ -f "$f" ] && stl="$f"; done
  if [ -z "$stl" ]; then echo "*** $TAG — NO STL, skipping (this is a missing result, not a zero) ***"; continue; fi
  echo "════════ $TAG   $(basename "$stl") ════════"
  node research/tools/s120dPole.cjs "$ABS/$stl" "$TAG" > "$OUT/POLE_$TAG.report.txt" 2>&1
  grep -E "^JSON " "$OUT/POLE_$TAG.report.txt" | sed 's/^JSON //' > "$OUT/POLE_$TAG.json"
  grep -vE "^JSON " "$OUT/POLE_$TAG.report.txt" | sed -n '4,10p'
  # ── SECOND INSTRUMENT on the same file: the pole COUNT must agree ──
  if [ -f research/bridge/out/_run_s120Thin.cjs ]; then
    PF_S118T_STL="$ABS/$stl" PF_S118T_TAG="$TAG" NODE_OPTIONS=--max-old-space-size=10240 \
      node research/bridge/out/_run_s120Thin.cjs > "$OUT/THIN_$TAG.report.txt" 2>&1
    a=$(grep -oE "DEGENERACY POLES \(graphRatio>=100\) [0-9]+" "$OUT/THIN_$TAG.report.txt" | grep -oE "[0-9]+$")
    b=$(node -e "const j=require('$ABS/$OUT/POLE_$TAG.json');console.log(j.poleC)" 2>/dev/null)
    if [ "$a" = "$b" ]; then echo "   C-POLE: two independent instruments agree on the pole count: $a"
    else echo "   *** C-POLE DIVERGENCE: s118ThinCensus $a vs s120dPole $b — INSTRUMENT DEFECT, the census is VOID ***"; fi
  else
    echo "   (no _run_s120Thin.cjs bundle — pole count rests on ONE instrument; say so in the report)"
  fi
done
echo "scored: $*"
