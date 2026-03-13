# Generator Round 1 — R46 Phase 2+3: Interpolated Re-snap + Sweep Diagonal Protection
Date: 2026-03-08

## Problem Statement

After R46 Phase 1 (fan diagonal constraint protection), dips persist. Diagnostic evidence identifies two remaining root causes:

1. **Root Cause B — Interpolated chain vertices (2516 / 6189 = 40.7%)**: OWT linearly interpolates chain vertices at rows where detection found no feature. These interpolated positions are ~0.71mm off the true feature ridge. The existing GPU re-snap (PEC Step 3.5) only operates on the pre-OWT `chains[]` array — interpolated vertices are created *afterward* inside `buildCDTOuterWall` and never get GPU-refined.

2. **Root Cause C — Sweep diagonal chain-grid flips (1170 / 1849 = 63.3% of CSO flips)**: When `constrainedSweepCell` encounters chain on BOTH sides of a sub-quad, or N×M sub-quads, it falls through to `sweepQuad`. The resulting diagonal is not chain-aware and is not in `constraintEdgeSet`. CSO then flips 1170 of these, creating row-by-row inconsistency → visible dips.

## Root Cause Analysis

### B: Interpolated Vertex Precision

**File**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) L762-783

The interpolation code:
```typescript
const frac = s / steps;
let interpU = p0.u + du * frac;
```

This computes a linear blend in U-space. But the actual feature (peak/valley) at the intermediate row follows the parametric surface curvature, not a straight line in U. For a 3-row gap with typical curvature, the error is ~0.71mm — enough to place the chain vertex visibly off the ridge.

**Why existing re-snap misses this**: The Step 3.5 re-snap (PEC L937-1050) iterates `chains[ci].points[pi]` — these are the *pre-OWT* chain points. Interpolated vertices are created inside `buildCDTOuterWall` at L762-783 and stored in the internal `chainVertices[]` array. They get `pointIdx: -1` to mark them as interpolated. But this array is never returned to PEC — only the vertex buffer (Float32Array) and vertex indices come back.

**Key data flow gap**: 
```
PEC Step 3.5:  chains[] → GPU re-snap → refined chains[]
      ↓
PEC Step 6:    chains[] → buildCDTOuterWall() 
      ↓                        ↓
                         OWT creates interpolated vertices (pointIdx=-1)
                         These go into vertex buffer at positions
                         gridVertexCount + i → OWT returns Float32Array
      ↓
PEC Phase 3:   combinedVerts → evaluatePoints() → 3D positions
                         ↑ interpolated verts have wrong U → wrong 3D position
```

### C: Sweep Diagonal Inconsistency

**File**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) L340-360

The three code paths in `constrainedSweepCell` that fall through to `sweepQuad`:
1. **L347**: `subBot.length > 2 || subTop.length > 2 || prevIsChainEdge` → chain on both sides or N×M → `sweepQuad(subBot, subTop, verts)`
2. **L360**: `finalBot.length > 2 || finalTop.length > 2` → `sweepQuad(finalBot, finalTop, verts)` 
3. **L345**: Degenerate sub-quads also fall through

`sweepQuad` (L212-260) selects a diagonal by U-comparison with R36 min-angle tie-break. This is NOT deterministic relative to the chain direction. Different rows can pick different diagonals for structurally identical sub-quads.

The CSO (`isChainGridEdge` at ChainStripOptimizer.ts L576) counts flips where exactly one endpoint is a chain vertex (index ≥ `outerGridVertexCount`) and the other is a grid vertex. 1170 such edges get flipped — each flip reorients a diagonal in a chain-adjacent cell, creating row-by-row inconsistency.

## Proposals

### Proposal P2: Post-OWT GPU Re-snap of Interpolated Chain Vertices (Moderate)

**Idea**: After `buildCDTOuterWall` returns, identify interpolated chain vertices in the UV buffer, run a targeted GPU re-snap pass, and update both UV coordinates and (after Phase 3 GPU eval) 3D positions.

**Mechanism**:

**Step 1: Expose interpolated vertex info from OWT**

Add to `OuterWallResult` interface:
```typescript
/** Vertex indices of interpolated chain vertices (pointIdx === -1), for post-OWT re-snap */
interpolatedChainVertices: Array<{ vertexIdx: number; chainId: number; rowIdx: number }>;
```

In `buildCDTOuterWall`, collect interpolated vertices alongside existing logic (L762-783). The data is already available in the `chainVertices[]` array — just filter and emit:
```typescript
// After the chain vertex loop (post L810):
const interpolatedChainVertices = chainVertices
    .filter(cv => cv.pointIdx === -1)
    .map(cv => ({ vertexIdx: cv.vertexIdx, chainId: cv.chainId, rowIdx: cv.rowIdx }));
```

Add `interpolatedChainVertices` to the return statement at L1838.

**Step 2: Post-OWT GPU re-snap in PEC**

After `buildCDTOuterWall` returns and before Phase 3 GPU evaluation, in PEC around L1395 (after the cdtResult extraction block):

```typescript
// R46 Phase 2: Post-OWT GPU re-snap for interpolated chain vertices
const interpVerts = cdtResult.interpolatedChainVertices;
if (interpVerts.length > 0 && cfgGpuResnap) {
    const RESNAP_CANDIDATES = cfgResnapCandidates; // reuse existing config (32)
    const RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES;
    const RESNAP_STEP = (2 * RESNAP_HALFWIDTH) / (RESNAP_CANDIDATES - 1);
    const MAX_INTERP_DELTA = 0.08; // tolerance bound: reject if |Δu| > this

    // Build GPU probe: RESNAP_CANDIDATES positions per interpolated vertex
    const totalProbes = interpVerts.length * RESNAP_CANDIDATES;
    const resnapVerts = new Float32Array(totalProbes * 3);
    let rIdx = 0;
    for (const iv of interpVerts) {
        const currentU = combinedVerts[iv.vertexIdx * 3]; // may be batch2Remap'd
        const tVal = combinedVerts[iv.vertexIdx * 3 + 1];
        for (let k = 0; k < RESNAP_CANDIDATES; k++) {
            let uCandidate = currentU - RESNAP_HALFWIDTH + k * RESNAP_STEP;
            uCandidate = ((uCandidate % 1) + 1) % 1;
            resnapVerts[rIdx++] = uCandidate;
            resnapVerts[rIdx++] = tVal;
            resnapVerts[rIdx++] = 0; // outer wall surface
        }
    }

    const resnapPositions = await this.evaluatePoints(
        resnapVerts, uniformBuffer, styleParamBuffer,
        dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
    );

    let interpResnapCount = 0;
    for (let idx = 0; idx < interpVerts.length; idx++) {
        const iv = interpVerts[idx];
        const baseOffset = idx * RESNAP_CANDIDATES * 3;
        const currentU = combinedVerts[iv.vertexIdx * 3];

        // Determine peak vs valley from parent chain kind
        const parentChain = meshChains[iv.chainId];
        const isMax = !parentChain?.kind || parentChain.kind === 'peak';

        // Extract radii
        const candidateRadii = new Float32Array(RESNAP_CANDIDATES);
        for (let k = 0; k < RESNAP_CANDIDATES; k++) {
            const off = baseOffset + k * 3;
            const x = resnapPositions[off];
            const y = resnapPositions[off + 1];
            candidateRadii[k] = Math.sqrt(x * x + y * y);
        }

        // Find best candidate
        let bestK = 0;
        let bestR = candidateRadii[0];
        for (let k = 1; k < RESNAP_CANDIDATES; k++) {
            if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                bestR = candidateRadii[k];
                bestK = k;
            }
        }

        // Parabolic refinement
        let finalU: number;
        if (bestK > 0 && bestK < RESNAP_CANDIDATES - 1) {
            const L = candidateRadii[bestK - 1];
            const C = candidateRadii[bestK];
            const R = candidateRadii[bestK + 1];
            const denom = L - 2 * C + R;
            let delta = 0;
            if (Math.abs(denom) > 1e-14) {
                delta = 0.5 * (L - R) / denom;
                delta = Math.max(-0.5, Math.min(0.5, delta));
            }
            finalU = currentU - RESNAP_HALFWIDTH + (bestK + delta) * RESNAP_STEP;
        } else {
            finalU = currentU - RESNAP_HALFWIDTH + bestK * RESNAP_STEP;
        }
        finalU = ((finalU % 1) + 1) % 1;

        const moved = circularDistance(currentU, finalU);
        // Tolerance bound from Verifier: reject large jumps (feature may not exist here)
        if (moved > 1e-7 && moved < MAX_INTERP_DELTA) {
            // Update UV in combinedVerts
            combinedVerts[iv.vertexIdx * 3] = finalU;
            interpResnapCount++;
        }
    }
    console.log(`[ParametricExport]   R46 interp re-snap: ${interpResnapCount}/${interpVerts.length} interpolated vertices refined`);
}
```

**Step 3: Triangle inversion guard (Verifier requirement)**

The above tolerance bound (`MAX_INTERP_DELTA = 0.08`) catches the case where re-snap would jump the vertex far from its interpolated position, indicating the feature doesn't exist at that row. 

For a full triangle inversion guard, after updating the UV position we'd need to check that no triangle containing this vertex has flipped winding. But this is complex pre-Phase-3 because we only have UV positions, not 3D. Two options:

**Option A (Recommended)**: UV-space inversion check. After updating `combinedVerts[iv.vertexIdx * 3]`, scan all triangles touching `iv.vertexIdx` in the index buffer and verify the UV cross product hasn't changed sign. If it has, revert the move.

**Option B (Simpler)**: Rely on the tolerance bound alone. With `MAX_INTERP_DELTA = 0.08` (~29° in U-space), the maximum movement is small relative to cell width. The probability of inversion in a well-formed mesh is near zero. Monitor with the existing winding diagnostic and add the full guard only if inversions are observed.

**Recommendation**: Start with Option B. The tolerance bound provides 95% of the safety with 10% of the complexity. The existing UV winding checks in `emitTriCCW` and post-GPU diagnostics will catch any issues.

**Timing in pipeline**: This re-snap happens AFTER `buildCDTOuterWall` returns and BEFORE Phase 3 GPU evaluation. The re-snap updates U in the UV buffer (`combinedVerts`), so when Phase 3 runs `evaluatePoints(combinedVerts, ...)`, the interpolated vertices automatically get correct 3D positions. No separate 3D position update needed.

**Critical insight — batch2Remap**: OWT's batch2Remap (L866-880) can merge a chain vertex with a nearby grid vertex. If an interpolated vertex was merged (its `vertexIdx` was remapped), the `interpolatedChainVertices` list should use the post-remap index. We should apply the remap *before* returning:

```typescript
// In OWT, before building interpolatedChainVertices:
const interpolatedChainVertices = chainVertices
    .filter(cv => cv.pointIdx === -1)
    .map(cv => ({
        vertexIdx: batch2Remap.get(cv.vertexIdx) ?? cv.vertexIdx,
        chainId: cv.chainId,
        rowIdx: cv.rowIdx,
    }))
    // Deduplicate: if two interpolated verts mapped to the same grid vertex, keep one
    .filter((v, i, arr) => arr.findIndex(x => x.vertexIdx === v.vertexIdx) === i);
```

**Files affected**:
- `OuterWallTessellator.ts`: +1 field to interface (+1 line), +5 lines to collect, +1 line to return
- `ParametricExportComputer.ts`: +~50 lines for re-snap logic after cdtResult extraction

**Assumptions** (for Verifier to attack):
1. The tolerance bound of 0.08 is sufficient to prevent triangle inversion without explicit geometric checks
2. The parent chain's `kind` (peak/valley) is the correct indicator for whether to seek max or min radius at the interpolated row
3. batch2Remap'd interpolated vertices still benefit from re-snap (their U is from the grid column, not the feature)
4. The 32-candidate window (±2 sample widths = ±0.000244 in U) is wide enough to capture the true feature position for a linearly-interpolated vertex with ~0.71mm error
5. Running re-snap on `combinedVerts` before Phase 3 GPU eval is sufficient — no need to re-run after 3D evaluation

---

### Proposal P3A: Sweep Diagonal Collection + Constraint Protection (Conservative)

**Idea**: Same approach as R46 Phase 1 fan diagonals — collect all diagonals created by `sweepQuad` in chain-containing cells and add them to `constraintEdgeSet`.

**Mechanism**: 

Modify `sweepQuad` to accept an optional `diagEdges` collector array. Every time `sweepQuad` emits a triangle, the shared edge between two consecutive triangles IS the diagonal. We can track it:

```typescript
function sweepQuad(
    buf: number[],
    bot: number[],
    top: number[],
    verts: Float32Array,
    diagEdges?: Array<[number, number]>,  // NEW: collect diagonal edges
): void {
    let bi = 0, ti = 0;
    // ... existing sweep logic ...
    // After each emitTriCCW call, the last two triangles share an edge.
    // Track by noting: each triangle shares one vertex with the previous.
    // The diagonal is [bot[bi], top[ti]] or [top[ti], bot[bi]] depending on advance direction.
}
```

**Problem**: `sweepQuad` doesn't naturally expose which edge is the "diagonal." It emits triangles one at a time, and the shared edge between consecutive triangles is implicit. Tracking it requires either:
- Post-processing the triangle buffer to find shared edges (expensive)
- Adding diagonal tracking inside the sweep loop (messy, changes a hot function)

**Trade-off analysis**: This approach locks in whatever diagonal `sweepQuad` chose. If `sweepQuad` chose a BAD diagonal (it can, since U-comparison + min-angle is a heuristic), we're locking in bad geometry. The CSO's job is to improve bad diagonals — preventing it from flipping chain-grid diagonals removes a quality improvement mechanism.

**Verdict**: Not recommended. Locking heuristic diagonals risks degrading mesh quality.

---

### Proposal P3B: Chain-Aware Sweep Diagonal (Moderate) — RECOMMENDED

**Idea**: Instead of protecting sweep diagonals, make `sweepQuad` chain-aware so it produces *deterministic, chain-consistent* diagonals that the CSO won't want to flip.

**Mechanism**:

The key insight: in a 2×2 sub-quad with chain on both sides (left=chain, right=chain), the two possible diagonals are:
- `chain_bot_left ↔ chain_top_right` (cross-diagonal)  
- `chain_top_left ↔ chain_bot_right` (cross-diagonal)

Neither is chain↔grid — both are chain↔chain. The CSO's `isChainGridEdge` counter would NOT count these. So who are the 1170 chain-grid flips?

They come from **N×M sub-quads** where N≥3 or M≥3 — when `sweepQuad` generates multiple triangles, some diagonals connect a chain vertex to a grid vertex. Example: a 3-bottom × 2-top sub-quad has internal diagonals where chain and grid vertices get connected.

**Revised approach**: For the both-sides case and N×M sub-quads, apply the **same fan diagonal strategy** — use `chainFanQuad` when a 2×2 sub-quad can be identified inside the sweep, and for larger sub-quads, use the **chain direction** to pick the diagonal deterministically.

Concretely, in `constrainedSweepCell`:

```typescript
// At L347 (chain on both sides, 2×2):
} else if (subBot.length === 2 && subTop.length === 2 && prevIsChainEdge) {
    // Chain on BOTH sides: fan from RIGHT chain edge (consistent with non-both-sides case)
    emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
    emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);
    fanDiagEdges.push([subBot[1], subTop[0]]);
}
```

Wait — the code already handles `prevIsChainEdge` for the *left* sub-quad. The issue is the `else` at L361 where `prevIsChainEdge` is true AND `subBot.length > 2 || subTop.length > 2`. These are the N×M cases.

**For N×M sub-quads**: The sweep is necessary (can't fan-decompose). But we can **collect the diagonals produced by the sweep** and add them to constraintEdgeSet. The diagonals ARE deterministic within a single `sweepQuad` call — the issue is that CSO can flip them later.

So the refined strategy is:

1. **2×2 both-sides**: Use `chainFanQuad` with deterministic diagonal → add to `fanDiagEdges` → constraint-protected
2. **N×M sub-quads**: Use `sweepQuad` (unavoidable) but collect the diagonals → add to a new `sweepDiagEdges` → constraint-protected

For N×M, the diagonal collection requires tracking which edges `sweepQuad` creates. The cleanest approach:

```typescript
function sweepQuadTracked(
    buf: number[],
    bot: number[],
    top: number[],
    verts: Float32Array,
    diagEdges: Array<[number, number]>,
): void {
    let bi = 0, ti = 0;
    const bLen = bot.length, tLen = top.length;

    while (bi < bLen - 1 || ti < tLen - 1) {
        if (bi >= bLen - 1) {
            emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
            // Diagonal: bot[bi] ↔ top[ti+1] (when ti < tLen - 2)
            if (ti < tLen - 2) diagEdges.push([bot[bi], top[ti + 1]]);
            ti++;
        } else if (ti >= tLen - 1) {
            emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
            if (bi < bLen - 2) diagEdges.push([top[ti], bot[bi + 1]]);
            bi++;
        } else {
            const botNextU = verts[bot[bi + 1] * 3];
            const topNextU = verts[top[ti + 1] * 3];
            const SWEEP_EPS = 1e-8;
            if (botNextU < topNextU - SWEEP_EPS) {
                emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
                // Diagonal connects top[ti] to bot[bi+1]
                diagEdges.push([top[ti], bot[bi + 1]]);
                bi++;
            } else if (topNextU < botNextU - SWEEP_EPS) {
                emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
                diagEdges.push([bot[bi], top[ti + 1]]);
                ti++;
            } else {
                // Tie-break (same as existing logic)
                const minA = minAngle2D(/* ... */);
                const minB = minAngle2D(/* ... */);
                if (minA >= minB) {
                    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
                    diagEdges.push([top[ti], bot[bi + 1]]);
                    bi++;
                } else {
                    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
                    diagEdges.push([bot[bi], top[ti + 1]]);
                    ti++;
                }
            }
        }
    }
}
```

Then in `constrainedSweepCell`:
- For chain-on-both-sides 2×2: use `chainFanQuad` → `fanDiagEdges`
- For N×M / degenerate: use `sweepQuadTracked` → `sweepDiagEdges` (new collector)
- For non-chain cells: keep using plain `sweepQuad` (no tracking needed)

In PEC, merge `sweepDiagEdges` into `constraintEdgeSet` same as `fanDiagEdges`.

**BUT wait — should we lock ALL sweep diagonals in chain cells?** 

The concern is that locking a bad diagonal prevents CSO from improving it. However:
- The sweep diagonal is a *reasonable* heuristic choice (U-comparison + min-angle tie-break)
- The CSO flip is what CAUSES the dip (inconsistent row-by-row diagonal orientation)  
- Consistency matters more than individual triangle quality for surface smoothness

So yes, locking sweep diagonals in chain cells is the right call. The CSO should not touch these — they're part of the chain topology.

**Files affected**:
- `OuterWallTessellator.ts`: New `sweepQuadTracked` function (~40 lines), chain-on-both-sides `chainFanQuad` addition (~8 lines), new collector + return field (~5 lines)
- `ParametricExportComputer.ts`: +3 lines to extract and merge `sweepDiagEdges`
- `OuterWallResult` interface: +1 field

**Assumptions** (for Verifier to attack):
1. Locking sweep diagonals in chain cells does not degrade overall mesh quality below the improvement from consistency
2. The `sweepQuadTracked` diagonal tracking correctly identifies the internal diagonal edges (not boundary edges)
3. Both-sides 2×2 sub-quads benefit from the same fan diagonal strategy as one-side 2×2 sub-quads
4. Only chain cells need tracked sweeps — non-chain cells can use plain `sweepQuad`
5. The diagonal that `sweepQuad` chooses is reasonable enough to lock — i.e., CSO's improvement from flipping these is less valuable than the consistency gained by preventing flips

---

### Proposal P3C: Constrain Only Chain-Grid Diagonal Edges (Radical alternative)

**Idea**: Instead of modifying OWT and adding tracked sweeps, work at the CSO level. Add a filter that prevents CSO from flipping any edge where exactly one endpoint is a chain vertex (index ≥ `outerGridVertexCount`) AND the other is a grid vertex — the exact population `isChainGridEdge` identifies.

**Mechanism**: 

In `ChainStripOptimizer.ts`, before Phase A, build a set of all chain-grid edges from the current triangulation:

```typescript
// Pre-scan: build chain-grid edge constraint set
const chainGridConstraints = new Set<bigint>();
for (let t = 0; t < outerIdxCount; t += 3) {
    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
    const edges: [number, number][] = [[a, b], [b, c], [c, a]];
    for (const [v0, v1] of edges) {
        if (isChainGridEdge(v0, v1)) {
            chainGridConstraints.add(edgeKey(v0, v1));
        }
    }
}
// Merge into constraintEdgeSet
for (const ek of chainGridConstraints) constraintEdgeSet.add(ek);
```

**Trade-off**: This is the fastest to implement (~10 lines in CSO) but it's a blunt instrument. It prevents CSO from flipping ANY chain-grid edge, not just those in chain cells. Some chain-grid edges may legitimately benefit from flipping (e.g., boundary transitions).

**Verdict**: Could work as a quick validation step. If it eliminates the dips, it confirms the root cause and buys time for the more surgical P3B approach.

**Assumptions** (for Verifier to attack):
1. ALL chain-grid edge flips are harmful (not just those in chain cells)
2. No legitimate quality improvements come from flipping chain-grid edges
3. The blunt constraint doesn't create quality regressions at chain-grid transitions

---

## Recommended Approach

### Phase 2 (P2): Post-OWT Interpolated Re-snap → **Implement**
- High confidence this addresses the ~0.71mm positional error on 40.7% of chain vertices
- Reuses existing, proven GPU re-snap infrastructure (copy-paste from Step 3.5 with minor adaptations)
- Clean pipeline placement: after OWT, before Phase 3 GPU eval
- Low risk: tolerance bound prevents runaway, and the vertex positions only get MORE accurate
- ~55 lines of new code total

### Phase 3 (P3): Sweep Diagonal → **Implement P3B** (chain-aware sweep + tracked diagonals)
- P3B is the architecturally right solution — it makes the OWT output consistent AND protected
- Fixes the 2×2 both-sides case (use `chainFanQuad`) and the N×M case (tracked sweep)
- ~50 lines of new code total
- **Consider P3C as a quick validation** before implementing P3B — if adding all chain-grid edges to constraintEdgeSet eliminates the 1170 flips and the dip disappears, it confirms the root cause with 10 lines of code

### Phasing recommendation:
1. **Quick validation (15 min)**: Implement P3C in CSO to verify root cause C
2. **P2 implementation**: Expose interpolated vertices from OWT, add post-OWT re-snap in PEC
3. **P3B implementation**: Add `sweepQuadTracked`, chain-on-both-sides `chainFanQuad`, sweep diagonal collection
4. **Remove P3C**: Once P3B is in place (it's a superset), P3C's blunt constraint can be removed if desired — or kept as belt-and-suspenders

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| P2 re-snap moves vertex too far, causing triangle inversion | Low | Medium | Tolerance bound (0.08), UV winding diagnostic catches it |
| P2 re-snap finds no better position (feature absent at interpolated row) | Medium | None | Falls through harmlessly — vertex keeps its interpolated position |
| P3B tracked sweep misidentifies diagonal edges | Low | Medium | Unit test: verify tracked edge count = triangle count - 1 for any sweep |
| P3B locking sweep diagonals degrades mesh quality | Low | Low | CSO still operates on non-chain cells (majority of mesh) |
| `batch2Remap` eliminates interpolated vertices before re-snap | Low | Low | Only merges vertices within 1e-4 of grid columns; most interpolated vertices aren't near grid columns |
| P2 GPU re-snap adds export latency | Low | Low | ~2516 vertices × 32 candidates = 80K GPU probes, <50ms on any GPU |

## Validation Protocol

1. **Export with logging**: Check `R46 interp re-snap: N/M interpolated vertices refined` — expect N > 0
2. **Check sweep flip count**: `chainGridFlips` should drop from 1170 to ~0 after P3B/P3C
3. **Visual inspection**: Export same style that showed dips, compare ridge sharpness
4. **Diagnostic comparisons**:
   - Before: `interpolated: 2516`, `chainGridFlips=1170`
   - After P2: `interpolated: 2516`, re-snap count > 0, ridges sharper
   - After P3: `chainGridFlips=0` (or near-zero)
5. **Regression**: Run `npm test` — all 1881 tests pass
6. **Typecheck + lint**: `npm run typecheck && npm run lint` clean

## Open Questions

1. **Window width for interpolated re-snap**: The Step 3.5 re-snap uses ±2 sample widths (±0.000244 in U-space = ±2mm at typical circumference). For interpolated vertices with ~0.71mm error, this window might be tight. Should we use a wider window (±4 or ±8 sample widths)?

2. **batch2Remap interaction**: If an interpolated vertex gets merged with a grid vertex (within 1e-4 in U), should we re-snap the GRID vertex or skip it? Re-snapping a grid vertex could affect grid regularity. Current proposal: re-snap using post-remap index but this targets the grid vertex's position — is that safe?

3. **Should P3B also handle the degenerate fallthrough** (L345, L372 — `subBot.length < 2 || subTop.length < 2`)? These are A2 guards for collapsed edges. If they produce diagonals, they could also be CSO-flipped. However, degenerate triangles are likely rare enough to not matter for the dip issue.

4. **P3C vs P3B**: If P3C (blunt constraint) completely eliminates dips, is P3B still worth the implementation complexity? P3C is simpler but conceptually less clean. The Verifier should weigh in on whether the blunt constraint has hidden quality costs.
