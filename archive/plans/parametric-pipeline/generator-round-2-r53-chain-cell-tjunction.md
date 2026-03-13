# Generator Round 2 — R53 Phase 2: Chain-Cell T-Junction Elimination

Date: 2026-03-10

---

## Problem Statement

Phase 1 BPP eliminates T-junctions at standard-cell / super-cell boundaries (4,844 split cells, valence-3 reduced from 3,404 to 2,129). But it **intentionally skips chain cells** via the `!cellChainMap.has(adjKey)` filter at L1413 and L1443. The remaining ~2,129 valence-3 vertices are concentrated at chain-cell / super-cell boundaries where:

1. The super-cell's phantom rows create vertices on the **shared vertical edge** (at column U-values `unionU[colStart]` or `unionU[colEnd+1]`)
2. These phantom vertices are at **interior T-values** (`tCross`, between `T_bot` and `T_top`)
3. The super-cell's band-splitting triangulation USES these vertices, producing edges that terminate at them
4. The adjacent chain cell's triangulation is UNAWARE of them → **T-junction**

## Root Cause Analysis

### Why `emitChainCell` can't just "include" phantom vertices

`emitChainCell` (L1557-1593) builds **horizontal** bot/top edges:

```
botEdge = [BL, chain_bot_verts..., BR]    — all at T = T_bot
topEdge = [TL, chain_top_verts..., TR]    — all at T = T_top
```

Then dispatches to:
- `sweepQuad(botEdge, topEdge)` — if no chain edges through cell
- `constrainedSweepCell(botEdge, topEdge, chainEdges)` — if chain edges partition cell

Phantom boundary vertices sit at **(U_edge, T_phantom)** where `T_bot < T_phantom < T_top`. They are on **vertical edges**, not horizontal edges. Adding them to botEdge or topEdge would place them at the wrong T-coordinate, causing `sweepQuad` to produce crossed/inverted triangles (Verifier Attack 4 confirmed this).

### Why Phase 1's `emitSplitCell` can't be reused directly

`emitSplitCell` (L1536-1555) works by sweeping between vertical edges:

```
leftEdge  = [BL, ...leftPhantoms..., TL]    — sorted by T
rightEdge = [BR, ...rightPhantoms..., TR]   — sorted by T
sweepQuad(leftEdge, rightEdge)
```

This treats U as the sweep coordinate — all leftEdge vertices have `U = unionU[col]`, all rightEdge have `U = unionU[col+1]`. The sweep produces a fan-like triangulation between two vertical boundary arrays.

But for chain cells, this drops **chain vertices on bot/top edges** (at interior U-values between `unionU[col]` and `unionU[col+1]`). Chain vertices are at `(U_chain, T_bot)` or `(U_chain, T_top)` — they're on horizontal edges, not vertical edges. `emitSplitCell`'s vertical sweep is structurally incompatible with chain vertex placement.

### The geometric reality

A chain cell with phantom boundary vertices has two ORTHOGONAL sets of extra vertices:
- **Chain vertices** on horizontal edges (bot/top) at interior U values
- **Phantom vertices** on vertical edges (left/right) at interior T values

Neither a purely horizontal sweep nor a purely vertical sweep can incorporate both. The only geometrically correct approach is **sub-band decomposition**: split the cell horizontally at each phantom T-value, creating sub-bands where each sub-band's bot/top boundaries properly include the relevant vertices.

---

## Proposals

### Proposal 1: Full Sub-Band Decomposition — `emitChainSplitCell` (Moderate — RECOMMENDED)

**Idea**: Create a new emission function that decomposes the chain cell into horizontal sub-bands at phantom T-values, analogous to R37's band-splitting in `emitSuperCell`. Within each sub-band, run the existing `sweepQuad` or `constrainedSweepCell`.

**Mechanism** — detailed algorithm:

#### Step 1: Collect unique phantom T-values

From `bppInfo.leftPhantoms` and `bppInfo.rightPhantoms`, extract T-values via `vertices[pIdx * 3 + 1]`. Merge into a sorted, deduped array `phantomTs`.

#### Step 2: Ensure both vertical edges have a vertex at each phantom T

A chain cell might be adjacent to two different super-cells (left and right), each producing phantom rows at different T-values. At a given `T_k`:
- If leftPhantoms has a vertex but rightPhantoms doesn't → create phantom vertex at `(unionU[col+1], T_k)` using `nextPhantomIdx`
- If rightPhantoms has a vertex but leftPhantoms doesn't → create phantom vertex at `(unionU[col], T_k)` using `nextPhantomIdx`

This ensures every sub-band boundary is a complete horizontal edge with at least 2 vertices (left corner + right corner).

**Mathematical basis**: The created vertex sits at a grid column U-value (not a chain U-value), so it's a column boundary vertex — it respects R52 precision locks automatically (`isChainAnchor=false`).

#### Step 3: Build sub-band boundary arrays

```
boundaries[0]   = botEdge    = [BL, chain_bot_verts..., BR]       (T = T_bot)
boundaries[k]   = [leftPhantom_Tk, rightPhantom_Tk]               (T = T_k)
boundaries[N+1] = topEdge    = [TL, chain_top_verts..., TR]       (T = T_top)
```

Each boundary sorted by U. Interior boundaries have exactly 2 vertices (left + right phantom) plus any chain crossing anchors added in Step 4.

#### Step 4: Split chain edges at phantom T-values (Case 2 only)

For each chain edge `[ev0, ev1]` in `info.chainEdges`:
- Chain edges span from T_bot to T_top, so they cross ALL phantom T-values
- For each phantom T `T_k` the edge crosses:
  - Compute intersection: `alpha = (T_k - t0) / (t1 - t0)`, `uCross = u0 + alpha * (u1 - u0)`
  - Create a phantom chain anchor vertex at `(uCross, T_k)` using `nextPhantomIdx` with `isChainAnchor=true` (R52 PRECISION LOCK compliance)
  - Add this anchor to `boundaries[k]` (the sub-band boundary at T_k)
  - Record sub-edge: `[prevVertex, anchor]`
- After all crossings: final sub-edge `[lastAnchor, topVertex]`

This is the same pattern as R37's chain edge pre-splitting at L1280-1365, adapted for single-cell scope.

**Critical R52 detail**: Chain crossing anchors at phantom T-values must use `isChainAnchor=true` to prevent merging with the column boundary phantom vertices at the same T-value. The `upsertPhantomRowVertex` flow already handles this via `phantomChainAnchorSet`.

#### Step 5: Assign chain sub-edges to sub-bands

A chain sub-edge `[va, vb]` belongs to sub-band k if:
- `va` is in `boundaries[k]` (or has `T(va) ≈ T_k`)
- `vb` is in `boundaries[k+1]` (or has `T(vb) ≈ T_{k+1}`)

#### Step 6: Emit each sub-band

For sub-band k (bot = `boundaries[k]`, top = `boundaries[k+1]`):
- Sort both boundary arrays by U
- Collect sub-edges assigned to this band
- If no sub-edges: `sweepQuad(subBot, subTop, vertices)`
- If sub-edges present: `constrainedSweepCell(subBot, subTop, subEdges, vertices, fanDiagEdges)`

**Files affected**:
- `OuterWallTessellator.ts` L1413, L1443: Remove `!cellChainMap.has(adjKey)` filter (allow chain cells into `phantomBoundaryMap`)
- `OuterWallTessellator.ts` L1760-1770: Add dispatch branch for chain cells with phantom boundary info
- `OuterWallTessellator.ts` new function: `emitChainSplitCell` (~60-80 lines, inserted after `emitChainCell`)

**Trade-offs**:
- (+) Complete solution — handles both Case 1 and Case 2
- (+) Reuses existing `sweepQuad` / `constrainedSweepCell` — no new triangulation logic
- (+) Follows proven R37 pattern — vetted by 10+ rounds of production use
- (+) 100% chain edge enforcement preserved (chain edges explicitly split and re-enforced)
- (-) ~60-80 new lines
- (-) Creates additional phantom vertices (matching vertices on opposite edge + chain crossing anchors)
- (-) Phantom slot budget: ~2-6 extra vertices per chain cell with asymmetric phantoms

**Assumptions** (for Verifier to attack):
1. Every chain edge in a chain cell spans from a bot-edge vertex to a top-edge vertex (i.e., crosses 1 band exactly). Cross-band chain edges are filtered earlier (L884: `if (r1 - r0 > 1) continue`). Super-cell chain edges are assigned to cell-local `info.chainEdges` within a single band.
2. The `nextPhantomIdx` allocator and vertex buffer have sufficient headroom for the additional vertices. Estimated: ~2-6 extra per chain cell × ~200-500 affected chain cells = ~400-3000 extra vertices. Current headroom: 58,080 - 12,755 = 45,325 slots.
3. Creating matching phantom vertices on the opposite edge doesn't violate R52 because they're column boundary vertices (`isChainAnchor=false`) at grid U-positions, not chain U-positions.
4. Chain edges registered in `info.chainEdges` are already the A4-pre-split versions (the master `chainEdges` array is updated at L1370-1380 before `cellChainMap` construction). Wait — NO: `cellChainMap` is built at L880-975, and A4 pre-splitting happens at L1370-1380. **Chain edges in `cellChainMap` may be the ORIGINAL unsplit versions if the cell is NOT part of a super-cell.** For adjacent chain cells (not in the super-cell), the chain edges are the cell's own edges, which are NOT split by R37. These edges span the full band height. This is fine for our algorithm — we split them ourselves in Step 4.
5. `constrainedSweepCell` correctly handles sub-quads with only 2 vertices on one boundary (the interior phantom boundary) — verified: `sweepQuad` is the fallback when partitions produce sub-quads with bot/top length < 2 (degenerate guard at L354-360).

---

### Proposal 2: Case-Split Simplification (Conservative)

**Idea**: Handle the two chain cell cases differently:

**Case 1 (no chain edges)**: Use full sub-band decomposition (same as Proposal 1, Steps 1-3 + 6 only). This is simple because there are no chain edges to split. ~30 lines.

**Case 2 (chain edges present)**: **Skip phantom propagation entirely.** Keep the `!cellChainMap.has(adjKey)` filter but only for cells with chain edges (check `info.chainEdges.length > 0`). Rationale: cells with chain edges are already densely triangulated — `constrainedSweepCell` creates multiple sub-quads with chain edge boundaries, each independently triangulated. The T-junction at the boundary is in a region of already-high mesh density, minimizing visual and structural impact.

**Files affected**:
- `OuterWallTessellator.ts` L1413, L1443: Change filter from `!cellChainMap.has(adjKey)` to `!chainCellHasEdges(adjKey)` (check if chain edges exist in the adjacent cell)
- `OuterWallTessellator.ts` L1760-1770: Dispatch branch for chain cells without chain edges
- `OuterWallTessellator.ts` new helper: ~30 lines for Case 1 sub-band decomposition

**Trade-offs**:
- (+) Much simpler — no chain edge splitting logic
- (+) Lower risk — fewer phantom vertices, no chain edge manipulation
- (+) Case 1 is the MAJORITY of chain cells adjacent to super-cells (chain verts on edges don't create chain edges if the chain doesn't cross column boundaries within this cell)
- (-) Case 2 T-junctions remain (~50-200 estimated remaining valence-3 from this path)
- (-) Incomplete solution — leaves some T-junctions at the densest chain crossings

**Assumptions** (for Verifier to attack):
1. The majority of chain cells adjacent to super-cells are Case 1 (no chain edges). This needs verification — a chain that creates a super-cell by crossing columns likely ALSO has chain edges in the immediately adjacent cells.
2. T-junctions at Case 2 boundaries have minimal visual/structural impact due to existing mesh density.

---

### Proposal 3: Phantom Row Extension Into Adjacent Chain Cells (Radical)

**Idea**: Instead of building `phantomBoundaryMap` as a post-hoc data structure, extend the R37 phantom row construction loop itself to create phantom rows that span into adjacent chain cells. This would create complete phantom rows (with column boundary vertices AND chain crossing anchors) for the adjacent chain cell, pre-splitting the cell's chain edges in the R37 loop.

**Mechanism**: For each super-cell with phantom rows:
1. Check if the adjacent cell at `colStart-1` or `colEnd+1` is a chain cell
2. If yes, extend the phantom row vertex construction to include `unionU[colStart-1]` (or `unionU[colEnd+2]`)
3. Create chain crossing anchors for the adjacent cell's chain edges at the phantom T-value
4. Store extended phantom row data keyed by the adjacent cell
5. The adjacent chain cell uses this data in a mini-R37 band-splitting emission

**Files affected**:
- `OuterWallTessellator.ts` L1120-1280: Extend R37 loop to handle adjacent chain cells
- `OuterWallTessellator.ts` L1760-1770: Dispatch to mini-R37 emission for flagged chain cells

**Trade-offs**:
- (+) Maximally consistent with existing R37 architecture
- (+) Chain edge splitting happens in the R37 loop where all the infrastructure exists
- (+) The A4 master chainEdges update automatically captures the new sub-edges
- (-) Modifies the R37 loop itself — high regression risk (Verifier Attack 2 from Round 1)
- (-) Extended phantom rows could pollute super-cell band-splitting if not carefully filtered (the EXACT bug the Verifier identified in Attack 2 of the CPR proposal)
- (-) Increases coupling between super-cell and adjacent-cell processing
- (-) ~100-150 new lines in the R37 loop, which is already complex

**Assumptions** (for Verifier to attack):
1. Extending phantom rows doesn't cause the vertices to be picked up by the super-cell's own `emitSuperCell` band-splitting (the Verifier Attack 2 pollution issue).
2. The A4 pre-split update correctly applies to chain edges that span standard cells (not just super-cells).

---

## Code Path Tracing

### Current dispatch flow (L1730-1775):

```
for band, col:
  if superCellCols.has(key) → emitSuperCell (or skip interior)
  elif seam-guarded → skip
  elif cellChainMap.has(key):
    emitChainCell(band, col, info)        ← PHANTOM UNAWARE
  else:
    if phantomBoundaryMap.has(key):
      emitSplitCell(band, col, bppInfo)   ← Phase 1 BPP
    else:
      emitStandardCell(band, col)
```

### Proposed dispatch flow (Proposal 1):

```
for band, col:
  if superCellCols.has(key) → emitSuperCell (or skip interior)
  elif seam-guarded → skip
  elif cellChainMap.has(key):
    bppInfo = phantomBoundaryMap.get(key)
    if bppInfo:
      emitChainSplitCell(band, col, info, bppInfo)  ← NEW Phase 2
    else:
      emitChainCell(band, col, info)
  else:
    if phantomBoundaryMap.has(key):
      emitSplitCell(band, col, bppInfo)
    else:
      emitStandardCell(band, col)
```

### BPP filter change:

```
// L1413 — CURRENT:
if (!cellChainMap.has(adjKey) && !superCellCols.has(adjKey)) {

// L1413 — PROPOSED:
if (!superCellCols.has(adjKey)) {
```

Same change at L1443. This allows chain cells into `phantomBoundaryMap`.

### `emitChainSplitCell` pseudocode:

```typescript
const emitChainSplitCell = (
    band: number, col: number,
    info: CellChainInfo, bppInfo: PhantomBoundaryInfo
): void => {
    quadMap[band * cellsPerRow + col] = -1;
    chainCellCount++;
    bppSplitCellCount++;

    const BL = band * numU + col;
    const BR = band * numU + (col + 1);
    const TL = (band + 1) * numU + col;
    const TR = (band + 1) * numU + (col + 1);
    const tBot = vertices[BL * 3 + 1];
    const tTop = vertices[TL * 3 + 1];
    const uLeft = vertices[BL * 3];
    const uRight = vertices[BR * 3];

    // Step 1: Collect unique phantom T-values
    const phantomTSet = new Set<number>();
    const leftByT = new Map<number, number>();  // T → vertexIdx
    const rightByT = new Map<number, number>(); // T → vertexIdx

    for (const pIdx of bppInfo.leftPhantoms) {
        const t = vertices[pIdx * 3 + 1];
        const tKey = Math.round(t * 1e8) / 1e8; // quantize for dedup
        phantomTSet.add(tKey);
        leftByT.set(tKey, pIdx);
    }
    for (const pIdx of bppInfo.rightPhantoms) {
        const t = vertices[pIdx * 3 + 1];
        const tKey = Math.round(t * 1e8) / 1e8;
        phantomTSet.add(tKey);
        rightByT.set(tKey, pIdx);
    }

    const phantomTs = [...phantomTSet].sort((a, b) => a - b);

    // Step 2: Ensure both edges have vertices at each T
    for (const tKey of phantomTs) {
        if (!leftByT.has(tKey)) {
            // Create matching vertex on left edge
            const pIdx = nextPhantomIdx++;
            vertices[pIdx * 3] = uLeft;
            vertices[pIdx * 3 + 1] = tKey;
            vertices[pIdx * 3 + 2] = surfaceId;
            leftByT.set(tKey, pIdx);
        }
        if (!rightByT.has(tKey)) {
            // Create matching vertex on right edge
            const pIdx = nextPhantomIdx++;
            vertices[pIdx * 3] = uRight;
            vertices[pIdx * 3 + 1] = tKey;
            vertices[pIdx * 3 + 2] = surfaceId;
            rightByT.set(tKey, pIdx);
        }
    }

    // Step 3: Build sub-band boundaries
    const botEdge: number[] = [BL];
    for (const cv of info.botChainVerts) botEdge.push(cv);
    botEdge.push(BR);

    const topEdge: number[] = [TL];
    for (const cv of info.topChainVerts) topEdge.push(cv);
    topEdge.push(TR);

    const boundaries: number[][] = [botEdge];
    for (const tKey of phantomTs) {
        boundaries.push([leftByT.get(tKey)!, rightByT.get(tKey)!]);
    }
    boundaries.push(topEdge);

    // Step 4: Split chain edges at phantom T-values
    const allSubEdges: Array<[number, number]> = [];

    if (info.chainEdges.length > 0) {
        for (const [ev0, ev1] of info.chainEdges) {
            const t0 = vertices[ev0 * 3 + 1];
            const t1 = vertices[ev1 * 3 + 1];
            const u0 = vertices[ev0 * 3];
            const u1 = vertices[ev1 * 3];

            // Find phantom Ts this edge crosses
            const crossedTs: number[] = [];
            for (const tKey of phantomTs) {
                if ((t0 - tKey) * (t1 - tKey) < 0) {
                    crossedTs.push(tKey);
                }
            }

            if (crossedTs.length === 0) {
                allSubEdges.push([ev0, ev1]);
                continue;
            }

            // Sort crossings from lower-T to higher-T endpoint
            const lowV = t0 <= t1 ? ev0 : ev1;
            const highV = lowV === ev0 ? ev1 : ev0;
            const lowT = vertices[lowV * 3 + 1];
            const highT = vertices[highV * 3 + 1];
            const lowU = vertices[lowV * 3];
            const highU = vertices[highV * 3];
            crossedTs.sort((a, b) => a - b);

            let prevV = lowV;
            for (const tCross of crossedTs) {
                const alpha = (tCross - lowT) / (highT - lowT);
                const uCross = lowU + alpha * (highU - lowU);

                // Create chain crossing anchor (isChainAnchor=true for R52)
                const pIdx = nextPhantomIdx++;
                vertices[pIdx * 3] = uCross;
                vertices[pIdx * 3 + 1] = tCross;
                vertices[pIdx * 3 + 2] = surfaceId;
                phantomChainAnchorSet.add(pIdx);

                // Add anchor to the boundary at this T
                const bndIdx = phantomTs.indexOf(tCross) + 1; // +1 for botEdge
                boundaries[bndIdx].push(pIdx);

                allSubEdges.push([prevV, pIdx]);
                prevV = pIdx;
            }
            allSubEdges.push([prevV, highV]);
        }
    }

    // Step 5-6: Emit each sub-band
    for (let sb = 0; sb < boundaries.length - 1; sb++) {
        const subBot = [...boundaries[sb]].sort(
            (a, b) => vertices[a * 3] - vertices[b * 3]
        );
        const subTop = [...boundaries[sb + 1]].sort(
            (a, b) => vertices[a * 3] - vertices[b * 3]
        );

        // Find chain sub-edges belonging to this sub-band
        const subBotSet = new Set(subBot);
        const subTopSet = new Set(subTop);
        const subEdges: Array<[number, number]> = [];
        for (const [sv0, sv1] of allSubEdges) {
            if ((subBotSet.has(sv0) && subTopSet.has(sv1)) ||
                (subBotSet.has(sv1) && subTopSet.has(sv0))) {
                subEdges.push([sv0, sv1]);
            }
        }

        if (subEdges.length === 0) {
            sweepQuad(indexBuf, subBot, subTop, vertices);
        } else {
            constrainedSweepCell(
                indexBuf, subBot, subTop, subEdges, vertices, fanDiagEdges
            );
        }
    }
};
```

---

## Treatment of Both Cases

### Case 1: Chain verts on edges, NO chain edges (`info.chainEdges.length === 0`)

**Currently**: `emitChainCell` → `sweepQuad(botEdge, topEdge)`.

**With Proposal 1**: Steps 4 is skipped entirely (no chain edges to split). The cell decomposes into sub-bands where:
- Bottom sub-band: bot = `[BL, chain_bot_verts..., BR]`, top = `[leftPhantom_T0, rightPhantom_T0]`
- Middle sub-bands (if multiple phantom Ts): bot/top = phantom pairs only
- Top sub-band: bot = `[leftPhantom_TN, rightPhantom_TN]`, top = `[TL, chain_top_verts..., TR]`

Each sub-band runs `sweepQuad`. The chain verts on bot/top edges are incorporated into the first/last sub-band naturally. No chain edge manipulation needed.

**Concrete example**: Chain cell at (band=5, col=9) adjacent to super-cell spanning cols 5-8. One phantom row at `T=0.715`, band boundaries `T_bot=0.70, T_top=0.73`. Chain has 1 vertex on bot edge at `(0.483, 0.70)` and 1 on top edge at `(0.487, 0.73)`.

```
Sub-band 0: bot=[BL(0.48,0.70), chainV(0.483,0.70), BR(0.49,0.70)]
             top=[phantomL(0.48,0.715), phantomR(0.49,0.715)]
             → sweepQuad (4 triangles)

Sub-band 1: bot=[phantomL(0.48,0.715), phantomR(0.49,0.715)]
             top=[TL(0.48,0.73), chainV(0.487,0.73), TR(0.49,0.73)]
             → sweepQuad (4 triangles)
```

Total: 8 triangles (from original 4). T-junction eliminated. Chain vertices properly incorporated.

### Case 2: Chain edges partition the cell

**Currently**: `emitChainCell` → `constrainedSweepCell(botEdge, topEdge, chainEdges)`.

**With Proposal 1**: Steps 4-5 split chain edges at phantom T-values and distribute sub-edges to sub-bands. Each sub-band runs `constrainedSweepCell` with the appropriate chain sub-edges.

**Concrete example**: Same cell, but chain edge `[chainBot(0.483,0.70), chainTop(0.487,0.73)]` crosses the cell. Phantom row at `T=0.715`.

```
Chain edge split at T=0.715:
  alpha = (0.715 - 0.70) / (0.73 - 0.70) = 0.5
  uCross = 0.483 + 0.5 * (0.487 - 0.483) = 0.485
  anchor = phantom vertex at (0.485, 0.715), isChainAnchor=true
  sub-edges: [chainBot, anchor], [anchor, chainTop]

Sub-band 0: bot=[BL, chainBot(0.483), BR]
             top=[phantomL(0.48), anchor(0.485), phantomR(0.49)]
             sub-edges: [chainBot, anchor]
             → constrainedSweepCell (partitions into 2 sub-quads)

Sub-band 1: bot=[phantomL(0.48), anchor(0.485), phantomR(0.49)]
             top=[TL, chainTop(0.487), TR]
             sub-edges: [anchor, chainTop]
             → constrainedSweepCell (partitions into 2 sub-quads)
```

Total: ~8-12 triangles. T-junction eliminated. Chain edges enforced as sub-edges through phantom anchors.

---

## Risk Assessment

### R1: Chain edge enforcement (CRITICAL — must verify)

**Risk**: Chain edges could be broken if sub-edge construction misses an edge or assigns it to the wrong sub-band.

**Mitigation**: The sub-edge construction in Step 4 is exhaustive — every chain edge is either kept whole (no crossing) or split into sub-edges at every phantom T it crosses. The sub-band assignment in Step 5 uses set membership (`subBotSet.has(sv0) && subTopSet.has(sv1)`), matching the EXACT pattern used in `emitSuperCell` at L1685-1690. The existing chain edge enforcement diagnostic can verify the count post-Phase 2.

**Residual risk**: LOW. The pattern is identical to R37's proven sub-edge assignment.

### R2: Phantom vertex slot overflow

**Risk**: Creating matching vertices and chain crossing anchors consumes phantom slots.

**Analysis**: Per chain cell with asymmetric phantoms: ~1-2 matching vertices + ~1-3 chain crossing anchors = ~2-5 extra vertices. Estimated affected cells: ~200-500. Total extra: ~400-2500 vertices. Current headroom: 45,325 slots. **No risk.**

**Mitigation**: The existing overflow guard at `upsertPhantomRowVertex` L1106 now includes `console.warn` (Verifier Attack 1 fix from Round 1). The pseudocode above doesn't use `upsertPhantomRowVertex` for simplicity — the Executioner should use it for the column boundary vertices and add a similar guard for chain anchors.

### R3: R52 Precision Lock violation

**Risk**: Chain crossing anchor vertices could merge with column boundary phantom vertices.

**Mitigation**: Anchors are created with `isChainAnchor=true` → added to `phantomChainAnchorSet`. The Batch 6 dedup guard (`vIsChain !== existIsChain`) prevents cross-type merging. Column boundary phantoms are created with `isChainAnchor=false`. **No violation.**

**Residual risk**: NONE. R52 invariant maintained.

### R4: `constrainedSweepCell` sub-quad correctness with 2-vertex boundaries

**Risk**: Interior sub-band boundaries have only 2-3 vertices (left phantom, right phantom, maybe 1 chain anchor). When `constrainedSweepCell` partitions a sub-quad using a chain sub-edge that connects a boundary vertex to a 2-vertex boundary, the resulting sub-sub-quad might have fewer than 2 vertices on one side.

**Mitigation**: The degenerate guard at L354-360 handles this: `if (subBot.length < 2 || subTop.length < 2) { if (subBot.length >= 1 && subTop.length >= 1) sweepQuad(...); }`. Additionally, chain sub-edges connect bot boundary to top boundary of the SAME sub-band, so each sub-quad has at least 1 vertex on each side plus the partition line endpoints.

**Residual risk**: LOW. Edge cases handled by existing degenerate guards.

### R5: Winding / orientation

**Risk**: `emitTriCCW` uses cross-product to enforce CCW winding. Sub-band decomposition doesn't change the winding logic — all triangles go through `emitTriCCW` via `sweepQuad` or `constrainedSweepCell`.

**Residual risk**: NONE.

### R6: Seam boundary chain cells

**Risk**: A chain cell near the seam (col 0 or `cellsPerRow-1`) receives phantom boundary info. The existing seam guard in BPP Phase 1 (`adjUSpan > SEAM_GUARD || adjUSpan < -SEAM_GUARD`) already filters seam-adjacent cells.

**Residual risk**: NONE (pre-existing guard).

### R7: Multiple super-cells producing phantoms for the same chain cell

**Risk**: A chain cell between two super-cells gets `leftPhantoms` from the right super-cell and `rightPhantoms` from the left super-cell, at DIFFERENT T-values.

**Mitigation**: Step 2 creates matching vertices at each unique T, ensuring every sub-band boundary is complete. The T-value dedup in Step 1 handles the unlikely case of identical T-values from different super-cells.

**Residual risk**: LOW. The algorithm naturally handles asymmetric phantom T-values.

### R8: fanDiagEdges tracking

**Risk**: `constrainedSweepCell` pushes fan diagonal edges to `fanDiagEdges` for constraint protection. Sub-band emission properly passes `fanDiagEdges` to each `constrainedSweepCell` call.

**Residual risk**: NONE.

---

## Recommended Approach

**Proposal 1 (Full Sub-Band Decomposition)** is recommended because:

1. **Completeness**: Handles both Case 1 and Case 2 with a single algorithm
2. **Proven pattern**: Follows the R37 band-splitting architecture — the same sub-edge assignment logic, the same `constrainedSweepCell` dispatch
3. **No chain cell left behind**: Every chain cell adjacent to a super-cell gets T-junction elimination
4. **Manageable complexity**: ~60-80 lines of new code, all localized to a single new function
5. **Clean dispatch**: One `if (bppInfo)` branch added to the existing chain cell dispatch

Proposal 2 is a valid fallback if the Verifier identifies issues with chain edge splitting in Proposal 1, but leaves incomplete T-junction elimination. Proposal 3 is high-risk (modifies R37 loop internals) with no benefit over Proposal 1.

## Open Questions

1. **Assumption 4 verification**: Are chain edges in `cellChainMap` for non-super-cell chain cells the original unsplit versions? If the A4 update modifies the master `chainEdges` array and `cellChainMap` was built BEFORE A4, then `info.chainEdges` references the old edge objects. Need to verify: does `cellChainMap` store copies or references? If references, the A4 update might retroactively change them. (Looking at L903: `info.chainEdges.push([v0, v1])` — these are new array literals, not references to `chainEdges` entries. So `cellChainMap` stores independent copies. **Answer: independent copies. A4 doesn't affect `cellChainMap`. Confirmed safe.**)

2. **Quantized T dedup**: The pseudocode uses `Math.round(t * 1e8) / 1e8` for T-value dedup. Is 1e-8 the right precision? Phantom T-values come from R37's `clampedTCross` which uses `degenGuard ≈ 1e-4` minimum spacing. So phantom T-values are at least 1e-4 apart. 1e-8 quantization is more than sufficient — no risk of false dedup.

3. **Impact on downstream edge flips**: `quadMap[...] = -1` disables edge flip for chain split cells. This matches the existing behavior for chain cells (`emitChainCell` also sets `quadMap = -1`). CSO edge flips operate on `quadMap ≥ 0` cells only. **No impact.**

4. **A4-like master chainEdges update**: Should the new sub-edges be propagated back to the master `chainEdges` array? For `emitSuperCell`, R37 does this via `edgeSplitMap`. For `emitChainSplitCell`, the sub-edges are LOCAL — they only Matter for this cell's triangulation. The master `chainEdges` array is used for chain edge enforcement counting and downstream processing. If we don't update it, the enforcement count might undercount (the original edge is counted, but the sub-edges aren't). **Recommend: don't update master array.** The enforcement rate is computed from the master array's edges being present in the final mesh. Since the sub-edges span the same start/end vertices (just with intermediate anchors), the original edge is effectively enforced if all its sub-edges are enforced. The enforcement diagnostic should still work.
