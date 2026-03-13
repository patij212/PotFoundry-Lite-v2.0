# Verifier Round 6 — Final Verdict: T-Ladder Collinearity Fix + Companion Cap
Date: 2026-03-04

## Summary Verdict: ACCEPT WITH AMENDMENTS (Proposals 1 + 3)

The Generator's collinearity diagnosis (RC-B) is **correct and well-evidenced**.
Center companions at `(cv.u, tLevel)` are near-collinear with constraint edges
`(cv.u, tRow) → (cv.u ± du, tRow+1)`. `cdt2d` splits the constraint through the
companion, causing the direct edge to disappear from the mesh. This is the root cause
of the 488 missing edges — MORE companions = MORE constraint splits = MORE "missing" edges.

The companion count explosion (RC-A) at density=12 producing 651K companions is also
correctly diagnosed: dedup at 1e-5 barely helps because adjacent chain vertices on
the same chain produce companions at different-enough U-positions.

## Accepted Items

### A1: Remove center companions ✓
**Evidence**: `emitRungs()` at OWT L449 calls `tryEmitCompanion(cv.u, tLevel, cv)`.
The constraint edge from `(cv.u, tRow)` to `(cv.u ± du, nextRow)` passes through
U ≈ cv.u at intermediate T-levels. With typical du < 0.001, the center companion
offset from the constraint path is `|k/(nT+1) * du| < 0.0005` — below CDT's
numerical tolerance in normalized strip coordinates.

### A2: Cap nTLevels and nUSpread ✓
**Evidence**: Current formula `nTLevels=6, nUSpread=4` at density=12 produces
108 companions per chain vertex. Capping at nTLevels=2, nUSpread=2 produces
8 per vertex (no center) — a 13.5× reduction, bringing companion count to
~40K post-dedup, with ~7 interior vertices per CDT strip.

### A3: Micro-row T-gap guard ✓
**Evidence**: 87 micro-rows with T-gaps ~0.0001 produce microscopic companions.
`MIN_TGAP_FOR_COMPANIONS = 0.001` skips these vanishing bands.

### A4: Constraint edge guard zone (Proposal 3) ✓
**Evidence**: Even without center companions, lateral companions at small U-offsets
could approach constraint edges of ADJACENT chains. The point-to-segment distance
check provides mathematical guarantee.

### A5: Constraint endpoint injection preserved ✓
This fix (OWT L957-979) is still needed for chain vertices beyond strip U-range.

## Amendments

### C1 [CRITICAL → AMEND]: nTLevels must have min=1 at density ≥ 2

Generator's formula: `nTLevels = min(2, floor(density/4))`
- At density=1: `floor(1/4) = 0` → NO companions
- At density=2: `floor(2/4) = 0` → NO companions
- At density=3: `floor(3/4) = 0` → NO companions

This gives zero companions for density 1-3, which defeats the purpose. The T-Ladder
is needed at ALL densities to break T-direction slivers.

**Required fix**:
```typescript
const nTLevels = Math.max(1, Math.min(2, Math.floor(density / 4)));
```
This gives: density=1-3→1, density=4-7→1, density=8-11→2, density=12→2.

At density=1-3 with nTLevels=1 and nUSpread=1: 1 T-level × 2×1 spread = 4
companions per band, 8 per CV. Manageable and useful.

### C2 [WARNING → AMEND]: nUSpread must also have min=1

Generator's formula: `nUSpread = min(2, floor(density/3))`
- At density=1: `floor(1/3) = 0` → no lateral companions → no companions at all
  (center is removed)
- At density=2: `floor(2/3) = 0` → same problem

**Required fix**:
```typescript
const nUSpread = Math.max(1, Math.min(2, Math.floor(density / 3)));
```
This gives: density=1-2→1, density=3-5→1, density=6-8→2, density=9-12→2.

### C3 [NOTE]: MIN_LATERAL_CLEARANCE / nUSpread check is redundant

Generator's code: `if (uOff < MIN_LATERAL_CLEARANCE / nUSpread) continue;`

With `baseSpreadU = max(tGap * 0.4, MIN_LATERAL_CLEARANCE)` and
`uOff = baseSpreadU * m / nUSpread`, the minimum uOff (m=1) is:
`baseSpreadU / nUSpread ≥ MIN_LATERAL_CLEARANCE / nUSpread`

So the check always passes. Remove it to avoid confusion.

### C4 [WARNING → AMEND]: Proposal 4 (path-connected verification) — REJECT

Do NOT implement Proposal 4. It masks the root cause. The constraint edges must
appear as DIRECT mesh edges. If they don't, the CDT is producing wrong results.
Path-connectivity is a diagnostic crutch, not a fix.

### C5 [NOTE]: Skip companions for interpolated chain vertices (pointIdx=-1)

Generator's Question 3 raises this. YES — interpolated micro-row vertices (pointIdx=-1)
are synthetic and don't represent real features. However, their constraint edges are
still passed to CDT (the pointIdx filter was removed in Round 4). Skipping companions
for them reduces companion count by ~25% (from the log: 6586 edges, 4854 chain points,
so ~1732 interpolated vertices). This is a worthwhile optimization.

**Required**: Add `if (cv.pointIdx < 0) continue;` before companion generation.

## Implementation Plan (For Executioner)

### Step 1: Update companion config constants
**File**: OuterWallTessellator.ts ~L398-410
```typescript
const SEAM_COMPANION_GUARD = 1e-6;
const COMPANION_DEDUP_THRESHOLD = 1e-5;
const ASPECT_MATCH_FACTOR = 0.4;
const MIN_LATERAL_CLEARANCE = 0.002;
const MIN_TGAP_FOR_COMPANIONS = 0.001;
const CONSTRAINT_GUARD_RADIUS = 0.001;

const nTLevels = Math.max(1, Math.min(2, Math.floor(density / 4)));
const nUSpread = Math.max(1, Math.min(2, Math.floor(density / 3)));
```

### Step 2: Build constraint edge index (after chainEdges built, before companion gen)
**File**: OuterWallTessellator.ts, after ~L382
Build `constraintsByBand` map indexed by band (min rowIdx).

### Step 3: Add guard zone check function
**File**: OuterWallTessellator.ts, near companion helpers
Add `isNearConstraintEdge(cu, ct, bandIdx)` using point-to-segment distance.

### Step 4: Rewrite emitRungs — NO center companion, enforce lateral clearance
**File**: OuterWallTessellator.ts L435-460
- Remove `tryEmitCompanion(cv.u, tLevel, cv)` (the center companion line)
- Add `if (tGap < MIN_TGAP_FOR_COMPANIONS) return;` guard
- Use `baseSpreadU = max(tGap * ASPECT_MATCH_FACTOR, MIN_LATERAL_CLEARANCE)`
- Add `isNearConstraintEdge` check before emitting
- Add per-CV companion counter capped at `MAX_COMPANIONS_PER_CV = 20`

### Step 5: Skip companions for interpolated vertices
**File**: OuterWallTessellator.ts, in the companion generation loop
Add `if (cv.pointIdx < 0) continue;` before processing each chain vertex.

### Step 6: Update diagnostic logging
Report the new parameters and guard zone rejection count.

### Step 7: Keep existing infrastructure unchanged
- 2D spatial dedup, interiorByBand, stripInteriorVerts, C1 filter, constraint
  endpoint injection — all unchanged.

## Validation Protocol

| Metric | Target | Hard Fail |
|--------|--------|-----------|
| Companions after dedup | < 50,000 | > 100,000 |
| Missing chain edges | < 50 | > 200 |
| maxAspect UV | < 1000:1 | > 10,000:1 |
| Build time (density=12) | < 20s | > 60s |
| Inverted triangles | < 10,000 | > 100,000 |
| Validation manifold | true | false |

## Answers to Generator's Open Questions

1. **MIN_LATERAL_CLEARANCE = 0.002**: ACCEPTED. Max chain du is ~0.001 (from log).
   0.002 provides 2× margin. For steep spirals, the guard zone (Proposal 3) catches
   companions near adjacent chains.

2. **nTLevels min=1 at density≥1**: YES. See C1 amendment. The T-Ladder's purpose is
   to break slivers — it's needed at all densities.

3. **Skip interpolated vertices**: YES. See C5. Add `if (cv.pointIdx < 0) continue;`.

4. **Batch 6 dedup interaction**: NOT the primary issue. The 48 merged vertices (from log)
   are too few to explain 488 missing edges. The collinearity trap is the root cause.

5. **Proposal 2 as escalation**: Not needed for now. If Proposal 1+3 brings companions
   to ~40K and build time to <20s at density=12, that's acceptable.
