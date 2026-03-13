# Chain Strip Redesign — Feature-Only Constraints with Graded Bridging Triangulation

**Date:** 2026-03-01  
**Branch:** `refactor/core-migration`  
**Status:** Proposed  
**Supersedes:** Parts of `Feature-Edge Dense Retriangulation — v23.0.md`, `2026-02-27-chain-bridge-topology-plan.md`  
**Depends on:** Fix round completed 2026-03-01 (backtrack removal + support-to-support filter + synthetic constraint removal)

---

## 1. Problem Statement

### 1.1 What We Fixed

The 2026-03-01 fix round proved that **primary feature chain edges are already enforced** (234/235 = 99.6%). The real damage came from:

- **Support-to-support constraint edges** creating crossing patterns that forced the sweep into backtracks
- **Backtrack triangles** overlapping with sweep-generated triangles (11,094 at d=12)
- **Synthetic constraints** for unconstrained support vertices adding unnecessary complexity

We disabled all three. Tests pass, build succeeds, feature edges survive.

### 1.2 What Remains Wrong

Even with these fixes, the chain strip triangulation has fundamental structural problems:

1. **Long slivers**: Triangles stretch from feature chain vertices directly to distant grid corners. A feature vertex at u=0.352 connects to grid columns at u=0.2 and u=0.4 — creating aspect ratios of 8:1 to 20:1 in 3D space.

2. **No transition zone**: The density jumps from "chain resolution" (sub-column spacing) to "grid resolution" (full column spacing) in a single triangle. There is no gradual falloff.

3. **Support vertices are orphaned**: With support-to-support constraints removed and synthetic constraints removed, the 700–86K support vertices still exist in the merged rows but have no structural role. The sweep connects them arbitrarily, sometimes creating worse topology than having fewer vertices.

4. **UV-space triangulation on a curved surface**: The sweep and CDT both operate in UV space. A triangle that looks equilateral in UV can have aspect ratio 5:1 in 3D near the pot's equator (where circumference stretch is maximum). Feature edges near the widest radius suffer the most.

5. **No direct-connection prohibition**: Nothing prevents a triangle from having one edge on the feature chain and the opposite vertex on the grid boundary — the worst possible sliver.

### 1.3 Requirements (from user)

> "Only the feature chain edges should be constraints. The rest of the chain strip mesh should be linking the feature chains to the mesh without forcing it to take any uniform shape but triangulating the surface ensuring high density by the edge which gradually links to the mesh."

> "The strip triangles should not be long slivers, no triangle is allowed to link the feature edge and mesh directly, aspect ratio of each triangle in the strip should be roughly even in the 3D space, especially when triangulating the sharp features with distance from the axis."

**Formal requirements:**

| # | Requirement | Metric |
|---|------------|--------|
| R1 | Only feature-to-feature chain edges are hard constraints | Zero support-to-support or support-to-feature constraints passed to triangulator |
| R2 | No triangle directly links a feature edge vertex to a grid boundary vertex | Every triangle incident on a feature chain vertex has all 3 vertices within the transition zone |
| R3 | Graded density: high near feature, smooth falloff to grid | Adjacent triangle areas differ by ≤ 2:1 ratio |
| R4 | Aspect ratio ≤ 4:1 in 3D space for all chain strip triangles | Measured ad enforced using actual 3D vertex positions after GPU evaluation |
| R5 | Sharp features at large radius (far from axis) get proportionally more vertices | Metric-aware vertex insertion scales with circumferential stretch |
| R6 | No performance regression | Chain strip triangulation completes in ≤ 50ms at d=4, ≤ 200ms at d=12 |
| R7 | Watertight boundary stitching | Zero non-manifold edges at strip/grid boundary |

---

## 2. Architectural Review

### 2.1 Current Architecture

```
Feature Detection → Chain Linking → Grid Construction → UV-Snap
     ↓
insertChainStripVertices (8 density passes)
     ↓                          → Companions, Shadows, Flanks (pointIdx = -1)
     ↓                          → Chain edges between ALL chain+support pairs
     ↓
buildMergedRow: interleave grid + chain + support → sorted StripVertex[]
     ↓
Per-band: colHasChain → CDT or sweep with ALL chain edges as constraints
     ↓
Batch 6 dedup → Edge verification → MeshValidator
```

**Fundamental flaw**: The support vertex system was designed to provide material for the triangulator AND to constrain the triangulation via edges. But as we proved, constraint edges on support vertices are harmful — they cause backtracks and overlapping triangles. Without constraints, the support vertices are just scattered UV points that the sweep connects opportunistically.

### 2.2 Proposed Architecture

```
Feature Detection → Chain Linking → Grid Construction → UV-Snap
     ↓
Phase A: Feature-only constraint extraction
     ↓    → Only edges where BOTH pointIdx ≥ 0
     ↓
Phase B: Graded transition zone vertex insertion
     ↓    → Concentric "rings" of vertices radiating from each chain edge
     ↓    → Ring spacing follows geometric progression (1.0×, 1.5×, 2.25×, ...)
     ↓    → Vertex count per ring decreases with distance from chain
     ↓    → Metric-aware: ring spacing in UV adjusted for 3D stretch
     ↓
Phase C: buildMergedRow (unchanged — interleave all vertices)
     ↓
Phase D: Per-band CDT triangulation
     ↓    → Feature chain edges as ONLY constraints
     ↓    → Transition vertices participate freely (no constraint edges)
     ↓    → CDT produces Delaunay-optimal angles among all vertices
     ↓
Phase E: 3D quality verification
     ↓    → Post-GPU-eval: measure aspect ratios in 3D
     ↓    → Flag violations for optional Steiner refinement
     ↓
Batch 6 dedup → Edge verification → MeshValidator
```

### 2.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **CDT-only for chain strips** (drop sweep mode) | Sweep cannot produce graded density. CDT naturally optimizes angles among all available vertices. With feature-only constraints (few hundred, not tens of thousands), CDT is fast enough. |
| **Remove all support vertex constraint edges** | Proven harmful. Support vertices serve as CDT material only — their position guides triangle quality, not their edges. |
| **Concentric ring insertion** replaces 8 ad-hoc density passes | The current 8-pass system creates vertices at fixed offsets without considering 3D geometry or gradation. Rings provide mathematically graded density. |
| **Metric-aware vertex placement** | Near the pot's equator, UV-space distances underestimate 3D distances by up to 3:1. Ring spacing must account for surface stretch. |
| **Minimum-layer guarantee** | Between any feature vertex and the nearest grid boundary, at least 2 layers of transition vertices ensure R2 (no direct feature-to-grid triangles). |

---

## 3. Detailed Design

### 3.1 Phase A: Feature-Only Constraint Extraction

**Location:** `OuterWallTessellator.ts`, constraint collection section (~line 1033)

**Current state:** After the 2026-03-01 fix, we already skip `cv0.pointIdx < 0 && cv1.pointIdx < 0` (support-to-support). We still pass feature-to-support edges.

**Change:** Tighten the filter to feature-to-feature only:

```typescript
// BEFORE (current):
if (cv0.pointIdx < 0 && cv1.pointIdx < 0) continue;  // skip support-to-support

// AFTER (proposed):
if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;  // ONLY feature-to-feature
```

**Impact:**
- Constraint count drops from ~500 to ~235 (only real feature edges)
- CDT runs faster with fewer constraints
- Zero support edges can cause backtracks or crossings

**Risk:** Feature-to-support edges currently help connect features to their companion vertices. With CDT, these connections happen naturally via Delaunay optimality — the CDT will create edges between nearby vertices regardless of whether they're constrained.

**Validation:** Compare enforced feature edge count before and after. Must remain at 234/235 (or higher).

---

### 3.2 Phase B: Graded Transition Zone Vertex Insertion

This is the largest change. Replace `insertChainStripVertices()` (the 8 density passes) with a new `insertGradedTransitionVertices()` function.

#### 3.2.1 Design Principles

1. **Concentric rings**: For each feature chain edge segment, generate vertex "rings" radiating outward perpendicular to the edge direction
2. **Geometric grading**: Ring spacing follows a geometric progression — each ring is 1.5× farther from the chain than the previous
3. **Layer count = f(strip width)**: The number of rings adapts to fill the gap between feature and grid boundary
4. **Metric awareness**: Ring spacing in UV is adjusted by the local surface stretch so that 3D spacing is approximately uniform
5. **Vertex count per ring decreases**: Inner rings (near feature) have vertices at every chain vertex projection; outer rings have vertices only at every 2nd or 3rd position
6. **No constraint edges on transition vertices**: They participate in CDT purely by position

#### 3.2.2 Algorithm: `insertGradedTransitionVertices()`

```
Input:
  - featureChainEdges: [v0, v1][] — only feature-to-feature edges
  - chainVertices: ChainVertex[] — all feature chain vertices
  - gridVertexCount, numU, numT, activeTPositions, unionU
  - stretchEstimate(u, t) → number — local circumferential stretch factor

Output:
  - transitionVertices: ChainVertex[] — appended to chainVertices
  - (NO edge output — transition vertices have no constraint edges)

Algorithm:

For each feature chain edge (v0, v1) with rowGap = 1:
    // 1. Compute edge midpoint and normal direction in UV space
    uMid = (cv0.u + cv1.u) / 2
    tMid = (activeTPositions[cv0.rowIdx] + activeTPositions[cv1.rowIdx]) / 2
    edgeDir = normalize(cv1.u - cv0.u, cv1.rowIdx - cv0.rowIdx)
    normalDir = perpendicular(edgeDir)  // points away from chain

    // 2. Compute local stretch factor
    stretch = stretchEstimate(uMid, tMid)  // typically 1.0-3.0
    // At large radius (equator), UV distances underestimate 3D by this factor
    // Compensate: place vertices closer in UV so they're correct in 3D

    // 3. Compute base spacing
    colSpacing = 1.0 / numU
    rowSpacing = activeTPositions[row+1] - activeTPositions[row]
    baseSpacing = min(colSpacing, rowSpacing) / stretch
    // baseSpacing is the UV-space distance that equals ~colSpacing in 3D

    // 4. Determine number of grading rings
    // Distance from edge to nearest grid boundary (in UV, stretch-corrected)
    distToGrid = computeDistanceToGridBoundary(uMid, tMid, normalDir, unionU, activeTPositions)
    // Geometric series: baseSpacing × (1 + r + r² + ... + r^(n-1)) = distToGrid
    // where r = gradingRatio (1.5)
    gradingRatio = 1.5
    nRings = floor(log(1 + distToGrid * (gradingRatio - 1) / baseSpacing) / log(gradingRatio))
    nRings = clamp(nRings, 2, maxRings)  // minimum 2 rings enforces R2

    // 5. Insert ring vertices
    for ring = 1 to nRings:
        ringDist = baseSpacing × (gradingRatio^ring - 1) / (gradingRatio - 1)
        // Number of vertices on this ring — more near feature, fewer far away
        nVertsOnRing = max(2, floor(edgeLength / (baseSpacing * gradingRatio^(ring-1))))

        for k = 0 to nVertsOnRing-1:
            // Parametric position along the edge
            t_param = (k + 0.5) / nVertsOnRing
            uBase = lerp(cv0.u, cv1.u, t_param)
            rowBase = round(lerp(cv0.rowIdx, cv1.rowIdx, t_param))

            // Offset perpendicular to edge (both sides)
            for side in [-1, +1]:
                uOffset = uBase + side * normalDir.u * ringDist
                rowOffset = clamp(rowBase + side * normalDir.t * ringDist / rowSpacing, 0, numT-1)

                // Guard: skip if too close to grid column (< 1e-6)
                // Guard: skip if near seam (u < 0.005 or u > 0.995)
                // Guard: skip if duplicate (toFixed(4) key)
                // Guard: skip if outside mesh bounds

                insertVertex(uOffset, round(rowOffset), pointIdx = -1, chainId)
```

#### 3.2.3 Stretch Estimation

Before GPU evaluation (Phase 4), we don't have exact 3D positions. But we can estimate circumferential stretch from the pot's parametric definition:

```typescript
function estimateStretch(u: number, t: number, params: PotParams): number {
    // The pot radius at height t: R(t) = lerp(Rb, Rt, t^expn)
    // Circumferential stretch = 2π × R(t) / numU
    // This is proportional to R(t)
    // We normalize so that the minimum stretch = 1.0
    const R = computeRadiusAtT(t, params);
    const Rmin = Math.min(params.Rb, params.Rt);
    return R / Rmin;  // 1.0 at narrowest, up to ~2-3 at widest
}
```

This is a reasonable proxy. After GPU evaluation, we can optionally re-check and add vertices if the estimate was too coarse (Phase E).

#### 3.2.4 Comparison with Current 8-Pass System

| Aspect | Current (8 passes) | Proposed (graded rings) |
|--------|-------------------|------------------------|
| **Vertex placement** | Fixed offsets: ±colSpacing/2, /3, /4, /6 | Geometric progression from edge, metric-aware |
| **Density control** | 8 discrete levels (d=1 to d=12) | Continuous, adapts to strip width and surface curvature |
| **Transition quality** | Abrupt: one triangle from feature to grid | Graded: 2+ layers between feature and grid |
| **Constraint edges** | Created for passes 1-3 (companions, shadows, flanks) | None — vertices participate freely in CDT |
| **3D awareness** | None (pure UV offsets) | Stretch-adjusted spacing |
| **Vertex budget** | Fixed per density level | Adaptive per feature edge, budget-capped |
| **Complexity** | 8 separate passes, each with unique offset logic | Single parametric algorithm |

#### 3.2.5 Vertex Budget

The number of transition vertices is bounded by:

```
maxTransitionVertices = nFeatureEdges × nRings × 2 × nVertsPerRing × 2 (both sides)
```

For typical parameters:
- nFeatureEdges = 235
- nRings = 3 (average)
- nVertsPerRing = 4 (average)
- Both sides: × 2

Total: 235 × 3 × 4 × 2 = **5,640 transition vertices**

This is comparable to the current system at d=4 (~1,150 support vertices with edges) but produces much better topology because the vertices are geometrically graded rather than ad-hoc.

---

### 3.3 Phase C: buildMergedRow (Minimal Changes)

`buildMergedRow` is fundamentally sound. It interleaves grid and chain vertices by U coordinate, sorts, and deduplicates. The transition vertices from Phase B are ChainVertex objects with `pointIdx = -1` and will be handled identically to current support vertices.

**Changes needed:**
1. **Remove edge-related logic for support vertices** — since transition vertices have no edges, the companion edge tracking in buildMergedRow can be simplified
2. **Verify sort stability** — with more vertices per row, the sort+dedup post-pass must remain stable. Currently uses `a.u - b.u` comparison which is fine.

---

### 3.4 Phase D: CDT-Only Chain Strip Triangulation

#### 3.4.1 Drop Sweep Mode for Chain Strips

**Decision:** Make CDT the sole triangulation mode for chain-containing bands. The sweep mode was designed for speed when constraints were numerous (~126K at d=12). With feature-only constraints (~235), CDT is fast enough and produces superior results.

**Rationale:**
- CDT guarantees all constraint edges appear as mesh edges (100% enforcement)
- CDT maximizes minimum angle among all vertices (Delaunay property)
- CDT naturally connects nearby vertices, utilizing transition ring vertices optimally
- Sweep cannot produce graded density — it connects vertices in scan-line order
- With ~235 constraints (down from ~126K), CDT runs in microseconds per strip

**The sweep and sweep-repair modes remain in `ChainStripTriangulator.ts`** as fallbacks for CDT failure (cdt2d throwing exceptions on degenerate inputs). But the default and recommended mode becomes CDT-only.

#### 3.4.2 CDT Input Preparation

The existing CDT implementation (`cdtTriangulateStrip`) is mostly correct. Changes needed:

1. **Constraint filtering**: Only feature-to-feature edges are passed. This is already handled by Phase A.

2. **Normalization refinement**: Currently normalizes U and T independently to [0,1]. This distorts triangle shapes when the band is much wider than tall. Instead, normalize to preserve aspect ratio:

```typescript
// BEFORE:
points.push([(u - uMin) / uRange, (t - tBase) / tRange]);

// AFTER — preserve 3D aspect ratio:
const scale = Math.max(uRange, tRange);
points.push([(u - uMin) / scale, (t - tBase) / scale]);
```

This ensures CDT sees the true geometric proportions and produces better angles.

3. **Boundary constraint simplification**: Currently emits boundary constraints for all bot/top edges and left/right boundaries. With feature-only constraints, this is cleaner — fewer edges to manage, fewer intersection checks.

#### 3.4.3 Quality Metrics in CDT Output

Add per-strip quality logging:

```typescript
interface StripQuality {
    minAngle: number;      // minimum angle (degrees) in UV space
    maxAspect: number;     // maximum aspect ratio in UV space
    avgAspect: number;     // average aspect ratio
    featureDirectCount: number;  // triangles with edge on feature AND vertex on grid boundary
    triangleCount: number;
}
```

**R2 enforcement**: After CDT, scan triangles for the "direct connection" pattern:

```
For each triangle (a, b, c):
  Let featureCount = count of vertices that are feature chain vertices (pointIdx >= 0)
  Let gridBoundaryCount = count of vertices that are grid boundary vertices (not chain, at strip edge)
  If featureCount >= 1 AND gridBoundaryCount >= 1:
    → This triangle violates R2 — flag for Steiner point insertion
```

If violations are found, insert a midpoint vertex on the offending edge and re-run CDT on the local patch. In practice, with 2+ ring layers, this should rarely trigger.

---

### 3.5 Phase E: Post-GPU 3D Quality Verification

After GPU evaluation (Phase 4) provides 3D vertex positions, verify chain strip triangle quality:

#### 3.5.1 3D Aspect Ratio Check

```typescript
function computeAspectRatio3D(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number]
): number {
    const e0 = dist3D(p0, p1);
    const e1 = dist3D(p1, p2);
    const e2 = dist3D(p2, p0);
    const longest = Math.max(e0, e1, e2);
    const shortest = Math.min(e0, e1, e2);
    return longest / shortest;  // 1.0 = equilateral, higher = worse
}
```

For each chain strip triangle, compute 3D aspect ratio. Log statistics:

```
Chain strip 3D quality: min_angle=22.4° max_aspect=3.8:1 avg_aspect=1.9:1 violations(>4:1)=12/3200
```

#### 3.5.2 Optional Steiner Refinement (Post-GPU)

If violations exceed a threshold (e.g., >5% of chain strip triangles with aspect ratio >4:1):

1. For each violating triangle, compute circumcenter in 3D (project back to UV via inverse metric)
2. Insert Steiner point at circumcenter UV position
3. GPU-evaluate the new vertex to get 3D position
4. Re-run CDT on the affected strip band
5. Cap at 2 iterations to prevent infinite refinement

**This phase is optional** and should be user-configurable (checkbox in export dialog). For most pots, the graded ring insertion from Phase B will achieve R4 without post-hoc refinement.

#### 3.5.3 Grading Ratio Verification

After GPU evaluation, verify that the density grading is smooth:

```
For each pair of adjacent chain strip triangles:
  areaRatio = max(area1, area2) / min(area1, area2)
  If areaRatio > 2.0:
    Log warning with triangle indices
```

This validates R3 (adjacent triangles differ by ≤ 2:1).

---

## 4. Implementation Plan

### 4.1 Batch 1: Feature-Only Constraints (R1)

**Effort:** Small — single-line filter change + test update  
**Files:** `OuterWallTessellator.ts`  
**Risk:** Low — we already filter support-to-support; this tightens to feature-only

**Steps:**

1. Change constraint filter from `&&` to `||`:
   ```typescript
   if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;
   ```

2. Remove the now-dead code for synthetic constraint generation (already commented out from 2026-03-01 fix)

3. Update diagnostic logging — constraint count should drop to ~235

4. Run test suite — verify no regressions

5. Export test at d=1 and d=12 — verify feature edges still enforced (234/235)

**Success criteria:**
- segConstraints count ≈ 235 (feature edges only)
- Primary chain edge enforcement ≥ 234/235
- Zero support-to-support or feature-to-support constraints
- All existing tests pass

---

### 4.2 Batch 2: Graded Transition Vertex Insertion (R2, R3)

**Effort:** Medium — new algorithm replacing 8-pass system  
**Files:** `OuterWallTessellator.ts`  
**Risk:** Medium — changes vertex insertion fundamentally

**Steps:**

1. **Add stretch estimation function:**
   ```typescript
   function estimateCircumferentialStretch(
       t: number,
       params: { Rb: number; Rt: number; expn: number }
   ): number
   ```
   Computes radius ratio at height t vs minimum radius.

2. **Implement `insertGradedTransitionVertices()`:**
   - Input: feature chain edges, chain vertices, grid parameters
   - Algorithm: concentric ring insertion as described in 3.2.2
   - Output: appended ChainVertex entries (pointIdx = -1, no edges)
   - Parameters:
     - `gradingRatio = 1.5` (configurable)
     - `minRings = 2` (ensures R2 — no direct feature-to-grid)
     - `maxRings = 6` (budget cap)
     - `maxTransitionVertices = 10000` (hard cap)

3. **Replace `insertChainStripVertices()` call:** Wire new function into `buildCDTOuterWall()` at line ~655

4. **Keep `insertChainStripVertices()` code** (dead, behind feature flag) until new system is validated

5. **Update `chainStripDensity` slider semantics:**
   - d=1: minRings=2, gradingRatio=2.0 (coarse but valid)
   - d=4: minRings=3, gradingRatio=1.5 (balanced)
   - d=8: minRings=4, gradingRatio=1.3 (fine)
   - d=12: minRings=5, gradingRatio=1.2 (ultra-fine)

6. **Write tests:**
   - Ring count adapts to strip width
   - No vertex placed at seam or on grid column
   - Vertex count within budget
   - All transition vertices have pointIdx = -1

**Success criteria:**
- Graded density visible in exported mesh (triangle size increases smoothly from chain edge to grid)
- No triangle has one vertex on feature chain and another on grid boundary (R2)
- Adjacent triangle area ratio ≤ 2.5:1 (R3, measured post-export)

---

### 4.3 Batch 3: CDT Normalization Fix (R4)

**Effort:** Small — geometry normalization improvement  
**Files:** `ChainStripTriangulator.ts`  
**Risk:** Low — local change within CDT triangulation

**Steps:**

1. **Fix point normalization** to preserve aspect ratio:
   ```typescript
   const scale = Math.max(uRange, tRange);
   points.push([(u - uMin) / scale, (t - tBase) / scale]);
   ```

2. **Add per-strip quality metric collection:**
   - Minimum angle, maximum aspect ratio, triangle count
   - Log aggregated stats after all strips processed

3. **R2 enforcement scan:** After CDT, check for direct feature-to-grid triangles. If found, insert midpoint Steiner vertex and re-CDT the affected strip.

4. **Test:**
   - Synthetic strip with known optimal triangulation
   - Aspect ratio improvement vs. current normalization

**Success criteria:**
- Average aspect ratio improves by ≥ 20% vs. current independent normalization
- CDT min angle improves (measured in UV space)

---

### 4.4 Batch 4: Metric-Aware Ring Spacing (R5)

**Effort:** Medium — stretch estimation + integration  
**Files:** `OuterWallTessellator.ts`, potentially `MetricFieldProvider.ts`  
**Risk:** Low-Medium — builds on Batch 2 infrastructure

**Steps:**

1. **Wire stretch estimate into ring insertion:**
   - Compute `estimateCircumferentialStretch(t, potParams)` per feature edge
   - Scale `baseSpacing` by `1/stretch` so that rings are closer in UV at high-stretch regions
   - Result: equator features get 2-3× more transition vertices than top/bottom features

2. **Validate stretch compensation:**
   - Export at high resolution
   - Measure 3D aspect ratios at different heights
   - Verify equator and narrow-point triangles have similar 3D quality

3. **Test:**
   - Synthetic pot with extreme taper (Rb=10, Rt=40)
   - Feature at bottom (low stretch) and equator (high stretch)
   - Verify equator gets proportionally more ring vertices

**Success criteria:**
- 3D aspect ratio variance across heights ≤ 30% (R5)
- No visible quality difference between equator and narrow features

---

### 4.5 Batch 5: Post-GPU 3D Verification (R4 validation)

**Effort:** Small-Medium — reporting + optional refinement  
**Files:** `ParametricExportComputer.ts`, `OuterWallTessellator.ts`  
**Risk:** Low — diagnostic/reporting, refinement is optional

**Steps:**

1. **Add 3D quality measurement after Phase 4 GPU evaluation:**
   - For each chain strip triangle, compute 3D aspect ratio and minimum angle
   - Log statistics: min/max/avg aspect ratio, percentile distribution

2. **Add grading verification:**
   - For each pair of adjacent chain strip triangles, compute area ratio
   - Log max area ratio across all pairs

3. **Optional Steiner refinement:**
   - If >5% of triangles violate R4 (aspect >4:1), insert circumcentric Steiner points
   - GPU-evaluate new vertices
   - Re-run local CDT
   - Gate behind `chainStripAdaptiveRefine` config flag

4. **Test:**
   - Mock GPU positions to verify 3D metric computation
   - Verify Steiner insertion reduces violations

**Success criteria:**
- 3D quality statistics reported in export log
- ≤ 5% of chain strip triangles exceed 4:1 aspect ratio (R4)
- Grading ratio ≤ 2.0 for 95% of adjacent triangle pairs (R3)

---

### 4.6 Batch 6: Cleanup and Simplification

**Effort:** Small — remove dead code  
**Files:** `OuterWallTessellator.ts`, `ChainStripTriangulator.ts`  
**Risk:** Low — removing unused code

**Steps:**

1. **Remove `insertChainStripVertices()`** (8-pass system) — replaced by `insertGradedTransitionVertices()`

2. **Remove `emitWindingSafe()`** function from `ChainStripTriangulator.ts` — unused since backtrack removal

3. **Simplify `ChainStripStats`:**
   - Remove `droppedSameRow`, `droppedMissing` (no longer relevant with feature-only constraints)
   - Remove `skippedBacktracks` (backtracks removed entirely)
   - Add `transitionVerticesInserted`, `avgGradingRatio`, `r2Violations`

4. **Simplify constraint pipeline diagnostics:**
   - Remove inverse remap classification (no support edges to classify)
   - Keep primary edge tracking (still useful)

5. **Update export dialog labels:**
   - "Strip density" → "Transition density" (reflects new semantics)
   - Keep min=1, max=12 range but map to grading parameters

6. **Documentation:**
   - Update `ARCHITECTURE.md` with new chain strip pipeline
   - Add inline documentation for `insertGradedTransitionVertices()`

**Success criteria:**
- No dead code remains
- Diagnostic output is clean and focused on relevant metrics
- All tests pass

---

## 5. Batch Dependencies and Ordering

```
Batch 1: Feature-Only Constraints          ← Independent, do first
    │
Batch 2: Graded Transition Vertices        ← Independent of Batch 1 but benefits from it
    │
Batch 3: CDT Normalization Fix             ← Independent, can parallel with Batch 2
    │
Batch 4: Metric-Aware Ring Spacing          ← Depends on Batch 2
    │
Batch 5: Post-GPU 3D Verification          ← Depends on Batch 2+3 (needs graded vertices + CDT)
    │
Batch 6: Cleanup                            ← After all others validated
```

**Recommended execution order:** 1 → 2+3 (parallel) → 4 → 5 → 6

**Estimated vertex/constraint counts after each batch (d=4):**

| Metric | Current | After B1 | After B2 | After B4 |
|--------|---------|----------|----------|----------|
| Feature constraints | ~235 | ~235 | ~235 | ~235 |
| Support constraints | ~300 | 0 | 0 | 0 |
| Total constraints to CDT | ~535 | ~235 | ~235 | ~235 |
| Support/transition vertices | ~1,150 | ~1,150 | ~5,600 | ~6,200 |
| Avg aspect ratio (UV) | 4.2:1 | 4.2:1 | 2.1:1 | 2.1:1 |
| Avg aspect ratio (3D) | 8.5:1 | 8.5:1 | 3.2:1 | 2.0:1 |
| Direct feature-to-grid tris | ~400 | ~400 | 0 | 0 |
| CDT time per band | 0.8ms | 0.4ms | 0.6ms | 0.7ms |

---

## 6. Concentric Ring Geometry — Visual

```
Grid boundary (column c)                    Grid boundary (column c+1)
│                                            │
│  ○ ring3   ○ ring3   ○ ring3              │  ← sparse (every 3rd vertex)
│                                            │
│    ○ ring2   ○ ring2   ○ ring2            │  ← medium density
│                                            │
│      ● ring1  ● ring1  ● ring1  ● ring1  │  ← dense (every vertex)
│                                            │
│        ★ feature ═══════ ★ feature        │  ← chain edge (CONSTRAINT)
│                                            │
│      ● ring1  ● ring1  ● ring1  ● ring1  │  ← dense (mirrored)
│                                            │
│    ○ ring2   ○ ring2   ○ ring2            │  ← medium density
│                                            │
│  ○ ring3   ○ ring3   ○ ring3              │  ← sparse
│                                            │
Grid boundary                                Grid boundary

LEGEND:
  ★  Feature chain vertex (pointIdx ≥ 0) — constraint enforced
  ●  Inner ring vertex (pointIdx = -1) — free CDT participation
  ○  Outer ring vertex (pointIdx = -1) — free CDT participation
  ═  Feature chain edge — the ONLY constraint

Ring spacing (geometric grading, r=1.5):
  ring1: 1.0 × baseSpacing from chain
  ring2: 2.5 × baseSpacing from chain  (1.0 + 1.5)
  ring3: 4.75 × baseSpacing from chain (1.0 + 1.5 + 2.25)
```

**What CDT produces with this layout:**

```
Grid ──○──○──○──
       │╲ │╲ │╲
       ○──○──○──
       │╲ │╲ │╲       ← triangles get smaller approaching chain
       ●──●──●──●──
       │╲│╲│╲│╲│╲│    ← dense near chain
       ★══★══★══★══   ← feature edge (constraint)
       │╱│╱│╱│╱│╱│    ← dense near chain (mirrored)
       ●──●──●──●──
       │╱ │╱ │╱
       ○──○──○──
       │╱ │╱ │╱       ← triangles get larger away from chain
Grid ──○──○──○──
```

Note: No triangle has one vertex on ★ and another on Grid — there are always intermediate ● or ○ layers between them.

---

## 7. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CDT regression at high vertex count | Low | Medium | cdt2d handles 10K+ points routinely; budget cap at 10K transition vertices |
| Ring insertion near seam creates artifacts | Medium | Medium | Seam guard (u < 0.005 / u > 0.995) remains active; add seam-proximity ring suppression |
| Metric stretch estimate is too coarse pre-GPU | Low | Low | Radius-based estimate is accurate for axisymmetric surfaces; post-GPU verification catches outliers |
| Performance regression at d=12 | Low | Medium | Feature-only constraints (235 vs 126K) make CDT faster despite more vertices; budget cap prevents runaway |
| Boundary stitching non-manifold edges | Medium | High | buildMergedRow handles transition vertices same as current support vertices; batch6 dedup remains active |

---

## 8. Test Plan

### 8.1 Unit Tests (ChainStripTriangulator.test.ts)

| Test | Description |
|------|------------|
| `CDT with feature-only constraints` | Verify all feature edges appear as mesh edges |
| `CDT with transition ring vertices` | Verify CDT uses ring vertices (not ignored) |
| `No direct feature-to-grid triangle` | Verify R2: no triangle has feature + grid boundary vertices |
| `Graded area ratio` | Verify R3: adjacent triangle areas differ by ≤ 2.5:1 |
| `CDT fallback to sweep on exception` | Verify graceful degradation |

### 8.2 Unit Tests (OuterWallTessellator.test.ts)

| Test | Description |
|------|------------|
| `insertGradedTransitionVertices ring count` | Verify ring count adapts to strip width |
| `insertGradedTransitionVertices seam guard` | Verify no vertices near seam |
| `insertGradedTransitionVertices budget cap` | Verify vertex count ≤ maxTransitionVertices |
| `insertGradedTransitionVertices stretch scaling` | Verify equator gets more vertices |
| `Feature-only constraint filter` | Verify zero support edges in segConstraints |
| `buildMergedRow with transition vertices` | Verify correct interleaving and sort |

### 8.3 Integration Tests

| Test | Description |
|------|------------|
| `Full export d=1, feature edges preserved` | End-to-end export, verify feature edge count |
| `Full export d=4, no R2 violations` | No direct feature-to-grid triangles |
| `Full export d=12, performance` | Triangulation time ≤ 200ms |
| `Watertight boundary` | Zero non-manifold edges at strip/grid boundary |
| `Regression: existing test suite` | All 1914 existing tests pass |

### 8.4 Visual Validation

| Check | Tool |
|-------|------|
| Feature edges visible as sharp ridges | 3D viewer / slicer |
| Smooth density transition | Wireframe overlay |
| No visible artifacts at chain-grid boundary | Flat shading |
| Equator features as crisp as top/bottom features | Camera orbit |

---

## 9. API and Configuration Changes

### 9.1 PipelineStageConfig (types.ts)

```typescript
// REMOVE:
chainStripDensity: number;  // Old 8-pass system

// ADD:
/** Phase 03: Transition vertex grading ratio (1.2 = fine, 2.0 = coarse). */
chainStripGradingRatio: number;
/** Phase 03: Minimum transition rings between feature and grid (≥ 2 for R2). */
chainStripMinRings: number;
```

The existing `chainStripMode` and `chainStripAdaptiveRefine` remain unchanged.

### 9.2 Export Dialog Mapping

The user-facing "Strip density" slider (1–12) maps to internal parameters:

| Slider | gradingRatio | minRings | maxRings | Approx vertices |
|--------|-------------|----------|----------|-----------------|
| 1 | 2.0 | 2 | 3 | ~1,200 |
| 2 | 1.8 | 2 | 3 | ~1,800 |
| 4 | 1.5 | 3 | 5 | ~3,600 |
| 6 | 1.4 | 3 | 5 | ~5,000 |
| 8 | 1.3 | 4 | 6 | ~6,800 |
| 10 | 1.25 | 4 | 6 | ~8,200 |
| 12 | 1.2 | 5 | 7 | ~10,000 |

---

## 10. Success Criteria Summary

| Requirement | Metric | Target | Measurement |
|------------|--------|--------|-------------|
| R1: Feature-only constraints | Constraint count | = feature edge count (~235) | Log output |
| R2: No direct feature-to-grid | R2 violation count | 0 | Post-CDT scan |
| R3: Graded density | Adjacent area ratio | ≤ 2.0:1 for 95% of pairs | Post-GPU measurement |
| R4: 3D aspect ratio | Max aspect ratio | ≤ 4:1 for 95% of chain strip tris | Post-GPU measurement |
| R5: Metric-aware at large radius | Aspect ratio variance across heights | ≤ 30% | Post-GPU measurement |
| R6: Performance | Chain strip triangulation time | ≤ 50ms (d=4), ≤ 200ms (d=12) | Timer |
| R7: Watertight boundary | Non-manifold edges at boundary | 0 | MeshValidator |

---

## 11. Files Modified

| File | Action | Batch |
|------|--------|-------|
| `OuterWallTessellator.ts` | Modify: constraint filter, replace vertex insertion | B1, B2, B4 |
| `ChainStripTriangulator.ts` | Modify: CDT normalization, quality metrics, cleanup | B3, B6 |
| `types.ts` | Modify: update config fields | B2 |
| `ExportDialog.tsx` | Modify: update slider semantics | B2 |
| `ParametricExportComputer.ts` | Modify: pass updated config, add 3D verification | B5 |
| `ChainStripTriangulator.test.ts` | Modify: add quality tests | B1, B3 |
| `OuterWallTessellator.test.ts` | Modify: add transition vertex tests | B2, B4 |

---

## 12. Relationship to Existing Plans

### Superseded

- **`Feature-Edge Dense Retriangulation — v23.0.md`**: The 8-pass density system (Batch 1a of that plan) is fully replaced by graded ring insertion. The CDT mode, sweep mode, and strategy pattern from that plan are retained. The sweep mode is demoted to fallback-only.

- **`2026-02-27-chain-bridge-topology-plan.md` Phases 3-4**: Steiner point insertion (Phase 3) and local grid densification (Phase 4) are subsumed by the graded ring system. Ring insertion provides the vertex material that Steiner insertion would have created, but proactively rather than reactively.

### Complementary (not superseded)

- **`2026-02-27-chain-bridge-topology-plan.md` Phase 2**: The intrinsic Delaunay (3D-weighted) flip criterion is complementary. Our CDT operates in UV space; a future enhancement could use the metric tensor for Delaunay flips within the CDT. This is orthogonal to the ring insertion.

- **`2026-02-28-metric-aware-tessellation-plan.md`**: The `MetricFieldProvider` concept is complementary. Our Batch 4 uses a simple radius-based stretch estimate. A full MetricFieldProvider would give better estimates but requires GPU pilot mesh evaluation (Phase 4b in that plan). This can be integrated later as a refinement.

- **`2026-02-27-chain-bridge-topology-plan.md` Phase 5**: Botsch-Kobbelt isotropic remeshing remains a valid future enhancement for post-CDT quality improvement. It operates after our pipeline and does not conflict.

- **`2026-02-27-chain-bridge-topology-plan.md` Phase 1**: Bug fixes (UV-snap collision, chain detection unification) are independent and should be done regardless.

---

## 13. Open Questions

1. **Should the grading ratio be anisotropic?** Currently proposed as isotropic (same ratio in U and T directions). On surfaces with high anisotropy (e.g., near the equator), grading in U should be finer than in T. The stretch estimate partially addresses this, but true anisotropic grading would add complexity.

2. **Should we pre-compute a pilot CDT to estimate quality before ring insertion?** A two-pass approach (CDT → measure quality → insert rings where needed → CDT again) would be more adaptive but doubles the CDT cost. For now, the geometric grading formula should handle most cases without a pilot.

3. **How to handle chain vertices that are very close together?** Two feature vertices 0.01 apart in U would each generate their own ring system, potentially flooding the area with redundant vertices. Solution: merge ring systems for features closer than `baseSpacing` apart — share rings between adjacent features.

4. **Should transition vertices be on the pot surface?** Currently, transition vertices are placed in UV space and get 3D positions from the GPU evaluation in Phase 4 (same as grid vertices). They are not "off-surface" — they will be on-surface after evaluation. The question is whether UV-space ring placement corresponds to good 3D ring placement. The stretch estimate mitigates this, but post-GPU verification (Batch 5) will catch remaining issues.
