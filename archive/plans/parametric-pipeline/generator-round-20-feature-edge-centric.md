# Generator Round 20 — Feature-Edge-Centric Chain Strip Triangulation

Date: 2026-03-05

## Problem Statement

The chain strip triangulation still produces grid-column-aligned triangle patterns despite the R19 U-Graded Fan companions. Two concrete symptoms:

1. **Grid inheritance**: CDT boundary vertices (pure grid, regularly spaced) outnumber interior points and dominate the triangulation structure. Triangles connect grid boundary columns to the nearest interior/chain vertex, preserving grid-column alignment instead of radiating from the feature chain edge.

2. **First triangle layer too large**: The gap between the promoted chain vertex (at `tBot + 0.05×tGap`) and the nearest fan companion spans ~56% of the band height at d4/e1 and ~15% at d8/e4. The user wants the first triangle row coming out of the feature edge to be much finer.

Production evidence (d4/e1): minAngle=0.0°, maxAspect=8296:1, R2violations=46,816, 1085 non-manifold edges.

## Root Cause Analysis

### Root cause 1: UI defaults override backend defaults

**File**: `ExportDialog.tsx:146-147`
**Evidence**: Backend `DEFAULT_CHAIN_STRIP_CONFIG` (ChainStripTriangulator.ts:49-50) correctly sets `densityMultiplier: 8, expansion: 4` (R19). But the UI's `DEFAULT_PIPELINE_CONFIG` (ExportDialog.tsx:146-147) sets `chainStripDensity: 4, chainStripExpansion: 1`, which overrides the backend. Every export through the UI runs at the wrong operating point.

**Impact**: At d4/e1:
- `nTLevels = floor(4/4) = 1` (only 1 T-level per rung)
- `nUSpread = floor(4/3) = 1` (only 1 lateral companion per side)
- Fan shell 0 T-levels: `max(1, floor(4×4/8)) = 2` (T-fractions 0.33, 0.67)
- Expansion=1 gives only 3 columns of U-range, halfRange ≈ 0.00146

At d8/e4 (intended):
- `nTLevels = 2`, `nUSpread = 2`
- Shell 0 T-levels: `max(1, floor(8×4/8)) = 4` (T-fractions 0.20, 0.40, 0.60, 0.80)
- Expansion=4 gives 9 columns, halfRange ≈ 0.00584

This alone is a 4× improvement in companion density. **Trivial fix required.**

### Root cause 2: Constraint guard radius blocks near-chain companions

**File**: `OuterWallTessellator.ts:581` — `CONSTRAINT_GUARD_RADIUS = 0.001`
**Evidence**: `guardRejectCount = 41,742` in the production log.

The guard tests every companion candidate against ALL constraint edges in the band via `isNearConstraintEdge()` (line 604). Any candidate within 0.001 UV-distance of ANY constraint edge segment is rejected.

For a typical chain with vertical tendency (du ≈ 0), the chain edge runs from `(cv.u, tLo)` to `(cv.u, tHi)`. ALL companions at `|cu - cv.u| < 0.001` are rejected regardless of T-position. With expansion=4, `halfRange ≈ 0.00584`, so the guard zone eats 34% of the available U-range on each side (0.001/0.00292 = 34%).

Shell 0 at fraction=0.20 produces `U-offset = 0.20 × 0.00584 ≈ 0.00117`. This barely clears the guard (0.00117 > 0.001). Any shell below fraction ~0.17 would be rejected entirely for near-vertical chains.

**This is why the first triangle is large**: the nearest surviving companion cannot be closer than 0.001 in U-distance from the chain edge, creating a mandatory "dead zone" around the feature.

### Root cause 3: Companions only placed at chain vertex positions, not along edges

**File**: `OuterWallTessellator.ts:733-758` — the companion generation loop iterates over `chainVertices`, emitting rungs and fan companions centered on each vertex's U-position.

Chain edges span between consecutive vertices (often at different U-positions and different rows). The midpoint of a chain edge has no dedicated companion coverage. If vertex A is at U=0.10 and vertex B at U=0.15, companions are placed at U=0.10±offset and U=0.15±offset, but nothing at U=0.125. CDT creates large triangles in the coverage gap between vertices.

### Root cause 4: CDT boundary dominance is structural

With strip boundaries composed entirely of grid vertices (685 columns per full row), the boundary provides regular anchor points at column spacing ~1/685 ≈ 0.00146. Interior companions are sparse by comparison. CDT's Delaunay criterion (maximize minimum angle) connects boundary vertices to the nearest interior point, preserving grid-column-aligned patterns. This is a structural property of CDT with dense boundaries — more interior points help but don't eliminate boundary influence on triangle alignment.

## Proposals

### Proposal 0: UI Default Fix (Trivial — MUST DO)

**Idea**: Update `ExportDialog.tsx` line 146-147 to use `chainStripDensity: 8, chainStripExpansion: 4`.

**Mechanism**: Aligns UI defaults with backend `DEFAULT_CHAIN_STRIP_CONFIG`. Every export immediately runs at the intended R19 operating point.

**Files affected**: `ExportDialog.tsx:146-147`

**Trade-offs**: None. Pure bugfix. Not doing this negates all R19 work.

**Change**:
```typescript
// Before (line 146-147):
chainStripDensity: 4,
chainStripExpansion: 1,

// After:
chainStripDensity: 8,
chainStripExpansion: 4,
```

---

### Proposal 1: Anisotropic Constraint Guard (Moderate)

**Idea**: Replace the isotropic `CONSTRAINT_GUARD_RADIUS` with an anisotropic guard that distinguishes perpendicular distance from along-edge distance. The guard's purpose is to prevent CDT slivers caused by points near a constraint edge. But a point offset *perpendicular* to an edge creates well-shaped triangles — only points *along* the edge (near endpoints) create slivers.

**Mechanism**: Modify `isNearConstraintEdge()` to compute the projection parameter `t` (parametric position along the segment). If `t ∈ (0.1, 0.9)` (companion projects onto the interior of the edge, not near endpoints), use a relaxed guard radius of `0.0002`. If `t ∈ [0, 0.1] ∪ [0.9, 1.0]` (near endpoints), keep the strict `0.001` guard.

**Mathematical basis**: For a companion at perpendicular distance `d_perp` from a constraint edge, with projection at edge parameter `t_proj`:
- If `t_proj` is interior to the edge, the CDT triangle formed is: chain_edge → companion → chain_edge. The minimum angle is `atan(d_perp / edge_half_length)`. As long as `d_perp > 0.0002` (200× the dedup threshold), the triangle is numerically safe and has minimum angle > 0.5°.
- If `t_proj` is near an endpoint, the triangle degenerates toward a sliver with one angle approaching 0°. The strict guard prevents this.

**Pseudocode**:
```typescript
function isNearConstraintEdge(cu: number, ct: number, bandIdx: number): boolean {
    const edges = constraintsByBand.get(bandIdx);
    if (!edges) return false;
    for (const e of edges) {
        const dx = e.u1 - e.u0, dy = e.t1 - e.t0;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-20) continue;
        const tParam = Math.max(0, Math.min(1, ((cu - e.u0) * dx + (ct - e.t0) * dy) / len2));
        const projU = e.u0 + tParam * dx, projT = e.t0 + tParam * dy;
        const dist = Math.sqrt((cu - projU) ** 2 + (ct - projT) ** 2);

        // Anisotropic guard: strict near endpoints, relaxed for mid-edge
        const isInterior = tParam > 0.1 && tParam < 0.9;
        const guardRadius = isInterior ? CONSTRAINT_GUARD_RELAXED : CONSTRAINT_GUARD_RADIUS;
        if (dist < guardRadius) {
            guardRejectCount++;
            return true;
        }
    }
    return false;
}
```

Where `CONSTRAINT_GUARD_RELAXED = 0.0002` and `CONSTRAINT_GUARD_RADIUS = 0.001`.

**Files affected**: `OuterWallTessellator.ts:604-618` (replace `isNearConstraintEdge`)

**Trade-offs**:
- Pro: Unlocks ultra-near companion shells. Shell at fraction=0.05 yields U-offset ~0.0003 which now survives the relaxed guard.
- Pro: Simple change, 5 lines modified.
- Con: Very close companions may cause CDT numerical sensitivity. At 0.0002 distance this should be fine (200× dedup threshold) but needs validation.
- Con: Does not address root cause 3 (edge midpoint coverage).

**Assumptions** (for Verifier to attack):
1. CDT (cdt2d library) is numerically stable with free points at distance 0.0002 from constraint edges.
2. The projection parameter `t ∈ (0.1, 0.9)` threshold correctly identifies the "safe zone" for relaxed guard.
3. Perpendicular distances below 0.001 do not cause winding ambiguity in CDT triangle output.
4. The guard purpose is exclusively sliver prevention, not CDT numerical stability.

---

### Proposal 2: Ultra-Near Companion Shells (Moderate — requires P1)

**Idea**: Add inner shells at fractions `[0.03, 0.08, 0.15]` before the existing `[0.20, 0.45, 0.72, 1.0]`, with high T-density for the innermost shells. This creates a graduated density profile radiating from the chain edge.

**Mechanism**: Extend `SHELL_FRACTIONS` to `[0.03, 0.08, 0.15, 0.25, 0.45, 0.72, 1.0]`. The three new inner shells have high T-level counts (from the density formula). With the anisotropic guard from P1, shells at fraction=0.03 and 0.08 survive for near-vertical chains.

**Mathematical basis**: At d8/e4 with halfRange=0.00584:
- Shell 0 (fraction=0.03): U-offset = 0.000175. With P1's relaxed guard of 0.0002... this is below the relaxed guard too. Need fraction ≥ 0.035 for survival. Adjust to `[0.04, 0.09, 0.16, ...]`.
- Shell 0 (fraction=0.04): U-offset = 0.000234. Clears relaxed guard of 0.0002. ✓
- Shell 1 (fraction=0.09): U-offset = 0.000526. Clears. ✓
- Shell 2 (fraction=0.16): U-offset = 0.000935. Still under old guard of 0.001 but clears relaxed. ✓

Revised fractions: `[0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0]` — 7 shells.

T-levels at density=8, nShells=7:
```
shell 0: max(1, floor(8 × 7 / 14)) = 4  → T at 0.20, 0.40, 0.60, 0.80
shell 1: max(1, floor(8 × 6 / 14)) = 3  → T at 0.25, 0.50, 0.75
shell 2: max(1, floor(8 × 5 / 14)) = 2  → T at 0.33, 0.67
shell 3: max(1, floor(8 × 4 / 14)) = 2
shell 4: max(1, floor(8 × 3 / 14)) = 1
shell 5: max(1, floor(8 × 2 / 14)) = 1
shell 6: max(1, floor(8 × 1 / 14)) = 1
```

Total per-band per-side: 4+3+2+2+1+1+1 = 14 companions per side per band. × 2 sides = 28 per chain vertex per band. With MAX_FAN_PER_BAND=30, this fits.

**Distance from promoted chain vertex to nearest companion**:
- Promoted vertex at `(cv.u, tLo + 0.05×tGap)`
- Shell 0 (fraction=0.04) nearest T at 0.20×tGap: T-distance = 0.15×tGap, U-distance = 0.000234
- BUT shell 0 at T=0.20×tGap and promoted vertex at T=0.05×tGap means T-gap = 0.15×tGap ≈ 0.000345

Hmm, this is still a significant gap. The first triangle is ~15% of band height.

**Key insight**: The real bottleneck isn't companion shell placement — it's that PROMO_EPSILON=0.05 pushes the chain vertex away from the boundary, and no companion is placed between the chain vertex (at 0.05×tGap) and the first shell companion (at 0.20×tGap).

**Fix within P2**: Add a "near-chain T-ring" — companion at T-position `PROMO_EPSILON × 2 × tGap = 0.10×tGap` at each shell U-offset. This fills the gap between the promoted vertex at 0.05×tGap and the first regular companion at 0.20×tGap.

**Pseudocode addition to emitUGradedFan**:
```typescript
// Near-chain T-ring: fill gap between PROMO_EPSILON and first regular T-level
const nearChainT = tLo + PROMO_EPSILON * 2 * tGap; // at 0.10×tGap
for (const side of [-1, 1]) {
    for (let s = 0; s < Math.min(3, nShells); s++) {
        const fraction = SHELL_FRACTIONS[s];
        const uRange = side < 0 ? cv.u - uLeft : uRight - cv.u;
        if (uRange < 1e-9) continue;
        const cu = cv.u + side * fraction * uRange;
        if (!isNearConstraintEdge(cu, nearChainT, bandIdx)) {
            tryEmitCompanion(cu, nearChainT, cv);
        }
    }
}
```

**Files affected**: `OuterWallTessellator.ts:577` (SHELL_FRACTIONS), `OuterWallTessellator.ts:682-720` (emitUGradedFan near-chain T-ring)

**Trade-offs**:
- Pro: Closes the 0.05→0.20 T-gap. First triangle drops from ~15% to ~5% of band height.
- Pro: Builds on existing fan infrastructure.
- Con: Requires P1 (anisotropic guard) for inner shells to survive.
- Con: More companions per vertex → may need to increase MAX_FAN_PER_BAND to 40.
- Con: Does not address root cause 3 (edge midpoint coverage gaps).

**Assumptions** (for Verifier to attack):
1. 7 shells don't exceed the companion budget (MAX_FAN_PER_BAND=30 may need raising).
2. The near-chain T-ring at `2×PROMO_EPSILON×tGap` doesn't interfere with D-Radical's promoted position.
3. CDT handles 7 concentric shells of free points without degenerate triangulations.

---

### Proposal 3: Edge-Interior Companion Interpolation (Moderate)

**Idea**: Place companions not just at chain vertex U-positions but also at interpolated positions along chain edge segments. This fills the coverage gap at edge midpoints.

**Mechanism**: For each chain edge `(cv_i, cv_{i+1})` within a band, compute M intermediate sample positions along the edge. Emit companion shells (from P2/existing fan) at each sample position. This creates a companion "skirt" that follows the chain edge geometry.

**Mathematical basis**: Currently, vertex A at U=0.10 and vertex B at U=0.15 produce companion clusters at U=0.10 and U=0.15 with a 0.05 U-gap between them. CDT creates large triangles bridging this gap. With M=3 intermediate samples at U=0.1125, 0.125, 0.1375, companion coverage becomes continuous along the edge. CDT sees a dense corridor of points paralleling the chain edge and produces chain-edge-centric triangles.

**Algorithm**:
```
for each chain edge (cv_i, cv_{i+1}) in same band:
    edge_du = cv_{i+1}.u - cv_i.u
    edge_dt = cv_{i+1}.t - cv_i.t
    for m = 1 to M:
        frac = m / (M + 1)
        sample_u = cv_i.u + frac × edge_du
        sample_t_row = cv_i.rowIdx  // or interpolated row
        emitRungs(sampleVertex, tLo, tGap, bandIdx)
        emitUGradedFan(sampleVertex, tLo, tGap, bandIdx)
```

**Files affected**: `OuterWallTessellator.ts:733-758` (add edge interpolation loop after existing per-vertex loop)

**Trade-offs**:
- Pro: Directly addresses root cause 3. Eliminates coverage gaps between chain vertices.
- Pro: CDT sees continuous companion coverage along the chain edge → chain-edge-centric triangulation.
- Pro: Works with existing companion infrastructure (emitRungs, emitUGradedFan).
- Con: Multiplies companion count by ~(M+1)×. At M=3, quadruples companion generation.
- Con: Thin/short edges (du ≈ 0) produce redundant companions at nearly identical positions — mitigated by dedup.
- Con: Performance: at M=3 with 4133 chain points, ~12,400 edge-sample companion emission calls. With 28 companions per call, ~347K pre-dedup candidates. After dedup, likely 50-100K unique. This is within budget but pushing it.

**Assumptions** (for Verifier to attack):
1. Edge interpolation doesn't require creating new ChainVertex objects — we can reuse the parent vertex's metadata (chainId, rowIdx) for the interpolated sample.
2. The interpolated sample inherits the parent vertex's band membership (same bandIdx).
3. Dedup catches redundant companions from adjacent vertices' fans overlapping at edge midpoints.
4. M=3 intermediate samples is sufficient discretization for typical chain edge lengths.

---

### Proposal 4: Explicit Near-Chain Fan Triangulation (Radical)

**Idea**: Don't rely on CDT to create triangles in the immediate vicinity of the chain edge. Instead, build an explicit "fan layer" of triangles radiating from each chain edge segment to the first ring of companions. CDT then fills only the space between the fan layer and the strip boundary.

**Mechanism**:
1. For each chain edge segment, identify the nearest companion ring on each side (perpendicular to the edge).
2. Manually construct fan triangles: each chain edge segment fans out to the 2-3 closest companions per side.
3. Mark the fan layer's outer boundary as CDT constraint edges, so CDT doesn't re-triangulate the fan layer.
4. CDT fills the remaining space (fan boundary to strip boundary) with its own triangulation.

**Mathematical basis**: CDT maximizes minimum angle but has no concept of "radiating from a feature." Manual fan construction guarantees chain-edge-centric triangle orientation. The fan layer creates triangles with chain-edge aspect ratio matching the feature width, while CDT handles the transition to the grid boundary where grid-aligned patterns are acceptable.

**Algorithm (high-level)**:
```
Phase 1: For each chain edge segment (p_i, p_{i+1}):
    Find companions C_left[], C_right[] nearest to this edge (within 1 companion shell)
    Sort C_left by projection onto edge direction
    For each consecutive pair in C_left:
        Emit triangle: (edge_start, companion_j, companion_{j+1}) or fan from edge
    Repeat for C_right[]
    
Phase 2: Collect fan layer outer boundary vertices
    Add as CDT constraint edges (companion_j → companion_{j+1})
    
Phase 3: CDT fills remaining space
    Boundary: grid strip boundary (unchanged)
    Constraints: chain edges + fan ring constraint edges
    Interior: remaining companions (beyond first ring)
```

**Files affected**: New function `buildNearChainFanLayer()` in OuterWallTessellator.ts or ChainStripTriangulator.ts. Integration at the strip collection point (~line 1185).

**Trade-offs**:
- Pro: Guarantees chain-edge-centric triangle orientation in the near zone. This is the most direct answer to "feature edge as master cue."
- Pro: First triangle size is controlled directly, not influenced by CDT heuristics.
- Con: **High implementation complexity.** Manually constructing triangles + stitching to CDT is fragile. Fan triangles must be watertight with the CDT region. Cross-chain-edge fan triangles must be winding-consistent.
- Con: **Constraint crossing risk.** Adding fan ring boundary edges as CDT constraints may cross existing chain constraint edges, causing CDT failure and sweep fallback.
- Con: **Manifold risk.** Fan triangles share edges with CDT triangles. If any shared edge is not perfectly coincident (floating point mismatch), non-manifold edges result.
- Con: ~100 lines of new code with complex topology management.

**Assumptions** (for Verifier to attack):
1. Fan layer companions are exactly the same vertices used in CDT, so shared edges are numerically identical (no floating-point mismatch).
2. Fan ring constraint edges never cross chain constraint edges (requires proof of geometric separation).
3. Fan triangles have consistent winding with CDT triangles (requires matching the CDT winding convention).
4. The fan layer is closed (no holes between consecutive chain edge segments' fans).
5. Performance: fan construction is O(chain_points × companions_per_ring), likely <10ms.

---

### Proposal 5: Boundary Decimation for CDT (Conservative-Experimental)

**Idea**: Reduce the number of grid vertices in CDT strip boundaries. Instead of including every grid column vertex on the boundary, include every Nth. This reduces boundary dominance and lets interior/chain vertices drive the triangulation structure.

**Mechanism**: When constructing `stripBot` and `stripTop` (line 1185-1200), include only every `decimation_factor`th grid vertex. Companion vertices near skipped grid positions fill the density gap.

**Mathematical basis**: With N=3 decimation on 685 columns, boundary drops to ~228 vertices per row across the full pot. In a typical 9-column strip (expansion=4), boundary drops from 9 to 3 vertices per side. Interior companions (28+ per chain vertex per band) substantially outnumber boundary vertices, shifting CDT's attention to interior point distribution.

**Files affected**: `OuterWallTessellator.ts:1185-1230` (boundary construction)

**Trade-offs**:
- Pro: Simple concept — fewer boundary vertices = less boundary dominance.
- Pro: No new data structures or algorithms.
- Con: **Breaks grid-CDT stitching.** The regular grid mesh expects specific vertices at strip boundaries. If CDT strips omit boundary vertices, the resulting triangles won't share edges with adjacent grid cells → guaranteed non-manifold seams.
- Con: Would require boundary remapping or shared-vertex bookkeeping at strip edges.
- Con: The grid-CDT boundary interface is the most delicate part of the topology.

**Assumptions** (for Verifier to attack):
1. Adjacent grid cells can accept CDT triangles that reference a subset of boundary vertices. (LIKELY FALSE — this breaks shared-edge topology.)
2. The strip boundary edges remain valid CDT boundary constraints with skipped vertices. (TRUE but the resulting mesh geometry differs.)

**Verdict**: **REJECT.** Boundary decimation fundamentally conflicts with D-Radical's shared-edge topology. The strip boundary MUST be all grid vertices for manifold correctness. Including this for completeness only.

---

## Recommended Approach

**Phase 1 — Immediate (Proposal 0):** Fix UI defaults. This is a one-line change that activates all R19 improvements. Should be merged immediately.

**Phase 2 — Primary (Proposals 1 + 2 combined):** Anisotropic guard + ultra-near shells + near-chain T-ring.

This combination addresses root causes 1 and 2 without architectural disruption:
- P1 unlocks the near-chain zone by replacing the isotropic guard with an anisotropic one
- P2 fills the unlocked zone with graduated companion shells
- The near-chain T-ring closes the PROMO_EPSILON→first-shell T-gap

Expected improvement: First triangle height drops from ~15% to ~5% of band height. Guard reject count drops from 41,742 to <5,000. More companions survive near chain edges → CDT creates chain-edge-influenced triangulation.

**Phase 3 — Secondary (Proposal 3):** Edge-interior companion interpolation.

This addresses root cause 3 (coverage gaps at edge midpoints). It's an incremental improvement that multiplies companion density along chain edge interiors. Should be implemented after Phase 2 is validated, as the combined companion count may need budget adjustment (MAX_FAN_PER_BAND increase).

**Phase 4 — Deferred (Proposal 4):** Explicit fan layer is the theoretically pure answer to "chain edge as master cue" but carries too much implementation risk and complexity for the current pipeline maturity. Defer until Phase 2+3 results are evaluated. If CDT still shows grid-column-inherited patterns after Phase 2+3, revisit P4 as an architectural escalation.

**Reject (Proposal 5):** Boundary decimation breaks manifold topology.

## Specific Algorithm: Phase 2 Implementation Detail

### Step 1: Constants Update
```typescript
// OuterWallTessellator.ts:577
const CONSTRAINT_GUARD_RADIUS = 0.001;    // strict: near edge endpoints
const CONSTRAINT_GUARD_RELAXED = 0.0002;  // relaxed: mid-edge perpendicular
const SHELL_FRACTIONS = [0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0] as const;
const MAX_FAN_PER_BAND = 40;              // increased from 30 for 7 shells
```

### Step 2: Anisotropic Guard
```typescript
// OuterWallTessellator.ts:604-618  (replace isNearConstraintEdge)
function isNearConstraintEdge(cu: number, ct: number, bandIdx: number): boolean {
    const edges = constraintsByBand.get(bandIdx);
    if (!edges) return false;
    for (const e of edges) {
        const dx = e.u1 - e.u0, dy = e.t1 - e.t0;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-20) continue;
        const tParam = ((cu - e.u0) * dx + (ct - e.t0) * dy) / len2;
        const tClamped = Math.max(0, Math.min(1, tParam));
        const projU = e.u0 + tClamped * dx;
        const projT = e.t0 + tClamped * dy;
        const dist = Math.sqrt((cu - projU) ** 2 + (ct - projT) ** 2);
        
        // Mid-edge projections get relaxed guard; near-endpoint get strict
        const isInterior = tClamped > 0.1 && tClamped < 0.9;
        const guard = isInterior ? CONSTRAINT_GUARD_RELAXED : CONSTRAINT_GUARD_RADIUS;
        if (dist < guard) {
            guardRejectCount++;
            return true;
        }
    }
    return false;
}
```

### Step 3: Near-Chain T-Ring in emitUGradedFan
```typescript
// Add inside emitUGradedFan, after the main shell loop:

// Near-chain T-ring: fill the PROMO_EPSILON→first_shell_T gap
// Place companions at 2×PROMO_EPSILON (0.10) × tGap on each side,
// using the first 3 shells' U-positions.
const nearChainTFractions = [0.10, 0.15]; // between PROMO_EPSILON(0.05) and first T-level(0.20)
for (const ncFrac of nearChainTFractions) {
    const ncT = tLo + ncFrac * tGap;
    for (let s = 0; s < Math.min(3, nShells); s++) {
        const fraction = SHELL_FRACTIONS[s];
        for (const side of [-1, 1] as const) {
            const uRange = side < 0 ? cv.u - uLeft : uRight - cv.u;
            if (uRange < 1e-9) continue;
            const cu = cv.u + side * fraction * uRange;
            if (emitted >= MAX_FAN_PER_BAND) return;
            if (!isNearConstraintEdge(cu, ncT, bandIdx)) {
                tryEmitCompanion(cu, ncT, cv);
                emitted++;
            }
        }
    }
}
```

### Step 4: ExportDialog.tsx Fix
```typescript
// ExportDialog.tsx:146-147
chainStripDensity: 8,
chainStripExpansion: 4,
```

## Implementation Locations

| Change | File | Lines | Risk |
|--------|------|-------|------|
| UI defaults fix | `ExportDialog.tsx` | 146-147 | None |
| CONSTRAINT_GUARD_RELAXED const | `OuterWallTessellator.ts` | 581 | Low |
| Anisotropic guard function | `OuterWallTessellator.ts` | 604-618 | Medium |
| SHELL_FRACTIONS expansion | `OuterWallTessellator.ts` | 577 | Low |
| MAX_FAN_PER_BAND increase | `OuterWallTessellator.ts` | 578 | Low |
| Near-chain T-ring | `OuterWallTessellator.ts` | ~720 (end of emitUGradedFan) | Medium |

## Expected Quality Improvement

| Metric | Before (d4/e1) | After P0 (d8/e4) | After P0+P1+P2 |
|--------|----------------|-------------------|-----------------|
| Guard rejects | 41,742 | ~15,000 (est.) | <3,000 (est.) |
| First triangle T-span | 56% of band | ~15% of band | ~5% of band |
| Companions surviving | 47,970 | ~80,000 (est.) | ~120,000 (est.) |
| Min angle (UV) | 0.0° | ~2° (est.) | ~5° (est.) |
| R2 violations | 46,816 | ~20,000 (est.) | ~10,000 (est.) |

(Estimates — Phase 3 edge interpolation would further improve these.)

## Open Questions for Verifier

1. **CDT numerical stability at 0.0002 guard distance**: Is cdt2d (underlying library) numerically stable with free points at perpendicular distance 0.0002 from constraint edges? What is the library's effective epsilon?

2. **PROMO_EPSILON interaction**: With near-chain T-ring at 0.10×tGap and promoted chain vertex at 0.05×tGap, the T-gap between them is 0.05×tGap ≈ 0.000115. Is this below the dedup threshold (0.00001)? No — 0.000115 >> 0.00001. But is it too close for CDT to produce quality triangles?

3. **7 shells × companions per shell**: At density=8, each chain vertex emits up to 14 companions per side×band (28 per band). With ~200 chain vertices per band (4133/20 chains ≈ 207), that's ~5,800 companions per band. With 432 bands, total ~2.5M pre-dedup candidates. After dedup, probably ~200K. Is this within performance budget? The dedup spatial hashing should keep generation O(N) but N is 5× larger than R19.

4. **Guard anisotropy threshold**: The `t ∈ (0.1, 0.9)` threshold means the relaxed guard only applies when the companion projects onto the middle 80% of the edge. Is 0.1/0.9 the right split? Would 0.05/0.95 be better (more permissive) or 0.15/0.85 (more conservative)?

5. **Near-chain T-ring budget**: The T-ring adds 2 T-positions × 3 shells × 2 sides = 12 extra companions per chain vertex per band. Combined with the 7-shell fan (28 per band), that's 40 total — exactly at MAX_FAN_PER_BAND=40. Is this too tight? Should we increase to 50 or split the near-chain ring into its own budget?

6. **Proposal 3 interaction**: If we proceed with edge-interior interpolation (Phase 3) after Phase 2, the companion count grows by factor M+1. At M=3, ~800K post-dedup companions. Is this acceptable? Should edge interpolation use a reduced shell count (only the first 3 shells)?

7. **D-Radical invariant preservation**: Do near-chain T-ring companions at `0.10×tGap` from the boundary risk being bucketed into the wrong band by `interiorByBand`? The bucketing uses `bsearchFloor(activeTPositions, cv.t)` with strict bounds `cv.t > activeTPositions[bandIdx] && cv.t < activeTPositions[bandIdx + 1]`. At T = tLo + 0.10×tGap, this should correctly place in band j. Verify.
