# Generator Round 41 — Chain-Coherent Tessellation (CCT)
Date: 2026-03-08

## Problem Statement

After 40 rounds, two visual artifacts persist in the parametric export pipeline:

**Problem A — Sawtooth Feature Edges**: When a chain edge oscillates slightly in U between rows (e.g., u=0.35 at row R, u=0.37 at row R+1), `sweepQuad`'s UV-proximity-based diagonal selection flips orientation between rows. The diagonal that crosses each sub-quad alternates—row by row—between "bottom-right → top-left" and "top-right → bottom-left," creating a visible zigzag in the normal field even though the chain edge itself is topologically present.

**Problem B — Surface Dips Near Features**: Bridge triangles connecting a chain vertex (at a ridge peak) to a grid vertex (on the slope) are planar. The true mathematical surface curves between these points. The flat triangle cuts through the curve, creating a visible dip below the ridge and a bump on the slope.

## Root Cause Analysis

### Problem A — Traced to `sweepQuad` lines 209–260

`sweepQuad` decides which pointer to advance based on the U-position of the `next` vertex on bottom vs. top:

```
if botNextU < topNextU - eps:  advance bottom
elif topNextU < botNextU - eps: advance top
else: 2D min-angle tie-break
```

This is **U-order deterministic** — the diagonal direction depends entirely on which side's next vertex has smaller U. When a chain edge tilts slightly right between rows, `constrainedSweepCell` (line 290) creates two sub-quads. In the left sub-quad, both bottom and top edges end at the chain vertex, but the chain vertex's U shifts row-to-row. That shift can flip which pointer advances first in the tie zone, causing the diagonal to alternate:

- **Row R** (chain at u=0.35): `botNextU=0.35 < topNextU=0.37` → advance bottom → diagonal goes ↗
- **Row R+1** (chain shifts to u=0.33): `topNextU=0.33 < botNextU=0.35` → advance top → diagonal goes ↘

This alternation is the sawtooth. It's not a bug in `sweepQuad` — the algorithm is correct for generic quads — but **wrong for quads adjacent to a directional chain edge** where consistent diagonal orientation matters more than locally optimal angles.

### Problem B — Traced to planar bridge geometry

A chain vertex sits at the ridge peak: R(u_chain, t) is a local maximum in the radial direction. A grid vertex at the same t but different u sits on the slope: R(u_grid, t) < R(u_chain, t). The triangle connecting these two vertices plus a third is a flat plane. The true surface between u_chain and u_grid has curvature (it's the side of a ridge). The flat triangle cuts through this curve:

```
True surface:  ╱‾‾‾╲     (ridge profile)
Flat triangle: ╱‾‾‾‾╲    (straight line → dips below at transition)
                  ↑ gap = visible dip
```

The bridge span (|u_chain − u_grid|) determines the magnitude of the dip. Typical bridge spans are 50–100% of a grid cell width — large enough for the curvature error to be visible at export quality.

## Proposals

### Proposal 1: Chain-Fan Diagonal Forcing (Conservative) — Fixes Problem A

**Idea**: Replace `sweepQuad` calls in chain-adjacent sub-quads with a deterministic diagonal choice that always fans OUT from the chain edge, regardless of minor U oscillation.

**Mechanism**: After `constrainedSweepCell` partitions a cell into sub-quads at each chain edge, classify each sub-quad:

- **Chain-right sub-quad**: Chain edge forms the right boundary. `bot = [..., cb]`, `top = [..., ct]`.
- **Chain-left sub-quad**: Chain edge forms the left boundary. `bot = [cb, ...]`, `top = [ct, ...]`.
- **Chain-both sub-quad**: Both boundaries are chain edges (between two chains in the same cell — rare).

For simple 2×2 sub-quads (the dominant case: exactly 2 bottom and 2 top vertices), directly force the diagonal:

```
chainFanQuad(buf, bot[2], top[2], verts, chainSide):
    [v0, v1] = bot;  [w0, w1] = top

    if chainSide == 'right':
        // Chain edge is v1→w1. Fan diagonal: v1→w0
        // Triangle 1: v0, v1, w0  (left triangle)
        // Triangle 2: w0, v1, w1  (right triangle, shares chain edge)
        emitTriCCW(buf, v0, v1, w0, verts)
        emitTriCCW(buf, w0, v1, w1, verts)

    elif chainSide == 'left':
        // Chain edge is v0→w0. Fan diagonal: v0→w1
        // Triangle 1: v0, v1, w1  (right triangle)
        // Triangle 2: v0, w1, w0  (left triangle, shares chain edge)
        emitTriCCW(buf, v0, v1, w1, verts)
        emitTriCCW(buf, v0, w1, w0, verts)
```

For general N×M sub-quads (≥3 vertices on an edge), use a modified sweep with chain tangent bias:

```
chainBiasedSweep(buf, bot, top, verts, chainTangentDU):
    bi = 0, ti = 0
    while bi < bLen-1 || ti < tLen-1:
        [standard single-advance cases unchanged]

        // Both can advance — tie-break zone:
        if |botNextU - topNextU| <= SWEEP_EPS:
            // Force diagonal direction consistent with chain tangent.
            // When chain slopes rightward (du > 0): advancing bottom
            // creates a diagonal from bot[bi+1] up to top[ti], which
            // slopes right-and-up — matching the chain.
            // When chain slopes leftward (du < 0): advancing top creates
            // the matching diagonal.
            // When chain is vertical (du ≈ 0): fall back to min-angle.
            if chainTangentDU > SWEEP_EPS:
                advance bottom
            elif chainTangentDU < -SWEEP_EPS:
                advance top
            else:
                [standard 2D min-angle tie-break]
        else:
            [standard U-order advance]
```

**Why it solves Problem A**: The diagonal direction is determined by the chain edge's tangent and the sub-quad's chain-side classification — **not** by per-row U perturbation. No matter how the chain oscillates in U, the diagonal always fans out from the chain edge in a consistent direction. Row-to-row diagonal alternation is eliminated.

**Mathematical basis**: Feature edges are locally monotone curves in UV space. Their tangent direction changes slowly (verified by the WH smoothing metrics: typical `maxConsecDelta` is small). A diagonal aligned with this tangent is stable across rows, while a diagonal perpendicular to it is sensitive to infinitesimal U shifts.

**Files affected**:
- `OuterWallTessellator.ts`: New `chainFanQuad()` function (~15 lines), modified `chainBiasedSweep()` (~40 lines), changes to `constrainedSweepCell()` to classify sub-quads and dispatch. Also modify `emitSuperCell()`'s sub-band sweep calls similarly.

**Trade-offs**:
- (+) Deterministic, consistent diagonal orientation near features
- (+) Minimal code change — existing `sweepQuad` stays untouched for non-chain cells
- (+) No new vertices, no performance impact
- (−) The forced diagonal may have slightly worse 2D min-angle than the optimal choice in some cells — but subsequent `flipEdges3D` and `chainDirectedFlip` correct this anyway

**Assumptions** (for Verifier to attack):
1. The 2×2 sub-quad case (exactly one chain vertex per edge per side of the partition) dominates. If multi-vertex sub-quads are common near chains, the general `chainBiasedSweep` path must be equally robust.
2. Consistent diagonal direction per chain tangent produces better visual results than per-cell optimal angle selection. The visual coherence argument outweighs the local quality argument.
3. The chain tangent `du = u_ct − u_cb` is a sufficient proxy for determining consistent diagonal orientation. It doesn't need the full chain's tangent (averaging across multiple rows).
4. `emitTriCCW` handles winding correctly for both forced-diagonal patterns, regardless of which diagonal was chosen.
5. The forced diagonal never creates degenerate triangles as long as the four vertices are non-coincident (guaranteed by the MERGE_THRESHOLD dedup at line 838).

---

### Proposal 2: Pre-Tessellation Bridge Support Vertices (Moderate) — Fixes Problem B

**Idea**: Before tessellating chain-adjacent sub-quads, insert support vertices at the UV midpoints of bridge spans (the distance between a chain vertex and the nearest grid vertex). This breaks large flat bridge triangles into smaller ones that conform better to the surface curvature.

**Mechanism**: In `constrainedSweepCell`, after partitioning into sub-quads but before sweeping, measure each sub-quad's bridge span:

```
For left sub-quad: bot = [BL, ..., cb], top = [TL, ..., ct]
  bridgeSpan_bot = cb.u - BL.u
  bridgeSpan_top = ct.u - TL.u

For right sub-quad: bot = [cb, ..., BR], top = [ct, ..., TR]
  bridgeSpan_bot = BR.u - cb.u
  bridgeSpan_top = TR.u - ct.u
```

If `max(bridgeSpan_bot, bridgeSpan_top) > BRIDGE_THRESHOLD` (where `BRIDGE_THRESHOLD` = median column spacing × 0.6), insert support vertices:

```
insertBridgeSupports(bot, top, verts, phantomSlots):
    // Bottom edge: if span from grid corner to chain vertex is wide
    if bridgeSpan_bot > BRIDGE_THRESHOLD:
        uMid = (grid_corner_u + chain_vertex_u) / 2
        tMid = verts[grid_corner * 3 + 1]  // same T-row
        supportIdx = allocatePhantomVertex(uMid, tMid)
        insert supportIdx into bot at correct U-sorted position

    // Top edge: same logic
    if bridgeSpan_top > BRIDGE_THRESHOLD:
        uMid = (grid_corner_u + chain_vertex_u) / 2
        tMid = verts[grid_corner * 3 + 1]
        supportIdx = allocatePhantomVertex(uMid, tMid)
        insert supportIdx into top at correct U-sorted position
```

The support vertices are allocated from the existing phantom vertex buffer (slots already reserved by `maxPhantomSlots`). They have correct UV positions at allocation time; their 3D positions are computed later by the GPU evaluation pass (same as all other mesh vertices).

**Why it solves Problem B**: Each bridge span that previously produced one large flat triangle now produces two (or more) smaller triangles. Each smaller triangle spans half the original UV distance across the ridge flank. Since curvature error scales quadratically with span length, halving the span reduces the dip magnitude by ~4×.

```
Before:  Chain──────────Grid     1 long triangle, large curvature error
After:   Chain───Mid───Grid      2 triangles, each with ~1/4 the error
```

The GPU evaluates the support vertex at its UV midpoint, placing it on the true mathematical surface between the ridge peak and the slope. The resulting triangle pair hugs the curved surface much more closely.

**Mathematical basis**: For a surface with local Gaussian curvature K and a triangle with edge length h, the maximum surface deviation is bounded by ε ≈ (K × h²) / 8. Inserting a midpoint vertex halves h, reducing ε by a factor of 4. For typical pot ridge profiles (K ≈ 50–200 m⁻²) and bridge spans (h ≈ 2–5mm), the dip reduces from ~0.1mm (visible) to ~0.025mm (sub-visual).

**Files affected**:
- `OuterWallTessellator.ts`:
  - New `insertBridgeSupports()` helper (~30 lines)
  - `constrainedSweepCell`: call `insertBridgeSupports` before dispatching to sweep
  - `emitSuperCell`: same treatment for super-cell sub-band sweeps
  - Increase `maxPhantomSlots` buffer from `chainEdges.length * 12` to `chainEdges.length * 16` (4 extra slots per chain edge for support vertices)

**Trade-offs**:
- (+) Directly addresses curvature error at the source — tessellation time
- (+) Uses existing phantom vertex allocation infrastructure (R37)
- (+) Support vertices participate in all downstream passes (GPU eval, optimizers, subdivision) naturally
- (+) No runtime cost beyond a small increase in vertex count and GPU evaluations
- (−) Increases total vertex/triangle count by ~0.5–2% (only near features)
- (−) Needs careful threshold tuning — too aggressive and we over-densify; too conservative and bridges remain

**Assumptions** (for Verifier to attack):
1. Bridge spans are typically 50–100% of a grid cell width. If the CDF-adaptive grid already places columns very close to chain features, bridge spans may already be small enough that support vertices are unnecessary. Need to verify empirically.
2. `maxPhantomSlots` increase from ×12 to ×16 is sufficient. If many chain cells have wide bridge spans, we might need more. Safety: check allocation overflow.
3. Inserting support vertices on the bottom/top edges of a sub-quad doesn't create T-junctions because the adjacent cell at that edge will also see those vertices (they share the edge). **Wait** — this needs careful handling: the support vertex is on row `j`'s bottom or top edge; the cell in band `j-1` sharing that edge must also include the support vertex. Otherwise we get a T-junction.
4. The quadratic error reduction (h² → h²/4) holds for the typical ridge curvature profiles in PotFoundry's parametric styles.

### ⚠️ T-Junction Risk in Proposal 2

Assumption 3 above is the critical risk. When we insert a support vertex into band `j`'s bottom edge, that edge is shared with band `j-1`'s top edge. If band `j-1` doesn't know about the support vertex, we get a T-junction (non-manifold mesh).

**Mitigation**: Insert support vertices BEFORE the main cell emission loop (section 4), as a pre-processing pass over all chain-containing cells. Record support vertices in `rowChainVerts` so they appear as edge vertices for BOTH the upper and lower cells sharing that edge.

**Revised implementation plan**:
1. After section 3.9 (phantom vertices) but before section 4 (cell emission):
   - Scan all chain cells for wide bridge spans
   - Insert support vertices into the phantom buffer
   - Register them in `rowChainVerts` at the appropriate row
   - They'll be picked up by both the band-above and band-below cells during `emitChainCell`'s edge construction

This eliminates the T-junction risk because support vertices are treated identically to chain vertices — they appear on both cells sharing an edge.

---

### Proposal 3: Combined CCT Architecture (Recommended)

**Idea**: Combine Proposals 1 and 2 into a unified "Chain-Coherent Tessellation" system.

**Implementation order**:

**Phase A** — Chain-Fan Diagonal Forcing (Proposal 1):
1. Add `chainFanQuad()` to OuterWallTessellator.ts
2. Add `chainBiasedSweep()` for general sub-quads
3. Modify `constrainedSweepCell()` to classify sub-quads and dispatch
4. Modify super-cell sub-band sweep calls in `emitSuperCell()` similarly
5. Run tests, verify chain edge enforcement rate unchanged

**Phase B** — Bridge Support Pre-Insertion (Proposal 2):
1. Add bridge span analysis as a pre-pass after section 3.9
2. Insert support vertices into phantom buffer + rowChainVerts
3. Update `maxPhantomSlots` upper bound
4. Verify no T-junctions: check that support vertices appear in both adjacent cells
5. Run tests, verify manifold integrity

**Phase C** — Validation:
1. Export a known-bad style (spirals, deep ribbed) at High quality
2. Compare chain-edge angle statistics before/after
3. Compare dip magnitude near features before/after
4. Regression: all 169 tests pass, ESLint clean

**Trade-offs vs. implementing only one**:
- Proposal 1 alone fixes visual zigzag but leaves bridge dips
- Proposal 2 alone reduces dips but diagonal inconsistency persists
- Combined: both artifacts addressed, complementary mechanisms, no interference

---

## Why Previous Rounds Failed and Why This Is Different

| Previous approach | Why it failed | How CCT avoids the failure |
|---|---|---|
| WH smoothing (R7–R9) | Moves chain off exact peaks | CCT doesn't move chain vertices |
| Companion vertices (R4–R5) | Didn't fix diagonal direction | CCT forces diagonal direction explicitly |
| CDT tessellation (R1–R27) | Removed for instability | CCT is cell-local, no CDT dependency |
| Chain-strip optimizer (R16) | Post-hoc can't fix initial bad triangulation | CCT fixes initial triangulation |
| Protected corridors (R38) | Prevents damage but doesn't improve initial mesh | CCT improves initial mesh |
| GPU subdivision (R18, R40) | Runs too late, splits wrong edges | CCT inserts supports before sweep, no post-hoc |
| Micro-row insertion | Adds global density bands | CCT adds local support vertices only |
| Mesh-guide blend (R39) | Helps geometry but sweep still makes bad diagonals | CCT fixes the sweep diagonal selection directly |

**The key difference**: All previous approaches either modified the chain path, added post-processing, or inserted macro-scale topological changes. CCT operates at the exact point of failure — the `sweepQuad`/`constrainedSweepCell` diagonal decision — and adds targeted local support **before** the initial triangulation. It doesn't move chain vertices, doesn't require CDT, doesn't depend on post-hoc repair, and doesn't add global density.

## Implementation Plan

### Modified/New Functions

**`chainFanQuad(buf, bot, top, verts, chainSide)`** — New, ~20 lines:
```typescript
function chainFanQuad(
    buf: number[],
    bot: [number, number],  // exactly 2 vertices
    top: [number, number],  // exactly 2 vertices
    verts: Float32Array,
    chainSide: 'left' | 'right',
): void {
    const [v0, v1] = bot;
    const [w0, w1] = top;
    if (chainSide === 'right') {
        // Chain edge is v1→w1. Fan diagonal: v1→w0
        emitTriCCW(buf, v0, v1, w0, verts);
        emitTriCCW(buf, w0, v1, w1, verts);
    } else {
        // Chain edge is v0→w0. Fan diagonal: v0→w1
        emitTriCCW(buf, v0, v1, w1, verts);
        emitTriCCW(buf, v0, w1, w0, verts);
    }
}
```

**`chainBiasedSweep(buf, bot, top, verts, chainTangentDU)`** — New, ~50 lines:
Same as `sweepQuad` but with chain-tangent-consistent tie-breaking in the `else` branch.

**`constrainedSweepCell` — Modified** (lines 290–365):
After building `partitions`, classify each sub-quad's chain adjacency:
```typescript
// For each sub-quad between consecutive partitions:
const isSimple = (subBot.length === 2 && subTop.length === 2);
const chainOnRight = (partIdx < partitions.length);  // chain edge is rightward boundary
const chainOnLeft = (partIdx > 0);  // chain edge is leftward boundary

if (isSimple && chainOnRight && !chainOnLeft) {
    chainFanQuad(buf, subBot as [number,number], subTop as [number,number], verts, 'right');
} else if (isSimple && chainOnLeft && !chainOnRight) {
    chainFanQuad(buf, subBot as [number,number], subTop as [number,number], verts, 'left');
} else if (chainOnRight || chainOnLeft) {
    const du = /* compute from nearest chain edge endpoints */;
    chainBiasedSweep(buf, subBot, subTop, verts, du);
} else {
    sweepQuad(buf, subBot, subTop, verts);  // no chain context: standard
}
```

**`insertBridgeSupports` — New pre-pass** (~50 lines):
After section 3.9, before section 4. Scans `cellChainMap` entries, identifies wide bridge spans, allocates phantom support vertices, registers them in `rowChainVerts`.

### Files Changed
| File | Change type | Scope |
|---|---|---|
| `OuterWallTessellator.ts` | Add functions + modify `constrainedSweepCell` + add pre-pass | ~150 lines of new code |
| `ParametricExportComputer.ts` | No changes needed | — |
| `MeshOptimizer.ts` | No changes | — |
| `ChainStripOptimizer.ts` | No changes | — |
| `MeshSubdivision.ts` | No changes | — |

### Lines of Code Estimate
- `chainFanQuad`: 20 lines
- `chainBiasedSweep`: 50 lines (mostly duplicated from `sweepQuad` with modified tie-break)
- `constrainedSweepCell` modifications: 25 lines
- `insertBridgeSupports` pre-pass: 50 lines
- Test updates: 30–50 lines

**Total: ~175 lines of new/modified code.** Minimal blast radius — all changes are in `OuterWallTessellator.ts`.

## Risk Assessment

1. **Test regression risk** (Medium): Tests checking specific diagonal patterns in chain cells will need updating. Tests checking chain edge enforcement rate, manifold integrity, and triangle count should pass unchanged. The 169 existing tests are mostly about topology, not diagonal direction.

2. **T-junction risk** (Low after mitigation): Bridge support vertices are registered in `rowChainVerts` before cell emission, guaranteeing both adjacent cells see them. The same pattern is already used for R37 phantom vertices — proven safe.

3. **Performance risk** (Low): `chainFanQuad` is O(1) per call. `chainBiasedSweep` is same complexity as `sweepQuad`. Bridge support insertion adds ~O(chainCells) work. No GPU-impacting changes.

4. **Winding risk** (Low): All triangle emission goes through `emitTriCCW`, which performs explicit cross-product checks. Forced diagonals don't affect winding correctness.

5. **Optimizer interaction risk** (Low): `chainDirectedFlip` may flip some of the forced diagonals back. This is fine — if the 3D geometry says a different diagonal is better, let it. The key is that the INITIAL triangulation is consistent, giving optimizers a better starting point.

6. **Seam risk** (Low): Both proposals only affect chain-containing cells. The seam guard (`SEAM_GUARD = 0.3`) already excludes seam-crossing cells from chain processing.

## Validation Protocol

### Quantitative Metrics (automated)
1. **Chain edge enforcement rate**: Must remain at current level (typically 100% primary edges enforced)
2. **Diagonal consistency score** (new metric): For each chain, compute the fraction of consecutive row-pairs where adjacent-cell diagonals have the same orientation. Target: >95% (currently estimated <50%)
3. **Bridge span distribution**: Histogram of bridge spans before/after support insertion. All spans should be below `BRIDGE_THRESHOLD` after insertion.
4. **Manifold integrity**: `checkManifold()` — boundary edges, non-manifold edges should not increase
5. **Triangle count**: Should increase by <3% from support vertices

### Visual Validation (manual)
1. Export "Spirals" style at High quality — this is the worst-case style for diagonal sawtooth
2. Export "Deep Ribbed" style at High quality — worst-case for bridge dips
3. Compare STL in slicer with current vs. CCT export
4. Look specifically at:
   - Ridge lines: smooth vs. zigzag silhouette
   - Ridge flanks: smooth shading vs. faceting/dips
   - Overall surface quality at normal viewing distance

### Regression Suite
1. All 169 `ParametricExportComputer` tests pass
2. `npm run typecheck` clean
3. `npm run lint` clean (0 warnings)

## Open Questions

1. **What fraction of chain-adjacent sub-quads are 2×2?** If it's >90%, the simple `chainFanQuad` path handles the vast majority and the `chainBiasedSweep` fallback is rarely exercised. If it's lower, the fallback's tie-breaking logic becomes more critical. *Verification needed by empirical measurement.*

2. **Does forced diagonal orientation interact badly with `chainDirectedFlip` (Phase 4, Stage 1)?** The chain-directed flip already tries to align diagonals along ridges. If CCT's initial triangulation is already well-aligned, `chainDirectedFlip` may become a near-no-op (which is fine — it means the initial mesh is already good). But if the two algorithms disagree on diagonal direction for some edge cases, we could get unnecessary flips.

3. **Is median column spacing × 0.6 the right threshold for bridge support insertion?** Too low and we over-insert (extra vertices with minimal quality gain). Too high and wide bridges remain. This needs empirical tuning — start conservative (0.8) and reduce if dips persist.

4. **Should support vertices be protected from optimizer passes?** If an optimizer flips a diagonal that isolates a support vertex, the support becomes less effective. Adding support vertex indices to `protectedStripVertices` would prevent this, at the cost of reducing optimizer freedom.

5. **Do the forced diagonals in `chainFanQuad` ever create worse triangles than the alternatives?** In cells where the chain vertex is very close to a grid column (but not close enough to merge), the forced diagonal might create a very thin triangle. The `MERGE_THRESHOLD` (1e-4) should prevent this, but edge cases near the threshold might produce slivers.
