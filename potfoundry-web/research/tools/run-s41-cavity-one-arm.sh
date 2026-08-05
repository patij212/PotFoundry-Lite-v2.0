#!/usr/bin/env bash
# S41 — RE-COMPOSE THE IN-LOOP CAVITY ESCALATION ONTO THE RE-SOLVED SEED. One arm per invocation.
#
#   bash research/tools/run-s41-cavity-one-arm.sh <TAG> <PF_CB_ALIGNED_RESOLVE_UM> <PF_CB_CAVITY>
#
# WHY THIS ARM EXISTS. The campaign's two levers that move ANYTHING live in two different forks of the
# same driver and therefore could not be composed by configuration until the 3-line port landed in
# `_strataConformBisectV2.test.ts` (the implementation is in the SHARED `_strataAlignedSeed.ts`, so
# the mechanism cannot drift between forks — only the forwarding could, and now neither does):
#
#   SEED-TIME CHAIN RE-SOLVE   (S34 fork)   unresolved 3,980 -> 774  (-80.6%), -9% tris, -46% wall
#                                           ... and the HEADLINE MAX did not move: 47.297 -> 47.282
#   IN-LOOP CAVITY ESCALATION  (V2 fork)    HEADLINE MAX 47.297 -> 22.241 (-53%), +1.7% tris, +19% wall
#                                           ... and `unresolved` barely moved: 3,980 -> 3,571
#
# EACH FIXES THE HALF THE OTHER DOES NOT, and the reason is mechanical rather than lucky. The re-solve
# removes ACTIONABLE crease crossings at seed time (9,363 -> 1,392, -85.1%) — it stops the driver from
# ever being handed the bad configuration. The cavity DELETES a jammed region and re-triangulates it
# through CDT — it is the only lever in the campaign that changes CONNECTIVITY, which is exactly what
# the jam census concluded the AR-50 corner needs ("a CONNECTIVITY change, not a better vertex
# position", 0ac73efc). Bisection structurally cannot repair a sliver: `2026-08-03-strata-atomic-
# corridor-s44.md` states it plainly — "Direct LEB is not a sliver cure: bisection retains an original
# endpoint angle in one child." So the accept rule, the ranking key, the tolerance and the vertex move
# were never able to reach this population, and four arms measured exactly that.
#
# THE FORK-EQUIVALENCE CHECK IS ALREADY DONE AND COSTS THIS ARM NOTHING. S46CTL (V2 fork) and S34CTL
# (S34 fork) produced the SAME MESH — 1,255,568 tris / 3,980 unresolved / HEADLINE 47.297 um, both
# `alloc 2278074` — so the two forks agree on the control and a cross-fork comparison is legitimate.
#
# THE THREE ARMS, and the first two are VALIDITY GATES that must reproduce known numbers to the digit
# before the third means anything:
#
#   S41RES     RESOLVE=50  CAVITY=0     must reproduce S39CTL: 1,142,166 tris / 774 unresolved /
#                                       47.282 um / alloc 2,029,406.  *** THIS PROVES THE PORT IS
#                                       FAITHFUL — new code path, known answer. Run it FIRST. ***
#   S41CTL     RESOLVE=0   CAVITY=0     must reproduce S46CTL: 1,255,568 / 3,980 / 47.297 / alloc
#                                       2,278,074.  Proves the port is INERT at 0. Only needed to
#                                       disambiguate if S41RES misses — a miss there is either the
#                                       port or a V2/S34 divergence, and this separates them.
#   S41CAVRES  RESOLVE=50  CAVITY=4000  *** THE TREATMENT. ***
#
# CAVITY PARAMETERS ARE S47CAV'S, UNCHANGED (4000 patch / rings 2 / budget 6000), so S41CAVRES vs
# S47CAV is one variable (the seed) and S41CAVRES vs S39CTL is one variable (the cavity). Both
# comparisons are available from the one arm, which is why the knobs are not being tuned here.
#
# PRE-REGISTERED. The two levers are complementary IF S41CAVRES lands near `unresolved` ~774 AND
# HEADLINE ~22 um. Three ways it can fail, all informative and all worth the arm:
#   (a) INTERFERENCE — the re-solve removes the crossings the cavity escalation was triggering on, so
#       cavity fires far less and the max stays at 47.28. Diagnostic: the `cavTried` / `blocking
#       witness seen` counters, which S47CAV reported at 1380/3003.
#   (b) THE MAX MOVES AND `unresolved` DOES NOT — then the cavity is not reaching the AR corner either
#       and the 22.241 was a different population.
#   (c) BOTH MOVE. Then the composition is the campaign's first two-lever win and the next question is
#       the PATCH RIM: S47CAV reported "cavity reached the EXTRACTED PATCH RIM 36/3003 — an ARTIFICIAL
#       boundary ... raise PF_CB_CAVITY". That is a known, unexercised knob and the obvious follow-on.
#
# THE HEADLINE MAX IS THE DRIVER'S BLIND PLANE RULER (median 21.9x optimistic, max 541x) AND IS NOT
# THE VERDICT. It is quotable here ONLY as a cross-arm comparison against S47CAV/S39CTL, which were
# measured with the identical ruler on the identical config. THE VERDICT IS THE CERTIFICATE.
# The honest cheap read is `<tag>.unresolved.json`'s `sagNowUm` column, not the reported worst — that
# is the stale pop-time plane key (:3138 stores kTop where :3083 stores worstEdgeSag).
#
# Two concurrent arms max; heap 4096 MB; bump PriorityClass after spawning (Windows EcoQoS).
set -uo pipefail
cd "$(dirname "$0")/../.."

TAG="${1:?usage: run-s41-cavity-one-arm.sh <TAG> <RESOLVE_UM> <CAVITY>}"
RES="${2:?}"
CAV="${3:?}"

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
export PF_CB_MAXSECS=7200
export NODE_OPTIONS=--max-old-space-size=4096

# THE TWO VARIABLES, one per arm. At 0 each is arithmetically absent.
export PF_CB_ALIGNED_RESOLVE_UM="${RES}"
export PF_CB_CAVITY="${CAV}"
if [ "${CAV}" != "0" ]; then
  export PF_CB_CAVITY_RINGS=2
  export PF_CB_CAVITY_BUDGET=6000
fi

echo "=============================================================="
echo "ARM ${TAG}   RESOLVE_UM=${RES}   CAVITY=${CAV}   [V2 fork]"
echo "=============================================================="
PF_CB_TAG_SUFFIX="_${TAG}" \
  npx vitest run --config vitest.stratav2.config.ts
