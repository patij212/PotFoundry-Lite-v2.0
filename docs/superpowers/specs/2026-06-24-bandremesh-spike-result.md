# Feature-Aligned Band Remesh — Phase 0 Spike Result + GO/NO-GO Decision (2026-06-24)

**Branch:** refactor/core-migration. **Plan:** `docs/superpowers/plans/2026-06-24-feature-aligned-band-remesh.md`.
**Module:** `potfoundry-web/src/fidelity/bandRemesh/` (GPU-free, production-byte-identical — zero production edits).
**Execution:** subagent-driven (implementer + independent reviewer + fix loop per task; the two gate tasks reviewed on the most capable model with independent re-verification).

## Decision: **GO** to Phase 1

Both make-or-break spike gates passed, independently verified and non-vacuous. The central unknown the spike existed to resolve — *can a feature-aligned (band-following) triangulation be stitched into the surrounding mesh watertight-by-construction?* — is answered **yes**. No fallback to Approach A is needed.

## What is PROVEN (committed tests, ~75 green, density-invariant FL7 & FL11)

1. **Orientation fix works (Task 4 `paver.ts`).** Advancing-front paving lays triangles ALONG the ribbon (between two rails), choosing each quad diagonal to maximize the 3D min-angle. On uniform bands: aspect ≤ 4, **zero** `<10°` slivers, min-angle p50 ≥ 30°. Handles unequal-width rows (the real-Voronoi case) without T-junctions.
2. **Watertight stitch works (Task 5 `stitch.ts` — GATE A, GENUINE GO).** The band and the surrounding complement share the *same* densified rail vertices (by integer id; `densifyRail` is deterministic and fed to both sides; exact-(u,t)-key weld for interiors). Combined mesh: `nonManifold=0`, `tJunctions=0` at FL7 & FL11. The gate is **non-vacuous** — `boundaryVertexIndices` is scoped to only the true t=0/t=1 wall rings, and a committed negative control splits an *interior* shared rail vertex (t strictly in (0,1)) → `tJunctions>0`, proving a crack is detected. (During review, the reviewer additionally cracked every seam edge by hand and all tripped — that broader sweep is review-time evidence, not in the committed suite; the committed control is the single interior-vertex crack per gate.)
3. **Triple junction works (Task 6 `junction.ts` — GATE B, GENUINE GO).** Three bands join through a Steiner-free central polygon sharing the three fronts' end vertices → count-2 seams by construction. Watertight `0/0` at FL7 & FL11 on **symmetric AND asymmetric** (unequal-width + sharp-angle) junctions, with a committed negative control.
4. **Supporting infra:** honest audit utilities (Task 1 `audit.ts` — explicit `boundaryVertexIndices`, no positional guessing), foot+crest rail extraction (Task 2 `rails.ts`/`voronoiField.ts` — replica verified line-by-line against production `voronoiWebField`), metric-sized stations with a fail-fast rail-density guard (Task 3 `stations.ts`).

## Quality residuals to CARRY INTO PHASE 1 (these are quality, NOT watertightness — exports stay watertight)

- **Asymmetric junction aspect ~4.07–4.09** (> the ≤4 bar). Real Voronoi junctions are asymmetric. Fix: a centroid quality-Steiner fallback at the junction when the polygon's worst ear is poor (trades the trivial count-2 proof for a still-watertight centroid-fan-with-flips), OR accept ≤5 and document.
- **Very acute arms (~40°) → ~19% band slivers** in the acute arm. The paver degrades on extreme-acute ribbons (cf. extreme synthetic taper → aspect ~8). The paver is solid on mild/typical geometry; extreme-acute/extreme-taper inputs need either local refinement or accepted-floor. Measure on the real Voronoi distribution first.

## The SURVIVING TOPOLOGY RISK (the real Phase-1 work, honestly the spike's main caveat)

The spike proved the **mechanism** on a self-contained `SyntheticCylinderSampler` patch with a hand-built u-strip **complement**. It did **not** prove the **production integration**. Phase 1 must:

1. Make the REAL production complement — the existing dyadic quadtree / `FeatureConformingTriangulator` constrained path — (a) **exclude the band region** from its CDT fill, and (b) **adopt the band's exact densified rail vertices as its constraint-crossing vertices** (so both sides still share vertices by id, the property the spike's watertightness rests on). This is the step that is unproven and is where prior arcs have cracked.
2. Handle **curved / seam-straddling rails** on real pots (the spike used vertical rails on a clean cylinder).
3. Wire `extractRails` (crest at `f2−f1=th·~0.15`) into the real Voronoi path, flag-gated, default-OFF; re-run `verify_voronoiCelticFeatureFlow` + a real GPU export/3MF/render; re-baseline `gateThresholds.ts` only after default-on.

If step 1 cannot make the production complement share the band's rail vertices cleanly, that is the point to reconsider (a narrower per-cell strip, or accept). The spike de-risked the *paving + stitch mechanism*; the *production complement adoption* is the next gate.

## Phase 1 = the next plan (write after this record)

Scope: production integration (steps 1–3 above) + the two quality residuals. Run `gitnexus impact` before editing the production symbols (`extractVoronoi`, `FeatureConformingTriangulator`, `WatertightAssembly`); `detect_changes` before commit. Generalization to Gothic/Gyroid/Celtic is a Phase 2 plan (each its own band definition).

### Additional Phase-1 code-health items (from the final whole-branch review)

- **Degenerate-triangle prevention belongs in `paveBand`, not per-consumer.** `paver.ts`'s advancing-front zip can emit a zero-area `(a,b,b)` triangle on non-parallel rails; `junction.ts` strips these at its consumer site, but `paver.ts` and `stitch.ts` do not — they are safe in the spike only because their tested geometry (parallel rails) never triggers it. `auditWatertight` skips `i===j` edges, so a leaked degenerate would contribute its real edge once and could register a phantom T-junction or mask a real one. Phase-1 fix: don't emit (or strip at source in) `paveBand`; the junction-site strip then becomes redundant. Benign in the spike (all green configs avoid it) but must not be lost.
- **Dedupe `minAngle3D`** (duplicated in `paver.ts`, `stitch.ts`, `junction.ts`) and promote it + `lateralWobbleMm` into shared use during Phase-1 consolidation.

## Commits (Phase 0, on refactor/core-migration)
Task 1 `1585de5`+`932ea42`; Task 2 `6a6e2dc`; Task 3 `6ad0fad`+`9568c13`; Task 4 `113f5c5`+`a7d3e0e`; Task 5 `e9c4978`+`5f764f6`; Task 6 `f366375`+`f8d6ee0`.
