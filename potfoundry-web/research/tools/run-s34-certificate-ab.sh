#!/usr/bin/env bash
# S34 CERTIFICATE — the HONEST fidelity verdict on the two mesher-arm STLs from 0ac73efc.
#
# WHY. The mesher arm reported HEADLINE MAX 47.297 -> 47.282 um and I said that is not a fidelity
# verdict, because it is the driver's OWN blind plane ruler (median 21.9x optimistic, max 541x —
# measured 2026-08-02) and the driver's audit ruler and its refinement ruler are the SAME sampler.
# `_strataFacetTruth.test.ts` shares no machinery with the mesher: it reads a finished binary STL
# from disk. This is the instrument that can actually say whether the re-solve moved fidelity.
#
# BOTH DIRECTIONS, ALWAYS. H1 (mesh->surface) is BLIND to this exact defect: a facet chording across
# a ridge lies near the ridge BASE, so every point of it has surface a few microns away and H1 reads
# ~0, while the crest is the full relief height from the nearest triangle. An unrepresented feature
# is an H2 defect. The harness now REFUSES to emit a verdict from one direction (it emitted a night
# of PASS-shaped H2-only reports on 2026-07-29 over a mesh 7.58% over tolerance). Do not pass
# PF_FT_H1=0 or PF_FT_H2=0 here.
#
# ⚠ MATCHED, REDUCED BUDGETS — STATED, NOT HIDDEN. H1SECS/H2SECS are cut from the 1500/900 defaults
# to 600/600 so the pair fits in ~40 min instead of ~80. H2 is a sound LOWER bound on the true
# surface->mesh error, so a smaller budget can only UNDER-report. Both arms get byte-identical
# budgets, so a DIFFERENCE between them is real; an ABSENCE of difference is weaker evidence than a
# full-budget run would give. If the arms come out equal, re-run at defaults before concluding.
#
# Usage:  bash research/tools/run-s34-certificate-ab.sh          (from potfoundry-web/)
set -euo pipefail

cd "$(dirname "$0")/../.."

export PF_STRATA_FT=1
export PF_FT_STYLE=GothicArches
export PF_FT_TOL_UM=10
export PF_FT_H1SECS=600
export PF_FT_H2SECS=600
export PF_FT_BOUNDARY=          # ring: top+bottom loops expected; leave unset to skip the assertion
unset PF_FT_BOUNDARY
export NODE_OPTIONS=--max-old-space-size=8192

STLDIR=research/exchange/_strataConformBisect

run_arm() {
  local tag="$1" stl="$2"
  echo "=============================================================="
  echo "CERTIFICATE  ${tag}   ${stl}"
  echo "=============================================================="
  PF_FT_TAG="${tag}" PF_FT_STL="${stl}" \
    npx vitest run --config vitest.stratafacettruth.config.ts
}

run_arm S34CTL "${STLDIR}/gothicarches_ring_DS-HT_S34CTL.stl"
run_arm S34RES "${STLDIR}/gothicarches_ring_DS-HT_S34RES.stl"
