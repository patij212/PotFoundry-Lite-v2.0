# Generator Round 50 — Upstream Chain Quality: Why Are Feature Edges Bad BEFORE Re-snap?

Date: 2026-03-09

## Problem Statement

After 5 rounds of downstream fixes (R44–R49), we keep patching chain quality with re-snap, smoothing, and topology fixes. The chain quality diagnostic reports `maxConsecDelta = 0.007886 U` — adjacent chain points differing by up to ~0.008 U. At 300mm circumference, that's **2.4mm of per-row wiggle**. This was framed as the root cause of visual "waviness" users complain about.

**Central question**: Where is the 130× amplification from detection precision (±0.00006 U) to the observed 0.008 U consecutive delta?

## Root Cause Analysis

### Finding 1: The `maxConsecDelta` Diagnostic Is MISLEADING

**This is the single most critical finding in this round.**

The diagnostic `maxConsecDelta` measures `max |u_unwrapped[i] - u_unwrapped[i-1]|` — the maximum absolute first difference of the unwrapped chain U-path. This conflates two fundamentally different phenomena:

1. **True mathematical feature drift** — the feature genuinely moves in U between rows
2. **Detection/linking noise** — the feature hasn't moved but the measurement jumped

For a chain tracking a feature that drifts uniformly at rate `v` per row:
- `maxConsecDelta ≈ |v|` even if the chain is **perfectly smooth** (zero noise)
- The diagnostic reports this as "bad quality" when in fact the chain is tracking perfectly

The RIGHT metric for chain *quality* (freedom from jitter) is the **second derivative** — the acceleration, not the velocity. This already exists as `chainRoughness()` (average |u''|) in [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts#L126), but the pipeline diagnostic at [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L913) only prints `maxConsecDelta`, not roughness.

### Finding 2: The 0.008 U Is Primarily TRUE Feature Drift, Not Noise

I traced the mathematics end-to-end from the WGSL shader.

#### Source 1: Twist (DOMINANT for twisted styles)

From [styles.wgsl](../src/assets/shaders/styles.wgsl#L31):
```wgsl
fn twist_theta(theta: f32, t: f32) -> f32 {
  let turns = getf(4u);   // spinTurns
  let curve = max(getf(6u), 1e-4);
  return theta + TAU * turns * pow(t, curve) + phase;
}
```

The superformula evaluates at `θ_adj = θ + TAU × turns × t^curve + phase`. Features at fixed positions in θ_adj-space drift in θ-space (and thus U-space) by:

$$\Delta u_{\text{twist}} = \text{turns} \times \frac{\Delta t}{\text{row}}$$

For `spinTurns = 2`, `numRows ≈ 264`:

$$\Delta u = \frac{2}{264} = 0.00758 \text{ U/row}$$

**This nearly exactly matches the observed `maxConsecDelta = 0.007886`.**

For `spinTurns = 0`: drift from twist = 0.

#### Source 2: m-Morphing (secondary)

From [styles.wgsl](../src/assets/shaders/styles.wgsl#L81):
```wgsl
let m = mix(m_base, m_top, pow(t, m_curve));
```

Features at the k-th period are located at `u_k ≈ k/m(t)` (ignoring seam offset). As m varies:

$$\frac{du_k}{dt} = -\frac{k}{m^2} \cdot \frac{dm}{dt}$$

For `SuperformulaBlossom` defaults (`m_base=6`, `m_top=10`, `m_curve=1.2`):
- At t=0.5: `m = mix(6, 10, 0.435) = 7.74`
- `dm/dt = (10-6) × 1.2 × 0.5^0.2 = 4.17`
- For k=1: `du/dt = -1 × 4.17 / 7.74² ≈ -0.070` per unit t
- Per row (Δt ≈ 1/264): **Δu ≈ 0.000265 U/row**
- For k=5: **Δu ≈ 0.00133 U/row**

This is 0.3–1.3% per period — detectable but small compared to twist.

#### Source 3: n-Parameter Interpolation (minor)

From [styles.wgsl](../src/assets/shaders/styles.wgsl#L82-L84):
```wgsl
let n1 = mix(n1_base, n1_top, t);
let n2 = mix(n2_base, n2_top, t);
let n3 = mix(n3_base, n3_top, t);
```

For the **symmetric case** (a=b, n2_base=n3_base, n2_top=n3_top): peak positions are at `cos(mθ/4) = ±1`, which is **independent of n-parameters**. Zero drift.

For **asymmetric** styles (a≠b or n2≠n3): peak positions depend on the n2/n3 ratio. Default `SuperformulaBlossom` has `n2_base=0.8, n2_top=1.4, n3_base=0.8, n3_top=0.8`, so n2≠n3 near the rim. This creates position-dependent drift of order:

$$\Delta u_{\text{asym}} \approx \frac{1}{m} \cdot \frac{d\alpha}{dt} \cdot f(\text{asymmetry})$$

Estimated at **~0.0001–0.0003 U/row** for typical parameters. Negligible.

#### Source 4: Seam Offset (zero after offset)

From [styles.wgsl](../src/assets/shaders/styles.wgsl#L87):
```wgsl
let seam_offset = (TAU / 2.0) / max(m, 1.0);
let theta_adj = theta + seam_offset;
```

As m changes with t, `seam_offset` changes → features shift. But this is already captured in Source 2 (m-morphing).

### Finding 3: Detection Precision Is NOT the Bottleneck

The detection pipeline in [FeatureDetection.ts detectRowFeaturesV16()](../src/renderers/webgpu/parametric/FeatureDetection.ts#L208) uses:

1. **8192 samples/row** — sample spacing = 1/8192 = 0.000122 U
2. **Gradient sign change** — identifies true extrema with zero false positives
3. **3-point parabolic refinement** — sub-sample precision:
   ```typescript
   delta = 0.5 * (L - R) / denom;  // line ~259
   delta = Math.max(-0.5, Math.min(0.5, delta));
   ```
   Precision: ±0.5 sample → **±0.00006 U** (line [259](../src/renderers/webgpu/parametric/FeatureDetection.ts#L259))
4. **Curvature verification** — rejects candidates where parabolic curvature disagrees with extremum type
5. **Deduplication** — within 1.5/8192 ≈ **0.000183 U**

The total detection noise budget is **≤ 0.0002 U per row**. This is 40× smaller than the observed 0.008 U.

**Conclusion**: Detection is NOT amplifying error by 130×. The 0.008 U is real feature drift, not detection noise.

### Finding 4: Chain Linking Quality Decomposition

The chain linker in [ChainLinker.ts linkFeatureChainsCore()](../src/renderers/webgpu/parametric/ChainLinker.ts#L719) introduces three types of error:

#### 4a. Mis-assignment (wrong feature matched)

The linker uses `CHAIN_LINK_RADIUS = 0.02` ([line 27](../src/renderers/webgpu/parametric/ChainLinker.ts#L27)). For safety, the distance to the wrong feature must satisfy:

$$\text{spacing} - \text{drift} > \text{CHAIN\_LINK\_RADIUS}$$

| m | Feature spacing | Drift (twist=2) | Remaining margin | Safe? |
|---|----------------|-----------------|-----------------|-------|
| 6 | 0.167 | 0.008 | 0.159 >> 0.02 | ✅ Very safe |
| 10 | 0.100 | 0.008 | 0.092 >> 0.02 | ✅ Safe |
| 18 | 0.056 | 0.008 | 0.048 > 0.02 | ⚠️ Marginal |
| 34 | 0.029 | 0.008 | 0.021 ≈ 0.02 | ❌ DANGEROUS |

For typical `SuperformulaBlossom` (m=6–10), mis-assignment is **not a significant source of error**.

For high-m styles, mis-assignment becomes a real risk. The non-crossing DP ([line 822](../src/renderers/webgpu/parametric/ChainLinker.ts#L822)) prevents crossings but cannot prevent assignment to the wrong adjacent feature of the same kind.

#### 4b. Feature count instability

If row j detects 10 peaks and row j+1 detects 11 (a feature appears due to prominence gate barely being crossed), the DP must map 10→11. The extra feature starts a new chain. This is handled correctly — no error amplification.

The more problematic case: row j has 10 peaks, row j+1 has 9 (one feature drops below prominence threshold). The DP maps 10→9, one chain increments `missCount`. If the feature reappears in row j+2, the chain reconnects via momentum prediction. The U-delta across the gap is 2× the per-row drift — still correct behavior.

**Estimated count instability** for `SuperformulaBlossom`:
- m transitions happen over ~10-20 rows at the base (where `pow(t, m_curve)` is steep)
- In this zone, `m` can change by ~0.2 per row → features genuinely appear/disappear
- This produces chain breaks (handled by missCount), not U-delta errors

#### 4c. Momentum prediction error

After matching, the linker predicts the next U via median velocity ([line 872](../src/renderers/webgpu/parametric/ChainLinker.ts#L872)):
```typescript
const uVel = deltas[Math.floor(deltas.length / 2)];
ac.predictedU = ((last.u + uVel) % 1 + 1) % 1;
```

Momentum is used for search window centering, not for position assignment. The chain point gets the ACTUAL detected feature position, not the predicted position:
```typescript
ac.chain.points.push({ u: rowFeats[fi], row: j });  // line 937
```

So momentum prediction errors affect WHICH feature is matched (via cost function) but NOT the stored position. This is correct — matching error falls under 4a.

### Finding 5: The preSmoothChains vs smoothedChains Contradiction

From [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1232):
```typescript
const meshChains = filterLowConfidenceChains(preSmoothChains);
```

The mesh uses **unsmoothed** chains (raw GPU re-snapped positions). The smoothed chains are only used for debug visualization and diagnostics. This is the RIGHT choice for accuracy but it means the mesh edges contain the full detection jitter (~±0.0002 U) which at 300mm = ±0.06mm.

This is sub-perceptible. The ±0.06mm per-row jitter is NOT the visual waviness problem.

## Quantitative Error Budget (SuperformulaBlossom, m=10, spinTurns=0)

| Source | Magnitude (U/row) | Physical (mm) | Nature |
|--------|-------------------|---------------|--------|
| Detection jitter (parabolic) | ±0.00006 | ±0.018 | Random noise |
| Detection strategy switching | ±0.00018 | ±0.054 | Random noise |
| m-morphing drift (k=1) | 0.00027 | 0.08 | Smooth systematic |
| m-morphing drift (k=5) | 0.00133 | 0.40 | Smooth systematic |
| n-asymmetry drift | ~0.0002 | ~0.06 | Smooth systematic |
| Chain linking jitter | ~0 | ~0 | (Correct matching at m=10) |
| **Total noise (RSS)** | **~0.0002** | **~0.06** | |
| **Total systematic drift** | **~0.001** | **~0.3** | |
| **maxConsecDelta observed** | **0.0079** | **2.4** | Dominated by drift or twist |

For **spinTurns=0, m=10**: maxConsecDelta should be ≈ 0.001 U. If the observed value is 0.008 U, then **either the test used `spinTurns ≈ 2` or there's a different style/parameter set**.

For **spinTurns=2, m=10**: maxConsecDelta ≈ 0.008 U, which is correct behavior.

## Proposals

### Proposal 1: Fix the Diagnostic, Not the Chain (Conservative)

**Idea**: The `maxConsecDelta` diagnostic conflates drift and jitter. Replace it with a metric that measures ONLY the noise component by subtracting the local linear trend.

**Mechanism**: Compute `maxConsecDelta_detrended`:
```
For each point i in chain:
  predicted[i] = (u[i-1] + u[i+1]) / 2   (local linear prediction)
  jitter[i] = |u[i] - predicted[i]|        (deviation from smooth path)
maxJitter = max(jitter[i])
```

This is exactly what `maxLinearDeviation` (5-point local linear fit deviation) already computes! The diagnostic already prints it but the problem framing focused on `maxConsecDelta`.

**Files affected**: [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L914) — change primary quality threshold from `maxConsecDelta` to `maxLinearDeviation`.

**Trade-offs**: Zero code change to the pipeline. Only changes how we interpret quality.

**Assumptions**:
1. The visual waviness correlates with `maxLinearDeviation`, not `maxConsecDelta`
2. `maxLinearDeviation` is already small (<0.001 U) for typical exports — the chain IS smooth

### Proposal 2: Adaptive CHAIN_LINK_RADIUS Based on Feature Spacing (Moderate)

**Idea**: Instead of fixed `CHAIN_LINK_RADIUS = 0.02`, compute it dynamically as a fraction of the minimum same-kind feature spacing per row.

**Mechanism**:
```
For each row j:
  spacing_j = min distance between same-kind features in row j
linkRadius_j = min(0.02, spacing_j * 0.3)
```

For m=10: `spacing = 0.1, linkRadius = 0.02` (unchanged — safe)
For m=34: `spacing = 0.029, linkRadius = 0.0087` (reduced — prevents mis-assignment)

**Mathematical basis**: If the link radius is < spacing/2, it's impossible to match the wrong adjacent feature, even with maximum drift. The 0.3× factor provides safety margin for drift.

**Files affected**: [ChainLinker.ts linkFeatureChainsCore()](../src/renderers/webgpu/parametric/ChainLinker.ts#L719) — accept per-row spacing array, clamp search radius.

**Trade-offs**:
- Pro: Prevents mis-assignment at high-m
- Pro: No effect on low-m styles (already safe)
- Con: Tighter radius means chains break more easily in transition zones
- Con: Requires per-row spacing computation (trivial cost)

**Assumptions**:
1. Same-kind features don't jump by more than spacing/3 per row (true for smooth parameter interpolation)
2. Break-and-reconnect is preferable to mis-assignment (yes — breaks produce short gaps, mis-assignment produces U jumps)

### Proposal 3: Feature Position Prediction from Analytical Derivatives (Moderate/Radical)

**Idea**: Instead of detecting features independently per row and then linking by proximity, compute the EXPECTED feature position in row j+1 from the analytical derivative of the superformula.

**Mechanism**: For a feature at `u_k` in row j at height t_j, the expected position at t_{j+1} is:

$$u_k(t_{j+1}) \approx u_k(t_j) + \frac{du_k}{dt} \cdot \Delta t$$

where `du_k/dt` can be computed from:
1. **Twist contribution**: `du/dt = -turns × curve × t^(curve-1)` (exact, from shader code)
2. **m-morphing contribution**: `du/dt = -(k/m²) × dm/dt` (exact for symmetric superformula)
3. **n-asymmetry contribution**: numerically estimated from ±1 sample offset in t

The linker would use this prediction INSTEAD of the crude momentum-based velocity estimate to set the search center. This doesn't change detection — it changes the EXPECTED position for matching.

**Mathematical basis**: The superformula is an analytical function with known parameter interpolation curves. The feature position derivative is computable from the same parameters that define the surface.

**Files affected**:
- New: `FeaturePredictor.ts` — computes expected feature shift from style parameters
- Modified: [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts#L872) — use analytical prediction instead of median velocity
- Modified: [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L900) — pass style params to linker

**Trade-offs**:
- Pro: Eliminates momentum lag (current predictor needs 2+ data points to estimate velocity)
- Pro: Correct from the first row (no cold-start problem)
- Pro: Works perfectly even in rapid m-transition zones
- Con: Style-specific — every style needs its own derivative formula
- Con: Some styles (FractalTerra, WaveInterference) don't have closed-form derivatives
- Con: More complex code path

**Assumptions**:
1. The superformula derivative is accurate enough to predict feature positions within ±0.001 U
2. The twist/m-morphing decomposition covers >95% of the drift budget
3. Non-analytical styles can fall back to the current momentum predictor

### Proposal 4: Two-Pass Linking with Backward Refinement (Moderate)

**Idea**: After the forward linking pass, run a BACKWARD pass that re-examines chain assignments. A chain that was assigned to feature A in row j can be re-assigned to feature B if the FULL chain trajectory (not just the last few points) suggests B is the better match.

**Mechanism**:
1. Forward pass (current): link row 0→N, using momentum from past points
2. Fit smooth curve (quadratic or cubic) to each completed chain
3. For each chain point, check if a same-kind feature in that row is closer to the predicted smooth position than the currently assigned feature
4. If so, reassign the point and refit

This is similar to `repairChainsZigzags` ([ChainLinker.ts line 1083](../src/renderers/webgpu/parametric/ChainLinker.ts#L1083)) but uses the FULL smooth fit instead of just the two neighbors. The full-chain context makes better decisions at bifurcation points.

**Files affected**: New function in [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts) — `refineChainAssignments()`

**Trade-offs**:
- Pro: Uses global chain context, not just local neighbors
- Pro: Catches multi-row assignment errors that zigzag repair misses
- Con: Quadratic cost (chains × points × features) — but chain count is small (~20)
- Con: Risks over-smoothing — if the feature genuinely has a kink, the smooth fit will mis-assign

**Assumptions**:
1. True feature trajectories are well-approximated by low-order polynomials (cubics)
2. The number of chain points that benefit from re-assignment is small (<5%)

### Proposal 5: Per-Row Detection Stabilization via Persistence (Radical)

**Idea**: Instead of detecting features independently per row, use the previous row's detections to BIAS the current row's detection toward consistent positions. Features that are "expected" based on the previous row get a lower prominence threshold.

**Mechanism**: Inspired by topological persistence in computational topology:
1. Detect features in row 0 normally
2. For row j+1, compute the expected feature positions from row j (using twist/m prediction)
3. At each expected position, check the actual radius profile:
   - If a gradient sign change exists within ±0.001 U: confirm feature (use detected position)
   - If no sign change but radius curvature is high: flag as "weakening" (retain with lower confidence)
   - If radius is flat: feature has disappeared (close chain)
4. Only genuinely NEW features (gradient sign changes far from any expected position) start new chains

This transforms detection from "per-row independent" to "streaming with persistence" — features are tracked, not re-discovered.

**Mathematical basis**: Persistence theory says that features with long lifetime (detected across many rows) are real, while transient features are noise. By carrying forward the feature set from row to row, we inherently implement persistence.

**Files affected**:
- Major rewrite of [FeatureDetection.ts](../src/renderers/webgpu/parametric/FeatureDetection.ts) — new `StreamingFeatureDetector` class
- Eliminates the need for chain linking entirely — chains are built during detection

**Trade-offs**:
- Pro: Eliminates the detect-then-link paradigm entirely
- Pro: Perfect feature continuity — no linking noise
- Pro: Lower prominence threshold for persistent features → catches subtle features
- Con: ORDER-DEPENDENT — detection quality depends on which row is first
- Con: Feature birth/death requires careful hysteresis to prevent flicker
- Con: Large architectural change — high risk, high reward

**Assumptions**:
1. Features vary smoothly enough that row-to-row prediction is accurate to ±0.001 U
2. Feature birth/death is rare (once per m-transition zone)
3. The streaming approach doesn't miss features that arise mid-object

## Recommended Approach

**Immediate (Round 50)**: Proposal 1 — Fix the diagnostic. Verify that `maxLinearDeviation` is already small for the problematic exports. If it IS small, the chain quality is fine and the "waviness" complaint has a DIFFERENT root cause (mesh topology, not chain position).

**Short-term (Round 51)**: Proposal 2 — Adaptive link radius. Simple, safe, prevents high-m mis-assignment. Low risk, targeted benefit.

**Medium-term**: Proposal 4 — Backward refinement. Uses global chain context to catch the remaining assignment errors that the DP misses. Moderate complexity.

**Investigate but DEFER**: Proposal 3 and 5 are architecturally interesting but overly complex for the measured noise levels. If Proposal 1 confirms that chain positions are already sub-0.001 U accurate (after detrending), then Proposals 3-5 are solving a non-problem.

## Open Questions

1. **What is the `maxLinearDeviation` value for the export that showed `maxConsecDelta = 0.007886`?** The diagnostic prints both. If `maxLinearDeviation < 0.001`, the chains are smooth and the 0.008 U is pure drift → problem is elsewhere.

2. **What `spinTurns` value was used?** If spinTurns ≈ 2, the 0.008 U is the expected twist-induced drift. If spinTurns = 0, something else is dominating.

3. **Is the visual waviness actually coming from chain positions, or from mesh topology?** The R47 findings (37.1% chain-strip triangles with aspect ratio > 4:1) suggest topology is the dominant visual problem, not vertex positions.

4. **Does the `chainRoughness` filter (MAX_CHAIN_ROUGHNESS = 0.008, [ChainLinker.ts line 558](../src/renderers/webgpu/parametric/ChainLinker.ts#L558)) accidentally kill chains with high legitimate drift?** A twisted chain with `maxConsecDelta = 0.008` has roughness ≈ 0 (smooth spiral), so it survives. But the filter threshold is exactly at the observed maxConsecDelta value — coincidence?

5. **For the Verifier**: Challenge my claim that detection jitter is ≤0.0002 U. Is there a case where the 3-point parabolic fit gives worse precision? (Answer: yes — at cusps where the feature is sharp enough that 3 points don't capture the peak. But cusps are exactly where curvature is highest, so detection confidence is also highest. The fit may be biased but it's still sub-sample.)
