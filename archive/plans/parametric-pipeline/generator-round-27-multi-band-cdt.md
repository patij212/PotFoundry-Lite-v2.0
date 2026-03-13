# Generator Round 27 — Multi-Band CDT + Heuristic T-Inflation

Date: 2026-03-06

## Problem Statement

Two distinct but interacting problems limit CDT triangle quality in the parametric export pipeline:

1. **Within-band aspect ratio distortion**: The CDT's uniform normalization (`scale = max(uRange, tRange)`) ignores the physical metric of the surface of revolution. The Delaunay criterion optimizes in a distorted space, producing unnecessary slivers. With expansion=2 the CDT domain is ~3.2:1 (U:T); the physical metric ratio (circumference vs height) introduces another factor that the CDT cannot see.

2. **Horizontal segmentation artifacts**: Every row boundary creates a hard horizontal constraint edge. Triangle patterns reset at every band, producing visible horizontal lines in the mesh. The CDT has zero freedom to create triangles that span row boundaries.

Problem (1) affects triangle *shape*. Problem (2) affects triangle *topology*. Both need solving.

## Root Cause Analysis

### Problem 1: Metric-Unaware Normalization

The CDT at [ChainStripTriangulator.ts:170-173](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L170-L173) normalizes with a single uniform scale:

```typescript
const scale = Math.max(uRange, tRange);
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```

On a surface of revolution with radius R(t) at height t, one unit of U spans 2πR mm of circumference while one unit of T spans ~H mm of height. For a typical pot (R≈40mm, H≈80mm), `metricRatio = 2πR/H ≈ 3.14`. The CDT doesn't know this — it treats U and T as metrically equivalent.

The Verifier (V2, V4, V5) proved that:
- Full metric correction (`metricRatio` inflation) goes the wrong direction
- True 3D-isotropic normalization makes the domain 18:1 — worse for CDT quality
- `√metricRatio` ≈ 1.77 provides a geometric-mean compromise that inflates T moderately without overcorrecting

### Problem 2: Single-Band Architecture

The band loop at [OWT:1187-1633](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1187) iterates `for j = 0..numT-2`, and each CDT segment covers exactly rows j → j+1. Row j+1 becomes a hard **top boundary** for band j, then a hard **bottom boundary** for band j+1. The CDT must create constraint edges along every row boundary, forcing horizontal edges at every T-level.

The key insight: if we merge two adjacent bands into one CDT segment, the intermediate row's vertices become **interior points** (free to participate in any triangle) rather than boundary constraints. This eliminates the horizontal line at that row. With merge factor 2, we eliminate 50% of horizontal boundaries.

---

## Proposals

### Proposal A: Heuristic T-Inflation (Conservative)

**Idea**: Apply a √metricRatio correction to T-coordinates in CDT space, making the CDT domain more square and giving the Delaunay criterion a physics-informed geometry to work in.

**Mechanism**: Compute the analytic metric ratio from `PotGeometryParams` + H, then inflate T-coordinates by `√metricRatio` before feeding to cdt2d. The CDT sees a less elongated domain and distributes triangles more evenly.

**Mathematical basis**: For pot radius R(t) = Rb + (Rt - Rb) · t^expn at the band midpoint, the circumferential arc per unit U is 2πR, while pitch per unit T is H. The metric ratio is 2πR/H. The geometric mean correction √(metricRatio) splits the difference between no inflation and full (incorrect) inflation, keeping the CDT domain aspect moderate without overcorrecting.

For a typical pot (R=40, H=80, expansion=2): `metricRatio ≈ 3.14`, `tCorrection ≈ 1.77`, CDT normalized T goes from 0.31 to 0.55 → CDT domain aspect goes from 3.2:1 to 1.8:1.

**Files affected + specific changes**:

#### Change 1: Add `H` to `PotGeometryParams`

File: [OuterWallTessellator.ts:87-95](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L87-L95)

```typescript
// BEFORE:
export interface PotGeometryParams {
    Rb: number;
    Rt: number;
    expn: number;
}

// AFTER:
export interface PotGeometryParams {
    Rb: number;
    Rt: number;
    expn: number;
    /** Total pot height (mm). Used for metric-aware CDT normalization. */
    H: number;
}
```

#### Change 2: Pass `H` from PEC

File: [ParametricExportComputer.ts:1322](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1322)

```typescript
// BEFORE:
{ Rb: dimensions.Rb, Rt: dimensions.Rt, expn: dimensions.expn },

// AFTER:
{ Rb: dimensions.Rb, Rt: dimensions.Rt, expn: dimensions.expn, H: dimensions.H },
```

#### Change 3: Thread `potGeometry` to `triangulateChainStrip` and `cdtTriangulateStrip`

File: [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts)

Add `potGeometry?: PotGeometryParams` as the last parameter in both signatures:

```typescript
// triangulateChainStrip (line ~115):
export function triangulateChainStrip(
    buf: number[], bot: StripVertex[], top: StripVertex[],
    constraints: Array<[number, number]>, interiorVerts: StripVertex[],
    chainVerts: ChainVertex[], gridVCount: number,
    tBot: number, tTop: number,
    config: ChainStripConfig, stats: ChainStripStats,
    potGeometry?: PotGeometryParams,  // NEW
): void { ... }

// cdtTriangulateStrip (line ~145):
function cdtTriangulateStrip(
    buf: number[], bot: StripVertex[], top: StripVertex[],
    constraints: Array<[number, number]>, interiorVerts: StripVertex[],
    chainVerts: ChainVertex[], gridVCount: number,
    tBot: number, tTop: number,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,  // NEW
): void { ... }
```

Thread from the switch statement in `triangulateChainStrip`:

```typescript
case 'cdt':
    cdtTriangulateStrip(buf, bot, top, constraints, interiorVerts,
        chainVerts, gridVCount, tBot, tTop, stats, potGeometry);
    break;
```

#### Change 4: Pass `potGeometry` from OWT call site

File: [OuterWallTessellator.ts:1621](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1621)

```typescript
// BEFORE:
triangulateChainStrip(
    indexBuf, stripBot, stripTop, segConstraints,
    stripInteriorVerts,
    allChainVertices, gridVertexCount,
    activeTPositions[j], activeTPositions[j + 1],
    chainStripConfig, chainStripStats,
);

// AFTER:
triangulateChainStrip(
    indexBuf, stripBot, stripTop, segConstraints,
    stripInteriorVerts,
    allChainVertices, gridVertexCount,
    activeTPositions[j], activeTPositions[j + 1],
    chainStripConfig, chainStripStats,
    potGeometry,
);
```

#### Change 5: Compute and apply T-correction in `cdtTriangulateStrip`

File: [ChainStripTriangulator.ts:168-180](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L168-L180), inside `cdtTriangulateStrip`, after `scale` computation

```typescript
// Compute metric-aware T-correction factor
let tCorrection = 1.0;
if (potGeometry && potGeometry.H > 0) {
    const meanT = (tBot + tTop) / 2;
    const R = potGeometry.Rb +
        (potGeometry.Rt - potGeometry.Rb) * Math.pow(meanT, potGeometry.expn);
    const metricRatio = (2 * Math.PI * R) / potGeometry.H;
    tCorrection = Math.sqrt(metricRatio);
}

// Modify addVertex to apply T-correction:
const addVertex = (idx: number, u: number, t: number): number => {
    const existing = globalToLocal.get(idx);
    if (existing !== undefined) return existing;
    const local = points.length;
    globalToLocal.set(idx, local);
    localToGlobal.push(idx);
    points.push([(u - uMin) / scale, (t - tBase) / scale * tCorrection]);
    return local;
};
```

#### Change 6: Adjust centroid bounds filter

File: [ChainStripTriangulator.ts:280-283](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L280-L283)

```typescript
// BEFORE:
const tBoundsMax = 1.01;

// AFTER:
const tBoundsMax = Math.max(1.01, tRange / scale * tCorrection + 0.01);
```

This handles edge cases where wide, short pots produce `metricRatio > 5.8`, pushing inflated T-values above 1.0. For typical pots, `tRange/scale * tCorrection ≈ 0.55`, well under 1.01 — no change.

**Trade-offs**:
- (+) Domain aspect improves from 3.2:1 to 1.8:1 (with e=2)
- (+) Minimal code change (~15 lines of computation + plumbing)
- (+) Graceful fallback: if `potGeometry` absent, `tCorrection=1.0` → no change
- (-) Diagnostic quality metrics (minAngleUV, maxAspectUV) now measure CDT-metric-space, not raw UV-space. Calibrated thresholds in tests may need update.
- (-) Empirical — the √metricRatio factor is a heuristic, not mathematically optimal

**Assumptions (for Verifier)**:
1. `dimensions.H` at PEC line 491 is the total pot height in mm, consistent with the H in R(t) = Rb + (Rt-Rb)·t^expn where t∈[0,1]
2. `Math.pow(meanT, expn)` matches the profile curve used by the GPU shader (same exponent semantics)
3. The quality metrics at CST lines 330-358 are diagnostic-only and not used for algorithmic decisions
4. The sweep fallback path (CST line 270) is unaffected because it doesn't use the `points[]` array
5. `tCorrection` does not need to be applied to constraint edge coordinates because constraint edges reference the same local indices (which already have corrected positions)

---

### Proposal B: Multi-Band CDT (Moderate)

**Idea**: Merge two adjacent single-band CDT segments into one double-height CDT segment. The intermediate row becomes interior vertices rather than boundary constraints, eliminating the horizontal segmentation line at that row.

**Mechanism**: Instead of iterating bands individually (j, j+1), iterate in pairs (j, j+2) with a configurable merge factor. The bottom row (j) and top row (j+2) become CDT boundary constraints; the intermediate row (j+1) vertices become free interior points. Chain constraints from both bands are combined. Companions from both bands are pooled.

**Mathematical basis**: A 2-band CDT doubles the T-range. With expansion=2, the aspect ratio improves from 3.2:1 to 1.6:1 — the CDT domain becomes naturally more square, which is independently beneficial. CDT is O(n log n), so doubling vertices per segment costs ~2× per segment but we call CDT half as many times → roughly neutral total cost.

#### The Modified Loop Structure

Current structure (simplified):
```
for j = 0 to numT-2:
    botRow = buildMergedRow(j)
    topRow = buildMergedRow(j+1)
    bandEdges = rowBandEdges.get(j)
    // ... collect strip segments, call triangulateChainStrip(j, j+1)
```

Proposed structure:
```
const mergeFactor = chainStripConfig.bandMergeFactor ?? 2;  // NEW config field
let j = 0;
while (j < numT - 1) {
    const bandsToMerge = Math.min(mergeFactor, numT - 1 - j);
    const jTop = j + bandsToMerge;  // top row of merged segment

    botRow = buildMergedRow(j);                // absolute bottom boundary
    topRow = buildMergedRow(jTop);             // absolute top boundary
    
    // Collect intermediate rows as interior vertex sources
    const intermediateRows: { row: number, verts: StripVertex[] }[] = [];
    for (let m = j + 1; m < jTop; m++) {
        intermediateRows.push({ row: m, verts: buildMergedRow(m) });
    }

    // Merge constraint edges from ALL bands in range [j, jTop)
    const mergedConstraintEdges: Array<[number, number]> = [];
    for (let b = j; b < jTop; b++) {
        const bandEdges = rowBandEdges.get(b);
        if (bandEdges) {
            for (const [v0, v1] of bandEdges) {
                // ... same seam filtering as current
                mergedConstraintEdges.push([v0, v1]);
            }
        }
    }

    // Merge colHasChain across all bands in range
    colHasChain.fill(0);
    for (let b = j; b < jTop; b++) {
        const raw = rawColHasChain[b];
        const prev = b > 0 ? rawColHasChain[b - 1] : undefined;
        const next = b < numT - 2 ? rawColHasChain[b + 1] : undefined;
        for (let c = 0; c < cellsPerRow; c++) {
            if (raw[c] || prev?.[c] || next?.[c]) colHasChain[c] = 1;
        }
    }

    // ... strip segment detection (contiguous colHasChain runs)
    // ... for each chain-strip segment:

    //   botRow vertices  → stripBot (boundary)
    //   topRow vertices  → stripTop (boundary)
    //   For each intermediate row m ∈ (j, jTop):
    //     Row m grid vertices within segment → stripInteriorVerts
    //     (with promotedT = activeTPositions[m])
    //   Companions from ALL bands [j, jTop) → stripInteriorVerts
    //   Constraints from ALL bands [j, jTop) → segConstraints

    //   tBot = activeTPositions[j]
    //   tTop = activeTPositions[jTop]

    //   call triangulateChainStrip(... tBot, tTop ...)

    j = jTop;  // advance by merge factor
}
```

#### Addressing the 8 Challenges

**Challenge 1: Strip segment alignment across bands**

Chain-strip segments (contiguous `colHasChain[]` runs) may differ between bands. Solution: **union the `colHasChain` arrays across all merged bands** before detecting segments. This is already partially done — the current code unions j-1, j, j+1 at [OWT:1195-1201](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1195-L1201). For multi-band, extend the union to cover the full merged range:

```typescript
for (let b = Math.max(0, j); b < Math.min(numT - 1, jTop); b++) {
    const raw = rawColHasChain[b];
    for (let c = 0; c < cellsPerRow; c++) {
        if (raw[c]) colHasChain[c] = 1;
    }
}
// Then apply expansion to the unioned mask
```

The outer-band neighbors (j-1, jTop) should also participate in the union to maintain compatibility with how the current single-band code uses prev/next.

**Challenge 2: Intermediate row as interior vertices**

Row j+1 grid vertices within the strip segment must be added to `stripInteriorVerts` with explicit T-positions. They MUST NOT appear as boundary constraint edges.

```typescript
for (const midRow of intermediateRows) {
    const midRowVerts = midRow.verts;
    for (const sv of midRowVerts) {
        if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
            stripInteriorVerts.push({
                idx: sv.idx,
                u: sv.u,
                isChain: sv.isChain,
                gridCol: sv.gridCol,
                promotedT: activeTPositions[midRow.row],
            });
        }
    }
}
```

The `StripVertex` interface already has `promotedT?: number` (used for companion vertices). Interior grid vertices use the same mechanism.

**Critical subtlety**: In `cdtTriangulateStrip`, interior vertices with `promotedT` are already handled at [CST:192-199](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L192-L199):

```typescript
for (const sv of interiorVerts) {
    if (sv.promotedT !== undefined) {
        addVertex(sv.idx, sv.u, sv.promotedT);
    } else { ... }
}
```

No changes needed inside `cdtTriangulateStrip` for this — the intermediate row vertices will be handled automatically by the existing `promotedT` path.

**Challenge 3: Chain constraint edge merging**

Currently `bandConstraintEdges` is rebuilt for each band j from `rowBandEdges.get(j)`. For multi-band, collect edges from all bands in [j, jTop):

```typescript
const mergedConstraintEdges: Array<[number, number]> = [];
for (let b = j; b < jTop; b++) {
    const bandEdges = rowBandEdges.get(b);
    if (bandEdges) {
        for (const [v0, v1] of bandEdges) {
            const cv0 = allChainVertices[v0 - gridVertexCount];
            const cv1 = allChainVertices[v1 - gridVertexCount];
            if (!cv0 || !cv1) continue;
            if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
            mergedConstraintEdges.push([v0, v1]);
        }
    }
}
```

Chain edges that cross the intermediate row (a vertex at row j, connected to a vertex at row j+2 via an interpolated point at row j+1) are already decomposed into per-band edges by the interpolation pass at [OWT:460-530](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L460). Each half-edge lands in the correct `rowBandEdges` bucket. The multi-band merge recombines them — this is correct because the intermediate row is no longer a boundary.

**Challenge 4: Companion routing**

`interiorByBand` maps band index → companion vertices. For multi-band, collect from all bands:

```typescript
for (let b = j; b < jTop; b++) {
    const bandInterior = interiorByBand.get(b) || [];
    for (const icv of bandInterior) {
        if (icv.u < uStripLeft - 1e-9 || icv.u > uStripRight + 1e-9) continue;
        stripInteriorVerts.push({ idx: icv.vertexIdx, u: icv.u, isChain: false, gridCol: -1 });
    }
}
```

Simple replacement — the current single-line `interiorByBand.get(j)` at [OWT:1477](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1477) becomes a loop over merged bands.

**Challenge 5: CDT performance**

2-band segments have ~2× vertices. CDT (cdt2d) is O(n log n). With merge factor 2:
- Individual CDT: 2× vertices → ~2.2× time per call
- Total CDT calls: halved → ~2.2/2 = 1.1× total time
- Net: roughly neutral. Possibly faster due to reduced per-call overhead.

For merge factor 4: 4× vertices → ~4.6× per call, calls quartered → ~1.15× total. Still acceptable.

**Challenge 6: Odd band count**

When `(numT - 1)` is not divisible by `mergeFactor`, the last group contains fewer bands. The `Math.min(mergeFactor, numT - 1 - j)` in the loop handles this: the final iteration processes whatever remains as a smaller (possibly single-band) CDT. No special casing needed.

**Challenge 7: `topDupMap` deduplication**

Current purpose: Chain vertices at row boundaries get duplicate indices so band j uses one index and band j+1 uses another — preventing non-manifold edges.

With multi-band merge factor 2:
- Row j (bottom boundary): Uses original chain vertex index. No duplication needed (same as current).
- Row j+1 (INTERIOR): Is **not** a boundary. Chain vertices here should use their original index, not duplicates. The `topDupMap` lookup at [OWT:1369](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1369) should be **skipped** for intermediate rows.
- Row j+2 (top boundary): Uses `topDupMap` duplicates (same as current single-band top row).

Implementation: When building `stripTop` for the top boundary (row jTop), apply `topDupMap` as currently done. When collecting intermediate row vertices for `stripInteriorVerts`, use the original vertex index — do NOT apply `topDupMap`.

The constraint edge `topDupMap` remapping at [OWT:1454-1470](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1454-L1470) needs adjustment: only remap constraint endpoints that reference the top boundary row (jTop), not intermediate rows. Currently it checks `cvObj.rowIdx === j + 1` — for multi-band, change to `cvObj.rowIdx === jTop`.

**Challenge 8: CDT domain aspect ratio**

With 2-band merge: T-range doubles → aspect ratio halves. For expansion=2: 3.2:1 → 1.6:1. Combined with T-inflation (Proposal A): 1.6:1 · (1/1.77) ≈ 0.9:1 — nearly square! This is the best CDT domain shape achievable without adding vertices.

**Trade-offs**:
- (+) Eliminates 50% of horizontal boundary lines (merge=2)
- (+) Naturally improves CDT aspect ratio (doubles T-range)
- (+) Synergizes with T-inflation for near-square domains
- (+) Roughly neutral performance
- (-) Moderate code complexity: loop restructuring, intermediate row handling
- (-) Standard-cell (non-chain) columns between merged bands still get quad triangulation per-band — the multi-band merge only applies to chain-strip segments
- (-) More vertices per CDT → higher chance of hitting cdt2d edge cases

**Assumptions (for Verifier)**:
1. `buildMergedRow(m)` can be called for any row m in [0, numT-1] independently — no side effects or ordering dependencies
2. `rowBandEdges.get(b)` correctly returns all chain edges that belong to band b (edges with both endpoints in [activeTPositions[b], activeTPositions[b+1]])
3. The `batch2Remap` at [OWT:1438-1449](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1438-L1449) is per-row, not per-band — so merged bands can still use it correctly
4. The P5 crossing-constraint removal at [OWT:1537-1615](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1537-L1615) works with doubled constraint sets (the O(n²) scan remains acceptable for typical constraint counts)
5. Degenerate cases (all-chain rows, micro-row insertions) don't create pathological multi-band segments
6. The `quadMap` tracking at [OWT:1250](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1250) (used for post-CDT quad patching) still works when bands are merged — chain-strip cells from merged bands share a single CDT rather than have individual quadMap slots
7. Standard-cell (non-chain) columns in intermediate rows still need quad triangulation. The multi-band merge ONLY affects chain-strip segments. Non-chain cells in band j and band j+1 are still triangulated individually.

#### Key architectural question: How do non-chain cells work in a multi-band loop?

This is **the hardest design problem** in Proposal B. Currently, the inner while-loop at [OWT:1232](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1232) processes a single band's cells left-to-right. Non-chain cells get simple quad triangulation (2 triangles); chain cells get CDT. The loop processes cell columns for exactly one band (j, j+1).

With multi-band, chain-strip segments cover rows j → jTop. But non-chain cells in the same column range still need per-band quad triangulation. This means:

**Option B1 (Separate passes)**: Run the non-chain quad triangulation per-band (unchanged), then run the chain-strip CDT for merged bands. This requires two passes: first pass emits quads for non-chain cells in each band, second pass emits CDT triangles for chain-strip segments spanning merged bands.

**Option B2 (Interleaved with band grouping)**: For each merged band group [j, jTop), iterate cells left-to-right. Non-chain cells: emit quads for each sub-band (j→j+1, j+1→j+2) individually. Chain-strip cells: accumulate for the merged CDT.

I recommend **Option B2** because it maintains the existing left-to-right scan and minimizes structural change. Pseudo-code:

```typescript
let j = 0;
while (j < numT - 1) {
    const bandsToMerge = Math.min(mergeFactor, numT - 1 - j);
    const jTop = j + bandsToMerge;

    // Compute unified colHasChain for merged range
    // ... (as described above)

    // Build intermediate rows
    const midRows = [];
    for (let m = j + 1; m < jTop; m++) midRows.push(buildMergedRow(m));

    let i = 0;
    while (i < cellsPerRow) {
        if (!colHasChain[i]) {
            // Non-chain cell: emit quads for EACH sub-band individually
            for (let b = j; b < jTop; b++) {
                // Standard 2-triangle quad for band b→b+1, column i
                const bl = b * numU + i;
                const br = b * numU + (i + 1);
                const tl = (b + 1) * numU + i;
                const tr = (b + 1) * numU + (i + 1);
                // ... same winding logic as current
            }
            i++;
        } else {
            // Chain-strip segment: find contiguous run, merge across all bands
            const segStart = i;
            while (i < cellsPerRow && colHasChain[i]) { /* ... */ i++; }
            const segEnd = i;

            // Build stripBot from row j, stripTop from row jTop
            // Build stripInterior from intermediate rows + companions
            // Merge constraints from all bands
            // Call triangulateChainStrip(tBot=activeTPositions[j], tTop=activeTPositions[jTop])
        }
    }
    j = jTop;
}
```

This cleanly separates the two cell types: non-chain cells use simple per-band quads (unchanged behavior), chain-strip cells use merged multi-band CDT.

---

### Proposal C: Combined A+B Interaction

**When both proposals are active**, the CDT domain for a 2-band segment with expansion=2 and T-inflation has:

- U-range: ~0.0074 (same as single-band)
- T-range: ~0.0046 (doubled from single-band)
- scale = max(0.0074, 0.0046) = 0.0074
- Normalized T = 0.0046/0.0074 = 0.62
- After T-inflation (×1.77): 0.62 × 1.77 ≈ 1.10
- CDT domain aspect: 1.0 : 1.10 ≈ 0.9:1 → nearly square!

**Does T-inflation need adjustment for 2-band domains?**

No — the formula is self-adjusting:
- `scale = max(uRange, tRange)` — if tRange now exceeds uRange (after doubling), scale becomes tRange
- `tCorrection = √metricRatio` — unchanged, depends only on pot geometry
- The normalized T value (`tRange/scale * tCorrection`) scales properly regardless of how many bands are merged

However, the `tBoundsMax` safety needs attention: with 2-band + T-inflation, normalized T can reach ~1.10. The dynamic bounds formula from Proposal A handles this: `tBoundsMax = Math.max(1.01, tRange / scale * tCorrection + 0.01) = Math.max(1.01, 1.11) = 1.11`.

**One subtlety**: T-inflation varies by row position because R(t) changes along the pot height. A single-band CDT uses `meanT = (tBot+tTop)/2`; a 2-band CDT should use the same formula with the extended range. This means the top of a 2-band segment near the rim (where R is larger) gets slightly more inflation than the bottom. The error is proportional to ∂R/∂t × bandHeight — for typical 2-band segments this is < 5% variation. Acceptable for a heuristic correction.

---

## Risk Assessment

### Proposal A risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| T-inflation too aggressive for some pot geometries | Medium | Low | Graceful: potGeometry absent → tCorrection=1.0 |
| Quality metric thresholds in tests break | High | Low | Update test thresholds (metrics are diagnostic only) |
| Short/wide pots (metricRatio > 6) push T beyond bounds | Low | Medium | Dynamic tBoundsMax handles this |
| Tall/narrow pots (metricRatio < 1) shrink T too much | Low | Low | √metricRatio < 1 still leaves T > 0 |
| Sweep fallback doesn't benefit from T-correction | N/A | None | Sweep uses its own algorithm, unaffected |

### Proposal B risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| cdt2d fails with 2× vertices + complex constraints | Medium | Medium | Sweep fallback catches CDT failures |
| Non-chain cell quad triangulation breaks at merged boundaries | Low | High | Option B2 emits quads per-sub-band, not per-merged-band |
| `topDupMap` remapping incorrect for intermediate rows | Medium | High | Explicit `rowIdx === jTop` check (not `j+1`) |
| `batch2Remap` scope incorrect across merged bands | Low | Medium | `batch2Remap` is row-based, should work across bands |
| P5 crossing-constraint removal O(n²) blows up with 2× constraints | Low | Low | Typical constraint count per segment < 50, even 2× is fast |
| Micro-rows (from sawtooth fix) create very thin intermediate bands | Medium | Low | Multi-band treats them as interior → CDT has freedom to skip |
| Post-CDT quality passes (diagonal flip, 3D flip) confused by merged bands | Low | Medium | These passes operate on triangles, not bands |

### Combined A+B risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Near-square CDT domain + many interior points → CDT produces unexpected long edges | Low | Medium | Still bounded by constraint edges |
| tBoundsMax too tight (=1.01) clips valid triangles | Medium | Medium | Dynamic formula from Proposal A prevents this |

---

## Implementation Order

### Phase 1: Proposal A — T-Inflation (implement first)

**Why first**: Minimal code change (~20 lines including plumbing), fully backward-compatible (absent potGeometry → no change), independently testable. P1 (expansion=2) is already in DEFAULT_CHAIN_STRIP_CONFIG, so we're building on the already-reduced expansion.

**Validation**:
1. `npx vitest run` — all existing tests pass
2. Export default 8-petal pot → measure violation rate, manifold, maxAspect3D
3. Compare against current baseline
4. Check minAngleUV diagnostics — should improve (more equitable triangle shapes)
5. Verify no visual artifacts at CDT←→quad transitions
6. Test edge cases: very tall pot (H=200, R=20 → metricRatio=0.63), very wide pot (H=30, R=60 → metricRatio=12.6)

### Phase 2: Proposal B — Multi-Band CDT (implement second, after A is validated)

**Why second**: Larger architectural change, depends on A's plumbing being in place, and benefits from A's quality improvement as a baseline.

**Validation**:
1. All Phase 1 validations, re-run
2. Visual inspection: horizontal band lines should be reduced or eliminated
3. Compare triangle count: should be similar (±10%)
4. Verify non-chain quad cells are unaffected
5. Test with merge factor 1 (should exactly reproduce single-band behavior)
6. Test with merge factor 3, 4 (verify odd-band-count handling)
7. Verify manifold integrity — the intermediate row deduplication change is the highest-risk part

### Phase 3: Combined A+B tuning (optional)

1. Verify tBoundsMax is dynamically correct
2. Check if √metricRatio is still the right factor for 2-band domains (it should be, but validate empirically)
3. Consider exposing `bandMergeFactor` in the export UI for user control

---

## Open Questions

1. **Is `buildMergedRow()` at [OWT:1039-1100](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1039) idempotent and side-effect free?** I need this guarantee for calling it for intermediate rows without affecting the main loop state.

2. **Does the `quadMap` at [OWT:1096](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1096) need adjustment for multi-band?** Currently `quadMap[j * cellsPerRow + i]` indexes by band × column. With merged bands, chain-strip cells span multiple bands. The quadMap slots for intermediate-band chain-strip cells would be unused (-1). Is this acceptable for downstream consumers of quadMap?

3. **Shadow vertices**: The shadow vertex system at [OWT:960-985](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L960-L985) creates vertices at specific rows. For multi-band, shadow vertices on the intermediate row become interior points rather than boundary points. The `buildMergedRow` function includes shadow vertices in row arrays — when these are converted to `stripInteriorVerts` with `promotedT`, they should work correctly. But this needs verification.

4. **The `batch2Remap` endpoint rescue at [OWT:1488-1510](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1488-L1510)**: This rescues grid vertices dropped by boundary thinning. In multi-band, intermediate row vertices are interior, not boundary. If a batch2Remap'd vertex is on the intermediate row, the rescue should route to `stripInteriorVerts` (with promotedT) rather than `stripBot`/`stripTop`. The current `Math.abs(t - tBot) < 1e-9` check would fail for intermediate rows — they'd fall through to the else branch and be added to `stripTop` incorrectly.

5. **Should `bandMergeFactor` be adaptive?** Near the pot rim (high curvature), single-band CDT might be preferable for precision. Near the middle (low curvature), merge factor 3-4 could be beneficial. This is a future optimization — start with uniform factor.

---

## Recommended Approach

**Implement A first, B second.** They are orthogonal in code but synergistic in effect.

Proposal A is Verifier-approved (V5, V6 of R26), low-risk, and provides immediate measurement. It establishes the plumbing (potGeometry threading) that Proposal B will also need.

Proposal B is the higher-reward, higher-risk change. It eliminates a fundamental architectural limitation (forced horizontal boundaries) and naturally improves CDT domain aspect. But it requires careful handling of intermediate rows, topDupMap, and the non-chain cell interleaving.

Combined, they produce near-square CDT domains with 50% fewer horizontal boundaries — a qualitative leap in mesh quality.
