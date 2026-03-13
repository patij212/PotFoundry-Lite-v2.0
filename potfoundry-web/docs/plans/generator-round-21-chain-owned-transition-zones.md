# Generator Round 21 — Chain-Owned Transition Zones Instead of Global U Injection

Date: 2026-03-11

## Problem Statement

The current outer-wall path still gives the feature-edge zone to the global grid first and only then tries to repair quality locally. That is the wrong owner model for the user’s requirement. The user does not want more global U columns; they want the feature chains to own the near-feature tessellation zone, with local triangle sizing driven by local curvature and 3D shape quality rather than by inherited grid columns.

## Problem Framing

- The active outer-wall grid is still generated once, globally, from a density profile built as `max(kappa^2, Gaussian(chain_u))`, then inverted into a single `unionU` column set. This happens in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421) and [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1422), using [GridBuilder.ts](../../src/renderers/webgpu/parametric/GridBuilder.ts#L235) and [GridBuilder.ts](../../src/renderers/webgpu/parametric/GridBuilder.ts#L153). That means chain influence is still global-column influence, not local strip ownership.
- The live tessellator no longer has the old CDT strip path; it is a cell-local and super-cell sweep system. `buildCDTOuterWall()` in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L814) builds `cellChainMap`, emits `fusionRequests`, merges to `superCellMap`, and then resolves chain regions through `sweepQuad()` and `constrainedSweepCell()` in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L259), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L417), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1010), and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2138). That architecture is still grid-cell-first.
- R54 fusion and R55 coalescing improve failure cases, but they are post-hoc corrections inside the inherited grid topology. They reduce pathological narrow cells and near-coincident pin triangles; they do not stop the feature zone from inheriting the global column scaffold in the first place. See [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L199), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L213), and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L316).
- Round 18 correctly identified the structural issue as grid structure bleeding into chain strips. The 2026-03-01 redesign correctly shifted toward feature-only constraints plus graded bridging. Round 20 showed that better local companions can improve the first layer, but the Verifier also called out that only an explicit fan or explicit local ownership really eliminates grid-column influence. This proposal takes that next step instead of trying to further tune inherited cell sweeps.

## Root Cause Analysis

### Root cause 1: The global U grid still owns the feature zone before the chain does

`unionU` is built once for the entire outer wall from a global density profile with a Gaussian feature floor around all chain U positions. That means near-feature density is expressed as “more columns everywhere those chains pass through,” not “a local strip that the chain owns.” The effect is exactly what the user rejected: multiple chains that share similar U ranges globally densify the same columns, and the resulting triangles near the feature still inherit the same coarse or misaligned global column logic.

Relevant code:

- [GridBuilder.ts](../../src/renderers/webgpu/parametric/GridBuilder.ts#L235): `buildDensityProfile()` uses `kappa^2` plus Gaussian floors around every chain U.
- [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421): density profile built from `uCurvature` and `chainVertexUs`.
- [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1422): `generateCDFAdaptivePositions()` turns that into one global `unionU`.

### Root cause 2: Chain topology is embedded into grid cells instead of owning an independent local domain

The current outer-wall path maps chain vertices into `cellChainMap`, then assigns each chain edge to same-column cells or cross-column super-cells. Once that happens, the chain is no longer defining a local tessellation region; it is only partitioning pre-existing grid cells. Cross-column chains trigger `fusionRequests` and super-cells rather than a chain-owned remeshing region.

Relevant code:

- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L919): chain vertices assigned to cells.
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1010): cross-column edges become `fusionRequests`.
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1150): fusion requests merged into `superCellMap`.

### Root cause 3: Local quality is decided by monotone sweep decomposition, not by a metric-aware local remeshing objective

Even after R54/R55 and fan-diagonal protection, the immediate feature zone is still triangulated by `sweepQuad()` or `constrainedSweepCell()`, both of which operate on bottom/top edge arrays inherited from the grid-cell decomposition. Their objective is combinatorial validity inside a U-monotone cell or super-cell, not “minimize 3D aspect ratio around the feature with area concentrated where curvature requires it.” That mismatch is why the system can preserve the edge yet still produce poor local triangle shape.

Relevant code:

- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L259): `sweepQuad()` chooses diagonals locally inside inherited edge rails.
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L417): `constrainedSweepCell()` still resolves within the cell framework.
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1759): `emitChainCell()` builds bottom and top edge rails from grid corners plus chain vertices.
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1991): `emitSuperCell()` does the same for merged columns.

### Root cause 4: R54 fusion and R55 coalescing are symptom controls, not ownership changes

R54 fuses narrow chain-adjacent cells. R55 drops or remaps grid vertices near chain vertices. Both are valuable for preventing known slivers and T-junctions, but they still assume the feature zone is fundamentally a corrected version of a global-grid cell complex. That is why the quality ceiling remains low: the system is editing inherited topology instead of constructing topology that is chain-first from the start.

## Proposals Considered

### Proposal 1: Pure feature-only local CDT with graded bridge vertices

This is directionally correct and was already foreshadowed by the 2026-03-01 redesign. Its weakness is that “local CDT” by itself is too under-specified. If the bridge vertices are not generated by an explicit shell or band ownership model, the grid boundary still leaks back in through the local domain boundary.

### Proposal 2: Explicit chain-owned transition bands or shells

This is the strongest basis for replacing grid inheritance. The chain defines a centerline. Around that centerline, we create explicit offset bands or shells whose spacing is driven by a metric target, not by global column locations. This produces an actual near-feature domain that belongs to the chain.

### Proposal 3: Strip-local remeshing by 3D metric target

This is necessary, but it works best as the triangulation policy inside Proposal 2 rather than as a standalone answer. Metric-aware remeshing needs a domain and boundary definition. The chain-owned shells provide that domain.

## Recommended Architecture

I recommend a hybrid architecture: explicit chain-owned transition shells plus local feature-only constrained CDT inside those shells, with a graded bridge seam to the global base grid. This is not global U-column injection. It is local domain replacement.

- Build the global outer-wall base grid from curvature only, not from chain Gaussian floors, once chain-owned zones exist. The base grid should describe the non-feature surface budget; the chains should no longer spend global column budget merely by existing. In practice this means the `chainVertexUs` term in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421) becomes unnecessary for the outer wall after the new local path lands.
- After `meshChains` are finalized, derive a chain-owned local domain for each chain edge segment or merged chain corridor. The natural unit is not a grid cell; it is a chain corridor spanning one or more adjacent row bands where the same feature edge persists.
- For each corridor, generate 2 to 4 explicit offset shells on each side of the chain using a local 3D metric target. The shell spacing should be chosen so that after GPU evaluation, triangles adjacent to the chain approach near-1:1 aspect ratio in 3D, with spacing shrinking where circumferential stretch or local curvature demands it.
- Treat only the actual feature chain edges as hard constraints inside the local domain. Shell vertices and bridge vertices are free Steiner points. This preserves the 2026-03-01 “feature-only constraints” insight while making the near-feature region genuinely chain-owned rather than grid-owned.
- Terminate the chain-owned domain at an explicit outer shell, not at the raw global grid columns. That outer shell becomes the handoff seam. The global grid is only allowed to attach at this seam, never directly to the feature edge.
- Build graded bridge vertices from the outer shell to the host grid only where needed. This bridge should be sparse, localized, and one-way: it adapts the chain-owned shell to the host grid, rather than letting the host grid dictate shell topology. Think of it as a seam collar, not a strip interior.
- Triangulate the entire local corridor with a local constrained CDT or constrained remesher whose input vertices are: chain vertices, shell vertices, seam-collar bridge vertices, and seam intersection anchors with the host grid. The local triangulator owns all triangles between chain and outer shell.
- Keep the current standard-cell emission path for regions with no chain ownership. `emitStandardCell()` can remain. What changes is that `emitChainCell()` and `emitSuperCell()` stop trying to solve the near-feature zone by sweeping inherited cell edges.
- Stitch the local corridor back to the host grid through explicit seam polygons. The seam must be manifold by construction: every host-grid edge touched by the local domain gets split once, and only at seam-collar anchors. This replaces the present dependence on R55-style opportunistic coalescing as the main stitching mechanism.
- Preserve the existing R52 precision guarantee: chain vertices must remain exact, never merged toward grid vertices. The new design is aligned with that invariant because the chain owns the local domain; it does not need approximation to nearby columns.

## Why This Is Better Than U-Column Injection

- U-column injection still treats the feature problem as a global sampling problem. It spends triangles across every row that shares those columns, even when only a small subset of rows and bands actually need feature-local resolution. The proposed corridor model localizes that spend to the chain’s actual neighborhood.
- U-column injection does not change topology ownership. Even exact injected columns still leave the strip triangulation inheriting the global cell/super-cell scaffold. The proposal changes ownership: chain to shell to seam collar, then host grid.
- U-column injection cannot guarantee that no triangle directly links the feature edge to coarse grid structure, because the feature edge still lives inside the same global column arrangement. The proposed outer-shell handoff makes that prohibition explicit.
- U-column injection is poor when several chains share nearby U ranges. Their demands alias into the same columns and globally densify the mesh. The proposed local corridors remain separate unless they geometrically overlap, which is the right merge criterion.
- U-column injection is column-centric, so it optimizes where columns land, not whether the resulting triangles are well-shaped in 3D. The proposed shells are metric-centric, so they can target 3D triangle quality directly.

## Exact Current-Code Root Causes This Addresses

1. It removes the need for the outer wall to use `buildDensityProfile(uCurvature, chainVertexUs, ...)` as its main feature-preservation mechanism in [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421). That is the global-bleed root cause.
2. It bypasses the `cellChainMap -> fusionRequests -> superCellMap` control flow in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L919), [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1010), and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1150) for near-feature regions, which is the grid-ownership root cause.
3. It replaces `emitChainCell()` and `emitSuperCell()` as the primary near-feature triangulation path in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1759) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1991), which is where inherited bottom/top edge rails force the sweep-based topology.
4. It demotes R54 fusion and R55 coalescing from being the main local-quality mechanism in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1073) and [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2191) to fallback seam and degeneracy handling only.
5. It is compatible with Round 18’s diagnosis, the 2026-03-01 feature-only bridge idea, and Round 20’s conclusion that better local point clouds alone do not fully solve grid inheritance.

## Implementation Shape

### Phase A: Introduce a chain-owned corridor builder

Create a new local-domain builder that consumes `meshChains`, final row positions, and current host-grid geometry, and emits:

- corridor polygons per chain or merged chain cluster
- shell vertices per corridor
- seam-collar bridge vertices per corridor
- explicit host-grid seam anchors that split touched host-grid edges once

This belongs conceptually beside `buildCDTOuterWall()`, but it should not be embedded inside `cellChainMap` logic.

### Phase B: Replace chain-cell and super-cell emission inside owned corridors

When a host-grid band/column falls inside a chain-owned corridor, do not route it through `emitChainCell()` or `emitSuperCell()`. Instead, hand the corridor to a local constrained triangulator. The local triangulator returns triangles plus seam-edge splits.

### Phase C: Keep the non-feature grid path untouched

Cells outside owned corridors still use `emitStandardCell()`. This preserves the current fast grid path for most of the wall and keeps the change local to where the user actually cares.

### Phase D: Remove chain floors from the outer-wall global density profile

Once the local corridor path is stable, remove or drastically reduce chain-driven Gaussian floors from the outer-wall `unionU` build. The global grid should stop pretending to solve near-feature fidelity.

## Key Risks

- Corridor overlap and merge rules are non-trivial. Two nearby chains should share a corridor only when their shell domains genuinely intersect, not merely because they occupy similar U values on different rows. This needs explicit geometric tests in `(u, t)` and not column coincidence.
- Seam stitching can easily recreate the same pathology under a new name if seam anchors are allowed to follow raw host-grid columns. The seam collar must be the only allowed bridge between local corridor and host grid.
- A purely UV-space shell spacing rule will repeat the same error as earlier strip work. Shell spacing must be based on a simple local metric estimate that captures circumferential stretch and band height, then validated after GPU evaluation.
- Corridor construction at seam wrap regions needs a circular-domain policy, otherwise a chain near `u = 0/1` will split into incorrect local domains or create oversized collar seams.
- There is a risk of over-building local corridors if every chain point independently emits shells. The right granularity is corridor segments or merged chain runs, not per-vertex fans.

## Evidence Needed Before Implementation

- A corridor-overlap study on existing problematic styles: measure how often nearby but distinct chains would merge under shell intersection versus under naive shared-column logic.
- A 3D metric study using current GPU-evaluated vertices: estimate the ratio between UV spacing and 3D edge length across radius extremes, then derive an initial shell-spacing rule from real data rather than guessed constants.
- A seam audit: for a few representative corridors, count how many host-grid edges would need splitting and verify that the collar seam stays localized rather than exploding into pseudo-global remeshing.
- A triangle-quality comparison on archived failing cases: current OWT chain zone versus prototype corridor remesh, measured by 3D aspect ratio, min angle, and count of direct feature-to-host-grid triangles.
- A manifoldness proof sketch for the seam collar: every local corridor boundary edge must correspond to exactly one host-grid seam decomposition on the other side.

## Recommended Approach

Replace the chain-strip path with a more local triangulation model inside `OuterWallTessellator`, rather than extending the current chain-cell and super-cell sweep logic.

More precisely:

- Keep `buildCDTOuterWall()` as the overall outer-wall orchestrator.
- Keep `emitStandardCell()` for non-feature regions.
- Replace the current near-feature branch (`emitChainCell()`, `emitSuperCell()`, and the R54/R55-driven local repair stack) with a chain-owned corridor remeshing subsystem.

This is not a full outer-wall rewrite. It is a targeted replacement of the topology owner for feature-adjacent regions. That is the smallest architectural move that actually solves the user’s stated complaint.

## Open Questions For Verifier

1. Should the initial corridor shell count be fixed at 3 plus collar, or adaptive from measured local 3D stretch and edge curvature?
2. Is it sufficient to demote chain Gaussian floors in the global `unionU` build, or should they be removed entirely once corridor ownership is live?
3. What is the best corridor merge rule when two chains of different kind approach each other without crossing: shell intersection, shared seam anchors, or explicit feature-family separation?
4. Should the local remesher be a constrained CDT first, with a later optional metric-relax pass, or should the first implementation already include one local post-triangulation quality pass?