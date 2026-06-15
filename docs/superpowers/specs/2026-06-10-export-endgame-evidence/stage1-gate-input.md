# Stage-1 Gate-Input — Classification & Calibrated Gate (2026-06-15)

The decision document for the CAD-grade dual-gate export work
(`docs/superpowers/specs/2026-06-15-cad-grade-dual-gate-export-design.md`).
Synthesizes the committed measured artifacts into the per-style classification and
the calibrated gate that Stages 2–4 consume. **All numbers trace to committed data**
(`stage1-dualgate-baseline.{json,md}`, `stage1-uniform-sweep.md`); no prose-only claims.

---

## 1. The calibrated gate (committed: `src/fidelity/gateThresholds.ts`)

- **CHORD:** every facet's perpendicular-3D distance to the true surface ≤
  `chordToleranceMm(localFeatureSizeMm) = clamp(0.05·featureSize, 0.005, 0.1)` mm —
  curvature-relative (sharp features get a tighter bound; large smooth walls the 0.1
  ceiling). 0.1mm cleanly separates the clean styles (perp p99 ≤ 0.076) from the 5 gap
  styles (0.156–0.489). Tighten the ceiling toward 0.05 once the gaps are closed.
- **QUALITY:** every triangle min interior angle ≥ **20°** (`minAngleDeg`) and aspect ≤
  **4.76** (`maxAspect`). 20° is cleared with margin by the smooth styles (worst
  24–29°); A_max is the analytic companion (worst 20°-cap triangle), validated vs
  measured `maxAspectRatio` in Stage 2.

---

## 2. Per-style classification (from the dual-gate baseline + A-vs-C sweep)

| Class | Styles | Action |
|---|---|---|
| **PASS both gates** | SuperellipseMorph, HarmonicRipple, RippleInterference, WaveInterference (denseN=4) | none — regression-guard only |
| **Chord-clean, QUALITY-fail** | FourierBloom (17.3% <20°), GeometricStar, BambooSegments, SpiralRidges, ArtDeco, HexagonalHive, DragonScales, SuperformulaBlossom, Crystalline, LowPolyFacet (marginal) | **Stage 2 only** (triangulation-pattern fix; chord already CAD-grade) |
| **CHORD-fail (A) + QUALITY-fail** | GyroidManifold, BasketWeave, CelticKnot, GothicArches, CelticTriquetra | **Stage 3 (density via perp oracle) AND Stage 2 (quality)** — both, independent mechanisms |
| **REF-UNTRUSTED** | Voronoi (vtxMax 0.182, f32/f64 hash floor) + quality-fail | separate precision item; quality via Stage 2 |

**Counts:** 3 pass (4 with WaveInterference) · ~10 quality-only · 5 chord+quality · 1 ref-untrusted.

---

## 3. The two findings that shape Stages 2–4

### 3a. The quality gap is the DOMINANT and WIDER defect — and is independent of chord
The min-angle dimension fails on ~16/20 styles, **including styles whose chord is
already CAD-grade** (FourierBloom: chord 0.0158, 17.3% of triangles < 20°). The
catastrophic-sliver set (worst min-angle < ~3°: SFB, CelticKnot, Voronoi, Gyroid,
HexHive, ArtDeco, DragonScales, BasketWeave) correlates with feature density / the
uBias-anisotropy + feature-pinning machinery — matching the prior "uBias GATE-B
re-baseline introduced slivers on 9/20" finding. **Stage 2 (quality) is a first-class
workstream, not a Stage-3 byproduct.**

### 3b. A-vs-C verdict: chord is density-RESPONSIVE (A), quality is density-INVARIANT
Forcing uniform density (`__pfConformingUniformLevel`) on the worst gap style:
- **GyroidManifold** chord p99 0.455 → **0.249** from level 8→9 (~2× tris); level 8 ≡
  level 0 (natural mesh already ≈level-8 dense → the refiner saturates). ⇒ the gap is
  **not** a structural straddle — density closes it ⇒ **Option A** (drive the refiner
  by the perp-3D oracle). C (feature-aligned cells) becomes a *triangle-count
  optimization*, not a correctness need (uniform-to-tol extrapolates to ~level-10 / ~4M
  tris for Gyroid → Stage 3 measures whether curvature-relative τ keeps the count sane).
- Quality (worst min-angle) is **flat at 0.85° across the full 8× density range** ⇒
  slivers are a triangulation-pattern defect, **not** density-closable.
- **Cross-family confirmation — BasketWeave (weave class):** chord p99 0.433 → **0.106**
  (×4, nearly to tol) at level 0→9 (~2.3× tris); worst min-angle pinned at 2.64°.
  Same verdict on a different sub-family ⇒ generalizes. The remaining 3 (CelticKnot,
  CelticTriquetra, GothicArches) are the same class, inferred-same; confirm early in Stage 3.

---

## 4. The Stage-2/3 decision: SEPARATE workstreams

Stage 2 (quality) and Stage 3 (chord) are **distinct fixes**: quality is
density-invariant (a triangulation-pattern fix — the earClip/efg max-min-angle
diagonal path and/or the uBias anisotropy), chord is density-responsive (the
perp-oracle-driven refiner). They **intersect** only on the 5 chord+quality styles
(which need both). Recommended Stage ordering unchanged: run them as parallel
workstreams; the quality workstream is larger than first scoped (10 quality-only + 5
shared styles) and should arguably go first since it blocks the most styles.

---

## 5. Carry-forward risks for Stage 3/4
- **Triangle budget.** Uniform-to-tol is ~4M tris for Gyroid alone; the perp-driven
  refiner must spend density only at the walls (curvature-relative τ) or escalate to C
  (feature-aligned, fewer tris) to stay within a sane export budget. Measure per style.
- **Watertightness is load-bearing** — exports hard-fail on a topology break
  (`useParametricExport.ts:405-406`), no fallback. Every refiner change re-runs
  `summarizeConformingValidation` (bnd/nonMan/orient/sliver=0).
- **Voronoi** ref-untrusted (hash floor) — separate precision track; do not block.
- **WaveInterference** — backfilled at denseN=4 (passes both gates; denseN=6 perp
  coarse-search times out — a perf note for the metric, not an export defect).

---

## 6. Status vs the Stage-1 plan
1. Authoritative dual-gate baseline — ✅ `1729d02`.
2. A-vs-C discriminator (lever + sweep) — ✅ lever `deec8c0`; Gyroid + BasketWeave
   confirmed (chord density-responsive across 2 sub-families).
3. Calibrated τ/θ_min/A_max — ✅ `5fecb64`.
4. This gate-input document — ✅ (this file).
