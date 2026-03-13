# Verifier Round 5 — Critique of R54 Cell Fusion Proposal

Date: 2026-03-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's Proposal 1 (Cell Fusion) is **mechanically sound** and **elegantly minimal**. All five explicit assumptions verified against the actual source code. The existing super-cell infrastructure (merger, emission, R37 band splitting, R53 BPP) handles R54 fusion requests without modification. The core idea — extending the R35 super-cell trigger from "cross-column edge" to "near-boundary vertex" — is the correct architecture.

**However, four amendments are required before implementation.**

---

## Critique

### C1 [WARNING]: Root Cause Description Contains Factual Error

**Generator's claim**: "`mergeFeaturePositions` (GridBuilder.ts L75-120): Injects grid columns AT feature U-positions + flanking companions at `±FLANK_OFFSET(0.3) × avgSpacing`" [Root Cause item #2]

**Actual behavior**: `mergeFeaturePositions` is called ONLY for the **T grid** at [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L702):
```typescript
const tMerged = mergeFeaturePositions(cdfT, tFeatures, false);
```

The **U grid** (`unionU`) is constructed at [L1422](../../src/renderers/webgpu/ParametricExportComputer.ts#L1422) via:
```typescript
const densityProfile = buildDensityProfile(uCurvature, chainVertexUs, 0.6, 0.004);
const unionU = generateCDFAdaptivePositions(densityProfile, maxOuterColumns, 0.3, true);
```

There is NO call to `mergeFeaturePositions` for U. The comment at [L1419-1421](../../src/renderers/webgpu/ParametricExportComputer.ts#L1419) explicitly states dead zones are NOT applied, and the U grid is purely CDF-adaptive from the density profile.

**Impact on proposal**: LOW. The sliver problem still exists — the CDF density profile's Gaussian floor (`featureFloor=0.6`, `featureRadius=0.004`) at [GridBuilder.ts L256-265](../../src/renderers/webgpu/parametric/GridBuilder.ts#L256) concentrates columns near chain vertex positions, creating near-coincident column/chain-vertex pairs. The mechanism differs from what the Generator described, but the effect (narrow sub-quads) is the same, and the solution (cell fusion) remains valid.

**Required fix**: Correct the root cause description. The narrow-side problem arises from CDF density concentration (not feature injection) creating columns NEAR chain vertices, combined with R52 preventing chain→grid merging.

**Severity**: WARNING — does not block implementation, but the incorrect description propagates confusion.

---

### C2 [CRITICAL]: Threshold R54_NEAR_BOUNDARY_FRAC = 0.20 Is Too Conservative

**Generator's claim**: "Use `R54_NEAR_BOUNDARY_FRAC = 0.20` (triggers fusion when narrow side is <20% of cell width → aspect >4.2:1 with typical band height)."

**Analysis**: At 0.20 threshold with typical cellWidth ≈ 0.0015 and bandHeight ≈ 0.0024:
- A chain vertex at exactly 20% from the boundary escapes fusion
- Its narrow sub-quad width = 0.20 × 0.0015 = 0.0003
- Aspect ratio = 0.0024 / 0.0003 = **8:1**
- The user explicitly stated chain areas must be "absolutely perfectly tessellated"
- An 8:1 aspect ratio sliver directly adjacent to the chain edge is NOT "absolutely perfect"

**Threshold analysis**:

| Threshold | Escape narrow width | Escape aspect ratio | Trigger % (est.) | Super-cell count (est.) |
|-----------|-------------------|---------------------|-------------------|------------------------|
| 0.20 | 0.0003 | 8.0:1 | ~40% | ~800-1,000 |
| 0.25 | 0.000375 | 6.4:1 | ~50% | ~1,000-1,200 |
| 0.30 | 0.00045 | 5.3:1 | ~60% | ~1,200-1,400 |
| 0.35 | 0.000525 | 4.6:1 | ~70% | ~1,400-1,600 |
| 0.40 | 0.0006 | 4.0:1 | ~80% | ~1,600-1,800 |

The "escape aspect ratio" is the WORST case that slips through — a chain vertex at exactly the threshold distance from the boundary.

**Counterexample**: Chain vertex at `u = 0.5003` in cell `[0.5000, 0.5015]`. `distToLeft / cellWidth = 0.0003 / 0.0015 = 0.20`. At threshold 0.20, this vertex does NOT trigger fusion (ratio equals threshold, not less than). The narrow sub-quad is 0.0003 wide, the two triangles adjacent to the chain edge are 8:1 slivers. On a 3D-printed ridge, this is a visible staircase.

**Required fix**: Raise to `R54_NEAR_BOUNDARY_FRAC = 0.35`. This catches slivers up to 4.6:1 aspect and aligns with the Axis 2 T-phantom threshold (`R54_HT_RATIO ≈ 4:1`). Remaining cases (4.6:1 to ~2:1) are handled by Axis 1 U-phantoms for non-fused cells. Alternatively, adopt the Generator's own Q6 suggestion: use aspect-ratio-based triggering instead of cell-fraction.

**Severity**: CRITICAL — the user's requirement is "absolutely perfect." 8:1 slivers at chain edges fail this bar.

---

### C3 [WARNING]: Trigger Count Estimate Is Overstated

**Generator's claim**: "60–80% of ~5,460 chain cells = 3,300–4,400 fusion requests"

**Actual analysis**: Since `mergeFeaturePositions` is NOT used for U columns (see C1), grid columns are not injected AT chain vertex positions. The CDF-adaptive grid places columns based on density profile peaks, which are broad Gaussian envelopes (σ=0.004, 3σ=0.012). With `chainVertexUs` consisting of ALL chain vertex positions across ALL rows (~3,159 values from [L1242](../../src/renderers/webgpu/ParametricExportComputer.ts#L1242)), the density peaks overlap extensively (13 chains × drift ~0.094 covers ≈ 1.22 of U-space), resulting in a near-uniform density floor.

With near-uniform column placement, a chain vertex's position within its cell is approximately uniformly distributed. For a uniform distribution:

- `P(narrow ratio < 0.20) = 0.20 / 0.50 = 40%` → ~2,184 cells
- `P(narrow ratio < 0.35) = 0.35 / 0.50 = 70%` → ~3,822 cells

The Generator's 60-80% estimate corresponds to a threshold of 0.30-0.40, not 0.20.

**Impact**: At 0.20, expect ~2,200 fusion requests (not 3,300-4,400). After interval merging, ~800-1,000 super-cells (not 1,200-1,800). At the recommended 0.35 threshold, ~3,800 fusion requests → ~1,400-1,600 super-cells.

**Required fix**: Correct the estimate in documentation. No code change needed — the actual count is data-dependent and will be logged.

**Severity**: WARNING — affects performance expectations but not correctness.

---

### C4 [NOTE]: Exact-Boundary Degenerate Case Needs Guard

**Scenario**: Chain vertex at `cv.u == unionU[c]` exactly.

**Trace**:
1. `bsearchFloor(unionU, cv.u)` at [OWT L894](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L894) → returns `c` (since `arr[c] <= value`)
2. Cell is `(band, c)`, `distToLeft = cv.u - unionU[c] = 0`
3. `0 / cellWidth = 0 < R54_NEAR_BOUNDARY_FRAC` → triggers fusion LEFT → neighbor `c-1`
4. Super-cell `(c-1, c)`, intermediate column at `unionU[c]`
5. In `emitSuperCell` at [L1787](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1787): grid vertex `band * numU + c` added to `botEdge`
6. Also: chain vertex (from `info.botChainVerts`) added at same U position
7. Dedup at [L1810-1814](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1810) is index-based (`Set<number>`), NOT position-based → both vertices remain
8. Sort puts them adjacent → `constrainedSweepCell` gets two collinear vertices at identical U → zero-area triangle

**Mitigating factors**:
- R52 Precision Lock prevents `batch2Remap` merging, so the chain vertex index ≠ grid vertex index
- If the chain vertex is exactly on a column boundary, R35 cross-column edge detection likely also triggers (chain edge crosses the boundary), creating a redundant R35 fusion request that merges with R54's
- Exact floating-point equality is vanishingly rare in practice

**Required fix**: Add minimum-distance guard in the detection loop:
```typescript
if (minDist < 1e-10) continue; // Exact-boundary: handled by R35 cross-column detection
```

**Severity**: NOTE — extremely unlikely to trigger in practice, and zero-area triangles are non-manifold-breaking. But a 1-line guard eliminates it entirely.

---

### C5 [NOTE]: Seam-Cell Fusion Limitation Is Acceptable

**Scenario**: Chain vertex near the seam (U ≈ 0 or U ≈ 1) in seam-adjacent cell.

**Generator's guard**: `If neighborCol < 0 or neighborCol >= cellsPerRow: SKIP`

**Analysis**: This means chain vertices near the seam boundary in the first or last cell column cannot fuse with the "other side" of the seam. The narrow-side sliver persists for these cells.

**Scale**: ~420 rows × 1-2 affected cells per seam × (probability of chain near seam) = very small. Most chains don't pass through the seam region. The seam guard at [OWT L1015-1027](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1015) is load-bearing for manifold integrity — relaxing it would be far more dangerous than tolerating a few slivers.

**Required fix**: None. Document the limitation.

**Severity**: NOTE — acceptable trade-off.

---

### C6 [NOTE]: Neighbor-Is-Chain-Cell Interaction Is Safe

**Scenario**: R54 fuses cell c with neighbor c+1, but cell c+1 has its OWN chain from a different feature.

**Trace**: 
- `emitSuperCell(band, c, c+1)` at [OWT L1793](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1793) collects chain vertices from BOTH cells:
  ```typescript
  for (let c = colStart; c <= colEnd; c++) {
      const info = cellChainMap.get(cellKey(band, c));
      if (info) { for (const cvIdx of info.botChainVerts) { botEdge.push(cvIdx); } }
  }
  ```
- All chain vertices appear as free points on the edge arrays
- `constrainedSweepCell` handles multiple chain edges via the partition mechanism at [OWT L1860-1880](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1860)
- Edge deduplication at [L1870-1880](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1870) prevents duplicate entries

With inter-chain spacing of ~0.077 U (≈ 51 cells), adjacent chain cells from DIFFERENT chains are extremely rare. If it occurs, the super-cell simply has two independent chain edges — handled correctly by the existing sweep.

**Required fix**: None.

**Severity**: NOTE — confirmed safe.

---

## Verification Results

### V1: Super-Cell Merger Code — CONFIRMED ✓

**Traced at** [OWT L916](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L916): `fusionRequests: SuperCell[]`

The `SuperCell` interface at [OWT L307-311](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L307):
```typescript
interface SuperCell { band: number; colStart: number; colEnd: number; }
```

R54 requests are identical in structure. The merger at [L983-997](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L983):
```typescript
if (reqs[i].colStart <= cur.colEnd + 1) {
    cur.colEnd = Math.max(cur.colEnd, reqs[i].colEnd);
}
```

The `+ 1` enables ADJACENT interval merging (colEnd=5 + colStart=6 → merged). This correctly handles R54 requests adjacent to R35 requests. Mixed R35/R54 requests in the same band merge seamlessly — the merger treats all requests identically, confirming **Assumption 3**.

### V2: emitSuperCell Intermediate Columns — CONFIRMED ✓

**Traced at** [OWT L1787](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1787):
```typescript
if (c < colEnd) { botEdge.push(band * numU + (c + 1)); }
```
And [L1807](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1807):
```typescript
if (c < colEnd) { topEdge.push((band + 1) * numU + (c + 1)); }
```

For a 2-column super-cell (c, c+1), the intermediate boundary `unionU[c+1]` is included as `band * numU + (c+1)` in the bottom edge and `(band+1) * numU + (c+1)` in the top edge. The sort at [L1814](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1814) orders these by U position. The chain vertex (at a different U from the intermediate column) sorts to its correct position. The narrow sub-quad is eliminated — the intermediate column becomes a healthy interior point.

**Confirming Assumption 1.**

### V3: R37 Interaction — CONFIRMED ✓

**Traced at** [OWT L1121](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1121):
```typescript
for (const [r37Band, r37Cells] of superCellMap) {
```

R37 iterates ALL super-cells (R35 + R54 after merger). The crossing detection at [L1164-1180](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1164):
```typescript
for (let c = r37Sc.colStart + 1; c <= r37Sc.colEnd; c++) {
    const uBound = unionU[c];
    // ... crossing detection ...
}
```

For an R54 fused super-cell (c, c+1):
- **Chain does NOT cross intermediate boundary**: `crossingTs.length === 0` at [L1192](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1192) → R37 skips → correct (no band split needed)
- **Chain DOES cross** (chain drift within band): R37 fires, creates phantom row → correct (band splitting at crossing)

**Confirming Assumption 2.** R37 is trigger-agnostic — it checks for actual column-boundary crossings regardless of WHY the super-cell was created.

### V4: BPP Interaction — CONFIRMED ✓

**Traced at** [OWT L1400](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1400):
```typescript
for (const [scBand, scCells] of superCellMap) {
```

BPP propagates phantom vertices from super-cells to their OUTER neighbors. For R54 super-cell (c, c+1):
- Left neighbor `(band, c-1)`: check at [L1408](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1408) — `leftAdjacentCol = sc.colStart - 1 = c - 1`. If not in `superCellCols`, phantoms propagated to its RIGHT edge. Correct.
- Right neighbor `(band, c+2)`: check at [L1436](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1436) — `rightAdjacentCol = sc.colEnd + 1 = c + 2`. Same logic. Correct.
- Former boundary cells (c and c+1) are INSIDE the super-cell — they're in `superCellCols`, so BPP skip guards at [L1413](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1413) and [L1443](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1443) correctly exclude them as neighbors.

BPP entries are built AFTER super-cell construction, so no stale entries exist for absorbed cells. **Confirmed safe.**

### V5: Threshold — AMENDMENT REQUIRED (see C2)

The Generator's 0.20 lets 8:1 slivers through. Recommend 0.35 for "absolutely perfect" chain tessellation.

### V6: Trigger Count — OVERESTIMATED (see C3)

At 0.20: ~40% of cells trigger (not 60-80%). At recommended 0.35: ~70%.

### V7: Cascading Fusion — CONFIRMED LOW RISK ✓

**Worst-case construction**:
1. Cell c has chain vertex near RIGHT boundary → fuse request (c, c+1)
2. Cell c+1 has chain vertex near LEFT boundary → fuse request (c, c+1) [same!]
3. Cell c+2 has chain vertex near LEFT boundary → fuse request (c+1, c+2)
4. Requests (c, c+1) and (c+1, c+2) are adjacent → merged to (c, c+2) = 3-column super-cell

For this to cascade further:
- Cell c+3 must ALSO have a chain vertex near its LEFT boundary
- With cellWidth ≈ 0.0015, the chain must traverse 4× cellWidth = 0.006 in the same band (bandHeight ≈ 0.0024)
- Chain drift rate ≈ 0.094 / 313 rows ≈ 0.0003 U per row
- In one band (1 row), the chain moves ~0.0003 U — much less than cellWidth
- So a single chain occupies at most 1-2 cells per row

**Max practical super-cell width from R54**: 3 columns (when chain vertex falls near the boundary between two cells, fusing both sides). Combined with R35 cross-column super-cells: max ~4-5 columns. **Generator's estimate confirmed.**

### V8: Performance — CONFIRMED LOW IMPACT ✓

**Detection loop**: O(cellChainMap.size × max_verts_per_cell) ≈ O(5,000 × 4) = 20,000 float comparisons. At ~1ns each = ~20µs. **Negligible.**

**Super-cell emission**: At recommended 0.35 threshold, ~1,400-1,600 super-cells (up from ~200-400). Each `emitSuperCell` call:
- Edge construction: O(n log n) where n ≈ 4-8 → ~30 ops per cell
- `constrainedSweepCell`: O(n²) where n ≈ 6-10 → ~60 ops per cell
- Total extra: ~1,200 extra calls × ~90 ops = ~108,000 ops ≈ 0.1ms

**Work redistribution**: These cells would otherwise be emitted by `emitChainCell` with similar per-cell cost. The work is MOVED from `emitChainCell` to `emitSuperCell`, not ADDED. Each super-cell processes 2 cells in ~1.5× the cost of one `emitChainCell` call. **Net overhead: ~50% × 1,200 calls = ~600 extra cell-equivalents ≈ 0.05ms.**

**Confirmed near-zero performance impact.**

### V9: Edge Cases

**(a) u_chain == unionU[c]**: See C4. Guard with `if (minDist < 1e-10) continue`. R35 handles the exact-boundary case.

**(b) Chain vertex near BOTH boundaries**: Both fusion requests generated. Same or overlapping intervals → merger produces single wider super-cell. Chain vertex is well-centered in the fused cell. **Correct.**

**(c) Bot/top vertices near DIFFERENT boundaries**: Diagonal chain edge → R54 fuses both sides → 3-column super-cell. R37 detects the intermediate boundary crossing and creates phantom rows. **Correct and beneficial.**

**(d) Seam neighborhood**: See C5. Seam-adjacent cells skip fusion when neighbor is out of bounds or seam-spanning. The seam guard at [OWT L1015-1027](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1015) ensures manifold integrity. A small number of seam-adjacent slivers may persist. **Acceptable trade-off.**

---

## Assumption Verification Summary

| # | Assumption | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Intermediate column vertex included in `emitSuperCell` | **CONFIRMED** | [OWT L1787](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1787), [L1807](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1807) |
| 2 | R37 fires correctly for crossing/non-crossing chain edges | **CONFIRMED** | [OWT L1121-1192](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1121) |
| 3 | Merger doesn't distinguish request sources | **CONFIRMED** | [OWT L983-997](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L983) |
| 4 | Seam guard rejects seam-spanning fusions | **CONFIRMED** | [OWT L1013-1027](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1013) |
| 5 | `cellChainMap` entries accessible for all constituent cells | **CONFIRMED** | [OWT L1793](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1793), [L1808](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1808) |

---

## Accepted Items

1. **Core mechanism**: Append near-boundary fusion requests to `fusionRequests` before section 3.8 merger — elegant reuse of proven R35 infrastructure.
2. **Proposal 2 rejection**: Correct — `applyChainDeadZones` failure mode (U-space tiling) is well-documented and the function exists but is explicitly NOT called at [PEC L1419-1421](../../src/renderers/webgpu/ParametricExportComputer.ts#L1419).
3. **Proposal 3 rejection**: Correct — shared-column invariant is load-bearing for the entire tessellation.
4. **Proposal 4 rejection**: Correct — statistical dead zones fail for drifting chains.
5. **Integration with Axes 1/2**: Correct analysis. Cell fusion reduces the scope of both axes, making them simpler cleanup passes.
6. **Changeset R54-F1 scope**: ~30 lines detection loop + 1 constant. File impact limited to OWT section 3.7-3.8 gap.

---

## Open Questions — Answers

**Q1 (R54_NEAR_BOUNDARY_FRAC = 0.20)**: Too conservative. Raise to 0.35. See C2.

**Q2 (R37 with non-crossing chain edges)**: Confirmed correct — R37 checks for actual crossings, not fusion trigger type. Non-crossing chains in fused cells are handled by `emitSuperCell`'s standard sweep without band splitting. See V3.

**Q3 (Multi-chain super-cell quality)**: Confirmed safe — `constrainedSweepCell` handles multiple independent chain edges via the edge-set/partition mechanism. See C6.

**Q4 (Maximum super-cell width)**: Confirmed ~3-4 columns from R54. Inter-chain spacing (~51 cells) prevents wider cascading. See V7.

**Q5 (Diagnostic-first implementation)**: **RECOMMENDED.** Phase 1: detection + logging only (count cells that WOULD fuse, log aspect ratio statistics). Phase 2: enable fusion. This lets us validate trigger statistics and aspect-ratio distribution before changing tessellation output. The Executioner should implement this two-phase approach.

**Q6 (Adaptive threshold)**: The aspect-ratio-based trigger (`narrowWidth / bandHeight < R54_MIN_NARROW_ASPECT`) is mathematically superior because it directly targets the quality metric. However, it introduces a per-row dependency (bandHeight varies). Recommend starting with fixed `R54_NEAR_BOUNDARY_FRAC = 0.35` for simplicity, with Q6's adaptive approach as a follow-up if the fixed threshold produces too many false positives in bands with small bandHeight.

---

## Implementation Conditions (for Executioner)

### Phase 1: Diagnostic-Only (R54-F1a)

1. Insert detection loop between sections 3.7 and 3.8 in `buildCDTOuterWall`
2. `R54_NEAR_BOUNDARY_FRAC = 0.35`
3. Add minimum-distance guard: `if (minDist < 1e-10) continue`
4. **DO NOT append to `fusionRequests`** — log only:
   - Total chain cells scanned
   - Cells that WOULD trigger fusion (count + percentage)
   - Narrow-side width distribution (min, max, median, p95)
   - Estimated super-cell count after hypothetical merging
5. Validate: typecheck, lint, vitest pass
6. Export gothic_arches and examine diagnostic output

### Phase 2: Enable Fusion (R54-F1b)

1. Remove the diagnostic-only guard — append to `fusionRequests`
2. Add seam-neighborhood guard: `if (neighborCol < 0 || neighborCol >= cellsPerRow) continue`, plus `unionU[neighborCol+1] - unionU[neighborCol]` seam check
3. Add diagnostic logging: `[CDT] R54: N near-boundary fusions (from M chain cells, threshold=0.35)`
4. Validate:
   - Super-cell count increase matches Phase 1 estimate
   - Chain-strip aspect ratio distribution: narrow-side slivers >8:1 eliminated
   - Total triangle count: within ±5% of baseline
   - No manifold violations
   - No new console warnings/errors
   - Export 3-4 styles and visually inspect chain ridge quality

### Validation Protocol

| Check | Expected | Failure Response |
|-------|----------|-----------------|
| Typecheck | 0 errors | Fix before proceeding |
| Lint | 0 warnings | Fix before proceeding |
| Vitest | All pass | Investigate failures |
| Super-cell count | +1,000-1,600 over baseline | If <500, threshold may be too low; if >2,000, investigate cascading |
| Chain-area worst aspect | <5:1 | If >5:1, threshold needs increase |
| Triangle count | ±5% of baseline | If >10% change, investigate |
| gothic_arches ridges | No staircase artifacts | Visual inspection required |

---

## Risk Summary

| Risk | Level | Mitigation |
|------|-------|------------|
| Exact-boundary degeneracy | Very Low | `minDist < 1e-10` guard (C4) |
| Seam-cell slivers | Very Low | Document limitation (C5) |
| Incorrect trigger count | Low | Phase 1 diagnostics validate (C3) |
| Threshold too conservative | Medium | Raised to 0.35 (C2) |
| R37/BPP/dispatch regression | Very Low | All code paths verified (V3, V4) |
| Performance impact | Very Low | ~0.05ms overhead (V8) |
