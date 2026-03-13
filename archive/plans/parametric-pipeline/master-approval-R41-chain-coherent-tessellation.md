# Master Approval — Chain-Coherent Tessellation R41

Date: 2026-03-08

## Decision: APPROVED

## Unanimous Agreement Status

| Agent | Status | Document |
|-------|--------|----------|
| Generator | Proposed CCT (R40), accepted amendments (R41), proposed 2B | generator-round-41-response.md |
| Verifier | Accepted Proposal 1 with 3 amendments, accepted 2B with 2 amendments | verifier-round-40-cct-critique.md, verifier-round-41-proposal-2B-critique.md |
| Executioner | Both phases FEASIBLE, near-final TypeScript provided | executioner-review-R41-chain-coherent-tessellation.md |
| **Master** | **APPROVED** | This document |

## Rationale

### Why this is the right fix after 39 rounds

The root cause was finally identified correctly: `sweepQuad`'s U-comparison (line 231) alternates diagonal direction when chain vertices oscillate by even 0.001 in U between rows. Every previous fix (Rounds 1-39) addressed **secondary mechanisms** — chain smoothing, post-hoc flipping, protected corridors — while the primary pathology (the sweep diagonal itself) was never touched.

The evidence trail:
- Round 12/13: DP-vs-greedy chain comparison produced identical results → chain linker was never broken
- Rounds 34-39: Cell-local sweep, protected corridors, mesh-guide blend — all quality improvements but none addressing the sweep diagonal
- R40/41: First time the sweep diagonal itself is targeted

### Why these two proposals are sufficient

**Problem A (sawtooth)**: chainFanQuad forces deterministic fan diagonals from chain edges, bypassing the U-comparison entirely. The diagonal direction is structural (chain side vs. grid side) rather than positional (U value). This eliminates the alternation mechanism.

**Problem B (surface quality)**: Feature-Aware Subdivision splits the long fan arms (chain vertex → grid corner) with GPU-evaluated midpoints. This reduces chord error where it matters most — at the ridge flanks where curvature is highest. Operating at subdivision time avoids all cell-boundary T-junction risks.

### Why this doesn't repeat historical failures

| Historical failure | Mechanism | Why CCT avoids it |
|---|---|---|
| UV snapping (v20) | Vertex placement at cell boundary | No new vertices at tessellation time |
| Buffer zones | Expanded chain footprint broadly | Fan changes no footprint; FAST adds vertices post-tessellation |
| CIFAG | Overly complex concentric rings | ~47 lines total, minimal scope |
| 39 rounds of secondary fixes | Wrong target (post-hoc repair) | Targets the primary mechanism (sweep diagonal choice) |

## Conditions

1. **Phase 1 first, Phase 2 second** — two atomic commits, independently testable
2. **A1**: 2×2 sub-quads only — no N×M chainBiasedSweep until a concrete tangent-selection spec passes a Verifier review
3. **A2**: Degenerate guard required — skip fan and fall through to sweepQuad if `subBot.length < 2 || subTop.length < 2`
4. **A3**: No additional CSO protection — constraint edge set already sufficient
5. **FEATURE_SCALE = 0.75** hard-coded (not configurable) per existing convention
6. **All 169 existing tests must pass** — zero regressions
7. **`npm run typecheck` and `npm run lint`** must be clean

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fan triangle winding incorrect | Very Low | Medium | `emitTriCCW` cross-product check handles this automatically |
| N×M sub-quads get wrong diagonal | Low | Low | A1 defers to sweepQuad for N×M — no behavior change |
| FAST oversplits (too many fan arms) | Low | Low | `modifiedTris` guard + sort-by-length = graceful degradation |
| FAST undersplits (budget too tight) | Medium | Low | Budget is generous (Verifier confirmed non-binding); longest edges split first |
| Super-cell fan arms blocked by protectedStripVertices | Low | Very Low | Super-cells already densely populated by R37 phantom rows |

**Blast radius**: Phase 1 modifies `constrainedSweepCell` only (~35 lines). Phase 2 modifies `subdivideLongEdges` only (~12 lines). Both are isolated functions with clear boundaries. Rollback = revert the commit.

## Implementation Order

### Commit 1: `feat: chainFanQuad — deterministic fan diagonals in 2×2 chain sub-quads`
- File: OuterWallTessellator.ts, modify `constrainedSweepCell` (lines 336-358)
- Scope: ~35 lines added
- Validation: `npm run typecheck`, `npm test`, `npm run lint`

### Commit 2: `feat: feature-aware subdivision threshold for chain↔grid edges`
- Files: MeshSubdivision.ts (~8 lines), ParametricExportComputer.ts (~1 line log change)
- Scope: ~12 lines total
- Validation: `npm run typecheck`, `npm test`, `npm run lint`
