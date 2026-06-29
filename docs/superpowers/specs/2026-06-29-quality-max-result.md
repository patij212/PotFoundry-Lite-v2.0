# Driving 3D triangle quality higher in UV — RESULT (2026-06-29)

Follows `2026-06-29-surface-metric-isolation-prereg.md` (which CONFIRMED `M=g/h²` lifts worst-angle). This drives
the WHOLE distribution up and adds the two missing levers: chord-adaptive sizing + an on-surface smoothing pass.
Lab-only. Scorecard: `2026-06-29-rebaseline-evidence/quality-max-scorecard.json`. Render:
`scratchpad/surfqual_progression.png`.

## Stages (gmsh, sizeRes 64, dims H120/Rb40/Rt50)
1. **euclid** — Frontal-Delaunay under the scalar curvature sizing field (baseline).
2. **surfmetric-uni** — BAMG under `M=g/h²`, uniform 3D size (even shape, one size).
3. **surfmetric-chord** — BAMG under `M=g/h₃D(u,t)²`, `h₃D=√(8·tol/κ_max)` (even shape + crease-tight density).
4. **chord+smooth** — stage 3 + on-surface Laplacian polish (`surfaceSmoothing.ts`, 10 iters, relax 0.5).

| style | stage | tris | worst | p5 | **mean** | %<20 | %<30 | rms | p99 |
|---|---|---|---|---|---|---|---|---|---|
| Gyroid | euclid | 19475 | 10.0 | 18 | **30.1** | 7.2 | **55.7** | 0.314 | 0.935 |
| Gyroid | surfmetric-uni | 15802 | 28.3 | 41 | **50.7** | 0.0 | **0.0** | 0.340 | 1.116 |
| Gyroid | surfmetric-chord | 9569 | 21.4 | 31 | **44.9** | 0.0 | 3.2 | 0.317 | 0.936 |
| Gyroid | chord+smooth | 9569 | 20.7 | 31 | 45.3 | 0.0 | 2.9 | 0.318 | 0.936 |
| BasketWeave | euclid | 22452 | 10.4 | 19 | **30.5** | 5.4 | **52.7** | 0.281 | 0.990 |
| BasketWeave | surfmetric-uni | 16291 | 25.9 | 41 | **50.7** | 0.0 | **0.0** | 0.315 | 1.079 |
| BasketWeave | surfmetric-chord | 11055 | 19.6 | 35 | **47.7** | 0.0 | 0.8 | 0.299 | 1.148 |
| BasketWeave | chord+smooth | 11055 | 21.1 | 36 | 48.2 | 0.0 | 0.5 | 0.301 | 1.167 |

## Findings
1. **Quality driven MUCH higher — the whole distribution, not just the worst.** Euclidean puts **>half** its
   triangles below 30° (%<30 = 53–56%); the surface metric puts **~none** there (%<30 = 0–3%), and **mean
   min-angle jumps 30° → 50.7°** (60° is perfect equilateral). p5 (robust worst) 18° → 41° (uniform) / 31–36°
   (chord). This is CAD-master-grade tessellation, in UV.
2. **The combined chord metric `M=g/h₃D(u,t)²` gets BOTH, cheaper.** It holds near-equilateral quality (mean
   45–48°, %<20=0) AND pulls chord back to the euclid level (Gyroid rms 0.317 vs 0.314, p99 0.936 vs 0.935) at
   **~half the triangles** (9.6k vs 19.5k). BasketWeave p99 stays a touch high (1.15) — residual weave-crease
   straddle (the known density-irreducible floor, separate axis). This resolves the open "chord vs quality"
   fork from the isolation run.
3. **Smoothing is MARGINAL on a good metric-Delaunay mesh** (Gyroid worst 21.4→20.7; BasketWeave 19.6→21.1;
   mean +0.4 both). gmsh BAMG already optimizes vertex placement, so a Laplacian polish is ~no-op — **the metric
   is the lever, not the smoothing.** (The polish would matter only if the in-house kernel places points worse
   than gmsh; keep it in the toolbox, don't rely on it.) Sharpens the earlier "CVT/ODT optional" to "optional
   and, on a good kernel, nearly unnecessary."

## Recipe LOCKED (the rebuild kernel target)
**Metric-Delaunay (anisotropic in-circle) over (u,t) under `M = g/h₃D(u,t)²`** — first fundamental form `g`
for 3D-even shape, `h₃D=√(8·tol/κ_max)` (max principal curvature) for crease-tight chord. Isotropic-in-3D (not
curvature-anisotropic — that made slivers). CVT/ODT smoothing optional. gmsh-BAMG is the dev oracle proving the
ceiling (mean ~51°, worst ~28°). Relief chord floor unchanged (budget+straddle).

## Next phase
The recipe is proven on the **oracle**. The rebuild needs an **in-house metric-Delaunay kernel** (anisotropic
in-circle) that hits these numbers without gmsh — prove it in the lab against the oracle (the existing
`metricDelaunayRefine.ts` spike is the prior attempt; "needs the true anisotropic in-circle"), THEN the
production cutover (brainstorm → flag-gated → watertight re-proof; touches CRITICAL `PeriodicBalancedQuadtree`/
`WatertightAssembly`).
