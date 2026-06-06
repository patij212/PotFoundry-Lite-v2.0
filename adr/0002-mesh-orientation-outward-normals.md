# ADR 0002: Mesh Face Orientation for Valid Closed-Solid Export

## Status
Accepted

## Context
PotFoundry exports generated pots as binary STL for downstream use in slicers
and, increasingly, in CAD / parametric tools such as **Rhino** and
**Grasshopper**. Those tools are much stricter than slicers: they classify an
imported mesh as a *valid closed solid* only when it is both watertight **and**
consistently oriented with outward-facing normals.

The existing watertightness test (`tests/test_golden_meshes.py::test_mesh_is_watertight`)
only counted **undirected** edge multiplicity. A structured-grid mesh satisfies
that check regardless of winding, so it gave false confidence.

Investigation of `build_pot_mesh` (the single source of truth for both preview
and export) found two orientation defects present in **every** style:

1. **Global inversion** — the exterior wall, inner cavity wall, rim cap, and
   base underside were all wound so their normals pointed the *wrong* way. The
   whole solid enclosed a **negative** signed volume (inside-out).

2. **Seam inconsistency** — the slab-top and drain-cylinder patches (2·`n_theta`
   = 240 faces at the default resolution) were wound *outward* while every other
   patch was wound *inward*. This produced 2·`n_theta` directed half-edges with
   no opposite twin: adjacent faces disagreeing on winding (flipped faces). Rhino
   reports this as a non-orientable / invalid mesh.

The binary STL writer derives each facet normal from the triangle winding, so
these defects propagated directly into every exported file.

### Options Considered

**Option A — Post-process orientation pass.** Run a flood-fill that makes all
faces mutually consistent, then flip globally if the signed volume is negative.
Robust and self-correcting, but a pure-Python BFS over ~58k faces measured at
~0.5 s per build — unacceptable for the interactive preview path, which shares
`build_pot_mesh`.

**Option B — Fix winding at construction (chosen).** The mesh is a structured
grid of six known patches (outer wall, inner wall, rim, underside, slab-top,
drain cylinder). For each patch the desired outward normal is unambiguous
(+radial, −radial, +Z, or −Z). Correcting the winding of each patch so it is
independently outward makes the closed surface automatically *mutually*
consistent. Zero runtime cost, deterministic, no extra dependency.

## Decision
Fix the winding conventions directly in `build_pot_mesh` so the canonical mesh
is born outward-oriented and consistent. Patches corrected: outer wall, inner
wall, rim cap, base underside. Slab-top and drain cylinder were already correct
and left unchanged.

Both the active module (`potfoundry/core/geometry.py`) and the legacy fallback
(`potfoundry/geometry.py`, still referenced by `pfui.imports` and
`tests/test_styles_and_parity.py`) were corrected identically.

## Consequences
- Exported STLs import as valid, outward-oriented closed solids in Rhino /
  Grasshopper and slicers, and shade correctly in the preview.
- No performance impact: the fix is a reordering of existing index stacks.
- Mesh **topology** (vertex/face counts, positions) is unchanged, so golden
  metrics and determinism tests are unaffected; only per-triangle vertex order
  within already-existing faces changed.

## Verification
New tests pin the invariant so it cannot silently regress:

- `tests/test_mesh_orientation.py`
  - signed volume > 0 for every style (outward),
  - zero inconsistent directed half-edges (coherent winding),
  - outer-wall faces point away from the Z axis.
- `tests/test_integration_binary_stl.py::test_exported_stl_is_outward_oriented_closed_solid`
  reads the written binary STL back and checks enclosed volume > 0 and that
  stored facet normals agree with winding.
- `tests/test_golden_meshes.py::test_mesh_has_consistent_normals` upgraded from
  a no-op stub to a real signed-volume assertion.

Verified outward + consistent across all five styles under edge-case parameters
(clamp-heavy drain, coarse meshes, heavy twist, tiny pots).
