# Verifier Round 22 — Critique of Generator's Grid Vertex Demotion Proposals

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

Proposal 1 (Boundary Thinning) is the correct structural fix, but has a **critical bug** in the batch2Remap interaction path that must be fixed before implementation. Proposal 2 (Shadow-Endpoint Guard) is sound. Proposal 3B (no change, add diagnostic) is acceptable. Proposal 4 is correctly a non-proposal.

---

## Critique

### C1 [CRITICAL]: Batch2Remap Coincidence Breaks Constraint Recovery for P1

**Generator's claim**: "`sv.idx < gridVertexCount` correctly identifies all grid vertices and only grid vertices among non-chain StripVertex entries from buildMergedRow."

**Actual behavior**: This is technically true for the *identification* step, but the Generator **missed a critical interaction** with the batch2Remap coincidence path. When a chain vertex's U-position coincides with a grid column's U-position (within 1e-6), `buildMergedRow` replaces the chain vertex with the grid vertex:

```typescript
// OuterWallTessellator.ts lines 1035-1039 (buildMergedRow)
if (Math.abs(gridU - chainList[ci].u) <= 1e-6) {
    result.push({ idx: gridIdx, u: gridU, isChain: false, gridCol: i });
    batch2Remap.set(chainList[ci].vertexIdx, gridIdx);
}
```

After batch2Remap, the constraint edge endpoints are remapped to grid vertex indices:

```typescript
// OWT lines ~1360-1370
segConstraints[c] = [rv0 ?? cv0, rv1 ?? cv1];
```

Under Proposal 1, if this grid vertex is an **intermediate column** (not segStart or segEnd), it is **dropped from the CDT entirely** — not on the boundary, not as interior.

The "Fix missing constraint endpoints" recovery logic (lines 1416-1443) then tries to find the missing endpoint, but:

```typescript
// OWT line 1419
if (vIdx < gridVertexCount) continue;  // <— SKIPS recovery for remapped vertices
```

The remapped constraint endpoint has `vIdx < gridVertexCount` (it's now a grid index), so recovery is **skipped**. The constraint edge is passed to CDT with an endpoint vertex that doesn't exist in the local vertex set. CDT silently drops the constraint.

**How common is this?** CDF-adaptive grid placement deliberately puts grid columns near feature U-positions (curvature peaks/valleys). Chain vertices sit at these same feature positions. So chain-grid coincidence at intermediate columns is **expected and frequent** — potentially affecting every row where the chain's U-position aligns with a non-endpoint grid column.

**Counterexample**: Chain vertex at U=0.512, grid column 280 at U=0.512. CDF placed this column because of the curvature peak. segStart=276 (col 276), segEnd=285 (col 285). Column 280 is intermediate. Under P1: grid vertex (j, 280) is dropped from stripBot. Constraint edge [remapped_to_gridIdx_280, cv_above] references a vertex not in the CDT. Constraint is silently dropped. The chain's ridge loses its enforcement at this row.

**Required fix**: Modify the constraint endpoint recovery to handle batch2Remap'd vertices. After P1's boundary-thinning loop, add:

```typescript
// After the botRow/topRow loops, BEFORE constraint endpoint recovery:
// Re-check: if a constraint endpoint was batch2Remap'd to a grid vertex
// that was dropped (intermediate grid vertex), re-insert it as an interior vertex.
for (const [v0, v1] of segConstraints) {
    for (const vIdx of [v0, v1]) {
        if (vIdx >= gridVertexCount) continue; // not a remapped grid vertex
        const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                        stripTop.some(sv => sv.idx === vIdx) ||
                        stripInteriorVerts.some(sv => sv.idx === vIdx);
        if (inStrip) continue;
        // This is a grid vertex that was batch2Remap'd from a chain vertex
        // but dropped by P1 boundary thinning → rescue as interior
        const u = vertices[vIdx * 3];
        const t = vertices[vIdx * 3 + 1];
        const isBot = Math.abs(t - tBot) < 1e-9;
        const promotedT = isBot
            ? tBot + PROMO_EPSILON * tGap
            : tTop - PROMO_EPSILON * tGap;
        stripInteriorVerts.push({ idx: vIdx, u, isChain: false, gridCol: -1, promotedT });
    }
}
```

**Severity**: CRITICAL — without this fix, P1 silently breaks constraint enforcement for coincident chain-grid vertices, which are very likely to exist due to CDF-adaptive placement.

---

### C2 [NOTE]: CDT Handles Sparse Boundary Correctly — V2 Verified

**Generator's claim**: CDT handles a boundary polygon with as few as 4 vertices (2 bot + 2 top).

**Verified**: Reading `cdtTriangulateStrip` (ChainStripTriangulator.ts lines 153-240):

- Minimum check: `if (points.length < 3) return;` — 4 boundary points + interior points ≥ 4 ≥ 3. ✓
- Boundary edges: bot (1 edge for 2 points) + top (1 edge) + left side + right side = 4 edges forming a quadrilateral. ✓
- `cdt2d` handles convex quadrilateral boundaries with interior free points correctly — this is its primary use case. ✓
- Non-convex configurations: with only 2 points per row, both rows are trivially convex (single line segment). The boundary polygon (quad) is convex if the left/right endpoints don't cross — guaranteed by U-sorted construction. ✓

**Verdict**: ACCEPT — no issues found.

---

### C3 [WARNING]: Companion Density Near Boundaries is Adequate but Not Guaranteed

**Generator's assumption**: "The companion cloud provides sufficient point density near boundary endpoints."

**Verified**: Reading `emitUGradedFan` (OWT lines 697-750):

- `SHELL_FRACTIONS = [0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0]` — fraction 1.0 reaches the boundary. ✓
- The boundary U-positions are computed as `unionU[leftCol]` / `unionU[rightCol]` where `leftCol = col - expansion`, `rightCol = col + expansion + 1`. These match `segStart`/`segEnd` for chains centered in their strip. ✓
- Companions at fraction=1.0 are at the boundary's U-position but at intermediate T-positions (not tBot/tTop). So there IS horizontal density near the boundary, but only at interior T-levels. ✓

**Residual risk**: For **multi-chain strips** where the strip extends beyond a single chain's expansion radius (two chains close together merge their strips), the actual segStart might be to the left of chain A's leftCol, and chain A's companions don't reach the combined strip's leftmost boundary. Chain B's companions might not reach the rightmost boundary either.

This is **pre-existing** (not introduced by P1) and affects only multi-chain merged strips, which are uncommon with the current chain-linking parameters.

**Verdict**: ACCEPT — adequate for the typical single-chain-per-strip case. The multi-chain gap is pre-existing and rare.

---

### C4 [WARNING]: T-Junction Risk at Chain Endpoints is Real but Low Severity

**Generator's analysis (Proposal 3)**: T-junctions can occur when adjacent bands have different effective strip coverage on a shared row, specifically when `raw[j-1]` marks columns that `raw[j+2]` doesn't.

**Verified**: The union pass logic (OWT lines 1184-1196):

```typescript
const raw = rawColHasChain[j];
const prev = j > 0 ? rawColHasChain[j - 1] : undefined;
const next = j < numT - 2 ? rawColHasChain[j + 1] : undefined;
for (let c = 0; c < cellsPerRow; c++) {
    if (raw[c] || prev?.[c] || next?.[c]) {
        colHasChain[c] = 1;
    }
}
```

With expansion=4 applied after this union, the difference between adjacent bands' effective arrays is bounded by: | `raw[j-1]` columns not in `raw[j+2]` | — which is only non-zero at chain endpoints.

**Generator's 3B argument is correct**: For chains spanning 20+ rows, the endpoint effect is localized to the first/last 1-2 bands. Expansion=4 provides a 4-column buffer. The worst case creates T-junctions on 0-2 columns per chain endpoint.

**Quantitative assessment**: ~20 chains × 2 endpoints × ~1 column = ~40 potential T-junction vertices. With P1's sparse boundary, each T-junction is a grid vertex geometrically lying on a CDT boundary edge. These create non-manifold conditions but at very low frequency compared to the existing 370 non-manifold edges.

**Verdict**: ACCEPT 3B (no code change + diagnostic counter). The risk is bounded and measurable. If the diagnostic counter is non-zero in practice, 3A provides a known fix path.

---

### C5 [NOTE]: Shadow Vertex Identification is Correct — V5 Verified

**Generator's claim**: Shadow vertices have `isChain: false` and `idx >= gridVertexCount`, so `sv.idx < gridVertexCount` correctly excludes them from the "grid vertex" identification.

**Verified**: Shadow vertex allocation (OWT lines 975-988):

```typescript
let nextShadowIdx = nextDupIdx; // starts after topDup region
```

Where `nextDupIdx` starts at `totalVertexCount = gridVertexCount + allChainVertices.length` and increments per D-Radical duplicate. So:

`nextShadowIdx ≥ totalVertexCount ≥ gridVertexCount` always. ✓

Additionally, the pre-filtering step (OWT lines 906-916) removes shadows that coincide with grid columns (within 1e-6 U), preventing the buildMergedRow dedup from merging a shadow into a grid vertex:

```typescript
const filtered = list.filter(su => {
    const col = bsearchFloor(unionU, su);
    if (col >= 0 && col < numU && Math.abs(unionU[col] - su) < 1e-6) return false;
    if (col + 1 < numU && Math.abs(unionU[col + 1] - su) < 1e-6) return false;
    return true;
});
```

**Verdict**: ACCEPT — shadow identification is sound. No edge case where a shadow satisfies `idx < gridVertexCount`.

---

### C6 [WARNING]: D-Radical Duplication Missing for Shadow Vertices on Shared Rows

**Generator's claim (V6)**: The topRow loop correctly preserves D-Radical behavior.

**Partially verified**: D-Radical duplication for **chain vertices** is preserved — the `topDupMap.get(sv.idx)` path is unchanged. ✓

**However**: Shadow vertices appear in both adjacent bands' CDT strips (shadow at row r appears in band r-1's topRow and band r's botRow) but do NOT have D-Radical duplicates. Under P1, shadows are more prominent on the boundary — they're now one of only 2-4 boundary vertices per row instead of one of ~11. If both bands' CDTs create a boundary edge involving the same shadow vertex index, this creates non-manifold edges at the shadow positions.

This is **pre-existing** (introduced in R21, not by P1), but P1 increases the shadow's boundary significance. The non-manifold contribution is bounded by `totalShadowCount` (~36 in the R21 export log).

**Required fix (deferred)**: Not needed for R22 — this is a pre-existing R21 issue. But the Generator should note it as a known limitation for future D-Radical extension to shadow vertices.

**Verdict**: ACCEPT — pre-existing issue, not introduced by P1. Flag for future fix.

---

### C7 [NOTE]: Metric Predictions are Plausible but Optimistic

**Generator's predictions**: 3D max_aspect < 10M:1 (from 315M:1), avg_aspect < 200:1 (from 1,689:1).

**Analysis**: The 315M:1 max aspect ratio was caused by CDT connecting near-coincident boundary points (shadow at U=0.5123 vs grid at U=0.512, distance ~0.0003). P1 eliminates intermediate grid vertices from the boundary, so these near-coincident pairs can't form boundary edges. The remaining boundary edges are:

1. **Endpoint→shadow**: minimum distance governed by P2 guard (0.001 U) → no slivers
2. **Endpoint→endpoint**: strip width, typically 0.01-0.02 U → no slivers
3. **Shadow→shadow**: governed by SHADOW_DEDUP_U=1e-6 → potential issue at dedup threshold

Other sliver sources persist:
- Interior companion dedup threshold (1e-5) — two companions just above threshold could create thin triangles, but CDT's angle optimization mitigates this
- Chain constraint edges between consecutive rows with near-identical U — creates inherently short edges. Pre-existing, not affected by P1

**Verdict**: The 10x-100x improvement prediction is **plausible** for max_aspect. The < 200:1 avg_aspect is **optimistic** — the boundary-driven slivers are the worst offenders, but non-boundary slivers from constraint edges will persist. Expect avg_aspect in the 200-500 range.

---

### C8 [NOTE]: Proposal 2 Shadow-Endpoint Guard Threshold

**Generator's Proposal 2**: Drop shadows within 0.001 U of strip endpoints.

**Verified**: The threshold is reasonable. At typical strip widths of ~0.01-0.02 U (expansion=4 with grid spacing ~0.002), 0.001 U is ~5-10% of strip width. A shadow within 0.001 U of an endpoint provides negligible boundary subdivision.

One edge case: if a shadow IS the chain's U-position and the endpoint IS a CDF-adaptive column placed near the chain, both are near the feature. Dropping the shadow loses feature alignment at the boundary. But the endpoint is already near the feature (that's why CDF placed it there), so the loss is minimal.

**Verdict**: ACCEPT — threshold is sound.

---

## Accepted Items

1. **P1 core mechanism**: Filtering intermediate grid vertices from CDT strip boundaries by checking `sv.idx < gridVertexCount` and `sv.idx !== endpointIdx` is correct. (C2, C5 verified)
2. **P2 proximity guard**: Threshold of 0.001 U is reasonable. (C8 verified)
3. **P3B (no change)**: Expansion=4 absorbs adjacent-band effective array differences at chain endpoints. (C4 verified)
4. **P4 (non-proposal)**: Correctly identified as non-action. ✓
5. **CDT sparse boundary handling**: cdt2d handles 4-vertex boundary polygons correctly. (C2 verified)
6. **Companion cloud density**: SHELL_FRACTIONS at 1.0 ensures companions reach strip boundaries. (C3 verified)

## Amendments Required

### Amendment A1 (CRITICAL — must fix before implementation)

The batch2Remap coincidence path creates constraint endpoints with `idx < gridVertexCount` that are:
1. Dropped by P1 boundary thinning (intermediate grid vertex)
2. Not recovered by the missing constraint endpoint logic (`vIdx < gridVertexCount → continue`)

**Fix**: Add a post-P1 recovery pass for batch2Remap'd constraint endpoints. After the botRow/topRow strip construction loops and before the existing constraint endpoint recovery:

```typescript
// R22 Amendment A1: Rescue batch2Remap'd constraint endpoints dropped by boundary thinning
for (const [v0, v1] of segConstraints) {
    for (const vIdx of [v0, v1]) {
        if (vIdx >= gridVertexCount) continue; // only grid-remapped vertices need rescue
        const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                        stripTop.some(sv => sv.idx === vIdx) ||
                        stripInteriorVerts.some(sv => sv.idx === vIdx);
        if (inStrip) continue;
        // Grid vertex was batch2Remap'd from a chain vertex but dropped by P1
        const u = vertices[vIdx * 3];
        const t = vertices[vIdx * 3 + 1];
        const isBot = Math.abs(t - tBot) < 1e-9;
        const promotedT = isBot
            ? tBot + PROMO_EPSILON * tGap
            : tTop - PROMO_EPSILON * tGap;
        stripInteriorVerts.push({ idx: vIdx, u, isChain: false, gridCol: -1, promotedT });
    }
}
```

This adds ~15 lines. The `some()` scans are O(n) per endpoint but n is small (2-4 boundary vertices + few interior). Acceptable.

### Amendment A2 (MINOR — recommended)

Add a diagnostic counter for batch2Remap'd rescues to monitor frequency:

```typescript
let batch2RescueCount = 0;
// ... in the rescue loop above:
batch2RescueCount++;
// ... in diagnostics:
if (batch2RescueCount > 0) console.log(`[CDT] R22 batch2Remap rescues: ${batch2RescueCount}`);
```

---

## Open Questions for Generator

1. **Shadow D-Radical**: Should R22 also add D-Radical duplication for shadow vertices? This would fix the pre-existing R21 non-manifold issue at shadow boundaries. Impact: ~36 additional duplicate vertices, ~36 fewer non-manifold edges. Deferred or included?

2. **P2 application**: Should the shadow-endpoint proximity guard also check shadow-to-shadow proximity? Two shadows from different chains could be very close near the strip boundary. The SHADOW_DEDUP_U=1e-6 handles same-row dedup, but cross-row shadow pairs (one from botRow, one from topRow at different T-positions) aren't dedup'd on the boundary.

---

## Implementation Conditions (ACCEPT WITH AMENDMENTS)

The Executioner should implement in this order:

1. **P1 (Boundary Thinning)** — Modify botRow and topRow strip construction loops per Generator's proposed code, with Amendment A1 inserted after.
2. **P2 (Shadow-Endpoint Guard)** — Add after stripBot/stripTop construction, before sort.
3. **Amendment A1 (Batch2Remap Rescue)** — Add after P1's strip construction, before existing constraint endpoint recovery.
4. **Amendment A2 (Diagnostic Counter)** — Add alongside existing CDT diagnostics.
5. **P3B diagnostic counter** — Log mismatched strip ranges on shared rows (count only, no code fix).

### Validation Protocol

After implementation, export at density=8, expansion=4, Petal style. Check:

| Metric | Must Achieve | Target |
|--------|-------------|--------|
| 3D max_aspect | < 50M:1 (10× improvement) | < 10M:1 |
| 3D avg_aspect | < 1,000:1 (improvement) | < 500:1 |
| max_area_ratio | < 1B:1 (30× improvement) | < 1M:1 |
| Non-manifold edges | ≤ 400 (no regression) | < 300 |
| All tests pass | ✓ | ✓ |
| batch2Remap rescue count | Logged, non-zero expected | — |
| P3B mismatch count | Logged | — |

Visual: inspect chain strip triangulation in UV space — should show free-form triangulation without visible row/column grid alignment between the two strip endpoints.

---

## Final Verdict: ACCEPT WITH AMENDMENTS

P1 is the right structural fix. The batch2Remap coincidence bug (C1/Amendment A1) is the only barrier to implementation — it's ~15 lines of additional code. All other aspects verified clean.
