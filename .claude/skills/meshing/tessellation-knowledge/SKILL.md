---
name: tessellation-knowledge
description: Use when choosing or evaluating a meshing/tessellation algorithm, reasoning about chord error, triangle quality, slivers, anisotropy, watertightness, or whether to mesh the flat (u,t) UV vs the 3D surface directly, for the PotFoundry parametric export. Covers Delaunay/CDT, Ruppert/Chew refinement, the Riemannian (metric-tensor) formulation, CVT/ODT smoothing, quad/field-aligned remeshing, decimation, UV-parametric vs direct 3D-surface (restricted Delaunay) meshing, and the metric blind spots (chord-p99, %<20°) — mapped to this project's files and the gmsh/Triangle/libigl engines.
---

# Tessellation & 3D Meshing — SOTA Knowledge (PotFoundry)

## Overview
The PotFoundry export meshes **radial parametric surfaces** `S(θ,z) = (r(θ,z)·cosθ, r(θ,z)·sinθ, z)`, `θ=2πu, z=tH`. Almost every meshing question here reduces to one idea:

> **Mesh the `(u,t)` parameter rectangle under the surface's own metric, then lift to 3D.** Chord error, sizing, and anisotropy are all governed by the surface's first/second fundamental forms — not by the `(u,t)` grid.

**That is the DEFAULT, not the law** `[measured 2026-06-26]`: a UV metric is only as accurate as its sampling — a band-limited one mushes the relief — and the alternative is to mesh the **3D surface directly**. The two questions that decide quality here: *is the metric accurate enough to capture the relief?* and *am I measuring fidelity/quality in 3D, not via a 2D proxy?* (see the UV-vs-3D-direct fork in the map + concepts).

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
| **UV-metric vs 3D-DIRECT meshing** (the fork) | mesh `(u,t)` under `M` + lift (criteria = 2D proxy) **vs** **restricted / surface Delaunay refinement** on the real surface (Boissonnat-Oudot; CGAL surface mesher) — criteria = real 3D deviation + 3D angles | gmsh (both); pyacvd / libigl (surface remesh); Blender QuadriFlow | the whole `(u,t)` pipeline is UV-metric | `[measured 2026-06-26]` UV-metric quality is only as good as `M`: a band-limited `M` UNDER-tessellates → mushes the relief (clean angles, lost shape). 3D-direct measures the real surface (robust to relief) + the u-seam VANISHES, but needs boundary-constraint machinery for the cap/ring watertight edges |
| Quad & field-aligned | cross/frame fields; period jumps; **Instant-Meshes** (Jakob), **QuadCover**, **QuadriFlow** (Blender) | Blender QuadriFlow | *(GAP — no in-house quad path)* | quad edge-flow follows curvature directions; triangles staircase diagonal ridges |
| Remeshing & decimation | isotropic remeshing (Botsch-Kobbelt); **QEM** decimation (Garland-Heckbert) | libigl, `meshoptimizer` | `decimateConforming` | `[measured-in-project]` decimation **injects slivers** (a named defect class); `lockBorders` to preserve seams |

## Core concepts (the load-bearing few)
- **Delaunay maximizes the minimum angle** among triangulations of a fixed point set — but you control the *points*, so quality comes from **point placement** (refinement/CVT), not just the triangulation.
- **Constrained DT (CDT)** forces required edges (features) into the mesh; it is *not* Delaunay at constrained edges. PSLG constraints must be **planar** (no crossings) — split crossings first.
- **Ruppert/Chew** add Steiner points at encroached-segment midpoints / skinny-triangle circumcenters until a min-angle bound holds; terminates for angles ≲ 20–34°.
- **The chord-control metric is the unifying lever.** For target chord `tol`, the parameter-edge length is `h = √(8·tol / |S_dd|)` where `|S_dd|` is the second-difference magnitude in that direction (it carries the `(u,t)→mm` scale — no speed division). Anisotropic = a 2×2 metric `M` whose eigenvectors/values are the principal curvature directions/`√(κ/tol)` — gmsh consumes `M` as a background view (`[measured-in-project]` the gmsh PostView path works in 4.13.1).
- **Why the in-house mesher slivers** `[measured-in-project]`: the periodic-balanced quadtree's **2:1 transition-fan templates** are the structural sliver source (100% `TRANSITION_FAN` by `TRI_SOURCE`); a **transition-free** mesh (proper Delaunay everywhere, no templates) is the only escape — i.e. a full anisotropic metric-Delaunay mesher. Measure whether an engine already does this before building it.
- **UV-metric meshing vs 3D-DIRECT — the architectural fork `[measured 2026-06-26]`.** Meshing `(u,t)` under a metric `M` is only as faithful as `M`: a band-limited/discrete `M` under-sizes the relief, so the mesh comes out **clean-angled but shape-losing** (gmsh mushed BasketWeave, jagged Gyroid at tol=0.05 — the worst failure mode, and the chord-p99 gate was blind to it). **Direct 3D-surface meshing** — restricted/surface Delaunay refinement (Boissonnat-Oudot; CGAL surface mesher), or a surface-CVT/Botsch remesh of a dense reference — places & refines triangles by the **real 3D surface deviation + real 3D angles**, no lossy 2D-metric proxy → captures relief robustly, no 2:1 templates, and the **u-seam vanishes** (it's a pure UV artifact: u=0≡u=1 are the same 3D points). Costs: the surface is still *evaluated* via `(u,t)`; the cap/ring (`t=0/1`) watertight boundaries need *constraining* into the 3D mesher. For PotFoundry's near-isometric cylinder-unroll an *analytic* (non-band-limited) `M` + transition-free Delaunay may suffice — a measurable question, not an intuition (run it via [[oracle-harness]]).

## Quick decision: refine / remesh / accept
- Chord too high, quality OK → **refine** (more points where `κ` is high; the metric field).
- Quality bad (slivers), chord OK → **remesh / smooth** (CVT/ODT or a transition-free Delaunay), NOT refine (refinement adds transitions → more slivers).
- Designed near-vertical cliff / true discontinuity → **accept + document** (radial chord overstates it; perp-3D ≈ tiny). See `analyticSurfaceGate` crease/straddle exclusion.

## Common mistakes
- Reaching for a denser uniform grid to fix slivers (density is sliver-invariant `[measured-in-project]`).
- Treating radial chord as the truth on steep relief (use **perpendicular-3D**; radial overstates).
- Comparing meshes at unequal triangle budget (quality at unequal density is meaningless).
- Hand-rolling anisotropic Delaunay before measuring gmsh/Triangle on the same surface via [[oracle-harness]].
- Trusting chord-**p99** or `%<20°` alone `[measured 2026-06-26]`: p99 is blind to under-tessellation (a mushed relief has the same p99); `%<20°` *dilutes* under refinement. Score fidelity by **RMS/coverage**, slivers by **minAngle**, and check a flat-shaded **3D render** — if it disagrees with the metric, the metric is wrong.
- Assuming "mesh the flat `(u,t)`" is the only option — for a relief-heavy surface, **3D-direct** (restricted Delaunay / surface remesh) may capture the shape where a band-limited UV metric can't (the fork above).
