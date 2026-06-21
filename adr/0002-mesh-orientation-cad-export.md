# ADR 0002: Consistent Outward Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry generates triangle meshes that users export (binary STL today; OBJ /
3MF / STEP are on the roadmap) and round-trip through CAD/parametric tools such
as **Rhino** and **Grasshopper**, as well as slicers. Those tools require an
imported mesh to be a *consistently oriented* manifold with face normals
pointing **out of** the solid. When that invariant is violated they report
errors like "mesh has inconsistent normals" / "mesh is not oriented" and refuse
to convert the mesh to a closed solid / NURBS, which is the headline
"grasshopper/rhino export quality" goal.

### What we found
The existing watertightness test (`test_golden_meshes.py::test_mesh_is_watertight`)
only checked that every **undirected** edge is shared by exactly two faces. That
is necessary but **not sufficient**: a mesh can pass it while neighbouring faces
traverse a shared edge in the *same* direction, which flips the normal across
the seam.

Probing the generated meshes (all five styles, all resolutions) revealed:

- **240 inconsistent directed edges** (= 2 × `n_theta`) at the `z = 0`
  (`outer_bottom`) and `z = t_bottom` (`inner_bottom`) ring seams.
- The whole mesh was a single connected component split into two relatively
  **flipped orientation domains**: the main shell (outer wall + inner wall +
  rim) vs. the base/drain assembly (drain cylinder + slab top).
- The **global orientation was inverted**: signed volume was negative, the
  outer wall pointed inward, the inner wall pointed outward, and the rim pointed
  down.

In short: the mesh looked watertight but imported "inside-out and seam-split".

## Decision
Fix the **winding at construction time** so that every face group is wound to
make the whole shell one consistently oriented manifold with **outward** normals
(positive signed volume):

- Outer wall — normals point away from the axis.
- Inner wall — normals face the cavity (toward the axis).
- Rim cap — normals point up (+z).
- Base underside — normals point down (−z).
- Drain bore / slab top — kept as-is (already consistent with the corrected shell).

This is a zero-runtime-cost change (it only reorders triangle vertex indices),
which matters because mesh generation has a < 200 ms budget
(`test_performance.py`); a general BFS orientation-repair pass would have risked
that budget for ~60k-face meshes.

Correctness is now *locked in by tests* rather than by careful hand-winding:
`tests/test_mesh_orientation.py` asserts, for every style (plus a twisted +
decorated case):

1. Zero inconsistent directed edges (consistent orientation).
2. Positive signed volume (outward orientation).
3. Region normals (outer-out, inner-in, rim-up, underside-down).
4. No degenerate (zero-area) triangles.
5. Regression guard that the mesh is still undirected-watertight.

The fix was applied to **both** builders: the public, vectorized
`potfoundry/core/geometry.py` and the legacy `potfoundry/geometry.py` still used
by the UI import path (`pfui/imports.py`). The existing parity test keeps the two
in lockstep.

## Consequences
- Exported meshes now import into Rhino/Grasshopper/slicers as correctly
  oriented closed shells, unblocking solid/NURBS conversion downstream.
- `write_stl_binary` auto-computes per-face normals from the same right-hand-rule
  winding, so stored STL normals are now outward and agree with the vertex order.
- Mesh face arrays changed (winding reordered), so any *future* golden-hash
  snapshot must be regenerated. No current test pins an absolute hash — they only
  assert determinism and dimensional metrics — so nothing broke.

## Follow-ups (not in this change)
- The duplicated builder in `potfoundry/geometry.py` vs.
  `potfoundry/core/geometry.py` is a drift risk; consider collapsing the legacy
  module into a thin re-export of the core implementation.
- When OBJ/3MF/STEP exporters land, reuse the same orientation invariant and
  extend `test_mesh_orientation.py` to cover them.
