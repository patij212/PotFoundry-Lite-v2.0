# Generator Round 5 — T-Ladder Companion Cloud Redesign
Date: 2026-03-04

## Problem Statement

The Round 4 concentric ring companion cloud is **fundamentally incompatible** with the CDF-adaptive grid. The ring design sizes companions by `min(halfGapU, halfGapT)`, but the CDF grid's `featureFloor=0.6` guarantees dense column placement near chain features — precisely where companions live. Result: `maxR ≈ 0.0005`, ring radii of 175–450 nanometers in U-space, and catastrophic 338,449:1 aspect ratios.

The ring design assumed sparse grids near features. The CDF grid guarantees the opposite. **The design must be replaced, not patched.**

## Root Cause Analysis (Summary)

| RC# | Root Cause | Core Mechanism |
|-----|-----------|----------------|
| RC1 | maxR collapse | `min(halfGapU, halfGapT)` bottlenecked by tiny halfGapU (~0.0005) |
| RC2 | Cell bounds trap | Companions jailed within micro-cells (~0.001 wide) |
| RC3 | Asymmetric T | Rings cluster near one band boundary, not across full T-gap |
| RC4 | Seam blindness | `SEAM_EDGE_COMPANION_GUARD=0.003` kills all chain6 companions; constraint endpoints missing from CDT |
| RC5 | Strict T inequality | Rejects companions at exact band boundaries (11% loss) |
| RC6 | Design flaw | Ring geometry assumes sparse grid, but CDF grid is densest at features |

**The fundamental insight**: The grid is already solving the U-direction problem with CDF-adaptive columns. Companions are needed to solve the **T-direction** problem — chain vertices sit ON row boundaries, and the CDT creates long slivers spanning the full T-gap between rows. Companions must place Steiner points at intermediate T-positions within each band.

## Proposals

### Proposal 1: "T-Ladder" — Vertical Steiner Columns (RECOMMENDED)

**Idea**: Replace concentric rings with a **T-ladder** — a small rectangular grid of Steiner points spanning the full T-gap within each adjacent band, centered on each chain vertex's U-position. The "rungs" (horizontal companion rows at intermediate T-levels) break up the long CDT slivers that connect chain vertices at row boundaries to grid vertices at the opposite row boundary.

**Why it works**: The CDF grid already provides dense U-coverage near chain features. What's MISSING is T-coverage — there are no vertices between row T-positions. The T-Ladder fills that gap without fighting the CDF grid.

#### 1.1 Design Overview

For each chain vertex at `(u_cv, t_row_j)`:
- Place companions at **intermediate T-levels** within the band above (between `t_j` and `t_{j+1}`) and the band below (between `t_{j-1}` and `t_j`)
- At each T-level, place a small number of companions with modest **U-spread** around `u_cv`
- U-spread is sized by T-gap (NOT halfGapU)
- No cell bounds check — companions extend freely across grid cells

The resulting geometry looks like a ladder lying on its side:
```
t_{j+1}  ──── grid row ────────────────────
              ×   ×   ×     ← rung at 75% T
              ×   ×   ×     ← rung at 50% T
              ×   ×   ×     ← rung at 25% T
t_j      ──── grid row ──── C ─────────────   (C = chain vertex)
              ×   ×   ×     ← rung at 75% T (band below)
              ×   ×   ×     ← rung at 50% T
              ×   ×   ×     ← rung at 25% T
t_{j-1}  ──── grid row ────────────────────
```

Each `×` is a companion Steiner point. The CDT uses these to create well-shaped triangles instead of long slivers from the chain vertex to the opposite row.

#### 1.2 Sizing Logic

```
maxR (for T-direction):
    tGapAbove = activeTPositions[rowIdx + 1] - activeTPositions[rowIdx]
    tGapBelow = activeTPositions[rowIdx] - activeTPositions[rowIdx - 1]
    // Size is purely T-gap driven. No halfGapU dependency.

U-spread:
    spreadU = tGap * ASPECT_MATCH_FACTOR    // e.g., 0.4
    // With tGap ≈ 0.0025, spreadU ≈ 0.001
    // This extends ~1 cell on each side (grid spacing near features ≈ 0.001)
    // Creates approximately equilateral spacing in the companion neighborhood
```

**ASPECT_MATCH_FACTOR = 0.4**: Chosen so the U-spread is comparable to the T-spacing between rungs. With 2 T-levels, T-spacing between rungs ≈ tGap/3 ≈ 0.00083. U-spread = 0.001. Ratio ≈ 1.2:1 — good for CDT triangle quality.

**Key difference from Round 4**: `maxR` is **never** capped by `halfGapU`. The T-gap is typically ~0.0025 (400 rows across [0,1]), which is 5× larger than the typical near-feature halfGapU (~0.0005). Companions are appropriately sized.

#### 1.3 Placement Algorithm (Pseudocode)

```typescript
const ASPECT_MATCH_FACTOR = 0.4;   // U-spread relative to T-gap
const SEAM_COMPANION_GUARD = 1e-4; // Minimal seam guard (was 0.003)

function generateTLadderCompanions(
    chainVertices: ChainVertex[],
    activeTPositions: Float32Array,
    numT: number,
    density: number,    // chainStripConfig.densityMultiplier, clamped [1, 12]
): ChainVertex[] {
    const companions: ChainVertex[] = [];

    // T-levels per band: scale with density
    // density=1→1, density=2→1, density=3→2, density=4→2, density=6→3, density=8→4
    const nTLevels = Math.max(1, Math.min(6, Math.floor(density / 2)));

    // U-spread points per side: scale with density
    // density=1→0, density=2→1, density=3→1, density=4→1, density=6→2, density=8→2
    const nUSpread = Math.max(0, Math.min(4, Math.floor((density - 1) / 2)));

    for (const cv of chainVertices) {
        const tRow = activeTPositions[cv.rowIdx];

        // Process band above (between row j and j+1)
        if (cv.rowIdx < numT - 1) {
            const tAbove = activeTPositions[cv.rowIdx + 1];
            const tGap = tAbove - tRow;
            if (tGap > 1e-9) {
                emitRungs(cv, tRow, tAbove, tGap, nTLevels, nUSpread);
            }
        }

        // Process band below (between row j-1 and j)
        if (cv.rowIdx > 0) {
            const tBelow = activeTPositions[cv.rowIdx - 1];
            const tGap = tRow - tBelow;
            if (tGap > 1e-9) {
                emitRungs(cv, tBelow, tRow, tGap, nTLevels, nUSpread);
            }
        }
    }

    return companions;

    function emitRungs(
        cv: ChainVertex,
        tLo: number,
        tHi: number,
        tGap: number,
        nT: number,
        nU: number,
    ): void {
        const spreadU = tGap * ASPECT_MATCH_FACTOR;

        for (let k = 1; k <= nT; k++) {
            const tFrac = k / (nT + 1);  // Evenly spaced: avoid boundaries
            const tLevel = tLo + tFrac * tGap;

            // Center companion (directly below/above chain vertex)
            tryEmit(cv.u, tLevel, cv);

            // U-spread companions
            for (let m = 1; m <= nU; m++) {
                const uOff = spreadU * m / nU;
                tryEmit(cv.u - uOff, tLevel, cv);
                tryEmit(cv.u + uOff, tLevel, cv);
            }
        }
    }

    function tryEmit(cu: number, ct: number, parent: ChainVertex): void {
        // Seam guard: minimal — only reject if exactly at 0 or 1
        if (cu < SEAM_COMPANION_GUARD || cu > 1 - SEAM_COMPANION_GUARD) return;

        // NO cell bounds check — companions extend freely across cells

        // T bounds: must be strictly within [0, 1] parametric range
        if (ct <= 0 || ct >= 1) return;

        // 2D spatial dedup (using existing bucket infrastructure)
        if (isDuplicate2D(cu, ct, COMPANION_DEDUP_THRESHOLD)) return;

        companions.push({
            u: cu,
            t: ct,
            rowIdx: parent.rowIdx,
            vertexIdx: nextVertexIdx++,
            chainId: parent.chainId,
            pointIdx: -1,
        });
        addToBuckets(cu, ct);
    }
}
```

**Key properties of this algorithm**:
1. **No `halfGapU` anywhere** — sizing is purely T-gap driven (addresses RC1)
2. **No cell bounds check** — companions extend freely (addresses RC2)
3. **Full T-gap span** — rungs at 25%, 50%, 75% (density=2) or 33%, 67% (density=4) (addresses RC3)
4. **Minimal seam guard** (1e-4 vs 0.003) — chain6 at U≈0.99999 gets companions (addresses RC4, partially)
5. **No strict T-boundary inequality** — `tFrac = k/(nT+1)` avoids exact boundaries by construction (addresses RC5)
6. **Works WITH CDF grid** — adds T-density where grid provides U-density (addresses RC6)

#### 1.4 Seam Handling (RC4)

RC4 has **two sub-problems**:

**Sub-problem A: Companions for seam chains.**
The T-Ladder reduces `SEAM_COMPANION_GUARD` from 0.003 to 1e-4. Chain6 at U≈0.99999 now gets companions at U ≈ 0.99999 ± spreadU. With spreadU ≈ 0.001, some companions may land at U > 0.9999 — these are valid since they're still < 1.0 - 1e-4. Companions at U < 0.99899 are well within bounds.

**Sub-problem B: Missing constraint edges (192 cross-row edges).**
This is a **separate bug** independent of companion design. The constraint edges reference chain vertices whose global indices don't appear in the CDT's local vertex set because the strip's U-range filter (`sv.u <= uStripRight + 1e-9`) excludes them.

**Proposed fix** (complements the companion redesign):
```typescript
// In the strip construction loop (OWT ~L900-945):
// After collecting segConstraints, ensure all constraint endpoints
// are present in stripBot or stripTop.
for (const [v0, v1] of segConstraints) {
    for (const vIdx of [v0, v1]) {
        const cvIdx = vIdx - gridVertexCount;
        const cv = allChainVertices[cvIdx];
        if (!cv) continue;
        const cvU = cv.u;
        const cvT = cv.t ?? activeTPositions[cv.rowIdx];

        // Check if this vertex is already in stripBot or stripTop
        const inBot = stripBot.some(sv => sv.idx === vIdx);
        const inTop = stripTop.some(sv => sv.idx === vIdx);

        if (!inBot && !inTop) {
            // Determine which row this vertex belongs to
            if (cv.rowIdx === j) {
                // Belongs on bottom row — expand strip
                stripBot.push({ idx: vIdx, u: cvU, isChain: true, gridCol: -1 });
                stripBot.sort((a, b) => a.u - b.u);
            } else if (cv.rowIdx === j + 1) {
                stripTop.push({ idx: vIdx, u: cvU, isChain: true, gridCol: -1 });
                stripTop.sort((a, b) => a.u - b.u);
            }
            // If neither row matches, it's a cross-row edge to a non-adjacent
            // row — should have been filtered earlier; skip silently.
        }
    }
}
```

This ensures every constraint edge endpoint appears in the CDT vertex set. The CDT can then enforce the constraint, and the 192 missing edges are recovered.

**Alternative (lighter)**: Extend `uStripRight` to `max(uStripRight, maxChainU + 1e-6)` where `maxChainU` is the maximum U of any constraint endpoint in the current band. This naturally extends the strip to cover seam chains.

#### 1.5 Band Bucketing

Companions are bucketed into bands using the **existing** `bsearchFloor` mechanism on `activeTPositions`. The T-Ladder design avoids RC5 because:

1. Companion T-positions are at fractional interior positions: `tLo + k/(nT+1) * tGap`. These are **strictly interior** to the band — never at exact band boundaries.
2. No change needed to the bucketing logic: `bsearchFloor(activeTPositions, cv.t)` returns the correct band index for interior positions.
3. The existing strict inequality check (`cv.t <= activeTPositions[bandIdx] || cv.t >= activeTPositions[bandIdx + 1])`) PASSES for all T-Ladder companions because they are strictly within the band.

**Band bucketing code remains unchanged.** The T-Ladder avoids boundary issues by construction.

#### 1.6 Interaction with CDT

**CDT normalization** (ChainStripTriangulator.ts L164-172):
```typescript
const scale = Math.max(uRange, tRange);
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```

In a typical chain strip: `uRange ≈ 0.01–0.05` (spanning multiple columns), `tRange ≈ 0.0025` (one band gap). So `scale = uRange`, and T is compressed to `tRange/uRange ≈ 0.05–0.25` of the normalized space.

**T-Ladder companions in normalized space**: A companion at `(u_cv, t_mid)` where `t_mid = tLo + 0.5 * tGap` normalizes to approximately `(u_cv_norm, 0.5 * tRange/scale)`. This creates vertices at the mid-height of the normalized strip — exactly where slivers need to be broken.

**No interaction issues with constraint edges**: Companions are Steiner (free) points. They don't participate in any constraint edges. The CDT incorporates them as free points and naturally connects them to nearby vertices, breaking up slivers.

**Interior vertex flow**:

```
companionVertices (T-Ladder output)
    → interiorByBand (bucketed by T-position band)
        → stripInteriorVerts (filtered by strip U-range)
            → cdtTriangulateStrip → addVertex(sv.idx, sv.u, cv.t)
                → CDT free points
```
This flow is **identical** to the Round 4 flow. No changes needed to `ChainStripTriangulator.ts`.

#### 1.7 Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| U-spread crosses seam cell | LOW | spreadU ≈ 0.001 << seam gap; seam guard at 1e-4 |
| Companion overlaps grid vertex | LOW | Dedup threshold (1e-5) catches coincident positions |
| Too many companions at dense chain regions | MEDIUM | Spatial dedup aggressively collapses overlapping ladders from adjacent chain vertices |
| CDT performance with more Steiner points | LOW | ~3500 companions vs ~230K grid vertices — negligible overhead |
| Cross-cell companions not in strip U-range | LOW | stripExpansion already widens marked columns; companions at U ≈ u_cv ± 0.001 are well within typical strip width (0.01+) |
| interiorByBand band-edge rejection | NONE | T-Ladder uses `tFrac = k/(nT+1)`, placing companions strictly interior — never at band edges |

**Remaining edge cases**:
1. Chain vertices at row 0 or row numT-1: only one band available — half the companion count. Acceptable since these are boundary rows.
2. Very small T-gaps (< 1e-6): skipped by the `tGap > 1e-9` guard. This can happen at closely-spaced inserted rows.
3. Very large T-gaps (> 0.01): rare, but companions would be well-sized. No pathology.

#### 1.8 Estimated Companion Count

At **density=4** (the default/typical):
- `nTLevels = floor(4/2) = 2` → rungs at 33% and 67% of T-gap
- `nUSpread = floor((4-1)/2) = 1` → 1 point on each side of center
- Per rung: 1 center + 2×1 spread = 3 companions
- Per band: 2 rungs × 3 = 6 companions
- Per chain vertex: 2 bands × 6 = **12 companions** (interior vertices), or 6 for boundary rows

With ~400 chain vertices (typical for a complex style):
- Theoretical max: 400 × 12 = 4,800
- After spatial dedup (adjacent chain points on same chain share U-neighborhood): ~65-70% survival
- **Expected: ~3,000–3,500 companions after dedup**

Compare to Round 4: similar count (~46,000 pre-dedup collapsing to ~3,000 post-dedup), but these are **appropriately sized and positioned** rather than microscopic rings.

| Density | nTLevels | nUSpread | Per-CV (2 bands) | Est. Total (400 CVs, post-dedup) |
|---------|----------|----------|------------------|-----------------------------------|
| 1 | 1 | 0 | 2 | ~600 |
| 2 | 1 | 0 | 2 | ~600 |
| 3 | 1 | 1 | 6 | ~1,800 |
| 4 | 2 | 1 | 12 | ~3,500 |
| 6 | 3 | 2 | 30 | ~8,000 |
| 8 | 4 | 2 | 40 | ~10,000 |
| 12 | 6 | 4 | 108 | ~25,000 |

### Proposal 2: "Mid-T Spine" — Center-Only Vertical Column (Conservative)

**Idea**: The simplest possible fix — place companions ONLY at the center U-position of each chain vertex, at intermediate T-levels. No U-spread at all.

```
Per chain vertex at (u_cv, t_j):
    Band above: emit (u_cv, t_j + 0.33*tGap), (u_cv, t_j + 0.67*tGap)
    Band below: emit (u_cv, t_j - 0.33*tGap), (u_cv, t_j - 0.67*tGap)
```

**Trade-offs**:
- (+) Absolute minimum companion count: 4 per CV, ~1,200 total
- (+) Zero chance of cross-cell issues since U is unchanged
- (+) No sizing parameters at all
- (-) No U-spread means CDT may still create thin triangles from the spine point to nearby grid columns at the same T-level
- (-) The CDT has only isolated points at each T-level, so it can't use them to form well-shaped triangles between adjacent chain vertices

**Assessment**: This might be sufficient for density=1–3, but may underperform at higher densities where the T-Ladder's U-spread provides better triangulation. Worth considering as a fallback if T-Ladder has unexpected issues.

### Proposal 3: "T-Bridging Rows" — Insert Full Grid Rows at Mid-T (Radical)

**Idea**: Instead of per-chain-vertex companions, insert **additional grid rows** at intermediate T-positions between rows that have chain vertices. These are full rows spanning all U-columns — they provide global T-resolution and eliminate the need for per-vertex companions entirely.

**Mechanism**:
- After chain vertices are assigned to rows, identify bands that contain chain constraint edges
- For each such band, insert 1-2 additional T-positions at 33%/67% of the T-gap
- Rebuild the grid with these additional rows
- No companions needed — the grid itself resolves the T-gap

**Trade-offs**:
- (+) Eliminates companion system entirely
- (+) No complication with dedup, band bucketing, or seam handling
- (+) grid rows are naturally handled by existing tessellation
- (-) **Massively increases vertex count**: each additional row adds ~577 vertices (numU). With ~200 bands having chains, that's ~115,000 new vertices × 2 rows = ~230,000 — doubling the grid
- (-) Rows are inserted globally even though only a few columns near the chain vertex need resolution
- (-) Requires re-running evaluatePoints on all new grid vertices (GPU compute cost)
- (-) Architecture change to the grid builder — high risk

**Assessment**: Overkill. The problem is LOCAL (near chain vertices), but this solution is GLOBAL. The T-Ladder provides targeted resolution where needed.

## Recommended Approach

**Proposal 1 (T-Ladder)** is the clear winner:

1. It directly addresses the root cause — missing T-resolution near chain vertices
2. It works WITH the CDF grid instead of against it
3. It produces appropriately-sized companions (T-gap scale, not micro U-gap scale)
4. It requires minimal changes to the existing architecture (same flow: generate companions → bucket by band → inject as CDT interior vertices)
5. The companion count is controlled and grows linearly with density

Combined with the **seam constraint endpoint fix** (Section 1.4, Sub-problem B), this addresses all 6 root causes identified by the Verifier.

## Implementation Roadmap (For Executioner)

1. **Replace** the concentric ring generator (OWT L398-542) with the T-Ladder algorithm
2. **Reduce** `SEAM_EDGE_COMPANION_GUARD` from 0.003 to 1e-4
3. **Remove** the cell bounds check (OWT L516-517)
4. **Fix** seam chain constraint endpoints (Section 1.4, Sub-problem B)
5. **Keep** existing infrastructure: spatial dedup buckets, interiorByBand bucketing, stripInteriorVerts collection
6. **Keep** the C1 fix: 2D companions (cv.t !== undefined) excluded from rowChainVerts
7. **Validate** against export metrics: maxAspect < 20:1, missing edges = 0, R2 violations < 100

## Open Questions (For Verifier)

1. **ASPECT_MATCH_FACTOR = 0.4**: Is this the right ratio? The CDT normalization uses `scale = max(uRange, tRange)`, so in normalized space the T-gap is compressed. Should the U-spread be adjusted to account for the normalized aspect ratio? I believe 0.4 is reasonable since the CDT normalization preserves aspect ratio (it doesn't independently normalize U and T), but the Verifier should verify.

2. **nTLevels scaling**: I chose `floor(density/2)` so density=4 gives 2 levels. Would `floor(density * 0.6)` (density=4 → 2, density=6 → 3) provide better triangle quality? The key constraint is that more T-levels create closer-spaced rungs, which might create small triangles between adjacent rungs.

3. **Dedup threshold**: The existing `COMPANION_DEDUP_THRESHOLD = 1e-5` was set for the ring design. Should it be increased now that companions are more spread out? With spreadU ≈ 0.001, the minimum companion spacing is `spreadU/nU ≈ 0.001` — orders of magnitude above the threshold. The threshold primarily matters for adjacent chain vertices on the same chain, where T-Ladder rungs from two chain vertices at adjacent rows may overlap in the shared band. The threshold should be fine as-is.

4. **Grid-companion collision**: With spreadU ≈ 0.001 and average CDF grid spacing near features ≈ 0.001, companions at `u_cv ± spreadU` may land very close to a grid column. The `applyChainDeadZones` function exists (GridBuilder.ts L278) but is currently not called. Should we add a grid-proximity check to the T-Ladder emitter, or is the 1e-5 dedup threshold sufficient? Grid columns are at row T-positions while companions are at intermediate T-positions, so they're never at the same (u,t) — the dedup threshold won't catch them, but they'll be in the CDT vertex set at different T-levels. This should be fine for CDT but the Verifier should confirm.

5. **Sub-problem B implementation choice**: Should we expand the strip U-range to cover all constraint endpoints (lighter change), or explicitly inject missing constraint endpoints into stripBot/stripTop (more robust)? The latter is more correct but touches more code.
