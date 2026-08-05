#!/usr/bin/env bash
# S40 — THE AR-CAP SWEEP AT PRODUCTION SCALE. One arm per invocation.
#
#   bash research/tools/run-s40-arcap-one-arm.sh <TAG> <PF_CB_SHAPE_AR>
#
# WHY THIS ARM EXISTS. Every arm this campaign has run ends with `unresolved by reason: shape-ar`
# at 100% — 774 facets in S39CTL, 3,980 in S34CTL, 3,571 in S47CAV — and the HEADLINE MAX *is* that
# population (47.282 = max(adaptive 47.230, ...) against `unresolved worst 47.230`). The cap that
# creates it, PF_CB_SHAPE_AR, has NEVER been varied by any runner in this campaign. Grep is the
# proof: `grep -rl PF_CB_SHAPE_AR research/tools/*.sh research/bridge/out/*.sh` returns nothing.
#
# THE ONLY SWEEP THAT EXISTS is a code comment at _strataConformBisectS34.test.ts:203-213, taken at
# 40x28 / 120k tris — 1/20th of production scale — and scored on the BLADE CENSUS, a shape metric.
# Its only fidelity-ish column is disclaimed in the same comment ("~110x blind on exactly these
# facets ... must NOT be read as a fidelity ranking"). So the FIDELITY PRICE OF AR-50 HAS NEVER BEEN
# MEASURED. That sweep's own table is why this arm is cheap and worth running:
#
#     cap     census AR>50      folds   unresolved   plane MAX    min edge   wall
#     OFF     1 540 (2.520 %)   0       0            295.802 um    1.892 um   284 s
#     100       938 (1.535 %)   0       0            207.311 um    7.165 um   283 s
#     50          0 (0.000 %)   0       56           405.396 um   12.575 um   278 s
#     25          0 (0.000 %)   0       220          398.629 um   22.756 um   271 s
#
#   *** THE CAP IS WHAT CREATES `unresolved`. At 100 and OFF it is ZERO. *** That is the hypothesis
#   under test at production scale, where the population is 774 rather than 56.
#
# ONE VARIABLE, AND IT IS NOT THE OLD SWEEP'S VARIABLE. The historical "OFF" row set PF_CB_SHAPE=0,
# which disables the WHOLE S1/S2/S3/S4 family — cap AND fold guard AND 3-D midpoint AND longest-edge
# preference. That confounds four levers. Here PF_CB_SHAPE stays 1 and only the cap number moves, so
# S2 (fold), S3 (mid3d) and S4 (longfall) are held fixed and a fold in the output is a real finding
# rather than a guard that was switched off.
#
# CONTROL: S39CTL, ALREADY ON DISK AND ALREADY REPRODUCED — 1,142,166 tris / 822 s / 774 unresolved
# / HEADLINE 47.282 um, at PF_CB_SHAPE_AR=50 (the default). Every other flag below is byte-identical
# to run-s39-one-arm.sh, so this sweep is one variable against a control that has been run twice.
#
# PRE-REGISTERED, so the read is not chosen after the fact:
#   * `unresolved` FALLS with the cap. If it does not, the refusal is mislabelled and `classifyStrand`
#     is the defect, not the cap.
#   * BLADES RISE. The judge's BLADE gate already reads 2 (both initial-grid births, unfixable by any
#     guard); the arm's cost is whatever it adds ON TOP of those 2.
#   * The HEADLINE MAX is the driver's own blind plane ruler (median 21.9x optimistic, max 541x,
#     measured 2026-08-02) and IS NOT THE VERDICT for this or any arm. Read it only to confirm the
#     lever fired at all. THE VERDICT IS THE CERTIFICATE, run afterwards on the surviving arm.
#   * The honest CHEAP read that ships with every arm is the `sagNowUm` column of
#     `<tag>.unresolved.json` — the driver's own EDGE ruler re-read on the shipped mesh. On S39CTL it
#     runs to 210.617 um max / 13.99 um p50 with 60.6% of the population over the 10 um bar, against
#     a reported `unresolved worst 47.230`. Compare arms on THAT column and on its count, never on
#     the reported worst, which is the stale pop-time plane key (:3138 stores kTop, :3083 stores
#     worstEdgeSag — two rulers in one column, and the `rulers` metadata calls them the same one).
#
# WALL TIME IS NOT COMPARABLE ACROSS CONCURRENT ARMS (memory bandwidth and cache contention; the heap
# driver's pop loop is serial, so each arm is single-threaded). Triangle counts, refusal counters,
# unresolved populations and the certificate ARE comparable. Heap is 4096 MB so two arms cannot
# overcommit. The caller must bump PriorityClass after spawning — Windows EcoQoS was measured
# throttling this exact workload to 0.61 of a core.
set -uo pipefail
cd "$(dirname "$0")/../.."

TAG="${1:?usage: run-s40-arcap-one-arm.sh <TAG> <SHAPE_AR>}"
AR="${2:?}"

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
export PF_CB_ALIGNED_RESOLVE_UM=50
export PF_CB_MAXSECS=7200
export NODE_OPTIONS=--max-old-space-size=4096

# THE ONE VARIABLE. The rest of the shape family is left at its defaults ON.
export PF_CB_SHAPE=1
export PF_CB_SHAPE_AR="${AR}"

echo "=============================================================="
echo "ARM ${TAG}   PF_CB_SHAPE_AR=${AR}   (control = S39CTL @ 50)"
echo "=============================================================="
PF_CB_TAG_SUFFIX="_${TAG}" \
  npx vitest run --config vitest.s34resolve.config.ts
