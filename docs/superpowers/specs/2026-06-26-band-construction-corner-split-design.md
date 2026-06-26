# Band Construction via Corner-Split + Join (Approach C) — Design

**Date:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Status:** design (approved in brainstorm).
**Supersedes:** `2026-06-26-band-construction-design.md` (approach A — REFUTED by measurement; kept as the negative result).
**Memory:** `project_wholewall_mesher_decision.md`. **Reuses the committed band-construction primitives** (`measureSpineCurvatureRadius`, `assembleRidgeBands`, `offsetRailVariable`, `footprintSelfCrossings`) + `paveRidge` + `paveJunction`'s `triangulatePolygon3D`.

## 1. Why approach A was refuted (measured)

Approach A (curvature-aware variable width) cannot meet the user-required FULL
COVERAGE at acceptable fidelity on real Voronoi spines. The full-coverage real-graph
gate measured (decisively):

- The densified spines are SIMPLE (`spineSelfX=0`) — the folds are the OFFSET, not the spine.
- The verify-and-shrink net is COUNTERPRODUCTIVE: shrinking width→0 DEGENERATES the
  band (foot/crest coincide → zero area), which INCREASES footprint-crossing
  artifacts (edge0: 7→11 at 8 shrinks). "w→0 is always simple" is FALSE.
- Smoothing PLATEAUS and destroys fidelity: 2/4 stubborn Voronoi edges never reach a
  simple footprint, and the ones that do cost 10–22mm of crest deviation on ~mm-scale
  features (the crest stops following the feature).

The stubborn residual folds are at genuine sharp corners/hairpins of long (70–125mm)
conditioned edges. You cannot stop a width-based offset from folding there WITHOUT
either degenerating the band (pinch) or destroying the feature (smooth). The cure is
to keep full width AND fidelity by making a corner a **shared vertex + a small join**,
not a pinch or a smooth-away.

## 2. Goal + constraints

Produce a feature-following ridge band whose (u,t) footprint is SIMPLE by construction
for EVERY real feature edge — at **full width** and **exact crest fidelity**.

- **Full coverage** (user-required): every edge yields a simple-footprint band.
- **Full fidelity:** the crest IS the exact spine polyline — never smoothed.
- **Full width:** flanks keep their target half-width away from corners (no pinch).
- **Corners are JOINS, not slivers:** at a sharp corner the band splits and the two
  sub-bands meet at the shared spine corner vertex via a small corner element.
- **Weld-ready:** QSCALE-dyadic quantized; one watertight `RidgeResult` (drop-in for
  `paveRidge`, so the assembler is unchanged).

## 3. Architecture + data flow

A new function in `bandConstruct.ts`:
`paveRidgeCornerSplit(spine, sampler, opts) → RidgeResult`.

```
spine (u,t)
  → densifyRail (arc-length)                                  [reuse stitch.ts]
  → measureSpineCurvatureRadius                               [committed]
  → splitAtFoldPoints (R_i < safety·widthMm)  → sub-spines
  → for each sub-spine: paveRidge (FULL constant width)      [reuse — simple by straightness]
  → for each interior split: joinCorner(subBandA, subBandB)  [2-arm corner element]
  → combine all sub-bands + corner joins (exact-(u,t)-key + QSCALE)
  → RidgeResult        ⟸ footprintSelfCrossings === 0 (asserted)
```

The refuted `paveRidgeAdaptive` (verify-and-shrink) is NOT used.

## 4. Components

- **`splitAtFoldPoints(spine, radius, safety, widthMm) → StationPoint[][]`** — split
  the densified spine into maximal sub-spines at every interior station where
  `R_i < safety·widthMm` (where a full-width offset would fold). Each sub-spine has
  `R ≥ safety·widthMm` everywhere interior, so its constant-width offset is simple.
  Adjacent sub-spines SHARE the split station (the corner vertex). Degenerate guards:
  a sub-spine of <2 segments merges with its neighbour at a smaller `safety` (the
  split is unnecessary if the sub-band is too short to pave).
- **Sub-band paving** — `paveRidge(subSpine, sampler, {widthMm, edgeMm})` per sub-spine.
  Straight-ish sub-spine ⇒ simple footprint (the proven case).
- **`joinCorner(...)` (the crux)** — at a split (spine corner, turn angle θ): one flank
  is convex (the two sub-band crests DIVERGE → a wedge gap), the other concave (they
  CONVERGE → would overlap). Resolution:
  - **Concave flank:** clip both sub-bands' concave crest rails to their **miter
    point** `M` (the intersection of the two offset crest lines), so they meet at one
    shared vertex — no overlap. Beyond a miter limit (very acute θ) fall back to a
    **bevel** (two short edges to a pulled-in point) — bounded, never folding.
  - **Convex flank:** fill the wedge bounded by sub-band-A's end-row convex half,
    sub-band-B's start-row convex half, and the spine corner — a small polygon
    triangulated Steiner-free via `paveJunction`'s `triangulatePolygon3D`
    (max-min-angle), reusing the loop vertices EXACTLY (watertight seam).
  - All corner-join vertices are interned with the sub-bands by exact (u,t) key +
    `quantizeRailUT`, so the join welds count-2 to both sub-bands.
- **Combine** — intern all sub-band + corner-join triangles into one (u,t) table
  (QSCALE), assemble positions, expose `openBoundaryVertices` (outer flank rails +
  the two free t-ends; corner joins + the crease are interior count-2).

## 5. The simplicity guarantee

Each sub-spine has `R ≥ safety·widthMm` ⇒ its full-width offset cannot fold ⇒ each
sub-band's footprint is simple (the proven `paveRidge` regime). The only fold sites
were the corners, and those are now JOINS (a shared miter vertex on the concave side,
a filled wedge on the convex side) — not offsets. So the combined footprint is simple
by construction. `footprintSelfCrossings === 0` is asserted as the by-construction net
(a non-zero result is a LOUD defect on a pathological corner, recorded — never silent).

## 6. Testing (TDD + the real gate)

**Unit (analytic, default CI):**
- `splitAtFoldPoints` on a synthetic right-angle-corner spine → ≥2 sub-spines split at
  the corner; each sub-spine's max interior curvature radius ≥ safety·width.
- `joinCorner` on two straight sub-bands meeting at 90° → the corner region triangles
  are well-formed (no inverted/degenerate), seam edges shared count-2.
- `paveRidgeCornerSplit` on the right-angle-corner spine (and a tighter, ~60° corner) →
  `footprintSelfCrossings === 0`, band internally watertight (`auditWatertight` 0/0),
  crest vertices coincide with the EXACT input spine (fidelity: 0mm crest deviation).

**Integration GATE (PF_DERISK; the real proof):**
- Voronoi + GyroidManifold + HexagonalHive conditioned graphs: **every** selected
  interior edge → `footprintSelfCrossings === 0` (FULL coverage), the multi-band weld
  is `nonManifold=0, tJunctions=0` by index, every band-perimeter edge incidence==2,
  `inversionCount=0`, `unfillablePinches=[]`.
- Quality report (corner-join triangles + bulk); crest fidelity = exact (0mm).
- Non-vacuous negative control (split a band-perimeter vertex → tJunctions>0).

## 7. Scope, integration, hygiene

- **Scope:** general (any spine); validated on the corner-worst lattice styles.
- **Integration:** flag-gated default-OFF; the assembler calls `paveRidgeCornerSplit`
  on real edges; `paveRidge` stays for synthetic de-risks + straight sub-bands.
- **Hygiene:** never stage the 5 cellSamples-WIP files; scope every `git add`; GitNexus
  `impact` before any prod edit (none — new `bandRemesh` code); heavy tests behind PF_DERISK.

## 8. Out of scope (YAGNI)

- Approach A variable-width / shrink-net (refuted; `paveRidgeAdaptive` retired in place,
  not deleted — kept as the documented negative result + a straight-sub-band fallback).
- Approach B offset-fold trimming (corner-split keeps width + fidelity more directly).
- Junction composition (3b) + the production graft (STEP 4) — separate specs. Note:
  the corner-join is the SAME machinery a 3b degree-3 junction needs, so this de-risks 3b.
- Selecting/splitting at graph junctions — the assembler's job; here we split one edge's
  internal corners only.
