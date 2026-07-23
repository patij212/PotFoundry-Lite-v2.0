# Unified Shape-Agnostic Measurement — Design & Roadmap

_2026-07-22. Companion to `research/MEASUREMENT-COMPENDIUM.md` (the ruler catalog) and
`research/LAB-CHEATSHEET.md` (field discipline). This spec states the unification
thesis, records what shipped this session, and lays out the roadmap for the remaining
precision/speed/soundness fixes. Autonomous session — no interactive design gate; this
doc is written for review-on-return._

## 1. Problem

The project accreted **~a dozen distance rulers, four quality/topology rulers, and one
rigorous certificate engine** across three non-sharing stacks (`src/fidelity`,
`src/geometry/targetSolid`, `research/bridge/labkit`). A 7-agent audit (archived under
the session scratchpad `audit/`) found the measurements — not just the mesher — are a
gap on the road to shape-agnostic 0.01mm certification:

- **Four different "distance-to-truth" definitions** selected ad-hoc, three of which
  violate the 0.01mm-MAX-vs-exact-analytic standard (grid-bound reference, radial
  overstatement, GN wrong-well overstatement).
- **MAX is masked** three ways: by p99 headlines, by triangle subsampling (64k/256k),
  and by loci-only sampling (blind to non-locus scale-tip cones).
- **Percentiles are quantized** (0.05mm histogram buckets — 5× the target).
- **The rigorous certificate is unwired and un-cross-validated.**
- No single, shape-agnostic entry; the reference representation is not selected by
  shape class, so single-valued `rA` is (mis)applied to multi-valued weaves.

## 2. Thesis

**One ruler, one reference-selection rule, MAX-first, with the interval prover as the
gold standard.**

1. **One distance definition:** perpendicular 3D distance from mesh sample to the true
   surface — the one-sided Hausdorff the exported facets must satisfy (the MMG `hausd`
   knob). Radial is a *screen* only (it overstates steep relief 2–370×).
2. **Reference by shape class** (compendium §3): single-valued → exact `rA`;
   steep tangled lattice → exact `rA` **with global seeding**; multi-valued weave →
   post-warp / multi-patch reference (NOT `rA`); rigorous → the validated interval
   target program.
3. **MAX-first:** certify on `max ≤ tol ∧ watertight ∧ all-finite`. Report the full
   vector `{max, p99, rms, mean, minAngle}` for diagnosis; never certify on p99.
4. **The interval prover is the gold standard** (`targetSolid`): continuous,
   outward-rounded, fail-closed, ~1 picometre floor, no nearest-point search. Sampled
   rulers are the fast path and must be **cross-validated** against it (sampled ≤
   certified upper bound).

## 3. What shipped this session

Additive, TDD, byte-identical on every existing path (opt-in only):

- **`src/fidelity/radialSurfaceProjector.ts` — `buildRadialSurfaceProjector(rA, opts)`.**
  A globally-correct, fast perpendicular projector. Precomputes the surface on a `(θ,z)`
  grid, indexes the sample points in a 3D bucket grid, and seeds Gauss-Newton from the
  globally-nearest samples **and** the radial foot. Fixes the single-seed wrong-well
  overstatement (measured: **1.47mm → 0** on real Gyroid floating centroids; never
  overstates the trusted 2560×640 brute; provably ≤ single-GN up to GN noise). The grid
  build amortizes across every projection ⇒ whole-mesh cost ~O(samples), orders of
  magnitude below the worst-N brute twin (`bruteAnchoredRedPerp`, ~3.4h whole-mesh),
  and correct everywhere, not just worst-N.
- **`src/fidelity/measureRadialFidelity.ts` — the unified ruler.** ONE entry that
  measures against exact `rA` with the global projector, reports MAX-first distance +
  min-angle quality + exclusion bands, and certifies on MAX. Watertight stays the
  separate cap-safe `topologyMetric` (different scope). Global projector default ON;
  `globalProjector:false` for A/B against the legacy overstatement.
- **`src/fidelity/certifyMeshExport.ts` — the full export certificate.** Composes the
  unified fidelity ruler AND the watertight `topologyMetric` into one verdict
  (`certified = fidelity.certified && watertight`): faithful-but-leaky and
  watertight-but-inaccurate both correctly fail.
- **`analyticSurfaceGate.ts`:** (a) non-finite deviations no longer poison
  `rms`/`p99` (guarded + counted in `nonFiniteCount`); (b) `perpendicular3DDeviation`
  gains an injectable `chordProjector` (the acyclic seam for the global projector).
- **`metrics.ts`:** wall p99 (wallDeviation + wallChordError) de-quantized — 0.05mm
  lower-edge histogram → 0.001mm conservative upper edge (was reporting 0.00 for any
  sub-0.05mm p99). **This lands roadmap R1.**
- **`types.ts`:** the false "WELD_TOL_MM matches exportValidation" comment corrected to
  document the 10× divergence (1e-4 vs 1e-3). **This lands the doc half of R5** (the
  gate-tolerance reconciliation itself is still open).
- **`research/bridge/exactCertGate.ts` + `.test.ts` — the rigorous prover wired to a
  LIVE gate.** `certifyOuterWallExact` drives the targetSolid interval prover end-to-end
  (atlas → tessellate → bake) into a MAX-first, fail-closed verdict, patch-scoped to the
  outer wall. The test is ALWAYS-ON (not env-gated): it rigorously certifies a gentle
  outer wall at 0.01mm (~17s) and proves the gate is non-vacuous. The prover was
  previously only in a dev-only, env-gated sidecar baker (gating nothing).
- **The shape-agnostic multi-sheet stack (Tier-1) — three additive modules:**
  - **`src/fidelity/parametricSurfaceProjector.ts` — `buildParametricSurfaceProjector(Φ)`.**
    The `(u,v)`/`Φ` generalization of the radial projector: nearest point on a general
    parametric 2-manifold, global-seed-field 2×2 Gauss-Newton. Single-valued in the chart
    even where the 3D image self-folds ⇒ **represents over/under (multi-sheet) walls** the
    radius field cannot. Verified on a torus (two-valued in `(θ,z)`): resolves the correct
    sheet, matches brute.
  - **`src/fidelity/parametricHausdorff.ts` — `surfaceToMeshMaxMm` + `twoSidedHausdorffMm`.**
    The surface→mesh half (dense `Φ` samples → nearest triangle, exact unbounded field) that
    catches **missing** surface the one-sided rulers are blind to; combined as the symmetric
    two-sided Hausdorff `max(both)` = the honest "true error including ALL features".
  - **`src/fidelity/radialParametricSurface.ts` — `buildRadialParametricSurface(rA)`.** The
    bridge that lifts any single-valued `rA(θ,z)` into `Φ(u,v)`, so the **whole radial roster
    gets two-sided (missing-feature) coverage** through the exact same machinery. Proven on the
    real `HarmonicRipple` analytic surface: a faithful uniform 128×64 mesh reads surface→mesh
    0.55mm (the honest uniform-grid crest chord), a dropped ridge reads >5mm while mesh→surface
    stays blind — see §4.5b/§4.5c of the compendium.
- **`research/MEASUREMENT-COMPENDIUM.md`:** the authoritative ruler catalog.

_Roadmap status: R1 DONE; R4 DONE (measureRadialFidelity pre-filter); R5 doc-half done;
the rigorous prover is now on a LIVE gate (exactCertGate) — the "wire a live gate" future
bet, on one config. R7 DONE (`certCrossValidate.test.ts` — sampled ≤ certifiesAt, tight
ratio 0.84; also proved the src analytic surface == the prover's target). ALL-20 gate
DONE (`exactCertGateAll20.test.ts`, env-gated): honest coverage matrix — the prover
CERTIFIES 6/20 smooth/single-valued styles; the cusp (GothicArches) + cellular/weave
families (Voronoi/BasketWeave/HexHive/CelticKnot/CelticTriquetra) are INTRACTABLE
(non-terminating) and 4 styles are atlas-refused, so the rigorous ruler's frontier IS
the meshing frontier. R2/R3/R6/R8 remain (the standout next step is making the prover
terminate on cusps/lattices — curtains + the curved-element / cut-graph mesher work in
FRONTIER-KNOWLEDGE — which would widen the all-20 certified set)._

## 4. Roadmap (remaining fixes, ranked)

Each is TDD, additive/opt-in where it would shift a pinned baseline. Line refs in the
compendium §11.

| # | Fix | Where | Risk | Notes |
|---|---|---|---|---|
| R1 | Exact-percentile (drop 0.05mm histogram) | `wallDeviation`, `wallChordError` (metrics.ts) | low | max/rms already exact; p99 is the only quantized field. No test pins it. |
| ~~R2~~ **DONE** | MAX exact over the FULL mesh (sag + quality) | `computeFidelityMetrics` (metrics.ts) | — | sag MAX (`7cd2e049`) + quality extremes minAngle/aspect/sliverCount (`3e706e43`) now exact over every triangle; the sample limit governs only the sag RMS. TDD: a worst facet / worst sliver hidden behind a stride now surfaces, invariant to the limit. No persisted baseline pins these (0 non-test callers), so no rebaseline needed. |
| R3 | Scale `coarseTrigger`/`preFilterMm` with `tolMm` | `analyticSurfaceGate.ts:263,393` | low | **Superseded, not a correctness issue.** R4 made the pre-filter SOUND regardless of `preFilterMm` (MAX exact), and the wrong-well-free accurate perp is ALREADY the certification default via the global projector (`buildRadialSurfaceProjector` in `measureRadialFidelity`). Shrinking the single-seed `preFilterMm` costs significant perf (radial overstates ⇒ most facets GN'd) for only redundant *tail* (rms/p99) accuracy already available. Precision-wins move if ever needed = make the global projector the `perpendicular3DDeviation` DEFAULT (bigger; re-baselines tangled lattices) — a separate change, not this knob. |
| ~~R4~~ **DONE** | Facet-wide pre-filter bound (not centroid-only) | `analyticSurfaceGate.ts` | — | `15e8b16f`: the pre-filter now takes the MAX chordBound over the SAME dense samples the scan uses (chordDev ≤ chordBound pointwise ⇒ sound), so an off-centroid spike below the centroid can no longer be skipped. GN still skipped on the smooth tail (added cost = cheap radial evals). TDD: a +0.12mm spike hidden at a 0.04 centroid now surfaces. |
| ~~R5~~ **DONE** | Reconcile watertight tol to the 1e-4 fidelity standard | `exportValidation.ts`, `types.ts` | — | `8762aba8`: download gate default pinned to `WELD_TOL_MM` (1e-4, imported = single source of truth), matching the pipeline's `topologyMetric(mesh, WELD_TOL_MM)` cert + `conformingTopologyGate`. 217 style-tests pass at 1e-4. Per "precision wins" — the previous 1e-3 silently welded sub-mm cracks. Exposed one REAL pre-existing crack (conforming Voronoi, 3 naked edges, already red in conformingTopologyGate) → Voronoi pinned known-defective (`it.fails`, self-retiring) + mesher fix queued. TDD: a 3e-4 seam gap welds at 1e-3, caught at 1e-4. |
| ~~R6~~ **DONE** | Numeric packed-key edge accounting (no Map-cap) | `exportValidation.ts` | — | `c7b34216`: replaced the `Map<string,EdgeUse>` (heap string+object per edge, `RangeError: Map maximum size exceeded` past ~16.7M edges on 8M+-tri downloads) with packed `lo*V+hi` keys in flat Float64Arrays + sort/run-count — the pattern `topologyMetric` already carries. Same counts; 34 tests green incl. a 590k-tri closed-torus scale test. |
| ~~R7~~ **DONE** | Cross-validate: sampled ≤ certified upper bound | `research/bridge/certCrossValidate.test.ts` | — | sampled 0.0168 ≤ cert 0.02 (SOUND), ratio 0.84 (TIGHT); also proved src analytic surface == prover target. |
| ~~R8~~ **DONE** | Add a non-locus MAX pass to the all-20 harness | `featConformAll20` | — | `53c85f60`: `perFaceTrue3DSag` (whole-mesh, per-face true-3D) added as `wholeMesh3d_max`/`_pctOver01` on every Row — the loci-only `fl3d_*` channel was blind to scale-tip cones. Verified: DragonScales baseline `wmMax 0.801 > fl3d 0.718` (off-locus worst). |

## 5. Future work (bigger bets)

- **Multi-valued reference.** Extend the ruler to select a post-warp / multi-patch
  reference for over/under weaves (BasketWeave/CelticKnot/DragonScales rings), so `rA`
  artifacts stop being reported as mesh defects. Folds into the `targetSolid`
  multi-patch registry + the missing per-style discontinuity curtains.
- **The right GPU oracle.** A facet-sample → GPU-ray → perpendicular-gap mesh-vs-solid
  scorer on the existing preview march+bound+bisection machinery: whole-solid,
  double-valued-capable, GPU-speed, independent of the CPU tessellation. The highest-
  leverage measurement capability the project does not yet have.
- **Wire a live all-style MAX gate.** Today no gate is in production; certification is
  a frozen baseline + human copy. A live `measureRadialFidelity`-based MAX gate over the
  all-20 at production-default scale would make certification continuous.

## 6. Non-goals

- Rewriting the 900+ existing call sites of the legacy rulers. The unified ruler is
  additive; migration is opt-in and out of scope for this session.
- Changing production mesher behaviour. This is a measurement work-stream only.
