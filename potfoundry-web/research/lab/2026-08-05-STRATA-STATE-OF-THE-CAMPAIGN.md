# STRATA — STATE OF THE CAMPAIGN, 2026-08-05

**READ THIS BEFORE QUOTING ANY NUMBER FROM THIS PROJECT.** It supersedes the status sections of
`2026-07-29-strata-perf-convergence-worklog.md`. Where they disagree, this wins.

---

## 0. THE ONE PARAGRAPH

For months this campaign optimised against `sagAdaptiveRaw`, the driver's INFINITE-PLANE position
ruler. That ruler **under-reports honest position error by 21× to 1,527×, and OVER-reports it 28–37%
of the time.** No correction factor exists. Every `over-0.01mm` figure ever published here is void —
not scalable, void. Re-measured honestly, the meshes are far from the 0.01 mm bar, the lever that
looked like a 4.37× win is a 2× win by count and a **regression by area and by max**, and a second
defect class — ORIENTATION — went unmeasured for the whole campaign and is now the larger defect by
**410× in area**. What the ruler DID get right is ORDER: ρ = 0.964 against honest position, which is
why seven blind arms genuinely improved the mesh (3.02× by count, **11.9× by area**) while every
number they published was wrong by 24–45×. **Rank with the plane ruler; size with `certifyTriangle`.**
One lever survives honest scoring: a constrained edge flip, which is free.

***AND AS OF 2026-08-06 THE HEADLINE HAS CHANGED AGAIN, IN OUR FAVOUR.*** The 10 µm POSITION bar is
**not** what is stopping us — ideal refinement closes it at **1.04×–1.06× triangles, 0.000%
uncleared**, on both styles measured. The "near-vertical wall class that cannot be represented" **does
not exist**: it was facet SHAPE, on an artefact built with the shape guard OFF, and with the guard on
the same style on the same surface refines clean (§0g). ***The entire remaining problem is
ORIENTATION at the 1° angle bar (4.4% / 15.7% uncleared), and that — not position — is what the
persistent visible artefacts are.*** The "vertex representation is the binding constraint" reading has
lost two of its three supports and is **on hold, not confirmed**. **Start at §7.0.**

---

## 0b. *** THE LINEAGE WORKED. THE RULER RANKS WELL AND SIZES TERRIBLY. *** (S87, added after §0)

The seven-arm lineage was re-scored end to end on honest rulers. **It improved the mesh.**

| `_S9A` -> `_S24i2`, at 0.981x the triangles | |
|---|---|
| honest position PROVEN-FAIL **rate** | 3.5500% ±2.4% -> **1.1740% ±4.1% = 0.331x (3.02x), 14.1σ** |
| honest position failing **AREA** | 1.25582% -> **0.10533% = 0.084x (11.9x)** |
| from `_S8P`, the arm *before* the lineage | **3.95x / 13.2x** |
| orientation over-bar count / **AREA** | 1.026x / **1.019x — UNTOUCHED** |

***AND THE RECONCILIATION OF THIS WHOLE CAMPAIGN IS ONE NUMBER: Spearman ρ(blind, honest position) =
0.964 across the seven arms, while the blind LEVEL is 24–45× low on every one of them.*** The plane
ruler is an **excellent RANKER and a terrible SIZER**. That is why seven blind arms worked, and why
every magnitude they published is void. **Keep it as the in-loop ranker; use `certifyTriangle` as the
end-of-run sizer.** This supersedes any reading of §1 as "the plane ruler is useless" — it is not
useless, it is *unquotable*.

**ORIENTATION DOMINATES — but the ρ's here are REFUTED by §0c; read that first.** ρ(blind,
orientation area) = −0.357 and ρ(honest position, orientation area) = −0.214 are **n=7 aggregates,
p = 0.91, sign-unstable**; per facet the correlation is **POSITIVE (+0.38…+0.52)** and every position
failure is also an orientation failure. The "410×" is **inflated ~16× by bar calibration** — matched,
it is **~25×**. Orientation is still the larger defect and 43.2% of the closing mesh's area is still
over bar; it does **not** need its own ranking key. The deep tail did move (>250 µm area
1.682% -> 0.759%; area-weighted mean 35.75 -> 21.13 µm), so it is not inert — just not improving.

**SECOND INSTRUMENT DEFECT, AND IT CORRECTS A NUMBER IN THIS DOC.** `s55OrientHeatmap` sampled the
normal **only at the facet centroid**, so the campaign's published orientation figure for its own
control mesh is **21.6× LOW: 32,468 published against 700,486 measured.** Every orientation count
sourced from that tool is understated by ~21×; §2's "11.36% by count" is one of them.

**A THIRD RETIRED LEVER THAT SHOULD BE RE-OPENED.** `_S28i1` is **the best artifact in the family by
honest position AREA (0.604×)** and was retired on a max-at-one-facet plus a triangle count, having
never been scored on either honest ruler. Re-open it as a **budget trade**, not as a mechanism. (That
makes three: the cavity, S26's `shape-ar` STOP, and now S28i1.)

**Controls that make the above quotable:** bit-exact agreement with the independent S85 harness on
8,000 shared facets (0 diffs); identity twins bit-identical; and an **empirical null** taken from the
`_S11A` no-op arm (1.018× count / 0.913× area) — which is *itself* the reason two step deltas
(`_S21B->_S22B`, `_S22B->_S24i2`) are **unquotable** and are marked so rather than reported.
Of the seven steps only two move at 2σ — `_S9A->_S10A` (0.459×) and `_S11A->_S15A` (0.701×) — and
**their product, 0.322×, is the entire chain.**

Scorecard: `research/exchange/_strataConformBisect/S87_LEDGER_REEXAM.md`.

---

## 0c. *** S88 REVIEW — TWO OF MY OWN RECOMMENDATIONS REFUTED, AND THE ρ THAT MOTIVATED ONE IS NOISE ***

**`ρ(honest position, orientation) = −0.214` IS AN n=7 ARM-LEVEL AGGREGATE AND IT IS NOISE.** Exact
5,040-permutation **p = 0.9063**; the n=7 null band is **[−0.750, +0.750]**; and it is SIGN-UNSTABLE —
re-reading the same defect off the 4% sample flips it to **+0.0714**. ***PER FACET (n=50,000, 11
meshes) ρ is POSITIVE on every single one: +0.3818 … +0.5155.*** And the containment is absolute:
**posFail & orientationOK = 0 on all five arms — 3,950 position failures, zero exceptions.** Every
position failure is also an orientation failure. **The claim "nothing that ranks position will ever
find orientation" is WITHDRAWN.**

**"BUILD AN ORIENTATION RANKING KEY" — REFUTED.** Over-bar is **52–62% OF THE FACETS**. A *perfect
oracle* key at a 1%-of-mesh budget reaches only **24–31%** of the over-bar area — ***you cannot rank
into a majority-prevalence defect.*** And the headroom a key would unlock over the already-banked
flip is, measured, **ZERO**: the flip needs no key (it enumerates every interior edge), the exact
hexagon-cavity DP adds 3.29% and is also keyless, collapse's 0.38% is Voronoi-only, density is
×0.9968, and ideal split placement is 0.00%.

**"RE-OPEN `_S28i1`" — REFUTED, and S87's basis for it was false.** `s28BoundCol.ts:77` imports
`certifyTriangle` and calls it at `:142` with Phase D's identical arg list at **COMPLETE 1,260,110 /
1,260,110 coverage** — 30× S87's own 3.343% sample. **It WAS scored on an honest ruler.** Worse for
the recommendation: `_S39CTL` beats it **0.336× by area at 0.76× the triangles**, and a new `_S10B`
arm puts `α = 1.800`, predicting **0.7345×** at `_S28i1`'s own dose — *inside* its CI, so it is not
resolvably a lever at all, just the density elasticity. ***My caution about the "0.913 empirical null"
was also wrong***: that null is ONE DRAW whose own 95% CI is **[0.5946, 1.4430]**, which contains
1.000. The null is 1.000.

**AND DENSITY MAKES FAILURES SMALLER, NOT FEWER** — both density arms move violating COUNT the wrong
way (+52%, +56%) while relative size falls 0.0897 → 0.0424.

### 0c.1 THE TWO FINDINGS WORTH MORE THAN EITHER REVIEW

**(1) THE SELECTOR ARCHITECTURE WORKS — POINTING THE OTHER WAY.** Use the cheap ORIENTATION chord to
triage which facets get the expensive POSITION certificate: **recall 0.90 at f = 5.03% / 4.68% /
0.86% ⇒ 15.72× / 16.62× / 45.54× cheaper** than the blind 375-eval test. The reverse — a position key
selecting for orientation — needs f = 78.7–84.0% ⇒ **1.17×, worthless**. And the driver's plane ruler
is a **BAD selector (1.10×)** despite ρ(p,w) = 0.84: ***ρ IS NOT RECALL.*** This is 15–45× off the
campaign's dominant compute cost (the certificate is 61× the mesher).

**(2) THE "410× IN AREA" IS INFLATED 13–18× BY A BAR-CALIBRATION EFFECT.** Median `o2/w` = 6.5–8.4 on
all five meshes, and the reason is analytic: `s = d²k/8` while `turn = dk`, so chord ≈ 8s — **a 10 µm
orientation bar is ~7× stricter than a 10 µm position bar on the same facet.** Bar-matched: `_S24i2`
**409× → 24.9×**, `_S28i1` 636× → 35.4×, `_S39CTL` 1997× → 149×, `_S9A` 34× → 3.2×. Orientation is
still the larger defect — by **~25× on the closing mesh, not 410×.**

**REVISED PRIORITY:** (1) build the **selector**, not the key, and point it at the certificate;
(2) land the flip on the remaining styles; (3) fix the super-hub runaway; (4) the vertex
representation (§7.5) — the only item that changes an *assumption*. **DO NOT re-open `_S28i1`**, and
re-baseline off `_S39CTL` rather than `_S24i2`.

Scorecard: `research/exchange/_strataConformBisect/S88_REVIEW_FINDINGS.md`.

---

## 0d. *** S89/S90/S92 — THE SELECTOR IS DEAD, THE FLIP'S 3.73× IS A CENTROID ARTEFACT, AND `tighten` IS 96% OF THE MONEY ***

### 0d.0 ⚠ THE FLIP'S HEADLINE IS RETIRED (S92). READ THIS BEFORE §3.

`8.131% → 2.179% = 3.73×` is expressed in `landFlipPass.orientOf` = `normAngOf` — the facet-vs-surface
normal angle **AT THE CENTROID ONLY**, which is *also the flip's own C1 accept test and its ranking
key*. **The pass optimises the measure it is scored by**, and a re-cut diagonal is precisely the
operation that fixes a centroid normal while the facet interior stays wrong. Re-scored on the
**covering** ruler (`orientOfFacet`, k=8, inset 0.02), same two STLs, one 60,000-facet golden-stride
sample scored both ways:

| mesh | centroid ratio (banked) | **covering ratio** |
|---|---|---|
| Gothic S39CTL | 3.852× area / 3.611× count | **1.050× area / 1.219× count** |
| Voronoi | 1.654× area / 1.325× count | **0.984× area / 1.085× count — BELOW ONE** |

Level gap 5.37× / 3.00×; **Gothic's covering max is 1706.3 µm before AND after — the worst facet does
not move.** "73.2% of the over-bar area removed" is really **4.8%**. Non-vacuity passed per mesh (the
centroid column reproduces each banked pair) and the covering column reproduces S87's whole-mesh
figures from a separately written tool.

***THE FLIP IS A SMALL FREE LEVER, NOT A 3.73× ONE.*** What still stands: its **honest POSITION** win
(0.458× on changed facets, **0.685× count / 0.728% area whole-mesh**), topology byte-identical, 0
vertices moved, 0 triangles added, byte-identical flag-OFF control. It is free and it is real — it is
just not an orientation lever.

**This is the THIRD centroid-only instrument defect this session** (`s49BackFacing`, `s55OrientHeatmap`
at 21.6× low, now `landFlipPass.orientOf`). ***A single-point normal sample is not a facet measure.
Any orientation number in this project must state its sampling.***

### 0d.1 P1 "BUILD THE SELECTOR" — REFUTED on its own pre-registered kill line

Both model constants behind the 15.7–45.5× were wrong:

    "certificate = 375 evals"  ->  MEASURED  40,178 (Gothic) / 329,638 (Voronoi)  =  107x / 879x
    "selector = 5 evals"       ->  MEASURED  225 at k=8 (exactly 5(k+1)(k+2)/2)   =   45x
    certify cost, FAIL vs PASS ->  694,324 vs 38,292                              =  18.1x

***ρ(orientation key, certificate cost) = +0.20 / +0.47 — THE SELECTOR KEEPS THE EXPENSIVE FACETS.***
On Voronoi it tests 15.05% of facets and that is **68.1% of the work**. End to end: Gothic 45.54×
published → 12.07× on real costs → **1.39% deployable**; Voronoi **1.47× @recall 0.90** against a
pre-registered 1.5× kill, **1.02% deployable**. And an **ORACLE CEILING of 18.09× / 8.56×** means the
published 45.54× / 15.72× were *above what a perfect selector could achieve*.

**The sound one-sided version is worth 1.02×** — `dist ≤ tan(θ)·covRadius` is sound at the required κ
but clears only 19.75% of facets holding **2.14% of the cost**, because the bound is quadratic in
facet size so it clears the SMALL = CHEAP ones. **And it is already dominated: Phase D's GPU screen
sends 1.59–1.98% to the certificate at 100% coverage with `bound ≤ tol` BY CONSTRUCTION — 31–47× more
selective, sound, and unused.** ***RUN PHASE D. DO NOT BUILD A WEAKER, UNSOUND TRIAGE IN FRONT OF IT.***

**GUARANTEE, precisely:** any selector destroys `boundMm` (composeH1's coverage count refuses it) and
preserves `witnessedMm`. It converts the certificate into a **defect-hunting screen: it can prove
FAIL, it can never prove PASS.**

**CONTAINMENT ITSELF SURVIVED** (`posFail & orientationOK = 0`): Voronoi 0 of 904 at inset 0 and 0.02,
95% UB on the leak rate 0.331%, `frac(o2/w < 1) = 0.0000%`; **4 meshes, 3,230 failures, zero
exceptions**, thinnest margin 1.54×. A true fact that is worth 1.02×.

### 0d.2 WHERE THE MONEY ACTUALLY IS

***`tighten` is 95.68% / 97.80% of ALL rA evals*** — an independent reproduction of S50's 95.22% on
two meshes with a different instrument. **The lattice is 2–4% of the money**, and the median facet
does exactly ONE doubling above its seed level. **Selecting WHICH facets to certify was always the
wrong axis; the cost is inside each facet.**

**PRE-REGISTERED SUCCESSOR:** point the same inequality at the object that costs the money — per
POINT, `dist(p,S) ≤ tan(θ)·|p − nearest vertex|` is a **sound upper bound costing ZERO rA evals** once
θ is known (15 evals/facet at k=1), as an extra `min()` in `certifyTriangle`'s pass-2 threshold test.
**This attacks the 96% with the certificate INTACT.** KILL: `bound/witnessed` moves beyond the f64
determinacy band on any facet, or `tighten` calls fall by <25%. Also: **k=1 beats k=8 everywhere**;
S88 measured only k=8.

### 0d.3 P2 SURVIVES BOTH MY OBJECTIONS — AND IT IS THE ONLY ARM IN THE PLAN

**HUB-FREE: 15 of 19 styles** — artdeco, bamboosegments, basketweave, celticknot, dragonscales,
fourierbloom, gothicarches, gyroidmanifold, hexagonalhive, lowpolyfacet, rippleinterference,
spiralridges, superellipsemorph, superformulablossom, waveinterference. **HUBBED: 4** — voronoi 2550,
celtictriquetra 1289, crystalline 1240, geometricstar 1120. *"The remaining styles may be a set of
one" is refuted: it is **79% of the catalogue**.* (Hub-free is NECESSARY, not sufficient.)

My second objection was **factually wrong** — the whole-mesh honest-position row was already published
at `S80_LAND_FINDINGS.md:255-256`: **143 → 98 = 0.685× count, 0.728× AREA.**

**P3** weakened — 4 of 19 styles, downstream prize ≤3.7%. **P4 REFUTED as a fidelity lever**: on its
own table it buys orientation ×0.976 → ×0.970 (**+0.6%**) while child position sag MAX goes
**10.36 → 129.86 µm (12.5×)** on parents already under the bar, plus two critical unguarded items (the
0.05 µm 3-D weld, and `edgeParam` silently discarding the offset).

**⇒ REVISED PRIORITY: (1) the flip on the 15 hub-free stems — but as a POSITION and TOPOLOGY lever
now, scored on the COVERING ruler, not as a 3.73× orientation win. (2) Phase D when a certificate is
needed. (3) The per-point prefilter. (4) Not P4 as fidelity.**

Scorecards: `S89_PLANREVIEW_FINDINGS.md`, `S90_SELECTOR_FINDINGS.md`, `S92_FLIP_COVERING_RESCORE.md`.

---

---

## 0e. *** S91 — THE FLIP SHIPS AS A POSITION LEVER. ITS ORIENTATION CLAIM IS DEAD ON 15/15 STYLES, AND FIXING THE KEY DOES NOT RESCUE IT. ***

**THE FLIP IS PRODUCTIONIZABLE — ON ITS POSITION CASE, GATED ON THE HUB CENSUS.** Whole-mesh,
N=50,000 paired, `certifyTriangle` @ 10 µm, flag-OFF control md5-verified byte-identical:

| GothicArches S39CTL, whole mesh | before | after |
|---|---|---|
| honest position PROVEN-FAIL **count** | 143 | **93 — 0.650×** |
| honest position failing **AREA** | 0.03534% | **0.02083% — 0.589×** |
| witnessed max | 240.1 µm | **123.9 µm** |
| topology / vertices moved / triangles added | — | **identical / 0 / 0** (15/15 arms) |

It is **free**, it is **not a trade**, and it is **better than the changed-facet figure suggested**.
***It is destructive on hubbed stems, so it must be gated on the hub census.***

**⛔ ITS ORIENTATION CLAIM IS REFUTED ON EVERY STYLE.** 15 arms, absolute mm²:

    centroid ruler (the pass's own key) : median 1.904x   (max infinite -- one style's over-bar area hits 0)
    covering ruler  (orientOfFacet k=8) : median 1.015x, min 0.728x, max 1.212x
                                          0 of 14 reach 1.25x -- and THREE ARE WORSE

Gothic 3.732× → **1.049×**, matching S92's independently-derived 1.050×. **The mechanism is printed:
honest/centroid disagreement GROWS under the pass** — Gothic 5.6 → 21.4×, SuperellipseMorph 27.9 →
**3,809.9×** — because the single centroid sample is rotated *onto* the crossing. Controls hold: the
reverse control (GeometricStar) is worse on both rulers, and it is **not saturation** (LowPolyFacet at
0.15% over-bar still reads 0.728× *worse*).

***AND FIXING THE KEY DOES NOT RESCUE IT.*** `PF_S60_KEY=cover` (a 4-point witness, default-off,
byte-identical when off, non-inert at 45,732 → 24,392 flips) reaches **1.085× / 1.109×** against a
1.5× bar. ***THE ORIENTATION DEFECT IS NOT REACHABLE BY CONNECTIVITY, WHATEVER KEY DRIVES IT.***

### 0e.1 THREE CORRECTIONS THIS FORCES

1. **The hub/mis-oriented story was over-weighted.** The `aspect3 ≥ 50` class holds only **4.46% of
   Voronoi's over-bar AREA** (count over-states it 26×). ***~88% of Voronoi's defect area is neither
   high-aspect nor hub-adjacent.*** Whatever it is, it is not the hubs.
2. **"The flip regularises degree" is CONDITIONAL and was over-claimed.** It flattens fat tails
   (DragonScales deg≥10 8.58% → 2.11%) but **worsens already-regular meshes** (HarmonicRipple maxDeg
   8 → 17), and **it does not dent super-hubs — GeometricStar's worst hub GROWS 1,120 → 1,363.**
3. **A fourth instrument defect:** `s60`'s "% of surface" area uses a **moving denominator** — total
   surface area changes between arms (GeometricStar +29%). Gothic's is 0.9998× so its own self-report
   is arithmetically sound, but any cross-style area ratio from that column is not.

### 0e.2 ~~ORIENTATION HAS NO KNOWN LEVER~~ *** WITHDRAWN BY S93 (§0f) — DENSITY WORKS; the list below is CONNECTIVITY, and §0f.1 explains in one number why all of it died ***

Everything tried is measured dead: **flips 1.015× median** (and 1.09× with a corrected key),
**exact cavity DP +3.29%**, **collapse/re-point ceiling 0.38%**, **density ~~×0.9968~~ — MIS-QUOTED, an ANGLE against a CHORD bar; it is 0.208×/level, see §0f.2**, **ideal split placement 0.00%**, ~~**splitting provably closed on Voronoi** (required child aspect 3,009)~~ **— ⛔ VOID, SHAPE-guard-OFF artefact, see §0g**, and
**P4/off-surface refuted as a fidelity lever on its own numbers** (+0.6% orientation for a 12.5×
position-sag regression).

Two agents disagree on where to go next and **both readings are compatible**: S91 concludes the class
needs an **off-surface vertex** because connectivity is exhausted; S89 measured that the *specific*
P4 formulation does not pay. ***So: connectivity is exhausted AND the one representation change
anyone has priced does not work.*** That is the honest frontier, and it is a research question, not
an engineering one.

**⇒ SHIP:** `PF_LAND_FLIP` on position, hub-gated, default-off. **⇒ WITHDRAW:** "orientation 3.73×" —
restate as *"3.73× on its own objective, 1.049× honest"*. **⇒ QUOTE THE COST:** caps ≥150° 1.66× on
Gothic. **⇒ DO NOT** build another local operator for orientation without a new representation.

Scorecard: `S91_STYLEFLIP_FINDINGS.md`. Hub census independently reproduced by two tools.

---

---

## 0f. *** S93 FRONTIER — THE CEILING THAT EXPLAINS THE WHOLE GRAVEYARD, AND "DENSITY IS DEAD" WAS A UNITS ERROR ***

### 0f.1 THE CEILING — Q1 answered, and it retrodicts every refuted lever at once

The smallest enclosing cone of the ANALYTIC surface normals over a facet's footprint is a **hard
floor on `normRad` for EVERY plane through that footprint** — the mesher's, a flipped one, a
collapsed one, a smoothed one, an off-surface one. Two-sided (`coneLB` sound lower, Badoiu–Clarkson
`coneUB` sound upper), cross-checked against `orientOfFacet` at **max |Δ| = 0.000e+0 rad**.

| over-bar AREA | Gothic | Voronoi | LowPoly |
|---|---|---|---|
| **IRREDUCIBLE for its own footprint** | **88.33%** | **93.97%** | **99.16%** |
| recoverable by re-orientation | 11.03% | 5.90% | — |

***THE MESHER IS ALREADY WITHIN 14–23% OF THE PER-FOOTPRINT OPTIMUM.*** That single number retrodicts
the entire graveyard — flips 1.015×, cavity DP +3.29%, collapse 0.38%, ideal split placement 0.00%,
P4 +0.6%. **They all died for one reason: no operator that keeps the footprint can beat the cone.**

And the population is not what anyone said: **well-shaped (minAngle p50 28–29°), LARGE (diam > 1 mm
holds 32–42%), TURNING** (spread ≥ normDeg/2 on 91–95%). ***It is a SIZING-FIELD defect — not hubs,
not slivers, not creases, not mis-orientation.*** The only way to shrink a cone is to shrink the
footprint.

### 0f.2 *** "DENSITY IS DEAD" IS WITHDRAWN — IT WAS AN ANGLE QUOTED AGAINST A CHORD BAR ***

§0e.2's `×0.9968` is a **mean ANGLE** measurement compared against a **CHORD** bar. Re-measured in one
currency, per 1→4 level:

    over-bar CHORD AREA   0.2082x / level     (against a pre-registered 0.85x kill)
    mean ANGLE            0.635x  / level
    NULL arm (coplanar split, geometrically identical mesh)  0.428x / 0.892x
    => real geometric gain 0.69x / 0.71x per level

***DENSITY WORKS ON ORIENTATION.*** It was never refuted; it was mis-quoted, by me, repeatedly. **This
is the single most consequential correction in this document.**

### 0f.3 Q3 — THERE IS NO IMPOSSIBILITY THEOREM

The Schwarz lantern (1880) **is** this regime. Hildebrandt–Polthier–Wardetzky (2006) make normals ⟺
area ⟺ metric ⟺ Laplace–Beltrami **equivalent GIVEN SHAPE REGULARITY**. arXiv:1911.03424 gives normal
error **linear** in circumradius against position's **quadratic** — ***and that gap IS the measured
`o/w ≈ 8`.*** Median minAngle 32.5° / 32.3°: these meshes **are** shape-regular, so the theorem
applies, and the measured 0.635×/level is **the theorem being obeyed**. Convergence is available.

### 0f.4 Q2 — the bar is defensible, was never chosen, and does NOT dissolve the problem

`chord/witnessed` p50 = **8.03**. ***99.931% of orientation-over-bar AREA is two-sided CERTIFIED under
the 10 µm POSITION bar*** — the two requirements are almost disjoint. The implied angular bar is
**p50 0.666°** (~1.3° adjacent-normal) against SOLIDWORKS' 10° default, ≤5° practical, ≤1° premium.
**Defensible — but never deliberately chosen.** And relaxing to the industry-practical 5° still leaves
**6.4% / 9.4% over by area: no exemption.**

### 0f.5 THE PRICE ~~AND IT SPLITS THE CATALOGUE~~ — ⛔ **RETIRED BY S95, SEE §0g**

> ⛔ ***EVERYTHING IN THIS SUBSECTION ABOUT VORONOI WAS MEASURED ON A MESH BUILT WITH THE SHAPE
> GUARD OFF.*** With the aspect gate on, the same style on the same surface closes at **9.22× with
> 0.00% uncleared** — and beats Gothic on the 1° angle bar too. The catalogue does **not** split.
> Gothic's own numbers below stand. **Read §0g before quoting any line of this.**

- **Gothic: LEPP closes the 10 µm chord bar at 6.67× triangles, 0.00% uncleared.** (The position bar
  costs 1.02×.) **This class is a density problem and density solves it.**
- **Voronoi: 222× triangles, 15.6% uncleared** — and 106.6% / 15.0% even after excluding back-facing
  parents, so "folds explain Voronoi" is **refuted**. Mechanism, printed: with folded parents already
  excluded, maxAng goes **89.5° → 125.5° → 134.6°** over two levels. ***Lifting an edge midpoint onto
  the surface FOLDS the child on a near-vertical cell wall.***
- ⇒ **Q5 rehabilitated in its strong form: the (θ,z) chart is a co-factor of the DEFECT and a
  decisive obstruction to the REMEDY.** Near-vertical walls are a representation problem, not a
  density one.

### 0f.6 TWO MORE REFUTATIONS AND A FIFTH INSTRUMENT DEFECT

- **Q4 (tangential relaxation) PRICED DEAD BEFORE BUILDING** — its ceiling is the 5.90–11.03%
  re-orientable share. A night saved.
- **Anisotropic bisection REFUTED**: the turning tensor is real (p50 **104:1** / **143:1**) but
  harvesting it by largest-normal-turn bisection is **2.76× worse than plain LEPP**, 41.5% uncleared,
  leaf minAngle 2.9°.
- ***FIFTH INSTRUMENT DEFECT, and it is in the shipped ruler.*** `orientOfFacet({orient:'outward'})`
  takes a facet's sign from the XY normal, which is ~0 on near-horizontal facets: Voronoi's
  `normDeg > 90` population has decision margin **p50 0.035**. Under the STL's own winding, whole-mesh
  **max angle 154.67° → 179.93%** and **8.497% of facets change `normDeg`**. Over-bar count and area
  are bit-identical under both conventions (θ → 180−θ), so ***campaign SHARES stand; every published
  Voronoi orientation MAX does not.***
  ⚠ ***THE "bit-identical" CLAUSE IS MY OWN AND IT IS REFUTED*** — a facet at 3° maps to 177°,
  which IS over a 5° bar. Measured 20,173 → 20,157 of 40,000 (0.079% count / 0.0020% area).
  **Shares move a little, maxima move a lot, neither is invariant. State the convention.**
  Fixed in `5698d023`: the reference is now the analytic surface normal, with a `signMargin` field.

### 0f.7 ⇒ THE NEXT ARM, PRE-REGISTERED

**Restate the orientation requirement as an ANGLE** (the chord is ~43% satisfiable by coplanar
bookkeeping — see the render below), and **drive the SIZING FIELD from `coneUB`**, the per-footprint
normal-cone aperture the census already computes at 225 rA/facet. **KILL: >12× the flag-OFF triangles,
OR over-1° AREA fails to fall below 5% on GothicArches.** **SMOOTH-RELIEF class only** — the
near-vertical-wall class is representation, not density.

**VISUAL, and it is the taxonomy in one image:** `research/exchange/_strataConformBisect/frontier/
render/GOTH_bars.png` — same mesh, same facets, two currencies. Left (chord bar, 43.4% over): the
whole wall is red, including large gently-curving quads that are over bar **only because they are
BIG**. Right (1° angular bar, 29.7% over): the wall goes green and the red **collapses onto the arch
ribs**.

Scorecard: `S93_FRONTIER_FINDINGS.md`.

> # ⚠⚠ PROVISIONAL — READ BEFORE §0g AND §0h ⚠⚠
>
> ***THE S94/CONE AGENT HAS SHOWN THAT `frontierRefine`'s LEPP COLUMN IS TAIL-DOMINATED AND THAT ITS
> PUBLISHED 6.67× GOTHIC ANCHOR IS A SINGLE-FACET LOTTERY.*** The worst **1% of parents hold 74.92% of
> all LEPP leaves**. Swept on sample size, the same mesh reads 6.673× / 0.000% uncleared at N=150 and
> **10.822× / 28.844% uncleared at N=2000** — and the entire jump is **one parent** entering the sample
> between N=600 and N=1200, which alone consumes 7,139 leaves and never clears.
>
> ***EVERY LEPP NUMBER IN §0g AND §0h WAS TAKEN AT N=400.*** That is inside the un-converged regime, so
> **the "0.00% uncleared" results below are exactly the same lottery** — a tail that was not sampled
> reads as a mesh that closes. **Treat §0g/§0h triangle counts and uncleared shares as PROVISIONAL
> until re-run at N ≥ 2000.** (Runs are queued; this banner gets resolved, not deleted.)
>
> Two further CONE results bear on it directly: ***more depth makes LEPP WORSE on both axes***
> (10.822× → 116.889×, uncleared 28.8% → 32.2% as the cap goes 16 → 24) — **LEPP does not converge on
> the unscoped mesh** — while ***`red` 1→4 never blows up on the same parent, at 0.000% uncleared at
> every N.*** The campaign's choice of bisection as *the* operator is itself now in question.
>
> ⚖ **AND THE TWO AGENTS DISAGREE, WHICH IS RECORDED, NOT RESOLVED.** WALL concludes the near-vertical
> wall causes nothing (shape does); CONE finds **all twelve** of its worst parents are near-vertical
> wall facets, nine already back-facing — and while the worst two are also slivers (minAngle 2.78°,
> 3.68°), **the third and fourth are well-shaped (34.84°, 34.83°) at slope 6.2/5.9.** Those are steep,
> well-shaped, and failing, which is the one combination WALL's shape explanation does not cover.
> **Do not treat §0g as settled on this point.**

## 0g. *** S95 — THE CATALOGUE DOES NOT SPLIT. IT WAS NEVER THE WALL; IT WAS FACET SHAPE — AND THE SHAPE GUARD WAS OFF. ***

### 0g.1 THE REFUTATION

§0f.5 said the density remedy split the catalogue into a SMOOTH-RELIEF class that closes and a
NEAR-VERTICAL-WALL class that cannot. **Both halves are dead**, and the cause is one configuration flag
on the artefact — not a property of any surface.

| Voronoi-vs-Gothic fold ratio, binned on … | wall angle β | facet shape `q = h_min/√area` |
|---|---|---|
| | **112.34×** | **0.30×** |

***BINNED ON WALL ANGLE THE EFFECT IS 112×. BINNED ON SHAPE IT VANISHES.*** 9,309 Voronoi edges
(15.5%) sit below `q = 0.2`; **Gothic has ZERO.** 97.9% of folds live on `q < 0.4` facets = 3.54% of area.

**The decisive control** — same style, same `rA`, same params, only the aspect gate on:
**folds 5.8933% → 0.2050% (28.7× count, 21.9× area), and the β-dependence disappears entirely.**

**⇒ THE ARM.** S93's own `frontierRefine.ts`, unmodified, only the STL changed; the control reproduces
S93's published `FR_REF_VOR2` to the leaf:

| Voronoi, LEPP to the 10 µm **chord** bar | SHAPE off (what §0f.5 measured) | **SHAPE on** |
|---|---|---|
| triangles | 221.95× | **9.22×** |
| uncleared | 15.57% | **0.00%** |
| leaf minAngle, mean | 0.6° | **28.0°** |

***And the SHAPE-on mesh starts WORSE — 95.1% of its area over the chord bar at level 0 against the
SHAPE-off mesh's 37.6% — and still closes.*** Starting from a worse mesh and finishing clean is the
strongest form this control could have taken.

### 0g.2 ⚠ MY "VORONOI IS THE EASIER STYLE" CLAIM WAS A SETTINGS CONFOUND — WITHDRAWN AND RE-RUN

I first wrote that Voronoi beat Gothic on the 1° angle bar too (232.69× / 15.67% against 351.28× /
20.67%). ***That compared a Gothic run at `uniformLevels 3, adaptiveMax 9` against a Voronoi run at
`uniformLevels 2, adaptiveMax 6`.*** Different level caps, so not a comparison at all. **Withdrawn.**

Re-run at MATCHED settings (both `uniLev 2 / maxLev 6`, N=400 golden-stride, S98 = a verbatim copy of
`frontierRefine.ts` whose aggregates reproduce the published VORSHP report to the digit):

| matched `uniLev 2 / maxLev 6` | Gothic S39CTL | Voronoi SHAPE-on |
|---|---|---|
| position 10 µm | 1.04×, 0.000% uncl | 1.06×, 0.000% uncl |
| lepp, chord 10 µm | **4.69×**, 10.39% uncl | 9.22×, **0.00% uncl** |
| 1° angle | **94.44×**, **4.394% uncl** | 232.69×, 15.674% uncl |

**Neither style dominates.** On the CHORD bar Voronoi is genuinely easier — it clears at maxLev 6 while
Gothic still carries 10.39% uncleared and needs maxLev 9 to reach 0.00%. On the **1° ANGLE bar Gothic
is easier by 2.5× cost and 3.6× uncleared.** ***The core §0g finding is untouched — the catalogue does
not split into "closes" and "cannot close"; both styles clear the chord bar and neither clears 1° — but
"Voronoi is the easier style" is false and was my error, not S95's.***

**⚠ THE PATTERN, AND IT IS NOW TWICE: this is the same failure as the AR-cap confound — an A/B where
more than one variable moved. Before quoting any two `frontierRefine` numbers against each other,
DIFF THEIR HEADER LINES (`uniformLevels`, `adaptiveMax`, `N`, STL).**

### 0g.3 WHAT THIS RETIRES

The near-vertical wall is a **real 41–45%-of-defect accounting class that causes nothing**. Its
lift-fold geometry is exactly right — `dPar/dPerp = tan β` at p50 1.019/1.103; a child inverts exactly
when radial sag passes `δ_crit = h_min/(2 sin β)`, predictor recall 0.9994 — **but the variable that
decides whether that threshold is reached is `h_min`: facet shape, a mesher configuration choice.**
Gothic is in fact the *steeper* surface (max β 85.23° vs 76.10°; 8.24% vs 0.92% of area above 75°).

**RETIRED:**
- **"The catalogue splits" / "near-vertical walls are a representation problem"** (§0f.5) — no.
- **"Q5 in its strong form"** — the (θ,z) chart is *not* a decisive obstruction to the remedy.
- **"Splitting provably closed on Voronoi, required child aspect 3,009"** (§0e.2, §5.1) — ***measured
  on the SHAPE-OFF artefact. Re-derive before re-quoting.***
- **"The lift folds 7.415% of children"** (§5.3) — ***same artefact, same caveat.***
- **Not a wiring job.** Voronoi's radius is **C1** — the C0 scan is flat to 5 s.f. over three decades
  with gap → 0 linearly, against a CelticKnot positive control reading a 0.60005 mm cliff at
  ×9.998/decade. No cliff, so the double-valued/curtain machinery does not apply. (Gothic has a genuine
  C0 kink and closes anyway.)
- **W4-A refuted:** a nearest-point lift buys 1.126–1.838× against a 5× kill, creates new folds, leaves
  child chord unchanged to 4 s.f., and costs **5.69× the rA evals**.

***THE LESSON, AND IT IS EXPENSIVE: two of this document's "proven obstructions" were measured on a
mesh built with the shape guard OFF, and I promoted both to properties of the surface.*** `060f3cd9`
had already recorded `voronoi_ring_D--.stl` as the worse of the two artefacts, and it was used anyway.
***Check the provenance of the artefact before promoting a measurement to a law.***

### 0g.4 CAVEATS THAT TRAVEL WITH THESE NUMBERS

- **Every triangle count here is a LOWER BOUND.** `frontierRefine` ignores conformity for all operators
  equally — no T-junction propagation. The real conforming mesher costs more, so **4.54 M absolute
  (9.22× × 492,068) is a floor, not a budget figure**; a conforming LEPP typically propagates 1.5–3×.
  ***The RATIO is the claim; the absolute is an estimate from 400 golden-stride parents.***
- **The chord bar SATURATES on the coarser SHAPE-on mesh** (95.6% of area over bar) because
  `chord = 2 sin(θ/2)·diam` is size-sensitive and that mesh has 39% fewer, larger facets. Its chord
  column is uninformative as a *level-0* statistic; its angle column is the one to read.
- **Not measured:** multi-level fold cascades, the real mesher through conformity, the other 17 styles,
  position (`certifyTriangle` never run in this arm), σ bands.

### 0g.5 WHAT SURVIVES — AND IT IS THE WHOLE FRONTIER

**The ANGLE bar is open on both styles: 15.67% / 20.67% uncleared at 1°, at 233×/351× triangles.**
S93's structural finding (§0f) is untouched — the chord bar is ~43% satisfiable by coplanar
bookkeeping, the angular view collapses the defect onto the ribs, and the per-footprint cone ceiling
still says 88–94% of over-bar area is irreducible for its own footprint. ***That is the remaining work,
and it is now known to be ONE problem across the catalogue rather than a style-split.***

Two disclosures worth keeping: the agent **introduced and caught its own instrument defect** (a wrong
component in a parent normal gave an impossible 15.5% fold rate at β<5° — every verdict line read
plausibly and only the printed value exposed it), and its **first 3-D render disagreed with the metric
and the metric was right** — a sliver class has count, not area, so an area heatmap cannot show it.

Scorecard: `S95_WALL_FINDINGS.md`. Renders: `s95/render/S95_scatter_SHAPE{off,on}.png` — same criterion,
same cell-wall pattern, n = 73,002 (18.10%) against n = 4,791 (0.974%).

## 0h. *** S98 — SHAPE IS A ~10× COST LEVER AND NOT A FIDELITY LEVER. THE DEFECT LIVES ON WELL-SHAPED FACETS, AND THAT CONFIRMS THE CONE. ***

### 0h.1 THE INSTRUMENT, AND ITS FIDELITY CHECK

`research/tools/s98QRefine.ts` is a **verbatim copy** of S93's `frontierRefine.ts` plus **one**
addition: the LEPP arm's per-parent result binned by that parent's own shape index

    q = h_min / √area = 2·√area / longest_edge          (equilateral q = 1.316; sliver q → 0)

A copy and not an edit, because `frontierRefine.ts` was in use by a concurrent agent and a shared
bundle path had already caused one cross-agent collision in this campaign. **The fidelity check was
RUN, not assumed:** on Voronoi/S94CTL/N=400/maxLev 6/uniLev 2 every aggregate line reproduces the S95
`VORSHP` report to the digit — ORIENTATION 8452 = 21.13×/0.000%, POSITION 424 = 1.06×, lepp 3687 =
9.22×/0.00% with leaf minAngle mean 30.3… worst 0.11, turn 26108 = 65.27×/21.96%, and all four angle
bars. The copy has not drifted.

**WHY IT EXISTS:** S95 measured shape-vs-wall-angle **ACROSS two meshes**. This measures it **WITHIN
one mesh**, where nothing else can differ.

### 0h.2 THE RESULT — AND MY PRE-REGISTERED KILL FIRES

**Voronoi (shape-gated), chord bar:** uncleared is **0.000% in every q bin** — but leaves/parent runs
**28.80× at q ∈ [0.2,0.3] down to 2.89× at q ∈ [1.2,1.4]**. ***A ~10× triangle-cost multiplier from
parent shape alone, same mesh, same bar, same operator.*** That is the largest single cost lever
measured in this campaign, and it is a mesher configuration choice.

**Gothic, 1° angle bar — and this is the decisive row:**

| q bin | parents | mesh AREA % | 1° uncleared % |
|---|---|---|---|
| 0.20–0.30 | 5 | 0.160 | 12.897 |
| 0.30–0.40 | 14 | 0.995 | 5.212 |
| 0.40–0.60 | 55 | 4.702 | 2.423 |
| 0.60–0.80 | 109 | 13.254 | 0.037 |
| **0.80–1.00** | **139** | **57.465** | ***20.585*** |
| 1.00–1.20 | 62 | 7.296 | 0.000 |
| 1.20–1.40 | 16 | 16.127 | 0.000 |

***THE LARGEST UNCLEARED POPULATION SITS AT GOOD SHAPE*** — 139 parents holding **57.5% of mesh area**
at q ≈ 0.9, carrying **20.6% uncleared**, while the sliver bins carry **0.000%**. **⇒ On the angle bar
my pre-registered kill fires: parent shape does NOT decide angle-bar clearability.**

### 0h.2b *** BUT ON THE MESH WHERE THE SLIVERS ACTUALLY EXIST, THE THRESHOLD IS SHARP AND THE KILL DOES NOT FIRE ***

VORSHP and Gothic have almost no `q < 0.4` facets — the guard removed them — so neither could test the
threshold. The SHAPE-**off** Voronoi mesh can. Chord bar, and it is **perfectly monotone with the top
bin at 0.000%**, so the hypothesis passes cleanly here:

| q bin | parents | mesh AREA % | leaves/par | uncleared % |
|---|---|---|---|---|
| 0.00–0.10 | 33 | 0.123 | **1427.12** | 18.868 |
| 0.10–0.20 | 26 | 0.471 | 1050.58 | 13.520 |
| 0.20–0.30 | 23 | 0.689 | 396.43 | 11.900 |
| 0.30–0.40 | 33 | 1.841 | 115.94 | 4.051 |
| **0.40–0.60** | 68 | 7.628 | **8.06** | **0.000** |
| 0.60–1.40 (all) | 217 | 89.2 | 1.41–6.83 | **0.000** |

    q <  0.4 :  115 parents,  759.60x leaves/parent,  15.820% uncleared
    q >= 0.4 :  285 parents,    5.01x leaves/parent,   0.000% uncleared

***3.1% OF MESH AREA GENERATES 100% OF THE CHORD-BAR FAILURE AND COSTS 152x THE PER-PARENT PRICE.***

**⇒ THE RECONCILIATION, and both halves are real:** a sliver population is a **SUFFICIENT** cause of
refinement failure, with a sharp threshold at **q = 0.4**; it is **NOT** the mechanism behind the
residual defect on well-shaped meshes, which sits at good shape and on the angle bar. The earlier
"kill fires" line was measured on meshes that had no slivers left to fail.

### 0h.2c *** THE PRODUCTION NUMBER: `PF_CB_SHAPE_AR` SHOULD BE 12, NOT 50 ***

The driver gates on `_shapeGuard.aspect3 = L·P/(4A)`, not on q. The relation is **exact algebra, not a
fit**: `q = 2√A/L` ⇒ `A = q²L²/4` ⇒ **`aspect3 = (P/L)/q²`**, with `P/L ∈ [2,3]` for every triangle.
Checked on all 806,765 real facets — the measured p05/p50/p95 land inside the analytic band at every q:

| q ≈ | n | aspect3 p05 / p50 / p95 | analytic band |
|---|---|---|---|
| 0.20 | 13,921 | 42.12 / 50.35 / 60.65 | 50.0 – 75.0 |
| 0.30 | 18,896 | 19.88 / 22.23 / 25.25 | 22.2 – 33.3 |
| **0.40** | 25,514 | 11.60 / **12.71** / 13.88 | **12.5 – 18.7** |
| 1.00 | 21,334 | 2.37 / 2.44 / 2.53 | 2.0 – 3.0 |

    PF_CB_SHAPE_AR = 50 (CURRENT DEFAULT) : 14.345% of what it admits is in the q<0.4 band, worst q = 0.200
    PF_CB_SHAPE_AR = 15                   :  3.758%                                        worst q = 0.366
    *** PF_CB_SHAPE_AR = 12               :  0.000%                                        worst q = 0.410 ***

***THE CURRENT DEFAULT OF 50 ADMITS EXACTLY THE CLASS THAT COSTS 152x AND NEVER CLEARS. 12 IS THE
LARGEST VALUE THAT EXCLUDES ALL OF IT.*** Cost side: 12 admits 71.6% of facets against 50's 84.6%.

**SCOPE CAVEAT CLOSED — verified on all three meshes.** The `AR → worst-admitted-q` column is
**identical** on Voronoi-off, Voronoi-on and Gothic (50 → 0.200, 15 → 0.366, **12 → 0.410**), because
`aspect3 = (P/L)/q²` is exact algebra — the bound is a property of the metric, not of the mesh. **12 is
universal.** What *is* style-dependent is the price, and it is mild where it should be:

| facets admitted at AR = 12 | Gothic **96.2%** | Voronoi SHAPE-on **89.2%** | Voronoi SHAPE-off 71.6% |
|---|---|---|---|

***So AR = 12 is nearly free on healthy meshes and only bites on meshes that already have a sliver
problem — exactly what a guard should do.***

### 0h.2d ⛔ ***RETRACTED WITHIN THE HOUR: "AT ITS DEFAULT THE GUARD IS A NO-OP" WAS CIRCULAR.***

I wrote that `PF_CB_SHAPE_AR = 50` admitting **100.000%** of Gothic's and shape-gated Voronoi's facets
proved the guard never fires. ***That is backwards.*** Those meshes were BUILT with the guard on at 50,
so of course every surviving facet satisfies it. **100% compliance is evidence the guard was BINDING,
not inert** — and the SHAPE-off mesh, at 84.6%, is the one that shows what happens without it.
The claim is retained here refuted rather than deleted; it went out in commit `49bef793` and this is
the correction of record.

### 0h.2e ⚠ AND THE q = 0.4 THRESHOLD IS WEAKER THAN I STATED — IT IS NOT MESH-INDEPENDENT

Checking the two Voronoi meshes against each other at the **same q**, which §0h.2b did not do:

| q ∈ [0.30, 0.40) | leaves/parent | uncleared |
|---|---|---|
| Voronoi SHAPE-off | 115.94 | **4.051%** |
| Voronoi SHAPE-on | 26.90 | **0.000%** |

***The same shape band costs 4.3× more and fails on one mesh while clearing on the other.*** So `q` is
**not** a sufficient statistic for refinability, and "q < 0.4 is catastrophic" is too strong. What
survives, and it is still substantial:

1. **Within each mesh, cost falls monotonically with q** — solid on both, and steeply (28.80× → 2.89×
   on VORSHP; 1427× → 1.41× on VOROFF).
2. **On the SHAPE-off mesh, uncleared falls monotonically to 0.000% at q ≥ 0.4** — that specific mesh's
   entire chord-bar failure lives below it.
3. **The `AR → q` mapping is exact algebra and universal** (§0h.2c). That part is untouched.

**⇒ `PF_CB_SHAPE_AR = 12` still stands as a recommendation, but on the COST argument only** — it is
nearly free on healthy meshes (96.2% / 89.2% of facets admitted) and removes the population that costs
1427× per parent on an unhealthy one. ***It should NOT be sold as "excluding a catastrophic band",
because that band clears fine on the shape-gated mesh.***

### 0h.3 WHAT THIS SETTLES

- **My "the driver optimises seed fidelity while destroying refinability" reframing is HALF REFUTED.**
  The surviving half is real and large: shape is a ~10× **COST** lever (and S95's 221.95× → 9.22× is
  the same effect at population scale). The refuted half: it is **not** the mechanism behind the open
  1° frontier, so shape-gating is **not** a competitor to the sizing field.
- ***IT IS A DIRECT, INDEPENDENT CONFIRMATION OF THE §0f.1 CONE FINDING.*** S93 said the over-bar
  population is *well-shaped, large, and turning* — not slivers, not hubs, not creases. S98 reaches
  the same conclusion from the opposite direction, by binning on shape and finding the defect
  **concentrated on the well-shaped majority of the surface**. Two instruments, two directions, one
  answer. ***The cone-driven sizing field is aimed at the right population.***

### 0h.4 ⚠ AND IT CAUGHT A CONFOUND OF MINE — SEE §0g.2

Running Gothic at the Voronoi arms' settings is what exposed that §0g.2's original "Voronoi is the
easier style" compared a `maxLev 9` Gothic run against a `maxLev 6` Voronoi run. Withdrawn and
re-stated there at matched settings. ***Before quoting any two `frontierRefine` numbers against each
other, DIFF THEIR HEADER LINES (`uniformLevels`, `adaptiveMax`, `N`, STL).*** This is the second
settings-confound of the campaign after the AR-cap A/B; it is a recurring failure mode, not a one-off.

**Caveat unchanged:** `frontierRefine` ignores conformity for every operator equally, so all counts
are **lower bounds** and only ratios are claimed.

---

---

---

## 1. THE RULERS — what to use, what to never use again

| quantity | instrument | status |
|---|---|---|
| **POSITION (H1, mesh→surface)** | `certifyTriangle` (`_facetTruthLib.ts`) at `tol = 0.010` | ***THE bar. Two-sided: `witnessed` = achieved, `bound` = rigorous.*** |
| position, cheap | `sagAdaptiveRaw` / the driver headline | ***BANNED as a MAGNITUDE*** (21–1,527× under, 28–37% over) — but a **GOOD RANKER**: ρ = 0.964 vs honest position over 7 arms. Rank with it, never size with it. |
| **H2 (surface→mesh)** | `advMeshWideH1.ts` (mis-named; relabelled) | Sound, but **cannot see a facet standing off the wall.** |
| **ORIENTATION** | normal chord `2·sin(θ/2)·diam`; `orientRuler.ts` (11 fixtures, covering-certified) | Sound. `tangExc` is a **DETECTOR** (13–125× selective), **NOT a magnitude** (26× over). |
| shape | `_shapeGuard.aspect3`, `_judgeNormal.facetNormalCensus` | Use these. **Do NOT re-derive them** — `s49BackFacing.ts` did and was unsound. |

**THREE RULES THAT COST US MONTHS:**

1. **NEVER report a bare MAX, and never report COUNT alone.** Facet count over-states defect AREA by
   **13–184×**. Count, area and max routinely disagree in *direction* — the AR-cap sweep improves
   count 2.13×, worsens area 1.13×, and worsens max 1.92×.
2. **A one-sided assertion is satisfied by a degenerate answer.** 11 of the hard gate's 12 bars were
   one-sided; a truncation passed 12/12 while collapsing the perpendicular ruler onto the radial one.
   The gate is now 24 bars (V1–V11 + M1–M11 mutation bars) and fails that change at 22/24.
3. **Diff PRINTED VALUES against a control run. The verdict is the weakest signal in the report.**
   Every instrument defect found this session was found this way, none by a pass/fail.

---

## 2. WHERE THE MESHES ACTUALLY STAND (honest position, `certifyTriangle` @ 10 µm)

| style | driver claims | **honest PROVEN-FAIL** | orientation over-bar |
|---|---|---|---|
| GothicArches 1,142,166 tris | 75 (0.007%) | **~3,265 (0.286%)** | **700,486** — 43.2% of AREA (the widely-quoted 32,468 is **21.6× low**, centroid-only sampling) |
| Voronoi 806,765 | **PASS, 0 of 806,765** | **~84,710 (10.50%)** | 39.7% → **25.7%** corrected; count over-states AREA 26× |
| LowPolyFacet 137,480 | 0 | **0** ✔ (reverse control) | 10.9% — **not a defect**, 0 of its own 300 worst fail |

*Sampling: golden-stride N=50,000 ≈ 4.38%, identical construction on all 12 meshes, ±1σ stated in the
scorecard. Maxima are LOWER BOUNDS — the honest whole-mesh max has never been computed (11–260
core-hours/mesh).*

**Instrument controls, which is why these supersede everything:** the harness reproduces each
driver's own `over-0.01mm` **exactly on all 12 meshes**; LowPolyFacet is a **reverse control at 0
fails/10,000**; and it agrees with an independently-written second tool to the facet.

---

## 3. THE ONE LEVER THAT WORKS — *a POSITION lever; see §0e for the retired orientation claim*

**The CONSTRAINED FLIP** — `PF_LAND_FLIP`, fork `_strataConformBisectL.test.ts` + `vitest.stratal.config.ts`, DEFAULT OFF.

| GothicArches S39CTL | before | after |
|---|---|---|
| orientation over-bar **by AREA** | 8.131% | 2.179% — 3.73× ***(CENTROID key only; covering ruler says 1.050× — see §0d.0)*** |
| honest position on CHANGED facets | 83 fail | **38 — 0.458× count, 0.616× area** (~5σ favourable) |
| inversions θ>90° | 1,506 | 671 |
| topology / vertices moved / tris added | — | **identical / 0 / 0** |
| flag-OFF control STL | — | **byte-identical to S39CTL** |

It is **free** and its POSITION win is real (whole-mesh 0.685× count / 0.728× area); its ORIENTATION headline is a centroid artefact (§0d.0). Cost: caps ≥150° ×1.66. It also regularises vertex
degree (max 50 → 31). **Only proven on Gothic-class (hub-free) meshes.**

**The CAVITY** (`PF_CB_CAVITY`) is the only arm of twelve that improves honest position on **both**
count and area (0.49× / 0.62×). Its published over-bar of 4 was 401× low. I previously reported it as
"worth zero" on the blind ruler — that was wrong.

---

## 4. REFUTED — do not re-derive these

| claim | verdict | what killed it |
|---|---|---|
| AR-cap 50→90 is a 4.37× fidelity win | **2.13× by count; WORSE by area and 1.92× worse by max** | S85 honest re-baseline |
| "refinement manufactures orientation error at ≈ s/h" | **REFUTED** | a null control: 1.95 over-bar children/parent vs a **1.99 NULL**; and `s/diam` is *anti*-correlated (ρ = −0.438) |
| collapse / re-point / retriangulate fixes MIS-ORIENTED | **ceiling 0.38%** | exact enumeration + a real sequential pass |
| a bigger connectivity search helps | **+3.29%** | exact min-max hexagon-cavity DP |
| density helps orientation | no better than the null | measured against the empty-split control |
| Euclidean `maxAngle` as an objective | **anti-correlated** — crushing it 20.5× made orientation 5.5× worse | two-armed flip test |
| `PF_FT_DESCENT_K=8` (2.53× speedup) | **REFUTED** | clears V3/V7c exactly, silently collapses `distPerp` onto `distRadial` |
| S82's **P4** guarded lift | **cannot be landed** | its fallback needs an **off-surface vertex**; see §5 |
| LowPolyFacet's 10.9% orientation | **not a defect** | 0 of its own 300 worst exceed the honest bar |
| `s49BackFacing.ts` | **unsound, retired** | re-derives `facetNormalCensus` without its July corrections |

---

## 5. THE OBSTRUCTIONS — ~~proven, not suspected~~ ⛔ **PROVENANCE-VOID, RE-DERIVE BEFORE QUOTING**

> ⛔ ***ALL THREE ITEMS BELOW WERE MEASURED ON `voronoi_ring_D--.stl` — 806,765 triangles, SHAPE
> GUARD OFF*** — the artefact `060f3cd9` had already flagged as the worse of the two, and the one
> S95 showed carries a `q<0.2` sliver population (9,309 edges) that the shape-gated mesh does not
> have at all. With the gate on, the same style on the same surface **refines clean at 9.22× with
> 0.00% uncleared**. Item 1 ("closed to splitting") and item 3 ("the lift folds") are ***measured
> consequences of that sliver population, not of the surface***. Item 2's super-hub census has the
> same provenance and its degree-2,550 figure is from the same 806,765-triangle mesh; it has **not**
> been re-run with the gate on, so treat it as unverified rather than refuted.
> ***Re-derive on `voronoi_ring_D--H_S94CTL.stl` before quoting any of this. See §0g.***

1. ***VORONOI IS CLOSED TO SPLITTING.*** The child altitude needed to cancel the parent's orientation
   error implies a **required child aspect of 3,009** (p90 8.0e11). The triangle that would fix it is
   a needle whose own normal is unbounded.
2. ***EVERY 1-RING OPERATOR IS DEFEATED BY THE SUPER-HUBS.*** 32 Voronoi vertices of degree ≥1000 hold
   5.62% of the whole mesh; worst **2,550** against a **median of 5**. A flip, a collapse, a vertex
   removal and the cavity DP are all 1-ring ops, and the 1-ring of a 2,550-degree vertex is a
   2,550-gon. `fold` fires on 494,895 of 745,470 collapse candidates.
   **It is a REFINEMENT RUNAWAY:** the same junction vertex is degree **37 / 57 / 2,550** at 285,826 /
   671,823 / 806,765 triangles of the same mesher, style, params and flags.
3. ***THE LIFT FOLDS THE MESH AND NO ON-EDGE PLACEMENT CAN FIX IT.*** `liftAt`'s displacement is mostly
   IN-PLANE (dPar/dPerp p50 7.01). **7.415% of children are inverted** (child/parent area 1.01954 — a
   planar 1→2 split conserves area exactly, so that ratio *proves* non-tiling). `MID3D`/`placeAt`
   already corrects the along-edge component, so the residual is **perpendicular to the edge, toward
   the apex** — unreachable by any choice of split point on that edge.
4. ***THE FOLD GUARD HAS ALWAYS BEEN IN THE WRONG SPACE.*** `shapeAdmits` tests `signedAreaParam` on
   (θ,z). Every arm reports `0 on (θ,z) FOLD`; a 3-D test on the same mesh refuses **117,288** splits.

---

## 6. PERFORMANCE — landed and available

| | win | status |
|---|---|---|
| `rA` hoisted twin (`_raFast.ts`) | **2.81–3.17×**, bit-identical, self-verifying + in-flight sampling | **LANDED**. rA was 84% of certificate wall-clock. |
| `distPerp` seed-grid memoisation | **25.4×**, bit-identical seeds | **LANDED** |
| Phase-D certificate vs CPU | **3,230 s vs 8,449 s** for the same bound | available, unused |
| `PF_FT_WORKERS=16` | 1.51× over the default 8, byte-identical | available, unused |

The certificate spends **61× the mesher's evaluation budget** — measurement, not meshing, is where
this project's compute goes.

---

## 7. HOW TO PROCEED — RE-BASELINED 2026-08-06 AFTER S95 + S98

### 7.0 *** READ THIS FIRST: THE 10 µm POSITION BAR IS NOT WHAT IS STOPPING US ***

Ideal refinement closes the **10 µm position bar at 1.04×–1.06× triangles with 0.000% uncleared** on
both styles measured. It is, geometrically, nearly free. **The campaign has never been blocked by
position.** Every stuck arm, every 100-minute run that failed to converge, and every visible artefact
has been an **ORIENTATION** problem wearing a position bar's clothes.

***AND THAT EXPLAINS THE ARTEFACTS THE USER KEEPS SEEING IN THE SAME PLACES.*** A 10 µm position error
is invisible — it is 1/5 of a layer line. What the eye picks up in a slicer preview is **shading**,
and shading is the **normal**. So a mesh can be fully closed at 10 µm position and still show exactly
the banding and facet-edge artefacts reported, because the normal is off by degrees where the position
is off by microns. ***The right target for making those artefacts disappear is the ANGLE bar, not a
tighter position bar.*** This reconciles "the numbers say closed" with "I can still see it" — both
were true, and the ruler was answering a different question than the eye.

### 7.1 THE FRONTIER, STATED IN ONE TABLE

Matched settings (`uniLev 2 / maxLev 6`, N=400 golden-stride, LEPP, conformity ignored ⇒ **lower
bounds**):

| | Gothic S39CTL | Voronoi SHAPE-on |
|---|---|---|
| **position 10 µm** | **1.04×, 0.000% uncleared** | **1.06×, 0.000% uncleared** |
| chord 10 µm | 4.69×, 10.39% | 9.22×, 0.00% |
| **1° angle** | **94.44×, 4.394%** | **232.69×, 15.674%** |

**The whole remaining problem is the last row.**

### 7.2 DO THIS

1. ***DRIVE THE SIZING FIELD FROM THE PER-FOOTPRINT NORMAL CONE.*** This is the one live arm and two
   independent instruments now agree it is aimed at the right population: §0f.1 (cone census — the
   over-bar facets are well-shaped, large, turning) and §0h.2 (shape binning — on Gothic the largest
   uncleared population is at **good** shape, q ≈ 0.9, holding 57.5% of mesh area). Kill: >12× the
   flag-OFF triangles, or over-1° AREA not below 5%.
2. ***SET `PF_CB_SHAPE_AR = 12` (from 50) — ON THE COST ARGUMENT ONLY.*** Derived from
   `aspect3 = (P/L)/q²` and calibrated on 806,765 real facets (§0h.2c); the cap value is universal.
   It is **nearly free on healthy meshes** (96.2% of Gothic's facets, 89.2% of shape-gated Voronoi's
   still admitted) and removes the population that costs **1427× per parent** on an unhealthy one.
   ⚠ **Do NOT justify it as "excluding a catastrophic band"** — §0h.2e retracts that; the same q band
   clears fine on the shape-gated mesh. **It is a COST lever, not a fidelity lever.**
3. **Make `certifyTriangle` the reporting ruler for every arm.** A driver "PASS" is not evidence.
4. **Land the flip on the remaining styles** — free, improves both rulers, only proven on Gothic.

### 7.3 THE DRIVER-VS-GEOMETRY GAP IS NOW THE SHARPEST OPEN QUESTION

Ideal refinement closes position at **1.04×**. The production driver spends **~100×** and does not
converge. ***So essentially the entire position gap is DRIVER, not geometry*** — consistent with the
independently-derived "~100× allocation gap" and with the ranking-function diagnosis. The driver has
five things the simulator does not: conformity propagation, the fold guard, the AR guard, a budget,
and a ranking function. **Which of those five eats the 100× has never been measured, and it is the
cheapest high-value experiment left.**

### 7.4 WITHDRAWN FROM THE PREVIOUS VERSION OF THIS SECTION

- ⛔ **"Do not tune `PF_CB_SHAPE_AR` — measured dead."** ***REFUTED.*** It was measured dead on the
  *seed's own fidelity*, which is the wrong metric; on **cost** it is the largest lever in the campaign.
- ⚠ **"The vertex representation is the binding constraint"** — has lost **two of its three supports**.
  The in-plane fold and "no triangle the driver can express" were both measured on the SHAPE-off
  artefact (§5, provenance-void). Only the P4 result still stands. **Do not spend a night on an
  off-surface-vertex design until the §5 obstructions are re-derived on a shape-gated mesh.**
- ⚠ **"Fix the super-hub runaway (degree 2,550)"** — same provenance. Unverified, not refuted.
  Re-census on `voronoi_ring_D--H_S94CTL.stl` before treating it as a prerequisite for anything.

### 7.5 DO NOT

- Do not accept a lever on a headline movement. The cavity was accepted on a 1.96× worth zero; the AR
  cap on a 4.37× that was 2.13×.
- **Do not quote two `frontierRefine` numbers against each other without diffing their header lines**
  (`uniformLevels`, `adaptiveMax`, `N`, STL). Two campaign conclusions have already died to this.
- Do not promote a measurement taken on one artefact to a property of the surface without checking how
  that artefact was built. ***That single mistake cost §0f.5 and all of §5.***

---

## 8. LEDGER

**Scorecards** (`research/exchange/_strataConformBisect/`, gitignored): `S85_POSITION_REBASELINE.md`
(authoritative position), `S80_LAND_FINDINGS.md` (the flip), `S81_COLLAPSE_FINDINGS.md` (hubs +
ceiling), `S82_SPLIT_FINDINGS.md` (fold + obstruction), `S62_AUDIT_FINDINGS.md` (instrument audit),
`S50_RULER_FINDINGS.md` (eval budget + blindness). Registry: `research/EXPERIMENT-REGISTRY.md`.

**Gate:** `PF_STRATA_FTV=1 npx vitest run research/bridge/_strataFacetTruthValidate.test.ts
--testTimeout=1800000 --hookTimeout=600000` — 24 bars. **The timeout flags are not optional.**

**Runners:** copy `research/tools/_run-template.sh`; do not `sed` an existing runner (its bundle path
is hardcoded and two agents collided on one, with one executing the other's binary).
