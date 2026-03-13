# Verifier Round 47 — Critique of Generator's Topology-Based Dip/Wavy Analysis
Date: 2026-03-09

## Summary Verdict: ACCEPT WITH AMENDMENTS (Proposals 1, 2, 3); REJECT (Proposal 4); DEFER (Proposal 5)

The Generator's root cause analysis is substantially correct. The fan diagonal topology
IS the source of slivers, and the R46 re-snap noise IS the source of waviness on sharp
features. The mesh topology framing (vs. vertex position) is the right lens for these
residual artifacts. However, several implementation details need correction, and one
proposal (P4) has unacceptable architectural risk.

---

## Critique

### C1 [WARNING]: Re-snap noise magnitude is gap-size-dependent, not constant

**Generator's claim**: "Sampling noise ≈ ±½ candidate spacing ≈ ±0.00015 U"

**Actual behavior** (verified at [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1474-L1500)):

The Phase 2 interp re-snap uses **adaptive** windows: `hw = min(0.01, max(BASE_HW, gapSize² × 0.001))` where `BASE_HW = 2.0 / 8192 = 0.000244`. Candidates are 64 when `hw > 4 × SAMPLE_WIDTH` (i.e., for any `gapSize ≥ 1`).

| gapSize | hw | step = 2×hw/63 | Noise (±½ step) |
|---------|------|----------------|-----------------|
| 1 | 0.001 | 0.0000317 | ±0.0000159 |
| 2 | 0.004 | 0.000127 | ±0.0000635 |
| 3 | 0.009 | 0.000286 | ±0.000143 |
| 4+ | 0.01 | 0.000317 | ±0.000159 |

The Generator's ±0.00015 figure holds only for **gapSize ≥ 3**. For gapSize=1 (the most common case for densely-detected chains), noise is **10× smaller** than claimed. This matters because:

- Proposal 3's smoothing is most needed at large gaps but risks **over-smoothing** at small gaps
- The signal-to-noise ratio varies by an order of magnitude across gap sizes

**Impact on Proposal 3**: The fixed α = 0.3–0.5 blend is too aggressive for gapSize ≤ 2 vertices. See C5 below.

**Required fix**: Proposal 3 must use **per-vertex α** scaled by gap size (or equivalently, by parabolic refinement quality). See C5 for details.

---

### C2 [NOTE]: Generator's Proposal 1 pseudo-code contains redundant guards

**Generator's claim**: Proposal 1 adds three guards: (a) quality threshold, (b) `constraintEdgeSet.has(edgeKey(opp0, opp1))`, (c) `rowSpanExceeds()`.

**Actual behavior** (verified at [ChainStripOptimizer.ts](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L586-L643)):

The CSO code flow is:
```
L586: if (constraintEdgeSet.has(ek)) continue;        // ← shared edge is constraint → skip
L595: if (constraintEdgeSet.has(edgeKey(opp0,opp1))) continue; // ← new edge is constraint → skip
L599: if (!isConvexQuad3D(...)) continue;              // ← convexity
L602: if (rowSpanExceeds(...)) continue;               // ← row span
L607: if (edgeLenExceeds(...)) continue;               // ← edge length
L620: if (flipMin <= curMin + threshold) continue;     // ← quality check
L628: if (flipMin < MIN_ANGLE_FLOOR...) continue;      // ← floor check
...
L643: if (isChainGridEdge(shLo, shHi)) { chainGridFlips++; continue; } // ← blanket skip
```

Guards (b) and (c) in the proposal are **already applied** at L595 and L602 before the code reaches L643. The only effective new guard is (a) the quality threshold. This isn't a bug — it's just redundant pseudo-code. The implementation should simply replace L643 with the quality threshold check:

```typescript
if (isChainGridEdge(shLo, shHi)) {
    const qualityGain = flipMin - curMin;
    if (qualityGain < CHAIN_GRID_FLIP_THRESHOLD) { chainGridFlips++; continue; }
    chainGridFlipsAllowed++;
}
```

**Impact**: Implementation is simpler than proposed (~3 lines per phase, not ~8).

---

### C3 [WARNING]: Proposal 1 threshold of 0.15 rad needs empirical validation

**Generator's claim**: CHAIN_GRID_FLIP_THRESHOLD ≈ 0.15 rad (~8.6°) is appropriate.

**Analysis**: The existing quality threshold is `MIN_ANGLE_IMPROVEMENT = 0.005 rad` (verified at [ChainStripOptimizer.ts](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L165)). All 2118 prevented chain-grid flips have **already passed** this 0.005 rad test. So they are quality-improving flips being blocked.

The 0.15 rad threshold is 30× the existing quality threshold — very conservative. Without knowing the distribution of quality gains among the 2118 blocked flips, we can't determine what fraction this gating would release. Two risks:

1. **Too conservative**: If most blocked flips have gains of 0.01–0.05 rad, the 0.15 threshold releases almost none → proposal has no effect
2. **Not conservative enough**: If the 2118 flips have bimodal distribution (many small improvements + some large improvements), the large ones might be exactly the structurally significant edges where flipping causes visual artifacts

**Required fix**: Before implementing, add a **diagnostic-only** pass that logs the quality gain distribution of all chain-grid flips:
```typescript
if (isChainGridEdge(shLo, shHi)) {
    chainGridFlipGains.push(flipMin - curMin);  // collect for histogram
    chainGridFlips++; continue;
}
```
Export this histogram to the log. Then set CHAIN_GRID_FLIP_THRESHOLD to the 75th percentile of gains (release top 25% most beneficial flips). This is data-driven rather than arbitrary.

---

### C4 [NOTE]: Batch2Remap already allows chain-grid flips in merged cells

**Evidence** (verified at [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L867-L879)):

When a chain vertex is within `MERGE_THRESHOLD = 1e-4` of a grid column, `batch2Remap` assigns it a grid vertex index (< `outerGridVertexCount`). This means:

- Fan diagonals from merged cells have **both endpoints as grid indices** → `isChainGridEdge` returns `false` → these edges are **already freely flipped** by CSO
- Interior edges in merged cells are grid-to-grid → also freely flipped
- These free flips in merged cells have **not caused reported problems**

This is indirect evidence that selectively allowing chain-grid flips (Proposal 1) is safe: a subset of chain cells (the merged ones) already has this behavior and works fine. Proposal 1 extends this to non-merged cells with a quality gate.

Additionally, fan triangles from merged cells are **missed by both** CSO chain-strip detection paths:
- Index-based: all vertices < `outerGridVertexCount` → not detected
- UV-proximity: `chainAdjacentGridVerts` only includes **intermediate** column vertices, not corner vertices (verified at [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1562-L1565)). Corner vertices shared with adjacent standard cells are excluded to prevent false positives.

**Impact**: This answers the Generator's **Open Question 5** — yes, fan triangles with all batch2Remapped vertices ARE missed by `identifyChainStripTriangles`. However, this is benign: merged cells have near-zero-area fan triangles (chain vertex ≈ grid vertex), so there's nothing to optimize.

---

### C5 [CRITICAL]: Proposal 3 needs adaptive α, not fixed α

**Generator's claim**: "α = 0.3–0.5 is in the right range for the noise/signal ratio"

**Counterexample**: Consider a chain with mixed gap sizes — some vertices at gapSize=1 (noise ±0.000016, very accurate re-snap) and others at gapSize=4 (noise ±0.000159, noisy re-snap). A fixed α = 0.4 would:

- At gapSize=1: Blend 40% toward linear interpolation, **degrading** a highly accurate re-snap by up to 0.4 × (resnap - linear) ≈ 0.0001 U
- At gapSize=4: Blend 40% toward linear interpolation, providing useful smoothing

The parabolic refinement denominator `denom = L - 2C + R` is a direct measure of peak "sharpness" at the sample scale. When `|denom|` is large, the parabola is well-conditioned and the re-snap is accurate. When `|denom|` is small, the profile is flat and re-snap is noisy.

**Required fix**: Compute α per-vertex as a function of re-snap confidence:

```typescript
// Option A: Gap-size based (simple)
const alpha = Math.min(0.6, iv.gapSize * 0.15);
// gapSize=1 → α=0.15, gapSize=2 → α=0.3, gapSize=3 → α=0.45, gapSize=4 → α=0.6

// Option B: Parabolic quality based (mathematically grounded)
// Requires storing the parabolic denom from Phase 2 re-snap
const alpha = 1.0 / (1.0 + Math.abs(parabolicDenom) * CONFIDENCE_SCALE);
```

Option A is implementable now without storing additional data. Option B is superior but requires Phase 2 re-snap to emit per-vertex confidence scores.

The Executioner should implement **Option A** initially, with an interface ready for Option B.

---

### C6 [WARNING]: Proposal 2 fan midpoint insertion must handle MeshSubdivision interaction

**Generator's claim**: Fan midpoints are inserted post-OWT, before GPU eval.

**Actual pipeline order** (verified at [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1683-L1770)):

```
OWT → [Proposal 2: fan midpoint insertion] → interp re-snap (Phase 2) → GPU eval
→ chainDirectedFlip → flipEdges3D → CSO → boundaryDiag → MeshSubdivision → subdiv re-snap (Phase 3)
```

MeshSubdivision (`subdivideLongEdges`) at PEC line 1741 splits long edges and adds midpoints. It receives `constraintEdgeSet` and uses it to protect chain edges from certain splits. If Proposal 2 pre-splits fan diagonals, the split sub-edges must be added to `constraintEdgeSet` **before** it's passed to both CSO and MeshSubdivision. Otherwise:

1. CSO might flip a fan diagonal sub-edge (not in constraintEdgeSet)
2. MeshSubdivision might re-split an already-split fan diagonal, creating T-junctions

**Required fix**: After fan midpoint insertion, add both sub-edges `(chainBot, M)` and `(M, gridCorner)` to `constraintEdgeSet`. This must happen **before** `buildConstraintEdgeSet` is called at PEC line 1683, or the sub-edges must be added to `outerFanDiagonalEdges` so the PEC loop at line 1686 picks them up.

Actually — there's a **sequencing problem**: Proposal 2 inserts vertices post-OWT, but `constraintEdgeSet` is built at PEC line 1683 (post-GPU-eval, in Phase 4). Fan midpoint insertion would need to happen **between** OWT and GPU eval, but `constraintEdgeSet` is built **after** GPU eval. The fan midpoint sub-edges must be tracked separately and merged into `constraintEdgeSet` when it's built.

The cleanest approach: have fan midpoint insertion return the list of sub-edges, store them alongside `outerFanDiagonalEdges`, and include them in the PEC line 1686 loop.

---

### C7 [NOTE]: Proposal 2 UV-midpoint approximation is valid

**Generator's assumption**: "UV-midpoint of a fan diagonal is close enough to the true surface midpoint"

**Verification**: The fan diagonal connects (u_chain, t_bot) to (u_grid, t_top) where `|t_bot - t_top|` ≈ 1 row spacing in T ≈ 1/409. The UV midpoint is at `((u_chain + u_grid)/2, (t_bot + t_top)/2)`. After GPU evaluation, this point is placed **exactly on the parametric surface** — it's not a 3D midpoint approximation but a true surface point at the UV midpoint. Since the fan diagonal spans at most 1 row × 1 column cell (U span ≤ ~0.002, T span ≤ ~0.0024), the UV-space parameterization distortion is negligible. The UV midpoint approach is **valid**.

---

### C8 [CRITICAL]: Proposal 4 (Column Densification) has cascading architectural risks

**Generator's claim**: "Eliminates slivers at the source" by adding chain U positions as grid columns.

**Counterexamples and risks**:

1. **Narrow column pairs**: Two adjacent chains at similar but different U values (e.g., a ridge at U=0.250 and a valley at U=0.253) would inject two columns separated by ΔU = 0.003. GridBuilder's `mergeFeaturePositions` (verified at [GridBuilder.ts](../src/renderers/webgpu/parametric/GridBuilder.ts#L76-L138)) merges positions closer than `minSep = avgSpacing × 0.1`. With 558 columns, `avgSpacing ≈ 0.00179`, `minSep ≈ 0.000179`. Two columns at ΔU = 0.003 are **not** merged → creates a 0.003-U-wide column, which is 1.7× `avgSpacing`. But if two chains are at U=0.250 and U=0.2505, ΔU = 0.0005 — also not merged (> 0.000179). This creates a **0.0005-U-wide column**, ≈ 0.28× average spacing. Slivers in the grid itself.

2. **Column count explosion**: Verified chain U drift ≈ 0.094 across ~313 rows. Each chain creates up to `0.094 / 0.00179 ≈ 52` additional unique columns. With 20 chains that have **different** U drift patterns, worst case is `20 × 52 = 1040` new columns. Many overlap, but a reasonable estimate is **200–500 additional columns** (35–90% increase over 558 baseline). This changes `outerW` dramatically.

3. **Downstream cascading**: `outerW` is used throughout the pipeline:
   - GPU vertex buffer sizing (`outerW × outerH × 3`)
   - `chainDirectedFlip` and `flipEdges3D` use `outerW` for row/col neighbor addressing
   - `optimizeBoundaryDiagonals` uses `outerW`
   - `outerQuadMap` dimensions
   - Relaxation shader (`chunk4.w` at uniform offset 76)
   - Every surface stat
   
   Increasing `outerW` by 35–90% increases GPU evaluation cost proportionally and may push memory budgets on lower-end devices.

4. **CDF distribution disruption**: The CDF-adaptive grid distributes columns proportional to curvature². Injecting chain-specific columns at fixed U positions creates a bimodal distribution: CDF-dense near curvature features + chain-dense near chain features. These often coincide (chains track curvature features), but when they don't (chain at low-curvature position), the injection wastes columns on low-information regions.

**Verdict**: REJECT. The architectural risk and performance impact of changing `outerW` are disproportionate to the potential benefit. Proposals 1–3 address symptoms directly with minimal architectural coupling. If slivers remain after P1–P3, Proposal 2 (fan midpoint insertion) is the right targeted fix: it adds geometry only where needed without changing grid dimensions.

---

## Answers to Generator's Open Questions

### OQ1: Is batch2Remap MERGE_THRESHOLD (1e-4) optimal?

Verified at [OuterWallTessellator.ts line 867](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L867): `MERGE_THRESHOLD = 1e-4` (R34: coarsened from 1e-6).

Average column spacing ≈ 0.00179 U. Current merge threshold = 0.0001 U ≈ 5.6% of column spacing.

Increasing to 1e-3 (0.001 U ≈ 56% of column spacing) would merge chain vertices that are up to half a column width away from the grid line. This displaces the vertex's U position by up to 0.001 U ≈ 0.3mm. For ridges, this moves the vertex off the true ridge, causing the exact dips we're trying to fix.

**Recommendation**: Keep at 1e-4. The merge is a numerical precision tool, not a topology simplification tool.

### OQ2: Are fan diagonals actually in constraintEdgeSet?

**YES** — verified end-to-end:

1. OWT `constrainedSweepCell` pushes fan diag edges to `fanDiagEdges` array at lines [359](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L359) and [385](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L385)
2. OWT returns them as `fanDiagonalEdges` at [line 1864](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1864)
3. PEC stores them as `outerFanDiagonalEdges` at [line 1383](../src/renderers/webgpu/ParametricExportComputer.ts#L1383)
4. PEC builds `constraintEdgeSet` from `outerChainEdges` at [line 1683](../src/renderers/webgpu/ParametricExportComputer.ts#L1683), then **adds** fan diagonals at [lines 1686–1687](../src/renderers/webgpu/ParametricExportComputer.ts#L1686-L1687)
5. CSO receives `constraintEdgeSet` and checks it at [line 586](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L586) — BEFORE the `isChainGridEdge` check at [line 643](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L643)

**Consequence for Proposal 1**: The blanket `isChainGridEdge` skip is indeed **redundant** for fan diagonal protection — those are already caught by `constraintEdgeSet.has(ek)`. The `isChainGridEdge` skip only catches **non-fan, non-chain** interior edges (e.g., BL↔chainBot, gridTR↔chainTop). This confirms Proposal 1's core assumption is correct.

### OQ3: What is the quality gain distribution of the 2118 prevented flips?

**Cannot answer from code alone** — this requires runtime data. See C3: the Executioner must add a diagnostic pass to log the gain distribution before implementing the selective threshold.

### OQ4: Can we measure chord sag along ridges?

Yes, this is straightforward: for each chain edge (v0, v1), compute `UV_mid = ((u0+u1)/2, (t0+t1)/2)`, GPU-evaluate the surface at UV_mid, and compare to `3D_mid = (pos(v0) + pos(v1)) / 2`. The difference is the chord sag. This would be a valuable diagnostic but is **not required** before implementing Proposals 1–3.

### OQ5: Does identifyChainStripTriangles correctly classify fan triangles?

**PARTIALLY** — see C4 above. Fan triangles with all batch2Remapped vertices are missed by both index-based and UV-proximity detection. This is **benign** because merged cells have degenerate fan triangles (chain ≈ grid vertex). However, the Generator should know that CSO statistics (chain-strip tri count, sliver metrics) **undercount** by the number of merged fan triangles.

### OQ6: Companion T-fractions [0.33, 0.67] vs [0.25, 0.50, 0.75]?

No code analysis can answer whether ⅓/⅔ is better than ¼/½/¾ — this requires visual testing. The current fractions at [0.25, 0.50, 0.75] create 4 sub-bands per row. Switching to [0.33, 0.67] creates 3 sub-bands. Fewer sub-bands = fewer companion vertices = simpler topology but coarser approximation.

**Note**: Changing companion fractions affects every chain cell in every export. This is a global parameter change with unknown regression risk. Not recommended as part of R47.

---

## Accepted Items

### Proposal 1 (Selective CSO chain-grid flip): ACCEPT WITH AMENDMENTS
**Evidence for acceptance**:
- Fan diagonals are independently protected by `constraintEdgeSet` (OQ2 verified)
- Batch2Remapped cells already have free chain-grid flips without problems (C4)
- The blanket skip blocks quality-improving flips that passed all other safety guards
- All existing guards (convexity, row-span, edge-length, normal consistency, aspect ratio, angle floor) apply before the chain-grid check

**Amendments**:
- A1: Add diagnostic-only logging of quality gain distribution before setting threshold (C3)
- A2: Use simplified implementation (C2) — don't redundantly re-check guards
- A3: Start with a higher threshold (0.20 rad) and lower only after reviewing diagnostic data
- A4: Track `chainGridFlipsAllowed` count in CSO result for monitoring

### Proposal 2 (Fan midpoint insertion): ACCEPT WITH AMENDMENTS
**Evidence for acceptance**:
- UV midpoint + GPU evaluation gives geometrically correct surface points (C7)
- Fan diagonal is internal to the cell — no T-junction risk with adjacent cells
- Targeted fix: adds geometry only where needed (long fan diagonals with high aspect ratio)

**Amendments**:
- A5: Must add split sub-edges to `outerFanDiagonalEdges` for inclusion in `constraintEdgeSet` (C6)
- A6: Return sub-edge list separately from the insertion pass; merge into `constraintEdgeSet` at PEC line 1686
- A7: The aspect ratio threshold should be computed in **3D** (after GPU eval), not UV space. UV space can compress/stretch depending on the parameterization. This means fan midpoint insertion should happen **after** the first GPU eval, not before. Pipeline position: between GPU eval and CSO.

**Sequencing concern with A7**: If fan midpoints are inserted after GPU eval, the new vertex needs GPU evaluation too. This requires a second GPU eval call for just the midpoint vertices (small batch). This is feasible and only adds ~50–200ms.

### Proposal 3 (Neighbor-constrained re-snap): ACCEPT WITH AMENDMENTS
**Evidence for acceptance**:
- Re-snap noise IS real and problematic for large gap sizes (C1 confirms the qualitative analysis)
- Linear interpolation is a reasonable smooth estimate between primaries
- Zero GPU cost, minimal code

**Amendments**:
- A8 [CRITICAL]: Use per-vertex adaptive α, not fixed α (C5). Initial implementation: gap-size-based `α = min(0.6, gapSize × 0.15)`.
- A9: Add logging: `smoothed N vertices, avg α = X, max α = Y`
- A10: Skip smoothing when all vertices in a chain segment are primaries (gapSize = 0)

### Proposal 4 (Column densification): REJECT
See C8. Unacceptable architectural risk for the potential benefit.

### Proposal 5 (Dual chains): DEFER (agree with Generator)
Too much coupling risk between topology and position chains.

---

## Implementation Conditions

**Recommended phasing** (revised from Generator's recommendation):

### Phase A: Diagnostics (prerequisite for P1)
1. Add quality-gain histogram logging for chain-grid flips (C3)
2. Run one export, collect data
3. Set CHAIN_GRID_FLIP_THRESHOLD to the 75th percentile of gains

### Phase B: Proposals 1 + 3 (wavy artifact)
1. Implement Proposal 3 with adaptive α (C5, A8), add logging (A9)
2. Implement Proposal 1 with data-driven threshold (C3, A2, A3, A4)
3. All three CSO phases (A/B/C) must be updated identically
4. Run export, compare ridge straightness: expect wavy artifact eliminated

### Phase C: Proposal 2 (dips, if needed after Phase B)
1. Implement fan midpoint insertion after GPU eval (A7)
2. Use 3D aspect ratio threshold ≥ 3.0
3. Add sub-edges to constraintEdgeSet (A5, A6)
4. Secondary GPU eval for new midpoint vertices
5. Run export, compare dip depth: expect 40–60% reduction in sliver rate

### Validation Protocol
For each phase:
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` clean (0 warnings)
- [ ] `npm test` passes (1883 tests)
- [ ] Export a Gothic Arches style at default resolution
- [ ] Compare diagnostic log numbers to pre-change baseline:
  - Chain-strip sliver rate (% with aspect > 4:1)
  - Chain-grid flip count (should decrease for P1)
  - Interp re-snap count (should remain same for P3)
  - Fan diagonal count (should remain same unless P2 adds midpoints)
- [ ] Visual inspection of ridges: no waviness, no new dips

---

## Severity Summary

| ID | Severity | Proposal | Issue | Action |
|----|----------|----------|-------|--------|
| C1 | WARNING | P3 | Re-snap noise varies 10× by gap size | Per-vertex α (A8) |
| C2 | NOTE | P1 | Redundant guards in pseudo-code | Simplify (A2) |
| C3 | WARNING | P1 | 0.15 rad threshold is arbitrary | Diagnostic first (A1) |
| C4 | NOTE | P1 | Merged cells already have free flips | Supports P1 safety |
| C5 | CRITICAL | P3 | Fixed α over-smooths small-gap vertices | Adaptive α (A8) |
| C6 | WARNING | P2 | Split sub-edges need constraint protection | Track sub-edges (A5) |
| C7 | NOTE | P2 | UV midpoint is valid | Confirmed |
| C8 | CRITICAL | P4 | Architectural risk to outerW / performance | REJECT P4 |
