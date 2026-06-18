# ADR 0002: Mesh Orientation Normalization for CAD/Slicer Export Quality

## Status
Accepted

## Context

PotFoundry exports pot meshes as STL for downstream use in slicers and,
increasingly, in CAD / parametric workflows (Rhino, Grasshopper). These tools
treat a triangle mesh as a *closed solid* only when the surface is a single
coherently-oriented manifold whose triangle normals all point **outward**.
The STL format itself encodes orientation twice — once in the stored facet
normal and once in the right-hand winding of the three vertices — and the two
must agree.

`build_pot_mesh()` assembles the solid from several independently-authored
patches: outer wall, inner wall, rim cap, base underside, base-slab top, and
the drain cylinder. Each patch was wound by hand. Investigation (TDD probes,
divergence-theorem signed volume) revealed two defects present for **every**
style and parameter set:

1. **Inverted global orientation.** The signed volume
   `V = (1/6) Σ vᵢ·(vⱼ×vₖ)` was *negative* for all styles, i.e. the net
   winding pointed normals inward. An inward-facing solid imports "inside-out"
   in Rhino and breaks boolean / offset / wall-thickness operations.

2. **Incoherent orientation.** The mesh was watertight (every undirected edge
   shared by exactly two faces) but **not** coherently oriented: 240 edges —
   precisely the two base rings (the `z=0` outer ring and the `z=t_bottom`
   inner ring) — were traversed in the *same* direction by both incident
   faces. The base-underside and slab-top caps were wound opposite to the
   walls they join. A simple global flip therefore could not fix it.

The pre-existing watertightness test only covered one style at one resolution,
and the "consistent normals" golden test was a no-op (`pass`), so neither
defect was caught.

## Decision

Add a single orientation-normalization pass, `orient_faces_outward(verts,
faces)`, applied at the end of `build_pot_mesh()` (and the legacy
`potfoundry.geometry` fallback) before faces are returned. It performs the
standard two-step normalization:

1. **Coherent orientation** — flood-fill across shared edges, modelled as a
   2-colouring: assign each face a flip bit such that `flip[a] XOR flip[b]`
   equals whether faces `a` and `b` traverse their shared edge in the same
   direction. This guarantees neighbouring triangles disagree on edge
   direction (the manifold-orientation invariant).
2. **Outward flip** — if the resulting signed volume is negative, reverse all
   faces so normals point outward.

The adjacency graph is built vectorized with numpy (edge keys, argsort,
grouping); only the colouring BFS is a Python loop. Cost at the default
168×84 / 57 792-face resolution is ~10 ms, keeping `build_pot_mesh` under the
200 ms performance budget.

This is deliberately a *general* fix rather than re-winding the specific caps
by hand: any future patch, style, or parameter combination is normalized
automatically, so export quality is guaranteed by construction rather than by
the correctness of each hand-authored patch.

## Consequences

- Exported STLs are conformant closed solids: stored facet normals agree with
  vertex winding (verified 100% of facets), suitable for Rhino/Grasshopper
  solid recognition and clean slicing.
- New regression coverage in `tests/test_mesh_orientation.py`: positive signed
  volume and coherent winding across all styles, with and without spin; plus a
  plausible-volume sanity bound. The golden-mesh "consistent normals" test is
  now a real signed-volume assertion instead of a no-op.
- Mesh vertex/face **counts** and geometry are unchanged; only triangle
  winding (column order) may change. No stored golden hashes existed, so no
  regression baselines needed updating.
- `orient_faces_outward` is exported from the package as a reusable utility.

## Alternatives Considered

- **Global flip only** — rejected: cannot repair the incoherent base-ring
  winding (it would leave 240 edges inconsistent).
- **Hand-re-winding the two base caps** — rejected as a surface fix: correct
  today but fragile against future patches/styles; does not establish an
  invariant.
- **Delegating repair to the slicer / Rhino MeshRepair** — rejected: shifts a
  fixable upstream defect onto every user and every tool, and several CAD
  operations refuse to run on a non-solid in the first place.
