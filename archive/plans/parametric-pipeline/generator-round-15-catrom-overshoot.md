# Generator Round 15 — CatRom Overshoot & Chain-Strip Micro-Jaggedness

Date: 2026-03-05

## Problem Statement

After Round 14 fixed chain positions to use pre-smooth (true GPU re-snapped) coordinates, the mesh STL still exhibits **micro-jaggedness at feature edges** despite debug polylines connecting the SAME chain points appearing perfectly smooth.

The polylines are smooth because they use straight 3D line segments between 264-row chain points — enough angular resolution for visual smoothness. The mesh processes the same points through CatRom subdivision → CDT triangulation → edge flips, and the CatRom step introduces **U-position overshoot** that creates zigzag constraint paths.

Quality metrics confirm the severity:
- `minAngle=0.0°` — degenerate triangles exist
- `maxAspect=52,560,877:1` (UV), `1,000,000:1` (3D) — extreme slivers
- 51.5% of chain-strip triangles have aspect ratio >4:1
- 93,702 R2 violations (feature vertex adjacent to grid boundary vertex)

## Root Cause Analysis

### Finding 1: CatRom Overshoot in U-Position

The `catmullRomInterp` function at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L357) uses **uniform Catmull-Rom** (α=0):

```
q(t) = 0.5 * ((2·p1) + (-p0 + p2)·t + (2·p0 - 5·p1 + 4·p2 - p3)·t² + (-p0 + 3·p1 - 3·p2 + p3)·t³)
```

This is the standard cubic interpolant. It passes through p1 at t=0 and p2 at t=1, with tangent at p1 proportional to `(p2 - p0)` and tangent at p2 proportional to `(p3 - p1)`.

**The overshoot mechanism**: At bifurcation zones where the superformula parameter `m` transitions (e.g., 6→10), adjacent chain points have U-position shifts up to 0.009. If the trajectory has a local inflection — p0→p1 moves one direction in U, p2→p3 moves the other — the CatRom cubic overshoots, placing subdivision vertices on the WRONG side of the straight line p_i→p_i+1.

Concretely, consider these chain U-positions along consecutive rows:
```
Row 50: u=0.120  (p0)
Row 51: u=0.125  (p1) — moving right
Row 52: u=0.122  (p2) — reversal
Row 53: u=0.118  (p3) — continuing left
```
The tangent at p1 is proportional to `(p2 - p0) = 0.122 - 0.120 = +0.002` (rightward), but p1→p2 actually goes LEFT. The CatRom at t=1/3 evaluates with an initial rightward tangent and can push the subdivision vertex BEYOND p1 to the right (e.g., u=0.127), then the second subdivision at t=2/3 pulls it back. This creates a zigzag: `p1(0.125) → catrom1(0.127) → catrom2(0.124) → p2(0.122)`.

### Finding 2: Subdivision Destroys Primary Edge Tracking

The log shows `primaryTotal=0` — zero "primary" chain edges (feature-to-feature edges with both endpoints having `pointIdx >= 0`). This is because CatRom subdivision replaces every original edge `A→B` with three sub-edges: `A→catrom1→catrom2→B`. Since catrom1 and catrom2 have `pointIdx=-1`, none of the resulting edges qualify as "primary."

This isn't a bug per se — the primary edge count is a diagnostic — but it confirms that ALL 21,396 chain edges now pass through at least one CatRom vertex. If any CatRom vertex overshoots, the zigzag propagates to the constraint path and the CDT faithfully triangulates around it.

### Finding 3: Mirror Boundary Extension Amplifies Edge Effects

At chain endpoints (first and last chain points), the CatRom needs 4 control points but only has 3 (or 2). The `mirrorVertex` function at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L338) creates virtual control points by linear reflection:

```typescript
mirrorU = 2 * anchor.u - reflected.u
```

This assumes the chain trajectory is locally symmetric around the endpoint. If the chain curves near its start/end, the mirror point has a derivative that's the NEGATIVE of the true incoming derivative, doubling any overshoot tendency at the first and last segments.

### Finding 4: CatRom Subdivides Only U, Not R(u,t)

The CatRom only interpolates the **U coordinate** — the T coordinate is computed linearly (`t = tLo + (tHi - tLo) * frac`). This means the subdivision curve is a 1D cubic in the U-direction only. On a cylindrical pot surface, U represents the angular position and T the height. The actual 3D feature position depends on both U and the surface's parametric evaluation R(u,t), which may have its own curvature. The CatRom doesn't account for this — it smooths the constraint path in UV space, not in 3D space where the feature actually lives.

### Finding 5: Companion Density Is Minimal

Current settings: `nTLevels=1, nUSpread=1` → only 2 lateral companions per rung (one left, one right). With 14,795 generated (13,984 after dedup), the companion density is thin. This matters because:

1. Near CatRom zigzag points, the CDT has few Steiner points to create well-shaped triangles
2. The constraint edges force the triangulation to follow the zigzag exactly
3. Without nearby free points, the CDT produces extreme slivers connecting the constraint path to distant grid vertices

## Proposals

### P1: Remove CatRom Subdivision Entirely (Conservative) ⭐ RECOMMENDED

**Idea**: Delete the `subdivideFullChain` call and use piecewise-linear chain edges directly (the raw fullChain, not subdivided).

**Mechanism**: The `subdivideFullChain` function at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L273) is invoked at [line 519](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L519). Remove the call and use `fullChain` directly as `finalChain`. The edge-building loop at [lines 528-540](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L528) already handles both subdivided and unsubdivided chains — it just needs edges between consecutive fullChain entries.

**Mathematical basis**: The user confirmed that the debug polylines (piecewise-linear between pre-smooth chain points) "look great." With 264 rows, consecutive chain points are spaced ~0.38% apart in T. At a typical 40mm pot height, this is ~0.15mm vertical spacing. In U, chain points are at GPU re-snapped peak/valley positions with sub-sample precision. Straight line segments between these points are indistinguishable from smooth curves at the STL's triangulation resolution.

The C¹ smoothness that CatRom provides is **mathematically unnecessary** at this resolution. The Nyquist argument: if the feature position changes by ΔU=0.009 across one row step, and we sample at 264 rows, the effective spatial frequency is well within the mesh's triangulation bandwidth. Linear interpolation at this density is sufficient.

**Files affected**:
- `OuterWallTessellator.ts`: Remove `subdivideFullChain` call, use fullChain directly. Keep the function itself (it's exported and tested).

**Expected impact**:
- **Eliminates all CatRom overshoot zigzags** — the constraint path follows straight lines between true feature positions
- **Reduces vertex count** — 2 fewer vertices per chain edge × ~7000 single-row edges ≈ 14,000 fewer vertices
- **Reduces constraint count** — chain edges drop from ~21,000 (3x due to subdivision) to ~7,000 (direct)
- **Faster export** — fewer CDT constraints, fewer vertices, fewer edge flips
- **Primary edge count recovers** — edges between feature points (both `pointIdx >= 0`) are now tracked

**Trade-offs**:
- Loss of C¹ smoothness at chain vertices (but this is invisible at 264 rows)
- The CatRom subdivision vertices were interior points that helped CDT create better-shaped triangles in the band. Removing them may reduce triangle quality in the immediate vicinity of chain edges — but the companion system is designed to fill exactly this role.

**Risk assessment**: LOW. The system worked without CatRom before v25.0. The edge building loop already handles non-subdivided chains. The only risk is that the companion density (nTLevels=1) is insufficient without CatRom interior points, which P4 addresses.

**Implementation complexity**: TRIVIAL. ~5 lines changed.

**Assumptions** (for Verifier to attack):
1. 264 rows provide sufficient angular resolution that piecewise-linear chain edges are visually smooth
2. Removing CatRom interior points doesn't degrade CDT quality below current (already poor) levels
3. The edge-building loop correctly handles non-subdivided fullChain entries
4. Removing subdivision doesn't break any other part of the pipeline that depends on CatRom vertex properties (e.g., `cv.t !== undefined` checks for interior vertex collection)

---

### P2: Replace Uniform CatRom with Centripetal CatRom (α=0.5) (Moderate)

**Idea**: Keep CatRom subdivision but switch from uniform (α=0) to centripetal (α=0.5) parameterization, which is specifically designed to eliminate cusps and minimize overshoot.

**Mechanism**: In centripetal CatRom, the parameter knots are spaced by `|p_{i+1} - p_i|^α` instead of uniformly. For α=0.5 (centripetal), the knot spacing is proportional to the square root of the chord length between control points. This prevents overshooting at sharp turns and inflection points.

The implementation replaces `catmullRomInterp` with a centripetal variant:

```typescript
function centripetal CatRomInterp(
    p0: number, p1: number, p2: number, p3: number, 
    t: number, alpha: number = 0.5
): number {
    // Compute knot values based on centripetal parameterization
    const d01 = Math.abs(p1 - p0);
    const d12 = Math.abs(p2 - p1);
    const d23 = Math.abs(p3 - p2);
    
    const t0 = 0;
    const t1 = t0 + Math.pow(d01, alpha);
    const t2 = t1 + Math.pow(d12, alpha);
    const t3 = t2 + Math.pow(d23, alpha);
    
    // Guard against degenerate cases
    if (Math.abs(t1 - t0) < 1e-12 || Math.abs(t2 - t1) < 1e-12 || 
        Math.abs(t3 - t2) < 1e-12 || Math.abs(t2 - t0) < 1e-12 || 
        Math.abs(t3 - t1) < 1e-12) {
        return p1 + (p2 - p1) * t; // Fallback to linear
    }
    
    const tEval = t1 + t * (t2 - t1); // Map [0,1] → [t1,t2]
    
    // Barry-Goldman pyramid evaluation
    const A1 = ((t1 - tEval) * p0 + (tEval - t0) * p1) / (t1 - t0);
    const A2 = ((t2 - tEval) * p1 + (tEval - t1) * p2) / (t2 - t1);
    const A3 = ((t3 - tEval) * p2 + (tEval - t2) * p3) / (t3 - t2);
    
    const B1 = ((t2 - tEval) * A1 + (tEval - t0) * A2) / (t2 - t0);
    const B2 = ((t3 - tEval) * A2 + (tEval - t1) * A3) / (t3 - t1);
    
    return ((t2 - tEval) * B1 + (tEval - t1) * B2) / (t2 - t1);
}
```

**Mathematical basis**: Centripetal CatRom (α=0.5) is proven to produce curves that lie within the convex hull of consecutive control point triplets (`p_{i-1}, p_i, p_{i+1}`). This prevents overshooting at inflection points and self-intersections at cusps. The seminal result is from Yuksel, Schaefer & Keyser (2011): "On the parameterization of Catmull-Rom curves."

**Files affected**:
- `OuterWallTessellator.ts`: Replace `catmullRomInterp` function body. The call site at line 314 passes the same arguments.

**Expected impact**:
- **Significantly reduces overshoot** — centripetal CatRom stays much closer to the linear interpolant at inflection points
- **Maintains C¹ smoothness** — the curve is still C¹ at the knot points
- **Does not reduce vertex/constraint count** — same 2 subdivision points per edge

**Trade-offs**:
- More complex math per evaluation (division, power function) — but called only during export, not preview
- The 1D centripetal parameterization (using only U-coordinate distances) is an approximation of the proper 2D centripetal CatRom (which would use `sqrt((Δu)² + (Δt)²)` for knot spacing). For our case where T-spacing is nearly uniform (~0.004 per row), the 1D approximation is adequate.
- Still inserts subdivision vertices — doesn't address the vertex/constraint count bloat

**Risk assessment**: LOW-MEDIUM. The mathematical properties of centripetal CatRom are well-established. Risk is implementation bugs in the knot computation or degenerate cases (all control points at same U → division by zero, handled by fallback to linear).

**Implementation complexity**: MODERATE. Replace one function, add degenerate guards.

**Assumptions** (for Verifier to attack):
1. 1D centripetal parameterization (using only |ΔU|) is a sufficient approximation of 2D centripetal
2. Degenerate fallback to linear is acceptable when chord lengths are near-zero
3. The Barry-Goldman pyramid evaluation is numerically stable in 64-bit float
4. Centripetal CatRom's convex-hull guarantee in the 2D case also holds for our 1D coordinate interpolation

---

### P3: CatRom with Overshoot Clamping (Conservative-Moderate)

**Idea**: Keep the existing uniform CatRom but add a post-interpolation clamp that prevents the subdivision vertex's U from exceeding the linear interpolant by more than a tolerance.

**Mechanism**: After computing `u = catmullRomInterp(...)`, clamp it:

```typescript
const linearU = p_i.u + (p_i1.u - p_i.u) * frac;
const maxDeviation = Math.abs(p_i1.u - p_i.u) * 0.25; // allow 25% overshoot
u = Math.max(linearU - maxDeviation, Math.min(linearU + maxDeviation, u));
```

This ensures the CatRom vertex stays within a "corridor" around the straight-line path. The corridor width is proportional to the edge's ΔU, so it adapts to the feature's curvature.

**Mathematical basis**: The overshoot of standard CatRom is bounded by the second derivative of the control polygon. For our chain trajectories, the maximum ΔU between consecutive rows is ~0.009. A 25% corridor limits overshoot to ~0.002 U — about 0.5mm on a 40mm pot, which is below visible threshold.

**Files affected**:
- `OuterWallTessellator.ts`: Add 3 lines after `catmullRomInterp` call at line 314.

**Expected impact**:
- **Eliminates large overshoots** while preserving most of CatRom's smoothing effect
- **Minimal code change** — no new functions, just a clamp
- **Preserves vertex/constraint count** — same subdivision structure

**Trade-offs**:
- The clamped curve is no longer truly C¹ — the clamp introduces a discontinuity in the derivative at the clamping boundary. However, this only activates at inflection points where the CatRom was going to overshoot anyway.
- The corridor width (25% of ΔU) is a magic number that may need tuning per style.
- Doesn't address the root philosophical issue: do we need CatRom at all?

**Risk assessment**: LOW. Simple clamp, cannot make things worse.

**Implementation complexity**: TRIVIAL. 3 lines of code.

**Assumptions** (for Verifier to attack):
1. 25% overshoot tolerance is appropriate for all pot styles and m-transitions
2. The C¹ discontinuity at clamping boundaries doesn't create visible artifacts
3. Clamping doesn't interact badly with the seam-wrap logic at lines 315-316

---

### P4: Increase Companion Density (Moderate)

**Idea**: Increase `nTLevels` and `nUSpread` to provide more Steiner points around chain edges for CDT. Independent of CatRom changes.

**Mechanism**: The companion density is currently controlled by `chainStripConfig.densityMultiplier` which defaults to some value that produces `nTLevels=1, nUSpread=1`. The scaling at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L569):

```typescript
const nTLevels = Math.max(1, Math.min(2, Math.floor(density / 4)));
const nUSpread = Math.max(1, Math.min(2, Math.floor(density / 3)));
```

For `nTLevels=2, nUSpread=2`, we need `density >= 8` (for nTLevels) and `density >= 6` (for nUSpread). Setting `densityMultiplier=8` would give `nTLevels=2, nUSpread=2` → 8 companions per rung (2 T-levels × 2 U-spread × 2 signs) instead of 2.

**Mathematical basis**: More Steiner points in CDT provide more freedom for the triangulation to create well-shaped triangles near constraint edges. The current 2 companions per rung leave large "dead zones" where the CDT creates long slivers connecting chain edges to distant grid vertices. With 8 companions, the CDT has nearby free points on both sides of the constraint path at multiple T-levels.

**Files affected**:
- `ParametricExportComputer.ts` or wherever `chainStripConfig.densityMultiplier` is set: change default from current value to 8.

**Expected impact**:
- **Better CDT triangle quality** near chain edges — more Steiner points = fewer extreme slivers
- **Does NOT fix CatRom overshoot** — the constraint path still zigzags, but the triangles around it are better-shaped
- **Increases vertex count** by ~4x in companion region (~56,000 additional companions)
- **Increases CDT computation time** — more free points per strip

**Trade-offs**:
- More vertices means larger STL files and slower CDT per strip
- Diminishing returns: more companions don't fix the fundamental zigzag in constraint paths
- Risk of companion placement interfering with constraint edges (the `CONSTRAINT_GUARD_RADIUS` check prevents this, but with more companions, more will be rejected)

**Risk assessment**: LOW. More Steiner points never make CDT worse; they can only improve triangle quality.

**Implementation complexity**: TRIVIAL. Change one default value.

**Assumptions** (for Verifier to attack):
1. 4x more companions don't significantly increase export time (currently 50s target 20s — going wrong direction)
2. The CONSTRAINT_GUARD_RADIUS prevents companion-constraint interference at higher density
3. CDT handles the increased point count without performance issues
4. The current scaling formula (`floor(density/4)`, `floor(density/3)`) is appropriate for higher densities

---

### P5: Selective Subdivision — CatRom Where Safe, Linear at Inflections (Moderate-Radical)

**Idea**: Detect inflection points in the chain trajectory and apply CatRom subdivision only where the trajectory is "monotone" (no direction change). At inflections, use linear interpolation.

**Mechanism**: Before subdividing edge i→i+1, check whether the trajectory has an inflection:

```typescript
// Detect inflection: p0→p1 and p2→p3 move in opposite U-directions
const du01 = p_i.u - p0.u;  // approach direction
const du23 = p3.u - p_i1.u; // departure direction
const hasInflection = (du01 * du23 < 0); // opposite signs = inflection

if (hasInflection) {
    // Linear subdivision: just split the edge at t=1/3 and t=2/3
    u = p_i.u + (p_i1.u - p_i.u) * frac;
} else {
    // CatRom is safe here
    u = catmullRomInterp(p0.u, p_i.u, p_i1.u, p3.u, frac);
}
```

**Mathematical basis**: CatRom overshoots specifically at inflection points (where the second derivative of the control polygon changes sign). At monotone segments (all control points moving consistently in one U-direction), CatRom provides genuine smoothing without overshoot. This selective approach preserves C¹ smoothness where it's beneficial and degrades gracefully to C⁰ at inflections.

**Files affected**:
-  `OuterWallTessellator.ts`: Add inflection detection before `catmullRomInterp` call at line 314.

**Expected impact**:
- **Eliminates overshoot only at inflection points** — preserves CatRom smoothing elsewhere
- **Best of both worlds** — smooth where safe, linear where necessary
- **Same vertex/constraint count** as current CatRom

**Trade-offs**:
- The inflection detection uses a simple sign test on the approach/departure deltas. This may be too aggressive (detecting "inflections" that are actually just noise) or too conservative (missing inflections where the magnitude is very different).
- The C¹→C⁰ transition at inflection boundaries creates a derivative discontinuity. If the CDT/mesh follows this closely, it may be visible as a subtle kink.
- More code complexity for a partial fix

**Risk assessment**: LOW-MEDIUM. The inflection detection is simple but may need tuning.

**Implementation complexity**: MODERATE. ~15 lines of new code in the subdivision loop.

**Assumptions** (for Verifier to attack):
1. Simple sign-based inflection detection is sufficient (vs. a magnitude-based threshold)
2. Inflections are the primary cause of CatRom overshoot (vs. high-curvature monotone segments)
3. The C¹→C⁰ transition at inflection detections isn't visible in the final mesh
4. The approach/departure delta computation correctly handles the wrapping/mirror boundary cases

---

### P6: 2D Centripetal CatRom with Adaptive T (Radical)

**Idea**: Instead of interpolating only U with CatRom and T linearly, interpolate BOTH U and T using centripetal CatRom, treating each chain point as a 2D point (U, T). This produces a true 2D smooth curve through the chain points.

**Mechanism**: Replace the 1D CatRom on U with a 2D CatRom:

```typescript
// 2D control points
const points = [
    [p0.u, activeTPositions[p0.rowIdx]],  // (u0, t0)
    [p_i.u, activeTPositions[p_i.rowIdx]], // (u1, t1)
    [p_i1.u, activeTPositions[p_i1.rowIdx]], // (u2, t2)
    [p3.u, activeTPositions[p3.rowIdx]]    // (u3, t3)
];

// Centripetal knots from 2D chord lengths
const d01 = Math.sqrt((points[1][0]-points[0][0])**2 + (points[1][1]-points[0][1])**2);
// ... etc.

// Evaluate both U and T from the centripetal curve
for (const frac of [1/3, 2/3]) {
    const [u, t] = centripetal2D(points, frac);
    // ...
}
```

**Mathematical basis**: The current approach (CatRom U, linear T) produces a constraint path that is a projection of a 1D cubic onto the U-axis with linear T. This doesn't respect the 2D geometry of the trajectory. A proper 2D centripetal CatRom produces a curve that is optimal in the (U, T) parameter space, with provable no-overshoot guarantees (convex hull property of centripetal CatRom extends to 2D).

**Files affected**:
- `OuterWallTessellator.ts`: Replace `catmullRomInterp` with 2D variant, update subdivision vertex creation to use computed T instead of linear T.

**Expected impact**:
- **Best possible curve quality** — true 2D smooth path through chain points
- **No overshoot** — centripetal CatRom in 2D has the convex hull property
- **Better T-positioning** — subdivision vertices sit at CatRom-optimal T-positions rather than uniform T

**Trade-offs**:
- Subdivision vertices would have T-positions that don't align with row boundaries or linear T-fractions. This could interact with the band-bucketing system (interiorByBand at lines 747-756) that assigns interior vertices to bands based on T.
- More complex implementation
- The 2D convex hull guarantee is stronger than needed — we only need overshoot control in U (T is monotonically increasing along the chain).

**Risk assessment**: MEDIUM. The T-position interaction with band bucketing is the main risk. The interiorByBand logic at line 750 uses `bsearchFloor` on `activeTPositions` — if the CatRom T-position places the vertex exactly at a row boundary, it could be excluded from both adjacent bands.

**Implementation complexity**: HIGH. New 2D CatRom function, updated band bucketing, updated vertex creation.

**Assumptions** (for Verifier to attack):
1. 2D centripetal CatRom produces meaningful T-positions (not just U-positions) for subdivision vertices
2. Band bucketing correctly handles CatRom-computed T-positions that may not be uniform between rows
3. The 2D curve through (U, T) points is the right abstraction (vs. 3D curve through actual surface positions)
4. The increased implementation complexity is justified by the quality improvement over simpler approaches (P1, P3)

## Root Cause Determination

The root cause is clear: **CatRom subdivision overshoots at chain trajectory inflection points, creating zigzag constraint paths that the CDT faithfully follows.** The overshoot originates from two specific properties:

1. **Uniform parameterization** (α=0) has the worst overshoot behavior of all CatRom variants
2. **The chain trajectories genuinely have inflections** — feature positions in U oscillate due to superformula parameter transitions (m=6→10 bifurcation zones)

The CatRom was introduced in v25.0 to provide C¹ smooth constraint paths. But the 264-row resolution already provides sufficient angular density for piecewise-linear paths to appear smooth. The CatRom's smoothing benefit is **below the noise floor** of the triangulation, while its overshoot cost is **above the visible threshold**.

## Recommended Implementation Order

### Phase 1: P1 (Remove CatRom) + P4 (Increase Companions)

**Do P1 first** — remove CatRom subdivision entirely. This is the highest-impact, lowest-risk change. It eliminates the root cause (overshoot) with ~5 lines of code.

**Then P4** — increase companion density from (1,1) to (2,2) to compensate for the loss of CatRom interior points. The CatRom was inadvertently providing 2 interior Steiner points per chain edge; without it, the CDT needs companions to fill the gap. Note: evaluate whether the export time increase from more companions is acceptable.

### Phase 2: Re-evaluate

After Phase 1, measure the chain-strip quality metrics:
- If `minAngle > 5°` and `maxAspect < 100:1`, stop here. Mission accomplished.
- If quality is still poor, consider P2 (centripetal CatRom) as a replacement for uniform CatRom — but only if the linear constraint paths from P1 show visible angular artifacts that CatRom would fix.

### Why NOT P2/P3/P5/P6 first?

- **P2 (Centripetal)**: Fixes overshoot but still inserts 14,000 extra vertices and triples the constraint count. The simpler fix (P1) eliminates the problem entirely.
- **P3 (Clamping)**: Band-aid that doesn't address the philosophical question — is CatRom needed at all? If no, remove it. If yes, fix it properly (P2).
- **P5 (Selective)**: More code complexity for a partial fix. If we're going to modify the CatRom logic, we should either fix it completely (P2) or remove it (P1).
- **P6 (2D centripetal)**: Over-engineered for the current problem. The T-position interaction with band bucketing adds risk without proportional benefit.

## Open Questions

1. **Export time budget**: P4 (more companions) increases vertex count. What's the acceptable export time ceiling? The current 50s→20s target means we should be removing computation, not adding it. P1 removes computation (fewer vertices, fewer constraints) which is good. P4 adds computation — is the quality improvement worth the time cost?

2. **Is the CatRom code worth keeping?**: If P1 succeeds, should `subdivideFullChain` and `catmullRomInterp` be kept in the codebase (for potential future use at higher resolutions) or deleted to reduce dead code? My recommendation: keep but mark as `@deprecated` with a comment explaining why it was disabled.

3. **Companion vs. CatRom as interior points**: The CatRom subdivision was providing 2 interior Steiner points per chain edge "for free" (they're on the constraint path, not separate companions). These were at t=1/3 and t=2/3 of each row band — exactly where companions would go (tFrac = k/(nTLevels+1)). With P1, we lose these "free" interior points. P4 compensates, but are the companion positions as good? The CatRom points were ON the constraint path (collinear risk!), while companions are explicitly lateral. The companions may actually be BETTER for CDT quality.

4. **Interaction with crossing constraint removal**: The current 633 crossing constraints removed may decrease after P1 (fewer zigzag constraint paths → fewer crossings). This would be a positive side effect — measure it.

5. **Missing edges at seam**: The 1,231 missing edges (all at col684, u≈0.9999) are a separate issue from CatRom overshoot. They exist because the seam column is excluded from CDT triangulation. This is an unrelated problem that should be addressed separately.
