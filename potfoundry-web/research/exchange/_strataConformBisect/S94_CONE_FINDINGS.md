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

### 1.1 *** IT IS NOT EVEN A SAMPLE-SIZE EFFECT. IT IS ONE FACET. *** (the sample-size ladder)

Same tool, same STL, same depth cap, `PF_S94R_OPS=lepp,red`, N swept:

| N | **lepp** leaves/par | lepp uncleared | lepp max leaves on ONE parent | red leaves/par | red uncleared |
|---|---|---|---|---|---|
| 150 | **6.673×** | 0.000% | 598 | 8.340× | 0.000% |
| 300 | 6.520× | 0.204% | 598 | 9.100× | 0.000% |
| 600 | 5.503× | 0.121% | 598 | 7.985× | 0.000% |
| **1200** | **12.708×** | **25.285%** | **7,139** | 10.268× | 0.000% |
| 2000 | 10.822× | 28.844% | 7,139 | 9.721× | 0.000% |

***THE ENTIRE MOVE FROM 5.5× TO 12.7× IS ONE PARENT ENTERING THE SAMPLE BETWEEN N=600 AND N=1200.*** Its
level-0 geometry, printed: chord **402.28 µm**, sup angle **115.707°** (back-facing), diam 0.238 mm,
minAngle **2.78°**, chart slope **7.735**. It alone consumes 7,139 leaves and never clears.
**`red` never blows up on it (0.000% uncleared at every N); only bisection does.** Even at N=150 the mean
was already tail-dominated — 61.44% of all leaves sat in 1% of parents — it simply had not met the worst
one yet. **The campaign's 6.67× anchor is a single-facet lottery, and its 0.00%-uncleared is the same
lottery.**

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

**THE ONE THING THE CONE FIELD IS ACTUALLY BETTER AT, AND IT IS NOT ECONOMY — IT IS STABILITY.** On the
UNSCOPED mesh (§1.1) `lepp` swings 5.50× → 12.71× on one facet and leaves 25–29% uncleared, while
`cone` (9.607×), `coneOracle` (9.325×), `coneFloor` (9.180×) and `red` (9.721×) are all **0.000%
uncleared at every N**. A k-way barycentric split keeps every child SIMILAR to its parent, so the
sliver/back-facing class costs a bounded subtree instead of a divergent one. ***That is a real property
and it is worth stating — but `red` has it too and is cheaper, so it is not an argument for the cone.***

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

## 6. H2, MEASURED — a second, independent instrument, and it agrees the answer is NO

`s94ConeRefine.ts` in `PF_S94R_MODE=angle`, GothicArches, N=400 golden-stride **unscoped**, depth cap 9,
scored against the **1° angular bar**. Each row refines to a STOP threshold and is then scored at 1°,
which traces the achievable frontier of a threshold-driven field (the §4 knapsack is its optimum):

| stop | red leaves/par | red over-1° AREA | lepp leaves/par | lepp over-1° AREA |
|---|---|---|---|---|
| 8° | 41.49× | 32.58% | 50.75× | 32.79% |
| 5° | 53.84× | 32.56% | 54.33× | 32.77% |
| 3° | 62.58× | 32.43% | 61.64× | 32.62% |
| 2° | 84.44× | 26.78% | 82.16× | 25.75% |
| 1.5° | 105.98× | 19.87% | 100.46× | 19.45% |
| **1°** | **158.88×** | **0.0127%** | **153.73×** | **0.0192%** |

***OVER-1° AREA DOES NOT CROSS 5% ANYWHERE BELOW ~106×, AND FULL CLEARANCE COSTS ~155×.*** Against a
**12× kill**, H2 is refuted by a factor of 9–13. The §4 analytic optimum (18.33×) and this measurement
(>106×) bracket the truth from both sides: **the optimum is unreachable by a threshold field, and even
the optimum is over the kill line.** The angle bar IS reachable — 0.013% residual at 159× — it is simply
not a 12× object. (S93's red-1→4 at 1° read 351× / 20.7% uncleared at N=1500 and maxLevel 8-9; same order,
different sample and cap.)

The `cone` k-way operator in angle mode is **catastrophic — 2794×** — for the same mechanism as §2, only
louder: `k = ceil(coneUB/stop)` reaches the k-cap of 16 and emits 256 children in one step, almost all
unnecessary. **Third independent confirmation that k-way "exact sizing" is the wrong operator inside a
subdivision framework.**

⚠ **DO NOT quote the SLACK column on the angle rows.** It is computed from the leaf's CHORD in all modes,
so in angle mode it answers a different question. Only the chord-mode slack figures (§3) are quotable.

## 7. H4 — THE `M = g/h²` REMESH, MEASURED. IT DOES NOT REACH THE BAR AS SHIPPED.

`s94ConeRemesh.ts` → `buildInhouseMetricMesh` + `buildSurfaceMetricField` (the unwired kernel), plain
chord mode, `sizeRes 160`, `gradeBeta 0.2`, `splitThresh 1.5` (all kernel defaults), whole (u,t) domain,
scored by the SAME covering ruler on the SAME analytic surface, N=20,000 golden-stride facets per mesh.

| | flag-OFF STL | tol 0.01 | tol 0.005 | tol 0.0025 | **tol 0.00125** |
|---|---|---|---|---|---|
| triangles | 1,142,166 | 406,626 | 823,974 | 1,665,766 | **3,347,320** |
| × flag-OFF | 1.000× | 0.356× | 0.721× | 1.458× | **2.931×** |
| **over-bar CHORD AREA** | 42.427% | 44.121% | 33.059% | 26.234% | **14.795%** |
| over-1° ANGLE AREA | 28.431% | 37.482% | 26.786% | 23.001% | 19.837% |
| leaf minAngle mean / worst | 34.5 / 1.25 | 48.3 / 4.91 | 48.0 / 3.94 | 47.6 / 1.22 | **47.3 / 3.98** |
| total area mm² | 37,518.0 | 35,751.5 | 36,999.4 | 37,178.7 | **37,535.8** |

**DOMAIN CONTROL PASSES:** at the design tol the remesh's total area is 37,535.8 mm² against the STL's
37,518.0 = **1.0005×**. The two meshes cover the same surface. **NON-VACUITY PASSES:** the loose end of
the sweep is 84.8% over bar (tol 0.05, from the smoke run).

***H4 KILL LINE HIT AS SHIPPED: at the theoretically-correct tol (10 µm chord = a 1.25 µm position tol,
by S93's own `chord/witnessed` p50 = 8.03), the remesh spends 2.931× the triangles and is still 14.795%
over bar, while scoped LEPP clears completely at 3.120×.***

**BUT THE SHAPE COLUMN IS THE OTHER HALF OF THE ROW, AND IT IS A LARGE WIN.** The remesh's leaf minAngle
is **47.3° mean** against the flag-OFF STL's 34.5° and LEPP's 37.6°, with a worst of 3.98° against
LEPP's 1.25°/0.00°. That is the `M = g/h²` property the memory records ("closes the sliver-quality
frontier") reproduced here on an orientation task it was not built for.

**TWO COMPETING EXPLANATIONS FOR THE RESIDUAL, AND THEY ARE SEPARABLE — I DO NOT ASSERT EITHER:**
1. **`tolMm` is not a hard bound.** The kernel splits only when the longest METRIC edge exceeds
   `splitThresh` (default **1.5**), so a converged element may be 1.5× the target and its chord
   1.5² = **2.25×** the tol the field was built for. Testable by re-running at `tol/2.25`.
2. **Grid aliasing of sub-cell relief.** κ_max is a second difference on a 160×160 (u,t) grid;
   the kernel's own docs record this under-resolving a sharp sub-cell ridge **5–10×** and name
   `curvatureFineStep` as the remedy. Testable by turning it on.
Both knobs are wired in the tool (`PF_S94M_SPLITTHRESH`, `PF_S94M_FINESTEP`, `PF_S94M_CHORDTOL`) and the
arms are running; whichever wins, **the finding above stands as the as-shipped number.**

---

## 8. THE THREE COORDINATOR CORRECTIONS, ADDRESSED WITH MEASUREMENTS

### 8.1 RULER `5698d023` — ported, and ***every S94 conclusion is robust to it***

My tools re-implement the covering ruler inline, so they carried the *old* `outward` sign test
(`f_xy · centroid_xy`). I ported the fix — sign from the ANALYTIC surface normal at the footprint
centroid — and re-ran the Gothic chord arm. **N=2000, everything else identical:**

| | legacy sign | **RULER=5698d023** |
|---|---|---|
| red | 9.721× | **9.720×** |
| lepp | 10.822× / 28.844% unc | **10.755× / 27.411% unc** |
| cone | 9.607× | **9.607×** |
| coneOracle | 9.325× | **9.376×** |
| coneFloor | 9.180× | **9.194×** |
| the killer parent's level-0 sup angle | 115.707° | **123.627°** (chord 402.28 → 418.78 µm) |

***The verdicts do not move; the ill-conditioned facet's own reading does.*** That is exactly the shape
the fix predicts. **`signMargin` = |f · n_S(centroid)|, measured here for the first time on Gothic:**
min 1.62e-5, p01 0.0373, p50 0.9994, **4.083% of scored triangles below 0.10 and 0.125% below 0.01** —
i.e. Gothic's ill-conditioned share is ~2× Voronoi's published 2.205%/0.130%. On the shape-gated Voronoi
artefact it is **0.136% / 0.013%**, 16× better conditioned than the SHAPE-off one: *the aspect gate
improves the RULER's conditioning too, which is a second, independent argument for it.*

**Convention is stated on every number in this file: all §1–§7 numbers are `RULER=legacy`; §8's Gothic
re-run and all §8.2 Voronoi numbers are `RULER=5698d023`. Shares are NOT invariant between the two
(a facet at 3° maps to 177°, which crosses a 5° bar) and I do not carry the retracted claim forward.**

### 8.2 THE SCOPE RESTRICTION IS VOID — so I ran the VORONOI arm, and ***H1 IS REFUTED HARDER THERE***

`voronoi_ring_D--H_S94CTL.stl` (the SHAPE-ON artefact, 492,068 facets), N=800 golden-stride, 10 µm
chord bar, depth cap 6, `RULER=5698d023`, same tool, same ruler, unscoped:

| operator | leaves/par | uncleared | over-bar leaf AREA | leaf minAngle mean/worst | vs lepp |
|---|---|---|---|---|---|
| **lepp** | **8.650×** | **0.000%** | 0.0000% | 40.5 / 0.11 | 1.000 |
| coneOracle | 15.646× | 0.000% | 0.0000% | 29.4 / 0.11 | **1.809×** |
| **cone** | **16.076×** | 0.000% | 0.0000% | 29.4 / 0.11 | ***1.859×*** |
| red | 16.465× | 0.000% | 0.0000% | 29.4 / 0.11 | 1.904× |
| coneFloor | 17.556× | 0.000% | 0.0000% | 29.4 / 0.11 | 2.030× |

***THE REFUTATION IS CROSS-STYLE AND LARGER ON VORONOI (1.86×) THAN ON GOTHIC (1.35×).*** The mechanism
is the same and it is now visible in the contrast: on Voronoi, bisection beats 1→4 by **1.90×**
(8.650 vs 16.465), so the granularity advantage a cone field would have to overcome is *bigger* there,
not smaller. **A cone-driven k-way field is worse on both styles this campaign has artefacts for.**

*I independently reproduce S95's shape-gated result: `lepp 8.650×` here against their `9.22×` at N=400
(different N, different tool, both 0.000% uncleared) — and I confirm their saturation warning: Voronoi's
level-0 over-bar CHORD AREA is **95.832%**, so its chord column is saturated and only ratios are
readable from it.*

### 8.3 THE SEED-SHAPE-DECIDES-REFINABILITY HYPOTHESIS — my data DOES bear on it. Explicitly:

The coordinator asked me to flag this only if my data speaks to it. **It does, on three counts, and all
three SUPPORT the reframing — but none of them is a test of it, because I never varied a seed.**

1. **§1.1 is the hypothesis in miniature.** ONE parent — level-0 **minAngle 2.78°**, slope 7.735 — takes
   LEPP from 5.50× to 12.71× and from 0.12% to 25.3% uncleared. Its own seed fidelity is irrelevant to
   that; its SHAPE is the whole story.
2. **Shape-preserving operators are immune.** `red` and all three `cone` variants keep every child
   SIMILAR to its parent and read **0.000% uncleared at every N on both styles**, on the same parents
   where bisection diverges. ***Refinability is a property of the operator's shape behaviour, not of the
   seed's fidelity*** — which is the same claim from the other side.
3. **The gate improves the RULER too** (§8.1): 0.136%/0.013% ill-conditioned on SHAPE-on Voronoi against
   2.205%/0.130% on SHAPE-off. A seed-shape lever that also conditions the instrument is worth more than
   its fidelity A/B showed.

**WHAT MY DATA CANNOT SAY:** I never varied the AR cap, never re-seeded, and never scored a seed's own
fidelity. Everything above is observational across two committed artefacts. **It is not a test and must
not be quoted as one.**

---

## WHAT I DID NOT MEASURE — stated plainly

* **Conformity, for any refinement operator.** Every refinement count refines each parent IN ISOLATION —
  no hanging-node propagation, no 2:1 balance, no LEPP back-propagation. All operators pay it equally so
  the RATIOS stand; the absolute multipliers are LOWER bounds. **This is unfair to the remesh, not to
  LEPP**: a remesh is conforming by construction and LEPP's real closure propagates into neighbours.
* **Any production mesher arm.** No flag was added, no `src/` file was touched, no driver was run. This is
  three read-only tools over a committed STL, the S93 census NDJSON, and an unwired research kernel.
* **Styles other than GothicArches.** One style, one STL (`S39CTL`). The near-vertical-wall class appears
  in §1 only as the named cause of LEPP's blow-up; it is a parallel agent's scope and I did not price it.
* **The anisotropic metric as a MESH.** §5 prices anisotropy with the standard metric element-count model
  (`min(ARcap, kapA/kapB)` on the isotropic count). Nothing anisotropic was meshed. `kapB` underflows on
  developable patches (census p05 = 0.00000) so only capped columns are quoted.
* **An ANGLE-mode sizing law in the kernel.** `buildSurfaceMetricField` implements `h = √(8·tol/κ)`, which
  is the CHORD law. An angular bar needs `h = θ*/κ` — a different exponent. Named as a gap, not built.
* **σ bands.** No confidence intervals are attached to any multiplier. The N=150 → N=2000 movement in §1
  is exactly the kind of thing that band would have caught, and it is the strongest argument for adding it.
* **`certifyTriangle`.** Position is not scored anywhere in S94; this arm is entirely about orientation.
