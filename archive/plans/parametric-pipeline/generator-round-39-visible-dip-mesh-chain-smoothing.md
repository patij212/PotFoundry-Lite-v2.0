# Generator Round 39 — Visible Dip Fix After R38
Date: 2026-03-08

## Problem Statement

R38 materially improved local support quality around feature crossings, but the user still sees visible dips in feature edges. The latest evidence shifts the center of gravity away from corridor topology and toward the chain path itself: cross-row tris are down to 6, non-manifold edges are down to 3, `>20` aspect triangles are down to 103, and chain-strip max aspect is 144.7 with 34.8% violations. That is a large structural improvement, yet the rendered/exported ridge still sags visually.

The strongest code clue is in Step 3.6 of `ParametricExportComputer.ts`: the pipeline computes a materially smoother chain set, logs the quality improvement, then explicitly throws that geometry away for mesh construction.

## Root Cause Analysis

1. `ParametricExportComputer.ts` applies Whittaker smoothing to every chain at [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1094), and the diagnostic immediately afterwards reports a large jaggedness reduction (`post-resnap maxConsecDelta=0.008727` to `post-smooth 0.003069` in the evidence the user supplied).

2. Despite that, the mesh path is still built from `preSmoothChains` via [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1108). The later tessellation/export path continues to consume `meshChains` as “pre-smooth, at true peak positions” at [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1494).

3. That means the mesh is still encoding the rough post-resnap / post-repair polyline, not the improved trajectory. Additional corridor work can only support the constraint path it is given; it cannot remove a dip that is already present in the chain vertices themselves.

4. Option C alone is not the best next move. `repairChainsZigzags()` at [src/renderers/webgpu/parametric/ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L1009) is a sparse, local second-difference repair with `maxAccel = 0.003` at [src/renderers/webgpu/parametric/ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L1013). It is designed to fix discrete chain swaps, not the broader low-amplitude waviness that the WH pass is already proving exists. If zigzag repair were the dominant remaining problem, the post-repair path would already be close to the post-smooth path. It is not.

5. Option A is too blunt. Full WH output from `whittakerSmooth()` at [src/renderers/webgpu/parametric/ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L415) can attenuate genuine curvature and displace the ridge off the measured peak set, especially because the current WH operator assumes uniform row spacing and uses a global `WH_LAMBDA = 50` at [src/renderers/webgpu/parametric/ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L324). The current v27 comment exists for a real reason.

## Proposals

### Proposal 1: Use Smoothed Chains Directly for Mesh (Option A, Conservative)
**Idea**: Replace `meshChains = filterLowConfidenceChains(preSmoothChains)` with the already-smoothed chain set.

**Why it helps**: It directly removes the inconsistency between the quality metric and the geometry input.

**Why I do not recommend it**: It gives away peak fidelity globally. The current WH pass is useful evidence, but it is not yet a safe production geometry path because it has no explicit displacement budget relative to the measured ridge.

### Proposal 2: Bounded / Blended Mesh Smoothing (Option B, Recommended)
**Idea**: Keep the raw re-snapped chain as the measurement anchor, keep WH output as the low-noise predictor, and construct a third chain set for mesh use only:

- Compute `smoothedChains = whittakerSmooth(rawChains)` as today.
- Build `meshChains` by blending each point from raw toward smoothed only when local curvature / acceleration indicates artifact-level roughness.
- Clamp each point's displacement by an explicit per-point budget so the mesh chain cannot drift far from the measured feature.

**Suggested mechanism**:

- Add a new helper in `ChainLinker.ts`, e.g. `buildBoundedMeshChains(rawChains, smoothedChains, allRowFeatures, allRowTypedFeatures?)`.
- For each interior point, compute a local roughness trigger from the existing second-difference measure already used by `repairChainsZigzags()`.
- If the point is already smooth, keep the raw value.
- If the point is rough, move it toward the WH predictor, but cap the move by the minimum of:
  - a fixed absolute cap, on the order of the probe jitter envelope times a small multiplier,
  - a fraction of local same-kind feature spacing, so nearby ridges cannot cross,
  - a fraction of the raw-to-predicted delta, so the shift is a blend, not a snap.
- Re-wrap seam-safe exactly as the current chain utilities do.

**Mathematical basis**: This treats WH as a low-pass estimate of the latent ridge trajectory, but constrains the projection back toward that estimate with an $L_\infty$ trust region around the measured chain. In other words: borrow the smoothness, not the full displacement.

**Why this is the right next step**:

- It attacks the exact inconsistency that the current logs reveal.
- It removes the residual artifact at the constraint source instead of trying to support a noisy polyline with ever more local mesh scaffolding.
- It preserves the reason v27 reverted to pre-smooth mesh chains: staying near the actual measured peaks.

### Proposal 3: Improve Zigzag Repair / Linking (Option C, Secondary)
**Idea**: tighten or generalize `repairChainsZigzags()` and possibly adjust linker penalties.

**Why it is secondary**: this is still worth revisiting later, but the current evidence says the remaining defect is broader than a few bad assignments. The gap between post-repair and post-smooth diagnostics means the existing chain still contains distributed high-frequency wobble even after repair. Linker tuning is now the follow-up lever, not the next lever.

## Recommended Approach

Recommend **Option B: bounded / blended smoothing for mesh chains**.

This is the highest-value next fix because it targets the now-dominant failure mode: the mesh is constructed from a chain path that the pipeline itself already knows is noisier than the available smoothed estimate. More corridor work is now downstream optimization. It can improve triangle support around the path, but it cannot straighten the path itself. The latest quality metrics already show that corridor support has largely done its job; the visible artifact surviving that improvement is the signal that the remaining error is in the constraint geometry.

## Exact Files / Functions To Change

1. [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1076)
Change Step 3.6 so it produces three explicit chain sets:
- `rawChains` / `preSmoothChains` for debug truth and displacement reference
- `smoothedChains` for diagnostics / predictor
- `meshChains` from the new bounded-blend helper, replacing the current [src/renderers/webgpu/ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1108)

2. [src/renderers/webgpu/parametric/ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L415)
Keep `whittakerSmooth()` as the predictor, but add a new exported helper for bounded mesh-chain construction near the smoothing/filter section.

3. [src/renderers/webgpu/parametric/ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L1009)
Reuse the same local acceleration signal from `repairChainsZigzags()` as the gate for when smoothing should engage. Do not start by retuning `maxAccel`; use it as a detector first.

4. [src/renderers/webgpu/parametric/ChainLinker.test.ts](../../src/renderers/webgpu/parametric/ChainLinker.test.ts#L516)
Add tests that prove:
- linear and constant chains remain unchanged,
- rough chains move toward the WH predictor,
- per-point displacement is capped,
- seam-safe chains remain seam-safe,
- nearby same-kind features do not cross under the displacement clamp.

## Why This Beats More Corridor Work

R38 already proved the corridor hypothesis had substantial merit: the mesh-quality counters improved sharply. But the user-visible dip survived. That means the next marginal hour spent on corridor enrichment is likely attacking a second-order effect. The first-order effect left in the evidence is simpler: the mesh path still ignores the pass that removes most of the residual chain roughness.

Put differently: corridor work improves the triangles adjacent to the ridge; bounded smoothing improves the ridge polyline that every downstream triangle is forced to respect. The latter is now the higher-leverage intervention.

## Key Risks

1. **Peak drift**: if the displacement cap is too loose, the mesh can visually smooth by moving off the true measured crest.

2. **Curvature erasure**: genuine high-curvature feature motion could be mistaken for noise. This is why the move must be gated and bounded, not global.

3. **Non-uniform row spacing mismatch**: the current WH operator still assumes uniform row spacing. The bounded blend contains that risk, but does not eliminate it.

4. **Debug / mesh divergence**: after this change, debug lines and exported mesh should deliberately represent different chain sets unless the debug overlay is updated to show both raw and mesh chains.

5. **Threshold creep**: if the team responds to partial improvement by only retuning `WH_LAMBDA`, `MAX_CHAIN_ROUGHNESS`, or zigzag thresholds, the system could become harder to reason about than the current explicit bounded-blend design.