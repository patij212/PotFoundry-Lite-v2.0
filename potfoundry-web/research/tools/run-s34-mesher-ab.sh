#!/usr/bin/env bash
# S34 MESHER ARM — does the seed-time chain re-solve's -85% SURVIVE REFINEMENT and reach the STL?
#
# Everything in this campaign so far is seed-stage. No mesh has been built and no fidelity number
# has been earned. This is the first arm that produces one.
#
# WHAT IS BEING TESTED. `_strataAlignedSeed.ts` stage 1a-bis (`resolveSpanMm`, committed 71d76c39)
# moves each interior chain vertex onto the TRUE analytic locus with a transverse kink probe. At the
# SEED it collapses actionable crease crossings 9,363 -> 1,392 (-85.1%) with zero PSLG planarity
# breaks and identical overCap/worstAR (s34ResolveSeedAB.ts). Those crossings are the population the
# 2026-08-04 locality census tied to the user-visible micro-serrations: 88.4% of them have exactly
# one constrained endpoint, and their p10 edge length is 50.0 um — the chain-to-first-ring strip.
#
# WHY A FORK. The working-tree driver carries ~1,192 lines from another session (preserved in
# 814fb069). An arm run against it would not be attributable to this lever. The fork is taken from
# 71d76c39 and differs in exactly one place: PF_CB_ALIGNED_RESOLVE_UM. It is TEMPORARY — delete it
# once the lever is promoted or refuted.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# REGISTERED BEFORE THE RUN
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# M1 CONTROL VALIDITY. Arm A0 must reproduce the S46 control's shape: ~1.26 M triangles, heap
#    DRAINED (not capped, not timeCapped), ~3,980 unresolved. It must also print
#    "re-solved 0" — proving the fork is inert at 0 and this is the parent driver's arithmetic.
#    A control that does not reproduce VOIDS the comparison; read it FIRST.
# M2 THE SEED DEBT SHOULD CARRY. A1's report header must show the seed's own
#    `edgesCrossingLocus` well below A0's, and re-solved ~34,993.
# M3 THE ACTUAL QUESTION — does it reach the MESH? Compare `unresolved`, worst unresolved, and the
#    final facet census. The seed is ~9% bigger, so a fair read needs triangles alongside.
# M4 NO TOPOLOGY REGRESSION. non-manifold 0 / reversed 0 in both arms, or the arm is void whatever
#    else it shows.
#
# ⚠ WHAT THIS ARM CANNOT SETTLE. The driver's own accept ruler is the BLIND INFINITE-PLANE test
#   (median 21.9x optimistic, max 541x — measured 2026-08-02). `MAXtri@oracle8` in the report is
#   that same blind ruler and is NOT fidelity. A drop in `unresolved` is a DRIVER-STATE improvement,
#   not a proven 0.01 mm improvement. An honest fidelity verdict needs the perpendicular certificate
#   run over the emitted STL, which is a separate and much longer job.
#
# ~60-70 min for both arms, sequentially. Never concurrently: two 6 GB heaps OOM this box.
#
# Usage:  bash research/tools/run-s34-mesher-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

export PF_STRATA_CB=1        # the driver's own opt-in gate; without it vitest SKIPS and exits 0
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1      # BOTH default OFF. Omitting them silently gives an `l--` LEPP/no-snap
export PF_CB_SNAP=1          # arm instead of production's directed+snap. READ THE TAG.
export PF_CB_TOL=0.01
export PF_CB_ACCEPT=0.0035
export PF_CB_TRICAP=8000000
export PF_CB_GRIDU=200
export PF_CB_GRIDV=140

export PF_CB_TIGHTEN=research/exchange/_phase2/S24i1.loci.json

# S10/S15/S19 aligned constrained seed — transcribed from run-s45-lastchance-ab.sh.
export PF_CB_ALIGNED_SEED=1
export PF_CB_ALIGNED_ACROSS_ABS=1
export PF_CB_ALIGNED_RINGS=7
export PF_CB_ALIGNED_TURN_MUL=9

export PF_CB_ALIGNED_PATCH=research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json
export PF_CB_ALIGNED_PATCH_TOPN=0
export PF_CB_ALIGNED_PATCH_IDS=0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016

export PF_CB_EMIT_UNRESOLVED=1
export NODE_OPTIONS=--max-old-space-size=6144

run_arm() {
  local suffix="$1" resolve="$2"
  echo "=============================================================="
  echo "ARM ${suffix}   PF_CB_ALIGNED_RESOLVE_UM=${resolve}"
  echo "=============================================================="
  PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_ALIGNED_RESOLVE_UM="${resolve}" \
    npx vitest run --config vitest.s34resolve.config.ts
}

run_arm S34CTL 0    # control — the fork with the lever OFF must behave as the unforked parent
run_arm S34RES 50   # treatment — the measured shipping span. Wider BREAKS PSLG planarity (S33).
