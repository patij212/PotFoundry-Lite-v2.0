# Generator Round 50B — Ridge-Distance Root Cause Investigation
Date: 2026-03-09

## Problem Statement

The R48 ridge-distance diagnostic reports an average 3D distance of 0.22mm between chain vertices and their nearest mathematical ridge/valley positions — 12x larger than the claimed detection precision of ±0.00006 U (~0.019mm). Re-snap ON vs OFF produces nearly identical results (delta 0.008mm), proving re-snap cannot fix whatever is wrong. The previous R50 analysis was wrong in claiming chains were fine.

## Hard Evidence (Restated)

| Metric | Resnap ON | Resnap OFF |
|--------|-----------|------------|
| Primary avg | 0.2282mm | 0.2197mm |
| Primary max | 6.8104mm | 6.8104mm |
| Primary n | 6282 | 6286 |
| Interp avg | 0.2215mm | 0.2185mm |
| Interp max | 6.8184mm | 6.8179mm |
| Worst chain | chain0, uErr=0.015000 (SATURATED) | chain0, uErr=0.015000 (SATURATED) |

Key: Re-snap makes things 0.0085mm WORSE on average.

---

## Q1: What Metric Does Detection Use vs What R48 Uses?

### Code read: Detection metric
**File**: `FeatureDetection.ts`, lines 224-226 (`detectRowFeaturesV16`)
```typescript
const radii = new Float32Array(numSamples);
for (let i = 0; i < numSamples; i++) {
    const x = positions3D[i * 3];
    const y = positions3D[i * 3 + 1];
    radii[i] = Math.sqrt(x * x + y * y);
}
```
**Metric**: Cylindrical radius `sqrt(x² + y²)` = distance from Z-axis.

### Code read: R48 probing metric
**File**: `ParametricExportComputer.ts`, lines 2079-2082
```typescript
const r = Math.sqrt(probePositions[off] ** 2 + probePositions[off + 1] ** 2);
```
**Metric**: Identical — `sqrt(x² + y²)`.

### Code read: GPU shader surface evaluation
**File**: `adaptive_mesh.wgsl`, lines 782-789 (`evaluate_vertices`)
```wgsl
let r = compute_outer_radius(theta, t);
let th = compute_twist(theta, t);
x = r * cos(th);
y = r * sin(th);
```
Both detection and R48 compute `sqrt(x² + y²) = sqrt(r²cos²(th) + r²sin²(th)) = |r|`. The twist angle `th` cancels out in the magnitude. Both correctly recover `compute_outer_radius(theta, t)`.

### Conclusion
**IDENTICAL metrics.** Both find extrema of the same function. This is NOT the root cause.

---

## Q2: Is Detection Finding the CORRECT Feature Position?

### Code read: Detection algorithm
**File**: `FeatureDetection.ts`, lines 244-290

Detection uses two strategies:
1. **Strategy 1 (Primary)**: Gradient sign change: `dLeft = radii[i] - radii[prev]; dRight = radii[next] - radii[i]; if (dLeft * dRight >= 0) continue;` — finds samples where the first derivative of radius changes sign (true extrema). Followed by 3-point parabolic refinement: `delta = 0.5 * (L - R) / (L - 2*C + R)`, clamped to ±0.5 samples.
2. **Strategy 2**: Curvature shoulder detection (backup, lower confidence).

### Preprocessing check
**No smoothing or normalization** is applied to the radius array before detection. The raw `sqrt(x²+y²)` values from GPU evaluation are used directly. The only preprocessing is the 5-point stencil second derivative (used for curvature classification, not for peak position detection).

### Parabolic refinement precision analysis
For a perfect parabolic peak, the 3-point fit recovers the exact peak position (`delta = p` where peak is at sample `i + p`). The clamping at ±0.5 introduces maximum error of 0.5 samples = `0.5/8192 ≈ 0.000061 U`.

For non-parabolic peaks, the 3-point fit has bias proportional to the 4th derivative of the radius profile × h², where h = 1/8192. This bias is negligibly small for any realistic pot surface.

### Conclusion
**Detection algorithm is mathematically correct.** Parabolic refinement on 8192 samples should achieve ±0.000061 U precision for smooth features. The 0.22mm average error cannot be explained by detection algorithm deficiency alone.

---

## Q3: How Does Feature U Flow Through the Pipeline?

### Traced path (with file:line references)

1. **Detection** → `detectRowFeaturesV16` returns `refinedU = ((i + delta) / numSamples) % 1` via `result.uPositions` (FeatureDetection.ts:462-464)
2. **detectAllRowFeatures** → passes through without modification (FeatureDetection.ts:500-502)
3. **ParametricExportComputer Step 2** → `allRowFeatures` receives raw detection output (ParametricExportComputer.ts:780-786)
4. **linkFeatureChainsByKind** → splits by kind, then `linkFeatureChainsCore` stores:
   ```typescript
   ac.chain.points.push({ u: rowFeats[fi], row: j }); // ChainLinker.ts:934
   ```
   The U is the RAW detection output, stored without modification.

5. **Step 3.5 Re-snap** → modifies `chains[ci].points[pi].u` in-place (ParametricExportComputer.ts:1153-1155)
6. **zigzag repair** → may reassign some points to different features (ChainLinker.ts:1098+)
7. **preSmoothChains** deep copy preserves re-snapped+repaired positions (ParametricExportComputer.ts:1210-1213)
8. **meshChains** = `filterLowConfidenceChains(preSmoothChains)` — only removes entire chains, no point modification (ChainLinker.ts:573-605, ParametricExportComputer.ts:1232)
9. **OWT** receives `meshChains`, creates chain vertices:
   ```typescript
   const u = Math.max(0, Math.min(1 - 1e-7, pt.u)); // OuterWallTessellator.ts:730
   vertices[vIdx++] = cv.u; // OuterWallTessellator.ts:845
   ```
   Only clamping to [0, 1-1e-7], effectively a no-op for valid U values.
10. **combinedVerts** assembled from OWT output (ParametricExportComputer.ts:1559-1562)
11. **Phase 2 interp re-snap** → modifies `combinedVerts[iv.vertexIdx * 3]` for INTERPOLATED chain vertices only (ParametricExportComputer.ts:1697)
12. **Phase 3 GPU eval** → `resultData = evaluatePoints(combinedVerts, ...)` (ParametricExportComputer.ts:1741)
13. **Subdivision** → `finalResultData` preserves existing vertex 3D positions; only adds new midpoint vertices (ParametricExportComputer.ts:1872-1884)
14. **R48 diagnostic** → reads `combinedVerts[cv.vertexIdx * 3]` for U and `finalResultData[cv.vertexIdx * 3]` for 3D X (ParametricExportComputer.ts:2042-2043, 2090-2092)

### Conclusion
**U coordinates are faithfully preserved at every step.** No rounding, snapping, or corruption occurs between detection and the R48 diagnostic. The U value in `combinedVerts` for a primary chain vertex is exactly what detection + re-snap produced.

---

## Q4: Spatial Transformations Between Detection and R48?

### Surface evaluation consistency
Both Step 1 probing and R48 probing use `this.evaluatePoints()` (ParametricExportComputer.ts:247-400) which:
1. Creates a fresh GPU buffer, copies UV data
2. Dispatches the `evaluate_vertices` compute shader
3. Reads back 3D positions

### Uniform buffer modification check
Between Step 1 (line ~766) and R48 (line ~2052), two modifications occur:
- `uniformBuffer[76]` = `outerW` (chunk4.w, for relaxation grid width, ParametricExportComputer.ts:1723-1724)
- `uniformBuffer[72]` = `outerGridVertexCount` (chunk4.z, for relaxation, ParametricExportComputer.ts:1730-1731)

### Shader analysis
**File**: `adaptive_mesh.wgsl`, lines 15-20
```wgsl
  chunk4: vec4<f32>, // x:subdivThreshold, y:minQuadSize, z:targetTris|gridVertCount, w:W
```
chunk4 is used by: `snap_to_feature_ridges` (chunk4.x), `relax_vertices` (chunk4.w, chunk4.z), and `adaptive_subdivide` (chunk4.z, chunk4.w). It is **NOT read by `evaluate_vertices`** (lines 763-850). The evaluate shader only reads chunk0-chunk3 for H, Rt, Rb, tWall, styleId, spinTurns, bellAmp, etc.

### Conclusion
**The surfaces evaluated by Step 1 and R48 are IDENTICAL.** The uniform buffer modifications between the two calls affect only relaxation/subdivision shaders, not surface evaluation. There is no spatial transformation difference.

---

## Q5: What Is chain0?

chain0 has:
- len=46 (short chain — typical chains span ~264 rows)
- uErr=0.015000 (EXACTLY equals RIDGE_DIAG_HW — the search window is SATURATED)
- dist=6.81mm (maximum observed distance)

The saturated window proves the true mathematical extremum is **beyond ±0.015 U from the chain vertex's position**. At pot circumference ~200mm, 0.015 U → 3mm arc-length. The 6.81mm 3D distance (larger than 3mm) is consistent with the true feature being far away: the radial offset between a wrong position and the true ridge adds to the angular arc.

**chain0 is almost certainly tracking a feature near its birth/death or a bifurcation zone.** With only 46 points (vs ~264 typical), it covers only ~17% of the pot's height. At birth/death zones, features merge or split — the DP matcher may connect the chain to a fading feature while a strengthening feature nearby becomes R48's preferred extremum.

### Conclusion
chain0's saturated window means **this is not a precision error — it's a fundamentally wrong feature assignment** for this short chain. The chain is tracking one feature; R48 is finding a different (stronger) feature at these rows.

---

## Q6: Could the R48 Diagnostic Itself Be Wrong?

### isMax determination
**File**: `ParametricExportComputer.ts`, line 2075
```typescript
const isMax = !parentChain?.kind || parentChain.kind === 'peak';
```

This correctly uses the chain's `kind` property. All chains from `linkFeatureChainsByKind` have `kind` set ('peak' or 'valley'). The `chainVertexChainIds` map is built by OWT using the `meshChains` array indices (OuterWallTessellator.ts:1844), and the R48 code looks up `meshChains[cv.chainId]` — using the same array. **Kind assignment is correct.**

### R48 measurement validity
The R48 diagnostic probes 64 candidates over ±0.015 U and picks the max/min radius. It computes 3D Euclidean distance between the chain vertex's final 3D position and the candidate's 3D position. **This measurement is geometrically correct.**

### Potential confounding: adjacent feature capture
For styles with closely-spaced same-kind features (spacing < 0.030 U), R48's ±0.015 window could capture an ADJACENT feature that is stronger than the chain's feature. The diagnostic would report the distance to a DIFFERENT feature as a "ridge-distance error."

However, for typical PotFoundry styles:
- Superformula m=10: same-kind spacing = 0.1 U (>> 0.03) → no confusion
- m=20: same-kind spacing = 0.05 U (>> 0.03) → no confusion
- WaveInterference k≈72: same-kind spacing ≈ 0.028 U → marginal, some confusion possible

For most styles, **the R48 diagnostic is valid.** Feature confusion could contribute for dense-feature styles but cannot explain the 0.22mm average across typical styles.

### Conclusion
R48 is implemented correctly. For dense-feature styles (>33 same-kind features per row), the diagnostic may report inflated distances due to adjacent feature capture. For typical styles, this is not a factor.

---

## ROOT CAUSE ANALYSIS

### Finding 1: Re-snap isMax Determination Bug (CONFIRMED, minor impact)

**File**: `ParametricExportComputer.ts`, lines 1018-1040 (Stage 1) and 1103-1114 (Stage 2)

The re-snap determines peak vs valley using a **probe-data heuristic** instead of the chain's `kind` property:

```typescript
// RE-SNAP (Step 3.5) — WRONG METHOD:
const sampleIdx = Math.round(cp.u * ROW_PROBE_SAMPLES) % ROW_PROBE_SAMPLES;
const rCenter = Math.sqrt(origRowData[sampleIdx * 3] ** 2 + origRowData[sampleIdx * 3 + 1] ** 2);
const rPrev = Math.sqrt(origRowData[prevSampleIdx * 3] ** 2 + origRowData[prevSampleIdx * 3 + 1] ** 2);
const rNext = Math.sqrt(origRowData[nextSampleIdx * 3] ** 2 + origRowData[nextSampleIdx * 3 + 1] ** 2);
const isMax = (rCenter >= rPrev && rCenter >= rNext);
// ^^^ Should use: const isMax = cp.kind === 'peak';
```

Compare to R48 and Phase 2 interp re-snap, which correctly use:
```typescript
const isMax = !parentChain?.kind || parentChain.kind === 'peak';
```

**Impact**: When a valley chain point's nearest sample happens to be at a local radius maximum (e.g., the point was refined between samples and is equidistant from the true extremum and a nearby opposite-kind feature), the re-snap searches for max radius instead of min, potentially moving the point AWAY from the correct position.

**Evidence**: Re-snap makes things WORSE by 0.0085mm on average (0.2197 → 0.2282mm). This is consistent with a fraction of points being re-snapped in the wrong direction.

**Severity**: Minor. The data shows re-snap changes avg by only 0.0085mm. Fixing the isMax determination would likely reduce this to near-zero but would not fix the underlying 0.22mm error that exists with re-snap disabled.

### Finding 2: The 0.22mm Error Exists Without Re-snap (CRITICAL, root cause unknown)

With re-snap DISABLED, primary chain vertices still have 0.2197mm average distance from R48's extremum. This means the error is in the **raw detection output** — before any post-processing.

Detection operates on 8192-sample GPU probe data at each row. It finds gradient sign changes with parabolic refinement. The claimed precision is ±0.5/8192 ≈ ±0.000061 U.

At a pot radius of 30mm (circumference ~188mm), the observed 0.22mm corresponds to:
- ΔU ≈ 0.22 / 188 ≈ 0.0012 U ≈ 9.5 sample widths at 8192

**This is 20x worse than the parabolic refinement precision.** I was unable to identify a single code-level bug that explains this systematic error. The possibilities I investigated and eliminated:

| Hypothesis | Status | Evidence |
|---|---|---|
| Metric mismatch (detection vs R48) | ELIMINATED | Both use `sqrt(x²+y²)` on same GPU shader output |
| U corruption in pipeline | ELIMINATED | Traced all 14 steps; U preserved exactly |
| Uniform buffer state change | ELIMINATED | chunk4 modifications don't affect evaluate shader |
| Surface evaluation inconsistency | ELIMINATED | Same shader, same chunk0-3 params |
| Kind assignment error | ELIMINATED | All chains have kind from `linkFeatureChainsByKind` |
| Parabolic refinement clamping | ELIMINATED | Average clamp error ≈ 0.0015mm << 0.22mm |
| Adjacent feature confusion in R48 | UNLIKELY | Same-kind spacing >> 2×RIDGE_DIAG_HW for typical styles |

### Finding 3: Primary and Interpolated Errors Are Nearly Identical (SUSPICIOUS)

- Primary: 0.2282mm (from detection + re-snap)
- Interpolated: 0.2215mm (from linear interpolation + Phase 2 re-snap)

These are within 3% of each other. Interpolated vertices start with potentially LARGE errors (linear interpolation off-ridge) and are then re-snapped with 32-64 candidates + parabolic refinement. Primary vertices start with high-precision detection and are re-snapped with the same procedure.

The convergence to the SAME ~0.22mm suggests either:
1. **Both hit the same precision ceiling** — the re-snapping procedure (and detection for primaries) achieves ~0.001 U precision uniformly, or
2. **The R48 diagnostic has a systematic measurement bias** of ~0.22mm that applies equally to all chain vertices regardless of their origin

### Hypothesis: R48 Measurement Bias from Discrete Sampling

The R48 diagnostic probes 64 candidates over ±0.015 U. Step size = 0.030/63 ≈ 0.000476 U. It picks the best DISCRETE candidate — **no parabolic refinement is applied** to the R48 result.

The R48 "true extremum" position has quantization error of ±0.000238 U (half step). At R=30mm:
- Angular arc from quantization: 30mm × 2π × 0.000238 ≈ 0.045mm

This is a systematic positive bias on the reported distance (the R48 candidate is never EXACTLY at the true extremum, so there's always residual distance). But 0.045mm is only ~20% of 0.22mm.

**However**, the R48 diagnostic computes 3D distance, not angular arc. The R48 candidate's 3D position is at a DIFFERENT radius than the chain vertex (since it's at the extremum rather than the chain vertex's slightly-off-extremum position). This radial difference adds quadratically:

```
dist = sqrt(Δr² + r² × Δθ²)
```

where Δr is the radial difference from being off-peak and Δθ includes both the actual U error AND R48's quantization. 

For a feature with peak-to-valley amplitude A over feature width W:
- Δr ≈ A × (2πΔU/W)² for small ΔU
- This could significantly amplify the reported distance

---

## RECOMMENDED NEXT STEPS

### Proposal 1: Fix re-snap isMax bug (Simple)
**File**: `ParametricExportComputer.ts`, lines 1018-1040 and 1103-1114

Replace the probe-data heuristic with the chain's kind:
```typescript
// BEFORE (wrong):
const isMax = (rCenter >= rPrev && rCenter >= rNext);
// AFTER (correct):
const isMax = cp.kind === 'peak';
```
Expected impact: eliminates the 0.0085mm re-snap degradation.

### Proposal 2: Add parabolic refinement to R48 diagnostic (Essential to validate)
**File**: `ParametricExportComputer.ts`, lines 2080-2086

The R48 diagnostic currently picks the best DISCRETE candidate among 64. Adding 3-point parabolic refinement (the same formula used in detection) would eliminate the R48 quantization bias and reveal the TRUE residual error.

Without this fix, the R48 diagnostic has a systematic positive bias of ~0.045mm from its own quantization, making it impossible to distinguish genuine 0.22mm error from measurement artifact.

### Proposal 3: Per-chain error distribution diagnostic
Add a diagnostic that reports:
1. Per-chain (not per-vertex) avg and max distance
2. Histogram of uError values (to see if error is concentrated in a few chains or distributed)
3. Feature spacing at each chain vertex's row (to detect R48 adjacent-feature confusion)
4. Correlation between error and row position / feature prominence / chain length

This would reveal whether the 0.22mm average is caused by:
- A minority of bad chains (chain0-like) pulling up the average, or
- A genuine ~0.22mm error across ALL chain vertices

---

## Open Questions (For Verifier)

1. **The identical primary/interpolated averages are suspicious.** If detection precision varies by style and feature prominence, why do primary and interpolated vertices converge to the SAME 0.22mm? This suggests either a shared precision ceiling OR a systematic R48 bias.

2. **What is the pot geometry?** The 3D distance depends on pot radius. Without knowing R (and therefore the circumference), we can't convert 0.22mm to a U-domain error to compare against detection precision.

3. **What style is being tested?** Feature spacing determines whether R48's ±0.015 window captures adjacent same-kind features. For dense styles (>33 features), the diagnostic is confounded.

4. **Is R48's lack of parabolic refinement the dominant bias?** Proposal 2 would answer this definitively. If adding parabolic refinement to R48 drops the average from 0.22mm to <0.05mm, the current 0.22mm is mostly measurement artifact. If it stays at 0.22mm, the detection error is genuine.

5. **Does the R48 distance include a significant radial component?** For features with high peak-to-valley amplitude, even a small U offset causes a measurable radial miss, amplifying the 3D distance beyond what the U error alone would suggest. Computing the U-domain error separately from the radial error for each vertex would clarify this.

## Assumptions (for Verifier to attack)

1. I assume `compute_outer_radius` in the GPU shader always returns a positive value, so `sqrt(x²+y²) = r` (not `-r`). If the shader can return negative radius for some styles, detection would find sign changes at the wrong positions.

2. I assume the GPU shader is deterministic: the same (u, t, surfaceId) input always produces the same (x, y, z) output across different `evaluatePoints` calls. If WebGPU non-determinism exists, the detection probe and R48 probe could disagree on the radius profile.

3. I assume the relaxation shader (if `relaxIterations > 0`) does NOT modify chain vertex UVs. The shader checks `idx < grid_vert_count` (chunk4.z) to skip chain vertices. If this check is wrong (e.g., chunk4.z wasn't written before Phase 3 eval), chain vertices would be relaxed, corrupting their 3D positions.

4. I assume features are single-peaked (no sub-structure within a single ridge). If features have fine-grained sub-peaks, detection might track one sub-peak while R48 finds a different (stronger) sub-peak within the same ridge.

5. I assume that the R48 diagnostic's 0.22mm average is not dominated by a small number of outlier chains (chain0-like) pulling up the mean. A median or per-chain breakdown would validate or refute this.
