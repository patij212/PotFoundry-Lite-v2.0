# Verifier Round 18.1 — Critique of D-Radical Chain Vertex Promotion

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

The core idea is **sound and elegant**. Promoting chain vertices from CDT boundary to CDT interior with T-perturbation eliminates R2-boundary violations and automatically guarantees manifold matching. The manifold proof is correct. The direction analysis (rejecting Directions A/B/C/E in favor of D) is rigorous.

However, the **implementation sketch has three critical gaps** that would cause every chain strip to silently degrade to sweep fallback, completely defeating D-Radical. The Generator must resolve these before the Executioner writes any code.

---

## Critique

### C1 [CRITICAL]: Triple Failure Mode — Promoted Chain Verts Hit Three Separate Barriers in `cdtTriangulateStrip`

**Generator's claim**: "Route chain vertices to `stripInteriorVerts` in OWT, then handle them in the CDT function's interior registration loop."

**Actual behavior**: Promoted chain vertices with `cv.t === undefined` encounter THREE barriers in `cdtTriangulateStrip`, each independently fatal:

**Barrier 1 — Pre-registration skip** ([ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L190-L195)):
```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (cv?.t !== undefined) {        // ← FAILS for promoted chain verts
        addVertex(sv.idx, sv.u, cv.t);
    }
}
```
Promoted chain vertices have `cv.t === undefined` → `addVertex()` is never called → vertex not registered in `globalToLocal` map.

**Barrier 2 — Constraint edge silently dropped** ([ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L231-L240)):
```typescript
for (const [v0, v1] of constraints) {
    const l0 = globalToLocal.get(v0);
    const l1 = globalToLocal.get(v1);
    if (l0 !== undefined && l1 !== undefined) {  // ← undefined for promoted verts
        addEdge(l0, l1);
    }
}
```
Because Barrier 1 prevented `addVertex()`, `globalToLocal.get(promotedVertIdx)` returns `undefined` → constraint edge silently dropped → chain features unenforceable.

**Barrier 3 — Validation assertion throws** ([ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L250-L256)):
```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (!cv || cv.t === undefined) {          // ← THROWS for promoted chain verts
        throw new Error(
            `Interior companion at vertexIdx=${sv.idx} (cvIdx=${cvIdx}) has no explicit T-position. ` +
            `This indicates a bug in companion collection...`
        );
    }
}
```
Even if Barriers 1 and 2 were resolved, this assertion explicitly throws for any interior vertex with `cv.t === undefined`. The throw is caught by the surrounding `try/catch`, triggering sweep fallback.

**Net result**: D-Radical as sketched causes **100% sweep fallback** for every chain strip. CDT is never reached. R2-boundary stays at 34,726. The proposal is architecturally correct but the implementation sketch is broken at three independent points.

**Required fix**: ALL THREE barriers must be modified. The Generator must specify the exact mechanism for computing the perturbed T value and passing it to `cdtTriangulateStrip`. See C2 for why this is non-trivial.

---

### C2 [CRITICAL]: `cdtTriangulateStrip` Cannot Determine Bot vs Top Without Band Index

**Generator's claim**: "Use `chainVerts[sv.idx - gridVCount].rowIdx` to determine if the vertex is from the band's bot or top row. If `rowIdx === j` → perturb from tBot. If `rowIdx === j+1` → perturb from tTop."

**Actual behavior**: `cdtTriangulateStrip` receives `tBot` and `tTop` but NOT:
- `j` (band index)
- `activeTPositions[]` (T-position array)
- Any way to resolve `cv.rowIdx` to `tBot` or `tTop`

The function signature ([ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L103-L115)):
```typescript
function cdtTriangulateStrip(
    buf, bot, top, constraints, interiorVerts, chainVerts, gridVCount,
    tBot, tTop, stats
): void
```

`cv.rowIdx` is an integer row number (e.g., 0–431). To compare it to `tBot`/`tTop`, the function needs `activeTPositions[cv.rowIdx]`, which it doesn't have. Comparing `cv.rowIdx` to `j` requires `j`, which it also doesn't have.

**The Generator acknowledges this** but doesn't resolve it. The pseudocode for Step 2 contains a placeholder:
```typescript
const perturbedT = (/* from bot row */ true)
    ? tBot + epsilonT
    : tTop - epsilonT;
```
The `/* from bot row */ true` is a TODO, not an implementation.

**Resolution options** (for Generator to choose):

**(a) Pass `j` to `cdtTriangulateStrip`**: Add band index to function signature. Inside, compare `cv.rowIdx === j` → bot, `cv.rowIdx === j+1` → top. Clean but touches the public API of all three triangulation modes (cdt, sweep, sweep-repair).

**(b) Pre-compute perturbed T in OWT caller**: Add `promotedT?: number` field to `StripVertex`. Set it in the OWT strip collection loop where `j`, `tBot`, `tTop` are all available:
```typescript
if (sv.isChain) {
    stripInteriorVerts.push({
        ...sv,
        promotedT: tBot + PROMO_EPSILON * tGap  // for botRow
    });
}
```
The CDT function reads `sv.promotedT` instead of looking up `cv.t`. This avoids passing `j` and avoids mutating ChainVertex.

**(c) Mutate `cv.t` temporarily**: Set `cv.t = perturbedT` before the call, unset after. See C3 for why this is dangerous.

**Required**: Generator must choose (a) or (b) and specify the exact code. Option (b) is cleanest — no shared state mutation, no API change to unrelated triangulation modes.

---

### C3 [WARNING]: Temporary `cv.t` Mutation Would Corrupt Shared State Across Bands

**Generator's implicit option**: Set `cv.t` on ChainVertex before calling `cdtTriangulateStrip`, then unset it after.

**Actual behavior**: ChainVertex objects are shared across bands. A chain vertex at row `r` appears in:
- Band `r-1` as a top-row vertex (perturbed to `tTop - ε`)
- Band `r` as a bot-row vertex (perturbed to `tBot + ε`)

Sequential processing means band `r-1` processes first. If it sets `cv.t = tTop_r-1 - ε` and forgets to unset, band `r` would find `cv.t !== undefined` and:
1. `interiorByBand` would bucket it wrongly (but `interiorByBand` is built once before the loop — no impact)
2. The CDT pre-registration would use the stale `cv.t` value instead of computing a fresh perturbation for band `r`'s tBot

Even with clean set/unset discipline, this is fragile. A future maintainer adding an early return between set and unset would create a silent corruption bug.

**Additionally**: `interiorByBand` at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L752-L760) is built ONCE before the band loop:
```typescript
for (const cv of allChainVertices) {
    if (cv.t === undefined) continue;    // ← promoted chain verts skipped
    ...
}
```
Promoted chain vertices with `cv.t === undefined` are correctly excluded from `interiorByBand`. They must be collected in the strip collection loop (Step 1) instead. This is consistent with D-Radical — no issue here, just noting that `interiorByBand` is NOT the entry path for promoted verts.

**Severity**: WARNING (not CRITICAL) because option (b) from C2 cleanly avoids this issue entirely.

---

### C4 [WARNING]: Generator's Aspect Ratio Claim Is Incorrect — Actual Minimum Angle ≈ 10°

**Generator's claim**: "Triangle connecting gridCol_k at (u_k, 0), chain vertex at (u_chain, ε), gridCol_{k+1} at (u_{k+1}, 0). Edge lengths: ≈ 0.073, 0.073, 0.112 (normalized). Aspect ratio ≈ 1.5:1 — **excellent**."

**Actual computation**: For the user's config (9-column strip, expansion=4):
- Normalized grid cell width: `δu = 0.00146 / 0.0131 ≈ 0.111`
- Normalized perturbation: `ε_norm = 0.05 × 0.0023 / 0.0131 ≈ 0.009`

Triangle: A = (0, 0), B = (0.111, 0), C = (0.055, 0.009)
- AB = 0.111
- AC = √(0.055² + 0.009²) = √(0.003106) ≈ 0.0557
- BC = √(0.056² + 0.009²) = √(0.003217) ≈ 0.0567
- Area = ½ × 0.111 × 0.009 = 0.000500
- Aspect ratio (Generator's formula): maxE²/(4·area·√3) = 0.0123/0.00346 ≈ **3.6:1** (not 1.5:1)

Minimum angle via law of cosines at vertex C:
- cos(C) = (AC² + BC² − AB²) / (2·AC·BC) = (0.003106 + 0.003217 − 0.0123) / (2 × 0.0557 × 0.0567) = −0.946
- Angle C ≈ **161°** → minimum angle at A or B ≈ **9.5°**

**Mitigating factor**: CDT doesn't have to create this specific triangle. T-Ladder companions at `T = 0.33 × tGap` (normalized ≈ 0.058) provide interior points that enable better-shaped triangles. CDT will prefer connecting the promoted chain vertex (at T = 0.009) to its nearest companion (at T = 0.058) rather than to distant boundary grid vertices, IF a companion exists nearby in U.

**Net assessment**: The aspect ratio claim is wrong by 2.4×, and the minimum angle is poor (~10°). But companion vertex density likely prevents the worst-case triangle from appearing in practice. This needs empirical verification: run an export with D-Radical and check `minAngleUV` in the stats output.

**Required**: Generator should correct the aspect ratio calculation and note the dependency on companion density for triangle quality near boundaries.

---

### C5 [WARNING]: Endpoint-Fix Code Has Incompatible Fallback Path

**Generator's claim**: "The existing `inStrip` check will find [promoted chain verts] in `stripInteriorVerts`. No change needed."

**Actual behavior**: This is MOSTLY correct but has an edge case. The endpoint-fix code at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1196-L1220):

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

If a promoted chain vertex is a constraint endpoint but was NOT collected in the Step 1 loop (e.g., its U is slightly outside `[uStripLeft - 1e-9, uStripRight + 1e-9]`), the `inStrip` check fails and this fallback triggers. Since `cv.t === undefined` for row-aligned chain verts, the `else if` branch pushes it back to `stripBot`/`stripTop` — **undoing the promotion**.

This is the EXISTING behavior for boundary-adjacent constraint endpoints. Under D-Radical, it would re-introduce chain vertices onto the boundary for a small number of constraint edges whose endpoints fall just outside the strip U-range.

**Impact**: Low. Most chain vertices fall WITHIN the strip U-range (they're what defines the strip in the first place). Only constraint endpoints that were excluded by the U-range filter (but whose constraint crosses the strip) hit this path. These would re-introduce a few R2-boundary violations.

**Required fix**: Minor — change the `else if` branch to also route promoted chain verts to `stripInteriorVerts` with a computed perturbed T:
```typescript
} else if (cv.rowIdx === j) {
    // D-Radical: route to interior with perturbation, don't put on boundary
    stripInteriorVerts.push({
        idx: vIdx, u: cv.u, isChain: true, gridCol: -1,
        promotedT: tBot + PROMO_EPSILON * tGap
    });
} else if (cv.rowIdx === j + 1) {
    stripInteriorVerts.push({
        idx: vIdx, u: cv.u, isChain: true, gridCol: -1,
        promotedT: tTop - PROMO_EPSILON * tGap
    });
}
```

---

### C6 [NOTE]: R2 Sub-Metric Implementation Is Under-Specified

**Generator's claim**: "In the R2 check loop, classify each R2 triangle by checking whether the feature-grid edge is a CDT boundary constraint (in `cdtEdges`)."

**Actual behavior**: `cdtEdges` are the INPUT constraint edges (local indices). CDT's output is TRIANGLES, not edges. To classify whether a triangle's feature-grid edge is a boundary constraint, the code must:

1. Extract the three edges of each output triangle
2. Map each edge from local indices back to global indices
3. Check each global edge against the set of boundary constraint edge pairs

The Generator says "check in `cdtEdges`" but `cdtEdges` contains ALL constraint edges (boundary + chain). To classify R2-boundary specifically, you'd need a separate `boundaryConstraintEdges` set containing only the row boundary + left/right vertical constraints.

This is implementable (~15 lines) but the Generator's sketch hand-waves it.

---

### C7 [NOTE]: Generator's "~20 Lines of Change" Estimate Is Optimistic

**Generator's claim**: "~20 lines of change across 2 files."

**Estimated actual change**:
- StripVertex interface: +1 field (`promotedT?: number`) = **1 line**
- OWT strip collection (bot + top loops): ~10 lines each with chain routing = **20 lines**
- OWT endpoint-fix: modify the `cv.t === undefined` branch = **6 lines**
- CST pre-registration: new `else if (sv.promotedT !== undefined)` branch = **4 lines**
- CST validation assertion: add exception for promoted verts = **3 lines**
- CST R2 sub-metric (optional): boundary edge set + classification = **15 lines**
- Total: **~50 lines** across 2 files + interface change

Not a deal-breaker, but 2.5× the Generator's estimate. Classic Generator optimism.

---

## Accepted Items

### A2 Confirmed: No Crossing Between Chain and Boundary Constraints

Chain constraint edges after perturbation span `T ∈ [tBot + ε, tTop − ε]`, strictly interior to `[tBot, tTop]`. Grid boundary constraints are at `T = tBot` and `T = tTop`. No geometric intersection possible. ✓

The existing P5 crossing detection at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1230-L1290) uses unperturbed T positions. Since perturbation is uniform vertical shrinkage (same ε for all bot endpoints, same for all top endpoints), crossing detection results are preserved. ✓

### A3 Confirmed: Manifold Proof Is Correct

The proof that pure-grid boundaries guarantee manifold matching is **mathematically sound**.

At shared row r between band j and band j+1:
- Band j CDT boundary: consecutive grid columns [segStart_j, ..., segEnd_j] → edges {col_i → col_{i+1}}
- Band j+1 CDT boundary: consecutive grid columns [segStart_{j+1}, ..., segEnd_{j+1}] → edges {col_i → col_{i+1}}
- Standard cells outside each strip: also produce edges {col_i → col_{i+1}}

The complete edge set at shared row r is {col_i → col_{i+1}} for ALL i across the full row, regardless of which columns each band's CDT covers. Both bands produce identical edge decompositions at the shared row. **QED**.

The 3-way union asymmetry (raw[j-1] vs raw[j+2]) is **completely neutralized** — it can only affect strip WIDTH, not boundary edge pattern. This resolves the Catch-22 from Round 18 C4.

### A4 Confirmed: cdt2d Handles Interior Constraint Edges

CDT algorithms enforce constraint edges by edge flipping, regardless of whether endpoints are on the convex hull, on boundary constraint polygons, or fully interior. cdt2d's implementation follows this standard. Interior-to-interior constraints are algorithmically identical to any other constraints. ✓

### A6 Confirmed: No Interference with T-Ladder Companions

Promoted chain vertices at `T = tBot + 0.05 × tGap` vs first companion rung at `T = tBot + 0.33 × tGap`. Separation = 0.28 × tGap ≈ 0.00064 in UV space. This is well above the companion guard radius (`CONSTRAINT_GUARD_RADIUS ≈ 0.001`). No interference. ✓

Wait — the companion guard radius is 0.001 and the separation is 0.00064? Let me recalculate. tGap ≈ 0.0023. Separation = 0.28 × 0.0023 = 0.000644. Guard radius = 0.001. The promoted chain vertex IS within the guard radius of the nearest companion rung.

**Correction**: A6 is **partially incorrect**. The promoted chain vertex at `tBot + 0.05 × tGap` has a T-distance of `0.28 × tGap ≈ 0.000644` from the nearest companion at `tBot + 0.33 × tGap`. The `isNearConstraintEdge` guard at companion generation checks whether a proposed companion is near a constraint edge, not near another vertex. So the guard radius doesn't directly apply here. But the proximity means CDT receives two nearby interior points (promoted chain vert and companion) at similar U, potentially creating thin triangles between them.

**Revised A6 assessment**: No functional interference with companion GENERATION. CDT receives both and creates Delaunay-optimal triangulation. The proximity actually HELPS triangle quality (provides a nearby vertex for well-shaped triangles connecting promoted vert to interior). **Accepted** with note on proximity.

### Batch2Remap Interaction: No Issue

When `buildMergedRow` remaps a chain vertex to a coincident grid vertex, the entry has `isChain: false`. The Step 1 filter `if (sv.isChain)` correctly leaves these on the boundary as grid vertices. Constraint edges are remapped accordingly via `batch2Remap`. The resulting grid→interior constraint is a standard CDT constraint between a boundary point and an interior point — fully supported. ✓

### P5 Crossing Detection: Preserved

The P5 crossing detection uses `getUV()` which computes unperturbed T via `cv.t ?? activeTPositions[cv.rowIdx]`. Uniform ε perturbation is geometrically equivalent to vertical scaling — crossing topology is preserved. ✓

---

## Open Questions for Generator

1. **Choose the perturbed-T communication mechanism**: Option (a) pass `j` to cdtTriangulateStrip, or option (b) add `promotedT` field to StripVertex? Option (b) is recommended — it's the minimum-coupling solution that doesn't change unrelated function signatures.

2. **Correct the aspect ratio calculation**: The claimed 1.5:1 is actually 3.6:1. The minimum angle for the worst-case triangle (no companion nearby) is ~10°. Do you accept this or propose a larger ε (e.g., 0.10 × tGap → min angle ~19°)?

3. **Epsilon sensitivity**: Does ε = 0.10 improve triangle quality without causing other issues? A larger ε moves promoted verts further from the boundary, improving aspect ratios but potentially interfering with companion placement (companion rung 1 at 0.33 × tGap). ε ∈ [0.05, 0.15] seems safe.

---

## Conditions for ACCEPT (Implementation Spec for Executioner)

The following conditions are required. Once the Generator confirms acceptance of these amendments, the Executioner may proceed.

### Amendment 1: StripVertex Interface Extension

Add `promotedT?: number` field to `StripVertex` in [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L49-L60):
```typescript
export interface StripVertex {
    idx: number;
    u: number;
    isChain: boolean;
    gridCol: number;
    /** Perturbed T-position for promoted chain vertices (D-Radical). */
    promotedT?: number;
}
```

### Amendment 2: OWT Strip Collection — Route Chain Verts to Interior

In the strip collection loop at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1108-L1130), for both `botRow` and `topRow`: if `sv.isChain`, push to `stripInteriorVerts` with computed `promotedT` instead of `stripBot`/`stripTop`. The OWT caller has `j`, `tBot = activeTPositions[j]`, `tTop = activeTPositions[j+1]`.

### Amendment 3: OWT Endpoint-Fix — Match D-Radical Routing

In the endpoint-fix block at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1196-L1220), change the `cv.t === undefined` branches to also route to `stripInteriorVerts` with `promotedT`, not to `stripBot`/`stripTop`.

### Amendment 4: CST Interior Registration — Handle `promotedT`

In `cdtTriangulateStrip` pre-registration at [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L190-L195), add a branch:
```typescript
for (const sv of interiorVerts) {
    if (sv.promotedT !== undefined) {
        addVertex(sv.idx, sv.u, sv.promotedT);
    } else {
        const cvIdx = sv.idx - gridVCount;
        const cv = chainVerts[cvIdx];
        if (cv?.t !== undefined) {
            addVertex(sv.idx, sv.u, cv.t);
        }
    }
}
```

### Amendment 5: CST Validation Assertion — Exempt Promoted Verts

In the validation assertion at [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L250-L256), add exemption:
```typescript
for (const sv of interiorVerts) {
    if (sv.promotedT !== undefined) continue;  // promoted chain vert — T is on StripVertex
    const cvIdx = sv.idx - gridVCount;
    const cv = chainVerts[cvIdx];
    if (!cv || cv.t === undefined) {
        throw new Error(...);
    }
}
```

### Amendment 6: Validation Protocol

After implementation, verify:
- [ ] R2-boundary violations = 0 (ideally split metric; at minimum, log which R2 triangles have boundary constraint edges)
- [ ] `sweepFallbacks` does NOT increase (would indicate promoted verts still causing CDT errors)
- [ ] `minAngleUV` does not degrade below ~8° (current baseline needed for comparison)
- [ ] Total triangle count approximately unchanged
- [ ] Visual comparison of exported STL: no staircase artifacts on chain features

---

## Summary

| Assumption | Verdict | Notes |
|---|---|---|
| A1 (ε numerical safety) | **ACCEPT** | ε = 0.009 in normalized space is well above float64 precision |
| A2 (no crossing constraints) | **ACCEPT** | Interior chain constraints can't cross boundary constraints |
| A3 (manifold guarantee) | **ACCEPT** | Proof is mathematically correct; neutralizes C3 from Round 18 |
| A4 (cdt2d interior constraints) | **ACCEPT** | Standard CDT behavior |
| A5 (R2-boundary = visual fix) | **ACCEPT** | With note: R2 sub-metric needs ~15 lines of edge classification |
| A6 (no companion interference) | **ACCEPT** | Proximity (0.000644 vs 0.001 guard) doesn't cause functional interference |
| A7 (grid boundary triangle quality) | **ACCEPT WITH NOTE** | Aspect ratio claim wrong (3.6:1 not 1.5:1), but companion density mitigates |

| Implementation Issue | Severity | Resolution |
|---|---|---|
| C1: Triple CDT barrier | **CRITICAL** | Amendments 4 + 5 resolve all three barriers |
| C2: Bot/top determination | **CRITICAL** | Amendment 1 (promotedT on StripVertex) resolves cleanly |
| C3: cv.t mutation risk | WARNING | Avoided entirely by using promotedT on StripVertex |
| C4: Aspect ratio claim | WARNING | Correct calculation; empirical verification needed |
| C5: Endpoint-fix fallback | WARNING | Amendment 3 resolves |
| C6: R2 sub-metric | NOTE | Under-specified but implementable |
| C7: Line count estimate | NOTE | ~50 lines, not ~20 |
