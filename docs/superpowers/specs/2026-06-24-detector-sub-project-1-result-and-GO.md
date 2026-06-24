# Sub-Project 1 (Style-Agnostic Feature Detector) — Result Record & GO/NO-GO

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Status:** COMPLETE — GO to sub-project 2 (the mesher)
**Module:** `potfoundry-web/src/renderers/webgpu/parametric/conforming/featureGraph/` (17 files, ~5.6k lines)

## 1. What was built

A **style-agnostic** feature detector that reads a surface's features off the exact evaluator alone — with **zero per-style code** — and emits a topology-rich `FeatureGraph` for the (later) general mesher. Three generic detectors (curvature-ridge, normal-discontinuity, component-boundary) → a deterministic unifier (saliency-normalized, junctions/loops) → a two-scale orchestrator (`detectFeatures`). Validated by a **dense-truth gate**: a brute-force, uniform high-resolution ground truth using the *same* signal thresholds as the detector but *none* of its machinery, so the gate measures whether the efficient pipeline reproduces the brute-force ideal.

## 2. The headline result (controller-verified, deterministic, reproduced exactly)

**14 / 20 styles PASS recall ≥ 0.9 AND precision ≥ 0.9** against the COMPLETE dense truth at the calibrated tolerance **CAL_TOL = 1.83 mm** (one detector fine cell — tightened from the old loose 2.5 mm). **FLAT cone → 0 spurious edges** (no hallucination).

This replaces the old partial-reference gate's **0/8**, which was a measurement ARTIFACT: the old per-style extractors emitted deliberately-partial loci, so a correct generic detector that found *more* real features scored as "imprecise." Against the complete truth those flip — e.g. **DragonScales precision 0.37 → 1.000**, **CelticTriquetra 0.055 → 0.999**. The precision "failures" were the yardstick, not the detector.

The **style-agnostic claim is verified module-wide** (exhaustive grep, final review): the 7 detector-path files contain zero styleId references; per-style code exists only in the validation scaffolding (`styleSampler.ts`) and tests.

## 3. The 6 misses — honest, measured classification

**Class A — lattice precision (recall PERFECT, precision ~0.62):** GyroidManifold 0.999/0.619, CelticKnot 1.000/0.631. Probed: the uncovered ~38% of detected arclength is **100% sub-threshold** (κ≈0.03 < floor 0.056), placed **~3–6 mm into the low-κ relief-band flank**, off the true ridge/crease (precision recovers only at tol≈6 mm). This is REAL detector mis-placement on dense lattices, NOT a truth artifact — the detector covers every true feature (recall≈1) but *also* smears edges off-feature into the flank.

**Class B — two-scale coverage/placement:** GothicArches recall 0.852 (shallow 1.5 mm mullions near the κ floor; coarse fired-cell mask intermittently misses the shallowest rows), SuperellipseMorph recall 0.885 (broad low-κ ridge band thinned to a centerline, band flanks uncovered), BambooSegments 0.826/0.842 (dense crossing ridge/striation grid, edges shifted ~1 fine cell both ways), GeometricStar precision 0.892 (marginal sub-fine-cell scatter on steep strapwork; recovers to 0.96 at 2.5 mm).

## 4. GO decision

**GO to sub-project 2 (the general feature-graph mesher).** Rationale: the detector finds the features — including the priority tangled lattices (Voronoi 0.986/0.922, CelticKnot recall 1.000, HexagonalHive 0.933/1.000, Gyroid recall 0.999) — with no hallucination, validated against a complete, machinery-independent truth on a tight one-fine-cell tolerance. The 6 misses are understood and localized (two-scale placement/coverage + lattice off-feature smearing), not blind spots. The detector is the right foundation for the mesher; the residuals inform the mesher's design rather than block it.

## 5. Mesher handoff — what sub-project 2 MUST know

1. **Lattice off-feature edge smearing (Class A):** on Gyroid/CelticKnot ~38% of edge arclength sits up to 3–6 mm off the true ridge/crease, in the low-κ band flank. Edges are present (recall≈1) but **misplaced** — the mesher must not assume an edge vertex sits exactly on the sharpest locus on dense lattices.
2. **Placement granularity = ±1 fine cell** (≈1.83 mm in u, ≈0.83 mm in t at the gate config). Vertices are quantized to the fine grid; treat this as the intrinsic snapping tolerance.
3. **Recall gaps (Class B):** Gothic/Superellipse/Bamboo (~0.83–0.89) — the graph is not a guaranteed-complete feature set on shallow/dense-crossing relief; some real rows are not emitted.
4. **Topology contract:** `FeatureEdge` carries `kind:'open'|'loop'`, `endpoints:[nodeId,nodeId]` (equal for loops), `types:FeatureType[]` (post-merge union), `strength` = dimensionless saliency (multiple-of-threshold, comparable across detectors, NOT raw κ/deg). Output is **deterministic / byte-stable** (Approach-C vertex sharing depends on it). Junctions = nodes of degree ≥ 3.
5. **component-boundary needs a `reliefIndicator`** supplied (the generic sampler-derived `|r−meanU(r)|−floor` field); omit it and no wall edges are emitted. The integration layer must pass it to get cellular networks.

## 6. Known limitations (scoped, accepted)

- The gate is **detector-matched-threshold**: it validates the pipeline MACHINERY's fidelity to the brute-force ideal, NOT the feature *definition* (curvature/normal/relief on a height field). A definition blind spot would not be caught — this is an explicit, accepted design caveat.
- Dense-truth machinery is end-to-end cross-validated against an exact analytic locus only on thin-wall Voronoi (1.00/0.805); thick-wall styles differ from analytic centerlines by the wall half-width (a field-choice property, not a bug).
- Two Minor maintenance notes carried forward: a deliberate (un-asserted) constant duplication between `detectFeatures.ts` and `groundTruth.ts` (RIDGE_KAPPA_FACTOR/MEASURE_N/minAngleDeg) — add a drift-guard when the detector is wired into production (sub-project 3); the dense-truth `denseCreaseTruth` degenerate-normal guard was added in the final cleanup.

## 7. Out of scope (next)

- **Sub-project 2:** the general feature-graph mesher (Approach-C feature-aligned paving, watertight) — its own brainstorm → spec → plan.
- **Sub-project 3:** production integration (wiring the detector into the export path, the relief-indicator, GPU verification, re-baseline) + the constant drift-guard.
