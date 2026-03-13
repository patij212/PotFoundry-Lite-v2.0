# Verifier Round 4 — Final Verdict: 2D Companion Cloud

Date: 2026-03-04

## CONVERGED

All six critiques accepted by Generator. Zero contested points. Design is ready for implementation.

---

## Convergence Record

| ID | Issue | Resolution | Verified |
|----|-------|-----------|----------|
| C1 | Double-inclusion: 2D companions in both rowChainVerts + interiorVerts | Filter `cv.t !== undefined` out of rowChainVerts | ✅ |
| C2 | Dead zone orphaned + catastrophic if re-introduced | WITHDRAWN from Phase 1. Pipeline works without it (PEC L1191-1196 comment confirms) | ✅ |
| C3 | 1D dedup inadequate for 2D clouds | 2D spatial-bucket dedup with integer keys, 3×3 neighborhood | ✅ |
| C4 | buildRings density dead zones (d=5 = d=4) | RING_CONFIG linear scaling, every density step changes output | ✅ |
| C5 | Silent T-fallback masks bugs | Assert + error message, existing try/catch provides sweep recovery | ✅ |
| C6 | Negative-dt companions lost (50%) | Bucket by bsearchFloor(activeTPositions, cv.t), not rowIdx | ✅ |

---

## Implementation Plan for Executioner

### Phase 1: Foundation (Ship First)

Two changes, no dependencies between them:

#### 1.1 Remove pointIdx < 0 filter
**File**: OuterWallTessellator.ts ~L857-858
**Change**: Remove the `if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;` filter from constraint edge processing.
**Guard**: The existing try/catch in cdtTriangulateStrip (CST L232-238) catches CDT failures from crossing constraints → sweep fallback. If removing the filter causes constraint crossings, the worst case is sweep fallback on affected strips (verified 0% fallback rate in Round 3 diagnostic, but guard is there).

#### 1.2 Gradient U-fracs
**File**: OuterWallTessellator.ts ~L402-405
**Change**: Replace uniform COMPANION_FRACS with sqrt-biased fracs:
```typescript
const COMPANION_FRACS: number[] = [];
for (let k = 1; k <= density; k++) {
    const raw = k / (density + 1);
    const biased = raw < 0.5
        ? 0.5 * Math.sqrt(2 * raw)
        : 1 - 0.5 * Math.sqrt(2 * (1 - raw));
    COMPANION_FRACS.push(biased);
}
```
At density=4: [0.2, 0.4, 0.6, 0.8] → [0.224, 0.397, 0.603, 0.776]. Modest bias toward chain vertex.

### Phase 2: 2D Companion Cloud (9 steps, ordered)

Dependencies are strict — steps must be implemented in this order.

#### 2.1 Add `t` field to ChainVertex
**File**: OuterWallTessellator.ts ~L26-39
**Change**: Add optional `t` field:
```typescript
export interface ChainVertex {
    u: number;
    rowIdx: number;
    t?: number;           // NEW: explicit T-position for 2D companions
    vertexIdx: number;
    chainId: number;
    pointIdx: number;
}
```

#### 2.2 Replace 1D companion loop with 2D ring generator
**File**: OuterWallTessellator.ts ~L418-480
**Change**: Replace the left-side/right-side companion placement with concentric ring placement. For each chain vertex, compute `halfGapU`, `halfGapT` from the local cell, then generate companions at ring positions using `buildRings(density, maxR)`.

Key code from Generator proposal (with corrections applied):
- Ring placement: `du = radius * cos(angle)`, `dt = radius * sin(angle)`
- Companion position: `cu = cv.u + du`, `ct = activeTPositions[cv.rowIdx] + dt`
- Bounds check: clamp to `[uLeft+ε, uRight-ε]` in U and `[tBelow+ε, tAbove+ε]` in T
- Seam guard: `cu ∈ [SEAM_EDGE_COMPANION_GUARD, 1 - SEAM_EDGE_COMPANION_GUARD]`
- Each companion gets: `{ u: cu, t: ct, rowIdx: cv.rowIdx, vertexIdx: nextVertexIdx++, chainId: cv.chainId, pointIdx: -1 }`

The `buildRings` function uses RING_CONFIG table:
```typescript
const RING_CONFIG = [
    { radiusFrac: 0.35, minDensity: 1, baseCount: 3, scale: 0.5, offset: 0 },
    { radiusFrac: 0.70, minDensity: 2, baseCount: 3, scale: 0.7, offset: Math.PI / 6 },
    { radiusFrac: 0.90, minDensity: 5, baseCount: 3, scale: 1.0, offset: Math.PI / 3 },
];
```

#### 2.3 2D spatial-bucket dedup
**File**: OuterWallTessellator.ts (companion generation section)
**Change**: Replace U-only `existingUs` set with 2D spatial bucket:
- Bucket key: integer `Math.floor(u / BUCKET_SIZE) * 100000 + Math.floor(t / BUCKET_SIZE)`
- BUCKET_SIZE = COMPANION_DEDUP_THRESHOLD * 10 ≈ 1e-4
- Check 3×3 neighborhood for proximity before adding companion
- No string keys (V8-safe)

#### 2.4 Build interiorByBand map
**File**: OuterWallTessellator.ts (after companion generation, before strip iteration)
**Change**: Build `Map<number, ChainVertex[]>` keyed by row band index:
```typescript
const interiorByBand = new Map<number, ChainVertex[]>();
for (const cv of companionVertices) {
    if (cv.t === undefined) continue;
    const bandIdx = bsearchFloor(activeTPositions, cv.t);
    if (bandIdx < 0 || bandIdx >= numT - 1) continue;
    if (cv.t <= activeTPositions[bandIdx] || cv.t >= activeTPositions[bandIdx + 1]) continue;
    let list = interiorByBand.get(bandIdx);
    if (!list) { list = []; interiorByBand.set(bandIdx, list); }
    list.push(cv);
}
```

#### 2.5 Exclude 2D companions from rowChainVerts (C1 fix)
**File**: OuterWallTessellator.ts ~L513-520
**Change**: Add filter to exclude 2D companions:
```typescript
for (const cv of allChainVertices) {
    if (cv.t !== undefined) continue;  // 2D companions are interior-only
    let list = rowChainVerts.get(cv.rowIdx);
    if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
    list.push(cv);
}
```

#### 2.6 Update vertex buffer T-position
**File**: OuterWallTessellator.ts ~L511
**Change**: One-line change:
```typescript
vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];
```

#### 2.7 Add interiorVerts parameter to triangulateChainStrip
**File**: ChainStripTriangulator.ts ~L96-108
**Change**: Add `interiorVerts: StripVertex[]` parameter:
```typescript
export function triangulateChainStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],      // NEW
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    config: ChainStripConfig,
    stats: ChainStripStats,
): void {
```
Pass through to `cdtTriangulateStrip` (and `sweepTriangulateStrip` — ignore interiors for sweep).

In `cdtTriangulateStrip`, after adding bot and top vertices:
```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = allChainVertices[cvIdx];
    if (!cv || cv.t === undefined) {
        throw new Error(`Interior companion at vertexIdx=${sv.idx} (cvIdx=${cvIdx}) has no explicit T-position`);
    }
    addVertex(sv.idx, sv.u, cv.t);
}
```
Interior vertices are Steiner points — no constraint edges. CDT incorporates them optimally.

Update the call site at OWT ~L878-884 to pass `interiorVerts`:
```typescript
const bandInterior = interiorByBand.get(j) || [];
const interiorVerts: StripVertex[] = [];
for (const cv of bandInterior) {
    if (cv.u < uStripLeft - 1e-9 || cv.u > uStripRight + 1e-9) continue;
    interiorVerts.push({ idx: cv.vertexIdx, u: cv.u, isChain: false, gridCol: -1 });
}
triangulateChainStrip(
    indexBuf, stripBot, stripTop, segConstraints,
    interiorVerts,                        // NEW
    allChainVertices, gridVertexCount,
    activeTPositions[j], activeTPositions[j + 1],
    chainStripConfig, chainStripStats,
);
```

#### 2.8 Continuous buildRings function
**File**: OuterWallTessellator.ts (new function, near companion generation)
**Change**: Implement `buildRings(density, maxRadius)` using RING_CONFIG table with linear scaling. See Generator Round 4 response for full implementation.

#### 2.9 Diagnostic logging
**File**: OuterWallTessellator.ts (end of tessellation)
**Change**: Log companion statistics:
- Total 2D companions generated
- Total 2D companions after dedup
- Total interior companions collected across all strips
- Companion collection rate (collected / generated) — should be ~100%
- Maximum aspect ratio in chain strips (from CDT triangle analysis)

### Validation Checklist
After implementation, verify:
- [ ] Zero 2D companions appear in buildMergedRow output
- [ ] All 2D companions appear exactly once as interiorVerts
- [ ] No companion with negative dt is lost (collected/generated ≈ 100%)
- [ ] Maximum aspect ratio in chain strips < 6:1 at density=4 (vs current 18:1)
- [ ] CDT fallback rate remains 0%
- [ ] Total triangle count within 20% of current
- [ ] Export time within 150% of current

---

## Source Documents

- Generator proposal: `generator-round-4-2d-companion-cloud.md`
- Verifier critique: `verifier-round-4-2d-companion-critique.md`
- Generator response: `generator-round-4-response.md`
- This verdict: `verifier-round-4-final-verdict.md`

## Prior Converged Work (Also Ready for Implementation)

The chain jaggedness fixes from Round 2 are independently converged:
- Final verdict: `verifier-round-2-final-verdict.md`
- Implementation order: A.1 diagnostics → A.2 remove resnap → A.3 momentum signed-median → A.4 tighten radius to 0.02

These can be implemented in parallel with Phase 1 of the 2D companion cloud.
