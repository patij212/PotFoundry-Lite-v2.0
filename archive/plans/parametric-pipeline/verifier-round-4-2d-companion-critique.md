# Verifier Round 4 — Critique of Generator 2D Companion Cloud Proposal

Date: 2026-03-04

## Summary Verdict: ACCEPT WITH AMENDMENTS

The concentric ring design (P1) is architecturally sound and solves the fundamental geometry flaw (1D placement → slivers). The CDT integration via interior Steiner points is correct by construction. The aspect ratio improvement (18:1 → 4.1:1) is well-calculated and verified.

However, the proposal has **two critical design bugs** and **four warnings** that must be addressed before implementation.

---

## Critiques

### C1 [CRITICAL]: Double-Inclusion of 2D Companions — buildMergedRow + interiorVerts

**Generator's claim**: Add `t` field to ChainVertex; pass 2D companions as `interiorVerts` to `triangulateChainStrip` (Change 3, Option A).

**The bug**: The Generator's Change 2 (companion generation loop) creates 2D companions with `rowIdx: cv.rowIdx` — the parent chain vertex's grid row. At OWT L513-520, ALL `allChainVertices` (including 2D companions) are added to `rowChainVerts` keyed by `rowIdx`:

```typescript
const rowChainVerts = new Map<number, ChainVertex[]>();
for (const cv of allChainVertices) {
    let list = rowChainVerts.get(cv.rowIdx);
    if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
    list.push(cv);
}
```

Then `buildMergedRow(j)` includes them in `stripBot/stripTop`. But CDT assigns their T as `tBot` or `tTop`:

```typescript
for (const sv of bot) addVertex(sv.idx, sv.u, tBot);   // T forced to row position
for (const sv of top) addVertex(sv.idx, sv.u, tTop);
```

A 2D companion at `(U_cv + du, T_row + 0.001)` gets placed on `buildMergedRow(j)` at `T_row` in CDT space — **wrong position**. AND the same companion appears in `interiorVerts` at its correct T — **double-included, at two different positions**.

**Impact**: Every 2D companion appears twice in CDT: once on the boundary row (wrong T) and once as an interior point (correct T). Two vertices at the same U with near-identical T creates near-degenerate triangles and violates CDT invariants. This is worse than the current 1D placement.

**Required fix**: 2D companions (those with `cv.t !== undefined`) must be EXCLUDED from `rowChainVerts`. They must NOT appear in `buildMergedRow`. They appear ONLY as `interiorVerts`. Add a filter:

```typescript
for (const cv of allChainVertices) {
    if (cv.t !== undefined) continue;  // 2D companions skip row assignment
    let list = rowChainVerts.get(cv.rowIdx);
    if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
    list.push(cv);
}
```

**Severity**: CRITICAL — blocks implementation without this fix.

---

### C2 [CRITICAL]: `applyChainDeadZones` Is Not Called — Dead Zone Phase 1 Is Dead Code Resurrection

**Generator's claim**: "Dead Zone Widening (Phase 1, unchanged): increase `deadZoneRadius` from 0.0005 to approximately `gridCellWidth × 0.5`."

**Actual state**: `applyChainDeadZones` exists in GridBuilder.ts L278-308 as an exported utility but is **NOT called anywhere in the pipeline**. It was removed during the hotfix session (agents_journal L271):

> "Bug 2: Dead zones destroy CDF structure. `applyChainDeadZones` used all 4,854 chain vertex U positions globally. Each chain (~243 points) drifts ~0.094 in U across 313 rows; consecutive U values are ~0.0004 apart. Dead zone radius 0.0005 > point spacing → dead zones tile each chain's entire U-range. 20 overlapping chains → ~100% of U-space excluded. 95.7% of CDF columns were randomly killed. Fix: removed dead zone step entirely."

A search of ParametricExportComputer.ts for `applyChainDeadZones` or `deadZone` returns **zero results**. The function is orphaned.

**Impact**: The Generator's Phase 1 "widen dead zone" step requires first RE-INTRODUCING the dead zone call into PEC, not just changing a parameter. And the original removal was for good reason — the function takes a global `chainVertexUs` array, so overlapping chains create tiled dead zones that destroy the CDF structure. Increasing the radius from 0.0005 to 0.000865 makes this problem WORSE.

**Required fix**: The dead zone cannot be re-introduced as-is. The per-chain-vertex approach destroys CDF structure because chains drift in U. Instead, the dead zone should operate on a **per-row basis**: for each row, remove grid columns near chain vertices in THAT row only. This prevents across-row drift from creating overlapping kill zones.

Alternatively: skip the dead zone entirely and let 2D companions + `COMPANION_DEDUP_THRESHOLD` handle the near-coincident grid/chain vertex problem naturally. The current pipeline works without dead zones.

**Severity**: CRITICAL — the Generator proposes modifying a disconnected function. Phase 1 as specified would either silently do nothing or reintroduce a previously-fixed catastrophic bug.

---

### C3 [WARNING]: Dedup Is 1D (U-Only) — Overlapping 2D Clouds Need 2D Dedup

**Generator's claim**: Existing dedup logic handles near-duplicates. "duplicate-free point sets are fine for CDT" (Assumption 3).

**Actual dedup** (OWT L440-443):
```typescript
for (const eu of existingUs) {
    if (Math.abs(cu - eu) < COMPANION_DEDUP_THRESHOLD) { tooClose = true; break; }
}
```

This checks U-distance only via `existingUs: Set<number>`. It cannot detect two companions from adjacent chain vertices at (U₁, T₁) and (U₂, T₂) where |U₁-U₂| > threshold but Euclidean distance is small.

**Scenario**: Two chain vertices on the same row at U=0.5 and U=0.502 (distance = 0.002). With `maxR ≈ 0.000865`, their Ring 2 clouds (radius 0.000606) don't overlap in U. But two chain vertices on ADJACENT rows at U=0.5 (row j) and U=0.5001 (row j+1) produce clouds whose companions near the midpoint T could be within 1e-5 of each other in U but at different T — the 1D dedup wouldn't catch near-coincident (U,T) pairs.

**Near-coincident points cause CDT numerical issues** — two points within floating-point epsilon produce degenerate triangles.

**Required fix**: Change dedup to 2D distance for companions with explicit `t` values:
```typescript
const dist2d = Math.sqrt((cu - eu) ** 2 + (ct - et) ** 2);
if (dist2d < COMPANION_DEDUP_THRESHOLD_2D) { tooClose = true; break; }
```

Use a spatial hash or bucket structure keyed by (U, T) cell for O(1) proximity checks instead of linear scan.

**Severity**: WARNING — may cause sporadic CDT failures on specific styles/resolutions. Not a guaranteed failure but a latent defect.

---

### C4 [WARNING]: `buildRings` Density Quantization Creates Dead Zones

**Generator's design**: Ring 3 only added when `density >= 6`. This means:

| Density | Ring 1 | Ring 2 | Ring 3 | Total |
|---------|--------|--------|--------|-------|
| 4       | 6      | 8      | —      | 14    |
| 5       | 6      | 8      | —      | 14    |
| 6       | 6      | 8      | 10     | 24    |

**Problems**:
1. Density 5 gives IDENTICAL output to density 4. User moves a slider, nothing changes. This violates the principle of proportional response.
2. The jump from 14 → 24 companions at density 5→6 is a 71% increase — discontinuous.
3. Ring point counts have internal gaps: density=3 gets Ring 2 with 6 points, density=4 gets Ring 2 with 8 points. The transition is abrupt.

**Required fix**: Make companion count a continuous function of density, not a stepped table. Either:
- Scale ring point counts linearly: `count_k = Math.round(baseCount + (density - 1) * scale)`
- Or use the density multiplier to control ring RADIUS instead of point count, keeping counts fixed.

**Severity**: WARNING — functional but poor UX. User expects proportional response from a density slider.

---

### C5 [WARNING]: Silent Fallback in T-Position Lookup Masks Bugs

**Generator's pseudocode** (Change 3):
```typescript
for (const sv of interiorVerts) {
    const cv = chainVerts[sv.idx - gridVCount];
    const t = cv?.t ?? (tBot + tTop) / 2;  // THIS
    addVertex(sv.idx, sv.u, t);
}
```

The `?.` optional chaining with fallback `(tBot + tTop) / 2` means: if the index arithmetic fails (wrong vertexIdx, misaligned arrays), the companion silently gets placed at the strip midpoint. No error, no diagnostic.

**In a system with 92K companions**, a silent midpoint fallback could affect thousands of vertices before anyone notices. The resulting mesh would have a band of incorrectly-placed vertices that are invisible in diagnostics.

**Required fix**: Assert instead of fallback:
```typescript
const cv = chainVerts[sv.idx - gridVCount];
if (!cv || cv.t === undefined) {
    throw new Error(`Interior companion at idx ${sv.idx} has no T-position`);
}
addVertex(sv.idx, sv.u, cv.t);
```

In production, wrap the CDT call with the existing try/catch → sweep fallback, so assertion failures trigger sweep recovery rather than crashing.

**Severity**: WARNING — correctness risk. Silent failures are the hardest bugs to diagnose.

---

### C6 [WARNING]: Row-Band Association Semantics Are Ambiguous for Negative dt

**Generator's design** (Assumption 4): A companion at `(U_cv + du, T_row + dt)` with `dt > 0` belongs to band `[row, row+1]`. With `dt < 0`, it belongs to band `[row-1, row]`.

**Generator's code** (Change 2): All companions get `rowIdx: cv.rowIdx` regardless of `dt` sign.

**The `rowBandInterior` map** (Change 4): Filters by `cv.rowIdx !== j` — so a companion with negative dt and `rowIdx = j` would be collected for band `[j, j+1]` but its T-position is BELOW `activeTPositions[j]`, outside that band's T-range.

The Generator's Change 4 code includes a T-range check:
```typescript
if (cv.t <= activeTPositions[j] || cv.t >= activeTPositions[j + 1]) continue;
```

This would correctly reject the negative-dt companion from band `[j, j+1]`. But it would also be rejected from band `[j-1, j]` because `cv.rowIdx !== j-1`. The companion falls through ALL bands and is LOST.

**Required fix**: Either:
1. Assign `rowIdx` based on which band the companion's T-position falls within (not the parent chain vertex's row), OR
2. Change `rowBandInterior` to check T-position against band bounds regardless of `rowIdx`:

```typescript
// Collect ALL interiors whose T falls within [tBot, tTop]
for (const cv of allInteriorCompanions) {
    if (cv.t === undefined) continue;
    if (cv.t <= activeTPositions[j] || cv.t >= activeTPositions[j + 1]) continue;
    // U-range check...
    interiorVerts.push(...);
}
```

Option 2 is safer but requires iterating all interior companions per band. Pre-bucket by T-range for performance.

**Severity**: WARNING — 50% of companions (those with negative dt) would be silently lost. The mesh would have one-sided clouds: companions above chain vertices but not below.

---

### C7 [NOTE]: Aspect Ratio Math Is Correct

**Generator's claim**: "CDT normalization uses `scale = max(uRange, tRange)`. No aspect correction needed."

**Verified**: CST L206-208 confirms:
```typescript
const scale = Math.max(uRange, tRange);
// ...
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```

Both U and T are divided by the same `scale`. A ring companion at raw `(du, dt)` with `|du| = |dt|` maps to `(du/scale, dt/scale)` — equal normalized distances. The ring appears isotropic in CDT space regardless of the cell's physical aspect ratio.

**ACCEPT** — the Generator's self-correction in the proposal (removing the erroneous `cellU/cellT` scaling) was correct.

---

### C8 [NOTE]: cdt2d Interior Point Handling Is Standard CDT

**Generator's Assumption 1**: "`cdt2d` handles interior free points correctly."

**Verification**: The `cdt2d` library (v1.0.0) implements standard constrained Delaunay triangulation as defined by Shewchuk. ALL input points participate in triangulation. Constraint edges are enforced but do not restrict which points are included. Points not referenced by constraints are "Steiner points" and are incorporated in the Delaunay-optimal way.

The current call at CST L233:
```typescript
triangles = cdt2d(points, cdtEdges, { exterior: true });
```

With `exterior: true`, ALL Delaunay triangles are returned (including those outside the constraint polygon). The centroid filter at CST L248-261 then removes triangles outside `[-0.01, 1.01]` in normalized (U, T) space. Interior companions produce triangles within `[0, 1]` by construction.

**ACCEPT** — no risk from CDT behavior.

---

### C9 [NOTE]: Centroid Filter Won't Reject Interior Triangles

**Generator's claim**: "Interior companions at fractional T-positions produce triangles whose centroids are within the strip's T-range by construction."

**Verified**: The centroid bounds are `tBoundsMin = -0.01`, `tBoundsMax = 1.01` in normalized space. The most extreme interior companion is at Ring 2 radius = `0.90 × maxR`. In normalized space, this maps to at most ~0.28 (T range ≈ 0.0032, max dt ≈ 0.0005, normalized = 0.0005/scale). Well within [-0.01, 1.01].

**ACCEPT** — no risk from centroid filtering.

---

### C10 [NOTE]: Phase 1 Gradient U-Fracs Design Is Sound

**Generator's proposal**: Replace uniform `COMPANION_FRACS` with sqrt-biased fracs that cluster companions near the chain vertex.

**Current code** (OWT L402-405):
```typescript
for (let k = 1; k <= density; k++) {
    COMPANION_FRACS.push(k / (density + 1));
}
```

The sqrt-bias formula:
```typescript
const biased = raw < 0.5
    ? 0.5 * Math.sqrt(2 * raw)
    : 1 - 0.5 * Math.sqrt(2 * (1 - raw));
```

At density=4: uniform → [0.2, 0.4, 0.6, 0.8], biased → [0.224, 0.397, 0.603, 0.776]. The bias is modest (~12% shift on inner fracs). This is a safe, self-contained change with no architectural impact.

**ACCEPT** — clean incremental improvement, compatible with future 2D cloud work.

---

### C11 [NOTE]: Point Count Estimates Are Reasonable

**Generator claims**: 14 companions/vertex × 6,606 chain vertices ≈ 92K companions at density=4.

**Current system**: density=4 → COMPANION_FRACS = [0.2, 0.4, 0.6, 0.8]. 4 fracs × 2 sides × ~6,606 vertices ≈ 52K companions (before clipping/dedup). The 2D cloud at 14/vertex is 77% more companions. Given that the purpose is higher local definition with better aspect ratios, this is a reasonable trade.

**Generator claims**: "Less than the current 130K at density=12."

**Check**: density=12 → 12 fracs × 2 sides × 6,606 = ~158K. The Generator's "130K" is an estimate, not exact. The comparison holds (92K < 158K).

**Performance**: `cdt2d` processes ~65 base + ~14 interior ≈ 79 points per strip call. The library handles this scale trivially (O(n log n) for Delaunay). No performance concern.

**ACCEPT** — numbers check out.

---

## Accepted Items

1. **P1 Concentric Ring geometry** — correct CDT-space isotropy, natural density gradient
2. **P2 Hex Packing rejection** — uniform density wastes budget; Generator's reasoning is sound  
3. **ChainVertex `t` field addition** — clean optional extension, backward compatible
4. **Interior Steiner points in CDT** — standard CDT behavior, no constraint edges needed
5. **Phase 1 gradient U-fracs** — safe incremental improvement
6. **Vertex buffer T-position update** — `cv.t ?? activeTPositions[cv.rowIdx]` (1-line change, correct)
7. **`evaluatePoints` GPU integration** — confirmed feasible, existing infrastructure at PEC L243

---

## Open Questions for Generator

1. **Dead zone strategy**: Given that `applyChainDeadZones` was removed for destroying CDF structure, what is your revised Phase 1 approach for pushing grid columns away from chains? Per-row dead zones? Wider `COMPANION_DEDUP_THRESHOLD`? Or drop the dead zone requirement from Phase 1?

2. **Density continuity**: How should `buildRings` respond to density values 5, 7, 9-11? Current table has dead zones. Propose a continuous formula.

3. **Negative-dt companion collection**: Confirm the row-band association strategy. Are you bucketing by T-position or by `rowIdx`?

---

## Implementation Conditions (if Generator addresses C1-C6)

### Phase 1 (Ship Now)
1. Remove `pointIdx < 0` filter (unchanged from Round 3 convergence)
2. Gradient U-fracs (sqrt bias) — replace COMPANION_FRACS computation
3. **Skip dead zone widening** until a per-row strategy is designed

### Phase 2 (2D Companion Cloud)
Implementation order:
1. Add `t?: number` field to `ChainVertex` interface
2. Replace 1D companion loop with 2D ring generator
3. **Exclude** 2D companions from `rowChainVerts` (C1 fix)
4. Update vertex buffer T-position: `cv.t ?? activeTPositions[cv.rowIdx]`
5. Add `interiorVerts: StripVertex[]` parameter to `triangulateChainStrip`
6. In `cdtTriangulateStrip`, add interior vertices at their real T-positions (no silent fallback — assert)
7. Build `rowBandInterior` map bucketed by T-position, not `rowIdx` (C6 fix)
8. Change dedup to 2D distance for companions with explicit `t` (C3 fix)
9. Make `buildRings` continuous (C4 fix)

### Validation Protocol
After implementation, verify:
- [ ] Zero 2D companions appear in `buildMergedRow` output
- [ ] All 2D companions appear exactly once as `interiorVerts`
- [ ] No companion with negative dt is lost (collect counts: total generated vs total triangulated)
- [ ] Maximum aspect ratio in chain strips < 6:1 at density=4 (vs current 18:1)
- [ ] CDT fallback rate remains 0% (current baseline)
- [ ] Total triangle count within 20% of current (mesh density preserved)
- [ ] Export time within 150% of current (92K companions vs 52K)
