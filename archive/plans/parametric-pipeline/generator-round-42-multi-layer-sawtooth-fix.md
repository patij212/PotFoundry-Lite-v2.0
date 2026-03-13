# Generator Round 42 — Fix the Multi-Layer Sawtooth

Date: 2026-03-08

## Problem Statement

R41's `chainFanQuad` fixed topology INSIDE chain cells, but the exported STL still shows persistent sawtooth at feature edges. The Master identified **4 independent, compounding causes**. Each one alone might produce a subtle artifact; together they create the visible zigzag. All four must be addressed to eliminate the sawtooth.

---

## Root Cause Analysis

### The Sawtooth Anatomy (What the User Sees)

On a near-vertical ridge (most pottery features), the exported mesh shows a zigzag pattern along the feature crest. This is NOT caused by a single bug — it's the superposition of four independent mechanisms:

1. **Adjacent standard cells** have diagonals alternating row-by-row (`j%2`)
2. **Chain vertex positions** oscillate ±2 grid columns between rows
3. **Feature-edge subdivision** is blocked by phantom vertex protection
4. **Standard→chain cell boundary** has mismatched diagonal directions

The R41 chain cell fan fixed the chain cells themselves (quadMap = -1), but `chainDirectedFlip` still operates on the **band cells** around those chain cells (ridgeCol ± 1), and the `j%2` alternation creates the dominant remaining sawtooth in those adjacent standard cells.

---

## Fix 1: Eliminate `j%2` Alternation in `chainDirectedFlip`

### The Problem

At [MeshOptimizer.ts lines 216-226](potfoundry-web/src/renderers/webgpu/parametric/MeshOptimizer.ts#L216-L226):

```typescript
if (localUDelta > LEAN_THRESHOLD) {
    flipToAD(bandQuadIdx, j, bandCol);
} else if (localUDelta < -LEAN_THRESHOLD) {
    flipToBC(bandQuadIdx, j, bandCol);
} else {
    if (j % 2 === 0) {           // ← THE SAWTOOTH FACTORY
        flipToAD(bandQuadIdx, j, bandCol);
    } else {
        flipToBC(bandQuadIdx, j, bandCol);
    }
}
```

For near-vertical chains (the common case on pottery), `localUDelta` is nearly zero between consecutive rows. The `LEAN_THRESHOLD` of 0.0001 catches nearly all of them. The `j%2` tie-breaker then forces alternating diagonals on the ±1 band columns around the ridge — creating visible row-to-row sawtooth.

### Evidence from the Code

The stitch band covers `ridgeCol-1, ridgeCol, ridgeCol+1` (STITCH_BAND_HALF_WIDTH = 1, line 27). For a near-vertical chain:
- `ridgeCol` itself is usually a chain cell (quadMap=-1, skipped by the `triBase < 0` guard inside flipToAD/flipToBC)
- `ridgeCol-1` and `ridgeCol+1` are standard cells — these are where the `j%2` alternation operates
- These cells are the IMMEDIATE visual neighbors of the chain cells, so any diagonal inconsistency is maximally visible

### Algorithm: Consistent Tangent-Propagated Direction

**Proposal 1A: Use the chain's GLOBAL tangent instead of per-segment `localUDelta`**

Instead of checking the per-row `localUDelta` (which is nearly zero for vertical ridges), compute the chain's **macro tangent** — the U-delta over a window of ±3 rows. This gives a stable directional signal that doesn't flip row-by-row.

```
For the tie-break case (|localUDelta| ≤ LEAN_THRESHOLD):
  1. Look at the chain's U-delta over a ±3 row window centered on this row
  2. macroUDelta = uAtRow(j+3) - uAtRow(j-3)  (or endpoint-clamped)
  3. If |macroUDelta| > LEAN_THRESHOLD → use macro direction
  4. If still zero → always flipToAD (consistent with emitStandardCell default)
```

Why this works: A near-vertical chain may have `localUDelta ≈ 0` at every row, but the macro tangent reveals whether the chain is leaning slightly left or right over multiple rows. Using this for the tie-break gives every row in a segment the SAME diagonal direction.

**Proposal 1B (simpler, more radical): Skip the flip entirely for near-zero delta**

When `|localUDelta| ≤ LEAN_THRESHOLD`, don't flip the cell at all. Leave it in its `emitStandardCell` default diagonal (BL→TR, which is AD). This is consistent across all rows by construction.

```typescript
if (localUDelta > LEAN_THRESHOLD) {
    flipToAD(bandQuadIdx, j, bandCol);
} else if (localUDelta < -LEAN_THRESHOLD) {
    flipToBC(bandQuadIdx, j, bandCol);
}
// else: do nothing — leave standard diagonal intact
```

### Recommended: Proposal 1B

Proposal 1B is simpler, lower-risk, and achieves the same outcome for near-vertical chains. The global tangent approach (1A) is more principled but adds complexity for minimal gain — the cases where the macro tangent differs from "just leave it alone" are edge cases involving slow diagonal drift that `flipEdges3D` can handle downstream.

### Code Location and Change

**File**: [MeshOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/MeshOptimizer.ts#L216-L226)

**Change**: Remove the `else { j%2 }` branch entirely. The `if/else if` for `localUDelta > LEAN_THRESHOLD` and `localUDelta < -LEAN_THRESHOLD` remains — the only change is eliminating the tie-break.

**Line count**: ~5 lines removed, 0 added. Net: -5 lines.

### Risk Assessment

**Low risk.**
- Chain cells (quadMap=-1) are unaffected — they already skip with `triBase < 0`
- Cells with clear directional signal (`|localUDelta| > LEAN_THRESHOLD`) are unaffected
- Only the near-zero delta cells change behavior: instead of alternating, they keep their default diagonal
- The downstream `flipEdges3D` can still optimize these cells (they're NOT locked if we don't flip them)

Wait — there's a subtlety. The current code **always locks** the band cell regardless of whether it was flipped:

```typescript
if (shouldLockBand) {
    lockedQuads.add(bandQuadIdx);  // locks even if no flip happened
}
```

If we skip the flip for the tie-break case, we should ALSO skip the lock for those cells. Otherwise they can't be optimized by `flipEdges3D`.

**Revised change**: When `|localUDelta| ≤ LEAN_THRESHOLD`, skip both the flip AND the lock. This frees the cell for `flipEdges3D` to optimize using actual 3D geometry.

**Assumptions for Verifier**:
1. Near-vertical chains have `|localUDelta| ≤ LEAN_THRESHOLD` for most rows
2. Leaving standard cells at their default AD diagonal and unlocked is safe
3. `flipEdges3D` downstream will handle any remaining non-optimal diagonals
4. The `j%2` alternation was the primary visible sawtooth cause

### Expected Impact: **HIGH (60% of visible sawtooth)**

This is the dominant cause. The `j%2` pattern creates a 1-row-period zigzag that is maximally visible because it operates on the cells immediately flanking the ridge.

---

## Fix 2: Increase Mesh-Guide Blend Strength

### The Problem

At [ChainLinker.ts lines 465-479](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L465-L479):

```typescript
const MESH_GUIDE_BASE_BLEND_WEIGHT = 0.12;      // only 12% toward smoothed path
const MESH_GUIDE_ADAPTIVE_BLEND_GAIN = 0.88;     // up to 100% at high jaggedness
const MESH_GUIDE_ACCEL_FULL_BLEND = 0.003;       // jag threshold for full blend
const MESH_GUIDE_MAX_POINT_SHIFT = 0.003;        // hard cap on displacement
```

The `maxShift=0.003` and `avgShift=0.000104` (from the user's export log) show that the blend is extremely conservative. The chain positions are barely moved toward the smoothed path. The post-smooth chain still has `maxConsecDelta=0.003069`, meaning the chain U oscillates by up to ~2 grid columns between rows.

### Why the Blend is Too Conservative

The SG-smoothed chain (SMOOTH_HALFWIDTH = 8, line 553 in ChainLinker.ts) has already been validated as a good trajectory — it's the same chain, just with high-frequency oscillation removed. The problem is that `blendTowardSmoothedChain` at line 500 applies only 12% of the correction (BASE_BLEND = 0.12) and caps total displacement at 0.003.

The `MESH_GUIDE_ACCEL_FULL_BLEND = 0.003` means that only at acceleration ≥ 0.003 (significant jagging) does the adaptive gain kick in. For mild oscillation (accel < 0.003), the blend stays at 12%, which moves the chain by:
```
0.12 × (smooth_u - raw_u) ≈ 0.12 × 0.002 ≈ 0.00024
```
This is essentially noise-level correction. The oscillation persists.

### Algorithm: Increase Blend Parameters

**Proposal 2A: Increase both BASE_BLEND and MAX_POINT_SHIFT**

```typescript
const MESH_GUIDE_BASE_BLEND_WEIGHT = 0.40;       // was 0.12 — 40% baseline correction
const MESH_GUIDE_ADAPTIVE_BLEND_GAIN = 0.60;     // was 0.88 — still reaches 100% at high jag
const MESH_GUIDE_ACCEL_FULL_BLEND = 0.002;       // was 0.003 — trigger adaptive earlier
const MESH_GUIDE_MAX_POINT_SHIFT = 0.008;        // was 0.003 — allow more displacement
```

Rationale:
- **BASE_BLEND 0.40**: Even for smooth regions, apply 40% correction. The smoothed chain IS the chain — it's not a foreign signal. 40% was chosen as the sweet spot: enough to meaningfully reduce oscillation, conservative enough to not overshoot the GPU re-snapped positions.
- **MAX_POINT_SHIFT 0.008**: The current 0.003 cap means the chain can move at most ~1 grid column. At 0.008, it can move ~2-3 columns. Given that the oscillation amplitude is up to 0.003 (nearly all capped), raising the cap to 0.008 lets the blend actually do its job.
- **ACCEL_FULL_BLEND 0.002**: Trigger adaptive blending at lower jaggedness thresholds.
- **ADAPTIVE_GAIN 0.60**: Reduced from 0.88 to keep total = BASE + GAIN = 1.00.

**Proposal 2B (conservative): Only increase MAX_POINT_SHIFT**

```typescript
const MESH_GUIDE_MAX_POINT_SHIFT = 0.008;        // was 0.003
```

This leaves the blend logic unchanged but raises the ceiling. The adaptive blend already reaches 100% at high jagging; the current issue is that the cap clips the correction before it can fully apply.

### Recommended: Proposal 2A

The current BASE_BLEND of 0.12 is too timid. The GPU re-snap step already positioned the chain at exact mathematical features — the SG smooth path is a LOCAL average of those exact positions. Moving 40% toward that average is safe and significantly reduces oscillation.

### Code Location and Change

**File**: [ChainLinker.ts lines 465-479](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L465-L479)

**Change**: Update 4 constants.

**Line count**: 4 lines changed (constant values only).

### Risk Assessment

**Moderate risk.** Increasing blend strength could:
- Over-smooth sharp features (mitigated by the hard cap)
- Move chain positions away from their GPU re-snapped exact locations (but 40% blend is still mostly preserving the raw position)
- Interact with the chain-strip tessellator's UV snapping (but the tessellator re-snaps anyway)

The key safety net is the hard cap: even at MAX_POINT_SHIFT=0.008, the chain can't move more than ~3 grid columns. For a typical 200-column grid, that's 1.5% of the circumference — well within the "same feature" radius.

**Assumptions for Verifier**:
1. The SG-smoothed chain is a valid target — it represents the same mathematical feature
2. 40% base blend is safe and doesn't overshoot
3. MAX_POINT_SHIFT of 0.008 is within acceptable range
4. The downstream tessellator and optimizer are robust to these position changes
5. The numbers `avgShift=0.000104, maxShift=0.003000` confirm current blend is too conservative

### Expected Impact: **MODERATE (20% of visible sawtooth)**

Reducing chain oscillation smooths the 3D ridge crest. However, this alone doesn't fix the mesh topology — it makes the topology problem LESS visible by reducing the amplitude of the zigzag.

---

## Fix 3: Allow Subdivision of Protected-Endpoint Feature Edges

### The Problem

At [MeshSubdivision.ts lines 402-407](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L402-L407):

```typescript
const touchesProtectedPatch = (v0: number, v1: number, opp0: number, opp1: number): boolean =>
    protectedVertices !== undefined && (
        protectedVertices.has(v0) ||
        protectedVertices.has(v1) ||
        protectedVertices.has(opp0) ||
        protectedVertices.has(opp1)
    );
```

This function rejects ANY edge split where ANY of the 4 involved vertices is in `protectedVertices`. With 9,765 phantom vertices in `protectedStripVertices`, most feature edges (chain↔grid) in super-cell regions have at least one protected endpoint. Result: `candidates: 9165, protected rejects: 5014` — 55% of subdivision candidates are rejected.

### Why This Protection is Overly Broad

The `protectedStripVertices` set was introduced in R38 to prevent **optimizer passes** (ChainStripOptimizer, flipEdges3D, boundary diagonal optimizer) from damaging the phantom-corridor topology. These optimizers change edge connectivity (diagonal flips) which can break the carefully constructed phantom triangulation.

But **subdivision** is fundamentally different:
- It does NOT change any existing edge connectivity
- It ADDS a midpoint vertex on an existing edge
- Both triangles sharing the split edge get the midpoint — the topology is strictly refined, not altered
- The phantom triangulation is preserved — every existing triangle either stays unchanged or is cleanly bisected

The only risk with splitting a protected edge is if the **midpoint** is then used by a subsequent optimizer pass as a pivot for flipping. But the midpoint is a NEW vertex — it's not in `protectedStripVertices`, so it won't be protected, but it also won't be a phantom vertex that the protection is designed to guard.

### Algorithm: Exempt Feature Edges from Protection

**Proposal 3A: Allow splitting when the EDGE endpoints are protected but the OPPOSITE vertices are not**

The concern with protected vertices is that flipping their containing triangles damages phantom topology. But splitting an edge doesn't flip anything — it refines. The safe exemption is:

```typescript
const touchesProtectedPatch = (
    v0: number, v1: number, opp0: number, opp1: number,
    isFeatureEdge: boolean
): boolean => {
    if (protectedVertices === undefined) return false;
    
    // Feature edges (chain↔grid): allow splitting even if edge endpoints are protected.
    // Subdivision is topology-preserving — it adds a midpoint, doesn't change connectivity.
    // Only block if OPPOSITE vertices are protected (those triangles are fully inside phantom patch).
    if (isFeatureEdge) {
        return protectedVertices.has(opp0) || protectedVertices.has(opp1);
    }
    
    // Non-feature edges: keep current strict protection
    return protectedVertices.has(v0) || protectedVertices.has(v1) ||
           protectedVertices.has(opp0) || protectedVertices.has(opp1);
};
```

Why check opposite vertices: If both opposite vertices are non-protected, the two triangles being split are on the boundary between protected and unprotected regions — exactly where we WANT more resolution. If an opposite vertex IS protected, the triangle is fully inside the phantom patch and splitting it could interact poorly with later optimizer passes.

**Proposal 3B (more aggressive): Only check opposite vertices for ALL edges**

```typescript
const touchesProtectedPatch = (v0: number, v1: number, opp0: number, opp1: number): boolean =>
    protectedVertices !== undefined && (
        protectedVertices.has(opp0) || protectedVertices.has(opp1)
    );
```

This allows splitting any edge as long as we're not bisecting triangles that are fully inside the phantom corridor (identified by their opposite vertices being protected).

### Recommended: Proposal 3A

The feature-edge-only exemption is targeted and safe. The `isFeatureEdge` flag is already computed at [MeshSubdivision.ts line 383](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L383):

```typescript
const isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
```

We just need to pass this into `touchesProtectedPatch`.

### Code Location and Change

**File**: [MeshSubdivision.ts lines 393-407](potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts#L393-L407)

**Change**: Modify `touchesProtectedPatch` to accept `isFeatureEdge` parameter and conditionally exempt edge endpoints. Update the call site at line 422:

```typescript
if (touchesProtectedPatch(se.v0, se.v1, opp0, opp1, isFeatureEdge)) {
```

Also need to store `isFeatureEdge` in the `SplitEdge` interface, or recompute it at the call site (trivial — it's just `(v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount)`).

**Line count**: ~10 lines changed (function signature, conditional logic, call site).

### Risk Assessment

**Low risk.**
- Subdivision is topology-preserving by design
- Feature edges are exactly where we WANT more resolution
- Opposite-vertex check still protects fully-internal phantom triangles
- New midpoint vertices are NOT added to `protectedStripVertices`, so they don't expand the protected set

**Assumptions for Verifier**:
1. Subdivision is topology-preserving (adds vertex, doesn't change connectivity)
2. Splitting a protected-endpoint edge doesn't damage phantom topology
3. The opposite-vertex check is sufficient to protect fully-internal phantom triangles
4. The 55% rejection rate represents genuine lost resolution, not false positives

### Expected Impact: **MODERATE (15% of visible sawtooth)**

More subdivision at feature edges means smaller triangles at the chain↔grid boundary — smoother visual transitions. The effect is indirect: it doesn't fix the diagonal direction, but it reduces the amplitude of any remaining zigzag by adding more resolution.

---

## Fix 4: Consistent Diagonal at Chain/Standard Cell Boundary

### The Problem

`emitStandardCell` at [OuterWallTessellator.ts line 1415](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1415) always uses a BL→TR diagonal (AD in quad terminology). It emits:
- tri1: (BL, BR, TR) — bottom-right triangle
- tri2: (BL, TR, TL) — top-left triangle

The R41 `chainFanQuad` at [OuterWallTessellator.ts lines 347-354](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L347-L354) uses a chain_bot→grid_top diagonal:
```typescript
emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);  // grid_bot, chain_bot, grid_top
emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);  // grid_top, chain_bot, chain_top
```

This diagonal is deterministic across all rows (by design), but it may or may not match the AD diagonal of the adjacent standard cell. The mismatch creates a crease at the boundary.

### Analysis: Is This Actually a Problem?

After Fix 1, the `chainDirectedFlip` band operation will either:
- Flip the adjacent cell to match the chain's lean direction (when `|localUDelta| > LEAN_THRESHOLD`), or
- Leave the cell at its default AD diagonal (when delta ≈ 0, after Fix 1)

The chain cell has quadMap = -1, so `chainDirectedFlip` skips it entirely (the `triBase < 0` guard). The adjacent standard cell at ridgeCol±1 gets either:
- flipped to match the macro lean direction (good)
- left at default AD (which may or may not match the fan's diagonal)

**The key question**: Does the fan's diagonal (chain_bot→grid_top) correspond to AD or BC in the quad grid convention?

Looking at the R41 fan geometry:
- Sub-quad right edge: `subBot[1]` = chain vertex on bottom, `subTop[1]` = chain vertex on top
- Sub-quad left edge: `subBot[0]` = grid/previous boundary, `subTop[0]` = grid/previous boundary
- Fan diagonal: subBot[1] → subTop[0] (chain_bot → grid_top)

In the surrounding grid, the chain cell is at ridgeCol. The adjacent cell at ridgeCol+1 has:
- BL = ridgeCol+1 bottom, BR = ridgeCol+2 bottom
- TL = ridgeCol+1 top, TR = ridgeCol+2 top

The fan's diagonal (chain_bot → grid_top) runs from the chain vertex (between ridgeCol and ridgeCol+1) to the grid_top vertex (at the partition boundary, which is near ridgeCol or ridgeCol+1). This doesn't directly correspond to either AD or BC of the ADJACENT cell — they're in different cells.

**Conclusion**: This is actually a NON-issue after Fix 1. The diagonal mismatch only manifests visually when alternating diagonals create a zigzag pattern across multiple rows. With Fix 1 eliminating the alternation, the remaining boundary will be smooth. The `flipEdges3D` pass will optimize any remaining boundary issues using 3D geometry.

### Recommendation: No Change Needed

After Fix 1 removes the `j%2` alternation, Fix 4 becomes redundant. The chain cell boundary is ONE row of diagonal transition — not a multi-row zigzag. `flipEdges3D` handles single-cell boundary transitions well (it specifically optimizes min-angle and dihedral).

If the Verifier disagrees and identifies a specific pathological case where the boundary creates visible artifacts AFTER Fix 1, we can revisit.

### Expected Impact: **NEGLIGIBLE after Fix 1**

---

## Interaction Analysis

### Fix 1 × Fix 2: Amplifying

Fix 1 (no alternation) + Fix 2 (less chain oscillation) work together powerfully:
- Fix 1 ensures the mesh diagonal direction is consistent across rows
- Fix 2 ensures the chain vertex positions are consistent across rows
- Together: both the topology AND geometry are consistent → smooth ridge crest

### Fix 1 × Fix 3: Additive

Fix 1 (consistent diagonals) + Fix 3 (more subdivision) are independent improvements:
- Fix 1 removes the zigzag pattern
- Fix 3 adds resolution at feature edges
- Together: more, better-oriented triangles at the ridge flank

### Fix 2 × Fix 3: Additive

Fix 2 (smoother chain path) + Fix 3 (more subdivision) are both geometry improvements:
- Fix 2 reduces the amplitude of chain position oscillation
- Fix 3 resolves remaining oscillation with finer triangles
- No conflict — they operate on different aspects (UV positions vs. mesh resolution)

### Fix 1 × Fix 4: Subsuming

Fix 1 makes Fix 4 unnecessary. The `j%2` alternation was the primary mechanism creating boundary mismatches. Without it, the boundary is a single-cell transition that `flipEdges3D` handles.

### No Conflicts Identified

None of the fixes operate on the same data structure at the same time. Fix 1 is in MeshOptimizer.ts (diagonal flipping), Fix 2 is in ChainLinker.ts (chain blending), Fix 3 is in MeshSubdivision.ts (edge splitting). They execute in sequence during the pipeline.

---

## Combined Implementation Plan

### Phase Order

```
Phase 1:  Fix 1 — Remove j%2 alternation (MeshOptimizer.ts)
          Highest impact, lowest risk, fewest lines changed.
          Test immediately to see if sawtooth is visually reduced.

Phase 2:  Fix 2 — Increase blend strength (ChainLinker.ts)
          Second highest impact, moderate risk.
          Compare chain-quality metrics before/after in export log.

Phase 3:  Fix 3 — Exempt feature edges from protection (MeshSubdivision.ts)
          Third highest impact, low risk.
          Check export log: protectedRejects should drop dramatically.

Phase 4:  Fix 4 — Skip (subsumed by Fix 1)
```

### Total Line Count Estimate

| Fix | Lines Changed | Lines Added | Lines Removed | Net |
|-----|--------------|-------------|---------------|-----|
| Fix 1 | 2 | 0 | 5 | -5 |
| Fix 2 | 4 | 0 | 0 | 4 changed |
| Fix 3 | 8 | 5 | 3 | +2 |
| **Total** | **14** | **5** | **8** | **~-1** |

### Testing Strategy

1. All 1883 existing unit tests must pass after each phase
2. Export a "Gothic Arches" or "Spiral Ribs" style pot (these have prominent near-vertical ridges)
3. Compare export log metrics:
   - Phase 1: `chain-directed flip: N diagonals along ridges` — N should be LOWER (fewer flips because tie-breaks are now skipped)
   - Phase 2: `avgShift` should increase from 0.000104 to ~0.001-0.002
   - Phase 3: `protected rejects` should drop from 5014 to ~1000-2000

---

## Open Questions (For Verifier)

1. **Fix 1 lock behavior**: When we skip the flip for `|localUDelta| ≤ LEAN_THRESHOLD`, should we also skip locking those cells? My analysis says YES (let `flipEdges3D` optimize them), but the original intent of the lock was to prevent the 3D flipper from undoing chain-aligned diagonals. If the cell was never flipped (kept at default), there's nothing to protect.

2. **Fix 2 constants tuning**: Are the proposed values (BASE=0.40, MAX_SHIFT=0.008) within safe bounds? The SG smooth with HALFWIDTH=8 already produces a heavily smoothed path — 40% blend toward it is aggressive but not reckless. What's the Verifier's assessment?

3. **Fix 3 edge case**: Could splitting a feature edge with a protected endpoint create a triangle that a subsequent optimizer pass (CSO, boundary diagonal) then damages? The new midpoint vertex is NOT protected, so it's vulnerable to optimizer passes. Is this a concern?

4. **Fix 4 dismissal**: Am I right that Fix 1 subsumes Fix 4? Or is there a pathological chain geometry where the fan diagonal direction creates a visible crease even with consistent band diagonals?

5. **Regression risk**: The `chainDirectedFlip` `j%2` alternation was presumably added for a reason in v10.4. What was the original motivation? Can we find that in the agents_journal? If it was solving a different visual artifact, removing it might re-introduce that artifact.
