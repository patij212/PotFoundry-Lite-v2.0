# Generator Round 49 — Chain Edge Accuracy

Date: 2026-03-09

## Problem Statement

Feature chain vertices in the exported STL do NOT sit at the true mathematical ridge/valley edge. The R48 ridge-distance diagnostic proves this conclusively:

```
avg=0.2242mm, max=6.8184mm (n=8739)
primary: avg=0.2230mm (n=6549)
interpolated: avg=0.2278mm (n=2190)
```

Despite 5 rounds of fixes (R44–R48), the symptoms persist. The R48 fan midpoint insertion made slivers WORSE (38.6% → 47.0%) and created 38,980 CSO rowSpan rejects.

## Root Cause Analysis

After reading the complete pipeline code, I identify **three independent root causes** and one **counter-productive fix** to revert.

### Root Cause 1: Re-snap Window is 61× Too Narrow

**File**: `ParametricExportComputer.ts`, line 981  
**Code**:
```typescript
const RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES; // ±2 sample widths
```

With `ROW_PROBE_SAMPLES = 8192`, this gives a window of ±0.000244 U.

The ridge diagnostic (line 2088) uses `RIDGE_DIAG_HW = 0.015` — a **61× wider** window. The diagnostic FINDS the true extremum because its window is wide enough. The re-snap MISSES it because its window is too narrow.

**Why ±0.000244 U is insufficient**: The re-snap was designed to refine detection sub-sample error (±0.00006 U). But the actual chain-vertex error has TWO components:
1. **Detection sub-sample error**: ±0.00006 U — correctly handled by ±0.000244 window ✓
2. **Chain-linking position variance**: up to 0.007886 U (maxConsecDelta) — 32× WIDER than the re-snap window ✗

The chain linker matches features across rows using a DP non-crossing matcher (ChainLinker.ts L719–L900). When two candidate features at adjacent rows are close in U, the linker may pick either one. The "correct" feature for a given chain may differ from the detected feature by up to several sample widths. The re-snap at ±2 samples cannot correct this.

**Proof**: primary vertices (re-snapped at Step 3.5) average 0.2230mm error. Interpolated vertices (re-snapped at Phase 2 with an *adaptive* window) average 0.2278mm. They're equal within noise. **Re-snap doesn't help because the window is too narrow to reach the true extremum.**

### Root Cause 2: Per-Row Independent Detection Creates Incoherent Chains

**File**: `FeatureDetection.ts`, `detectRowFeaturesV16()` (line 200+)

Each row detects features INDEPENDENTLY using gradient sign changes (Strategy 1, line 258) and curvature shoulders (Strategy 2, line 354). The detection at each row produces a U position with ~±0.00006 U precision relative to the 8192-sample data at that row's T value.

But the true mathematical ridge is a CONTINUOUS curve in (U, T) space. Its U position varies smoothly with T. The per-row detection introduces row-to-row jitter because:

1. **Discrete sampling**: 8192 samples give a U grid with 0.000122 spacing. The true extremum falls between samples. Parabolic refinement helps but is a local approximation.
2. **Feature shape varies with T**: The radius profile changes shape row to row (curvature, asymmetry). The parabolic fit gives slightly different sub-sample offsets at different rows, creating ±0.00003 U jitter — which becomes 0.01mm waviness at 300mm circumference.
3. **Degenerate parabolic fits**: For broad, flat peaks (prominence near the 0.005mm threshold), the parabolic curvature denominator `L - 2*C + R` approaches zero. The sub-sample offset becomes numerically unstable. At float32 precision with r ≈ 50mm, the radii `L`, `C`, `R` differ by less than the float32 epsilon (~0.006mm). The parabolic fit gives essentially random sub-sample offsets for these features.

The chain linker then connects these noisy detections across rows. Even with the DP non-crossing algorithm, the chain inherits the per-row jitter because it must pass through each row's detected position.

### Root Cause 3: Batch2Remap Merges Chain Vertices to Grid Columns

**File**: `OuterWallTessellator.ts`, lines 864–882

When a chain vertex U is within `MERGE_THRESHOLD = 1e-4` of a grid column U, the chain vertex is REPLACED by the grid vertex in all mesh edges:

```typescript
if (col >= 0 && col < numU && Math.abs(cv.u - unionU[col]) <= MERGE_THRESHOLD) {
    batch2Remap.set(cv.vertexIdx, row * numU + col);
}
```

The grid vertex has U = `unionU[col]` (a round grid position), NOT the chain's re-snapped U. The chain edge now passes through a vertex that's up to 1e-4 U (≈0.03mm) from the true ridge.

This affects approximately `batch2Remap.size` chain vertices per export. While each individual error is small (≤0.03mm), the batch2Remap'd vertices DON'T get Phase 2 re-snap (line 1823: `!batch2Remap.has(cv.vertexIdx)` filter). The merged grid vertex retains its grid U forever.

**Impact**: Small per-vertex (≤0.03mm) but systematic — contributes to the average.

### Counter-Productive Fix: R48 Fan Midpoint Insertion

**File**: `ParametricExportComputer.ts`, lines ~1670–1780

The R48 fan midpoint insertion:
1. Finds fan diagonal edges with 3D aspect ratio > 3.0
2. Splits them by inserting a midpoint at the 3D average position
3. The midpoint's T value is `(t0 + t1) / 2` — i.e., BETWEEN grid rows

**Measured impact**:
```
Pre-R48:  violations(>4:1) = 19,385/50,285 (38.6%), rowSpan rejects = 0
Post-R48: violations(>4:1) = 27,023/57,474 (47.0%), rowSpan rejects = 38,980
```

**Why it fails**: The CSO's `rowSpan` guard (ChainStripOptimizer.ts) is designed around a strict row-band topology where every vertex sits on a grid row. Fan midpoints sit BETWEEN rows, so:
1. Any edge flip involving a fan midpoint triggers the rowSpan guard (rowSpan > 0 for mid-row T values)
2. The guard REJECTS these flips (38,980 rejected)
3. Without CSO quality improvement, the midpoints ADD triangles (more tris, same aspect ratio) without FIXING slivers
4. Net result: 8.4% MORE sliver violations, not fewer

The midpoint positions are also NOT GPU-evaluated — they use `(p0 + p1) / 2` in 3D, which doesn't lie on the parametric surface. This was a known compromise (R48 E1 discussion), but combined with the CSO rejection, it provides no benefit.

## Proposals

### Proposal 1: Adaptive Wide Re-Snap (Conservative) ⭐ RECOMMENDED FIRST

**Idea**: Widen the Step 3.5 re-snap window adaptively based on inter-feature spacing.

**Mechanism**:
For each chain point, compute the nearest same-kind feature distance from `allRowTypedFeatures`. Set the re-snap halfwidth to:
```
hw = min(nearestSameKind / 3.0, MAX_RESNAP_HW)
```
where `MAX_RESNAP_HW = 0.005` (conservative, 3× narrower than the diagnostic window).

If no same-kind neighbor exists within 0.1 U, fall back to 0.005 U.

This ensures the window:
- Never reaches a neighboring same-kind feature (1/3 of spacing)
- Is ≥20× wider than current (0.005 vs 0.000244)
- Can correct chain-linking errors of ±0.005 U (1.5mm at 300mm circumference)

**Mathematical basis**: The superformula produces extrema at angular positions θ_k ≈ 4πk/m. For m=10, spacing is 0.1 U. For m=34, spacing is 0.029 U. A window of 1/3 × 0.029 ≈ 0.01 U is safe even for the densest styles.

**Files affected**:
- `ParametricExportComputer.ts` lines 980–1090 (Step 3.5 GPU re-snap)

**Trade-offs**:
- (+) Simple change, minimal risk
- (+) Uses existing GPU re-snap infrastructure (just wider window)
- (+) Expected to reduce average ridge distance from ~0.22mm to ~0.05mm
- (-) Does not fix chain-linking coherence (still per-row independent)
- (-) More GPU probes per chain point (wider window × same candidate count → need more candidates)

**Assumptions** (for Verifier to attack):
1. The true ridge extremum is within ±0.005 U of the detected feature for >95% of chain points
2. 1/3 of inter-feature spacing is sufficient margin to avoid cross-feature snapping
3. Computing per-point inter-feature spacing adds negligible time (<10ms)
4. 64 candidates (up from 32) in a 20× wider window maintain parabolic refinement accuracy

### Proposal 2: Chain-Coherent DP Re-Snap (Moderate)

**Idea**: After individual re-snap, run a second pass that finds globally optimal U positions along each chain by penalizing row-to-row U jumps.

**Mechanism**:
For each chain of length N:
1. At each chain point, evaluate radius at K candidates within ±hw (from Proposal 1)
2. Score each candidate on two criteria:
   - **Extremum quality** Q(k): `|bestR - candidateR[k]| / localProminence` (0 = at extremum, 1 = at valley for a peak chain)
   - **Coherence penalty** P(k, k_prev): `|u_k - u_{k_prev}| / expectedDrift` (0 = same as previous, 1 = maximum expected drift)
3. Find the global minimum of `Σ_i [α × Q_i + (1-α) × P_i]` via Viterbi-style DP along the chain
4. α = 0.7 (prioritize ridge accuracy over smoothness)

**Mathematical basis**: This is a standard sequence labeling problem (like HMM decoding). The DP is O(N × K²) per chain. With N ≈ 260 rows and K = 64 candidates, cost = 260 × 64² ≈ 1M operations per chain × 13 chains = 13M total — negligible.

**Files affected**:
- `ParametricExportComputer.ts` (new Step 3.55 after Step 3.5)
- Potentially new function in `ChainLinker.ts`

**Trade-offs**:
- (+) Fixes BOTH the narrow window and the chain-coherence problem
- (+) The DP naturally handles feature drift (non-vertical chains)
- (+) Can completely replace Whittaker-Henderson smoothing (which is currently disabled for meshChains anyway)
- (-) More complex implementation
- (-) Requires careful tuning of α and expectedDrift
- (-) GPU probe count: 13 chains × 260 rows × 64 candidates = 216K probes (currently: 6549 points × 32 = 210K — similar)

**Assumptions** (for Verifier to attack):
1. K=64 candidates is sufficient density in a 0.005 U window (step = 0.000156 U ≈ 0.05mm)
2. α=0.7 correctly balances ridge accuracy vs smoothness
3. The coherence penalty doesn't pull chain vertices off-ridge when the feature genuinely makes a sharp U turn (m-transition zones)
4. The DP can handle seam-crossing chains correctly (circular distance wrapping)

### Proposal 3: Differential Feature Tracking (Radical)

**Idea**: Replace independent per-row detection + chain linking with continuous feature tracking from anchor points.

**Mechanism**:
1. Use current Step 2 detection at a few "anchor" rows (e.g., every 10th row) → high-confidence feature positions
2. For each anchor feature, track it row-by-row in both directions (upward and downward in T):
   a. Start with the anchor U position as initial guess
   b. At the next row, evaluate the parametric surface at 16 candidates in ±0.001 U around the initial guess
   c. Find the radius extremum (with kind matching: peak stays peak)
   d. Use this as the initial guess for the next row
3. The chain is built directly from the tracking — no separate chain-linking step needed

**Why this is architecturally better**:
- Per-row detection finds features at 8192 uniform samples — the feature position has ±0.00006 U quantization noise
- Tracking starts from the PREVIOUS row's exact position — no quantization, just feature drift
- The ±0.001 U tracking window is narrow enough to never cross to a neighboring feature, but wide enough to follow natural feature drift
- Eliminates the entire chain linking step (no DP matching, no zigzag repair, no miss-count gaps)

**Mathematical basis**: This is essentially Newton's method along the ridge curve in (U, T) space. The feature U evolves as dU/dT = -(∂²r/∂U∂T) / (∂²r/∂U²) near the extremum. For smooth parametric surfaces, this drift is bounded and smooth. Tracking with a 0.001 U window at T-spacing of ~0.004 easily captures the drift.

**Files affected**:
- `FeatureDetection.ts` (new `trackFeatureFromAnchor()` function)
- `ParametricExportComputer.ts` (replace Steps 2-3.5 with tracking approach)
- `ChainLinker.ts` (chain linking becomes unnecessary for tracked features)

**Trade-offs**:
- (+) Eliminates root causes 1 AND 2 entirely
- (+) Chain positions are as accurate as the GPU evaluation allows (~0.001mm)
- (+) No chain smoothing needed (tracking is inherently smooth)
- (+) Simpler pipeline (remove chain linking, zigzag repair, re-snap)
- (-) Major architectural change — high implementation risk
- (-) Anchor selection is non-trivial (which rows? how many?)
- (-) Feature births/deaths (where features appear/disappear) need special handling
- (-) Tracking can fail at sharp cusps where the feature moves >0.001 U per row
- (-) Spiral styles have features that move 0.02+ U per row — window must be adaptive

**Assumptions** (for Verifier to attack):
1. Feature drift between adjacent rows is <0.001 U for >95% of styles and rows
2. Anchor rows every 10 rows provide sufficient initialization points
3. Feature births/deaths can be detected by prominence dropping below threshold during tracking
4. 16 GPU candidates per row per chain is sufficient resolution
5. The approach works for spiral features (constant-velocity drift) despite the narrow window

### Proposal 4: REVERT R48 Fan Midpoint Insertion (Immediate)

**Idea**: Remove the R48 fan midpoint insertion code entirely.

**Mechanism**: Remove the block at PEC lines ~1670-1780 (the `FAN_ASPECT_THRESHOLD` / fan midpoint code).

**Evidence**:
| Metric | Pre-R48 | Post-R48 | Change |
|--------|---------|----------|--------|
| Sliver violations (>4:1) | 19,385/50,285 (38.6%) | 27,023/57,474 (47.0%) | +8.4% ❌ |
| CSO rowSpan rejects | 0 | 38,980 | +38,980 ❌ |
| New triangles | 0 | ~7,189 | Wasted ❌ |

The insertion was meant to reduce slivers by splitting fan diagonal edges. Instead:
1. Mid-row T values trigger CSO rowSpan guard → 38,980 beneficial flips blocked
2. Non-GPU-evaluated midpoints (3D average, not on-surface) add geometric error
3. More triangles but same or worse quality

**Files affected**:
- `ParametricExportComputer.ts` lines ~1670-1780

**Trade-offs**:
- (+) Immediate improvement: from 47.0% to 38.6% sliver recovery
- (+) Unblocks 38,980 CSO quality flips
- (+) Fewer triangles (less memory, smaller STL)
- (-) Fan diagonal slivers are still present (38.6%)
- (-) Loses the R48 ridge-distance diagnostic (preserve diagnostic, remove insertion)

**Assumptions** (for Verifier to attack):
1. The R48 fan midpoint insertion is the sole cause of the 47% → 38.6% sliver increase
2. Reverting R48 doesn't break any other pipeline step that depends on post-R48 vertex indices

### Proposal 5: Batch2Remap Ridge Correction (Conservative)

**Idea**: After batch2Remap merging, overwrite the grid vertex UV with the chain's re-snapped UV.

**Mechanism**: In OWT, after batch2Remap is computed (line 868-882), for each merged (chainVertexIdx → gridVertexIdx) pair:
```typescript
vertices[gridVertexIdx * 3] = chainVertices[chainVertexIdx - gridVertexCount].u;
```

This places the grid vertex at the chain's true feature U instead of the rounded grid column U.

**Files affected**:
- `OuterWallTessellator.ts` lines 898-905 (after `remappedGridChainIds` construction)

**Trade-offs**:
- (+) Simple 5-line change
- (+) Eliminates up to 0.03mm per-vertex error for batch2Remap'd vertices
- (-) Violates the grid regularity that other code expects (grid vertices should be at `unionU[col]`)
- (-) Small marginal impact (batch2Remap.size is typically small, and max error is 0.03mm)
- (-) May cause issues in cell-local tessellation that assumes grid vertex U = unionU[col]

**Assumptions** (for Verifier to attack):
1. Moving grid vertex U by ≤1e-4 doesn't break cell-local quad splitting
2. The cell topology code doesn't depend on grid vertex U being exactly unionU[col]
3. batch2Remap.size is small enough that the impact is marginal

## Recommended Approach

**Priority order**:

1. **P4 (Revert R48 fan midpoints)** — Immediate, zero-risk regression fix. Drop sliver rate from 47% back to 38.6% and unblock 38,980 CSO flips.

2. **P1 (Adaptive Wide Re-Snap)** — Highest ROI with minimal risk. Expected to reduce average ridge distance from ~0.22mm to ~0.05mm by using a 20× wider window bounded by inter-feature spacing. Single code change in 110 lines.

3. **P2 (Chain-Coherent DP Re-Snap)** — If P1 doesn't reduce waviness sufficiently. The DP pass adds coherence that P1 lacks. Can be implemented as a post-P1 refinement.

4. **P5 (Batch2Remap correction)** — Low risk, low impact. Worth doing for completeness.

5. **P3 (Differential Tracking)** — Defer unless P1+P2 leave unacceptable waviness. This is the "nuclear option" that replaces the entire detection + linking pipeline. High reward but high risk.

## R48 Diagnostic: KEEP but Separate from Insertion

The R48 ridge-distance diagnostic (PEC lines 2085-2185) is the **best instrument we have** for measuring chain accuracy. It MUST be preserved even when reverting the fan midpoint insertion. The diagnostic and the insertion are independent code blocks — revert the insertion, keep the diagnostic.

## Open Questions

1. **What fraction of the 0.22mm average is from flat-peak numerical instability vs chain-linking error?** A diagnostic that logs the local prominence at each chain vertex would answer this. If most of the error comes from low-prominence features, even a wider re-snap won't help — the parabolic fit is degenerate.

2. **Does the diagnostic accidentally cross to neighboring features?** For styles with m≥34, inter-feature spacing is ~0.029 U and the diagnostic window is ±0.015. The diagnostic could be measuring the WRONG extremum for ~10% of vertices on high-m styles. A diagnostic guard that checks feature kind AND prominence consistency would catch this.

3. **What is the re-snap "success rate" by chain?** Some chains may be perfectly accurate while others are terrible. Per-chain breakdown would focus optimization effort.

4. **Is the Phase 2 re-snap window correctly sized?** Phase 2 uses `hw = max(BASE, min(0.01, gapSize² × 0.001))`. For gap=2, hw = max(0.000244, min(0.01, 0.004)) = 0.004 U — much wider than Step 3.5's 0.000244. This might explain why interpolated vertices have EQUAL accuracy to primary despite starting from linear interpolation (their wider window compensates).
