# Ridge Junction Composition (STEP 3b) — Design

**Date:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Status:** design (approved in brainstorm).
**Builds on:** the PROVEN corner-join (`joinCorner` / `paveRidgeCornerSplit`, commits abd03a7/48bca48) and
`paveJunction` (the degree-3 single-ribbon fan, `junction.test` 20/20). **Memory:** `project_wholewall_mesher_decision.md`.

## 1. Why (context)

Selective paving (proven, commit b9a5261) covers the whole wall: clean edges strip-paved as
ridge bands, relief-dense edges CDT-followed. The remaining whole-wall piece is **junction
composition**: where several feature edges meet at a shared graph node J, the incident ridge
BANDS must compose into one watertight, feature-followed mesh. `corridorPaveMulti` already
composes the CDT-followed (folding) spines at junctions via its `junction` anchor; this spec
covers the STRIP-PAVED bands, at premium quality (the user-chosen "full-band central-fill"
path — band each clean edge all the way to J and fill the central junction region).

The memory flagged ridge↔fan composition as "the hardest unbuilt piece" and noted 21–53% of
deg-3 nodes are REFLEX (one sector > 180°) plus 57–305 deg-4+ nodes/style. The key realization
that makes it tractable: the proven degree-2 corner-join is the **2-sector** case of a junction
(a bend = one convex wedge + one concave miter); a degree-N junction is the SAME machinery
applied per-sector, and reflex sectors are just large polygons that `triangulatePolygon3D`
ear-clips — no special fan-center placement (the historical reflex blocker) is needed.

## 2. Goal + constraints

Compose N ridge bands meeting at a shared node J into ONE watertight `RidgeResult` whose (u,t)
footprint is SIMPLE by construction.

- **Watertight by construction:** the N bands + the junction fill weld 0/0 by exact-(u,t)/QSCALE
  key (`auditWatertight` nonManifold=0, tJunctions=0); every band-perimeter and sector-fill seam
  edge incidence == 2.
- **Feature-followed (no serration):** every ridge crest is an exact mesh edge chain through J;
  J is a shared crease vertex of all N spines.
- **Full coverage / simple footprint:** `footprintSelfCrossings === 0`.
- **Premium quality:** the junction is strip-band flanks + a Steiner-free max-min-angle central
  fill (`triangulatePolygon3D`), not a coarse CDT region.
- **Drop-in:** returns a `RidgeResult` (the assembler treats a junction like any other ridge unit).

## 3. Architecture + data flow

A new function in `bandConstruct.ts`:
`paveRidgeJunction(spines, sampler, opts) → RidgeResult`.

```
spines[0..N-1]  (each a (u,t) polyline; all share the junction node J as one endpoint)
  → normalize: orient every spine to RADIATE from J (J first, outward last)
  → pave each spine: paveRidgeCornerSplit  → N ridge bands (each shares J as a crease end)
  → order the N ridges by azimuth around J (metric tangent plane at J)
  → for each adjacent sector (ridge i, ridge i+1):  joinSector(...)
       wide   → wedge-fill the gap (triangulatePolygon3D over the facing half-end-rows + J)
       narrow → miter the two facing crest rails to a shared point (the concave case)
  → combine all band tris + sector fills into one QSCALE table (J + facing miter pts shared)
  → RidgeResult        ⟸ footprintSelfCrossings === 0 (asserted)
```

`joinCorner` becomes the 2-arm special case; the per-sector resolver reuses its proven
miter (`lineIntersectUT` + `clipTail/HeadToMiter`) and wedge (`fillPolygon` →
`triangulatePolygon3D`) helpers verbatim.

## 4. Components

- **Spine normalization** — orient each input spine so J is its FIRST vertex (radiating outward).
  The junction node J is the shared endpoint (exact (u,t)); a spine whose J end is last is
  reversed. After this, every band's J end is its START row (so its end-cap at J is `rows[0]`),
  uniform for sector access.
- **Per-ridge band paving** — `paveRidgeCornerSplit(spine, sampler, opts)` per spine (full width,
  with the corner-split + guard already proven). All bands intern J to ONE id (exact (u,t)) →
  the crease is shared. Each band's J-end cross-row (`leftCrest_i(J) … J … rightCrest_i(J)`) is
  captured for sector access (built directly via the combined assembler, as in `joinCorner`).
- **Azimuthal ordering** — compute each ridge's outgoing tangent at J as a metric (u,t) azimuth
  (`atan2` of the 3D tangent in the local tangent basis at J, consistent with `turnSign3D`).
  Sort ridges CCW. The N sectors are the consecutive azimuth gaps (wrapping).
- **`joinSector(ridgeA, ridgeB, sectorAngle, …)`** — the per-sector corner-join between ridge A's
  facing crest (the +perp side toward the sector) and ridge B's facing crest (the −perp side):
  - **Wedge (wide / reflex sector):** fill the polygon bounded by A's facing half-end-row
    (J → facingCrestA), the gap chord (facingCrestA → facingCrestB), and B's facing half-end-row
    (facingCrestB → J) via `triangulatePolygon3D` (Steiner-free max-min-angle; ear-clips reflex
    polygons). Reuses `fillPolygon`.
  - **Miter (narrow sector):** the two facing crest rails would overlap; clip both to their
    miter intersection `M` (`lineIntersectUT` + `clipTail/HeadToMiter`) so they share `M`. The
    sector closes at J + M with no overlap. The narrow-sector threshold is a metric angle below
    which a full-width pair of facing flanks overlaps (≈ where the wedge chord would invert);
    calibrated by TIGHTENING (more miters), never by loosening the gate.
- **Combine + weld** — intern all band + sector-fill triangles into one QSCALE (u,t) table; J and
  every shared miter `M` collapse to one id. `openBoundaryVertices` = the N outer flank crest
  rails + the N free t-ends; J, the creases, and the sector-fill interiors are interior (count-2).

## 5. The watertight + simplicity guarantee

Each ridge band is simple + watertight by `paveRidgeCornerSplit` (proven). The only new seams are
the N sector fills. A sector fill shares J + the two facing half-end-rows with its two bands
(exact (u,t) → count-2) and adds either a gap chord (open boundary) or a miter vertex M (shared
with the neighbouring sector's clip → count-2). No sector overlaps another (they partition the
azimuth around J); the miter removes the only overlap source (narrow facing flanks). So the
combined footprint is simple by construction and `footprintSelfCrossings === 0` is the asserted
net (a non-zero is a LOUD defect on a pathological junction, recorded — never silent).

## 6. Testing (TDD + the real gate)

**Unit (analytic, default CI) — TDD, mirroring the corner-join:**
- Symmetric degree-3 Y (three spines at 120° from J) → `footprintSelfCrossings === 0`,
  `auditWatertight` 0/0, J is a crease vertex of all three spines, well-formed triangles.
- Asymmetric degree-3 (unequal angles incl. one narrow sector → exercises the miter branch).
- REFLEX degree-3 (one sector > 180°) → watertight + simple (the ear-clip reflex path).
- Degree-4 junction → watertight + simple (N-sector generalization).

**Integration GATE (PF_DERISK; the real proof):**
- Drive the real pipeline (styleSampler → detectFeatures → conditionGraph) on Voronoi; select
  triple/reflex/highDegree nodes (the conditioner types them) whose incident edges are all clean
  bands; compose each with `paveRidgeJunction`; assert per junction: `footprintSelfCrossings===0`,
  `auditWatertight` 0/0, every band-perimeter + sector-seam edge incidence==2, crest exact.
- Quality report (junction-fill triangles + bands); non-vacuous negative control (split a shared
  seam vertex → tJunctions > 0).

## 7. Scope, integration, hygiene

- **Scope:** general (any N ≥ 2); validated on real Voronoi triple/reflex/deg-4 nodes.
- **Integration:** flag-gated default-OFF; the assembler calls `paveRidgeJunction` per band-only
  node, `paveRidgeCornerSplit` per band edge, `corridorPaveMulti` for the folding + featureless
  fill. The faithful watertight gate stays e2e/real-WebGPU at the production graft (STEP 4).
- **Hygiene:** never stage the 5 cellSamples-WIP files; scope every `git add`; GitNexus `impact`
  before editing a committed symbol (`joinCorner`/`assembleSubSpines` if refactored); heavy tests
  behind PF_DERISK; real-pipeline builds in `beforeAll(…, 120000+)`; lazy selection (no full-graph
  paving in `beforeAll`).

## 8. Out of scope (YAGNI)

- **MIXED junctions** (a node where some incident edges are strip-bands and some are folding-CDT):
  the band's J vertex must equal the folding edge's `corridorPaveMulti` `junction` anchor id. This
  is the selective-paving↔junction integration — landed AFTER pure band-junctions prove out.
- **Degree-4+ auto-splitting** — the conditioner TYPES `highDegree`; `paveRidgeJunction` handles N
  arms directly (no split). Splitting is a separate conditioner concern.
- **The production graft + faithful e2e gate** (STEP 4) and graph-level node selection (the
  assembler's job) — separate specs.
