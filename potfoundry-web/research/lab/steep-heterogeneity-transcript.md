# Lab Transcript — steep-heterogeneity (A-STEEP-RULER inversion) — 2026-07-02

> Append-only durable state. First FULL-team convene (PI + Theorist + Skeptic + Metrologist
> + Oracle-keeper + Experimentalist=meshing-researcher). Resolves the registry contradiction:
> are the ACCEPT-broad-steep styles ruler artifacts (accept) or genuine 3D gaps (fix)?

## THESIS
Invert A-STEEP-RULER across the steep class. Is the ACCEPT-broad-steep class HETEROGENEOUS
(cusp-gaps vs artifacts, per Theorist) or uniform? Discriminator = density-response SIGN of
trusted red-facet perp-3D p99 under maxSag-halving. Oracle-keeper's gmsh leg = closable-vs-irreducible.

## FINDINGS

### F1 — the ACCEPT-steep class is UNIFORMLY DEPTH-CAPPED-CLOSABLE (heterogeneity partially refuted)
- **HYPOTHESIS (Theorist):** the class splits into TRUE-CUSP-GAP (Gothic/Gyroid/Triquetra) + TRUE-RULER-ARTIFACT (Voronoi).
- **DISCRIMINATOR:** labkit `perFaceChordSag` (radial) vs `perFaceTrue3DSag` (GN true-3D) on red facets (radial>0.1mm), DEFAULT vs maxSag-HALVED (tol 0.01→0.005 + chordTol 0.05→0.02, kernel buildInhouseMetricMesh); brute-force dense-nearest TWIN (2048×400 + 8192×1600 tie-break) as trusted reference; braid sheet-guard.
- **KILL-CRITERION (pre-registered):** trusted perp <0.05 & ratio≥3 → ARTIFACT; perp≥0.05 & FALLS → DEPTH-CAPPED-CLOSABLE; perp≥0.05 & FLAT → TRUE-CUSP-GAP; sheet-flip>0 or ref-untrusted → UNMEASURABLE.
- **EVIDENCE (trusted perp = brute-anchored worst-40 p99):**
  - Control **HarmonicRipple**: 0 red facets, whole-mesh perp p99 0.016 / worst 0.045 — LOW-BUT-NONZERO (0.02–0.08 band). NON-VACUOUS PASS.
  - **GothicArches**: trusted perp p99 **0.117** (GN full-red 0.172 upper bound), radial 0.359, ratio 2.08; density FELL 26% (0.172→0.127) → DEPTH-CAPPED-CLOSABLE.
  - **GyroidManifold**: trusted perp **0.092** (GN 0.644 = 7× local-min OVERSTATEMENT, brute-anchored); HALVED → **0 red facets, perp→0** → DEPTH-CAPPED-CLOSABLE (strongly). *Skeptic's "Gyroid is not a cusp-gap" bet CONFIRMED.*
  - **CelticTriquetra**: trusted perp p99 **0.234**, radial 0.479, ratio **1.06** (genuine 3D gap, not ruler); sheet-guard CLEAN (40/0, flip 0); density WEAK (full-red 0.451→0.403, 11%; red 9152→6594, 28%) → classifier CLOSABLE but **BORDERLINE-CUSP** (weakest response).
  - **Voronoi**: trusted perp p99 **0.148**, radial 0.418, ratio 1.88; twin GN≡brute to machine precision (gnOver 0) → FULLY TRUSTED in the f64 lab; HALVED 0.223→0.158 → DEPTH-CAPPED-CLOSABLE. *Metrologist "unmeasurable ~0.14 hash floor": magnitude CONFIRMED (0.148) but REASON REFUTED — a real geometric cell-wall gap here; the f32 hash veto applies only to the production GPU path.*
- **VERDICT: heterogeneity PARTIALLY REFUTED.** All 4 landed DEPTH-CAPPED-CLOSABLE (not a 4-class spread). Heterogeneity survives only at FINE grain: Gyroid collapses to 0 (strongly closable), Gothic 26%, Voronoi intermediate, CelticTriquetra 11% (borderline cusp). Ratio≈1 for Celtic/Voronoi = genuine 3D gaps; Gothic ratio 2.08 = part ruler-overstatement. **Net reframe: the ACCEPT-broad-steep styles are neither accept-class ruler artifacts NOR fixed irreducible gaps — they are CLOSABLE-WITH-DENSITY** (consistent with [[project_crease_density_breakthrough]]).
- **RECOMMENDATION:** Oracle-keeper gmsh leg on **CelticTriquetra FIRST** (borderline, trusted 0.234) + **Voronoi** (ratio≈1) to settle closable-vs-plateau; Gyroid settled closable (deprioritize); Gothic confirm-only. Do NOT productionize — classification only.

### F2 — INSTRUMENT BUG: labkit GN perp OVERSTATES on tangled lattices (up to 7×)
- **FINDING:** `perFaceTrue3DSag` / `perpendicular3DDeviation` (single-seed GN nearest-point) lands on WRONG-LOCAL-MINIMUM feet on tangled lattices → overstates perp: Gyroid GN 0.644 vs brute-trusted 0.092 (7×; gnOver 20); Gothic/Celtic also overstated. The brute-force dense-nearest TWIN was ESSENTIAL; any raw-GN steep verdict is untrustworthy without it.
- **IMPACT:** corrects this arc's OWN prior close — the smoke run's GothicArches perp 0.259 was GN-overstated; trusted = 0.117. Likely also inflated [[project_perpendicular_3d_metric]]'s "5 genuine broad gaps ratio≈1" magnitudes (re-baseline needed).
- **VERDICT:** confirmed instrument defect. **RECOMMENDATION:** fold brute-force nearest-anchoring into labkit's steep-facet path so future perp verdicts aren't GN-overstated (dev-only, flag-gated). Spawned as a follow-up task.
- **STATUS (2026-07-02): DONE.** Folded into labkit: `bruteNearestOnRadialSurface` (full-azimuth dense-nearest primitive) + `bruteAnchoredRedPerp` (worst-N red-facet centroid twin = the trusted steep-verdict number; whole-mesh anchoring measured ~3.4h/2703-red so it's worst-N by design). `perFaceTrue3DSag` left byte-identical (fast GN) with a steep-lattice caveat pointing at `bruteAnchoredRedPerp`. Regression probe `research/bridge/_gnPerpAnchor.test.ts` (PF_GNANCHOR=1) reproduces it on Gyroid @500K: GN p99 0.342 vs trusted 0.092 (ratio 3.7×, matches convene's 0.092 floor), worst wrong-well facet GN 0.342 ≙ brute 0.074 (4.6×), independent brute p99 0.092 ≡ fold. LAB-CHEATSHEET metric-discipline updated.
- **REVIEW (2026-07-02, 3-agent adversarial panel):** Metrologist SOUND — trusted 0.092 survives z-band widen-to-[0,H], multi-start refine, and a 16384×3200 grid (all converge to 0.092), and is a byte-level no-op on smooth controls. PI SHIP-WITH-CHANGES — the build→measure-cost→revert of the whole-mesh anchor was the right call. Instrument-auditor CONCERNS (all addressed): (1) `bruteAnchoredRedPerp` is CENTROID-only ⇒ `trustedP99` reads ≤ `perFaceTrue3DSag`'s 4-pt-max ruler — now documented (interface + JSDoc + cheatsheet); (2) coarse-grid rib-aliasing blind spot where the disagree-only fine tie-break could miss a foot both GN and coarse brute alias HIGH — now hardened: the fine tie-break ALSO fires when the coarse-anchored value is still ≥ redMm (no-op on the shipped 0.092: all 40 Gyroid centroids sit ≤0.092<0.1); (3) `gnOver`'s 0.1 gate vs the convene twin's 0.02 — documented. Added fast PF-ungated `labkit.test.ts` guards for both new fns (cylinder closed-form + smooth no-op + empty-safe). BLAST-RADIUS caveat logged in the registry: older raw-GN steep-tail tables (E-SWEEP-METRIC-MAP, `_perfectPipeline` BLOCK 3) SHOULD re-confirm with `bruteAnchoredRedPerp`.
- **RE-BASELINE (2026-07-02, `_perfectPipeline` BLOCK 3b `PF_PERFECT_TAILANCHOR`, worst-40 red-facet centroid, OPTS density ~1.5–3M tris):** raw-GN worst-red p99 → brute-anchored trusted floor: **Gyroid 0.380→0.103 (3.7×)**, **CelticTriquetra 2.040→≤0.812 (2.5×; braid, NO sheet-guard ⇒ UPPER bound vs the sheet-guarded ~0.234@500K)**, **Crystalline 0.521→0.366 (1.4×; nonMan=2)**, **Voronoi 0.613→0.570 (1.08× — GN≈brute, genuine gap)**, **SpiralRidges 0.078→0.078 (1.00×, 2 red facets — GN clean)**. The GN overstatement on the worst-red facets is HETEROGENEOUS (strong Gyroid/Celtic, mild Crystalline, negligible Voronoi/SpiralRidges). Distinct from the E-SWEEP WHOLE-FACET p99 (green-dominated ⇒ it UNDERSTATES the worst-red floor, not a GN artifact). Follow-up: apply the braid sheet-guard to close CelticTriquetra's true floor.

## SURPRISES

| date | surprise | tied-to | score | status |
|------|----------|---------|-------|--------|
| 2026-07-02 | labkit GN `perFaceTrue3DSag` OVERSTATES perp up to 7× on tangled lattices (Gyroid 0.644 vs trusted 0.092) via wrong-local-minimum feet — the brute twin is load-bearing; retroactively corrects the smoke run (Gothic 0.259→0.117) and likely prior steep perp verdicts. | F2 | high | promoted → A-GN-PERP-LATTICE assumption row + labkit-fix follow-up task + re-baseline flag |
| 2026-07-02 | The whole ACCEPT-steep class collapsed to ONE coarse label (DEPTH-CAPPED-CLOSABLE) — nobody (Theorist/Skeptic) predicted uniformity; the heterogeneity is fine-grain only. | F1 | med | promoted → reframe (class is closable-with-density, not accept nor fixed-gap) |
| 2026-07-02 | CelticTriquetra: ratio≈1.06 genuine 3D gap yet near-FLAT density response (11%) — the real borderline-cusp outlier; gmsh leg to adjudicate. | F1 | med | open → gmsh closable-leg (priority 1) |

## CLOSE-GATE RECEIPTS
- **F1/F2 twin trap (GN overstatement):** brute-force dense-nearest (2048×400 + 8192×1600 tie-break) vs GN on worst-40/style. RESULT: GN overstated on lattices (gnOver 20 Gyroid); brute-anchored p99 used for all verdicts; Gothic fine-brute CONFIRMED GN-smaller on all 8 disagreers (resid 2.5e-9). PASS (verdicts use trusted, not raw GN).
- **F1 reference-band-limit trap:** trusted dense reference; Voronoi twin GN≡brute to machine precision (not hash-noise in f64 lab). PASS.
- **F1 braid sheet-guard (CelticTriquetra):** normal·(facet−foot) sign check; 40/0, flip 0 → p99 valid. PASS.
- **F1 non-vacuous control:** HarmonicRipple perp 0.016/0.045 low-but-nonzero, 0 fabricated red facets. PASS (instrument not "always low").

## ASSUMPTIONS TOUCHED
- **A-STEEP-RULER** (updated): refuted-flip refined — GothicArches trusted perp 0.117 (not the GN-overstated 0.259), and the whole steep class is DEPTH-CAPPED-CLOSABLE, not accept-class ruler artifact NOR fixed gap. Prior steep accept-class closures remain reopen-eligible; the correct replacement frame is "closable with density".
- **A-GN-PERP-LATTICE** (new): "labkit GN perp is trustworthy on tangled lattices" — REFUTED. GN overstates up to 7× (wrong-local-minimum feet); brute-anchoring required. Blast radius: every steep-style perp verdict measured with raw GN, incl. project_perpendicular_3d_metric + the smoke run.
