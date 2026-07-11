# Arm C1 Verdict — Gothic K2/R-REFINE reproduction + a major truth-bridge finding

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm C1. **Reproduction: PASS. Two first-class
findings.** Raw data (gitignored): `research/exchange/tierc/armC1_diag_verdict.json`, `armC1_*_crumbs.ndjson`.
Probes: `_tierc_armC1.test.ts`, `_tierc_armC1_rulerdiag.test.ts`.

## Reproduction: PASS (region-layer R-REFINE dispatch validated)

`buildRegionOuterWall(getManifest('GothicArches'), dims)` ran `buildSingleRRefineRegion` native
(no fallback, no dispatch bug), hashed **bit-identical** (`d95542bd-d0e9a6c8`) to a K2-direct
`styleSampler→buildProtectedComplex→refineToZeroOutliers` build, and reproduced the live CI gate
exactly: residualCrossings 0 / recovery 100%; 7 refine passes 944→9917; ci-guard 0 outliers / max
0.009996 / 9917 facets = pinned 9917 tris / 7 passes / 0 outliers / max ≤0.0101. The region layer's
R-REFINE path (un-build-tested before this arm) is now validated.

## Finding 1 — the seam/boundary defect is GYROID-BAND-EDGE-SPECIFIC (cross-style question answered)

`topologyMetric` on the Gothic patch: **orientationMismatches 0, nonManifold 0** (raw-index,
non-vacuous), boundaryEdges 239 but **all 239 on the patch's own (u,t) rectangle rim — ZERO
strictly-interior holes** (by-index domain classifier). This is the OPPOSITE of Gyroid's band-edge
CDT (A1/A4: 360 interior holes + 652 orientation mismatches). **The seam/boundary defect class is
specific to the doubled band-edge general-curve CDT, NOT broader kernel behavior** — Gothic's
no-bridge protected-refine emits a clean, consistently-oriented patch. Consequence: the pending
Gyroid A4 kernel seam-fix (Addendum 5) is narrow (band-edge only), not a shared-machinery overhaul.

## Finding 2 — Gothic's "literal-0" is faithful-to-the-512²-SAMPLER, not to analytic (CAUSE B)

The ruler disagreement (K2 says 0 outliers / 0.0099; harness says ~0.17mm) is **neither a grid-trap
nor a mesh/kernel bug**. Root cause: the K2 kernel meshes AND scores against
`radialSurfaceFromSampler` — a **512×512 bilinear styleSampler grid** (0.59mm per u-column at
Gothic's ~301mm circumference) that **chords across the sub-mm knife-edge crests**. The mesh is
faithful to that grid (0.0099 = CI gate) but genuinely off the exact analytic `rA` (`buildRadiusFn`)
by ~0.17mm at the crests. Three independent confirmations:

1. **Pure surface-vs-surface (no mesh, no ruler):** sampler-vs-analytic 3D diff max **1.353 / 0.938
   / 0.548 mm** and p99 **0.539 / 0.251 / 0.070 mm** at grid **512² / 1024² / 2048²** (p50≈0 —
   matches everywhere except crests); monotonic shrink with resolution. The 512² grid itself is up
   to 1.35mm off analytic at crests.
2. **Arbiter table** (6 flagged facets): `newtonNearest` grid-free == ultraBrute(nθ=16384) to 6
   digits (**0.168–0.202mm**) → the ~0.17mm is the TRUE nearest to analytic, not a fabrication.
   radialDiff→sampler ≈ 0.000002–0.00008mm (on grid) vs radialDiff→analytic ≈ 0.73–0.97mm — the
   definitive CAUSE B signature. K2@sampler on the same facets = 0.0025–0.0057mm (≤tol).
3. Mesh vertices sit **0.167–0.234mm** off analytic (grid-free Newton).

**The live `wholeMesh0Outlier.test.ts` gate asserts faithful-to-the-512²-grid, not
faithful-to-analytic.** Against the project's true-analytic 0.01mm standard, the shipped Gothic
patch is ~0.17mm off at the knife-edge crests — invisible to every prior Gothic verdict (all used
the sampler basis). The harness earned its keep exposing this, same pattern as the Gyroid G3/G7
exposure in A1.

## Proposed remedies (design only — nothing patched)

1. **Harness basis (measurement):** for R-REFINE/tierC regions (`dispatch:'single-R-REFINE'`, the
   manifest already exposes it), score G1 against `radialSurfaceFromSampler` (the surface the kernel
   targets and the CI gate uses) OR carry BOTH numbers labeled — never conflate "mesh quality" with
   "sampler resolution."
2. **Close the gap at the source (kernel — the real fix for the 0.01-analytic standard):** either
   raise `styleSampler` gridResU/gridResT for knife-edge styles until sampler≈analytic (STAGE A
   shows the diff shrinks with resolution), OR — more elegant — **lift refine-inserted vertices via
   the analytic `rA` instead of `sampler.position`**, making the tierC mesh faithful-to-analytic by
   construction, at which point the harness analytic ruler is the correct gate. This is the new
   named C-arm sub-target for shippable Gothic (see prereg Addendum 6).

## Gates row (measured; formal scoreAllGates ndjson intentionally NOT appended)

The coordinator killed the 7006-facet analytic scan as ~1hr-wasteful; and an un-caveated analytic-basis
G1 row would mislead (it measures sampler RESOLUTION, not mesh quality). Measured: G1 @sampler 0/0.0099
(=CI); G1 @analytic ~0.17mm floor (resolution reading); G3 orient 0 / nonMan 0; G7 boundary 239 all-rim
/ 0 interior. G2 reverse, G4 zeroArea, quality(%<20° vs banked 19.0%) de-scoped under the redirect
(each a ~1-min follow-up), honestly not fabricated.
