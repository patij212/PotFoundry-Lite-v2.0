# Executioner Feasibility Review — D-Radical Chain Vertex Promotion (Round 18.1)

Date: 2026-03-05

---

## Feasibility Verdict: FEASIBLE WITH NOTES

All 5 code amendments are implementable as specified. The design is sound, the code locations are accurate, and the cross-cutting interactions are safe. Two implementation hazards identified below require minor coordination during implementation.

---

## Amendment-by-Amendment Assessment

### Amendment 1: StripVertex Interface Extension — FEASIBLE

**Target**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L49-L58) — `StripVertex` interface.

**Current code** (lines 49–58):
```typescript
export interface StripVertex {
    idx: number;
    u: number;
    isChain: boolean;
    gridCol: number;
}
```

**Assessment**: Trivial addition of `promotedT?: number`. Optional field — zero breakage across all consumers. `StripVertex` is only constructed locally in OWT (`buildMergedRow`, strip collection, endpoint-fix) and consumed by CST. No other files reference this interface.

**Estimated change**: 2 lines (field + JSDoc comment).

**Issues**: None.

---

### Amendment 2: OWT Strip Collection — Route Chain Verts to Interior — FEASIBLE WITH NOTE

**Target**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1112-L1140) — strip vertex collection loop inside the chain segment block.

**Current code** (lines 1112–1117, bot collection):
```typescript
for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        stripBot.push(sv);
    }
}
```

**Assessment**: The change adds an `if (sv.isChain)` branch inside the U-range filter for both `botRow` and `topRow` loops. Chain verts go to `stripInteriorVerts` with `promotedT`; grid verts continue to `stripBot`/`stripTop` as before. Structurally clean.

**Batch2Remap safety**: When `buildMergedRow` remaps a coincident chain vertex to a grid index, the merged row entry has `isChain: false`. The `sv.isChain` filter correctly leaves these on the boundary. ✓

**Bookend logic safety** (lines 1118–1125, 1133–1139): After chain verts are removed from `stripBot`/`stripTop`, bookend logic still works. `uStripLeft = unionU[segStart]` and `uStripRight = unionU[segEnd]` are grid column positions, so grid vertices at those columns are always collected (or prepended/appended by the bookend). The boundary remains `[segStart, ..., segEnd]` with only grid vertices. ✓

**⚠ Variable scoping hazard**: The `promotedT` computation requires `tBot = activeTPositions[j]`, `tTop = activeTPositions[j+1]`, and `tGap = tTop - tBot`. Currently, `tBot` and `tTop` are NOT declared until much later in the P5 crossing detection block (line 1224: `const tBot = activeTPositions[j];`). The `const` keyword creates block scope within the P5 `if` block, so there's no conflict — Amendment 2 can declare its own `tBot`/`tTop` in the chain segment scope. However, the code would have two separate `const tBot = activeTPositions[j]` declarations in nested scopes. This is legal TypeScript but potentially confusing.

**Recommended approach**: Declare `const tBot = activeTPositions[j]; const tTop = activeTPositions[j+1]; const tGap = tTop - tBot;` at the top of the chain segment block (after `const segEnd = i;` at ~line 1104), then use `tBot`/`tTop` for both Amendment 2 and the existing P5 block. The P5 block's `const tBot` declaration (line 1224) is inside an `if (segConstraints.length >= 2)` block and would need to be removed to avoid shadowing. This is a minor refactor but cleaner.

**Estimated change**: ~12 lines (both loops + tBot/tTop declaration + constant).

**Issues**: Variable scope coordination with P5 block (minor).

---

### Amendment 3: OWT Endpoint-Fix — Match D-Radical Routing — FEASIBLE

**Target**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1196-L1214) — endpoint-fix block.

**Current code** (lines 1207–1214):
```typescript
if (cv.t !== undefined) {
    stripInteriorVerts.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
} else if (cv.rowIdx === j) {
    stripBot.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
    botModified = true;
} else if (cv.rowIdx === j + 1) {
    stripTop.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
    topModified = true;
}
```

**Assessment**: The `else if (cv.rowIdx === j)` and `else if (cv.rowIdx === j+1)` branches currently push chain constraint endpoints to `stripBot`/`stripTop`, undoing D-Radical promotion. Amendment 3 changes these to push to `stripInteriorVerts` with `promotedT`. This requires the `tBot`, `tTop`, `tGap`, and `PROMO_EPSILON` values from Amendment 2 to be in scope, which they will be if declared at the top of the chain segment block as recommended above.

**Edge case**: The `botModified`/`topModified` flags (used to trigger re-sorting) are no longer set by these branches. This is correct — we're not modifying `stripBot`/`stripTop`, so no re-sort needed. `stripInteriorVerts` doesn't need sorting (CDT treats interior points as an unordered cloud). ✓

**Estimated change**: ~6 lines.

**Issues**: None beyond the shared variable scoping from Amendment 2.

---

### Amendment 4: CST Interior Registration — Handle `promotedT` — FEASIBLE

**Target**: [ChainStripTriangulator.ts](../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L190-L195) — interior vertex pre-registration loop.

**Current code** (lines 190–195):
```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (cv?.t !== undefined) {
        addVertex(sv.idx, sv.u, cv.t);
    }
}
```

**Assessment**: The amendment adds a leading check `if (sv.promotedT !== undefined)` that calls `addVertex(sv.idx, sv.u, sv.promotedT)`. This resolves Barrier 1 (pre-registration skip) and Barrier 2 (constraint edge silently dropped) from the Verifier's C1. The `promotedT` field on `StripVertex` carries the perturbed T computed by OWT, so CST doesn't need `j` or `activeTPositions`.

**Important**: The `StripVertex` type must be imported by CST. Currently, CST already imports `StripVertex` from OWT (line 23: `import type { ChainVertex, StripVertex } from './OuterWallTessellator';`). The `promotedT` field is part of the interface, so no additional import needed. ✓

**Estimated change**: 4 lines (add `if/else` branch).

**Issues**: None.

---

### Amendment 5: CST Validation Assertion — Exempt Promoted Verts — FEASIBLE

**Target**: [ChainStripTriangulator.ts](../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L250-L258) — interior vertex validation inside `try/catch`.

**Current code** (lines 250–258):
```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (!cv || cv.t === undefined) {
        throw new Error(
            `Interior companion at vertexIdx=${sv.idx} (cvIdx=${cvIdx}) has no explicit T-position. ` +
            `This indicates a bug in companion collection — only companions with cv.t should be in interiorVerts.`
        );
    }
}
```

**Assessment**: Adding `if (sv.promotedT !== undefined) continue;` at the top of the loop body resolves Barrier 3 (validation assertion throws). Promoted chain verts have their T on `StripVertex.promotedT`, not `ChainVertex.t`, so they should skip this check that expects `cv.t`.

**Subtle correctness point**: The assertion currently guards against companion vertices without explicit T positions being passed to CDT (which would mean they have no 2D coordinate). Promoted chain verts DO have a 2D coordinate (via `promotedT`), so skipping the assertion is semantically correct — they were already registered by Amendment 4. ✓

**Estimated change**: 1 line.

**Issues**: None.

---

## Cross-Cutting Concerns

### 1. Strip Boundary Bookend Logic — SAFE

After D-Radical, `stripBot`/`stripTop` contain only grid vertices from the merged row. The bookend logic (lines 1118–1125 for bot, 1133–1139 for top) checks that the first entry is the grid vertex at `segStart` and the last is at `segEnd`, prepending/appending if missing. Since grid vertices at `segStart` and `segEnd` are always present in `buildMergedRow` output (they're grid column positions, always generated), and the U-range filter includes them (`uStripLeft = unionU[segStart]`), the bookend is rarely triggered but functions correctly as a safety net. ✓

### 2. Batch2Remap + Constraint Edge Resolution — SAFE

The constraint edge remapping block (lines 1164–1174) operates on `segConstraints` AFTER strip collection. Under D-Radical:

- A chain vertex remapped to a grid index by `batch2Remap` has `isChain: false` in the merged row → stays on `stripBot`/`stripTop` → registered in CDT via boundary vertex loop. Constraint edges referencing the remapped grid index find it in `globalToLocal`. ✓

- An un-remapped chain vertex is routed to `stripInteriorVerts` with `promotedT` → registered in CDT via Amendment 4. Constraint edges referencing the original chain index find it in `globalToLocal`. ✓

- A constraint edge with one remapped endpoint (grid, on boundary) and one un-remapped endpoint (chain, in interior) produces a boundary→interior constraint edge. CDT handles these correctly. ✓

### 3. P5 Crossing Detection — SAFE

The `getUV` function (line 1232) resolves T for chain verts via `cv.t ?? activeTPositions[cv.rowIdx]`. Promoted chain verts have `cv.t === undefined`, so `getUV` returns the unperturbed T position. The Verifier's A2 analysis is correct:  uniform ε perturbation preserves crossing topology (same ε applied to all endpoints at the same row). Crossing detection results are identical pre- and post-perturbation. ✓

### 4. `interiorByBand` Construction — NO INTERFERENCE

The `interiorByBand` map (lines 754–760) filters on `cv.t === undefined` → `continue`. Promoted chain verts (row-boundary chain verts) have `cv.t === undefined` and are correctly excluded from `interiorByBand`. They enter the CDT pipeline through the strip collection loop (Amendment 2) and endpoint-fix (Amendment 3), not through `interiorByBand`. ✓

### 5. T-Ladder Companion Interaction — SAFE

Promoted chain verts at `T = tBot + 0.05×tGap` and the first companion rung at `T = tBot + 0.33×tGap` have a separation of `0.28×tGap ≈ 0.000644`. The `isNearConstraintEdge` guard tests companions against constraint EDGES, not against other vertices, so no companions are rejected due to promoted verts. CDT receives both and produces Delaunay-optimal triangulation. The proximity actually helps triangle quality by providing nearby vertices for better-shaped elements. ✓

---

## Unstated Dependencies

### 1. `tBot`/`tTop` Variable Scoping in OWT (MINOR)

The P5 crossing detection block (line 1224) declares `const tBot = activeTPositions[j]` inside an `if` block. Amendment 2 needs `tBot`/`tTop` earlier in the chain segment scope. These are in different blocks (Amendment 2 in the chain segment `else` block, P5 inside `if (segConstraints.length >= 2)` inside that same block), so TypeScript allows both `const` declarations without conflict. However, this creates duplicate declarations of `const tBot` and `const tTop` in nested scopes.

**Resolution**: Either (a) accept the shadowing (legal, but `tsc --noShadow` or linter may warn), or (b) hoist the declarations to the top of the chain segment block and remove the P5 redeclarations. Option (b) is cleaner.

### 2. `StripVertex` Type Visibility in CST

CST already imports `StripVertex` from OWT (line 23). The `promotedT` field added by Amendment 1 is automatically visible. No additional import changes needed. ✓

### 3. `PROMO_EPSILON` Constant Placement

The `PROMO_EPSILON = 0.05` constant should be declared near the top of OWT's module scope (alongside other constants like `SEAM_GUARD`, `SEAM_THRESHOLD`), not inline in the loop. This follows the project's "no magic numbers" rule from the coding standards.

### 4. `sweepTriangulateStrip` Does Not Receive Interior Verts

The `sweep` and `sweep-repair` modes (CST lines 119, 123) have different function signatures — they don't accept `interiorVerts`. If CDT falls back to sweep (via the `catch` block), promoted chain verts in `interiorVerts` are silently dropped. This is the **existing behavior** for companion verts and is acceptable — sweep mode doesn't use interior points.

However, promoted chain verts are *also* absent from `bot`/`top` under D-Radical, meaning sweep fallback would produce a triangulation missing chain vertices entirely. This is worse than the current sweep fallback behavior (which has chain verts on the boundary).

**Risk**: Low. Sweep fallback is the **error recovery** path. The whole point of D-Radical is to make CDT work correctly. If CDT still fails (which would indicate a bug, not an expected condition), sweep fallback producing a degraded result is acceptable. But worth monitoring `sweepFallbacks` post-implementation (Amendment 6).

---

## Risk Assessment

### Blast Radius: LOW-MEDIUM

| Component | Risk | Notes |
|---|---|---|
| CDT triangulation quality | Low | Chain verts become interior free points — CDT is designed for this |
| Manifold correctness | Very Low | Pure-grid boundaries are strictly safer than mixed boundaries |
| Sweep fallback degradation | Low | Only triggers on CDT failure (error path) |
| Visual staircase artifacts | Very Low | Root cause (boundary constraint edges) is eliminated |
| Triangle count stability | Very Low | Same vertices, same CDT; interior topology changes but count is stable |
| Performance | Negligible | Same vertex count, same CDT call, no new loops |

### What Could Go Wrong

1. **CDT crossing constraints between promoted chain verts and existing companion constraint edges**: The Verifier's A2 analysis proves chain constraints stay in the interior and can't cross boundary constraints. But if two chain constraint edges were already close to crossing EACH OTHER, the T-perturbation could theoretically push them into crossing. This is unchanged from the current behavior (P5 handles it), but worth monitoring.

2. **Degenerate triangles near boundaries**: The Verifier's C4 analysis shows minimum angle ≈ 10° for worst-case boundary triangles (chain vert at ε above boundary, nearest grid verts on boundary). In practice, companion vertices provide intermediate points that prevent this worst case. Empirical verification (Amendment 6) is essential.

3. **Edge case: chain vertex EXACTLY at a grid column U-position but not coincident in `buildMergedRow`**: This shouldn't happen because `buildMergedRow` deduplicates within `1e-6` and `batch2Remap` records the mapping. But if it did, you'd have a promoted chain vert at (u_grid, tBot+ε) and a grid vert at (u_grid, tBot) — CDT handles this fine (they're at different T). No real risk.

### Rollback Path: CLEAN

The change is purely additive and localized:
- Revert the `StripVertex` interface (remove `promotedT`)
- Revert the strip collection `if (sv.isChain)` branches
- Revert the endpoint-fix branches
- Revert the CST interior registration and validation changes

All changes are in 2 files. No data format changes, no API changes, no persistence changes. Git revert is trivial.

---

## Implementation Notes

### Recommended Implementation Sequence

1. **Amendment 1** (StripVertex interface) — prerequisite for all others
2. **Amendment 2** (strip collection routing) — the core change
3. **Amendment 3** (endpoint-fix routing) — must match Amendment 2's pattern
4. **Amendment 4** (CST interior registration) — enables CDT to process promoted verts
5. **Amendment 5** (CST validation exemption) — prevents false-positive assertion throws
6. **Amendment 6** (validation) — empirical verification

Steps 2+3 are in OWT; steps 4+5 are in CST. Within each file, changes are independent of each other but depend on step 1.

### Estimated Total Change

- OWT: ~20 lines changed/added (interface + 2 loops + endpoint-fix + constant)
- CST: ~5 lines changed/added (registration branch + validation skip)
- **Total: ~25 lines of production code** (Verifier's estimate of ~50 includes the optional R2 sub-metric split, which is not part of the core change)

### Flag for Generator & Verifier

The `tBot`/`tTop` scoping issue (Unstated Dependency #1) is a real but minor implementation detail. I will handle it during implementation by hoisting the declarations or using `activeTPositions[j]` directly. Not a design concern.

The sweep fallback degradation (Unstated Dependency #4) was not discussed in either the Generator proposal or Verifier critique. It's an acceptable risk for the error recovery path, but the Generator should acknowledge that sweep fallback post-D-Radical produces a worse result than sweep fallback pre-D-Radical (missing chain verts vs. having chain verts on boundary). If sweep fallback rate is currently non-zero, this matters.

---

## Summary

| Amendment | Feasible? | Lines | Risk |
|---|---|---|---|
| 1: StripVertex.promotedT | ✅ Yes | 2 | None |
| 2: OWT strip collection routing | ✅ Yes (with note) | 12 | Variable scoping (minor) |
| 3: OWT endpoint-fix routing | ✅ Yes | 6 | None |
| 4: CST interior registration | ✅ Yes | 4 | None |
| 5: CST validation exemption | ✅ Yes | 1 | None |
| **Total** | **FEASIBLE** | **~25** | **Low** |

**Verdict**: Ready for implementation. No blocking issues. Proceed when the human coordinator gives the go-ahead.
