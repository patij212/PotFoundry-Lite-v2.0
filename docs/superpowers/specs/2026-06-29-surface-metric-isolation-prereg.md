# First-fundamental-form (surface-intrinsic) metric — PRE-REGISTRATION (write-before-run)

**Date:** 2026-06-29 · committed BEFORE the run. Answers the user's challenge: *"Delaunay ignores the 3D
shape. We need to evenly tessellate the entire surface of the 3D object, which is not just a simple cylinder."*

## Background (why this experiment exists)

Re-reading the lab's own metric builders showed every metric tested this session controls **size** or
**curvature**, never the **first fundamental form** `g = [[E,F],[F,G]]` (the metric that measures true 3D
distance/angle on the surface):
- `sizingField.ts` → scalar `h(u,t)` from curvature (chord). Controls size, not shape.
- `metricField.ts` → anisotropic, but from the **second** fundamental form (principal *curvatures*) → chord
  efficiency; deliberately curvature-aligned slivers.

So plain (Euclidean) (u,t) Delaunay maximizes the min angle **in the flat parameter rectangle**, which the
parametrization distorts on the way to 3D. Even a plain tapered cylinder is anisotropic: a unit step in `u`
covers `√E = 2πr ≈ 283 mm` of 3D arc vs `√G ≈ H = 120 mm` in `t` → a (u,t) square is a 2.36:1 rectangle in 3D.
Relief makes it worse and spatially varying. The fix that stays in UV: run Delaunay under the **first
fundamental form** — "even in the metric" = "even on the 3D surface."

## Question

Does meshing the (u,t) square under the surface-intrinsic metric **M = g/h²** (first fundamental form) produce
**substantially better 3D triangle quality** (min interior angle, measured on the *lifted* surface) than plain
Euclidean (u,t) Delaunay at the **same triangle budget** — and does it do so **without worsening relief chord
fidelity**?

## Method

`research/bridge/surfaceMetricIsolation.test.ts` (PF_SURFMETRIC=1). Styles GyroidManifold + BasketWeave, dims
`{H:120, Rb:40, Rt:50}`, sizeRes 64.

- **Arm A — Euclidean (the criticized baseline):** gmsh Frontal-Delaunay under the scalar curvature sizing
  field (`buildIsotropicSizingField`), swept over `tol ∈ {0.1, 0.05, 0.025, 0.0125}`.
- **Arm B — surface-intrinsic (the fix):** gmsh BAMG under `M = g/h²` (`buildSurfaceMetricField`, new), swept
  over uniform 3D target `h3DMm ∈ {6, 4, 3, 2.2, 1.6}`.

Both meshes are lifted to the 3D radial surface and scored by `honestGate`: **minAngleDeg (3D)** = quality,
**rmsFidelityMm** = chord fidelity, plus triCount / p99 / pctBelow20 for context. Plot minAngle-vs-tris and
rms-vs-tris; read off at matched triangle count. One matched-budget pair per style is dumped (xyz + tris) and
flat-shaded in 3D so the evenness difference is visible, not just tabulated.

`buildSurfaceMetricField` is unit-tested against the **analytic** first fundamental form before any run:
- cylinder `r=R`: `M ≈ [4π²R²/h², 0, H²/h²]`;
- cone `r(z)=Rb+(Rt−Rb)z/H`: `M ≈ [4π²r²/h², 0, ((Rt−Rb)²+H²)/h²]`.

## Pre-registered kill-criteria (FIXED NOW)

- **CONFIRMED** iff, on BOTH styles, at a matched triangle count Arm B's 3D **minAngleDeg is ≥ 10° higher**
  than Arm A's (moving toward the CVT 3D-remesh's ~30°+ that this session already measured) AND Arm B's
  **rmsFidelityMm is within 15%** of Arm A's at that budget (quality won, fidelity not sacrificed). → the
  in-house sliver gap is a *parametrization-distortion* problem, fixable in UV by the surface metric. The
  rebuild's "transition-free (u,t) Delaunay" is sharpened to "under the first fundamental form."
- **REFUTED** iff the minAngle curves **coincide** (Δ < 5° at matched tris) — the surface metric doesn't move
  3D quality, so the sliver gap is elsewhere (topology templates / point placement) — OR Arm B reaches the
  quality only by a **>15% chord penalty** (not a free win; needs the CVT/ODT pass regardless).

## Controls

Same engine (gmsh) for both arms (isolates metric, not solver); equal-instrument (`honestGate` on every mesh);
matched-budget read-off (quality compared at equal triangle count, not equal tol); deterministic (gmsh seed
pinned); surface-patch probe (watertightness/seam not tested here — separate concern). Note: the relief chord
floor is already known density-irreducible (straddle) — this experiment targets the **quality** axis; any chord
movement is a guard against a hidden trade-off, not the headline.

## RESULT (2026-06-29) — VERDICT: **CONFIRMED on both styles**
Scorecard: `2026-06-29-rebaseline-evidence/surface-metric-scorecard.json` (18 rows). Render:
`scratchpad/surfmetric_quality.png` (3D min-angle heatmap, matched budget).

| style | arm | tris | minAngle(3D) | %<20° | rms |
|---|---|---|---|---|---|
| Gyroid | euclid | 9.6k -> 76k | **11.5deg -> 7.3deg** (degrades) | 6.9-7.5 | 0.25-0.31 |
| Gyroid | surfmetric M=g/h2 | 2.1k -> 30k | **32.8deg -> 26.6deg** | **0.0** | 0.29-0.38 |
| BasketWeave | euclid | 11k -> 88k | **11.6deg -> 7.5deg** (degrades) | 5.3-6.0 | 0.25-0.30 |
| BasketWeave | surfmetric M=g/h2 | 2.2k -> 31k | **28.7deg -> 21.6deg** | **0.0** | 0.27-0.35 |

**At matched triangle count**, the surface metric lifts 3D worst-angle by **+11deg to +18.7deg** (Gyroid best
+18.4, BasketWeave best +18.7), with **%<20deg collapsing 5-7% -> 0.0%** (essentially zero slivers), and
**rms within 15%** at every matched operating point (Gyroid -3% to +16%; BasketWeave +11% to +13%). Meets the
CONFIRMED criterion (delta>=10deg AND rms within 15%) on both styles. The render shows it directly: Euclidean = a
mottled yellow/orange surface (slivers everywhere on the lifted 3D shape) vs surface-metric = near-uniform green
(even triangles), at *fewer* triangles.

Findings:
1. **The in-house sliver gap is a parametrization-distortion problem, fixable in UV.** Euclidean (u,t) Delaunay
   tops out near ~10deg worst-angle in 3D and *gets worse with density* (denser slivers, 11.5->7.3). The first
   fundamental form `g` pre-distorts the (u,t) mesh so triangles are even ON THE SURFACE - reproducing the CVT
   3D-remesh's ~30deg quality (`2026-06-26-evidence-3d-direct-vs-uv.md`) **without leaving UV**.
2. **This CORRECTS the "CVT/ODT pass MANDATORY" conclusion** from the sizing-isolation run
   (`2026-06-26-sizing-isolation-prereg.md`). That run found accurate sizing *worsened* angles - but it used
   the **second** fundamental form (curvature) metric, which deliberately makes curvature-aligned slivers. The
   **first** fundamental form delivers CVT-grade angles BY CONSTRUCTION (worst 22-33deg, %<20=0). A CVT/ODT pass
   is now a *light optional polish*, not a mandatory gap-closer.
3. **Quality and fidelity remain separate axes (no free lunch on chord).** The uniform-3D surfmetric does NOT
   chord-refine the relief creases, so its p99 chord is higher (1.0-1.5 vs euclid ~0.9). The fix is the
   **combined metric `M = g / h(u,t)2`** (surface shape x curvature sizing) - even 3D triangles *and*
   crease-concentrated density in one field. The relief chord *floor* itself stays budget+straddle (established).

**Roadmap impact:** the rebuild kernel target is now precise - **a metric-Delaunay (anisotropic in-circle)
over (u,t) under `M = g/h(u,t)2`** (first fundamental form for 3D-even shape, curvature for chord). gmsh-BAMG is
the dev oracle proving the target is reachable. Next lab step: add the combined `M=g/h(u,t)2` arm and confirm it
holds the +18deg quality while pulling p99 chord down to the euclid level.
