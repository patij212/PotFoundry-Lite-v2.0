# Master Approval — R51: Chain Birth/Death Tracking + Mesh Topology
Date: 2026-03-09

## Decision: APPROVED — Phase 1

## Unanimous Agreement Status
- Generator: Proposed 4 chain-quality solutions (P1-P4) + 5 mesh-topology solutions (B1-B5)
- Verifier: Accepted with 4 critical amendments (C1: prominence normalization, C4: stable core check, C8: per-cell width, C15: cosine comparison). Corrected wrong alternating-distance explanation (C10) and pipeline ordering assumption (C12).
- Executioner: Implemented all 5 Phase 1 changes with 0 deviations. TypeScript 0 errors, ESLint 0 warnings, tests passing.
- Master: APPROVED

## Rationale

### Problem A — Chain Birth/Death
Chains 0-3 (17% of chain vertices) are at feature birth/death zones in the SuperformulaBlossom m-morphing transition. The DP matcher connects dying features to nascent features because it has no concept of feature amplitude. Two-layer defense:
- **Prevention** (A2/P1): Radius-normalized prominence mismatch penalty in DP cost function prevents dying chains from grabbing strong new features.
- **Repair** (A3/P3): Post-linking validation uses stable-core identity to detect and truncate wrong-feature chain segments.

### Problem B — Mesh Topology
39% aspect ratio violations from two causes:
- `sweepQuad` used 1e-8 tie-break instead of quality-aware diagonal choice (B1)
- `constrainedSweepCell` used deterministic fan diagonal ignoring geometry (B2/B4)

Both fixed with cosine-comparison quality criterion — no `Math.acos` overhead.

## Changes Implemented

| Change | File | Description |
|--------|------|-------------|
| A1 | ChainLinker.ts | Plumbed `FeaturePoint[][]` through `linkFeatureChainsByKind` → `linkFeatureChains` → `linkFeatureChainsCore` |
| A2 | ChainLinker.ts | Prominence-gated chain extension with radius normalization (P1 + C1). Guard: stable chains (≥200 rows, roughness <0.001) bypass. |
| A3 | ChainLinker.ts + ParametricExportComputer.ts | `validateAndRepairChains()` — stable-core identity, linear trend extrapolation, tail truncation (P3 + C4). |
| B1 | OuterWallTessellator.ts | `sweepQuad` quality zone = cellWidth × 0.5, cosine comparison diagonal choice (B1 + C8 + C15). |
| B2 | OuterWallTessellator.ts | Quality-aware fan diagonal in both `constrainedSweepCell` fan blocks (B4). |

## Deferred to Phase 2
- **B3 (Column Injection)**: Inject grid columns at chain vertex U positions. Verifier confirmed this is simpler than Generator estimated (no pipeline reordering needed). Implement if Phase 1 mesh quality is insufficient.
- **P2 (Expected Feature Count)**: SuperformulaBlossom-specific feature count prediction. Implement if P1+P3 are insufficient.
- **B2 proposal (Adaptive Merge Threshold)**: Redundant if B3 is implemented.

## Risk Assessment
- **Stable chain regression**: Guard clause (≥200 rows, roughness <0.001) protects chains 4-16 from prominence gating.
- **Short chain over-truncation**: `VALIDATE_MIN_LENGTH = 20` prevents validation of chains too short for meaningful core.
- **Fan diagonal CSO interaction**: `fanDiagEdges` records whichever diagonal is actually chosen — CSO reads from this array.
- **Performance**: Cosine comparison avoids `Math.acos` overhead entirely.

## Validation Required
User should run export with SuperformulaBlossom and compare D1 per-chain diagnostic output:
- Chains 0-3: avgUErr should decrease
- Chains 4-16: avgUErr should be unchanged
- Aspect ratio violations: should decrease
- Visual: check transition zones for improved ridge tracking
