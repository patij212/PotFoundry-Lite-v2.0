# S114 — THE SWEEP OVERTURNS S113'S HEADLINE, AND A THIRD INSTRUMENT DEFECT VOIDS 4,656 OF THE 6,193

**2026-08-06.** 12 agents, 2.88 M tokens, 0 errors, ~113 min. Ruler fixed test-first; the contested 12.7×
adjudicated; P1/P3 re-quoted; the "mesh-added" class closed; **the all-styles sweep finally run.**

---

## 0. THE HEADLINE — I WAS WRONG ABOUT THE SCOPE OF S113

***S113's conclusion "adjacent-facet dihedral is not a defect metric on crease-bearing styles" IS
GOTHIC-SPECIFIC. It does not generalise, and GothicArches is the odd one out — the only style swept whose
analytic surface actually carries C0 creases (168.13°, bracket-invariant).***

| style | >45° class is real analytic turn (by AREA) | verdict |
|---|---|---|
| **GothicArches** | 96.33% (class-wide), 99.40% of straddlers | CONFIRMS |
| BambooSegments | 100.00% | CONFIRMS |
| DragonScales / GeometricStar | 98.9% / 98.1% | CONFIRMS (DragonScales **inverts** Gothic: its *curtain* is 99.79% real, its *wall* only 16.58%) |
| CelticTriquetra | 76.31% on the pre-registered bar, **35.84% class-wide** | CONFIRMS-but-outlier; **2.06% of mesh reducible = 65× Gothic** |
| Crystalline | 39.3% | **CONTRADICTS** |
| ArtDeco | **0.00%** | **CONTRADICTS** |
| **HexagonalHive** | **0.00%, 100% mesh-manufactured** (and *not* f32 noise) | ***GOTHIC'S EXACT INVERSE*** |
| SpiralRidges / Voronoi / WaveInterference | **0.00% / 2.15% / 0.00%** | **CONTRADICTS — genuine mesh defect** |
| GyroidManifold | real geometry but **SMOOTH SWEEP 81.73%**, crease only 14.04% | different mechanism |
| LowPolyFacet, RippleInterference, FourierBloom | **no >45° class at all** (FourierBloom MAX dihedral 9.06°) | VACUOUS |
| BasketWeave, CelticKnot | **REFUSED at PRECOND** — `rA` genuinely discontinuous (2000.0 µm), not a params mismatch | unmeasurable by any analytic-referenced ruler |

***On HexagonalHive, SpiralRidges, Voronoi, WaveInterference and ArtDeco the >45° class IS genuine mesh
defect.*** Quarter C reports **zero of five** styles confirming. **Never generalise a STRATA verdict from
Gothic again** — and note the campaign's standing rule held: styles differ in *kind*, not degree.

⚠ ***AND THE S112/S113 MACHINERY BARELY APPLIES ANYWHERE ELSE.*** Its domain (WALL ∩ STRADDLING) is
**7.66% of the visible class area on Gothic and 0.34% / 0.33% / 0.008% elsewhere**; on 4 of 5 quarter-A
styles the WALL/CURTAIN scoping discards **99.3–99.99%** of the >45° class *before the question is asked*.

## 1. A THIRD INSTRUMENT DEFECT — `normDeg` IS NOT CONVERGED IN THE FINITE-DIFFERENCE STEP `h`

Found by an agent's **own pre-registered h-control**, and it is larger than the `inset` scar that voided
S112 run 1.

***4,656 of the 6,193 pinned "straddling" facets read `normDeg` p50 2.93° at h = 2e-6 versus 141.68° at
h = 5e-3.*** They are **h-artifacts**. The genuine class is **S113's 1,537 interior straddlers**, where
every number is h-stable.

Two independent routes now converge on that same set: S113's oracle (geometric, via analytic turn) and
S114's analytic single-flank ceiling, which **reproduces the 73.6× fidelity prize to 1.04×** and puts the
orientation headroom at **70.49°** (not the 58.98° I quoted, itself already a correction of the void 0.20°).

**Consequence: S112's "0.1872%" and S113's "0.1816% target set" are overstated by this mechanism.** The
funnel was *not* re-run at small h — that is the top open item.

## 2. THE 12.7× ADJUDICATED — AND BOTH REVIEWERS WERE PARTLY WRONG

- ***LEG 1 (CURTAIN) IS REFUTED OUTRIGHT: ZERO facets are non-graph.*** `graphRatio` is **not a graph
  test** — it is a parameter-triangle **SHAPE** test. My curtain scoping was measuring the wrong thing.
  (Reviewer A was right that the leg fails, wrong about the replacement figure: 0.2400% does not
  reproduce; restoring leg 1 alone measures **0.2171%**, matching S113c independently.)
- **LEG 2 (per-pair vs per-facet accounting) is CONFIRMED at 1.711×.** (Reviewer B's 0.1062% ≈ the
  measured 0.1094%/0.1119%.)
- ***ADJUDICATED FIGURE: 0.1368% of mesh area (52.5933 mm², 9,200 facets) — S112 was 1.369× HIGH,
  not 1.28× low.***

⚠ **Its verifier refuted it narrowly and the objection stands:** the leg-2 classifier is **still
unvalidated** — S113c's pre-registered A3 bar *fired* ("conformed" facets came out 0.94× by area *more*
crease-aligned than "straddling" ones against a 2.0× kill line) — and the rule is worth 1.10× on the
number (0.1368% → 0.1507% with it off). **Treat 0.1368% as provisional.**

⚠⚠ ***AND THE 45° VISIBILITY CUT WAS NEVER VALIDATED AGAINST A RENDER.*** Every figure in the entire
S108→S114 line scales with it, nobody has swept it, and per `project_s98_backfacing` **every campaign
render is `DoubleSide`**. ***There is no rendered evidence anywhere that 45° is a visibility threshold.***

## 3. THE 1,537 ARE NOT CUTTABLE — AND THE PLACEBO BEAT BOTH OPERATORS AGAIN

They reproduce exactly. But only **19 of them (1.26% of their area)** have a crease crossing their
boundary; ***97.98% of their AREA has the crease sitting ON A VERTEX.*** Both operators priced on this
subset were **beaten by their own cost-matched midpoint placebo (0.596× and 0.801×)** — i.e. on this
class **crease location is worse than an uninformed bisection.** That is now **five operators refuted by
placebo or kill line** across S113–S114. The aligned-edge programme is closed on Gothic in both
directions: the crease is already at the vertices, and knowing where it is does not help.

## 4. THE "MESH-ADDS-TURN" CLASS IS CLOSED — THE MECHANISM IS SLIVERS

S111's label **survives the corrected instrument and grows, 55.63% → 63.47%.** Mechanism identified:
***SLIVER FACETS.*** Every vertex is on the analytic surface to 0.0310 µm; the normal error is sag over
altitude on triangles whose **min altitude is 5.94 µm**. **Not** T-junctions, **not** hubs, **not**
off-surface vertices — all three tested and excluded. (17.50% of the sampled >2× facets remain
unexplained: their well-shaped sibling reads just as badly.)

## 5. THE RULER FIX — LANDED, AND VERIFIED HARDER THAN IT WAS CLAIMED

`research/bridge/orientRuler.ts`: `locateTurn`/`locateTurnAdaptive` rewritten from bisection to a 9-cell
re-scan (one-cell widening, ties to the CENTRE, `turn` read outside the bracket).

- **Asymmetric clamp: 0.000045° → 78.690069°, against a closed form of 78.690068** (factor 1.7e6).
- Defect B: featureless segment `s` 0.0630 (pinned left) → **0.5000 exactly**.
- **13/13 fixtures pass. Test file = 165 insertions / 0 DELETIONS** ⇒ the original 11 are byte-identical
  and cannot have been relaxed. *I re-ran this myself.*
- The verifier reconstructed the "before" state by compiling git HEAD's ruler and running the NEW fixtures
  against it: **exactly 2 failures, matching the reported values to the digit.**
- ***`orientOfFacet` is BYTE-IDENTICAL*** across the change — sha256 over 825,120 float64 (1,146 facets ×
  48 configs: 2 samplers × k{4,8,16} × inset{0,0.01,0.05,0.1} × 2 conventions), `cmp` clean on 6.6 MB
  binary and 25.4 MB text. The campaign's primary instrument did not move.
- S113 funnel/area unmoved (`meta.json` diff identical), but **`locs.turnDeg` moved on 100% of 19,692
  edges**: POST is strongly bimodal where PRE was smeared. Independent 8192-cell arbiter: POST closer on
  **69.78%**, with **2.00× fewer missed turns and 7.1× fewer invented ones** — an improvement on both
  sides, not a trade.

⚠ **Correction carried from the verifier:** the fix agent's finding-6 title claims "count and area move in
opposite directions". **They do not** — they agree in direction at all four bars; what flips across bars
is the class itself. Do not carry that inference forward.
⚠ **Not closed:** POST still misses a ≥5° turn the dense scan sees on **213/857 = 24.9%** of sampled
edges (mean 59.39°). The fix halves the class; it does not close it.

## 6. WHAT TO DO NEXT, IN ORDER

1. ***RE-RUN THE S112 FUNNEL AT h ≤ 1e-5.*** Everything downstream of "0.1872%"/"0.1816%" is suspect until
   this lands. Expect the class to collapse toward the 1,537.
2. ***VALIDATE OR REPLACE THE 45° CUT AGAINST AN ACTUAL RENDER*** (and fix `DoubleSide` first, or the
   render cannot show orientation defects at all).
3. **Attack the styles where the defect is REAL** — HexagonalHive (100% mesh-manufactured), SpiralRidges,
   Voronoi, WaveInterference, ArtDeco, and **CelticTriquetra at 65× Gothic's reducible area**. That is
   where the remaining engineering value is; Gothic was the wrong anchor.
4. **Validate the leg-2 (conformed/straddling) classifier** with a direct vertex-on-crease A/B carrying a
   FLOOR as well as a ceiling, on a population selected without the drop.
5. `BasketWeave` and `CelticKnot` need a **non-analytic** ruler — their `rA` is genuinely discontinuous.
