# S94 CONE — DOES A CONE-DRIVEN SIZING FIELD BEAT LEPP?

**Agent: CONE.** Tools: `research/tools/s94ConeField.ts` (analytic frontier from the S93 census),
`s94ConeRefine.ts` (the MEASURED operator head-to-head), `s94ConeRemesh.ts` (the `M = g/h²` remesh),
+ their `run-s94-*.sh`. Reports: `research/exchange/_strataConformBisect/frontier/S94_*.report.txt`.

Everything is measured with the covering orientation ruler construction (`orientRuler.orientOfFacet`,
k=8, inset 0.02, sup over an order-k barycentric lattice, central-difference surface normals),
reimplemented inline for speed. **No centroid samples anywhere.** Two reproduction controls tie the
inline sampler to the published instruments, both bit-exact on the identical golden-stride samples:
`red` adaptive 1→4 reads **8.340×** at N=150 (S93 `FR_REF_BISMOKE` 8.34×) and **9.721×** at N=2000
(S93 `FR_REF_GOTH` 9.72×); `lepp` reads **6.673×** at N=150 (S93's published 6.67×).

---

## PRE-REGISTERED, BEFORE THE FIRST RUN

    H1  an IDEAL cone-driven isotropic sizing field clears GothicArches' 10 um orientation CHORD bar at
        FEWER triangles than plain LEPP's measured 6.67x.
        KILL: ideal count-weighted multiplier >= 6.67x  =>  no implementation can beat LEPP.
        (as an OPERATOR: KILL if cone leaves/parent >= lepp leaves/parent on the SAME parents)
    H2  a cone-driven field brings over-1-degree AREA below 5% at <= 12x the flag-OFF triangle count.
        KILL: > 12x, OR the 5% area target is not reached.
    H3  the III = dN^T dN anisotropy buys a further >= 1.5x at an aspect-ratio cap of 5.
        KILL: < 1.5x at AR cap 5.
    H4 (added after H1 was refuted, pre-registered before its first run)
        a REMESH under `M = g/h3D^2` reaches the chord bar at FEWER triangles than the best refinement
        operator, same ruler, same surface.  KILL: >= lepp's count at equal residual over-bar AREA.
    SHAPE GUARD: if an arm's leaf minAngle is worse than LEPP's, the win is paid in slivers => not a win.
    SCOPE: SMOOTH-RELIEF class only (GothicArches). Near-vertical-wall is a parallel agent's.

**WHY THIS IS NOT S93'S REFUTED ANISOTROPIC BISECTION.** That arm was a BISECTION RULE — a greedy
per-step choice of which edge to cut, no shape control, no target size; it degenerated into needles
(leaf minAngle 2.9°, worst 0.00°, 41.5% uncleared, 2.76× worse than LEPP). This arm never chooses an
edge: it names a TARGET SIZE from the local normal cone and splits the footprint UNIFORMLY, so every
child is SIMILAR to its parent and shape is invariant by construction. **Measured: the cone arm's leaf
minAngle is 34.6° mean / 1.25° worst — identical to `red`, and its worst equals LEPP's. Guard passes;
the refutation below is on COUNT, not on shape.**

---

## 0. THE ONE PARAGRAPH

***THE 6.67× ANCHOR THE WHOLE ARM WAS POINTED AT IS A 150-PARENT SAMPLING ARTEFACT, AND ONCE IT IS
RE-MEASURED, H1 IS REFUTED THE OTHER WAY: A CONE-DRIVEN FIELD IS 1.28–1.44× WORSE THAN PLAIN LEPP.***
At N=2000 on the same STL and the same ruler, LEPP reads **10.822× and does not clear** (28.8%
uncleared, 0.33% of leaf area still over bar); at N=2000 scoped to the SMOOTH-RELIEF class the brief
names (slope ≤ 1.0, non-folded — 48.25% of facets, ~85% of area) it reads **3.120× and clears
perfectly**. The published 6.67× is neither: it is the two classes averaged at a sample size that
contained none of the tail. Against 3.120×, every cone-driven subdivision operator I built is worse —
`cone` 4.211× (1.350×), `coneOracle` 3.981× (1.276×), `coneFloor` 4.479× (1.435×) — all at 0.000%
uncleared. **The mechanism is printed, not guessed:** the cone is not better information than the
measured chord LEPP already stops on, and a k-way split imposes the parent's worst-case k on all k²
children at once, so it loses the granularity race to bisection, which is already the finest a
subdivision operator can be. ***What IS real is a 1.93× prize that no subdivision operator can reach:***
measured on LEPP's own leaves, a free-placement mesher would certify **the same geometry** at **1.615
leaves/parent instead of 3.120**. That is the difference between HALVING what exists and GENERATING an
element at the admissible size — and it is what this repo's unwired `M = g/h²` kernel does. **H2 is
REFUTED on its own kill line:** the fractional-knapsack optimum of ANY isotropic field needs **18.3×**
to bring over-1° AREA to 5%, against a 12× kill. **H3 is CONFIRMED (1.89× at AR ≤ 5 on the chord bar).**

---

## 1. *** THE ANCHOR IS BROKEN. *** (the number the arm turned on)

`frontierRefine.ts`'s `lepp` arm was only ever run at **N=150** (`FR_REF_BISMOKE`); the N=1500/2000
runs (`FR_REF_GOTH`, `FR_REF_GOTH2`) have no `lepp` column at all. Re-measured with a character-identical
bisection (same longest-3D-edge choice, same parameter midpoint, same lift), same STL, same golden
stride, same covering ruler:

| GothicArches S39CTL, 10 µm chord bar | leaves/par | uncleared | over-bar leaf AREA | worst leaf minAngle |
|---|---|---|---|---|
| **lepp, N=150** (the published anchor) | **6.673×** | 0.000% | 0.0000% | 2.52° |
| **lepp, N=2000, depth cap 16** (= `frontierRefine`'s own `2*MAXLEV`) | **10.822×** | **28.844%** | **0.3319%** | **0.00°** |
| **lepp, N=2000, depth cap 24** | **116.889×** | **32.237%** | **2.0996%** | **0.00°** |
| **lepp, N=2000, SCOPED to smooth-relief** | **3.120×** | 0.000% | 0.0000% | 1.25° |

***MORE DEPTH MAKES LEPP WORSE ON BOTH AXES — it does not converge on the unscoped mesh.*** And the
tail is NAMED rather than inferred. The 12 parents with the most `lepp` leaves, printed with their
level-0 geometry:

    leaves  lev0 chord um  lev0 angle deg  lev0 diam mm  lev0 minAngle  slope
      7139         402.28         115.707        0.2376           2.78  7.735
      4010         456.09          88.714        0.3262           3.68  6.489
       683         173.00          15.794        0.6296          34.84  6.212
       598         982.27         140.596        0.5217          34.83  5.867
       ... every one of the 12 has slope 2.28-7.74; ALL parents' median slope is ~0.11

***ALL TWELVE ARE NEAR-VERTICAL-WALL FACETS AND NINE ARE ALREADY BACK-FACING (level-0 angle > 90°).***
That is S93 §0f.5's NEAR-VERTICAL-WALL class — the class the brief explicitly scopes OUT as
representation-not-density — living inside the smooth-relief exemplar. The worst 1% of parents hold
**74.92%** of all `lepp` leaves (and 60.03% of `red`'s). **A mean over that distribution is not a
measurement, and 6.67× was one taken before the tail was sampled.**

## 2. H1 — REFUTED AS AN OPERATOR, ON THE SCOPE THE BRIEF NAMES

`s94ConeRefine.ts`, GothicArches S39CTL, N=2000 golden-stride, scoped `PF_S94R_SKIPFOLD=1
PF_S94R_MAXSLOPE=1.0` → 965 parents retained (48.25% by count; the excluded slope>1 buckets are
~15% of AREA by the S93 census). Depth cap = `frontierRefine`'s own. Conformity ignored for ALL
operators equally.

| operator | leaves/par | uncleared | over-bar leaf AREA | over-1° leaf AREA | leaf minAngle mean/worst | vs lepp |
|---|---|---|---|---|---|---|
| **lepp** longest-edge bisection | **3.120×** | 0.000% | 0.0000% | 8.427% | 37.6 / 1.25 | 1.000 |
| **coneOracle** k-way from the measured chord | 3.981× | 0.000% | 0.0000% | 7.952% | 34.6 / 1.25 | **1.276×** |
| **cone** k-way from `coneUB` | 4.211× | 0.000% | 0.0000% | 7.915% | 34.6 / 1.25 | **1.350×** |
| **coneFloor** k-way, floor() instead of ceil() | 4.479× | 0.000% | 0.0000% | 7.690% | 34.6 / 1.25 | **1.435×** |
| **red** 1→4 | 4.420× | 0.000% | 0.0000% | 7.711% | 34.6 / 1.25 | 1.416× |
| leppCone (bisect, cone STOP test) | 2.621× | **15.9%** | **14.07%** | 11.380% | 37.0 / 1.25 | *does not meet the bar* |

**H1 KILL LINE HIT: `cone` leaves/parent ≥ `lepp` leaves/parent on the same parents. REFUTED.**

**MECHANISM, and it is why no tuning rescues it.** (i) LEPP stops on the node's **measured** sup chord;
`coneUB` is a *model* of that quantity (census `nd/coneUB` area-wt p50 1.142, p75 1.420, p99 2.033), so
the cone strictly loses information — and `coneOracle`, which uses the measured chord with the same
k-way split, is *still* 1.276× worse, which isolates the loss to the SPLIT, not the driver. (ii) A
k-way split applies the parent's worst-case k to all k² children simultaneously; bisection re-tests
after every doubling. Bisection's factor-2 granularity is already the finest a subdivision operator can
have, so **there is no granularity headroom for a field to win back inside a refinement framework.**
(iii) `leppCone` shows the cone as a *stop test* is unsound: it stops 15.9% of leaves above the bar and
leaves 14.07% of leaf area over — the cone under-predicts the achieved angle by exactly its p50 1.142.

## 3. THE PRIZE THAT IS REAL, AND IT IS A **REMESH** PRIZE (1.93×)

Two independently-constructed estimates of what FREE PLACEMENT would cost, both in the count currency:

* **Per-leaf (measured).** For each leaf the operator emitted, its own covering-ruler chord `c` is
  measured; the largest admissible element covering it is `s = (bar/c)^(1/p)` times its linear size with
  `p = 1.717` **measured** from S93's uniform sweep (mean chord ratio 0.2953/0.3063/0.3108 per level —
  the model's 2.000 would over-state the prize by ~1.2×, so the measurement is used). Summing
  `(c/bar)^(2/p)` gives the count a free-placement mesher needs for **the same geometry**:
  **lepp 3.120 → 1.615 leaves/par = 1.93×**; unscoped `lepp` 10.822 → 6.800 = 1.59×.
* **Per-parent (analytic, `s94ConeField.ts` on the 60,000-facet S93 census).** ORACLE-driven ideal
  isotropic field, count currency, measured exponent: **2.798×** of flag-OFF; cone-driven **2.091×**
  (optimistic — the cone under-predicts), cone × the p50 safety 1.142 **2.367×**, × the p75 1.420
  **2.949×**. Non-vacuity: the file reproduces the census's 61.08% / 43.220% / 88.33% headline exactly.

***THE GRANULARITY WASTE IS THE FINDING: lepp 1.93×, cone 2.41×, red 2.55× (scoped). It is not a tuning
loss; it is the structural cost of halving what exists instead of generating what is admissible.***

**MODEL CALIBRATION, stated because the analytic column is a model.** Predicting S93's measured uniform
sweep from the census: level-1 over-bar AREA predicted 8.265% vs **measured 8.934%** (8% off — good);
level-2 predicted 0.376% vs **measured 1.012% (66% off)**. The divergence is at deep levels only and is
the crease/fold residual (S93: 0.39% + 0.57% of over-bar area) which never clears. **The per-leaf slack
measurement above is the quotable one**; the per-parent analytic agrees with it to 4% at level 0
(2.917 vs 2.798 on the same N=150 sample) and is quoted only as a corroboration.

## 4. H2 — REFUTED ON ITS OWN KILL LINE (over-1° AREA < 5% at ≤ 12×)

The kill line is an AREA SHARE, so the right instrument is the fractional-knapsack optimum: clearing
facet *i* costs `(θᵢ/θ*)^(2/p) − 1` extra triangles and removes `Aᵢ` from the over-bar area; the greedy
order by `Aᵢ/Δtriᵢ` is the exact optimum of the fractional relaxation. **No isotropic sizing field can
be left of this curve.** GothicArches, ORACLE driver (the cheapest correct allocation), measured
angle exponent `p_ang = 0.654` (S93 measured 0.635×/level for three levels; the model's 1.000 would
under-price it 135×):

| target over-1° AREA | 20% | 15% | 10% | 7.5% | **5%** | 3% | 1% |
|---|---|---|---|---|---|---|---|
| × flag-OFF triangles | 1.08× | 1.45× | 3.47× | 7.43× | **18.33×** | 40.86× | 121.98× |

**18.33× against a 12× kill. H2 REFUTED.** At 12× the best any isotropic field can do is ~5.9% over-1°
area. Anisotropy at AR ≤ 5 divides the *full-clearance* angle cost by 3.8× (3028× → 791×) — still far
over. **The 1° angular bar is not reachable at a 12× budget by density, isotropic or anisotropic.**
For context from the same instrument: at the industry-practical 5° bar Gothic is only 6.43% over by
area to begin with, and the chord bar is met at ~3×.

## 5. H3 — CONFIRMED (anisotropy is worth 1.89× on the chord bar), as a REMESH lever only

`s94ConeField.ts`, count currency, cone driver, measured exponent, saving = `min(ARcap, kapA/kapB)`
(uncapped is a division artefact — census `kapB` p05 underflows to 0.00000 and is NOT quoted):

    CHORD 10um:  AR<=1 2.091x   AR<=2 1.381x   AR<=3 1.209x   AR<=5 1.107x   AR<=10 1.058x   AR<=20 1.046x
                 => AR<=5 is 1.89x better than isotropic. PRE-REGISTERED >= 1.5x: CONFIRMED.
    ANGLE 1deg:  AR<=1 3028x    AR<=2 1571x    AR<=3 1124x    AR<=5  791x     AR<=10  575x    AR<=20  497x

**This prices a REMESH under an anisotropic metric. It does NOT price subdividing the existing facets**,
whose long axes are misaligned with the slow direction by area-wt p50 28.43° — a subdivision operator
captures only the part of the anisotropy its parents already happen to be aligned with. Consistent with
§2: anisotropy, like sizing, is a generation lever, not a refinement lever.

---

*(§6 the `M = g/h²` remesh measurement and §7 the angle-stop sweep are appended as those units land)*
