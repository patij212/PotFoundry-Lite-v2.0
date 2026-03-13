# Verifier Round 8 — Critique of Generator's Polyline Smoothing & Horizontal Line Proposals
Date: 2026-03-04

## Summary Verdict: ACCEPT WITH AMENDMENTS (P2 only) / REJECT (P3, P4, P5, P6)

The Generator's analysis has a sound core (piecewise-linear connections cause visual staircase) but builds on two critical misdiagnoses that invalidate the recommended approach:

1. **The existing 2-pass SG is far more effective than claimed.** The maxConsecDelta=0.003378 is NOT residual noise — it's the real trajectory slope of diagonal/spiral chains. Additional SG passes would destroy signal.
2. **Seam-crossing debug segments do NOT produce horizontal lines in 3D.** The GPU shader independently evaluates `surface_point()` for each endpoint, so a segment from u=0.98 to u=0.02 produces a SHORT chord near the seam, not a horizontal line across the pot.

---

## Problem 1: Jagged Chain Polylines

### C1 [CRITICAL]: Generator misidentifies maxConsecDelta=0.003378 as residual noise

**Generator's claim**: "SG smoothing at halfWidth=8 passes ~15% of Nyquist amplitude. maxConsecDelta dropped from 0.0078 to 0.003378 — good but still ~2 grid columns of jitter."

**Actual behavior**: The code at [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1043-L1044) already applies **2-pass** SG smoothing:

```typescript
chains[ci] = smoothChainPath(chains[ci]);
chains[ci] = smoothChainPath(chains[ci]);
```

I verified the SG transfer function mathematically. For the quadratic SG coefficients at [ChainLinker.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L329) with `halfWidth=8`, window=17:

| Frequency | Single-pass |H(ω)| | 2-pass |H(ω)|² |
|-----------|---------------------|---------------------|
| Nyquist (2-row, ω=π) | 0.090 (9%) | 0.008 (0.8%) |
| 4-row (ω=π/2) | 0.115 (11.5%) | 0.013 (1.3%) |
| 6-row (ω=π/3) | ~0.25 (25%) | ~0.06 (6%) |

The Generator's "~15%" figure is wrong — single-pass Nyquist attenuation is ~9%, and with the existing 2-pass, it's 0.8%. The 2-pass SG has already eliminated essentially all oscillatory noise.

**The real question**: What IS the maxConsecDelta=0.003378 then? For a spiral chain traversing the full circumference (Δu=1.0) over 313 rows, the expected per-row slope is 1/313 ≈ **0.00320**. This is almost exactly the observed value. The "residual jitter" is the **real trajectory slope** of the chains.

**Counterexample**: If we apply additional SG passes (Proposal 3/4), we would attenuate this slope. A chain with a true diagonal trajectory of 45° in UV space would be flattened, shifting chain positions away from their measured features. This directly contradicts the project's "fingerprint on a knife edge" standard.

**Impact**: This invalidates Proposal 3 entirely and the SG component of Proposal 4. Additional SG passes are not just unnecessary — they are actively harmful.

### C2 [WARNING]: Generator's SG transfer function value is numerically wrong

**Generator's claim**: "SG transfer function at halfWidth=8 passes ~15% of the amplitude [at Nyquist]."

**Actual value**: Computing the SG quadratic coefficients from [ChainLinker.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L416-L421):

```
c[k] = (3m(m+1) - 1 - 5k²) / norm, where norm = (2m+1)(2m+3)(2m-1)/3
For m=8: c[k] = (215 - 5k²) / 1615

H(π) = Σ c[k]×(-1)^k = c[0] + 2×(-c[1]+c[2]-c[3]+c[4]-c[5]+c[6]-c[7]+c[8])
     = 0.1331 + 2×(-0.1114) = -0.0897
|H(π)| = 0.090, NOT 0.15
```

The sign is negative (the filter inverts the Nyquist component), and the magnitude is 9%, not 15%. This 40% error in the transfer function propagates through all the multi-pass attenuation calculations in Proposals 3 and 4.

### C3 [NOTE]: Catmull-Rom overshoot risk is negligible — Generator is correct

I verified the overshoot bound. For maxConsecDelta=0.003 after 2-pass SG:

- At a zigzag reversal (+0.003, -0.003), Catmull-Rom tangent T₁ = 0.5×(P₂-P₀) = 0, so the spline flattens — no overshoot
- At a consistent slope (+0.003, +0.003), the tangent follows the slope exactly — no overshoot
- Maximum overshoot at a slope transition is bounded by ~maxConsecDelta/4 ≈ 0.0008
- With inter-chain spacing ~1/20 = 0.05, overshoot is 1.6% of inter-chain distance

The Generator's conclusion that overshoot is "negligible" is **correct**. No amendment needed.

### C4 [NOTE]: Crossing filter O(n²) cost is acceptable

The crossing filter at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1102-L1128) is O(n²) per strip. With 3× subdivision:

- Current: ~8 constraints/strip → ~64 comparisons/strip
- After subdivision: ~24 constraints/strip → ~576 comparisons/strip
- Total: ~576 × 408 strips ≈ 235K comparisons

Each comparison is a `segmentsCross()` call (arithmetic only). Total cost: < 1ms. **Acceptable.**

### C5 [CRITICAL]: Subdivision points DON'T need GPU evaluation — Generator concern is moot

The Generator raises "subdivided chain points need GPU surface evaluation." This is a non-issue.

**Evidence**: The vertex buffer stores UV coordinates, not 3D positions. At [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L653-L663):

```typescript
// Append chain vertices after the grid
for (const cv of allChainVertices) {
    vertices[vIdx++] = cv.u;
    vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];
    vertices[vIdx++] = surfaceId;
}
```

Vertices are `(u, t, surfaceId)` — the GPU computes 3D positions via `surface_point()` at render/export time. Subdivision points only need interpolated UV coordinates, which are trivially computed. No GPU re-evaluation step is needed.

### C6 [WARNING]: Catmull-Rom subdivision points at intermediate T-positions interact with companion T-Ladder

**Generator's concern (Q5)**: How do subdivision points interact with the companion system?

The answer requires careful analysis. Subdivision creates new vertices BETWEEN row bands, at intermediate T-positions. The companion system at [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L421-L540) also places companions at intermediate T-positions. Interactions:

1. **Dedup risk**: Companions use `COMPANION_DEDUP_THRESHOLD = 1e-5`. Subdivision points at T-fractions of 1/3 and 2/3 within a band would NOT collide with companion T-fractions of [0.25, 0.5, 0.75] (the default `COMPANION_FRACS` approach using `nTLevels / (nTLevels+1)`). No dedup collision at default settings.

2. **Constraint guard**: The `isNearConstraintEdge()` function at L460 prevents companions within `CONSTRAINT_GUARD_RADIUS = 0.001` of any constraint edge. With subdivision, the constraint edges change path (now following the Catmull-Rom curve). Companions that were previously clear of the old straight-line constraint might now violate the guard with the new curved constraint. **This needs attention in implementation** — the constraint guard spatial index must be rebuilt AFTER subdivision, not before.

3. **CDT interaction**: Subdivision points are constraint edge endpoints; companions are free Steiner points. CDT handles this correctly — no interaction issue.

**Required amendment**: If implementing Catmull-Rom subdivision, the companion generation MUST occur AFTER subdivision, not before. The current code order in OWT (chain edges → companions → CDT) already supports this if subdivision is inserted at the right point.

---

## Per-Proposal Verdicts (Problem 1)

### Proposal 1 (B-Spline): REJECT
Generator already rejected this. Agree — B-spline approximation moves chain points, which conflicts with the measured-position design principle.

### Proposal 2 (Catmull-Rom Subdivision): ACCEPT WITH AMENDMENTS

The core idea is sound and directly addresses the real problem (piecewise-linear connections). Catmull-Rom passes through control points exactly, preserving detected positions. The overshoot is negligible, and the CDT cost increase is acceptable.

**Amendments required**:
1. Do NOT add additional SG passes. The existing 2-pass is already optimal.
2. Subdivision should happen in `OuterWallTessellator.ts` at [L400-415](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L400-L415), AFTER chain edges are recorded but BEFORE companion generation (L421+), so the constraint guard spatial index is built from subdivided edges.
3. Subdivision points need `t` values (intermediate T-positions within the band). Set `cv.t = lerp(tBot, tTop, subFrac)` for subdivided vertices, matching the companion vertex pattern.
4. Start with 2 intermediate points per edge. Add a quality gate ONLY based on the `maxConsecDelta` AFTER subdivision (not after SG) — if the subdivided path already has `maxSubdivDelta < 0.001`, skip further refinement.

### Proposal 3 (3-Pass SG): REJECT

**Reason**: Based on flawed analysis (C1). The existing 2-pass SG already achieves < 1% Nyquist residual. The maxConsecDelta=0.003 is real trajectory slope, not noise. Additional passes would:
- Over-smooth diagonal/spiral chains (false claim that they're preserved)
- Shift chain positions away from measured features
- NOT eliminate piecewise-linear visual artifacts (the fundamental problem)

### Proposal 4 (Hybrid SG + Catmull-Rom): REJECT as stated, ACCEPT Catmull-Rom component only

**Reason**: The SG component is harmful (C1). The quality gate threshold of 0.001 is based on the wrong assumption that maxConsecDelta represents noise. The Catmull-Rom component IS correct — but that's just Proposal 2. Accept P2 directly.

---

## Problem 2: Horizontal Line Artifacts

### C7 [CRITICAL]: Root cause diagnosis is WRONG — seam-crossing segments don't produce horizontal lines in 3D

**Generator's claim (Cause B)**: "Point at u=0.98 maps to theta ≈ 352°, point at u=0.02 maps to theta ≈ 7°. The GPU draws a straight line in 3D between these two clip-space positions. This line cuts straight through the interior of the pot, creating a visible horizontal artifact."

**Actual behavior**: The debug line vertex shader at [ShaderManager.ts](potfoundry-web/src/renderers/webgpu/ShaderManager.ts#L248-L254) evaluates each vertex INDEPENDENTLY:

```wgsl
@vertex
fn vs_main(@location(0) uv: vec2<f32>) -> @builtin(position) vec4<f32> {
    let H = getf(0u);
    let p = surface_point(0u, uv.x, uv.y);
    let p_center = vec3<f32>(p.x, p.y, p.z - 0.5 * H);
    var pos = vp_matrix() * vec4<f32>(p_center, 1.0);
    pos.z -= 0.0001 * pos.w;
    return pos;
}
```

For a seam-crossing segment (u=0.98, t=0.5) → (u=0.02, t=0.503):
- Vertex A: `surface_point(0, 0.98, 0.5)` → 3D point at θ=352.8°, height=50%
- Vertex B: `surface_point(0, 0.02, 0.503)` → 3D point at θ=7.2°, height=50.3%

These two 3D points are **14.4° apart on the pot surface** (going through the seam). The GPU draws a straight line between them — this is a **SHORT chord** across the seam gap, NOT a horizontal line cutting across the pot.

**Counterexample**: For a seam-crossing segment to look "horizontal" in 3D, the endpoints would need to be at approximately the same height but separated by a large arc (e.g., 90°+ apart). But a seam crossing from u=0.98 to u=0.02 only spans 14.4° — it's invisible at typical viewing distances.

**Conclusion**: The Generator's root cause analysis for horizontal line artifacts is incorrect. The seam-crossing mechanism cannot produce the described visual artifact because `surface_point()` maps the UV coordinates to geometrically adjacent 3D positions.

### C8 [CRITICAL]: Generator's self-correction on Cause A was premature

**Generator's analysis of Cause A**: The Generator initially identified row-mapping gaps as the primary cause, then self-corrected ("Revised diagnosis: ...the mapping succeeds") and pivoted to Cause B.

**But the self-correction may be wrong**. Let me trace the data flow:

1. Debug line construction at [ParametricExportComputer.ts](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1157-L1172):
```typescript
const origToFinalRow = new Map<number, number>();
for (let f = 0; f < rowMapping.length; f++) {
    if (rowMapping[f] >= 0) origToFinalRow.set(rowMapping[f], f);
}
```

The map value `f` is the **final** row index; the key `rowMapping[f]` is the **original** row index. Chain points have `pt.row` = original row index.

2. The mapping CAN have gaps if `insertChainGuidedRows` inserts rows that cause the `rowMapping` to have entries where `rowMapping[f] < 0` (inserted rows). These inserted rows are skipped in the map. But chain points reference ORIGINAL rows, which should all be in the map.

3. However, there's a subtle bug possibility: if `rowMapping` has **duplicate original row values** (two final rows claiming the same original row), the `Map.set()` would overwrite. The Generator correctly noted this but dismissed it. I cannot confirm or disprove without runtime data.

**The real diagnostic needed**: Before implementing any fix, ADD INSTRUMENTATION to the debug line construction to count how many chain points are dropped by the `origToFinalRow.get(pt.row) === undefined` check. This will definitively identify whether gaps exist.

### C9 [WARNING]: Actual root cause of horizontal lines is undiagnosed

Since Cause B (seam crossing) is disproven as the visual mechanism, and Cause A (row-mapping gaps) was prematurely dismissed, the actual root cause of horizontal line artifacts **remains unknown**. Possible causes:

1. **Row-mapping gaps** (re-investigate Cause A with instrumentation)
2. **Chain points at legitimately different U positions** connected by debug lines (e.g., a high-curvature chain making a sharp turn between rows)
3. **Debug segments from a different code path** (check `useAdaptiveExport.ts` at L432-435 — the adaptive export also calls `setDebugSegments`)
4. **The artifacts are actually in the MESH, not debug lines** — companion horizontal CDT edges visible in wireframe

**Before any fix**: Determine whether the horizontal artifact disappears when debug line overlay is toggled OFF. If it persists with overlay OFF, it's a mesh problem, not a debug visualization problem.

---

## Per-Proposal Verdicts (Problem 2)

### Proposal 5 (Seam Guard for Debug Lines): REJECT as a fix for horizontal artifacts

**Reason**: C7 proves that seam-crossing segments produce short chords, not horizontal lines. The fix addresses a non-existent problem.

**However**: As defensive coding, splitting debug lines at seam crossings is a reasonable improvement to debug visualization quality (prevents the short seam-crossing chords from appearing). **I'd accept this as a "code quality improvement" at low priority**, NOT as a fix for horizontal line artifacts.

### Proposal 6 (Gap-Aware Debug Lines): REJECT (premature)

**Reason**: Without instrumentation confirming that row-mapping gaps exist and cause visual artifacts (C8), implementing a gap-splitting heuristic is premature. The `MAX_ROW_GAP = 3` threshold is unjustified — we don't know if gaps of 1-3 rows are legitimate or problematic.

**Required before implementation**: Add diagnostic logging to count dropped chain points in debug line construction.

---

## Verifier's Alternative Proposal

### VP1: Pure Catmull-Rom Subdivision (No Additional SG)

For Problem 1, implement Catmull-Rom subdivision only (= Generator's P2), with these specifications:

1. **Location**: `OuterWallTessellator.ts`, after chain edge recording (L415), before companion generation (L421)
2. **Algorithm**: Standard Catmull-Rom (τ=0.5), 2 intermediate points per edge
3. **Boundary handling**: Mirror extension for first/last chain points (matching existing SG boundary handling in ChainLinker)
4. **No additional SG passes** — the existing 2-pass is optimal
5. **Subdivision vertices**: Create as `ChainVertex` with `pointIdx = -1`, `t = lerp(tBot, tTop, 1/3)` and `lerp(tBot, tTop, 2/3)`, appended to `chainVertices`
6. **Constraint edges**: Replace each original chain edge with 3 sub-edges in `chainEdges`
7. **Companion system**: Runs AFTER subdivision, so constraint guard uses subdivided edge paths

### VP2: Instrument Debug Lines Before Fixing

For Problem 2, before implementing any fix:

1. Add a counter in the debug line construction for `origToFinalRow.get(pt.row) === undefined` drops
2. Add a counter for consecutive debug line points with `|Δu| > 0.1` (potential horizontal artifact sources)
3. Log both counters to console
4. Ask the user to toggle debug overlay OFF and report whether horizontal artifacts persist

Only after this instrumentation reveals the actual cause should a fix be implemented.

---

## Open Questions for Generator

1. **Confirm the 2-pass SG**: Did you notice the code already applies `smoothChainPath` twice (L1043-1044)? Your analysis of "single-pass halfWidth=8" appears to miss this.
2. **maxConsecDelta decomposition**: Can you decompose maxConsecDelta=0.003378 into signal (trajectory slope) vs. noise (residual oscillation)? I predict the trajectory slope accounts for >90% of this value.
3. **Horizontal artifact reproduction**: Can you provide a specific screenshot or export log showing the horizontal line artifact? Since Cause B is disproven, we need visual evidence to guide root cause analysis.
4. **Adaptive export path**: The `useAdaptiveExport.ts` code at L432-435 also calls `setDebugSegments`. Are the horizontal artifacts from the parametric path or the adaptive path?

---

## Implementation Conditions (for Executioner)

If the Generator accepts these amendments and VP1/VP2:

### Phase 1: Catmull-Rom Subdivision (P2 amended)
1. Implement `subdivideChainEdges()` function in `OuterWallTessellator.ts`
2. Call AFTER chain edge recording, BEFORE companion generation
3. Do NOT modify `ChainLinker.ts` or add SG passes
4. Run existing test suite — check that constraint edge count ~3× increases
5. Validate: `maxAspectUV` should improve (smoother constraint paths = better CDT quality)
6. Validate: crossing constraint removals should decrease (smoother paths diverge more cleanly)

### Phase 2: Debug Line Instrumentation (VP2)
1. Add diagnostic counters to debug line construction in `ParametricExportComputer.ts`
2. Log results
3. User tests with overlay ON/OFF
4. Based on findings, implement targeted fix

### Validation Protocol
- All existing tests pass
- Export log shows chain edge count increase to ~17K (from ~5837)
- maxAspectUV improves or stays equal
- Visual inspection: chain overlay shows smooth curves instead of zigzag polylines
- No new horizontal artifacts introduced
