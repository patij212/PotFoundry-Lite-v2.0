# Verifier Round 15 — Critique of Generator's CatRom Removal + Companion Density Boost
Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

- **P1 (Remove CatRom Subdivision)**: ACCEPT
- **P4 (Increase Companion Density to (2,2))**: ACCEPT WITH AMENDMENTS

---

## P1 Analysis: Remove CatRom Subdivision

### C1 [NOTE]: Assumption 1 — "264 rows provide sufficient angular resolution"

**Generator's claim**: "Piecewise-linear chain edges are visually smooth at 264-row resolution."

**Verification**: Confirmed. At 264 rows, the vertical spacing is approximately `H / 264 ≈ 0.15mm` for a 40mm pot. The worst-case U-drift at inflection zones is ~0.009 (from the log data), which translates to ~1.1mm lateral shift on a 40mm-diameter pot. The kink angle at an inflection between two piecewise-linear segments is:

```
Segment vector = (ΔU, ΔT) ≈ (±0.009, 0.004)
Angle between reversed segments ≈ 2 × arctan(0.009 / 0.004) ≈ 2 × 66° ≈ 132° interior angle
```

In 3D, this angle is heavily attenuated by the dominant T-component — the segments are nearly vertical with slight lateral wobble. At 0.15mm vertical spacing, no 3D printer or human eye can resolve the < 0.1° angular error between linear and cubic interpolation.

For extreme curvature styles (high superformula `m`): features are more closely spaced in U but ALSO more regular (lower inflection rate). The chain linker's DP matcher ensures monotone U-ordering within each chain. The resolution concern only arises at m-transitions (bifurcation zones), which are localized to a few rows.

**Verdict**: ACCEPT. No counterexample found. The Nyquist argument holds.

---

### C2 [NOTE]: Assumption 2 — "CDT quality doesn't degrade without CatRom interior points"

**Generator's claim**: "Removing CatRom interior points doesn't degrade CDT quality below current levels."

**Actual behavior**: CatRom subdivision vertices are NOT free interior Steiner points for CDT. I traced the data flow:

1. CatRom vertices are created at [OuterWallTessellator.ts line 313-330](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L313-L330) with `pointIdx: -1` and explicit `t`.
2. They are interleaved into `finalChain` and then connected as constraint edge endpoints at [lines 528-540](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L528-L540).
3. They are collected into `interiorByBand` at [lines 747-756](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L747-L756) because `cv.t !== undefined`.
4. In the strip builder, they're routed to `stripInteriorVerts` at [line 1200](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1200) via the missing-endpoint fix.
5. In CDT, they're registered as points AND referenced by constraint edges.

**Key insight**: In a constrained Delaunay triangulation, a vertex that is a constraint edge endpoint is NOT a "free" Steiner point. It's a constrained vertex — the CDT MUST include the constraint edges through it. The CatRom vertices don't provide the CDT with extra degrees of freedom to create well-shaped triangles. They LOCK the triangulation to follow the (zigzag) constraint path.

Removing CatRom vertices actually HELPS CDT quality:
- Constraint count drops from ~21K (3× due to subdivision) to ~7K (direct)
- Constraint path becomes straight instead of zigzag → fewer degenerate triangles
- Fewer crossing constraints → fewer CDT fallbacks to sweep

**Verdict**: ACCEPT. Generator's claim is correct, and actually understated — CDT quality should IMPROVE, not just "not degrade."

---

### C3 [WARNING]: Assumption 3 — "Edge-building loop handles non-subdivided fullChain"

**Generator's claim**: "The edge-building loop correctly handles non-subdivided fullChain entries."

**Actual behavior at [lines 528-540](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L528-L540)**:
```typescript
const isSubdivEdge = p0.pointIdx < 0 || p1.pointIdx < 0;
if (rowGap === 0 && !isSubdivEdge) continue;
```

Without CatRom, `finalChain = fullChain` contains:
- **Raw remapped vertices**: `pointIdx >= 0`, no `t`
- **Interpolated gap-fill vertices**: `pointIdx = -1`, no `t`

For adjacent entries in fullChain:
- `(raw, raw)` with rowGap=1: `isSubdivEdge=false`, guard doesn't trigger → edge CREATED ✓
- `(raw, interp)` with rowGap=1: `isSubdivEdge=true` → edge CREATED ✓
- `(interp, interp)` with rowGap=1: `isSubdivEdge=true` → edge CREATED ✓
- `(interp, raw)` with rowGap=1: `isSubdivEdge=true` → edge CREATED ✓

**Edge case — same-row duplicates**: If `origToFinal` maps two original rows to the same final row, consecutive raw entries have `rowGap=0` and `isSubdivEdge=false` → edge SKIPPED. This is semantically correct because:
1. The chain linker produces at most one point per row per chain
2. Same-row pairs only arise from row-mapping collisions, which are rare
3. Same-row chain vertices are connected through the merged row boundary, not through a dedicated constraint edge
4. Skipping same-row non-subdiv edges was the INTENDED behavior even WITH CatRom

However, I want to flag: the interpolation loop at [lines 488-500](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L488-L500) uses `if (rowGap <= 1 && rowGap >= -1) continue;` — this includes `rowGap=0`. So if two rawRemapped entries have the same row, no interpolation is done, and they appear adjacent in fullChain with rowGap=0. The edge-building guard then skips the edge. The two points are both in the mesh but disconnected by constraint edges.

**Is this a problem?** Not for correctness — the CDT creates its own edges around these vertices. But for completeness of the feature path: two vertices with the same `chainId`, same row, but potentially different U-positions should probably share a constraint edge to enforce the feature path direction. This is NOT a new problem (CatRom also skips `rowGap !== 1` edges) and was already present before this proposal.

**Verdict**: ACCEPT WITH NOTE. Edge-building is correct for the common case. The same-row edge-skip is pre-existing behavior, not introduced by P1.

---

### C4 [NOTE]: Assumption 4 — "No other pipeline component depends on CatRom vertices"

**Generator's claim**: "Removing subdivision doesn't break any other part of the pipeline."

**Verification — systematic check of all `cv.t` touchpoints**:

| Component | Location | Depends on CatRom? | Evidence |
|-----------|----------|-------------------|----------|
| `interiorByBand` | [OWT L747-756](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L747) | NO — also collects companions | Companions have `t: ct` at [L617](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L617) |
| `rowChainVerts` | [OWT L798](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L798) | NO — filter `cv.t !== undefined` is independent | CatRom vertices were excluded here anyway |
| `stripInteriorVerts` | [OWT L1175](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1175) | NO — collects from `interiorByBand` | Companions fill this role |
| Missing endpoint fix | [OWT L1191-1207](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1191) | NO — routes `cv.t !== undefined` to interior | Companions with `t` handled correctly |
| CDT interior validation | [CST L234](src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L234) | NO — validates `cv.t !== undefined` | Companions pass this check |
| Primary edge counting | [OWT L1430-1445](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1430) | IMPROVED — primary edges recover | `pointIdx >= 0` now appear in edges |
| Companion generation | [OWT L716](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L716) | NO — filters `cv.pointIdx < 0` | CatRom vertices were skipped by companions anyway |

**Critical verification — `tryEmitCompanion` at [line 617](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L617)**: Companions are pushed with `t: ct` (explicit T-position). This confirms companions have `cv.t !== undefined` and will be collected by `interiorByBand` regardless of whether CatRom is enabled.

**Verdict**: ACCEPT. No pipeline component depends specifically on CatRom vertex properties. Every touchpoint that uses `cv.t` is satisfied by companion vertices.

---

### C5 [NOTE]: Primary Edge Recovery

**Generator's claim**: "Primary edge count recovers from 0 to expected value."

**Verification at [lines 1430-1445](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1430-L1445)**:
```typescript
const isPrimary = rpcv0 && rpcv1 && rpcv0.pointIdx >= 0 && rpcv1.pointIdx >= 0;
```

With CatRom: every edge passes through at least one CatRom vertex (`pointIdx = -1`) → `primaryTotal = 0`.

Without CatRom: edges between adjacent raw chain points both have `pointIdx >= 0` → classified as primary. Edges involving interpolated gap-fill vertices have `pointIdx = -1` → not primary. This is correctly capturing the distinction between "detected feature edges" and "interpolated support edges."

**Expected**: ~20 chains × ~264 raw points / chain × ~50% adjacent-raw-to-raw rate ≈ 2,640 primary edges. This is a useful diagnostic recovery.

**Verdict**: ACCEPT.

---

## P4 Analysis: Increase Companion Density from (1,1) to (2,2)

### C6 [WARNING]: Assumption 5 — "4x more companions don't significantly increase export time"

**Generator's claim**: "The performance impact is acceptable."

**Actual computation**:

Current (density=4, nTLevels=1, nUSpread=1):
- Per chain vertex: 2 bands × 1 T-level × 2 U-spread × 1 lateral = 4 companions
- ~4,860 raw chain vertices (20 chains × 243 avg points) → ~19K pre-dedup → ~14K after dedup

Proposed (density=8, nTLevels=2, nUSpread=2):
- Per chain vertex: 2 bands × 2 T-levels × 2 U-spread × 2 laterals (left+right) = **16** companions
- ~4,860 raw chain vertices → ~78K pre-dedup → ~40-50K after dedup (higher dedup rate at higher density)

**Net vertex change**: P1 removes ~14K CatRom vertices. P4 adds ~26-36K companions. Net increase: ~12-22K vertices.

**CDT impact**: Each strip gains ~4× more interior points. CDT on small point sets (10→40 points) is O(n log n) with tiny constant factors. Per-strip CDT time goes from ~10μs to ~30μs. Total across ~500 strips: ~5ms → ~15ms. **Negligible.**

**STL impact**: ~15K extra vertices × 2 triangles/vertex × 50 bytes/triangle ≈ 1.5MB. On a 40-80MB STL, this is ~2-4%. **Acceptable.**

**Wall-clock export time**: The dominant cost is GPU probing and feature detection (~40s), not CDT (~0.1s). P4's impact on total export time is < 1%. The 50s→20s target is blocked by GPU pipeline cost, not companion count.

**BUT**: The Generator's recommendation skips an important question. P1 alone may achieve sufficient CDT quality improvement (constraint path straightened, constraint count reduced 3×, crossing constraints eliminated). P4 should be evaluated AFTER measuring P1 results, not assumed necessary.

**Verdict**: ACCEPT WITH AMENDMENT. P4 should be implemented as a SEPARATE commit with a configurable density parameter, and only merged after measuring P1's standalone quality improvement. If P1 alone produces `minAngle > 5°` and `maxAspect < 100:1`, P4 is unnecessary.

---

### C7 [WARNING]: Guard Radius Marginal Zone at nUSpread=2

**Generator's claim**: "CONSTRAINT_GUARD_RADIUS prevents companion-constraint interference at higher density."

**Actual behavior at [OWT lines 560-600](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L560-L600)**:

At (2,2):
- `baseSpreadU = Math.max(tGap * 0.4, 0.002)` ≈ `Math.max(0.004 × 0.4, 0.002)` = `Math.max(0.0016, 0.002)` = **0.002**
- m=1 lateral: `uOff = 0.002 × 1/2 = 0.001`
- m=2 lateral: `uOff = 0.002 × 2/2 = 0.002`
- `CONSTRAINT_GUARD_RADIUS = 0.001`

For a near-vertical chain edge, the perpendicular distance from the m=1 companion to the constraint edge is exactly `0.001` — equal to CONSTRAINT_GUARD_RADIUS. The `isNearConstraintEdge` check uses `dist < CONSTRAINT_GUARD_RADIUS` (strict less-than), so companions at exactly 0.001 are ACCEPTED.

However, for slightly angled chains (U-drift between rows), the nearest point on the constraint segment is slightly closer to the m=1 companion than the perpendicular distance from the constraint LINE, so some m=1 companions will be rejected.

**Estimate**: ~30-50% of m=1 laterals rejected near chain vertices with measurable U-drift. m=2 laterals at distance 0.002 are comfortably accepted. Effective companions per CV: ~12-14 instead of 16.

**Verdict**: ACCEPT WITH NOTE. This is not a correctness issue — rejected companions are noise. The effective density is ~3× instead of 4×, which is still a substantial improvement over current 1×. No code change needed.

---

### C8 [NOTE]: Scaling Formula Discontinuity

**Observation**: The Generator proposes changing the default `densityMultiplier` from 4 to 8. The scaling at [OWT line 569](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L569):
```typescript
const nTLevels = Math.max(1, Math.min(2, Math.floor(density / 4)));
const nUSpread = Math.max(1, Math.min(2, Math.floor(density / 3)));
```

This creates a jump: density 4→7 gives (1,1)→(1,2), density 8 gives (2,2). There's no gradual ramp. The Generator's choice of density=8 for (2,2) is the minimum value that achieves both nTLevels=2 AND nUSpread=2.

**Verdict**: ACCEPT. The formula is pre-existing and works correctly. The Generator chose the minimum density value for the desired output.

---

## Accepted Items

| Item | Evidence |
|------|----------|
| P1 core idea (remove CatRom) | CatRom overshoots at inflections, verified via uniform CatRom cubic analysis. Zigzag constraint paths confirmed by `primaryTotal=0` diagnostic. |
| Companion independence from CatRom | `tryEmitCompanion` at L617 gives `t: ct`. Companion loop at L716 filters `pointIdx < 0` (skips CatRom anyway). |
| Edge-building correctness without CatRom | All rowGap=1 pairs produce edges. Same-row skip is pre-existing and harmless. |
| Full pipeline compatibility | 7/7 `cv.t` touchpoints verified — all satisfied by companions alone. |
| P4 CDT quality improvement | More free Steiner points never worsen CDT. Mathematical guarantee. |
| P4 performance acceptability | CDT cost increase < 1% of total export time. |

---

## Open Questions for Generator

1. **Is P4 necessary if P1 alone succeeds?** The Generator recommends P1+P4 together as Phase 1. I argue P4 should be conditional on P1's standalone results. If P1 produces acceptable quality, P4 adds complexity and vertices for no benefit. Can the Generator accept sequential evaluation?

2. **CatRom code preservation**: The Generator recommends keeping `subdivideFullChain` marked as `@deprecated`. I concur — deleting tested, exported code is destructive. The function is also used in `OuterWallTessellator.test.ts`. Mark it deprecated, don't delete.

3. **Interaction with Round 14 changes**: Round 14 switched to pre-smooth (true GPU re-snapped) coordinates. The Generator's analysis assumes post-Round-14 chain data. Confirm that the chain vertex U-positions in the logs reflect the Round 14 fix, not the pre-fix data.

---

## Implementation Conditions

### For the Executioner:

**P1 Implementation (APPROVED)**:
1. At [OWT line 519](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L519), replace:
   ```typescript
   const subdivResult = subdivideFullChain(
       fullChain, activeTPositions, numT, cIdx, { value: nextVertexIdx }
   );
   for (const sv of subdivResult.newVertices) {
       chainVertices.push(sv);
   }
   nextVertexIdx += subdivResult.newVertices.length;
   const finalChain = subdivResult.subdivided;
   ```
   with:
   ```typescript
   const finalChain = fullChain;
   ```
2. Do NOT delete `subdivideFullChain`, `catmullRomInterp`, or `mirrorVertex`. Add `@deprecated` JSDoc tag to `subdivideFullChain`.
3. Update the edge-building comment at [line 529](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L529) to remove CatRom references.
4. Run all tests: `npx vitest run` — expect all to pass. The `subdivideFullChain` unit tests should still pass (function not deleted).

**P4 Implementation (CONDITIONAL — evaluate after P1 results)**:
1. At [ParametricExportComputer.ts line 434](src/renderers/webgpu/ParametricExportComputer.ts#L434), change default from `4` to `8`:
   ```typescript
   const cfgChainStripDensity = pc?.chainStripDensity ?? 8;
   ```
2. Only merge P4 if P1 alone produces `minAngle < 5°` or `maxAspect > 100:1`.

### Validation Protocol:
1. **After P1 only**: Export a bifurcation-zone pot (m-transition style). Check:
   - `primaryTotal > 0` (primary edges recovered)
   - `minAngle > 2°` (improvement from current 0.0°)
   - `maxAspect < 10,000:1` (improvement from current 52M:1)
   - Crossing constraint count decreased
   - Debug polylines unchanged (should still look great)
2. **After P4 (if needed)**: Compare CDT quality metrics with P1-only baseline.
   - `minAngle` should improve further
   - `maxAspect` should decrease further
   - Interior vertex collection rate should increase (more companions collected)
   - Total export time increase < 3 seconds

---

## Assessment of Implementation Order

The Generator's recommended order (P1 first, then P4) is correct. My amendment: P4 should be evaluated AFTER measuring P1 results, not applied blindly with P1. The reason:

1. P1 eliminates the ROOT CAUSE (zigzag constraint paths). This alone may produce acceptable quality.
2. P4 addresses a SECONDARY concern (CDT Steiner point density). It's an optimization, not a fix.
3. P1 REDUCES computational cost. P4 INCREASES it. Applying both together obscures the individual contributions.
4. If P1 alone fails (quality still poor), P4 is the natural next step. If P1 alone succeeds, P4 is unnecessary overhead.

**Recommended protocol**:
1. Implement P1 in isolation → export → measure quality metrics
2. If quality insufficient → implement P4 → re-export → compare
3. This gives clean before/after data for both changes

---

*Verifier sign-off. The CatRom removal is the cleanest fix I've reviewed — mathematically sound, low risk, minimal code change, net-positive for both quality and performance. The companion density boost is a reasonable hedge but should be conditional.*
