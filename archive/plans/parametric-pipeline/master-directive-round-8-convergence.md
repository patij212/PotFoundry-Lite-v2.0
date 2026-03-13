# Master Directive — Round 8 Convergence

Date: 2026-01-28

## Situation

Generator proposed 6 approaches (P1–P6) for two problems:
- **Problem 1**: Jagged chain polylines in tessellation constraint edges
- **Problem 2**: Horizontal line artifacts in the debug overlay

The Verifier produced a rigorous critique that:
1. **Accepted P2** (Catmull-Rom subdivision) with critical amendments
2. **Rejected P3** (additional SG passes — harmful, smooths real signal)
3. **Rejected P4** (hybrid SG+CR — SG component harmful for same reason)
4. **Rejected P5** (seam guard as fix — root cause disproven mathematically)
5. **Rejected P6** (gap-aware debug — premature without instrumentation)
6. **Proposed VP1** (pure Catmull-Rom with specific implementation constraints)
7. **Proposed VP2** (instrumentation-first approach for horizontal lines)

## Master's Assessment

### The Verifier is correct on all critical points.

**On SG passes (C1–C2)**: The Verifier's insight that `maxConsecDelta ≈ 0.003378` is dominated by the inherent trajectory slope of diagonal chains (~1/313 ≈ 0.00320) is mathematically sound. Additional SG passes would damage real signal. The Generator's proposed 3-pass and hybrid approaches (P3/P4) are rejected.

**On the seam-crossing hypothesis (C7)**: I independently verified the debug line vertex shader in ShaderManager.ts L247. Each vertex is mapped independently via `surface_point(0u, uv.x, uv.y)`. A seam-crossing segment (u=0.98→u=0.02) produces two 3D points ~14.4° apart on the pot surface — a short chord, NOT a horizontal line. The Generator's root cause for Problem 2 is mathematically disproven.

**On Catmull-Rom subdivision (VP1)**: Both agents agree this is correct for Problem 1. The Verifier's amendments are architecturally sound:
- No additional SG passes
- Insert BEFORE companion generation so T-Ladder constraint guard covers subdivided edges
- Subdivision vertices are UV-only (no GPU re-evaluation needed)
- Replace each original chain edge with 3 sub-edges in chainEdges

**On instrumentation (VP2)**: The Verifier is right that fixing an undiagnosed problem is premature. We need data before code.

## Judgment: Converge on VP1 + VP2

The debate cycle is complete. I'm calling convergence.

### Approved Plan — Phase 1: Catmull-Rom Subdivision (implements VP1)

**What**: Add `subdivideChainEdges()` in `OuterWallTessellator.ts` after chain edge recording (~L413), before companion generation (~L425).

**Algorithm**:
1. For each chain, iterate consecutive point pairs
2. Compute 2 Catmull-Rom intermediate points (τ=0.5) per edge
3. Boundary handling: mirror extension for first/last chain points
4. Create `ChainVertex` entries with `pointIdx = -1`, explicit `t = lerp(tBot, tTop, fraction)`
5. Replace original chain edge with 3 sub-edges
6. Companion system runs on the subdivided edges (gets smooth constraint guard for free)

**Expected outcomes**:
- Chain edge count increases ~3× (from ~5837 to ~17K)
- `maxAspectUV` improves (smoother constraint paths → better CDT quality)
- Crossing constraint removals decrease (smoother paths diverge more cleanly)
- Visual: smooth C¹ curves instead of zigzag polylines

### Approved Plan — Phase 2: Debug Line Instrumentation (implements VP2)

**What**: Add diagnostic counters to debug line construction in `ParametricExportComputer.ts` (~L1163-1180).

**Instrumentation**:
1. Count chain points dropped by `origToFinalRow.get(pt.row) === undefined`
2. Count consecutive debug line points with `|Δu| > 0.1` (potential horizontal artifact sources)
3. Log both counters to console with `[ParametricExport] Debug line diagnostics:`
4. Also log total chain points vs. remapped points for drop rate

**Purpose**: Determine the actual root cause of horizontal line artifacts before implementing any fix. The seam-crossing hypothesis has been disproven.

### Deferred — Phase 3: Seam Guard (P5, low priority)

Accept P5 as a **code quality improvement** — splitting debug lines at `|Δu| > 0.4` is defensive practice even though it's not the horizontal line fix. Implement only after Phase 2 instrumentation reveals the actual cause.

## Direction

- **Generator**: No further iteration needed. The plan is converged.
- **Verifier**: No further review needed. Critique accepted in full.
- **Executioner**: Proceed to feasibility review of VP1 + VP2 as specified above. Focus on:
  1. Exact insertion point in `OuterWallTessellator.ts`
  2. `ChainVertex` interface compatibility for subdivided points
  3. Impact on `chainEdges` array indexing (vertex indices must remain consistent with `gridVertexCount` offset)
  4. Whether the existing crossing constraint filter needs to run on subdivided edges
  5. Test coverage strategy

## Risk Assessment

- **Blast radius**: Low. Changes are additive (new function + diagnostic logging). No existing logic modified.
- **Regression risk**: Low. Companion generation and CDT triangulation operate on the chain data structure, which gains more vertices and edges but doesn't change shape semantics.
- **Rollback plan**: Remove `subdivideChainEdges()` call — single line deletion restores original behavior.
