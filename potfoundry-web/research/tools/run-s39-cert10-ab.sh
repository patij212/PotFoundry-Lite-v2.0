#!/usr/bin/env bash
# S39 — CERTIFIED ACCEPT AT THE TRUE 10 um PRODUCT BAR. Three arms, because the change is TWO
# variables and collapsing them into one A/B would confound them.
#
#   S39CTL   blind ruler @ 3.5 um   — the STATUS QUO. Must reproduce 838 s / 1,142,166 tris / 774.
#   S39B10   blind ruler @ 10 um    — isolates the TOLERANCE change alone.
#   S39CA10  certified   @ 10 um    — isolates the RULER change, against S39B10.
#
# S39CTL -> S39B10 prices dropping the margin. S39B10 -> S39CA10 prices making the test sound.
# Comparing S39CTL straight to S39CA10 would tangle the two — which is how the 3.5 um margin came to
# look justified in the first place.
#
# WHY 10 um AND NO MARGIN. The 3.5 um acceptTol exists because the plane ruler UNDER-reads — driver
# §1.3: "the predicate is a 1-D LOWER bound on the facet-interior quantity the auditor judges, so the
# 30% margin against TOL matters MORE here". The margin compensates for blindness. S38 then measured
# that the margin is ALSO what makes soundness unaffordable: a certified test costs 40.73x at 3.5 um
# against 4.53x at the true 10 um bar. Blindness and margin were holding each other up; this arm
# removes both together.
#
# THE VETO'S THREE OUTCOMES ARE REPORTED SEPARATELY AND MUST STAY THAT WAY:
#   certified-ACCEPT  radial + covRad/n <= tol. Sound — nothing hides between samples.
#   SCREENED-accept   radial over tol, but a perpendicular solve at the argmax is under it. Strictly
#                     better than the blind plane ruler and NOT a certificate: one point, with no
#                     covRad/n term covering the gaps. Never fold into the certified count.
#   REFUSED           perp-confirmed exceedance, or uncertifiable at the n cap.
# S38 priced the screened branch at 5.8% of facets at this bar, 96.5% of it artifacts that S36
# refused outright — at 7.1x, for nothing.
#
# PRE-REGISTERED. S39B10 should be FASTER and COARSER than S39CTL (a looser bar demands less
# refinement). S39CA10 should cost ~4-5x S39B10 on the accept test and land between the two on
# triangle count. THE VERDICT IS THE CERTIFICATE OVER ALL THREE STLs, never the driver's own
# headline — that headline IS the blind ruler, which is the thing under test.
#
# Usage:  bash research/tools/run-s39-cert10-ab.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

export PF_STRATA_CB=1
export PF_CB_STYLE=GothicArches
export PF_CB_STAGE=ring
export PF_CB_DIRECTED=1
export PF_CB_SNAP=1
export PF_CB_TOL=0.01
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
export NODE_OPTIONS=--max-old-space-size=6144

run_arm() {
  local suffix="$1" accept="$2" ca="$3"
  echo "=============================================================="
  echo "ARM ${suffix}   PF_CB_ACCEPT=${accept}   PF_CB_CERTACCEPT=${ca}"
  echo "=============================================================="
  PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_ACCEPT="${accept}" PF_CB_CERTACCEPT="${ca}" \
    npx vitest run --config vitest.s34resolve.config.ts \
    || echo "*** ARM ${suffix} FAILED (continuing) ***"
}

run_arm S39CTL  0.0035 0     # status quo — the reproduction check
run_arm S39B10  0.010  0     # tolerance change alone
run_arm S39CA10 0.010  1     # + sound ruler
