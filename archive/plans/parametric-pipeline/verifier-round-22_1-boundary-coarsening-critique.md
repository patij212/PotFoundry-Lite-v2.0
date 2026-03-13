# Verifier Round 22.1 — Critique of Boundary Coarsening Fix

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

The `lastKeptU` spacing gate is mechanically correct and addresses the right problem. The core logic is sound: left-to-right scan over a U-sorted merged row, threshold at `3.0/numU`, shadow updates to `lastKeptU`. Two warnings on analytical claims and one minor amendment for implementation.

---

## Critique

### C1 [NOTE]: V1 — Left-to-Right Scan Correctness — ACCEPT

**Generator's claim**: "`buildMergedRow` sorts by U, so left-to-right `lastKeptU` tracking is valid."

**Verified**: [OuterWallTessellator.ts line 1085](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1085) confirms `result.sort((a, b) => a.u - b.u)` followed by dedup. The botRow/topRow iteration proceeds in array order = ascending U order. `lastKeptBotU` initialized to `uStripLeft` is correct because:

1. The outer filter `sv.u >= uStripLeft - 1e-9` ensures no vertex before the left endpoint is processed.
2. The endpoint check (`sv.idx === botLeftIdx`) fires first and updates `lastKeptBotU`, so all subsequent spacing is measured from a real vertex position.
3. If the left endpoint is absent from `botRow` (edge case where `batch2Remap` replaced it), the endpoint safety net at [line 1337](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1337) inserts it. The `lastKeptBotU` was already initialized to `uStripLeft`, so spacing calculations remain correct even though the safety-net insertion happens *after* the loop.

**Edge cases verified**:
- First vertex after left endpoint: at 1× grid spacing (≈0.0015), gap < threshold (0.00438) → correctly dropped.
- Left endpoint missing from botRow: `lastKeptBotU = uStripLeft` is still valid.

No issues found.

---

### C2 [NOTE]: V2 — Shadow-Grid Interaction — ACCEPT (Actually Desirable)

**Generator's claim**: "A shadow at U=0.505 updates `lastKeptU`, causing a nearby grid vertex at U=0.506 to be dropped."

**Analysis**: This is *correct behavior*, not a defect. The shadow provides boundary density at U=0.505. Keeping the grid vertex at U=0.506 (gap 0.001) would create a near-degenerate micro-edge (0.001 U between adjacent boundary vertices). The shadow already serves the purpose of breaking the long boundary edge.

The dropped grid vertex is at a grid-aligned position, but since R22's entire purpose was to *break* grid alignment on CDT strip boundaries, losing this grid vertex is desirable. The adjacent standard cells don't share this boundary — standard cells are processed via `quadMap` and have their own grid vertices.

No issues found.

---

### C3 [WARNING]: V3 — Threshold Generalization and Aspect Ratio Claim

**Generator's claim**: "With companion T-offset ≈ 0.05 × tGap ≈ 0.002 (for typical tGap ~0.04), maximum boundary edge of 0.005 U gives worst-case UV aspect ~2.5:1."

**Problem**: The tGap assumption of ~0.04 is **too optimistic for chain bands**. Chain-guided row insertion ([step 4 of the pipeline](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts)) densifies T-positions near features. With ~409 total T-positions, average tGap ≈ 0.00245. In feature-dense regions where CDT strips live, tGap can be as small as ~0.002.

**Corrected aspect ratio calculation**:
- Small tGap = 0.002, PROMO_EPSILON = 0.05 → nearest interior T-offset = 0.05 × 0.002 = 0.0001
- T-ring companions at `nearChainTFractions[0] = 0.10` → T-offset = 0.10 × 0.002 = 0.0002 (confirmed at [line 709](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L709))
- MAX_BOUNDARY_EDGE_U at numU=685: 3/685 = 0.00438
- **Worst-case UV aspect at promoted chain vertex**: 0.00438 / 0.0001 = **43.8:1**
- **Worst-case UV aspect at T-ring companion**: 0.00438 / 0.0002 = **21.9:1**

**For comparison, R22 (no intermediates)**:
- Endpoint-to-endpoint gap ≈ 0.006-0.013 U
- Aspect at same T-offset: 0.013 / 0.0001 = **130:1**

**Severity assessment**: R22.1 is still a 3-6× improvement over R22 even at the worst-case tGap. The fix direction is correct. But the Generator's "2.5:1" claim is misleading and should not be used as a design target. The actual UV aspect ratios are 20-45:1 at small tGap, which is acceptable for non-degenerate CDT triangulation but not excellent.

**Required action**: Acknowledge the corrected aspect ratio bounds in the implementation comment. No threshold change needed — `3.0/numU` remains the right choice because tightening it would reintroduce grid structure (the cure is worse than the disease at this regime).

**Generalization across density levels (verified)**:
| Density | numU  | Threshold   | 9-col strip intermediates | Acceptable |
|---------|-------|-------------|--------------------------|------------|
| 4       | ~343  | 0.00875     | ~1-2                     | Yes        |
| 8       | ~685  | 0.00438     | ~2-3                     | Yes        |
| 16      | ~1370 | 0.00219     | ~3-4                     | Yes        |

All density levels produce reasonable intermediate counts.

---

### C4 [NOTE]: V4 — Rightward Gap — Bounded, Acceptable

**Generator does not address the rightward gap.** The spacing gate only checks `sv.u - lastKeptU > threshold` (leftward). No check ensures the last kept vertex is close to the right endpoint.

**Worst case analysis**: The last grid vertex before the right endpoint (at column `segEnd - 1`) is dropped because its gap from `lastKeptU` is ≤ threshold. Then:
- Gap from `lastKeptU` to `col(segEnd-1)` ≤ threshold = 3/numU
- Gap from `col(segEnd-1)` to right endpoint = 1/numU (one grid spacing)
- Total rightward gap ≤ 4/numU

At numU=685: 4/685 ≈ 0.00584. This is only 33% larger than the threshold itself. UV aspect at tGap=0.002 is 0.00584 / 0.0001 = 58.4:1 — worse than the interior-gap case but still bounded and still better than R22's endpoint-to-endpoint edges.

**For narrow strips (2-3 columns)**: The entire strip width is < threshold, so no intermediates are kept. But the endpoint-to-endpoint gap is only 2-3 grid spacings — small enough that slivers aren't the dominant problem.

**Verdict**: No code change needed. The rightward gap is structurally bounded at 4/numU by the discrete grid. A rightward guard check would add complexity for negligible benefit.

---

### C5 [WARNING]: V5 — Partial R2violation Reintroduction

**Generator's claim**: "3× grid spacing breaks grid alignment, preventing R2violations."

**Analysis**: Partially true. The kept intermediate vertices *are* still at grid U-positions. They're spaced ~3× apart instead of 1×, so CDT triangulates them differently — triangle bases span 3 columns not 1, which is less likely to be coplanar with adjacent standard-cell quads.

However, R22 achieved 248 R2violations (from R20's 39,953) by eliminating ALL intermediate grid vertices. R22.1 reintroduces ~2-3 per row across ~409 rows = 800-1200 additional grid boundary vertices globally. If even 5% of these create R2-pattern triangles, that's 40-60 additional R2violations → total ~300. Likely acceptable.

**Required action**: After implementation, measure R2violation count. If it exceeds 500 (2× R22 baseline), tighten to `BOUNDARY_SPACING_FACTOR = 4.0`. If it exceeds 1000, investigate further.

---

### C6 [NOTE]: V6 — A1 Rescue Interaction — No Conflict

**Generator's claim**: "The R22 Amendment A1 rescue pass runs AFTER the boundary loops and catches any constraint endpoints regardless."

**Verified**: The A1 rescue pass at [lines 1453-1473](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1453) iterates `segConstraints` and checks whether each endpoint exists in `stripBot`, `stripTop`, or `stripInteriorVerts`. The flow:

1. R22.1 spacing gate **keeps** some intermediates on boundary → they're in `stripBot`/`stripTop`.
2. A1 checks `inStrip` → finds them → skips rescue. No conflict.
3. For intermediates that R22.1 **drops** AND that are batch2Remap'd constraint endpoints → not in `stripBot` → A1 rescues them as interior with PROMO_EPSILON offset. Same as R22 behavior.

R22.1 *reduces* the number of A1 rescues (some vertices now kept on boundary instead of rescued as interior), which is a slight simplification of the CDT input. No conflicts.

---

## Accepted Items

1. **Core mechanism**: `lastKeptU` left-to-right spacing gate with `3.0/numU` threshold — CORRECT.
2. **Shadow contribution to `lastKeptU`**: Shadows updating `lastKeptU` when kept — CORRECT and DESIRABLE.
3. **Endpoint priority**: Endpoint check before spacing gate — CORRECT.
4. **Threshold formula**: `3.0/numU` — CORRECT across tested density range.
5. **A1 interaction**: No conflicts — CORRECT.
6. **Diagnostic counters**: `gridBoundaryKeepCount` addition — CORRECT.
7. **Proposal 2 (adaptive threshold)**: Correctly identified as unnecessary complexity. AGREE with rejection.

---

## Amendments

### A1: Correct the aspect ratio documentation

The implementation comment should NOT claim "~2.5:1 worst case." Replace with a realistic bound:

```typescript
/** Maximum U-distance between consecutive strip boundary vertices.
 *  Set to 3× average grid spacing to prevent long edges that create
 *  sliver triangles (worst-case UV aspect ~20-45:1 at dense tGap,
 *  vs R22's ~90-130:1), while keeping enough spacing to break grid
 *  alignment and prevent R2violations. */
const BOUNDARY_SPACING_FACTOR = 3.0;
```

### A2: Post-implementation validation

After Executioner implements, run a default-settings export and verify:
1. R2violation count: should be < 500 (R22 was 248, R20 was 39,953)
2. 3D violation% (>4:1 aspect): should improve from R22's 57.3% — target < 40%
3. Max aspect ratio: should drop from R22's 1.4 quadrillion
4. `gridBoundaryKeepCount` in diagnostic log: expect ~800-2000 globally

---

## Implementation Conditions for Executioner

1. Add `BOUNDARY_SPACING_FACTOR = 3.0` constant near [line 125](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L125) with the A1-corrected comment.
2. Modify botRow loop (lines 1309-1334) with `lastKeptBotU` tracking per the proposal.
3. Modify topRow loop (lines 1345-1380) with `lastKeptTopU` tracking per the proposal.
4. Add `gridBoundaryKeepCount` counter near [line 996](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L996).
5. Add diagnostic log line after existing R22 diagnostic at [line 1817](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1817).
6. Run export, check R2violation count and 3D aspect metrics against A2 targets.
7. If R2violations > 500, bump `BOUNDARY_SPACING_FACTOR` to 4.0 and re-test.
