#!/usr/bin/env bash
# S95-WALL: run S93's OWN `frontierRefine.ts` unmodified, against the SHAPE-GATED Voronoi artefact.
#
# WHY THIS RUNNER EXISTS AND IS NOT `run-frontier-refine.sh`. That runner bundles to
# `research/bridge/out/_run_frontierRefine.cjs` and writes `frontier/FR_REF_<tag>.report.txt` — both
# owned by the S93/frontier agent, which may be running concurrently (a real collision happened on
# 2026-08-05 when two agents shared a bundle path and one executed the other's binary). This copy runs
# the SAME UNMODIFIED TOOL from an s95-owned bundle path into an s95-owned report path, so the
# comparison is apples-to-apples on the code and cannot collide on the filesystem.
#
# THE PRE-REGISTERED QUESTION: S93's "Voronoi: LEPP 222.0x, 15.6% uncleared" — the number that split the
# catalogue into SMOOTH-RELIEF vs NEAR-VERTICAL-WALL — was measured on `voronoi_ring_D--.stl`, the
# SHAPE-OFF artefact that carries a q<0.2 sliver population Gothic does not have and that produces 97.9%
# of the folds (S95_WALL_FINDINGS). Same style, same rA, same params, shape gate ON:
#   *** KILL: if LEPP still costs >= 100x with >= 10% uncleared on the shape-gated mesh, the sliver
#   explanation is REFUTED and NEAR-VERTICAL-WALL is a real class after all. ***
# Settings are pinned to S93's own Voronoi arms (N=400, maxLev 6, uniLev 2) so only the STL changes.
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

TOOL=research/tools/frontierRefine.ts

OUT=research/bridge/out
BUNDLE="$OUT/_run_s95RefineShaped.cjs"                # s95-owned, cannot collide with the S93 agent
REPORT="research/exchange/_strataConformBisect/s95/S95_REF_${PF_FD_TAG:-VORSHP}.report.txt"
mkdir -p "$OUT" "$(dirname "$REPORT")"

echo "── bundling $TOOL -> $BUNDLE ──"
npx esbuild "$TOOL" --bundle --platform=node --format=cjs --target=node20 \
  --outfile="$BUNDLE" || { echo "*** BUNDLE FAILED ***"; exit 1; }

export NODE_OPTIONS=--max-old-space-size=10240
node "$BUNDLE" "$@" 2>&1 | tee "$REPORT"
echo
echo "report written to $REPORT"
