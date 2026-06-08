# General Feature-Curve Insertion — Design Sketch (Plan 4, the remaining frontier)

**Status:** Design sketch for the LAST 4 styles. The topology-preserving global-warp family (vertical/horizontal/single-helical) is fully exploited and got 16/20 styles to verified `featuresDropped=0`. These 4 cannot be warped — their creases are closed loops or crossing/braided curves with no constant-u/-t/-single-helix decomposition. PROVEN insufficient; this needs a genuinely new mechanism.

## The 4 remaining styles + their precise feature structure (measured)

| Style | Crease structure (default params) | Why warps fail |
|---|---|---|
| **HexagonalHive** | Closed honeycomb cell boundaries; iq pointy-top hex grid `floor(uv/s)`, `s=(1,√3)`; edges at 0°/±60° | Closed loops + 60° edges — no axis/helix decomposition; quadtree square topology can't follow hex edges |
| **CelticKnot** | Braided strand centerlines `0.4·sin(t·3π+phase)`; column seams are *seamless* (radius jump 0.0mm) | Curved braids, varying slope; no constant locus |
| **Voronoi** (Tier-2) | Irregular cell boundaries (jittered) | Non-analytic; needs sampled extraction AND loop insertion |
| **GyroidManifold** (Tier-2) | Triply-periodic level set | Non-analytic; needs sampled/Newton extraction AND general insertion |

## What's already in place (reuse)
- `FeatureLineGraph` — feature-line representation (general (u,t) polylines) + `measureFeatureResolution` (already handles arbitrary polylines incl. diagonal).
- The conforming wall mesh (quadtree + warps) with `minUniformLevel` density control, watertight assembly, GPU eval, and the strict e2e gate (`_conforming_full_probe.cjs` topology + `_conforming_sag_probe.cjs` features).
- `SurfaceSampler`/`GpuSurfaceSampler` for Tier-2 sampling.

## Three candidate mechanisms (ranked by topology-safety, prototype + gate each)

### Mechanism A — Topology-preserving curve-aligned vertex snapping (try first; lowest risk)
For each feature curve C (polyline in (u,t)): find a connected chain of existing mesh vertices/edges that best follows C; project (snap) those vertices onto C in (u,t). **Connectivity unchanged → watertight/oriented preserved by construction.** Reject any snap that would invert a triangle (signed-area sign flip) or push aspect>100.
- **De-risk:** prototype on HexagonalHive ONE cell-row first. Probe: does a connected mesh path exist near each hex edge? On a square quadtree mesh, a 60° edge maps to a staircase — snapping a staircase onto a line risks collapse. Raise `minUniformLevel` near features so a finer near-aligned path exists. If slivers/inversions are unavoidable (the gate fails), Mechanism A is out for loops → go to B.
- This is the same proven philosophy as the warps (move vertices, never connectivity) — but local instead of a global bijection.

### Mechanism B — Local constrained Delaunay in feature cells (spec P4; medium risk)
Re-triangulate only the quadtree cells a feature curve passes through, inserting the curve as constraint edges with Steiner points at curve↔cell-boundary crossings. The rest of the mesh stays the untouched quadtree. **Watertight requires the cell-boundary vertices/edges to match the neighbour quadtree cell exactly** (use the same balanced-cell boundary subdivision so no T-junction forms at the feature-cell perimeter). Kernel: `delaunator` (fast, robust predicates — confirmed available) + a thin constrained-edge layer + Chew refinement for min-angle.
- **De-risk:** prototype on a single feature cell with one constraint segment; assert the cell perimeter edges are byte-identical to before (no T-junction), interior is conforming, constraint is an edge. Then scale to a curve crossing many cells.
- This is the general solution (handles loops, braids, crossings, Tier-2 sampled curves) but is the hard part the original CDT attempt fumbled — keep it LOCAL (O(feature-length) cells), never global.

### Mechanism C — Cell-aligned base mesh for cellular styles (HexagonalHive only; scoped)
For genuinely hex/cellular styles, swap the square quadtree base for a hex/triangular base grid whose edges naturally lie on cell boundaries. Reuse metric sizing + watertight assembly. Bounded but a new base-mesh type.

## Tier-2 extraction (Voronoi, Gyroid) — prerequisite for their insertion
- `SampledFeatureExtractor`: dense (θ,t) GPU sample → Hessian/eigenvector ridge classifier with gradient-magnitude gating (creases survive). Gyroid's level-set gradient is analytic → Newton root-finding for near-exact loci. Output: `FeatureLine` polylines → fed to Mechanism A/B.

## Build order (each gated: topology 0/0/0/0 ∧ featuresDropped↓ ∧ no canary regression, else revert)
1. Prototype Mechanism A on HexagonalHive; if the gate holds → done for Hex + likely Celtic. If not, document the failure mode.
2. If A fails for loops: build Mechanism B (local CDT) — start with one cell, prove no-T-junction, scale to HexagonalHive then CelticKnot.
3. `SampledFeatureExtractor` for Voronoi + Gyroid → feed the working insertion mechanism.
4. Final: all 20 at 6/6; then the cutover (flip `conformingMesher` default, retire the legacy repair battery + dead `cdt2d`, full-matrix sign-off).

## Caution
Do NOT regress the 16 verified styles. The insertion must be gated additively (per-style, behind the same flag). The warps and these mechanisms compose: a style may use warps for its axis-aligned creases AND insertion for its loops.
