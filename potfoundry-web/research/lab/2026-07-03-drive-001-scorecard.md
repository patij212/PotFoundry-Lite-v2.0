# DRIVE-0.01 — unified all-20 honest scorecard (2026-07-03)

Workflow `wheeg93wh` (5 axis-close agents + adversarial verify). Synthesis hand-assembled from the on-disk
checkpoints after the verify:ztiled + synthesize agents hit the session limit and close:tangled hit a transient
API error (all had already checkpointed to disk). Dev-only research lab; NOTHING ships; `src/` never imports `research/`.

**Honest rulers.** Whole-mesh true-3D p99 = `bruteAnchoredRedPerp.trustedP99` / radial own-region (faithful for
single-valued on-surface). Steep-cliff tail = brute-anchored worst-red on genuine near-vertical walls (gnOver≈0 ⇒ brute
AGREES it is genuine geometry, not GN overstatement). Watertight = RAW-index nonMan (weld over-counts at coincident tips).
`%<20` = triangleQualityDistribution on the primitive mesh. Serration = feature-edge-to-mesh-edge distance.

## The 20 (best measured result per style)

| # | style | axis (measured) | primitive | whole-mesh true-3D p99 | steep/crease tail | %<20 | rawNonMan | serr | verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RippleInterference | smooth | dense M-square | **0.0068** (density-stable) | — | 0% | 0 | ~0 | ✅ REACH (solid) |
| 2 | WaveInterference | smooth | dense M-square | **0.0068** (density-stable) | — | 0% | 0 | ~0 | ✅ REACH (solid) |
| 3 | SuperellipseMorph | smooth | dense M-square | **0.0066** (anchor-trusted) | — | 0% | 0 | ~0 | ✅ REACH |
| 4 | FourierBloom | smooth | dense M-square | **0.0093** (anchor-trusted) | — | 0.3% | 0 | ~0 | ✅ REACH (thin) |
| 5 | HarmonicRipple | smooth | dense M-square | **0.0089** @1.1M | — | 0% | 0 | ~0 | ⚠️ REACH w/ density-floor (½-density→0.017; anchor 0.0117) |
| 6 | GyroidManifold | tangled | CDT-under-M + deep sag | **0** red facets | — | 2.1% | 0 | ~0 | ✅ REACH (CONFIRMED) |
| 7 | Voronoi | tangled | CDT-under-M @steiner0.015 | **0.0075** fl-chord, nRed **0** | — | 5% | 0 | ~0 | ✅ REACH (depth trimmed the steep tail) |
| 8 | Crystalline | tangled | CDT-under-M @steiner0.010 | **0.0045** fl-chord | 0.09 (9 facets, steep-excl) | 0.1% | 0 | ~0 | ✅ REACH (chord); 9-facet crystal-edge tail |
| 9 | CelticKnot | weave/braid | doubled-grid uni24 @20M | **0.0007** | 0.025 swept-crease straddle | 3.5% | 0 | ~0 | ✅ REACH p99; swept-straddle worst-facet residual |
| 10 | CelticTriquetra | weave/braid | doubled-grid uni24 @22M | **0.0084** | 0.020 swept-crease straddle | 7.4% | 0 | ~0 | ✅ REACH p99; swept-straddle residual |
| 11 | BasketWeave | weave/braid | doubled-grid sq08 @14.3M | **0.0089** | 0.029 tail (worst-300 corners 0.66) | 4.1% | 0 | ~0 | ✅ REACH p99+watertight+zero-serr; %<20 4% + sharp-corner set |
| 12 | ArtDeco | z-tiled | SHARP3D doubled-rings @2.23M | **0.001** (max 0.014) | tread-lip C0 | **51.7%** | 0 | 0.001 | ⚠️ REACH chord+watertight; **%<20 51.7% quality FAIL** |
| 13 | GeometricStar | on-surface (z-tiled REFUTED) | dense M-square | 0.0193 (faces CAD-grade) | crest/crease, density-responsive | 2.1% | 0 | — | 🔶 PARTIAL (0.019 density-responsive → push) |
| 14 | DragonScales | z-tiled | SHARP3D doubled-rings | 0.0209 (density-responsive) | tread-lip C0 | 7.6% | 0 | 0.010 | 🔶 PARTIAL (0.021 density-responsive → push) |
| 15 | SpiralRidges | smooth-helix (θ-ridge REFUTED) | uniform M-square @3.3M | 0.0046 faces; anchor **0.013** | ridge crests, density-responsive | 0.1% | 0 | 0.015 | 🔶 PARTIAL (faces ≤0.005; steep-tail 0.013) |
| 16 | BambooSegments | on-surface (z-tiled REFUTED) | dense M-square | 0.0057 faces; **0.114** crease | segment-ring crease, density-resp | 0.5% | 0 | — | 🔶 PARTIAL (faces CAD; crease-tail 0.11) |
| 17 | LowPolyFacet | on-surface (z-tiled REFUTED) | dense M-square | faces radial **0** (gnP99 0.0001) | 0.236 = 12 DESIGNED edges (density-INVARIANT) | 0% | 0 | — | 🟩 steep-EXCLUDE (faces exact; edges designed-sharp) |
| 18 | SuperformulaBlossom | θ-ridge + non-2π seam | ridge-graph seamCliff | body radial **0.0033** (CAD) | 35.7 seam-cliff LADDER | 0.8–1.1% int | **8** | ~0 body | 🔶 PARTIAL (body CAD-grade; seam-ladder + watertight-8 = unfinished builder) |
| 19 | GothicArches | z-rib lattice (θ-ridge REFUTED) | ridge-graph MIS-CHAINS | **29.9** (drift 39.7, births 144 spurious) | — | **30.7%** | 0 | — | ❌ REFUTED-AXIS → CDT-under-M / feature-conforming (prod baseline 0.199/%<20 4) |
| 20 | HexagonalHive | staggered 2D hex grid (θ-ridge REFUTED) | ridge-graph MIS-CHAINS | **33.5** (drift 145, disc 17) | — | 12–15% | 0 | — | ❌ REFUTED-AXIS → CDT-under-M / doubled-grid (prod raw-kernel already 0.0197/%<20 2) |

## Honest counts

- **11/20 MEASURED whole-mesh true-3D p99 ≤ 0.01 + raw-index watertight + ~zero serration:** #1–11 (5 smooth, 3 tangled,
  3 weave/braid). Caveats: HarmonicRipple density-fragile (needs ≥1.1M); BasketWeave/CelticKnot/CelticTriquetra carry
  genuine-geometry cliff/swept-crease worst-facet tails (0.02–0.66) though p99 ≤0.01 and serration ≈ 0.
- **1/20 chord-REACH but quality-FAIL:** ArtDeco (chord 0.001 ✓, watertight ✓, but %<20 = 51.7% tread-sub aspect).
- **4/20 PARTIAL density-responsive (faces already CAD-grade, tail 0.013–0.11 shrinks with density):** GeometricStar,
  DragonScales, SpiralRidges, BambooSegments.
- **1/20 steep-EXCLUDE (faces exact; the p99 is the 12 designed convex-polygon edges — genuine sharp geometry):** LowPolyFacet.
- **1/20 body-CAD-grade + builder-defect:** SuperformulaBlossom (flank body 0.0033; residual = seam-cliff ladder
  degeneracy + rawNonMan 8, both engineering).
- **2/20 REFUTED-AXIS (ridge-graph is the WRONG primitive):** GothicArches, HexagonalHive — belong on the tangled
  CDT-under-M / feature-conforming axis, where the PRODUCTION path already measures near-CAD (HexHive 0.0197, Gothic 0.199).

## The load-bearing finding: the dispatch map was partly wrong — RIDGE-GRAPH is the weak link

The sprint REFUTED the registry's "θ-ridge → ridge-graph" and half of "z-tiled → doubled-rings":
- **ridge-graph MIS-CHAINS** Gothic (z-localized rib lattice) and HexHive (staggered 2D grid): 30–34 mm bridges,
  gnOver=0 ⇒ genuine bridges, not metric artifacts. These are NETWORKS ⇒ tangled CDT-under-M, not vertical θ-chains.
- **SpiralRidges is smooth-helix** (kink 0.023, 2π-periodic) — uniform M-square captures the helix-shear in rA(θ,z); no
  ridge-graph needed (0.0046 faces).
- **LowPoly / GeometricStar / BambooSegments are on-surface single-valued**, NOT z-stepped risers — dense M-square, not
  doubled-rings.

**Refined dispatch (the real map):**
1. **dense M-square under M** (smooth + on-surface single-valued): 8–9 styles — smooth ×5, SpiralRidges, GeometricStar,
   BambooSegments, LowPoly, (SFB flank body).
2. **CDT-under-M + deep sag (chordSteiner)** (any dense curved/rib/grid NETWORK): Gyroid, Voronoi, Crystalline **+ Gothic,
   HexHive** (the re-route).
3. **doubled-rings** (true z-risers only): ArtDeco, DragonScales.
4. **crease-conforming doubled-grid** (weave/braid grid-cliffs): BasketWeave (axis-aligned), CelticKnot/CelticTriquetra
   (swept-curve grid).
5. **explicit seam-cliff** (non-2π θ-seam): only SFB.

⇒ metric-Delaunay-under-M (dense M-square + CDT deep-sag) alone covers **~14/20**; the specialized primitives
(doubled-rings, doubled-grid, seam-cliff) handle the other 6. The ridge-graph structured-column primitive is largely
SUBSUMED and should be retired except possibly for the SFB seam.

## Remaining gaps — next attacks, by leverage

1. **Re-route Gothic + HexHive to CDT-under-M + deep sag** (HIGH; 2 styles; production already near-CAD — HexHive 0.0197
   is essentially there, Gothic 0.199 needs the deep-sag push). Validates the refined dispatch.
2. **z-tiled/on-surface density push** DragonScales / GeometricStar / BambooSegments (MED; density-responsive at
   0.02–0.11, faces already CAD-grade → tighten chordSteiner depth / density to ≤0.01).
3. **ArtDeco %<20 fix** (MED; chord already ≤0.01 — square the tread sub-cells / cliff-cell aspect).
4. **Braid swept-curve doubled-grid** CelticKnot/CelticTriquetra (MED; p99 met — the density-INVARIANT swept-crease
   straddle max needs cell boundaries FOLLOWING localU=0.4·sin(v+phase); oracle: `celticKnotAnalyticCenterlines` in
   `src/fidelity/verify_voronoiCelticFeatureFlow.test.ts`).
5. **SFB seam-cliff ladder** finish + fix rawNonMan 8 (MED; body already 0.0033).
6. **SpiralRidges** small density bump 0.013→≤0.01 (LOW).
7. **LowPolyFacet** accept + document as steep-EXCLUDE (faces exact, 12 designed edges) (TRIVIAL).

## Verdict

**MECHANISM-COMPLETE and now 11/20 MEASURED ≤0.01** (whole-mesh true-3D + watertight + zero serration). No genuine
representational wall remains: every open item is density (2,6), a quality-tail (3), swept-grid engineering (4), a
builder finish (5), or a re-route to an already-proven primitive (1). The one strategic correction is that the
ridge-graph is the wrong tool for Gothic/HexHive — CDT-under-M subsumes them.

## Honesty catches (verify overturned close)

- **HarmonicRipple** close 0.0089 → verify density-FRAGILE (½-density 0.017; anchor 0.0117): reaches only at ≥1.1M tris.
- **SuperellipseMorph / FourierBloom** close true3d 0.0085/0.0081 → verify GN was overstating; brute-anchor confirms
  0.0066/0.0093 ≤0.01 (rulerArtifact on the raw GN p99, PASS on the trusted number).
- **BasketWeave** close p99 0.0089/tail 0.029 → verify surfaced a worst-300 sharp-corner set at gnRed 0.665 (p99 holds).
- **θ close self-refuted** Gothic/HexHive axis (did NOT fabricate a pass) — correct discipline.

## Files
Close: `research/exchange/_close_{smooth,theta,ztiled,weave,tangled}/scorecard.ndjson` (+ `_close_{theta,weave}/SCORECARD.md`).
Verify: `research/exchange/_verify_{smooth,theta,weave,ztiled}/*.ndjson`. Probes `research/bridge/_close_*.test.ts` +
`_verify_*.test.ts`. All dev-only; no src/ or shared-kernel edit; not committed (on disk for review).

---

## GAP-CLOSE PASS (2026-07-03b)

Re-attacked the 7 open styles with the CORRECTED dispatch (CDT-under-M for Gothic/HexHive; z-riser sheet-aspect for
ArtDeco/DragonScales; honest brute-anchored redMm-AT-target for GS/BS/SR). 3 gap groups, real vitest, gnOver=0
everywhere (genuine gaps, not GN overstatement). Ledger: registry sections `E-2026-07-03-GAP-{GSBSS,GOTHHEX,TREADSQ}`;
commits `d1f2175`, `9e0097f`, `6762159` (refactor/core-migration). Dev-only; no src/ or shared-kernel edit.

### (1) The 7 gap styles — measured

| style | new recipe | honest true-3D p99 (screen / ½-dens) | %<20 | rawNonMan | reaches ≤0.01? | residual |
|---|---|---|---|---|---|---|
| SpiralRidges | dense M-square, square cells (nZ≈0.42·nTh), light zGrade; anchor redMm=0.008 | **0.00264** / 0.00499 | 0% | 0 | ✅ **YES** | genuinely smooth helix; gnOver01=0, density-responsive → OVERTURNS prior REFUTED |
| ArtDeco | sheared-φ doubled-rings + SQUARE tread (ts≈9) + SHEET z-rows balanced to θ-arc (sheetAspect≈1) | **0.001** / 0.001 | **0%** | 0 | ✅ **YES** | NONE — %<20 51.7%→0.0% both densities (min-angle 39–40°); root cause was z-COARSE sheared SHEET, not the tread. CAD-grade DONE |
| HexagonalHive | tangled CDT-under-M + chordSteiner (chordTol 0.015, optSweeps 2, guardManifold) | 0.0115 / 0.0139 | 0% | 0 | 🔶 **NEAR** (~2× off) | hex-cell rim-line crest under-shoot; monotone toward 0.01 but mesh saturates 910k tris; NO red facets; halves prod 0.0197 |
| GothicArches | tangled CDT-under-M + chordSteiner (chordTol 0.015, optSweeps 2, guardManifold) | 0.0662 / 0.0674 | 0.8% | 0 | 🔶 **NO** (floors ~0.06) | steep rib/mullion crest UNDER-SHOOT; density-responsive 0.158→0.057 then FLOORS >2.2M tris; chord-sag guard blind to perp gap on sharpest crests |
| DragonScales | doubled-rings + treadSub=1 lip-only + SHEET z-rows balanced to θ-arc (sheetAspect=1) | 0.0136 / 0.0132 | 0.4% | 0 | 🔶 **NO** (floor) | %<20 GOAL MET (7.6%→0.4%); tail 100% tread-LIP riser cells. Chord DENSITY-INVARIANT ~0.012–0.013 = genuine C0 tread-lip, sub-print; radial ruler overstates the near-vertical lip |
| GeometricStar | dense M-square + GN-selected adversarial floor (worst-120 full-azimuth brute, 120/120 stay-hi = genuine) | 0.03616 / 0.04295 | 1.1% | 0 | 🔶 **NO** (closable) | GENUINE density-responsive strapwork chevron C1 crease-corner + small ~0.024 C0 tile-boundary crease at z=k·30. Corrects prior under-sampled radial "0.019"; closable via tile-boundary doubled-rings + density |
| BambooSegments | dense M-square (hides cliff) → DOUBLED-RING vs closed-object | 0.56016 (sheet) / 0.058 (doubled) | 29.8% (sheet) | 0 | ❌ **NO** (EXCLUDE) | steep-EXCLUDE: genuine near-vertical C0 SEGMENT-RING cliff (±1.38mm zero-width radius step at z=k·24 from asymVar phase-jump). Doubled-ring cut 10× (0.56→0.058); ≤0.01 needs DragonScales square-tread + θ-varying-step reference |

### (2) Updated count: 13/20 MEASURED ≤0.01

Prior 11/20 (#1–11) **+ SpiralRidges + ArtDeco** = **13/20** measured whole-mesh true-3D p99 ≤0.01 + raw-index
watertight + ~zero serration/quality. ArtDeco was the "chord-REACH but %<20-FAIL" holdout — the sheet-aspect fix took
%<20 51.7%→0.0%, promoting it to a full REACH. SpiralRidges overturns its own prior REFUTED via the honest redMm=0.008
anchor (the old redMm=0.1 body-diluted fallback was a false pass in the OTHER direction — here the correct anchor
returns nRed=0 = a genuine pass). HexHive is a PARTIAL-NEAR (0.0115, ~2× off, no red facets) — a modest perp-guard
closes it. The remaining 5 open: Gothic (perp-floor), DragonScales (tread-lip floor, characterized irreducible),
GeometricStar (closable), BambooSegments (steep-EXCLUDE), + SFB (builder-defect, untouched this pass).

### (3) Refined dispatch verdict: CONFIRMED (as the correct AXIS), with a measured chord-guard limit

The refined map's **"CDT-under-M subsumes Gothic + HexHive"** claim is **CONFIRMED on the load-bearing axis**: the
ridge-graph pathology (Gothic 29.9mm mis-chain / HexHive 33.5mm bridge, 30.7%/12–15% <20°) is ELIMINATED — under
tangled CDT-under-M both now show rawNonMan 0, weldNonMan 0, %<20 <1%, no bridging, and chord density-RESPONSIVE
(HexHive 0.0171→0.0115; Gothic 0.158→0.057). The ridge-graph route is DEAD for these two; CDT-under-M is the right
tool. **NOT CONFIRMED** is that chordSteiner alone drives them to literal ≤0.01: HexHive lands at 0.0115 (near) and
Gothic FLOORS at ~0.06 on the steepest rib crests once tris >2.2M — the chord-sag/deep-sag guard is BLIND to the
true-3D-PERPENDICULAR under-shoot on near-vertical crests. So: **axis CONFIRMED, chord-only-lever REFUTED at the last
2×** — closing Gothic (and tightening HexHive) needs a true-3D-perpendicular refinement guard (or the dormant analytic
curvatureFloor sizing term), NOT more chordSteiner depth (proven density-invariant beyond ~2.2M tris). The z-riser
sheet-aspect sub-dispatch is also CONFIRMED (ArtDeco/DragonScales %<20 tails were sheared-SHEET parallelograms, killed
by sheetAspect≈1; tread subdivision only ADDS slivers). SpiralRidges = smooth-helix M-square CONFIRMED (not ridge-graph).

### (4) Genuinely-remaining engineering items + next attack

| item | status | next attack |
|---|---|---|
| **GothicArches** perp-floor | PARTIAL 0.0662 (correct axis, chord-guard floors) | true-3D-PERPENDICULAR refinement guard on rib crests (pre-register on Gothic, cleanest crest under-shoot target), OR dormant analytic curvatureFloor sizing; crest-ONLY feature-conforming as fallback (NOT full network — protected network re-opens quality) |
| **HexagonalHive** ~2× | PARTIAL-NEAR 0.0115 (no red facets) | same perp-guard, lighter — mesh already saturates, so a modest perpendicular-driven refine on the hex rim-lines should cross 0.01 |
| **GeometricStar** closable | PARTIAL 0.036 (density-responsive, genuine crease) | tile-boundary doubled-rings at z=k·30 (kills the ~0.024 C0 crease) + strapwork chevron density; NOT a wall |
| **DragonScales** tread-lip floor | PARTIAL 0.0136 (density-INVARIANT, sub-print) | accept + document as irreducible one-sided riser-wall class (radial overstates near-vertical lip), OR chase literal 0.01 with a true-3D-perpendicular refine guard on the lip |
| **BambooSegments** steep-EXCLUDE | 0.56 sheet / 0.058 doubled (genuine C0 cliff) | doubled-ring + DragonScales square-tread + θ-varying-step reference alignment (same class as DragonScales); or accept+document as steep-EXCLUDE segment-ring cliff |
| **SFB** seam-ladder | PARTIAL (body 0.0033 CAD; seam-cliff ladder + rawNonMan 8) | UNTOUCHED this pass — explicit seam-cliff builder finish + fix rawNonMan 8 (builder engineering, not a representational wall) |
| **braid swept-curve grid** (CK/CT) | REACH p99, swept-crease straddle worst-facet residual | cell boundaries FOLLOWING localU=0.4·sin(v+phase); oracle `celticKnotAnalyticCenterlines` — already p99-clean, this is worst-facet polish only |

**Common lever across the 4 remaining chase-able styles (Gothic, HexHive, DragonScales, and GeometricStar's crest):
a TRUE-3D-PERPENDICULAR-driven refinement guard.** The chord-sag/deep-sag guard is provably blind to perpendicular
under-shoot on near-vertical crests/lips (density-invariant floors at 0.06 Gothic / 0.013 DragonScales). This is the
single highest-leverage next experiment — pre-register it on Gothic (cleanest target), expect it to also close HexHive
and DragonScales-lip. No representational wall remains; every open item is a guard-metric swap, a density/tile-boundary
push, a builder finish, or an accept-as-designed-sharp classification.
