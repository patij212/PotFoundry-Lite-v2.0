# ADR 0002: Outward, Consistently-Wound Mesh Orientation for CAD Export

## Status
Accepted

## Context
PotFoundry exports generated pots as binary STL for downstream use in CAD and
parametric tools — notably **Rhino** and **Grasshopper**. These tools (and most
slicers / mesh-repair pipelines) treat an imported mesh as a closed *solid* and
expect two properties to hold:

1. **Consistent winding** — across every shared edge, the two adjacent faces
   traverse that edge in opposite directions. Equivalently, every *directed*
   half-edge `(a, b)` appears exactly once across the whole mesh. When this
   fails, Rhino reports "mesh has inconsistent face normals" and boolean,
   shelling, offset and printing operations become unreliable.
2. **Outward normals** — the signed volume of the closed mesh (divergence
   theorem) is **positive**. A negative signed volume means the solid is
   "inside-out": normals point inward, which slicers interpret as a void and
   CAD kernels reject when thickening/capping.

### The defect
`build_pot_mesh` assembled the solid from hand-wound triangle patches (outer
wall, inner wall, rim cap, bottom underside, top-of-slab, drain cylinder).
Auditing the output across **all five styles**, with and without the global
twist, revealed two construction bugs present in *every* mesh:

- **Inside-out solid.** The bulk patches (walls + rim) were wound inward, giving
  a **negative** signed volume (≈ −150 000 mm³ at test sizes).
- **Inconsistent drain caps.** The two drain caps (`z = 0` underside and
  `z = t_bottom` slab top) were wound opposite to their neighbours, producing
  `2 × n_theta` duplicated directed half-edges — a non-orientable seam exactly
  where Rhino flags inconsistent normals.

The mesh was *watertight* (manifold edges OK), so existing tests — which only
checked manifold-ness for one style at one resolution and had a **no-op**
normal-consistency assertion — never caught it.

### Options considered

1. **Global flood-fill orientation pass (mesh-repair style).** Build adjacency,
   BFS to make winding consistent, then flip globally if volume < 0. Fully
   general, but a pure-Python flood-fill over ~193 k faces (high-res preset)
   risks blowing the 200 ms / 1 s generation budgets, and runs on *every*
   build/preview.
2. **Per-patch outward orientation at construction (chosen).** Each structural
   patch has an unambiguous outward reference (`radial_out`, `radial_in`,
   `z_up`, `z_down`). Orient each patch to agree with its reference before
   assembly. For a closed manifold, "every patch outward" implies global
   consistency *and* positive volume — so it fixes both bugs at once.

## Decision
Adopt **option 2**. Added `_orient_patch_outward(verts, faces, ref)` in
`potfoundry/core/geometry.py`: a vectorized helper that flips a patch's winding
when its summed face normal disagrees with the patch's outward reference. Each
patch appended in `build_pot_mesh` now carries its reference tag, and the final
assembly orients every patch before stacking.

This is the *root-cause* fix (the windings are now correct by construction)
rather than a downstream repair, and it is O(M), vectorized, and per-patch — a
single coherent flip decision per surface, not per triangle.

## Consequences
- **Export quality:** every style (× twist × parameters) now produces a
  manifold solid with consistent, outward-facing normals and positive signed
  volume — importable into Rhino/Grasshopper without "inconsistent normals" or
  inside-out warnings.
- **Performance:** negligible. Typical 168×84 generation measured 41.7 ms
  (budget 200 ms); high-res 336×168 measured 139 ms (budget 1000 ms).
- **Determinism preserved:** orientation is a deterministic function of geometry;
  golden vertex/face counts and reproducibility tests are unchanged. (Golden
  tests assert counts/metrics, not a fixed face-winding hash, so the corrected
  winding does not break them.)
- **Regression guard:** `tests/test_export_orientation.py` asserts both
  properties for every style with and without twist, so future geometry changes
  cannot silently regress export quality.
- **Generality note:** the patch references assume the pot is a surface of
  revolution about the z-axis. A future free-form geometry would need the
  general flood-fill pass (option 1) instead.
