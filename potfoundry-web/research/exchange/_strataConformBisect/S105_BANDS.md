# S105 BANDS — CONFIDENCE BANDS ON EVERY REFINEMENT MULTIPLIER THIS CAMPAIGN STEERED ON

**Agent: BANDS.** Tools: `research/tools/s105BandsRefine.ts` (verbatim copy of `s98QRefine.ts`),
`s105BandsCone.ts` (verbatim copy of `s94ConeRefine.ts`), `s105BandsAnalyze.cjs` (offline statistics),
`run-s105-bands-refine.sh` / `run-s105-bands-cone.sh` (own bundle paths).
Pools + analyses: `research/exchange/_strataConformBisect/frontier/S105_POOL_*.ndjson`,
`S105_ANALYZE_*.txt`. Pre-registration commit `27a1039d` — **written and committed before the first
pool run**.

---

## 0. THE ONE PARAGRAPH

***THE DEBT IS REAL, IT IS BIGGER THAN THE BRIEF CLAIMED, AND IT DOES NOT OVERTURN A SINGLE ONE OF THE
CAMPAIGN'S CONCLUSIONS.*** Measured on 213 **disjoint** golden-stride phase blocks of the same mesh, the
same 10 µm chord bar, the same LEPP operator, the same depth cap 16 and the same unscoped population —
i.e. with **everything except the sample phase held fixed** — the LEPP multiplier runs **2.320× to
74.633×, a 32.17× spread, at N=150**, and it is still **3.56× at N=2000**. §0i.1's 25× ladder is
therefore *not* mostly cap and scope: **32× of it is pure sampling.** Worse for the anchor: **70% of
N=150 phase blocks read EXACTLY 0.000% uncleared on a mesh whose true residual is 26.121%** — the
published 6.67×'s single most convincing feature was its *modal* artefact, and the whole published
ladder (6.673 / 6.520 / 5.503 / 12.708 / 10.822) sits at percentiles **55 / 41 / 11 / 62 / 44** of one
distribution. ***BUT: the two things the campaign actually decided on both survive.*** The 10 µm
**POSITION** row is pinned to **±4.3% / ±4.4%** at N=2000 (B1's kill fires for it: the debt there is
smaller than claimed), and **H1's refutation holds on both styles by every non-parametric measure** —
cone is worse than LEPP in **60/60 Gothic and 40/40 Voronoi** disjoint blocks, paired t = 9.4 / 10.1,
and the published 1.350× / 1.859× were *low* draws: the honest values are **1.646× and 2.358×**. The
one methodological casualty is the **uncleared % column**: it is the least reproducible number in the
project (Gothic RED 2.16→30.24%, Voronoi RED 0.003→10.97% across blocks), so §0i.2's "**both reach
0.000% uncleared**" cannot be verified from one sample and must be restated as a band. B2 exonerates
the golden stride (deff 0.27–1.52 — it behaves like a random sample) but **convicts the bootstrap**:
nominal 95%, measured coverage **3–100%**, worst on exactly the quantities the campaign quotes. B4
delivers: Neyman stratification on the **level-0 covering score** buys a measured **3.4–8.6× ESS**,
while every free STL-only shape covariate buys ≤1.8×.

---

## 1. THE DESIGN, AND WHY IT NEEDS NO DISTRIBUTIONAL ASSUMPTION

`goldenIdx(n, C)` = `{q*s mod n : q = 0..C-1}` with `s` coprime to `n`. Extend to `NTOT` and cut into
`R = NTOT/C` **consecutive disjoint blocks** of length `C`. Block *j* is `{(jC+q)*s mod n}` = block 0
**translated by** `(jC*s mod n)` — an *exact phase-translate of the campaign's own sample*: same stride,
same structure, different phase. The blocks are disjoint and their union is the pool. **Block 0 IS the
sample the campaign took and published**, which is why every table below can print PUBLISHED next to
POOL and the two must agree to the digit.

Every quantity is a **ratio of sums** `T = Σnum / Σden` (leaves/parent: `den = 1`; uncleared %:
`den = leaves`; cone/lepp: `den = lepp leaves`), so one estimator bands all of them and the H1 ratio is
banded **directly** rather than by differencing two independent bands.

**TWO DIFFERENT 95% INTERVALS, AND THE DIFFERENCE IS THE WHOLE POINT.**
* **SINGLE-RUN BAND** (the headline; *this is the debt*): "if we had run N=C once at a different phase,
  what would we have seen?" — the spread of the block estimates themselves.
* **CI FOR THE POPULATION VALUE**: `mean ± t·SD/√R`. Tightens with R. Quoting *this* as "the band on
  5.33×" would understate the debt by `√R` ≈ 4×. Both are printed in every `S105_ANALYZE_*.txt`; only
  the first is used as a verdict here.

**THE MEAN IS THE RIGHT FUNCTIONAL AND WAS NOT SUBSTITUTED.** `total triangles = facets × mean
leaves/parent`. Medians and p90s are printed alongside and labelled as *different quantities*.

### 1.1 FIDELITY — RUN, NOT ASSUMED (four checks, all pass)

| check | result |
|---|---|
| `s105BandsRefine` N=60 vs `s98QRefine` N=60, same STL/env | **every numeric line identical** (only my own comment lines differ) |
| `s105BandsRefine` N=2000 Gothic vs published `S98_QREFINE_GOTH2000.report.txt` | **BIT-IDENTICAL ON EVERY NUMERIC LINE** — reproduces §7.1's 1.02× / 5.33× / 17.42% / 88.993× / 11.350% |
| `s105BandsCone` Gothic scoped N=2000 vs published `frontier/S94_REF_GOTHSMOOTH.report.txt` | **every numeric line identical** (3.120× / 4.211× / 1.350×). The published report predates the `RULER=` print block, so that line is additive |
| `s105BandsCone` Voronoi N=800 vs published `frontier/S94_REF_VORCHORD.report.txt` | **BIT-IDENTICAL** (8.650× / 16.076× / 1.859×) |
| ladder pool **block 0** vs the five published `S94_REF_LADDER*` rows (see §2) | agrees to **0.13–0.62%**; the residual is the legacy→`5698d023` sign change, and my N=2000 block 0 = **10.755** reproduces §0i.5's own post-fix figure exactly |

**PLUS a trimming control.** The pool runs use `PF_BD_ANGBARS=1 PF_BD_TURN=0` to buy ~3.5× throughput.
Aggregating the Gothic pool's **first 2000 records** reproduces the published full-bar run exactly:
`1.0240 / 8.5900 / 4.389% / 5.3260 / 17.424% / 88.9930 / 11.350% / 42.912% / 1.012%`. The subsetting is
a **proven** no-op, not an argued one.

**RULER.** `s105BandsRefine` keeps `frontierRefine`'s inline sign convention (`f_xy · centroid_xy`)
**byte-for-byte**, because its job is to band the numbers the campaign published on it. `s105BandsCone`
carries the **`5698d023`** convention (sign from the analytic surface normal) because `s94ConeRefine`
does; its `signMargin` min on scoped Gothic is **0.115** and on Voronoi **2.37e-5** (p50 0.9998,
<0.10 in 0.136%). Every table states which. They are not interchangeable and are not mixed.

### 1.2 THE POOLS

| pool | tool | mesh | config | N raw | records |
|---|---|---|---|---|---|
| `S105_POOL_GOTH` | refine | `gothicarches_ring_DS-HT_S39CTL.stl` | uniLev 2 / maxLev 6, angBar 1° | 32,000 | 32,000 |
| `S105_POOL_VOR` | refine | `voronoi_ring_D--H_S94CTL.stl` | uniLev 2 / maxLev 6, angBar 1° | 32,000 | 32,000 |
| `S105_POOL_CGOTH` | cone | Gothic S39CTL | **scoped** SKIPFOLD=1 slope≤1.0, maxDepth 8 | 120,000 | 59,319 |
| `S105_POOL_CVOR` | cone | Voronoi S94CTL | unscoped, maxDepth 6 | 32,000 | 32,000 |
| `S105_POOL_LADDER` | cone | Gothic S39CTL | **UNSCOPED, maxDepth 8 (= cap 16), OPS=lepp,red** — the exact §0i.1 ladder config | 32,000 | 32,000 |

---

## 2. ⚠ *** THE §0i.1 LADDER IS ONE DISTRIBUTION, AND ITS 0.000%-UNCLEARED IS THE MODAL DRAW *** ⚠

`S105_POOL_LADDER`, GothicArches S39CTL, 10 µm chord, **UNSCOPED**, depth cap 16 — every knob in
§0i.1's ladder held fixed, **only the sample phase varying**.

**POOL (32,000 parents = 16× the largest published ladder row): LEPP = 11.973× at 26.121% uncleared.**
(`red` = 10.261× at 0.005%.)

**FIFTH FIDELITY CHECK, AND IT IS AN INDEPENDENT CONFIRMATION OF §0i.5.** The published ladder reports
carry **no `RULER =` line** ⇒ they are on the *legacy* `f_xy·centroid_xy` sign; my pool is on
**`5698d023`**. My **block 0** — literally the same 150/300/600/1200/2000 facets — reads
`6.700 / 6.533 / 5.510 / 12.652 / 10.755` against the published
`6.673 / 6.520 / 5.503 / 12.708 / 10.822`: **deltas of 0.13% to 0.62%.** And **my N=2000 block 0 is
10.755, matching §0i.5's own post-fix figure `LEPP 10.822 → 10.755` to the digit.**
***The ruler fix moves these numbers by <0.7% while the SAMPLE PHASE moves them by 32×.*** §0i.5's
"every verdict is robust to it" is confirmed from a second tool — and the comparison of those two
magnitudes is the whole finding of this file in one line.

| N | R disjoint blocks | LEPP **MIN** | LEPP **MAX** | max/min | p2.5..p97.5 | uncleared MIN..MAX | blocks reading **exactly 0.000%** uncleared |
|---|---|---|---|---|---|---|---|
| **150** | 213 | **2.320×** | **74.633×** | **32.17×** | 2.59 .. 62.57 | 0.000 .. 56.10% | **150/213 = 70%** |
| 300 | 106 | 2.677× | 49.393× | 18.45× | 2.99 .. 37.72 | 0.000 .. 51.84% | 49/106 = 46% |
| 600 | 53 | 4.015× | 33.555× | 8.36× | 4.28 .. 27.22 | 0.000 .. 46.71% | 11/53 = 21% |
| 1200 | 26 | 5.201× | 24.649× | 4.74× | 5.51 .. 24.44 | 0.000 .. 42.24% | 1/26 = 4% |
| **2000** | 16 | **6.125×** | **21.820×** | **3.56×** | 6.40 .. 21.58 | 2.988 .. 40.87% | 0/16 |
| 4000 | 8 | 7.340× | 17.649× | 2.40× | 7.68 .. 16.95 | 9.288 .. 36.93% | 0/8 |

**AND THE PUBLISHED LADDER IS FIVE DRAWS FROM THAT ONE DISTRIBUTION** (percentile of *my own block 0*,
i.e. the identical facets on the identical ruler — apples to apples):

    N= 150   published 6.673x  (mine 6.700x)  ->  55th percentile of 213 phase blocks
    N= 300   published 6.520x  (mine 6.533x)  ->  41st percentile of 106
    N= 600   published 5.503x  (mine 5.510x)  ->  11th percentile of  53
    N=1200   published 12.708x (mine 12.652x) ->  58th percentile of  26
    N=2000   published 10.822x (mine 10.755x) ->  38th percentile of  16

> ### §0i.1's MECHANISM IS RIGHT AND ITS FRAMING IS WRONG.
> One parent *did* consume 7,139 leaves and *did* enter between N=600 and N=1200. But **5.503 → 12.708
> is an ordinary event**: it is the 11th percentile at N=600 followed by the 62nd at N=1200, inside a
> distribution whose N=150 range is 2.3–74.6. Nothing needed to be special about that parent or that
> N-step. **Re-running the SAME N=600 at a different phase would have produced anything from 4.015 to
> 33.555.** The ladder does not show a threshold; it shows sampling noise read as a trend.

> ### AND THE 0.000% UNCLEARED WAS NOT LUCK — IT WAS THE MOST LIKELY OUTCOME.
> **70% of N=150 phase blocks report exactly 0.000% uncleared on a mesh that is 26.121% uncleared.**
> The published anchor's most persuasive property — a perfect residual — is what an N=150 sample of a
> *non-converging* operator reports most of the time. `red`'s "0.000% at every N and every cap" (§0i.1)
> is different and real: its pool residual is 0.005%.

---

## 3. B1 — THE §7.1 TABLE, BANDED

`C = 2000`, **R = 16 disjoint phase blocks**, uniLev 2 / maxLev 6, 10 µm bar, k=8 covering ruler.
PUBLISHED = block 0 = the exact published sample. P(±10%) = share of all 30,001 sliding phase windows
landing within ±10% of the pool value.

### 3.1 GothicArches S39CTL (`S105_ANALYZE_GOTH.txt`)

| §7.1 quantity | PUBLISHED | **POOL** | block MIN..MAX | max/min | ±1.96·SD rel | P(±10%) |
|---|---|---|---|---|---|---|
| **position 10 µm** | **1.02×** | **1.0250×** | 1.0015 .. 1.0915 | 1.09× | **±4.3%** | **100%** |
| position uncleared | 0.000% | 0.000% | 0 .. 0 (16/16) | – | 0.0% | 100% |
| **chord 10 µm LEPP** | **5.33×** | **5.856×** | 4.623 .. 7.551 | 1.63× | **±27.0%** | 42% |
| chord LEPP uncleared | 17.42% | **19.78%** | 12.33 .. 28.20 | 2.29× | ±52.8% | 24% |
| chord 10 µm RED | 8.59× | 7.991× | 6.310 .. 9.799 | 1.55× | ±24.2% | 51% |
| chord RED uncleared | 4.389% | **8.206%** | 2.163 .. **30.24** | **13.98×** | ±152.5% | 27% |
| **1° angle** | **88.99×** | **88.36×** | 78.13 .. 97.72 | 1.25× | **±13.6%** | 84% |
| 1° angle uncleared | 11.350% | **14.40%** | 9.450 .. 17.63 | 1.87× | ±30.5% | 35% |
| lev0 over-bar chord AREA | 42.912% | 43.03% | 38.48 .. 49.15 | 1.28× | ±12.2% | 92% |

### 3.2 Voronoi SHAPE-on S94CTL (`S105_ANALYZE_VOR.txt`)

| §7.1 quantity | PUBLISHED | **POOL** | block MIN..MAX | max/min | ±1.96·SD rel | P(±10%) |
|---|---|---|---|---|---|---|
| **position 10 µm** | **1.03×** | **1.0529×** | 1.0195 .. 1.0990 | 1.08× | **±4.4%** | **100%** |
| **chord 10 µm LEPP** | **8.47×** | **8.697×** | 8.346 .. 9.047 | 1.08× | **±4.4%** | **100%** |
| chord LEPP uncleared | **0.00%** | **0.0528%** | 0.000 .. 0.733 | INF | ±656% | 0% |
| chord 10 µm RED | 16.09× | **18.68×** | 14.559 .. 23.338 | 1.60× | ±30.1% | 37% |
| chord RED uncleared | **0.0031%** | **3.600%** | 0.003 .. **10.97** | **3,532×** | ±240% | 1% |
| **1° angle** | **221.73×** | **227.95×** | 215.5 .. 243.0 | 1.13× | **±6.7%** | 99% |
| 1° angle uncleared | 14.832% | 15.19% | 9.895 .. 19.12 | 1.93× | ±31.6% | 39% |
| lev0 over-bar chord AREA | 95.09% | 95.58% | 94.75 .. 96.25 | 1.02× | ±1.0% | 100% |

### 3.3 B1'S PRE-REGISTERED KILL — IT FIRES FOR SOME ROWS AND NOT OTHERS, AND THAT IS THE FINDING

> **KILL: if the phase-offset spread at C=400–2000 is under ±10% relative on the headline multipliers,
> the debt is smaller than claimed and I should say so plainly.**

**IT FIRES, PLAINLY, FOR FOUR OF THE SIX §7.1 MULTIPLIERS:**
* **position 10 µm: ±4.3% (Gothic) / ±4.4% (Voronoi).** `1.02×` and `1.03×` are solid numbers. §7.0's
  "the 10 µm position bar is not what is stopping us" **does not need a band and never did** — and it
  is pinned at N as low as **400**.
* **Voronoi chord 10 µm LEPP: ±4.4%.** `8.47×` is solid.
* **Voronoi 1° angle: ±6.7%.** `221.73×` is solid.
* Voronoi lev0 over-bar AREA: ±1.0%.

**IT DOES NOT FIRE FOR:** Gothic chord LEPP (±27.0%), Gothic 1° angle (±13.6%), and **every single
`uncleared %` figure in the project** (±30.5% to ±656%).

> ### THE STRUCTURAL READING: A WIDE BAND IS THE SIGNATURE OF AN OPERATOR THAT DOES NOT CONVERGE.
> Voronoi LEPP clears (pool residual 0.05%) and its multiplier is pinned to ±4.4%. Gothic LEPP does not
> clear (pool residual 19.8%) and its multiplier swings ±27%. Unscoped Gothic LEPP clears not at all
> (26.1%) and swings **3.56× at the same N**. **The variance is not an artefact of the measurement
> method — it is the un-cleared tail leaking into the mean.** ⇒ *Reporting a band is not extra
> bureaucracy; the band IS the convergence diagnostic, available for free from the same run.*

### 3.4 ⚠ TWO PUBLISHED NUMBERS THAT NEED CORRECTING (not from a band — from the pool)

1. **Voronoi `red` "16.09× at 0.00% uncleared"** (`S98_QREFINE_VORSHP2000`, cited as evidence that
   Voronoi clears the chord bar) — pool says **18.68× at 3.600% uncleared**. The published `0.0031%`
   is the **lowest of all 16 blocks**; the block range is 0.003–10.97%, a **3,532×** spread. The
   direction of §0g's claim survives (Voronoi's LEPP really does clear at 0.05%) but **`red`'s does
   not**, and `red` was the column carrying "0.00%".
2. **Gothic chord LEPP "5.33× / 17.42%"** — pool **5.856× / 19.78%**. Small, but both published values
   are on the low side and the multiplier should be quoted as **5.86× [4.62, 7.55] @ N=2000**.

---

## 4. *** THE H1 PAIR — THE DELIVERABLE THAT MATTERS MOST. THE REFUTATION SURVIVES. ***

H1 ("a cone-driven sizing field beats LEPP") was refuted on **1.35×** (Gothic) and **1.86×** (Voronoi).
Both re-measured with bands, and **both directions hold**.

### 4.1 Gothic, scoped (`S105_ANALYZE_CGOTH.txt`; 59,319 retained parents; R=60 blocks of 2000 raw ≈ 989 retained)

| | PUBLISHED (block 0) | **POOL** | block MIN..MAX | max/min |
|---|---|---|---|---|
| lepp leaves/par | 3.1202 | **3.2694** | 3.0636 .. 3.8440 | 1.25× |
| cone leaves/par | 4.2114 | **5.3804** | 3.9586 .. 11.0695 | 2.80× |
| **cone / lepp** | **1.3497** | **1.6457** | **1.2598 .. 3.2491** | 2.58× |
| lepp uncleared | 0.000% | **0.000%** | 0 .. 0 (**60/60**) | – |
| cone uncleared | 0.000% | **0.000%** | 0 .. 0 (**60/60**) | – |

    cone WORSE than lepp in:  240/240 blocks @C=500 (min 1.118)   150/150 @C=800 (min 1.164)
                              120/120 @C=1000 (min 1.216)          60/60 @C=2000 (min 1.260)
                               30/30  @C=4000 (min 1.295)
    PAIRED, whole pool n=59,319:  mean(cone - lepp) = 2.1110 +- 0.4380 leaves/parent
                                  => ratio 1.6457 [1.5117, 1.7796],  t = 9.4

### 4.2 Voronoi (`S105_ANALYZE_CVOR.txt`; 32,000 parents; R=40 blocks of 800 — the published N)

| | PUBLISHED (block 0) | **POOL** | block MIN..MAX | max/min |
|---|---|---|---|---|
| lepp leaves/par | 8.6500 | **8.6971** | 8.1575 .. 9.4125 | 1.15× |
| cone leaves/par | 16.0763 | **20.5050** | 12.006 .. 44.669 | 3.72× |
| **cone / lepp** | **1.8585** | **2.3577** | **1.3943 .. 5.1358** | 3.68× |
| lepp uncleared | 0.000% | **0.0528%** | 0 .. **1.7826** (12/40 nonzero) | INF |

    cone WORSE than lepp in:  64/64 @C=500 (min 1.266)   40/40 @C=800 (min 1.394)
                              32/32 @C=1000              16/16 @C=2000   8/8 @C=4000
    PAIRED, whole pool n=32,000:  mean(cone - lepp) = 11.8079 +- 2.3002 leaves/parent
                                  => ratio 2.3577 [2.0932, 2.6222],  t = 10.1

### 4.3 ⚠ THREE 95% INTERVALS, SAME DATA, DIFFERENT VERDICTS — AND WHY THE PRE-REGISTERED ONE WINS

> **KILL (pre-registered): if the 95% interval for cone/lepp CONTAINS 1.000, the refutation is not
> established.**

| Gothic scoped, C=2000, R=60 | interval | contains 1.000? |
|---|---|---|
| NORMAL `mean ± 1.96·SD` | [0.722, 2.555] | **YES** |
| LOG-SPACE `exp(mean(ln) ± 1.96·sd(ln))` | [0.991, 2.544] | **YES, marginally** |
| **EMPIRICAL p2.5/p97.5 over the 60 blocks** | **[1.269, 2.913]** | **NO** |
| PAIRED (whole pool) | [1.512, 1.780] | **NO** |

**THE NORMAL BAND WOULD HAVE KILLED THE REFUTATION, AND IT IS WRONG.** `cone/lepp` is a positive,
right-skewed statistic (min 1.260, max 3.249, mean 1.639): a symmetric ±1.96·SD interval extends down
to 0.722, a value that **does not occur in 240 independent draws**. B1 pre-registered the
**assumption-free empirical band as PRIMARY** precisely for this class of statistic, and that call was
load-bearing. ***The strongest statement needs no interval at all: at every C from 500 to 4000, on
both styles, EVERY block has cone worse than lepp — 500 of 500 blocks, minimum ratio 1.118.***

> ### VERDICT: H1's REFUTATION IS **NOT** OVERTURNED. ITS MAGNITUDE IS **UNDERSTATED**.
> Gothic **1.350× → 1.646× [1.512, 1.780]** (paired). Voronoi **1.859× → 2.358× [2.093, 2.622]**.
> The published numbers were *low* draws — the 2nd-lowest of 60 and the 8th-lowest of 40 — so the
> campaign's conclusion ("a k-way cone-driven split loses to bisection") is **conservative**, not
> fragile. §0i.3's H1 line should be re-stated with the pooled values and its bands.
> **Requoting rule for these two:** never quote `cone/lepp` from one sample; its own required-N for a
> ±10% *single-run* band is **~25,000 (Gothic) / ~22,000 (Voronoi)** parents.

### 4.4 AND §0i.2's RULE NEEDS A TOLERANCE, NOT A LITERAL ZERO

> §0i.2: ***"ONLY COMPARE TRIANGLE COUNTS BETWEEN OPERATORS THAT BOTH REACH 0.000% UNCLEARED."***

The rule is right and the campaign should keep it. But **"0.000%" is a statement about one sample.**
* Gothic scoped: `lepp` and `cone` are **0.000% in 60/60 blocks** — the rule is satisfied *robustly*,
  and §0i.3's Gothic comparison is genuinely iso-quality at every phase. ✔
* Voronoi: `lepp` reads 0.000% in block 0 but the pool is **0.0528%** and **12 of 40 blocks are
  nonzero** (max 1.7826%). Still essentially iso-quality, so the H1 comparison stands — but the
  literal "0.000%" was a draw.
* Voronoi `red`: published 0.0031%, pool **3.600%**. The rule would have licensed a comparison it
  should have refused.

**RESTATE AS:** *only compare operators whose uncleared % upper 95% phase-band is below a stated
tolerance (0.5% is met by Voronoi LEPP; 0.000% is not verifiable at any affordable N — its own
required-N is ~8.5M parents).*

---

## 5. B2 — THE GOLDEN STRIDE IS FINE. THE BOOTSTRAP IS NOT.

> **KILL: if `SD_phase / SD_iid` is outside [0.5, 2.0], facet index order correlates with geometry and
> every band needs the phase-offset method.**

`SD_iid` = delta-method SD of the ratio estimator under simple random sampling from the pool.

| pool | `SD_phase/SD_iid` range | design effect `deff` |
|---|---|---|
| Gothic refine | 0.520 .. 1.232 | 0.27 .. 1.52 |
| Voronoi refine | 0.683 .. 1.126 | 0.47 .. 1.27 |
| Gothic cone (scoped) | 0.804 .. 1.157 | 0.65 .. 1.34 |
| Voronoi cone | 0.680 .. 1.040 | 0.46 .. 1.08 |
| ladder (unscoped cap 16) | 0.925 .. 1.115 | 0.86 .. 1.24 |

**B2'S KILL DOES NOT FIRE ANYWHERE.** The golden-stride systematic sample behaves like a random sample
on every quantity in every pool; where it deviates it deviates *favourably* (deff < 1 on the smoothest
quantities — mild implicit stratification). ***So the campaign's sampling DESIGN was never the
problem.*** The i.i.d. variance formula is usable, and a future session may use `sd(x)/√N` from a single
sample as a *first* band without the phase machinery.

### 5.1 BUT THE NAIVE BOOTSTRAP UNDER-COVERS, EXACTLY AS PRE-REGISTERED

2,000 resamples **within one block** (what an analyst holding one sample would compute), 95% percentile
interval, scored against the pool value, over all R blocks:

| pool | quantity | bootstrap 95% **coverage** | bootSD / SD_phase |
|---|---|---|---|
| Voronoi cone | cone uncleared | **1/40 = 3%** | 0.21 |
| Voronoi refine | chord LEPP uncleared | **2/16 = 13%** | 0.28 |
| Voronoi cone | lepp uncleared | **8/40 = 20%** | 0.17 |
| Voronoi refine | chord RED uncleared | 7/16 = 44% | 0.60 |
| Gothic cone | **cone/lepp (H1)** | **12/20 = 60%** | 0.76 |
| Voronoi cone | **cone/lepp (H1)** | **26/40 = 65%** | 0.71 |
| Gothic cone | cone leaves/par | 14/20 = 70% | 0.82 |
| ladder | lepp uncleared | 12/16 = 75% | 0.76 |
| Gothic refine | chord LEPP leaves/par | 16/16 = 100% | 1.07 |
| Voronoi refine | chord LEPP leaves/par | 16/16 = 100% | 1.42 |

**Nominal 95%. Measured 3% to 100%.** And the mechanism is printed, not guessed: **coverage tracks
whether the operator's per-parent leaf count is CAPPED.** The refine pool's operators are bounded by
`maxLev 6` (`2^12 = 4096` leaves max), the summand is bounded, and the bootstrap works (75–100%). The
cone operator's k-way split under `MAXLEAF 300000` is effectively unbounded (observed max **13,254**
leaves on one Voronoi parent, **46.67%** of the pool total in the worst 1%), the summand is heavy-tailed,
and the bootstrap fails (60–65%). The brief's warning is confirmed and localised: **the bootstrap cannot
invent an atom it has not seen, and the atoms it misses are the ones that set the answer.**

⇒ **RULE: use the bootstrap for a *capped* leaves/parent statistic if you must. NEVER for an
uncleared %, and never for a ratio between an uncapped and a capped operator.**

### 5.2 TAIL MECHANICS, PRINTED

| pool / quantity | top-1 parent's share of pool total | pool value, minus its 1 largest parent | minus its 10 largest | per-block largest-parent share, p50 / MAX |
|---|---|---|---|---|
| Gothic chord LEPP leaves | 0.80% | 5.8563 → 5.8094 | 5.4575 | 8.73% / 13.17% |
| Gothic chord RED **uncleared** | **18.69%** | 8.2063 → **6.7808** | 6.2521 | 14.97% / **73.45%** |
| Voronoi cone leaves | 2.02% | 20.5050 → 20.0914 | 17.2947 | 16.93% / **52.68%** |
| Voronoi **lepp uncleared** | **84.35%** | 0.0528 → **0.0083** | 0.0018 | 0.00% / **100.00%** |
| ladder lepp leaves (worst 1% hold **76.83%**) | – | – | – | max single parent **10,179** leaves |

**A single parent supplies 84% of Voronoi's entire LEPP residual and 19% of Gothic's RED residual.**
That is why the `uncleared %` column is the least reproducible number in the project, and why 70% of
N=150 draws see none of it.

---

## 6. B3 — THE REQUIRED-N TABLE (the most actionable deliverable)

Smallest `C` on the ladder whose **single-run** relative half-width `1.96·SD_phase(C)/mean` ≤ 10%.
Rows are refused unless **R ≥ 6** disjoint blocks are available (an earlier draft of this table read
"N=8000" off an R=2 row — printed here so the guard is visible). `~` = extrapolated on `1/√N` from the
largest C with R ≥ 10; treat as an order of magnitude, **not** a measurement.

| quantity | Gothic | Voronoi |
|---|---|---|
| **position 10 µm leaves/par** | **400** | **400** |
| position uncleared % | 50 (identically 0) | 50 (identically 0) |
| **chord 10 µm LEPP leaves/par** | ~9,700 | **800** |
| chord 10 µm RED leaves/par | ~7,500 | ~13,400 |
| **1° angle leaves/par** | **3,200** | **1,600** |
| lev0 over-bar chord AREA % | 3,200 | **50** |
| chord 10 µm LEPP **uncleared %** | ~55,000 | ~8,500,000 |
| chord 10 µm RED **uncleared %** | ~497,000 | ~793,000 |
| 1° angle **uncleared %** | ~44,000 | ~22,900 |
| **cone/lepp ratio (H1)** | ~25,000 | ~22,000 |
| **UNSCOPED cap-16 LEPP leaves/par** | **~108,000** | – |
| UNSCOPED cap-16 LEPP uncleared % | ~177,000 | – |

**READ THREE THINGS OFF THIS TABLE.**
1. **`leaves/parent` and `uncleared %` differ by 1–3 ORDERS OF MAGNITUDE in required N.** Conflating
   them is the same error the campaign already made. A run can be perfectly adequate for its multiplier
   and useless for its residual — **which is exactly the shape of the 6.67×/0.000% anchor.**
2. **The affordable ones are affordable.** N=3,200 on the refine tool is ~2 min; N=108,000 on the
   `lepp,red` ladder config is ~17 min at the measured 108 parents/s. ***±10% bands on the multipliers
   were never out of reach — they were simply never spent.***
3. **A ±10% band on an `uncleared %` is unreachable** at ≤10⁵ parents for every style/operator measured.
   Do not try; state it as a band (`≤0.74% at 95%`) or as a censored bound, never as `0.000%`.

---

## 7. B4 — VARIANCE REDUCTION: CONFIRMED AT 3.4–8.6×, ON THE LEVEL-0 *SCORE*, NOT ON SHAPE

> **KILL: < 2× effective-sample-size gain ⇒ not worth the complexity.**

8 quantile strata, boundaries **and** σ_h fit on the EVEN blocks, variance **evaluated on the ODD
blocks** (no in-sample optimism). Neyman allocation from the train-fitted σ. Both the analytic design
effect **and** a 4,000-draw empirical resample are reported; they agree.

| target quantity | best covariate | rA evals/facet to deploy | **EMPIRICAL ESS gain** | stratified N=400 ≡ unstratified N= |
|---|---|---|---|---|
| Gothic position 10 µm | `c0` lev0 chord | 225 | **8.60×** | **3,438** |
| Gothic chord LEPP leaves | `c0` lev0 chord | 225 | 3.43× | 1,371 |
| Gothic chord LEPP uncleared | `sl` chart slope | 5 | 3.91× | 1,566 |
| Gothic 1° angle leaves | `g0` lev0 sup angle | 225 | **5.69×** | **2,275** |
| Gothic 1° angle uncleared | `g0` lev0 sup angle | 225 | 5.64× | 2,256 |
| Gothic cone/lepp (H1) | `c0` lev0 chord | 225 | 5.30× | 2,122 |
| Voronoi position 10 µm | `g0` lev0 sup angle | 225 | **8.26×** | **3,304** |
| Voronoi chord LEPP leaves | `c0` lev0 chord | 225 | **6.59×** | **2,636** |
| Voronoi chord LEPP uncleared | `c0` lev0 chord | 225 | 6.62× | 2,649 |
| Voronoi chord RED leaves | `c0` lev0 chord | 225 | **7.51×** | **3,006** |
| Voronoi 1° angle leaves | `g0` lev0 sup angle | 225 | **7.53×** | **3,011** |
| Voronoi 1° angle uncleared | `g0` lev0 sup angle | 225 | 6.67× | 2,670 |

**AND THE NEGATIVE RESULT MATTERS AS MUCH AS THE POSITIVE ONE.** Every **free** STL-only covariate is
below or barely above the kill line: `qs` shape index **1.00–1.76×** (5.0× only on the *cone* pool),
`dm` diam 0.57–1.90×, `mn` lev0 minAngle 0.45–2.06×, `a0` area 0.36–1.39×. **Proportional allocation is
worth nothing anywhere (1.00–1.36×) — the entire gain is in the ALLOCATION, not the binning.**

> ### THE PREDICTOR OF THE TAIL IS THE LEVEL-0 SCORE ITSELF, NOT THE FACET'S SHAPE.
> This contradicts the natural reading of §0h/§0i.6 ("refinability is a property of shape"). Shape
> *decides* refinability — but for **predicting how many leaves a parent will consume**, the level-0
> covering chord `c0` and level-0 sup angle `g0` dominate `q` by 3–5×. Both are one level-0 scoring pass
> the tools already run for every parent (225 rA evals: 45 lattice points × 5).

**HOW TO DEPLOY IT WITHOUT A WHOLE-MESH PASS (two-phase, standard):** score level-0 only on a cheap
pre-sample (~50,000 parents) to estimate the stratum weights `W_h` and σ_h, then draw the *expensive*
refinement sample with Neyman allocation across those strata and combine as `Σ_h W_h·ȳ_h`. A level-0
score is **one** of the ~150–350 node-scores a full refinement of the same parent costs (derived from
the operators' printed leaves/parent — **not separately timed**, so treat the ~1/200 pre-sample cost as
an estimate, not a measurement). **Net: a banded N=400 that is worth an unbiased N≈2,100–3,400.**

⚠ **One honest caveat:** Neyman allocation is optimised for **one** target quantity. `c0` wins for
chord/position targets and `g0` for angle targets; a single design serving both loses ~30%. Pick the
covariate from the bar you are reporting.

---

## 8. THE ONE-LINE RULE

> ### ***NEVER QUOTE A REFINEMENT MULTIPLIER FROM ONE GOLDEN-STRIDE SAMPLE: RUN `N × 8` PARENTS, CUT THE SEQUENCE INTO 8 DISJOINT BLOCKS BY `floor(q/N)`, AND REPORT `x [min … max] @ N` — AND NEVER QUOTE AN `uncleared %` AS A NUMBER AT ALL, ONLY AS ITS 95% BAND.***

Corollaries, in priority order:
1. **N=400 pins a position multiplier; N=3,200 pins a 1° angle multiplier; no affordable N pins an
   `uncleared %`.**
2. **A wide band means the operator did not converge** — read it as a diagnostic, not as noise.
3. **Never use a bootstrap CI on an `uncleared %` or on a ratio involving an uncapped operator**
   (measured coverage 3–65% against nominal 95%). Use disjoint phase blocks.
4. **For a paired operator comparison, band the PAIRED per-parent difference**, not the two multipliers
   separately — it is ~3× sharper on the same data (H1: [1.512, 1.780] paired vs [1.269, 2.913]
   unpaired).
5. **If a band is too wide to afford**, stratify Neyman on the **level-0 covering chord** (chord/position
   bars) or the **level-0 sup angle** (angle bars) — measured 3.4–8.6× ESS, i.e. ~1/6 the N.

---

## 9. WHAT I DID **NOT** MEASURE, AND WHAT I GOT WRONG

**NOT MEASURED — state these limits when citing this file:**
* **No whole-mesh census.** Every "POOL" value is 32,000–59,319 parents = **2.8%–10.5%** of the mesh, not
  a census. The pool's own population CI is ±1.1% (Voronoi lepp) to ±11.9% (Voronoi cone). **The pool is
  the reference for the BANDS, not a certified population value**, and it is itself a systematic sample
  from `q ∈ [0, NTOT)`.
* **Only two styles and one artefact each.** Gothic S39CTL and Voronoi S94CTL. Nothing here licenses a
  band for LowPoly, GeoStar, or any of the other 17.
* **No render.** This task is sampling statistics on triangle-count economics; there is no fidelity
  image to produce and I did not fabricate one. Both pools' vertex-on-surface controls hold
  (`2.074e-2 µm` Gothic, `1.521e-2 µm` Voronoi).
* **The 0.5° and 10°/5° angle bars were not banded** — the pool runs use `PF_BD_ANGBARS=1` for
  throughput. The trimming is proven a no-op on the retained columns, but those three bars have **no
  band** and should not be quoted as banded.
* **`turn` was not banded** (`PF_BD_TURN=0` in the pools). Same status.
* **Conformity is ignored, as in every parent tool.** Every count is a lower bound; only ratios are
  claimed. The bands are bands on the *lower bound*.
* **Partial cross-ruler arm only.** I measured the *point-value* delta between the legacy
  `f_xy·centroid_xy` sign and `5698d023` on **five** ladder samples (0.13–0.62%, §2). I did **not**
  measure whether the *BANDS* differ between conventions, and `s105BandsRefine` (legacy) and
  `s105BandsCone` (`5698d023`) are never mixed in one table. Over-bar shares are not invariant between
  the conventions (§0i.5), so a banded cross-ruler comparison remains open.
* **The `1/√N` extrapolations in §6** are extrapolations. Under a heavy tail the CLT rate can be
  approached slowly; the `~55,000` and `~8.5M` figures are order-of-magnitude only. The **measured**
  rows (400 / 800 / 1,600 / 3,200) are not.

**WHAT I GOT WRONG MID-TASK AND CORRECTED:**
1. **My resume logic was broken and would have silently duplicated thousands of rows.** I wrote
   `QSTART = lineCount − 1`, which is only correct if every sequence index produces a record. The cone
   tool's scope filter drops ~52% of parents, so resuming the Gothic cone pool at 40,000 would have
   restarted at 19,810 and re-walked 20,190 indices, **appending duplicates that would have silently
   doubled the weight of one phase block.** Caught before extending the pool, by reading the resume
   line. Fixed in **both** tools to parse the last record's `q`. Verified: the extension printed
   `last sequence index 39999, restarting at 40000`.
2. **My B3 table printed a required-N from an R=2 standard deviation.** The first draft read "red
   leaves/par: N for ±10% = 8000" off two blocks. An SD from 2 numbers is not an SD. Now refuses to
   print any row with R < 6, and the extrapolation requires R ≥ 10.
3. **I initially used `mean ± 1.96·SD` as the H1 verdict interval, and it FIRES the kill.** On a
   right-skewed positive ratio that interval reaches 0.722 — a value absent from 240 independent draws.
   Corrected to the pre-registered empirical band (plus a log-space and a paired arm, all printed).
   **This is the single most important methodological lesson in the file: the band construction is
   itself a decision that can flip a verdict, and on these statistics the default choice is wrong.**
4. **I dropped four `log()` comment lines when copying each parent tool**, which made the first fidelity
   diffs non-empty on text. Restored so the diffs are empty except my own FIDELITY line.

**WHERE MY OWN BRIEF WAS WRONG (said, per instructions, rather than defended):**
* The brief frames the debt as "a confidence band would have caught this before the campaign committed
  to it." **For the position row that is false** — 1.02×/1.03× is a ±4.3% number and needed no band.
  The debt is **not uniform across the campaign's figures**; it is concentrated in (a) unscoped/non-
  converging operators and (b) every `uncleared %`.
* The brief's suggested B4 covariates lead with the shape index `q`. **`q` is one of the weakest
  covariates measured (1.00–1.76× on the refine pools).** The winner is the level-0 covering score.
* The brief expects the naive bootstrap to be unreliable "under heavy tails." Confirmed — **but it is
  fine (75–100% coverage) wherever the operator's leaf count is CAPPED.** The failure is conditional and
  the condition is nameable, which makes it a usable rule rather than a blanket prohibition.
* §0i.1's "IT IS NOT EVEN A SAMPLE-SIZE EFFECT. IT IS ONE FACET." is half right. It **is** one facet,
  and it is **also** an ordinary sample-size effect: the same N=600 at a different phase spans
  4.015–33.555. The two readings are not alternatives.

---

## 10. RECOMMENDATION

1. **Amend §0i.1** with §2's table. The published ladder is one distribution sampled five times; the
   pool value is **11.973× at 26.121% uncleared**; and **70% of N=150 draws report 0.000% uncleared on
   it.** Retire the ladder as evidence of a threshold.
2. **Amend §7.1** to `x [min…max] @ N=2000, R=16` using §3. Mark the **position row as SOLID (±4.3% /
   ±4.4%)** and the two `uncleared %` columns as **BAND-ONLY**.
3. **Correct Voronoi `red` from "16.09× / 0.00%" to "18.68× / 3.600%"** and re-check any §0g claim that
   leaned on that 0.00%.
4. **Re-state §0i.3 H1 as `1.646× [1.512, 1.780]` (Gothic) and `2.358× [2.093, 2.622]` (Voronoi)** — the
   refutation is stronger than published, not weaker.
5. **Amend §0i.2's rule** to a stated tolerance on the uncleared band (§4.4). "0.000%" is not verifiable
   at any affordable N.
6. **Adopt §8's one-line rule in the LAB-CHEATSHEET**, and adopt the level-0-score Neyman stratifier
   (§7) as the standard sampling design for the next arm — it makes every future multiplier both ~6×
   cheaper and banded.
