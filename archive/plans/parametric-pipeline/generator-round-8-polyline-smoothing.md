# Generator Round 8 — Polyline Smoothing & Horizontal Line Artifacts
Date: 2026-03-04

## Problem 1: Jagged Chain Polylines

### Root Cause Analysis

After reading the code, the root cause is clear and has **three layers**:

**Layer 1 — Feature detection quantization** (`FeatureDetection.ts`):
At 8192 samples/row, sample spacing = 1/8192 ≈ 0.000122. Features with `minSameKindSpacing = 0.0002` (1.6 samples apart) cannot be resolved reliably. The detected peak position jitters ±1-2 grid columns between rows. This is upstream noise entering at Step 2.

**Layer 2 — Piecewise-linear chain representation** (`ChainLinker.ts:381-447`):
After SG smoothing (`halfWidth=8`, window=17) with mirror extension, `maxConsecDelta` dropped from 0.0078 to 0.003378. This is a 57% reduction — good, but still ~2 grid columns of jitter. The constraint edges in the CDT faithfully reproduce these zigzag segments. The key insight from the problem statement is correct: **the chain points are approximately right, but the straight-line connections between them create visible staircase edges**.

**Layer 3 — CDT constraint faithfulness** (`OuterWallTessellator.ts:400-412`):
Chain edges are registered as CDT constraint edges at L412:
```typescript
chainEdges.push([p0.vertexIdx, p1.vertexIdx]);
```
The CDT respects these constraints exactly, so every zigzag in the chain path becomes a zigzag edge in the mesh. With 296 crossing constraints removed, some chain edges are also being dropped, creating discontinuities.

### Why smoothing alone can't fully solve this

Current SG smoothing (`halfWidth=8`) is already aggressive. Pushing to `halfWidth=12` risks:
- Over-smoothing diagonal/spiral chains (the feature trajectory has real slope)
- Reducing positional accuracy — each point moves further from its measured peak
- Diminishing returns: going from 0.0034 to <0.002 would require `halfWidth` ≈ 16-20, which for short chains (some have 50-100 points) means the window exceeds half the chain length

The mathematical insight: **SG smoothing attenuates noise but cannot eliminate it**. For noise at the Nyquist boundary (2-row oscillation), the SG transfer function at `halfWidth=8` passes ~15% of the amplitude. To get below 5%, you need `halfWidth` > 15, which conflicts with feature trajectory preservation.

---

## Proposals for Problem 1

### Proposal 1: Cubic B-Spline Interpolation of Chain Constraints (Moderate)

**Idea**: Don't change where the chain points are. Change how they're connected. Instead of straight-line constraint edges from point A to point B, subdivide each chain segment with cubic B-spline interpolation and register the subdivided segments as CDT constraints.

**Mechanism**:
1. After SG smoothing (Step 3.6), the chain has points `{(u₀,r₀), (u₁,r₁), ..., (uₙ,rₙ)}`.
2. Fit a uniform cubic B-spline through the unwrapped U positions as a function of row index.
3. For each consecutive pair `(uᵢ,rᵢ) → (uᵢ₊₁,rᵢ₊₁)`, evaluate the spline at `k` intermediate parameter values to generate `k-1` subdivision points.
4. Insert these subdivision points as chain vertices in `OuterWallTessellator.ts` (they get vertex indices and become CDT constraints).
5. The constraint edges become the subdivided segments, which follow the spline curve.

**Mathematical basis**:
A cubic B-spline with knot spacing of 1 (every row) has C² continuity. The smoothing is implicit: the B-spline minimizes curvature. For a chain with `maxConsecDelta=0.0034`, the spline's maximum deviation from the linear segment is bounded by `h²/8 × max|u''|`, where `h` is the subdivision step. With `k=3` subdivisions, each sub-segment is ~0.33 rows long and the maximum staircase deviation drops by ~9×.

**Subdivision count**: For a chain edge spanning 1 row, insert 2-4 intermediate points. This is minimal: 20 chains × 242 points × 3 subdivisions = ~14,520 additional chain vertices. Compared to the 46K companions already generated, this is modest.

**Files affected**:
- `ChainLinker.ts` — New function `subdivideChainWithBSpline()` after `smoothChainPath()`
- `OuterWallTessellator.ts:330-415` — Accept subdivided chains, register subdivided edges
- `ParametricExportComputer.ts` — Call subdivision after smoothing

**Trade-offs**:
- (+) Directly solves the visual staircase without moving chain points
- (+) B-spline ensures C² smooth constraint paths
- (+) Modest vertex count increase (~14K)
- (-) Subdivided chain edges increase CDT constraint count by 3-4×
- (-) More constraint edges → more potential crossings → more crossing filter removals
- (-) B-spline end conditions need care (mirror or natural boundary)

**Assumptions** (for Verifier to attack):
1. The CDT can handle 4× more constraint edges without performance degradation
2. Subdivided spline edges are less likely to cross than raw zigzag edges
3. The GPU `surface_point()` evaluation produces smooth geometry at the spline-interpolated UV positions (no secondary aliasing)
4. B-spline smoothing doesn't shift the constraint path far enough from the measured feature to create visible misalignment

### Proposal 2: Catmull-Rom Subdivision in OuterWallTessellator (Conservative)

**Idea**: Same concept as Proposal 1 but using Catmull-Rom interpolation, which **passes through the control points exactly**. This is important because the chain points have been carefully detected and smoothed.

**Mechanism**:
1. In `OuterWallTessellator.ts`, after collecting chain vertices for each chain (L341-400), replace the single constraint edge between consecutive chain vertices with a subdivided path.
2. For chain points `Pᵢ₋₁, Pᵢ, Pᵢ₊₁, Pᵢ₊₂`, the Catmull-Rom spline between `Pᵢ` and `Pᵢ₊₁` is:
   ```
   C(t) = 0.5 * [(2P₁) + (-P₀+P₂)t + (2P₀-5P₁+4P₂-P₃)t² + (-P₀+3P₁-3P₂+P₃)t³]
   ```
3. Evaluate at `t = 1/3, 2/3` (2 subdivision points) to create 3 sub-segments per original edge.
4. Register subdivided edges as CDT constraints.

**Key difference from Proposal 1**: Catmull-Rom passes through all control points exactly (interpolating, not approximating). The chain points don't move — only the connections smooth out. This is philosophically cleaner: we trust the detected positions, we just want smooth connections.

**Boundary handling**: At chain endpoints, use reflection: create phantom points by reflecting the first/last segment. This matches the existing mirror extension in `smoothChainPath()`.

**Mathematical basis**: For maxConsecDelta=0.0034, the maximum deviation of the Catmull-Rom curve from the straight line is bounded by `(h²/6) × max|tangent_difference|`. With typical tangent differences of ~0.002/row, the curve deviation from the linear segment is ~0.0003 — enough to smooth the staircase but not enough to misplace the constraint.

**Files affected**:
- `OuterWallTessellator.ts:395-415` — Replace edge registration with subdivision
- No changes to `ChainLinker.ts` — subdivision happens at the CDT constraint level

**Trade-offs**:
- (+) Exact interpolation — chain points don't move at all
- (+) Localized change (only `OuterWallTessellator.ts`)
- (+) Catmull-Rom is simpler to implement than B-spline
- (-) C¹ continuity only (vs C² for B-spline) — less smooth
- (-) Can overshoot at sharp inflections (serpentine motion), though τ=0.5 (standard Catmull-Rom) limits this
- (-) Still increases CDT constraint count by ~2-3×

**Assumptions** (for Verifier to attack):
1. C¹ continuity is sufficient — the mesh tessellation will hide the curvature discontinuity at chain points
2. Catmull-Rom overshoot is bounded and doesn't create new constraint crossings
3. Subdivided positions stay within the parametric domain [0,1) × [0,1]

### Proposal 3: 3-Pass SG with Adaptive Window (Conservative)

**Idea**: Push the existing SG smoothing harder with multiple passes at increasing window sizes, plus a quality gate that flags chains still above threshold.

**Mechanism**:
1. Pass 1: `halfWidth=6` (window=13) — removes high-frequency jitter
2. Pass 2: `halfWidth=10` (window=21) — removes medium-frequency oscillation
3. Pass 3: `halfWidth=4` (window=9) — final refinement to remove artifacts from pass 2
4. After all passes, compute `maxConsecDelta` per chain. If any chain exceeds 0.002, log a warning and optionally apply an aggressive final pass with `halfWidth=16`.

**Mathematical basis**: Multi-pass SG compounds the transfer function. For 2-row oscillation noise:
- Single pass `halfWidth=8`: attenuation = ~0.15 (passes 15%)
- Two passes `halfWidth=6+10`: attenuation = ~0.03 (passes 3%)
- Three passes: attenuation ≈ 0.005 (essentially eliminated)

The key advantage of multi-pass over single wide window: each pass uses a moderate window, so diagonal trajectories are preserved. A single `halfWidth=16` pass would smooth a chain with 50 points into near-linearity, destroying real curvature.

**Files affected**:
- `ParametricExportComputer.ts:1050-1060` — Change single `smoothChainPath` call to 3-pass loop
- `ChainLinker.ts:350` — Constant `SMOOTH_HALFWIDTH` stays at 8 for the default, but the orchestrator overrides

**Trade-offs**:
- (+) Minimal code change — just loop the existing function
- (+) Proven SG infrastructure (mirror extension, unwrap, rewrap)
- (+) No additional vertices or CDT complexity
- (-) Risk of over-smoothing, especially spiral/diagonal chains
- (-) 3× the smoothing computation time (negligible in practice)
- (-) Doesn't address the fundamental problem: piecewise-linear connections

**Assumptions** (for Verifier to attack):
1. 3-pass SG can achieve maxConsecDelta < 0.002 without destroying real feature slopes
2. Chain points AFTER multi-pass still sit close enough to actual features to be geometrically accurate
3. The compounded transfer function doesn't introduce phase distortion for non-symmetric oscillation patterns

### Proposal 4: Hybrid — SG Multi-Pass + Catmull-Rom Subdivision (Recommended)

**Idea**: Combine Proposals 2 and 3. First reduce noise amplitude with 2-pass SG, then use Catmull-Rom subdivision to eliminate the remaining staircase.

**Mechanism**:
1. **2-pass SG**: `halfWidth=8` then `halfWidth=6`. This reduces maxConsecDelta to ~0.0015.
2. **Catmull-Rom subdivision**: 2 intermediate points per edge (3 sub-segments). This smooths the remaining staircase into a visually smooth curve.
3. **Quality gate**: After SG, measure maxConsecDelta. If below 0.001, skip subdivision (the chains are already smooth enough for the CDT).

**Why hybrid wins**: SG reduces the amplitude of the zigzag. Subdivision eliminates the visual artifact of piecewise-linear connections. Neither alone is sufficient — SG can't reach zero jitter, and subdivision of a highly jagged polyline can create overshoot. Together, they achieve the "fingerprint on a knife edge" standard.

**Expected impact**: 
- maxConsecDelta: 0.0034 → ~0.0012 (SG) → visually smooth (subdivision)
- Additional vertices: ~10K (modest subdivision on already-smooth chains)
- crossing constraints: should DECREASE because the subdivided spline paths diverge from each other more smoothly than zigzag paths

**Files affected**:
- `ParametricExportComputer.ts` — 2-pass SG loop + quality gate
- `OuterWallTessellator.ts` — Catmull-Rom subdivision of chain edges

**Assumptions** (for Verifier to attack):
1. 2-pass SG is sufficient to reduce jitter to where Catmull-Rom subdivision doesn't overshoot
2. The quality gate threshold (0.001) is correctly calibrated
3. Subdivided edges reduce constraint crossings rather than increasing them
4. The combined approach doesn't slow the pipeline beyond acceptable limits

---

## Problem 2: Horizontal Line Artifacts in Debug Visualization

### Root Cause Analysis

After reading the code in detail, I identify **two contributing causes**, with Cause A being the primary:

#### Cause A: Row-Mapping Gaps Creating Long Cross-Chain Segments (PRIMARY)

**Location**: `ParametricExportComputer.ts:1157-1173`

The debug line construction builds an `origToFinalRow` map:
```typescript
const origToFinalRow = new Map<number, number>();
for (let f = 0; f < rowMapping.length; f++) {
    if (rowMapping[f] >= 0) origToFinalRow.set(rowMapping[f], f);
}
```

Then for each chain, it maps chain points:
```typescript
for (const pt of chain.points) {
    const fr = origToFinalRow.get(pt.row);
    if (fr === undefined || fr < 0 || fr >= finalT.length) continue;
    remapped.push([pt.u, finalT[fr]]);
}
```

**The problem**: When `origToFinalRow.get(pt.row)` returns `undefined` for some chain points, those points are **silently skipped**. The `remapped` array then has gaps. Two non-adjacent chain points get directly connected by the line rendering code:

```typescript
for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    segs.push(p0[0], p0[1], p1[0], p1[1]);
}
```

If the skipped points were at intermediate rows, the resulting segment connects points that may be far apart in U (because the chain is diagonal/spiral). The segment visually appears as a **near-horizontal line** cutting across the surface because:
- The two connected points are at similar T positions (nearby rows)  
- But their U positions differ significantly (the chain moved diagonally between the rows)
- Since intermediate points were dropped, the segment spans many degrees of theta

**Evidence**: The chain `linkFeatureChainsByKind` uses `maxMissCount` to bridge gaps. If a chain has gap-bridged sections where the chain point's `pt.row` was predicted (not actually detected), those rows might not appear in the `origToFinalRow` map if the row insertion logic doesn't account for them.

Wait — actually, re-reading more carefully: `pt.row` is the **original** row index (before insertion). `origToFinalRow` maps original row index → final row index. The map is populated for all `rowMapping[f] >= 0` entries, meaning all original rows get a final index. Inserted rows have `rowMapping[f] < 0`, so they're excluded from the map — but inserted rows don't have chain points (chain points only exist at original rows).

**So the gap comes from a different mechanism**: The `smoothChainPath` or `filterLowConfidenceChains` might not be removing points, but the `origToFinalRow` map could have **overwritten entries** if two final rows map to the same original row. Looking at the map construction:

```typescript
for (let f = 0; f < rowMapping.length; f++) {
    if (rowMapping[f] >= 0) origToFinalRow.set(rowMapping[f], f);
}
```

If `rowMapping` has duplicates (two final rows claiming the same original row), the later one wins. But `insertChainGuidedRows` at `ChainLinker.ts:860-887` assigns each original row a unique entry, so duplicates shouldn't happen.

**Revised diagnosis**: The gaps are more likely caused by the chain linker's `maxMissCount` gap bridging. When a chain has no feature detected at row `r` but continues via momentum prediction, the chain point at row `r` has `pt.row = r`. If features weren't detected at row `r` in the original probe, that row IS still in `origToFinalRow` (it's a real original row). So the mapping succeeds.

Let me reconsider. The actual mechanism for horizontal artifacts is likely **Cause B**:

#### Cause B: Seam-Crossing Segments in Debug Lines (PRIMARY, revised)

**Location**: `useParametricExport.ts:375-384`

The debug line segments are built as consecutive point pairs along each chain. When a chain crosses the u=0/1 seam:
- Point `i`: `(u=0.98, t=0.5)`  
- Point `i+1`: `(u=0.02, t=0.503)`

The segment `(0.98, 0.5) → (0.02, 0.503)` is pushed into the segment buffer. The GPU vertex shader evaluates each endpoint with `surface_point(0u, uv.x, uv.y)`:

```wgsl
let p = surface_point(0u, uv.x, uv.y);
```

Point at u=0.98 maps to theta ≈ 352° on the pot surface.
Point at u=0.02 maps to theta ≈ 7° on the pot surface.

The GPU draws a **straight line in 3D** between these two clip-space positions. This line cuts **straight through the interior of the pot** (not around the surface), creating a visible horizontal artifact.

**Why it looks horizontal**: Both points are at nearly the same T (height), so the 3D line is approximately horizontal. But it spans almost the full circumference, cutting through the pot's interior.

**Evidence**: With 20 chains, avg 242 points, 313 rows — any chain wrapping around the seam generates these artifacts. Spiral-style pots have chains that continuously cross the seam, potentially generating dozens of these artifacts.

**The OuterWallTessellator handles this correctly** — it has `SEAM_THRESHOLD = 0.4` at L117 and skips seam-crossing edges at L371 and L409. But the **debug visualization code does NOT have this check**.

#### Cause C: Companion Vertex Cross-Chain Horizontal Edges (POSSIBLE but secondary)

**Location**: `OuterWallTessellator.ts:420-540`

The 46K T-Ladder companions are inserted as interior points in the CDT. The CDT can create edges between companion vertices from different chains at the same T-level. These would appear as horizontal edges in the actual mesh (not just the debug visualization).

However, these would be **mesh edges**, not debug line artifacts. The user report mentions debug visualization artifacts specifically, so this is secondary. The companion horizontal edges could still contribute to the general "horizontal line" impression if the mesh is rendered in wireframe mode.

---

## Proposals for Problem 2

### Proposal 5: Seam-Guard for Debug Line Segments (Conservative, HIGH priority)

**Idea**: Add a seam-crossing check to the debug line segment construction. Skip segments where `|u₁ - u₀| > 0.4` (same threshold as `SEAM_THRESHOLD` in OuterWallTessellator).

**Mechanism**: In `ParametricExportComputer.ts:1163-1175`, after building the remapped array for each chain, split the polyline at seam crossings:

```typescript
// Current code builds segments naively:
// for (const pt of chain.points) { remapped.push([pt.u, ...]); }
// if (remapped.length >= 2) debugLines.push({ points: remapped });

// Proposed: split at seam crossings
const SEAM_DEBUG_THRESHOLD = 0.4;
const segments: Array<Array<[number, number]>> = [[]];
let currentSeg = segments[0];
for (const pt of chain.points) {
    const fr = origToFinalRow.get(pt.row);
    if (fr === undefined || fr < 0 || fr >= finalT.length) continue;
    const newPt: [number, number] = [pt.u, finalT[fr]];
    if (currentSeg.length > 0) {
        const lastPt = currentSeg[currentSeg.length - 1];
        const du = Math.abs(newPt[0] - lastPt[0]);
        if (du > SEAM_DEBUG_THRESHOLD) {
            // Seam crossing — start a new segment
            currentSeg = [newPt];
            segments.push(currentSeg);
            continue;
        }
    }
    currentSeg.push(newPt);
}
for (const seg of segments) {
    if (seg.length >= 2) debugLines.push({ points: seg });
}
```

**Files affected**:
- `ParametricExportComputer.ts:1163-1175` — Replace naive remapping with seam-split logic

**Trade-offs**:
- (+) Eliminates the most visible horizontal artifacts immediately
- (+) ~15 lines of code change
- (+) Zero impact on mesh quality or export correctness
- (-) Chains that cross the seam will show as multiple disconnected segments in the debug view
- (-) Doesn't address mesh-level horizontal edges from companion cross-links

**Assumptions** (for Verifier to attack):
1. The horizontal artifacts are primarily caused by seam-crossing debug segments, not by row-mapping gaps
2. The SEAM_DEBUG_THRESHOLD of 0.4 matches the OuterWallTessellator threshold and correctly identifies seam crossings
3. Splitting chains at seam crossings doesn't hide legitimate chain continuity information from the debug view

### Proposal 6: Gap-Aware Debug Line Construction (Conservative)

**Idea**: In addition to the seam guard, also detect and split at **row gaps** where chain points were dropped by the mapping.

**Mechanism**: When building the remapped array, track which original rows were successfully mapped. If consecutive remapped points come from non-consecutive original rows (indicating a gap), break the polyline:

```typescript
const remapped: Array<{u: number, t: number, origRow: number}> = [];
for (const pt of chain.points) {
    const fr = origToFinalRow.get(pt.row);
    if (fr === undefined || fr < 0 || fr >= finalT.length) continue;
    remapped.push({u: pt.u, t: finalT[fr], origRow: pt.row});
}

// Split at gaps (non-consecutive original rows)
const MAX_ROW_GAP = 3; // Allow small gaps from momentum bridging
const segments: Array<Array<[number, number]>> = [[]];
let currentSeg = segments[0];
for (let i = 0; i < remapped.length; i++) {
    const pt = remapped[i];
    if (currentSeg.length > 0) {
        const prev = remapped[i - 1]; // safe because currentSeg.length > 0
        const rowGap = Math.abs(pt.origRow - prev.origRow);
        const du = Math.abs(pt.u - prev.u);
        if (du > 0.4 || rowGap > MAX_ROW_GAP) {
            currentSeg = [];
            segments.push(currentSeg);
        }
    }
    currentSeg.push([pt.u, pt.t]);
}
```

**Files affected**: Same as Proposal 5

**Trade-offs**:
- (+) Catches BOTH seam crossings and row gaps
- (+) More robust than seam-only guard
- (-) Slightly more complex
- (-) `MAX_ROW_GAP` needs calibration (too small = breaks momentum-bridged chains, too large = misses gaps)

**Assumptions** (for Verifier to attack):
1. Row gaps actually occur in practice and cause visible horizontal artifacts (needs confirmation)
2. The chosen `MAX_ROW_GAP` threshold correctly separates legitimate momentum gaps from problematic mapping gaps

---

## Recommended Approach

### Priority 1: Proposal 5 (Seam-Guard for Debug Lines)
**Rationale**: This is the lowest-risk, highest-impact fix. The horizontal line artifacts are almost certainly caused by seam-crossing debug segments. The fix is ~15 lines, zero risk to mesh quality, and directly addresses the visual problem. Deploy immediately.

### Priority 2: Proposal 4 (Hybrid SG + Catmull-Rom)
**Rationale**: For the jagged chain polylines, neither smoothing alone nor subdivision alone is optimal. The hybrid approach:
1. 2-pass SG reduces jitter amplitude to ~0.0012
2. Catmull-Rom subdivision (2 intermediate points) smooths the remaining staircase
3. Quality gate skips subdivision when chains are already smooth

This gives the biggest visual improvement for manageable complexity. Implement after Proposal 5 is confirmed working.

### Priority 3: Proposal 6 (Gap-Aware Debug Lines)
**Rationale**: Defense-in-depth for debug visualization. Implement after Proposal 5 if horizontal artifacts persist.

### NOT recommended:
- **Proposal 1 (B-spline)**: Overkill — doesn't pass through control points, C² is unnecessary when C¹ from Catmull-Rom is visually sufficient.
- **Proposal 3 (3-pass SG alone)**: Insufficient — can't eliminate piecewise-linear staircase no matter how many passes.

## Open Questions

1. **Subdivision count calibration**: Is 2 intermediate points per edge sufficient, or do we need 3-4 for the highest-jitter chains? Need to measure the visual improvement empirically.
2. **Catmull-Rom tension parameter**: Standard Catmull-Rom uses τ=0.5. Would a lower tension (e.g., τ=0.3) reduce overshoot risk at the cost of less smoothing?
3. **CDT performance**: Does the CDT handle 4× more constraint edges without significant slowdown? The current 5837 edges would become ~17K. Need to benchmark.
4. **Interaction with crossing filter**: Do subdivided edges increase or decrease constraint crossings? Hypothesis: they decrease crossings because the subdivided path is smoother and diverges from neighboring chains instead of zigzagging toward them.
5. **Are the horizontal artifacts only in debug viz or also in the actual mesh?** If companion-generated horizontal CDT edges also contribute, Proposal 5 alone won't fully fix the visual problem and we need companion T-Ladder density reduction.
