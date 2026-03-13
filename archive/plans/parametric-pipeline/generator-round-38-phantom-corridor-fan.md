# Generator Round 38 — Phantom Corridor Fan for Post-R37 Dip Elimination
Date: 2026-03-08

## Problem Statement

R37 achieved its stated topological goal: every super-cell that needed band splitting is now split, and chain edge enforcement is perfect (`missing=0`). The remaining visible dips therefore cannot be explained by missing chain edges anymore. The failure mode has shifted from “the ridge polyline is absent” to “the ridge polyline exists, but the triangles immediately supporting it still sag or get re-diagonalized into sagging shapes.”

The latest metrics support that diagnosis:

- `R37: 7696 phantom vertices, 2530 edges split, 2529 super-cells with band splitting`
- `R35 Chain edges: 8722 (enforced=8722, missing=0)`
- `cross-row tris: 2-row=101`
- `chain-strip 3D quality: min_angle=0.4°, max_aspect=170.4:1, avg_aspect=6.4:1, violations=35.7%`
- Validation regressed to `86 non-manifold edges`, `17472 boundary edges`, `3358 inconsistent normal pairs`

That pattern is not “coverage is incomplete.” It is “local support topology is still too coarse, and downstream optimization is free to damage the corridor that R37 introduced.”

## Root Cause Analysis

### 1. R37 fixed the constrained polyline, not the local support fan

R37 inserts full-width phantom rows in [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1050) and then re-emits each affected super-cell as stacked sub-bands in [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1455).

That guarantees a chain edge endpoint exists on every split row, but each phantom row still starts with a sparse support scaffold:

- column-boundary vertices across the super-cell width
- one anchor vertex at each chain/row crossing
- optional extra split points for other edges crossing the row

This is enough to preserve the chain edge combinatorially. It is not enough to guarantee that the triangles adjacent to the chain edge are short, balanced, or locally ridge-following.

### 2. The support triangles are still too long in U

The core geometric defect is now local span, not missing topology. In a split sub-band, `constrainedSweepCell` still receives a top or bottom boundary row whose neighbors around the crossing anchor may be far away in U. When the nearest row vertices to the crossing are the super-cell flank boundaries or remote split points, the sweep emits long, slanted support triangles from the chain sub-edge out to flank-elevation vertices.

In other words, the chain segment is exact, but the 1-ring around it is under-resolved.

For a crossing anchor at $u_c$, the bad case is:

$$\Delta u_L = u_c - u_{prev}, \quad \Delta u_R = u_{next} - u_c$$

where either $\Delta u_L$ or $\Delta u_R$ remains large enough that the support triangle’s 3D aspect ratio explodes after projection. R37 reduced the vertical span in $t$; it did not sufficiently reduce the horizontal support span in $u$.

### 3. The chain-strip optimizer has no notion of an R37 protected corridor

The chain-strip optimizer only protects exact constrained chain edges via `constraintEdgeSet` in [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L572), [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L644), and [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L698). It does not protect the non-chain support edges around phantom rows.

At the same time, R37 intentionally widened the chain-strip region exposed to optimization by returning chain-adjacent grid vertices from [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1305) and forwarding them into the optimizer from [ParametricExportComputer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1531).

So the current pipeline does this:

1. Build a barely sufficient phantom-row corridor.
2. Classify a broad area as chain-strip.
3. Allow 22k+ edge flips over that area.
4. Protect only the exact chain polyline, not the local support fan that keeps the polyline visually straight.

That is consistent with the observed regression in non-manifold edges, boundary edges, inconsistent normals, and post-optimization valence.

### Root-Cause Judgment

The remaining dips are caused by a two-stage failure:

1. **Primary**: the phantom-row neighborhood around each crossing is still too sparse, so the support triangles adjacent to the chain remain long and slanted.
2. **Secondary**: the chain-strip and boundary optimizers can rewire that sparse neighborhood because they do not know the R37 phantom corridor has semantic importance.

This means the right R38 fix is not another coverage pass. It is a **local corridor quality pass**.

## Proposal

### Proposal 1: Adaptive Crossing Companion Fan + Protected Corridor (Recommended)

**Status**: ACCEPT, with Option 2 folded in as a required safeguard.

**Idea**: Keep R37’s band-splitting architecture, but densify each true column-crossing anchor locally by inserting one companion on each side of the crossing within the phantom row. Then freeze only that tiny corridor during chain-strip and boundary edge-flip optimization.

This is a targeted local repair, not a new tessellation regime.

### Mechanism

For each phantom-row crossing that corresponds to a true column-boundary crossing:

1. Keep the existing anchor vertex at `uCross`.
2. Identify its immediate phantom-row neighbors `uPrev` and `uNext` after sorting the row.
3. Insert a left companion and right companion only if the side span is still large.
4. Use these companions to subdivide the local row support so `constrainedSweepCell` emits shorter triangles next to the chain sub-edge.
5. Mark the anchor and its side companions as a protected corridor so the optimizers cannot immediately undo the local repair.

### Concrete UV construction

For each crossing anchor at $u_c$ with immediate row neighbors $u_{prev}$ and $u_{next}$:

$$u_L = u_c - \lambda_L (u_c - u_{prev})$$
$$u_R = u_c + \lambda_R (u_{next} - u_c)$$

with default:

- $\lambda_L = \lambda_R = 0.5$
- insert only if the side span exceeds a threshold

Suggested threshold:

$$\Delta u_{min} = \max(4 \cdot R37\_U\_MERGE, 0.35 \cdot \text{localColumnWidth})$$

This yields a midpoint fan by default, which is enough to cut the worst support span in half without materially increasing triangle count.

If a side span is already short, do not add a companion there.

### Why this works

R37 already guarantees that the chain passes through the anchor. The visual dip is created by the triangles *adjacent* to that anchor. Adding one side companion on each side converts one wide support wedge into two much smaller wedges.

That lowers the worst local aspect ratio and keeps the support normal closer to the chain-edge normal. The protected corridor then prevents later edge flips from replacing that small balanced fan with a long diagonal again.

## Exact Integration Points

### A. Extend the phantom-row data model in the tessellator

Change the section around [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1055).

Current structure:

```ts
interface PhantomRow {
    tCross: number;
    vertexIndices: number[];
}
```

Add crossing metadata:

```ts
interface PhantomCrossing {
    anchorIdx: number;
    leftCompanionIdx?: number;
    rightCompanionIdx?: number;
    sourceEdge: [number, number];
    isBoundaryCrossing: boolean;
}

interface PhantomRow {
    tCross: number;
    vertexIndices: number[];
    crossings: PhantomCrossing[];
}
```

Rationale: this keeps the existing band-splitting path intact while giving R38 a place to store corridor-local support vertices and later protect them.

### B. Densify only true crossing anchors during R37 row construction

Modify the phantom-row creation block at [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1153).

Current behavior:

- create row boundary vertices
- add crossing-point vertices for any edge crossing the phantom row
- sort by U

R38 behavior:

```ts
const protectedCorridorVertices = new Set<number>();

for (const tCross of dedupedTs) {
    const rowVerts: Array<{ u: number; idx: number }> = [];
    const crossings: PhantomCrossing[] = [];

    addBoundaryVertices(rowVerts, r37Sc.colStart, r37Sc.colEnd, unionU);

    for (const [ev0, ev1] of scEdges) {
        if (!edgeCrossesRow(ev0, ev1, tCross)) continue;
        const uCross = interpolateUCross(ev0, ev1, tCross);
        const anchorIdx = upsertRowVertex(rowVerts, uCross);
        crossings.push({
            anchorIdx,
            sourceEdge: [ev0, ev1],
            isBoundaryCrossing: crossesAnyInteriorColumnBoundary(ev0, ev1, r37Sc, unionU),
        });
    }

    rowVerts.sort((a, b) => a.u - b.u);

    for (const crossing of crossings) {
        if (!crossing.isBoundaryCrossing) continue;

        const anchorPos = rowVerts.findIndex(v => v.idx === crossing.anchorIdx);
        if (anchorPos <= 0 || anchorPos >= rowVerts.length - 1) continue;

        const uPrev = rowVerts[anchorPos - 1].u;
        const uAnchor = rowVerts[anchorPos].u;
        const uNext = rowVerts[anchorPos + 1].u;

        const localWidth = Math.max(uNext - uPrev, 1e-6);
        const minSideSpan = Math.max(4 * R37_U_MERGE, 0.35 * localWidth);

        if (uAnchor - uPrev > minSideSpan) {
            const uLeft = 0.5 * (uPrev + uAnchor);
            crossing.leftCompanionIdx = upsertRowVertex(rowVerts, uLeft);
        }
        if (uNext - uAnchor > minSideSpan) {
            const uRight = 0.5 * (uAnchor + uNext);
            crossing.rightCompanionIdx = upsertRowVertex(rowVerts, uRight);
        }

        protectedCorridorVertices.add(crossing.anchorIdx);
        if (crossing.leftCompanionIdx !== undefined) protectedCorridorVertices.add(crossing.leftCompanionIdx);
        if (crossing.rightCompanionIdx !== undefined) protectedCorridorVertices.add(crossing.rightCompanionIdx);
    }

    rowVerts.sort((a, b) => a.u - b.u);
    phantomRows.push({ tCross, vertexIndices: rowVerts.map(v => v.idx), crossings });
}
```

Notes:

- Reuse the existing R37 `upsert`/merge semantics so the fan does not create duplicates when two crossings are close.
- Only add companions for `isBoundaryCrossing === true`. Same-column row splits still need anchors for sub-edge partitioning, but they are not the dip driver.

### C. Preserve the current sub-band emission logic

The R37 emission block at [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1455) can remain structurally unchanged.

That is the point of this fix: `constrainedSweepCell` already knows how to work with richer monotone boundary rows. If `pr.vertexIndices` is denser around the crossing, the sub-band triangulation automatically improves without introducing a new mini-CDT path.

### D. Return a protected corridor set from the tessellator

Extend `OuterWallResult` near [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L70) and the return statement at [OuterWallTessellator.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1721).

Add:

```ts
protectedStripVertices: Set<number>;
```

Return both:

- existing `chainAdjacentVertices`
- new `protectedStripVertices`

### E. Thread that protection into the optimizer

Capture the new set in [ParametricExportComputer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1305), then pass it into both optimizer calls at:

- [ParametricExportComputer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1531)
- [ParametricExportComputer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1552)

Suggested parameter extension:

```ts
protectedVertices?: Set<number>;
```

### F. Reject edge flips that touch the protected corridor

In `ChainStripOptimizer.ts`, add the protection at the start of each phase loop after decoding the quad around the candidate shared edge.

Insertion points:

- Phase A around [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L565)
- Phase B around [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L637)
- Phase C around [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L692)

Pseudocode:

```ts
const touchesProtectedCorridor = (a: number, b: number, c: number, d: number): boolean =>
  protectedVertices !== undefined &&
  (protectedVertices.has(a) || protectedVertices.has(b) || protectedVertices.has(c) || protectedVertices.has(d));

if (touchesProtectedCorridor(shLo, shHi, opp0, opp1)) {
    continue;
}
```

This is intentionally conservative. It freezes only the 1-ring around a crossing anchor, not the whole super-cell.

### G. Also skip boundary-diagonal flips on protected quads

In `optimizeBoundaryDiagonals`, skip a standard quad if any of its four grid vertices are protected or if the adjacent chain-strip triangle references a protected phantom vertex.

Insertion point: the per-cell loop beginning at [ChainStripOptimizer.ts](c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L842).

Pseudocode:

```ts
if (protectedVertices && (
    protectedVertices.has(vBL) || protectedVertices.has(vBR) ||
    protectedVertices.has(vTL) || protectedVertices.has(vTR)
)) {
    continue;
}
```

This prevents the boundary pass from reintroducing a long diagonal immediately outside the corridor.

## Why the Other Options Are Weaker

### Option 1: Crossing companion fan

**Verdict**: ACCEPT, but not as originally stated.

This is the correct geometric direction, but it must be adaptive and it must be paired with local optimizer protection. If implemented alone, the optimizer can still rewrite the newly improved fan.

So the pure fan idea is necessary but not sufficient. The recommended fix is a refined version of Option 1 plus the minimal safe part of Option 2.

### Option 2: Protected phantom neighborhood

**Verdict**: ACCEPT only as a safeguard, not as the primary fix.

Freezing the current R37 neighborhood without adding local support vertices would just preserve bad geometry more faithfully. If the initial support wedge is already too wide, protection fossilizes the dip instead of removing it.

Protection makes sense only after the local fan is made good.

### Option 3: Local micro-strip tessellation

**Verdict**: REJECT for now.

This is attractive conceptually, but in practice it creates a second local meshing mode inside `emitSuperCell`. That means new boundary bookkeeping, new remap behavior, and new manifold risk right where R37 already increased fragility. It is more invasive than necessary given that `constrainedSweepCell` can already consume richer boundary rows.

Use the current sweep architecture more effectively before introducing a pocket-specific submesher.

### Option 4: Re-triangulate sub-bands with explicit chain corridor

**Verdict**: REJECT for now.

This is the strongest long-term architecture, but it is too close to a mini research project for the current requirement. It effectively implies local polygon clipping plus corridor-aware triangulation rules or a mini CDT. That is too much new machinery for a problem that now looks addressable by local row densification and flip protection.

## Expected Metrics to Improve

The intent is not only visual improvement but measurable local quality recovery.

### Hard invariants

- `R35 Chain edges missing=0` must remain unchanged.
- Phantom-row triangle count should rise only modestly: expect roughly `+3k` to `+7k` new vertices in the worst case if both side companions are inserted on most true crossings.
- Total triangle count should stay far below the “micro-row everywhere” alternatives.

### Primary quality targets

- `cross-row tris: 2-row` should drop from `101` to `< 20`
- `aspect ratios: >20` should drop from `178` to `< 40`
- `chain-strip 3D quality min_angle` should improve from `0.4°` to `> 1.5°`
- `chain-strip 3D quality max_aspect` should improve from `170.4:1` to `< 60:1`
- `chain-strip 3D quality avg_aspect` should improve from `6.4:1` to `< 4.5:1`
- `violations(>4:1)` should improve from `35.7%` to `< 20%`

### Optimizer-stability targets

- chain-strip flip count should materially drop because the protected corridor removes the most unstable local quads from consideration
- non-manifold edges should fall from `86` to `0` or near-zero
- inconsistent normal pairs should fall by at least 50%
- boundary edges should retreat sharply from the current regression spike

If the dips are visually gone but these metrics do not improve, that would mean the repair is overfitting the visible artifact while leaving broader mesh validity problems unsolved. That should be treated as failure.

## Recommended Approach

Implement **Adaptive Crossing Companion Fan + Protected Corridor** as the next step.

Why this is the right R38 move:

1. It directly attacks the current root cause: poor local support around an already-correct chain edge.
2. It reuses the proven R37 band-splitting pipeline and `constrainedSweepCell` instead of creating a new mesher.
3. It keeps the change localized to `OuterWallTessellator.ts`, `ParametricExportComputer.ts`, and `ChainStripOptimizer.ts`.
4. It is small enough to implement now, with low triangle-count risk.
5. It addresses both the initial geometry defect and the downstream optimizer regression in one coherent patch.

## Open Questions

1. Should the side companion insertion threshold be based on raw UV span, local column width, or 3D arc-length estimated from neighboring samples?
2. Is vertex-level protection sufficient, or should the optimizer receive an explicit `protectedEdgeSet` instead?
3. Should same-column split points ever receive companions, or should R38 stay strictly limited to true column-boundary crossings?
4. If the protected corridor fixes validity but not all residual visual dip, the next escalation should be an explicit corridor-aware sub-band retriangulation, not another global pass.