# Verifier Round 5 — Diagnostic: Catastrophic 2D Companion Failure
Date: 2025-07-10

## Summary Verdict: REJECT (Round 4 Implementation)

The Round 4 converged 2D companion cloud design has been implemented correctly per
specification, but produces catastrophic export results — dramatically WORSE than
the pre-implementation baseline. The design is fundamentally flawed due to an
unexamined interaction between the companion ring placement geometry and the
CDF-adaptive grid's high density near chain features.

## Evidence: Export Metrics

| Metric | Expected | Actual | Severity |
|--------|----------|--------|----------|
| maxAspect (UV) | ~4:1 | 338,449:1 | CATASTROPHIC |
| Missing chain edges | 0 | 196 (192 cross-row) | CRITICAL |
| R2 violations | ~0 | 25,815 | CRITICAL |
| Min angle (UV) | >15° | 0.0° | CRITICAL |
| Inverted triangles | 0 | 125,869 | CRITICAL |
| Non-manifold edges | 0 | 690 | CRITICAL |
| Validation | PASS | FAIL (all dims) | CATASTROPHIC |

Pre-implementation baseline: maxAspect=18:1, manifold=true.

## Root Cause Analysis

### RC1 [CRITICAL]: MaxR Collapse — CDF Grid Defeats Ring Sizing

**The paradox**: The CDF-adaptive grid with `featureFloor=0.6, featureRadius=0.004`
(GridBuilder.ts L238-239) guarantees HIGH column density near chain features.
But the ring sizing uses:

```typescript
// OWT L489-501
const halfGapU = Math.min(cv.u - uLeft, uRight - cv.u);
const maxR = Math.min(halfGapU, halfGapT);
```

With ~577 columns, average spacing is ~0.00173. Near chain features, CDF-adaptive
spacing is tighter — approximately **0.0005 to 0.001**. This caps `halfGapU` at
~0.0005, making `maxR ≈ 0.0005`.

Ring radii become:
- Inner (0.35 × maxR): **0.000175** (175 nanometers in U-space)
- Middle (0.70 × maxR): **0.000350**
- Outer (0.90 × maxR): **0.000450**

These micro-companions don't improve CDT triangulation — they create tightly-clustered
vertex groups that produce WORSE aspect ratios. The CDT creates tiny triangles within
the cluster and long slivers from the cluster to distant grid vertices.

**Evidence**: `maxAspect=338449:1` — three orders of magnitude worse than baseline.

### RC2 [CRITICAL]: Cell Bounds Check Traps Companions

```typescript
// OWT L516-517
if (cu < uLeft + 1e-6 || cu > uRight - 1e-6) continue;
if (ct < tBelow + 1e-6 || ct > tAbove - 1e-6) continue;
```

Companions cannot extend beyond the grid cell containing their parent chain vertex.
Even if we increased maxR, the cell bounds check would clip all companions that
reach beyond the current cell. With CDF-adaptive grids, cell width near features is
~0.001 — companions are jailed in a micro-cell.

### RC3 [CRITICAL]: Asymmetric T-Distribution

Chain vertices sit ON row T-positions (`tThis = activeTPositions[cv.rowIdx]`).
Ring companions are displaced by `±dt` from tThis. A companion at `tThis + dt` enters
band j (above the chain vertex), while `tThis - dt` enters band j-1 (below).

Each band receives companions clustered within ~`maxR ≈ 0.0005` of ONE boundary,
not distributed across the full T-gap (~0.005). The CDT creates thin slivers from
the companion cluster to the opposite row boundary — the exact pathology we wanted
to eliminate.

### RC4 [CRITICAL]: Seam Chain Blindness (Chain6 at U≈0.99999)

```typescript
// OWT L519
if (cu < SEAM_EDGE_COMPANION_GUARD || cu > 1 - SEAM_EDGE_COMPANION_GUARD) continue;
```

`SEAM_EDGE_COMPANION_GUARD = 0.003` rejects ALL companions for chain vertices at
U > 0.997. Chain6 at U≈0.99999 gets **ZERO** companions.

Additionally, chain6's constraint edges appear in `segConstraints` (OWT L935-945),
but the chain vertices may not pass the strip U-range filter for `stripBot/stripTop`
(OWT L904-910: `sv.u <= uStripRight + 1e-9`). When the CDT can't find the constraint
endpoint in its local vertex set, it silently drops the constraint:

```typescript
// CST L225-230
const l0 = globalToLocal.get(v0);  // undefined if vertex not in strip!
const l1 = globalToLocal.get(v1);
if (l0 !== undefined && l1 !== undefined) {
    addEdge(l0, l1);  // silently skipped when endpoint missing
}
```

This explains ALL 192 missing cross-row edges.

### RC5 [WARNING]: Strict T-Boundary Inequality in Band Bucketing

```typescript
// OWT L554
if (cv.t <= activeTPositions[bandIdx] || cv.t >= activeTPositions[bandIdx + 1]) continue;
```

Strict inequality rejects companions at exact band boundaries. Horizontal companions
(angle=0, π) have dt=0, placing them at `tThis = activeTPositions[bandIdx]` — rejected.
This contributes to the 11% companion loss (46819 collected out of 52621).

### RC6 [DESIGN FLAW]: Fundamental Assumption Violated

The concentric ring design was proposed under the assumption that chain vertices
are "floating between grid columns" with substantial space on each side. But the
CDF-adaptive grid with `featureFloor=0.6` places columns CLOSE to chain features
by design. The rings are sized relative to the gap between the chain vertex and
its nearest grid column — which is tiny by construction.

**The grid is already densest where companions are placed. Companions are smallest
where they're needed most.**

## Diagnosis Summary

The 2D companion cloud is fundamentally incompatible with the CDF-adaptive grid's
feature-density behavior. The implementation is correct per specification, but the
specification itself is flawed. The approach needs to be redesigned from first principles.

## Requirements for Generator Round 5

The Generator must propose a redesign that addresses ALL of the following:

1. **Companion sizing must NOT depend on halfGapU** — companions need a radius
   proportional to the T-gap, not the (tiny) U-gap.

2. **Companions must be allowed to extend into adjacent cells** — the cell bounds
   check must be relaxed or removed. The CDT strip system already collects vertices
   across multi-cell strips, so cross-cell companions are naturally handled.

3. **T-distribution must be symmetric** — companions should span the full T-gap
   between rows, not cluster at one boundary. Consider placing companions at
   mid-T-gap positions or using a linear column approach instead of rings.

4. **Seam chains must get companions** — chain6 at U≈0.99999 needs support vertices.
   Either wrap companions through the seam or handle near-seam chains specially.

5. **Missing edge root cause** — if chain vertices at extreme U positions fall
   outside the strip vertex set, the strip needs to expand to include them.

6. **Validate against CDF-adaptive grid** — any new design must be tested with
   the actual grid spacing (featureFloor=0.6, ~577 columns, ~0.001 spacing near
   features) to ensure companions are appropriately sized.

## Key Constants Reference
| Constant | Value | Source |
|----------|-------|--------|
| featureFloor | 0.6 | GridBuilder.ts L238 |
| featureRadius | 0.004 | GridBuilder.ts L239 |
| Grid columns | ~577 | CDF-adaptive |
| Grid rows | ~400 | T-positions + insertions |
| Avg U-spacing near features | ~0.001 | CDF-driven |
| Avg T-spacing | ~0.0025 | 400 rows over [0,1] |
| SEAM_EDGE_COMPANION_GUARD | 0.003 | OWT L402 |
| COMPANION_DEDUP_THRESHOLD | 1e-5 | OWT L403 |
| halfGapU near features | ~0.0005 | CDF-density driven |
| halfGapT | ~0.00125 | (T-gap)/2 |
| Pre-implementation maxAspect | 18:1 | Previous export |
| Post-implementation maxAspect | 338,449:1 | Current export |
