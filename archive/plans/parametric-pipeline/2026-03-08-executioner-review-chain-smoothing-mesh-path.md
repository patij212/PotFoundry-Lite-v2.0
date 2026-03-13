# Executioner Review — Mesh-Path Chain Smoothing For Persistent Feature-Edge Dips

## Feasibility Assessment

The lowest-risk option in the current codebase is **not** switching mesh construction to fully smoothed chains. The lowest-risk option is a **bounded, pairwise blend from pre-smooth chains toward the Whittaker-smoothed chains**, applied only when building `meshChains` in `ParametricExportComputer.ts`.

Why this is the safer path:

- `ParametricExportComputer.ts` already computes both representations in one place: raw GPU-resnapped chains (`preSmoothChains`) and WH-smoothed chains (`chains`) around lines 1087-1115.
- `buildCDTOuterWall()` only consumes a plain `FeatureChain[]`; it does not care where those positions came from, so an upstream blended chain array can be introduced without changing the tessellator API.
- Fully smoothed chains would immediately change four downstream behaviors at once: row insertion, chain-driven density profile, outer-wall tessellation, and feature-edge graph construction. That is mechanically simple but behaviorally high-risk.
- A bounded blend lets us reduce the visible stair-step amplitude without fully abandoning the GPU-resnapped feature positions that motivated v27.

Implementation complexity is moderate and localized. This is a `ParametricExportComputer.ts` + `ChainLinker.ts` change, with tests in `ChainLinker.test.ts` and likely one export-path assertion in `ParametricExportComputer.test.ts`.

## File Impact Analysis

### 1. `src/renderers/webgpu/ParametricExportComputer.ts`

Current behavior:

- Saves `preSmoothChains`
- Smooths `chains` with `whittakerSmooth()`
- Filters smoothed chains for diagnostics
- Builds mesh from `filterLowConfidenceChains(preSmoothChains)`

Recommended change:

- Keep the current diagnostic path unchanged.
- Build a third array, `meshCandidateChains`, by blending each pre-smooth chain toward its smoothed counterpart with a bounded displacement.
- Filter `meshCandidateChains` for actual mesh construction.
- Log one extra diagnostic: maximum per-point mesh displacement from the raw chain path.

Suggested replacement shape:

```ts
const preSmoothChains = chains.map(c => ({
    ...c,
    points: c.points.map(p => ({ ...p })),
}));

const smoothedChains = preSmoothChains.map(chain => whittakerSmooth(chain));
chains = filterLowConfidenceChains(smoothedChains);

const meshCandidateChains = preSmoothChains.map((rawChain, chainIdx) =>
    blendTowardSmoothedChain(rawChain, smoothedChains[chainIdx], {
        blendWeight: 0.35,
        maxPointShift: 0.0015,
    })
);
const meshChains = filterLowConfidenceChains(meshCandidateChains);
```

I would not use `chains` directly for mesh construction. That throws away the v27 safety rationale completely.

### 2. `src/renderers/webgpu/parametric/ChainLinker.ts`

Add one exported helper plus a small options type:

```ts
export interface MeshChainBlendOptions {
    blendWeight?: number;
    maxPointShift?: number;
}

export function blendTowardSmoothedChain(
    rawChain: FeatureChain,
    smoothedChain: FeatureChain,
    options: MeshChainBlendOptions = {}
): FeatureChain
```

Helper behavior:

- Require identical point counts and row ordering. If they diverge, return `rawChain`.
- Unwrap both chains with the existing seam-safe logic.
- For each point, compute `delta = smoothedU - rawU` in unwrapped space.
- Clamp that delta to `[-maxPointShift, +maxPointShift]`.
- Apply only a fraction of the clamped delta: `rawU + blendWeight * clampedDelta`.
- Re-wrap to `[0, 1)`.

This is the exact reason to put the helper in `ChainLinker.ts`: it already owns `unwrapChain()` and the seam-safe smoothing utilities.

## Risk Zones

### Highest-risk option: fully smoothed chains for mesh

This is a one-line change, but it is not low-risk.

- It directly reintroduces the v27 failure mode: mesh edges move off true GPU-resnapped feature positions.
- It changes `insertChainGuidedRows()` input, so row insertion can shift.
- It changes `chainVertexUs`, which feeds `buildDensityProfile()` and the CDF-adaptive grid.
- It changes the actual chain edges consumed by `buildCDTOuterWall()`, so super-cell splitting and protected-corridor behavior can move even before optimization.
- It creates a debug mismatch because the overlay lines are still built from `preSmoothChains`.

### Main risk of the bounded/blended variant

The blend is safer, but still touches real geometry.

- If `maxPointShift` is too high, it can still move the ridge off the true feature.
- If `blendWeight` is too low, it may not materially reduce the dip.
- If raw and smoothed filtering diverge too much, chain counts may differ between diagnostics and geometry. That is acceptable, but it must be intentional and logged.

## Unstated Dependencies

- `filterLowConfidenceChains()` currently works on a full array and can return different keep/drop decisions for raw, smoothed, and blended chains because roughness changes with smoothing. The implementation should preserve pairwise mapping until after blending.
- `buildCDTOuterWall()` inserts micro-rows based on the provided chain geometry. Any mesh-path chain change implicitly changes micro-row insertion.
- `chainVertexUs = meshChains.flatMap(...)` means the mesh-path chain source also affects the adaptive U-density profile, not just the constraint polyline.
- The debug line overlay currently uses `preSmoothChains`; if the blended path is adopted, diagnostics should at least log the mesh displacement magnitude so the mismatch is visible to developers.

## Implementation Sequence

1. Add `blendTowardSmoothedChain()` to `ChainLinker.ts`.
2. In `ParametricExportComputer.ts`, compute `smoothedChains` as a separate array instead of mutating the only working copy.
3. Build `meshCandidateChains` by blending raw toward smoothed.
4. Keep `chains` as the filtered smoothed diagnostic set.
5. Keep debug overlay lines on `preSmoothChains` for now.
6. Add one log line for `maxMeshShift` so visual regressions can be correlated with actual displacement.

## Questions For Generator/Verifier

- What absolute displacement budget is acceptable before we consider the ridge no longer faithful to the true feature: `0.001`, `0.0015`, or `0.002` in U?
- Should the cap be absolute only, or also relative to local raw consecutive delta?
- Is the goal to reduce dips while preserving current crossing topology, or are small topology changes acceptable if the ridge looks better?

## Recommendation

Implement the **bounded/blended mesh-chain path** first.

- It is the lowest-risk option in the current architecture.
- It stays upstream of tessellation and optimization.
- It preserves the v27 insight that raw feature positions matter.
- It is easy to A/B behind one local switch if the visual result is worse.

Do **not** switch directly to fully smoothed chains as the first fix. That is lower effort, but not lower risk.