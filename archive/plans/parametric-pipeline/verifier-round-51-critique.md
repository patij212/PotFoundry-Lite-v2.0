# Verifier Round 51 — Critique of Generator R51: Chain Birth/Death + Mesh Topology
Date: 2026-03-09

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's problem diagnosis is **excellent** — both Problem A (chain birth/death) and Problem B (mesh topology slivers) are correctly identified with accurate root cause analysis. However, several proposals have **critical** flaws in assumptions that would cause incorrect behavior if implemented as-written. Amendments are required before implementation.

---

## Part I: Problem A — Chain Birth/Death

### C1 [CRITICAL]: Proposal 1 — Prominence is Absolute, Not Comparable Across Rows

**Generator's claim**: "Proposals 1 assumes that `FeaturePoint.prominence` is comparable across rows and can be used for rolling median comparison across the chain's lifetime."

**Actual behavior**: Prominence is computed in [FeatureDetection.ts](../src/renderers/webgpu/parametric/FeatureDetection.ts#L300-L306) as:
```typescript
let localMax = -Infinity, localMin = Infinity;
for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
    const idx = wrap(i + k);
    localMax = Math.max(localMax, radii[idx]);
    localMin = Math.min(localMin, radii[idx]);
}
const prominence = localMax - localMin;  // ← ABSOLUTE mm
```
And the type definition in [types.ts](../src/renderers/webgpu/parametric/types.ts#L263-L264) confirms:
```typescript
/** Peak-to-valley prominence in the local neighbourhood (mm) */
prominence: number;
```

This is the full radius range (max − min) within a local window, measured in **absolute millimeters**. It is NOT the height of a specific extremum above its saddle (classical topographic prominence).

**Counterexample**: Consider a SuperformulaBlossom pot with R_bottom = 20mm, R_top = 50mm, and a consistent 4% radial modulation at all heights:
- At the bottom (R = 20mm): prominence ≈ 2 × 0.04 × 20 = 1.6mm
- At the belly (R = 50mm): prominence ≈ 2 × 0.04 × 50 = 4.0mm
- Ratio: **2.5×** for identical fractional modulation

A chain tracking a feature from bottom → belly would see its `medianProminence` rise from 1.6 to 4.0 simply due to pot radius change, NOT feature strengthening. The prominence mismatch penalty `|log(candidateProminence / chainMedianProminence)|` would penalize correct matches at different heights.

Conversely, a dying feature at the belly (radius 50mm, prominence dropping from 4.0 → 2.0mm) could still have higher absolute prominence than a strong feature at the top (radius 20mm, prominence 1.6mm). The dying feature could pass the prominence gate while the correct feature fails.

**Required fix**: Normalize prominence before comparison. Two options:
1. **Divide by local radius**: `normalizedProminence = prominence / radius` (fractional modulation depth). `FeaturePoint.radius` is already available.
2. **Divide by row mean radius**: compute mean radius per row during detection, use that as the normalizer.

Option 1 is simpler: both `prominence` and `radius` are already fields of `FeaturePoint`. The normalized prominence comparison becomes:
```typescript
const normalizedChainProm = chainMedianProminence / chainMedianRadius;
const normalizedCandProm  = candidate.prominence / candidate.radius;
score += PROMINENCE_MISMATCH_PENALTY * Math.abs(Math.log(normalizedCandProm / normalizedChainProm));
```

This requires extending `ActiveChain` with `recentRadius: number[]` and `medianRadius: number` alongside the prominence tracking.

**Severity**: CRITICAL — without normalization, the prominence gate will make wrong decisions at all pot heights where radius varies.

**Verdict for Proposal 1**: ACCEPT WITH AMENDMENTS (normalize prominence by radius)

---

### C2 [WARNING]: Proposal 1 — CHAIN_LINK_RADIUS Value Discrepancy

**Generator's claim** (in the Architecture Knowledge reference table): "CHAIN_LINK_RADIUS = 0.04"

**Actual value** in [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts#L25):
```typescript
export const CHAIN_LINK_RADIUS = 0.02;
```

The Generator's computation of `MOMENTUM_LINK_RADIUS = linkRadius * 1.5 = 0.03` is **correct** (0.02 × 1.5 = 0.03), so the reference table value is simply stale. The analysis's conclusions about reach distances are correct despite the wrong constant citation.

**Severity**: WARNING — cosmetic error, no impact on proposal correctness.

---

### C3 [WARNING]: Proposal 1 — `linkFeatureChainsCore` Plumbing is Non-Trivial

**Generator's claim**: "Requires plumbing `FeaturePoint[][]` through `linkFeatureChains` → `linkFeatureChainsCore`."

**Actual code flow** verified in [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts#L1204-L1260):
1. `linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, numRows)` already receives `FeaturePoint[][]`
2. It splits features into `peakRows` and `valleyRows` (just `number[][]` — U positions only)
3. Calls `linkFeatureChains(peakRows/valleyRows, numRows)` — **loses all typed data**
4. `linkFeatureChains` calls `linkFeatureChainsCore(allRowFeatures, numRows, ...)` — **receives only U positions**

The plumbing must thread `FeaturePoint[][]` through THREE layers:
1. `linkFeatureChainsByKind` → must split `FeaturePoint[][]` by kind (not just U positions)
2. `linkFeatureChains` → must pass `FeaturePoint[][]` to core
3. `linkFeatureChainsCore` → must accept `FeaturePoint[][]` and use it in cost scoring

This is 3 function signatures to change, not 2 as the Generator implies. The kind-split in `linkFeatureChainsByKind` currently extracts only U values:
```typescript
if (match.kind === 'peak') peaks.push(u);  // loses prominence/confidence/radius
```
This must change to also build `peakTyped: FeaturePoint[][]` and `valleyTyped: FeaturePoint[][]`.

**Severity**: WARNING — more work than Generator estimated, but feasible.

---

### C4 [CRITICAL]: Proposal 3 — "Middle 60% Stable Core" Fails for Short Chains

**Generator's assumption**: "Every chain has a 'stable core' (middle 60%) with consistent feature tracking."

**Counterexample**: Chain 0 from D1 diagnostics has **46 rows**. Middle 60% = rows 9-37 (28 rows). But this chain exists ENTIRELY within the m-transition zone. There IS no "stable" region — every vertex is in the birth/death zone. The "stable core" would itself be tracking a shifting/wrong feature, making the identity computed from it meaningless.

Furthermore, if Proposal 1 successfully prevents dying chains from jumping (its intended purpose), the surviving chains in the birth/death zone will be SHORTER (they'll die instead of jumping). A chain that previously had 46 rows might now have 15 rows of correct tracking before death. Middle 60% of 15 = 9 rows — barely viable.

**Required fix**: Add a stability metric before using the stable core:
```typescript
// Compute U-position variance in the middle 60%
const corePoints = chain.points.slice(startCore, endCore);
const coreUs = corePoints.map(p => p.u);
const coreMean = coreUs.reduce((a, b) => a + b) / coreUs.length;
const coreStdev = Math.sqrt(coreUs.reduce((s, u) => s + (u - coreMean) ** 2, 0) / coreUs.length);

if (coreStdev > STABLE_CORE_THRESHOLD) {
    // No stable core — skip validation for this chain, or truncate entirely
    continue;
}
```

If the stable core's own U-stdev exceeds a threshold (e.g., `2 × avgUErr_of_stable_chains ≈ 0.0001`), the chain has no usable identity and should be either:
- **Skipped** (no validation, trust the linker), or
- **Flagged for truncation/removal** as a fundamentally unreliable chain

**Additional concern**: `MIN_CHAIN_LENGTH` filtering. If P3 splits a 46-row chain at row 30, producing two sub-chains of 30 and 16 rows — both pass `MIN_CHAIN_LENGTH = 10`. But if P1 already shortened the chain to 25 rows and P3 splits at row 15, producing 15 + 10 → borderline. The 10-row sub-chain carries almost no useful constraint information.

**Severity**: CRITICAL — without the stability check, P3 will produce garbage identities for birth/death-zone chains.

**Verdict for Proposal 3**: ACCEPT WITH AMENDMENTS (add stable core validation, handle short sub-chains)

---

### C5 [NOTE]: Proposals 1 + 3 Interaction — Reinforce, Don't Conflict

**Master's question**: "Could P3 falsely extend the chain that P1 correctly limited?"

**Analysis**: P1 operates DURING linking — it prevents a dying chain from grabbing a distant strong feature by adding cost penalties. If P1 causes a chain to die (no acceptable candidate within search radius with prominence gate), that chain ENDS. It will not have vertices past the death row.

P3 operates AFTER linking — it validates vertices of already-linked chains. P3 can only split or truncate chains; it cannot extend them. A chain that died in P1 has no post-death vertices for P3 to evaluate.

**Conclusion**: The proposals **reinforce** each other:
- P1 (soft gate): prevents the worst jumps during linking
- P3 (hard validation): catches jumps that slipped past P1

No conflict exists. The only risk is over-application: both P1 and P3 acting on the same chain vertex, but since P1 affects cost scoring and P3 is post-hoc validation, there's no double-jeopardy.

**Severity**: NOTE — confirmed safe interaction.

---

### C6 [WARNING]: Proposal 2 — `m(t)` Not Available for Most Styles

**Generator's own caveat**: "Not all styles have a simple `m(t)` interpolation."

**Verification**: The style registry in [registry.ts](../src/styles/registry.ts) has 19 styles. Quick audit:
- SuperformulaBlossom: has `m_base` and `m_top` parameters → `m(t)` is computable
- WaveInterference, HarmonicRipples: product formulas with multiple frequency parameters → feature count is NOT `m/2`
- Spiral styles: feature count depends on wrap angle + pattern frequency → not simple `m/2`
- Minimal, Ceramic Bowl, etc.: no superformula → no `m` at all

Only ~2-3 styles out of 19 use a simple `m` interpolation. The `expectedFeatureCount` function would need per-style implementations, effectively creating a second registry of feature count functions.

**Verdict for Proposal 2**: ACCEPT WITH AMENDMENTS (phase 2 only, start with SuperformulaBlossom only, don't architect for generality yet)

---

### C7 [NOTE]: Proposal 4 — High Risk, Defer

The Generator correctly recommends deferring Proposal 4 (Bayesian quality tracking). I concur. The core linking loop is the most critical path in the pipeline, and an exponential moving average with tunable weights introduces fragile parameter sensitivity. Proposals 1+3 should be sufficient.

**Verdict for Proposal 4**: DEFER (agree with Generator)

---

## Part II: Problem B — Mesh Topology

### C8 [CRITICAL]: Proposal B1 — `avgColumnSpacing` Must Be Passed Explicitly

**Generator's claim**: "`avgColumnSpacing` can be passed as a parameter or computed as `1.0 / numU`."

**Actual code**: `sweepQuad()` signature in [OWT](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L213-L221):
```typescript
function sweepQuad(
    buf: number[],
    bot: number[],
    top: number[],
    verts: Float32Array,
): void {
```

No `avgColumnSpacing` parameter exists. The function only receives vertex indices and vertex data. To compute spacing inside the function, it would need `verts[bot[1]*3] - verts[bot[0]*3]`, but this is the spacing of THIS particular cell, not the average. With CDF-adaptive grids, cell widths vary by ~2-3× across the circumference.

**Required fix**: Either:
1. Pass `avgColumnSpacing` as a parameter (requires signature change at 6+ call sites), OR
2. Compute `QUALITY_ZONE` from the current cell width: `const cellWidth = Math.abs(botRightU - botLeftU); const QUALITY_ZONE = cellWidth * 0.5;`

Option 2 is more robust — it adapts to each cell's actual width. With CDF-adaptive grids, a global average would be too loose for narrow cells and too tight for wide cells.

**Severity**: CRITICAL — implementation detail, but wrong choice here makes the quality zone useless.

---

### C9 [CRITICAL]: Proposals B1/B4 — UV Min-Angle Criterion Gives Wrong Answers at High Stretch

**Generator's acknowledgment** (Open Question 5): "2D UV space != 3D geometry due to circumferential stretch."

**Mathematical verification**: The `minAngle2D` function in [OWT](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L148-L170) computes angles in raw (U, T) space.

At any point on the pot with cylindrical radius R(t):
- 1 unit of U in 3D = $2\pi R(t)$ mm circumference
- 1 unit of T in 3D ≈ $H / (N_T - 1)$ mm vertical step (varies with taper)
- **Stretch factor** $S = 2\pi R(t) / (H / N_T)$

For a pot with $R_b = 20\text{mm}$, $R_t = 50\text{mm}$, $H = 100\text{mm}$, $N_T = 400$:
- At the belly ($R = 50\text{mm}$): $S = 2\pi \times 50 / 0.25 \approx 1257$
- At the top ($R = 20\text{mm}$): $S = 2\pi \times 20 / 0.25 \approx 503$

Wait — this is the ratio of 3D arc length per unit-U to 3D step per unit-T. Let me recompute more carefully within a single grid cell:

A quad cell at the belly with $\Delta U = 0.002$ and $\Delta T = 0.003$:
- 3D width: $\Delta U \times 2\pi R = 0.002 \times 2\pi \times 50 \approx 0.628\text{mm}$
- 3D height: $\Delta T \times H = 0.003 \times 100 = 0.3\text{mm}$
- In UV: looks nearly square → UV min-angle ≈ 36°
- In 3D: aspect ratio 0.628/0.3 = 2.09:1 → 3D min-angle ≈ $\arctan(0.3/0.628) \approx 25.6°$

**At the belly, UV min-angle OVER-ESTIMATES real quality by ~40%.** A diagonal that UV says is "better" may be worse in 3D.

But does this matter for **diagonal choice**? Both diagonals span the same cell and face the same stretch. The stretch changes the ABSOLUTE angles but the RELATIVE ranking between diagonal A and diagonal B may be preserved if both are measured in the same coordinate system.

However, this equivalence breaks when **chain vertices create asymmetric sub-quads**. Consider a cell at the belly where a chain vertex is at U=0.1001 and the grid column is at U=0.1000 (gap = 0.0001):
- Sub-quad left: ΔU = 0.0001 U, ΔT = 0.003 T → UV aspect 0.0001/0.003 = 0.033:1 → SLIVER in UV
- In 3D: width = 0.0001 × 314mm = 0.031mm, height = 0.3mm → 3D aspect 0.031/0.3 ≈ 0.1:1 → STILL a sliver

So the min-angle criterion correctly identifies slivers as slivers regardless of stretch. The stretch factor changes the absolute angles but doesn't flip the ranking between a sliver diagonal and a good diagonal.

**Verdict**: The UV min-angle criterion is **adequate for diagonal ranking** even at high stretch. It correctly identifies slivers and picks the better diagonal. The absolute angle values are wrong by up to ~40%, but the relative ordering is preserved for the types of decisions `sweepQuad` and `constrainedSweepCell` make.

**Recommendation**: Use UV min-angle for now. If quality metrics show 3D angle violations > 5° threshold after B1+B4, upgrade to stretch-corrected angles using `estimateCircumferentialStretch` (already available in OWT at [line 137](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L137)).

**Severity**: CRITICAL (for awareness), but ACCEPT the UV approach for Phase 1.

---

### C10 [CRITICAL]: Generator's Alternating Distance Explanation is WRONG

**Generator's claim**: "The alternating vertex distance pattern (0.42mm / 0.16mm) comes from the grid construction: feature injection adds 3 positions per feature (feature + 2 flanks) using `FLANK_OFFSET`."

**Actual code path**: The U-direction grid is NOT built with `mergeFeaturePositions`. Verified pipeline at [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1411-L1414):
```typescript
const densityProfile = buildDensityProfile(uCurvature, chainVertexUs, 0.6, 0.004);
const unionU = generateCDFAdaptivePositions(densityProfile, maxOuterColumns, 0.3, true);
```

The function `mergeFeaturePositions` with `FLANK_OFFSET` companions is used ONLY for **T-direction** grid generation at [line 701](../src/renderers/webgpu/ParametricExportComputer.ts#L701):
```typescript
const tMerged = mergeFeaturePositions(cdfT, tFeatures, false);
```

For U-direction, `buildDensityProfile` in [GridBuilder.ts](../src/renderers/webgpu/parametric/GridBuilder.ts#L235-L265) adds **Gaussian bumps** (σ = 0.004, floor = 0.6) around chain vertex positions into a density profile. The CDF-adaptive placement then distributes columns proportionally to this density. This creates higher column density NEAR features but does NOT inject exact companion positions at ±FLANK_OFFSET.

**The alternating distance pattern** (if it exists) must come from the CDF-adaptive placement's response to the Gaussian density peaks — columns cluster near the Gaussian center (feature) and thin out between Gaussians. This creates near/far alternation, but the mechanism is **CDF-inversion of Gaussian bumps**, NOT explicit companion insertion.

**Impact on proposals**: Proposal B3 (column insertion at chain vertex U) is actually MORE important than the Generator realizes — the current grid has NO explicit columns at chain vertex positions. Chain vertices and grid columns coincide only by chance.

**Severity**: CRITICAL — wrong mechanism, though the symptom observation is plausibly correct.

---

### C11 [WARNING]: Proposal B2 — Merge Threshold Increase May Over-Snap

**Generator's proposal**: Increase `MERGE_THRESHOLD` to `avgColumnSpacing * 0.05 ≈ 0.00025 U ≈ 0.075mm`.

**Actual current value**: `1e-4 = 0.0001 U ≈ 0.030mm` ([OWT line 867](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L867)).

The proposed 2.5× increase (0.0001 → 0.00025) is within safe bounds for ridge fidelity (~0.075mm displacement). However, consider:

At the belly of a pot (R = 50mm), the chain vertex positions track ridges with ~±0.00006 U precision (from GPU re-snap). The gap between a chain vertex and its nearest grid column depends on the CDF-adaptive placement. With ~558 columns, avg spacing ≈ 0.00179 U. A chain vertex is randomly positioned relative to grid columns, so the expected gap is ~half the average spacing ≈ 0.0009 U — well above the proposed threshold.

The threshold increase helps but **only catches chain vertices within 0.075mm of a grid column** — roughly 14% of cases (0.00025 / 0.00179). The other 86% still produce slivers.

**Verdict for Proposal B2**: ACCEPT — helps at the margin, but is NOT sufficient as a standalone fix. Must be combined with B1+B4 minimum.

---

### C12 [WARNING]: Proposal B3 — Pipeline Reordering is NOT Required

**Generator's claim**: "Requires reordering the pipeline: grid generation currently happens in Step 2 before chain linking in Step 3."

**Actual pipeline order** (verified from [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts)):
```
Step 2:   detectAllRowFeatures                              (line 778)
Step 3:   linkFeatureChainsByKind                            (line 900)
Step 3.5: GPU re-snap                                       (line 942)
Step 3.6: Smoothing + filtering                             (line 1198)
Step 4:   insertChainGuidedRows                             (line 1246)
Step 5:   GPU-probe inserted rows                           (line 1275)
Step 6:   buildDensityProfile + generateCDFAdaptivePositions (line 1411-1414)
Step 7:   buildCDTOuterWall(meshChains, ..., unionU, ...)   (line 1443)
```

**Grid generation (Step 6) already happens AFTER chain linking (Step 3).** No pipeline reordering is needed! The Generator was wrong about the ordering.

The chain vertex U positions (`chainVertexUs`) are already used in Step 6 as Gaussian density hints in `buildDensityProfile`. To implement B3, simply:
1. Collect unique chain vertex U positions from `meshChains`
2. Use `mergeFeaturePositions(unionU_from_step6, chainVertexUs, true)` to inject exact columns
3. Or: pass chainVertexUs as explicit injection positions to a modified `generateCDFAdaptivePositions`

This is a **post-step-6 refinement**, not a reordering.

**Severity**: WARNING — Generator's concern about pipeline reordering is unfounded. This is actually easier than stated.

**Verdict for Proposal B3**: ACCEPT (simpler than Generator estimated)

---

### C13 [NOTE]: Proposal B4 — Fan Diagonal Edge Tracking is Already Correct

**Generator's concern**: "Fan diagonals are recorded in `fanDiagEdges`. The CSO depends on knowing which diagonal was chosen."

**Verification** in [OWT](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L362-L364):
```typescript
fanDiagEdges.push([subBot[1], subTop[0]]);
```

The `fanDiagEdges` array records whichever diagonal was emitted. If B4 changes the diagonal choice, the amended code pushes the ACTUALLY CHOSEN diagonal:
```typescript
if (diagMinA >= diagMinB) {
    // ... emit diagonal A ...
    fanDiagEdges.push([subBot[1], subTop[0]]);
} else {
    // ... emit diagonal B ...
    fanDiagEdges.push([subBot[0], subTop[1]]);
}
```

The CSO reads `fanDiagEdges` from the OWT output — it doesn't assume a specific orientation. So B4 is safe with respect to constraint protection.

**Severity**: NOTE — confirmed safe.

**Verdict for Proposal B4**: ACCEPT

---

### C14 [NOTE]: Proposal B5 — Redundant with CSO

**Generator's recommendation**: Defer B5 (post-tessellation diagonal flip).

**Verification**: The ChainStripOptimizer already performs edge flips with quality criteria. B5 would duplicate this functionality with different constraint awareness. The R48 investigation showed that the CSO's constraint protection was the issue, not the flip algorithm itself.

**Verdict for Proposal B5**: DEFER (agree with Generator)

---

### C15 [WARNING]: Proposal B1 — Performance Impact of Wider Quality Zone

**Generator's claim**: "adds ~50 trig operations per quad (minor perf impact)"

**Computation**: With the proposed `QUALITY_ZONE = cellWidth * 0.5`, approximately **50-80%** of all quad cells would enter the quality zone (since chain vertices and CDF-adaptive columns create many near-coincident pairs). Each min-angle evaluation requires 3× `Math.acos` calls (expensive). For ~500K cells at 80% quality-zone rate = 400K × 6 acos = 2.4M acos calls.

At ~50ns per acos on modern hardware: 2.4M × 50ns = 120ms. This is within the acceptable budget for export (which takes 5-15 seconds total) but NOT negligible.

**Alternative**: Use a `cosine comparison` instead of `acos`:
```typescript
// Instead of: Math.min(Math.acos(cosA), Math.acos(cosB), Math.acos(cosC))
// Use: Math.max(cosA, cosB, cosC)  // larger cosine = smaller angle = worse
```

Since `acos` is monotonically decreasing, comparing `cos(angle)` values gives the same ranking as comparing `angle` values. This eliminates all `acos` calls, reducing the cost to ~negligible (just dot products and divisions, already computed).

The `minAngle2D` function should be refactored to return `maxCosine` (worst angle as cosine) for comparison, only converting to radians for diagnostic output.

**Severity**: WARNING — performance could be 10× better with cosine comparison.

---

## Part III: Interaction Analysis

### Proposals 1 + 3: Reinforce (confirmed in C5)

P1 prevents wrong matches during linking; P3 validates after linking. No conflict. If both are implemented, the combined effect is strictly better than either alone.

### Proposals B1 + B4: Independent, Complementary

B1 fixes diagonal choice in standard grid cells (sweepQuad). B4 fixes diagonal choice in chain-adjacent fan cells (constrainedSweepCell). Different code paths, no interaction.

### Proposals B2 + B3: Complementary, Potentially Redundant

B2 (wider merge threshold) is a subset of B3's effect (exact column injection). If B3 is implemented, every chain vertex IS a grid column — no merge threshold is needed because the gap is zero. However, B2 is simpler and addresses the immediate problem while B3 is being developed.

**Recommendation**: Implement B2 in Phase 1 as a quick fix. If B3 is implemented in Phase 2, B2's wider threshold becomes harmless but redundant.

### Problem A (1+3) ↔ Problem B (B1+B4): Independent

Chain linking changes (A) affect which chain vertices exist. Mesh topology changes (B) affect how chain vertices are triangulated. These are sequential pipeline stages with no feedback loop. Implementing both in parallel is safe.

---

## Part IV: Accepted Items (with Evidence)

| Proposal | Verdict | Key Evidence |
|----------|---------|-------------|
| P1 (Prominence-Gated Extension) | ACCEPT WITH AMENDMENTS | Correctly identifies the blind spot in ActiveChain. Prominence data exists in FeaturePoint ([types.ts:264](../src/renderers/webgpu/parametric/types.ts#L264)). Must normalize by radius. |
| P2 (Expected Feature Count) | ACCEPT (Phase 2, SuperformulaBlossom only) | Correct mathematical basis but limited style applicability. |
| P3 (Post-Linking Validation) | ACCEPT WITH AMENDMENTS | Must add stable-core metric check. Skip validation for chains with high core U-stdev. |
| P4 (Bayesian Quality) | DEFER | Agree — too invasive for core loop. |
| B1 (Wider Quality Zone) | ACCEPT WITH AMENDMENTS | Must use per-cell width, not global average. Use cosine comparison. |
| B2 (Adaptive Merge Threshold) | ACCEPT | Helpful but not sufficient alone. |
| B3 (Column Injection at Chain U) | ACCEPT | Simpler than Generator estimated — no pipeline reordering needed. |
| B4 (Quality-Aware Fan Diagonal) | ACCEPT | Clean fix, fanDiagEdges tracking is already correct. |
| B5 (Post-Tessellation Flip) | DEFER | Redundant with CSO. |

---

## Part V: Recommended Implementation Order

My order differs from the Generator's in prioritizing B3 higher (since it's simpler than estimated) and grouping by independence:

```
Parallel Track A (Chain Quality):
  A1: Plumb FeaturePoint[][] into linkFeatureChainsCore  
      └→ Split typed features by kind, thread through 3 function layers
  A2: Implement Proposal 1 WITH radius-normalized prominence
      └→ Depends on A1
  A3: Implement Proposal 3 WITH stable-core metric check
      └→ Independent of A2, depends on A1 for FeaturePoint access

Parallel Track B (Mesh Quality):
  B1: Implement B1 (wider quality zone) WITH per-cell width + cosine comparison
      └→ Independent of Track A
  B2: Implement B4 (quality-aware fan diagonal)
      └→ Independent, same file as B1
  B3: Implement B3 (column injection at chain U positions)
      └→ Independent of B1/B2, only requires meshChains + unionU post-step-6
      └→ NOTE: makes B2 (adaptive merge threshold) mostly unnecessary

Phase 2 (if needed):
  - Proposal 2 (expected feature count) — SuperformulaBlossom only
  - B2 proposal (adaptive merge threshold) — only if B3 insufficient
```

Tracks A and B can proceed **simultaneously** by different agents.

---

## Part VI: Open Questions for Master

1. **Prominence normalization formula**: Should we use `prominence / radius` (per-feature) or `prominence / rowMeanRadius` (per-row average)? Per-feature is simpler but could be noisy for valleys where radius is at local minimum. Per-row-mean is smoother but requires an extra computation.

2. **B3 column budget**: Injecting ~100-500 chain vertex columns will increase the column count by ~20-90%. The current budget cap (`maxOuterColumns`) might reject some. Should we increase the budget proportionally, or should chain vertex columns be exempt from the budget cap?

3. **Stable core threshold for P3**: What U-stdev threshold defines "this chain has no stable core"? I suggest calibrating from chains 4-16 in the D1 diagnostic: compute their core U-stdev, then set threshold at 5× their maximum. Chains exceeding this threshold are skipped for P3 validation.

4. **Cosine vs acos trade-off for B1**: The cosine comparison avoids `Math.acos` but makes diagnostic output less interpretable (radians are more intuitive). Should we keep a dual path — cosine for production comparisons, acos for diagnostic logging?

---

## Part VII: Validation Protocol Amendments

Add to the Generator's validation protocol:

### For Proposal 1 (Prominence Gating):
- **Cross-height test**: Export with a pot where radius varies 2.5× from bottom to top. Verify that the normalized prominence comparison correctly identifies same-feature matches even when absolute prominence differs by 2.5×.
- **Regression test**: Verify chains 4-16 (stable) are completely unaffected. Zero change in avgUErr.

### For Proposal 3 (Post-Linking Validation):
- **Short-chain test**: Verify behavior with chains <30 rows. Stable core metric should either validate OR skip, not produce garbage identities.
- **All-transition-zone test**: Craft a scenario where a chain is entirely in the birth/death zone. Verify P3 correctly skips it.

### For Proposal B3 (Column Injection):
- **Column count test**: Verify total columns after injection ≤ 1.5× budget. If exceeded, verify that the budget guard (MIN_U_SEPARATION dedup) handles it.
- **Zero-gap test**: After injection, verify that every chain vertex has gap = 0.0 to its nearest grid column (within floating-point epsilon).

---

## Appendix: Code References Summary

| Claim | File | Line(s) | Verified |
|-------|------|---------|----------|
| CHAIN_LINK_RADIUS = 0.02 | ChainLinker.ts | 25 | ✓ (Generator cited 0.04 in table — WRONG) |
| MOMENTUM_LINK_RADIUS = 0.03 | ChainLinker.ts | 742 | ✓ (computation correct despite table error) |
| MAX_MISS_COUNT = 6 (primary) | ChainLinker.ts | 1016 | ✓ |
| ActiveChain has no prominence | ChainLinker.ts | 729-733 | ✓ |
| FeaturePoint has prominence (mm) | types.ts | 263-264 | ✓ |
| prominence = localMax - localMin | FeatureDetection.ts | 300-306 | ✓ (absolute, NOT normalized) |
| SWEEP_EPS = 1e-8 | OuterWallTessellator.ts | 233 | ✓ |
| MERGE_THRESHOLD = 1e-4 | OuterWallTessellator.ts | 867 | ✓ |
| minAngle2D uses UV space | OuterWallTessellator.ts | 148-170 | ✓ |
| Fan diagonal is deterministic | OuterWallTessellator.ts | 356-364, 380-388 | ✓ |
| Grid gen is AFTER chain linking | ParametricExportComputer.ts | Step 6 at L1411 vs Step 3 at L900 | ✓ (Generator was WRONG about ordering) |
| U-grid uses CDF-adaptive, NOT mergeFeaturePositions | ParametricExportComputer.ts | 1411-1414 | ✓ (no FLANK_OFFSET for U) |
| FLANK_OFFSET = 0.3 | GridBuilder.ts | 22 | ✓ (but used for T-direction only) |
