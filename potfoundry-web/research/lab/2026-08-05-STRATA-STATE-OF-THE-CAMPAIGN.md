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

***AND AS OF 2026-08-06 THE HEADLINE HAS CHANGED AGAIN, IN OUR FAVOUR — now with error bars (§0j),
the first this campaign has ever had.*** The 10 µm POSITION bar is
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
**exact cavity DP +3.29%**, **collapse/re-point ceiling 0.38%**, **density ~~×0.9968~~ — MIS-QUOTED, an ANGLE against a CHORD bar; it is 0.208×/level, see §0f.2**, **ideal split placement 0.00%**, ~~**splitting provably closed on Voronoi** (required child aspect 3,009)~~ **— ⛔ REFUTED: LEPP clears the chord bar at 8.697× ±4.4%, see §5.1**, and
**P4/off-surface refuted as a fidelity lever on its own numbers** (+0.6% orientation for a 12.5×
position-sag regression).

Two agents disagree on where to go next and **both readings are compatible**: S91 concludes the class
needs an **off-surface vertex** because connectivity is exhausted; S89 measured that the *specific*
P4 formulation does not pay. ***So: connectivity is exhausted AND the one representation change
anyone has priced does not work.*** ~~That is the honest frontier, and it is a research question, not
an engineering one.~~

> ⛔ ***THAT CLOSING VERDICT IS SUPERSEDED BY §0i.4.*** "Connectivity is exhausted" survives — but the
> conclusion drawn from it does not. The missing move was never a new *connectivity* operator or an
> off-surface vertex: it is **GENERATION** — placing an element at the admissible size instead of
> halving one that exists (a measured **1.93×**). ***That is an ENGINEERING path, not a research
> question: the `M = g/h²` kernel exists, is certified, and is unwired*** — it simply does not
> deliver as shipped, and its two failure modes are named and already wired for testing (§7.2).
> **Start at §7, not here.**

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
> 0.00% uncleared**. The catalogue does **not** split.
> ***AND GOTHIC'S OWN NUMBERS BELOW DO NOT STAND EITHER — §0i.1 retires the 6.67× as an N=150
> single-facet lottery inside a 25× spread.*** **Nothing in this subsection is quotable. Read §0g and
> §0i.1.**

- ⛔ ~~**Gothic: LEPP closes the 10 µm chord bar at 6.67× triangles, 0.00% uncleared.**~~ ***RETIRED —
  N=150, and at N=2000 the same measurement reads 10.76× / 27.41% uncleared. See §0i.1.*** (The position bar
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

> # ✅ BANNER RESOLVED 2026-08-06 — RE-RUN AT N=2000. VORONOI HOLDS; GOTHIC'S *UNCLEARED* DID NOT.
>
> §0g/§0h were published at **N=400**, and S94/CONE then showed `frontierRefine`'s LEPP column is
> tail-dominated (the worst **1% of parents hold 74.92% of all leaves**; its 6.67× Gothic anchor moved
> to 10.76× at N=2000 on **one parent** entering the sample). I re-ran both styles at **N=2000**.
> ***The counts are stable everywhere; the UNCLEARED shares are what moved, and only on Gothic:***
>
> | 10 µm chord, LEPP | N=400 | **N=2000** |
> |---|---|---|
> | **Voronoi SHAPE-on** | 9.22× / **0.00%** | **8.47× / 0.00%** |
> | Gothic S39CTL | 4.69× / 10.39% | **5.33× / 17.42%** |
>
> | 1° angle | N=400 | **N=2000** |
> |---|---|---|
> | Voronoi SHAPE-on | 232.69× / 15.674% | **221.73× / 14.832%** |
> | Gothic S39CTL | 94.44× / **4.394%** | **88.99× / 11.350%** |
>
> **⇒ VORONOI'S CLOSURE IS REAL — BUT NOT AT LITERALLY ZERO.** The COUNT is solid and triply
> reproduced: 9.22× (N=400, mine), **8.650× (N=800, CONE, independent tool + fixed ruler)**, 8.47×
> (N=2000), banded at **8.697× ±4.4%** (§0j.3). ***⛔ BUT THE "0.00% UNCLEARED" IS OVERSTATED AND I
> PUBLISHED IT THREE TIMES: the pooled value is 0.0528%, band [0, 0.733], with ONE parent supplying
> 84.35% of it.*** Restate as **~0.05%**. The substantive claim stands — **0.05% against Gothic's
> 19.78% is a ~375× gap** — but see §0j.1: **70% of small-N blocks read exactly 0.000% on a mesh that
> is 26.121% uncleared**, so a zero is the *expected* reading, not evidence.
> **⇒ POSITION SURVIVES TOO, and gets cheaper:** Gothic **1.02×**, Voronoi **1.03×**, both 0.000%.
> **⇒ GOTHIC'S UNCLEARED SHARES WERE UNDERSTATED AT N=400** — chord 10.39% → 17.42%, and 1° **4.394% →
> 11.350%, a 2.6× move**. ***Any Gothic uncleared figure quoted from §0g/§0h at N=400 is low.*** The
> counts moved <13%, so cost conclusions stand and *clearance* conclusions do not.
> **⇒ AND GOTHIC STILL DOES NOT CLEAR AT THIS CAP** (17.42% uncleared), so by §0i.2's rule it still
> cannot be ratioed against Voronoi's 0.00%. That comparison stays retired.
>
> ⚖ **The WALL/CONE disagreement is NOT resolved by this re-run and stands open:** WALL concludes the
> near-vertical wall causes nothing (facet shape does); CONE finds all twelve of its worst Gothic
> parents are near-vertical-wall facets, nine back-facing — and its **third and fourth are WELL-SHAPED**
> (minAngle 34.84°, 34.83°) at slope 6.2/5.9. Steep, well-shaped and failing is the one combination
> shape alone does not explain. **Do not treat §0g as settled on that point.**

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
| triangles | 221.95× | **9.22×** (banded **8.697× ±4.4%**, §0j.3) |
| uncleared | 15.57% | ~~0.00%~~ **~0.05%**, band [0, 0.73] — §0j.2 |
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

> ### ⛔ AND THIS TABLE IS RETIRED A SECOND TIME — SEE §0i.2
> Matching `uniLev/maxLev` was **necessary and not sufficient.** ***Gothic at 10.39% uncleared and
> Voronoi at 0.00% are not on the same quality line***, so no count ratio between those two columns
> means anything. And there is no single cap that repairs it: **the cap that frees Voronoi (12) still
> binds on Gothic.** ***That is itself the finding — Gothic needs more refinement depth than Voronoi,
> and the two styles cannot be placed on one row at any one cap.***
> **The rule is: only compare counts between operators that BOTH reach 0.000% uncleared.**

**What survives from the table:** on the CHORD bar Voronoi genuinely clears at maxLev 6 where Gothic
does not (independently reproduced by CONE at N=800: Voronoi **8.650× / 0.000%**, Gothic **5.289× /
10.329%**). The 1° row is **not** a valid comparison and no style ranking should be read from it. ***The core §0g finding is untouched — the catalogue does
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
- **"Splitting provably closed on Voronoi, required child aspect 3,009"** (§0e.2, §5.1) — ***now
  fully REFUTED, not merely suspect: LEPP clears the chord bar at 8.697× ±4.4%.***
- **"The lift folds 7.415% of children"** (§5.3) — ***now fully REFUTED: 0.2050% with the gate on.***
- **"Every 1-ring operator is defeated by the super-hubs"** (§5.2) — ***REFUTED by re-census: max
  facet-degree 40 on the shape-gated mesh and ZERO vertices ≥ 100 — lower than Gothic's 50.***
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

**The ANGLE bar is open on both styles.** ⚠ *The figures first written here (15.67%/20.67% at
233×/351×) were N=400 and mismatched-cap; the current banded values are* ***Gothic 88.36× ±13.6% and
Voronoi 227.95× ±6.7%, at ~14–15% uncleared each*** *(§0j.3), and full clearance is priced at ~155×
(§0i.3).*
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

## 0h. *** S98 — SHAPE IS A ~10× COST LEVER AND NOT A FIDELITY LEVER. THE DEFECT LIVES ON WELL-SHAPED FACETS. ***

> **⚠ TITLE CLARIFICATION:** this confirms the cone **POPULATION DIAGNOSIS** of §0f.1 — the over-bar
> facets are well-shaped, large and turning. It does **NOT** endorse the cone-driven **OPERATOR**, which
> §0i.3 refutes cross-style. *Right diagnosis, wrong remedy.*

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

## 0i. *** S94/CONE — THE CONE FIELD IS REFUTED, THE 1° BAR IS NOT A 12× OBJECT, AND NO LEPP MULTIPLIER IN THIS CAMPAIGN WAS EVER QUOTABLE ***

### 0i.1 THE ANCHOR WAS A SINGLE-FACET LOTTERY, AND THE SPREAD IS 25×

`frontierRefine`'s LEPP column was only ever run at **N=150**. Every one of these is GothicArches
S39CTL, the 10 µm chord bar, plain LEPP:

    4.69x   (N=400,  cap 12, unscoped)  10.39% uncleared   <- my "matched settings" baseline
    5.29x   (N=800,  cap 12, unscoped)  10.33% uncleared
    5.50x   (N=600,  cap 16, unscoped)   0.12% uncleared
    6.67x   (N=150,  cap 16, unscoped)   0.00% uncleared   <- *** THE PUBLISHED ANCHOR ***
    3.12x   (N=2000, cap 16, SCOPED)     0.00% uncleared
   10.76x   (N=2000, cap 16, unscoped)  27.41% uncleared
  116.89x   (N=2000, cap 24, unscoped)  32.24% uncleared

***A 25× SPREAD ON ONE MESH, ONE BAR, ONE OPERATOR.*** The move from 5.50× to 12.71× is **one parent**
entering the sample between N=600 and N=1200 — level-0 minAngle **2.78°**, slope 7.735 — which alone
consumes **7,139 leaves and never clears**. The worst **1% of parents hold 74.92% of all LEPP leaves**.
***More depth makes LEPP WORSE on both axes (cap 16 → 24: 10.8× → 116.9×, uncleared 28.8% → 32.2%): it
does not converge on the unscoped mesh.*** ~~`red` 1→4 never blows up on that parent — 0.000%
uncleared at every N and every cap.~~ ⛔ ***THAT LAST CLAUSE IS REFUTED — SEE §0j.7.*** **No LEPP multiplier here is quotable without its N, its cap, its scope AND
its uncleared %. The published 6.67× carries none of the four.**

### 0i.2 ⇒ THE RULE, AND IT IS STRICTER THAN THE ONE I WROTE IN §0g.2

I said "diff the header lines." **That is not enough.** At a binding cap the operators are not on the
same quality line at all — Gothic N=800 cap 6: LEPP **5.289× at 10.329% uncleared** against `cone`
**9.014× at 0.998%**. One table would license either "a 1.70× loss" or "a 64× win."

> ### ***ONLY COMPARE TRIANGLE COUNTS BETWEEN OPERATORS THAT BOTH REACH 0.000% UNCLEARED. MATCH THE RESIDUAL, NOT THE CAP.***
>
> ⚠ **AMENDED BY §0j.5 — "0.000% uncleared" IS NOT AN ACHIEVABLE MEASUREMENT** (required N is 22,900
> to ~8.5 million). ***Restate as: compare only operators whose uncleared-% UPPER 95% PHASE-BAND is
> below a stated tolerance.*** A bare 0.000% at campaign sample sizes is the expected reading on a
> mesh that has not closed.

**⚠ This retires §0g.2's table a second time.** Matching `uniLev/maxLev` was necessary and not
sufficient: **Gothic at 10.39% uncleared and Voronoi at 0.00% are not on one quality line.** And there
is no single cap that fixes it — ***the cap that frees Voronoi (12) still binds on Gothic.*** That is
itself the finding: **Gothic needs more refinement depth than Voronoi**, so the two styles cannot be
put on one row at any one cap. See §0g.2 as amended.

### 0i.3 THE HYPOTHESES

- **H1 (cone-driven sizing field beats LEPP): REFUTED, cross-style, and refuted the other way.**
  Gothic scoped, cap-free: LEPP **3.120×** vs cone **4.211×** (1.35×). Voronoi shape-gated, cap-free:
  LEPP **8.650×** vs cone **16.076×** (**1.86×**). ***§0j.4 BANDS BOTH AND THE REFUTATION IS STRONGER
  THAN PUBLISHED: paired, Gothic 1.646× [1.512, 1.780] and Voronoi 2.358× [2.093, 2.622], with cone
  worse in 500 of 500 disjoint blocks.*** Both sides of both comparisons clear at 0.000%, so
  the ratios are iso-quality by §0i.2's own rule. **Mechanism, isolated not guessed:** `coneOracle`
  (measured chord, same k-way split) is *still* 1.276× worse ⇒ the loss is in **the split, not the
  driver**. A k-way split imposes the parent's worst-case *k* on all *k²* children at once, while
  bisection re-tests after every doubling. ***Bisection's factor-2 granularity is already the finest a
  subdivision operator can have — there is no granularity headroom for any field to win back inside a
  refinement framework.***
- **H2 (over-1° AREA below 5% at ≤12×): REFUTED by 9–13×.** The fractional-knapsack optimum of *any*
  isotropic field needs **18.33×**; the measured threshold-driven frontier does not cross 5% below
  **~106×** and full clearance costs **~155×** (0.013% residual). ***THE 1° BAR IS REACHABLE — IT IS
  SIMPLY NOT A 12× OBJECT.*** Anisotropy at AR≤5 divides the full-clearance angle cost by 3.8× and is
  still far over. For scale from the same instrument: **at the industry-practical 5° bar Gothic is only
  6.43% over by area to begin with, and the chord bar is met at ~3×.**
- **H3 (anisotropy ≥1.5×): CONFIRMED at 1.89× (AR≤5, chord bar) — but as a REMESH lever only.** The
  existing facets' long axes are misaligned with the slow direction by area-wt p50 **28.43°**, so a
  subdivision operator captures only the part its parents happen to be aligned with.
- **H4 (`M = g/h²` remesh beats the best refinement operator): KILL LINE HIT AS SHIPPED.** At the
  theoretically-correct tol it spends **2.931×** and is still **14.795% over bar**, while scoped LEPP
  clears at 3.120×. ***But its SHAPE column is a large win — leaf minAngle 47.3° mean / 3.98° worst
  against LEPP's 37.6°/1.25° (and 0.00° unscoped)*** — the memoised "closes the sliver-quality
  frontier" property reproduced on a task it was not built for. Two separable, unasserted explanations
  for the residual (`splitThresh 1.5` ⇒ chord up to 2.25× the design tol; 160×160 grid aliasing of
  sub-cell relief, which the kernel's own docs record at 5–10×) are wired and testable.

**⚠ AND VORONOI IS 2.5× HARDER STILL ON THE ANGLE BAR (~250–400×), SO GOTHIC IS THE *FAVOURABLE* STYLE
THERE.** Combined with §0g (Voronoi clears the *chord* bar where Gothic does not), the ranking of the
two styles **inverts with the bar**. ***There is no "hardest style" — only a hardest bar.***

### 0i.4 THE STRUCTURAL FINDING — REFINEMENT IS THE WRONG FRAME, AND THREE RESULTS SAY SO

Free placement would certify **the same geometry** at **1.615 leaves/parent instead of LEPP's 3.120 —
a 1.93× prize** (measured per-leaf; corroborated to 4% by an independent per-parent analytic on the
60,000-facet census). ***It is not a tuning loss. It is the structural cost of HALVING WHAT EXISTS
instead of GENERATING AN ELEMENT AT THE ADMISSIBLE SIZE.*** H1's mechanism, H3's misalignment and this
1.93× are the same fact three times: **sizing and anisotropy are GENERATION levers, not REFINEMENT
levers.** ***That is a direct argument for the unwired `M = g/h²` kernel as the vehicle — and H4 says
it does not deliver as shipped, so the next arm is its two knobs, not a new mechanism.***

### 0i.5 THE RULER FIX, AND A SECOND ARGUMENT FOR THE ASPECT GATE

`5698d023` ported into CONE's inline ruler: ***every verdict is robust to it*** (red 9.721→9.720, cone
9.607→9.607, LEPP 10.822→10.755) ***while the ill-conditioned facet's own reading moves a lot*** — the
killer parent's level-0 sup angle 115.707° → **123.627°**. Exactly the shape the fix predicts.
`signMargin` on Gothic: **4.083% of triangles below 0.10, 0.125% below 0.01** — ~2× Voronoi's. And on
the shape-gated Voronoi artefact it is **0.136% / 0.013%, 16× better conditioned than SHAPE-off**:
***the aspect gate improves the INSTRUMENT's conditioning too, which is a second and independent
argument for §0h.2c beyond cost.***

### 0i.6 THE REFRAME THAT RECONCILES WALL, S98 AND CONE

CONE's §8.3, on my seed-shape question: shape-preserving operators (`red`, all three `cone` variants)
keep every child similar to its parent and read **0.000% uncleared at every N on both styles — on the
same parents where bisection diverges.**

> ***REFINABILITY IS A PROPERTY OF THE OPERATOR'S SHAPE BEHAVIOUR, NOT OF THE SEED'S FIDELITY.***

That is the synthesis of all three agents. WALL: it is shape, not wall angle. S98: cost falls
monotonically with parent shape. CONE: and the mechanism is that **LEPP degrades shape and diverges
exactly where it does**, while operators that preserve shape never diverge at all. **⇒ Three remedies,
all now priced: gate the shape (§0h.2c, cheap), change the operator (`red`: robust but 1.90× dearer on
Voronoi), or remesh (§0i.4, the real prize, undelivered as shipped).**

**DISCLOSED BY THE AGENT, UNPROMPTED:** it never varied an AR cap or re-seeded, so §8.3 is
*observational across two committed artefacts and is not a test*; the SLACK column is invalid on angle
rows and is quoted only for chord; and one remesh arm burned 1,218 s CPU without checkpointing a single
row and was killed — **zero rows, no inference drawn**, and H4 rests entirely on the plain kernel run
that completed.

### 0i.7 THE ENGINEERING GAP THE REMESH ARM EXPOSED, AND A HONEST GAP IN ALL OF IT

***The `M = g/h²` kernel's chord mode ALREADY implements the right law for the CHORD bar*** at
`tolMm = bar/8 = 0.00125` (from S93's `chord/witnessed` p50 = 8.03). ***An ANGLE bar would need a NEW
`h = θ*/κ` mode that does not exist.*** So the remesh route reaches the chord bar with tuning and the
angle bar only with new code — **budget it as such.** The `chordTolMm` direct sag guard needs a
dedicated run: it evaluates a 45-point lattice per triangle per round and burned 1,218 s with zero
rows when given a borrowed slot.

⚠ ~~**NO σ BANDS ON ANY MULTIPLIER IN THIS DOCUMENT.**~~ ***PAID 2026-08-06 BY S105 — AND THE LADDER
ABOVE IS ONE DISTRIBUTION.*** On 213 **disjoint** phase blocks with mesh/bar/operator/cap/scope all
held fixed, LEPP runs **2.320× … 74.633× at N=150 (32× spread)** and **6.125× … 21.820× at N=2000**,
pool = **11.973× at 26.121% uncleared** — and ***70% of N=150 blocks read EXACTLY 0.000% uncleared***.
The five published rows sit at percentiles **55 / 41 / 11 / 58 / 38** of that one distribution, so
**5.503 → 12.708 is an ORDINARY event**, not a threshold. ***By contrast the ruler fix (§0i.5) moves
these by <0.7%.*** **WHAT SURVIVES:** the §7.1 **position** row is ±4.3% / ±4.4% (solid), and **H1's
refutation holds in 500 of 500 blocks** — its magnitude was *understated* (Gothic **1.646×
[1.512, 1.780]**, Voronoi **2.358× [2.093, 2.622]**, paired). **WHAT MUST CHANGE:** every
`uncleared %` in this document is band-only (Voronoi `red` "16.09× / 0.00%" is really
**18.68× / 3.600%**), and §0i.2's literal "0.000%" needs a tolerance. Rule + required-N table:
`research/LAB-CHEATSHEET.md` § *Sampling*. Scorecard: `S105_BANDS.md`; registry
`E-2026-08-06-S105-BANDS`; commits `27a1039d` (pre-registration), `70a22176`.
⚠ **No render was produced for §0i** — the verdicts are triangle-count economics at equal residual,
cross-validated by two independent instruments. The agent states it did not need a fidelity image and
***did not fabricate one***.

Scorecard: `S94_CONE_FINDINGS.md`. Commits `5322cbf3`, `7b286307`, `bb09ed83`, `8836aeab`, `8649033b`.

---

## 0j. *** S105/BANDS — THE LADDER WAS ONE DISTRIBUTION ALL ALONG. AND `uncleared %` IS THE LEAST REPRODUCIBLE NUMBER IN THE PROJECT. ***

### 0j.1 THE RESULT THAT REFRAMES §0i.1

§0i.1 read the 6.67× ladder as a threshold crossed by one facet entering the sample. **It is not a
threshold. It is one distribution, and every published rung is an ordinary draw from it.** Phase-block
replication (the same N, cut into R *disjoint* consecutive blocks of the campaign's own golden stride —
each block an exact phase-translate, **no distributional assumption anywhere**):

| GothicArches S39CTL, 10 µm chord, LEPP, cap 16, unscoped | spread |
|---|---|
| **N=150, R=213 blocks** | **2.320× … 74.633× = 32.17×** |
| N=2000, R=16 blocks | 6.125× … 21.820× = 3.56× |
| **pool (32,000 parents, 16× the largest published row)** | **11.973× at 26.121% uncleared** |

***The five published rungs — 6.673 / 6.520 / 5.503 / 12.708 / 10.822 — sit at percentiles
55 / 41 / 11 / 58 / 38 of that ONE distribution.*** The 5.503 → 12.708 "jump" is a p11 draw followed by
a p58 draw. **Nothing happened.** For calibration: ***the ruler-convention fix moves these numbers by
<0.7%; the sample phase moves them by 32×.***

> ### ⚠⚠ AND THE SINGLE MOST IMPORTANT LINE THIS AGENT PRODUCED
> ***70% OF N=150 PHASE BLOCKS (150 of 213) REPORT EXACTLY 0.000% UNCLEARED ON A MESH WHOSE TRUE
> RESIDUAL IS 26.121%.***
> "0.000% uncleared" at small N is not evidence of closure. **It is the expected reading.**

### 0j.2 ⛔ THIS CORRECTS MY OWN HEADLINE — TWICE

1. ***"VORONOI CLOSES AT 0.00% UNCLEARED" IS OVERSTATED.*** The pool value for Voronoi chord-LEPP is
   **0.0528%**, block range **0.000 … 0.733**, and **one parent supplies 84.35% of that residual**.
   ⇒ **Restate as ~0.05% uncleared, band [0, 0.73].** The *substantive* claim survives and is still the
   strongest result in the campaign — **0.05% against Gothic's 19.78%, a ~375× gap** — and the count
   itself is solid (**8.697× ±4.4%**). But it is not literally zero and I published it as literally zero
   three times.
2. ***VORONOI `red` "16.09× at 0.00% uncleared" IS WRONG — the pool says 18.68× at 3.600%***, block
   range 0.003…10.97 (**a 3,532× spread**). Any §0g reasoning leaning on `red` clearing Voronoi must be
   re-checked.

### 0j.3 THE BANDS ON §7.1 — AND THEY ARE NOT UNIFORM

C=2000, R=16, ±1.96·SD_phase relative:

| | Gothic S39CTL | Voronoi SHAPE-on |
|---|---|---|
| **position 10 µm** | 1.0250 [1.0015, 1.0915] **±4.3% SOLID** | 1.0529 **±4.4% SOLID** |
| chord 10 µm LEPP | 5.856 [4.623, 7.551] **±27.0%** | 8.697 **±4.4% SOLID** |
| 1° angle | 88.36 **±13.6%** | 227.95 **±6.7% SOLID** |
| *uncleared %, any row* | **±30.5% … ±656%** | **±30.5% … ±656%** |

***B1's kill FIRES for the position row and for three of Voronoi's four multipliers — the debt is REAL
but NOT UNIFORM.*** The position claim (§0 and §7.0: "the 10 µm position bar is not what is stopping
us") is **the best-conditioned number in the document at ±4.3%** and stands unaltered. Voronoi is
well-conditioned throughout. ***Gothic's chord row at ±27% is the weak one, and every `uncleared %` in
the project is weaker still.***

### 0j.4 H1 SURVIVES — AND ITS MAGNITUDE WAS UNDERSTATED

The question I flagged as mattering most: H1 was refuted on a 1.35× ratio; do the bands overlap?

***THEY DO NOT. `cone` is worse than `lepp` in 500 of 500 disjoint blocks (min 1.118).***

| paired ratio, cone/lepp | published | **banded** | t |
|---|---|---|---|
| Gothic scoped | 1.3497 | **1.6457 [1.5117, 1.7796]** | 9.4 |
| Voronoi SHAPE-on | 1.8585 | **2.3577 [2.0932, 2.6222]** | 10.1 |

Both comparisons are on rows where **both** operators clear in 60/60 blocks, so they are iso-quality by
§0i.2. **The cone refutation is stronger than published, not weaker.** ⚠ Note the instrument: the
empirical p2.5/p97.5 excludes 1.000, while a symmetric **normal** band would contain it — *the normal
band is the wrong instrument on a right-skewed ratio*, and the agent caught itself using one.

### 0j.5 WHAT IT COSTS TO KNOW THINGS — AND THE LEVER THAT MAKES IT AFFORDABLE

**Required N for a ±10% single-run band:** position **400** · 1° angle **1,600–3,200** · chord-LEPP
**800** (Voronoi) to **~9,700** (Gothic) · unscoped LEPP **~108,000** · ***any `uncleared %`: 22,900 to
~8.5 MILLION.***

⇒ ***"0.000% uncleared" IS NOT AN ACHIEVABLE MEASUREMENT.*** §0i.2's rule ("only compare operators that
both reach 0.000% uncleared") must be restated with a tolerance: **compare only operators whose
uncleared-% upper 95% phase-band is below a stated bar.**

**B4 CONFIRMED at 3.4–8.6× ESS — but NOT on the covariate I predicted.** I proposed stratifying on
shape/slope. ***Free STL-only shape covariates (q, diam, minAngle, area) buy ≤1.8×, below the kill.***
What works is Neyman allocation on the **level-0 covering score** (`c0` chord / `g0` sup angle):
**3.4–8.6×**, verified on a held-out half — *stratified N=400 matches unstratified N=1,400–3,400*.
**⇒ This is the standing sampling design from now on: ~6× cheaper AND banded.**

**B2 REFUTED, and the failure is where I did not expect it.** The golden stride behaves like simple
random sampling (SD_phase/SD_iid 0.52–1.23 on all five pools), so systematic sampling was never the
problem. ***The BOOTSTRAP is what fails: single-block 95% CI coverage runs 3%–100% against a nominal
95%, worst exactly where the operator's leaf count is uncapped*** — one parent supplies 84.35% of
Voronoi's LEPP residual, and no resampling invents a parent the sample never saw.

### 0j.6 ⇒ THE ONE-LINE RULE (now in `LAB-CHEATSHEET.md`)

> ***Run N × 8 parents, cut by `floor(q/N)`, report `x [min..max] @ N`. Never quote an `uncleared %` as
> a number — only as its band.***

**Agent's own disclosures:** a line-count resume that would have duplicated 20,190 rows and
double-weighted one phase block; a required-N printed off an R=2 standard deviation; and using
mean±1.96·SD as the H1 verdict interval (**it fires the kill and is wrong**) — all caught and fixed.
**Not measured:** no whole-mesh census (pools are 2.8–10.5%); two styles; the 0.5°/5°/10° bars and the
`turn` operator have **no band**; bands not compared across ruler conventions.
Fidelity: 5 checks, all pass — N=2000 Gothic **bit-identical** to `S98_QREFINE_GOTH2000`.

### 0j.7 ⛔ AND IT REFUTES "`red` IS THE ROBUST OPERATOR" — A CLAIM I PROPAGATED FROM CONE

CONE reported that `red` 1→4 "never blows up — **0.000% uncleared at every N, both styles**," and I
carried it into §0i.1 as an argument that the campaign's choice of bisection was in question. ***The
pool refutes it — and refutes my own number in the same stroke.***

| Voronoi SHAPE-on, `red`, 10 µm chord | uncleared |
|---|---|
| my N=2000 run (`S98_QREFINE_VORSHP2000`) | **0.003%** |
| **S105 pool, 32,000 parents (16×)** | ***3.600%*** (block range 0.003 … 10.97 — a **3,532×** spread) |

***MY OWN N=2000 READING — THE ONE I USED TO RESOLVE THE PROVISIONAL BANNER — IS ITSELF THE
UNDER-SAMPLING ARTEFACT §0j PREDICTS.*** Exactly as §0j.5's required-N table says: any `uncleared %`
needs N between 22,900 and ~8.5 M, and N=2000 is nowhere near it. ***The lesson generalises: a bigger N
does not make an `uncleared %` trustworthy — only a band does.***

⇒ **The best available operator comparison:**

| | LEPP | `red` 1→4 |
|---|---|---|
| Gothic, N=2000 | **5.33×** / 17.42% | 8.59× / **4.39%** |
| Voronoi, pool 32 K | **8.697×** / **~0.05%** | 18.68× / 3.600% |

***`red` is 1.6–2.1× dearer and is NOT uniformly more robust — on Voronoi, LEPP beats it on BOTH
axes.*** On Gothic `red` trades 1.61× cost for ~4× less uncleared, a real but style-specific trade.
**"Switch the operator to `red`" is NOT supported**, and §0i.1's suggestion that bisection's selection
is in question is withdrawn. *(The rest of §0i.1 — LEPP's non-convergence with depth on the unscoped
mesh — is unaffected.)*

Scorecard: `S105_BANDS.md`. Commits `27a1039d` (pre-registration, **before** the first run), `70a22176`, `b85b55ca`.

---

## 0k. *** S106/CONFORM — THE CONFORMITY MULTIPLIER IS MEASURED (1.39 / 2.01), IT DOES NOT CANCEL, AND THE SPLIT OPERATOR HAS FIXED POINTS ***

### 0k.1 THE NUMBER THE CAVEAT WAS HIDING

Every count in this campaign carried `(conformity ignored ... each count is a lower bound; the RATIO is
the claim)`. Measured at last, by a real Rivara backward-longest-edge conforming arm with **zero
hanging nodes at every step** (audited, not asserted: 0 edges with >2 faces, one-face count grows only
with the patch boundary), against `frontierRefine.adaptBisect('lepp')` copied verbatim:

| 10 µm chord, LEPP, cap 12 | independent | conforming | **M** | vs 12 M budget |
|---|---|---|---|---|
| **Voronoi S94CTL** — ***whole-mesh CENSUS, all 492,068 facets, no sampling*** | 4,266,821 (8.671×) | **5,944,684** (12.081×) | **1.393** | **49.5% ⇒ PASS** |
| **Gothic S39CTL** — census independent, patch-converged conforming | 6,396,921 (5.601×) | ~12.84 M | **2.008** | **107.0% ⇒ FAIL** |

***THE 12 M ANSWER IS SPLIT: VORONOI FITS WITH ROOM. GOTHIC DOES NOT.*** Gothic's M is patch-converged
(2.055 @ 4k → 2.018 @ 16k → **2.0075 @ 64k**, boundary term 7.20% → 0.41%) with a **downward** bias of
~1.2% calibrated against the Voronoi census — so the FAIL can only get worse.

**M is also the best-conditioned multiplier this campaign has measured:** phase-block spread **±3.7% at
N=2000** (±21.5% at N=150), against the *same mesh's* LEPP leaf multiplier spreading **32×** at N=150.

### 0k.2 ⛔ AND THE ASSUMPTION UNDERNEATH THE CAVEAT IS REFUTED — CONFORMITY DOES NOT CANCEL

"Only the RATIO is claimed" is only a defence if M is the same on both sides of the ratio. **It is not.**
Measured gaps: **45% across styles, 39% across bars within Voronoi, 37% within Gothic, 21% for position
across styles.** ***The cancellation kill does not fire on any pairing.*** M is four different numbers —
**1.39 / ~2.01 / 1.00 / 1.27** — and §7.1's absolute counts need the matching one, not a shared one.

### 0k.3 *** THE LARGER FINDING: `lift(½(θu+θv), ½(zu+zv))` IS NOT A BISECTION. IT HAS FIXED POINTS. ***

Non-shortening splits — where `max(|u−mid|, |v−mid|) ≥ |u−v|`, i.e. **the "midpoint" does not lie
between its endpoints in 3-D**:

| | cap 12 | cap 24 |
|---|---|---|
| **Gothic** | 401 / 8,652 = **4.635%** | 44,690 / 231,778 = ***19.281%*** (worst ratio 3.784) |
| Voronoi | 0.000% | **0.000%** (worst 0.832) |

Printed mechanism, not inferred: `|uv|` 8.1654e-3 mm, `|u−mid|` 7.2363e-3 (**88.6% along the edge**),
`dR` 7.142e-3 across a **0.18 µm** θ-arc — ***constant to 6 digits over 100,000 consecutive splits. A
FIXED POINT.*** Some Gothic facets are **unrefinable at any depth**.

***AND THE cap-24 ROW REPRODUCES §0i.1's PUBLISHED 116.889× / 32.237% TO THE DIGIT.*** So §0i.1's
"more depth makes LEPP worse — it does not converge" now has a mechanism, and the mechanism is **a
defective midpoint**, not a property of LEPP or of the surface.

### 0k.4 ⇒ *** AND I CHECKED THE ONE THING THE AGENT COULD NOT: THE DEFECT IS IN THE INSTRUMENT, NOT THE PRODUCT ***

The agent noted it never read a production file. I did.

| | split point | fixed points? |
|---|---|---|
| `frontierRefine.ts` **and all four descendants** (`s98QRefine`, `s94ConeRefine`, `s105BandsRefine`) | `0.5(θu+θv), 0.5(zu+zv)` — the **parametric** midpoint | ***YES*** |
| **the production driver** (`_strataConformBisectS34`) | `placeAt` → `chordParam`: a **24-iteration bisection for the true 3-D chord fraction**, shift capped at 0.25 | **mitigated** |

***`PF_CB_MID3D` DEFAULTS ON*** (`process.env.PF_CB_MID3D !== '0'`), and the driver's own report line
records what turning it off costs: *"parametric midpoint — the measured 0.819 off-centre bias is BACK."*
**The driver team found and fixed this in July.** Grep confirms the instruments have **zero** references
to `chordParam`/`MID3D`.

> ### ***EVERY REFINEMENT COST THIS CAMPAIGN HAS PUBLISHED WAS MEASURED WITH AN OPERATOR THE PRODUCTION DRIVER DOES NOT USE — AND ON GOTHIC THAT OPERATOR HAS FIXED POINTS.***

**⇒ CONFORM's recommendation inverts.** It said *"fix the split operator first."* The product's splitter
is already fixed; ***it is the measurement instrument that needs the port.*** That is a much cheaper job
and it invalidates far less.

**What this does and does not license:**
- **Gothic's FAIL at 107% is measured on the defective operator and is very likely pessimistic** — but
  ***it is NOT thereby a PASS***, and nobody has re-run it. **Do not quote Gothic as passing.**
- **Voronoi is unaffected: 0.000% non-shortening at both caps**, so its census, its M = 1.393, and its
  49.5% PASS stand.
- §0i.1's LEPP non-convergence is **an instrument artefact**. The §0i.1 *sampling* finding (the 25×
  spread, tail dominance) is untouched — that was about N, not about the midpoint.
- **M itself was measured on the defective operator**, so 1.393 / 2.008 will move when the instrument is
  ported. The Voronoi one should barely move (0.000% affected); **Gothic's is the open one.**

### 0k.5 A FRAMING ERROR OF MINE THAT THE AGENT CAUGHT

***§7.1's `position` row is a `red` (1→4) multiplier while its `chord` row is `LEPP`*** — `adapt()` uses
`children()` for both bars. **Two different operators in one table, unlabelled, by me.** Fixed there.
And the brief I wrote fed the agent **stale inputs**: Voronoi's independent count is **4.267 M** (not
~4.5 M) and Gothic's is **6.397 M** (not 7.6 M — ***that figure carried the retired 6.67× anchor***).

**Agent's own disclosures:** a wrong first diagnosis of a stall (shipped a fix *before* having evidence
for its cause; the fix was independently correct and proven mesh-identical on 24 rows), an `Int16Array`
depth field that **overflowed to −31527**, a hard cap that **spun 4,000,000 times**, a guessed
degenerate-facet cause refuted by measurement, and **a pre-registered C4 mechanism that was backwards**
(a sparse bar drives M→1 by construction; the quantity that behaves as predicted is `M_work` = 1.10
Voronoi vs **4.50** Gothic).
**Not measured:** `red`/2:1-balance conformity — ***LEPP is the favourable operator, so every M here is
a LOWER BOUND for a red-based scheme, and §7.1's position row IS red***; the 1° angle bar; the
`turn`/`cone` operators, so ***§0i.3's 1.646×/2.358× is NOT re-priced and must not be assumed to
survive conformity***; the Gothic chord census (still running — it can only move the FAIL further over).

### 0k.6 ⇒ *** S107 — I PORTED IT, AND IT IS 11.4% CHEAPER AND 41% LESS UNCLEARED ON GOTHIC ***

`research/tools/s107Mid3d.ts` — a verbatim copy of `frontierRefine.ts` that **imports the driver's own
`chordParam`** (not a re-derivation) behind `PF_FD_MID3D`, plus an always-on non-shortening census.
Fidelity with the flag off reproduces the parent exactly.

**Gothic S39CTL, N=2000, cap 12, paired — same parents, same bar, only the split point differs:**

| | MID3D=0 (parametric) | **MID3D=1 (chord solve)** |
|---|---|---|
| lepp | 5.33× / 17.42% uncl | ***4.72× / 10.28% uncl*** |
| non-shortening | 3.4677% (941) | **0.9090% (221)** — 3.81× fewer |
| leaf minAngle mean | 28.3° | **30.8°** |
| **`red` 1→4 — CONTROL** | 8.59× / 4.39% | ***8.59× / 4.39% — BIT-IDENTICAL*** |

***COST 0.886× (−11.4%) AND UNCLEARED 0.59× (−41%), with better leaf shape.*** The `red` control is
bit-identical because it routes through `children()`, which was not patched — **the intervention is
provably confined to the bisection path.**

**BUDGET, with its assumption stated:** Gothic's independent census 6,396,921 × 0.886 ≈ 5.67 M; at
S106's M = 2.008 that is **~11.38 M = 94.9% of the 12 M budget — which would flip Gothic FAIL → PASS.**
⚠ ***NOT YET A PASS: M itself was measured on the defective operator and has not been re-measured.
Do not quote Gothic as passing.***

**Cap 24 / N=400 paired:** non-shortening 0.0261% → 0.0089%, uncleared 0.18% → 0.00%, and ***worst leaf
minAngle 0.00° → 0.01° — the parametric midpoint produces exactly-degenerate leaves and the solve does
not.***

> ### ⚠ AND IT REFUTES WHAT I PUBLISHED AN HOUR EARLIER, FOR THE FOURTH TIME BY THE SAME CAUSE
> At **N=400** I measured **+0.4% cost and slightly worse uncleared**, and wrote that the defect was
> *"nearly free to carry"*. ***Both the magnitude and the SIGN were wrong, and the cause was sample
> size*** — the failure mode §0j had documented three hours before I committed it.
>
> ***METHOD NOTE THAT GENERALISES: the non-shortening RATE is itself tail-dominated*** — 1.33% at
> N=400, 3.47% at N=2000, S106's 4.635% at its own N, all cap 12. **PAIRED before/after at fixed N is
> sound; the absolute rate is not. Quote the pair, never the level.** (My cap-24 N=400 arm reads
> 0.0261% against S106's 19.281% purely because *my sample never reaches the tail parents that carry
> the defect* — it is under-powered by construction and is reported as a pair only.)

Scorecard: `S106_CONFORMITY.md`. Commits `fbd1a33e` (pre-registration), `c5cec83e`, `47905a5d`, `13c4cfe3`.

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

> # ⛔⛔ ALL THREE "PROVEN OBSTRUCTIONS" IN THIS SECTION ARE NOW REFUTED. NOTHING HERE IS QUOTABLE.
>
> ***Every item below was measured on `voronoi_ring_D--.stl` — 806,765 triangles, SHAPE GUARD OFF***
> — the artefact `060f3cd9` had already flagged as the worse of the two, carrying a `q<0.2` sliver
> population (9,309 edges) the shape-gated mesh does not have **at all**. Re-derived with the gate on,
> same style, same surface, same instruments:
>
> | claim | status | the number that killed it |
> |---|---|---|
> | 1. Voronoi is **closed to splitting** (required child aspect 3,009) | ***REFUTED*** | LEPP clears the 10 µm chord bar at **8.697× ±4.4%**, ~0.05% uncleared (§0g, §0j.3). *A mesh closed to splitting cannot clear.* |
> | 2. Every **1-ring operator is defeated by super-hubs** (degree 2,550) | ***REFUTED*** | shape-gated max facet-degree **40**, ZERO vertices ≥100 — *lower than Gothic's 50* (item 2 below) |
> | 3. The **lift folds** the mesh (7.415% of children) | ***REFUTED*** | **0.2050%** with the gate on — 28.7× fewer, and the wall-angle dependence vanishes entirely (§0g.1) |
>
> ***THE OBSTRUCTIONS WERE PROPERTIES OF ONE BADLY-BUILT ARTEFACT, NOT OF THE SURFACE.***
>
> ⚖ **BUT THE OPERATORS ARE STILL BOUNDED — for a better reason.** §0f.1's per-footprint normal-cone
> ceiling is independent of all three: **88–94% of over-bar area is irreducible for its own footprint,
> for every plane through it.** *Removing a false ceiling does not create headroom under the real one.*
> **This section is kept only as a record of how three artefact properties became "proven".**

1. ⛔ ***"VORONOI IS CLOSED TO SPLITTING" — REFUTED.*** ~~The child altitude needed to cancel the
   parent's orientation error implies a **required child aspect of 3,009** (p90 8.0e11); the triangle
   that would fix it is a needle whose own normal is unbounded.~~ ***On the shape-gated mesh LEPP
   bisection clears the 10 µm chord bar at 8.697× ±4.4% with ~0.05% uncleared, triply reproduced
   across three tools and three sample sizes (§0g, §0j.3). A mesh that is closed to splitting cannot
   do that.*** The 3,009 aspect was computed over the `q<0.2` sliver population the gate removes.
2. ⛔ ***"EVERY 1-RING OPERATOR IS DEFEATED BY THE SUPER-HUBS" — REFUTED 2026-08-06 BY RE-CENSUS.
   THE SUPER-HUB CLASS DOES NOT EXIST ON THE SHAPE-GATED MESH.*** Ran `s82HubCensus.ts` **unmodified**
   (the campaign's own instrument, exact-f32 weld) on all three artefacts:

   | | max facet-degree | deg ≥ 1000 | share of mesh on deg ≥ 100 |
   |---|---|---|---|
   | Voronoi SHAPE-**off** (the void artefact) | **2,550** | 32 | 2.6746% |
   | **Voronoi SHAPE-on** | ***40*** | **0** | **0.0000%** |
   | Gothic S39CTL | 50 | 0 | 0.0000% |

   ***THE SHAPE-GATED VORONOI MESH HAS A LOWER MAX DEGREE (40) THAN GOTHIC (50).*** p50 6, p99 14,
   p999 21. There is no 2,550-gon, no super-hub class, and no structural defeat of 1-ring operators.

   ⚠ ***THIS WAS ALREADY KNOWN AND NEVER PROPAGATED.*** S95 (2026-08-05) recorded that "every
   'defeated by the 2,550-gon' result was measured on the worse mesh." It sat un-merged into this
   section for a day while §0g–§0i were built on top of §5. **The re-census confirms an existing
   finding rather than discovering one; the failure was documentary, not experimental.**

   ⚖ **BUT DO NOT OVER-READ IT.** Killing the hub explanation does **not** resurrect the operators.
   ***§0f.1's per-footprint cone ceiling is an independent and STRONGER bound*** — 88–94% of over-bar
   area is irreducible for its own footprint, for *every* plane through it, hub or no hub. So: **the
   hub story is dead; the operators remain bounded, for a better reason that depends on no artefact.**
   What genuinely reopens is any lever that was priced dead *specifically* on the 2,550-gon.

   ~~ORIGINAL CLAIM, RETAINED REFUTED:~~ 32 Voronoi vertices of degree ≥1000 hold
   5.62% of the whole mesh; worst **2,550** against a **median of 5**. A flip, a collapse, a vertex
   removal and the cavity DP are all 1-ring ops, and the 1-ring of a 2,550-degree vertex is a
   2,550-gon. `fold` fires on 494,895 of 745,470 collapse candidates.
   **It is a REFINEMENT RUNAWAY:** the same junction vertex is degree **37 / 57 / 2,550** at 285,826 /
   671,823 / 806,765 triangles of the same mesher, style, params and flags.
3. ⛔ ***"THE LIFT FOLDS THE MESH AND NO ON-EDGE PLACEMENT CAN FIX IT" — REFUTED.*** With the shape
   gate on, the same style on the same surface folds **0.2050% of edges against 5.8933%** — **28.7×
   fewer by count, 21.9× by area — and the wall-angle dependence vanishes entirely** (§0g.1). The fold
   *geometry* in the original claim is exactly right (`dPar/dPerp = tan β`; a child inverts when radial
   sag passes `δ_crit = h_min/(2 sin β)`, predictor recall 0.9994) — ***but the variable that decides
   whether that threshold is REACHED is `h_min`: facet shape, a mesher configuration choice, not a
   property of the surface.*** And the p50 7.01 below is a reading of `tan β ≈ 7`, i.e. a β ≈ 82°
   subpopulation — not a separate effect.
   ~~ORIGINAL CLAIM, RETAINED REFUTED:~~ `liftAt`'s displacement is mostly
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

## 7. HOW TO PROCEED — RE-BASELINED 2026-08-06 AFTER S95 + S98 + S94/CONE

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

`uniLev 2 / maxLev 6`, **N=2000** golden-stride, LEPP, conformity ignored ⇒ **lower bounds**:

***WITH §0j BANDS (±1.96·SD over 16 disjoint phase blocks).*** These are the first error bars this
campaign has ever had:

| ⚠ **operator** | Gothic S39CTL | Voronoi SHAPE-on | ⚠ **conformity M** |
|---|---|---|---|
| **position 10 µm** — ***`red` 1→4*** | **1.025× ±4.3%**, 0.000% uncl | **1.053× ±4.4%**, 0.000% uncl | G **1.27** / V **1.00** |
| chord 10 µm — ***`LEPP`*** | 5.856× **±27.0%**, ~19.8% uncl | **8.697× ±4.4%**, ~0.05% uncl | G **~2.01** / V **1.393** |
| **1° angle** — ***`red` 1→4*** | 88.36× **±13.6%**, ~14.4% uncl | 227.95× **±6.7%**, ~15.2% uncl | **not measured** |

⚠ **The two columns are NOT ratioable** (§0i.2 — Gothic does not clear at this cap). Read each column
down, never across.
⚠ ***Every `uncleared %` above is ±30% to ±656% and is shown only as an order of magnitude — see
§0j.5. Do not quote one as a number.*** ***The position row is the best-conditioned number in this
document*** and §7.0's headline rests on it.
⚠ ***THESE ARE CONFORMITY-FREE COUNTS. Multiply by the M column for a real mesh — and note M is FOUR
DIFFERENT NUMBERS, it does NOT cancel out of ratios (§0k.2).*** Against a 12 M budget on the chord bar:
***Voronoi 5.94 M = 49.5% PASS; Gothic ~12.84 M = 107% FAIL*** — though Gothic's is measured on an
operator with fixed points (§0k.3) and is likely pessimistic. **⚠ The two rows marked `red` were
measured with a different operator than the chord row; that was my error and it is now labelled.**

**⚠ AND THE BUDGET VERDICT IS NOW MEASURED, NOT ASSUMED (§0k.1):** with real conformity on the chord
bar, ***Voronoi is 5.94 M = 49.5% of the 12 M budget (PASS)*** while ***Gothic is ~12.84 M = 107%
(FAIL)*** — though Gothic's was measured on the defective splitter above and is likely pessimistic.
**Nobody has re-run it, so do not quote Gothic as passing.**

**The whole remaining problem is the last row** — ⚠ **and see §0i.2: those two columns are NOT on the
same quality line and must not be ratioed.** What the 1° row is really worth is now priced independently
(§0i.3, H2): ***full clearance costs ~155× and the best any isotropic field can do at 5% over-area is
18.33×.*** **The 1° bar is reachable — it is simply not a 12× object.** For scale, at the
industry-practical **5°** bar Gothic starts **6.43%** over by area, against **~29%** at 1°, and the chord
bar is met at ~3×. ***Choosing the angular bar is therefore a PRODUCT decision with a ~50× price
attached, and it has never been made deliberately.***

> ⚠ **DO NOT READ 6.43% AS "5° SOLVES IT."** It is the same number §0f.4 reported as ***"no exemption"***,
> and §0f.4 is right: 6.43% of surface area over bar is **not zero**, and this campaign's standard is
> not "mostly". Relaxing 1° → 5° takes the defect from ~29% to ~6% of area — **a real 4.5× improvement
> and not a solution.** The honest statement is that the bar choice moves the problem's SIZE by ~50× in
> cost and ~4.5× in residual, so it should be chosen deliberately — **not that any choice makes the
> work go away.**

### 7.2 DO THIS

0. ### ***DO THIS FIRST: PORT THE DRIVER'S 3-D CHORD SOLVE INTO THE MEASUREMENT INSTRUMENTS.***
   `frontierRefine.ts` and its four descendants split at the **parametric** midpoint
   `0.5(θu+θv), 0.5(zu+zv)`, which ***is not a bisection and has FIXED POINTS on Gothic*** — 19.281% of
   cap-24 splits do no work, and some facets are unrefinable at any depth (§0k.3). ***The production
   driver already solves this*** (`placeAt` → `chordParam`, 24-iteration, `PF_CB_MID3D` **default ON**).
   **So the defect is in the ruler, not the product, and the port is a few lines.** ***It is the
   cheapest action in this document and the one that most changes what we believe:*** it re-prices
   Gothic's 107% budget FAIL, and it removes the mechanism behind §0i.1's "LEPP does not converge."
   **Re-run Gothic's chord census immediately after.** *(Voronoi is unaffected — 0.000% non-shortening.)*
   ✅ ***DONE AND IT PAID: `s107Mid3d.ts` measures 0.886× cost and 0.59× uncleared on Gothic at N=2000,
   with a bit-identical `red` control — see §0k.6. What remains is re-measuring the conformity M on the
   fixed operator, which is what decides Gothic's budget verdict.***

1. ⛔ ***"DRIVE THE SIZING FIELD FROM THE PER-FOOTPRINT NORMAL CONE" IS REFUTED (§0i.3, H1).*** It is
   1.35× worse than plain LEPP on Gothic and **1.86× worse on Voronoi**, both measured iso-quality, and
   the loss is isolated to **the split, not the driver**. Do not rebuild it. ***Its kill line for the
   1° bar (>12×) is also now known to be unreachable by ANY isotropic field — the knapsack optimum is
   18.33× and the measured frontier does not cross 5% below ~106×.***

1b. ***THE REPLACEMENT: STOP REFINING, START GENERATING — THE `M = g/h²` REMESH.*** Three independent
   results are the same fact (§0i.4): free placement certifies **the same geometry at 1.615 leaves/par
   against LEPP's 3.120 — a 1.93× prize**; the cone's failure mechanism is that subdivision has no
   granularity headroom left; and anisotropy's 1.89× is unreachable by subdivision because parent long
   axes are misaligned by p50 28.43°. ***Sizing and anisotropy are GENERATION levers.*** **The kernel
   exists, is certified, and is unwired.** H4 says it does **not** deliver as shipped (2.931× and still
   14.795% over bar) — ***so the next arm is its two named knobs, not a new mechanism***:
   `splitThresh 1.5` (a converged element can be 1.5× the target ⇒ chord 2.25× the design tol) and the
   160×160 curvature grid aliasing sub-cell relief (its own docs record 5–10×; `curvatureFineStep` is
   the remedy). Both are already wired in `s94ConeRemesh.ts`. **Its shape column is already a win:
   leaf minAngle 47.3° mean / 3.98° worst against LEPP's 37.6°/1.25°.**
   ***BUDGET IT PROPERLY (§0i.7): the `chordTolMm` sag guard evaluates a 45-point lattice per triangle
   per round and burned 1,218 s with ZERO rows on a borrowed slot — it needs its own run.*** And know
   the scope before starting: **the kernel's chord mode already implements the right law for the CHORD
   bar; an ANGLE bar needs a NEW `h = θ*/κ` mode that does not exist.** Chord = tuning; angle = new code.

1c. ***THERE IS NO "HARDEST STYLE" — ONLY A HARDEST BAR.*** Voronoi clears the chord bar where Gothic
   does not (§0g); Gothic is 2.5× cheaper than Voronoi on the 1° angle bar (§0i.3). **The style ranking
   inverts with the bar, so stop picking a "worst style" to optimise against and pick the bar first.**
2. ***SET `PF_CB_SHAPE_AR = 12` (from 50) — ON THE COST ARGUMENT ONLY.*** Derived from
   `aspect3 = (P/L)/q²` and calibrated on 806,765 real facets (§0h.2c); the cap value is universal.
   It is **nearly free on healthy meshes** (96.2% of Gothic's facets, 89.2% of shape-gated Voronoi's
   still admitted) and removes the population that costs **1427× per parent** on an unhealthy one.
   ⚠ **Do NOT justify it as "excluding a catastrophic band"** — §0h.2e retracts that; the same q band
   clears fine on the shape-gated mesh. **It is a COST lever, not a fidelity lever.**
3. ***ADOPT THE §0j SAMPLING DESIGN FOR EVERY FUTURE MEASUREMENT — the cheapest item here, and it makes
   all the others trustworthy.*** **Run N × 8 parents, cut by `floor(q/N)`, report `x [min..max] @ N`;
   never quote an `uncleared %` as a number, only as its band.** Then add Neyman allocation on the
   **level-0 covering score** (`c0` chord / `g0` sup angle) for **3.4–8.6× ESS** — held-out-verified, so
   a stratified N=400 buys what an unstratified N=1,400–3,400 does. ***~6× cheaper AND banded.***
   (Shape covariates — q, diam, minAngle, area — buy ≤1.8× and are **not** the lever.)
4. **Make `certifyTriangle` the reporting ruler for every arm.** A driver "PASS" is not evidence.
5. **Land the flip on the remaining styles** — free, improves both rulers, only proven on Gothic.

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
