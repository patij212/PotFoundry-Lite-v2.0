#!/usr/bin/env bash
# run-s94-angle-ladder.sh — E-2026-08-06-ANGLE-SIZING, the ANGLE arm of S94/H4.
#
# WHY. The control (S94_REMESH_GOTH_CTL) sweeps the CHORD law h=sqrt(8*tol/k) and reproduces H4 to the
# digit (2.931x / 14.795% over-chord). Read its ANGLE column instead and the two residuals decay at
# DIFFERENT RATES -- chord x0.706/rung, angle x0.819/rung -- and CROSS at the last rung (14.79 chord vs
# 19.84 angle). That is the signature of two different exponents in h: sag ~ h^2*k/8 is quadratic, turn ~
# h*k is linear. A chord-driven field cannot close an angle bar at any affordable density.
#
# THE ARM. Fix tol LOOSE (10 mm => the chord term never binds) and sweep the ANGLE bar instead, so each
# row is a pure `h = theta*/kappa` mesh. Compare the (tris, over-angAREA%) ladder against the control's.
#
# PRE-REGISTERED, TWO-SIDED:
#   CEILING (the claim): at a triangle count within +/-15% of a control rung, over-angAREA% must be
#     LOWER by >= 1.30x. Anything under 1.30x and the angle law is not buying its own complexity.
#   FLOOR 1 (no free lunch): over-chordAREA% must be reported on every row and must NOT be allowed to
#     silently blow out -- an angle field that clears angle by wrecking chord is not a win.
#   FLOOR 2 (shape): leaf minAngle mean must stay >= 0.90x the control's ~47-48 deg.
#   FLOOR 3 (non-vacuity): the ladder must actually move -- if every row reports the same over-angAREA%
#     the angle term is not binding and the run is VOID, not a PASS.
#
# Usage: bash research/tools/run-s94-angle-ladder.sh  [deg list, default "10 6 4 2.5"]
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/s94ConeRemesh.ts
BASE="$(basename "$TOOL" .ts)"
OUT=research/bridge/out
BUNDLE="$OUT/_run_${BASE}_angle.cjs"     # own bundle path: never share with the control's runner
mkdir -p "$OUT" research/exchange/_strataConformBisect/frontier

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
DEGS="${*:-10 6 4 2.5}"

for D in $DEGS; do
  TAG="GOTH_ANG${D/./p}"
  REPORT="research/exchange/_strataConformBisect/frontier/S94_REMESH_${TAG}.report.txt"
  echo
  echo "=============================================================="
  echo "ANGLE ARM  theta* = ${D} deg   tag ${TAG}"
  echo "=============================================================="
  PF_S94M_TAG="$TAG" \
  PF_S94M_TOLS=10 \
  PF_S94M_ANGSIZE_DEG="$D" \
    node "$BUNDLE" 2>&1 | tee "$REPORT"
done
echo
echo "ladder complete. reports in research/exchange/_strataConformBisect/frontier/"
