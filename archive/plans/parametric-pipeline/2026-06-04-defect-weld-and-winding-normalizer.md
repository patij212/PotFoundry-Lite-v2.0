# 2026-06-04 Defect Weld and Winding Normalizer Debate

## Evidence

- FourierBloom live topology before the defect-weld tolerance fix: `boundaryEdges=4`, `nonManifoldEdges=0`, `orientationMismatches=50`.
- The four boundary samples were two edge pairs around one duplicated vertex pair about `0.0002mm` apart.
- `finalDefectWeld` previously passed `topologyWeldToleranceForExport(...)`; for the current draft export that can be coarser than `1e-4mm`, so the duplicated pair was hidden during defect discovery and `weldedVertices=0`.
- After using a fine discovery ceiling, FourierBloom proved `boundaryEdges=0` and `finalDefectWeld` reported `weldedVertices=1`.
- Remaining defect is purely directed-edge winding: validator reports `boundaryEdges=0`, `nonManifoldEdges=0`, `windingInconsistentEdges=38`; fidelity topology reports `orientationMismatches=50`.

## Round 1

### Generator

Apply the existing `normalizeWindingByComponent` pass after final defect weld and before final validation. The pass moves no vertices, preserves triangle count, and flips only triangle order within manifold-edge connected components, choosing the handedness that changes the fewest triangles.

### Verifier

Accept only if the pass is run after defect weld and before validation, because it relies on the mesh being manifold enough for two-triangle edge adjacency. It must report conflicts and must not be used as a substitute for boundary/non-manifold repair. Browser proof must show Fourier orientation goes to zero without reopening boundary/non-manifold edges.

Path to accept: focused unit tests for synthetic flipped-triangle cases plus live Fourier topology proof showing `boundary=0`, `nonMan=0`, `orientation=0`.

### Executioner

Implementation cost is low: import `normalizeWindingByComponent`, call it once after `finalDefectWeld`, replace `finalCombinedIdxs` only when flips occur, and add a tail diagnostic stage. No vertex buffers, feature accounting, or sag code are touched.

### Master

Approved with constraints. This is an index-buffer normalization pass, not a geometry repair. It may ship only with conflict telemetry and must be verified on Superformula and Fourier so the already-clean style stays clean while the feature-chain style improves.

## Decision

Proceed with:

1. Keep the fine defect-weld discovery ceiling.
2. Wire `normalizeWindingByComponent` after `finalDefectWeld`.
3. Validate with `WindingNormalizer.test.ts`, `BoundaryTJunctionRepair.test.ts`, and browser topology probes for SuperformulaBlossom and FourierBloom.
