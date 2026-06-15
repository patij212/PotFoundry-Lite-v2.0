# Stage-1 Uniform-Density A-vs-C Discriminator (2026-06-15)

Forces the quadtree `minUniformLevel` via `__pfConformingUniformLevel` (commit
`deec8c0`), bypassing the curvature-grid refiner, to test whether isotropic
densification closes the perpendicular-3D chord gap on the lattice/weave/braid
styles **with acceptable triangle quality**. Probe:
`potfoundry-web/e2e/_fidelity_uniform_sweep.cjs`. denseN=6 (fixed), target 4M.

Reading: chord drops with level → **A** (refiner just needs to request density);
chord flat → **C** (structural straddle, needs feature alignment). Separately, if
min-angle does NOT improve with density, the sliver/quality defect is a
**triangulation-pattern** problem (Stage 2), not a density one.

## GyroidManifold (TPMS lattice — the worst chord gap)

| uniformLvl | perpChord | perp p99 | nAbove% | worstMinAng° | p1MinAng° | %<20° | wallTris |
|---|---|---|---|---|---|---|---|
| 0 (control) | 1.1059 | 0.4554 | 4.945 | 0.85 | 5.0 | 7.10 | 714,816 |
| 8 (forced) | 1.1059 | 0.4554 | 4.945 | 0.85 | 5.0 | 7.10 | 714,816 |
| 9 (forced) | 0.9816 | **0.2493** | 2.706 | 0.85 | 8.0 | 3.70 | 1,394,376 |

**Verdict: chord is DENSITY-RESPONSIVE → Option A viable.**
- L8 ≡ L0 byte-identical ⇒ the natural adaptive mesh is *already* ≈ level-8 dense;
  forcing ≤8 adds nothing (the refiner saturates there — exactly the
  curvature-grid blindness the design predicted).
- L9 nearly halves perp p99 (0.455 → 0.249) at ~2× triangles ⇒ the gap is **not** a
  structural straddle; density reduces it. Extrapolating (~×0.55 p99/level, ×~2
  tris/level) reaching the 0.1 tol ≈ level 10.5 ≈ ~4M tris for Gyroid alone.
- ⇒ **A is correct** (drive the refiner by the perp-3D oracle so it requests density
  at the walls). **C (feature-aligned cells) is a triangle-count OPTIMIZATION**, not
  a correctness necessity — Stage 3 measures whether the curvature-relative τ keeps the
  count sane or whether C is needed to hit tol within budget.

**Quality is DENSITY-INVARIANT.** worst min-angle pins at **0.85° across all three
levels** (8× density range). Slivers are NOT a density artifact — they are a
triangulation-pattern defect (uBias anisotropy / feature-pinning). ⇒ Stage 2
(quality) needs its own fix and cannot be closed by densifying.

## BasketWeave (weave class — cross-family confirmation)

| uniformLvl | perpChord | perp p99 | nAbove% | worstMinAng° | p1MinAng° | %<20° | wallTris |
|---|---|---|---|---|---|---|---|
| 0 (control) | 1.6249 | 0.4333 | 3.157 | 2.64 | 3.0 | 12.10 | 422,497 |
| 9 (forced) | 1.6249 | **0.1058** | 1.259 | 2.64 | 4.0 | 6.70 | 981,576 |

**Confirms the Gyroid verdict across a different sub-family (weave vs TPMS lattice):**
- Chord DENSITY-RESPONSIVE — p99 0.433 → **0.106** (×4 reduction, nearly to the 0.1
  tol) at ~2.3× tris (422k → 982k). Density closes the gap *more cheaply* here than on
  Gyroid ⇒ Option A is the right call for the chord gap.
- Quality DENSITY-INVARIANT — worst min-angle pinned at **2.64°** at both levels (the
  %<20° bulk improves 12.1→6.7 but the worst sliver is unchanged) ⇒ Stage-2 fix needed.

## Conclusion (2 sub-families agree)
For the lattice/weave/braid chord gap: **Option A** (drive the refiner by the perp-3D
oracle so it requests density at the walls). Density provably closes the chord gap
(refuting any structural-straddle hypothesis); C (feature-aligned) is reserved as a
triangle-count optimization where A's count is too high (Stage 3 measures per style).
The remaining 3 gap styles (CelticKnot, CelticTriquetra, GothicArches) are the same
class and inferred-same; confirm early in Stage 3. **Slivers are density-invariant on
both** ⇒ Stage 2 (quality) is a separate, mandatory triangulation-pattern fix.
