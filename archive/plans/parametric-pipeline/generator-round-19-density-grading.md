# Generator Round 19 — Chain Strip Density Grading Toward Feature Edges

Date: 2026-03-05

## Problem Statement

The chain strip exhibits visible column structure artifacts. The current T-Ladder companion system addresses only T-density (intermediate T-levels between rows), but places companions at a fixed, tiny lateral U-offset from the chain vertex (`tGap × 0.4`). No vertices fill the U-space between the chain edge and the strip boundary. CDT connects the boundary's regularly-spaced grid columns directly to promoted chain vertices and their sparse T-Ladder companions, producing triangles that inherit the grid's column rhythm.

**What the user demands:**
1. High density within the chain strip with **gradient increase toward the feature edge**.
2. **Smallest triangles at the chain edge** (the constraint path), largest at the boundary.
3. **Perfect curvature representation** — the triangulation must resolve every ridge/valley inflection.

**Current metrics (d4/e1):** minAngle=0.0°, maxAspect=8296:1 (UV), 53M:1 (3D), 51k R2 violations, 915 non-manifold edges.

## Root Cause Analysis

### The UV Density Void

The strip cross-section in U looks like this (expansion=1):

```
boundary ─────── chain ─────── boundary
grid col 0       chain vertex   grid col 2
                  ± companion
```

Between the chain vertex and the boundary grid columns, there are **zero interior vertices**. CDT has no choice but to connect the boundary column vertex directly to the chain vertex or its sparse companion. The resulting triangles span the full U-distance from boundary to chain in a single edge — preserving the column pattern.

**The T-Ladder's `baseSpreadU = max(tGap * 0.4, 0.002)` is the problem.** For a typical `tGap ≈ 0.0023` (1/432 for 432 rows), `baseSpreadU ≈ 0.002`, which is ~0.13 grid columns of U-offset. The companions barely move away from the chain vertex in U-space, contributing nothing to breaking the column pattern.

### What Would Fix It

We need **concentric shells of Steiner points radiating outward from the chain edge toward the strip boundary**, with density decreasing as distance from the chain increases. The pattern should resemble isobars around a ridge line:

```
boundary ───○───○───◉──◉──●──chain──●──◉──◉───○───○───boundary
            sparse        dense          dense        sparse
```

Where `●` = highest density companion, `◉` = medium, `○` = sparse.

## Proposals

### Proposal 1: U-Graded Companion Fan (Recommended — Moderate)

**Idea:** Extend `emitRungs()` to also emit companion vertices at **graded U-offsets** from the chain vertex toward both strip boundaries, with density decreasing at larger offsets.

**Mechanism:**

For each chain vertex `cv` at position `(u_cv, tRow)`, in each adjacent band:

1. **Determine strip boundaries.** Compute `uLeft` and `uRight` from the strip expansion columns. With expansion=E, the strip extends E grid columns on each side. So `uLeft ≈ u_cv - E × gridSpacingU` and `uRight ≈ u_cv + E × gridSpacingU`.

2. **Choose N_shells (number of U-distance shells).** Controlled by density config. Conservative: 3 shells. Aggressive: 6-8 shells. **Proposed default at density=4: N_shells=4.**

3. **Place shells at geometrically-graded U-offsets.** For shell `s` of `N_shells`:
   ```
   fraction = (s / N_shells)^alpha     // alpha > 1 = denser near chain
   uOffset_left  = fraction × (u_cv - uLeft)
   uOffset_right = fraction × (uRight - u_cv)
   ```
   With `alpha = 2.0` (quadratic grading): shells at normalized distances 0.0625, 0.25, 0.5625, 1.0 — heavily biased toward the chain.

4. **At each shell, place companions at M T-levels within the band.**
   ```
   M = max(1, N_shells - s + 1)   // more T-levels near chain, fewer far away
   ```
   Shell 0 (nearest chain): `M = N_shells` T-levels.  
   Shell N-1 (near boundary): `M = 1` T-level.

5. **Total companions per chain vertex per band:**
   ```
   Sum over s=0..N_shells-1 of 2 × M(s)    (×2 for left+right)
   With N_shells=4: 2×(4 + 3 + 2 + 1) = 20 companions per band
   With N_shells=6: 2×(6 + 5 + 4 + 3 + 2 + 1) = 42 companions per band
   ```

6. **Apply existing dedup and constraint-guard filters.** Companions too close to existing points or constraint edges are rejected.

**Mathematical basis:**

Quadratic grading (`alpha=2`) approximates the ideal mesh density for resolving curvature near a feature. The density at distance `d` from the feature should scale as `1/sqrt(d)` for optimal curvature approximation (related to how inscribed polygon error scales with edge length squared). Quadratic shell spacing achieves approximately this:

| Shell | Normalized distance | Δ to previous | T-levels |
|-------|-------------------|---------------|----------|
| 0     | 0.0625            | 0.0625        | 4        |
| 1     | 0.25              | 0.1875        | 3        |
| 2     | 0.5625            | 0.3125        | 2        |
| 3     | 1.0               | 0.4375        | 1        |

The innermost shell is 7× denser than the outermost. This ensures the CDT near the chain edge uses many short edges, producing small triangles that resolve curvature, while near the boundary, triangles grow larger and blend smoothly into the grid mesh.

**Files affected:**
- `OuterWallTessellator.ts` lines 560-770: Extend `emitRungs()` or add sibling function `emitUGradedFan()`
- `ChainStripTriangulator.ts` line 43: Add `uGradingShells` to `ChainStripConfig`
- `ParametricExportComputer.ts` line 444: Plumb new config value from UI

**Algorithm sketch for `emitUGradedFan()`:**

```typescript
function emitUGradedFan(
    cv: ChainVertex,
    tLo: number,
    tGap: number,
    bandIdx: number,
    uLeft: number,
    uRight: number,
    nShells: number,
    alpha: number, // grading exponent, typically 2.0
): void {
    if (tGap < MIN_TGAP_FOR_COMPANIONS) return;
    const uCv = cv.u;

    for (let s = 0; s < nShells; s++) {
        // Geometric grading: inner shells are closer together
        const fraction = Math.pow((s + 1) / nShells, alpha);

        // Number of T-levels decreases with distance from chain
        const nT = Math.max(1, nShells - s);

        for (const side of [-1, 1] as const) {
            const uBound = side < 0 ? uLeft : uRight;
            const uRange = Math.abs(uBound - uCv);
            const cu = uCv + side * fraction * uRange;

            for (let k = 1; k <= nT; k++) {
                const tFrac = k / (nT + 1);
                const ct = tLo + tFrac * tGap;

                if (!isNearConstraintEdge(cu, ct, bandIdx)) {
                    tryEmitCompanion(cu, ct, cv);
                }
            }
        }
    }
}
```

**Trade-offs:**
- **Pro:** Minimal architectural change — extends existing companion system.
- **Pro:** CDT handles free Steiner points well; graded density should produce good Delaunay angles.
- **Pro:** Density scales linearly with `nShells` — controllable.
- **Con:** Requires knowing strip boundaries (uLeft, uRight) at companion generation time; currently the T-Ladder runs before strip range is computed. **Fixable:** pre-compute approximate strip boundaries from chain vertex + expansion × grid spacing.
- **Con:** More companions = more CDT points = slower CDT. But CDT is O(n log n) so 20→60 points/band is negligible.

**Assumptions for Verifier to attack:**
1. Quadratic grading (`alpha=2`) produces sufficient curvature resolution at the chain edge.
2. The CDT will produce well-shaped triangles with graded free points (not degenerate slivers).
3. Pre-computing strip boundaries from `u_cv ± expansion × meanGridSpacing` is a good enough approximation.
4. The constraint guard radius (`0.001`) won't reject too many near-chain companions.
5. MAX_COMPANIONS_PER_CV (20) needs to be raised — the fan generates up to 20 per band × 2 bands = 40 per chain vertex.

**Vertex budget estimate:**
- Current: ~14,690 companions total for the mesh.
- With nShells=4: ~20 per CV per band × 2 bands × (chainVertices count). If 1000 chain vertices: 40,000 new companions (pre-dedup). After dedup: ~25,000-30,000.
- 3× increase in companion count. CDT local complexity grows but stays manageable.

---

### Proposal 2: Brute Force — High Expansion + High Density (Conservative)

**Idea:** Raise defaults to `expansion=6, density=12`. More grid columns on boundary + more T-Ladder companions. The column pattern gets diluted by sheer vertex count.

**Mechanism:**
- `expansion=6`: strip is 13 columns wide (6 + 1 + 6). The CDT rectangle is much wider: more grid boundary vertices available.
- `density=12`: `nTLevels=2, nUSpread=2` → 8 companions per band per CV.

**Mathematical analysis:**

With expansion=6 and 685 U-columns across 2π, the grid spacing is `1/685 ≈ 0.00146`. A chain strip spans 13 columns ≈ `0.019` in U-space. The T-Ladder companions with `baseSpreadU ≈ max(tGap × 0.4, 0.002)` reach at most U-offset 0.002 — still only ~1.4 grid columns from the chain vertex. **The remaining 4.6 columns on each side have zero interior vertices.**

**Verdict: This does NOT solve the problem.** Expansion alone just extends the boundary — it doesn't fill the interior void. The column pattern widens but doesn't disappear. More grid columns on the boundary actually *reinforce* the column structure with more regularly-spaced boundary vertices for CDT to connect to.

**Trade-offs:**
- **Pro:** Zero code change (config only).
- **Con:** Does not address the root cause. At any expansion, the interior between the few T-Ladder companions and the boundary is empty.
- **Con:** Dramatically increases triangle count (13 strip columns × 432 rows × 2 tri/quad = ~11,000 extra triangles per chain, vs ~2,600 currently). For 8 chains, that's ~70k extra triangles serving no quality purpose.

**Assumptions for Verifier to attack:**
1. The analysis above is correct that expansion alone doesn't fill the interior.
2. density=12 isn't enough U-spread to compete with 6 expansion columns.

---

### Proposal 3: Radial Mesh Around Chain Edge (Radical)

**Idea:** Replace the CDT strip with a structured radial/tube mesh centered on the chain polyline. Like extruding a circular tube along the feature curve, then transitioning to the grid mesh at some distance.

**Mechanism:**
1. For each chain edge segment (a–b), generate `N_rings` concentric offset curves at distances `d1, d2, ... dN` from the chain edge in UV space.
2. Tessellate between consecutive rings as quad strips, like a cylinder mesh unwound.
3. The outermost ring becomes the boundary with the grid mesh, requiring stitch triangles.

**Mathematical basis:** Structured radial meshes guarantee geometric fidelity to the feature by construction — the innermost ring matches the chain edge exactly, and resolution is controlled by ring count and angular subdivision.

**Analysis:**

This produces the *best possible* mesh near the feature. No CDT randomness, perfect grading, guaranteed angle quality.

However, the complexity is enormous:
- Computing offset curves in UV space for an arbitrary chain polyline is non-trivial (requires curve offsetting with self-intersection handling).
- Stitching the outermost ring to the grid mesh is a full T-junction resolution problem.
- Chain edge segments connect at vertices where multiple offset rings must merge — singularity handling at branch points.
- Normal discontinuities at the stitch boundary.

**Trade-offs:**
- **Pro:** Optimal curvature representation.
- **Pro:** No column pattern artifacts by construction.
- **Con:** Complete architectural replacement of the CDT strip system. Weeks of work.
- **Con:** Introduces new categories of geometric degeneration (offset self-intersections, branch singularities).
- **Con:** The stitch between radial mesh and grid mesh creates T-junctions — the very problem CDT was introduced to solve.

**Assumptions for Verifier to attack:**
1. Offset curves in UV space correspond to meaningful 3D distance from the feature (they might not due to UV distortion).
2. The stitch problem is solvable without introducing worse artifacts than we're trying to fix.

**Recommendation: Defer.** This is the right eventual architecture for v3.0, but the complexity is too high for the current iteration. File it as a roadmap item.

---

### Proposal 4: Multi-Resolution Strip Boundaries (Moderate-Radical)

**Idea:** Instead of using grid-aligned CDT boundary vertices, inject non-grid-aligned boundary vertices at positions computed to break the column pattern. The boundary itself becomes irregular, derived from the chain's position.

**Mechanism:**
1. When constructing `stripBot` and `stripTop`, instead of just collecting grid vertices at column positions, also insert synthetic boundary vertices at U-positions intermediate to the grid columns.
2. These positions are computed to be at ½ column, ¼ column, ¾ column offsets — breaking the regular rhythm.
3. The inserted vertices index into the same vertex buffer but at UVs not present in the grid.

**Analysis:**

This attacks the column pattern at its source — the boundary vertices themselves. If the boundary is irregular, CDT can't produce regular column-aligned triangles.

However:
- These boundary vertices don't exist in the grid vertex buffer. They'd need to be created as new vertices, which breaks the shared-edge guarantee between the CDT strip and adjacent grid quads.
- **This creates T-junctions and non-manifold boundaries** — exactly the problem D-Radical was designed to prevent.

**Trade-offs:**
- **Pro:** Directly attacks the column pattern's source.
- **Con:** Creates T-junctions at the strip boundary unless the adjacent grid quads are also modified.
- **Con:** Violates the D-Radical manifold guarantee.

**Recommendation: Reject** in isolation, but the idea of boundary enrichment could work if combined with Proposal 1 (use U-graded fan interior vertices and leave boundaries alone).

---

### Proposal 5: Hybrid — Moderate Expansion + U-Graded Fan (Recommended Combined)

**Idea:** Combine Proposal 1 (U-graded companion fan) with a moderate expansion increase (expansion=3-4) and density=8.

**Mechanism:**
- `expansion=4`: strip is 9 columns wide. This gives the fan more room to fill.
- `density=8`: `nTLevels=2, nUSpread=2` (from existing T-Ladder scaling).
- Add U-graded fan with `nShells=5` (from Proposal 1).
- `alpha=2.0` for quadratic grading.

**Why the combination works:**

With expansion=4, the strip boundary is ~4 grid columns from the chain edge on each side. The U-graded fan fills this space with 5 shells:

```
boundary  ○   ○   ◉   ◉   ●  chain  ●   ◉   ◉   ○   ○   boundary
          s4  s3  s2  s1  s0         s0  s1  s2  s3  s4
```

Shell distances from chain (quadratic, fraction = ((s+1)/5)^2):
| Shell | Fraction | ~Grid cols from chain (of 4) | T-levels |
|-------|----------|------------------------------|----------|
| 0     | 0.04     | 0.16 cols                    | 5        |
| 1     | 0.16     | 0.64 cols                    | 4        |
| 2     | 0.36     | 1.44 cols                    | 3        |
| 3     | 0.64     | 2.56 cols                    | 2        |
| 4     | 1.0      | 4.0 cols (= boundary)        | 1        |

**Total companions per CV per band**: 2 × (5+4+3+2+1) = 30.  
Plus existing T-Ladder: 2 × (2 T-levels × 2 U-spread) = 8.  
**Total: 38 per CV per band, ~76 per CV** (above + below).

With ~1000 chain vertices: ~76,000 pre-dedup, ~50,000 after dedup.

**Vertex budget impact:**
- Grid: 685 × 432 = 295,920 vertices.
- Chain vertices: ~1,200.
- Current companions: ~14,690.
- New companions: ~50,000.
- **Total: ~362,000 vertices** (23% increase from 311k).
- Triangle count increase: bounded by CDT locality — only strip triangles increase. Estimate +100k triangles (+~15% of a typical 650k mesh).

**Performance estimate:**
CDT local calls process 10-50 vertices each. With the fan, each strip call processes 50-100 vertices. cdt2d at this scale is < 0.1ms per call. With ~2000 strip bands, total CDT time ≈ 200ms vs current ~100ms. **Negligible at export scale.**

**Manifold safety:**
The fan vertices are all CDT interior points (Steiner points). They do NOT appear on the strip boundary. The strip boundary remains pure-grid per D-Radical. Therefore the manifold guarantee is preserved — adjacent grid quads share exact boundary vertices with the CDT strip.

**CDT interaction:**
Free Steiner points are ideal for CDT — the algorithm automatically connects them while respecting constraint edges and maximizing minimum angles. Graded density should produce well-shaped triangles because:
- Near the chain: many vertices close together → short edges → small triangles.
- Near the boundary: few vertices → CDT connects to boundary vertices → larger triangles → smooth transition.
- Delaunay criterion prevents extreme slivers when point density is monotonic (no density inversions).

**Before/after triangle structure near a chain edge:**

BEFORE (d4/e1):
```
boundary            chain           boundary
grid───────────────feature──────────grid
  \                /    \                /
   \              /      \              /
    \            /        \            /
     grid──────/          \──────grid
```
Long skinny triangles spanning the full boundary-to-chain distance. Column pattern visible.

AFTER (d8/e4 + fan):
```
boundary            chain           boundary
grid──○──○──◉──◉──●feature●──◉──◉──○──○──grid
  \  / \/ \/ \/ \/ \ / \ / \/ \/ \/ \/ \ /  \
   ○   ◉   ◉   ●──/     \──●   ◉   ◉   ○
  / \ / \ / \ / \ /       \ / \ / \ / \ / \
grid──○──◉──●──/             \──●──◉──○──grid
```
Dense small triangles near feature, progressively larger toward boundary. Column pattern overwhelmed.

**Files affected:**
- `OuterWallTessellator.ts`:
  - Add `emitUGradedFan()` function (~30 lines)
  - Call it from the companion generation loop (lines 740-755)
  - Pre-compute approximate strip boundaries from `expansion × meanGridSpacingU`
  - Raise `MAX_COMPANIONS_PER_CV` from 20 to 100
- `ChainStripTriangulator.ts`:
  - Add `uGradingShells?: number` and `uGradingAlpha?: number` to `ChainStripConfig`
  - Update `DEFAULT_CHAIN_STRIP_CONFIG` defaults
- `ParametricExportComputer.ts`:
  - Add `cfgChainStripUGradingShells` pipeline config plumbing
  - Update default expansion from 1 to 4 and density from 4 to 8

**Assumptions for Verifier to attack:**
1. CDT produces well-shaped triangles with monotonically-graded free point density.
2. 50,000 extra companions don't blow up memory or dedup time.
3. Quadratic grading (`alpha=2`) is the right exponent — not too aggressive near chain, not too sparse.
4. The outermost shell (at the boundary position) doesn't create near-degenerate triangles by being too close to boundary grid vertices (dedup should catch this, but worth verifying).
5. Pre-computing strip boundaries as `u_cv ± expansion × (1/numU)` is accurate enough (it won't be exact because CDF-adaptive columns aren't uniform — but it's close enough for companion placement).
6. The `interiorByBand` bucketing will correctly route fan companions to their strip's CDT call.
7. Raising expansion from 1 to 4 doesn't cause strip overlap between adjacent chains.

---

## Recommended Approach

**Proposal 5 (Hybrid)** is the clear winner:
- Addresses the root cause (empty U-space between chain and boundary).
- Achieves density grading toward the feature edge.
- Preserves manifold safety (D-Radical boundaries untouched).
- Minimal architectural change (extends existing companion system).
- Controllable via config (nShells, alpha, expansion).
- Acceptable performance cost (~100ms CDT overhead, ~23% vertex increase).

**Implementation order:**
1. Add `emitUGradedFan()` to OWT.
2. Pre-compute `meanGridSpacingU = 1 / numU` and pass strip boundary estimates.
3. Raise `MAX_COMPANIONS_PER_CV` to 100.
4. Add config plumbing for `uGradingShells` and `uGradingAlpha`.
5. Update defaults: expansion=4, density=8, uGradingShells=5, uGradingAlpha=2.0.
6. Test: verify R2 violations drop, minAngle improves, column pattern disappears.

## Open Questions

1. **Is `alpha=2.0` optimal?** Should we try `alpha=1.5` (milder grading) or `alpha=3.0` (more aggressive)? The Verifier should analyze what curvature error bound each alpha value achieves.

2. **Should the outermost shell be at `fraction=1.0` (exactly at the boundary)?** This places companions coincident with or very near boundary grid vertices. The dedup threshold should handle it, but it might be cleaner to cap at `fraction=0.9` to leave a buffer zone.

3. **Strip overlap:** Two adjacent chains with expansion=4 might have overlapping strips. The current code handles this (strips merge for overlapping chain columns), but does the fan cause companion collisions between adjacent chains? The dedup system should handle this, but need to verify.

4. **3D-aware grading:** The current proposal grades in UV space. Should the grading account for `estimateCircumferentialStretch()` so that 3D triangle sizes are uniform? At high stretch factors (wide pot top), UV companions are spaced further apart in 3D. A stretch-aware `alpha` could compensate.

5. **Interaction with `chainStripAdaptiveRefine`:** The existing adaptive refinement post-processes CDT output. Does the fan make adaptive refinement redundant, or do they complement each other?

6. **Config exposure:** Should `uGradingShells` and `uGradingAlpha` be exposed in the UI, or hardcoded as derived from `density`? Proposal: derive from density — `nShells = max(3, density - 1)`, `alpha = 2.0` always.
