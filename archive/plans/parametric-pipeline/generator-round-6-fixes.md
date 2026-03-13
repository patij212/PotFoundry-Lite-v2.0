# Generator Round 6 — T-Ladder Collinearity Fix + Companion Count Cap
Date: 2026-03-04

## Problem Statement

The Round 5 T-Ladder implementation produces catastrophic results at density=12:
- 651K companions (2.8× grid vertex count) flood CDT strips
- 488 missing chain edges (WORSE than the 196 before the fix)
- maxAspect UV = 30M:1, 431K inverted triangles
- 85-second build time

Two bugs are entangled: (A) companion count explosion and (B) companions splitting
chain constraint edges. Bug B is the deeper issue — it explains why more companions
produce MORE missing edges, not fewer.

## Root Cause Analysis

### RC-B: The Collinearity Trap (The Real Bug)

This is the crucial geometric insight the Verifier identified. Consider a chain edge
from vertex A at row j to vertex B at row j+1:

```
A = (uA, tJ)          ← chain vertex at row j
B = (uB, tJ+1)        ← chain vertex at row j+1
```

Because chains track slowly-moving features, `uA ≈ uB` (typically |uA - uB| < 0.001).

The constraint edge A→B in UV space is a nearly-vertical line segment from `(uA, tJ)`
to `(uB, tJ+1)`.

The current T-Ladder places a **center companion** at:
```
C = (uA, tMid)        ← where tMid = tJ + k/(nTLevels+1) * (tJ+1 - tJ)
```

The point C lies at U = uA, T = tMid. The constraint edge A→B passes through:
```
P(s) = (uA + s*(uB - uA), tJ + s*(tJ+1 - tJ))
```
At the T-level where `s = k/(nTLevels+1)`:
```
P = (uA + k/(nTLevels+1) * (uB - uA), tMid)
```

The U-offset between C and P at this T-level is:
```
|uA - P_u| = |k/(nTLevels+1) * (uB - uA)| ≈ 0.0003 (for typical chain du)
```

This is **below the CDT's numerical tolerance** for collinearity detection. The CDT
interprets C as lying ON the constraint edge A→B and splits it into two sub-edges:
A→C and C→B. The edge verification then checks for the direct edge (A, B) which no
longer exists in the mesh — it became two edges through the companion.

**This is why more companions = more missing edges.** Every T-level adds another
companion that splits another constraint edge.

Reference: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) L438-450, the `emitRungs()` function places center companions at `tryEmitCompanion(cv.u, tLevel, cv)` — literally at the chain vertex's own U-position.

### RC-A: Companion Count Explosion

At density=12: `nTLevels=6`, `nUSpread=4`.
Per chain vertex per band: `6 T-levels × (1 center + 2×4 spread) = 54 companions`.
Two bands (above + below): `108 companions per chain vertex`.
With ~6600 chain vertices (including micro-row interpolations): `711K pre-dedup`.

Dedup only kills 8.5% because adjacent chain vertices generate companions at slightly
different U-positions — all above the `1e-5` dedup threshold.

Reference: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) L404-405 for the nTLevels/nUSpread scaling formulas.

### RC-C: Micro-Row Amplification

87 micro-rows produce chain vertices with T-gaps of ~0.0001. The T-Ladder dutifully
generates companions in these vanishing bands, creating microscopic companion clusters
that contribute nothing to mesh quality but consume CDT budget.

No `tGap` minimum guard exists in the current code — the only check is `tGap > 1e-9`
at [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) L462-463.

---

## Proposals

### Proposal 1: Lateral Fence (Conservative) — RECOMMENDED

**Idea**: Eliminate center companions entirely. Only place companions at U-offsets that
guarantee a minimum clearance from ALL constraint edge paths connected to this chain
vertex. Cap companion counts aggressively.

**Mechanism**:

1. **Kill the center companion.** The call `tryEmitCompanion(cv.u, tLevel, cv)` at
   L445 is the root cause of Bug B. Remove it entirely. Companions are placed ONLY
   at lateral U-offsets.

2. **Minimum lateral clearance.** For each chain vertex at (uCV, tRow), the constraint
   edges emanating from it go to (uPrev, tRow-1) and (uNext, tRow+1). At any
   intermediate T-level in the band above, the constraint edge passes through:
   ```
   uEdge(t) = uCV + (t - tRow)/(tRow+1 - tRow) * (uNext - uCV)
   ```
   The companion at lateral offset `uOff` from `uCV` is at `uCV ± uOff`. The distance
   from the constraint at this T-level is approximately `|uOff - (uNext - uCV) * frac|`.
   
   Set `MIN_LATERAL_CLEARANCE = 0.002` (2× the typical chain du). The minimum U-offset
   for any companion must satisfy:
   ```
   uOff ≥ MIN_LATERAL_CLEARANCE
   ```
   This is simple, cheap, and guarantees companions can never be collinear with
   constraint edges.

3. **Hard companion caps:**
   ```
   nTLevels = min(2, floor(density / 4))     // density=12 → 2 T-levels (was 6)
   nUSpread = min(2, floor(density / 3))      // density=12 → 2 U-spreads (was 4)
   ```
   Per chain vertex per band: `2 T-levels × (2×2 spread) = 8 companions` (no center).
   Two bands: **16 companions per chain vertex** (was 108). Cap at 20.

4. **Micro-row T-gap guard:**
   ```
   const MIN_TGAP_FOR_COMPANIONS = 0.001;
   if (tGap < MIN_TGAP_FOR_COMPANIONS) return;  // skip this band entirely
   ```

5. **Lateral offset sizing.** Use the T-gap-proportional spread but enforce the
   minimum clearance:
   ```
   const spreadU = Math.max(tGap * ASPECT_MATCH_FACTOR, MIN_LATERAL_CLEARANCE);
   const uOff = spreadU * m / nUSpread;     // m = 1..nUSpread
   ```
   This ensures even the innermost lateral companion (m=1) is at least
   `MIN_LATERAL_CLEARANCE / nUSpread = 0.001` from the chain vertex U-position,
   still well clear of the constraint edge.

**Expected counts at density=12:**
- Per chain vertex: 16 companions (was 108)
- ~4854 chain vertices × 16 = ~78K pre-dedup
- After dedup (adjacent chains share lateral positions): ~40-50K
- Per CDT strip: ~8-10 interior vertices (was 116)

**Files affected:**
- `OuterWallTessellator.ts` L400-465 (companion config + emitRungs rewrite)

**Trade-offs:**
- (+) Directly eliminates the collinearity bug — no companion can land on a constraint edge
- (+) 6.8× fewer companions → proportional CDT speedup
- (+) Simple code change — modify `emitRungs()`, remove center companion line, adjust caps
- (-) Slightly less T-density directly at the chain feature (no center companion)
- (-) MIN_LATERAL_CLEARANCE is a heuristic; extremely steep spirals where uA and uB
      differ by > 0.002 would need the guard zone approach (Proposal 3)

**Assumptions (for Verifier to attack):**
1. Removing the center companion does not create a mesh quality gap along the chain
   feature itself, because the chain vertices at row boundaries already fully define
   the feature geometry — companions are only needed to break slivers in the GAPS.
2. `MIN_LATERAL_CLEARANCE = 0.002` is sufficient for all chain geometries. The maximum
   observed |uA - uB| in the diagnostic data is ~0.001 (col 23-35 examples show
   du ≈ 0.00009). A 0.002 clearance provides 2× margin.
3. 16 companions per chain vertex is sufficient for quality at density=12. The
   T-Ladder's purpose is to break slivers, not to create a smooth field — 2 T-levels
   with 4 lateral points per level should be adequate.
4. Micro-rows with tGap < 0.001 contribute negligible band area and don't need
   companions for sliver prevention.

---

### Proposal 2: Between-Chain Mid-Gap Seeding (Moderate)

**Idea**: Instead of placing companions around EACH chain vertex, compute the midpoint
between adjacent chains in U-space and place companions there. This addresses the
actual mesh quality deficit (gaps between chains) without any risk of constraint
interference.

**Mechanism**:

1. For each row band [j, j+1], identify all chain vertices at row j sorted by U.
2. Between each consecutive pair of chain vertices (chainA, chainB), compute
   `uMid = (chainA.u + chainB.u) / 2`.
3. Place companions at `(uMid, tLevel)` for 1-2 intermediate T-levels.
4. Also place companions between the leftmost chain vertex and the nearest grid
   column to the left, and similarly for the rightmost.

**Expected counts:**
- Typically 4-8 chains → 3-7 mid-gaps per row
- 2 T-levels per gap = 6-14 companions per row band
- ~400 row bands × ~10 = ~4,000 companions total (60× fewer than current)

**Files affected:**
- `OuterWallTessellator.ts` L395-540 (full companion generation rewrite)

**Trade-offs:**
- (+) Companions are geometrically guaranteed to be far from constraint edges
- (+) Dramatically fewer companions (~4K vs 651K)
- (+) Directly addresses the actual problem: gaps between chains create slivers
- (-) Requires computing chain geometry at each row band (minor complexity)
- (-) Doesn't add T-density around the chain feature itself — only between chains
- (-) If chains are closely spaced, mid-gap companions may be too close to both
      chains' constraint edges simultaneously

**Assumptions (for Verifier to attack):**
1. The primary sliver problem occurs BETWEEN chains, not AT chains. Chain vertices
   at row boundaries create the feature edges; slivers form in the triangulation
   of the empty space between features.
2. 4K companions is sufficient for quality. This is a 160× reduction.
3. Mid-gap U-positions are always far enough from both adjacent chain constraint
   edges. For chains separated by du > 0.01, midpoint clearance is > 0.005. For
   very close chains (du < 0.004), companions might be within 0.002 of a constraint.

---

### Proposal 3: Constraint-Edge Guard Zone (Thorough)

**Idea**: Build a lookup structure of all chain constraint edges in UV space. Before
emitting any companion, compute its minimum distance to the nearest constraint edge
segment. Reject companions within a guard zone radius.

**Mechanism**:

1. After chainEdges are built (L382), construct a spatial index of constraint edge
   segments in UV space: `Array<{u0, t0, u1, t1}>`.
2. For each candidate companion at `(cu, ct)`, compute the point-to-segment distance
   to all constraint edges in the same row band.
3. Reject if distance < `CONSTRAINT_GUARD_RADIUS = 0.001`.

**Point-to-segment distance** (standard algorithm):
```
function distToSegment(px, py, ax, ay, bx, by): number {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx*dx + dy*dy;
    if (len2 < 1e-20) return Math.sqrt((px-ax)**2 + (py-ay)**2);
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
    const projX = ax + t*dx, projY = ay + t*dy;
    return Math.sqrt((px-projX)**2 + (py-projY)**2);
}
```

4. Per band, only constraint edges in that band need checking. With ~20 chains,
   that's ~20 edges per band — cheap.

**Files affected:**
- `OuterWallTessellator.ts` L395-540 (add guard zone to tryEmitCompanion)

**Trade-offs:**
- (+) Most general solution — works for any chain geometry including spirals
- (+) Can be combined with Proposal 1 as a belt-and-suspenders approach
- (+) Mathematically rigorous — no heuristic clearance values
- (-) More code complexity than Proposal 1
- (-) Requires building a constraint edge index (minor performance cost)
- (-) Doesn't reduce companion count — only prevents the collinearity bug

**Assumptions (for Verifier to attack):**
1. Point-to-segment distance at `0.001` is sufficient to prevent CDT from treating
   the companion as collinear with the constraint. The CDT tolerance depends on the
   `cdt2d` library's internals, but 0.001 in normalized UV space (where strip width
   is ~0.01-0.05) should provide ample clearance.
2. The per-band constraint edge lookup is O(chains_per_band) per companion, which is
   cheap for typical chain counts (4-20).

---

### Proposal 4: Path-Connected Edge Verification (Defense-in-Depth)

**Idea**: Change the edge verification at L1098-1170 to accept a chain edge A→B as
"enforced" if there exists a path A→...→B through mesh edges where all intermediate
vertices lie on the same chain and are near-collinear with A→B.

**Mechanism**:

Instead of checking `meshEdgeSet.has(key(A,B))`, do:
1. Check if A→B exists directly (current behavior). If yes, enforced.
2. If not, check if there exists a vertex C such that both A→C and C→B are mesh edges,
   C is a chain vertex with the same chainId, C lies within 0.001 of segment A→B.
3. If such a path exists, count as "path-enforced" (a separate counter for diagnostics).

**This is NOT a substitute for fixing Bug B.** It's a diagnostic improvement that
prevents false-positive "missing edge" reports IF a future design intentionally allows
CDT to split constraints through companion vertices. The Verifier's requirement that
constraint edges appear as DIRECT mesh edges means this proposal only applies as a
fallback diagnostic, not as the primary fix.

**Files affected:**
- `OuterWallTessellator.ts` L1098-1170 (edge verification loop)

**Trade-offs:**
- (+) Eliminates false-positive missing edge reports for path-split constraints
- (+) Useful diagnostic: distinguishes "truly missing" from "split through intermediate"
- (-) Does NOT satisfy the Verifier's requirement for sharp constraint edges
- (-) Adds complexity to verification code
- (-) Masks a real problem if companions are still collinear

**Assumptions (for Verifier to attack):**
1. Path-connected enforcement is geometrically equivalent to direct edge enforcement
   for mesh quality. (The Verifier may well reject this assumption.)
2. The chain feature appears equally sharp whether the edge is direct or split through
   a collinear intermediate vertex.

---

## Recommended Approach

**Combine Proposals 1 + 3 + 4 (Layered Defense):**

| Layer | Role | Proposal |
|-------|------|----------|
| Primary | Eliminate center companions, cap counts | Proposal 1 |
| Guard | Reject companions near constraint paths | Proposal 3 |
| Diagnostic | Path-connected verification fallback | Proposal 4 |

**Implementation priority:**

1. **Proposal 1 first** — it's the highest-impact, lowest-complexity change. Modify
   `emitRungs()` to remove the center companion, cap nTLevels/nUSpread, add micro-row
   tGap guard, and enforce MIN_LATERAL_CLEARANCE. This alone should fix both bugs.

2. **Proposal 3 as safety net** — add the constraint edge distance check to
   `tryEmitCompanion()`. Even with center companions removed, lateral companions at
   small U-offsets could still be close to constraint edges for steep spiral chains.
   The guard zone catches these edge cases.

3. **Proposal 4 as diagnostic improvement** — implement path-connected verification
   so we can distinguish "truly missing constraint" from "constraint split through
   companion" in future diagnostics. Do NOT use this to mask Bug B.

**Why not Proposal 2?** Mid-gap seeding is elegant but requires knowing all chain
positions per row band, which couples companion generation to global chain topology.
Proposal 1 is local (per chain vertex) and simpler. However, if Proposal 1 + 3 still
produce too many companions at density=12, Proposal 2 is the escalation path — it's
the only design that guarantees O(chains × rows) companions rather than
O(chain_vertices × density).

## Expected Outcomes (Proposal 1 + 3)

| Metric | Round 5 (broken) | Expected (fixed) |
|--------|------------------|-------------------|
| Companions pre-dedup | 711,936 | ~78,000 |
| Companions after dedup | 651,624 | ~40,000 |
| Per-strip interior verts | ~116 | ~8 |
| Missing chain edges | 488 | 0 (center companion eliminated) |
| maxAspect UV | 30,177,403:1 | <100:1 |
| Build time | 85s | <15s |

## Concrete Code Sketch (for Executioner reference)

```typescript
// ── Updated companion config ──
const MAX_TLEVELS = 2;
const MAX_USPREAD = 2;
const MAX_COMPANIONS_PER_CV = 20;
const MIN_TGAP_FOR_COMPANIONS = 0.001;
const MIN_LATERAL_CLEARANCE = 0.002;   // minimum U-offset from chain vertex
const CONSTRAINT_GUARD_RADIUS = 0.001; // minimum distance from any constraint edge

const nTLevels = Math.min(MAX_TLEVELS, Math.max(1, Math.floor(density / 4)));
const nUSpread = Math.min(MAX_USPREAD, Math.max(1, Math.floor(density / 3)));

// ── Build constraint edge index for guard zone check ──
// After chainEdges are built (L382), index them by row band for fast lookup.
const constraintsByBand = new Map<number, Array<{u0: number, t0: number, u1: number, t1: number}>>();
for (const [v0Idx, v1Idx] of chainEdges) {
    const cv0 = chainVertices[v0Idx - gridVertexCount];
    const cv1 = chainVertices[v1Idx - gridVertexCount];
    if (!cv0 || !cv1) continue;
    const bandIdx = Math.min(cv0.rowIdx, cv1.rowIdx);
    const t0 = activeTPositions[cv0.rowIdx];
    const t1 = activeTPositions[cv1.rowIdx];
    let list = constraintsByBand.get(bandIdx);
    if (!list) { list = []; constraintsByBand.set(bandIdx, list); }
    list.push({ u0: cv0.u, t0, u1: cv1.u, t1 });
}

// ── Guard zone check ──
function isNearConstraintEdge(cu: number, ct: number, bandIdx: number): boolean {
    const edges = constraintsByBand.get(bandIdx);
    if (!edges) return false;
    for (const e of edges) {
        const dx = e.u1 - e.u0, dy = e.t1 - e.t0;
        const len2 = dx*dx + dy*dy;
        if (len2 < 1e-20) continue;
        const t = Math.max(0, Math.min(1, ((cu-e.u0)*dx + (ct-e.t0)*dy) / len2));
        const projU = e.u0 + t*dx, projT = e.t0 + t*dy;
        const dist = Math.sqrt((cu-projU)**2 + (ct-projT)**2);
        if (dist < CONSTRAINT_GUARD_RADIUS) return true;
    }
    return false;
}

// ── Updated emitRungs: NO center companion, enforce lateral clearance ──
function emitRungs(cv: ChainVertex, tLo: number, tGap: number, bandIdx: number): void {
    if (tGap < MIN_TGAP_FOR_COMPANIONS) return;  // micro-row guard

    const baseSpreadU = Math.max(tGap * ASPECT_MATCH_FACTOR, MIN_LATERAL_CLEARANCE);
    let emitted = 0;

    for (let k = 1; k <= nTLevels; k++) {
        const tFrac = k / (nTLevels + 1);
        const tLevel = tLo + tFrac * tGap;

        // NO center companion — would be collinear with constraint edge

        // Lateral-only U-spread companions
        for (let m = 1; m <= nUSpread; m++) {
            const uOff = baseSpreadU * m / nUSpread;
            if (uOff < MIN_LATERAL_CLEARANCE / nUSpread) continue; // enforce clearance

            for (const sign of [-1, 1]) {
                const cu = cv.u + sign * uOff;
                if (emitted >= MAX_COMPANIONS_PER_CV) return;
                if (!isNearConstraintEdge(cu, tLevel, bandIdx)) {
                    tryEmitCompanion(cu, tLevel, cv);
                    emitted++;
                }
            }
        }
    }
}
```

## Open Questions

1. **Is MIN_LATERAL_CLEARANCE = 0.002 too conservative?** For very dense chain regions
   (multiple chains within 0.01 U-range), lateral companions at ±0.002 might land
   near the ADJACENT chain's constraint edge. Proposal 3's guard zone handles this,
   but should the clearance be chain-density-adaptive?

2. **Should nTLevels ever be 0?** At density=1, `floor(1/4) = 0` → no companions at
   all. Is density=1 intended to be "grid-only, no companion enhancement"? The current
   code has `nTLevels = max(1, ...)` ensuring at least 1 T-level. Should the new
   formula preserve this minimum?

3. **Do we need companions for INTERPOLATED chain vertices (pointIdx=-1)?** These are
   synthetic vertices inserted for multi-row gap bridging. They don't represent real
   features. Skipping companion generation for pointIdx=-1 vertices would further
   reduce counts with no quality cost.

4. **Batch 6 dedup interaction.** The global dedup (QUANT=1e5) can merge a chain vertex
   with a nearby grid vertex, changing the edge endpoint. Even with Bug B fixed
   (no companion on constraint path), could Batch 6 dedup STILL cause a legitimate
   chain vertex to merge with a grid vertex in a way that breaks the constraint?
   The Verifier should check whether any of the 488 missing edges have endpoints
   that were Batch 6 remapped.

5. **Proposal 2 as future escalation.** If Proposal 1+3 reduces companions to ~40K
   but that's still too many for <20s build time at density=12, should we switch
   to Proposal 2 (between-chain mid-gap seeding) which produces ~4K companions?
   What's the quality difference?
