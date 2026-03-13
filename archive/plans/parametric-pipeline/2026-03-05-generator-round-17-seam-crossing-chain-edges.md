# Generator Round 17 — Seam-Crossing Chain Edges Create Full-Width Horizontal Rings

Date: 2026-03-05

## Problem Statement

When a feature chain crosses the cylindrical seam (u≈1→u≈0), a single chain edge that is *physically* ~0.009 wide but *UV-wide* ~0.991 passes through the seam filter, gets inserted into `chainEdges`, and then:

1. `rowBandEdges` inherits it without any seam filter
2. `rawColHasChain` marks columns 0 through 684 (the entire row)
3. `bandConstraintEdges` feeds the edge to CDT
4. The CDT strip covers the full circumference — catastrophic mesh quality (aspect ratio 5.1M:1)

The resulting horizontal ring is geometrically degenerate and produces 40K+ R² violations.

## Root Cause Analysis

Three interacting failures, all in [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts):

### RC1: Wrap-correction defeats the seam filter (line ~535)

```typescript
let du = Math.abs(p1.u - p0.u);
if (du > 0.5) du = 1 - du;  // wrap-corrects to 0.009
if (du > SEAM_THRESHOLD) continue;  // 0.009 < 0.4 → PASSES
```

The wrap-correction is measuring **physical distance** (correct for 3D geometry) but being used to gate **UV-space constraint edges** (incorrect — the edge spans virtually the entire UV domain from col 684 to col 0).

Compare to the interpolation pass at line ~487, which does NOT wrap-correct:

```typescript
let du = p1.u - p0.u;
if (du > 0.5) du -= 1;
if (du < -0.5) du += 1;
if (Math.abs(du) > SEAM_THRESHOLD) continue;  // correctly skips seam
```

The interpolation pass uses *signed* wrap-correction for interpolation direction but then checks the absolute value against the threshold. The chain-edge pass uses *unsigned* wrap-correction, which collapses `|0.991 - 0.000| = 0.991` to `1 - 0.991 = 0.009`, completely defeating the threshold.

### RC2: No seam filter in rowBandEdges population (line ~819)

```typescript
for (const [v0, v1] of allChainEdges) {
    // ... row gap check only, NO du/seam check
    list.push([v0, v1]);
}
```

Even if RC1 were fixed, any edge that leaks into `chainEdges` by other means would still get picked up here.

### RC3: No seam filter in bandConstraintEdges population (line ~1020)

```typescript
if (bandEdges) {
    for (const [v0, v1] of bandEdges) {
        // ... no du check at all
        bandConstraintEdges.push([v0, v1]);
    }
}
```

The constraint is fed directly to CDT, which faithfully creates a triangle spanning from u≈0 to u≈0.991.

### RC4: colHasChain marks full width via col span (line ~940-948)

```typescript
const cMin = Math.min(col0, col1);  // 0
const cMax = Math.max(col0, col1);  // 684
for (let c = cMin; c <= cMax; c++) bandCols[c] = 1;  // ALL columns!
```

This is the mechanism that produces the visual horizontal ring — the entire row becomes a CDT strip.

### Secondary effect: Companion constraint spatial index poisoning (line ~575)

```typescript
for (const [v0Idx, v1Idx] of chainEdges) {
    // ... builds constraintsByBand from the same buggy chainEdges
}
```

The companion guard zone check (`isNearConstraintEdge`) uses the constraint edge endpoints for distance calculations. A seam-crossing edge with u₀=0.991 and u₁=0.000 doesn't create a meaningful guard zone problem because the distance calculation is point-to-segment, but it does waste cycles and creates an edge entry that may incorrectly suppress companions near u=0 or u=1.

## Proposals

### Proposal 1: Remove wrap-correction from chain edge seam filter (Conservative)

**Idea**: Don't wrap-correct the du in the chain-edge recording loop. Use raw `|p1.u - p0.u|` directly against `SEAM_THRESHOLD`.

**Mechanism**:
```typescript
// Line ~534-536: BEFORE
let du = Math.abs(p1.u - p0.u);
if (du > 0.5) du = 1 - du;
if (du > SEAM_THRESHOLD) continue;

// AFTER
const du = Math.abs(p1.u - p0.u);
if (du > SEAM_THRESHOLD) continue;
```

**Mathematical basis**: A chain edge where raw |Δu| > 0.4 spans more than 40% of the UV domain. Such an edge MUST be a seam crossing (no physical feature moves 40% around the pot in one row step). The threshold is already calibrated for this — the wrap-correction was incorrectly added.

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) lines ~534-536. Single 2-line change.

**Trade-offs**:
- (+) Minimal change, easy to verify
- (+) Consistent with the interpolation pass (line ~487) which also rejects seam crossings
- (-) Loses the constraint edge for the seam-crossing chain segment — the chain feature at the seam has no constraint enforcement for one edge
- (-) Does not add defense-in-depth to downstream consumers

**Assumptions** (for Verifier to attack):
1. No physically real chain edge has raw |Δu| > 0.4 without crossing the seam
2. Losing one constraint edge per seam-crossing chain does not create a visible gap in the feature ridge (the chain vertices at u≈0.991 and u≈0.000 still exist as mesh vertices and will be connected by CDT)
3. The interpolation pass (which already rejects seam crossings) is correctly excluding seam-crossing multi-row gaps, so no orphaned interpolated vertices exist near the seam

### Proposal 2: Triple defense — filter at source + rowBandEdges + bandConstraintEdges (Moderate)

**Idea**: Fix RC1 as in P1, then add explicit seam checks at the two downstream consumption points as defense-in-depth.

**Mechanism**: Three changes:

**Change A** (RC1 fix — same as P1):
```typescript
// Line ~534-536
const du = Math.abs(p1.u - p0.u);
if (du > SEAM_THRESHOLD) continue;
```

**Change B** (RC2 fix — add seam filter to rowBandEdges):
```typescript
// Line ~819-829: add du check
for (const [v0, v1] of allChainEdges) {
    const cv0 = allChainVertices[v0 - gridVertexCount];
    const cv1 = allChainVertices[v1 - gridVertexCount];
    if (!cv0 || !cv1) continue;
    // NEW: skip seam-crossing edges in UV
    if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
    const r0 = Math.min(cv0.rowIdx, cv1.rowIdx);
    const r1 = Math.max(cv0.rowIdx, cv1.rowIdx);
    if (r1 - r0 > 1) continue;
    let list = rowBandEdges.get(r0);
    if (!list) { list = []; rowBandEdges.set(r0, list); }
    list.push([v0, v1]);
}
```

**Change C** (RC3 fix — add seam filter to bandConstraintEdges):
```typescript
// Line ~1020: add du check
if (bandEdges) {
    for (const [v0, v1] of bandEdges) {
        const cv0 = allChainVertices[v0 - gridVertexCount];
        const cv1 = allChainVertices[v1 - gridVertexCount];
        if (!cv0 || !cv1) continue;
        // NEW: skip seam-crossing edges
        if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
        bandConstraintEdges.push([v0, v1]);
    }
}
```

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) — 3 surgical edits

**Trade-offs**:
- (+) Defense-in-depth: even if a seam edge leaks into `chainEdges` by future code changes, it won't reach CDT
- (+) RC2 and RC3 filters are cheap (single comparison per edge)
- (+) colHasChain marking inherits the fix transitively (no seam edges in rowBandEdges → no full-width col marking)
- (-) Slightly more code to maintain, but each guard is one line
- (-) Same loss of seam-crossing constraint edge as P1

**Assumptions** (for Verifier to attack):
1. Raw `Math.abs(cv0.u - cv1.u)` is the correct metric at all downstream points (no case where we need wrap-aware distance)
2. The constant `SEAM_THRESHOLD = 0.4` is appropriate for all three filter points (it was designed for this purpose)
3. Change B and C are redundant given Change A works — but redundancy is desirable for a known-catastrophic failure mode

### Proposal 3: Seam-aware colHasChain with wrap-around marking (Moderate)

**Idea**: Instead of dropping seam-crossing edges, handle them correctly in `rawColHasChain` by marking the SHORT arc (cols 684→end + cols 0→0) instead of the LONG arc (cols 0→684).

**Mechanism**:
```typescript
// Line ~940-948: wrap-aware column marking
const col0raw = bsearchFloor(unionU, cv0.u);
const col1raw = bsearchFloor(unionU, cv1.u);
const col0 = Math.max(0, Math.min(cellsPerRow - 1, col0raw));
const col1 = Math.max(0, Math.min(cellsPerRow - 1, col1raw));

// Detect seam crossing: if the raw UV gap is large but the physical gap is small
const rawDu = Math.abs(cv0.u - cv1.u);
if (rawDu > 0.5) {
    // Seam-crossing edge: mark the SHORT arc
    // e.g., col0=684, col1=0 → mark [684..cellsPerRow-1] + [0..0]
    const hi = Math.max(col0, col1);
    const lo = Math.min(col0, col1);
    for (let c = hi; c < cellsPerRow; c++) bandCols[c] = 1;
    for (let c = 0; c <= lo; c++) bandCols[c] = 1;
} else {
    const cMin = Math.min(col0, col1);
    const cMax = Math.max(col0, col1);
    for (let c = cMin; c <= cMax; c++) bandCols[c] = 1;
}
```

**Mathematical basis**: The chain physically crosses from u=0.991 to u=0.000 — a short arc of ~0.009. In column space, this is cols {684, 0}, and possibly the wrap-around column if there is one. Marking only these 1-2 columns preserves the strip marking without the full-width explosion.

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) — colHasChain marking section

**Trade-offs**:
- (+) Preserves the seam-crossing chain edge as a CDT constraint (no feature gap)
- (+) Strip marking is geometrically correct — only the relevant columns are CDT'd
- (-) The constraint edge still connects u=0.991 to u=0.000 in the CDT strip → CDT gets an edge spanning the full UV width within the strip. The CDT itself will produce a valid triangulation, but the triangle crossing the seam has vertices at u≈0 and u≈0.991 which maps to a collapsed triangle in 3D at the seam
- (-) Does not fix RC1-RC3 — the edge still leaks through all downstream paths
- (-) More complex logic, harder to verify correctness
- (-) **CRITICAL**: Even with correct colHasChain, the CDT constraint edge [u=0.991, u=0.000] will still produce degenerate geometry. The strip triangulation works in UV space — it cannot correctly triangulate across the seam wrap.

**Assumptions** (for Verifier to attack):
1. bsearchFloor returns meaningful results near the seam boundaries
2. The CDT can handle a constraint edge spanning the UV wrap without producing degenerate triangles — **I believe this assumption is FALSE**
3. The column-marking is the only consumer of the edge endpoints for span computation

### Proposal 4: Split seam-crossing chains at the seam boundary (Radical)

**Idea**: When a chain crosses the seam, insert a synthetic "seam vertex" at u=1.0-ε (or u=0+ε) to split the chain into two segments that each stay on one side of the seam. The constraint edges connect to the seam vertex instead of crossing.

**Mechanism**:
During chain vertex processing (between lines ~480-540), detect seam crossings and insert interpolated vertices:

```typescript
for (let k = 1; k < finalChain.length; k++) {
    const p0 = finalChain[k - 1];
    const p1 = finalChain[k];
    const rawDu = Math.abs(p1.u - p0.u);
    
    if (rawDu > SEAM_THRESHOLD) {
        // Seam crossing detected. Do NOT emit a constraint edge.
        // Instead, insert TWO seam-boundary vertices:
        // - One at the "exit" side (u≈0.999 or u≈0.001) with interpolated row
        // - One at the "entry" side
        // These become chain endpoints; the gap at the seam is filled
        // by the standard grid mesh.
        continue;
    }
    
    // ... normal edge recording
}
```

**Mathematical basis**: The cylindrical mesh has a topological seam — a cut in UV space. No constraint edge should bridge across this cut. The chain is continuous in 3D, but in UV the chain must terminate at the seam edge and resume on the other side.

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) — chain processing section + potentially ChainLinker upstream

**Trade-offs**:
- (+) Most geometrically correct: chain constraints exist on both sides of the seam
- (+) The seam gap is only 1-2 grid columns wide, filled by standard cells
- (-) Complex: need to interpolate correct u,t for synthetic seam vertices
- (-) Changes the chain topology which may affect diagnostics and edge verification
- (-) Overkill given that the seam gap will be small and covered by standard grid cells
- (-) Would need upstream changes to the chain linker, violating the "minimal change" constraint

**Assumptions** (for Verifier to attack):
1. The standard grid cells at the seam provide adequate feature resolution (the CDF-adaptive grid should have columns near the chain position)
2. Synthetic seam vertices don't cause issues with chain diagnostics
3. The interpolated T-position for the seam vertex is correctly derived from the two bordering chain points

### Proposal 5: Drop seam-crossing edge + mark ONLY adjacent columns (Conservative, Recommended)

**Idea**: Combine the best elements of P1 and P3. Drop the seam-crossing constraint edge (it can't work in UV space), but ensure the chain vertices on each side of the seam are still present as mesh vertices that get included in their local CDT strips.

**Mechanism**: This is essentially P2 (triple defense) with one addition — verify that chain vertices near the seam still appear in `rowChainVerts` and thus in `buildMergedRow`. They already do, because chain vertex registration is independent of chain edge recording.

Specifically:
1. Apply P2's three changes (RC1 + RC2 + RC3 seam filters)
2. Verify: chain vertices at u≈0.991 and u≈0.000 are still in `chainVertices[]`, still in `rowChainVerts`, and still participate in `buildMergedRow` output
3. Each vertex individually marks its own column in `rawColHasChain` via the bot/top chain vertex scan (lines ~952-970)
4. The result: col 684 is CDT'd (small strip), col 0 is CDT'd (small strip), but NOT cols 1-683

This means the feature ridge is CDT-triangulated at col 684 and col 0 independently. The 1-2 column seam gap between them uses standard grid cells, which have the correct geometry (the grid samples the same parametric surface).

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) — same 3 edits as P2

**Trade-offs**:
- (+) Eliminates the catastrophic full-width strip
- (+) Chain vertices remain as mesh vertices on both sides of the seam
- (+) Minimal code change (same as P2)
- (+) Standard grid cells at the seam still follow the parametric surface — no visible gap
- (-) One constraint edge lost per seam-crossing chain pair per chain
- (-) The narrow seam gap is triangulated without chain constraints — but the chain vertices nearby bias the grid to have adequate density there

**Assumptions** (for Verifier to attack):
1. Chain vertices at the seam ARE correctly registered in `chainVertices` and `rowChainVerts` even though the connecting edge is dropped — **YES**, chain vertex registration (lines ~460-475) is unconditional
2. The bot/top chain vertex scan in `rawColHasChain` marking (lines ~952-970) correctly marks their individual columns — **YES**, this scans `rowChainVerts.get(j)` independently of edge existence
3. The CDF-adaptive grid has sufficient U-density near seam-crossing chain positions to fill the gap — needs verification but highly likely since the grid builder is curvature-aware
4. Losing one constraint edge at the seam produces no visible artifact — the chain vertex on each side still attracts the CDT to the correct surface position

## Recommended Approach

**P5 (which is P2 + explicit verification of chain vertex preservation).**

Rationale:
- P1 is correct but fragile (single filter point)
- P2 is correct and robust (triple filter)  
- P3 is wrong because CDT can't triangulate across a UV seam
- P4 is overkill and violates the minimal-change constraint
- P5 is P2 with the added confidence that chain vertices survive independently

The implementation is exactly the three changes from P2. The "P5 verification" is a code-review assertion, not a code change — we verify that chain vertex registration (already unconditional) ensures both seam-side vertices remain in the mesh.

**Priority ranking: P5 = P2 > P1 >> P4 >> P3**

## Open Questions

1. **Companion generation near the seam**: The `constraintsByBand` spatial index (line ~575) will no longer contain seam-crossing edges after the fix. This is **correct** — those edges had nonsensical guard zones anyway. But verify that `SEAM_COMPANION_GUARD = 1e-6` (line 559) adequately prevents companion placement at u≈0 or u≈1 where they would create seam-touching geometry.

2. **Edge verification pass**: The edge verification at the end of the tessellator checks that all `allChainEdges` appear in the final mesh. Since the dropped seam edge remains in `allChainEdges` (which is an alias for `chainEdges`), the verification will report it as a "dropped edge". Should we also remove it from `chainEdges` or skip it in verification? (Recommend: add the seam check to verification too.)

3. **How many chains cross the seam?** The log shows chain12 does. Are there others? The fix is generic and handles any number, but understanding the scope helps assess risk.

4. **Test coverage**: Do the existing vitest tests cover seam-crossing chains? A regression test should be added with a chain that has consecutive points spanning u>0.5 raw delta.

## Appendix: Companion System Impact Analysis

The companion (T-Ladder) system has its own seam protections:
- `SEAM_COMPANION_GUARD = 1e-6` rejects companions at u<1e-6 or u>1-1e-6
- `tryEmitCompanion` checks bounds before emitting

These are independent of chain edges. After the fix, the companion system works identically — it just no longer has a spurious seam-crossing edge in its `constraintsByBand` index, which is an improvement (fewer false positive guard zone suppressions).

The `isNearConstraintEdge` function does point-to-segment distance without wrap awareness, so a seam-crossing edge from u=0.991 to u=0.000 would have created incorrect guard zone geometry (the segment appears to span the full UV width in the distance calculation). Removing it improves companion placement quality near the seam.
