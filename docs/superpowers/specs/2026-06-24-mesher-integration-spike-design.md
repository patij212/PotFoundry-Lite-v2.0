# General Mesher — Production-Integration Spike — Design

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Status:** Design — approved verbally, pending written review → writing-plans
**Position:** Phase 0 of **sub-project 2** (the general feature-graph mesher), itself sub-project 2 of 3 in the general feature-aware export engine. Sub-project 1 (the style-agnostic detector) is COMPLETE (`2026-06-24-detector-sub-project-1-result-and-GO.md`).

## 1. Context & motivation

The dominant user-visible export defect is ERROR 2: the production conforming mesher (axis-aligned 2:1 dyadic quadtree + per-cell constrained Delaunay) **cannot orient triangles along a diagonal/curved feature**, producing serration/sawtooth + slivers along feature ribbons (`project_export_rootcause_review`). Two things are already proven:

- **Sub-project 1** emits a general, style-agnostic `FeatureGraph` (curvature-ridge ∪ normal-crease ∪ relief-wall loci; junctions/loops/open lines; deterministic) from any surface, with zero per-style code — validated 14/20 on a dense-truth gate.
- **The Phase-0 band-remesh spike** (`2026-06-24-bandremesh-spike-result.md`, module `src/fidelity/bandRemesh/`, ~75 green tests) proved the *band mechanism*: advancing-front paving lays triangles ALONG a ribbon (aspect ≤4, **zero** `<10°` slivers — the orientation fix); the band stitches into a surrounding complement **watertight-by-construction** via shared densified rail vertices (by integer id); triple junctions work via a Steiner-free central polygon.

The band spike proved the mechanism on a **synthetic cylinder with a hand-built u-strip complement**. It explicitly did NOT prove the **production-complement integration** — making the *real* dyadic quadtree exclude the band region and adopt the band's exact rail vertices, on *real curved, seam-straddling* feature curves. Prior export arcs have cracked precisely there. The user chose Approach A (thin offset band per curve, reusing the proven paver) and **spike-the-integration-first**. This spike de-risks that one make-or-break step before any full general-mesher build.

## 2. Goal & success criteria (the gate)

**Goal:** prove that the general `FeatureGraph`'s offset-band paving can be stitched into the **real production dyadic complement** watertight-by-construction, on a **real curved lattice pot**, isolating the integration variable.

**Gate (on the REAL assembly path, not synthetic) — all must hold to declare GO:**
- **Watertight by construction:** with the flag ON for a real Voronoi pot, `assembleWatertight` (the production path) yields **boundaryEdges = 0, nonManifoldEdges = 0, orientationMismatches = 0, T-junctions = 0** at real export resolution (test ≥ 2 featureLevels, e.g. FL7 & FL11, to show density-invariance).
- **Orientation quality preserved through integration:** band triangles keep aspect ≤ 4 and **zero** `<10°` slivers (the Phase-0 paver result must survive the real-complement stitch, not just the synthetic one).
- **Flag-OFF byte-identical:** with the flag OFF, the export is byte-for-byte identical to today (default path untouched).
- **Non-vacuous watertight check:** the audit must be proven to DETECT a crack — a committed negative control cracks one interior shared rail vertex (t strictly in (0,1)) → T-junctions > 0 (mirrors the Phase-0 gate's honesty bar).

**This is a binary de-risk gate, not a quality target.** Smoothness/density/CAD-fidelity are NOT gated here (deferred to the full build). The single question: *does the real complement share the band's rail vertices cleanly on real geometry?*

## 3. Architecture & data flow

```
real Voronoi pot (default dims)
  → detectFeatures(sampler, globalOpts)          [sub-project 1, GENERAL — not extractVoronoi]
      → FeatureGraph (nodes/edges, periodic-u, deterministic)
  → graphToBands: each FeatureEdge → a 2-rail ribbon by metric-sized offset ±ε;
      degree≥3 nodes → proven Steiner-free junction polygon; loop edges → closed bands
  → paveBand (PROVEN paver.ts: along-ribbon diagonals maximizing 3D min-angle)
      + junction.ts for the junction polygons
  → INTEGRATE with the real complement (THE CRUX, §4)
  → assembleWatertight (production)  → auditWatertight  → GATE (§2)
```

All band-side geometry reuses the proven `src/fidelity/bandRemesh/` pieces (`paver`, `stitch`, `junction`, `audit`, `stations`/`densifyRail`). The NEW code is `graphToBands` (general-graph → ribbons) and the production-complement integration.

## 4. The integration mechanism (the crux — what is actually de-risked)

On a real pot the band must coexist with the production dyadic complement watertight. Two coupled steps, both on real production symbols:

1. **Exclude the band region from the dyadic CDT fill.** The complement (`FeatureConformingTriangulator` / the quadtree constrained path in `WatertightAssembly.assembleWatertight`) must NOT triangulate the (u,t) area the band covers — otherwise the band and grid overlap (non-manifold). Mechanism: mark the band's (u,t) footprint as an exclusion region the quadtree fill skips.
2. **Adopt the band's exact densified rail vertices as the complement's constraint-crossing vertices.** The watertight property rests on band + complement sharing the *same* rail vertices by id. The complement must consume the band's `densifyRail` output (the exact (u,t) vertices, deterministic) as its boundary-constraint crossings along the band edge — NOT mint its own crossings. This generalizes the existing `edgeCrossingsInto`/`registerBoundary` registry path the grid already uses for feature constraints.

**Real-geometry hazards this spike must face (the reason it's a spike):**
- **Curved + seam-straddling rails:** the band rails follow the Voronoi web across the periodic u-seam and over the curved wall, not vertical lines on a clean cylinder. Densification + vertex sharing must hold across the seam and curvature.
- **Real resolution + cell alignment:** the band footprint exclusion must align with the dyadic cell structure at real featureLevels without leaving slivers or gaps at the band↔grid boundary.

If steps 1+2 cannot share rail vertices cleanly on real geometry, that is the honest decision point (fallback §7).

## 5. Test setup

- **Style:** Voronoi at default dims, via the GENERAL `detectFeatures` (the relief-wall family traces the web). Voronoi is chosen for maximal continuity with the proven band spike and the cleanest thin-wall web — it isolates the integration variable. NOT `extractVoronoi` (the point is the general path).
- **Path:** the real `assembleWatertight` production assembly, flag-gated. The gate runs on the assembled solid (unit-level where possible; one real GPU export + 3MF + flat-shaded render as the human-visible confirmation).
- **Harness:** reuse the Phase-0 `auditWatertight` (explicit `boundaryVertexIndices`, no positional guessing) + the band quality metrics (`minAngle3D`, aspect, `<10°` count). Density-invariance: run FL7 & FL11.

## 6. Production touch & discipline

The spike NECESSARILY edits production (the real complement is what is de-risked): `FeatureConformingTriangulator` and/or `WatertightAssembly.assembleWatertight`, and the Voronoi feature-source wiring. Discipline:
- **Flag-gated, default-OFF.** Flag OFF ⇒ byte-identical to today (a committed test asserts this).
- **Run `gitnexus impact({target, direction:"upstream"})` on each production symbol before editing** (`FeatureConformingTriangulator`, `WatertightAssembly`/`assembleWatertight`, the Voronoi source); report the blast radius + risk level to the user; warn before proceeding on HIGH/CRITICAL.
- **Run `detect_changes()` before commit** to confirm only the expected symbols/flows are affected.
- Keep the band-side logic in `src/fidelity/bandRemesh/` (or a new `mesher/` module); touch the minimum production surface.

## 7. Fallback

If the real complement cannot adopt the band's rail vertices cleanly (step 4.2 cracks): fall back to a **narrower per-cell strip** (the band-remesh design's Approach A), OR pause and reconsider the architecture. The spike exists to surface this early, cheaply — a NO-GO here is a successful, money-saving outcome, not a failure.

## 8. Scope & out of scope

- **In scope:** the watertight + orientation integration gate for ONE style (Voronoi-via-general-detector), flag-gated, on the real path; `graphToBands` for the topology the FeatureGraph presents on Voronoi (loops + junctions).
- **Out of scope (the full general-mesher plan, written after this spike GOes):** all 20 styles; off-feature-smearing snap (re-probe FeatureGraph curves to the true locus before paving — a *quality* fix, the detector smears lattice edges ~3-6mm); density-follows-features in the complement; the Phase-0 quality residuals (asymmetric-junction aspect ~4.08, very-acute-arm slivers); the bandRemesh code-health items (degenerate-triangle prevention in `paveBand`, dedupe `minAngle3D`); GPU/perf/budget; re-baselining `gateThresholds.ts`.

## 9. Risks & de-risk order

- **Rail-vertex adoption on real geometry (primary, the whole point)** → the gate; fallback §7.
- **Band footprint ↔ dyadic cell alignment** (slivers/gaps at the boundary) → part of the watertight gate; measured at FL7 & FL11.
- **Seam-straddling rails** → the Voronoi web crosses u=0/1; densifyRail + sharing must be seam-correct (the Phase-0 stitch used non-seam rails) → explicit seam test.
- **Production blast radius** → `gitnexus impact` before edit; flag-gated default-OFF bounds it.
