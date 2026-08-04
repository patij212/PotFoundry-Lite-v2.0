#!/usr/bin/env bash
# S36 — THE SOUND ACCEPT TEST. One variable: PF_CB_CERTACCEPT. Both arms carry the re-solve.
#
# WHY. The heap driver's own report line reads `rank/accept: PF_CB_RANK=plane` — RANK and ACCEPT are
# the SAME blind ruler, which under-reads by a measured median 21.9x / p90 88x / max 541x. The
# full-coverage certificate (872d6e5f) then priced the consequence: H1 certified 214.053 um with
# 14,387 of 1,255,568 facets (1.15%) over a 10 um bar, on a mesh whose own driver reported 47.282 um.
#
# WHAT CHANGES, AND ONLY THIS. The accept side. Ranking is untouched, because honest ranking has been
# measured here and it was WORSE (plane 126.0 um / 0 stranded / 456 s vs foot-point 444.1 um / 2,002
# stranded / 769 s, 2026-07-29). The driver's own S29 note says it best: "the honest quantity is an
# EXCELLENT judge and a BAD driver". The veto pushes at the BLIND key, so heap order is unchanged and
# the pop loop's `bsReuse` licence (the key must be a pure function of the triangle) still holds.
#
# THE TEST IS CERTIFIED, NOT WITNESSED. bound = max_lattice distRadial(p) + covRad(T)/n, with p on the
# TRIANGLE. Distance-to-a-set is 1-Lipschitz, so nothing hides between samples — no smoothness
# assumption, no feature detector. Escalates n until it can decide, and REFUSES anything it cannot
# certify. Transcribed from `_facetTruthLib`, not invented.
#
# ⚠ SOUND BUT CONSERVATIVE, STATED UP FRONT. `distRadial` is the RADIAL foot, which over-estimates the
# true perpendicular distance — badly on a steep wall. So this will refuse facets that a perpendicular
# ruler would pass. That is the safe direction (it can never accept something bad) but it costs
# density, and some of the extra refinement will be the ruler's conservatism rather than real error.
# If the arm over-refines, the fix is a distPerp polish on the ambiguous band, exactly as
# `_facetTruthLib` polishes its worst facets — NOT a looser bound.
#
# PRE-REGISTERED. Triangles UP, time UP, `unresolved` probably up. Those are costs, not failures — a
# sound accept test refuses what a blind one passed, which is the entire point. THE VERDICT IS THE
# CERTIFICATE, never the driver's own headline. The question that matters: does the certified H1 max
# fall from 214.053 um, and is the >=350 um facet the re-solve introduced now visible to the driver?
#
# MAXSECS=5400 is insurance, not a budget: escalation is n-squared per facet and this has never run.
#
# Usage:  bash research/tools/run-s36-certaccept-ab.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

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
export PF_CB_MAXSECS=5400
export NODE_OPTIONS=--max-old-space-size=6144

run_arm() {
  local suffix="$1" ca="$2"
  echo "=============================================================="
  echo "ARM ${suffix}   PF_CB_CERTACCEPT=${ca}"
  echo "=============================================================="
  PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_CERTACCEPT="${ca}" \
    npx vitest run --config vitest.s34resolve.config.ts \
    || echo "*** ARM ${suffix} FAILED (continuing) ***"
}

run_arm S36CTL 0
run_arm S36CA  1
