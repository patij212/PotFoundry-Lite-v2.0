# S101 — THE BACK-FACING GATE ACROSS THE CATALOGUE: 7 of 17 STYLES ARE ALREADY AT ZERO, AND THE FAILURES ARE THE HUBBED FOUR

First use of S100's ship gate as a scoping instrument. Runner
`C:/Users/patij212/.claude/jobs/…/s101-gate-sweep.sh` (recorded here; the gate itself is
`research/tools/s100BackFacingGate.ts`). Raw table: `s100/S101_GATE_SWEEP.tsv`.

## ⚠ SCOPE — THIS IS NOT THE SHIP STATE

Every mesh here is `*_ring_D--.stl`: **no `H` suffix**, and `SHAPE_SUFFIX = SHAPE||MID3D||LONGFALL ? 'H':''`,
so these are the **SHAPE-OFF lineage** that S94/S95 proved is superseded and worse. On the one style
measured both ways, Voronoi, SHAPE-off 0.50635% → SHAPE-on **0.01298% = 39.0× better**. **So this table is
an UPPER BOUND on the export and a relative ranking — never quote it as where the export stands today.**

## RESULT — 19 meshes run, 17 admissible

| style | facets | back-facing | AREA % | verdict |
|---|---:|---:|---:|---|
| ArtDeco | 241,720 | **0** | 0.00000 | **PASS** |
| BambooSegments | 324,801 | **0** | 0.00000 | **PASS** |
| FourierBloom | 533,521 | **0** | 0.00000 | **PASS** |
| LowPolyFacet | 137,480 | **0** | 0.00000 | **PASS** |
| RippleInterference | 170,496 | **0** | 0.00000 | **PASS** |
| SuperellipseMorph | 155,824 | **0** | 0.00000 | **PASS** |
| SuperformulaBlossom | 160,600 | **0** | 0.00000 | **PASS** |
| WaveInterference | 168,288 | 4 | 0.00005 | FAIL |
| DragonScales | 667,837 | 155 | 0.00041 | FAIL |
| SpiralRidges | 763,322 | 3,738 | 0.00180 | FAIL |
| HexagonalHive | 880,000 | 1,000 | 0.01409 | FAIL |
| GothicArches (small `_D--`) | 61,120 | 228 | 0.21403 | FAIL |
| GyroidManifold | 1,132,314 | 10,267 | 0.32485 | FAIL |
| **Voronoi** | 806,765 | 62,332 | **0.50635** | FAIL |
| **CelticTriquetra** | 1,714,638 | 28,375 | **0.95229** | FAIL |
| **Crystalline** | 1,163,100 | 21,064 | **1.09450** | FAIL |
| **GeometricStar** | 885,400 | 60,220 | **1.46237** | FAIL |
| ~~CelticKnot~~ | 2,537,301 | — | — | **NOT-MEASURED** |
| ~~BasketWeave~~ | 844,520 | — | — | **NOT-MEASURED** |

**7 of 17 admissible styles carry ZERO back-facing facets — on the WORSE lineage.** That is a far better
starting position than "all five meshes FAIL" implied.

## THE GATE'S GUARD FIRED, AND IT WAS RIGHT

CelticKnot and BasketWeave are **inadmissible, not bad**: their `PRECOND radial` reads
**MAX |r_mesh − rA| = 600.0 µm** and **2000.0 µm** respectively, i.e. those STLs were built with style
parameters that are not the registry defaults the gate scores against. CelticKnot's winding agreement is
also low (88.0% vs Gothic's 99.8%). The gate returned **NOT-MEASURED rather than a number** — exactly the
"never a false PASS" behaviour it was built with. **Their counts (70,000 / 2,538) must not be quoted.**
Re-run them with the parameters that actually built those meshes.

## ⭐ THE FAILURES ARE THE HUBBED STYLES — an exact match, not a loose correlation

S91 partitioned the catalogue by max facet-degree and found exactly **four HUBBED styles: Voronoi 2,550 ·
CelticTriquetra 1,289 · Crystalline 1,240 · GeometricStar 1,120.**

**The top four by back-facing AREA in this sweep are GeometricStar, Crystalline, CelticTriquetra and
Voronoi — the same four, and no others.** Together they hold **4.02 percentage points of the 4.58 total
= 87.8% of all back-facing area** in the sweep.

That is a mechanism, not a coincidence, and it is already established: S98 proved back-facing facets are
**needle slivers**; S94/S95 proved the hubs are a **SHAPE-off phenomenon** that the default-ON shape gate
eliminates (max degree 2,550 → 40); and the one style measured both ways improved **39.0×**.

⇒ **PREDICTION, pre-registered here:** re-running these four under SHAPE-on should remove most of their
back-facing area. If it does not, the sliver→hub→back-facing chain is wrong and S98's mechanism needs
re-opening. **KILL: < 5× improvement by AREA on any of the four.**

## WHAT THIS CHANGES

The export is much closer to clean than the campaign's framing suggested. The remaining work is
**concentrated in four styles**, it has a **known mechanism** (slivers on hub vertices), and the fix
**already ships by default** — it simply has never been measured on those four. The cheapest decisive
next step is the four SHAPE-on arms (~4 min each), not another operator.

## NOT MEASURED

Only one config per style; no SHAPE-on arm for 18 of 19; the `gothicarches_ring_D--` row is the small
61,120-facet artifact, not the 1.14 M `S39CTL` used elsewhere in this campaign, so its 0.21403% is not
comparable to S98's 0.00596%; recall prints NOT-MEASURED on every row (S98 measured 100% on two meshes,
not proved generally); no sigma bands — these are full-mesh censuses, not samples, so the counts are exact
but the *config* is a single draw.
