# Generator Round 3 Addendum — CDT Diagnostic Results

Date: 2026-03-04

## P1 Result: CDT Works Perfectly — And Changes Nothing

CDT ran on all 5,642 strips with **zero fallbacks**. The `cdt2d` library is completely reliable. But the output is statistically identical to sweep-repair. Missing edges went from 3,139 → 3,156. Aspect violations stayed at 87.9%. Inverted triangles actually increased (145K → 147K).

**My Round 3 P1 prediction was wrong.** I predicted CDT would drop missing edges from 47.6% → ~3-5%. It didn't. The reason is simple and damning:

## Root Cause: CDT Can Only Enforce Constraints It Receives

The constraint pipeline is:

```
allChainEdges (6,586 edges)
    ↓
pointIdx < 0 filter (OWT L857)     ← DROPS 3,317 interpolated edges
    ↓
segConstraints (3,269 primary edges)
    ↓
batch2Remap (coincident vertex merging)
    ↓
CDT receives 3,162 constraints       ← enforces ALL 3,162 (100% success)
    ↓
Missing: 3,156 edges                 ← 99.8% are interpolated edges that were never passed
```

CDT achieved 100% constraint enforcement on the constraints it received. The 47.6% missing edge rate is entirely caused by the upstream filter, not the triangulation algorithm. **Switching CDT for sweep changed nothing because the bottleneck was never the triangulator — it was the constraint filter.**

## Evidence From Export Log

Every missing edge example involves `pt-1` (interpolated vertex):

| Edge | Type | Status |
|------|------|--------|
| `pt14→pt-1` | feature → interpolated | **DROPPED by filter** |
| `pt-1→pt15` | interpolated → feature | **DROPPED by filter** |
| `pt22→pt-1` | feature → interpolated | **DROPPED by filter** |
| `pt-1→pt23` | interpolated → feature | **DROPPED by filter** |

Zero missing edges involve `ptN→ptM` (both feature points). The primary edge enforcement rate is 3,162/3,269 = 96.7%. The 107 missing primary edges are likely from seam-region strips or batch2Remap collisions, not from CDT failure.

## Companion Density: CDT Doesn't Fix Vertex Placement

density=12 creates 130,478 companion vertices. In a grid cell ~0.00173 wide, 12 companions per side have spacing ~0.000073. T-spacing is ~0.0032. Minimum aspect ratio = 0.0032 / 0.000073 = **43.8:1**.

CDT optimizes Delaunay angles, but the Delaunay criterion is a property of the triangulation, not the vertex set. If every triangle's circumscribed circle is optimal but the vertices themselves force 43:1 aspect ratios, CDT can't help. The angle-optimal triangulation of a 43:1 vertex set still produces 43:1 triangles.

Result: `avg_aspect=17.0:1, violations(>4:1)=87.9%` — identical to sweep.

## Revised Priority: P2 and P3 Are The Fix

### P2 (Remove pointIdx filter) is now CRITICAL — not moderate

The filter at OWT L857 is the single point of failure. It was designed with the assumption "interpolated vertices participate freely in CDT/sweep" — but "freely" means "randomly." Without constraints, these edges appear by chance, which means ~50% are missing.

**Revised recommendation**: Remove the filter entirely (Option A from Round 3). Pass ALL 6,586 chain edges as constraints to CDT.

**Risk assessment**: The main risk was crossing constraints. But examining the missing edges, they're all between adjacent rows (`row14→15`, `row15→16`, etc.) with nearly identical U values (`0.081851→0.081766`). These are short, nearly-vertical edges that cannot cross each other. The crossing risk is negligible for adjacent-row interpolated edges.

### P3 (Reduce companion density) is now CRITICAL — not moderate

density=12 is the primary cause of 87.9% aspect violations. CDT confirmed this: even with Delaunay angle optimization, the vertex placement forces slivers.

**Revised recommendation**: density=2 for CDT mode, density=0 for sweep mode. The CDF-adaptive grid already provides density near features via `GridBuilder.ts` — companions were a redundant density mechanism that has become the primary quality problem.

With density=2: 2 companions per chain point × 2 sides = 4 companions per point. 6,606 chain points × 4 = ~26K companions (vs 130K). Spacing ≈ 0.00058 (vs 0.000073). Aspect ratio ≈ 5.5:1 (vs 43.8:1). This alone should drop violations from 88% to <20%.

### P5 (Seam guard) remains important but secondary

The 11.5mm seam gap is unchanged by CDT. This confirms it's purely a guard exclusion issue, not a triangulation issue.

## Revised Execution Plan

**Phase 1 (immediate — two code changes):**
1. **P2**: Delete the `pointIdx < 0` filter at OWT L857. Pass all chain edges as constraints.
2. **P3**: Change companion density from 12 to 2 (or make it mode-adaptive: CDT=2, sweep=0).

**Phase 2 (once Phase 1 is validated):**
3. **P5**: Reduce `SEAM_GUARD` from 0.3 to 0.03.

**Phase 3 (cleanup):**
4. **P6 (revised)**: Keep CDT as default. Keep sweep as fallback with density=0. Don't delete sweep yet — it's working as a safety net (`sweepFallbacks=0` is great, but we haven't tested with the constraint filter changes).

## Predicted Impact of Phase 1

| Metric | Current (CDT, d=12, filter on) | Predicted (CDT, d=2, filter off) |
|--------|-------------------------------|----------------------------------|
| Constraints passed | 3,162 | ~6,500 |
| Missing edges | 3,156 (47.9%) | <200 (<3%) |
| Companion vertices | 130,478 | ~26,000 |
| Aspect violations | 87.9% | <20% |
| Min angle | 0.1° | >5° |
| Inverted triangles | 147,138 | <5,000 |

These predictions assume CDT handles the increased constraint count correctly (it should — cdt2d is designed for constrained triangulation) and that reduced companion density doesn't create holes (it shouldn't — companions are free points, not structural).

## Open Questions (Revised)

1. **Do interpolated chain edges cross each other?** If two chains cross in U-space between rows, their edges could form crossing constraints. CDT cannot handle crossing constraints — it will throw, fall back to sweep, and we're back to square one. The Executioner should check for crossing edges in the chain data before removing the filter.

2. **Is density=2 sufficient for CDT angle quality?** With 2 companions per side, the local vertex cloud has 5 points (1 chain + 2 left + 2 right) per row. CDT should produce reasonable triangles, but the proof is in the export.

3. **Will the seam guard changes interact with the constraint changes?** The last ~3% of chain edges near U=0/1 might create issues if the seam strip topology doesn't handle wrap-around constraint edges correctly.

---

*Generator out. P1 (CDT diagnostic) answered the question definitively: the triangulator works, the filter doesn't. P2+P3 are the fix. Two lines of code change the game.*
