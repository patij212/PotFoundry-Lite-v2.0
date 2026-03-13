# Generator Round 25 — Chain Strip Companion Coverage Gaps

Date: 2026-03-06

## Problem Statement

50.4% of chain strip triangles violate the 4:1 aspect ratio target. The user observed that **all the slivers are caused by purely horizontal lines running from the base mesh (grid boundary vertices) to the feature edges (chain constraint paths)**. R24.1 (independent CDT normalization) made things worse and was reverted. The problem is structural: companions are clustered near chain vertices, leaving wide companion-free gaps in the CDT bands.

## Root Cause Analysis

### The T-Ring Shell Cutoff (Primary Cause)

In `emitUGradedFan()` ([OuterWallTessellator.ts, line 717](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L717)):

```typescript
for (let s = 0; s < Math.min(3, nShells); s++) {
```

The near-chain T-ring emits companions at T-fractions [0.25, 0.50, 0.75] but **only at the first 3 of 7 shells** (fractions 0.04, 0.09, 0.16). Since SHELL_FRACTIONS represent fractions of the strip half-width:

| Shell | Fraction | U-offset (cols from chain) | T-ring? | Main loop nT |
|-------|----------|---------------------------|---------|-------------|
| 0     | 0.04     | ~0.16 columns             | YES (3 T-levels) | 4 |
| 1     | 0.09     | ~0.36 columns             | YES (3 T-levels) | 3 |
| 2     | 0.16     | ~0.64 columns             | YES (3 T-levels) | 2 |
| 3     | 0.25     | ~1.00 columns             | **NO** | 2 |
| 4     | 0.45     | ~1.79 columns             | **NO** | 1 |
| 5     | 0.72     | ~2.86 columns             | **NO** | 1 |
| 6     | 1.00     | ~4.00 columns (strip edge)| **NO** | 1 |

**Shells 3-6 only get main-loop companions.** The main loop at outer shells places just 1 companion (at T≈0.5). This creates a **density cliff** at ~0.64 columns from the chain vertex:

- **Within 0.64 columns**: 3 T-levels (0.25, 0.50, 0.75) → well-resolved triangles
- **Beyond 0.64 columns**: 1 T-level (0.50 only) → abrupt transition zone

### The Transition Zone Geometry

Consider a CDT segment for a chain at column `c` with expansion=4. The segment spans 9 columns [c-4, c+4]. In CDT normalized space (uniform scaling: scale = uRange ≈ 0.013):

```
CDT-U:    0    0.11   0.22   0.33  0.44  0.55  0.66  0.77  0.88  1.0
          |-----|------|------|-----|-----|-----|-----|-----|-----|
          c-4   c-3    c-2    c-1   c    c+1   c+2   c+3   c+4
CDT-T:                                                           
1.0  ═══  G     ·      G      ·    G     ·     G      ·     G    (top boundary)
0.75      ·     ·      c      ·    ·     ·     ·      ·     ·    (T-ring zone only)
0.50      ·     ·      c      c    c     c     c      c     ·    (everywhere)
0.25      ·     ·      c      ·    ·     ·     ·      ·     ·    (T-ring zone only)
0.0  ═══  G     ·      G      ·   C/G    ·     G      ·     G    (bot boundary)
```

Where G = grid boundary vertex, C = chain vertex, c = companion, · = empty.

The CDT connects the T=0.25 companion near column c-2 to the nearest grid boundary vertex at column c-3 (or c-4). This edge is **nearly horizontal**: ΔU ≈ 0.11-0.22 in CDT space, ΔT ≈ 0.044. Aspect ≈ 2.5-5:1.

Even worse: a triangle might connect a T=0.75 companion (near c-2) to a grid boundary vertex at the top boundary (c-3, T=1.0). That's ΔU ≈ 0.11, ΔT ≈ 0.044 → nearly horizontal.

### Key Dimensions (Corroborated from code)
- Grid: 685 U × 432 T
- Band height (tGap): ~1/432 ≈ 0.0023 (T-units)
- Grid cell width: ~1/685 ≈ 0.0015 (U-units)
- CDT segment width: ~9 columns ≈ 0.013 (U-units)
- CDT scale: max(0.013, 0.0023) = 0.013
- Band height in CDT space: 0.0023/0.013 ≈ 0.176
- T-ring coverage: 0.64 columns / 4 columns = **16% of strip half-width**
- Main shell T=0.5 only: remaining **84% of strip half-width**
- MAX_BOUNDARY_EDGE_U = 2.0/numU ≈ 0.0029 → ~1 grid boundary vertex kept every 2 columns
- MAX_TRING_PER_BAND = 24, MAX_FAN_PER_BAND = 40

## Proposals

### Proposal 1: Extended T-Ring Coverage (Conservative)

**Idea**: Remove the shell cutoff in the near-chain T-ring so all 7 shells get 3 T-levels (0.25, 0.50, 0.75), not just the inner 3 shells.

**Mechanism**: Change one expression in `emitUGradedFan()`:

```typescript
// BEFORE (OuterWallTessellator.ts, line 717):
for (let s = 0; s < Math.min(3, nShells); s++) {

// AFTER:
for (let s = 0; s < nShells; s++) {
```

And increase the budget cap:
```typescript
// BEFORE (line 585):
const MAX_TRING_PER_BAND = 24;

// AFTER:
const MAX_TRING_PER_BAND = 48;
```

**Mathematical basis**: The density cliff occurs at shell-2/shell-3 boundary (0.64 columns from chain). With the extended T-ring, every shell position gets T=0.25, 0.50, 0.75 companions. The CDT now has interior vertices at 3 T-levels across the FULL strip width, not just the center 16%. Every grid boundary vertex within 1 shell-spacing has a non-horizontal interior point to connect to.

**Files affected**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts), lines 585 and 717.

**Companion count impact**:
- Current T-ring: 3 shells × 3 T-fracs × 2 sides = 18 per band (capped at 24)
- Proposed T-ring: 7 shells × 3 T-fracs × 2 sides = 42 per band (capped at 48)
- Per chain vertex: 2 bands (above + below) → max 96 T-ring companions (was 48)
- With ~800 chain vertices → theoretical +38K companions (before dedup)
- After dedup + constraint guard: probably +15-25K actual companions
- Total: ~333K (up from ~308K) — **~8% increase**

**Trade-offs**:
- (+) Minimal code change — 2 lines
- (+) Directly addresses the shell cutoff cliff
- (+) Preserves the U-grading structure (companions at mathematically placed positions)
- (-) Still chain-vertex-centric — gaps between chain vertices in multi-chain bands are not addressed
- (-) Budget doubling may cause over-dense packing near chains and constraint guard rejections

**Assumptions (for Verifier to attack)**:
1. The T-ring shell cutoff at 3 is the primary cause of the density cliff
2. Extending T-ring to all shells won't create constraint guard conflicts with the main shell loop companions at the same positions
3. 48 is a sufficient cap; the 42 theoretical maximum won't be uniformly reached due to dedup
4. The main shell loop companions at T≈0.5 won't collide with the T-ring companions at T=0.50 (dedup should handle this)

---

### Proposal 2: Band-Wide Gap-Fill Companions (Moderate) — **RECOMMENDED**

**Idea**: After all chain-vertex-centric companion emission, scan each CDT band for U-intervals that have no interior companions. Fill gaps with evenly-spaced midline companions at T=0.33 and T=0.67. This is **gap-driven**, not chain-vertex-driven — it guarantees coverage regardless of chain vertex placement.

**Mechanism**: Add a new function `emitGapFillCompanions()` called after the main companion loop (after [line 825](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L825)):

```typescript
/** Fill companion-free U-gaps in each band with midline interior points. */
function emitGapFillCompanions(): void {
    const FILL_GAP_THRESHOLD = 3.0 / numU;  // ~3 grid cells ≈ 0.0044 U-units
    const FILL_T_FRACTIONS = [0.33, 0.67];

    for (let bandIdx = 0; bandIdx < numT - 1; bandIdx++) {
        const tLo = activeTPositions[bandIdx];
        const tHi = activeTPositions[bandIdx + 1];
        const tGap = tHi - tLo;
        if (tGap < MIN_TGAP_FOR_COMPANIONS) continue;

        // Collect U-positions of existing interior companions in this band
        const bandCompanions = interiorByBand.get(bandIdx);
        if (!bandCompanions || bandCompanions.length === 0) continue; // no CDT here

        const companionUs = bandCompanions.map(c => c.u).sort((a, b) => a - b);

        // Also include boundary U-extents (strip boundaries)
        // Use the first and last companion U as proxy for CDT strip extent
        const stripLeft = companionUs[0];
        const stripRight = companionUs[companionUs.length - 1];

        // Scan for gaps between consecutive companion U-positions
        for (let k = 0; k < companionUs.length - 1; k++) {
            const gapLeft = companionUs[k];
            const gapRight = companionUs[k + 1];
            const gapWidth = gapRight - gapLeft;

            if (gapWidth < FILL_GAP_THRESHOLD) continue;

            // Fill the gap with evenly spaced midline companions
            const nFill = Math.max(1, Math.floor(gapWidth / FILL_GAP_THRESHOLD));
            for (let f = 1; f <= nFill; f++) {
                const fillU = gapLeft + f / (nFill + 1) * gapWidth;
                for (const tFrac of FILL_T_FRACTIONS) {
                    const fillT = tLo + tFrac * tGap;
                    if (!isNearConstraintEdge(fillU, fillT, bandIdx)) {
                        // Create a synthetic parent (closest chain vertex)
                        const parentCV = bandCompanions[0]; // any chain vertex in band
                        tryEmitCompanion(fillU, fillT, parentCV);
                    }
                }
            }
        }
    }
}
```

Call it after the main companion loop and before `interiorByBand` is built:

```typescript
// After line 825 (main companion loop end), before line 831 (interiorByBand):
emitGapFillCompanions();

// Then rebuild allChainVertices to include gap-fill companions
const allChainVertices = [...chainVertices, ...companionVertices];
```

**WAIT — there's a sequencing problem.** The `interiorByBand` map is built AFTER companion generation. But the gap-fill function needs to know WHERE companions already exist. Currently, `interiorByBand` is built at line 831. The gap-fill function needs the interiorByBand to scan for gaps, but interiorByBand is built after all companions are generated.

**Revised mechanism**: Build `interiorByBand` in two passes:
1. First pass (after main companion loop): build preliminary `interiorByBand`
2. Run `emitGapFillCompanions()` using the preliminary map
3. Second pass: rebuild `interiorByBand` to include gap-fill companions

Or simpler: the gap-fill function builds its own U-position list from `companionVertices` directly, without needing `interiorByBand`. Each companion has a `t` field and a parent chain vertex's `rowIdx`. We can bucket by band index on the fly.

**Revised implementation**:
```typescript
function emitGapFillCompanions(): void {
    const FILL_GAP_THRESHOLD = 3.0 / numU;
    const FILL_T_FRACTIONS = [0.33, 0.67];

    // Bucket existing companions by band
    const compByBand = new Map<number, number[]>(); // bandIdx → sorted U-positions
    for (const cv of companionVertices) {
        if (cv.t === undefined) continue;
        const bandIdx = bsearchFloor(activeTPositions, cv.t);
        if (bandIdx < 0 || bandIdx >= numT - 1) continue;
        if (cv.t <= activeTPositions[bandIdx] || cv.t >= activeTPositions[bandIdx + 1]) continue;
        let list = compByBand.get(bandIdx);
        if (!list) { list = []; compByBand.set(bandIdx, list); }
        list.push(cv.u);
    }

    let gapFillCount = 0;

    for (const [bandIdx, uList] of compByBand) {
        uList.sort((a, b) => a - b);
        const tLo = activeTPositions[bandIdx];
        const tHi = activeTPositions[bandIdx + 1];
        const tGap = tHi - tLo;
        if (tGap < MIN_TGAP_FOR_COMPANIONS) continue;

        // Scan for U-gaps
        for (let k = 0; k < uList.length - 1; k++) {
            const gapWidth = uList[k + 1] - uList[k];
            if (gapWidth < FILL_GAP_THRESHOLD) continue;

            const nFill = Math.max(1, Math.ceil(gapWidth / FILL_GAP_THRESHOLD) - 1);
            for (let f = 1; f <= nFill; f++) {
                const fillU = uList[k] + f / (nFill + 1) * gapWidth;
                for (const tFrac of FILL_T_FRACTIONS) {
                    const fillT = tLo + tFrac * tGap;
                    if (!isNearConstraintEdge(fillU, fillT, bandIdx)) {
                        // Use first chain vertex in this band as parent
                        const parentCV = chainVertices.find(
                            cv => cv.rowIdx === bandIdx || cv.rowIdx === bandIdx + 1
                        ) ?? chainVertices[0];
                        tryEmitCompanion(fillU, fillT, parentCV);
                        gapFillCount++;
                    }
                }
            }
        }
    }

    if (gapFillCount > 0) {
        console.log(`[CDT] Gap-fill companions: ${gapFillCount} emitted`);
    }
}
```

**Mathematical basis**: In companion-free gaps, the CDT creates triangles spanning the full band height with only boundary vertices. By inserting companions at T=0.33 and T=0.67 at regular U-intervals within gaps, every triangle is guaranteed to have an interior vertex within ~1.5 grid cells in U. The CDT subdivides the band into 3 horizontal strata (0-0.33, 0.33-0.67, 0.67-1.0) rather than a single full-height pass. Each stratum triangle has aspect ≤ 1.5 × (3:1) / 3 ≈ 1.5:1 in the worst case.

**Why T=0.33 and T=0.67 instead of T=0.25/0.50/0.75**: Three T-levels would create 4 strata with the outermost two very thin (0-0.25 and 0.75-1.0), causing a new sliver class. Two T-levels at 1/3 and 2/3 create 3 equal strata, uniformly reducing aspect ratios.

**Files affected**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts) — new function ~35 lines, called at line ~828.

**Companion count impact**:
- Average CDT band: 9 columns wide, companions at shells cover ~16 U-positions
- Typical gap: 3-5 grid cells = 0.0044-0.0073 U-units
- Fills per gap: 1-2 positions × 2 T-fractions = 2-4 companions
- Estimated gaps per band: 2-4
- Per band: ~8-16 gap-fill companions
- Across ~432 bands × (fraction with chains): ~150-200 bands × 12 = +1.8K-2.4K
- Total: ~310K (up from ~308K) — **<1% increase**

**Trade-offs**:
- (+) Directly addresses the root cause: companion-free gaps
- (+) Gap-driven, not chain-centric — works regardless of chain layout
- (+) Minimal companion count increase (<1%)
- (+) T=0.33/0.67 creates equal strata (better than 0.25/0.75 which creates thin outer bands)
- (-) Adds a second pass over companion data (minor cost)
- (-) Parent chain vertex attribution is approximate (shouldn't matter for vertex generation)
- (-) Doesn't cover bands that have NO companions at all (those bands use simple quads, not CDT)

**Assumptions (for Verifier to attack)**:
1. Companions at T=0.33 and T=0.67 create better strata than T=0.25 and T=0.75
2. FILL_GAP_THRESHOLD = 3.0/numU is the right threshold (not too aggressive, not too sparse)
3. The gap-fill companions will actually be collected in `interiorByBand` (they have explicit `t` and `rowIdx` from the parent)
4. The `tryEmitCompanion` parent attribution doesn't affect CDT behavior (only used for `chainId`)
5. The gap scan correctly identifies all major gaps (doesn't miss gaps at band boundaries)

---

### Proposal 3: Boundary-Vertex-Seeded Interior Points (Moderate-Aggressive)

**Idea**: For every grid boundary vertex retained in the CDT strip (after R22.1 thinning), check if it has a nearby interior companion within 1.5× MAX_BOUNDARY_EDGE_U in U-space. If not, emit a companion at the same U-position at T=0.5.

This directly addresses the user observation: **every base mesh vertex gets a guaranteed non-horizontal interior connection**.

**Mechanism**: Insert after the strip boundary building (after [line ~1400](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1400)), before the CDT call:

```typescript
// For each grid boundary vertex without a nearby companion, seed a midline companion
const SEED_SEARCH_RADIUS = 1.5 * MAX_BOUNDARY_EDGE_U;
const tMid = tBot + 0.5 * tGap;
const bandInterior = interiorByBand.get(j) ?? [];

for (const sv of [...stripBot, ...stripTop]) {
    if (sv.isChain) continue; // chain vertices are features, not "base mesh"
    // Check if any interior companion is within search radius in U
    const hasNearby = bandInterior.some(
        iv => Math.abs(iv.u - sv.u) < SEED_SEARCH_RADIUS
    );
    if (!hasNearby) {
        // Emit a midline companion directly into stripInteriorVerts
        const seedIdx = nextVertexIdx++;
        const seedT = tMid;
        stripInteriorVerts.push({
            idx: seedIdx,
            u: sv.u,
            isChain: false,
            gridCol: sv.gridCol,
            promotedT: seedT,
        });
        // Also register the vertex position
        vertices[seedIdx * 3] = sv.u;
        vertices[seedIdx * 3 + 1] = seedT;
        vertices[seedIdx * 3 + 2] = surfaceId;
    }
}
```

**Mathematical basis**: A grid boundary vertex at (u, T=0) with a companion at (u, T=0.5) creates two triangles: one in the bottom half-band (T=0 to 0.5), one in the top half (T=0.5 to T=1). Each has half the T-span → aspect ratio halved. The CDT will connect the boundary vertex to its seeded companion vertically rather than diagonally to a distant chain companion.

**Files affected**: [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts), within the CDT strip building loop (~line 1400).

**Companion count impact**:
- Per CDT segment: ~5 boundary vertices × 2 boundaries = 10 boundary vertices
- ~50% may already have nearby companions → 5 new seeds per segment
- ~150-200 CDT segments × 5 = +750-1000 companions
- Total: ~309K — **negligible increase**

**Trade-offs**:
- (+) Most precisely targeted — every boundary vertex gets coverage
- (+) Negligible companion count increase
- (+) Directly prevents the "horizontal line to feature edge" pathology
- (-) Complex: requires modifying the per-segment CDT building loop, which already has delicate indexing
- (-) Vertex buffer pre-allocation: the vertex buffer is sized before strips are processed; dynamically adding vertices requires either pre-counting or buffer expansion
- (-) Late-stage seeding bypasses the spatial dedup, constraint guard, and seam guard systems
- (-) May create T-junctions if the seeded companion isn't shared between adjacent bands

**Assumptions (for Verifier to attack)**:
1. The vertex buffer can accommodate dynamically added vertices (needs pre-scanning to count)
2. Seeded companions at the same U as a boundary vertex won't create degenerate triangles
3. The linear scan `bandInterior.some(...)` is acceptable (could be slow for large interior sets)
4. Adjacent bands at the same row will both get seeds at the same U-positions (no T-junction risk)
5. Late-stage seeding (after companion generation, during CDT building) won't miss the `interiorByBand` collection

---

### Proposal 4: Combined Approach — Proposals 1 + 2 (Comprehensive)

**Idea**: Apply both the T-ring extension (P1) and the gap-fill pass (P2) together. P1 smooths the density cliff within each chain vertex's companion cloud. P2 catches any remaining gaps between clusters.

**Mechanism**: Both changes from P1 and P2 applied together.

**Mathematical basis**: P1 eliminates the sharp density cliff at shell 3. P2 provides a safety net for any remaining gaps. The combination guarantees both **smooth density gradients within clusters** and **minimum density everywhere**.

**Companion count impact**: +15-25K (P1) + 1.8-2.4K (P2) = +17-27K total. Approximately 335K total companions — **~9% increase**.

**Trade-offs**:
- (+) Most thorough coverage — addresses both the cliff and the gaps
- (+) Redundancy between P1 and P2 means dedup catches overlaps efficiently
- (-) Slightly higher companion count than either alone
- (-) Two changes increase testing surface

**Assumptions**: Union of P1 and P2 assumptions.

---

## Recommended Approach

**Proposal 2 (Band-Wide Gap-Fill)** as the primary fix, with **Proposal 1 (Extended T-Ring)** as a secondary improvement.

**Reasoning**:
1. P2 directly addresses the root cause (companion-free gaps) without changing the existing companion strategy
2. P2's companion count impact is negligible (<1%), minimizing performance risk
3. P2 is gap-driven, so it self-adapts to any chain layout — no hardcoded shell counts
4. P1 is a simple 2-line change that smooths the density cliff independently
5. Together (P4), they provide comprehensive coverage with ~9% companion increase

**Implementation order**: P2 first (gap-fill), measure metrics. If violations still above 25%, add P1 (extended T-ring).

## Open Questions

1. **interiorByBand sequencing**: The gap-fill function runs after companion emission but before `interiorByBand` is built. The gap-fill companions need explicit `t` positions to be collected by `interiorByBand`. Does the current `tryEmitCompanion` set `cv.t` correctly? (I believe so — the companion is pushed with the parent's `rowIdx` and the `tryEmitCompanion` doesn't set `t` — it's set by the caller via `ct`. Need to verify that `emitGapFillCompanions` companions get `t` set.)

    **Examining `tryEmitCompanion`** ([line 638](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L638)):
    ```typescript
    companionVertices.push({
        u: cu,
        t: ct,          // ← YES, explicit t is set
        rowIdx: parent.rowIdx,
        vertexIdx: nextVertexIdx++,
        chainId: parent.chainId,
        pointIdx: -1,
    });
    ```
    **Answer**: Yes, `t: ct` is set. The `interiorByBand` collection checks `cv.t !== undefined`, so gap-fill companions WILL be collected. ✓

2. **Parent rowIdx**: The gap-fill function uses the parent chain vertex's `rowIdx`. For the `interiorByBand` bucketing, what matters is `bsearchFloor(activeTPositions, cv.t)`, not `cv.rowIdx`. Since the gap-fill companion's `t` is within the band (tLo < t < tHi), it will be bucketed correctly regardless of `rowIdx`. Needs Verifier confirmation.

3. **Strip boundary coverage**: The gap scan only finds gaps between existing companions. What about the gap between the leftmost companion and the left strip boundary? Or between the rightmost companion and the right strip boundary? Need to extend the gap scan to include the strip boundary U-positions. This requires knowing the strip boundaries during gap-fill, which the current function doesn't have (strip boundaries are computed during CDT segment building, not during companion emission). **This is a potential gap in P2 — needs Verifier scrutiny.**

4. **Multiple chain vertices per band**: When multiple chains pass through the same band, their companion clouds may overlap or leave gaps between them. P2 handles this naturally (gap scan is global across the band). P1 doesn't address inter-chain gaps because it's per-chain-vertex.

5. **Simple quad bands**: Bands with no chains get no CDT and no companions. These bands use simple 2-triangle quad cells. Are these contributing to the 50.4% violation rate? If so, they are NOT addressed by any proposal. But the problem statement says "chain strip triangles" specifically, so they should not be counted.

6. **Budget interaction**: With P1, the T-ring budget doubles to 48. The main shell loop emits companions at the same shell positions. When the T-ring emits at shell 3, T=0.50 and the main loop also emits at shell 3, T=0.50, the dedup catches the collision. But the T-ring burns budget before the main loop runs (T-ring emits FIRST per Verifier C1 priority). This may cause the main loop to be budget-starved at outer shells. **Needs Verifier analysis.**
