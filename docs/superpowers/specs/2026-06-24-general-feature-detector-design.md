# General (Style-Agnostic) Feature Detector — Design

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Status:** Design — approved verbally, pending written review → writing-plans
**Position:** Sub-project 1 of 3 in the **general feature-aware export engine**. (2) general feature-graph mesher and (3) production integration are separate specs, written after this one validates.

## 1. Context & motivation

The export pipeline must faithfully represent **all complex models with all kinds of features** — not a finite, hand-coded set. Today feature handling is per-style (`extractVoronoi`, `extractGyroidManifold`, `extractCelticKnot`, … in `FeatureLineGraph.ts`): each new or exotic style needs bespoke extraction code. That does not scale to a style-agnostic goal.

Two things are already proven and **general** (Phase 0 + the Phase-1 seam de-risk, commits `1585de5..2a753e5`): (a) feature-aligned paving (triangles along a feature → no sawtooth/slivers), and (b) the **Approach-C watertight seam** (the production grid computes the feature's cell-edge crossings; the band mesher consumes them in place — measured 0 T-junctions on the real triangulator). The per-style part is *only the detection*. Every style is a **single-valued analytic radial height field** `r(u,t)`, exactly evaluable on the GPU (the WGSL `surf`/`surface_point`), so its features are just its own high-curvature loci — detectable generically from the surface itself.

**This sub-project replaces per-style extraction with one general detector** that reads features off the surface's differential geometry, producing a topology-rich feature graph the (later) general mesher consumes. The from-scratch anisotropic-remesher alternative was rejected: the in-repo spike `ceb5d08` measured it stalling on tangled lattices, and it discards the proven watertight engine.

## 2. Goal & success criteria (the gate)

A style-agnostic detector that, given the exact surface evaluator for ANY style, emits a feature graph capturing the sharp/high-curvature features a human wants represented, with **zero per-style code**.

- **Style-agnostic:** the detector's only style-specific input is the exact evaluator (the GPU surface). No per-style branches, loci formulas, or tuned constants keyed on style id.
- **Coverage gate (precision/recall against per-style references, the deliverable's gate):** for **all 20 current styles**, detected features match a reference:
  - styles with a per-style extractor today (Voronoi web, Gyroid TPMS, HexHive, CelticKnot, SuperformulaBlossom crests, Gothic, etc.) → compare the general graph to that extractor's loci (recall ≥ ~0.9 of reference arclength within tolerance; precision ≥ ~0.9, i.e. few spurious lines);
  - smooth-but-curved styles → finds the crests; flat/no-feature configs → emits ≈ nothing (precision protects against firing on flat).
  - Report a **per-style coverage table**. This proves the style-agnostic claim — one ensemble reproducing 20 hand-coded extractors — and **must pass before sub-project 2 (the mesher) is built**.
- **Topology-rich output:** the graph carries junctions (degree ≥ 3), closed loops, and open lines with per-edge strength + type — exactly what the general mesher needs (it must handle the closed-loop/network topology the Phase-0 open-ribbon spike did not).
- **Bounded cost:** runs once per export, two-scale, output cached.

## 3. Architecture & data flow

All in (u,t) parameter space; the only style input is the exact evaluator.

```
exact evaluator (GPU surf; CPU mirror in tests)
  → sampled fields over (u,t): position, surface normal, max principal curvature  (two-scale)
  → 3 generic detectors (parallel), each emitting raw segments tagged {strength, type}
       1. curvature-ridge          2. normal-discontinuity      3. component-boundary
  → UNIFIER: spatial dedup + endpoint weld → nodes/edges + junctions/loops + strength threshold
  → FeatureGraph
```

## 4. The three generic detectors (style-agnostic)

Each reads the surface, never the style.

1. **Curvature-ridge** — computes max principal-curvature magnitude `|κ_max|(u,t)` (via `principalCurvatureMax`-style finite differences on the exact evaluator) and traces its **ridge lines** (loci where `|κ_max|` is locally maximal across the ridge direction). Catches **smooth crests/valleys** (superformula, fourier, harmonic, spiral). Strength = `|κ_max|` at the ridge.
2. **Normal-discontinuity** — computes the surface normal per sample and flags edges where the **normal angle-jump** between adjacent samples exceeds a threshold, traced into lines. Catches **sharp C0/C1 creases** (Gothic, Crystalline, LowPoly, GeometricStar, ArtDeco t-steps) that a curvature sample under-resolves. Strength = normal angle-jump.
3. **Component-boundary** — segments (u,t) into regions (sign of a relief indicator, or a nearest-region label field) and traces the boundaries via the existing `marchingSquaresZero` / `marchingSquaresLabels` (`SampledFeatureExtractor.ts`). Catches **cellular networks** (Voronoi walls, Gyroid TPMS, HexHive honeycomb) and braided edges. Strength = relief contrast across the boundary.

## 5. The unifier (the ensemble's hard part)

Merges the three signals into one graph:
- **Spatial dedup:** detections within a tolerance band of each other are the same feature; collapse to one edge keeping `max(strength)` and a merged `type` set (e.g. a curvature-ridge coincident with a component-boundary → one edge tagged both).
- **Endpoint weld → topology:** weld nearby endpoints into nodes; degree ≥ 3 nodes are **junctions**, closed walks are **loops**, dangling ends are open lines.
- **Strength threshold:** drop edges below a global strength floor so flat regions emit nothing (precision).
- **Determinism:** the unifier is deterministic (stable ordering) so reruns are byte-stable (the mesher's Approach-C sharing later depends on stability).

## 6. Curvature/normal source

High-resolution finite differences on the **exact evaluator** (the production `GpuSurfaceSampler` at elevated resolution; an analytic/CPU mirror in unit tests). **Two-scale:** a coarse scan localizes feature regions; a fine scan traces them sub-cell-accurately and refines near detections — controlling the band-limit the original review flagged (finite-difference κ under-reads sharp creases at coarse resolution) without full-resolution cost everywhere. No per-style derivatives.

## 7. Feature graph data structure (interface to sub-project 2)

```ts
interface FeatureGraphNode { u: number; t: number; }            // junctions + endpoints
type FeatureEdgeKind = 'open' | 'loop';
type FeatureType = 'curvature-ridge' | 'normal-discontinuity' | 'component-boundary'; // set per edge
interface FeatureEdge {
  polyline: { u: number; t: number }[];   // ordered, dense
  strength: number;                       // max signal strength along the edge
  types: FeatureType[];                   // which detectors produced it (post-merge)
  kind: FeatureEdgeKind;
  endpoints: [number, number];            // node ids (equal for a loop with one node, or loop has none)
}
interface FeatureGraph { nodes: FeatureGraphNode[]; edges: FeatureEdge[]; }
```

This generalizes today's `FeatureLine` / `FeatureLineGraph` (which carry no junctions/strength); the per-style extractors become validation references (Section 8), not production inputs.

## 8. Validation harness (the gate — built as part of this sub-project)

A Vitest harness that, for each of the 20 styles, runs the detector and measures **precision/recall vs a reference**:
- Reference = the per-style `extractAnalyticFeatures` loci where they exist (Voronoi/Gyroid/HexHive/CelticKnot/SuperformulaBlossom/Gothic/Bamboo/DragonScales/ArtDeco/Spiral/Crystalline), plus analytic crest loci for the smooth families.
- Metrics: recall = fraction of reference-locus arclength within tolerance of a detected edge; precision = fraction of detected arclength within tolerance of a reference (spurious-line guard); plus a flat-config test (no-feature params → ≈ empty graph).
- Output: a per-style table (style → recall, precision, #edges, #junctions). GPU-free where a CPU mirror exists; GPU-confirmed otherwise.
- **Gate:** the ensemble must reach the recall/precision bar across the styles (or each miss is explicitly understood + accepted) before sub-project 2 begins.

## 9. Scope, perf, module location

- New module (proposed `src/renderers/webgpu/parametric/conforming/featureGraph/` or `src/fidelity/featureDetect/` — settle in the plan), with the three detectors, the unifier, the graph types, and the validation harness as separate focused files.
- Runs once pre-mesh; two-scale for cost; output cached for the mesher. Production-adjacent but NOT wired into the export path in this sub-project (sub-project 3 wires it); flag-gated when wired.
- Reuses `SampledFeatureExtractor` (marching squares), `SurfaceMetricTensor` (curvature), `SurfaceSampler`/`GpuSurfaceSampler` (the evaluator).

## 10. Risks & de-risk order

- **Unifier reconciliation (primary risk):** three signals firing on the same locus (a cellular style where curvature-ridge + normal-discontinuity + component-boundary all hit) must merge to one clean edge, not three near-duplicates or a tangled junction. De-risk FIRST on the messiest overlap case (e.g. HexagonalHive or Voronoi) before wiring all three.
- **Coverage gate is the deliverable gate:** if the ensemble can't match the per-style references across the 20 styles, iterate the detectors/threshold before declaring the style-agnostic bet won. Do not weaken the references to pass.
- **Band-limit on sharp creases:** the curvature detector under-reads C0 creases at coarse res; the normal-discontinuity detector + two-scale refinement cover this — verify on the sharpest style (LowPolyFacet/Crystalline).
- **Determinism:** non-deterministic merge ordering would break the later Approach-C vertex sharing; enforce stable ordering + test it.

## 11. Out of scope (later specs)

- Sub-project 2: the general feature-graph mesher (Approach-C insertion + topology-general feature-aligned paving + analytic-curvature density + watertight).
- Sub-project 3: production integration (wiring, flag, GPU export verification, re-baseline) + generalization of the density lever.
- Robustness to *future* styles beyond the 20-style validation (the design targets it via surface-only input, but only the 20 are gated here).
