# Verifier Round 50B — Critique of Generator's Ridge-Distance Root Cause Analysis
Date: 2026-03-09

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator performed a thorough and largely correct code-reading investigation. The pipeline trace (14 steps, no U corruption) and metric identity proofs are solid. However, the Generator's central hypothesis — that R48's measurement bias explains the 0.22mm — is **quantitatively wrong**. R48's discretization contributes only ~0.052mm, not ~0.22mm. The remaining ~0.17mm is genuine chain vertex error. The re-snap isMax bug is real but minor, as the Generator correctly identified. All three proposals have merit, but Proposal 2 alone will NOT resolve the mystery — it will merely reduce the noise floor from 0.052mm to ~0.002mm, revealing a still-large ~0.17mm true error.

---

## Critique

### C1 [CRITICAL]: R48 Measurement Bias — Generator Overestimates the Artifact

**Generator's claim**: R48's discretization contributes ~0.045mm of systematic positive bias, and "radial amplification" could push the measured distance higher, potentially explaining a large fraction of the 0.22mm.

**Actual behavior**: I computed the expected R48 distance **for a perfectly-placed vertex at the exact true peak**, using the parameters specified:

**Setup**: Superformula with m=8, amplitude A=5mm, base radius R₀=30mm. Peak radius R_peak = R₀+A = 35mm.

R48 step = 0.030/(64-1) ≈ 0.000476 U. Half-step quantization ≈ 0.000238 U.

**Radius difference** at 0.000238 U from peak:
$$\Delta r = A \cdot (2\pi m)^2 \cdot \Delta u^2 / 2 = 5 \times (50.27)^2 \times (0.000238)^2 / 2 = 0.000358 \text{ mm}$$

**3D distance** between the true peak point and R48's nearest candidate:
- Peak point: $(35, 0, z)$
- R48 candidate: $(34.999642 \times \cos(0.001496), 34.999642 \times \sin(0.001496), z)$
- $\Delta x \approx 0.000397$ mm, $\Delta y \approx 0.0524$ mm

$$d_{R48} = \sqrt{(0.000397)^2 + (0.0524)^2} = 0.0524 \text{ mm}$$

**Key result: R48's measurement floor is 0.052mm, NOT 0.22mm.** R48 quantization explains only 24% of the observed average.

**Generator's "radial amplification" hand-wave is wrong.** The radial contribution $\Delta r = 0.000358$ mm at the R48 step size is negligible (~0.7% of the 3D distance). Even at the observed true error level ($\epsilon \approx 0.001$ U), the radial contribution is only:
$$\Delta r = 5 \times (50.27)^2 \times (0.001)^2 / 2 = 0.00632 \text{ mm}$$
versus angular contribution $35 \times 2\pi \times 0.001 = 0.220$ mm. The 3D distance is 99.96% angular even at the worst case. There is no meaningful radial amplification.

**Reverse-engineering the true error from the 0.22mm observation:**
$$\epsilon_{true} \approx \frac{0.22}{R_{avg} \times 2\pi} = \frac{0.22}{30 \times 6.283} = 0.00117 \text{ U} \approx 9.6 \text{ sample widths at 8192}$$

This is **19x worse** than the claimed ±0.5 sample detection precision after parabolic refinement.

**VERDICT: REJECT the claim that R48 bias explains a large fraction of 0.22mm.** R48 bias ≈ 0.052mm. True chain error ≈ 0.17mm. The mystery is real.

**Note on Proposal 2**: Adding parabolic refinement to R48 is still worthwhile — it lowers the measurement floor from 0.052mm to ~0.002mm, enabling more precise diagnosis. But it will NOT make the 0.22mm average "disappear." Expected post-refinement average: ~0.17-0.20mm.

---

### C2 [WARNING]: Outlier Dominance — Partially Explains the Average, Not the Bulk

**Generator's claim**: chain0 (len=46, uErr=0.015, dist=6.81mm) is a worst-case outlier but the Generator "doesn't estimate its impact on the average."

**Quantitative analysis**:

| Metric | Full Dataset | Without chain0 |
|--------|-------------|-----------------|
| Total distance | 6282 × 0.2282 = 1433.5mm | 1433.5 - (46 × 6.81) = 1120.2mm |
| Vertex count | 6282 | 6236 |
| Average | 0.2282mm | **0.1797mm** |
| Reduction | — | **21.2%** |

Removing chain0 drops the average from 0.2282mm to 0.1797mm. But 0.18mm is still **3.5x the R48 floor** (0.052mm), confirming the error is real even without outliers.

If additional bad chains exist (e.g., 5 chains with ~50 vertices each at ~2mm avg distance):
- Total outlier contribution: 313 + 250 = 563mm
- Healthy avg: (1433.5 - 563) / (6282 - 296) = 870.5 / 5986 = **0.145mm** (still 2.8x R48 floor)

**The Generator correctly identifies chain0 as a wrong-feature-assignment** (saturated diagnostic window proves it). The Generator's analysis of birth/death zones is plausible.

**VERDICT: ACCEPT the chain0 analysis. ACCEPT WITH AMENDMENT** that the Generator should have computed the outlier impact quantitatively. The average drops ~21% without chain0, but the remaining 0.18mm bulk error is still unexplained.

**Required diagnostic**: Per-chain average distance breakdown. Without this, we cannot determine whether the 0.18mm comes from a handful of noisy chains or is uniformly distributed.

---

### C3 [NOTE]: Re-snap isMax Bug — Confirmed, Impact Correctly Assessed

**Generator's claim**: Step 3.5 re-snap determines isMax via probe-data heuristic `(rCenter >= rPrev && rCenter >= rNext)` instead of `cp.kind === 'peak'`. Impact is minor (~0.0085mm degradation).

**Code verification**:
- Step 3.5 (line 1038 of ParametricExportComputer.ts): `const isMax = (rCenter >= rPrev && rCenter >= rNext);` — **BUG CONFIRMED**
- Phase 2 interp re-snap (line 1655): `const isMax = !parentChain?.kind || parentChain.kind === 'peak';` — **CORRECT**
- R48 diagnostic (line 2075): `const isMax = !parentChain?.kind || parentChain.kind === 'peak';` — **CORRECT**

**Impact analysis**: For a valley chain point, when is the probe heuristic wrong? The nearest integer sample to a valley would need `rCenter >= rPrev AND rCenter >= rNext`. Near a valley, the radius profile is a dip, so typically rCenter < rPrev OR rCenter < rNext. The heuristic is wrong only when:
1. The feature amplitude is sub-sample (radius essentially flat) — noise-dominated
2. The chain point is mid-slope between a valley and a nearby peak

For well-detected features (sufficient amplitude to trigger gradient sign change), the probe heuristic agrees with the chain kind >99% of the time. The 0.0085mm avg degradation from re-snap is consistent with <1% of points being mis-classified and moved wrong-direction within the small re-snap window (±0.000244 U for Stage 2).

**VERDICT: ACCEPT.** Bug is real, fix is simple (`cp.kind === 'peak'`), impact is minor. This is NOT a root cause of the 0.22mm error (the error exists with re-snap disabled at 0.22mm too).

---

### C4 [CRITICAL]: Primary/Interpolated Average Convergence — R48 Bias Alone Cannot Explain It

**Generator's claim**: Both averages converging to ~0.22mm is "suspicious" and suggests either a shared precision ceiling OR a systematic R48 bias.

**My analysis separating the two explanations**:

**Explanation A (R48 measures ~0.22mm regardless of quality)**: FALSE. Proven in C1. R48's floor is ~0.052mm, not 0.22mm. If primary vertices had 0.002mm true error and interpolated vertices had 0.10mm true error, R48 would report ~0.053mm and ~0.11mm respectively — clearly different.

**Explanation B (both hit the same precision ceiling)**: More plausible but needs refinement.

Primary vertices go through:
- Detection (parabolic refinement on 8192 samples) → claimed ±0.000061 U
- Step 3.5 re-snap (64+32 candidates + parabolic) → claimed ±8e-6 U

Interpolated vertices go through:
- Linear interpolation (potentially large error) → error depends on gap
- Phase 2 re-snap (32-64 candidates + parabolic, window up to ±0.01 U) → claimed ±similar precision

**The convergence to ~0.22mm implies both pathways achieve ~0.001 U actual precision** despite claiming 10-100x better. This points to a systematic error source UPSTREAM of or SHARED by both pathways.

Candidates for the shared error source:
1. **The underlying detection is systematically biased by ~0.001 U for some rows** — and re-snap (which searches near the detection output) inherits the bias
2. **The GPU surface evaluation has row-dependent variability** that neither detection nor re-snap accounts for
3. **Feature motion between adjacent rows** — the chain links features across rows, but the feature's mathematical position moves in U. If it moves by ~0.001 U between the detection row and adjacent rows, direct comparisons are confounded

**VERDICT: REJECT the Generator's "R48 bias" explanation (disproven in C1). INCONCLUSIVE on the root cause.** The convergence is a real clue but the Generator failed to exploit it. This is the most important remaining diagnostic question — **Per-chain AND per-row R48 distance breakdown** would immediately reveal whether the ~0.001 U error is spatially correlated or uniformly distributed.

---

### C5 [NOTE]: GPU Non-Determinism — Correctly Eliminated

**Generator's claim**: Assumes GPU shader is deterministic.

**Verification**: Both detection probing (Step 1, via `evaluatePoints` at line ~766) and R48 probing (via `evaluatePoints` at line ~2056) use:
- Same compute shader: `evaluate_vertices` (adaptive_mesh.wgsl line 763)
- Same uniform buffer state: chunk0-chunk3 unchanged; chunk4 modifications only affect `relax_vertices` and `compute_metric_field` shaders, NOT `evaluate_vertices` (confirmed: `evaluate_vertices` reads only H, Rt, Rb, tWall, styleId, spinTurns from chunk0-chunk3)
- Same code path: both call `this.evaluatePoints()` (line 247) which dispatches `evaluate_vertices` with identical pipeline configuration

The `evaluate_vertices` shader:
- No cross-thread communication (each thread processes one vertex independently)
- No shared memory usage
- Same pipeline objects across calls

Even if WGSL `sin()`/`cos()` had implementation-defined precision, the SAME hardware with the SAME input produces the SAME output (deterministic per-operation). The inputs differ (different U values), but that's by design. For overlapping inputs (same U,T), the outputs would be bitwise identical.

**Magnitude check**: Even 100 ULP float32 error in radius ≈ $10^{-7} \times 30 = 3 \times 10^{-6}$ mm. Negligible compared to 0.22mm.

**VERDICT: ACCEPT.** GPU non-determinism is not a factor.

---

### C6 [NOTE]: Relaxation Corruption — Correctly Eliminated

**Generator's claim**: Relaxation does not modify chain vertex UVs because `chunk4.z = outerGridVertexCount` is written before Phase 3 evaluation, and the shader skips vertices with `idx >= grid_vert_count`.

**Code verification** — the execution sequence in ParametricExportComputer.ts:

1. **Line 1723-1724**: `writeBuffer(uniformBuffer, 76, outerW)` — writes chunk4.w
2. **Line 1730-1731**: `writeBuffer(uniformBuffer, 72, outerGridVertexCount)` — writes chunk4.z (**ONLY if `relaxIterations > 0`**)
3. **Line 1741**: `evaluatePoints(combinedVerts, ..., relaxIterations)`

Inside `evaluatePoints` (line 247):
- **If relaxIterations > 0**: dispatches `compute_metric_field` then `relax_vertices` (batched), then `evaluate_vertices`
- **If relaxIterations = 0**: dispatches only `evaluate_vertices`

The `relax_vertices` shader (adaptive_mesh.wgsl line 1233):
```wgsl
let grid_vert_count = u32(uniforms.chunk4.z);
if (grid_vert_count > 0u && idx >= grid_vert_count) {
    // Copy unchanged — skip chain vertices
    vertices_out[base_skip] = vertices[base_skip];
    ...
    return;
}
```

**Chain vertices have indices ≥ outerGridVertexCount** (they're appended after grid vertices in combinedVerts). The guard correctly skips them. Their UVs are copied unchanged through relaxation.

**When relaxIterations = 0**: chunk4.z is never written, but the relaxation shader is never dispatched. chunk4.z could contain stale data (e.g., `targetTris` from a previous subdivision step), but it doesn't matter — no shader reads it.

**The `evaluate_vertices` shader does NOT read chunk4 at all** (confirmed by reading lines 763-867 of adaptive_mesh.wgsl). It reads only chunk0-chunk3.

**VERDICT: ACCEPT.** Relaxation cannot corrupt chain vertices. The analysis is correct and complete.

---

## Accepted Items

| # | Item | Evidence |
|---|------|----------|
| Q1 | Detection and R48 use identical metrics (`sqrt(x²+y²)`) | FeatureDetection.ts:224-226, PEC:2079-2082 |
| Q2 | Detection algorithm is mathematically correct | Gradient sign change + 3-point parabolic refinement, FeatureDetection.ts:244-290 |
| Q3 | U coordinates preserved through all 14 pipeline steps | Traced start-to-end, no rounding or modification |
| Q4 | Surface evaluation identical between Step 1 and R48 | chunk4 modifications don't affect evaluate_vertices shader |
| Q5 | chain0 is a wrong-feature-assignment, not a precision error | Saturated RIDGE_DIAG_HW window proves feature is >0.015 U away |
| Q6 | R48 diagnostic isMax determination is correct | Uses `parentChain.kind === 'peak'`, PEC:2075 |
| Q6b | Step 3.5 re-snap isMax is WRONG | Uses probe heuristic, PEC:1038 |
| Q7 | GPU non-determinism is not a factor | Same shader, same pipeline, ~10⁻⁶mm magnitude |
| Q8 | Relaxation cannot corrupt chain vertices | chunk4.z guard correctly skips chain vertices |
| Q9 | meshChains uses pre-smooth positions (not WH-smoothed) | PEC:1232, confirmed by R45 comment at PEC:1230 |

## Rejected Items

| # | Item | Reason |
|---|------|--------|
| R1 | R48 measurement bias explains large fraction of 0.22mm | Computed R48 floor = 0.052mm (only 24% of observed). Math in C1. |
| R2 | "Radial amplification" significantly inflates the distance | $\Delta r = 0.000358$ mm at R48 step — 0.7% of 3D distance. Negligible. |
| R3 | Adding parabolic refinement to R48 will drop avg from 0.22mm to <0.05mm | Expected reduction: ~0.05mm at most (0.22→~0.17mm). True error dominates. |

---

## Open Questions for Generator

1. **What is the actual pot circumference used for the R48 data?** The computation above uses R₀=30mm + A=5mm (peak at 35mm). If the actual pot radius is different, all mm-to-U conversions change. However, the conclusion (R48 floor << 0.22mm) holds for any reasonable pot radius.

2. **What explains the genuine ~0.001 U detection error?** The Generator eliminated all obvious causes (metric mismatch, pipeline corruption, shader inconsistency, parabolic clamping). The remaining candidates:
   - Feature sub-structure (multiple maxima within a single "ridge" — detection tracks one sub-peak, R48 finds a slightly different one)
   - Systematic bias in detection from feature ASYMMETRY (skewed peaks bias the 3-point parabolic fit)
   - Numerical cancellation in detection's gradient sign test near features with small amplitude

3. **Could the error be concentrated in specific rows or T-ranges?** If features change character (emerge, fade, split) at certain heights, detection quality would vary with T. This would show up in a per-row error heatmap.

---

## Proposals Assessment

### Proposal 1 (Fix re-snap isMax bug): ACCEPT
- Simple, correct fix: replace probe heuristic with `cp.kind === 'peak'`
- Expected impact: eliminates 0.0085mm re-snap degradation
- Risk: none (purely corrective)
- **Should be implemented regardless of other findings**

### Proposal 2 (Add parabolic refinement to R48): ACCEPT WITH AMENDMENT
- Valuable for improved diagnostic precision (floor drops from 0.052mm to ~0.002mm)
- **AMENDMENT**: Will NOT resolve the 0.22mm mystery. Expected post-fix average: ~0.17-0.20mm
- **The Generator must not claim this will "answer definitively" whether 0.22mm is artifact — it won't, because it isn't**
- Still worth doing for future diagnostic accuracy

### Proposal 3 (Per-chain error distribution diagnostic): ACCEPT — HIGHEST PRIORITY
- This is the **most important** next step
- Must include:
  1. Per-chain average distance (identify which chains have high error)
  2. Per-row error by chain (identify T-ranges where error is worst)
  3. Chain length vs error correlation (short chains ≈ more error?)
  4. U-domain error separately from 3D distance (isolate angular error from radial)
- This will distinguish:
  - "A few bad chains dominate" (fixable via chain quality filters)
  - "All chains have ~0.001 U error" (fundamental detection limitation)
  - "Error correlated with feature amplitude/curvature" (parabolic refinement bias)

---

## Additional Diagnostics Required (Definitive Answers)

### D1: Per-Chain Error Breakdown (ESSENTIAL)
Report for each chain i: {chainId, kind, length, avgDist, maxDist, avgUError, maxUError}. This immediately answers whether the 0.18mm (after removing chain0) is from 2-3 bad chains or is uniform across all 20 chains. If median chain avg is <0.05mm and mean is 0.18mm, outliers dominate. If median ≈ mean ≈ 0.18mm, it's systemic.

### D2: U-Domain Error vs 3D Distance (ESSENTIAL)
For each chain vertex, compute:
- `uError = circularDistance(vertexU, R48_bestCandidateU)` (pure U error)
- `rError = |r_vertex - r_R48candidate|` (radial error)
- `dist3D` (current metric)

If uError × circumference ≈ dist3D for most vertices, the error is purely angular (detection U error). If rError contributes significantly, the chain vertex is at a position where the surface is sloped (not at a true extremum).

### D3: Parabolic Refinement in R48 (USEFUL but not decisive)
Add 3-point parabolic refinement to R48's best candidate. This drops R48's measurement floor from 0.052mm to ~0.002mm. Expected outcome: average drops by ~0.03mm (from 0.22 to ~0.19mm). If it drops below 0.05mm instead, I'm wrong and the Generator is right (the 0.22mm IS substantially a measurement artifact). **This would be a clean test of my C1 analysis.**

### D4: Feature Asymmetry Bias Test (INFORMATIVE)
For each detected feature: compute the parabolic refinement delta. If the distribution of deltas is biased (mean ≠ 0), the features are systematically asymmetric, causing the 3-point fit to err in one direction. For symmetric features (cos-peaks), the delta distribution should be symmetric around 0.

---

## Implementation Conditions (for Executioner)

If proceeding to implementation:

1. **First**: Implement D1 (per-chain error breakdown) — it's purely diagnostic, zero risk, and immediately clarifies the error distribution
2. **Second**: Implement Proposal 1 (isMax fix) — simple, safe, correct
3. **Third**: Implement D3 (R48 parabolic refinement) — adds diagnostic precision, validates C1
4. **Then**: Re-run export with all diagnostics enabled. Analyze results before proceeding further.

**Validation protocol**:
- After Proposal 1: re-snap avg should improve by ~0.008mm (expect 0.2282 → ~0.2197, matching re-snap-OFF baseline)
- After D3: if avg drops to ~0.17-0.19mm, C1 is confirmed (real error + small R48 artifact). If avg drops to <0.05mm, C1 is wrong (was all R48 artifact).
- D1 results determine next action: if 2-3 chains dominate, fix chain linking. If uniform, investigate detection precision at the row/feature level.
