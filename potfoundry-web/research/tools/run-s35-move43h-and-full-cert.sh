#!/usr/bin/env bash
# S35 — two jobs in one sequential run (they cannot overlap: two multi-GB heaps OOM this box).
#
#   JOB A  §4.3 IN THE HEAP PATH, properly tested this time.  ~30 min
#   JOB B  FULL-BUDGET certificate on the CONTROL, to get a trustworthy baseline.  ~3 h
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# JOB A — WHY THIS ONE IS DIFFERENT FROM THE LAST §4.3 ATTEMPT
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 1fd98bdb: the first §4.3 build went into `weldWall`, which sits below the "PHASE-1 SWEEP DRIVER ...
# INERT unless SWEEP" banner. Every production arm runs the HEAP driver, so the A/B came back
# byte-identical — born-dead. PF_CB_MOVE43H wires the same move where the heap driver reaches it:
# `splitEdge`'s IN-BAND fall-through.
#
# THE CLAIM, STATED HONESTLY. An in-band crossing is not stranded today — SNAP declines it, the nudge
# ladder splits the edge at its MIDPOINT, `t` roughly doubles, and after ~3 halvings SNAP takes it.
# So §4.3 does not rescue lost facets; it saves the DENSITY those halvings cost. Judge it on triangle
# count and time, and on whether `unresolved` and the max hold. A big MOVED with no triangle
# reduction means the premise was wrong.
#
# PRE-REGISTERED FAILURE MODE (unchanged, and it never got to fire last time): low MOVED with high
# `refused on shape` means the stars are already at the AR cap mid-refinement — the jam census
# measured them at AR p50 44.0 against a cap of 50 — and §4.3 is refuted as built. s32's 99.8%
# legality was measured on the FAT SEED and published as an optimistic upper bound for this reason.
#
# EXPECT key-inversions TO RISE. Moving a vertex leaves stale keys on heap entries containing it.
# That is priority-only (a popped triangle is re-measured through the invalidated memo), the driver
# already counts it, and it is confirmation the lever fired — not a defect.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# JOB B — WHY THE BASELINE HAS TO BE RE-EARNED
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# The first certificate ran H1SECS=600 and audited ~102k of 1,255,568 triangles — 8%. Its H1 max
# (73.708 um on the control, 350.457 um on the re-solve arm) is a witnessed lower bound over 8% of
# each mesh, so the two are NOT comparable and the campaign has no trustworthy baseline number.
# This runs the CONTROL alone at a budget sized for FULL H1 coverage (~170 tris/s measured => ~7,400 s
# needed; 9,000 s given) plus 2x the default H2 budget.
#
# H2 stays a witnessed LOWER bound by construction — that is not a budget artefact and more time
# cannot make it certified. H1 is the direction that can actually reach "CERTIFIED UPPER BOUND".
#
# ⚠ Both directions always. H1 alone is blind to the defect under investigation (a facet chording a
# ridge sits near the ridge BASE, so H1 reads ~0 while the crest goes unrepresented). The harness
# refuses to emit a verdict from one direction.
#
# Usage:  bash research/tools/run-s35-move43h-and-full-cert.sh     (from potfoundry-web/, or anywhere)
set -uo pipefail

cd "$(dirname "$0")/../.."
echo "cwd: $(pwd)"

# ══════════════════════════ JOB A — §4.3 heap-path A/B ══════════════════════════
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
export PF_CB_ALIGNED_RESOLVE_UM=50    # BOTH arms carry the re-solve; the only variable is MOVE43H

NODE_OPTIONS=--max-old-space-size=6144

run_cb_arm() {
  local suffix="$1" m43h="$2"
  echo "=============================================================="
  echo "JOB A / ARM ${suffix}   PF_CB_MOVE43H=${m43h}   (re-solve ON in both)"
  echo "=============================================================="
  NODE_OPTIONS="${NODE_OPTIONS}" PF_CB_TAG_SUFFIX="_${suffix}" PF_CB_MOVE43H="${m43h}" \
    npx vitest run --config vitest.s34resolve.config.ts || echo "*** ARM ${suffix} FAILED (continuing) ***"
}

# ══════════════════════ JOB B — full-budget certificate, CONTROL only ══════════════════════
# *** ORDER REVERSED 2026-08-04. *** The first attempt ran Job A first; its treatment arm SPUN
# (4.4 CPU-hours vs the control's 839 s) on a missing termination guard, and Job B never got to
# start. Job B audits an STL that already exists on disk, depends on nothing else here, and is the
# higher-value deliverable — so it goes FIRST and can no longer be starved by a Job A defect.
echo
echo "=============================================================="
echo "JOB B  FULL-BUDGET CERTIFICATE — control S34CTL"
echo "=============================================================="
env -u PF_CB_TAG_SUFFIX \
  PF_STRATA_FT=1 \
  PF_FT_STYLE=GothicArches \
  PF_FT_TOL_UM=10 \
  PF_FT_H1SECS=9000 \
  PF_FT_H2SECS=1800 \
  PF_FT_TAG=S34CTL_FULL \
  PF_FT_STL=research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S34CTL.stl \
  NODE_OPTIONS=--max-old-space-size=8192 \
  npx vitest run --config vitest.stratafacettruth.config.ts \
  || echo "*** JOB B FAILED ***"

# ══════════════════════════ JOB A — §4.3 heap-path A/B (now second) ══════════════════════════
# PF_CB_MAXSECS caps each arm's refinement loop. The spin is fixed (disp must exceed confMm, plus a
# per-vertex move cap), but a wall-clock ceiling is cheap insurance: the control drains in ~840 s, so
# 2400 s is ample for an honest arm and bounds any surprise at 3x rather than unbounded.
export PF_CB_MAXSECS=2400

run_cb_arm S35CTL 0
run_cb_arm S35M43H 1
