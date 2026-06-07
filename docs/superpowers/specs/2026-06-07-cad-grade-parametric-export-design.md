# CAD-Grade Parametric Mesh Export — Architecture Redesign

**Date:** 2026-06-07
**Status:** Design — pending user approval
**Scope:** Replace the parametric outer-wall tessellation + tail repair battery with a watertight-by-construction, feature-conforming, metric-correct mesher. Behind the existing `byConstructionAssembly` flag, validated style-by-style against the e2e fidelity harness.

## Goal (acceptance vector, per generated mesh, all 20 registered styles)

```
sliverCount         = 0      (3D aspect>100, incl. zero-area degenerate)
boundaryEdges       = 0      (welded mesh, tol 1e-4 mm)
nonManifoldEdges    = 0
orientationMismatches = 0
featuresDropped     = 0      (measured against REAL per-style ground truth — see §7)
no per-style timeouts (< 300 s; target < a few seconds/style)
```

Quality targets (CAD-grade, hard, independent of the UI quality slider): **max sag ≤ 0.1 mm**, **max 3D aspect < 100**.

---

## 1. Proven root causes (all measured/verified this session — not assumed)

Three coupled defects, each confirmed by code + e2e measurement.

### R1 — Feature detection is structurally blind to creases and horizontal lines
The detector recognizes only per-row radial extrema (`dr/du` sign change) and **actively rejects** anything else. Verified verbatim at [`FeatureDetection.ts:268-273`](../../potfoundry-web/src/renderers/webgpu/parametric/FeatureDetection.ts): a peak requires `denom<0`, valley `denom>0`, else `rejected++; continue`. The data model confirms the limit: `FeatureKind = 'peak'|'valley'`, `ChainPoint = {u, row}` (one u per row) — [`types.ts:270,305`](../../potfoundry-web/src/renderers/webgpu/parametric/types.ts). This cannot represent: sharp **creases** without a radius extremum (Gothic inter-arch columns, DragonScales trough floors, facet edges), **horizontal constant-t rim lines** (zero θ-gradient → invisible to a `dr/du` scan), closed-loop cell boundaries (Voronoi/Hex), or junctions (Celtic). The Hessian crease classifier that *exists* (`feature_extract.wgsl` type 3=Crease) is wired only to the unused Adaptive path.

**Measurement is also blind:** `featuresExpected/present` come from `chain.chainCount/lineCount` measured AFTER the detector ([`windowHook.ts:160`](../../potfoundry-web/src/fidelity/windowHook.ts)), so a style whose features are all rejected reports `dropped=0`. Today's green `featuresDropped` is partly an artifact.

### R2 — Base tessellation is non-conforming by construction (cannot allocate intersection vertices)
`buildCDTOuterWall` → `constrainedSweepCell` is a per-cell monotone column-sweep, **not** a CDT (no `cdt2d` call). Its own comment, verified at [`OuterWallTessellator.ts:602-615`](../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts), admits it "cannot enforce crossing constraints without intersection vertices (which this function cannot allocate)" → it **drops** crossing constraints (~42K holes, "audit F14"), leaves chain vertices on cell edges as **T-junctions** (patched by accreted rules R52/R53/R55), and emits chain→grid **fan-diagonal needles** via a local cosine heuristic with no global angle bound. Everything downstream is the ~1,100-line tail repair battery ([`ParametricExportComputer.ts:4378-5560`](../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts)).

Measured consequences (this session, `window.__pfEnableWindingStageDiagnostics`):
- HarmonicRipple: `collinear` flat at 4 through the whole battery yet final sliver=4265 → dominant sliver class is **fan-diagonal needles**, not collinear.
- WaveInterference: base collinear 36 → 111 via the center-fan fills; 1085 boundary loops attempted, 1021 "unsafe".
- Performance: `repairOuterWallTJunctions#1` = 67–79 s, `#postLoop` = 34–41 s doing nothing. ~100 s of ~240 s/style — the real heavy-style timeout cause.

### R3 — UV→3D metric stretch (anisotropy) makes "good in UV" ≠ "good in 3D"
The map `(u,t) → (R cosθ, R sinθ, z)` has a Jacobian dominated by `∂R/∂u, ∂R/∂t`. A triangle uniform in flat UV becomes high-aspect in 3D where the radial slope is steep — worst on **steep peak flanks**, exactly as reported. Corroborated by baseline `maxAspect3D`: LowPolyFacet 5.8M (minAngle 8.8e-6), BambooSegments 12k, HarmonicRipple 1217 — on otherwise topology-clean styles. The tessellator has only a **scalar** `metricAspect`/`estimateCircumferentialStretch` ([`OuterWallTessellator.ts:202,250-253`](../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts)) — its own comment defers "replace with per-row E,F,G metric tensor." A scalar cannot correct position-varying anisotropy.

### Prior-attempt lessons (so we don't repeat them)
A previous real-CDT attempt (`cdt2d` in the Adaptive path) was slow + imperfect for **integration** reasons, not because constrained Delaunay is inherently slow: a CPU pre-planarizer bolted on because `cdt2d` can't insert intersection vertices, a dense seam point cloud driving the sweepline toward O(N²), and post-hoc flat-rectangle→weld seam stitching. Measured: `cdt2d` ~76 s @100k, ~178 s @250k (the timeout source); `delaunator` ~370 ms @250k, ~1.07 s @1M (fast, usable as an inner kernel). **Retire `cdt2d`; never run a global CDT.**

---

## 2. Architecture — Rhino's two-phase pipeline, done correctly

Replace the outer-wall tessellation (stage 4) and delete the tail repair battery (stage 9) for the by-construction path. Keep GPU curvature sampling, GPU re-snap, and GPU 3D evaluation. Five pillars:

### P1 — Metric-warped structured base grid (fixes R3)
Build the grid in a domain warped by the surface **first fundamental form** `M(u,t)=[[E,F],[F,G]]`, `E=|∂P/∂u|²`, `F=∂P/∂u·∂P/∂t`, `G=|∂P/∂t|²`, computed from `R(u,t)` and its derivatives (GPU already samples these; finite-difference where needed). Equal steps in warped space = equal 3D arc length → triangles 3D-isotropic, **aspect<100 emerges** once sag is bounded. Replaces scalar `metricAspect`.

### P2 — Balanced-quadtree curvature refinement = T-junction-free by construction (fixes R2's T-junctions + needles)
Refine cells (1→4) where the **sagitta** estimate `sag ≈ κ·L²/8` exceeds 0.1 mm or 3D aspect would exceed 100, under the **2:1 balance invariant** (Bern–Eppstein–Gilbert: no neighbor more than one refinement level apart). Triangulate cells with **transition templates** keyed to neighbor levels; shared cell-boundary vertices are the *same index* on both sides → no T-junctions, watertight without repair. Sizing driven by a **smooth, Lipschitz-graded** arc-length field `h_iso(u,t)` (adjacent spacing ratio ≤ 3×) — NOT κ² weighting (that caused the v16.10 "density-band" regression that got CDF-spacing removed; [`ParametricExportComputer.ts:1966`](../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts)).

### P3 — Intrinsic periodic seam (fixes seam orientation/boundary)
Triangulate the **cylinder** directly: the θ=0 and θ=2π columns are the **same vertex ring** (shared indices); quadtree balance near the seam uses wrapped/ghost neighbors. Seam `boundary=0`, `nonManifold=0`, `orientation=0` become structural, not float-tolerance-dependent. No stitch-zipper (the prior failure's #1 lesson; also the project's proven orientation root cause).

### P4 — Local exact-predicate CDT only in feature cells (fixes R2's dropped constraints + slivers; avoids prior CDT cost)
The structured interior never touches a global CDT (near-linear, allocation-free). Constrained Delaunay runs **only in the O(feature-length) cells a feature line enters**: insert feature segments as constraints, **allocate Steiner vertices at every crossing** (the missing capability), and run **Chew's 2nd Delaunay refinement** locally for a provable min-angle → slivers killed at the source. Inner kernel: `delaunator` (fast, robust predicates) + a thin constrained-edge/refinement layer. For Tier-2 styles whose constraints can mutually cross, a Bentley–Ottmann arrangement + **snap-rounding to the grid** produces a clean PSLG first.

### P5 — Analytic-first feature extraction (fixes R1)
A two-tier extractor keyed off the style registry, emitting a **general 2-D feature-line graph** (polylines, loops, junctions in (u,t)) — replacing the per-row `{u,row}` chain model:
- **Tier 1 (analytic)** for the ~7 closed-form styles (Gothic arch crowns + band lines + lattice zero-crossings; BasketWeave/GeometricStar/DragonScales/CelticKnot/CelticTriquetra/HexagonalHive helical & diagonal & exact-t rim lines): emit feature polylines **directly from the style math**. This (a) captures the crease + horizontal classes the radial detector rejects, and (b) gives a clean PSLG with closed-form crossings — **no planarizer** (the prior CDT's main slowdown), and a real ground-truth feature count for free.
- **Tier 2 (sampled)** for the only two non-analytic styles, Voronoi(jitter>0) and Gyroid: dense (θ,t) Hessian/eigenvector classifier with **gradient-magnitude gating** (|∇R| locally maximal & large) so creases survive; Gyroid's level-set gradient is analytic (Newton root-finding → near-exact).

### Watertight assembly
The outer wall's top/bottom/seam boundary rings are **index-identical vertex loops** shared with rim / base / drain / inner wall → joins are "same indices on both sides," no weld, no tolerance. Inner wall, rim, base reuse the same structured-grid + metric machinery (no features on inner wall typically → trivial).

---

## 3. Module structure (isolation & clarity)

New modules under `src/renderers/webgpu/parametric/conforming/` (each one purpose, testable in isolation):

| Module | Purpose | Depends on |
|---|---|---|
| `SurfaceMetricTensor.ts` | E,F,G first fundamental form + principal curvature at (u,t) from R and derivatives | surface eval |
| `MetricSizingField.ts` | Lipschitz-graded `h_iso(u,t)` arc-length sizing from curvature (sag≤0.1) | SurfaceMetricTensor |
| `FeatureLineGraph.ts` | General 2-D constraint graph: polylines/loops/junctions in (u,t); ground-truth count | types |
| `AnalyticFeatureExtractor.ts` | Tier-1 per-style closed-form feature emission | FeatureLineGraph, styles |
| `SampledFeatureExtractor.ts` | Tier-2 Hessian/eigenvector crease lines (Voronoi/Gyroid) | FeatureLineGraph |
| `PeriodicBalancedQuadtree.ts` | 2:1-balanced periodic quadtree + curvature refinement + transition-template triangulation | MetricSizingField |
| `FeatureCellCDT.ts` | Local constrained Delaunay + Steiner + Chew refinement (delaunator kernel); arrangement/snap-round for Tier-2 | delaunator, robust-predicates |
| `ConformingOuterWall.ts` | Orchestrates P1–P5 → outer-wall (u,t,surfaceId) mesh + boundary rings | all above |
| `WatertightAssembly.ts` | Shared-ring join of outer/inner/rim/base/drain | ConformingOuterWall |

Wire into `ParametricExportComputer` under `byConstructionAssembly`: when set, use `ConformingOuterWall` + `WatertightAssembly` and **skip the entire tail repair battery**. Legacy path unchanged when flag off.

Robust geometric predicates (orient2d/incircle): use `robust-predicates` (delaunator's own dep) — confirm availability, else add.

---

## 4. Why this avoids the prior CDT failure (perf + perfection)

- **Perf:** structured interior is near-linear; the slow exact-predicate constrained work is confined to O(feature-length) cells, not O(area); for the 7 analytic styles the PSLG is clean by construction so the planarizer is *deleted*, not sped up; `cdt2d` retired, `delaunator` (370 ms/250k) is the kernel. Estimate: well under a few seconds/style — orders of magnitude inside 300 s. Deletes the 100 s repair battery.
- **Perfection by construction:** holes ← Steiner at every crossing; slivers ← local Chew min-angle; T-junctions ← 2:1 balance templates; seam/orientation ← intrinsic shared-index cylinder; featuresDropped ← analytic emission of crease/horizontal classes + real ground-truth count.

---

## 5. Risks & de-risking (each probed early on the e2e harness)

1. **(High) Tier-2 snap-rounding cascade** (Voronoi/Gyroid): snap-rounded intersections can create new crossings. *Probe:* build FeatureCellCDT + snap-round first on Voronoi only; assert `boundary=0 ∧ nonManifold=0` after ≤2 arrangement passes. Fallback: Frontal-Delaunay or relaxed bar for these 2 (decision deferred per user).
2. **(High) Periodic balanced quadtree at the seam** — no lib does θ-wrap; custom ghost-neighbor logic is where leaks historically appear. *Probe:* clean smooth canary, assert seam `boundary=0` before any feature insertion.
3. **(Med) E,F,G where radius→0** (base/rim poles): √E→0 ⇒ Δu→∞. *Probe:* degenerate profile (Rb or Rt→0), assert finite clamped step (metric-aware clamp, not scalar).
4. **(Med) Analytic feature drift vs GPU surface:** CPU style math (`styles.ts`) must match GPU `styles.wgsl` (they differ for CelticKnot). *Probe:* per style, assert |analytic point − GPU position| < epsPos at matched (θ,t) before trusting Tier-1 for that style.
5. **(Low) Tier-2 detector cost:** one 256² Hessian dispatch for 2 styles — negligible.

---

## 6. Build sequence (incremental TDD; each step red→green-gated on the e2e harness; behind `byConstructionAssembly`; clean style as canary)

1. **Seam-closed structured grid, no features, canary.** Periodic grid + intrinsic seam (shared θ=0/2π indices). *Gate:* canary `boundary=0 ∧ nonManifold=0 ∧ orientation=0`. (De-risks #2.)
2. **Metric-warped sizing + Lipschitz grading.** Wire √E,√G into base-grid spacing via `h_iso`; ≤3× grading. *Gate:* canary `sag≤0.1 ∧ aspect≤100`, no density banding. (De-risks #3, proves v16.10 avoided.)
3. **Balanced-quadtree curvature refinement (still no features).** 2:1 balance + transition templates. *Gate:* curvature-heavy feature-free profile `boundary=0 ∧ nonManifold=0`. (Watertight-by-construction proof.)
4. **Analytic feature emission, one easy style (BasketWeave).** Emit polylines from style math; assert on-surface (probe #4). *Gate:* `featuresDropped=0` vs analytic ground truth; mesh still `boundary=0`.
5. **Local CDT + Steiner in feature cells (analytic crossings).** Insert BasketWeave constraints + Chew refinement. *Gate:* BasketWeave full vector `sliver=0 ∧ boundary=0 ∧ nonManifold=0 ∧ orientation=0`, no timeout. **First full proof R2 solved.**
6. **Roll out remaining analytic styles** (Gothic, GeometricStar, DragonScales, Celtic×2, Hex, + the simple smooth styles), one per step, each with analytic ground-truth count; include crease + horizontal-rim lines (the R1 classes). *Gate per style:* full vector green.
7. **Tier-2 (Voronoi then Gyroid):** sampled Hessian + snap-rounded arrangement. *Gate:* ≥ `boundary=0 ∧ nonManifold=0`; sliver bar per deferred decision once behavior is seen.
8. **Watertight rim/base/inner via shared loops; flip `byConstructionAssembly` default once all styles pass; then retire dead `cdt2d`/Adaptive path + repair battery.** *Gate:* whole-pot vector green across the full matrix incl. previously-hanging SpiralRidges/RippleInterference (timeout class gone).

**Canary discipline:** a clean style must stay green at every step. If a structural step (1–3, 8) breaks the canary, it's a by-construction violation — fix the construction, never add a repair pass.

---

## 7. Feature-completeness measurement (real ground truth — user-approved)

Encode an **expected feature-line count/structure per style**, derivable from style params (m-fold symmetry, `scaleRows`, arch count, hex cell count, etc.), in/near `styles/registry.ts`. Upgrade the fidelity metric so `featuresExpected` = this ground truth and `featuresPresent` = feature lines actually realized as mesh edges (constraint edges present in the final mesh), making `featuresDropped` meaningful. Tier-2 styles (Voronoi/Gyroid) use a count from the sampled extractor's detected crease network (best-effort ground truth).

---

## 8. Decisions (locked)

- **Tier-2 (Voronoi/Gyroid) sliver bar:** deferred — build the 18 analytic/smooth styles to full 0/0/0/0 first, decide the Voronoi/Gyroid final bar after observing snap-rounding behavior (watertight-first milestone guaranteed).
- **Feature metric:** invest in real per-style ground-truth counts (§7).
- **Migration:** all new work behind `byConstructionAssembly` (default off) until the full matrix passes; legacy path is the fallback and is removed only in step 8.

## 9. Out of scope (YAGNI)

- Rewriting inner-wall/rim/base feature handling (they're feature-free); only their *shared-ring join* changes.
- GPU-side meshing (the conforming mesher is CPU; GPU stays for sampling/eval).
- The non-parametric export paths (legacy CPU, GPU-grid, Adaptive) — untouched except final dead-code cleanup.
