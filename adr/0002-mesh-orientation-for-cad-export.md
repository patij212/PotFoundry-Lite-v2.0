# ADR 0002: Coherent, Outward-Facing Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry meshes are exported (binary STL today; OBJ/3MF and direct
Grasshopper/Rhino interchange on the roadmap) and opened in CAD tools. In those
tools, triangle **winding order** determines face direction. Two invariants must
hold for a clean import:

1. **Coherent orientation** — every interior edge is traversed in opposite
   directions by its two adjacent triangles. Equivalently, for a closed
   manifold, every *directed* edge `(a, b)` appears exactly once. A directed
   edge appearing twice means two neighbouring faces disagree on winding, which
   Rhino/Grasshopper render as flipped/black faces at that seam.
2. **Outward normals** — the closed shell must enclose **positive** signed
   volume (divergence theorem). Negative signed volume means the solid is
   inside-out: every face imports flipped and downstream operations (offset,
   boolean, thicken, mesh→NURBS) break.

### What we measured (root-cause investigation)
The existing `test_mesh_is_watertight` only counts *undirected* edges (each must
appear twice), which the mesh passed — but watertight ≠ coherently oriented.
`test_mesh_has_consistent_normals` was a **no-op** (`pass  # Skip strict check`).

Probing the generated mesh for every style revealed two real defects:

- **Globally inside-out.** Signed volume was *negative* for all five styles
  (e.g. SuperformulaBlossom ≈ −105 627), i.e. all normals pointed inward.
- **Locally incoherent at the drain.** Exactly `2 · n_theta` directed edges
  were duplicated, all at `z = 0` and `z = t_bottom`. Section-level analysis
  pinned the cause to the **slab-top** and **drain-cylinder** face blocks being
  wound opposite to the rest of the shell. A brute-force flip search confirmed
  that reversing exactly those two sections makes the whole mesh coherent.

## Decision
Fix the root cause at construction and add a cheap global guard, in both
`potfoundry/core/geometry.py` (the exported/used path) and the legacy
`potfoundry/geometry.py` fallback:

1. **Reverse the winding of the slab-top and drain-cylinder triangles** so the
   drain junction is coherent with the inner wall and base.
2. **Global outward guard** (`_orient_faces_outward`): after assembly, compute
   the signed volume and reverse *all* winding if it is negative. This is O(M),
   fully vectorized (`faces[:, ::-1]`), and adds negligible cost (~0 ms;
   168×84 generation stays ~28 ms vs the 200 ms budget). It also future-proofs
   the mesh against geometry changes that might flip the majority orientation.

We deliberately did **not** add a general BFS coherent-orientation pass: it is
graph traversal that risks the performance budget at high resolution, and the
construction-level fix addresses the actual root cause.

## What was proved (tests)
New `tests/test_mesh_orientation.py`, parametrized over all styles:

- `test_orientation_is_coherent` — every directed edge appears exactly once.
- `test_normals_point_outward` — signed volume > 0.
- `test_orientation_holds_with_twist` — invariants survive spin/twist.
- `test_face_normals_point_out_of_material` — a vectorized Möller–Trumbore
  ray-parity point-in-solid test confirms that stepping `+normal` from a face
  centroid lands *outside* the solid and `−normal` lands *inside*. This is
  geometry-independent and holds for the non-convex petal styles where a simple
  radial-direction heuristic gives ~50–60% (and is why the original test
  punted).

`test_golden_meshes.py::test_mesh_has_consistent_normals` was upgraded from a
no-op to assert coherence + positive volume + non-degenerate normals.

The exported binary STL now stores facet normals that agree with winding for
100% of facets (7680/7680 checked), and all are outward.

## Consequences
- Meshes import into Rhino/Grasshopper with correct, unflipped faces — no manual
  "Unify Mesh Normals" / "Flip" step required.
- Vertex/face counts, dimensions, and surface area are unchanged; only winding
  changes, so golden-metric and determinism tests are unaffected.
- The signed-volume guard is a permanent invariant any future geometry section
  (lids, feet, handles) will inherit automatically.
