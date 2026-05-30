# 2026-05-25 Export Quality Gate Debate

## Scope

Redevelop the export pipeline toward Rhino/Grasshopper-grade output by replacing triangle-count confidence with measurable tolerance gates. This slice does not attempt a wholesale rewrite of `OuterWallTessellator`; it establishes the non-negotiable quality contract that tessellation must satisfy before STL/OBJ/3MF files are emitted.

## Generator

Proposal: introduce a tolerance feasibility check before GPU work, a shared print-readiness validator for exported meshes, deterministic format metadata, and fail-loud behavior when validation fails. The pipeline already has adaptive refinement and `MeshValidator`, so the fastest path to real quality is to make those reports authoritative instead of diagnostic-only.

Code paths traced:

- UI export request -> `useParametricExport.generateMesh()` -> `ParametricExportComputer.compute()`
- `ParametricExportComputer.compute()` resolves `QualityProfiles`, builds/evaluates mesh, runs `MeshValidator`, then currently returns a mesh even when warnings exist.
- `downloadSTL`, `exportToOBJ`, and `exportTo3MF` can serialize raw mesh data; OBJ/3MF include wall-clock metadata, which undermines deterministic output.

## Verifier

Objections:

- Passing tests are not proof because many exporter tests use open single-triangle or quad fixtures.
- A mesh validator that logs warnings but still returns downloadable geometry is not a gate.
- Silent triangle-budget capping can hide impossible user tolerances.
- Global outward-normal checks are risky for hollow pots because inner wall normals correctly face the cavity; edge-orientation coherence is a safer first gate.

Path to accept:

- Add tests that fail on open meshes, invalid indices, degenerate faces, over-1GB estimates, and deterministic metadata drift.
- Make explicit sub-micron tolerance overrides produce actionable errors when the estimated tessellation cannot fit the hard file-size and numeric-stability constraints.
- Preserve low-level format syntax tests by allowing explicit validation bypass in unit tests, while production export paths validate by default.

## Executioner

Feasibility:

- Add focused modules rather than expanding the already large `ParametricExportComputer.ts`.
- Avoid touching chain linking, CDT ownership, R37/R52 precision locks, or corridor planning in this pass.
- Wire the feasibility gate at the start of `compute()` after tolerances resolve.
- Wire print-readiness validation into shared export helpers so STL/OBJ/3MF all use the same contract.

Risk:

- Stricter production validation can expose existing invalid meshes immediately.
- Some legacy tests need to declare that they are format-syntax tests and bypass readiness validation.

## Master

Approved for implementation with this contract:

1. Explicit tolerance requests must be measured against estimated tessellation cost and must fail loudly when unreasonable.
2. STL/OBJ/3MF export paths must share a mesh print-readiness validator.
3. Format output should be deterministic by default; timestamps must be opt-in.
4. The full tessellator remains unchanged in this slice except for consuming the new gate and refusing invalid validation reports.
5. Any deeper adaptive tessellation changes must be built against these quality metrics, not against green tests alone.
