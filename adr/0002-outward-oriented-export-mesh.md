# ADR 0002: Outward-Oriented, Consistently-Wound Export Mesh

## Status
Accepted

## Context
PotFoundry exports triangle meshes (binary STL) intended for use in slicers
(PrusaSlicer, Cura) and CAD/parametric tools (Rhino, Grasshopper). These
consumers require more than a watertight ("2-manifold") mesh: they require a
**solid** mesh that is

1. a closed 2-manifold (every undirected edge shared by exactly two faces),
2. **consistently oriented** (every interior edge is traversed once in each
   direction by its two incident faces), and
3. **outward-oriented** (face normals point away from the enclosed solid, i.e.
   the signed volume by the divergence theorem is positive).

`build_pot_mesh()` already produced a closed 2-manifold, and the existing
`test_mesh_is_watertight` covered property (1) for a single style. However,
properties (2) and (3) were silently violated:

- The **outer wall, inner wall, rim cap, and bottom-underside** face groups were
  wound so their normals pointed *inward*. Measured signed volume was negative
  (e.g. `-105357` for SuperformulaBlossom at 80×40).
- Because the slab-top and drain-cylinder groups were wound the *opposite* way
  from the four groups above, the seam between them carried **160 inconsistently
  oriented edges** (= 2·n_theta), independent of style or parameters.

In Rhino/Grasshopper an inward- or mixed-orientation mesh imports with flipped
normals: surfaces shade black, render with apparent holes, and trigger
"unify/rebuild normals" repairs. In slicers it can invert inside/outside and
produce non-manifold warnings. This is the root blocker for "Grasshopper/Rhino
export quality."

## Decision
Fix the winding **at construction** in `build_pot_mesh()` rather than running a
post-hoc orientation-repair pass.

The orientation defect is purely *topological* — it depends on the fixed face
index structure, not on vertex positions — so it is identical for every style
and every parameter combination. Using a BFS orientation-repair pass as ground
truth, the required correction was uniform per face group:

| Face group        | Old normal | Action      |
|-------------------|------------|-------------|
| Outer wall        | inward     | reverse winding |
| Inner wall        | inward (of solid) | reverse winding |
| Rim cap           | down       | reverse winding |
| Bottom underside  | up         | reverse winding |
| Slab top          | up (correct)   | unchanged   |
| Drain cylinder    | inward (correct) | unchanged   |

After the fix the four reversed groups yield outward normals (outer wall radially
out, inner wall radially in toward the cavity, rim up, underside down), giving a
consistently wound solid with positive signed volume.

### Why construction over a repair pass
A generic BFS orientation-repair pass over the typical 57,792-face mesh measured
~355 ms in pure Python — well over the 200 ms mesh-generation budget enforced by
`tests/test_performance.py`. Fixing the winding at the source is **zero added
runtime cost**, is deterministic, and keeps the hot path fast. The topological
nature of the defect means the construction fix is correct for all current and
future styles.

## Consequences
- `build_pot_mesh()` now emits an outward-oriented solid; `write_stl_binary()`
  auto-computes outward face normals from the corrected winding.
- New quality gate `tests/test_mesh_manifold.py` asserts closed-manifold +
  consistent-orientation + outward-normals + no-degenerate-faces across all
  styles, twist, bell modulation, and a near-degenerate drain clamp. This is the
  durable guard against regressions and against new styles re-introducing the
  defect.
- Face **counts, vertex counts, dimensions, surface area, and determinism are
  unchanged** — only triangle vertex order (winding) changed — so the existing
  golden-mesh and parity tests continue to pass.
- A new style that adds geometry groups must wind them outward; the quality gate
  will fail loudly otherwise.

## Notes
If future geometry becomes complex enough that getting winding right at
construction is impractical, the BFS repair remains a valid fallback, but should
run only on the export path (not preview) to respect the generation budget.
