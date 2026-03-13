# Geometry Utilities — `src/utils/geometry/`

This directory contains CPU-side mesh processing used exclusively by the **Adaptive Export
pipeline** (`useAdaptiveExport.ts`). It is not used for live rendering.

---

## File Overview

### `ConstrainedTriangulator.ts`

The largest and most complex file in this directory (~1838 lines). Implements a full
Constrained Delaunay Triangulation (CDT) pipeline for producing a watertight UV-domain mesh
from GPU-detected feature points.

**Key static methods:**

| Method | Purpose |
|---|---|
| `generateFullPot(features, dimensions, importanceMap)` | Main entry point. Runs all 5 stages and returns a `TriangulatedMesh`. |
| `extractChains(rawFeatures)` | Phase 1–4: normalises raw GPU points, deduplicates, chains by feature type (peaks/valleys separately), smooths with Gaussian + Ohtake Laplacian, densifies, and generates corner-support and parallel buffer points. |
| `generateAdaptiveBackground(chains, ar, importanceMap)` | Phase 2: generates background fill points using GPU importance map (adaptive grid) or uniform fallback. |
| `runCDT(chains, bgPoints, bufferPoints, ar)` | Phase 3: builds boundary + feature constraint segments, planarises them (segment–segment splits), deduplicates vertices, calls `cdt2d`, filters exterior triangles. |
| `stitchSeam(mesh)` | Phase 4: unifies vertices at x=0 and x=1 to produce a seam-closed cylinder topology. |
| `appendSurfaces(outer)` | Phase 5: appends inner wall, rim, bottom, and drain surfaces as regular grids. |
| `handleSeamCrossings(chain)` | Utility: splits chains that cross the u=0/1 wrap boundary into two sub-chains. |
| `isConflict(p1,p2,p3,p4)` | Utility: strict segment intersection + tube proximity check used by planarisation. |
| `normalizeFeatures(features)` | Utility: maps raw GPU `FeaturePoint` (theta, t) to normalised [0,1] UV. |

**Pipeline stages in `generateFullPot`:**

1. `extractChains` — feature point normalisation, deduplication, type-separated greedy chaining, Gaussian + Laplacian smoothing, RDP simplification, densification, corner support buffer, parallel buffer ring.
2. `generateAdaptiveBackground` — GPU importance-map-driven or uniform background point cloud.
3. `runCDT` — segment planarisation, `cdt2d` triangulation, boundary snap, exterior filter.
4. `stitchSeam` — seam welding at x=0/x=1.
5. `appendSurfaces` — inner wall + rim + bottom + drain via `generateGrid`.

**Key constants / gotchas:**

- `TUBE_RAD_SQ = 1e-12` — proximity tolerance for segment conflict detection. Previously 0.0005 (rejected valid ridges); relaxed to match RDP tolerance.
- `DEDUP_EPSILON = 0.00001` — spatial hash bucket size for feature point deduplication.
- `MAX_CONNECT_DIST = 0.05` — max greedy chain jump distance (5% of UV domain). Tighter values prevent type-crossing chain artefacts.
- Chain linking is **type-separated**: peaks and valleys are chained independently. Mixed-type chaining caused valleys to jump to ridge lines (bug fixed in v16.3 of parametric pipeline, mirrored here).
- Domain is scaled by `aspectRatio = scaleW / scaleH` before CDT so triangles minimise physical (not UV) skinniness, then unscaled on return.
- `cdt2d` is still used here (the adaptive pipeline). **Do NOT add `cdt2d` to `ParametricExportComputer`** — it is O(n²) and caused 12+ minute runtimes at production scale. The parametric pipeline uses O(n) strip triangulation instead.
- `refineTriangleQuality` is **disabled** (v3.9) — it caused 3.5× more degenerates. Decorated with `@ts-expect-error` and kept for future re-evaluation.
- The `stitchSeam` seam weld operates in **UV space [0,1]** (after the unscale step in `generateFullPot`). Do not pass it a mesh that is still in physical/AR space.
- `generateGrid` uses **periodic topology** (w columns, NOT w+1) — the last column wraps to column 0 via modulo. This avoids 1278 spurious u=1.0 vertices on inner surfaces.

---

### `weldMesh.ts`

Vertex welding via **spatial sort** (Int32 quantisation + sorted sweep). Replaces the earlier string-key Map implementation which caused V8 memory crashes on large meshes (>2M vertices).

**`weldMesh(vertices, indices, epsilon = 1e-4): WeldedMesh`**

1. Quantises each vertex to integer grid (`1/epsilon` precision).
2. Sorts vertices by (x, y, z) using a `Uint32Array` sort-index.
3. Sweeps sorted order, grouping vertices within 1 quantised unit in all three axes.
4. Rebuilds index buffer, filtering degenerate triangles (same indices) and slivers (aspect ratio > 50 or area < 1e-10).
5. Removes duplicate triangles using a canonical sorted-index key.
6. Runs a non-manifold edge diagnostic and gap analysis (sampled, not full scan).

**When used:** `AdaptiveExportComputer` calls `weldMesh` after GPU subdivision to merge duplicate boundary vertices before STL export.

**Known limitation:** The string key in the triangle deduplication step (`Set<string>`) is still O(n) allocation; at very large exports (>8M triangles) this may cause memory pressure. A sort-based deduplication would be better.

---

### `simplify.ts`

A vendored implementation of the **Ramer-Douglas-Peucker** polyline simplification algorithm.

**`simplify(points, tolerance, highestQuality): Point[]`**

- `tolerance`: perpendicular distance threshold (squared internally).
- `highestQuality = true`: skips the radial pre-pass, uses only recursive DP — better quality, slightly slower.

Used by `ConstrainedTriangulator.extractChains` after Gaussian smoothing to remove noise before densification. Current tolerance: `0.00001` (high-fidelity, essentially just removing exact collinear points).

---

### `debug_stitch.ts`

A standalone topology audit script (not imported by the main application — run via `ts-node` or the vitest harness). Not part of the production build.

**`analyzeSurface(vertices, indices, surfaceId)`** — per-surface audit that reports:
- Seam vertices at u ≈ 1.0 (should be 0 for periodic topology)
- Degenerate triangles (zero area)
- Flipped triangles (wrong winding order per surface type)
- Wrapping triangles (u-delta > 0.5 — expected at the seam, NOT errors)
- Non-manifold edges, boundary edges

**`runAudit()`** — runs the audit for three aspect ratios (AR=0.5, 1.0, 3.0) with minimal feature inputs to verify that all 6 surfaces (outer wall, inner wall, rim, bottom under, bottom top, drain) produce clean topology.

Surfaces 1, 3, 5 (inner wall, bottom under, drain) use inverted winding — the audit accounts for this.

---

## Test Coverage

| Test file | What it covers |
|---|---|
| `ConstrainedTriangulator.test.ts` | Core CDT pipeline, chain extraction, seam stitching |
| `ConstrainedTriangulator.stress.test.ts` | Large-scale stress tests; catches O(n²) regressions |
| `ConstrainedTriangulator.seam.test.ts` | Seam stitching edge cases (AR != 1.0, Steiner points) |
| `ConstrainedTriangulator.smooth.test.ts` | Gaussian + Laplacian smoothing (some tests skipped — pre-existing) |
| `ConstrainedTriangulator.ohtake.test.ts` | Ohtake Laplacian polish pass |
| `weldMesh.test.ts` | Vertex merging, degenerate filtering, sliver filtering |
| `simplify.test.ts` | RDP correctness |
| `__tests__/extractChains.test.ts` | Chain extraction, type separation, seam crossing |
| `__tests__/simplification.test.ts` | Simplification pipeline integration |
| `__tests__/tubeCheck.test.ts` | `isConflict` / tube proximity detection |
| `PeakDetection.test.ts` | Peak/valley detection from chain output |

**Known pre-existing test failure:** `extractChains` test for `hasRight` (seam-crossing detection) — pre-existing, unrelated to recent changes.

---

## Architecture Notes

The geometry utilities are **only** used by the adaptive export path
(`useAdaptiveExport.ts` → `FeatureExtractionComputer` → `ImportanceMapComputer` →
`ConstrainedTriangulator` → `AdaptiveExportComputer`). The parametric export path
(`useParametricExport.ts` → `ParametricExportComputer`) does not use these files — it has
its own inline triangulation.

The dependency graph within this directory is:

```
ConstrainedTriangulator.ts
  ├── simplify.ts         (RDP for chain simplification)
  └── weldMesh.ts         (imported by AdaptiveExportComputer, not ConstrainedTriangulator itself)

debug_stitch.ts
  └── ConstrainedTriangulator.ts  (for runAudit)
```
