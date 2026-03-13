# Generator Round 48 — Feature Chain Position Accuracy: Final Root Causes
Date: 2026-03-09

## Problem Statement

After R46 (3 phases) and R47 (2 fixes), feature chains in the exported STL STILL do not sit
at the true mathematical ridge/valley edge and STILL show waviness/dips. All vertex-position
fixes and topology fixes have been validated (typecheck clean, lint clean, 1903 tests pass), yet
the artifact persists.

The Master identifies three remaining root causes: **E** (R47 P3 smoothing is counter-productive),
**F** (183 un-refined interpolated vertices), and **G** (fan diagonal slivers at 38.6%).

This round also finalizes the **P2 fan midpoint insertion** design incorporating Verifier
amendments A5/A6/A7, adds a **ridge-distance diagnostic**, and searches for any remaining
displacement sources.

---

## Assessment of Root Cause E: R47 P3 Smoothing is Counter-Productive

### Confirmed — R47 P3 should be REMOVED entirely

**Mathematical argument:**

The smoothing formula at [ParametricExportComputer.ts lines 1590-1672](src/renderers/webgpu/ParametricExportComputer.ts#L1590):

```typescript
smoothedU = resnappedU + α × (expectedU - resnappedU)
```

where `expectedU` = linear interpolation between flanking primary vertices along T.

This formula has a **fundamental false assumption**: that the true ridge path between
two primary vertices is a straight line in U-T space. This is wrong for any ridge with
non-zero curvature in U as a function of T.

**Proof by example:** Consider a ridge that curves as `U_ridge(t) = 0.25 + 0.005 × sin(2πt/T_span)` between two primaries at T=0.3 and T=0.5. The primary vertices sit at:
- `U_lo = U_ridge(0.3) = 0.25 + 0.005 × sin(3πΔ)` 
- `U_hi = U_ridge(0.5) = 0.25 + 0.005 × sin(5πΔ)`

Linear interpolation `expectedU(t)` gives a straight line between these two U values.
The actual ridge `U_ridge(t)` follows the sinusoidal curve.

At an interpolated vertex at T=0.4, R46 Phase 2 correctly re-snaps to `U_ridge(0.4)`.
Then R47 P3 pulls it α × 33.6% of the way back toward `expectedU(0.4)` = the **linear**
estimate.

**For a 4-row gap (gapSize=4, α=0.60):**
- Ridge deviation from linear at midpoint: `~0.005 × (1 - cos(π/5)) ≈ 0.002 U`
- Smoothing displacement: `0.60 × 0.002 = 0.0012 U`
- In 3D: `0.0012 × 2π × R ≈ 0.0012 × 2π × 120mm ≈ 0.9mm`
- This is **clearly perceptible** on a 3D print

**For a 2-row gap (gapSize=2, α=0.30):**
- Ridge deviation from linear at midpoint: `~0.005 × (1 - cos(π/3)) ≈ 0.0025 U`
- Smoothing displacement: `0.30 × 0.0025 = 0.00075 U ≈ 0.56mm`
- Still perceptible

**The core issue**: R46 Phase 2 GPU re-snaps **correctly** find the true extremum using
actual parametric surface evaluation — this is the gold standard for position accuracy.
R47 P3 then replaces ~α fraction of that accurate position with an inaccurate linear
estimate. The cure is worse than the disease.

**Evidence from metrics**: Sliver rate INCREASED from 37.1% → 38.6% after R47 P3.
This confirms that the smoothing moved vertices to positions that create worse local
geometry, not better.

**The original motivation for P3 was wrong**: P3 was designed to reduce "re-snap noise"
on sharp features. But the Verifier's C1 analysis in R47 showed that noise at gapSize=1
is only ±0.000016 U — 10× smaller than originally estimated. The smoothing "fix" causes
more displacement than the noise it was meant to address, for all gap sizes.

**Recommendation**: 

### Proposal E1: Remove R47 P3 smoothing entirely

Delete the entire "R47 Phase 2b: Neighbor-constrained re-snap smoothing" block at
[PEC lines 1590-1672](src/renderers/webgpu/ParametricExportComputer.ts#L1590).

**Mathematical justification**: GPU re-snap with parabolic refinement is the most accurate
position estimator available. Any post-hoc blending toward a less accurate estimate (linear
interpolation) can only degrade accuracy. The noise floor of GPU re-snap (±0.000016 U at
gapSize=1, ±0.000159 U at gapSize=4) is far below the displacement caused by smoothing
(0.00075-0.0012 U).

**Assumptions** (for Verifier):
1. GPU re-snap with 32-64 candidates + parabolic refinement is strictly more accurate than linear interpolation for determining ridge U position
2. The residual noise after parabolic refinement is sub-perceptible (< 0.1mm) at all gap sizes
3. The sliver rate increase (37.1% → 38.6%) is causally attributable to P3 smoothing, not to confounding from P1

---

## Assessment of Root Cause F: 183 Un-Refined Interpolated Vertices

### Confirmed — requires diagnosis and remediation

**Analysis:**

R46 Phase 2 at [PEC line 1558](src/renderers/webgpu/ParametricExportComputer.ts#L1558) applies
the re-snap rejection criterion:

```typescript
const moved = circularDistance(currentU, finalU);
if (moved > 1e-7 && moved < MAX_INTERP_DELTA) {
    combinedVerts[iv.vertexIdx * 3] = finalU;
    interpResnapCount++;
}
```

A vertex is NOT refined when either:
- **Case 1**: `moved <= 1e-7` — the re-snap found the same position (already correct), OR
- **Case 2**: `moved >= MAX_INTERP_DELTA (0.08)` — the re-snap jumped too far (wrong extremum)

183 out of 2190 vertices fail = 8.3%. We need to know which case dominates.

### Proposal F1: Diagnostic — classify un-refined vertices

Add a diagnostic counter to the Phase 2 re-snap loop that separates the two cases:

```typescript
let interpResnapCount = 0;
let interpAlreadyCorrect = 0;    // moved <= 1e-7
let interpOvershoot = 0;         // moved >= MAX_INTERP_DELTA
// ... existing loop ...
if (moved > 1e-7 && moved < MAX_INTERP_DELTA) {
    combinedVerts[iv.vertexIdx * 3] = finalU;
    interpResnapCount++;
} else if (moved <= 1e-7) {
    interpAlreadyCorrect++;
} else {
    interpOvershoot++;
}
```

Log result:
```
R46 interp re-snap: 2007/2190 refined, 
    already-correct=N, overshoot=M (MAX_INTERP_DELTA=0.08)
```

**If most are "already-correct"**: The 183 are benign — they're at primary-grid column intersections where the linear interpolation U happens to coincide with the true ridge U. No action needed.

**If most are "overshoot"**: The search window found a WRONG extremum beyond the search radius. Two sub-cases:
- (a) Feature kind mismatch: the vertex belongs to a valley chain but the re-snap searched for a peak (or vice versa). Check `parentChain.kind` assignment.
- (b) Window too narrow: the true extremum is beyond `MAX_INTERP_DELTA = 0.08`. This is 80× the column spacing — if the true ridge is that far away, the interpolated vertex was placed very wrongly by OWT.
- (c) Seam proximity: vertices near U=0 or U=1 may find an extremum on the wrong side of the seam wrap.

### Proposal F2: Remediation for overshoot cases

If the diagnostic shows significant overshoot cases (>20), add a **second-pass re-snap**
with expanded window and additional guards:

```typescript
// Second pass: re-try failed vertices with wider window + stricter constraints
for (const failedIdx of overshootVertices) {
    const iv = outerInterpolatedChainVertices[failedIdx];
    const parentChain = meshChains[iv.chainId];
    
    // Use neighboring primary vertices to constrain the search window
    // instead of the fixed MAX_INTERP_DELTA
    const [prevPrimaryU, nextPrimaryU] = findBracketingPrimaries(iv, parentChain);
    const constrainedHW = circularDistance(prevPrimaryU, nextPrimaryU) * 0.5;
    
    // Re-snap within the constrained window
    // ... same candidate/parabolic logic but with constrainedHW ...
}
```

**This is a targeted fix**: only applies to the small number of overshoot vertices, using
their chain context to constrain the search.

**Assumptions**:
1. The dominant failure mode is overshoot, not already-correct (needs validation)
2. Bracketing primaries provide a valid search bound (the ridge doesn't leave the U range between adjacent primaries)
3. Seam-crossing vertices are correctly handled by the wrap-around logic

---

## Proposal G: P2 Fan Midpoint Insertion (Finalized Design)

### Incorporating Verifier Amendments A5/A6/A7

**Key constraint from A7**: Fan midpoint insertion must happen AFTER the first GPU eval,
between GPU eval and CSO. This gives us 3D positions to compute aspect ratios accurately.

### Pipeline Position

Current pipeline (relevant section):
```
OWT → interp re-snap (Phase 2) → [R47 P3 smoothing — TO BE REMOVED] →
GPU eval → chainDirectedFlip → flipEdges3D →
[constraintEdgeSet built] → CSO → boundaryDiag →
MeshSubdivision → subdiv re-snap
```

New pipeline with P2:
```
OWT → interp re-snap (Phase 2) →
GPU eval →
★ P2: Fan midpoint insertion (3D aspect gating) ★ →
★ P2: Secondary GPU eval for midpoint vertices ★ →
chainDirectedFlip → flipEdges3D →
[constraintEdgeSet built — includes split sub-edges] → CSO → boundaryDiag →
MeshSubdivision → subdiv re-snap
```

### Data Structures

```typescript
/** Result of fan midpoint insertion pass */
interface FanMidpointResult {
    /** Updated 3D position array (original + new midpoint vertices) */
    resultData: Float32Array;
    /** Updated index buffer (split triangles replace originals) */
    indices: Uint32Array;
    /** Updated UV buffer (original + midpoint UVs) */
    combinedVerts: Float32Array;
    /** Number of midpoints inserted */
    insertedCount: number;
    /** Sub-edges replacing original fan diagonals (for constraintEdgeSet) */
    splitSubEdges: Array<[number, number]>;
    /** Original fan diagonal edges that were NOT split (still need protection) */
    unsplitFanEdges: Array<[number, number]>;
}
```

### Pseudocode

```typescript
function insertFanMidpoints(
    resultData: Float32Array,          // 3D positions from GPU eval
    combinedIdxs: Uint32Array,         // triangle index buffer
    combinedVerts: Float32Array,       // UV buffer (u, t, surfaceId)
    fanDiagonalEdges: Array<[number, number]>,  // from OWT
    ASPECT_THRESHOLD: number = 3.0,     // 3D aspect ratio trigger
): FanMidpointResult {
    
    // ── Step 1: Identify fan diagonals needing midpoints ──
    // Compute 3D aspect ratio for each fan diagonal's two triangles
    
    // Build edge→triangles adjacency from index buffer
    const edgeToTris = buildEdgeToTriMap(combinedIdxs);
    
    const toSplit: Array<{
        edgeIdx: number;        // index into fanDiagonalEdges
        v0: number;             // chain vertex
        v1: number;             // grid vertex
        tri0Offset: number;     // byte offset of triangle 0 in index buffer
        tri1Offset: number;     // byte offset of triangle 1 in index buffer
        opp0: number;           // opposite vertex of triangle 0
        opp1: number;           // opposite vertex of triangle 1
    }> = [];
    
    for (let i = 0; i < fanDiagonalEdges.length; i++) {
        const [v0, v1] = fanDiagonalEdges[i];
        
        // Find the two triangles sharing this edge
        const tris = findAdjacentTriangles(edgeToTris, v0, v1);
        if (!tris || tris.length !== 2) continue;
        
        // Compute 3D aspect ratio of both triangles
        const aspect0 = triangleAspect3D(resultData, tris[0].a, tris[0].b, tris[0].c);
        const aspect1 = triangleAspect3D(resultData, tris[1].a, tris[1].b, tris[1].c);
        const maxAspect = Math.max(aspect0, aspect1);
        
        if (maxAspect > ASPECT_THRESHOLD) {
            toSplit.push({
                edgeIdx: i,
                v0, v1,
                tri0Offset: tris[0].offset,
                tri1Offset: tris[1].offset,
                opp0: tris[0].opposite,
                opp1: tris[1].opposite,
            });
        }
    }
    
    if (toSplit.length === 0) {
        return {
            resultData, indices: combinedIdxs, combinedVerts,
            insertedCount: 0,
            splitSubEdges: [],
            unsplitFanEdges: [...fanDiagonalEdges],
        };
    }
    
    // ── Step 2: Compute UV midpoints for GPU evaluation ──
    const midpointUVBatch = new Float32Array(toSplit.length * 3);
    for (let i = 0; i < toSplit.length; i++) {
        const { v0, v1 } = toSplit[i];
        // UV midpoint (circular-aware for U)
        const u0 = combinedVerts[v0 * 3];
        const u1 = combinedVerts[v1 * 3];
        let uMid = midpointWrappedU(u0, u1);
        const tMid = (combinedVerts[v0 * 3 + 1] + combinedVerts[v1 * 3 + 1]) * 0.5;
        const surfId = combinedVerts[v0 * 3 + 2];  // surface 0 (outer wall)
        
        midpointUVBatch[i * 3]     = uMid;
        midpointUVBatch[i * 3 + 1] = tMid;
        midpointUVBatch[i * 3 + 2] = surfId;
    }
    
    // ── Step 3: GPU evaluate midpoints (secondary eval call) ──
    // This is a small batch (~2000-3000 vertices) — fast
    const mid3D = await evaluatePoints(midpointUVBatch, ...);
    
    // ── Step 4: Insert midpoint vertices and split triangles ──
    const nextIdx = resultData.length / 3;
    const newPositions: number[] = [];
    const newUVs: number[] = [];
    const splitSubEdges: Array<[number, number]> = [];
    const splitOriginalEdges = new Set<number>();  // indices into fanDiagonalEdges
    
    for (let i = 0; i < toSplit.length; i++) {
        const { edgeIdx, v0, v1, tri0Offset, tri1Offset, opp0, opp1 } = toSplit[i];
        const midIdx = nextIdx + i;
        
        // Add 3D position
        newPositions.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);
        
        // Add UV coordinates
        newUVs.push(
            midpointUVBatch[i * 3],
            midpointUVBatch[i * 3 + 1],
            midpointUVBatch[i * 3 + 2],
        );
        
        // Split tri0 (v0, v1, opp0) → (v0, midIdx, opp0) + (midIdx, v1, opp0)
        // Split tri1 (v0, v1, opp1) → (v0, midIdx, opp1) + (midIdx, v1, opp1)
        // (Preserving winding order — same logic as MeshSubdivision Phase C)
        splitTriangleAtMidpoint(combinedIdxs, tri0Offset, v0, v1, midIdx);
        // tri1: in-place replace + append new triangle
        splitTriangleAtMidpoint(combinedIdxs, tri1Offset, v0, v1, midIdx);
        // → 2 modified + 2 new triangles (net +2 tris)
        
        // A5: Record sub-edges for constraintEdgeSet
        splitSubEdges.push([v0, midIdx], [midIdx, v1]);
        splitOriginalEdges.add(edgeIdx);
    }
    
    // ── Step 5: Build updated arrays ──
    // Grow resultData with new 3D positions
    const updatedResultData = new Float32Array(resultData.length + newPositions.length);
    updatedResultData.set(resultData);
    for (let i = 0; i < newPositions.length; i++) {
        updatedResultData[resultData.length + i] = newPositions[i];
    }
    
    // Grow combinedVerts with new UVs
    const updatedVerts = new Float32Array(combinedVerts.length + newUVs.length);
    updatedVerts.set(combinedVerts);
    for (let i = 0; i < newUVs.length; i++) {
        updatedVerts[combinedVerts.length + i] = newUVs[i];
    }
    
    // A6: Unsplit fan edges = original edges NOT in splitOriginalEdges
    const unsplitFanEdges = fanDiagonalEdges.filter((_, i) => !splitOriginalEdges.has(i));
    
    return {
        resultData: updatedResultData,
        indices: updatedIndices,  // with appended new triangles
        combinedVerts: updatedVerts,
        insertedCount: toSplit.length,
        splitSubEdges,
        unsplitFanEdges,
    };
}
```

### Integration in PEC

At the PEC level, after GPU eval and before chainDirectedFlip:

```typescript
// ── R48 P2: Fan midpoint insertion (post-GPU, 3D aspect gated) ──
let fanMidpointSubEdges: Array<[number, number]> = [];
let remainingFanDiagEdges = outerFanDiagonalEdges;

if (cfgFanMidpoints && outerFanDiagonalEdges.length > 0) {
    const fanResult = insertFanMidpoints(
        resultData, combinedIdxs, combinedVerts,
        outerFanDiagonalEdges,
        3.0, // ASPECT_THRESHOLD
        (uvBatch) => this.evaluatePoints(
            uvBatch, uniformBuffer, styleParamBuffer, ...dummies
        ),
    );
    resultData = fanResult.resultData;
    combinedIdxs = fanResult.indices;
    combinedVerts = fanResult.combinedVerts;
    fanMidpointSubEdges = fanResult.splitSubEdges;
    remainingFanDiagEdges = fanResult.unsplitFanEdges;
    
    console.log(`[ParametricExport]   R48 fan midpoints: ` +
        `${fanResult.insertedCount}/${outerFanDiagonalEdges.length} ` +
        `diagonals split (3D aspect > 3.0)`);
}

// ... then at constraintEdgeSet construction:
const constraintEdgeSet = buildConstraintEdgeSet(outerChainEdges);

// R46: Protect unsplit fan diagonals
for (const [v0, v1] of remainingFanDiagEdges) {
    constraintEdgeSet.add(edgeKey(v0, v1));
}
// R48 A5: Protect split sub-edges
for (const [v0, v1] of fanMidpointSubEdges) {
    constraintEdgeSet.add(edgeKey(v0, v1));
}
```

### Triangle splitting detail

The `splitTriangleAtMidpoint` function mirrors the logic in [MeshSubdivision.ts lines 596-630](src/renderers/webgpu/parametric/MeshSubdivision.ts#L596):

```
Original triangle sharing edge (v0, v1):

    v0 ─────── v1          v0 ── M ── v1
    │ ╲         │          │  ╲ │ ╱  │
    │   ╲       │    →     │   ╲│╱   │
    │     ╲     │          │    │    │
    │       ╲   │          │         │
    opp ────────┘          opp ──────┘

Left tri:  (v0, M, opp)    [modifies existing tri in-place]
Right tri: (M, v1, opp)    [appended to index buffer]
```

Winding preservation: detect which edge of the existing triangle matches (v0,v1),
replace one endpoint with M in-place, and emit the complementary triangle.

### Expected Impact

- **6508 fan diagonals** → estimate ~60-70% have 3D aspect > 3.0 → ~4000 midpoints inserted
- Each midpoint splits 2 triangles into 4 → net +4000 triangles (8% increase in chain-strip count)
- **Sliver rate**: each split replaces 2 slivers (aspect > 4:1) with 4 better-shaped triangles
  → expected sliver rate drop from 38.6% to ~15-20%
- **GPU cost**: secondary eval of ~4000 vertices ≈ 50-100ms (2-5% of total export time)

### Assumptions (for Verifier):
1. The 3D aspect ratio threshold of 3.0 correctly identifies slivers needing splitting
2. UV midpoint → GPU eval produces an on-surface point closer to the ridge than the 3D midpoint of the fan diagonal endpoints
3. The secondary GPU eval is affordable (~4000 points, one call)
4. Modified index buffer (in-place overwrites + appends) doesn't violate any downstream assumptions about index buffer layout
5. `midpointWrappedU` correctly handles seam-crossing fan diagonals (U near 0/1)
6. The new midpoint vertices don't need re-snapping (they're placed at UV midpoint of a within-cell edge, not along a chain — their U position is not expected to be at a ridge extremum)

---

## Proposal H: Ridge-Distance Diagnostic

### Purpose

After all pipeline transformations, measure the **actual 3D distance** from each chain
vertex to the true ridge/valley position. This is the definitive metric for chain accuracy.

### Mechanism

For each chain vertex, we know:
- Its current 3D position (from `finalResultData`)
- Its UV position (from `combinedVerts`)
- Its chain kind (peak or valley)

We probe a small window around the vertex's U position at its T value, find the true
extremum, GPU-evaluate that extremum to get its 3D position, then compute the 3D distance.

### Pipeline Position

After all modifications (subdivision, re-snap, CSO, everything), before STL export.

### Pseudocode

```typescript
// ── R48 Diagnostic: Ridge-distance measurement ──
if (cfgRidgeDiagnostic && meshChains.length > 0) {
    const DIAG_WINDOW = 0.005;  // ±0.005 U search window
    const DIAG_CANDS = 64;      // candidate count
    
    // Collect all chain vertex indices and their chain IDs
    const chainVtxList: Array<{
        vertexIdx: number;
        chainId: number;
        isPrimary: boolean;
    }> = [];
    
    for (const [vtxIdx, chainId] of outerChainVertexChainIds) {
        chainVtxList.push({
            vertexIdx: vtxIdx,
            chainId,
            isPrimary: !interpIdxSet.has(vtxIdx),
        });
    }
    
    // Build probe points
    const probeUVs = new Float32Array(chainVtxList.length * DIAG_CANDS * 3);
    let pIdx = 0;
    for (const cv of chainVtxList) {
        const currentU = combinedVerts[cv.vertexIdx * 3];
        const currentT = combinedVerts[cv.vertexIdx * 3 + 1];
        const step = (2 * DIAG_WINDOW) / (DIAG_CANDS - 1);
        for (let k = 0; k < DIAG_CANDS; k++) {
            let u = currentU - DIAG_WINDOW + k * step;
            u = ((u % 1) + 1) % 1;
            probeUVs[pIdx++] = u;
            probeUVs[pIdx++] = currentT;
            probeUVs[pIdx++] = 0;  // outer wall
        }
    }
    
    const probePositions = await this.evaluatePoints(probeUVs, ...);
    
    // For each chain vertex, find the true extremum and compute distance
    let totalDist = 0, maxDist = 0, count = 0;
    let primaryTotalDist = 0, primaryMaxDist = 0, primaryCount = 0;
    let interpTotalDist = 0, interpMaxDist = 0, interpCount = 0;
    
    for (let i = 0; i < chainVtxList.length; i++) {
        const cv = chainVtxList[i];
        const parentChain = meshChains[cv.chainId];
        const isMax = !parentChain?.kind || parentChain.kind === 'peak';
        
        // Find best candidate
        const base = i * DIAG_CANDS;
        let bestK = 0;
        let bestR = radiusAt(probePositions, base);
        for (let k = 1; k < DIAG_CANDS; k++) {
            const r = radiusAt(probePositions, base + k);
            if (isMax ? (r > bestR) : (r < bestR)) {
                bestR = r; bestK = k;
            }
        }
        
        // True ridge 3D position
        const trueOff = (base + bestK) * 3;
        const tx = probePositions[trueOff];
        const ty = probePositions[trueOff + 1];
        const tz = probePositions[trueOff + 2];
        
        // Current chain vertex 3D position
        const cx = finalResultData[cv.vertexIdx * 3];
        const cy = finalResultData[cv.vertexIdx * 3 + 1];
        const cz = finalResultData[cv.vertexIdx * 3 + 2];
        
        const dist = Math.sqrt((tx-cx)**2 + (ty-cy)**2 + (tz-cz)**2);
        totalDist += dist;
        maxDist = Math.max(maxDist, dist);
        count++;
        
        if (cv.isPrimary) {
            primaryTotalDist += dist; primaryMaxDist = Math.max(primaryMaxDist, dist);
            primaryCount++;
        } else {
            interpTotalDist += dist; interpMaxDist = Math.max(interpMaxDist, dist);
            interpCount++;
        }
    }
    
    console.log(`[ParametricExport]   R48 ridge-distance diagnostic:`);
    console.log(`[ParametricExport]     all chain vertices: ` +
        `avg=${(totalDist/count).toFixed(4)}mm, max=${maxDist.toFixed(4)}mm (n=${count})`);
    console.log(`[ParametricExport]     primary vertices:   ` +
        `avg=${(primaryTotalDist/primaryCount).toFixed(4)}mm, ` +
        `max=${primaryMaxDist.toFixed(4)}mm (n=${primaryCount})`);
    console.log(`[ParametricExport]     interpolated vertices: ` +
        `avg=${(interpTotalDist/interpCount).toFixed(4)}mm, ` +
        `max=${interpMaxDist.toFixed(4)}mm (n=${interpCount})`);
}
```

### What this diagnostic reveals

1. **If primary vertex avg distance > 0.1mm**: GPU re-snap in Step 3.5 has a systemic issue,
   or `chainDirectedFlip` / `flipEdges3D` / CSO is somehow modifying chain vertex positions
   (these should only modify indices, never positions — but worth verifying).

2. **If interpolated vertex avg >> primary avg**: The interpolated vertex pipeline still has
   displacement issues (potentially from re-snap failure, or from P3 smoothing if not yet removed).

3. **If both are < 0.05mm**: The chain vertices ARE at the ridge — the visual artifact is
   purely from mesh topology (triangle face interpolation between on-ridge chain vertices
   and off-ridge grid vertices). This confirms the problem is G (fan slivers), not vertex position.

### Assumptions:
1. `finalResultData` contains the definitive 3D positions after all pipeline stages
2. The ±0.005 U diagnostic window is wide enough to contain the true extremum for all chain vertices
3. `outerChainVertexChainIds` accurately maps vertex indices to chain IDs after all pipeline modifications

---

## Search for Remaining Displacement Sources

### Source 1: batch2Remap (810 vertices)

**Analysis**: At [OWT lines 864-879](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L864), `batch2Remap` merges a chain vertex with a grid vertex when `|U_chain - U_grid| < 1e-4`. The chain vertex's U is replaced by the grid vertex's U.

**Maximum displacement**: `1e-4 U × 2π × R ≈ 0.0001 × 754mm ≈ 0.075mm`

**Verdict**: **NOT a significant source**. 0.075mm is below the layer resolution of FDM printers (~0.1mm minimum). The merge threshold is tight enough.

### Source 2: chainDirectedFlip (8917 diagonals)

**Analysis**: At [PEC lines 1737-1745](src/renderers/webgpu/ParametricExportComputer.ts#L1737), `chainDirectedFlip` forces quad diagonals to align with chain edges. This modifies the index buffer only — it swaps diagonal directions within quads. It does NOT modify vertex positions in `resultData`.

**Verdict**: **NOT a position displacement source**. But it CAN create visual displacement by changing which triangle faces are adjacent to chain vertices — a different triangle face angle relative to the ridge can make the ridge appear displaced even though the vertex is at the correct position. This is a topology displacement, not a position displacement, and is addressed by P2 fan midpoint insertion.

### Source 3: flipEdges3D (generic quality flips)

**Analysis**: At [PEC lines 1749-1759](src/renderers/webgpu/ParametricExportComputer.ts#L1749), `flipEdges3D` improves triangle quality via dihedral+angle criterion. It skips quads locked by `chainDirectedFlip` (the `lockedQuads` set). It modifies indices only.

**Concern**: Are chain-adjacent quads in `lockedQuads`? The `chainDirectedFlip` locks quads that contain a chain edge. A quad adjacent to a chain cell but not containing a chain vertex might NOT be locked. If `flipEdges3D` flips the diagonal of this adjacent quad, it changes the triangle faces adjacent to the chain-adjacent grid vertex — potentially worsening the visual transition from on-ridge chain faces to off-ridge grid faces.

**Verdict**: **Possible minor contributor** to visual displacement. Not worth addressing in R48 — the diagnostic (Proposal H) will reveal whether this is significant by measuring primary vertex ridge distance before/after the flip stages.

### Source 4: MeshSubdivision (8633 splits)

**Analysis**: MeshSubdivision inserts midpoint vertices on long edges. For chain edges, it inserts a midpoint at UV-average U and GPU-evaluates it. R46 Phase 3 then re-snaps these midpoints.

**Concern**: The subdivision modifies the index buffer by splitting triangles. If a chain edge is split, the two sub-edges are both still chain edges (constraint-protected). The midpoint vertex is GPU-evaluated at the UV midpoint — this is an on-surface point but not necessarily at the ridge extremum. R46 Phase 3 re-snaps it to the extremum.

**However**: R46 Phase 3 re-snap reports `2181/2181 refined` — 100% success rate. And the refined positions replace the 3D positions directly in `finalResultData` (not just UV). So subdivision midpoints should be at correct ridge positions after re-snap.

**Potential issue**: The re-snap modifies the 3D position by replacing `finalResultData[midIdx * 3 + 0..2]` with `resnapPositions[bestK * 3 + 0..2]`. This is the 3D position at the best-candidate U, which is the true extremum position. BUT: the UV buffer (`combinedVerts`) is NOT updated with the re-snapped U — it still contains the original UV-midpoint U. If any downstream operation uses `combinedVerts` for this vertex (e.g., CSO's edge-length or row-span guards), it sees stale UV data.

**Verdict**: This IS a subtle inconsistency but probably not a practical issue because:
- CSO and other post-subdivision operations primarily use 3D positions from `resultData`/`finalResultData`
- The UV buffer is used for surface ID lookup and T-row calculation, not for quality decisions
- The UV drift between midpoint-U and resnapped-U is typically < 0.001 U

### Source 5: CSO chain-grid flips (459 allowed by R47 P1)

**Analysis**: R47 P1 allows chain-grid flips when `qualityGain >= 0.20 rad`. These flips change which grid vertex is connected to which chain vertex. Since the grid vertex is off-ridge, changing the connection changes the triangle face angle relative to the ridge.

**Concern**: 459 flips × potential for each flip to connect a further-away grid vertex to the chain → possible increase in visual ridge displacement.

**Verdict**: **Minor contributor**. The quality gate ensures each flip significantly improves triangle shape, which generally means the new diagonal is better aligned with the surface curvature. The net visual effect should be positive. The ridge-distance diagnostic will show whether this is true.

### Source 6: AdaptiveRefinement (Phase 5)

Not examined — Phase 5 runs after all the above and should only add vertices, never move existing ones. The ridge-distance diagnostic should be run AFTER Phase 5 to capture any issues.

---

## Consolidated Pipeline Ordering (All R48 Changes)

```
PHASE 2: Grid Generation
  └─ OWT → outerFanDiagonalEdges, outerInterpolatedChainVertices

PHASE 2.5: Post-OWT Fixups (UV space)
  └─ R46 Phase 2: Interp re-snap (GPU, ±adaptive window)
  └─ R48 Proposal F1: Diagnostic counters (already-correct vs overshoot)
  └─ [REMOVED: R47 P3 smoothing — Proposal E1]

PHASE 3: GPU Evaluation
  └─ evaluatePoints → resultData (3D positions)

PHASE 3.5: Fan Midpoint Insertion (NEW — Proposal G)
  └─ R48 P2: Compute 3D aspect ratios from resultData
  └─ R48 P2: Build midpoint UV batch for high-aspect fan diagonals
  └─ R48 P2: Secondary GPU eval (small batch, ~4000 points)
  └─ R48 P2: Split fan triangles in index buffer
  └─ R48 P2: Track splitSubEdges + unsplitFanEdges

PHASE 4: Post-GPU Quality (topology only)
  └─ chainDirectedFlip → lockedQuads
  └─ flipEdges3D (skips lockedQuads)
  └─ Build constraintEdgeSet from:
       - outerChainEdges
       - unsplitFanEdges (R48)
       - splitSubEdges (R48)
  └─ CSO (with R47 P1 quality-gated chain-grid flip)
  └─ Boundary diagonal optimization

PHASE 4.5: Subdivision + Re-snap
  └─ MeshSubdivision → split long edges
  └─ R46 Phase 3: Subdivision midpoint re-snap

PHASE 4.9: Diagnostics
  └─ Boundary diagnostic
  └─ Mesh diagnostics
  └─ Chain-strip 3D quality
  └─ R48 Proposal H: Ridge-distance diagnostic (NEW)

PHASE 5: Adaptive Refinement
  └─ Error-driven triangle splitting (if enabled)

PHASE 6: STL Export
```

---

## Summary of Proposals

| ID | Type | Action | Impact | Risk |
|----|------|--------|--------|------|
| E1 | Remove | Delete R47 P3 smoothing block | Eliminates 0.5-0.9mm ridge displacement from linear blending | None — removes code that demonstrably worsens accuracy |
| F1 | Diagnostic | Classify 183 un-refined interp vertices | Reveals whether failure is benign (already-correct) or problematic (overshoot) | None — diagnostic only |
| F2 | Contingent fix | Second-pass re-snap with constrained window | Fixes overshoot failures if F1 reveals them | Low — only affects vertices that already failed |
| G | New feature | Fan midpoint insertion (post-GPU, 3D gated) | Reduces sliver rate from ~38.6% to ~15-20%; eliminates topology-induced visual dips | Moderate — new pipeline stage, secondary GPU eval |
| H | Diagnostic | Ridge-distance measurement | Definitively quantifies chain accuracy (position vs topology) | None — diagnostic only |

## Recommended Implementation Order

1. **E1 + F1** (minimal risk, high information value)
   - Remove P3 smoothing
   - Add diagnostic counters to Phase 2 re-snap
   - Export, examine metrics: is sliver rate back to 37.1%? What's the un-refined breakdown?

2. **H** (diagnostic, before any topology changes)
   - Add ridge-distance diagnostic
   - Export, measure: are chain vertices actually at the ridge?
   - This answers the fundamental question: is the problem position or topology?

3. **G** (major change, only if H confirms topology is the problem)
   - Implement fan midpoint insertion
   - Export, compare sliver rate and ridge-distance metrics

4. **F2** (contingent on F1 results)
   - Only if F1 reveals significant overshoot count

---

## Open Questions

1. **Does removing P3 also remove the wavy artifact?** If P3 caused the waviness
   by randomly displacing interpolated vertices away from their accurate re-snapped
   positions, removing it should immediately fix the waviness. If waviness persists
   after removing P3, the source is the parabolic refinement noise itself — which is
   sub-perceptible per C1 analysis.

2. **Is the 3.0 aspect ratio threshold optimal for P2?** This should be tuned after
   examining the aspect ratio distribution. If 90% of fan triangles have aspect > 3.0,
   we're splitting nearly all fan diagonals — might as well use a lower threshold like
   2.0 and split everything.

3. **Should P2 midpoint vertices inherit chain vertex status?** Currently proposed as
   plain vertices (not in `outerChainVertexChainIds`). If they should be chain vertices,
   they'd need re-snapping — but their position is UV-midpoint of a fan diagonal, not
   along the ridge. They shouldn't be treated as chain vertices.

4. **Do we need to update `outerGridVertexCount` after P2?** Fan midpoints are appended
   after all existing vertices, so they're at indices > outerGridVertexCount. CSO's
   `isChainGridEdge` check uses `>= outerGridVertexCount` — midpoints would be classified
   as "chain" side. This is correct: they ARE chain-adjacent vertices that should be
   protected from casual flipping.

5. **How does P2 interact with `chainDirectedFlip`?** The chain-directed flip operates
   on the `quadMap` which tracks grid cells. Fan midpoints are within existing cells,
   not creating new cells, so `quadMap` doesn't need updating. But the index buffer
   has changed (fan triangles split) — is `chainDirectedFlip` affected? It operates
   on quads identified by `quadMap` indices, not by scanning all triangles, so the
   split fan triangles (which are NOT in `quadMap`) should be invisible to it.
   **This needs Verifier confirmation.**
