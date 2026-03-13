# Verifier Round 48 - Adversarial Review of Parametric Export Pipeline
Date: 2026-03-09

## Summary Verdict: REJECT

Current pipeline quality is strong in many local stages, but it fails the "fingerprint on a knife edge" standard under seam-boundary and gate-enforcement conditions. The biggest blockers are not cosmetic: they are topological and policy-level (what the pipeline chooses to drop, skip, or treat as warning-only).

## Scope Reviewed

- Orchestrator: `src/renderers/webgpu/ParametricExportComputer.ts`
- Feature/chain stages: `src/renderers/webgpu/parametric/FeatureDetection.ts`, `ChainLinker.ts`
- Grid/tessellation: `src/renderers/webgpu/parametric/GridBuilder.ts`, `OuterWallTessellator.ts`
- Topology optimization/subdivision: `src/renderers/webgpu/parametric/ChainStripOptimizer.ts`, `MeshSubdivision.ts`
- Final quality gate: `src/renderers/webgpu/parametric/MeshValidator.ts`, `SeamTopology.ts`
- Feature-flag policy: `src/renderers/webgpu/parametric/contracts.ts`

## Critique

### C1 [CRITICAL]: Seam-crossing features are structurally excluded in multiple stages

**Claim being challenged**: Seam quality is handled by healing/validation at the end.

**Actual behavior**:
- Chain seam-span filter drops chains with points near both sides of seam: `ChainLinker.ts:589-596`.
- Chain edges are filtered before graph build when `|u0-u1| > 0.5`: `ParametricExportComputer.ts:1451-1461`.
- CDT path drops seam-spanning edges by threshold: `OuterWallTessellator.ts:759`, `OuterWallTessellator.ts:809`.
- Cells/super-cells are seam-guard skipped: `OuterWallTessellator.ts:1662-1665`, `OuterWallTessellator.ts:1074-1083`.

**Counterexample**:
- True ridge crosses periodic boundary with adjacent samples at `u=0.9988` and `u=0.0012`.
- This is geometrically continuous on the cylinder but appears as a large raw `du` in open UV.
- Result: chain rejected or edge removed before constraint insertion; downstream can only heal geometry, not recover missing feature constraint identity.

**Required fix**:
- Move all chain/edge processing to seam-unwrapped periodic coordinates (lifted U), then project back only for output.
- Replace raw `|du|` seam rejection with circular distance `min(|du|,1-|du|)` for feature continuity decisions.
- Permit seam-crossing feature constraints; handle seam as a first-class periodic edge class, not exclusion class.

### C2 [CRITICAL]: Validation can report PASS for non-closed mesh

**Claim being challenged**: Validation is a final pass/fail quality gate.

**Actual behavior**:
- `checkManifold` sets `ok` from non-manifold edges only (`nonManifoldEdges===0`) and does not fail on boundary edges: `MeshValidator.ts:276-278`.
- `validateMesh` adds boundary-edge warning but does not fail validity for it: `MeshValidator.ts:1139-1140`, final `valid` composition `MeshValidator.ts:1262-1270`.

**Counterexample**:
- Mesh with `boundaryEdges>0`, `nonManifoldEdges=0` can still return `valid=true` if other gates pass.
- For watertight STL target, this is a hard failure, not warning.

**Required fix**:
- Introduce strict manifold closure mode for export path: `boundaryEdges===0` required.
- If open boundaries are ever acceptable, that must be explicit by product mode, never default for printable closed solids.

### C3 [CRITICAL]: Advanced seam/fidelity gates are disabled by default

**Claim being challenged**: Pipeline defaults represent safe quality behavior.

**Actual behavior**:
- `seamHealing`, `gpuFidelityCheck`, `distortionGating` default to `false`: `contracts.ts:368-373`.
- Seam healing is flag-gated in orchestrator: `ParametricExportComputer.ts:2169`.

**Counterexample**:
- Typical run with default flags can skip seam healing and stronger fidelity checks while still returning a finished export.
- This violates the requirement that quality be guaranteed, not opt-in.

**Required fix**:
- Flip defaults for production export path: seam healing and fidelity validation on by default.
- Keep opt-out only for debug/performance experiments.

### C4 [WARNING]: Chain smoothing operator uses uniform-spacing assumption despite nonuniform row regime

**Claim being challenged**: Chain smoothing is mathematically consistent with row layout.

**Actual behavior**:
- Explicit TODO: `D2` assumes uniform row spacing, should be weighted for nonuniform `t`: `ChainLinker.ts:408-409`.
- Pipeline later inserts rows adaptively (`insertChainGuidedRows`): `ParametricExportComputer.ts:1182`.

**Counterexample**:
- In variable `dt` regions, equal-index second-difference over-penalizes some segments and under-penalizes others.
- This can bias chain trajectory near steep geometric transitions.

**Required fix**:
- Implement nonuniform finite-difference penalty using local `dt` weights.
- Add unit test comparing uniform vs nonuniform row spacing on known analytic trajectory.

### C5 [WARNING]: Chain-grid flip gate is likely over-conservative for strip recovery

**Claim being challenged**: Current flip policy balances quality and feature integrity.

**Actual behavior**:
- Chain-grid flip threshold is hard-coded at `0.20` radians: `ChainStripOptimizer.ts:177`.
- Gate applied repeatedly in phases with skip accounting: `ChainStripOptimizer.ts:650-654`, `715-719`, `789-793`.

**Counterexample**:
- Borderline sliver repairs can require many small gains below `0.20` each; blanket gate can preserve poor local topology.

**Required fix**:
- Replace fixed threshold with context-aware gate:
  - lower threshold for severe slivers (very low min angle),
  - retain high threshold where chain alignment risk is high.
- Track objective delta at strip level (not single-edge only) to allow safe cumulative improvement.

### C6 [WARNING]: Diagnostic chain and mesh chain intentionally diverge

**Claim being challenged**: Post-link chain quality improvements directly affect exported mesh.

**Actual behavior**:
- Smoothed chains are computed and logged, then mesh uses filtered pre-smooth chains: `ParametricExportComputer.ts:1095-1111`.

**Counterexample**:
- Diagnostics can show improvement while exported topology still follows noisier pre-smooth path.
- This is defensible for absolute position fidelity, but it creates quality-observability mismatch.

**Required fix**:
- Maintain explicit dual metrics:
  - positional fidelity (to analytic feature),
  - topological smoothness (mesh edge jitter).
- Gate on both, so smoothing is not only observational.

## Accepted Items

- Chain processing uses explicit seam-safe unwrapping in smoothing utilities (`ChainLinker.ts:423+` context), which is the correct local strategy.
- Outer wall tessellation includes robust companion/phantom/super-cell machinery for hard cases (`OuterWallTessellator.ts` R35-R38 sections), indicating strong investment in topology-preserving pathways.
- Validation report structure is comprehensive (fidelity, seam, distortion, triangle quality), so stronger policy can be enabled without redesign (`MeshValidator.ts` interfaces and final report structure).

## Open Questions

1. Is export product policy strictly watertight for all profiles, or are open meshes intentionally permitted in any SKU/mode?
2. Are there real-world styles where seam-crossing chain constraints are intentionally unwanted? If yes, list them and justify by geometry, not by implementation convenience.
3. Should default feature flags differ between preview and export? Current defaults appear optimized for backward safety, not export correctness.

## Implementation Conditions for Reconsideration

To move verdict from REJECT to ACCEPT WITH AMENDMENTS, all conditions below are required:

1. Seam continuity must be constraint-preserving, not exclusion-based:
   - no unconditional dropping of seam-spanning chain constraints.
2. Validation must fail on boundary edges in export mode.
3. Production defaults must enable seam healing and fidelity checking.
4. Smoothing operator must support nonuniform row spacing (or be removed from any quality-critical path).
5. Add adversarial tests:
   - seam-crossing ridge case,
   - nonuniform-row chain smoothing case,
   - open-boundary mesh must fail validation in export mode.

## Minimal Alternative Architecture

1. Periodic chain domain:
   - maintain chain state in lifted periodic U, preserve seam crossings.
2. Periodic constrained tessellation:
   - seam-edge class handled explicitly (ghost strip or paired-edge constraint), never filtered by raw `du`.
3. Strict export QA contract:
   - closure + seam + fidelity all hard-gated, with no warning-only escape for printable outputs.

This is the minimum path that is more correct than the current approach while staying aligned with existing module structure.