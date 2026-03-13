# Executioner Review — Chain-Coherent Tessellation R41

Date: 2026-03-08

---

## Phase 1: chainFanQuad — FEASIBLE

### Feasibility Assessment

The change is contained entirely within `constrainedSweepCell()` (OuterWallTessellator.ts, lines 290–365). The partition structure already provides the information needed to determine which side of each sub-quad is the chain edge vs. the cell boundary. No new parameters or data structures are required.

### File Impact Analysis

| File | Lines Changed | Nature |
|------|--------------|--------|
| OuterWallTessellator.ts L290-365 | ~35 lines added, 2 `sweepQuad` calls wrapped | Modify `constrainedSweepCell` |

No other files are touched. The three call sites (L1455, L1564, L1594) all invoke `constrainedSweepCell`, so the fan logic propagates automatically — including super-cell sub-bands.

### Integration Point Analysis

**Where the fan inserts**: Inside `constrainedSweepCell`, there are exactly **two** `sweepQuad` call sites to wrap:

1. **Line 341** — inside the partition loop (`for (const part of partitions)`):
   ```
   sweepQuad(buf, subBot, subTop, verts);
   ```
   This emits the sub-quad LEFT of (or between) chain edges. The **right** boundary (subBot[last], subTop[last]) is always a chain edge (from the current partition). The **left** boundary is a chain edge only if `prevBotPos`/`prevTopPos` came from a prior partition (not position 0).

2. **Line 355** — the final sub-quad after the loop:
   ```
   sweepQuad(buf, finalBot, finalTop, verts);
   ```
   This emits the sub-quad RIGHT of the last chain edge to the cell boundary. The **left** boundary (finalBot[0], finalTop[0]) is always a chain edge. The **right** boundary is the cell boundary.

**Chain side determination** is derivable from loop state — no need to scan the `edges` list:

| Sub-quad | Left boundary | Right boundary | Fan applies? |
|----------|--------------|----------------|--------------|
| First in loop (prevBotPos=0) | Cell boundary | Chain edge | YES — chain on right |
| Middle in loop (between two partitions) | Chain edge | Chain edge | NO — chain on both sides |
| Final sub-quad | Chain edge | Cell boundary | YES — chain on left |

A boolean `prevIsChainBoundary` (initially `false`, set `true` after each partition) tracks whether the left side is a chain edge.

### Exact Implementation (Near-Final TypeScript)

Replace the partition loop and final sub-quad in `constrainedSweepCell` (lines ~336-358):

```typescript
// Sweep: emit sub-quads between consecutive partition lines
let prevBotPos = 0;
let prevTopPos = 0;
let prevIsChainEdge = false;

for (const part of partitions) {
    const subBot = bot.slice(prevBotPos, part.botPos + 1);
    const subTop = top.slice(prevTopPos, part.topPos + 1);
    if (subBot.length < 2 || subTop.length < 2) {
        // A2 degenerate guard: collapsed edge after batch2Remap merge
        if (subBot.length >= 1 && subTop.length >= 1) {
            sweepQuad(buf, subBot, subTop, verts);
        }
    } else if (subBot.length === 2 && subTop.length === 2 && !prevIsChainEdge) {
        // A1: 2×2 sub-quad with chain on RIGHT only → fan from chain edge
        // Chain vertices: subBot[1], subTop[1] (partition boundary)
        // Grid vertices:  subBot[0], subTop[0] (cell boundary or grid)
        // Fan diagonal: chain_bot → grid_top (consistent across rows)
        emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
        emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);
    } else {
        // Chain on both sides, or N×M sub-quad → standard sweep
        sweepQuad(buf, subBot, subTop, verts);
    }
    prevBotPos = part.botPos;
    prevTopPos = part.topPos;
    prevIsChainEdge = true;
}

// Final sub-quad: from last partition to right boundary
const finalBot = bot.slice(prevBotPos);
const finalTop = top.slice(prevTopPos);
if (finalBot.length < 2 || finalTop.length < 2) {
    // A2 degenerate guard
    if (finalBot.length >= 1 && finalTop.length >= 1) {
        sweepQuad(buf, finalBot, finalTop, verts);
    }
} else if (finalBot.length === 2 && finalTop.length === 2 && partitions.length > 0) {
    // A1: 2×2 sub-quad with chain on LEFT only → fan from chain edge
    // Chain vertices: finalBot[0], finalTop[0] (last partition boundary)
    // Grid vertices:  finalBot[1], finalTop[1] (cell boundary)
    // Fan diagonal: chain_bot → grid_top (consistent across rows)
    emitTriCCW(buf, finalBot[0], finalBot[1], finalTop[1], verts);
    emitTriCCW(buf, finalBot[0], finalTop[1], finalTop[0], verts);
} else {
    sweepQuad(buf, finalBot, finalTop, verts);
}
```

### Risk Zones

1. **Winding correctness**: `emitTriCCW` uses UV cross-product to enforce CCW winding. The fan triangles pass three vertex indices; `emitTriCCW` will swap if needed. **Risk: LOW** — same mechanism all existing triangles use.

2. **Diagonal consistency claim**: The fan forces a diagonal from `chain_bot` to `grid_top` (for chain-on-right) or `chain_bot` to `grid_top` (for chain-on-left). This is consistent across rows because the diagonal direction is determined by the chain's structural position, not by U-comparison. The minor U oscillation that caused zigzag in `sweepQuad` is bypassed. **Risk: LOW**.

3. **Non-2×2 sub-quads falling through to sweepQuad**: These still get the original sweepQuad behavior. Amendment A1 explicitly defers N×M handling. **Risk: NONE** — no behavior change for these cases.

4. **Super-cell interaction**: `emitSuperCell` also calls `constrainedSweepCell` (lines 1564, 1594). The fan logic inside `constrainedSweepCell` applies automatically. However, super-cell sub-quads may have more complex vertex configurations. Since we guard with `subBot.length === 2 && subTop.length === 2`, non-2×2 super-cell sub-quads fall through to sweepQuad. **Risk: NONE**.

### Unstated Dependencies

1. **`emitTriCCW` degenerate handling**: If both fan triangles are degenerate (cross product < 1e-12), `emitTriCCW` emits `(0,0,0)` — same as current behavior for degenerate sweepQuad triangles. No new degenerate path.

2. **The `partitions.length > 0` guard on the final sub-quad**: Without this, a cell with zero partitions (no chain edges) would skip the loop entirely and hit the final sub-quad path. But the early-return at line 325 (`if (partitions.length === 0) { sweepQuad(...); return; }`) means `partitions.length > 0` is always true at the final sub-quad. The guard is added for safety, not necessity.

---

## Phase 2: Feature-Aware Subdivision Threshold — FEASIBLE

### Feasibility Assessment

Trivially feasible. `outerGridVertexCount` is already a field of `SubdivisionParams` (line 76). The edge evaluation loop already computes `v0` and `v1`. The change is a 3-line threshold branch insertion plus a 1-line constant definition and 3 lines of stats/logging.

### File Impact Analysis

| File | Lines Changed | Nature |
|------|--------------|--------|
| MeshSubdivision.ts L96 | +1 | Add `featureThreshold: number` to `SubdivisionStats` |
| MeshSubdivision.ts L307 | +2 | Add `FEATURE_SCALE` constant + `featureSubdivThreshold2` |
| MeshSubdivision.ts L374-380 | +3, modify 2 | Add `isFeatureEdge` check, restructure threshold selection |
| MeshSubdivision.ts L508 | +1 | Populate `featureThreshold` in stats return |
| ParametricExportComputer.ts L1623 | modify 1 | Add feature threshold to log message |

### Exact Implementation (Near-Final TypeScript)

**1. SubdivisionStats interface** (~line 96):
```typescript
/** Squared threshold for feature-edge splitting (chain↔grid, 0.75× avgGridEdge). */
featureThreshold: number;
```

**2. Threshold computation** (~line 307, after `subdivThreshold2`):
```typescript
/** Feature edges (chain↔grid) use a tighter threshold to resolve curvature at ridge flanks. */
const FEATURE_SCALE = 0.75;
const featureSubdivThreshold2 = (avgGridEdge * FEATURE_SCALE) ** 2;
```

**3. Edge evaluation** (~lines 374-382):
```typescript
// BEFORE (current):
const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
const threshold = isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2;

// AFTER (proposed):
const isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
const threshold = isFeatureEdge
    ? featureSubdivThreshold2
    : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);
```

**4. Stats return** (~line 508):
```typescript
featureThreshold: featureSubdivThreshold2,
```

**5. PEC logging** (~line 1623, append to existing log string):
```
, feature threshold: ${Math.sqrt(subdivResult.stats.featureThreshold).toFixed(3)}mm
```

### Risk Zones

1. **More edges qualifying → more splits**: The 0.75× threshold is lower than the boundary (1.2×) and interior (1.8×) thresholds. More edges will be candidates. But the `modifiedTris` guard prevents cascading splits (each triangle participates at most once), and the sort-by-length ensures the most problematic edges are handled first. **Risk: LOW** — graceful degradation if budget is tight.

2. **Feature edge false positives**: An edge between a grid vertex (index < `outerGridVertexCount`) and a chain vertex (index >= `outerGridVertexCount`) is classified as a feature edge. Could there be edges where this XOR is true but the edge is NOT a fan arm? After batch2Remap, chain vertices near grid columns get remapped to grid indices (index < `outerGridVertexCount`), so their edges are correctly excluded. Phantom vertices (index >= `totalVertexCount` which is > `outerGridVertexCount`) are correctly included but blocked by `touchesProtectedPatch`. **Risk: NONE** — the XOR is an exact discriminator.

3. **Threshold priority**: Feature > Boundary > Interior. An edge could be BOTH a feature edge and a boundary edge (one triangle is chain-strip, the other is grid). The feature check takes priority (lower threshold = more aggressive splitting). This is correct: feature edges at strip boundaries have the most chord error and should be split most aggressively. **Risk: NONE**.

### Unstated Dependencies

1. **`outerGridVertexCount` accuracy**: This field must correctly reflect the boundary between grid and chain vertices after all remapping. It's set by the tessellator and passed through unchanged. Verified: `gridVertexCount` in OuterWallTessellator corresponds to `numU × numT` (the grid), and chain vertices are allocated after index `gridVertexCount`. This flows through to `outerGridVertexCount` in PEC. ✅

2. **Stats interface backward compatibility**: Adding a new field to `SubdivisionStats` is backward-compatible because the stats are returned (not accepted as input). No callers destructure every field. ✅

---

## Implementation Order

**Phase 1 first, then Phase 2.** Rationale:

1. Phase 1 fixes the dominant visual artifact (sawtooth diagonal alternation). It produces immediately visible improvement.
2. Phase 2 is a refinement that improves surface quality near features. Its benefit is proportional to how many fan arm triangles exist — which is influenced by Phase 1's fan emission pattern. Implementing Phase 2 after Phase 1 ensures the thresholds are calibrated against the correct triangle geometry.
3. Both phases are **independent** — neither depends on the other's code. They can be implemented and tested separately.

## Estimated Changesets

**2 atomic commits:**

1. `feat: chainFanQuad — deterministic fan diagonals in chain-adjacent 2×2 sub-quads`
   - OuterWallTessellator.ts only (~35 lines added)
   
2. `feat: feature-aware subdivision threshold for chain↔grid edges`
   - MeshSubdivision.ts (~8 lines), ParametricExportComputer.ts (~1 line log change)

## Test Strategy

### Phase 1 Tests

**Existing tests**: Run `npm test` — the OuterWallTessellator tests validate triangle count, index validity, non-degeneracy, and winding. The fan path produces valid triangles via `emitTriCCW`, so existing tests should pass.

**New unit test** (add to OuterWallTessellator.test.ts):
- `it('chainFanQuad emits fan diagonal for 2×2 sub-quad with single chain edge')` — construct a minimal cell with one chain edge, verify the two output triangles share the chain edge and the diagonal goes chain→grid (not the sweepQuad diagonal).

**Visual regression**: Export a pot with chains (e.g., Gothic style) and compare the chain-adjacent triangle normals for row-to-row consistency. The sawtooth pattern should be eliminated.

### Phase 2 Tests

**Existing tests**: Run `npm test` — the MeshSubdivision tests validate constraint edge protection, split counts, UV format, triangle validity. The new threshold is a parameter change; existing tests should pass.

**New unit test** (add to MeshSubdivision.test.ts):
- `it('splits feature edges (chain↔grid) at lower threshold than interior edges')` — construct a mesh with one chain vertex and one grid vertex connected by an edge of length 0.8× avgGridEdge. Verify it IS split (exceeds 0.75× but not 1.2× or 1.8×).
- `it('does not split grid-only edges at feature threshold')` — edge between two grid vertices at 0.8× avgGridEdge should NOT be split.

**Validation protocol**:
1. `npm run typecheck` — no new TS errors
2. `npm test` — all existing + new tests pass
3. `npm run lint` — no new warnings
4. Export Gothic/Art Deco style → verify subdivision stats log shows `featureThreshold` and `candidates` count is higher than before

## Surprises / Feedback for Generator & Verifier

1. **Chain side derivable from loop state**: The Generator's proposal suggested scanning the `edges` list to find the chain edge in each sub-quad. This is unnecessary — the partition loop structure itself determines which boundary is the chain edge (right boundary for loop body, left boundary for final sub-quad). A simple boolean `prevIsChainEdge` tracks this. Reduces per-sub-quad work from O(E) scan to O(1).

2. **Final sub-quad guard**: The final `sweepQuad` call (line 355) already has `if (finalBot.length >= 1 && finalTop.length >= 1)`. We need `>= 2` for the fan path. But the early-return at line 325 (`partitions.length === 0`) means we only reach the final sub-quad when partitions exist. Combined with the `finalBot.length === 2 && finalTop.length === 2` check, the degenerate guard (A2) is implicitly satisfied. I add explicit guards anyway for defensive correctness.

3. **No `gridVertexCount` needed in `constrainedSweepCell`**: The Generator's proposal mentioned checking `index >= outerGridVertexCount` to identify chain vertices. This is NOT needed for the fan — we determine the chain side from loop structure, not from vertex index ranges. This is cleaner and avoids threading a new parameter through the function signature.

4. **The `FEATURE_SCALE = 0.75` constant**: Per the Verifier's Amendment A2, I hoist this outside the loop as a named constant. Per existing convention (1.8× and 1.2× are hard-coded), I hard-code 0.75 rather than adding it to any config interface.
