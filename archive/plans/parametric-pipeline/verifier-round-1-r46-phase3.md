# Verifier Round 1 — Critique of Generator R46 Phase 3: Subdivision Midpoint Re-snap

Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's Proposal 2 (return chain midpoint metadata from MeshSubdivision, re-snap in PEC) is architecturally sound. The separation of concerns is correct, the vertex indexing math is verified, and Sub-option 2b (discrete best candidate) provides adequate accuracy. However, **two critical issues must be fixed** before implementation, both of which would cause incorrect mesh geometry if left unaddressed.

---

## Critique

### C1 [CRITICAL]: Window Width Too Narrow — Repeat of Phase 2 C1

**Generator's claim**: `HALFWIDTH = 2.0 * SAMPLE_WIDTH` ≈ ±0.000244 U is used for the re-snap search window.

**Actual behavior**: This window is catastrophically narrow for subdivision midpoints. The midpoint U error is NOT bounded by the probe resolution — it's bounded by the **ridge trajectory curvature** over the row step.

**Proof by construction**:
Consider a chain edge with endpoints at:
- Row j: U_ridge = 0.100
- Row j+1: U_ridge = 0.108 (maxConsecDelta = 0.008)

If the ridge trajectory accelerates (moves most of ΔU in the first half of the T span), the true ridge at T_mid could be at U ≈ 0.106, while the linear midpoint is at (0.100 + 0.108)/2 = 0.104.

Error = |0.106 - 0.104| = 0.002 U.

Worse case: ridge decelerates late, true ridge at T_mid ≈ 0.108:
Error = |0.108 - 0.104| = 0.004 U.

The proposed window ±0.000244 covers only **6%** of the ±0.004 error range. The re-snap would find a candidate near 0.104 U (within the window), NOT at the true ridge near 0.108.

**Quantified shortfall**:
| Metric | Value |
|--------|-------|
| maxConsecDelta (observed) | 0.008 U |
| Worst-case midpoint error | ~0.004 U (~1.2mm @ 300mm circumference) |
| Proposed window half-width | 0.000244 U |
| Coverage of error range | ~6% |
| Missing range | ~94% |

**This is structurally identical to Phase 2 C1** (Verifier caught the same narrow-window issue for interpolated chain vertices). Phase 2's fix used adaptive scaling: `gapAdaptive = gapSize² × 0.001`. But that formula doesn't directly apply here — subdivision midpoints always have gapSize=1 (chain edges span exactly 1 row after OWT interpolation), giving hw = max(0.000244, 0.001) = 0.001, which **still covers only 25%** of the worst-case 0.004 error.

**Required fix**: Scale the window with the actual U drift between the two endpoints:

```typescript
const uDrift = circularDistance(cm.u0, cm.u1); // |Δu| wrapped
const hw = Math.min(0.01, Math.max(BASE_HALFWIDTH, uDrift * 0.5 + BASE_HALFWIDTH));
const cands = hw > 4 * SAMPLE_WIDTH ? 64 : 32;
```

This gives:
| maxConsecDelta | hw | cands | spacing | half-spacing | 3D error |
|---|---|---|---|---|---|
| 0.008 | 0.004244 | 64 | 0.000135 | 0.0000675 U | ~0.02mm |
| 0.004 | 0.002244 | 64 | 0.0000712 | 0.0000356 U | ~0.011mm |
| 0.001 | 0.000744 | 32 | 0.0000480 | 0.0000240 U | ~0.007mm |
| 0.0002 | 0.000344 | 32 | 0.0000222 | 0.0000111 U | ~0.003mm |

All residuals < 0.05mm — well below visibility. The adaptive window also means `ChainMidpointInfo` must store both `u0` and `u1` (the endpoint U values), not just the midpoint `u`.

**Implementation detail**: The `ChainMidpointInfo` interface must include:
```typescript
interface ChainMidpointInfo {
    vertexIdx: number;
    u: number;    // midpoint U (circular average)
    t: number;    // midpoint T
    v0: number;   // endpoint vertex index (for chainId lookup)
    v1: number;   // endpoint vertex index (for chainId lookup)
    u0: number;   // endpoint U value (for adaptive window)
    u1: number;   // endpoint U value (for adaptive window)
}
```

---

### C2 [CRITICAL]: `constraintEdgeSet` Contains Non-Chain Edges (Fan Diagonals)

**Generator's claim**: Chain-edge midpoints can be identified by checking `constraintEdgeSet.has(se.ek)` in Phase A.

**Actual behavior**: The `constraintEdgeSet` is built from `outerChainEdges` (chain-chain edges) **plus R46 fan diagonal edges** (PEC lines 1685-1688):

```typescript
// PEC line 1683
const constraintEdgeSet = buildConstraintEdgeSet(outerChainEdges);

// PEC line 1686-1688 — R46: fan diagonals added to same set
for (const [v0, v1] of outerFanDiagonalEdges) {
    constraintEdgeSet.add(edgeKey(v0, v1));
}
```

Fan diagonal edges connect **grid vertices** (both endpoints < `outerGridVertexCount`). They have no ridge significance. MeshSubdivision uses `constraintEdgeSet.has(ek)` at line 403 to classify edges — any fan diagonal edge meeting the length threshold would be classified as a "chain edge" and receive the `chainSubdivThreshold2` (0.50× avgVertGridEdge), making it **more likely** to be split.

**Counterexample**: A fan diagonal edge (v0=42, v1=87) with both endpoints being grid vertices gets split. The midpoint is tagged as a `ChainMidpointInfo`. In PEC, `outerChainVertexChainIds.get(42)` and `.get(87)` both return `undefined`. The Generator's fallback sets `isMax = true`, and re-snap moves this grid-area midpoint toward a local radius maximum — i.e., toward a nearby ridge peak. This pulls what should be a smooth grid-area surface point onto a ridge, creating a **new** artifact.

**Required fix** (two options, pick one):

**Option A (in MeshSubdivision)**: Only tag splits as chain midpoints when BOTH endpoints are chain vertices:
```typescript
const isChainMidpoint = isChainEdgeA 
    && se.v0 >= outerGridVertexCount 
    && se.v1 >= outerGridVertexCount;
if (isChainMidpoint) chainSplitIndices.push(splitsToApply.length - 1);
```

**Option B (in PEC re-snap block)**: Skip re-snap when chain ID cannot be determined:
```typescript
const chainId = outerChainVertexChainIds.get(cm.v0) ?? outerChainVertexChainIds.get(cm.v1);
if (chainId === undefined) continue; // not a real chain edge — skip
```

**Recommendation**: Apply BOTH guards for defense-in-depth. Option A avoids wasting GPU evaluations on non-chain midpoints. Option B catches any residual edge cases.

---

### W1 [WARNING]: Fallback `isMax = true` is Dangerous for Valley Chains

**Generator's claim** (Risk 1 mitigation): If `outerChainVertexChainIds` doesn't contain the endpoint, fall back to `isMax = true` (treat as peak).

**Problem**: For valley chains, the ridge extremum is a radius **minimum**. Re-snapping with `isMax = true` would search for a radius **maximum**, pushing the midpoint to the opposite side of the ridge — potentially moving it by 2× the ridge amplitude (the full peak-to-valley distance).

**Evidence**: Valley chains exist in styles with concave features (e.g., fluted vases). The `kind` field on mesh chains distinguishes `'peak'` from `'valley'` (PEC Phase 2, line 1537):
```typescript
const parentChain = meshChains[iv.chainId];
const isMax = !parentChain?.kind || parentChain.kind === 'peak';
```

**Required fix**: Replace the fallback with a `continue` (skip re-snap) when chain ID is unknown. A midpoint left at the UV average (error ~1.2mm worst case) is strictly better than a midpoint moved to the wrong extremum (error potentially ~5-10mm).

Combined with C2's fix, this becomes:
```typescript
const chainId = outerChainVertexChainIds.get(cm.v0) ?? outerChainVertexChainIds.get(cm.v1);
if (chainId === undefined) continue; // skip — cannot determine peak/valley
const parentChain = meshChains[chainId];
const isMax = parentChain.kind === 'peak' || parentChain.kind === undefined;
```

---

### W2 [WARNING]: Candidate Count Should Scale with Window Width

**Generator's claim**: 32 candidates is sufficient for all subdivision midpoints.

**Actual requirement**: With the adaptive window from C1's fix, wider windows need more candidates to maintain spatial resolution. Phase 2 already implements this pattern (PEC line 1489):
```typescript
const cands = hw > 4 * SAMPLE_WIDTH ? 64 : 32;
```

For `maxConsecDelta = 0.008`, hw ≈ 0.004244, which is `0.004244 / 0.000122 ≈ 34.8` sample widths — far above the 4× threshold. Using only 32 candidates would give:
- spacing = 2 × 0.004244 / 31 ≈ 0.000274 U
- half-spacing error ≈ 0.04mm (acceptable but coarser than Phase 2)

With 64 candidates:
- spacing = 2 × 0.004244 / 63 ≈ 0.000135 U
- half-spacing error ≈ 0.02mm (matches Phase 2 quality)

**Required fix**: Use the same adaptive candidate count as Phase 2: `const cands = hw > 4 * SAMPLE_WIDTH ? 64 : 32`.

---

### W3 [WARNING]: Performance Impact of Adaptive Windows

With adaptive windows, the total GPU evaluation count increases from the Generator's estimate of ~276K (8,632 × 32) to potentially ~553K (8,632 × 64) in the worst case where all midpoints use 64 candidates. This is 2× Phase 2's ~70K evaluations but still within the same order of magnitude. Based on Phase 2 benchmarks (~5ms for 70K evaluations), this should add ~40ms — acceptable.

The variable candidate count also means the candidate UV batch must use a prefix-sum allocation pattern (like Phase 2's `probeOffset` accumulator) rather than a fixed stride. The Generator's code uses `i * CANDS + k` indexing which assumes fixed candidate count — this must be updated.

---

## Accepted Items

### A1: Proposal 2 Architecture (Metadata Return + PEC Re-snap) ✅

**Evidence**: PEC already has all required infrastructure — `meshChains` with `kind`, `evaluatePoints` GPU binding, `circularDistance`, and the Phase 2 re-snap pattern. MeshSubdivision correctly has no knowledge of chain `kind` or ridge-finding semantics. The separation is clean.

### A2: Sub-option 2b (Discrete Best Candidate, No Parabolic for 3D) ✅

**Evidence**: With 64 candidates and adaptive window hw ≈ 0.004, the discrete candidate spacing is ~0.000135 U ≈ 0.04mm. Parabolic refinement would add sub-candidate precision (~0.01mm) at the cost of a second GPU evaluation pass for the refined U values. The 0.04mm discrete error is well below the 1.2mm error being fixed.

The Generator correctly notes that unlike Phase 2 (which updates `combinedVerts` UV for downstream re-evaluation), Phase 3 must update `finalResultData` directly (3D positions). Using the discrete best candidate's 3D position from the first GPU call eliminates the need for a second GPU call. This is the right tradeoff.

### A3: Vertex Index Calculation ✅

**Verified** against MeshSubdivision.ts Phase C (lines 555-570):
```typescript
let nextNewIdx = resultData.length / 3;
for (let i = 0; i < splitsToApply.length; i++) {
    const midIdx = nextNewIdx++;
    newVerts.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);
}
```
Split `i` maps to vertex index `resultData.length / 3 + i`. The loop has no conditional skips — all `splitsToApply` entries produce exactly one midpoint vertex in order. The mapping is 1:1 and deterministic.

### A4: `finalResultData` Can Be Mutated In-Place ✅

**Verified**: After subdivision (PEC line 1769), `finalResultData` is consumed by:
1. `computeBoundaryDiagnostic` — read-only
2. `computeMeshDiagnostics` — read-only
3. `computeChainStrip3DQuality` — read-only
4. Final STL packaging — read-only

No copy-on-write or immutability constraints. In-place mutation between the subdivision call and diagnostic calls is safe, provided the re-snap block is inserted at PEC ~line 1770 (after subdivision, before diagnostics).

### A5: Only U Needs Correction, Not T ✅

**Verified**: The ridge U_ridge(T) is a function of T. The midpoint's T = (T_j + T_{j+1})/2 is a legitimate surface parameter. The GPU evaluates the surface at arbitrary (U, T) via the shader — T doesn't need to align with grid rows. The re-snap searches for the optimal U at the given T. T is correct as-is.

### A6: No Double Re-snap Risk ✅

**Verified**: Phase 2 re-snaps OWT-interpolated chain vertices (existing vertices with UVs in `combinedVerts`). Phase 3 re-snaps subdivision midpoints (new vertices created by MeshSubdivision). The vertex sets are disjoint — Phase 2 operates on vertices inserted by OWT gap-filling, Phase 3 on vertices inserted by edge splitting. No overlap.

### A7: `outerChainVertexChainIds` Coverage for Chain Edge Endpoints ✅

**Verified** against OWT lines 1842-1848:
```typescript
const chainVertexChainIds = new Map<number, number>();
for (const cv of chainVertices) {
    chainVertexChainIds.set(cv.vertexIdx, cv.chainId);
}
for (const [vertexIdx, chainId] of phantomVertexChainIds) {
    chainVertexChainIds.set(vertexIdx, chainId);
}
```

Chain edges (OWT line 814) connect consecutive `finalChain` entries, which are drawn from `chainVertices` (including interpolated gap-fill vertices). All chain vertex indices are in the map. Phantom vertices from R37 band splitting are also included. Coverage is complete for **true chain-chain edges**.

The coverage gap is for fan diagonal edges (C2 above) — these have grid vertex endpoints NOT in the map.

---

## Open Questions — Verifier Responses

### OQ1: Should `combinedVerts` be grown to store corrected UVs?

**No.** Downstream consumers of `combinedVerts` after subdivision are limited to `computeMeshDiagnostics` (which uses `combinedVerts` only for T-based row-span calculations, not for U values of subdivision midpoints). The re-snapped midpoints exist only in `finalResultData` (3D). No current pipeline step needs midpoint UVs after subdivision. If future UV-dependent features are added, this can be revisited then. Not blocking.

### OQ2: Is 32 candidates sufficient for chain edges with large gaps?

**No — see C1 and W2.** The candidate count must scale with window width. Use 64 candidates when `hw > 4 * SAMPLE_WIDTH`. With adaptive windows derived from endpoint U drift, wider windows are common for chains with high `maxConsecDelta`.

### OQ3: Should cross-edges (grid↔chain) be re-snapped?

**No.** Cross-edge midpoints sit at the grid/chain boundary — they are structural mesh vertices, not ridge-tracking vertices. Re-snapping them would move grid-area geometry toward ridges, creating artifacts. Generator's analysis is correct.

### OQ4: Can we skip re-snap when both endpoints have identical U?

**Yes, with caveat.** If `circularDistance(u0, u1) < 2 * SAMPLE_WIDTH`, the midpoint U is already within probe resolution of the ridge. The adaptive window would be at baseline (0.000244), and the re-snap would find a candidate ≤0.000122 U away — negligible. Skipping is safe and saves GPU evaluations for ~40% of midpoints.

**Caveat**: "identical U" must use `circularDistance` (seam-aware), not direct subtraction.

---

## Implementation Conditions

If the Generator accepts C1 and C2 amendments, the Executioner should implement:

### Step 1: MeshSubdivision.ts Changes

1. Add `ChainMidpointInfo` interface (with `u0`, `u1` fields per C1)
2. Add `chainMidpoints: ChainMidpointInfo[]` to `SubdivisionResult`
3. In Phase A, track chain-edge splits using the C2-safe guard:
   ```typescript
   const isChainMidpoint = isChainEdgeA 
       && se.v0 >= outerGridVertexCount 
       && se.v1 >= outerGridVertexCount;
   ```
4. In Phase C, build the `ChainMidpointInfo` array with vertex indices

### Step 2: PEC Re-snap Block (~line 1770)

1. After `subdivideLongEdges` returns, iterate `subdivResult.chainMidpoints`
2. Skip midpoints where `circularDistance(cm.u0, cm.u1) < 2 * SAMPLE_WIDTH` (OQ4 optimization)
3. Compute adaptive window: `hw = min(0.01, max(BASE_HALFWIDTH, circularDistance(cm.u0, cm.u1) * 0.5 + BASE_HALFWIDTH))`
4. Compute adaptive candidates: `cands = hw > 4 * SAMPLE_WIDTH ? 64 : 32`
5. Build candidate UV batch with prefix-sum allocation (variable cands per midpoint)
6. GPU evaluate all candidates in one call
7. For each midpoint, look up chain ID from `outerChainVertexChainIds` — **skip if undefined** (W1 fix)
8. Find best discrete candidate (max radius for peaks, min for valleys)
9. Guard: `moved > 1e-7 && moved < MAX_SUBDIV_DELTA`
10. Update `finalResultData[vertexIdx * 3 .. +2]` with best candidate's 3D position

### Step 3: Diagnostic Logging

```
[ParametricExport]   R46 subdiv re-snap: {count}/{total} refined, {skipped} skipped (no chainId), avg window={avgHW}, max window={maxHW}
```

### Validation Protocol

1. **Unit test**: Verify `ChainMidpointInfo` vertex indices match actual midpoint positions in `finalResultData`
2. **Integration**: Export a high-frequency style (e.g., Gothic Arches) and compare subdivision midpoint radii before/after re-snap. All chain-edge midpoints should move toward the ridge extremum.
3. **Regression**: Export 3-4 canonical styles and verify STL watertightness + triangle count stability (subdivision count may change slightly due to re-snapped positions affecting downstream diagnostics)
4. **Boundary**: Test with a style that has valley chains — verify valley midpoints are re-snapped to minima, not maxima
5. **Fan diagonal safety**: Verify fan diagonal midpoints are NOT re-snapped (check diagnostic log for `{skipped}` count > 0 when fan diagonals are present)

---

## Summary of Required Amendments

| ID | Severity | Issue | Fix |
|---|---|---|---|
| C1 | CRITICAL | Window ±0.000244 covers 6% of error range | Adaptive window: `hw = max(BASE, uDrift/2 + BASE)` |
| C2 | CRITICAL | Fan diagonals in constraintEdgeSet falsely tagged as chain | Guard: both endpoints ≥ outerGridVertexCount + skip if no chainId |
| W1 | WARNING | Fallback isMax=true wrong for valleys | Skip re-snap when chainId is undefined |
| W2 | WARNING | Fixed 32 candidates too few for wide windows | Adaptive: 64 when hw > 4×SAMPLE_WIDTH |
| W3 | WARNING | Fixed-stride indexing breaks with variable cands | Use prefix-sum probeOffset accumulator |
