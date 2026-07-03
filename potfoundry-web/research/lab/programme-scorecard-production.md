# Production Shipping-Export Scorecard — corrected true-3D ruler (TASK A baseline)

**2026-07-03.** First honest measurement of what the SHIPPING export delivers today, scored with the corrected
labkit instruments. Answers review-brainstorm Bet 1 (port vs back-port) and §4 ("the single highest-leverage move").

## What was measured (and how)

- **Path = the PRODUCTION default.** `ParametricExportComputer` with default feature flags: `conformingMesher: true`
  (default since the 2026-06-11 dominance checkpoint — verified in `parametric/contracts.ts:435` +
  `contracts.test.ts:198`), `surfaceFidelityExact: false`, `byConstructionAssembly: false`. **NEITHER** the
  `__pfConforming` nor `__pfSurfaceFidelityExact` hatch was set — forcing them would measure a NON-default config.
  This IS the conforming whole-mesh path the arc iterated on; it is what users get.
- **Real WebGPU, headed.** Headless WebGPU exposes no adapter on Windows (`playwright.config.ts`), so a headed
  Chromium drove a HMR-free **production preview build** loaded at `/?fidelity=1` (or dev `/` — hook via
  `import.meta.env.DEV`). Extract probe `e2e/_prodMeasure_extract.cjs` (`PF_PRODMEASURE=1`): per style set dims,
  `_debugOuterMesh()` (the conforming OUTER-wall submesh via the outer-wall mask) → dump f32 xyz + u32 idx to
  `research/exchange/_prodmeasure/<style>.outer.{xyz,idx}.bin`. ONE `generateMesh` per style (each ~1–9 min here).
  Resumable, per-style checkpoint, **11-min per-style hard timeout** (survived 2 env kills + relaunches on timeout).
- **Dims** = the research-scorecard convention **{H:120, Rb:40, Rt:50, expn:1}** (top_od 100 / bottom_od 80), spin=0,
  so the DIFF vs the E-SWEEP-METRIC-MAP research kernel is apples-to-apples. (App default is H120/Rt70/Rb45 — differs.)
- **Scored in Node** (`research/bridge/_prodMeasureScore.test.ts`, `PF_PRODSCORE=1`) with labkit under the CORRECTED
  ruler: `buildRadiusFn` (same `STYLE_FUNCTIONS` the export + kernel use), outer-wall (u,t) recovered from 3D
  (u=atan2(y,x)/τ, t=z/H — EXACT at spin=0). True-3D via `perFaceTrue3DSag`; **steep lattices/braids
  brute-anchored** (`bruteAnchoredRedPerp`, worst-40 red facets) to kill the single-seed-GN 7× overstatement;
  triangle quality via `triangleQualityDistribution` (min-angle, %<20 — depth-invariant); radial as a screen only.

## VERDICT — production is largely CAD-grade under the honest ruler; the real gaps are PERF + a steep-tail few

**10/15 measured styles are CAD-grade** (true-3D verdict p99 ≤ 0.11 mm). **5/20 styles TIMED OUT** (>11 min, the
conforming path over-refines them past this env's budget) — a **performance/robustness** blocker, not a proven
fidelity defect. The "defective on ~9/20" folklore does NOT hold as a *fidelity* claim under the corrected ruler:
the shipping conforming path places vertices faithfully on almost all styles it can build. The gap that IS real:
(a) **budget cap is IGNORED** — even smooth styles emit 0.3–3.8M outer tris at the default budget (HarmonicRipple
2.3M, Voronoi 3.8M); (b) **5 step/riser/weave/helical styles don't finish** in 11 min; (c) a **steep-tail of 5
styles** sits 0.12–0.26 mm (just over CAD); (d) **triangle quality is poor on steep lattices** (min-angle 0.4–2.8°),
the same density-invariant sliver tail the research kernel has.

## Per-style scorecard + DIFF vs the research kernel (E-2026-07-01-SWEEP-METRIC-MAP)

`prodP99` = production true-3D verdict p99 (brute-anchored where steep). `rkP99` = research-kernel true-3D p99
(metric-Delaunay M=g/h² @ ~1.5M pts, the number the arc reported). `gap×` = prodP99 / rkP99.

| style | class | prodP99 (mm) | rkP99 (mm) | gap× | radialMax | %<20 | minAng° | outerTris | CAD? |
|---|---|---|---|---|---|---|---|---|---|
| SuperellipseMorph | smooth | 0.003 | 0.0037 | 0.8 | 0.003 | 0 | 29.9 | 341k | YES |
| HarmonicRipple | smooth | 0.003 | 0.0035 | 0.9 | 0.006 | 0 | 23.1 | 2.30M | YES |
| RippleInterference | smooth | 0.0039 | 0.0034 | 1.1 | 0.010 | 0 | 37.2 | 528k | YES |
| FourierBloom | smooth | 0.0043 | 0.0031 | 1.4 | 0.004 | 0 | 23.1 | 1.28M | YES |
| SpiralRidges | helical | 0.0069 | 0.0036 | 1.9 | 0.036 | 0.8 | 15.2 | 2.68M | YES |
| WaveInterference | smooth | 0.0109 | 0.0028 | 3.9 | 0.062 | 0 | 37.3 | 395k | YES |
| GeometricStar | riser | 0.0193 | 0.0264 | 0.7 | 0.059 | 9.4 | 4.5 | 2.16M | YES |
| HexagonalHive | lattice | 0.0197 | 0.0111 | 1.8 | 0.353 | 2 | 1.6 | 2.06M | YES |
| Voronoi | lattice | 0.091 | 0.0103 | 8.8 | 0.119 | 8 | 0.9 | 3.77M | YES |
| GyroidManifold | lattice | 0.1151 | 0.0902 | 1.3 | 0.149 | 6.8 | 1.0 | 1.89M | ~(0.115) |
| SuperformulaBlossom | petal | 0.1304 | 0.0043 | 30.3 | 1.075 | 0 | 37.5 | 290k | no |
| GothicArches | thin-ridge | 0.1995 | 0.0692 | 2.9 | 1.399 | 4 | 2.8 | 1.42M | no |
| BambooSegments | ring-step | 0.239 | 0.6835 | 0.3 | 0.353 | 0.9 | 2.7 | 1.70M | no |
| CelticKnot | braid | 0.2584 | 0.3677 | 0.7 | 0.613 | 6.2 | 0.4 | 1.92M | no |
| LowPolyFacet | facet | 0.0023 | 0.3047 | 0.0 | 0.043 | 41.4 | 6.4 | 744k | YES |
| Crystalline | helical | **TIMEOUT** | 0.0365 | — | — | — | — | (>11min) | ? |
| ArtDeco | riser | **TIMEOUT** | 2.2541 | — | — | — | — | (>11min) | ? |
| DragonScales | scale-step | **TIMEOUT** | 0.4214 | — | — | — | — | (>11min) | ? |
| BasketWeave | weave | **TIMEOUT** | 1.0985 | — | — | — | — | (>11min) | ? |
| CelticTriquetra | braid | **TIMEOUT** | 0.0854 | — | — | — | — | (>11min) | ? |

### Reading the diff
- **Where the ruler agrees, production ≈ research kernel** on the 9 smooth/moderate styles (gap 0.7–1.9× except
  WaveInterference 3.9× and Voronoi 8.8× — both still CAD-grade in absolute terms, 0.011 / 0.091 mm).
- **Production BEATS the research kernel on the step/facet styles** it CAN build: LowPolyFacet 0.0023 vs 0.30 (130×
  better — the conforming path conforms the facet edges the crest-pinned kernel bridged), BambooSegments 0.24 vs 0.68,
  CelticKnot 0.26 vs 0.37. The `featureLevel:11` feature-proximity density is doing real work here.
- **Production LOSES on the smooth-relief thin-ridge / petal styles**: SFB 0.13 vs 0.004 (30×), GothicArches 0.20 vs
  0.069 (2.9×). These are exactly the styles `surfaceFidelityExact` (default OFF) would extract better — the shipping
  default leaves SFB petals / thin ridges under-conformed.
- **Triangle quality is the shared unfixed axis.** Steep lattices/braids min-angle 0.4–2.8° (CelticKnot 0.4°, Voronoi
  0.9°, Gyroid 1°) and LowPolyFacet %<20 = 41% — the density-invariant sliver tail, identical in kind to the research
  kernel's (both have min-angle→0). No fidelity fix ever touched it. This is the review's Q1/Bet 2 target and it is
  present in the SHIPPING mesh, not just the harness kernel.

## The 5 TIMEOUTs — the real production blocker (perf, not fidelity)

Crystalline, ArtDeco, DragonScales, BasketWeave, CelticTriquetra each ran >11 min without returning (one earlier
run confirmed a smooth style hitting **4.87M tris / 408 s** at a 100k-triangle request — the budget cap is a no-op).
These are the step/riser/weave/helical class the research map calls REAL-GAP-BROAD. The conforming assembly refines
every feature-crossing cell to `featureLevel:11` (2048² local) and the pre-triangulation cap + decimation ladder do
not tame it; the meshoptimizer WASM also threw `memory access out of bounds` in the GPU-grid reference path. So the
shipping export, at the default 'high' profile on these styles, is **effectively unusable in a constrained
environment** — it does not converge to a bounded mesh. This is the concrete face of review perf items P1/P3
(swap the radial chord guard for the perpendicular guard; converging worst-sag budget stop rule): the split
predicate over-refines toward an unreachable radial tolerance on near-vertical relief.

## Answer to Bet 1 (port vs BACK-PORT)

**BACK-PORT.** The shipping conforming path IS the research conforming path (same file), it already places vertices
CAD-grade on 10/15 measured styles and BEATS the throwaway metric-Delaunay kernel on the step/facet styles. The gap
is NOT "the wrong codebase ships"; it is three tractable back-port targets ON the shipping code:
1. **Perf / budget honesty (highest leverage)** — the 5 timeouts + budget-cap-ignored over-refinement. Review P1
   (perp split guard, `chordPerp`) + P3 (worst-sag priority-queue stop) target the exact `featureLevel:11` /
   radial-chord-guard over-refinement measured here. Without this, 5/20 styles do not ship at all.
2. **Steep-tail fidelity (5 styles 0.12–0.26)** — SFB/GothicArches want `surfaceFidelityExact` extraction (default
   OFF today); Gyroid/CelticKnot/Bamboo want the deep sag-refinement lever (E-CREASE-DENSITY-BREAKTHROUGH).
3. **Triangle quality (Bet 2 / Q1)** — the min-angle 0.4–2.8° sliver tail is IN the shipping mesh; metric-orthogonal
   insertion under M is the standing bet. Density-invariant, so density won't fix it.

Porting the metric-Delaunay kernel is NOT indicated: it is single-valued (cannot emit weave/tread) and its triangle
quality is no better (min-angle→0 too). The productionization work targets the conforming path.

## Artifacts / how to reproduce
- Bins + per-style diag: `research/exchange/_prodmeasure/<style>.outer.{xyz,idx}.bin` + `<style>.diag.json` (15 with
  bins, 5 TIMEOUT-marked). Scorecard rows: `research/exchange/_prodmeasure/scorecard-production.ndjson`.
- Extract: `PF_PRODMEASURE=1 PF_BASE_URL=http://127.0.0.1:<port>/ node e2e/_prodMeasure_extract.cjs` (needs a
  headed-WebGPU dev/preview server; resumable — `PF_RETRY=1` to re-attempt the 5 timeouts, e.g. at a lower
  `__pfConformingMaxLevel` / `__pfFidelityFeatureLevel`).
- Score: `PF_PRODSCORE=1 npx vitest run research/bridge/_prodMeasureScore.test.ts`.

## Honest limitations
- **5/20 styles unmeasured** (TIMEOUT) — the very styles the research map flags as the hard class. Their fidelity is
  UNKNOWN from this run; the finding on them is a **perf blocker**, stated as such. A retry at a capped
  `__pfFidelityFeatureLevel` (e.g. 7–8) or `__pfConformingMaxLevel` would likely let them build and be scored — do
  that next.
- **Watertight not scored here.** To keep to ONE generate/style (each ~5 min), only the OUTER-wall submesh was
  dumped (fidelity + triangle quality). Whole-pot raw-index/weld watertight needs a second generate; rerun with
  `PF_WHOLE=1` on a subset to fill `weldNonMan`/`rawNonMan`/`weldBnd` (the ndjson columns are present, set to −1).
  The arc's separate claim is 20/20 watertight via `guardManifoldAlways` except Crystalline nonMan=2.
- **In-page perp cross-check skipped** (would cost extra generates) — the Node labkit true-3D + brute-anchor is the
  authoritative number here; it is the same `projectPointToRadialSurface` the in-page metric uses, plus the brute
  anchor the in-page metric lacks.
- Budget = the profile 'high' default (no explicit target) — i.e. what the export button does.
