# Generator Round 24 — Zero-PROMO Boundary Integration: Eliminating CDT Slivers

Date: 2026-03-06

## Problem Statement

The chain strip CDT produces extreme slivers (max 3D aspect 2,422,001:1, 55.6% of 791K triangles exceed 4:1) due to a structural UV/3D mismatch: chain vertices are promoted 20% into the band interior in CDT UV space (`PROMO_EPSILON=0.20`) but evaluated at the exact row boundary (`tRow`) by the GPU. Every triangle connecting a promoted chain vertex to a same-row boundary grid vertex has two vertices at the same 3D height → unfixable zero-height sliver. The 423,754 edge flip rejects in the optimizer prove these are topologically impossible to fix by connectivity changes alone.

R23 attempted to resolve this by storing promoted T in the vertex buffer (so 3D matches CDT). This was **REVERTED** because D-Radical original and duplicate vertices received different promoted T values (`tBot + 0.20*tGap_above` vs `tTop - 0.20*tGap_below`), causing the GPU to evaluate them at different heights for the same logical feature point → visible micro-jagged feature edges. **R23 is a dead end. This proposal does NOT move chain vertex 3D positions.**

## Root Cause Analysis

The sliver mechanism is simple and structural:

```
CDT UV space:                    3D space (GPU evaluates vertices[].t):
tTop ─── grid ────────────       H(tTop) ─── grid ────────────
                                  
 tTop - 0.20*gap ── chain(dup)   H(tRow) ── chain (SAME height as tRow!)
                                  
 tBot + 0.20*gap ── chain(orig)  H(tRow) ── chain (SAME height as tBot!)
                                  
tBot ─── grid ────────────       H(tBot) ─── grid ────────────
```

The CDT at [ChainStripTriangulator.ts](src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L155) places bot vertices at T=tBot and promoted chain vertices at T=tBot+0.20*tGap. It creates triangles connecting them. These triangles have non-zero UV area. But in 3D, both vertices are at height H(tRow) = H(tBot) → the triangle has zero T-separation → astronomical 3D aspect ratio.

The root cause is **not** bad CDT quality — the CDT is doing its job correctly in UV space. The cause is that the UV coordinates fed to CDT don't reflect the actual 3D geometry. We need to make UV match 3D, without moving 3D (R23 dead end).

**The fix**: Make UV match 3D by placing chain vertices ON the boundary (T=tBot or T=tTop) in CDT, where they actually are in 3D. This means `PROMO_EPSILON = 0`.

## Option Analysis

### Option A: Zero-PROMO Boundary Integration — **RECOMMENDED**

**Core Idea**: Set `PROMO_EPSILON = 0`. Chain vertices become boundary vertices (in `stripBot`/`stripTop`), not interior vertices (`stripInteriorVerts`). CDT sees them at T=tBot or T=tTop, exactly matching their 3D position. No slivers.

**Why it works (traced example)**:

Consider chain vertex C at rowIdx=5, u=0.52:
- In band [5,6]: C appears in botRow. Currently pushed to `stripInteriorVerts` with `promotedT = tBot + 0.20*tGap`. **Proposed**: pushed to `stripBot` at T=tBot.
- In band [4,5]: C's D-Radical duplicate appears in topRow. Currently pushed to `stripInteriorVerts` with `promotedT = tTop - 0.20*tGap`. **Proposed**: pushed to `stripTop` at T=tTop.

Both bands now see C at the boundary T-coordinate. GPU evaluates at tRow for both. **UV = 3D. No sliver.**

Triangle geometry (botRow example):
- V1: grid at (u=0.50, T=tBot), 3D at height H(tBot)
- V2: chain C at (u=0.52, T=tBot), 3D at height H(tBot) — **same boundary, different U**
- V3: companion at (u=0.51, T=tBot+0.25*tGap), 3D at height H(tBot+0.25*tGap) — **interior**

3D triangle: base V1-V2 is horizontal (along pot wall circumference, ~0.63mm), height from base to V3 is vertical (~0.058mm). Aspect ≈ 0.63/0.058 ≈ 11:1. **Not a sliver.**

Contrast with current: V2 would be at CDT T=tBot+0.20*tGap but 3D height H(tBot). Triangle V1-V2-V3 has V1 and V2 at the same 3D height → zero-height base → aspect > 100,000:1.

**Risks addressed**:

1. **Collinear boundary vertices**: Chain and grid vertices share the same T=tBot. They differ in U. CDT handles this natively — they're just additional boundary vertices at different U positions along the same edge. The boundary edge sequence includes all of them sorted by U.

2. **Same-row constraint edges**: A chain edge connecting two chain vertices on the same row becomes collinear with the boundary. If intermediate boundary vertices fall between them, `cdt2d` may fail on the through-vertex constraint. **Mitigation**: Pre-filter same-row constraints — they're redundant when both endpoints are boundary vertices (the boundary edge sequence already enforces connectivity). See Change 5 below.

3. **Companion reform**: The T-ring fractions [0.10, 0.15, 0.85, 0.90] were designed to fill the PROMO gap between boundary and promoted chain vertex. Without PROMO, they create unnecessary ultra-thin sub-layers near the boundary (height = 0.10*tGap*H ≈ 0.023mm → 40:1 aspect). **Mitigation**: Redistribute to [0.25, 0.50, 0.75] for even band subdivision. See Change 6 below.

### Option B: 3D-Metric CDT Normalization — ORTHOGONAL, NOT SUFFICIENT

**Idea**: Replace uniform normalization (`scale = max(uRange, tRange)`) with 3D-aware metric scaling (U → arc length, T → physical height).

**Assessment**: This helps overall CDT quality by making UV aspect ratios reflect 3D aspect ratios. But it does **NOT** fix the PROMO mismatch. With PROMO=0.20, the chain vertex is placed at metric height 0.20*physical_tGap above the boundary — but 3D evaluates at the boundary. The sliver still exists (metric CDT just makes it a more accurately measured sliver).

**Verdict**: Valuable as a follow-up improvement to combine with Option A. Not a standalone fix. Could reduce `avg_aspect` by an additional 20-30% on top of Option A's improvement.

### Option C: Post-CDT Sliver Collapse — UNSAFE

**Idea**: After CDT, detect slivers (3D aspect > threshold) and edge-collapse the shortest edge.

**Fatal problem**: The short edge connects a promoted chain vertex to a same-row boundary grid vertex. Collapsing it means either:
- **Merge grid into chain**: All mesh references to the grid vertex now point to the chain vertex. But the grid vertex is shared with the adjacent grid mesh (standard cell triangulation). Removing it creates a T-junction → watertightness break.
- **Merge chain into grid**: The chain vertex loses its identity and feature edge constraints vanish.

**Additional problem**: 3D positions aren't available during OWT (computed by GPU later). Would require a pre-evaluation pass or deferred post-processing.

**Verdict**: Too high risk for watertightness. Rejected.

### Option D: CDT with Collapsed Interior Edges (Generator's Alternative)

**Idea**: Run CDT with PROMO as-is (good UV quality), then identify all edges connecting a promoted chain vertex to a same-row boundary vertex and merge their indices in the index buffer (keeping the chain vertex). Unlike Option C, this doesn't modify the vertex buffer — it only redirects triangle indices.

**Problem**: Same as Option C. The boundary vertex is shared with the grid mesh. Redirecting its index in chain-strip triangles but not in grid triangles creates non-manifold edges (same geometric edge referenced by different vertex index pairs in different triangles).

**Verdict**: Non-manifold creation. Rejected.

## Recommended Approach: Option A — Zero-PROMO Boundary Integration

### Change 1: Set PROMO_EPSILON to 0

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L128)

```typescript
// BEFORE:
const PROMO_EPSILON = 0.20;

// AFTER:
const PROMO_EPSILON = 0;
```

All downstream code that computes `tBot + PROMO_EPSILON * tGap` evaluates to `tBot`. All code computing `tTop - PROMO_EPSILON * tGap` evaluates to `tTop`.

### Change 2: Route chain vertices to boundary, not interior

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1320-L1330) (botRow chain routing)

```typescript
// BEFORE (line ~1322):
if (sv.isChain) {
    stripInteriorVerts.push({ ...sv, promotedT: tBot + PROMO_EPSILON * tGap });
}

// AFTER:
if (sv.isChain) {
    stripBot.push(sv);        // boundary vertex, not interior
    lastKeptBotU = sv.u;      // reset spacing tracker
}
```

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1365-L1375) (topRow chain routing)

```typescript
// BEFORE (line ~1368):
if (sv.isChain) {
    const dupIdx = topDupMap.get(sv.idx);
    stripInteriorVerts.push({ ...sv, idx: dupIdx ?? sv.idx, promotedT: tTop - PROMO_EPSILON * tGap });
}

// AFTER:
if (sv.isChain) {
    const dupIdx = topDupMap.get(sv.idx);
    stripTop.push({ ...sv, idx: dupIdx ?? sv.idx });  // boundary vertex
    lastKeptTopU = sv.u;
}
```

**Impact**: Chain vertices now flow into `stripBot`/`stripTop` alongside grid and shadow vertices. The sort order from `buildMergedRow` is preserved (chain vertices are interleaved at their correct U positions). The boundary coarsening (MAX_BOUNDARY_EDGE_U) does NOT apply to chain vertices — they're kept unconditionally (the `if (sv.isChain)` branch is checked before the grid coarsening logic).

### Change 3: Update rescue code for batch2Remap'd endpoints

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1476-L1496)

With PROMO=0, rescued grid vertices get `promotedT = tBot + 0*tGap = tBot`, which is boundary-collinear. They should go to the boundary, not interior.

```typescript
// BEFORE:
const promotedT = isBot
    ? tBot + PROMO_EPSILON * tGap
    : tTop - PROMO_EPSILON * tGap;
stripInteriorVerts.push({ idx: vIdx, u, isChain: false, gridCol: -1, promotedT });

// AFTER:
if (isBot) {
    stripBot.push({ idx: vIdx, u, isChain: false, gridCol: -1 });
    botModified = true;
} else {
    stripTop.push({ idx: vIdx, u, isChain: false, gridCol: -1 });
    topModified = true;
}
```

`botModified`/`topModified` flags trigger the re-sort at lines ~1531-1532.

### Change 4: Update rescue code for missing chain constraint endpoints

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1517-L1530)

```typescript
// BEFORE:
} else if (cv.rowIdx === j) {
    stripInteriorVerts.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1, promotedT: tBot + PROMO_EPSILON * tGap });
} else if (cv.rowIdx === j + 1) {
    stripInteriorVerts.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1, promotedT: tTop - PROMO_EPSILON * tGap });
}

// AFTER:
} else if (cv.rowIdx === j) {
    stripBot.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
    botModified = true;
} else if (cv.rowIdx === j + 1) {
    stripTop.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
    topModified = true;
}
```

Note: the `cv.t !== undefined` branch (explicit-T companions/subdivision) is unchanged — these are true interior vertices.

### Change 5: Filter same-row constraints

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1415-L1425)

Add a same-row filter after the U-range check. Same-row chain constraints are collinear with the boundary when both endpoints are boundary vertices. The boundary edge sequence already enforces their adjacency.

```typescript
// AFTER U-range check, BEFORE pushing to segConstraints:
// Zero-PROMO: same-row constraints are collinear with boundary.
// The boundary edge sequence already enforces adjacency. Skip.
if (cv0.t === undefined && cv1.t === undefined && cv0.rowIdx === cv1.rowIdx) {
    continue;
}
```

**Why `cv.t === undefined` check**: Only row-boundary chain vertices (no explicit T) are on the boundary. Explicit-T companions remain interior vertices — constraints involving them are valid interior constraints.

### Change 6: Redistribute T-ring companion fractions

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L716-L717)

```typescript
// BEFORE:
const nearChainTFractions = [0.10, 0.15, 0.85, 0.90];

// AFTER:
const nearChainTFractions = [0.25, 0.50, 0.75];
```

**Rationale**: The [0.10, 0.15] fractions were designed to fill the 0→0.20 PROMO gap. Without PROMO, they create 0.10*tGap-thick layers near the boundary (height ≈ 0.023mm, aspect ≈ 40:1 — actively harmful). Even [0.25, 0.50, 0.75] creates layers of 0.25*tGap ≈ 0.058mm, which is adequate. The T-ladder rungs and U-graded fan continue providing additional quality.

### Change 7: Simplify getUV for crossing detection

**File**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1543-L1556)

With PROMO=0, the vertex buffer stores the correct T for all vertex types. The `getUV` function can simply read from the buffer:

```typescript
// BEFORE (complex three-way inconsistent):
const getUV = (vIdx: number): [number, number] => {
    return [vertices[vIdx * 3], vertices[vIdx * 3 + 1]];
};

// AFTER (same code, but now CONSISTENT — vertex buffer T matches CDT placement T):
const getUV = (vIdx: number): [number, number] => {
    return [vertices[vIdx * 3], vertices[vIdx * 3 + 1]];
};
```

This is a no-change in code but a **correctness improvement**: previously, `getUV` returned tRow for chain vertices while CDT placed them at promotedT. Crossing detection tested at the wrong positions. With PROMO=0, both agree on tRow.

## Impact Analysis

### Impact on Companion System

| Mechanism | Before (PROMO=0.20) | After (PROMO=0) | Notes |
|-----------|---------------------|-----------------|-------|
| T-ring fractions | [0.10, 0.15, 0.85, 0.90] | [0.25, 0.50, 0.75] | Even distribution |
| T-ladder rungs | Unchanged | Unchanged | `nTLevels` fractions auto-center in band |
| U-graded fan | Unchanged | Unchanged | U-based, T-independent |
| Companion vertex T | Explicit `cv.t` values | Unchanged | True interior points |
| Companion count | ~353K | ~265K est. | Fewer T-ring points (3 fractions vs 4) |
| interiorByBand bucketing | Unchanged | Unchanged | Uses `cv.t`, not PROMO |

### Impact on D-Radical

| Aspect | Before | After | Notes |
|--------|--------|-------|-------|
| Duplicate creation | At `topDupMap.set(cv.vertexIdx, dupIdx)` | Unchanged | Still needed for non-manifold prevention |
| Duplicate vertex T | `tRow` (from vertex buffer copy) | `tRow` (same) | No change — never stored promotedT |
| Duplicate routing | To `stripInteriorVerts` with promotedT | To `stripTop` without promotedT | Change 2 |
| Constraint remap | `topDupMap` lookup for topRow chains | Unchanged | Remap still needed |
| D-Radical/original position match | Both at tRow in 3D | Both at tRow in 3D | No jagging (unlike R23) |

### Impact on Constraint Edges

| Constraint Type | Before | After | Notes |
|----------------|--------|-------|-------|
| Cross-row (j→j+1) | Interior diagonal (promoted endpoints) | Boundary-to-boundary diagonal | Valid CDT constraint |
| Same-row (j→j) | Interior collinear | **Filtered out** (Change 5) | Boundary sequence enforces |
| Explicit-T to boundary | Interior to interior (promoted) | Interior to boundary | Valid CDT constraint |
| Explicit-T to explicit-T | Interior to interior | Unchanged | Both have `cv.t` |

### Impact on Edge Flips

| Metric | Before (R22.2) | After (predicted) | Notes |
|--------|---------------|-------------------|-------|
| aspectRejects | 423,754 | ~0 | No more unfixable slivers |
| Phase A flips | Modest | Increased | More flippable edges (slivers prevented flipping) |
| Phase B valence | Modest | Similar | Vertex connectivity unchanged |
| Phase C short-diag | Active | Active | Still useful for tie-breaking |

### Edge Cases

1. **Seam (col 684)**: SEAM_GUARD is U-based (line 120, `const SEAM_GUARD = 0.3`). PROMO=0 changes T only. No interaction.

2. **batch2Remap**: When `buildMergedRow` merges a chain vertex with a coincident grid vertex (same U ± 1e-6), the grid index replaces the chain index. The grid vertex is already a boundary vertex. With PROMO=0, no change — the batch2Remap'd vertex stays in the boundary as it already was.

3. **Multi-chain bands**: Multiple chain vertices from different chains on the same row boundary. All become boundary vertices, sorted by U in `stripBot`/`stripTop`. Their cross-row constraint edges are valid interior diagonals. No interaction between them.

4. **Empty bands**: Bands with no chain vertices use standard cell triangulation (quadMap). Unchanged.

5. **First/last row edge cases**: Chain at rowIdx=0 only appears as botRow in band [0,1]. `rowIdx+1=1 < numT` → correct. Chain at rowIdx=numT-1: only appears as topRow in band [numT-2, numT-1] via D-Radical duplicate. Original vertex (if it existed in a non-existent band [numT-1, numT]) stores fallback tRow — unused. Safe.

6. **Boundary coarsening interaction**: The `MAX_BOUNDARY_EDGE_U` spacing check (line 1333) rejects intermediate **grid** vertices to thin the boundary. Chain vertices bypass this check (the `if (sv.isChain)` branch executes first). With PROMO=0, chain vertices in `stripBot`/`stripTop` reset `lastKeptBotU`/`lastKeptTopU`, ensuring grid vertices near chains are subject to correct spacing from the chain vertex's U, not from a distant kept grid vertex.

## Expected Metrics

### Mathematical Prediction

**Before** (R22.2): Chain-to-boundary triangles have zero T-separation in 3D → aspect = longest_edge / 0 → ∞ (clamped at 1e6 by code). 55.6% of 791K triangles.

**After**: No zero-T-separation triangles exist. Worst case is a full-band triangle:
- Base: MAX_BOUNDARY_EDGE_U = 2.0/numU ≈ 0.0029 U → 3D ≈ 0.0029 × 2πR ≈ 0.91mm
- Height: full band tGap → 3D ≈ tGap × H ≈ 0.0023 × 100 ≈ 0.23mm
- Aspect: 0.91/0.23 ≈ 4:1

With companion sub-layers (3 levels at [0.25, 0.50, 0.75]):
- Thinnest sub-layer: 0.25 × 0.23 = 0.058mm
- Worst sub-layer aspect: 0.91/0.058 ≈ 16:1

| Metric | R22.2 Baseline | Predicted After | Improvement |
|--------|---------------|-----------------|-------------|
| maxAspect3D | 2,422,001:1 | ~50-100:1 | ~24,000× |
| avgAspect3D | 64.8 | ~5-10 | ~7-13× |
| violations(>4:1) | 55.6% (439K) | ~15-20% | ~3× |
| edge flip aspectRejects | 423,754 | ~0 | ~∞ |
| R2violations | 834 | ~200 | ~4× (fewer boundary-chain triangles) |
| non-manifold | 433 | ≤433 | No worse |

**Why violations won't reach 0%**: The inherent band geometry (0.23mm tall × 0.91mm wide) creates ~4:1 aspect for full-band triangles. Companion sub-layers create higher aspect ratios in the thinnest layers. This is geometric reality, not a bug.

### Why violations won't exceed 25%

With PROMO=0, only sub-layer boundary triangles exceed 4:1. These are a fraction of all triangles:
- Full-band triangles (bot→top): ~4:1, borderline
- Mid-band triangles (companion→companion): ~4-8:1, some exceed
- Grid-only triangles (no chains): unchanged from baseline

The 55.6% violation rate was dominated by PROMO slivers. Removing them eliminates the majority.

## Test Impact

### Assertions That Will Change

1. **ChainStripTriangulator stats**: `maxAspectUV` should decrease significantly. The UV aspect ratio with PROMO=0 is bounded by band geometry (~10:1 in normalized CDT space), not by PROMO gap slivers.

2. **`computeChainStrip3DQuality`**: `maxAspect` should drop from ~2.4M to <100. `avgAspect` from ~65 to <10. `aspectOver4` from ~440K to ~120K.

3. **Edge flip tests**: `aspectRejects` should drop to near-zero. Tests asserting `aspectRejects > 0` (if any exist) will need updating.

4. **R2violations**: Should decrease (fewer boundary-chain mixed triangles). Tests asserting specific R2 counts may need relaxation.

5. **CDT strip counts**: `sweepFallbacks` may change slightly (same-row constraint filter prevents some CDT failures, but fewer constraints overall → fewer conflicts → fewer fallbacks).

6. **Companion count diagnostics**: T-Ladder companion count will decrease (~25% fewer T-ring companions due to 3 vs 4 fractions). Tests asserting minimum companion counts may need adjustment.

### No Test Changes Expected

- Constraint enforcement rate (`enforced`/`missing` counts) — unchanged mechanism
- D-Radical duplicate creation — unchanged
- Seam handling — unchanged
- Grid mesh topology — unchanged
- Watertight stitching — unchanged (boundary vertices are the same; only routing of chain vertices changed from interior to boundary)

## Open Questions (for Verifier)

1. **Does `cdt2d` handle boundary constraint diagonals correctly?** A constraint from (u_a, tBot) to (u_b, tTop) crosses the interior of the polygon. With `exterior: true`, all triangles are generated and filtered by centroid bounds. Does `cdt2d` reliably enforce interior constraints that connect two different boundary edges?

2. **Same-row constraint filtering**: I filter constraints where both endpoints are row-boundary vertices on the same row (`cv.t === undefined && cv0.rowIdx === cv1.rowIdx`). Does any downstream code depend on same-row chain constraints being present in the CDT (e.g., feature edge graph construction)?

3. **Companion fraction sensitivity**: Changing from [0.10, 0.15, 0.85, 0.90] to [0.25, 0.50, 0.75] reduces companion count and changes their distribution. Are there tests or quality metrics that depend on the specific near-boundary companion positions?

4. **T-ring budget**: `MAX_TRING_PER_BAND = 24` was sized for 4 fractions × up to 6 shells. With 3 fractions, the budget can be reduced to 18. Should we?

5. **Boundary coarsening interaction**: When a chain vertex is added to `stripBot`/`stripTop` and resets `lastKeptBotU`/`lastKeptTopU`, the next grid vertex is measured relative to the chain vertex's U. If the chain vertex is very close to a grid vertex that would otherwise be dropped, the grid vertex might be KEPT (chain U resets the spacing). Is this beneficial (more vertices near features) or harmful (denser boundary near chains)?

## Summary

**One change**: `PROMO_EPSILON = 0.20 → 0`.
**Six downstream adjustments**: boundary routing (×2), rescue routing (×2), same-row constraint filter, companion fraction reform.
**Root cause eliminated**: UV/3D mismatch that caused 55.6% sliver triangles.
**Feature edges preserved**: Chain vertex 3D positions stay at exact tRow — no jagging.
**Watertight**: Boundary vertex set unchanged; only routing changes (interior → boundary).
**D-Radical safe**: Both original and duplicate at tRow; no promoted T mismatch.
**Companion system**: Simplified (no gap-filling needed), redistributed for even band coverage.

The proposal is conservative in mechanism (only changes where chain vertices appear in stripBot/stripTop vs stripInteriorVerts) and aggressive in impact (eliminates the structural cause of millions of sliver triangles).
