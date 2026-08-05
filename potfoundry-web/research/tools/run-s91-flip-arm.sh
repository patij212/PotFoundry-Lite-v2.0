#!/usr/bin/env bash
# S91 — ONE CONSTRAINED-FLIP ARM PER INVOCATION (STYLEFLIP's runner; copied from _run-template.sh).
#
#   PF_S91F_BUNDLE=1 bash research/tools/run-s91-flip-arm.sh <TAG> <Style> <stem> <arm none|con>
#   PF_S91F_BUNDLE=0 bash research/tools/run-s91-flip-arm.sh ...      # every later arm
#
# *** WHY THE BUNDLE IS GATED. *** `run-s60-constrained-flip.sh` esbuilds to a FIXED outfile on every
# invocation, so two concurrent arms race on the same binary — the exact collision `_run-template.sh`
# exists to prevent (2026-08-05: one agent executed another's binary and published its numbers). Here
# the bundle is built ONCE, sequentially, with no arm running; every arm then executes that fixed file
# read-only. The report name carries the TAG so concurrent arms cannot overwrite each other's log.
#
# PRE-REGISTERED KILL-CRITERIA for every arm launched through this file (S91_STYLEFLIP_FINDINGS.md §4):
#   K-L-GATE  the ARM=none control's written STL must be byte-identical in GEOMETRY (the 36 vertex bytes
#             of every facet; header + derived normal excluded) to its input. If not, the arm is VOID.
#   K-La      orientation over-bar AREA ratio < 2.0  =>  the flip does NOT transfer at Gothic strength.
#   K-Lb      any change in edges / boundary / non-manifold / orientation-inconsistent, or vertices
#             moved != 0, or triangles added != 0  =>  UNSOUND on that style, reported as a failure
#             whatever the yield.
#   K-Lc      the driver's PLANE position over-bar must not increase (a C2 integrity check, NOT a
#             fidelity verdict — that ruler is a ranker, 21-1527x low as a size).
#   K-L-VAC   rejPos == 0 or rejDet == 0  =>  that clause is vacuous on this style; report it as such.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TAG="${1:?usage: run-s91-flip-arm.sh <TAG> <Style> <stem> <arm none|con>}"
STYLE="${2:?}"
STEM="${3:?}"
ARM="${4:-con}"

TOOL=research/tools/s60ConstrainedFlip.ts
OUT=research/bridge/out
BUNDLE="$OUT/_run_s91flip.cjs"                       # STYLEFLIP's own bundle; never s60's
REPORT="research/exchange/_strataConformBisect/S91_FLIP_${TAG}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

if [ "${PF_S91F_BUNDLE:-1}" = "1" ]; then
  echo "── bundling $TOOL -> $BUNDLE ──"
  npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
    --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }
  echo "── checking for undefined identifiers (TS2304 only) ──"
  npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --skipLibCheck --strict false "$TOOL" 2>&1 | grep "TS2304" && {
      echo "*** TS2304: undefined identifier. Fix before running. ***"; exit 1; } || echo "   none"
else
  [ -f "$BUNDLE" ] || { echo "*** $BUNDLE missing — run once with PF_S91F_BUNDLE=1 first ***"; exit 1; }
  echo "── reusing $BUNDLE (PF_S91F_BUNDLE=0) ──"
fi

export NODE_OPTIONS=--max-old-space-size=10240
export PF_S60_TAG="$TAG" PF_S60_STYLE="$STYLE" PF_S60_STEM="$STEM" PF_S60_ARM="$ARM"
echo "=============================================================="
echo "S91 FLIP ARM ${TAG}   style ${STYLE}   stem ${STEM}   arm ${ARM}"
echo "=============================================================="
node "$BUNDLE" 2>&1 | tee "$REPORT" &
NPID=$!
sleep 4
# Windows EcoQoS throttles detached node jobs to ~0.61 of a core; pin the tree after every spawn.
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { \$_.PriorityClass='AboveNormal' } catch {} }" >/dev/null 2>&1 || true
wait $NPID
echo
echo "report written to $REPORT"
