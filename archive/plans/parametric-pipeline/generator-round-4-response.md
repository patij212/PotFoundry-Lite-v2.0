# Generator Round 4 Response — Addressing Verifier Critique

Date: 2026-03-04

## Disposition

| ID | Severity | Verifier Ruling | Generator Response |
|----|----------|-----------------|-------------------|
| C1 | CRITICAL | Double-inclusion in rowChainVerts + interiorVerts | **ACCEPTED** — real bug, fix exactly as Verifier specifies |
| C2 | CRITICAL | Dead zone is orphaned, re-introducing it would be catastrophic | **ACCEPTED** — dead zone WITHDRAWN from Phase 1 |
| C3 | WARNING | 1D dedup inadequate for 2D clouds | **ACCEPTED** — switching to 2D spatial-bucket dedup |
| C4 | WARNING | buildRings has density dead zones | **ACCEPTED** — replaced with continuous per-ring linear scaling |
| C5 | WARNING | Silent T-fallback masks bugs | **ACCEPTED** — assert instead of fallback |
| C6 | WARNING | Negative-dt companions silently lost | **ACCEPTED** — bucket by T-position, not rowIdx |
| C7 | NOTE | Aspect ratio math correct | Acknowledged |
| C8 | NOTE | cdt2d interior point handling is standard | Acknowledged |
| C9 | NOTE | Centroid filter won't reject interior triangles | Acknowledged |
| C10 | NOTE | Phase 1 gradient U-fracs is sound | Acknowledged |
| C11 | NOTE | Point count estimates reasonable | Acknowledged |

**Score: 0 rejections.** Every critique is valid. The Verifier caught two implementation-blocking bugs (C1, C2) and four latent defects (C3-C6) that would have surfaced during testing.

---

## C1: Double-Inclusion Fix (ACCEPTED IN FULL)

The Verifier is exactly right. I traced the flow:

1. Companion generation (OWT L418-480) creates companions with `rowIdx: cv.rowIdx`
2. `allChainVertices = [...chainVertices, ...companionVertices]` (OWT ~L509)
3. `rowChainVerts` map (OWT L513-518) iterates ALL of `allChainVertices` — no filter
4. `buildMergedRow(j)` (OWT L557+) pulls from `rowChainVerts.get(row)` → companions appear in bot/top strips
5. CDT assigns `tBot` or `tTop` to those vertices → wrong T-position for 2D companions
6. Same companion also appears in `interiorVerts` at correct T → double-included

**Fix**: Exactly as Verifier specifies. Filter 2D companions out of `rowChainVerts`:

```typescript
for (const cv of allChainVertices) {
    if (cv.t !== undefined) continue;  // 2D companions are interior-only
    let list = rowChainVerts.get(cv.rowIdx);
    if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
    list.push(cv);
}
```

**Design principle**: 2D companions exist in exactly ONE place — the `interiorVerts` array passed to CDT. They are invisible to `buildMergedRow`, invisible to `rowChainVerts`, invisible to strip boundary construction. Their only interaction with the pipeline is:
1. Vertex buffer (OWT L508): gets their (U, T, surfaceId) for GPU evaluation
2. `interiorVerts` parameter to `triangulateChainStrip`: CDT incorporates them as Steiner points

This is a clean separation. No ambiguity about where they belong.

---

## C2: Dead Zone WITHDRAWN from Phase 1 (ACCEPTED IN FULL)

The Verifier is right on every point:

1. **`applyChainDeadZones` is not called.** I confirmed: PEC L1190-1194 has an explicit comment explaining why it was removed:

   > "Dead zones are NOT applied: with drifting chains (U-drift ~0.094 per chain over 313 rows) and shared columns, global dead zones destroy the CDF structure — chain points spaced ~0.0004 apart create continuous exclusion bands that tile ~100% of U-space."

2. **Widening the radius would make it worse.** The original radius of 0.0005 destroyed 95.7% of columns. My proposed 0.000865 would destroy even more.

3. **The current pipeline works without dead zones.** The CDT + vertex dedup handles near-coincident grid/chain vertices naturally (per the PEC comment).

**Decision**: Dead zone widening is WITHDRAWN from Phase 1. The revised Phase 1 is:
1. Remove `pointIdx < 0` filter (unchanged)
2. Gradient U-fracs (sqrt bias) (unchanged)
3. ~~Widen dead zone~~ → REMOVED

**Future consideration**: If 2D companion clouds create density problems near grid columns, a per-strip dead zone (operating column-by-column within each strip's CDT call, not globally on the CDF grid) could be designed as Phase 3 work. But this is speculative — the companion dedup at OWT L440-443 may be sufficient.

---

## C3: 2D Spatial-Bucket Dedup (ACCEPTED)

The Verifier correctly identified that the current dedup is U-only (OWT L440-443: `Math.abs(cu - eu) < COMPANION_DEDUP_THRESHOLD`). With 2D companions at fractional T-positions, two companions from adjacent chain vertices could be close in (U,T) space but not caught by U-only dedup.

**Revised dedup design**:

Replace the `rowChainUSet: Map<number, Set<number>>` with a 2D spatial bucket structure:

```typescript
// Bucket key: quantized (U, T) cell
const BUCKET_SIZE = COMPANION_DEDUP_THRESHOLD * 10;  // ~1e-4
function bucketKey(u: number, t: number): number {
    const bu = Math.floor(u / BUCKET_SIZE);
    const bt = Math.floor(t / BUCKET_SIZE);
    return bu * 100000 + bt;  // pack into single integer (no string hashing — V8 safe)
}

interface CompanionEntry { u: number; t: number; }
const companionBuckets = new Map<number, CompanionEntry[]>();

function isDuplicate2D(cu: number, ct: number, threshold: number): boolean {
    // Check the 3×3 neighborhood of buckets
    const bx = Math.floor(cu / BUCKET_SIZE);
    const by = Math.floor(ct / BUCKET_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const key = (bx + dx) * 100000 + (by + dy);
            const entries = companionBuckets.get(key);
            if (!entries) continue;
            for (const e of entries) {
                const dist2 = (cu - e.u) ** 2 + (ct - e.t) ** 2;
                if (dist2 < threshold * threshold) return true;
            }
        }
    }
    return false;
}
```

**Performance**: Integer keys avoid V8 string-hashing crashes (the same problem that hit vertex welding, per agents.md "Previous string-hashing caused V8 crashes"). 3×3 neighborhood check is O(1) amortized per companion. Total: O(C) for all companions where C ≈ 92K.

**Threshold**: `COMPANION_DEDUP_THRESHOLD_2D` should be the same as the current `COMPANION_DEDUP_THRESHOLD = 1e-5`. In 2D Euclidean distance, this is slightly more permissive than 1D (a companion at `(U+7e-6, T+7e-6)` has 2D distance ~1e-5), but the difference is negligible.

**Backward compatibility**: For 1D companions (no `t` field), the T-coordinate used in dedup should be `activeTPositions[cv.rowIdx]` — same as current behavior. The bucket structure handles both 1D and 2D companions uniformly.

---

## C4: Continuous buildRings Formula (ACCEPTED)

The Verifier correctly identified that density=5 gives identical output to density=4 in my original table. That's a UX failure — user moves a slider, nothing changes.

**Revised design**: Per-ring point counts scale linearly with density. Ring introduction points are staggered so the total companion count grows monotonically.

```typescript
const RING_CONFIG = [
    { radiusFrac: 0.35, minDensity: 1, baseCount: 3, scale: 0.5, offset: 0 },
    { radiusFrac: 0.70, minDensity: 2, baseCount: 3, scale: 0.7, offset: Math.PI / 6 },
    { radiusFrac: 0.90, minDensity: 5, baseCount: 3, scale: 1.0, offset: Math.PI / 3 },
];

function buildRings(
    density: number,
    maxRadius: number,
): Array<{ radius: number; count: number; offset: number }> {
    const rings: Array<{ radius: number; count: number; offset: number }> = [];
    for (const cfg of RING_CONFIG) {
        if (density < cfg.minDensity) continue;
        const rawCount = cfg.baseCount + (density - cfg.minDensity) * cfg.scale;
        const count = Math.max(3, Math.min(16, Math.round(rawCount)));
        rings.push({
            radius: maxRadius * cfg.radiusFrac,
            count,
            offset: cfg.offset,
        });
    }
    return rings;
}
```

**Resulting point counts**:

| Density | Ring 1 | Ring 2 | Ring 3 | Total | Δ from prev |
|---------|--------|--------|--------|-------|-------------|
| 1       | 3      | —      | —      | **3** | — |
| 2       | 4      | 3      | —      | **7** | +4 |
| 3       | 4      | 4      | —      | **8** | +1 |
| 4       | 5      | 4      | —      | **9** | +1 |
| 5       | 5      | 5      | 3      | **13** | +4 |
| 6       | 6      | 6      | 4      | **16** | +3 |
| 7       | 6      | 7      | 5      | **18** | +2 |
| 8       | 7      | 7      | 6      | **20** | +2 |
| 9       | 7      | 8      | 7      | **22** | +2 |
| 10      | 8      | 9      | 8      | **25** | +3 |
| 11      | 8      | 9      | 9      | **26** | +1 |
| 12      | 9      | 10     | 10     | **29** | +3 |

**Properties**:
- Every density step changes the output (no dead zones)
- Maximum single-step jump is +4 (at Ring 2 introduction d=2, Ring 3 introduction d=5)
- Growth is approximately linear: ~2.4 companions per density step
- Ring introduction points are the largest jumps — this is inherent and acceptable because a new ring is a qualitative change ("new layer of detail")

**Note on the d=2 and d=5 jumps**: The +4 jumps occur when a new ring is introduced. This is a qualitative change — the user gets a new layer of resolution. Smoothing this further (e.g., introducing Ring 2 with 1 point) would create visually pointless single-vertex rings. A minimum of 3 points per ring ensures each ring is geometrically meaningful (forms a triangle inscribed in the ring circle).

---

## C5: Assert Instead of Fallback (ACCEPTED)

The Verifier is right that silent `(tBot + tTop) / 2` fallback masks bugs. In a system with 92K companions, a wrong T-position on one vertex is invisible in diagnostics but creates a degenerate triangle.

**Revised code**:

```typescript
for (const sv of interiorVerts) {
    const cvIdx = sv.idx - gridVCount;
    const cv = allChainVertices[cvIdx];
    if (!cv || cv.t === undefined) {
        throw new Error(
            `Interior companion at vertexIdx=${sv.idx} (cvIdx=${cvIdx}) has no explicit T-position. ` +
            `This indicates a bug in companion collection — only companions with cv.t should be in interiorVerts.`
        );
    }
    addVertex(sv.idx, sv.u, cv.t);
}
```

The existing try/catch in `triangulateChainStrip` (CST L233-238) wraps the CDT call. If the assertion fires, the strip falls back to sweep triangulation — a degraded but non-crashing result. The error message is logged to the `stats.warnings` array for post-export diagnostics.

**Design principle**: Fail loudly on invariant violations. The try/catch gives graceful degradation, but the assertion ensures we KNOW about the problem rather than silently producing wrong geometry.

---

## C6: T-Position Bucketing for Row-Band Collection (ACCEPTED)

The Verifier caught a 50%-companion-loss bug. My original design:
- Companion at `(U, T_row - dt)` gets `rowIdx = j` (parent's row)
- Strip for band `[j, j+1]` collects it, but T-range check rejects it (T < activeTPositions[j])
- Strip for band `[j-1, j]` doesn't collect it (rowIdx ≠ j-1)
- Companion is lost

**Root cause**: Overloading `rowIdx` for two purposes — (1) "which chain vertex spawned me" and (2) "which row band am I in". These are different for negative-dt companions.

**Fix**: The Verifier's Option 2 is correct — bucket by T-position, not by rowIdx. But with a pre-built index for performance.

**Implementation**:

During companion generation, assign each 2D companion to the correct row band based on its T-position, not its parent's rowIdx:

```typescript
// Pre-build interior companion index, keyed by ROW BAND that contains the companion's T
const interiorByBand = new Map<number, ChainVertex[]>();

for (const cv of companionVertices) {
    if (cv.t === undefined) continue;
    // Binary search for the row band [j, j+1] where activeTPositions[j] < cv.t < activeTPositions[j+1]
    const bandIdx = bsearchFloor(activeTPositions, cv.t);
    if (bandIdx < 0 || bandIdx >= numT - 1) continue;  // companion outside grid bounds — skip
    if (cv.t <= activeTPositions[bandIdx] || cv.t >= activeTPositions[bandIdx + 1]) continue;
    
    let list = interiorByBand.get(bandIdx);
    if (!list) { list = []; interiorByBand.set(bandIdx, list); }
    list.push(cv);
}
```

Then per-strip collection is O(1) lookup + O(k) U-range filter:

```typescript
// In the strip loop for band [j, j+1]:
const bandInterior = interiorByBand.get(j) || [];
const interiorVerts: StripVertex[] = [];
for (const cv of bandInterior) {
    if (cv.u < uStripLeft - 1e-9 || cv.u > uStripRight + 1e-9) continue;
    interiorVerts.push({ idx: cv.vertexIdx, u: cv.u, isChain: false, gridCol: -1 });
}
```

**Why `bsearchFloor` on `activeTPositions`**: The `activeTPositions` array is sorted (it's the grid T-positions). A binary search finds the row band in O(log R) per companion. Total: O(C log R) for all companions, where C ≈ 92K and R ≈ 313 → log₂(313) ≈ 8.3 → ~764K operations. Negligible.

**The `rowIdx` field remains**: It still references the parent chain vertex's row. This is useful for diagnostics and for the vertex buffer T-position fallback (`cv.t ?? activeTPositions[cv.rowIdx]` on 1D companions). But it's NOT used for strip collection of 2D companions.

---

## Answers to Open Questions

### Q1: Dead Zone Strategy (Revised Phase 1)

**Answer**: Dead zone is DROPPED from Phase 1. The pipeline runs without dead zones today (PEC L1190-1194). The CDT + vertex dedup handle near-coincident grid/chain vertices naturally. The 2D companion cloud (Phase 2) provides the density gradient that I originally expected the dead zone to enable.

If a future need arises, the correct architecture is a **per-strip dead zone** operating inside `triangulateChainStrip`, not a global grid operation:

```
// Hypothetical per-strip dead zone (NOT for Phase 1 or 2):
// For each grid vertex in stripBot/stripTop, check if any chain vertex
// is within deadZoneRadius in (U, T) space. If yes, replace the grid
// vertex with the nearest chain vertex (vertex merging, not column removal).
```

This avoids the CDF destruction problem because it operates per-strip (local, not global) and merges vertices instead of removing columns.

### Q2: Density Continuity

**Answer**: See C4 above. Linear scaling with `count = max(3, round(baseCount + (density - minDensity) * scale))` per ring. Every density step changes the output. Maximum step-to-step jump is +4 (at ring introduction points). The `RING_CONFIG` table is data-driven and easily tunable by the Executioner.

### Q3: Negative-dt Companion Collection

**Answer**: See C6 above. Bucket by T-position using `bsearchFloor(activeTPositions, cv.t)`. The `rowIdx` field is not used for strip collection of 2D companions— it's retained for diagnostics and 1D companion vertex buffer lookup only.

---

## Revised Phase Plan

### Phase 1: Foundation (Ship Now — 2 changes)
1. **Remove `pointIdx < 0` filter** (OWT L857) — converged since Round 3
2. **Gradient U-fracs** (OWT L402-405) — sqrt bias, ~5-line change

### Phase 2: 2D Companion Cloud (9 changes, ordered)
1. Add `t?: number` field to `ChainVertex` interface
2. Replace 1D companion loop with 2D concentric ring generator (OWT L418-480)
3. Implement 2D spatial-bucket dedup (replaces `rowChainUSet`)
4. Build `interiorByBand` map using `bsearchFloor` on `activeTPositions` (C6 fix)
5. **Exclude** 2D companions from `rowChainVerts` map (C1 fix — add `if (cv.t !== undefined) continue`)
6. Update vertex buffer T-position: `cv.t ?? activeTPositions[cv.rowIdx]` (OWT L511)
7. Add `interiorVerts: StripVertex[]` parameter to `triangulateChainStrip` (CST L85)
8. In `cdtTriangulateStrip`, add interior vertices with assert-not-fallback (C5 fix)
9. Continuous `buildRings` via `RING_CONFIG` table (C4 fix)

### Phase 3: Future Work (Not Designed)
- Per-strip dead zones (if needed)
- Anisotropic chain-aligned strips (user R2)
- Chain-to-grid density gradient profiling (user R3 — partially addressed by concentric rings)

---

## Convergence Assessment

All six Verifier critiques accepted. No contested points. The design is strengthened:

| Dimension | Original Proposal | After Verifier Fixes |
|-----------|-------------------|---------------------|
| Double-inclusion risk | Present (bug) | Eliminated (C1 filter) |
| Dead zone safety | Would reintroduce catastrophic bug | Withdrawn, pipeline works without it |
| Dedup reliability | 1D only, latent CDT failures | 2D spatial hash, O(1) proximity |
| Density UX | 5 dead-zone values in slider | Monotonic growth, every step matters |
| Error visibility | Silent midpoint fallback | Assert + sweep recovery |
| Companion coverage | 50% lost (negative dt) | 100% bucketed by T-position |

**This design is ready for Executioner implementation.**

---

*Generator out. Clean sweep — Verifier was right on all counts. The double-inclusion (C1) would have been a show-stopping CDT bug, and the dead zone resurrection (C2) would have re-broken the CDF. Good catches. Design is converged.*
