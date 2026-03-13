# Verifier Round 23 — Critique of Generator PROMO_EPSILON 3D/UV Consistency Fix

Date: 2026-03-06

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal is fundamentally sound. The root cause analysis is correct — the 3D/UV mismatch between CDT placement (promotedT) and vertex buffer storage (tRow) is the structural cause of unfixable slivers. P1 resolves this by making all three systems (vertex buffer, CDT placement, getUV crossing detection) agree on promotedT. Code verification confirms all six assumptions hold. Two minor amendments required.

---

## Question-by-Question Verification

### Q1: Vertex Buffer T Consumers — CONFIRMED SAFE

**Generator's claim**: "No code path depends on row-boundary chain vertices having stored T = tRow."

**Verification**: I traced every read of `vertices[... * 3 + 1]` in OuterWallTessellator.ts:

| Line | Consumer | Reads chain vertex T? | Affected by P1? |
|------|----------|----------------------|-----------------|
| 949 | D-Radical duplicate copy | Yes — copies from original | Yes — Change B replaces this |
| 964 | Shadow vertex allocation | No — uses `tVal = activeTPositions[row]` | No |
| 1249-1252 | Quad winding verification | No — grid vertices only (`bl, br, tl, tr = j*numU+i`) | No |
| 1489 | Rescue code `isBot` check | No — guard `if (vIdx >= gridVertexCount) continue` at L1484 | No |
| 1545 | getUV for grid vertices | No — grid path, vIdx < gridVertexCount | No |
| 1549 | getUV for topDup vertices | Yes — reads buffer directly | Yes — reads promoted T (correct after P1) |
| 1552 | getUV for chain vertices | No — reads `cv.t ?? activeTPositions[cv.rowIdx]` | Yes — Change C replaces with buffer read |
| 1666 | Batch6 dedup quantization | Yes — quantizes UV for dedup key | See C1 below |

**Additional consumers in ParametricExportComputer.ts**:
- **GPU snap pass**: Disabled for outer wall (`snapToFeatures=false` at PEC L1455). Not consumed.
- **chainDirectedFlip / flipEdges3D**: Operate on 3D positions (post-GPU), not UV buffer. Not affected.
- **FeatureEdgeGraph**: Uses `chainVertexChainIds` which maps vertex indices to chain IDs — no T dependency.
- **Seam edge filter** (PEC L1419): Reads U from buffer (`outerVerts[v0 * 3]`), not T. Not affected.

**`buildMergedRow`** (OWT L1032-1097): Does NOT read from vertex buffer. Uses `cv.u`, `cv.vertexIdx`, `cv.rowIdx` from the ChainVertex data structure. **Not affected.**

**`chainVertexChainIds`** (OWT L1848-1854): Maps `cv.vertexIdx → cv.chainId`. **No T dependency.**

**Verdict: CONFIRMED.** No code path semantically depends on `T = tRow`. One quantitative note (C1 below).

---

### Q2: D-Radical Manifold Safety — CONFIRMED SAFE

**Generator's claim**: No code assumes original and duplicate are at the same 3D position.

**Verification**:

- **`topDupReverse`** (used at OWT L1511, L1564): Looks up chain vertex METADATA (chainId, pointIdx, etc.) — never position. Position is read from vertex buffer at the dup's own index.
- **`topDupMap`** (used at OWT L1368-1370): Swaps original index → dupIdx in `stripInteriorVerts`. The `promotedT` is computed fresh from `tTop - PROMO * tGap`, NOT from the duplicate's stored T.
- **Strip construction**: Original appears in band `[rowIdx, rowIdx+1]` with promotedT = `tBot + PROMO * tGap_bot`. Duplicate appears in band `[rowIdx-1, rowIdx]` with promotedT = `tTop - PROMO * tGap_top`. These bands may have different tGap values. But each CDT only sees ONE of these vertices — the original or the duplicate — so no consistency issue.
- **Edge flip code** (MeshOptimizer.ts): Operates on 3D positions from GPU evaluation. After P1, each vertex evaluates at its own buffer T. The original evaluates at `S(u, tRow + PROMO*gap_bot)`, the duplicate at `S(u, tRow - PROMO*gap_top)`. Different 3D positions, different vertex indices, used in different bands. Correct.

**Verdict: CONFIRMED.** The D-Radical mechanism is position-agnostic — it creates unique indices for topological isolation, not positional equality.

---

### Q3: Edge Case E2 (Last Row) — CONFIRMED SAFE

**Generator's claim**: Chain vertices at rowIdx=numT-1 only appear as topRow chains; the original vertex is never used in CDT.

**Verification**:

1. **Strip loop** (OWT L1294): `for (let j = 0; j < numT - 1; j++)` — band indices 0..numT-2. For `j = numT-2`, `topRow = buildMergedRow(numT-1)`. Chain at rowIdx=numT-1 appears in this topRow.

2. **Top chain processing** (OWT L1365-1370): When `sv.isChain`, the CDT uses `dupIdx ?? sv.idx`. Since `topDupMap` creates an entry for every row-boundary chain (OWT L942-945, unconditionally), `dupIdx` exists. The original `sv.idx` is never used.

3. **No bottom band**: Band `[numT-1, numT]` doesn't exist. The original vertex never appears as botRow.

4. **P1 Change A fallback**: For `rowIdx = numT-1`, `rowIdx + 1 >= numT` → fallback to `vertices[vIdx++] = rowT`. Correct — the buffer stores tRow for this unused vertex.

5. **Batch6 dedup**: The original vertex at tRow could dedup with a grid vertex at the same position (same row, similar U). This already happens pre-P1. After P1, it still happens because the fallback stores tRow. No behavior change.

**Verdict: CONFIRMED.** The original vertex index at the last row is never referenced in any CDT triangle.

---

### Q4: Resnap Interaction — CONFIRMED SAFE

**Generator's claim**: Resnap happens before OWT; the vertex buffer T is set by OWT, not consumed by resnap.

**Verification**:

1. **Pipeline order** (ParametricExportComputer.ts):
   - Steps 1-6: Feature detection, chain linking, GPU resnap (on chain data structures)
   - Step 7: `buildCDTOuterWall` — creates vertex buffer with UV coordinates
   - Phase 3: GPU `evaluatePoints` — evaluates `S(u, t)` from vertex buffer

2. **Snap disabled for outer wall** (PEC L1455): `false, // Snap disabled — union grid has dedicated feature columns`. The `snapToFeatures` parameter is explicitly `false`.

3. **Chain resnap** (Step 3.5): Operates on chain data structures, refining `cv.u` values. OWT reads `cv.u` from these refined chains. The T value in the vertex buffer is set fresh by OWT at line 931.

**Verdict: CONFIRMED.** The resnap pipeline does not read or depend on the T value stored in the vertex buffer.

---

### Q5: Mathematical Correctness — CONFIRMED WITH NOTE

**Generator's claim**: S(cv.u, tRow + PROMO * tGap) is a valid, on-surface position between row boundaries.

**Verification**:

1. **On surface**: By definition, `S(u, t)` evaluates the parametric surface at any `(u, t) ∈ [0,1]²`. The promoted T is within the band `[tRow, tRow + tGap]`, so it's within [0,1]. Valid.

2. **Between boundaries**: For the outer wall pot surface, Z-height is monotonic in T (the pot grows from bottom to top). The promoted position at `T = tRow + 0.20 * tGap` produces a Z-height between `S(u, tRow)` and `S(u, tRow + tGap)`. No surface fold.

3. **Offset magnitude**:
   - At 432 rows: tGap ≈ 0.00231
   - PROMO offset: 0.20 × 0.00231 = 0.000463 parametric
   - Physical (100mm pot): ~0.046mm
   - Resnap tolerance: 0.073mm → offset is 63% of resnap tolerance
   - Printer layer height: 0.1-0.2mm → offset is 23-46% of one layer

4. **Feature accuracy**: The chain vertex was GPU-resnapped to the exact feature (peak/valley) U at `tRow`. After P1, the GPU evaluates at `tRow + offset` instead. The feature contour drifts in U by approximately `(∂feature_U/∂T) × PROMO × tGap`. For typical features (ridges along T), `∂feature_U/∂T` is small (drift ~0.094/432 per row ≈ 0.00022 per row). The additional PROMO shift contributes ~4.4e-5 U-drift — negligible.

**Verdict: CONFIRMED.** The promoted position is mathematically valid and the fidelity cost is imperceptible.

---

### Q6: Constraint Edge Crossing (getUV) — CONFIRMED SAFE, IMPROVEMENT

**Generator's claim**: Change C simplifies getUV; crossing detection behavior is preserved.

**Verification**:

**Current state (THREE-WAY INCONSISTENCY)**:
- Vertex buffer: T = tRow
- getUV returns: tRow (via `cv.t ?? activeTPositions[cv.rowIdx]`)
- CDT placement: promotedT

The CDT places vertices at promotedT but getUV reports tRow. The crossing detection test uses UV coordinates that DON'T match where CDT placed the vertices.

**After P1 (CONSISTENT)**:
- Vertex buffer: T = promotedT
- getUV returns: promotedT (from buffer)
- CDT placement: promotedT

All three agree. The crossing detection now uses the same UV coordinates as the CDT.

**Crossing geometry preservation**: Within a single band, ALL constraint endpoints shift by the same PROMO pattern:
- Bottom-row chains: shifted from tBot to tBot + PROMO * tGap
- Top-row chains: shifted from tTop to tTop - PROMO * tGap

For two constraint edges with endpoints at (u_a, tBot+δ)→(u_b, tTop-δ) and (u_c, tBot+δ)→(u_d, tTop-δ), the crossing test result depends on the U-interval overlap, which is unchanged. The T-shift is uniform across all edges in the band, preserving the relative crossing geometry.

**edgeConfidence tiebreaker**: The function at OWT L1556 computes `Math.hypot(u1 - u0, (t1 - t0) / (tTop - tBot + 1e-12))`. After P1, the T-distance between endpoints changes (from `|tTop - tBot|` to `|tTop - tBot| × (1 - 2×PROMO)`). This changes the confidence score tiebreaker but not the crossing detection itself. Since confidence only determines WHICH of two crossing edges to drop (not WHETHER they cross), this is a minor behavioral difference in conflict resolution — not a correctness issue.

**Verdict: CONFIRMED.** Change C makes the crossing detection more accurate by aligning getUV with CDT placement. This is strictly an improvement.

---

## Edge Case Verification

### E1 (First Row, rowIdx=0): CONFIRMED SAFE
- Chain at rowIdx=0 only appears as botRow in band [0,1]. `rowIdx+1 = 1 < numT` → promoted T computed correctly.
- topDupMap entry exists but dupIdx is never referenced (no band [-1,0]).
- Change B guard: `cv.rowIdx - 1 >= 0` → false → fallback `T = tRow`. Correct (unused dup).

### E2 (Last Row, rowIdx=numT-1): CONFIRMED SAFE
- See Q3 above. Original vertex stores tRow (fallback), unused in CDT.

### E3 (Seam Vertices): CONFIRMED SAFE
- Seam is U-space phenomenon. P1 modifies T values only. No interaction with SEAM_THRESHOLD or SEAM_GUARD.

### E4 (Micro-Rows): CONFIRMED SAFE
- At tGap=0.002: PROMO offset = 0.0004 parametric. T-ring at frac=0.10 → 0.0002.
- Dedup threshold 1e-5 ≪ 0.0002 → no collision. Safe down to tGap ≈ 2.5e-5 (~40,000 rows).

### E5 (Explicit T Companions): CONFIRMED SAFE
- `cv.t !== undefined` → `vertices[vIdx++] = cv.t` (unchanged path in Change A).
- topDupMap skips them (`if (cv.t !== undefined) continue;` at OWT L943).

### E6 (getUV Buffer Read Safety): CONFIRMED SAFE
- Original chains (gridVertexCount ≤ vIdx < totalVertexCount): promoted T stored at L931.
- Duplicates (vIdx ≥ totalVertexCount): promoted T stored at L948-949 (Change B).
- Companions: explicit T stored at L931 via `cv.t` path (unchanged).
- All vertex buffer slots are populated before getUV is called (buffer allocation precedes strip loop).

---

## Critiques

### C1 [NOTE]: Batch6 Dedup Behavioral Change

**Generator's claim**: (Not explicitly discussed)

**Actual behavior**: Batch6 dedup (OWT L1660) quantizes `vertices[v * 3 + 1]` at 1e-5 resolution to build dedup keys. Before P1, a chain vertex at row j has the same T as its grid neighbor → potential dedup. After P1, the chain has promoted T → different key → no dedup with grid vertex.

**Impact**: Slightly more vertices survive dedup (chain vertices that previously collapsed onto grid vertices now remain distinct). This is CORRECT behavior — the vertices ARE at different positions and SHOULD be distinct. The `batch2Remap` mechanism in `buildMergedRow` already handles the U-coincidence case at a tighter threshold (1e-6), so batch6 dedup of chain→grid was redundant/accidental for most cases.

**Severity**: NOTE. No fix needed. The slight increase in vertex count is negligible and correct.

### C2 [WARNING]: Pseudocode Edge Case Label Mismatch

**Generator's claim**: Change A pseudocode comment says `// Last row: no band below, keep tRow (edge case E1)`.

**Actual**: This should reference E2 (Last Row), not E1 (First Row). E1 is the first-row case. The logic is correct; only the comment is wrong.

**Required fix**: In implementation, use comment `// edge case E2` for the `cv.rowIdx + 1 >= numT` fallback in Change A, and `// edge case E1-dup` or similar for the `cv.rowIdx - 1 < 0` fallback in Change B.

**Severity**: WARNING. Documentation error only, no behavioral impact.

### C3 [NOTE]: Defensive Guard in Change B May Be Unreachable

**Generator's claim**: Change B has `if (cv.rowIdx - 1 >= 0)` to guard against first-row chains.

**Actual behavior**: `topDupMap` creates entries for ALL row-boundary chains, including rowIdx=0. But the duplicate for rowIdx=0 is never referenced in any CDT strip (no band [-1, 0]). The guard is correct and harmless, but the else branch stores T=tRow for an unused vertex.

**Severity**: NOTE. The guard is defensive-correct. No change needed. The Executioner should keep it for safety.

### C4 [NOTE]: edgeConfidence Tiebreaker Delta

After P1, two constraint edges from the same chain at the same row have the SAME promoted T (both at `tBot + PROMO * tGap` or both at `tTop - PROMO * tGap`). Their T-distance is 0 in both pre- and post-P1. For cross-row edges, the T-distance changes from `|tTop - tBot|` to `|(tTop - PROMO*tGap) - (tBot + PROMO*tGap)| = tGap × (1 - 2×PROMO) = 0.6 × tGap`. This reduces the T-component of the confidence score by 40%. Since this is a tiebreaker (not a correctness gate), the impact is limited to changing which of two crossing edges gets dropped — a reasonable behavioral change.

**Severity**: NOTE. No fix needed.

---

## Generator Assumptions Verification Summary

| # | Assumption | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | `cv.rowIdx + 1 < numT` for botRow chains | **CONFIRMED** | Strip loop L1294: j < numT-1; botRow = buildMergedRow(j); chains have rowIdx=j < numT-1 |
| 2 | `cv.rowIdx - 1 >= 0` for topDupMap entries | **PARTIALLY CONFIRMED** | topDupMap is created for ALL row-boundary chains including rowIdx=0 (L942-945). Guard is needed but the duplicate is unused. |
| 3 | Promoted T produces valid surface evaluation | **CONFIRMED** | Promoted T ∈ [tRow, tRow+tGap] ⊂ [0,1]. Pot surface is smooth and monotonic in T. |
| 4 | getUV buffer read valid for all chain indices | **CONFIRMED** | Buffer populated at L929-932 before strip loop. All slots filled. |
| 5 | PROMO offset below perceptual threshold | **CONFIRMED** | 0.046mm < 0.073mm resnap < 0.1mm layer height |
| 6 | No other consumer depends on T = tRow | **CONFIRMED** | Full trace of all `vertices[*3+1]` reads — none semantically depend on T=tRow for chain vertices |

---

## Accepted Items

1. **P1 (Store Promoted T)**: ACCEPT. The root cause analysis is correct and the fix is structurally sound. All three mutations (Change A, B, C) are verified safe.
2. **P2 (Reduce PROMO to 0.10)**: ACCEPT the deferral. Measure P1 impact first.
3. **P3 (T-Ring Fractions)**: ACCEPT (no change). Current fractions are well-layered at PROMO=0.20.

---

## Amendments

### Amendment A1: Verify Promoted T Matches CDT promotedT Exactly

The CRITICAL invariant is: `vertices[chainVertexIdx * 3 + 1]` must EQUAL the `promotedT` value computed in the strip loop. Both compute `tBot + PROMO * tGap` (for bot bands) and `tTop - PROMO * tGap` (for top bands). But they access `tBot`/`tTop`/`tGap` from potentially different sources:

- **Change A** (vertex allocation): Uses `activeTPositions[cv.rowIdx]` and `activeTPositions[cv.rowIdx + 1]`.
- **Strip loop** (L1305-1306): Uses `activeTPositions[j]` and `activeTPositions[j + 1]`.

For a chain at rowIdx=j appearing as botRow in band [j, j+1], `cv.rowIdx = j`, so both compute `activeTPositions[j] + PROMO * (activeTPositions[j+1] - activeTPositions[j])`. **These are identical.** ✓

For a chain at rowIdx=j appearing as topRow in band [j-1, j], the strip loop uses `tTop = activeTPositions[j]`, `tBot = activeTPositions[j-1]`, computing `activeTPositions[j] - PROMO * (activeTPositions[j] - activeTPositions[j-1])`. Change B computes `activeTPositions[cv.rowIdx] - PROMO * (activeTPositions[cv.rowIdx] - activeTPositions[cv.rowIdx-1])` where cv.rowIdx=j. **These are identical.** ✓

No amendment needed — the math is consistent. But the Executioner should add a debug assertion in development builds that verifies `Math.abs(vertices[sv.idx * 3 + 1] - promotedT) < 1e-9` when constructing `stripInteriorVerts`, to catch any future divergence.

### Amendment A2: Comment Accuracy

Change the pseudocode comment in Change A from `// edge case E1` to `// edge case E2 (last row)` and in Change B, use `// edge case E1-dup (first row, unused duplicate)`.

---

## Implementation Conditions (for the Executioner)

### Execution Order
1. Apply Change A (original chain vertex T) at OWT L931
2. Apply Change B (D-Radical duplicate T) at OWT L948-949
3. Apply Change C (getUV simplification) at OWT L1551-1553
4. Add optional debug assertion in strip construction (development only)

### Files Modified
- `OuterWallTessellator.ts`: 3 locations (~20 lines net)

### Validation Protocol
1. **Unit tests**: All existing OWT and ChainStripTriangulator tests must pass (58 + 21)
2. **Full suite**: All 1896+ tests must pass
3. **Export test**: Run a Petal-6 style export at default resolution
   - Check: `avg_aspect` should drop significantly (target: <20:1, from current 64.8:1)
   - Check: Chain-strip `R2violations` should decrease
   - Check: Edge flip `rejected` count should decrease (fewer unfixable slivers)
   - Check: `max_aspect` may still be high (seam artifacts are separate)
4. **Visual inspection**: Confirm no visible feature artifacts or flattening at chain positions
5. **Vertex count**: Slight increase expected from reduced batch6 dedup collisions — acceptable
6. **Buffer consistency**: Log `vertices[chainIdx * 3 + 1]` for a sample chain vertex and compare to the `promotedT` used in strip construction — must match to 1e-9

### Red Flags (Abort If Observed)
- Any test failure
- `avg_aspect` INCREASES (would indicate the fix direction is wrong)
- New degenerate triangles (collapsed to zero area)
- Missing chain edges count increases

---

## Open Questions for Generator
None. The proposal is well-specified and all claims verified.
