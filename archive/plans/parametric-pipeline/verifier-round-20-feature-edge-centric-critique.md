# Verifier Round 20 — Critique of Generator Feature-Edge-Centric Proposals

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS (P0, P1, P2) · ACCEPT WITH AMENDMENTS (P3) · ACCEPT REJECTION (P5)

The Generator's root cause analysis is accurate and well-evidenced. P0 is a critical bugfix. P1+P2 are sound in principle but have a budget overflow flaw and a tight clearance margin. P3 has two code-path contradictions the Generator missed. P4 is correctly deferred. P5 is correctly rejected.

**Critical strategic note**: P0 alone delivers the single largest improvement. I recommend implementing P0 first, running a full export at d8/e4, and evaluating the remaining grid-alignment before committing to P1+P2+P3.

---

## Critique

### C1 [CRITICAL]: P2 Fan Budget Overflow at density > 8

**Generator's claim**: "With MAX_FAN_PER_BAND=40, this fits" — referring to 28 fan companions + 12 T-ring = 40 at density=8.

**Actual behavior**: The budget fits *exactly* at density=8 but overflows at density ≥ 9. The `emitted` counter in `emitUGradedFan` ([OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L703)) is shared between the shell loop and (proposed) T-ring. The shell loop has `if (emitted >= MAX_FAN_PER_BAND) return;` which exits the *entire function* before the T-ring loop is reached.

**Counterexample — density=9, nShells=7**: Using the formula `max(1, floor(density × (nShells - s) / (nShells × 2)))`:
```
shell 0: max(1, floor(9×7/14)) = 4
shell 1: max(1, floor(9×6/14)) = 3
shell 2: max(1, floor(9×5/14)) = 3   ← was 2 at density=8
shell 3: max(1, floor(9×4/14)) = 2
shell 4: max(1, floor(9×3/14)) = 1
shell 5: max(1, floor(9×2/14)) = 1
shell 6: max(1, floor(9×1/14)) = 1
Per-side: 4+3+3+2+1+1+1 = 15.  Per-band: 30.
T-ring wants 12.  Total: 42 > 40.
```

**Counterexample — density=12, nShells=7** (user's worst case):
```
shell 0: 6, shell 1: 5, shell 2: 4, shell 3: 3, shell 4: 2, shell 5: 1, shell 6: 1
Per-side: 22.  Per-band: 44 > 40.
```
The shell loop alone exceeds the budget. Shells 5-6 are never reached. The T-ring is completely suppressed.

**Design flaw**: The T-ring fills the *most critical* gap (PROMO_EPSILON→first shell), yet it's emitted *last* and truncated *first*. This inverts the priority — the outermost, least visually important shell companions consume the budget before the near-chain T-ring.

**Required fix**: Either:
1. **Emit T-ring BEFORE shells** — reverse the loop order so near-chain companions have guaranteed budget.
2. **Separate budgets** — `MAX_FAN_PER_BAND` for shells, `MAX_TRING_PER_BAND = 12` for T-ring, total cap = sum.
3. **Scale MAX_FAN_PER_BAND with density** — e.g., `MAX_FAN_PER_BAND = max(40, 2 * density * nShells / 7 + 12)`. But this risks unbounded growth.

Option (1) is simplest and correct. The T-ring is the *raison d'être* of P2 — it closes the PROMO→first-shell gap. Letting outer shells pre-empt it defeats the purpose.

---

### C2 [WARNING]: P2 Shell 0 Clearance is Marginal for Non-Vertical Edges

**Generator's claim**: Shell 0 at fraction=0.04, U-offset = 0.000234, clears relaxed guard 0.0002. ✓

**Incomplete analysis**: The Generator computes U-offset but the guard checks *perpendicular distance*, not U-offset. For a chain edge with slope du/dt ≠ 0, perpendicular distance < U-offset.

**Counterexample — 45° tilted edge**: A chain edge from (0.10, tLo) to (0.15, tHi) has dU = 0.05, dT = tGap ≈ 0.0023, slope angle ≈ atan(0.05/0.0023) ≈ 87.4° from the T-axis. A companion at U-offset = 0.000234 laterally from the chain vertex has perpendicular distance:

```
d_perp = U-offset × cos(angle_from_U_axis)
```

For near-vertical edges (typical), angle_from_U_axis ≈ 87.4°, cos ≈ 0.045. d_perp ≈ 0.000234 × 0.045 ≈ 0.0000105. This is below BOTH guard thresholds.

Wait — I need to reconsider. The perpendicular distance to the line segment depends on the companion's actual position relative to the edge, not just the U-offset. Let me recompute properly.

The companion is at (cv.u + 0.000234, tLo + k/(nT+1) × tGap). The edge is from (cv.u, tLo) to (cv_next.u, tHi). For a near-vertical chain edge where the *same* chain vertex cv has the edge, the edge is from (cv.u, tLo) to approximately (cv.u + small_du, tHi). The companion at (cv.u + 0.000234, tLo + 0.20×tGap) is laterally offset from the edge starting point.

For truly vertical edge (du=0): d_perp = |U-offset| = 0.000234 > 0.0002. ✓ Barely.

For edge with dU = 0.001 over dT = 0.0023 (moderate drift): The edge line passes through mid-companion region. At T = tLo + 0.20×tGap, the edge is at U = cv.u + 0.001 × 0.20 = cv.u + 0.0002. The companion at (cv.u + 0.000234, this T) is only 0.000034 from the edge. This is BELOW the relaxed guard (0.0002) so it's actually rejected.

**Conclusion**: Shell 0 at fraction=0.04 survives only for nearly-vertical chain edges (dU/dT < ~0.015). For drifting chains, the innermost shell is still rejected. This is an inherent limitation of perpendicular-distance guarding with tight shells.

**Severity**: WARNING, not CRITICAL. The system degrades gracefully — drifting chains simply don't get innermost shells. The next shell (fraction=0.09, U-offset=0.000526) has 2.63× the guard clearance and survives moderate drift. The visual impact is minor: drifting chains already have larger edge-to-companion angles, so the first-triangle effect is less pronounced.

**No fix required**, but the Generator should not claim "shell 0 always survives" in documentation. The improvement estimate (guard rejects <3,000) may be optimistic for styles with significant chain drift.

---

### C3 [CRITICAL]: P3 Contradicts Existing pointIdx Guard

**Generator's claim**: "Edge interpolation doesn't require creating new ChainVertex objects — we can reuse the parent vertex's metadata (chainId, rowIdx) for the interpolated sample."

**Actual behavior**: [OuterWallTessellator.ts line 772](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L772):
```typescript
for (const cv of chainVertices) {
    if (cv.pointIdx < 0) continue; // skip interpolated micro-row vertices (C5)
```

The companion generation loop *explicitly skips* any chain vertex with `pointIdx < 0`. The Generator's `tryEmitCompanion` ([line 641](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L641)) sets `pointIdx: -1` on all companion vertices. If edge-interpolated sample vertices are pushed to `chainVertices` with `pointIdx: -1` (the natural convention for synthetic points), they would be skipped by the C5 guard.

**Required fix**: Edge interpolation must use a **separate loop** after the main chain-vertex loop. The C5 guard exists for a reason (micro-row interpolated vertices should not emit companions, per Verifier Round 18). The edge-interpolated samples are a different concept — they are companion *emission sites*, not chain vertices themselves. The implementation should:
```typescript
// After the main chain-vertex companion loop (line 798):
// Edge-interior companion emission (P3):
for (const [v0Idx, v1Idx] of chainEdges) {
    const cv0 = chainVertices[v0Idx - gridVertexCount];
    const cv1 = chainVertices[v1Idx - gridVertexCount];
    // ... interpolate and emit to the CORRECT band only
}
```

---

### C4 [WARNING]: P3 Both-Band Emission is Wrong for Edge Interpolations

**Generator's claim**: Reuse `parent.rowIdx` for interpolated samples, then emit via the standard above/below band pattern.

**Actual behavior**: The main companion loop (lines 776-797) emits to both the "above" band (row j → j+1) and "below" band (row j-1 → j) for each chain vertex at row j. This is correct for chain vertices *on* row j — they sit on the boundary between both bands.

For an edge-interpolated sample between rows j and j+1, the sample is in the *interior* of band j, not on a row boundary. Emitting companions to the "below" band (j-1 → j) would place them in a band the edge doesn't span.

**Counterexample**: Edge from (0.10, row 50) to (0.12, row 51). Midpoint sample at (0.11, between rows 50 and 51). If `rowIdx = 50`:
- "Above" band (50→51): correct — companions placed between rows 50 and 51 near the edge. ✓
- "Below" band (49→50): incorrect — companions placed between rows 49 and 50 where the edge doesn't exist. These companions are not near any feature. ✗

**Required fix**: Edge-interpolated samples must emit to the **single band containing the edge** (the band from `min(rowIdx_v0, rowIdx_v1)` to `max(rowIdx_v0, rowIdx_v1)`). Do not emit to the second band.

---

### C5 [NOTE]: P1 Anisotropic Guard — t ∈ (0.1, 0.9) Threshold is Reasonable

**Generator's claim**: Projection parameter t ∈ (0.1, 0.9) identifies the safe zone for relaxed guard.

**Verification**: For chain edge A→B and adjacent edge B→C in the same band, a companion near vertex B:
- Projects onto edge A at t ≈ 1.0 → strict guard (0.001). ✓
- Projects onto edge B at t ≈ 0.0 → strict guard (0.001). ✓

The guard correctly maintains strictness near all edge endpoints, regardless of which edge's endpoint is nearby. The `constraintsByBand` index includes ALL edges in the band, so the outer `for` loop in `isNearConstraintEdge` checks against every edge. The companion must survive the guard against ALL edges, not just its "parent" edge. 

The threshold 0.1/0.9 means the strict zone extends 10% of edge length from each endpoint. For typical chain edges spanning one row band (dT ≈ 0.0023), the strict zone is 0.00023 in T from each endpoint. This is appropriate — it prevents thin-angle triangles at edge endpoints while allowing close companions at edge midpoints.

**Verdict**: No amendment needed. The threshold choice is reasonable.

---

### C6 [NOTE]: CDT Numerical Stability at 0.0002 Distance

**Generator's assumption**: "CDT (cdt2d library) is numerically stable with free points at distance 0.0002 from constraint edges."

**Verification**: The `cdt2d` library (v1.0.0) uses `robust-orientation` (Shewchuk's exact arithmetic predicates) and `robust-segment-intersect` for all geometric decisions. There is no epsilon or tolerance in the library — all orientation tests are exact.

A free point at distance 0.0002 from a constraint edge will be correctly classified as being on one side of the edge. CDT will produce valid (albeit potentially thin) triangles. The triangles will be topologically correct.

The only concern is triangle *quality*, not correctness. A triangle with one vertex at distance 0.0002 from the opposite constraint edge has minimum angle ≈ atan(0.0002 / edge_length) ≈ 0.005° for typical edge lengths. This is very thin in UV space but may map to acceptable aspect ratios in 3D space (where the T-direction is compressed).

**Verdict**: CDT is safe at 0.0002. No amendment needed.

---

### C7 [NOTE]: P5 Boundary Decimation — Generator Self-Rejection Correct

**Generator's claim**: Boundary decimation breaks shared-edge topology with the regular grid mesh.

**Verification**: Correct. The CDT strip boundary vertices are shared with adjacent grid cells. Omitting boundary vertices would create T-junctions at strip edges → non-manifold seams. The Generator's self-rejection is well-reasoned.

**Verdict**: ACCEPT the rejection.

---

### C8 [WARNING]: P2 T-Ring Companion At 0.10×tGap — Triangle Quality

**Generator's concern**: "The T-gap between [promoted vertex at 0.05×tGap] and [T-ring at 0.10×tGap] is 0.05×tGap ≈ 0.000115. Is this below the dedup threshold?"

**Verification**: 0.000115 >> 0.00001 dedup threshold. Not deduped. ✓

But the triangle formed between (promoted vertex at 0.05×tGap, shell-0 T-ring companion at 0.10×tGap U-offset=0.000234, next companion at 0.20×tGap) has:
- T-span: 0.10×tGap ≈ 0.000230
- U-span: 0.000234

This is roughly 1:1 aspect ratio in UV space — actually well-shaped. The concern about quality here is unfounded for the T-ring companions specifically. The worst triangle is the PROMO→T-ring connection:
- Vertices: promoted at (cv.u, 0.05×tGap), T-ring at (cv.u ± 0.000234, 0.10×tGap)
- This triangle's base = 2×0.000234 = 0.000468, height = 0.05×tGap ≈ 0.000115
- Aspect ratio ≈ 4:1 — acceptable.

**Verdict**: No amendment needed.

---

### C9 [WARNING]: P0 + P1+P2+P3 Interaction — Diminishing Returns vs. Complexity

The Generator's root cause analysis correctly identifies P0 as the dominant fix. The UI defaults at d4/e1 produce:
- 1 T-level, 1 U-spread → minimal companions
- expansion=1 → only 3-column strips → nearly no room for fan companions
- This negates ALL of R19's work for UI-initiated exports

At d8/e4 (after P0):
- 2 T-levels, 2 U-spread
- expansion=4 → 9-column strips
- 4 fan shells with T-levels [4,3,2,1] per side
- ~25-30K additional companions

**Evidence from R19 journal entry**: "Expected companion counts at density=8, expansion=4: ~20 fan companions per band per CV... ~25-30k total additional companions."

P0 delivers a **4× improvement** in companion density with zero risk. P1+P2 add perhaps another **2× improvement** with medium risk. P3 adds ~1.5× with low-medium risk.

**Recommendation**: Implement P0 immediately (trivial one-line fix). Run full export at d8/e4. Evaluate remaining grid-alignment artifacts. If still insufficient, proceed with P1+P2 (with C1 amendment). P3 deferred until P1+P2 validated.

---

## Meta-Question: Does P1+P2 Address the Core Complaint?

The user's complaint: "chain strips still inherit from the grid."

Two interpretations:
- **(a) First-triangle-layer too large**: P1+P2 directly address this by placing companions closer to the chain edge. The first triangle shrinks from ~15% to ~5% of band height.
- **(b) Overall grid-column-aligned pattern**: P1+P2 mitigate but don't eliminate this. CDT boundaries remain all-grid-columns. With more interior points, CDT connects the nearest interior companion to each boundary column, creating slightly smaller but still grid-column-aligned triangles. The truss-level topology still follows grid columns.

**However**: Interpretation (a) is likely dominant after P0. At d4/e1, there are effectively no interior points, so CDT draws straight lines from boundary to chain. At d8/e4 with P1+P2, the companion cloud creates a graduated density field that CDT respects. The resulting triangulation radiates from the chain in a fan-like pattern. Grid-column alignment may still be visible at the strip boundary edges but not in the chain-adjacent region.

**P4 (explicit fan layer)** is the only proposal that truly eliminates grid-column influence in the near-chain zone, but its implementation complexity is not justified at this stage.

**Verdict on meta-question**: P0+P1+P2 are sufficient for the near-term. P3 is valuable but secondary. Evaluate after P0 before committing engineering effort to P1+P2+P3.

---

## Accepted Items

1. **P0 (UI defaults fix)**: Trivially correct. [ExportDialog.tsx lines 146-147](potfoundry-web/src/ui/controls/ExportDialog.tsx#L146-L147) has `chainStripDensity: 4, chainStripExpansion: 1` overriding backend defaults of `densityMultiplier: 8, expansion: 4` at [ChainStripTriangulator.ts line 46](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L46). Pure bugfix.

2. **P1 (Anisotropic guard)**: Mathematically sound. The cdt2d library uses exact arithmetic (`robust-orientation`), so there is no epsilon concern at 0.0002 distance. The t ∈ (0.1, 0.9) threshold correctly maintains strict guard near all edge endpoints via the full-band constraint scan. Accepted as proposed.

3. **P2 (Ultra-near shells + T-ring)**: Sound concept, budget flaw. Shell fractions [0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0] are well-graduated. T-ring at [0.10, 0.15] × tGap correctly fills the PROMO→first-shell gap. `interiorByBand` bucketing correctly handles T-ring T-positions (verified strict inequality check at [line 808](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L808)). **Requires C1 amendment.**

4. **P3 (Edge interpolation)**: Correct root cause (coverage gaps at edge midpoints). The dedup system scales to 744K calls (bucket density ~0.05 per bucket, O(180) per check). **Requires C3 + C4 amendments.**

5. **P5 rejection**: Correct. Boundary decimation breaks shared-edge topology.

6. **Generator's root cause analysis**: All four root causes verified against code. Constraint guard reject count of 41,742 is consistent with the 0.001 guard eating 34% of the U-range on each side at expansion=4.

---

## Open Questions for Generator

1. **Priority inversion in budget allocation**: At density=9, outer shells consume 30 of 40 budget slots, leaving only 10 for the 12-slot T-ring. The T-ring addresses the most visible defect (PROMO→first-shell gap). Should the emission order be reversed, or should T-ring have a reserved budget?

2. **Shell 0 survival rate**: What fraction of chain edges have dU/band < 0.015 (the approximate threshold for shell-0 survival with relaxed guard)? If most edges are near-vertical, shell 0 works well. If styles produce significantly drifting chains, shell 0 is largely rejected and the effective innermost shell is at fraction=0.09.

3. **P3 emission site metadata**: The Generator proposes `sample_t_row = cv_i.rowIdx` but doesn't specify how the interpolated site determines its band or avoids the pointIdx guard. What is the concrete implementation plan for the separate emission loop?

4. **After P0, how bad is it?** Has any export actually been run at d8/e4? The R19 implementation was validated for test correctness but the journal doesn't mention a visual evaluation at d8/e4. P0 might be sufficient.

---

## Implementation Conditions (if ACCEPT)

### Phase 1: P0 (Immediate — gated)

1. Change [ExportDialog.tsx lines 146-147](potfoundry-web/src/ui/controls/ExportDialog.tsx#L146-L147) to `chainStripDensity: 8, chainStripExpansion: 4`.
2. Run full export with console logging. Capture companion count, guard reject count, min angle, max aspect.
3. Visual inspection of chain strip mesh. Take screenshots.
4. **Gate**: If minAngle improves to ≥ 2° and grid-column alignment is substantially reduced, evaluate whether P1+P2 are still needed before proceeding.

### Phase 2: P1 + P2 (Conditional on Phase 1 evaluation)

5. Add `CONSTRAINT_GUARD_RELAXED = 0.0002` constant.
6. Replace `isNearConstraintEdge` with anisotropic version.
7. Update `SHELL_FRACTIONS` to 7 shells: `[0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0]`.
8. **C1 FIX**: Emit T-ring BEFORE shell loop, with reserved budget of 12. Reduce MAX_FAN_PER_BAND for shells to max(30, remaining budget). Or simpler: emit T-ring first with its own counter, then emit shells with `MAX_FAN_PER_BAND=30` (unchanged from R19).
9. Run export. Verify guard reject count drops significantly. Verify no CDT sweep fallbacks increase.
10. Verify `interiorByBand` correctly buckets T-ring companions (should be trivially true given strict inequality at [line 808](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L808)).

### Phase 3: P3 (Conditional on Phase 2 evaluation)

11. Add edge-interpolation loop AFTER the main chain-vertex loop (NOT inside it — C3 fix).
12. Each edge-interpolated sample emits to ONE band only (the band containing the edge — C4 fix).
13. Use M=2 initially (lower than Generator's M=3) to control companion explosion.
14. Consider reduced shell count (first 3-4 shells only) for edge-interpolated sites.

### Validation Protocol (all phases)

- All existing tests pass (1896/1896)
- tsc: no new errors
- Export console log metrics:
  - `guardRejects` < 5,000 (was 41,742)
  - `companionCount` > 80,000 (was 47,970)
  - `minAngle` > 2° (was 0.0°)
  - `maxAspect` < 1,000:1 (was 8,296:1)
  - `sweepFallbacks` unchanged or decreased
  - `R2violations` < 15,000 (was 46,816)
- Visual: grid-column pattern substantially reduced in chain strip regions
- Performance: export time < 2× baseline (companion generation + dedup)

---

## Overall Verdict

**P0: ACCEPT** — Critical bugfix, implement immediately.

**P1: ACCEPT** — Sound anisotropic guard. No amendments required.

**P2: ACCEPT WITH AMENDMENTS** — C1 (budget priority inversion) must be fixed before implementation. T-ring emitted first with reserved budget. C2 (shell-0 marginal clearance) is a graceful degradation, not blocking.

**P3: ACCEPT WITH AMENDMENTS** — C3 (pointIdx guard blocks interpolated samples) and C4 (both-band emission is wrong for mid-edge samples) must be addressed. Use separate loop, single-band emission.

**P4: ACCEPT DEFERRAL** — Correct to defer.

**P5: ACCEPT REJECTION** — Correct to reject.

**Strategic recommendation**: Implement P0 first. Evaluate results. Proceed to P1+P2 only if needed. P3 after that.
