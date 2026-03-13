# Verifier Round 48 — Critique of Generator Proposals E1, F1, F2, G, H

Date: 2026-03-09

---

## Summary Verdict

| Proposal | Verdict | Severity Issues |
|----------|---------|-----------------|
| **E1** (Remove P3 Smoothing) | **ACCEPT WITH AMENDMENTS** | 1 WARNING |
| **F1** (Diagnostic Counters) | **ACCEPT** | — |
| **F2** (Second-Pass Re-snap) | **ACCEPT WITH AMENDMENTS** | 1 WARNING |
| **G** (P2 Fan Midpoint Insertion) | **ACCEPT WITH AMENDMENTS** | 2 CRITICAL, 2 WARNING |
| **H** (Ridge-Distance Diagnostic) | **REJECT** | 1 CRITICAL, 1 WARNING |

---

## Critique

---

### E1: Remove R47 P3 Smoothing Entirely

#### C1 [WARNING]: Attribution of sliver increase to P3 is unproven — could be P1

**Generator's claim**: "Sliver rate increased from 37.1% → 38.6% after R47, caused by P3 smoothing."

**Actual behavior**: R47 introduced TWO changes simultaneously:
- **P1**: Quality-gated CSO chain-grid flip (`CHAIN_GRID_FLIP_THRESHOLD = 0.20` rad) at [ChainStripOptimizer.ts](src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L177)
- **P3**: Neighbor-constrained re-snap smoothing at [ParametricExportComputer.ts](src/renderers/webgpu/ParametricExportComputer.ts#L1590-L1672)

P1 *releases* previously-blocked chain-grid edge flips (those exceeding the 0.20 rad quality-gain threshold). These flips ALTER TOPOLOGY, which directly affects triangle aspect ratios and sliver counts. P3 only moves vertices without changing topology — its effect on slivers is indirect (through angle changes from vertex displacement).

**Evidence**: CSO Phase A at [ChainStripOptimizer.ts](src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L640-L660) applies the quality gate:
```typescript
if (isChainGridEdge(shLo, shHi)) {
    const qualityGain = flipMin - curMin;
    if (qualityGain < CHAIN_GRID_FLIP_THRESHOLD) {
        chainGridFlips++;
        continue;
    }
    chainGridFlipsAllowed++;
}
```
The `chainGridFlipsAllowed` counter tells us HOW MANY chain-grid flips P1 performed. If this count is significant, P1 is the more likely cause of the 1.5% sliver increase.

**Counterexample**: Consider a chain-grid quad where the current diagonal creates two 15° slivers. P1 flips it (quality gain ≥ 0.20 rad). The flip may improve the worst angle but create a new pair of triangles with aspect ratio > 4:1 if the quad is elongated (which chain-grid quads often are). P3, by contrast, moves vertices by at most α × blendDu ≈ 0.6 × 0.001 = 0.0006 U — far too small to change aspect ratios significantly.

**Verdict on the mathematical argument**: The Generator's core claim is correct — GPU re-snap with parabolic refinement IS strictly more accurate than linear interpolation:
- Re-snap step = 2 × 2×SAMPLE_WIDTH / (32-1) ≈ 0.0000158 U per step
- Parabolic refinement adds ±0.5 step ≈ ±0.000008 U precision
- Total re-snap accuracy: ~0.00001 U
- Linear interpolation error at gapSize=4: up to ~0.004 U (drift across 4 rows)
- Therefore P3's blending toward linear interpolation DEGRADES accuracy by ~400×

The "noise ≈ ±0.00015 U" figure in repo memory is **wrong** — that would be the case without parabolic refinement. With refinement, noise is ~0.00001 U. The waviness attributed to re-snap noise was likely caused by something else (possibly the interaction of linear-blended positions with surface curvature variation).

**Required fix**: The Generator should acknowledge that the sliver attribution is uncertain but that removal is still justified on mathematical grounds. No code change needed — just intellectual honesty.

**VERDICT for E1: ACCEPT WITH AMENDMENTS**

**Amendment E1-A**: Implement F1 diagnostic BEFORE removing P3. Run an export with P3 still active and log the `chainGridFlipsAllowed` count from CSO. If it's > 50, P1 is the more likely sliver culprit, and removing P3 alone won't fix slivers. (This doesn't block E1 — P3 should still be removed for accuracy reasons regardless of sliver attribution.)

**Amendment E1-B**: After removing P3, run an export and compare the ridge-distance diagnostic (once H is properly implemented) to confirm no waviness regression. If waviness returns, the root cause was NOT re-snap noise but something P3 was masking.

---

### F1: Diagnostic Counters for Un-Refined Vertices

#### No critical issues found.

**Verification of the Pipeline Logic** at [ParametricExportComputer.ts](src/renderers/webgpu/ParametricExportComputer.ts#L1557-L1570):

```typescript
const moved = circularDistance(currentU, finalU);
if (moved > 1e-7 && moved < MAX_INTERP_DELTA) {
    combinedVerts[iv.vertexIdx * 3] = finalU;
    interpResnapCount++;
}
```

The 183/2190 un-refined vertices fall into exactly two categories:
1. **moved ≤ 1e-7**: The re-snap candidate was at (or negligibly near) the current position. The vertex was ALREADY at the extremum. Count: unknown.
2. **moved ≥ MAX_INTERP_DELTA (0.08)**: The re-snap wanted to move the vertex ≥ 0.08 U but was blocked by the safety guard. These are genuinely problematic — the vertex is far from the true ridge. Count: unknown.

The diagnostic simply adds a counter for each category within the existing loop. Zero risk.

**One enhancement**: Also log the actual `moved` value for overshoot vertices so F2 can calibrate its window:
```
max overshoot moved = X.XXXXXX U
```

**VERDICT for F1: ACCEPT**

---

### F2: Second-Pass Re-snap for Overshoot Vertices

#### C2 [WARNING]: Adjacent primaries may not bound the ridge U at inflection points

**Generator's claim**: "For overshoot vertices, re-try with constrained window bounded by neighboring primaries."

**Actual behavior**: The interpolated vertex sits between two primaries (lo, hi) in T. The Generator proposes constraining the re-snap window to [min(u_lo, u_hi), max(u_lo, u_hi)] in U.

**Counterexample**: Consider a chain where features curve non-monotonically in U:
```
  Primary at row 10: U = 0.320
  Interpolated at row 12: U = 0.315 (linear) → true ridge at U = 0.335
  Primary at row 14: U = 0.330
```
The window [0.320, 0.330] contains the true ridge (0.335... wait, no, 0.335 > 0.330). The true ridge is OUTSIDE the bounded window. The inflection causes the ridge to overshoot the primary envelope.

However, this scenario requires the ridge to drift by 0.005 U in 2 rows while the primaries only show 0.010 drift. At gap sizes that trigger overshoot (≥ 4 rows between primaries), the drift rate can be higher. The adaptive search window from Phase 2 was `min(0.01, gapSize² × 0.001)` — at gapSize=10 (the MAX_INTERP_DELTA trigger), the window is already 0.01.

**Mitigation**: Add a 20% margin beyond the primary envelope:
```typescript
const marginU = Math.abs(circularDistance(u_lo, u_hi)) * 0.2;
const windowLo = Math.min(u_lo, u_hi) - marginU;
const windowHi = Math.max(u_lo, u_hi) + marginU;
```

This covers inflection overshoot while still being much tighter than the unconstrained window.

**VERDICT for F2: ACCEPT WITH AMENDMENTS**

**Amendment F2-A**: Use primary envelope + 20% margin rather than strict primary bounds. The margin covers non-monotonic chain trajectories while preventing the 0.08+ overshoot that triggered the guard.

---

### G: P2 Fan Midpoint Insertion

#### C3 [CRITICAL]: `outerIdxCount` not updated — appended fan sub-tris invisible to CSO and Subdivision

**Generator's claim**: "In-place triangle overwrite + append. Split fan triangles: 2 → 4 per midpoint."

**Actual behavior**: `outerIdxCount` is set once at [ParametricExportComputer.ts](src/renderers/webgpu/ParametricExportComputer.ts#L1773):
```typescript
const outerIdxCount = allIdxArrays[0].length;
```

This value is passed to both CSO and MeshSubdivision. CSO scans only indices `[0, outerIdxCount)` at [ChainStripOptimizer.ts](src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L377-L386):
```typescript
for (let t = 0; t < outerIdxCount; t += 3) {
    if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
        chainStripTriSet.add(t);
    }
}
```

MeshSubdivision similarly scans `[0, outerIdxCount)` for chain-strip identification.

If P2 overwrites 2 fan tris in-place (within outerIdxCount range) and appends 2 new tris at the END of `combinedIdxs`, the appended tris fall BEYOND outerIdxCount. Consequences:
- CSO won't see them → won't optimize their edges
- MeshSubdivision won't see them → won't split their long edges
- Degenerate stripping won't count them as outer wall tris
- Boundary diagnostic won't include them

The 2 in-place overwritten tris WILL be scanned correctly. But having 2 orphaned tris per midpoint (~4000 midpoints = ~8000 orphaned tris) is unacceptable.

**Required fix**: After P2 completes, update `outerIdxCount` (or equivalently, use a `let` instead of `const` and reassign):
```typescript
let outerIdxCount = allIdxArrays[0].length;
// ... P2 runs, grows combinedIdxs ...
outerIdxCount += appendedFanTriCount * 3;
```

Alternatively: rebuild `combinedIdxs` with fan sub-tris interleaved at their original positions rather than appended. This preserves spatial locality but requires recomputing all triBase offsets in quadMap for grid cells after the insertion point — FAR more complex than just updating outerIdxCount.

#### C4 [CRITICAL]: Typed array growth — `combinedIdxs` is `Uint32Array`, cannot be appended to

**Generator's claim**: "In-place triangle overwrite + append."

**Actual behavior**: `combinedIdxs` is a `Uint32Array` (fixed-length typed array). You cannot `.push()` onto it. P2 must allocate a new, larger array and copy:
```typescript
const newIdxs = new Uint32Array(combinedIdxs.length + appendCount);
newIdxs.set(combinedIdxs);
// write appended tris at offset combinedIdxs.length
combinedIdxs = newIdxs;
```

This is the same pattern MeshSubdivision uses at [MeshSubdivision.ts](src/renderers/webgpu/parametric/MeshSubdivision.ts#L623-L628):
```typescript
const newCombinedIdxs = new Uint32Array(combinedIdxs.length + newTris.length);
newCombinedIdxs.set(combinedIdxs);
```

The Generator's proposal doesn't mention this detail. Not a design blocker, but the Executioner must use array reallocation.

Similarly, P2 adds new vertices to `resultData` (the GPU-evaluated 3D positions). This is also a `Float32Array` requiring reallocation:
```typescript
const newResultData = new Float32Array(resultData.length + newVertCount * 3);
newResultData.set(resultData);
```

And `combinedVerts` (UV data) needs growth to include midpoint UVs for downstream subdivision re-snap.

#### C5 [WARNING]: Fan sub-tris may be re-split by MeshSubdivision

**Generator's claim**: Fan sub-edges are short enough to skip subdivision.

**Analysis**: After P2 splits a fan diagonal, the sub-edges are approximately half the original diagonal length. MeshSubdivision uses `chainSubdivThreshold2 = (avgVertGridEdge × 0.50)²` for chain edges. If the original fan diagonal was 2× avgVertGridEdge (which is common — that's why it's a sliver), the sub-edges are ~1× avgVertGridEdge, which is 2× the chain threshold. They WOULD be re-split.

**Counterexample**: avgVertGridEdge = 0.77mm (typical). chainSubdivThreshold = 0.385mm. Fan diagonal = 1.6mm. After P2 split: sub-edges ≈ 0.8mm > 0.385mm threshold. MeshSubdivision would split them again, creating 4-level refinement on fan diagonals.

This isn't necessarily bad — the extra resolution helps at ridges. But it's an uncontrolled interaction that the Generator should acknowledge. The Executioner should add the new fan midpoint edges to `constraintEdgeSet` so they're tracked as chain edges with appropriate subdivision behavior.

#### C6 [WARNING]: P2's 3D aspect threshold of 3.0 — needs empirical validation

**Generator's claim**: "3D aspect ratio threshold = 3.0"

**Analysis**: The sliver metric uses 4:1 (aspect ratio > 4). P2 targets 3.0 — this means P2 will split MORE triangles than just the slivers. Is this intentional?

At 3.0 threshold with typical chain topology: approximately 50-60% of fan triangles would be split vs 38.6% at the 4.0 sliver threshold. This means ~8000-12000 midpoint GPU evaluations instead of ~4000. The Generator estimated ~4000 at ~50-100ms. At 12000, GPU eval time could be ~150-300ms.

The threshold also interacts with downstream subdivision. If set too low, P2 splits triangles that subdivision would have handled anyway, adding redundant GPU eval overhead.

**Required fix**: Neither blocking nor critical. But the Executioner should make the threshold configurable (e.g., `P2_FAN_ASPECT_THRESHOLD = 3.0`) and log how many tris are split at that threshold so it can be tuned.

---

### Open Question Answers

#### OQ1: Generator Question #5 — How does P2 interact with `chainDirectedFlip`?

**Answer: No interaction. Generator's analysis is CORRECT.**

Evidence traced through the code:

1. `chainDirectedFlip` at [MeshOptimizer.ts](src/renderers/webgpu/parametric/MeshOptimizer.ts#L66-L120) iterates chain segments and uses `quadMap` to find grid cell quads:
   ```typescript
   const triBase = quadMap[quadIdx];
   if (triBase < 0) return; // skip
   ```

2. Fan cells have `quadMap[idx] = -1` — set in `emitChainCell` at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1469):
   ```typescript
   quadMap[band * cellsPerRow + col] = -1;
   ```

3. Therefore `chainDirectedFlip` never processes fan tris (quadMap returns -1 → `flipToAD`/`flipToBC` return early).

4. P2's new fan sub-tris (whether overwritten in-place or appended) also don't appear in quadMap. No orphaned entries are created because fan cells never had quadMap entries.

5. `flipEdges3D` similarly uses quadMap and skips cells with triBase < 0.

**Conclusion**: P2 fan midpoint insertion is invisible to both chainDirectedFlip and flipEdges3D. Safe.

#### OQ2: Is the secondary GPU eval call safe?

**Answer: YES.**

`evaluatePoints` at [ParametricExportComputer.ts](src/renderers/webgpu/ParametricExportComputer.ts#L247-L310) takes an arbitrary `Float32Array` of UV triples:
```typescript
const vertexCount = uvVertices.length / 3;
const vertexBuffer = this.device.createBuffer({ size: vertexBytes, ... });
```

No assumptions about vertex count, buffer layout, or relationship to the main mesh. It creates a fresh GPU buffer per call. Called ~12 times throughout PEC with varying batch sizes (from 32 to ~500K). ~4000-12000 midpoints is well within budget.

#### OQ3: Does P2 need re-snapping for midpoints?

**Analysis**: P2 places midpoints at UV-space midpoints of fan diagonals, then GPU-evaluates them. The fan diagonal endpoints are: one chain vertex (on-ridge) and one grid corner (off-ridge). The UV midpoint of (on-ridge, off-ridge) is NOT on the ridge — it's halfway between.

However, the midpoint is placed to IMPROVE triangle quality, not to sit on the ridge. It's an interior mesh point, not a feature point. Re-snapping it TO the ridge would defeat the purpose (creating uniform triangulation, not ridge-tracing). The midpoint should stay where GPU eval places it.

**Exception**: If the grid corner was batch2Remapped (merged with a chain vertex), both endpoints might be on-ridge. Then the midpoint COULD benefit from re-snapping. But this is rare (batch2Remap only triggers when chain vertex U ≈ grid column U within 1e-4), and even then, the midpoint is still interior to the mesh topology.

**Conclusion**: No re-snapping needed for fan midpoints.

---

### G VERDICT: ACCEPT WITH AMENDMENTS

**Amendment G-A** [CRITICAL]: Update `outerIdxCount` after P2 to include appended fan sub-tris. Without this, CSO, MeshSubdivision, boundary diagnostic, and degenerate stripping all miss the new tris.

**Amendment G-B** [CRITICAL]: Use typed-array reallocation for `combinedIdxs`, `resultData`, and `combinedVerts` growth. The Executioner must follow the same pattern as MeshSubdivision.

**Amendment G-C** [WARNING]: Add new fan sub-edges to `constraintEdgeSet` so downstream MeshSubdivision treats them as chain edges with appropriate threshold gating, preventing uncontrolled recursive splitting.

**Amendment G-D** [NOTE]: Make the aspect threshold configurable and log the split count so it can be tuned empirically.

---

### H: Ridge-Distance Diagnostic

#### C7 [CRITICAL]: ±0.005 U window is too narrow — misses worst-case vertices

**Generator's claim**: "Probe ±0.005 U window for true extremum."

**Evidence**: The Generator's own data shows worst chain delta = 0.008735 U. For a vertex that is 0.008 U off the true ridge (possible for un-refined overshoot vertices from F1/F2), the diagnostic probes:

```
[vertex_U - 0.005, vertex_U + 0.005]
```

The true ridge at vertex_U + 0.008 is OUTSIDE this window. The diagnostic reports the vertex as "0.005 U off-ridge" (the window edge) when it's actually 0.008 U off-ridge. The diagnostic UNDERESTIMATES the error for the very vertices it's most important to measure.

**Required fix**: The diagnostic window must be at least `max(0.01, worst_chain_delta × 1.5)`:
```
worst_chain_delta = 0.008735 U
required_window = max(0.01, 0.008735 × 1.5) = max(0.01, 0.0131) = 0.0131 U
→ use ±0.015 U half-width
```

This covers the full range of observed chain drift with margin. The probe cost with 64 candidates across 0.030 U is ~0.000469 U/step — still sub-sample precision.

Actually, a more principled approach: use the same adaptive window as Phase 2 re-snap, calculated per-vertex from gapSize. This guarantees consistency between what the re-snap searched and what the diagnostic measures.

#### C8 [WARNING]: Diagnostic should re-evaluate from UV, not use `finalResultData`

**Generator's claim**: "Compare chain vertex 3D position to true ridge position."

**Analysis**: `finalResultData` contains 3D positions from Phase 3 GPU eval, PLUS modifications from:
1. chainDirectedFlip (topology change only — doesn't move vertices)
2. CSO (topology change only)
3. MeshSubdivision (adds new vertices at GPU-evaluated midpoints)
4. Phase 3 subdivision re-snap (modifies SOME midpoint 3D positions in finalResultData)

The chain vertex 3D positions in finalResultData are from Phase 3 GPU eval — they're the GPU-surface positions at whatever U the vertex had AFTER Phase 2 re-snap (and Phase 2b smoothing, if P3 hasn't been removed yet). These positions are ON the mathematical surface, but potentially at the wrong U.

For the diagnostic, we need TWO separate 3D positions:
- **Current position**: `finalResultData[vtxIdx * 3 .. +2]` — where the vertex actually is
- **True ridge position**: GPU-evaluate the optimal U (found by the diagnostic probe) at the same T

The 3D distance between these two positions gives the geometric error in mm. The U distance gives the parametric error. Both are useful.

The diagnostic MUST call `evaluatePoints` with the probed candidates to get their 3D positions. It cannot use `finalResultData` for this because `finalResultData` doesn't contain the probe candidates' 3D positions.

Actually, re-reading the Generator's proposal: "probe ±0.005 U window for true extremum" — this implies a fresh GPU eval of the probe candidates, then comparison. So the Generator IS proposing a new evaluatePoints call. The concern about "using finalResultData" is about which vertex positions to compare against. Using `finalResultData` for the CURRENT vertex position (not the probe) is correct.

**Revised assessment**: The diagnostic design is fundamentally sound IF the window is widened per C7. The Generator just needs to be explicit about the GPU eval call for probes.

---

### H VERDICT: REJECT

**Rationale**: The ±0.005 U window (C7) is a fundamental design flaw that causes the diagnostic to systematically underreport errors for the worst-case vertices — exactly the ones we care most about. The diagnostic would give false confidence ("all vertices within 0.005 U of ridge") when some are actually 0.008+ U off.

**To earn ACCEPT in R48.1**:
1. Use adaptive per-vertex window: `hw = max(0.015, gapSize × 0.003)` — calibrated from Phase 2 re-snap window formula.
2. Use fresh `evaluatePoints` call for diagnostic probes (not finalResultData).
3. Separate tabs for: (a) primary vertices from Phase 1 detection, (b) interpolated vertices after Phase 2 re-snap, (c) subdivision midpoints after Phase 3 re-snap.
4. Report both U-distance and 3D-distance (mm) to true ridge.
5. Include the actual worst-vertex identity (chain ID, row, vertexIdx) to help F2 target specific failures.

---

## Final Verdicts

### E1: ACCEPT WITH AMENDMENTS
- E1-A: Run F1 diagnostic first; log `chainGridFlipsAllowed` to establish baseline for sliver attribution.
- E1-B: After removal, verify no waviness regression.
- Lines to delete: [ParametricExportComputer.ts](src/renderers/webgpu/ParametricExportComputer.ts#L1590-L1672) (the entire R47 Phase 2b block).
- Update repo memory to correct the "±0.00015 U noise" figure to ~±0.00001 U with parabolic refinement.

### F1: ACCEPT
- Pure diagnostic, zero risk.
- Enhancement: Also log max overshoot `moved` value for F2 calibration.

### F2: ACCEPT WITH AMENDMENTS
- F2-A: Use primary envelope + 20% margin rather than strict primary bounds.

### G: ACCEPT WITH AMENDMENTS
- G-A [CRITICAL]: Update `outerIdxCount` after P2.
- G-B [CRITICAL]: Use typed-array reallocation for all three buffers.
- G-C [WARNING]: Register fan sub-edges in `constraintEdgeSet`.
- G-D [NOTE]: Configurable threshold + log split count.

### H: REJECT
- Window too narrow (±0.005 < worst delta 0.008735).
- Redesign with adaptive per-vertex window (±0.015 minimum).
- Resubmit as H' with amendments 1-5 above.

---

## Implementation Order for Executioner

```
1. F1  (diagnostic only, zero risk, informs E1 and H)
2. E1  (delete P3, run F1 to confirm, check waviness)
3. G   (fan midpoint insertion — with amendments G-A through G-D)
4. F2  (second-pass re-snap for overshoot, contingent on F1 data)
5. H'  (redesigned ridge diagnostic, after all position fixes are in)
```

F1 comes first because it informs all other decisions. E1 before G because removing P3 simplifies the pipeline and gives G a cleaner starting state. F2 after G because G may change the overshoot vertex count. H' last because it should measure the FINAL pipeline state.

---

## Validation Protocol

After all changes are implemented, the Executioner must verify:

1. **Sliver rate**: Should decrease from 38.6% (or at minimum not increase beyond 40%).
2. **Ridge-distance (from H')**: P95 chain vertex U-error < 0.001 for primary, < 0.003 for interpolated.
3. **Export visual**: No visible dips, waviness, or seam artifacts in the default Chrysanthemum style.
4. **Performance**: Total Phase 2→4 time increase < 200ms from G's secondary GPU eval.
5. **Tests**: `npm run typecheck`, `npm run lint`, `npm test` all pass.
6. **Regression**: No new degenerate triangles introduced (check strip count in logs).
