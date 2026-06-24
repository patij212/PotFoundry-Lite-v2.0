# Dyadic-Edge-Seam Mesher — Spike Design (the universal watertight seam)

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Status:** Design — approved verbally (direction + "prove the seam first"), pending written review → writing-plans
**Position:** Phase 0b of **sub-project 2** (the general feature-graph mesher), after the band-stitch NO-GO (`2026-06-24-mesher-integration-spike-design.md` + its Task-4 NO-GO). Replaces the rail-as-seam with the dyadic-cell-edge seam.

## 1. The NO-GO that reframed the problem (what we now know)

The band-stitch spike proved (committed gate `c87b72a`, FL7 & FL11): the production complement (axis-aligned 2:1 dyadic quadtree + per-cell CDT) **shares rail VERTICES but not rail EDGES**. A feature curve handed to the complement as a constraint is re-discretized at the complement's OWN cell-edge crossings; even a rail laid exactly on a horizontal grid line welds 0/32 edges (the complement splits its shared edges at its own quadtree columns via the `regH`/`regV` registry, and `cornerSnap` drops near-corner vertices). So **"densify-and-share" — the external band driving the rail discretization — cannot weld against this complement.**

The deeper, **universal** fact this exposes: the dyadic complement shares exactly ONE kind of seam watertight — its own **dyadic cell edges**, whose vertex set (corners + 2:1-balance mid-edge vertices) both adjacent cells read identically from the `regH`/`regV` registry. Nothing else shares. Therefore an arbitrary feature curve can NEVER be a watertight seam.

## 2. The universal principle (style-agnostic)

> **Any feature-aligned region must be bounded by whole dyadic cell edges and must reuse the complement's exact registered boundary vertices. Then it welds to the complement by the same construction the complement uses with its own neighbours. The feature lives strictly inside the region; the seam is never the feature.**

This holds for every style because it depends only on the complement's dyadic structure, not on the feature's shape. It reduces the universal watertight-stitch problem to a single make-or-break question — **can an externally-paved region reuse the complement's cell-edge vertices and weld?** — that is:
- independent of the interior paving (so we can prove the seam with a trivial fill first),
- independent of the style (so it generalises from one feature to the full FeatureGraph of any style),
- the exact opposite of the rail seam: a cell edge is a boundary the complement ALREADY shares via the registry and does NOT re-discretise, where the rail was an interior diagonal the complement re-crossed.

## 3. Architecture & data flow

```
feature edge (FeatureGraph polyline)  [or, for the seam de-risk, an arbitrary cell set]
  → CORRIDOR: the set of whole dyadic leaf cells the feature crosses (connected)
  → EXCLUDE the corridor cells from the complement's emission (Task-2 emit-gate, whole-cell)
  → read the corridor's BOUNDARY vertices from the SAME registry the complement uses
       (cell corners + 2:1-balance mid-edge vertices on every boundary edge — regH/regV)
  → PAVE the corridor interior, pinning the boundary to those exact registry vertices:
       Q1 (seam) — ANY valid fill (no feature) → prove the seam welds
       Q2 (orientation) — feature-aligned rows along the interior feature → no sawtooth
  → MERGE corridor + complement, sharing boundary vertices by the complement's QSCALE id
  → auditWatertight (the seam is dyadic → shares by construction)
```

The complement is UNCHANGED in how it shares (Task-2 keeps the quadtree complete and 2:1-balanced; only emission of fully-inside-corridor cells is suppressed). The corridor's boundary edges are dyadic cell edges the adjacent complement cells still emit against — so both sides read the identical registered vertex set.

## 4. The de-risk order (hardest/most-universal first)

**Q1 — THE UNIVERSAL SEAM (make-or-break, no feature needed).** On a smooth cylinder, pick an ARBITRARY connected set of dyadic leaf cells, exclude them, and pave that region with ANY valid triangulation that uses the corridor-boundary's exact registry vertices (corners + 2:1 mid-edges). Merge + audit watertight at FL7 & FL11. This proves the dyadic-edge seam welds an externally-paved region — the universal claim — with ZERO feature/paver complexity. If THIS fails, the whole approach is refuted cheaply (a second, decisive NO-GO).

**Q2 — feature-aligned interior (orientation/quality).** Replace the trivial fill with feature-aligned paving: the feature is the spine; lay triangle rows ALONG it across the corridor, the boundary rows riding the dyadic corridor-boundary vertices. Gate: aspect ≤ 4, zero `<10°` slivers in the corridor (the Phase-0 paver result, now against a dyadic boundary instead of two feature rails). This is the actual cure for the serration.

**Out of scope of THIS spike (the path after it GOes):** junctions (degree-3 corridors merge — Phase-0 `paveJunction` analogue), loops, the full FeatureGraph network, all 20 styles, density-follows-features, off-feature snap, GPU/perf. Those scale the INTERIOR paving; the seam (proven here) never changes.

## 5. Gate (binary watertight, then quality)

- **Q1 seam gate (FL7 & FL11):** merged `boundaryEdges` = the true t=0/t=1 rings only, `nonManifoldEdges` = 0, `orientationMismatches` = 0, `tJunctions` = 0. Corridor-boundary edges weld count-2 (one corridor tri + one complement tri). **Non-vacuous control:** crack one interior shared boundary vertex → `tJunctions` > 0. **Flag-OFF byte-identical:** no corridor ⇒ assembly bit-identical to today.
- **Q2 quality gate (FL7 & FL11):** corridor-triangle aspect ≤ 4, zero `<10°` slivers; the feature is represented as continuous interior mesh edges (no staircase).
- All measured on the real assembly path (CPU `styleSampler`); a real GPU export/render is a later confirmation, not part of the spike.

## 6. Why this welds where the rail did not (the crux, explicitly)

| | rail seam (NO-GO) | dyadic-edge seam (this spike) |
|---|---|---|
| seam locus | arbitrary feature curve through cell interiors | whole dyadic cell edges (corridor boundary) |
| complement behaviour | RE-DISCRETISES the rail at its own crossings; drops corners | does NOT re-discretise its own cell edges; shares the registered edge vertex set with its neighbour |
| externally-supplied vertices | adopted as vertices, but edges never match | the corridor REUSES the complement's exact registry vertices → edges match by construction |
| 2:1 balance | irrelevant (interior) | preserved (tree complete); mid-edge vertices read from the registry on both sides |
| result | rail edges count-0/1 → T-junctions | boundary edges count-2 → watertight |

## 7. Reuse + the key technical subtlety

- Reuse: Task-2 `bandRegions` emit-gate (extend predicate to whole-cell corridor membership), the `regH`/`regV` registry + `readH`/`readV` (to read corridor-boundary vertices), `quantizeRailUT`/`railVertexKey` (id matching), the Phase-0 paver + `auditWatertight`.
- **The make-or-break subtlety (Q1):** a corridor-boundary cell edge adjacent to a FINER complement cell carries a 2:1 mid-edge vertex. The corridor paver MUST include it (read from the registry), or the seam T-junctions exactly as a 2:1 crack would. This — reading the complement's exact boundary vertex set, mid-edges included — IS the universal seam mechanism, and is what Q1 proves.

## 8. Risks & de-risk order

- **Q1 seam adoption of 2:1 mid-edge vertices (primary, universal):** if the corridor cannot reuse the complement's registered boundary vertex set exactly, the seam cracks → decisive NO-GO. De-risked FIRST, no feature.
- **Corridor connectivity / non-convex boundary:** the corridor is a dyadic staircase; the fill (Q1) and the paver (Q2) must handle a non-convex, possibly multiply-connected boundary.
- **Q2 feature-aligned paving against a dyadic (non-feature) boundary:** the orientation transition from feature-aligned interior to the staircase boundary must stay sliver-free; measured at FL7 & FL11.
- **Production touch:** the whole-cell emit-gate + reading boundary vertices may touch `FeatureConformingTriangulator`/`WatertightAssembly`; flag-gated default-OFF, `gitnexus impact` before edit, `detect_changes` before commit, and the standing **cellSamples-WIP commit-hygiene** rule (stage only own files).

## 9. Out of scope (later)

- The full general mesher (junctions/loops/network/all-20/density/snap/GPU) — scales the interior paving on top of the proven seam.
- Whether, if Q1 ALSO fails, to fall back to detector-driven density in the existing mesher (the deferred alternative) — that decision is only reached on a second NO-GO.
