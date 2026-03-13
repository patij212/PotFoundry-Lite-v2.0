# Generator Round 26 — CDT Segment Inherent Aspect Ratio Problem

Date: 2026-03-06

## Problem Statement

Chain-strip CDT segments are **inherently slab-shaped**: ~9 columns wide × 1 band tall, producing a 5.8:1 U/T aspect ratio in CDT space. The Delaunay criterion optimizes minimum angles *in CDT space*, which means it naturally produces horizontally-elongated triangles. These appear as the "purely horizontal lines running from the base mesh to the feature edges" that persist across R24, R24.1, and R25.

Three rounds of companion-based fixes have failed:
- **R24**: 55.6% → 50.4% (partial improvement, still terrible)
- **R24.1**: 50.4% → 54.2% (independent normalization distorted Delaunay criterion — **REVERTED**)
- **R25**: 50.4% → 63.1% (companion explosion created MORE slivers — **REVERTED**)

**The fundamental insight**: No amount of companion manipulation can fix an aspect ratio problem that is baked into the CDT segment's *shape*. When a CDT domain is 5.8× wider than tall, the Delaunay triangulation will produce 5.8:1 aspect ratio triangles in the flat parts of the domain — this is mathematically inevitable.

## Root Cause Analysis

### The CDT Domain Shape Problem

The CDT segment geometry with `expansion = 4`:

```
CDT Segment Domain (UV space)
╔═══════════════════════════════════════════╗  ← T = tTop (row j+1)
║                                           ║  height: tGap ≈ 0.0023
╚═══════════════════════════════════════════╝  ← T = tBot (row j)
 ←────── 9 columns ≈ 0.0133 U-units ──────→
```

After uniform normalization (`scale = max(uRange, tRange) = uRange`):
```
Normalized CDT Domain
╔═══════════════════════════════════════════╗  ← t = 0.17
║                                           ║
╚═══════════════════════════════════════════╝  ← t = 0.0
 0.0                                        1.0
```

The CDT domain is a 1.0 × 0.17 rectangle. Delaunay triangulation in this domain tries to maximize minimum angles *within this rectangle*. In the flat regions (no companions), the optimal triangulation connects boundary vertices with long horizontal edges and short vertical strides — producing triangles where U-extent >> T-extent.

### Why Companions Can't Fix This

[ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L163-L176) — the CDT normalization code:

```typescript
const scale = Math.max(uRange, tRange);  // = uRange always (5.8:1)
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```

Companions create interior points, but in a 5.8:1 domain, the Delaunay criterion *still* prefers connecting points with horizontal edges because that maximizes angles in CDT space. R25 proved this: 580K companions → 63.1% violations. More points in a bad domain = more bad triangles.

### Why Edge Flips Can't Fix This

[ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L559-L619) — the edge flip pass. The R25 log showed `aspectRejects=589,908`. For each quad formed by two adjacent slivers, *both* possible diagonals are slivers because the quad itself is a horizontally-elongated parallelogram. Edge flipping is choosing between two bad options.

### The 3D Metric Mismatch

The core issue: 1 U-unit in parameter space corresponds to `2πR` mm in 3D (pot circumference), while 1 T-unit corresponds to `H` mm in 3D (pot height). For a typical pot with R=40mm, H=80mm:
- 1 U-unit = 251.3 mm
- 1 T-unit = 80 mm
- 3D ratio: ~3.1:1

A CDT segment spanning 0.0133 U-units × 0.0023 T-units corresponds to:
- 3D width: 0.0133 × 251.3 = **3.34 mm**
- 3D height: 0.0023 × 80 = **0.184 mm**
- **3D aspect ratio: 18:1**

The UV-space aspect (5.8:1) *understates* the 3D problem because U maps to circumference (larger than height for typical pots).

---

## Proposals

### Proposal 1: Reduce Expansion to 2 (Conservative)

**Idea**: Reduce `expansion` from 4 to 2, halving CDT segment width from 9 to 5 columns.

**Mechanism**:
- [ChainStripTriangulator.ts line 47](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L47): `expansion: 4` → `expansion: 2`  
- CDT segment width drops: 9 cols (0.0133) → 5 cols (0.0074)
- CDT aspect ratio: 5.8:1 → 3.2:1
- Normalized CDT domain: 1.0 × 0.31 instead of 1.0 × 0.17

**Mathematical basis**: The aspect ratio of Delaunay triangles in a rectangular domain is bounded by the domain's own aspect ratio (plus the Steiner point distribution). Halving the domain width roughly halves the worst-case triangle elongation. At 3.2:1, the CDT angles improve from ~10° minimum to ~17° minimum (in the flat boundary regions).

**Files affected**:
- [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L47) — one constant change
- [OuterWallTessellator.ts line 701](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L701) — companion spread already uses `chainStripConfig.expansion`; reducing this narrows companion placement too (addressed in Proposal 1b)

**Trade-offs**:
- Pro: One constant change. Massive aspect ratio improvement.
- Con: Narrower CDT segments mean more abrupt CDT→quad transitions at strip boundaries. Fewer columns for companion spread.
- Con: Companion placement in `emitUGradedFan()` is tied to expansion — reducing expansion narrows the U-range for companions.

**Expected impact**: Violations should drop from ~50% to ~25-35%. The boundary-interior slivers decrease proportionally with reduced width.

**Assumptions** (for Verifier to attack):
1. The CDT→quad transition at strip boundaries remains smooth with only 2 expansion columns
2. Companions confined to ±2 columns still provide sufficient T-density for equilateral triangles near chain features
3. Reducing CDT width doesn't expose new boundary artifacts at the left/right edges of narrower segments

---

### Proposal 1b: Decoupled Expansion — Narrow CDT, Wide Companions (Moderate)

**Idea**: Introduce a *second* expansion parameter. CDT segment width uses a narrow `cdtExpansion = 2` while companion placement continues to use the wider `companionExpansion = 4`.

**Mechanism**:
1. Add `cdtExpansion` field to `ChainStripConfig` (default: 2)
2. Keep `expansion` (renamed to `companionExpansion`) at 4 for `emitUGradedFan()`
3. CDT segment boundary calculation (OWT [line 1293-1297](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1293)) uses `cdtExpansion` to determine which cells are marked as chain-strip (quadMap = -1)
4. Companion fan placement still uses `companionExpansion = 4` to get wide companion spread
5. Companions outside the CDT segment boundary are *not* added to `stripInteriorVerts` — they are instead added to the adjacent quad-cell regions as refinement vertices

**Mathematical basis**: The CDT domain gets a 3.2:1 aspect (good angles), while companions still provide T-density up to 4 columns away from chain features (smooth grading). The outer 2 columns of companions land in quad-cell territory and get triangulated by the quad-cell diagonal-selection path, which already handles grid vertices well.

**Files affected**:
- [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L39-L47) — add `cdtExpansion` field
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L700-L703) — companion fan keeps `expansion` (now `companionExpansion`)
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1290-L1300) — strip width calculation uses `cdtExpansion`

**Trade-offs**:
- Pro: Best-case aspect ratio (narrow CDT) with best-case companion coverage (wide fan)
- Pro: Companions outside CDT boundary improve the quad cells they land in
- Con: Companions landing in quad-cell regions currently have no triangulation path — those regions use fixed diagonal choices. The companions would become unused orphans unless we add quad-cell Steiner point support.
- Con: More complex config; two separate expansion concepts

**Expected impact**: Similar to P1 for CDT violations (~25-35%), but smoother CDT→quad transitions thanks to wider companion spread.

**Assumptions** (for Verifier to attack):
1. Companions outside the CDT boundary can participate in quad-cell triangulation (THIS IS NOT CURRENTLY SUPPORTED — major implementation concern)
2. The narrowed CDT boundary correctly clips chain constraint edges at the new (narrower) boundary without leaving dangling constraint endpoints
3. `quadMap[j * cellsPerRow + i] = -1` marking is consistent with the new narrower CDT segments

---

### Proposal 2: 3D-Metric Anisotropic CDT Normalization (Moderate)

**Idea**: Replace the uniform CDT normalization with a normalization that equalizes *3D distances* rather than UV distances. This makes the CDT's Delaunay criterion optimize for equilateral triangles in 3D space, not in UV space.

**Mechanism**:
1. At CDT segment entry, compute the 3D-metric scale factors:
   ```
   // 3D distance per unit U at the segment's mean T-position:
   meanT = (tBot + tTop) / 2
   R = evaluateRadius(meanT)  // pot radius at this height
   scaleU_3D = 2 * π * R      // mm per full U-revolution
   
   // 3D distance per unit T:
   scaleT_3D = H              // pot height in mm
   
   // Metric ratio:
   metricRatio = scaleU_3D / scaleT_3D
   ```
2. Normalize CDT points as:
   ```
   u_norm = (u - uMin) / uRange
   t_norm = (t - tBase) / tRange * metricRatio  // stretch T by metric ratio
   ```
   When `metricRatio > 1` (circumference > height, typical), this *stretches* the T-axis relative to U, making the CDT domain more square.

3. For R=40mm, H=80mm: `metricRatio = 251.3/80 = 3.14`. The CDT domain becomes:
   ```
   u: [0, 1] × t: [0, 0.17 × 3.14] = [0, 0.534]   →  aspect ≈ 1.87:1
   ```
   Much closer to square.

**Why this is different from R24.1**: R24.1 used *independent* normalization: `u/uRange` and `t/tRange` — both axes mapped to [0,1] regardless of geometry. That created a 1:1 *UV* aspect but a 1:5.8 *3D* aspect, which is worse than the original 5.8:1. The correct anisotropy scales by the 3D-metric, not by the UV-range.

**Mathematical basis**: The Delaunay criterion maximizes the minimum angle. When the parameterization is chosen so that equal CDT distances === equal 3D distances, the Delaunay optimum coincides with the 3D-optimal triangulation. This is the standard approach in computational geometry for parameterized surfaces (Chew '93, Boissonnat et al. '02).

**Files affected**:
- [ChainStripTriangulator.ts lines 163-176](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L163-L176) — replace `scale = max(uRange, tRange)` with metric-aware normalization. ~10 lines changed.
- Need to pass pot geometry (radius function, height) into `cdtTriangulateStrip()` or compute from the vertex 3D positions already available.

**Computing metric without new parameters**: The 3D positions are available in the vertex buffer at this point. For each CDT segment, we can estimate the 3D U-scale and T-scale from the boundary vertices:
```
// Bottom row: left and right 3D positions
p3D_botLeft = positions3D[bot[0].idx]
p3D_botRight = positions3D[bot[bot.length-1].idx]
segWidth3D = distance(p3D_botLeft, p3D_botRight)

// Left boundary: top and bottom 3D positions
p3D_topLeft = positions3D[top[0].idx]
segHeight3D = distance(p3D_botLeft, p3D_topLeft)

metricRatio = (segWidth3D / uRange) / (segHeight3D / tRange)
```
This per-segment metric uses actual 3D vertex positions — no new parameters needed. The positions are already in the interleaved vertex buffer.

**Trade-offs**:
- Pro: Directly targets the root cause — makes Delaunay criterion work in 3D-equivalent space
- Pro: No change to companion strategy, expansion, or segment boundaries
- Pro: Well-established technique in computational geometry
- Con: Requires passing 3D positions to `cdtTriangulateStrip()` (currently receives only UV data)
- Con: Per-segment metric computation adds O(1) cost per segment (negligible)
- Con: Near pot rim (tiny radius), metricRatio drops → T-stretching decreases → aspect may worsen locally (but rim has few chain features)

**Expected impact**: Violations should drop dramatically — from ~50% to ~10-20%. The Delaunay criterion directly optimizes for 3D triangle quality instead of UV triangle quality.

**Assumptions** (for Verifier to attack):
1. The 3D positions are available when `cdtTriangulateStrip()` is called (they should be — OWT has the GPU-evaluated positions by this point)
2. The local 3D metric approximation (using boundary vertex positions) is accurate enough — the pot radius varies slowly across 1 band height, so a single metric per segment suffices
3. Anisotropic normalization doesn't break the winding-direction computation (cross product in UV space) — the winding check at [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L318-L328) uses CDT-normalized coordinates; stretching T changes cross-product magnitudes but NOT sign, so winding remains correct
4. Constraint edge placement is unaffected (constraints are specified as vertex pairs, not coordinates)
5. The `exterior: true` filter and centroid bounds check still work correctly in the stretched domain (they check [0,1] × [0,1] — the stretched T may exceed 1.0, requiring adjusted bounds)

---

### Proposal 3: Multi-Band CDT Segments (Radical)

**Idea**: Instead of each CDT segment covering 1 row band (tGap ≈ 0.0023), merge consecutive bands that share the same chain-strip column range into multi-band CDT segments spanning 2-4 bands.

**Mechanism**:
1. In the band-scanning loop at [OWT line 1282](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1282), detect consecutive bands where `colHasChain[i]` produces the same (or overlapping) segment column ranges.
2. Merge these bands into a single CDT segment: the segment spans rows j to j+K (where K=2-4), with tRange = K × tGap.
3. The merged segment has height K × 0.0023, same width 0.0133 → aspect = 0.0133 / (K × 0.0023) = 5.8/K:
   - K=2: aspect 2.9:1
   - K=3: aspect 1.9:1 (excellent)
   - K=4: aspect 1.4:1 (near-square)
4. Internal row boundaries (between merged bands) become CDT constraint edges to preserve row topology.

**Mathematical basis**: The CDT domain aspect improves linearly with number of merged bands. At K=3, the domain is nearly square, giving the Delaunay criterion maximum freedom to produce equilateral triangles.

**Files affected**:
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1270-L1510) — major refactor of the band scanning and strip collection loop
- [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L144-L280) — cdtTriangulateStrip needs to handle multiple internal row boundaries as additional constraint edges
- Companion placement — companions already emit for bands above and below, but multi-band CDT would incorporate them differently

**Trade-offs**:
- Pro: Dramatic aspect ratio improvement (potentially 1.9:1 at K=3)
- Pro: Fewer CDT invocations (merged bands → fewer CDT calls)
- Con: **Major refactor** — the entire strip collection logic assumes 1 band per CDT segment
- Con: Internal row boundaries as constraint edges add complexity to CDT constraint management
- Con: Chain features may enter/exit across merged bands — segment column ranges may differ between bands, requiring "staircase" segment boundaries
- Con: The existing companion bucket system (`interiorByBand`) assumes single-band granularity
- Con: High regression risk — touches the deepest part of the tessellation pipeline

**Expected impact**: At K=3, violations could drop to ~10-15%. But implementation risk is very high.

**Assumptions** (for Verifier to attack):
1. Consecutive bands have sufficiently overlapping chain-strip column ranges to merge (if chains are diagonal, column ranges shift between bands → poor overlap → can't merge)
2. Internal row boundary constraint edges don't cause CDT failures (row boundaries are horizontal lines across the full segment width — many constraint edges)
3. Multi-band CDT segments don't exceed cdt2d's practical limits (a 3-band segment has ~3× the vertices → still manageable)
4. The vertex duplication strategy (topDupMap) works across multi-band boundaries

---

### Proposal 4: Post-CDT Laplacian Smoothing + Steiner Insertion (Moderate)

**Idea**: After CDT triangulation and edge flipping, add a vertex smoothing pass that relocates interior CDT vertices (companions) to minimize the aspect ratio of their surrounding triangle fan. For unrepairable slivers, insert Steiner points at the circumcenter.

**Mechanism**:
1. **Laplacian Smoothing** (Phase D in ChainStripOptimizer):
   - For each companion (interior) vertex in a chain-strip region:
     - Compute the centroid of its 1-ring neighbors (Laplacian)
     - Move the vertex toward the centroid by a damping factor (0.3-0.5)
     - Project the moved position back onto the parametric surface (GPU re-evaluation or linear interpolation)
     - Accept move only if worst aspect ratio in the 1-ring improves
   - Iterate 3-5 times
   
2. **Steiner Point Insertion** (Phase E):
   - After smoothing, scan for remaining triangles with aspect > 8:1
   - For each such sliver, compute the circumcenter
   - If circumcenter is inside the CDT segment and far from constraint edges:
     - Insert a new vertex at the circumcenter
     - Re-triangulate the surrounding cavity
   - Cap at 500 insertions to prevent runaway

**Mathematical basis**: Laplacian smoothing has well-established convergence properties for mesh quality improvement. Moving a vertex toward its neighbor centroid reduces the max-angle and improves aspect ratios of surrounding triangles. Chew's algorithm (Steiner insertion at circumcenters) guarantees no angle < 30° in the limit.

**Why this is different from edge flipping**: Edge flips can only swap diagonals of existing quads. Vertex smoothing changes the *positions* of vertices, and Steiner insertion adds *new* vertices. Both provide degrees of freedom that edge flipping lacks.

**Files affected**:
- [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts) — add Phase D (smoothing) and Phase E (Steiner). ~100-150 lines.
- Need vertex-to-triangle adjacency (1-ring) — currently built for edge flipping, needs extension

**Trade-offs**:
- Pro: Works within the existing pipeline — post-processing, no CDT changes
- Pro: Proven techniques from computational geometry
- Pro: Smoothing is conservative (accept only improvements)
- Con: Smoothing moves companion positions away from their computed locations — they no longer sit at their original T-ladder/fan positions
- Con: 3D surface re-projection is needed (moving in UV creates vertices off-surface). Without GPU re-evaluation, must use bilinear interpolation of neighboring grid positions — introduces approximation error
- Con: Steiner point insertion requires buffer space for new vertices (the same buffer overflow concern that killed R25-P3, see [master-approval-R25](potfoundry-web/docs/plans/master-approval-R25-companion-coverage-gaps.md#L47-L49))
- Con: Doesn't fix the root cause — patches symptoms

**Expected impact**: Violations could drop from ~50% to ~30-40%. Smoothing helps but can't overcome the fundamental domain shape mismatch.

**Assumptions** (for Verifier to attack):
1. Interior companion vertices can be identified reliably post-CDT (they are — indices beyond gridVertexCount that are not constraint endpoints)
2. Bilinear interpolation of 3D positions is accurate enough for moved vertices
3. Constraint edge vertices are excluded from smoothing (they must be — moving constraint endpoints would violate the chain path)
4. The Float32Array vertex buffer has room for Steiner points (IT PROBABLY DOESN'T — same buffer overflow concern as R25-P3)
5. Smoothing convergence: 3-5 iterations are sufficient for meaningful improvement

---

### Proposal 5: Hybrid — Reduce Expansion + Metric-Aware Normalization (Recommended)

**Idea**: Combine Proposals 1 and 2: reduce CDT expansion to 2 AND apply 3D-metric-aware normalization. The two fixes are orthogonal and multiplicative in effect.

**Mechanism**:
1. Set `expansion: 2` → CDT domain aspect in UV: 3.2:1
2. Apply 3D-metric normalization → for R=40mm, H=80mm, further correction by 3.14 → effective CDT domain aspect: 3.2 / 3.14 ≈ **1.02:1** (nearly square!)
3. Even for pots where the metric ratio is smaller (short wide pots, R=60mm, H=40mm): metricRatio = 2πR/H = 9.42, CDT aspect = 3.2/9.42 ≈ 0.34:1 → T becomes the long axis, but the Delaunay criterion handles either orientation well

**Mathematical basis**: 
- Expansion reduction: 5.8:1 → 3.2:1 (geometric change)
- Metric normalization: 3.2:1 → ~1:1 (re-parameterization)
- Combined: the CDT domain becomes approximately isotropic in 3D metric
- The Delaunay criterion in an isotropic domain produces near-equilateral triangles
- This is the *correct* solution from first principles: parameterize the CDT domain so equal CDT distances ≈ equal 3D distances

**Files affected**:
- [ChainStripTriangulator.ts line 47](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L47) — `expansion: 2`
- [ChainStripTriangulator.ts line 163-176](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L163-L176) — metric-aware normalization
- [ChainStripTriangulator.ts function signature](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L144) — pass 3D positions reference
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts) — pass 3D positions to `triangulateChainStrip()` call

**Trade-offs**:
- Pro: Near-optimal CDT domain shape for 3D triangle quality
- Pro: Moderate code change (1 constant + ~15 lines of normalization)
- Pro: Two independent improvements that compound
- Con: Narrower CDT segments (e=2 vs e=4) — companion spread reduced
- Con: Metric computation adds a dependency on 3D positions in the CDT path

**Expected impact**: Violations should drop dramatically — from ~50% to **~5-15%**. Near-isotropic CDT domain produces fundamentally better triangles.

**Assumptions** (for Verifier to attack):
1. All assumptions from P1 and P2 apply
2. The combination doesn't introduce unexpected interactions (it shouldn't — expansion affects domain *size*, metric affects domain *shape*)
3. With e=2, companion fan spread to ±2 columns is still sufficient for T-density around chains
4. The T-bounds check at [CST line 284-285](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L284-L285) needs adjustment because the stretched T-coordinate may exceed 1.0 in the normalized domain:
   ```
   tBoundsMax = metricRatio > 1 ? metricRatio + 0.01 : 1.01
   ```

---

## Recommended Approach

**Primary: Proposal 5 (Hybrid — Reduce Expansion + Metric-Aware Normalization)**

Justification:
1. It addresses the root cause at both levels: segment geometry (expansion) AND parameterization (metric)
2. The two fixes are orthogonal — even if one is less effective than predicted, the other provides a floor
3. Moderate implementation complexity (~20 lines changed total)
4. No architectural changes — the CDT pipeline, companion system, and edge flip pass all remain as-is
5. Well-grounded in computational geometry theory

**Fallback: Proposal 1 alone** — if metric computation proves difficult to integrate (positions not available, too much plumbing), reducing expansion to 2 alone is a meaningful ~40% improvement with a one-line change.

**Reject Proposal 3** — Multi-band CDT is the correct long-term solution but the refactoring risk is too high for an iteration-26 fix. Consider for v3.0.

**Reject Proposal 4** — Post-CDT smoothing is a band-aid that doesn't address the root cause, and Steiner insertion has the same buffer overflow problem that killed R25-P3.

**Defer Proposal 1b** — Decoupled expansion is elegant but depends on quad-cell Steiner point support that doesn't exist. If P5 underperforms, P1b would be the next architectural evolution.

## Implementation Sketch for Proposal 5

### Change 1: Reduce expansion (1 line)

In [ChainStripTriangulator.ts line 47](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L47):
```typescript
// Before:
expansion: 4,
// After:
expansion: 2,
```

### Change 2: Pass 3D positions to CDT

Add `positions3D: Float32Array` parameter to `triangulateChainStrip()` and `cdtTriangulateStrip()`. Thread it from the call site in OWT where `vertexPositions3D` (the GPU-evaluated Float32Array) is available.

### Change 3: Metric-aware normalization (~15 lines)

In `cdtTriangulateStrip()`, replace the normalization block:
```typescript
// BEFORE:
const scale = Math.max(uRange, tRange);
// points.push([(u - uMin) / scale, (t - tBase) / scale]);

// AFTER:
// Compute per-segment 3D metric from boundary vertex positions.
// This scales T relative to U so equal CDT distances ≈ equal 3D distances.
const botLeft3D = pos3(positions3D, bot[0].idx);
const botRight3D = pos3(positions3D, bot[bot.length - 1].idx);
const topLeft3D = pos3(positions3D, top[0].idx);
const seg3DWidth = Math.sqrt(dist3sq(botLeft3D, botRight3D));
const seg3DHeight = Math.sqrt(dist3sq(botLeft3D, topLeft3D));

// Metric ratio: how many mm per U-unit vs mm per T-unit
const metricU = seg3DWidth / Math.max(uRange, 1e-12);   // mm per U-unit
const metricT = seg3DHeight / Math.max(tRange, 1e-12);   // mm per T-unit
const metricRatio = metricU / Math.max(metricT, 1e-12);

// Scale: normalize U to [0,1], stretch T by metric ratio
// so equal CDT-space distances ≈ equal 3D distances
const uScale = uRange;
const tScale = tRange / metricRatio;  // shrink tRange by metricRatio
const combinedScale = Math.max(uScale, tScale); // final uniform scale

// addVertex normalization:
// points.push([(u - uMin) / combinedScale, (t - tBase) / combinedScale * metricRatio]);
// Simplified: normalize to roughly [0,1] × [0,1] in 3D-equivalent space
```

### Change 4: Adjust centroid bounds filter

The centroid filter at [CST lines 281-287](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L281-L287) uses hardcoded `[0, 1.01]` for T-bounds. With metric stretching, the T-coordinate in CDT space may exceed 1.0. Adjust `tBoundsMax` to account for stretching.

## Open Questions

1. **Are 3D positions available at CDT time?** The OWT function has `vertexPositions3D` from GPU evaluation. Need to verify this is populated before the CDT loop runs. (I believe it is — GPU evaluation is Step 1, CDT is Step 6.)

2. **Does reducing expansion to 2 break any existing tests?** The test suite (1896 tests) may have expectations calibrated for e=4. Need to check for hardcoded companion counts or strip widths.

3. **What's the optimal expansion value?** I proposed 2, but 1 might work too (aspect 1.9:1 in UV). With metric normalization, even e=3 might be sufficient. The Verifier should argue whether e=2 is too aggressive.

4. **Edge case: very tall, narrow pots** (H >> 2πR) — the metric ratio would be < 1, and T-stretching would go the other direction. Is this handled correctly? (Yes — the formula is symmetric. Low metricRatio means T is already relatively tall, so less stretching is needed.)

5. **Does companion placement need adjustment for e=2?** Currently `emitUGradedFan()` uses `col ± expansion` for companion spread. With e=2, shells 5-7 (fractions 0.45, 0.72, 1.0) may place companions very close to the segment boundary. Should `SHELL_FRACTIONS` be adjusted?
