# Generator Round 1 — Parametric Export Pipeline Fresh Audit
Date: 2026-03-07

## Problem Statement
The parametric export pipeline is producing improvements, but many recent changes are robustness-oriented guardrails rather than root-cause topology fixes. The immediate risk is silent fidelity loss at the seam and increasing architecture friction from patch-layer accretion across tessellation, chain linking, and refinement.

Scope audited:
- potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts
- potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts
- potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts
- potfoundry-web/src/renderers/webgpu/parametric/AdaptiveRefinement.ts
- potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts
- potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts

## Root Cause Analysis
The pipeline currently treats periodic seam topology mostly as an exception to avoid, not a native topological invariant.

Evidence of avoidance behavior:
- Outer wall tessellation excludes seam-spanning edges and cells via hard thresholds: SEAM_THRESHOLD 0.4 and SEAM_GUARD 0.3 in OuterWallTessellator.
- Chain filtering drops seam-spanning chains when points are near both U=0 and U=1 in ChainLinker.
- Feature graph input is seam-filtered with abs(u0-u1) <= 0.5 gate in ParametricExportComputer before graph build.

This creates a pattern:
- Short-term stability improves.
- Long-term feature fidelity near seam degrades.
- Debug observability improves while mathematical correctness is deferred.

Secondary root cause: architecture and contracts are not yet converged.
- Config contract drift: bandMergeFactor is passed and logged, but OuterWallTessellator hardcodes MAX_CDT_BANDS = 1.
- Keying contract drift: ChainStripOptimizer uses bigint edge keys, while AdaptiveRefinement uses string edge keys with parse churn.
- Pipeline intent drift: Whittaker smoothing is run, then pre-smoothed chains are used for mesh generation.

## 1) Top Immediate Issues (Ranked)

### P0-1: Seam Topology Is Guarded Away, Not Solved
Rationale:
- Multiple modules skip seam crossings instead of supporting periodic connectivity.
- This is a fidelity risk at exactly the region users notice first: the seam.
- Current behavior is a robustness bandage, not topological correctness.

Suggested first action:
- Introduce a canonical seam-periodic representation for chain and strip operations:
1. Store chain U in unwrapped domain during linking/tessellation.
2. Rewrap only at serialization/output boundaries.
3. Replace threshold-based seam skips with periodic edge handling.

Acceptance criteria:
1. No seam-chain rejection in normal operation for valid chains.
2. Constraint edge count at seam no longer drops due to seam threshold filters.
3. A seam-stress fixture passes with no missing feature edges and no horizontal seam segmentation.
4. Validation seam max gap stays within profile tolerance without special-case skips.

### P0-2: Smoothed Chains Computed but Not Used for Geometry
Rationale:
- ParametricExportComputer smooths chains, then uses pre-smoothed chains for mesh construction.
- This creates split truth between diagnostics and production geometry.
- Team cannot reason confidently about which chain quality path drives STL output.

Suggested first action:
- Make chain intent explicit via two named artifacts:
1. detectionChains
2. geometryChains
- Gate selection by profile/flag and log exact chain source once.

Acceptance criteria:
1. One canonical chain source is used for tessellation per run and logged.
2. Chain count and point count used by mesh exactly match reported diagnostics.
3. Regression fixture demonstrates deterministic chain-source behavior across runs.

### P1-3: Config Drift — bandMergeFactor Is Effectively Dead
Rationale:
- Runtime config logs m=bandMergeFactor and passes it into buildCDTOuterWall.
- OuterWallTessellator currently hardcodes MAX_CDT_BANDS = 1 and ignores config.
- This breaks operator trust in knobs and experiment reproducibility.

Suggested first action:
- Resolve contract truth:
1. Either wire bandMergeFactor to MAX_CDT_BANDS with explicit caps.
2. Or remove/deprecate the config field and log if ignored.

Acceptance criteria:
1. Changing bandMergeFactor changes behavior measurably, or is rejected with a warning.
2. No stale config fields remain in pipeline diagnostics.
3. Integration test asserts contract between PipelineStageConfig and tessellator behavior.

### P1-4: Edge-Key Strategy Is Fragmented Across Pipeline
Rationale:
- ChainStripOptimizer uses canonical bigint keying.
- AdaptiveRefinement still uses string keys and repeated parse operations.
- Mixed keying increases bug surface and costs performance in hot loops.

Suggested first action:
- Standardize edge key abstraction in a shared module:
1. edgeKey type and codec.
2. Single adjacency builder implementation.
3. Migration layer for legacy paths.

Acceptance criteria:
1. AdaptiveRefinement no longer parses dash-delimited edge strings.
2. One edge-key canonical form is used in all performance-sensitive adjacency paths.
3. Benchmark shows no regression in refinement runtime on representative meshes.

### P1-5: D2 Smoothing Assumes Uniform Row Spacing (Known TODO)
Rationale:
- ChainLinker documents that Whittaker D2 assumes uniform row spacing.
- Pipeline uses adaptive/non-uniform row insertion, violating assumption.
- Smoothing can bias chain trajectories and feature alignment.

Suggested first action:
- Implement weighted D2 using local delta-t spacing from final row map.

Acceptance criteria:
1. Whittaker smoother consumes row spacing weights.
2. Non-uniform-row synthetic test shows reduced bias vs current implementation.
3. Feature drift metric improves or remains neutral on baseline styles.

### P1-6: OuterWallTessellator Still Carries Monolithic Patch Accretion
Rationale:
- The file contains many generation responsibilities plus historical R22-R33 patch logic.
- High cognitive load drives local fixes over systemic cleanup.
- Risk of regressions when changing seam/constraint logic is elevated.

Suggested first action:
- Split by deterministic stage boundaries:
1. seam policy and normalization
2. strip windowing and segmentation
3. companion generation
4. constraint assembly
5. final edge/quality accounting

Acceptance criteria:
1. OuterWallTessellator file size and responsibility count are reduced with no behavior change.
2. Stage-level tests exist for each extracted module.
3. No net drop in current integration coverage.

### P2-7: Placeholder Degenerate Triangles Are Emitted and Stripped Later
Rationale:
- Several stages emit 0,0,0 placeholders then compact later.
- This keeps invalid intermediate state alive across phases.
- If any phase reads before compaction, behavior is fragile.

Suggested first action:
- Replace placeholder emission with explicit sparse emission paths or tri-skip accounting.

Acceptance criteria:
1. No new degenerate placeholders emitted in normal path.
2. Compaction step remains only as safety, with near-zero removals in baseline tests.
3. Diagnostics report source of any remaining degenerate triangles.

### P2-8: Threshold Proliferation Without Central Policy
Rationale:
- Seam and quality thresholds are duplicated and inconsistent across modules.
- Hardcoded values create accidental behavior coupling.

Suggested first action:
- Consolidate seam and strip threshold constants into a seam/quality policy module.

Acceptance criteria:
1. All seam thresholds resolve from one policy source.
2. Policy values are logged once per run.
3. Threshold changes trigger expected deltas in controlled tests.

### P2-9: Seam Feature Graph Pruning Can Hide Real Constraint Debt
Rationale:
- Feature graph is built from seam-filtered chain edges, potentially masking seam defects.
- Refinement then optimizes against an incomplete constraint graph.

Suggested first action:
- Preserve seam-crossing constraints in graph as periodic edges with explicit unwrap metadata.

Acceptance criteria:
1. Feature graph retains seam-crossing chain continuity.
2. Refinement metrics include seam-feature drift explicitly.
3. No silent seam-edge drops in debug counters.

### P3-10: Testing Emphasis Skews Toward Local Correctness, Not Pipeline Truth
Rationale:
- There are many unit tests, but fewer hard integration checks for seam fidelity and contract consistency.
- Several behavior contracts are currently implied by logs, not asserted by tests.

Suggested first action:
- Add 3 integration fixtures:
1. seam-crossing feature chain
2. high-drift style with row insertion
3. high-bandwidth quality profile with refinement enabled

Acceptance criteria:
1. Each fixture asserts feature edge retention, seam continuity, and quality gates.
2. Contract tests fail when config knobs are ignored.
3. CI surfaces stage-level metrics deltas per fixture.

## 2) What We Are Doing Wrong
1. Treating seam pathology with exclusion rules instead of periodic topology support.
2. Relying on logs and manual diagnosis where executable invariants should exist.
3. Carrying stale or non-operative configuration knobs that imply control we do not actually provide.
4. Allowing mixed keying/data contracts (string vs bigint) across adjacent pipeline stages.
5. Running mathematically sophisticated steps (smoothing) without aligning them to actual runtime geometry path.
6. Allowing monolithic modules to absorb iterative patches rather than enforcing stage boundaries.
7. Using threshold tuning as a substitute for model-level seam correctness.

## 3) What We Are Doing Right
1. Modular extraction from the old monolith is real and valuable (linker, tessellator, optimizer, refinement separation).
2. The pipeline has rich diagnostics and stage timing, which makes forensic debugging practical.
3. The team is explicit about known limitations in code comments and TODOs, enabling targeted audits.
4. Chain-strip optimization uses robust canonical bigint edge keys and constraint-preserving flip checks.
5. Quality gating exists end-to-end: refinement, seam healing hooks, and mesh validation are wired into production path.
6. The team has strong iterative response speed and captures rationale in journal/plans, reducing rediscovery cost.
7. Per-band CDT fallback decision (MAX_CDT_BANDS=1) stabilized severe sliver behavior quickly under pressure.

## 4) Architecture Verdict
Current status:
- Functional and improving, but still in a transition architecture.
- It is a robust patchwork with strong instrumentation, not yet a mathematically unified seam-periodic mesh architecture.

Target architecture:
- A seam-native periodic pipeline where U unwrap/wrap policy is consistent across detection, linking, tessellation, refinement, and validation.

Concrete improvements (4-6):
1. Add a SeamPolicy module defining canonical unwrap/wrap, seam edge semantics, and thresholds.
2. Unify edge adjacency/keying utilities used by tessellation, optimization, and refinement.
3. Enforce configuration truth via contract tests and runtime warnings for ignored knobs.
4. Split OuterWallTessellator into deterministic stage modules with stable interfaces.
5. Promote pipeline invariants to hard checks: no silent seam-edge drops, no placeholder emissions in nominal path.
6. Add seam-focused integration fixtures as release gates, not optional diagnostics.

## 5) Proposed Phased Execution Plan (1-2 Weeks)

### Phase A (Days 1-2): Contract and Observability Cleanup
1. Resolve bandMergeFactor contract truth.
2. Add chain-source explicitness (detectionChains vs geometryChains).
3. Introduce invariant logging for seam-edge drops and ignored config.

Deliverable:
- Clean operator-visible contract; no misleading knobs.

### Phase B (Days 3-5): Seam-Policy Foundation
1. Implement canonical seam unwrap/wrap utilities and apply in ChainLinker + OuterWallTessellator boundary paths.
2. Replace seam chain drop rule with periodic representation for valid seam chains.
3. Keep conservative fallback behind a kill switch.

Deliverable:
- Seam chains remain representable through mesh constraints.

### Phase C (Days 6-8): Edge-Key and Adjacency Unification
1. Create shared edge-key abstraction.
2. Migrate AdaptiveRefinement adjacency from string keys to canonical key form.
3. Benchmark and verify no runtime regressions.

Deliverable:
- Consistent adjacency semantics across refinement/optimization.

### Phase D (Days 9-12): Mathematical Correctness and Hardening
1. Implement weighted D2 smoothing for non-uniform row spacing.
2. Remove nominal placeholder triangle emission paths.
3. Add 3 integration fixtures and CI gates for seam and contract truth.

Deliverable:
- Reduced seam artifacts, stronger guarantees, less patch entropy.

## 6) Acceptance Criteria Matrix (Top Issues)
1. P0-1 closed when seam-crossing valid chains are preserved, constrained, and pass seam continuity tests without threshold skips.
2. P0-2 closed when one declared chain source drives geometry and diagnostics exactly reflect that source.
3. P1-3 closed when bandMergeFactor either deterministically affects tessellation or is removed with explicit deprecation behavior.
4. P1-4 closed when AdaptiveRefinement and optimizer share one edge-key contract with no string parse loops on hot paths.
5. P1-5 closed when smoothing honors non-uniform row spacing and passes synthetic bias regression tests.
6. P1-6 closed when OuterWall responsibilities are decomposed into stage modules with preserved behavior and stable tests.
7. P2-7 closed when placeholder degenerate emissions are eliminated from nominal path and compaction becomes safety-only.
8. P2-8 closed when seam/quality thresholds come from one policy source and are test-validated.
9. P2-9 closed when seam-feature edges are represented in graph form, not dropped silently.
10. P3-10 closed when seam-critical integration fixtures are mandatory CI gates.

## Recommended Approach
Pursue P0-1, P0-2, and P1-3 immediately as a combined trust-and-correctness package. This gives the team a truthful control plane while creating room to replace seam guards with seam-native topology in Phase B.

## Open Questions
1. Is seam chain dropping currently protecting against a known cdt2d limitation, or against local implementation assumptions in strip segmentation?
2. Should seam healing remain a post-process, or become a validation-only check once seam-native constraints are in place?
3. What is the acceptable performance budget increase for seam-native handling relative to current guard-based flow?
4. Do we need profile-dependent seam policy, or one mathematically consistent policy for all profiles?

## Generator Sign-off (Round 1)
Round 1 complete: the pipeline is stable-by-guards but not seam-native yet. Priority is to replace seam exclusion behavior with canonical periodic topology while restoring config and data-contract truth across stages.