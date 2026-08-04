#!/usr/bin/env bash
# S34-M43 — §4.3's SNAP-TO-LOCUS VERTEX MOVE, now BUILT, A/B'd on top of the re-solve.
#
# THE PAIRING IS THE POINT. 0ac73efc showed the seed-time re-solve collapses `unresolved` 80.6% and
# leaves the MAX untouched, and s32/s33 predicted exactly why: the re-solve fixes the ACTIONABLE
# half, while §4.3's DEFERRED half (15,226 events at seed scale) is untouched (+20). So the control
# here is NOT the bare driver — it is the RE-SOLVE arm. One variable: PF_CB_MOVE43.
#
# WHAT §4.3 DOES. At an R4/R1 conform refusal the crossing sits within SNAP_ALPHA*|e| of an endpoint.
# Splitting there makes a sliver. Moving that endpoint ONTO the crossing conforms exactly, creates no
# vertex, and terminates in one step. The branch has said "NOT IMPLEMENTED" since the spec.
#
# WHY THE GUARD IS SOUND HERE AND NEEDED A SEPARATE PSLG PASS AT SEED TIME: the mesh is already a
# triangulation, so two edges cannot cross unless an incident facet inverts. A (theta,z) orientation
# sign-check over the WHOLE STAR is therefore the embedding check. Plus the AR cap on every star
# facet, plus the two invalidations the driver itself named as prerequisites — the edge-verdict memo
# (§6.5's MEMO_VERIFY comment says the move "cannot land without the check that proves the memo still
# holds") and the vertex's stale `gcell` membership.
#
# READ FIRST: `MOVED` vs `refused on shape`. A low MOVED with high shape refusals means the stars are
# already at the AR cap mid-refinement — which is what the jam census predicts (stars at AR p50 44.0
# vs a cap of 50) and would REFUTE §4.3 as built. s32's 99.8% legality was measured on the FAT SEED
# and was published as an optimistic upper bound for exactly this reason.
#
# ⚠ RUN SEQUENTIALLY. Two multi-GB heaps on this box OOM the workers.
#
# Usage:  bash research/tools/run-s34-move43-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

export PF_STRATA_CB=1
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_SNAP=1
export PF_CB_TOL=0.01
export PF_CB_ACCEPT=0.0035
export PF_CB_TRICAP=8000000
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140
export PF_CB_TIGHTEN=research/exchange/_phase2/S24i1.loci.json
export PF_CB_ALIGNED_SEED=1
export PF_CB_ALIGNED_ACROSS_ABS=1
export PF_CB_ALIGNED_RINGS=7
export PF_CB_ALIGNED_TURN_MUL=9
export PF_CB_ALIGNED_PATCH=research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
export PF_CB_ALIGNED_PATCH_TOPN=0
export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016
export PF_CB_EMIT_UNRESOLVED=1

# BOTH arms carry the re-solve. The ONLY difference below is PF_CB_MOVE43.
export PF_CB_ALIGNED_RESOLVE_UM=50

export NODE_OPTIONS=--max-old-space-size=6144

run_arm() {
  local suffix="$1" move43="$2"
  echo "=============================================================="
  echo "ARM ${suffix}   PF_CB_MOVE43=${move43}   (re-solve ON in both)"
  echo "=============================================================="
  PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_MOVE43="${move43}" \
    npx vitest run --config vitest.s34resolve.config.ts
}

# S34RES (move43 OFF) was already produced by 0ac73efc — 1,142,166 tris / 774 unresolved. It is
# re-run here anyway rather than compared against that file, because the standing lesson in this
# repo is that committed baselines are not reproducible and the control must be run in the pair.
run_arm S34RES2 0
run_arm S34M43  1
