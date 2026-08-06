#!/usr/bin/env bash
# S100 TASK 1 — THE SWEEP-DRIVER A/B (the ATTRIBUTION test for S99's fifth mechanism).
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# THE HYPOTHESIS, AND THE ONE NUMBER THAT KILLS IT
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# S99 attributes the surviving crease class to a MISSING CONFORMANCE TERM in the heap driver's
# `consider()`: it queues a facet only on `sagAdaptive > acceptTol`, and 95.98% (Gothic) of the
# surviving crease-crossing AREA is UNDER that bar while carrying 228 um of orientation chord.
# The SWEEP driver's `triangleNeed` HAS a conformance term and it is FIRST:
#     if (confEdge >= 0) return { need: 'conform', edge: confEdge, cls: worstCls };
# so a crease-crossing edge is refined REGARDLESS of its plane sag.
#
#   PRE-REGISTERED KILL (S99's own, "PRE-REGISTERED NEXT ARMS" item 2):
#   < 3x reduction in crease-crossed AREA  =>  the missing-conformance-term attribution is REFUTED.
#
# PRIMARY METRIC: `s99CreaseCensus` "turn > 1 deg  ALL: area" — the crease-crossing share of TOTAL
# sampled facet area. It is a share of a quantity (the pot's surface area) that is IDENTICAL between
# arms, so it is comparable across unequal triangle counts. Secondary: the extrapolated whole-mesh
# crossing facet COUNT and the share of the OVER-BAR defect AREA. COUNT and AREA on every population.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# WHY THIS CONFIG DIFFERS FROM THE COMMITTED S39CTL ARM — AND WHY BOTH ARMS CARRY THE DIFFERENCE
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# TWO production levers are STRUCTURALLY UNAVAILABLE to the sweep driver, so they are dropped from
# BOTH arms rather than from one:
#
#  1. `PF_CB_TIGHTEN` THROWS under sweep (it scales `consider()`'s acceptTol and would be silently
#     inert).
#  2. *** THE ALIGNED CONSTRAINED SEED IS DISABLED BY THE DRIVER ITSELF: ***
#         const ALIGNED_SEED = envOn('PF_CB_ALIGNED_SEED') && !SWEEP && !GPU_RANK;   (line 1057)
#     A sweep arm CANNOT use it — it always starts from the uniform gu x gv grid. This is the single
#     most important fact about this A/B and it was discovered by the smoke run, not assumed:
#     PF_CB_ALIGNED_ACROSS_ABS=1 threw "inert without PF_CB_ALIGNED_SEED=1" under sweep while
#     PF_CB_ALIGNED_SEED=1 was set.
#
#     S99 measured that the aligned seed is what does most of the conforming today ("the survivors
#     ARE the seed's residue, subdivided"; 1,392 of 382,644 seed edges crossing a locus vs 10,641
#     uniform). So a sweep-vs-production comparison would confound the DRIVER with the SEED. Both
#     arms therefore run the UNIFORM seed, and the ONLY variable is PF_CB_DRIVER.
#
#     CONSEQUENCE, stated up front: this heap arm is NOT the committed S39CTL/S35CTL mesh and its
#     crease numbers will be WORSE than the production ones. That direction is safe for a refutation
#     (the control has more crossings available to remove, which favours sweep) and is unsafe for a
#     confirmation, which is why the production numbers from S99 are quoted alongside as context.
#
# TAGS. The tag is built from the flags, so the two arms write DIFFERENT files by construction:
#   heap  -> gothicarches_ring_DS-H_S100HEAP.stl        ('H' = heap + plane rank)
#   sweep -> gothicarches_ring_DS-W_S100SWEEP.stl       ('W' = sweep, no rank exists)
# No overwrite is possible; they are also DIFFERENT MESHES and the triangle count must be quoted
# alongside any fidelity ratio.
#
# WARNING: PF_STRATA_CB=1 IS LOAD-BEARING. The driver is `it.runIf(RUN)`; without it vitest SKIPS the
#   test AND EXITS 0 — a null result manufactured by a missing env var. The caller must assert
#   "1 passed" (never "1 skipped") before reading any number.
#
# Usage:
#   bash research/tools/run-s100-sweep-ab.sh smokeheap    # ~2 min, de-risks the env refusals
#   bash research/tools/run-s100-sweep-ab.sh smokesweep
#   bash research/tools/run-s100-sweep-ab.sh heap         # full heap control
#   bash research/tools/run-s100-sweep-ab.sh sweep        # full sweep arm
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

MODE="${1:?usage: run-s100-sweep-ab.sh <smokeheap|smokesweep|heap|sweep>}"

export PF_STRATA_CB=1
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_SNAP=1
export PF_CB_TOL=0.01
export PF_CB_ACCEPT=0.0035
export PF_CB_EMIT_UNRESOLVED=1

# NO aligned seed and NO tightening field in EITHER arm — sweep cannot have them (see header), so
# giving them to the heap control alone would confound the driver with the seed.
unset PF_CB_ALIGNED_SEED || true
unset PF_CB_ALIGNED_ACROSS_ABS || true
unset PF_CB_ALIGNED_RINGS || true
unset PF_CB_ALIGNED_TURN_MUL || true
unset PF_CB_ALIGNED_PATCH || true
unset PF_CB_ALIGNED_PATCH_TOPN || true
unset PF_CB_ALIGNED_PATCH_IDS || true
unset PF_CB_ALIGNED_RESOLVE_UM || true
unset PF_CB_TIGHTEN || true
unset PF_CB_RANK || true         # inert under sweep and the driver REFUSES it; unset for both
unset PF_CB_BOUNDED || true
unset PF_CB_ACCEPT_OVERRIDE || true

case "$MODE" in
  smokeheap|smokesweep)
    export PF_CB_GRIDU=60
    export PF_CB_GRIDV=40
    export PF_CB_TRICAP=400000
    export PF_CB_MAXSECS=420
    SUF=S100SMK ;;
  *)
    export PF_CB_GRIDU=200
    export PF_CB_GRIDV=140
    # EQUAL-BUDGET BY CONSTRUCTION. Every split in this driver is a 1->2 bisection, so
    #     live = (alloc + initTris) / 2
    # exactly (verified on both smoke arms: (400000+4800)/2 = 202400 in each). Capping the treatment
    # arm's ALLOC at the control's final alloc therefore pins the two meshes to the SAME triangle
    # count, which is what lets a fidelity ratio be quoted at all. The control runs first at 8 M
    # (uncapped, so it drains naturally) and its alloc is passed back in via PF_CB_TRICAP_EQ.
    export PF_CB_TRICAP="${PF_CB_TRICAP_EQ:-8000000}"
    export PF_CB_MAXSECS=5400
    SUF=S100 ;;
esac

export NODE_OPTIONS=--max-old-space-size=6144

run_arm() {
  local drv="$1" suffix="$2"
  echo "=============================================================="
  echo "S100 ARM ${suffix}   PF_CB_DRIVER=${drv}   grid ${PF_CB_GRIDU}x${PF_CB_GRIDV}  maxsecs ${PF_CB_MAXSECS}"
  echo "=============================================================="
  if [ "$drv" = "sweep" ]; then
    # SERIAL predicate on purpose: PF_CB_SWEEP_WORKERS>1 is proven byte-identical but would make the
    # WALL-TIME column incomparable to the serial heap control. Cost is part of this deliverable.
    PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_DRIVER=sweep PF_CB_SWEEP_WORKERS=1 \
      npx vitest run --config vitest.s34resolve.config.ts
  else
    PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_DRIVER=heap \
      npx vitest run --config vitest.s34resolve.config.ts
  fi
}

case "$MODE" in
  smokeheap)   run_arm heap  "${SUF}HEAP" ;;
  smokesweep)  run_arm sweep "${SUF}SWEEP" ;;
  heap)        run_arm heap  "${SUF}HEAP" ;;
  sweep)       run_arm sweep "${SUF}SWEEP" ;;
  *) echo "unknown mode $MODE"; exit 2 ;;
esac
