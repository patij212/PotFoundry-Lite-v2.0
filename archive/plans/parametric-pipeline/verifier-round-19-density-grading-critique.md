# Verifier Round 19 — Critique of Generator's U-Graded Companion Fan Proposal

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

The core idea — filling the U-space void between chain edges and strip boundaries with graded Steiner points — is **sound and correctly targets the root cause** of the visible column pattern. However, the proposed implementation has **two critical flaws** and **three warnings** that must be addressed before implementation. The proposal as written would silently lose its two densest shells (60% of near-chain companions) to constraint guard rejection, and uses a uniform-grid approximation for strip boundaries on a CDF-adaptive grid.

After amendments, the effective companion count per band drops from 30 to ~18, which is still a 4.5× improvement over the current T-Ladder and sufficient to break the column pattern.

---

## Critique

### C1 [CRITICAL]: Constraint guard rejects shells 0 and 1 — the densest near-chain companions

**Generator's claim**: 5 shells at quadratically-graded fractions `[0.04, 0.16, 0.36, 0.64, 1.0]` place "dense small triangles near the feature edge."

**Actual behavior**: The constraint guard at `CONSTRAINT_GUARD_RADIUS = 0.001` ([OuterWallTessellator.ts line 578](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L578)) rejects ALL companions within 0.001 UV-distance of any constraint edge. Chain constraint edges run nearly vertically between consecutive chain vertices at adjacent rows. The perpendicular distance from a fan companion to its own chain's constraint edge is approximately equal to its U-offset from the chain vertex.

**Counterexample** (typical production values: numU=685, expansion=4):

| Shell | Fraction | U-offset from chain | vs guard radius 0.001 | Verdict |
|-------|----------|--------------------|-----------------------|---------|
| 0     | 0.04     | 0.04 × 4/685 = **0.000234** | 0.000234 < 0.001 | **REJECTED** |
| 1     | 0.16     | 0.16 × 4/685 = **0.000934** | 0.000934 < 0.001 | **REJECTED** |
| 2     | 0.36     | 0.36 × 4/685 = 0.00210  | 0.00210 > 0.001  | accepted |
| 3     | 0.64     | 0.64 × 4/685 = 0.00374  | 0.00374 > 0.001  | accepted |
| 4     | 1.0      | 1.0  × 4/685 = 0.00584  | 0.00584 > 0.001  | accepted |

Shells 0 and 1 carry 5+4 = 9 T-levels per side (18 companions per band) — 60% of the fan's total output. They are the core of the "dense near chain" promise. All rejected.

**Why reducing the guard is also wrong**: Shell 0 companions at U-offset 0.000234 from a constraint edge of length ~tGap ≈ 0.0023 create triangles with aspect ratio 0.0023/0.000234 ≈ 10:1. These ARE slivers. The constraint guard is correctly protecting CDT quality at these distances.

**Root tension**: The proposal wants ultra-dense points near the chain, but points too close to the constraint edge create exactly the slivers the guard was designed to prevent.

**Required fix**: The fan's minimum shell fraction must respect the constraint guard:

```
fraction_min = CONSTRAINT_GUARD_RADIUS / (expansion × localGridSpacing)
```

With current values: `fraction_min ≈ 0.001 / 0.00584 ≈ 0.171`

This means useful shells start at fraction ≥ ~0.2. Redesign the shell placement to use 4 shells in the range [0.2, 1.0]:

| Shell | Fraction | U-offset | T-levels |
|-------|----------|----------|----------|
| 0     | 0.20     | 0.00117  | 4        |
| 1     | 0.45     | 0.00263  | 3        |
| 2     | 0.72     | 0.00421  | 2        |
| 3     | 1.0      | 0.00584  | 1        |

Companions per side per band: 4+3+2+1 = 10. Total per band: 20. After constraint guard (shell 0 is borderline — some accepted, some rejected depending on edge slope): ~14-18 per band. Still 3.5-4.5× improvement over current T-Ladder.

**Alternative approach**: Use a linear fraction schedule `fraction = fraction_min + s/nShells × (1 - fraction_min)` instead of quadratic grading. This distributes shells evenly across the usable range.

---

### C2 [CRITICAL]: Strip boundary estimation uses uniform assumption on CDF-adaptive grid

**Generator's claim**: "Pre-compute approximate strip boundaries from `u_cv ± expansion × meanGridSpacingU` where `meanGridSpacingU = 1/numU`."

**Actual behavior**: The grid is CDF-adaptive ([GridBuilder.ts](potfoundry-web/src/renderers/webgpu/parametric/GridBuilder.ts) `generateCDFAdaptivePositions()`). Near chain features, the grid places columns MORE densely (with Gaussian feature floor and curvature-weighted CDF). At feature positions, local column spacing can be 60-80% of the mean `1/numU`.

**Consequence**: `expansion × 1/numU` **overestimates** the actual strip half-width near features. The outermost fan shells are placed beyond the actual strip boundary `unionU[segStart]..unionU[segEnd]`. When the strip collection code at [OWT line 1248](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1248) filters companions by `[uStripLeft - 1e-9, uStripRight + 1e-9]`, these over-placed companions are **silently dropped**.

Conversely, at low-curvature positions, `1/numU` underestimates local spacing. The fan doesn't reach the boundary, leaving a gap.

**Required fix**: Use actual `unionU` positions. The `unionU` array is available at companion generation time (passed as parameter to `tessellateOuterWall()`). For each chain vertex at U-position `u_cv`:

```typescript
const col = bsearchFloor(unionU, u_cv);
const uLeft  = unionU[Math.max(0, col - expansion)];
const uRight = unionU[Math.min(numU - 1, col + expansion + 1)];
// +1 on right to match actual strip segmentation (segEnd = first unmarked column)
```

This is exact, zero-cost (single bsearch per chain vertex), and eliminates the uniform-grid approximation entirely.

---

### C3 [WARNING]: Off-by-one in right boundary — fan undershoots strip by one column

**Generator's claim**: Strip boundary is `u_cv ± expansion × gridSpacing`.

**Actual behavior**: The strip segmentation at [OWT lines 1115-1125](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1115) finds contiguous `colHasChain` runs. With expansion=E marking columns `[col-E, col+E]`, the segment scan yields `segStart=col-E, segEnd=col+E+1`. So:

```
uStripLeft  = unionU[col - E]       // matches fan estimate
uStripRight = unionU[col + E + 1]   // ONE column beyond fan estimate
```

The fan targets `uRight ≈ u_cv + E × gridSpacing ≈ unionU[col+E]`, which is one column short of `unionU[col+E+1]`. The outermost shell at fraction=1.0 lands at `unionU[col+E]` instead of `unionU[col+E+1]`, leaving a one-column gap between the outermost fan companion and the strip boundary. CDT fills this gap with a larger triangle connecting the outermost fan companion to the boundary vertex.

**Impact**: Not correctness-breaking, but the boundary transition triangle is larger than intended. The `unionU` lookup fix from C2 naturally resolves this if `expansion + 1` is used for the right boundary.

---

### C4 [WARNING]: Companion generation timing — fan needs strip boundaries before they're computed

**Generator's claim**: Fan function can be called "from the companion generation loop (lines 740-755)."

**Actual behavior**: The companion generation loop (Section 1.5, lines 560-770) runs BEFORE the strip segmentation loop (Section 4, lines 1050+). Strip boundaries (`uStripLeft`, `uStripRight`) are computed per-band in Section 4 using `colHasChain` after expansion. The fan function needs strip boundary estimates at companion generation time.

**Required fix**: This is already acknowledged by the Generator. The `unionU` lookup proposed in C2 resolves it — `unionU` is available at companion generation time, so exact strip boundary estimates can be computed without waiting for Section 4's segmentation.

However, there's a subtlety: the actual `colHasChain` expansion depends on WHICH columns are chain-marked from ALL chains in the band, not just the current chain vertex's column. If two nearby chains cause the expansion zones to merge, the actual strip boundary extends further than the per-chain estimate. Fan companions at the estimated boundary would be safely inside the actual (wider) strip, so they'd be collected. But the gap between the fan's outermost shell and the actual boundary would be wider than intended.

**Severity**: Low. The merged-strip case is already complex, and having slightly conservative fan coverage in merged strips is acceptable.

---

### C5 [WARNING]: `interiorByBand` boundary-edge companion drop

**Generator's claim**: "The `interiorByBand` bucketing will correctly route fan companions to their strip's CDT call."

**Actual behavior**: Confirmed correct for the T-bucketing. The `bsearchFloor` at [OWT line 755](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L755) correctly assigns companions to bands based on their explicit `t` position. The strict-inequality filter (`cv.t > activeTPositions[bandIdx] && cv.t < activeTPositions[bandIdx + 1]`) correctly excludes companions on row boundaries.

For U-filtering: the strip collection at [OWT line 1248](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1248) uses:
```typescript
if (icv.u < uStripLeft - 1e-9 || icv.u > uStripRight + 1e-9) continue;
```

Fan companions at shell 4 (fraction=1.0) are placed at the estimated strip boundary. With the C2 fix (using `unionU` lookup), these should be at or slightly inside the actual boundary. The 1e-9 tolerance ensures companions at the exact boundary position are included. **After C2 fix, this is correct.**

Without C2 fix: companions placed using `1/numU` estimates may be up to ~0.0003 outside the actual strip boundary → silently dropped. This affects the outermost shell and partially the second-outermost shell.

---

### C6 [NOTE]: D-Radical interaction is safe

**Generator's claim**: "Fan vertices are all CDT interior points (Steiner points). The strip boundary remains pure-grid per D-Radical. Therefore the manifold guarantee is preserved."

**Verified**: Correct. Fan companions have `cv.t !== undefined` (set by `tryEmitCompanion` at [OWT line 635](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L635)), so they:
1. Are excluded from `rowChainVerts` (line 830: `if (cv.t !== undefined) continue`)
2. Do not appear in `buildMergedRow` output → not in strip boundaries
3. Do not trigger D-Radical `topDupMap` duplication (line 812: `if (cv.t !== undefined) continue`)
4. Route through `interiorByBand` → `stripInteriorVerts` → CDT free points
5. Are pre-registered in CDT via `addVertex` at [CST line 189-199](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L189)

**Manifold safety confirmed.** Fan companions never touch the boundary → adjacent grid quad edges are unaffected.

---

### C7 [NOTE]: Quadratic grading alpha=2.0 — acceptable but the effective range shifts the decision

**Generator's claim**: `alpha=2.0` produces density proportional to `1/sqrt(d)` for optimal curvature approximation.

**Analysis**: The mathematical justification is loosely correct (optimal mesh density for curvature error scales as curvature^(1/3), which near a ridge falls off with distance). However, since C1 eliminates shells 0-1, the grading exponent matters less. With the amended shell range [0.2, 1.0], the choice of alpha=2.0 produces:

- Fraction(0) = 0.2^2 = 0.04 → but C1 says start at 0.2, so this is fraction=0.2, not 0.04
- Actually, with the amended shell placement, explicit fraction values should be used rather than a power law

**Recommendation**: For the amended 4-shell design, use explicit fraction values `[0.2, 0.45, 0.72, 1.0]` (hand-tuned) rather than a power-law formula. The power law is an over-engineering for 4 discrete shells. An explicit list is more transparent, easier to tune, and avoids the ambiguity of what alpha means in the reduced range.

---

### C8 [NOTE]: Memory and performance impact — acceptable

**Generator's claim**: ~50k extra companions, ~23% vertex increase, CDT time ~200ms vs ~100ms.

**Analysis after C1 amendment**: With 4 effective shells instead of 5, ~20 companions per band (down from 30), the estimates adjust:
- Pre-dedup: ~20 × 2 bands × 1000 CVs = ~40,000
- After dedup: ~25,000-30,000
- Vertex increase: ~20% (acceptable)
- CDT: Each strip processes ~40-60 vertices instead of 50-100. cdt2d at this scale: <0.05ms per call. ~2000 strips → ~100ms total. **Negligible.**
- Memory: 30k × 48 bytes ≈ 1.4MB. **Negligible.**

---

### C9 [NOTE]: Strip overlap at expansion=4 — safe for typical styles

**Generator's claim (assumption 7)**: "Raising expansion from 1 to 4 doesn't cause strip overlap between adjacent chains."

**Analysis**: With expansion=4 and CDF-adaptive grid, two chains must be within ~8-10 columns (~0.012-0.015 in U) to cause strip overlap. For typical styles (6-12 features), adjacent feature chains are spaced by 1/N ≈ 0.08-0.17 in U — well beyond overlap range. For ridge+valley pairs from the same petal, typical spacing is ~0.02-0.04, still beyond overlap range.

The existing code handles overlapping strips via merged contiguous `colHasChain` segments (lines 1115-1125). If strips overlap, they merge into a single wider CDT call. Fan companions from both chains would participate in the same CDT, which is correct behavior — CDT handles arbitrary free point distributions.

**Edge case**: High-frequency styles with 20+ features could have chains within 8 columns of each other. The merged strip would be very wide with two chains' fan companions interleaved. CDT handles this but the resulting mesh may have unexpected triangle patterns between the chains. This is a pre-existing issue independent of the fan proposal.

---

### C10 [NOTE]: MAX_COMPANIONS_PER_CV must be raised and enforcement location clarified

**Generator's claim**: Raise `MAX_COMPANIONS_PER_CV` from 20 to 100.

**Actual behavior**: The current cap is enforced within `emitRungs()` at [OWT line 670](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L670): `if (emitted >= MAX_COMPANIONS_PER_CV) return;`. This is per-call, and each CV calls `emitRungs` twice (above and below), so the effective cap is 20 per band.

The new `emitUGradedFan()` runs separately from `emitRungs()`. With the amended 4-shell design: 20 companions per band from fan + 4-8 from T-Ladder = 24-28 per band. A cap of 40 per band (80 total) would suffice.

**Required**: Either:
- (a) Implement a shared counter across `emitRungs()` and `emitUGradedFan()` calls for the same CV+band, or
- (b) Give each function its own cap and set the global `MAX_COMPANIONS_PER_CV` to their sum.

Option (b) is simpler: `MAX_RUNGS_PER_CV = 20`, `MAX_FAN_PER_CV = 30`, total vertex buffer accounts for both.

---

### C11 [NOTE]: Promoted chain vertex proximity with innermost fan companion

**User attack vector 11**: The innermost fan shell places companions at U-offset ~0.00117 from the chain vertex. D-Radical promotes the chain vertex to interior at `tBot + 0.05 × tGap`. Fan companions at shell 0 participate at various T-levels within the band; the closest to the promoted vertex would be at `ct = tLo + 1/5 × tGap`. The distance between them:

```
dU = 0.00117 (shell 0 U-offset)
dT = |0.05 × tGap - 0.2 × tGap| = 0.15 × tGap ≈ 0.000345
dist = sqrt(0.00117² + 0.000345²) ≈ 0.00122
```

This is above the dedup threshold (1e-5) but produces a short CDT edge. CDT handles two nearby free points correctly — it creates a small triangle between them. The triangle quality depends on the third vertex. With other fan companions nearby, the third vertex is likely at similar distance, producing a small but well-shaped triangle. **Not a quality concern.**

---

## Accepted Items

1. **Root cause analysis** — Confirmed correct. The U-space void between chain edge and strip boundary is the source of column pattern artifacts. The T-Ladder's `baseSpreadU ≈ 0.002` reaches only ~1.4 grid columns; with expansion=4, the strip is 9 columns wide, leaving 2.6+ columns per side empty.

2. **Core mechanism** — Concentric shells of Steiner points radiating from chain toward boundary is the correct approach. CDT handles free Steiner points well and produces locally-optimal triangulations.

3. **D-Radical safety** — Verified. Fan companions are interior-only, never touch boundaries, never trigger topDupMap duplication. Manifold guarantee preserved.

4. **Performance/memory** — Verified acceptable. ~25k extra companions, ~20% vertex increase, ~0ms extra CDT time.

5. **Rejection of Proposals 2-4** — Agreed. Proposal 2 (brute force expansion) doesn't fill the interior void. Proposal 3 (radial mesh) is overengineered. Proposal 4 (boundary enrichment) breaks D-Radical.

6. **`interiorByBand` routing** — Verified correct (with C2 fix for boundary estimation). T-bucketing via `bsearchFloor` is correct. U-filtering works with exact `unionU` lookups.

---

## Open Questions for Generator

1. **Shell placement formula**: With the usable range restricted to [0.2, 1.0] (per C1), do you still want a power-law formula, or explicit shell fractions? If power-law, what should alpha be? The quadratic formula `((s+1)/N)^2` needs adjustment because it wastes the first two entries on the rejected sub-0.17 range.

2. **T-level count per shell**: Should the T-level count also account for the aspect ratio constraint? Shell 0 at fraction=0.2 (U-offset 0.00117) with 4 T-levels in a band of tGap ≈ 0.0023 produces T-spacing 0.0023/5 = 0.00046. Aspect ratio of resulting triangles: 0.00117/0.00046 ≈ 2.5:1. Acceptable, but consider capping T-levels to maintain aspect ratio ≤ 3:1.

3. **Config derivation**: Should `nShells` be hardcoded (e.g., always 4) or derived from `density`? The Generator proposed `nShells = max(3, density - 1)`. With density=8, that gives nShells=7, but only 4-5 shells survive the constraint guard. Deriving from density could produce misleading user expectations. Recommend: hardcode nShells=4, derive T-level budget from density.

---

## Implementation Conditions (for Executioner)

If Generator addresses C1 and C2, the following implementation plan is approved:

### Phase 1: `emitUGradedFan()` in OuterWallTessellator.ts

1. Add function `emitUGradedFan(cv, tLo, tGap, bandIdx, uLeft, uRight, nShells, fractions, tLevelCounts)` after `emitRungs()` (~35 lines).

2. Use explicit shell fractions array (not power-law): `[0.20, 0.45, 0.72, 1.0]` with T-level counts `[4, 3, 2, 1]`. These can be computed from config or hardcoded.

3. Compute strip boundary estimates per chain vertex using actual `unionU`:
   ```typescript
   const col = bsearchFloor(unionU, cv.u);
   const leftCol = Math.max(0, col - stripExpansion);
   const rightCol = Math.min(numU - 1, col + stripExpansion + 1);
   const uLeft = unionU[leftCol];
   const uRight = unionU[rightCol];
   ```

4. Call `emitUGradedFan()` from the companion generation loop (lines 740-755), after `emitRungs()`, for each CV and each band.

5. Implement separate cap: `MAX_FAN_PER_BAND = 30` (independent of `MAX_COMPANIONS_PER_CV` used by `emitRungs`).

### Phase 2: Config plumbing

6. Add to `ChainStripConfig`: `uGradingShells?: number` (default 4).
7. Update `DEFAULT_CHAIN_STRIP_CONFIG`: `expansion: 4, densityMultiplier: 8`.
8. Add config passthrough in `ParametricExportComputer.ts` (lines 440-445).

### Phase 3: Validation

9. Run export at d8/e4 with fan enabled. Check:
   - `minAngle` improves from 0.0° (target: > 5°)
   - `maxAspect` decreases significantly
   - R2 violations decrease
   - Column pattern visually reduced (inspect UV-space mesh)
   - No new non-manifold edges
   - Companion count in logs matches expectations (~25k-30k)
   - Guard reject count in logs shows shell 0 borderline (some accepted, some rejected)

10. Compare triangle count: expect ~15-20% increase from ~650k baseline.

11. Test with `expansion=1` + fan (regression): fan U-range shrinks, companion density should still improve over no-fan baseline.

12. Test with high-frequency style (20+ features): verify no strip overlap pathology.

---

## Appendix: Verification Trace for Constraint Guard Rejection

**Source**: [OuterWallTessellator.ts lines 608-625](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L608)

The `isNearConstraintEdge()` function computes point-to-segment distance for each constraint edge in the band. For a chain constraint edge from `(u0, t0)` to `(u1, t1)` crossing one row band:

- Edge direction: `dx = u1 - u0 ≈ 0` (chain drift ~0.094 across 313 rows → ~0.0003/row), `dy = t1 - t0 = tGap ≈ 0.0023`
- Edge length²: `len2 = dx² + dy² ≈ 0.0023² = 5.3e-6`
- For fan companion at `(cu, ct)` with `cu = u0 + uOffset`:
  - Projection parameter: `t = ((uOffset × dx) + ((ct-t0) × dy)) / len2`
  - Since `dx ≈ 0`: `t ≈ (ct-t0) × dy / dy² = (ct-t0)/dy = tFrac` (clamped to [0,1])
  - Projected point: `(u0 + tFrac×dx, t0 + tFrac×dy) ≈ (u0, ct)`
  - Distance: `sqrt((cu - u0)² + (ct - ct)²) = |cu - u0| = uOffset`

For shell 0 at expansion=4: `uOffset = 0.04 × 4/685 = 0.000234`
For `CONSTRAINT_GUARD_RADIUS = 0.001`: `0.000234 < 0.001` → **rejected** ∎

---

*Signed: Verifier (Claude Opus 4.6), 2026-03-05*
