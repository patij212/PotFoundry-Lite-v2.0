---
name: tessellation-knowledge
description: Use when choosing or evaluating a meshing/tessellation algorithm, reasoning about chord error, triangle quality, slivers, anisotropy, or watertightness, or deciding refine-vs-remesh-vs-accept for the PotFoundry parametric export. Covers Delaunay/CDT, Ruppert/Chew refinement, the Riemannian (metric-tensor) formulation, CVT/ODT smoothing, quad/field-aligned remeshing, and decimation — mapped to this project's files and the gmsh/Triangle/libigl engines.
---

# Tessellation & 3D Meshing — SOTA Knowledge (PotFoundry)

## Overview
The PotFoundry export meshes **radial parametric surfaces** `S(θ,z) = (r(θ,z)·cosθ, r(θ,z)·sinθ, z)`, `θ=2πu, z=tH`. Almost every meshing question here reduces to one idea:

> **Mesh the `(u,t)` parameter rectangle under the surface's own metric, then lift to 3D.** Chord error, sizing, and anisotropy are all governed by the surface's first/second fundamental forms — not by the `(u,t)` grid.

**Epistemic rule for this skill:** every claim is either **cited** to a canonical method OR tagged **`[measured-in-project]`** with where. Do not add unsourced assertions.

## When to use
- Picking a meshing strategy (uniform grid? quadtree? CDT? metric-Delaunay? quad remesh?).
- Reasoning about a chord/quality/sliver result, or why a fix regressed.
- Deciding to **refine**, **remesh**, or **accept-and-document** a residual.
- Before hand-rolling something an engine already does (check the SOTA + the [[oracle-harness]] first).
Not for: running experiments (that's [[meshing-research]]) or driving the engines (that's [[oracle-harness]]).

## The map — method → reference → engine → in-house → pitfall

| Topic | Canonical method | Engine | In-house file | Pitfall |
|---|---|---|---|---|
| Delaunay & CDT | empty-circumcircle; Lawson flips; constrained DT; Shewchuk **robust predicates** | Triangle, gmsh | `cdt2d`, `ConstrainedCellTriangulator` | `[measured-in-project]` cdt2d **crashes on non-planar PSLG** → planarize crossing constraints first |
| Quality refinement | **Ruppert**, **Chew-2** (min-angle guarantee, encroachment, radius-edge ratio) | Triangle (`q`), gmsh | `CellQualityRefinement` | `[measured-in-project]` refinement *creates* 2:1 transitions which *create* slivers — chord & quality conflict through the mesher |
| Sizing & the **Riemannian metric** | chord sag `≈ ½ κ L²`; size field `h=√(8·tol/κ)`; **anisotropic metric tensor** `M` from the second fundamental form (Frey-George, BAMG) | gmsh background metric/view | `SurfaceMetricTensor`, `PullbackMetric`, `MetricSizingField`, `buildIsotropicSizingField` | isotropic `h` over-refines a cylinder's flat axis; anisotropy needs the full `M` (Task 6) |
| CVT / ODT smoothing | Lloyd relaxation; **Centroidal Voronoi** (Du); **Optimal Delaunay** (Chen); Lévy anisotropic CVT | gmsh (`Optimize`), libigl | *(GAP — no in-house CVT)* | smoothing ≠ refinement; it fixes angles a refined mesh still has bad |
| Surface meshing & watertightness | mesh `(u,t)` under `M`, lift; periodic seam; **watertight = shared boundary vertices by index** | gmsh | `WatertightAssembly`, `PeriodicSeamClosure`, `ConformingOuterWall` | `[measured-in-project]` audit by **index** not position; u-seam f32/f64 strand-flip needs crease exclusion |
| Quad & field-aligned | cross/frame fields; period jumps; **Instant-Meshes** (Jakob), **QuadCover**, **QuadriFlow** (Blender) | Blender QuadriFlow | *(GAP — no in-house quad path)* | quad edge-flow follows curvature directions; triangles staircase diagonal ridges |
| Remeshing & decimation | isotropic remeshing (Botsch-Kobbelt); **QEM** decimation (Garland-Heckbert) | libigl, `meshoptimizer` | `decimateConforming` | `[measured-in-project]` decimation **injects slivers** (a named defect class); `lockBorders` to preserve seams |

## Core concepts (the load-bearing few)
- **Delaunay maximizes the minimum angle** among triangulations of a fixed point set — but you control the *points*, so quality comes from **point placement** (refinement/CVT), not just the triangulation.
- **Constrained DT (CDT)** forces required edges (features) into the mesh; it is *not* Delaunay at constrained edges. PSLG constraints must be **planar** (no crossings) — split crossings first.
- **Ruppert/Chew** add Steiner points at encroached-segment midpoints / skinny-triangle circumcenters until a min-angle bound holds; terminates for angles ≲ 20–34°.
- **The chord-control metric is the unifying lever.** For target chord `tol`, the parameter-edge length is `h = √(8·tol / |S_dd|)` where `|S_dd|` is the second-difference magnitude in that direction (it carries the `(u,t)→mm` scale — no speed division). Anisotropic = a 2×2 metric `M` whose eigenvectors/values are the principal curvature directions/`√(κ/tol)` — gmsh consumes `M` as a background view (`[measured-in-project]` the gmsh PostView path works in 4.13.1).
- **Why the in-house mesher slivers** `[measured-in-project]`: the periodic-balanced quadtree's **2:1 transition-fan templates** are the structural sliver source (100% `TRANSITION_FAN` by `TRI_SOURCE`); a **transition-free** mesh (proper Delaunay everywhere, no templates) is the only escape — i.e. a full anisotropic metric-Delaunay mesher. Measure whether an engine already does this before building it.

## Quick decision: refine / remesh / accept
- Chord too high, quality OK → **refine** (more points where `κ` is high; the metric field).
- Quality bad (slivers), chord OK → **remesh / smooth** (CVT/ODT or a transition-free Delaunay), NOT refine (refinement adds transitions → more slivers).
- Designed near-vertical cliff / true discontinuity → **accept + document** (radial chord overstates it; perp-3D ≈ tiny). See `analyticSurfaceGate` crease/straddle exclusion.

## Common mistakes
- Reaching for a denser uniform grid to fix slivers (density is sliver-invariant `[measured-in-project]`).
- Treating radial chord as the truth on steep relief (use **perpendicular-3D**; radial overstates).
- Comparing meshes at unequal triangle budget (quality at unequal density is meaningless).
- Hand-rolling anisotropic Delaunay before measuring gmsh/Triangle on the same surface via [[oracle-harness]].
