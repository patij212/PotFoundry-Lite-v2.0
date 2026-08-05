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
One lever survives honest scoring: a constrained edge flip, which is free. The binding constraint is
now believed to be the mesher's **vertex representation**, not its refinement rule — see §0b and §7.

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

### 0e.2 *** ORIENTATION NOW HAS NO KNOWN LEVER ***

Everything tried is measured dead: **flips 1.015× median** (and 1.09× with a corrected key),
**exact cavity DP +3.29%**, **collapse/re-point ceiling 0.38%**, **density ×0.9968**, **ideal split
placement 0.00%**, **splitting provably closed on Voronoi** (required child aspect 3,009), and
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

## 5. THE OBSTRUCTIONS — proven, not suspected

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

## 7. HOW TO PROCEED

**IMMEDIATE (cheap, unblocks everything)**
1. **Make `certifyTriangle` the reporting ruler for every arm.** A driver "PASS" is not evidence. Add
   it to the arm report or run `s85PosRebase.ts` after each arm.
2. **Withdraw every `over-0.01mm` figure in the worklog.** They cannot be corrected, only discarded.
3. **Land the flip on the remaining styles.** It is free, it improves both rulers, and it has only
   been proven on Gothic.

**NEXT (a bug, not a limit)**
4. **Fix the super-hub runaway.** Degree 2,550 against a median of 5 is a pathology, not a trade-off.
   `PF_CB_MAXDEG` exists (default 0) and makes it *visible*; the emitting site is in the last phase of
   the split loop and has not been located. Fixing it is prerequisite to any Voronoi progress, because
   it is what defeats every local operator.

**THE STRUCTURAL ONE — and this is the honest answer to "why are we stuck"**
5. ***THE VERTEX REPRESENTATION IS THE BINDING CONSTRAINT.*** `addV` derives every position from
   `R(θ,z)`, so a vertex is on the surface **by construction**. Three independent results now point at
   the same place: P4 cannot land because its fallback needs an off-surface vertex; the in-plane fold
   cannot be corrected because on-edge placement is the only freedom the driver has; and Voronoi's
   orientation cannot be fixed by any triangle the driver can express.
   **The design change is to allow a vertex OFF the surface under a bounded position budget** — trade a
   little H1 for orientation and tiling, deliberately and measurably. That is what P4 was, and it is
   what `_facetTruthLib`'s own two-sided certificate makes safe to attempt.
6. **Then, and only then, revisit the operator.** 1→4 refinement halves the circumradius
   deterministically (0.500 at p50 *and* p90) where longest-edge bisection *enlarges* it for >10% of
   Voronoi's children (p90 2.855). Normal error scales with circumradius — arXiv:1911.03424.

**DO NOT**
- Do not tune `PF_CB_SHAPE_AR`, chase density, or build a fan-aware local operator. All three are
  measured dead.
- Do not accept a lever on a headline movement. **The cavity was accepted on a 1.96× that was worth
  zero; the AR cap was accepted on a 4.37× that was 2.13×.** Every lever in the ledger accepted on a
  plane-ruler movement needs re-examining.

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
