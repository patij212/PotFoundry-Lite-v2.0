# Generator Round 22.1 — Boundary Coarsening: Fix Sliver Triangles at Strip Edges

Date: 2026-03-05

## Problem Statement

R22's P1 boundary thinning eliminated ALL intermediate grid vertices from the CDT strip boundary, keeping only strip endpoints + shadow vertices. This achieved a spectacular 99.4% reduction in R2violations (39,953 → 248) by destroying the grid-aligned boundary topology — **exactly the right structural move**. But it overcorrected: boundary edges are now too long, creating catastrophic sliver triangles where CDT connects long horizontal boundary edges to the nearest interior companions.

**R22 metrics showing the problem:**
- 3D violations >4:1 = 57.3% (WORSE than R20's 45.1%, R21's 42.6%)
- 3D avg_aspect = 461.9:1 (worse than R20's 125.5:1)
- Global max aspect ratio = 1.4 QUADRILLION:1 (catastrophic slivers)
- User observation: "huge slivers joining the main mesh to the edge area"

## Root Cause Analysis

The geometry is straightforward. Consider a 9-column strip (expansion=4):

**R20/R21 boundary (too many vertices — grid structure):**
```
endpointL → grid@col4 → grid@col5 → shadow → grid@col6 → ... → endpointR
~9+ boundary vertices, ~0.0015 U per edge
```

**R22 boundary (too few vertices — slivers):**
```
endpointL → [shadow@chain_U] → endpointR
2-4 boundary vertices, ~0.006 U per edge
```

The nearest interior point is a T-ring companion at `PROMO_EPSILON (0.05) × tGap` in the T-direction, plus SHELL_FRACTIONS[0]=0.04 in the U-direction from chain center. When the boundary edge spans 0.006 U and the nearest companion is only 0.0004 T away, CDT connects them: triangle base ~0.006 U, height ~0.0004 T → aspect ratio ~15:1 in UV. In 3D, circumferential scaling amplifies U-distances relative to T, making these slivers even worse.

The fix point is exactly the boundary vertex loop in [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1309) (botRow) and [line 1345](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1345) (topRow).

## Proposals

### Proposal 1: `lastKeptU` Spacing Gate (Recommended)

**Idea**: Instead of dropping ALL intermediate grid vertices, track the U-position of the last vertex kept on the boundary. Keep an intermediate grid vertex if the gap from `lastKeptU` exceeds `MAX_BOUNDARY_EDGE_U`. Shadow vertices also update `lastKeptU` when kept — they contribute to boundary density.

**Mechanism**: Linear scan, left to right (botRow is already U-sorted by `buildMergedRow`). Initialize `lastKeptU = uStripLeft` (the left endpoint's U). For each intermediate grid vertex, check `sv.u - lastKeptU > MAX_BOUNDARY_EDGE_U`. If yes, keep it and update `lastKeptU = sv.u`. If no, drop it. Shadow vertices that pass the P2 guard also update `lastKeptU = sv.u`.

**Mathematical basis**:

The threshold `MAX_BOUNDARY_EDGE_U` must satisfy two competing constraints:

1. **Upper bound (no slivers)**: Maximum boundary edge length must be small enough that CDT triangles connecting boundary edges to T-ring companions have bounded aspect ratio. With companion T-offset ≈ 0.05 × tGap ≈ 0.002 (for typical tGap ~0.04), a maximum boundary edge of 0.005 U gives worst-case UV aspect ~2.5:1 — excellent. A maximum of 0.010 U gives ~5:1 — still acceptable.

2. **Lower bound (no grid structure)**: If the threshold is too small, we keep almost every grid vertex and reintroduce R2violations. The grid spacing is `1/numU`. At numU=685, grid spacing ≈ 0.00146 U. A threshold of 2× grid spacing keeps ~every-other vertex (still grid-ish). A threshold of 3× keeps ~1 in 3 (breaks grid alignment). A threshold of 4× keeps ~1 in 4 (strongly breaks grid alignment).

**Proposed constant**: `MAX_BOUNDARY_EDGE_U = 3.0 / numU`

At numU=685: `3.0 / 685 = 0.00438 U`

For a 9-column strip (width ~0.013 U), this keeps ~2-3 intermediate grid vertices. Total boundary: ~5-7 vertices per row (2 endpoints + 0-2 shadows + 2-3 intermediates). Compare:
- R20/R21: ~9-11+ vertices (full grid structure → R2violations)
- R22: ~2-4 vertices (slivers)
- R22.1: ~5-7 vertices (controlled spacing → no grid structure, no slivers)

**Files affected**: `OuterWallTessellator.ts` lines 1305-1335 (botRow loop), 1345-1380 (topRow loop). ~10 lines changed per loop.

**Trade-offs**:
- More boundary vertices than R22 → more CDT work per strip (negligible — CDT cost is dominated by interior companions, not the tiny boundary polygon)
- Slightly more R2violations than R22 (but still 95%+ reduction from R20/R21 — the spacing of 3× grid prevents aligned grid patterns)
- Code complexity: one `lastKeptU` variable + one comparison per vertex — trivial

**Assumptions (for Verifier to attack)**:
1. `buildMergedRow` output is sorted by U — confirmed by code inspection (line ~1085: `result.sort((a, b) => a.u - b.u)`). Left-to-right `lastKeptU` tracking is valid.
2. Shadow vertices that pass P2 contribute meaningfully to boundary density and should update `lastKeptU`. If a shadow is at U=0.508 and the next grid vertex is at U=0.510, the gap from shadow to grid is only 0.002 < threshold, so the grid vertex is (correctly) dropped.
3. The spacing gate is applied WITHIN the existing filter loop, not as a post-pass, so it interacts correctly with the P2 shadow-endpoint guard and the endpoint safety net.
4. `3.0 / numU` generalizes across density levels. At density=4 (numU ≈ 343), threshold = 0.00875; at density=16 (numU ≈ 1370), threshold = 0.00219. Both are reasonable.
5. Adding intermediate grid vertices to the boundary does NOT reintroduce the batch2Remap issue from V-R22 C1, because the R22 Amendment A1 rescue pass runs AFTER the boundary loops and catches any constraint endpoints regardless.

### Proposal 1 — Exact Code Change

**New constant** (add near existing constants at file top, around line 125):
```typescript
/** Maximum U-distance between consecutive strip boundary vertices.
 *  Set to 3× average grid spacing to prevent long edges that create 
 *  sliver triangles, while keeping enough spacing to break grid alignment. */
const BOUNDARY_SPACING_FACTOR = 3.0;
```

**botRow loop** (replace lines 1309-1334):
```typescript
// R22.1: Controlled boundary spacing — keep intermediate grid vertices
// at MAX_BOUNDARY_EDGE_U intervals to prevent sliver triangles from
// over-sparse boundaries, while still breaking grid alignment.
const MAX_BOUNDARY_EDGE_U = BOUNDARY_SPACING_FACTOR / numU;
let lastKeptBotU = uStripLeft; // left endpoint always kept

for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        if (sv.isChain) {
            stripInteriorVerts.push({ ...sv, promotedT: tBot + PROMO_EPSILON * tGap });
        } else {
            const isGridVertex = sv.idx < gridVertexCount;
            if (isGridVertex) {
                if (sv.idx === botLeftIdx || sv.idx === botRightIdx) {
                    // Always keep endpoints
                    stripBot.push(sv);
                    lastKeptBotU = sv.u;
                } else if (sv.u - lastKeptBotU > MAX_BOUNDARY_EDGE_U) {
                    // R22.1: keep intermediate to prevent long boundary edges
                    stripBot.push(sv);
                    lastKeptBotU = sv.u;
                    gridBoundaryKeepCount++;
                } else {
                    gridBoundaryDropCount++;
                }
            } else {
                // Shadow vertex — keep unless within guard of endpoint (P2)
                if (Math.abs(sv.u - uStripLeft) < ENDPOINT_SHADOW_GUARD ||
                    Math.abs(sv.u - uStripRight) < ENDPOINT_SHADOW_GUARD) {
                    shadowEndpointGuardCount++;
                } else {
                    stripBot.push(sv);
                    lastKeptBotU = sv.u; // shadows contribute to spacing
                }
            }
        }
    }
}
```

**topRow loop** (same pattern, separate `lastKeptTopU`):
```typescript
let lastKeptTopU = uStripLeft;

for (let ti = 0; ti < topRow.length; ti++) {
    const sv = topRow[ti];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        if (sv.isChain) {
            const dupIdx = topDupMap.get(sv.idx);
            stripInteriorVerts.push({ ...sv, idx: dupIdx ?? sv.idx, promotedT: tTop - PROMO_EPSILON * tGap });
        } else {
            const isGridVertex = sv.idx < gridVertexCount;
            if (isGridVertex) {
                if (sv.idx === topLeftIdx || sv.idx === topRightIdx) {
                    stripTop.push(sv);
                    lastKeptTopU = sv.u;
                } else if (sv.u - lastKeptTopU > MAX_BOUNDARY_EDGE_U) {
                    stripTop.push(sv);
                    lastKeptTopU = sv.u;
                    gridBoundaryKeepCount++;
                } else {
                    gridBoundaryDropCount++;
                }
            } else {
                if (Math.abs(sv.u - uStripLeft) < ENDPOINT_SHADOW_GUARD ||
                    Math.abs(sv.u - uStripRight) < ENDPOINT_SHADOW_GUARD) {
                    shadowEndpointGuardCount++;
                } else {
                    stripTop.push(sv);
                    lastKeptTopU = sv.u;
                }
            }
        }
    }
}
```

**New diagnostic counter** (add alongside existing R22 counters near line 996):
```typescript
let gridBoundaryKeepCount = 0;       // intermediate grid vertices KEPT by R22.1 spacing gate
```

**Diagnostic log** (add to existing diagnostic output):
```typescript
console.log(`[CDT] R22.1 boundary spacing: kept=${gridBoundaryKeepCount} dropped=${gridBoundaryDropCount} (factor=${BOUNDARY_SPACING_FACTOR})`);
```

---

### Proposal 2: Adaptive Threshold Based on Companion T-Distance (Radical Alternative)

**Idea**: Instead of a fixed `3/numU` factor, compute `MAX_BOUNDARY_EDGE_U` per-band based on the actual T-ring distance, targeting a specific UV aspect ratio.

**Mechanism**: The nearest companion T-offset is `nearChainTFractions[0] * tGap = 0.10 * tGap`. To keep aspect ratio < `TARGET_ASPECT`, set `MAX_BOUNDARY_EDGE_U = TARGET_ASPECT * 0.10 * tGap`.

Example: TARGET_ASPECT = 4, tGap = 0.04 → MAX_BOUNDARY_EDGE_U = 4 × 0.004 = 0.016. That's ~11 grid spacings at numU=685 — too sparse for narrow strips. At tGap = 0.01 → 0.004, which is ~3 grid spacings — similar to Proposal 1.

**Trade-offs**:
- Per-band adaptive → different boundary density for wide vs narrow bands (potentially confusing in diagnostics)
- Depends on knowing the companion placement strategy's T-positions (coupling between companion emission and boundary construction)
- More complex to reason about — tGap varies across the pot height
- Risk of extremely sparse boundaries for large tGap bands

**Assessment**: Proposal 1's `3/numU` is simpler, works across all density levels, and achieves the same goal. The 3× factor is robust because: (a) grid spacing is tuned to the surface curvature via CDF, so 3× grid spacing naturally adapts to surface geometry, and (b) at any density level, 3× grid spacing ≈ 3× the minimum U-resolution, ensuring boundary edges don't exceed 3× the geometry's Nyquist frequency.

**Recommendation**: Propose 2 is worth noting but Proposal 1 is preferred. If the Verifier finds edge cases where `3/numU` fails (e.g., extreme numU values), the adaptive threshold is a known fallback.

---

## Recommended Approach

**Proposal 1 (`lastKeptU` spacing gate with `3.0/numU` threshold).**

Rationale:
1. Simple — one new constant, one new variable per loop, one comparison per vertex
2. Robust — adapts to density via `numU`, breaks grid alignment at any density
3. No interaction with Amendment A1 — rescued constraint endpoints go to interior, not boundary
4. Preserves R22's core achievement (grid structure elimination) while bounding the worst-case triangle quality
5. Easy to tune — if 3.0 is wrong, the Executioner can change it to 2.5 or 4.0 with zero structural impact

## Predicted Metrics

| Metric | R22 (current) | R22.1 (predicted) | Reasoning |
|--------|--------------|-------------------|-----------|
| R2violations | 248 | 400-800 | Slightly more grid structure from kept vertices, but 3× spacing prevents alignment |
| 3D violations >4:1 | 57.3% | 30-40% | Short boundary edges → CDT triangles have bounded aspect |
| 3D avg_aspect | 461.9:1 | 80-200:1 | Eliminates the extreme slivers dominating the average |
| 3D max_aspect | 1.4 QUADRILLION | < 50M:1 | No more long-edge-to-near-companion slivers |
| max_area_ratio | catastrophic | < 1B:1 | Correlated with aspect improvement |
| Non-manifold | ~370 | ~370 | Unchanged — pre-existing D-Radical shadow issue |
| gridBoundaryKeepCount | 0 | ~2000-4000 | ~2-3 per strip × ~80 rows × ~15 strips |
| gridBoundaryDropCount | ~high | ~lower | Still dropping most intermediates |

**Confidence**: Medium-high. The max_aspect improvement is near-certain (the quadrillion-scale slivers come exclusively from 0.006-U boundary edges connecting to 0.0004-T companions — eliminating edges >0.00438 U kills them). The avg_aspect prediction is less certain because non-boundary slivers from constraint edges persist.

## T-Junction Analysis

**Claim**: Adding intermediate grid vertices to the boundary at spaced intervals does NOT change the T-junction situation.

**Reasoning**: T-junctions occur when adjacent CDT strip bands have different boundary vertex sets on a shared row. Under R22, both bands share the same `buildMergedRow(j)` output for their common row, so the same filtering applies. The `lastKeptU` gate will select the same intermediate vertices for both bands (same botRow for band j-1's top and same topRow for band j's bottom) because:

1. The gate depends only on `uStripLeft` (same for both bands at same column range) and the vertex U-positions (same merged row data)
2. `lastKeptU` initializes to `uStripLeft` for both
3. The vertices are processed in the same U-sorted order

**Exception**: If two adjacent bands have DIFFERENT strip ranges (different `segStart`/`segEnd`) on the same column block, they have different `uStripLeft` and thus different `lastKeptU` initialization. This can cause one band to keep vertex V and the adjacent band to drop it, creating a T-junction. But this is the SAME pre-existing situation noted in V-R22 C4 (expansion absorbs it, bounded to chain endpoints). R22.1 does not introduce new T-junction risk.

## Interaction with Amendment A1 (Batch2Remap Rescue)

**No interaction**. Amendment A1 rescues constraint endpoints that reference dropped grid vertices by inserting them as interior (not boundary) vertices with PROMO_EPSILON T-promotion. Under R22.1, some previously-dropped grid vertices are now KEPT on the boundary by the spacing gate. If a batch2Remap'd constraint endpoint references a grid vertex that the spacing gate keeps, it's already in `stripBot`/`stripTop` — the A1 `inStrip` check finds it, and no rescue is needed. If the spacing gate drops it, A1 rescues it as before. Both paths are correct.

## Open Questions

1. **Threshold fine-tuning**: Should the factor be 3.0, 2.5, or 4.0? 3.0 is a reasonable starting point. The Executioner should measure R2violations at each value to find the sweet spot.

2. **Right-edge tail**: The `lastKeptU` approach doesn't guarantee uniform spacing near the right endpoint. If the last kept intermediate is at U=0.509 and the right endpoint is at U=0.513, the final edge is 0.004 U (within threshold). But if no intermediate passes the gate in a narrow strip, the full endpoint-to-endpoint edge persists. This is acceptable — narrow strips (2-3 columns) have short edges by definition.

3. **Should `MAX_BOUNDARY_EDGE_U` be computed per-strip or per-export?** Per-export (once, using global numU) is simpler and what Proposal 1 does. Per-strip would scale to the strip's actual width, but strips vary only by endpoint column count, and `numU` is the same everywhere.

4. **Alternative: fraction of strip width?** e.g., `MAX_BOUNDARY_EDGE_U = (uStripRight - uStripLeft) / 4`. At 9 columns: 0.013/4 = 0.003 U (~2× grid spacing — slightly denser). This auto-adapts to strip width but risks reintroducing grid structure for narrow strips where the fraction becomes ≤ grid spacing. The `3/numU` approach is safer because it's independent of strip width — it only depends on the geometry's intrinsic resolution.
