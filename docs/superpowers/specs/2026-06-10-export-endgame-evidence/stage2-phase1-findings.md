# Stage-2 Phase-1 Findings — Sliver Mechanism & Phase-2 Fork (2026-06-15)

Phase-1 diagnostic for the triangle-quality (sliver) workstream
(design `2026-06-15-stage2-triangle-quality-design.md`). Data:
`stage2-phase1-ubias-sweep.{md,json}`.

## 1. The decisive result: GATE-B anisotropy is REFUTED as the cause

The leading hypothesis was that the `computeUBias` GATE-B anisotropy *introduces* the
slivers. The discriminator (force the existing `__pfConformingUBias=0`, re-measure
min-angle) **refutes it on all 9 styles measured**: `%<20°` explodes 4–17% → 50–92% when
the bias is removed. GATE-B makes physically-u-long cells square; it is the **mitigation**,
not the cause. **Do not tame/disable GATE-B** — that is the wrong direction.

## 2. Where the default residual slivers actually come from

| Sub-class | Evidence | Disposition |
|---|---|---|
| **Bulk (smooth-region) slivers** | default bulkPct 6–10% (Gyroid 8.8, CelticKnot 10.2, DragonScales 6.7, Voronoi 9.7) | **fixable** — triangulation-pattern (diagonal-choice / 2:1 transition templates) → Phase 1b |
| **Catastrophic worst angles** (<1°) | Gyroid 0.85, CelticKnot 0.41, SFB 0.37, Voronoi 0.74; ~unchanged by uBias either way | separate **degenerate-cell** source (transition templates / feature-pin column junctions) → Phase 1b |
| **Feature-band-only slivers** | SFB 0% bulk (all in crest band = petal cusps); FourierBloom band-skewed | likely **input-forced** (exclude, Phase 3) — confirm at the locus |

## 3. The Phase-2 fork (decided)

**Not GATE-B.** The fix candidate is the **diagonal-choice path**: the max-min-angle
(Klincsek DP) diagonal selection that runs only when `efg` is populated
(`PeriodicBalancedQuadtree` injects `efgSampler` → `QuadtreeTriangulator` DP gate ~:125;
otherwise a plain fan → thin triangles). Plus the **degenerate-cell** source for the
catastrophic worst angles (transition templates / feature-pin junctions).

## 4. Next step — Phase 1b (measure the fix candidate before promoting it)
1. Add a flag-gated `efgSampler`-injection lever (mirrors `__pfConformingUniformLevel`),
   default off → byte-identical, so production stays untouched.
2. Measure whether activating the max-min-angle DP lifts the **bulk** slivers (and by how
   much) across the catastrophic styles; watertight + chord regression-checked.
3. Separately localize the **catastrophic-worst** degenerate cells (a worst-sliver
   localizer) to confirm they are transition/feature-pin junctions and whether the DP or a
   template change addresses them.
4. If the DP lifts the bulk slivers cleanly → promote to default (Phase 2). Residual
   feature-band slivers (SFB cusps) → the Phase-3 sharp-feature exclusion.

## 5. Carry-forward
- GATE-B is load-bearing (the mitigation) — Phase-2 changes must NOT regress it.
- The catastrophic-worst (<1°) source is distinct from the bulk slivers; both must be
  closed for the quality gate (worst min-angle ≥ θ_min outside documented loci).
- SFB petal-cusp + FourierBloom band slivers are the first input-forced candidates.
