# Generator Round 1 — R46 Phase 3: Subdivision Midpoint Re-snap for Chain Edges

Date: 2026-03-08

## Problem Statement

When `subdivideLongEdges()` splits chain edges, midpoints are placed at the UV average of the two endpoints:

```typescript
// MeshSubdivision.ts, Phase B (line ~541)
midUVBatch[i * 3] = midpointWrappedU(combinedVerts[se.v0 * 3], combinedVerts[se.v1 * 3]);
midUVBatch[i * 3 + 1] = (combinedVerts[se.v0 * 3 + 1] + combinedVerts[se.v1 * 3 + 1]) * 0.5;
```

The UV average yields a point ON the surface (GPU evaluates it) but NOT on the ridge. The ridge at the midpoint row has its own U determined by the mathematical surface. With `maxConsecDelta ≈ 0.008`, midpoints can be off-ridge by ~0.004 U ≈ 1.25mm in 3D.

**Result**: A zigzag pattern where original chain vertices (on-ridge) alternate with subdivision midpoints (off-ridge). 8,632 chain edges were split per the R44 diagnostic, each inserting one off-ridge midpoint. This is Root Cause D of the persistent dip artifacts.

## Root Cause Analysis

### The Chain Edge Topology

Chain edges connect consecutive chain vertices along a feature chain (peak or valley ridge). Each chain vertex has been GPU re-snapped to the true mathematical extremum at its row's T coordinate (Step 3.5 in PEC, accuracy ~±0.00006 U).

When a chain edge spans two adjacent rows (row j → row j+1), the edge's 3D length often exceeds the `chainSubdivThreshold2` (0.50× avgVertGridEdge), triggering a split.

### Where the Error Enters

The subdivision midpoint at UV `(midU, midT)` is:
- `midU = midpointWrappedU(u_j, u_{j+1})` — the circular average of the two endpoint U values
- `midT = (t_j + t_{j+1}) / 2` — the linear average of the two T values

The U average is the problem. The ridge trajectory `U_ridge(T)` is not linear in UV space — it curves. The deviation is:

```
error_U = U_ridge(midT) - (u_j + u_{j+1}) / 2
```

For ridges with curvature in UV space, this error is proportional to `Δu × κ` where κ is the UV-space curvature of the ridge path. The diagnostic shows `maxConsecDelta = 0.008`, so the worst-case error is `~0.004 U`, which at typical pot circumferences (300mm) maps to `~1.2mm` — highly visible.

### Why This Creates Zigzag

Along the edge chain: vertex 0 (on-ridge), midpoint 0-1 (off-ridge), vertex 1 (on-ridge), midpoint 1-2 (off-ridge), ... The alternation creates a sawtooth waveform at twice the row frequency, exactly the pattern observed as "dips."

### Key Observation

Phase 2's interp re-snap already solved the identical problem for OWT-interpolated chain vertices. That code (PEC lines 1473-1582) uses:
1. Candidate generation: 32-64 U samples around the current U
2. GPU evaluation of all candidates
3. Radius extremum search (max for peaks, min for valleys)
4. Parabolic sub-sample refinement
5. Guarded update (max delta = 0.08, min move = 1e-7)

The same pattern applies perfectly to subdivision midpoints, with one architectural question: do we do it inside `subdivideLongEdges` or outside?

## Proposals

### Proposal 1: In-Place Re-snap Within MeshSubdivision.ts (Conservative) ❌

**Idea**: After the initial `evaluateMidpoints(midUVBatch)` call in Phase B, identify which midpoints came from chain-edge splits, generate re-snap candidates, call `evaluateMidpoints` again, find the radius extremum, and replace the midpoint 3D position.

**Mechanism**:
1. In the Phase A split collection, tag each split as chain vs non-chain (info already available via `constraintEdgeSet`)
2. After `mid3D = await evaluateMidpoints(midUVBatch)`, for each chain-edge midpoint:
   - Generate 32 U candidates around `midUVBatch[i*3]` within ±2 sample widths
   - Build a second UV batch with all candidates
3. `resnap3D = await evaluateMidpoints(resnapBatch)` — second GPU call
4. For each chain midpoint, find the radius extremum among its 32 candidates
5. Apply parabolic refinement, update `mid3D[i*3..i*3+2]` with the best position

**Problem**: MeshSubdivision doesn't know the chain `kind` (peak vs valley) — it only has `constraintEdgeSet` (a set of edge keys) and `chains` typed as `ChainUV[]` (no `kind` field). We'd need to either:
- Extend `ChainUV` to include `kind` 
- Or pass additional metadata

**Trade-offs**:
- ✅ Self-contained — all re-snap logic in one module
- ✅ No interface changes to `SubdivisionResult`
- ❌ Requires extending `ChainUV` with `kind` or adding a new parameter
- ❌ `MeshSubdivision.ts` grows in complexity for a concern (ridge finding) that arguably belongs to PEC
- ❌ No vertex→chain mapping exists inside subdivision — building one requires matching vertex UV positions to chain point UVs, which is approximate

### Proposal 2: Return Chain Midpoint Metadata, Re-snap in PEC (Moderate) ✅ RECOMMENDED

**Idea**: Have `subdivideLongEdges` tag and return metadata about chain-edge midpoints, then PEC handles the re-snap using its existing Phase 2 infrastructure. PEC already has `meshChains` (with `kind`), the `evaluatePoints` binding, `circularDistance`, and an established re-snap pattern.

**Mechanism**:

#### A. MeshSubdivision changes (minimal)

1. **Track chain-edge midpoints**: During Phase A, for each split from a chain edge, record `{splitIndex, edgeKey}`.
2. **After Phase C** (splitting applied): compute the final vertex index for each chain midpoint (`resultData.length / 3 + i` for the i-th new vertex).
3. **Return metadata** in `SubdivisionResult`:

```typescript
interface ChainMidpointInfo {
    /** Final vertex index in the grown resultData */
    vertexIdx: number;
    /** UV of the midpoint as initially placed (the average) */
    u: number;
    /** T coordinate of the midpoint */
    t: number;
    /** Edge key (for chain→vertexChainId lookup in PEC) */
    v0: number;
    v1: number;
}
```

4. **New field on `SubdivisionResult`**: `chainMidpoints: ChainMidpointInfo[]`

#### B. PEC changes (re-snap block after subdivision)

After the `subdivideLongEdges` call (PEC ~line 1770), insert a re-snap block that mirrors Phase 2:

```
// ── R46 Phase 3: Post-subdivision GPU re-snap for chain-edge midpoints ──
if (subdivResult.chainMidpoints.length > 0 && cfgGpuResnap) {
    const CANDS = 32;
    const SAMPLE_WIDTH = 1.0 / ROW_PROBE_SAMPLES;
    const HALFWIDTH = 2.0 * SAMPLE_WIDTH;
    const MAX_SUBDIV_DELTA = 0.08;

    // Build candidate UV batch
    const midCount = subdivResult.chainMidpoints.length;
    const totalProbes = midCount * CANDS;
    const resnapVerts = new Float32Array(totalProbes * 3);
    let rIdx = 0;
    for (const cm of subdivResult.chainMidpoints) {
        const step = (2 * HALFWIDTH) / (CANDS - 1);
        for (let k = 0; k < CANDS; k++) {
            let uCandidate = cm.u - HALFWIDTH + k * step;
            uCandidate = ((uCandidate % 1) + 1) % 1;
            resnapVerts[rIdx++] = uCandidate;
            resnapVerts[rIdx++] = cm.t;
            resnapVerts[rIdx++] = 0; // outer wall
        }
    }

    // GPU evaluate all candidates
    const resnapPositions = await this.evaluatePoints(resnapVerts, ...);

    // For each midpoint, find ridge extremum
    let subdivResnapCount = 0;
    for (let i = 0; i < midCount; i++) {
        const cm = subdivResult.chainMidpoints[i];

        // Determine peak vs valley from parent chain
        // Use outerChainVertexChainIds to find chainId for v0 or v1
        const chainId = outerChainVertexChainIds.get(cm.v0)
                     ?? outerChainVertexChainIds.get(cm.v1);
        const parentChain = chainId !== undefined ? meshChains[chainId] : undefined;
        const isMax = !parentChain?.kind || parentChain.kind === 'peak';

        // Extract radii
        const candidateRadii = new Float32Array(CANDS);
        for (let k = 0; k < CANDS; k++) {
            const off = (i * CANDS + k) * 3;
            const x = resnapPositions[off];
            const y = resnapPositions[off + 1];
            candidateRadii[k] = Math.sqrt(x * x + y * y);
        }

        // Find best (max radius for peak, min for valley)
        let bestK = 0, bestR = candidateRadii[0];
        for (let k = 1; k < CANDS; k++) {
            if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                bestR = candidateRadii[k];
                bestK = k;
            }
        }

        // Parabolic refinement
        const step = (2 * HALFWIDTH) / (CANDS - 1);
        let finalU: number;
        if (bestK > 0 && bestK < CANDS - 1) {
            const L = candidateRadii[bestK - 1];
            const C = candidateRadii[bestK];
            const R = candidateRadii[bestK + 1];
            const denom = L - 2 * C + R;
            let delta = 0;
            if (Math.abs(denom) > 1e-14) {
                delta = 0.5 * (L - R) / denom;
                delta = Math.max(-0.5, Math.min(0.5, delta));
            }
            finalU = cm.u - HALFWIDTH + (bestK + delta) * step;
        } else {
            finalU = cm.u - HALFWIDTH + bestK * step;
        }
        finalU = ((finalU % 1) + 1) % 1;

        // Re-evaluate at the refined U to get exact 3D position
        // (Use the closest candidate's position as approximation,
        //  or batch-evaluate the refined U values afterward)
        const moved = circularDistance(cm.u, finalU);
        if (moved > 1e-7 && moved < MAX_SUBDIV_DELTA) {
            // Update the vertex's 3D position: re-evaluate at (finalU, cm.t)
            // We'll batch these refined positions in a second GPU call
            subdivResnapCount++;
        }
    }

    // Final GPU evaluation of refined U positions → exact 3D
    // Update finalResultData[cm.vertexIdx * 3 .. +2] for each moved midpoint
}
```

**Key detail**: After finding the optimal U via parabolic refinement, we need ONE more GPU evaluation pass to get the exact 3D position at `(finalU, cm.t)`. The Phase 2 interp re-snap avoids this by only updating `combinedVerts` (the UV buffer) and relying on the downstream GPU evaluation (Phase 3: evaluatePoints). But for subdivision midpoints, Phase 3 has already run — the midpoints are already in `finalResultData`. So we need either:

**Sub-option 2a**: Two GPU calls — one for candidates, one for the refined U values → replace `finalResultData[vertexIdx*3..+2]`.

**Sub-option 2b**: One GPU call — use the best candidate's 3D position directly (skip parabolic refinement's sub-sample U, use the discrete best candidate). Precision loss: ~1/(2×32) × halfwidth ≈ 0.000004 U ≈ 0.001mm — negligible.

I recommend **Sub-option 2b**: use the discrete best candidate's 3D position. The parabolic refinement of U is nice for correctness, but the actual 3D position from the nearest candidate is already within 0.001mm of the true ridge — far below the 1.2mm error we're fixing.

**Trade-offs**:
- ✅ Leverages PEC's existing infrastructure (meshChains, chainVertexChainIds, evaluatePoints, circularDistance)
- ✅ Clear separation of concerns: MeshSubdivision reports what it split, PEC decides what to do about ridge accuracy
- ✅ Single additional GPU call (~8.6K × 32 = ~276K evaluations — same scale as Phase 2's ~70K, trivial perf)
- ✅ All chain kind information available in PEC without interface gymnastics
- ✅ Pattern mirrors Phase 2, easy for future agents to understand
- ❌ Requires adding `chainMidpoints` field to `SubdivisionResult`
- ❌ Grows PEC by ~50 lines (but in a well-understood pattern)

**Assumptions** (for Verifier to attack):
1. `outerChainVertexChainIds` maps vertex indices from both endpoints of every chain edge — if a chain edge (v0, v1) was split, at least one of v0/v1 should be in this map, giving us the chain ID and thus the chain kind.
2. The `constraintEdgeSet` membership in Phase A correctly identifies chain-to-chain edges (not just chain↔grid cross-edges).
3. 32 candidates within ±2 sample widths is sufficient for subdivision midpoints (same window as Step 3.5 re-snap).
4. The discrete best candidate (Sub-option 2b) provides sufficient accuracy — the 3D position error from using the discrete candidate vs the parabolic-refined U is ~0.001mm, negligible vs the 1.2mm error being fixed.
5. The `finalResultData` array from subdivision can be mutated in-place after the subdivision call returns (no copy-on-write or immutability constraints).
6. The T coordinate of the midpoint `(t_j + t_{j+1})/2` is correct and doesn't need re-snapping — only U needs correction. (T is straightforward linear interpolation between two adjacent physical rows; the feature lies at a specific U for each T, not at a specific T.)

### Proposal 3: Improved UV Estimation Without GPU Re-snap (Conservative/Cheap) ❌

**Idea**: Instead of using `(u0 + u1) / 2`, predict the ridge U at the midpoint T using quadratic interpolation from the chain's neighboring points.

**Mechanism**: For a chain edge between points at rows i and i+1, use points at rows i-1, i, i+1 (or i, i+1, i+2) to fit a quadratic `U(T)` and evaluate at `T_mid`.

**Why I reject this**:
1. Chains can have as few as 2-3 points — not enough for reliable quadratic fitting
2. The ridge trajectory can be non-polynomial (superformula ridges are NOT parabolic)
3. At chain endpoints (first/last point), there's no neighbor in one direction
4. Accuracy is unquantifiable without the GPU — we'd be guessing instead of measuring
5. The GPU re-snap cost is trivial (~276K evaluations), so there's no performance justification for the lesser approach

## Recommended Approach

**Proposal 2 with Sub-option 2b** — return chain midpoint metadata from `subdivideLongEdges`, re-snap in PEC using the best discrete candidate.

### Exact Code Placement

#### MeshSubdivision.ts

1. **New type** (after `SubdivisionStats`, ~line 103):
```typescript
export interface ChainMidpointInfo {
    vertexIdx: number;  // final vertex index in grown resultData
    u: number;          // initial midpoint U (the circular average)
    t: number;          // midpoint T
    v0: number;         // original chain edge endpoint vertex index
    v1: number;         // original chain edge endpoint vertex index
}
```

2. **New field on `SubdivisionResult`** (~line 115):
```typescript
chainMidpoints: ChainMidpointInfo[];
```

3. **Phase A tagging** (~line 489, in the split collection loop):
After `splitsToApply.push(...)`, if the edge is a chain edge, also add to a parallel `chainSplitIndices: number[]` tracking which indices in `splitsToApply` are chain edges.

4. **Phase C metadata collection** (~line 560, after splits are applied):
After the `for (let i ...)` loop that applies splits, iterate `chainSplitIndices` to build the `ChainMidpointInfo[]` array. The vertex index for split `i` is `resultData.length / 3 + i` (the order of `newVerts` matches `splitsToApply` order).

5. **Return value** (~line 609):
Add `chainMidpoints` to the return object.

#### ParametricExportComputer.ts

6. **After subdivision call** (~line 1770, after the `console.log` for subdivision stats):
Insert the re-snap block. Key differences from Phase 2 interp re-snap:
- Source: `subdivResult.chainMidpoints` instead of `outerInterpolatedChainVertices`
- Target: `finalResultData` (3D positions) instead of `combinedVerts` (UV)
- Update: replace `finalResultData[vertexIdx*3..+2]` with the best candidate's 3D position
- No need to update `combinedVerts` — downstream code doesn't re-evaluate subdivision midpoints

### Expected Impact

- **8,632 chain-edge midpoints** currently off-ridge by up to ~1.2mm
- After re-snap, each midpoint will be within ~0.001mm of the true ridge (discrete candidate resolution)
- The zigzag alternation between on-ridge originals and off-ridge midpoints is eliminated
- Performance cost: one additional GPU call evaluating ~276K UV candidates — expected <5ms based on Phase 2 benchmarks

### Diagnostic Logging

Add a log line consistent with the Phase 2 pattern:
```
[ParametricExport]   R46 subdiv re-snap: {count}/{total} refined
```

## Risks and Edge Cases

### Risk 1: Chain Edge Endpoints Not in outerChainVertexChainIds
If a chain edge's endpoints are grid vertices (UV-snapped to chain positions in the v20.x path), they might not appear in `outerChainVertexChainIds`. 

**Mitigation**: Fall back to `isMax = true` (peak) — peaks are more common than valleys, and the worst case is a valley midpoint re-snapped to a local peak (which would be caught by the max-delta guard). Alternatively, build a vertex→chain lookup from `combinedVerts` UV positions matched against `meshChains` points.

### Risk 2: Seam-Crossing Chain Edges
Chain edges near U=0/U=1 wrap around. The `midpointWrappedU` already handles circular averaging, and candidate generation uses `((u % 1) + 1) % 1` wrapping. The re-snap search window is ±2 sample widths (~0.00024 U), well within the seam safety margin.

### Risk 3: Midpoints Between Rows of Different Surfaces
All chain edges are on the outer wall (surface 0). The midpoint surfaceId is copied from the endpoint: `midUVBatch[i * 3 + 2] = combinedVerts[se.v0 * 3 + 2]`. This is correct.

### Risk 4: Double Re-snap
Phase 2 re-snaps interpolated chain vertices BEFORE subdivision. Subdivision then splits chain edges whose endpoints have already been re-snapped. The new Phase 3 re-snap applies to the subdivision midpoints (new vertices), not the endpoints. There is no double application.

### Risk 5: combinedVerts Not Grown
After subdivision, `combinedVerts` is NOT grown — only `resultData` is. But we only need `combinedVerts` for the initial UV values. The re-snap block generates candidates from `ChainMidpointInfo.u` and `ChainMidpointInfo.t`, which are already captured before the array growth. This is safe.

## Open Questions

1. **Should we also store the corrected U in combinedVerts?** Currently `combinedVerts` is not grown during subdivision, so midpoint UVs are lost. If any downstream code needs the UV of a subdivision midpoint, we'd need to grow `combinedVerts` too. I believe no downstream code needs it — the boundary diagnostic and mesh diagnostic tools use `finalResultData` (3D). Verifier should confirm.

2. **Is 32 candidates sufficient, or should we use 64 for chain edges with large gaps?** Phase 2 uses adaptive window sizing (`gapSize² × 0.001`). Subdivision midpoints are between adjacent rows (gap = 1 row), so the window is narrow and 32 candidates should be fine. But if there are chain-guided inserted rows (Step 4) creating non-adjacent row pairs, the gap could be larger.

3. **Should we re-snap non-chain feature edges (cross-edges) too?** Cross-edges (grid↔chain) also get subdivision midpoints, but these midpoints are at the grid/chain boundary — they don't need to be on the ridge. Only chain-to-chain midpoints need ridge re-snap.

4. **Can we skip the re-snap entirely for midpoints where both endpoints have identical U?** If `u0 == u1` (ridge is purely vertical in UV space), the midpoint U is already correct. This would skip ~40% of chain midpoints (estimated from typical chain structures) at zero cost. Verifier should assess if this optimization is worth the added branching.
