# Generator Round 3 Response — Verifier Critique Accepted With Refinements

Date: 2026-03-04

## Acknowledgment

The Verifier is right on all major points. I'll address each critique and the three open questions.

---

## Critique Responses

### C2 (P2 — Remove Filter): ACCEPTED with try/catch fallback

The Verifier's amendment — try/catch around CDT with sweep-repair fallback per strip — is the correct approach. I accept it without dispute.

**However, I want to de-risk this further.** The Explore subagent's analysis of the 10-petal geometry shows:

**Crossing risk is near-zero for this geometry:**

| Factor | Protection Level | Why |
|--------|-----------------|-----|
| Same-kind spacing | **0.10** (peak-to-peak) | 2.5× the link radius of 0.04 |
| Strip segmentation | Different chains → different strips | Constraints from different chains never interact within a single CDT call |
| Kind separation | Peaks and valleys linked independently | Peak edges can never cross valley edges |
| Link radius | 0.02 max | Two features >0.04 apart can't be confused |

The only scenario where crossing constraints arise is if the **same chain** has a multi-row gap with extreme U-drift such that the interpolated path of one chain crosses the interpolated path of another same-kind chain in the same strip. With 10-petal spacing of 0.10 and a link radius of 0.02, this requires two same-kind features to be within 0.04 U-distance AND moving in opposite directions — effectively impossible for the standard geometry.

**For exotic geometries (m=30+, spiral features):** The Verifier's concern is valid. Two same-kind chains with spacing <0.04 could have interpolated edges that cross within a strip. The try/catch with sweep-repair fallback handles this gracefully. I accept the amendment as stated.

**Proposal for Executioner**: Don't add an up-front crossing-constraint check (O(n²) per strip). Just use the existing try/catch around `cdt2d`. If `cdt2d` throws, increment `sweepFallbacks`, fall back to sweep-repair for that strip. The infrastructure already exists at ChainStripTriangulator.ts L233-238. This is zero new code — just pass the interpolated edges and let the existing fallback handle the rare case.

### C3 (P3 — Companion Density): REJECT WITHDRAWN

The Verifier is correct: my analysis was flawed.

**What I got wrong:**
1. The diagnostic used `density=12`, not the default `density=4`. My severity numbers (130K companions, 43:1 aspect) overstated the default configuration by 3×.
2. Even at density=2, the aspect ratio is ~10:1 because the problem is **aspect geometry** (U-dense, T-sparse), not **count**.
3. Reducing count doesn't help if every remaining companion still creates a sliver.

**What the Verifier got right:**
- Companions are placed on a 1D line (varying U, constant T per row).
- ANY number of companions on a 1D line connected to vertices at a different T creates slivers proportional to T_spacing / U_spacing.
- The fix is to **cap the count based on local aspect**, not reduce it globally.

### C4 (Aspect-Capped Companions): ACCEPTED — this is better

The Verifier's Option A (aspect-capped companion count) is strictly superior to my flat reduction. I'll refine the proposal:

---

## Answer to Q1: Crossing Constraint Handling

**Use the existing try/catch. No new code.**

The CDT call at ChainStripTriangulator.ts L233 already has:
```typescript
try {
    triangles = cdt2d(points, cdtEdges, { exterior: true });
} catch {
    stats.sweepFallbacks++;
    sweepTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
    return;
}
```

This handles crossing constraints naturally. If interpolated edges from two chains cross within a strip (which requires exotic geometry), `cdt2d` throws, the strip falls back to sweep-repair, and `sweepFallbacks` tells us how often this happens.

**For the 10-petal pot**: I predict `sweepFallbacks = 0` because same-kind features are spaced 0.10 apart and strip segmentation segregates chains into separate CDT calls.

**For monitoring**: The Executioner should log which strips fall back and what constraint edges caused the failure. This is a diagnostic for exotic geometries, not a concern for standard ones.

## Answer to Q2: Diagnostic Density Setting

**Mea culpa.** The user ran the CDT diagnostic at `density=12` (explicitly configured in the export dialog, visible in the log: `chainStrip=cdt/d12/e4/rtrue`). The default is `density=4` (ParametricExportComputer.ts L433: `pc?.chainStripDensity ?? 4`).

The corrected numbers at the **default density=4**:

| Metric | density=12 (diagnostic) | density=4 (default) |
|--------|------------------------|---------------------|
| Companions | 130,478 | ~43,500 |
| Per chain point | 24 (12 × 2 sides) | 8 (4 × 2 sides) |
| U-spacing | ~0.000073 | ~0.000217 |
| T-spacing | 0.0032 | 0.0032 |
| Aspect ratio | 43.8:1 | **14.7:1** |

The severity at default density=4 is **14.7:1**, not 43.8:1. Still >4:1 threshold, but 3× less extreme. The Verifier's aspect-capped approach would cap to ~2 companions per side at this T-spacing (effectively density=2, but only where needed), which is the right behavior.

**This means the user's density=12 override was making things much worse than the default.** The first recommendation should be: don't override to 12. The second: apply aspect-capping.

## Answer to Q3: Aspect-Capped Placement

**Yes, the Verifier's Option A is better than flat reduction.** I accept the approach with one refinement to the formula.

### The Verifier's Formula

```typescript
const maxPerSide = Math.max(1, Math.floor(gap / (tSpacing / TARGET_ASPECT)));
```

Where:
- `gap` = U-distance from chain vertex to grid column (≈ half cell width)
- `tSpacing` = T-distance to adjacent row
- `TARGET_ASPECT` = maximum acceptable aspect ratio (e.g., 4.0)

### My Refinement: Use Both-Side Gap, Not Half-Cell

The formula should use the **minimum companion-to-companion U-spacing** as the governing dimension, not the gap to the grid column. With `N` companions per side spread across a gap `G`, the U-spacing between consecutive companions is `G / (N + 1)`. The worst aspect ratio is:

```
aspectRatio = tSpacing / (G / (N + 1))
```

Solving for N where `aspectRatio = TARGET_ASPECT`:

```
N = max(1, floor(G * TARGET_ASPECT / tSpacing) - 1)
```

At default values (gap ≈ 0.000865, tSpacing ≈ 0.0032, TARGET_ASPECT = 4):
```
N = max(1, floor(0.000865 * 4 / 0.0032) - 1) = max(1, floor(1.08) - 1) = max(1, 0) = 1
```

So at default resolution, the aspect cap limits to **1 companion per side**, which is `density=1`. This is correct — at this T-spacing, even 2 companions create >4:1 aspects.

**But there's a subtlety.** Near inserted micro-rows (where T-spacing is halved to ~0.0016), the cap would allow 2 per side. Near the rim/base (where grid T-spacing is compressed), it could allow 3-4. **The cap adapts to local geometry**, which is exactly what we want.

### Practical Implementation

The aspect-capped approach requires `activeTPositions` to be accessible in the companion loop. Verified: `activeTPositions` is declared at OWT L269 inside `buildCDTOuterWall`, and the companion loop is inside the same function scope. The T-spacing lookup is:

```typescript
const rowIdx = cv.rowIdx;
const tLocal = (rowIdx < numT - 1)
    ? activeTPositions[rowIdx + 1] - activeTPositions[rowIdx]
    : activeTPositions[rowIdx] - activeTPositions[rowIdx - 1];
```

Then inside the left/right companion placement:

```typescript
const localMax = Math.max(1, Math.floor(gap * TARGET_ASPECT / tLocal) - 1);
const localDensity = Math.min(density, localMax);
// Generate fracs for localDensity instead of density
```

This is ~8 lines of change, no new data structures, no performance impact.

### Alternative Approaches Considered (Q3 extended)

**Option B: 2D companion cloud.** Place companions in a disc around each chain vertex, not just along U. This would create companions at (u ± δu, t ± δt) positions, requiring surface evaluation at non-grid T-positions. Rejected: too complex for marginal benefit over aspect-capping. The CDT angle optimization handles isotropic vertex clouds well, but generating R-values at arbitrary T positions requires GPU probing.

**Option C: T-offset companions.** Instead of varying U at constant T, place a few companions at (u, t ± δt) — same U as the chain vertex but at fractional T-offsets between rows. This would give CDT vertices that are specifically designed to connect chain points vertically without slivers. Problem: same as Option B — needs R-values at non-grid T positions.

**Option D: No companions, rely on grid density.** The CDF-adaptive grid (GridBuilder.ts) already places extra columns near chain features via the Gaussian density floor. With enough grid resolution, companions might be unnecessary. However, chain vertices float between grid columns by definition — removing companions entirely could create slivers connecting chain points to distant grid corners.

**Verdict**: Option A (aspect-capped) is the right fix for v2.x. Options B/C are v3.0 work requiring GPU surface probing.

---

## Revised Converged Plan

### Phase 1 (two changes, immediate):

#### Change 1: Remove `pointIdx < 0` filter (P2-amended)
- **File**: OuterWallTessellator.ts L855-858
- **Action**: Delete `if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;`
- **Safety**: Existing try/catch in cdtTriangulateStrip handles any crossing constraints via sweep fallback
- **Expected impact**: Missing edges drops from 3,156 → <200 (primary-only misses)

#### Change 2: Aspect-capped companion density (P3-revised)
- **File**: OuterWallTessellator.ts L418-480 (companion loop)
- **Action**: Compute local T-spacing, cap companions per side to `floor(gap * TARGET / tLocal) - 1`
- **Constant**: `TARGET_ASPECT = 4.0`
- **Expected impact**: Most chain vertices get density=1 at standard resolution; micro-row regions get density=2-3; aspect violations drop from ~88% to ~30-40%

### Phase 2 (after Phase 1 validation):

#### Change 3: Reduce seam guards (P5)
- Reduce `SEAM_GUARD` from 0.3 to 0.03
- Reduce `SEAM_THRESHOLD` from 0.4 to 0.06
- Expected: seam gap drops from 11.5mm to <1mm

### Phase 3 (cleanup):

#### Change 4: Default density guidance
- Now that companions are aspect-capped, the user-facing density slider meaning changes
- density=N means "up to N companions per side, capped by local aspect ratio"
- At standard resolution, density≥2 becomes equivalent (all capped to 1-2)
- Consider exposing TARGET_ASPECT as an advanced setting instead of raw density

---

## Predicted Metrics (Post Phase 1)

| Metric | Before | After P2 | After P2+P3 |
|--------|--------|----------|-------------|
| Constraints passed | 3,162 | ~6,500 | ~6,500 |
| Missing edges | 3,156 (47.9%) | <200 (<3%) | <200 (<3%) |
| CDT fallbacks | 0 | 0 (predicted for 10-petal) | 0 |
| Companions | 130K (d=12) or ~43K (d=4) | unchanged | ~15K (aspect-capped, d=4) |
| Avg aspect | 17.0:1 | ~15:1 (companions still there) | ~5:1 |
| Aspect violations (>4:1) | 87.9% | ~85% | ~30% |
| Inverted triangles | 147K | <10K | <5K |

**Note**: P2 alone should produce a dramatic improvement in chain edge enforcement. P3-revised improves triangle quality but is less impactful than P2 for the "jagged edges" problem. The visual quality improvement may be more from P2 than P3.

---

*Generator out. The Verifier caught my P3 error — count isn't the problem, geometry is. Aspect-capped placement is the right fix. P2 is the game-changer. Let's converge and hand to the Executioner.*
