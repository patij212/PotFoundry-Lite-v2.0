# Verifier Round 44.2 — Critique of Chain Subdivision Priority & Threshold

Date: 2026-03-08  
Agent: Verifier (GitHub Copilot - Claude Opus 4.6)

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal correctly identifies both root causes (threshold mismatch and priority starvation) and proposes a sound fix. However, one assumption is WRONG (in the safe direction), one implementation detail is critically underspecified, and one fundamental question (does subdivision fix sawtooth?) has a nuanced answer that warrants clear expectations.

---

## Critique

### C1 [WARNING]: The 50% alternation estimate is WRONG — actual split rate will be HIGHER

**Generator's claim**: "consecutive chain edges share exactly one triangle... alternating chain edges will be split (every other one)... Expected: ~50% of 6614 = ~3300 splits"

**Actual behavior**: Consecutive chain edges along a chain are in DIFFERENT row-bands and do NOT share triangles.

**Evidence**: Chain vertices are placed at specific (U, T) positions along feature chains. A chain edge `(v_j, v_{j+1})` connects chain vertex at row j to row j+1. The CDT triangulation is cell-local (see [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1488) `emitSuperCell`). Triangles in band (j, j+1) are distinct from triangles in band (j+1, j+2). Therefore:

- Edge `CE_down = (v_j, v_{j+1})` → adjacent triangles in band j→j+1
- Edge `CE_up = (v_{j+1}, v_{j+2})` → adjacent triangles in band j+1→j+2  
- **These are DIFFERENT triangles.** No `modifiedTris` blocking between them.

The only chain edges that CAN share triangles are:
1. **Phantom sub-edges** — if a single original chain edge `(v_j, v_{j+1})` was split at phantom vertex P into `(v_j, P)` and `(P, v_{j+1})`, these ARE in the same row-band. But even here, the CDT creates distinct triangles on either side of P, so sharing is unlikely unless the geometry is degenerate.
2. **Different chains in the same row-band with overlapping triangles** — possible but rare (chains are typically spread around the circumference).

**Corrected estimate**: With ~320 protected rejects (same as R44) and minimal modifiedTris blocking (~5% for phantom sub-edge interference and cross-chain overlap), the expected split rate is **~80-90%**, yielding **~5300-5900 splits** rather than ~3300.

**Impact on proposal**: This is wrong in the SAFE direction. The proposal works BETTER than predicted. No code change needed.

**Severity**: WARNING — not CRITICAL because the error is conservative.

---

### C2 [CRITICAL]: Proposal 1 omits the threshold change in Section 4

**Generator's claim**: Proposal 1 shows (1) computing `chainSubdivThreshold2` and (2) Phase A1/A2 loop split. Both are shown as code snippets.

**Actual behavior**: The Phase A1/A2 loop processes edges from `edgesToSplit`. But `edgesToSplit` is populated in Section 4 using threshold checks:

```typescript
// MeshSubdivision.ts line ~415
const threshold = isFeatureEdge
    ? featureSubdivThreshold2
    : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);

if (len2 > threshold) {
    edgesToSplit.push({ ek, v0, v1, len2, tris: [tris[0], tris[1]] });
}
```

With the CURRENT code, chain edges (`isFeatureEdge = true`) use `featureSubdivThreshold2 = (0.772 × 0.75)² ≈ 0.335 mm²`. Chain edges at ~0.424mm have `len² ≈ 0.180 mm²`. Since `0.180 < 0.335`, chain edges **never enter `edgesToSplit`**. The Phase A1 loop would iterate over an EMPTY `chainEdgesToSplit` array.

**The Generator's Proposal 2 (conservative)** explicitly shows the threshold selection fix:
```typescript
const threshold = isChainEdge
    ? chainSubdivThreshold2
    : (isFeatureEdge ? featureSubdivThreshold2 : ...);
```

But Proposal 1 (recommended) does NOT explicitly include this change. An Executioner implementing only Proposal 1's pseudocode would miss the Section 4 threshold modification and get **ZERO chain edge splits**.

**Required fix**: The Executioner implementation plan MUST specify: modify the threshold selection in Section 4 (`edgesToSplit` collection) to use `chainSubdivThreshold2` when `isChainEdge = true`. This is the same threshold change from Proposal 2, combined with the Phase A1/A2 structural change from Proposal 1.

**Severity**: CRITICAL — omitting this produces a no-op implementation.

---

### C3 [NOTE]: `avgVerticalEdge` will be LOWER than estimated when micro-rows are present

**Generator's claim**: "avgVerticalEdge ≈ 0.40–0.50mm"

**Actual behavior**: `outerH` includes micro-rows from `insertMicroRowsForSteepCrossings` (see [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L396-L477)). Micro-rows are inserted at the midpoint T between original rows where chains cross >1 column. If micro-rows are present in the first 10 rows sampled by the vertical edge computation, `avgVerticalEdge` would be **~0.20-0.30mm** instead of 0.40-0.50mm.

The proposed sampling code:
```typescript
for (let j = 0; j < outerH - 1 && j < 10; j++) {
    // samples first 10 rows
}
```

If micro-rows are interleaved in this range, the average includes both short micro-row-gap edges and normal-gap edges.

**Impact**: With `avgVerticalEdge = 0.25mm` and `CHAIN_SCALE = 0.50`, the chain threshold would be `(0.125mm)² = 0.0156 mm²`. This is even MORE permissive — all chain edges at 0.424mm easily clear it. **Everything still works; the threshold is just lower than predicted.**

**Counterargument**: Micro-rows are inserted only for steep multi-column crossings, which may not occur in the first 10 rows. In that case, the estimate of 0.40-0.50mm holds.

**Recommended mitigation**: Not strictly needed, but the Executioner could sample vertical edges at 10 EVENLY SPACED rows across the grid (e.g., rows `0, outerH/10, 2*outerH/10, ...`) instead of the first 10, for a more representative average. This matches the horizontal sampling pattern's intent of covering diverse geometry.

**Severity**: NOTE — no code correctness issue, just a potential variance in the threshold value.

---

### C4 [NOTE]: Phantom sub-edges ARE in `constraintEdgeSet` and WILL be split — this is correct

**Generator's claim**: "Phantom sub-edges at ~0.39mm also qualify. This seems right — phantom sub-edges SHOULD be eligible for subdivision since they trace the same feature."

**Verification**: Confirmed. The A4 code at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1380-L1393) replaces original chain edges with sub-edges in the master `chainEdges` array:

```typescript
chainEdges.length = 0;
chainEdges.push(...newEdges);
```

These `chainEdges` flow through `outerChainEdges` at [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1393) → `buildConstraintEdgeSet` at [line 1583](../../src/renderers/webgpu/ParametricExportComputer.ts#L1583). So `constraintEdgeSet` contains both original chain edges and phantom sub-edges.

Phantom sub-edges at ~0.39mm clear any threshold ≥ 0.20mm. They have 2 entries in `subEdgeToTris` (properly indexed as chain-strip triangles). Splitting them adds vertices along phantom-split segments, improving mesh resolution around column crossings. This is HELPFUL behavior.

**The `protectedVertices` guard**: Phantom crossing anchors and their companions are in `protectedStripVertices` (see [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1295-L1302)). The `touchesProtectedPatch` function in MeshSubdivision checks if the OPPOSITE vertices of the two adjacent triangles are protected (for feature edges). This means:
- Chain edge endpoints touching protected vertices → still allowed (feature edge relaxation per R42)
- Opposite vertices being protected → blocked

This correctly prevents splitting chain edges whose adjacent triangles are fully inside the phantom corridor, while allowing splits at the corridor boundary.

**Severity**: NOTE — verified as correct, no issues.

---

### C5 [WARNING]: `maxSplits` budget may be tight but not blocking

**Generator's claim**: Budget cap is `constraintEdgeSet.size` per chain split pass.

**Actual behavior**: The GLOBAL budget is `maxSplits = Math.floor((csTriSetNow.size + boundaryTrisAdded) * 0.5)`. For a typical export with ~15,000-20,000 chain-strip triangles and ~1,000-2,000 boundary tris, `maxSplits ≈ 8,000-11,000`.

With the corrected split estimate (~5,500 chain splits from C1), this leaves ~2,500-5,500 slots for non-chain edge splits. The R44 diagnostic showed ~800 non-chain splits, so this is adequate.

The per-pass `chainSplitBudget = Math.min(chainEdgesToSplit.length, constraintEdgeSet.size)` is `min(~6500, 6614) ≈ 6500`. Since the actual split count (~5,500) is below this, the per-pass cap is not binding.

**Concern**: If `csTriSetNow.size` is smaller than expected (e.g., ~10,000), then `maxSplits ≈ 5,500`, and chain splits alone would consume the entire budget, leaving 0 slots for non-chain edges. The Executioner should log both values to verify.

**Severity**: WARNING — unlikely to cause failure, but should be monitored.

---

### C6 [WARNING]: Subdivision reduces but does not eliminate sawtooth — expectations must be calibrated

**Generator's claim**: "Ridge resolution improvement: from 1 chain edge per row-pair (~0.424mm) to 1 chain edge per half-row-pair (~0.212mm)"

**Analysis**: The midpoint UV is the arithmetic mean of the two endpoint UVs:
- `U_mid = midpointWrappedU(U_j, U_{j+1})` — the wrapped average
- `T_mid = (T_j + T_{j+1}) / 2`

If the feature at `T_mid` is truly at `U_feature(T_mid)`, and the chain oscillation has endpoints at `U_j = U_feature(T_j) + ε_j` and `U_{j+1} = U_feature(T_{j+1}) + ε_{j+1}`, then:

```
U_mid = (U_j + U_{j+1}) / 2 = (U_feature_avg) + (ε_j + ε_{j+1}) / 2
```

If ε alternates sign (sawtooth), then `(ε_j + ε_{j+1})/2 ≈ 0` — the midpoint sits near the TRUE feature position. This is the best case: midpoints eliminate the oscillation error.

If ε has a systematic bias (drift), then midpoints track the drift but at finer spatial resolution. **The key improvement is GPU surface evaluation**: the midpoint at `(U_mid, T_mid)` is evaluated to the EXACT on-surface 3D position at that UV. It doesn't interpolate linearly in 3D. So even if `U_mid` isn't exactly on the feature, the 3D position is physically correct for that UV coordinate.

**Net effect**: Subdivision with GPU evaluation:
1. Halves the spatial period of any U-oscillation → smoother
2. Places each new vertex exactly on the mathematical surface → no chord error
3. The primary remaining sawtooth component is the inherent sampling quantization of feature detection (~±0.00006 in U from 8192 probes → ~±0.009mm lateral), which is below FDM print resolution

**Conclusion**: Subdivision is an effective mitigation. At ~5,500 splits covering most chain edges, the sawtooth amplitude should drop by ~2× and the angular frequency doubles, making the pattern significantly less visible. Combined with GPU surface evaluation, this is a meaningful quality improvement.

However, subdivision does NOT fix the ROOT CAUSE (feature detection quantization, SG smoothing residual, CHAIN_LINK_RADIUS mismatch). For sub-0.1mm accuracy, the chain geometry itself needs refinement. But at the current scale (FDM printing with 0.4mm nozzle), the residual error after subdivision should be invisible.

**Severity**: WARNING — not a proposal flaw, but expectations must be realistic.

---

## Accepted Items

### A1: Root cause diagnosis ✓
The threshold mismatch (horizontal avg used for vertical edges) and priority starvation (length-descending sort) are correctly identified and verified against [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L291-L310) (horizontal sampling) and [line ~425](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L425) (sort order).

### A2: Vertical edge sampling ✓
The proposed `v0 = j * outerW + i; v1 = (j+1) * outerW + i` correctly addresses vertical grid edges. Grid vertex layout `v = row * outerW + col` is confirmed at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L685) (`gridVertexCount = numU * numT`) and [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1536) (`outerH = Math.round(outerGridVertexCount / outerW)`).

### A3: Phase A1/A2 architectural approach ✓
Processing chain edges first is architecturally sound. Chain edges define ridge quality (the "fingerprint on a knife edge" goal), so giving them priority access to `modifiedTris` is correct, not a hack. Non-chain edges in smooth regions are less quality-sensitive.

### A4: `edgeKey` compatibility ✓
Both [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L133-L137) and [ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L178-L184) use identical `edgeKey` formulation: `BigInt(lo) * BigInt(0x200000) + BigInt(hi)`. The `constraintEdgeSet.has(se.ek)` check in Phase A1 will correctly identify chain edges.

### A5: CHAIN_SCALE = 0.50 ✓
With `avgVerticalEdge ∈ [0.25, 0.50]mm` (range accounts for micro-rows), `CHAIN_SCALE = 0.50` produces thresholds of `0.125–0.250mm`. All regular chain edges (~0.424mm) and phantom sub-edges (~0.39mm) clear this. No legitimate edges are excluded, and no degenerate micro-edges are admitted (the shortest chain edge in R44 was well above 0.20mm per diagnostic output).

### A6: Protected corridor behavior ✓
The `touchesProtectedPatch` function correctly handles feature edges — only checking opposite vertices for protection, not edge endpoints (per R42 relaxation). This is unchanged by the proposal.

---

## Implementation Conditions (for Executioner)

### Mandatory

1. **Section 4 threshold modification** (Amendment for C2): In the edge collection loop, add `isChainEdge` to the threshold selection:
   ```typescript
   const threshold = isChainEdge
       ? chainSubdivThreshold2
       : (isFeatureEdge ? featureSubdivThreshold2
          : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2));
   ```
   Without this, `edgesToSplit` will contain zero chain edges and Phase A1 is a no-op.

2. **Section 1b vertical sampling** (from proposal): Add the `avgVerticalEdge` computation after the existing horizontal sampling. Use `resultData` (GPU-evaluated 3D positions).

3. **Section 5 Phase A1/A2 split** (from proposal): Separate chain edges from `edgesToSplit`, process chain edges first with priority access to `modifiedTris`.

4. **Diagnostics**: Add `avgVerticalEdge`, `chainSubdivThreshold`, chain edges split count, modifiedTris chain conflicts to the console output. This is essential for validating the fix works as expected.

### Recommended

5. **Vertical sampling range**: Consider sampling rows evenly across the grid (every `outerH/10` rows) instead of the first 10, to get a representative `avgVerticalEdge` even when micro-rows are clustered at the top.

6. **maxSplits monitoring**: Log `maxSplits`, chain splits, and remaining non-chain slots. If `maxSplits` is tight, consider increasing the factor from 0.5 to 0.6 for the budget computation.

### Validation Protocol

After implementation:
- `npm run typecheck`: expect 0 errors
- `npm run lint`: expect 0 warnings  
- `npm test`: expect all tests pass (update subdivision tests to reflect new behavior)
- **Export log check**: `[Subdivision] R44 chain edge diagnosis` should show `candidates` >> 6000 and `belowThresh` near 0
- **Export log check**: `R44 Phase A chain diagnosis` should show `split` >> 3000, `conflict` << 1000
- **Visual check**: Ridge teeth should be visibly finer in the STL mesh

---

## Open Questions for Generator

1. **Revised split estimate**: Given C1's finding that consecutive chain edges DON'T share triangles (different row-bands), do you revise the expected split count upward? My estimate is ~5,300-5,900 vs your ~3,300.

2. **Multi-pass consideration**: With ~5,500 splits giving ~2× amplitude reduction, is a single pass sufficient? Or should the Executioner be advised to consider a follow-up round with recursive subdivision (split the sub-edges created by the first pass)?

3. **Diagnostic table update**: The "Expected Results" table in the proposal should be revised with the corrected split estimates. The modifiedTris blocking column is significantly overstated.
