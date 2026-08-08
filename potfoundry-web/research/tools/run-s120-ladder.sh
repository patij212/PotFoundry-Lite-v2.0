#!/usr/bin/env bash
# run-s120-ladder.sh — S120 TASK C. The DENSITY LADDER for the blocked class.
# Every mesh here came out of the driver (S119's ladder arms), all of which DRAINED (heap 0 left).
# Bundling happens ONCE up front; the rungs then run with PF_S120_NOBUNDLE=1 so a concurrent
# `npx esbuild` cannot tear down a live run.
set -uo pipefail
cd "$(dirname "$0")/../.."
EX="$(pwd)/research/exchange/_strataConformBisect"
export PF_S120_DIR="$EX/s120"
mkdir -p "$PF_S120_DIR" research/bridge/out

echo "── bundling both tools ONCE ──"
npx esbuild research/tools/s120Blocked.ts --bundle --platform=node --format=cjs --target=node20 \
  --outfile=research/bridge/out/_run_s120Blocked.cjs || exit 1
npx esbuild research/tools/s120Ops.ts --bundle --platform=node --format=cjs --target=node20 \
  --outfile=research/bridge/out/_run_s120Ops.cjs || exit 1
export PF_S120_NOBUNDLE=1

run () {  # tag  stl  style  acceptUm  snap
  echo "════════ $1 ════════"
  export PF_S120_TAG="$1" PF_S120_STL="$EX/$2" PF_S120_STYLE="$3" PF_S120_ACCEPT_UM="$4" PF_S120_SNAP="$5"
  export PF_S120_OUT="$PF_S120_DIR/blocked_$1.json"
  bash research/tools/run-s120-blocked.sh > /dev/null 2>&1
  export PF_S120_DUMP="$PF_S120_OUT"
  bash research/tools/run-s120-ops.sh > /dev/null 2>&1
  echo "   done $1"
}

# *** THE acceptTol PER RUNG IS NOT A CONSTANT AND GETTING IT WRONG VOIDS THE RUNG. ***
# S119's Gothic ladder is a TOLERANCE ladder (14 / 7 / 3.5 / 1.75 / 0.875 µm), and its CTA rungs are too
# (7 / 3.5 / 1.75). Every value below is transcribed from that arm's own driver log `rank/accept:` line.
# The first attempt at this ladder passed 3.5 µm to every rung; stage 1's DRAIN CHECK caught it
# (GO025X read 63 % of the mesh demanding and 99.97 % of that still legal, which is impossible on an arm
# whose log says `heap: 0 left`). That instrument exists for exactly this and it earned its keep.
run GO025X gothicarches_ring_DS-HT_S119GO025X.stl GothicArches 14    1
run GO05X  gothicarches_ring_DS-HT_S119GO05X.stl  GothicArches 7     1
run GO1X   gothicarches_ring_DS-HT_S119GO1X.stl   GothicArches 3.5   1
run GO2X   gothicarches_ring_DS-HT_S119GO2X.stl   GothicArches 1.75  1
run GO4X   gothicarches_ring_DS-HT_S119GO4X.stl   GothicArches 0.875 1
run CT2X   'celtictriquetra_ring_D--H_S119CT2X.stl'  CelticTriquetra 7    0
run CTA2X  'celtictriquetra_ring_D--H_S119CTA2X.stl' CelticTriquetra 3.5  0
run CTA4X  'celtictriquetra_ring_D--H_S119CTA4X.stl' CelticTriquetra 1.75 0
echo "LADDER COMPLETE"
