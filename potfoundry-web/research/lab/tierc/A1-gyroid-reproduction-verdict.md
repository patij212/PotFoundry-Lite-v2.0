# Arm A1 Verdict — Gyroid band-edge reproduction through the region layer

**Experiment:** E-2026-07-11-TIERC-HEADTOHEAD Arm A1. **Two results, both first-class.**
Raw data (gitignored): `research/exchange/tierc/armA1_verdict.json`, `armA1_orient_isolation.json`,
`gates.ndjson` (runId `armA1-Gyroid-1783781151076`). Probes: `_tierc_armA1.test.ts`,
`_tierc_a1_orient.test.ts`.

## Result 1 — the reproduction question: PASS, bit-for-bit

**Does the general region-layer + manifest orchestration path reproduce the bespoke band-edge
twin?** Yes, as strongly as measurement allows:

- **Construction: 3-way hash identity.** native `buildRegionOuterWall` = off-fallback =
  banked twin 'off' = `f033dbf5-b5f9fb84` (2,242,987 outer / 4,365,677 full). The general dispatch
  IS the hand-built twin, bit-for-bit.
- **Fidelity: Δ0% on every pre-registered dimension** (fanRepair build, hash `51a25eba` = banked
  exact): extraction 28,785 pts / 2,045 polylines (placement 0.000000mm); outer 2,242,984;
  stratified estOutliers **31,114** (banked exact); Newton-worst **0.02491654414922634**
  (bit-identical — same worst locus); coverage max **0.02531285773363981** (bit-identical), p99
  0.000935; knee-class **410/410 knee-adjacent, 0 off-band, 0 wall-band** (no single-midline-trap
  signature); G4 nonMan 0 non-vacuous, zeroArea 0.

Against the pre-registered A1 PASS sentence (fidelity within bands ∧ G4 clean ∧ knee 100% no
off-band): **PASS**, not merely in-band — Δ0%.

**One missing thread (small, named):** `RegionBuildOpts` does not thread `multiCurveCellPolicy`
into `buildSingleRCdtRegion`'s `AssemblyWallOptions`, so the native `buildRegionOuterWall` entry
cannot enable fanRepair (stuck at 'off', nonMan 3). The scored fanRepair row came from the region
layer's own `buildRegionWallGridCPU` + policy (twin-fallback), labeled in every artifact. Fix: add
`multiCurveCellPolicy?` to `RegionBuildOpts`, thread to `buildSingleRCdtRegion`. Coordinator item.

## Result 2 — NEW first-class finding: the band-edge mesh is not yet a watertight solid

The composite gates harness's G3 (orientation) + G7 (boundary) coverage — which the `_prod_truth`
probe and A2's acceptance NEVER measured (both check only `nonManRawBig` + `zeroArea`) — reveals a
pre-existing defect in the doubled band-edge construction:

| build | tris | boundary edges | nonManifold(idx) | orientationMismatches |
|---|---|---|---|---|
| NATIVE 'off' (= banked twin) | 4,365,677 | **360** | 3 | **652** |
| fanRepair | 4,365,674 | **360** | 0 | 651 |
| REAL production (val=0 export) | 4,014,814 | **0** | 0 | **0** |

- **PRE-EXISTING, policy-independent.** The 'off' build already carries 360 boundary + 652
  orientation. fanRepair changes only its target (nonMan 3→0), leaves boundary unchanged, improves
  orientation by 1. **A2 did NOT introduce holes; A2's PASS stands.**
- **Real (by index), not a weld artifact.** weld=0 equals weld=1e-4 exactly on every mesh — a
  genuine index-level topology signature, not a `topologyMetric` over-merge.
- **Specific to the band-edge twin construction.** Real production (val=0 centerline) is fully
  clean 0/0/0 — so this is NOT a current shipping bug; it is introduced by feeding 28,785
  doubled-curve points through the per-cell general-curve CDT.

**Interpretation.** The 2-locus non-manifold A2 fixed was the tip. The fuller picture: the
doubled band-edge CDT emits **360 open/hole edges + ~652 mis-wound facets** across the mesh. The
−67.6% fidelity win is real and bit-reproducible, but the champion mesh **cannot ship as a solid**
(360 holes) until this closes. This gate was invisible to every prior Gyroid verdict.

## Phase-1 status for Arm A

- **A1 reproduction: PASS** (bit-for-bit; missing-thread fix pending).
- **A2 non-manifold fix: PASS** (stands; does not degrade watertightness).
- **Arm A "reproduced" (A1 ∧ A2): fidelity + non-manifold DONE; SOLID-WATERTIGHTNESS OPEN** — the
  band-edge boundary/orientation defect (360/652) is the new named sub-target (see prereg Addendum
  3). Arm A is not fully closed until the champion mesh is a watertight, consistently-oriented
  solid.

## Bonus: first Gyroid quality baseline (none existed before)

p5MinAngle 5°, pctBelow20 21.5%, pctBelow10 12.9%, sliverCount/needleCount 2,773, minAngleDeg 0°
(≥1 true-zero-angle sliver, plausibly co-located with the boundary/orientation loci — unconfirmed).
