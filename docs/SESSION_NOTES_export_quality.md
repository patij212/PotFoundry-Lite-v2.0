# Session Notes — Export Quality (Rhino/Grasshopper-grade meshes)

Working branch: `claude/eloquent-heisenberg-2dzxxd`

## Goal
Advance PotFoundry's geometry export toward CAD-grade quality — meshes that
import into Rhino/Grasshopper (and slicers) as a *valid closed solid*: closed,
manifold, consistently oriented, outward-facing normals, no degenerate faces.

## What was proved and fixed this session

### Root cause found: mesh orientation was wrong
The existing topological "watertight" test (`tests/test_golden_meshes.py`) only
checked that every undirected edge is shared by 2 faces. That is necessary but
**not sufficient** for CAD import — it is blind to face winding. A new test
(`tests/test_mesh_quality.py`) added the missing checks and immediately failed
on the default config for *every* style:

1. **Inconsistent winding (192 directed edges with multiplicity 2).**
   The *top of bottom slab* and *drain cylinder* face groups were wound the
   same direction as their neighbours instead of opposite, so the shell was not
   a consistently-oriented manifold. Rhino would report "N reversed faces".

2. **Inward normals (negative signed volume, ≈ −154 000 mm³).**
   The outer wall (and inner wall, rim, bottom) were wound so normals pointed
   *into* the solid. Confirmed directly: 0% of outer-wall normals pointed
   radially outward.

Diagnosed with a BFS orientation pass (find a globally consistent orientation,
then compare to the as-built faces): exactly 384 faces — `slabtop1/2` and
`cyl1/2` — were inconsistent, and the global orientation itself was inverted.

### Fix (root cause, zero runtime cost)
Corrected the winding at the source in `potfoundry/core/geometry.py` for the
outer wall, inner wall, rim cap, and bottom underside groups (the slab and
cylinder groups were left as-is). Result: 0 inconsistent edges, signed volume
+167 725 mm³, 100% of outer-wall normals point outward — verified across all 5
styles and a heavy clamping stress config.

A runtime BFS re-orientation pass was considered but rejected: it cannot fit the
<200 ms generation budget (pure-Python BFS over ~57k faces is too slow). The
born-correct winding is free, and the new test suite guards against regression.

### New reusable guarantee: `potfoundry.validate_mesh`
`potfoundry/core/validation.py` adds a fast, fully-vectorized validator
(`validate_mesh` → `MeshValidation`) reporting closed / manifold / oriented /
outward / degenerate-face count / signed volume. Optimized with 1-D int64 edge
keys (`i*stride + j`) instead of `np.unique(axis=0)` → ~36 ms on a 57k-face
mesh (was ~350 ms). Suitable to call on every export. Exported from the package
top level.

## Test status
- Full suite: **155 passed** (was 103; +52 in `test_mesh_quality.py`).
- `test_golden_meshes.py::test_mesh_has_consistent_normals` was a no-op
  (ended in `pass`); converted into a real assertion via `validate_mesh`.
- No stored golden hashes/STL fixtures existed, so the winding change broke no
  regression baseline.

## Cycle 2: wall self-intersection fixed

### Proved
With extreme (but valid) concave style options on a small-base/wide-drain
config, the wall thickness went strongly **negative** (down to −34 mm across
SpiralRidges/HarmonicRipple/FourierBloom/Superformula/Superellipse): the inner
wall crossed *outside* the outer wall. `validate_mesh` still reported the mesh
as valid because it was topologically closed/manifold/oriented — the defect is
purely **geometric self-intersection**, which a CAD kernel/slicer rejects.

### Fixed
`build_pot_mesh` now applies a self-intersection guard (root cause: the drain
clamp raised the inner radius without bounding it against the outer wall):
- floor the outer radius at `r_drain + 1 + min_wall` so the silhouette can't
  pinch narrower than the drain plus a minimum wall;
- clip the inner radius into `[r_drain + 1, r_outer − min_wall]`, which (given
  the floor) is always a valid range, so the inner wall stays inside the drain
  *and* never reaches the outer wall;
- report the realised `min_wall_thickness_mm` in diagnostics.

`min_wall = min(0.6 mm, t_wall)`. Default designs are unaffected — the floor
never binds for roomy drains. Verified by `tests/test_wall_thickness.py` (12
tests) and the full suite (167 passing). Generation stays ~34 ms (budget 200 ms).

## Cycle 3: exported-STL round-trip validity

### Proved
Added `tests/test_stl_export_quality.py`: the in-memory mesh is validated, but
the artifact a user loads into Rhino is the *written binary STL* — float32
coordinates, per-face vertex duplication. The test reproduces the import path
(write → parse → weld coincident vertices by rounded position → rebuild face
index table) and asserts the recovered solid is still closed/manifold/oriented/
outward with no degenerate faces, and that the welded vertex count exactly
matches the source mesh's distinct referenced positions. Covers a normal config,
a stress config, and the extreme-concave config that exercises the wall guard.

All 6 pass: float32 export preserves watertightness and the cycle-1/2 fixes
survive the file round-trip. Full suite now **173 passing**.

## Suggested next steps (not yet done)
1. **Surface validation in the export path.** `pfui/exporters.export_stl_bytes`
   and the Streamlit export in `app.py` could call `validate_mesh` (and check
   `diag["min_wall_thickness_mm"]`) and warn the user when a mesh is not
   `is_valid` or the wall is thinner than the printer's minimum.
2. **True NURBS/profile export.** "Rhino/Grasshopper quality" ultimately wants a
   parametric profile (revolve curve) rather than a triangulated shell. The
   radius-profile functions in `geometry.py` already define the curve; exporting
   the generating profile (e.g. as polyline/3dm or a Grasshopper-friendly CSV of
   (z, r, theta) samples) would let users rebuild a clean surface downstream.
4. **Degenerate faces under extreme clamping.** Currently clean in the stress
   config; widen the stress matrix (tiny base + max drain + deep concave style)
   to confirm no zero-area slivers appear where inner rings collapse.
