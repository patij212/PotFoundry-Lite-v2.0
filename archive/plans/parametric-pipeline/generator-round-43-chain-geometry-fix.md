# Generator Round 43 — Chain Vertex Geometry Fix: Kill the Oscillation at Source

Date: 2026-03-08

## Problem Statement

Three rounds of topology work (R40–R42: diagonal directions, fan quads, j%2 alternation removal) produced zero visual improvement on ridge sawtooth because **the sawtooth is a geometry problem, not a topology problem**. The mesh chain vertices oscillate in U by up to 0.008 per row (~2.5mm in 3D), creating visible teeth at the ridge silhouette regardless of how triangles are split.

The architecture contains a **misleading diagnostic** that hides this: the log reports `Post-smooth quality: maxConsecDelta=0.003069` from the WH-smoothed chains, but the mesh actually uses the barely-blended `meshGuideChains` with ~0.008 oscillation.

## Root Cause Analysis

### The Two-Chain Divergence (ParametricExportComputer.ts lines 1093–1110)

```
Line 1093: preSmoothChains = deep copy of raw chains
Line 1095: smoothedChains = whittakerSmooth(chains)  → maxConsecDelta ≈ 0.003
Line 1096: meshGuideChains = blendTowardSmoothedChain(preSmoothChains, smoothedChains)
                             40% blend, ±0.005 cap → maxConsecDelta ≈ 0.008
Line 1097: chains = smoothedChains  ← diagnostic path
Line 1110: meshChains = filterLowConfidenceChains(meshGuideChains)  ← MESH path
```

The diagnostic at line 1131 measures `chains` (smoothed), but the mesh uses `meshChains` (barely blended). The R42 log confirms:
- `avgShift=0.000192` — the blend moved chains by only 0.19mm on average
- `maxShift=0.005000` — cap was hit, but 0.005 correction on 0.008 oscillation is still insufficient

### Why the Blend Was Designed This Way

The `blendTowardSmoothedChain()` function (ChainLinker.ts line 498) was introduced in R39 to preserve GPS-resnapped peak accuracy. Its constants (line 468–483):
- `MESH_GUIDE_BASE_BLEND_WEIGHT = 0.40` (R42: raised from 0.12)
- `MESH_GUIDE_ADAPTIVE_BLEND_GAIN = 0.60`
- `MESH_GUIDE_ACCEL_FULL_BLEND = 0.002`
- `MESH_GUIDE_MAX_POINT_SHIFT = 0.005` (hard cap)

Even at the R42 tuning (40% base blend + adaptive), the ±0.005 cap means the blend can correct at most ±1.5mm of the ~2.5mm oscillation — and that's only at the most jagged points. At smooth points, only 40% of the delta is applied. The operation is fundamentally under-powered.

### Why Sub-mm Accuracy Doesn't Matter

The blend exists to keep mesh vertices close to "true" GPU-resnapped peak positions. But:
1. **FDM printing tolerance** is ±0.2–0.4mm (layer width 0.4mm)
2. **SLA/resin tolerance** is ±0.05–0.1mm
3. The WH-smoothed chain with maxConsecDelta=0.003 has ~1mm oscillation — already within FDM tolerance
4. At λ=200, oscillation would be ~0.3mm — within even resin tolerance

Preserving sub-millimeter peak accuracy at the cost of 2.5mm visible sawtooth is precisely backwards.

### Downstream Effects of Smoother meshChains

`meshChains` flows to 6 downstream consumers (ParametricExportComputer.ts):
1. **`chainVertexUs`** (line 1138): Column density profile. Smoother chains → slightly less column clustering around oscillation peaks. Net positive.
2. **`insertChainGuidedRows`** (line 1165): Row insertion at diagonal crossings. Smoother chains cross fewer columns → fewer phantom rows. Neutral to positive.
3. **`buildCDTOuterWall`** (line 1335): CDT mesh with chain constraints. Smoother constraint edges → fewer degenerate slivers. Strong positive.
4. **`buildFeatureEdgeGraphFromChainEdges`** (line 1441): Feature edge graph for flip protection. Smoother edges → more consistent protection. Positive.
5. **`chainDirectedFlip`** (line 1513): UV diagonal alignment. Uses `pt.u` to find ridge column via `findColumn()` (MeshOptimizer.ts line 86). Smoother U values → fewer column changes per row → fewer flip oscillations. **This is exactly why R40–R42 topology fixes had no effect** — the noisy U values made `findColumn()` jump between columns even with perfect flip logic.
6. **`featureGraph`** (line 1441): Edge graph for optimizer exclusion. Smoother → more consistent. Positive.

**All 6 consumers benefit from smoother chains. None requires sub-mm peak accuracy.**

## Proposals

### Proposal 1: Use Smoothed Chains for Mesh Construction (Conservative — 1 Line)

**Idea**: Replace `meshGuideChains` with `smoothedChains` as the mesh path input.

**Mechanism**: At ParametricExportComputer.ts line 1110, change:
```typescript
const meshChains = filterLowConfidenceChains(meshGuideChains);
```
to:
```typescript
const meshChains = filterLowConfidenceChains(smoothedChains);
```

**Mathematical basis**: This gives the mesh WH-smoothed chains (λ=50) with maxConsecDelta≈0.003 instead of barely-blended chains with maxConsecDelta≈0.008. A 2.7× reduction in oscillation amplitude.

**Files affected**: ParametricExportComputer.ts (1 line)

**Trade-offs**:
- Positive: Immediate 2.7× oscillation reduction. Zero risk of breaking tests (meshGuideChains are still computed for diagnostics).
- Negative: mesh-guide blend becomes dead code (compute but don't use). λ=50 may still leave visible ~1mm oscillation. Mesh positions drift from GPU-resnapped peaks by WH smoothing displacement.

**Risk**: LOW. The `smoothedChains` are already validated by the existing diagnostic and pass `filterLowConfidenceChains`. All downstream consumers accept any `FeatureChain[]`. The blend code remains for potential future use or diagnostic comparison.

**Expected metric changes**:
- `Post-smooth quality: maxConsecDelta` — unchanged (still reports smoothedChains)
- New `Mesh-chain quality: maxConsecDelta` — drops from ~0.008 to ~0.003
- `Mesh-guide blend: maxShift/avgShift` — unchanged (blend still computed)
- `chainDirectedFlip` — fewer flips due to fewer column crossings (smoother U positions)

**Assumptions** (for Verifier):
1. No downstream consumer relies on meshChains being close to raw peak positions — they all use U for column/row mapping, not for sub-mm geometric accuracy.
2. The `smoothedChains` variable has identical chain topology (same points in same rows) as `meshGuideChains`, so `filterLowConfidenceChains` will filter identically.
3. Existing tests don't assert meshChain U positions match raw peak positions.

### Proposal 2: Increase WH Lambda (Moderate — 1 Constant)

**Idea**: Raise `WH_LAMBDA` from 50 to a value that achieves maxConsecDelta < 0.001.

**Mechanism**: At ChainLinker.ts line 324:
```typescript
const WH_LAMBDA = 50;  // Current
const WH_LAMBDA = 200; // Proposed
```

**Mathematical basis**: The Whittaker-Henderson second-difference smoother solves `(I + λ D₂ᵀD₂) s = y`. The effective smoothing kernel half-width scales approximately as `(2λ)^{1/4}`:
- λ=50 → kernel half-width ≈ 3.2 rows → maxConsecDelta ≈ 0.003
- λ=200 → kernel half-width ≈ 4.5 rows → maxConsecDelta ≈ 0.001–0.002 (estimated)
- λ=500 → kernel half-width ≈ 5.3 rows → maxConsecDelta ≈ 0.0005–0.001
- λ=1000 → kernel half-width ≈ 5.6 rows → maxConsecDelta ≈ 0.0003–0.0005

For reference, at typical pot diameter (200–300mm circumference), U units map roughly:
- 0.003 maxConsecDelta ≈ 0.6–0.9mm oscillation (current, visible on FDM)
- 0.001 maxConsecDelta ≈ 0.2–0.3mm oscillation (within FDM layer width)
- 0.0005 maxConsecDelta ≈ 0.1–0.15mm oscillation (within resin tolerance)

**Recommended value: λ=200** as baseline, with consideration for λ=500 if 200 proves insufficient.

**Files affected**: ChainLinker.ts (1 constant)

**Trade-offs**:
- Positive: Further 2–3× oscillation reduction on top of Proposal 1. Still preserves large-scale chain curvature (spiral features, diagonal chains). The second-difference penalty preserves overall trend while killing point-to-point jitter.
- Negative: Slightly reduced fidelity to detected peak positions. Chains with genuine high-curvature segments (tight spirals) may lose some detail. The TODO at ChainLinker.ts line 419 notes D₂ assumes uniform row spacing — higher λ amplifies any non-uniform spacing artifacts.

**Risk**: LOW-MEDIUM. The WH smoother's behavior is well-understood (L2-optimal for given λ). But the non-uniform row spacing issue (line 419: "D₂ assumes uniform row spacing") becomes more significant at higher λ — the penalty weights are constant but should scale with 1/Δtᵢ² for non-uniform grids. At λ=50 this was minor; at λ=200 it could cause subtle over/under-smoothing at rows inserted by `insertChainGuidedRows`.

**Mitigation**: Row spacing non-uniformity is typically mild (phantom rows are close to neighbors). At λ=200 the effect should be negligible. If needed, the weighted-D₂ fix from the TODO can be addressed separately.

**Expected metric changes** (combined with Proposal 1):
- `Post-smooth quality: maxConsecDelta` — drops from 0.003 to ~0.001
- New `Mesh-chain quality: maxConsecDelta` — same as above (with Proposal 1, mesh uses smoothed chains)

**Assumptions** (for Verifier):
1. The WH solver (pentadiagonal SPD) is numerically stable at λ=200 — the condition number scales roughly as λ, so at λ=200 it's well within Float64 precision.
2. Genuine feature curvature (spirals crossing multiple columns over many rows) has characteristic wavelengths of 20+ rows, well outside the λ=200 smoothing bandwidth (~9-row window). Only point-to-point jitter is suppressed.
3. The `filterLowConfidenceChains` roughness threshold (`MAX_CHAIN_ROUGHNESS = 0.008`) will NOT become overly aggressive — stronger smoothing reduces per-chain roughness, so more chains survive filtering, not fewer.
4. `unwrapChain` correctly handles seam crossings — stronger smoothing of unwrapped coordinates near the seam boundary could shift the re-wrapped positions unexpectedly.

### Proposal 3: Add Mesh-Chain Diagnostic (Conservative — 5 Lines)

**Idea**: Log the actual maxConsecDelta of the chains the mesh receives, exposing the current diagnostic gap.

**Mechanism**: After ParametricExportComputer.ts line 1110 (after `meshChains` is computed), add:
```typescript
if (meshChains.length > 0) {
    const meshDiag = computeChainDiagnostics(meshChains, allRowFeatures);
    const meshMaxDelta = Math.max(...meshDiag.perChain.map(d => d.maxConsecutiveDelta));
    console.log(`[ParametricExport]     Mesh-chain quality: maxConsecDelta=${meshMaxDelta.toFixed(6)}`);
}
```

**Files affected**: ParametricExportComputer.ts (5 lines, `computeChainDiagnostics` already imported)

**Trade-offs**:
- Positive: Eliminates the diagnostic blind spot. Future regressions in mesh-chain quality will be immediately visible. Verifier can confirm the actual oscillation magnitude.
- Negative: Tiny compute overhead (one chain diagnostic pass). Adds one log line.

**Risk**: NEGLIGIBLE. Pure observation, no behavioral change.

**Expected metric changes**: New log line showing the TRUE mesh-chain oscillation. Before Proposals 1+2, this will show ~0.008; after, it should match the smoothed-chain diagnostic.

**Assumptions** (for Verifier):
1. `computeChainDiagnostics` is already imported at ParametricExportComputer.ts line 61.
2. `allRowFeatures` is in scope at the insertion point (it's defined at line ~1050 and used later).

## Recommended Approach

**All three proposals, applied together**, in this order:

1. **Proposal 3 first** (diagnostic) — so we can observe the baseline meshChain quality before any fix.
2. **Proposal 1** (use smoothed chains) — the critical architectural fix. This alone should produce visible improvement.
3. **Proposal 2** (increase λ to 200) — tuning to push oscillation below FDM tolerance.

Combined, these three changes affect:
- **2 files** (ParametricExportComputer.ts, ChainLinker.ts)
- **~7 lines of code** (1 constant change, 1 variable swap, 5 diagnostic lines)
- **Zero API surface changes** — no new exports, no signature changes, no test interface changes

### Why NOT Higher λ?

I considered λ=500 or λ=1000, but recommend starting at λ=200 because:
1. The non-uniform row spacing TODO is real — higher λ amplifies it
2. We can always increase later if λ=200 isn't enough (trivial constant change)
3. λ=200 should achieve ~0.001 maxConsecDelta (0.2–0.3mm), which is at FDM tolerance threshold
4. Conservative progression is easier to validate: current(0.008) → 0.003(Prop1) → 0.001(Prop2)

### What About the blendTowardSmoothedChain Code?

**Preserve it.** Don't delete or refactor. Reasons:
1. The blend diagnostics (maxShift/avgShift) remain useful for understanding the gap between raw and smoothed chains
2. If λ=200 over-smoothes certain styles, we may revert to a blend-based approach with relaxed caps
3. Dead code cost is zero runtime (it computes but result is unused for mesh), and it documents the R39 design intent

## Open Questions

1. **Non-uniform row spacing at λ=200**: The TODO at ChainLinker.ts line 419 notes D₂ assumes uniform spacing. At λ=200, does the unweighted penalty cause visible artifacts at phantom-row insertion boundaries? (Verifier: check whether `insertChainGuidedRows` inserts rows at spacing significantly different from the base grid.)

2. **Seam-boundary chain smoothing**: `unwrapChain` + `whittakerSmooth` + re-wrap handles the 0°/360° seam. At λ=200, does stronger smoothing near the seam edges (first/last few chain points, which have only one-sided neighbors in the D₂ penalty) cause drift? The D₂₀ operator at boundaries is `1+λ` vs `1+6λ` interior — at λ=200, boundary points are 200× vs 1200× penalized, meaning first/last points are much more free to move.

3. **Style-specific λ**: Should `WH_LAMBDA` be style-dependent? Gothic arches (near-vertical chains) might benefit from very high λ, while spiral styles need lower λ to preserve intentional U-drift. A per-chain adaptive λ based on chain obliqueness could be a future refinement, but for R43 a single constant is simpler.

4. **Test impact**: Do any tests in ChainLinker.test.ts assert specific `whittakerSmooth` output values at λ=50? If so, they'll need updating for λ=200.
