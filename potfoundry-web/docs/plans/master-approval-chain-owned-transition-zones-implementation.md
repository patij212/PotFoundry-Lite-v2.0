# Master Approval — Chain-Owned Transition Zones Implementation
Date: 2026-03-11

## Decision: APPROVED WITH CONDITIONS

## Unanimous Agreement Status
- Generator: proposed chain-owned local corridors with shells and local constrained triangulation
- Verifier: accepted with amendments around seam contract, metadata contract, wrap policy, and staged rollback of chain-driven global density
- Executioner: feasible as a staged bounded rewrite of the feature-adjacent branch in `buildCDTOuterWall()`
- Master: approved with explicit changesets and acceptance gates

## Problem Statement
The live outer-wall pipeline still gives near-feature topology ownership to the host grid. The outer wall builds one global `unionU` from curvature plus Gaussian chain floors, then resolves feature neighborhoods by embedding chain geometry into grid-owned cells through `cellChainMap`, `fusionRequests`, `superCellMap`, `emitChainCell()`, `emitChainSplitCell()`, `emitSuperCell()`, `sweepQuad()`, and `constrainedSweepCell()`.

This architecture cannot guarantee local curvature-faithful triangles near feature edges because the feature-adjacent strip inherits host-grid rails, cell widths, and long connector edges. R54 fusion, R55 coalescing, quality-aware sweeps, and later strip optimization all operate after the wrong ownership decision has already been made.

The user’s requirement is sharper than “better average quality”: the feature-edge area must stop inheriting grid properties and instead be meshed with locally appropriate triangles whose aspect ratio tracks the local geometry rather than the host-grid budget.

## Scope
This is a bounded rewrite of the feature-adjacent branch inside `OuterWallTessellator.ts`. It is not a global remesher and it is not a full replacement of the standard outer-wall grid.

Keep unchanged in the first implementation phase:
- base host-grid construction in `ParametricExportComputer.ts`
- standard non-feature cell emission in `OuterWallTessellator.ts`
- downstream consumers that rely on outer-wall metadata shape
- legacy fallback path for unsupported corridor cases

Replace progressively:
- grid-owned feature cell routing through `cellChainMap` / `fusionRequests` / `superCellMap`
- `emitChainCell()` / `emitChainSplitCell()` / `emitSuperCell()` ownership for supported corridor cases
- direct feature-to-host-grid long connectors inside the near-feature zone

## Non-Impact Requirements
The implementation is approved only under a containment model that protects the existing pipeline while the new path is being built.

1. Legacy-default requirement
The existing implementation remains the default behavior until `C6`. No existing export path may silently switch to corridor ownership.

2. Flag-off equivalence requirement
With the corridor flag off, output must remain byte-for-byte identical where deterministic, or topology-equivalent where ordering differences are unavoidable. Any observable regression with the flag off is a merge blocker.

3. Unsupported-case isolation requirement
Any case not explicitly classified as supported by the corridor planner must stay entirely on the legacy path. No partial takeover, mixed ownership, or opportunistic seam handling is allowed.

4. Single-owner requirement
For any supported case, one topology owner must produce the feature-adjacent region. A case may be legacy-owned or corridor-owned, but not both in the same local region.

5. Legacy-repair preservation requirement
R54, R55, and the current Gaussian chain floor remain active for legacy-owned regions until the dedicated demotion phase proves that corridor-covered regions no longer depend on them.

6. Fast rollback requirement
The corridor path must stay behind a kill switch until the quality and downstream-stability gates pass. Disabling the flag must restore the legacy implementation without code edits.

## Conditions
Implementation may start only if the following are defined first and accepted as code-level contracts:

1. Seam-collar decomposition contract
The corridor path must emit one authoritative boundary split decomposition for every host edge it touches, including wraparound at the periodic seam. No downstream stage may invent a second decomposition for the same interface.

2. Metadata contract
The corridor path must preserve or explicitly redefine the semantics of:
- `quadMap`
- `chainEdges`
- `chainAdjacentVertices`
- `protectedStripVertices`
- `fanDiagonalEdges`
- `interpolatedChainVertices`

3. Wrap policy
The corridor planner must choose periodic seam behavior up front. Seam-crossing corridors are not allowed to fall back to ad hoc “drop the seam edge” behavior.

## Correctness Evaluation

### What Is Correct By Construction
If the corridor architecture is implemented as specified, the following statements become true by design rather than by tuning:

1. Local ownership invariant
Inside the corridor, the chain and its shell boundaries define the triangulation domain. Host-grid cell rails no longer dictate triangle endpoints in that zone.

2. No direct long connector invariant
There are no triangles that connect a feature edge directly to an arbitrary far host-grid vertex across the corridor, because the corridor boundary is mediated by explicit shell and seam-collar interfaces.

3. Bounded transition invariant
All transitions from feature geometry to host grid happen only at designated corridor boundary segments. This bounds where distortion can enter and makes it inspectable.

4. Seam explicitness invariant
Periodic seam handling becomes an explicit corridor case instead of an emergent property of grid-cell ownership.

5. Fallback safety invariant
Unsupported cases can remain on the legacy path until the corridor path covers them, which keeps rollout reversible and prevents half-converted topology.

### Why This Approach Is More Correct Than Current Alternatives

#### Versus Global U-Column Injection
Global U injection increases sampling density but leaves topology ownership with the host grid. It can shorten some connectors but cannot forbid them. The corridor design changes the domain owner, which directly removes the failure class instead of diluting it.

#### Versus Wider R54 / R55 Tuning
R54 and R55 are local repairs after grid ownership has already produced narrow or mixed cells. They can clean up specific pathologies but do not eliminate the feature-to-grid inheritance mechanism.

#### Versus More Companion Points / Density Clouds
Additional points improve the candidate set but not the domain topology. If the corridor boundary is still extracted from inherited host-grid rails, long slivers and poor transition triangles remain available to the triangulator.

## Fidelity Argument

### Strong Claim We Can Defend Now
Among the currently feasible architectures compatible with the existing PotFoundry pipeline, chain-owned local corridors have the highest export-fidelity ceiling because they are the only option discussed in this round that:
- preserves the global grid where it is useful
- removes host-grid ownership exactly where it is harmful
- forbids direct feature-to-grid connectors by construction
- keeps the transition to the host surface explicit, bounded, and testable

### Claim We Cannot Honestly Make Yet
We cannot claim a mathematical proof that the final implementation will produce the globally optimal triangle set or the absolute best possible export fidelity before implementation and measurement. Realized fidelity still depends on shell spacing, seam decomposition, overlap policy, and local triangulation details.

### Practical Proof Standard For This Work
The correct proof standard is dominance plus measurement:

1. Architectural dominance
Show that the corridor design removes a failure mode that all current alternatives leave possible.

2. Construction proof
Show that implemented invariants make direct feature-to-host-grid connectors impossible in supported corridor cases.

3. Empirical validation
Show that the supported cases improve UV and 3D quality metrics and reduce visible export defects without introducing new boundary or seam failures.

Under this standard, the corridor approach is the strongest currently justified direction.

## Implementation Order

### C0 — Contracts and Feature Flag
Goal:
Define corridor ownership and keep rollout reversible.

Changes:
- add a corridor feature flag and diagnostics flag in the outer-wall export path
- add type definitions for corridor boundaries, shell rails, seam-collar decomposition, and metadata output
- document the downstream metadata contract in code comments/JSDoc where the outer-wall result type is declared

Files:
- `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- `src/renderers/webgpu/ParametricExportComputer.ts`
- tests alongside outer-wall tessellation

Exit criteria:
- no behavior change with flag off
- typecheck/lint clean
- tests prove legacy path is byte-for-byte or topology-equivalent unchanged when flag is off
- corridor code is unreachable without the feature flag enabled

### C1 — Corridor Planner (Dry Run Only)
Goal:
Compute candidate corridor ownership without changing emitted triangles.

Changes:
- build corridor objects from chain vertices and explicit shell offsets
- classify supported simple cases: non-wrap, non-overlap, single-chain corridors
- compute host-edge intersection/split plan and seam-collar decomposition without consuming it yet
- emit diagnostics that compare corridor coverage against legacy `cellChainMap` coverage

Files:
- `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- possibly a new helper module under `src/renderers/webgpu/parametric/`

Exit criteria:
- planner produces stable supported/unsupported classification across test fixtures
- seam decomposition has deterministic ordering
- diagnostics show corridor ownership is localized and does not balloon into pseudo-global remeshing
- planner never changes emitted triangles or metadata when corridor emission is disabled

### C2 — Simple-Case Corridor Emitter
Goal:
Replace legacy chain-cell ownership only for supported simple cases.

Changes:
- emit corridor-local triangulation between chain rail and shell rails
- stitch corridor boundary to host grid only through the precomputed seam-collar decomposition
- route unsupported cases to legacy `emitChainCell()` / `emitSuperCell()` path unchanged
- preserve metadata contract for supported corridor cases

Files:
- `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- any helper module introduced in C1

Exit criteria:
- supported cases contain no direct feature-to-host-grid triangles
- outer-wall result remains manifold on supported fixtures
- downstream consumers run unchanged
- unsupported cases remain topology-equivalent to legacy output

### C3 — Metadata and Downstream Integration Hardening
Goal:
Make corridor outputs first-class citizens for later stages.

Changes:
- verify `quadMap` semantics for corridor-generated faces
- mark `chainAdjacentVertices` and `protectedStripVertices` consistently for corridor boundaries
- define `fanDiagonalEdges` semantics for corridor-generated connectors or prove they are unnecessary
- ensure `constraintEdgeSet` and subdivision logic interpret corridor edges correctly

Files:
- `src/renderers/webgpu/ParametricExportComputer.ts`
- `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- `src/renderers/webgpu/parametric/MeshSubdivision.ts`
- `src/renderers/webgpu/parametric/ChainStripOptimizer.ts`

Exit criteria:
- no downstream assertion or validator breakage
- chain-strip optimization does not reintroduce forbidden corridor-to-grid flips
- subdivision honors corridor protection semantics

### C4 — Seam and Overlap Expansion
Goal:
Extend corridor coverage to periodic seam and corridor-interaction cases.

Changes:
- implement explicit periodic seam handling for seam-crossing corridors
- add corridor overlap/merge policy for neighboring chains whose shells intersect
- preserve single-source-of-truth host-edge decomposition in all merged cases

Exit criteria:
- seam-crossing supported cases remain manifold
- overlap rules are deterministic and do not create duplicate or missing boundary splits

### C5 — Legacy Repair Demotion
Goal:
Reduce now-redundant legacy repair pressure only after corridor coverage is proven.

Changes:
- narrow or disable the chain Gaussian floor contribution for corridor-covered spans
- evaluate whether R54 and R55 can be reduced for corridor-covered cases while remaining available for legacy fallback cases

Exit criteria:
- corridor-covered quality does not regress when legacy density/repair pressure is reduced
- unsupported fallback cases remain protected

### C6 — Default-On Rollout
Goal:
Promote corridor ownership to the default for supported cases.

Changes:
- enable corridor path by default once gates pass
- keep a kill switch for rapid rollback
- update docs/journal with post-rollout metrics

Exit criteria:
- all acceptance gates pass on representative style fixtures
- rollback flag works cleanly

## Test Gates

### Gate -1 — Legacy Equivalence Gate
Must pass before any corridor-emission code is allowed to ship, even behind a flag.

Required tests:
- golden or snapshot comparisons for representative legacy exports with corridor flag off
- topology-equivalence assertions on representative outer-wall fixtures with corridor planner enabled but emitter disabled
- regression tests proving unsupported cases stay on the legacy branch end-to-end

Success criteria:
- zero observable export regressions with the flag off
- zero ownership bleed from corridor code into unsupported cases

### Gate 0 — Contract Gate
Must pass before C1 merges.

Required tests:
- unit tests for seam-collar decomposition ordering and exact boundary split counts
- unit tests for metadata contract shape with flag off
- snapshot/topology tests proving legacy path unchanged when corridor flag is off

### Gate 1 — Planner Gate
Must pass before C2 merges.

Required tests:
- planner fixture tests for simple non-wrap, non-overlap, single-chain cases
- planner rejection tests for unsupported seam and overlap cases
- diagnostics asserting corridor coverage stays local and bounded

Success criteria:
- zero ambiguous ownership on supported fixtures
- deterministic corridor boundary ordering

### Gate 2 — Supported-Case Topology Gate
Must pass before C3 merges.

Required tests:
- manifold/boundary-edge validation on supported corridor fixtures
- explicit assertion that supported cases emit no direct feature-to-host-grid triangles
- UV topology tests confirming corridor triangles are internal to corridor boundary and seam collar only

Success criteria:
- zero boundary-edge regressions in supported cases
- zero direct feature-to-host-grid connectors in supported cases

### Gate 3 — Quality Gate
Must pass before corridor path is enabled beyond targeted fixtures.

Required metrics on representative sharp-feature styles:
- chain-strip min angle improves versus legacy baseline
- chain-strip max aspect ratio improves materially versus legacy baseline
- count of aspect-ratio violations above 4:1 drops materially versus legacy baseline
- cross-row / long-span connector counts in the feature-adjacent zone drop materially

Master condition:
Do not set exact numeric thresholds in advance without fresh baseline runs. Use current failing fixtures to establish baseline, then require statistically meaningful improvement on every supported style, not just one showcase case.

### Gate 4 — Downstream Stability Gate
Must pass before seam/overlap expansion is considered complete.

Required tests:
- chain-strip optimizer regression tests
- subdivision regression tests
- full export validation on representative styles with corridor path enabled

Success criteria:
- no new validator failures
- no reintroduced forbidden flips or midpoint artifacts at corridor boundaries

### Gate 5 — Coverage and Legacy Demotion Gate
Must pass before reducing Gaussian chain floor / R54 / R55 on corridor-covered cases.

Required tests:
- mixed coverage fixtures where some chains use corridor path and others fall back
- seam-crossing and overlapping corridor fixtures
- quality comparison before and after legacy repair demotion

Success criteria:
- corridor-covered cases remain improved without legacy assists
- fallback cases do not regress

### Gate 6 — Default-Flip Gate
Must pass before enabling corridor ownership by default for any supported case.

Required tests:
- side-by-side exports with corridor flag on and off across representative styles
- explicit rollback drill proving that disabling the flag restores legacy output on the next run
- targeted checks that non-feature regions remain unchanged apart from supported corridor-local geometry

Success criteria:
- improvements are localized to supported feature-adjacent zones
- non-feature and unsupported regions remain unchanged
- rollback is immediate and complete

## Validation Protocol
After each changeset:
- `npm run typecheck`
- `npm run lint`
- `npm test`

Additional validation for C2 and later:
- run targeted export fixtures that currently demonstrate the long connector defect
- capture chain-strip UV and 3D quality metrics before/after
- preserve logs/artifacts for comparison in `archive/artifacts/` if the metrics format is already in use

## Risk Assessment

### Highest Risks
1. Seam decomposition drift
If corridor/host boundary splitting is duplicated across modules, manifold failures will appear even if local corridor triangulation is sound.

2. Metadata semantic mismatch
If corridor triangles are emitted but later stages still treat them like legacy chain-cell quads or fan-diagonal cells, optimizers and subdivision can silently corrupt the result.

3. Corridor overlap explosion
If neighboring shells merge without an explicit policy, the corridor path can accidentally become a pseudo-global remesher.

### Rollback Plan
- keep corridor path behind a flag until Gate 3 passes
- maintain legacy emission path for unsupported cases through C5
- if any gate fails, disable the corridor flag and continue shipping the legacy path while preserving planner diagnostics for further iteration

## Direct Answer On Existing Implementation Safety
The planned work is designed so it does not affect the existing implementation while it is being developed:
- `C0` and `C1` are non-behavioral by contract
- `C2` affects only explicitly supported corridor cases and only when the flag is enabled
- unsupported cases remain fully on the legacy branch until proven safe
- the legacy path stays available as the immediate rollback target through the final rollout gate

What I can guarantee now is process safety and architectural isolation. What I cannot guarantee honestly is that no bug will ever be introduced during implementation. The correct guarantee is stricter and more useful: any unintended effect on existing behavior becomes a gate failure and the feature does not advance.

## Master Verdict
This is the right next step for PotFoundry because it attacks the actual ownership error rather than spending more complexity on repairs after the fact. It has the highest fidelity ceiling of the currently viable options because it is the only one that can make the offending connector class impossible by construction. That said, final fidelity claims remain contingent on implementation quality and measured export results. The team is approved to implement this plan in the changeset order above and not outside it.