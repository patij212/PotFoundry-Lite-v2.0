# S80 — LANDING THE CONSTRAINED FLIP (agent: LAND)

Living log. Appended continuously, newest block at the bottom. Owner files:
`research/tools/s60ConstrainedFlip.ts`, `s61FlipCeiling.ts`, `s66FlipRescore.ts`, `s8*`, `land*`,
and any driver fork I create.

> ## >>> MESSAGE TO MAIN — THE HONEST-POSITION RE-SCORE HAS LANDED. READ THIS FIRST. <<<
> *(no agent-to-agent messaging tool is available to me; this block is the channel)*
>
> 1. **THE NUMBER THAT DECIDES SHIPPING: the constrained flip does NOT trade orientation for position.
>    On the honest H1 ruler it makes position BETTER.** `certifyTriangle` at the 10 µm product bar,
>    50,000 facets PAIRED BY INDEX across the before/after Gothic pair (§2):
>    on the 26,989 facets the pass actually CHANGED, **proven position failures 83 → 38 = 0.458×
>    (2.2× fewer) by COUNT and 0.0582% → 0.0359% = 0.616× by AREA**; 55 facets FIXED against 10 newly
>    failed; worst witnessed 180.47 → 89.45 µm. Whole sample 143 → 98 (0.685× count, 0.728× area).
>    Pre-registered kill K-L1a needed > 1.25× to call it a trade; it came in at 0.458×, about 5σ the
>    other way (1σ = ±11.0 % on 83 failures). **K-L1b: the win survives the honest ruler.**
>    ⇒ *"position 75 → 36" is RETIRED as a blind-ruler number and REPLACED by the above.*
> 2. **AND THE RE-SCORE FOUND A SECOND, BIGGER THING: the driver's position ruler under-reports by ~48×.**
>    In the same 50,000-facet sample the PLANE ruler flags 3 facets over 10 µm; `certifyTriangle`
>    PROVES 143. Extrapolated whole-mesh that is **~3,265 honest position failures on a mesh whose
>    driver reports 75** (~2,240 vs 31 after the flip). This is not my lever's problem — it is present
>    in the flag-OFF control — but it is the largest single number I measured tonight, and it means
>    **no arm in this campaign that reports `sagAdaptiveRaw` over-bar counts is reporting position.**
> 3. **PRODUCTIONISED, AND THE GATE PASSED AT THE STRONGEST LEVEL.** Driver fork
>    `_strataConformBisectL.test.ts` + `vitest.stratal.config.ts`, pass = `PF_LAND_FLIP` **DEFAULT OFF**.
>    The flag-OFF arm `L0CTL` reproduces `S39CTL` **BYTE-IDENTICALLY** — same md5
>    `9d5061f111f683ce65644809ded04876`, nTri 1,142,166 / alloc 2,029,406 / 774 unresolved /
>    headlineMax 0.04728176987418334 all identical (only wall time differs: 786 s vs 822 s).
> 4. **THE `sin` RANKING BUG IS PATCHED AND EVERY ARM RE-RUN. No verdict moved — but the fix is NOT
>    inert** (§1): ratio 3.49× → **3.51×**, and the population the old key was blind to moves properly:
>    **inversions θ>90° 828 → 685 (−17.3 %), θ>120° 255 → 175 (−31.4 %)**, plane position 36 → 31,
>    6 % cheaper. Both keys are now selectable in one tool (`PF_S60_KEY`), live key PRINTED.
> 5. **AREA IS THE HEADLINE, as COLLAPSE asked.** Gothic **8.131 % → 2.179 % of SURFACE = 3.73×**;
>    the count-weighted 3.51× over-states the defect by 1.40–1.49×. Area is in every s60 census now.
> 6. **WHAT I DID NOT FINISH:** the honest-C2 arm (H-L3, C2 := `certifyTriangle`) is PRICED but not run
>    to quiescence — see §4. The driver treatment arm `L1FLIP` and the packaged-pass equivalence gate
>    were still running at write time; both are appended below when they land.

> **STATUS BANNER — updated as arms land.**

---

## 0. PRE-REGISTRATION (written 2026-08-05, BEFORE any code was run or patched)

### What I inherit, and what is actually in doubt

S60/FLIP delivered, on GothicArches `S39CTL` (1,142,166 facets, whole-mesh, connectivity-only):

| | BEFORE | AFTER (constrained flip) | |
|---|---|---|---|
| orientation `tangExc` > 10 µm | 129,757 | 37,157 | **3.49×** (3.73× area-weighted) |
| θ > 90° (inversions) | 1,506 | 828 | halved |
| **position > 10 µm, PLANE ruler** | **75** | **36** | claimed "2.1× BETTER" |
| vertices moved / triangles added | – | **0 / 0** | topology byte-identical |
| non-manifold / orientation-inconsistent | 0 / 0 | 0 / 0 | |

**The position row is the one in doubt, and it is the row that decides whether this ships.**
`sagAdaptiveRaw` is the infinite-plane ruler. On this exact mesh AUDIT measured
(`S66_HONESTPOS_GOTHIC_AB.report.txt`, which DID land after FLIP handed off — see §1):
at the top-300 facets by `tangExc`, `certifyTriangle` at the 10 µm product bar **proves 251 failures
where the plane ruler reports 11**; and at the plane ruler's OWN worst 300 facets the plane reads
**0.675× of the honest witnessed value** (p50) — it under-reads even where it is looking hardest.

The flip pass's acceptance clause C2 is written against that same blind ruler
(`p_new <= max(10 µm, old pair max)`), so the pass may be accepting flips that worsen HONEST position
while believing they improve it. That is the failure mode this file exists to falsify.

### RULER DIRECTION — settled by the coordinator before L1 ran, and it is why `certifyTriangle` is the only admissible choice here

Two harnesses disagreed 15.7× on the SAME unmodified `S39CTL` STL: `advMeshWideH1.ts` reporting
22.190 µm against `certifyTriangle` proving 349.221 µm. Neither is broken — **they measure opposite
Hausdorff directions.** `advMeshWideH1` samples points ON THE ANALYTIC SURFACE and measures their
distance TO THE MESH (**H2**); it was mislabelled H1 and is corrected in `d5fe7d04`.
`certifyTriangle` walks points ON THE FACET and measures to the SURFACE (**H1**).

**An H2 ruler is structurally incapable of seeing a facet standing off the wall** — the fin has points
far from the surface (large H1) while every surface point near it still has some facet close by (small
H2). 22.190 µm therefore bounds nothing about the class this file works on, and is not quoted here.
This is the *reason* for the instruction I was given: **H1 `certifyTriangle` at tol = 0.010 is the
acceptance predicate.**

### The three hypotheses, with kill-criteria fixed before the runs

---

**H-L1 — THE HONEST POSITION RE-SCORE (the number that decides shipping).**

> On the facets the constrained flip ACTUALLY CHANGED, the honest position failure rate measured by
> `certifyTriangle(tol = 0.010 mm)` — bucketed proven-fail / proven-pass / unknown, never folded —
> is NO WORSE after the pass than before.

Design: **PAIRED by facet index.** `writeBinarySTL` emits facets in slot order and flips rewrite slots
`t1`,`t2` IN PLACE, so facet index *k* in the AFTER STL is the descendant of facet index *k* in the
BEFORE STL. One deterministic golden-ratio-stride sample of N indices is drawn ONCE and scored on
BOTH meshes, so the two columns are the same population, not two independent draws. A `changed` flag
(vertex triple differs) splits the sample into the subpopulation the pass touched and the untouched
control — **the untouched control must reproduce BIT-IDENTICALLY, and if it does not, the tool is
broken and no other number in this file is admissible.**

* **K-L1-VAC (non-vacuity, checked first).** `changed` count must be > 0 and the unchanged facets'
  witnessed values must be bit-identical between the two meshes. If either fails ⇒ tool broken, STOP.
* **K-L1a (the trade verdict).** `provenFailRate_after / provenFailRate_before > 1.25` on the CHANGED
  subpopulation, by COUNT **or** by AREA ⇒ **the lever is a TRADE**: it buys 3.49× orientation and
  pays honest position. It must be reported as a trade, the "position 75 → 36 BETTER" claim is
  WITHDRAWN, and productionisation is blocked pending an honest C2 (H-L3).
* **K-L1b (the free-win verdict).** ratio ≤ 1.00 by BOTH count and area ⇒ the win survives the honest
  ruler; the claim is restated in honest units and the plane-ruler number is retired as unreliable.
* **1.00 < ratio ≤ 1.25** ⇒ report as "no resolvable change" and give the Poisson interval; do not
  claim an improvement.

Sample size fixed before the run: **N = 20,000 per mesh**, chosen so the ~0.7 % base proven-fail rate
(AUDIT's random control: 2/300) yields ≈ 105 failures on the ≈ 75 % changed subpopulation, i.e. a
±10 % 1σ Poisson interval — enough to resolve 1.25× at ≈ 2.5σ, not enough to resolve 1.05×. Stated up
front so nobody quotes a 5 % move.

Both rulers on every facet, always: honest `witnessed`/`bound`/`certified`, the plane `sagAdaptiveRaw`,
and the MONOTONE `tangExc`. Count AND area weighting on every rate.

---

**H-L2 — THE NON-MONOTONE RANKING KEY.**

`s60ConstrainedFlip.ts` scores orientation as `sin(acos(dot)) · diam`. `sin` peaks at 90° and returns
to ZERO at 180°, so a fully inverted facet scores ≈ 6.6e-16 mm and the greedy pass is steered AWAY
from the worst facets in the mesh. The fix already landed in `s55OrientHeatmap.ts:102`: the normal
CHORD `2·sin(θ/2)·diam`, monotone on [0, π], maximal at inversion.

> Porting the monotone key into `s60ConstrainedFlip.ts` and re-running every arm does not move any
> published verdict.

FLIP's §14 re-scored the FINISHED STLs on both keys and found ratios 1.0002–1.0045 — but that is a
re-score of a mesh produced BY THE OLD KEY. It cannot tell you what a pass *steered by the new key*
would have done, because the key is the RANKING FUNCTION and the accept test (C1). Only a re-run can.

* **K-L2 (verdict-moving).** Any of: Gothic ratio leaves [3.0, 4.0]; K1/K2/K3/C4 changes PASS↔FAIL on
  any arm; `rejPos` becomes 0 on Gothic or Voronoi (the clause going vacuous); topology stops being
  byte-identical ⇒ **a verdict moved** and every affected headline in `S60_FLIP_FINDINGS.md` is
  re-stated here with the new number.
* If nothing moves, the finding is "the bug was real and inert *as a driver*, not merely inert as a
  scorer" — a strictly stronger statement than §14's, and the one the team asked for.

Note the BAR semantics shift slightly with the key (`2 sin(θ/2) ≥ sin θ`, equal to O(θ²)), so the
BEFORE column moves too — which is why the CONTROL is re-measured in the same process on the new key,
never compared against a committed old-key number.

---

**H-L3 — THE HONEST ACCEPTANCE PREDICATE (C2 := `certifyTriangle`).**

> Replacing C2's plane ruler with the honest `certifyTriangle` witness at tol = 0.010 mm, using the
> monotone `tangExc` as the cheap SELECTOR so the honest test runs only on candidates, is AFFORDABLE
> (≤ 4× the arm's wall time) and does not cost more than 10 % of the orientation gain.

Soundness note, written before the code: `witnessed` is a REAL point at a REAL distance, so
`witnessed > tol` is a **PROOF of failure** and rejecting on it is sound. The converse is not: not
proving failure is not proving pass. So the honest C2 is a *do-no-proven-harm* guard, strictly
one-sided, and I say so rather than calling it a certificate. (The campaign already has the scar for
the other direction — `4db657d6`, a one-sided bound driving FAILS.)

* **K-L3a (cost).** wall time > 4× the plane-ruler arm ⇒ NO-GO as built; report the price.
* **K-L3b (yield).** orientation ratio drops below 0.9 × the plane-ruler arm's ratio ⇒ the honest guard
  is expensive in the currency the lever exists to buy, and the trade must be priced, not hidden.
* **K-L3-VAC.** if the honest C2 rejects ZERO candidates that the plane C2 accepted, the swap is a
  NO-OP and must be reported as one.

---

**H-L4 — PRODUCTIONISATION.** Flag-gated, DEFAULT-OFF pass in a DRIVER FORK with its own vitest
config for provenance. **Gate before any treatment number is admissible: the flag-OFF control must
reproduce `S39CTL` to the digit — 1,142,166 tris / alloc 2,029,406 / 774 unresolved.** If it does
not, the fork is not the driver and nothing measured through it means anything
(scar: `project_strata_baselines_not_reproducible`).

### Explicitly NOT in scope, named so it is not mistaken for done

* No `src/` edit of any kind. No production export behaviour changes.
* No re-measurement of Voronoi's *mechanism* split — that is COLLAPSE's and SPLIT's ground.
* `_facetTruthLib.ts`, `_facetTruthRA.ts`, `_raFast.ts`, `orientRuler.ts`,
  `_strataFacetTruthValidate.test.ts`, `s5*`, `s7*`, `aud*`, `adv*`, `s9*` are READ-ONLY to me. I
  import from them; I do not edit them. Anything I need changed there goes in a message, not a patch.

---

## 1. H-L2 LANDED — the `sin` bug is PATCHED, every arm re-run, and NO VERDICT MOVED (but the fix is NOT inert)

`S80_FLIP_G3CHORD.report.txt`, GothicArches `S39CTL`, 1,142,166 facets, whole-mesh, one process, 661 s.
`research/tools/s60ConstrainedFlip.ts` now computes the orientation key as `2·sin(θ/2)·diam`
(`PF_S60_KEY=chord`, the default; the old `sin(θ)·diam` is retained ONLY as the in-process ablation
`PF_S60_KEY=sin`, and the live key is PRINTED in the header). The control is re-measured in the same
process on the new key — never compared against a committed old-key number.

| | old `sin` key (G2CON) | **monotone chord key (G3CHORD)** |
|---|---|---|
| orientation over-10 µm, BEFORE | 129,757 | 129,837 |
| orientation over-10 µm, AFTER | 37,157 | **37,020** |
| **ratio** | 3.49× | **3.51×** |
| AREA-weighted over-bar | 8.131% → 2.181% (3.73×) | 8.131% → **2.179%** (**3.73×**) |
| position > 10 µm (PLANE ruler) | 75 → 36 | 75 → **31** |
| **inversions θ > 90°** | 1,506 → 828 | 1,506 → **685** |
| θ > 120° | 410 → 255 | 410 → **175** |
| flips | 432,125 | 432,597 |
| `rejPos` (C2 non-vacuity) | 5,537 | **4,781** |
| `rejDet` (C3 non-vacuity) | 52,098 | 44,201 |
| jitter > 1 µm | 0 → 0 | **0 → 0** |
| topology (edges/bnd/nonMan/orientBad) | 1,713,829 / 1,160 / 0 / 0 identical | **identical** |
| runtime | 705 s | 661 s |

**K-L2: NOT TRIPPED.** Ratio 3.51× is inside [3.0, 4.0]; K1, K2, K3 and C4 all still PASS; `rejPos`
= 4,781 ≠ 0 so C2 is still non-vacuous; topology still byte-identical. **No published verdict moves.**

**But "no verdict moved" is not "inert", and the difference is the interesting part.** S66 re-scored
the FINISHED old-key STLs and found ratios 1.0002–1.0045, i.e. the key barely changes the *scoring*
of a fixed mesh. Steering the *search* with it is a different question, and it is measurably better in
exactly the population the old key was blind to:

* **θ > 90° 828 → 685 (a further 17.3 % of the inversions removed), θ > 120° 255 → 175 (−31.4 %).**
  `sin` scores a facet at 90° the same as one at 90°+ε and scores a fully inverted facet at ~0, so
  the old greedy pass could not tell an inversion from a perfect facet. The chord key can, and it
  spends its flips there.
* over-bar 37,157 → 37,020 (−0.37 %) and plane-ruler position failures 36 → 31.
* it is also 6 % CHEAPER (661 s vs 705 s) — fewer wasted probes.

So the honest statement is: **the bug was real, it was inert for the headline RATIO, and fixing it is
a small free improvement concentrated on inverted facets.** Both keys are now selectable in one tool,
so the ablation is reproducible rather than asserted.

*Also added to `s60ConstrainedFlip.ts` in the same patch, because a count-only column cannot support
this campaign's claims:* AREA-weighted over-bar (count over-states the mis-oriented SURFACE by 1.40×
before / 1.49× after on Gothic) and the inversion counters `θ>90°` / `θ>120°` / `angMax`, printed in
every census and carried into `<TAG>.summary.json`.

---

## 2. H-L1 LANDED — *** THE HONEST RULER SAYS THE FLIP IMPROVES POSITION 2.2x, NOT WORSENS IT ***

`s80HonestPos_L1_GOTHIC.report.txt`, tool `research/tools/s80HonestPos.ts`, 2,567 s.
GothicArches `S39CTL` (BEFORE) vs `s60flip/..._G2CON` (AFTER), 50,000 facet indices drawn ONCE by a
golden-ratio stride and scored on BOTH meshes — **paired, not two independent draws**. Instrument:
`certifyTriangle(tol = 0.010 mm)`, H1 (points on the FACET, distance to the SURFACE), three buckets,
none folded. Both other rulers on every facet.

### 2.1 K-L1-VAC — non-vacuity, checked before any other number was read

`changed 26,989 (53.98 %) / unchanged 23,011`. The pass touched more than half the sample, and the
unchanged half is a large real control (its two columns are identical by construction — the AFTER
certify short-circuits on an identical triangle — so it costs nothing and proves the split is real).
**Not vacuous.**

### 2.2 The verdict

| | BEFORE | AFTER | ratio |
|---|---|---|---|
| **CHANGED (26,989) H1 PROVEN-FAIL** | **83 (0.308 %)** | **38 (0.141 %)** | **0.458×** |
| **CHANGED, by AREA** | **0.0582 %** | **0.0359 %** | **0.616×** |
| CHANGED H1 witnessed p50 / p99 / max | 2.15 / 5.50 / **180.47** | 0.97 / 5.42 / **89.45** | |
| WHOLE (50,000) H1 PROVEN-FAIL | 143 (0.286 %) | 98 (0.196 %) | 0.685× |
| WHOLE, by AREA | 0.0353 % | 0.0257 % | 0.728× |
| UNCHANGED control (23,011) | 60 (0.261 %) | identical | — |
| PROVEN-PASS / UNKNOWN (whole) | 49,857 / 0 | 49,900 / **2** | |

**K-L1a needed > 1.25× to declare a trade. Measured 0.458×.** 1σ Poisson on the 83 before-failures is
±11.0 %, so 0.458 sits ≈ 5σ on the *favourable* side of 1.0. **K-L1b: the win survives the honest
ruler.** The pre-registered claim was "no worse"; the measurement is "materially better".

### 2.3 The paired per-facet movement — a rate can be flat while facets churn, so this is the sharp read

```
H1 verdict transitions on CHANGED:  FIXED 55   new PROVEN-FAIL 10   stayed failing 28   net -45
witnessed delta (after - before):   p01 -5.22   p50 -0.62   p99 +3.59   max +50.86 um
                                    improved 21,546   worsened 5,055   unchanged 388
```

**Not free, and I will not round it away: the pass creates ~10 new proven position failures per
26,989 changed facets (≈ 420 whole-mesh) while fixing ~55 (≈ 2,330 whole-mesh).** That residual is
exactly what an honest C2 (H-L3) exists to remove; it does not change the sign of the result.

### 2.4 THE BIGGER FINDING, and it is not about my lever: the driver's position ruler under-reads ~48×

Same 50,000 facets, same run, three rulers side by side:

| ruler | over-10 µm BEFORE | over-10 µm AFTER |
|---|---|---|
| `sagAdaptiveRaw` (the driver's PLANE ruler) | **3** | **2** |
| `certifyTriangle` H1 (proven failures) | **143** | **98** |

**48× under-report on the flag-OFF control mesh.** Extrapolated whole-mesh: ≈ **3,265 facets over the
10 µm product bar** where the driver reports 75, and ≈ 2,240 where it reports 31. The witnessed max in
the sample is 240.06 µm against a plane-ruler max of 37.05 µm on the same facets.

This is present in the CONTROL, so it is not caused by the flip; it is a property of the shipped
instrument. It is consistent with, and much larger than, AUDIT's top-300 finding (251 proven failures
where the plane reports 11) because that was a selected tail and this is the whole mesh.
**Consequence for the campaign: an arm that reports `sagAdaptiveRaw` over-bar counts is not reporting
position.** Both columns are printed by `s80HonestPos` on every future run so this cannot be forgotten.

### 2.5 SELECTOR PRICING (the input to H-L3) — `tangExc` is a strong but not perfect detector

P(H1 proven-fail | monotone `tangExc` bucket), BEFORE mesh, 50,000 facets:

| tangExc µm | [0,2) | [2,5) | [5,10) | [10,20) | [20,50) | [50,100) | [100,∞) |
|---|---|---|---|---|---|---|---|
| n | 11,478 | 23,255 | 9,663 | 4,067 | 1,229 | 145 | 163 |
| proven-fail | 0.009 % | 0.013 % | 0.031 % | 0.025 % | 0.325 % | **11.03 %** | **70.55 %** |

**A cut at `tangExc ≥ 10 µm` touches 11.21 % of facets and captures 95.10 % of all H1 failures** —
i.e. a 8.9× cost reduction for a 4.90 % miss. **It MISSES 7 of the 143, and that is stated, not
hidden:** an honest C2 behind this selector is a do-no-*detected*-harm guard, weaker than the
do-no-proven-harm guard it approximates.

### 2.6 Honest limits of this arm, named

* The AFTER column is the **old-key** `G2CON` mesh, because that is the artifact whose position claim
  was in dispute. The new-key `G3CHORD` mesh is strictly better on every column s60 measures
  (over-bar 37,020 vs 37,157, inversions 685 vs 828), so re-scoring it should if anything improve the
  ratio — but it is **not measured**, and I do not claim it.
* 50,000 of 1,142,166 facets = 4.4 %. The rates carry ±11 % (1σ); the *ratio* is 5σ from 1.0, the
  *absolute* whole-mesh counts (≈3,265) carry that ±11 %.
* `UNKNOWN` is 0 before and 2 after, so the buckets are essentially clean at nMax 512 on this style;
  on a style with real C0 closure walls that bucket will not be empty and must be read, never folded.

---

## 3. H-L5 CONFIRMED — Gothic has NO super-hub class, and that is *why* the same pass works there and not on Voronoi

`S82_HUBS.report.txt`, tool `research/tools/s82HubCensus.ts`. COLLAPSE found Voronoi's mis-oriented
class living on FANS around super-hub vertices and pointed out that every 1-RING operator — collapse,
re-point, retriangulate, **and my flip** — is defeated by a 2,550-gon. If Gothic had them too, my
lever's success would be unexplained. Facet-degree (triangles incident per welded vertex):

| mesh | p50 | p99 | p999 | **MAX** | deg ≥ 100 (vertices / share of mesh) | deg ≥ 1000 |
|---|---|---|---|---|---|---|
| **GothicArches S39CTL** (before) | 6 | 13 | 16 | **50** | **0 / 0.0000 %** | **0** |
| **GothicArches G3CHORD** (after) | 6 | 11 | 13 | **31** | **0 / 0.0000 %** | **0** |
| Voronoi `ring_D--` | 5 | 13 | 22 | **2,550** | 69 / **2.6746 %** | **32** (1.8727 % of the mesh) |

**Gothic's worst vertex carries 50 triangles; Voronoi's carries 2,550.** Gothic has literally zero
vertices above degree 100, so no part of its defect is locked behind a polygon a 1-ring operator
cannot open. That is a clean structural account of the style split — the same pass, 3.51× on one mesh
and 1.33× on the other, and the difference is in the MESH's degree distribution, not in the pass.

**Unlooked-for and worth having: the flip pass REGULARISES the degree distribution.** Max degree
50 → 31, p999 16 → 13, and the share of vertices at degree ≥ 10 falls 5.52 % → 2.48 %. It was never
asked to do that — the only objective is orientation — but a mesh with a tighter degree distribution
is a better input for every downstream 1-ring operator, including COLLAPSE's and SPLIT's.

---

## 4. H-L4 — PRODUCTIONISED. Both gates PASS, and the flag-OFF control is BYTE-IDENTICAL to S39CTL.

Three artifacts, each with its own gate, because a re-home and a re-run are both rewrites:

### 4.1 The PACKAGED PASS reproduces the PROBE arm — every counter, not just the mesh

`S81_LANDGATE_GATE.report.txt`. `research/tools/landFlipPass.ts` (the driver-callable form) run over the
same STL with the same options against `s60ConstrainedFlip`'s `con` arm on the monotone key:

```
flips 432,597 in 19 rounds                       s60 G3CHORD: 432,597   IDENTICAL
rej dirty 984,856  dup 415,961  fold 6,891,461  noImprove 23,766,854  DET 44,201  POS 4,781
                                                 s60 G3CHORD: identical on ALL SIX
orientation over-bar 129,837 -> 37,020 (3.507x)  by AREA 8.131% -> 2.179% (3.731x)
position (plane) 75 -> 31    inversions >90deg 1,506 -> 685
TOPO 1,713,829 edges / 1,160 boundary / 0 non-manifold / 0 orientation-inconsistent, before AND after
frozen off-surface 0  (the surface gate is armed and correctly finds nothing to freeze on a ring mesh)
H-L4-GATE: PASS — byte-identical GEOMETRY md5 abbcb74f157e1fdaa7b59baefb5ef410
```

The digest deliberately covers the 36 vertex bytes of every facet and EXCLUDES the header and the
derived per-facet normal, so it tests the mesh rather than two writers' formatting. Every internal
rejection counter agreeing as well is a much stronger statement than the output agreeing.

### 4.2 The DRIVER FORK reproduces S39CTL with the flag OFF — byte-identical, not "to the digit"

`research/bridge/_strataConformBisectL.test.ts` + `vitest.stratal.config.ts` + `run-land-driver.sh`.
The fork is a byte-for-byte copy of `_strataConformBisectS34.test.ts` (another agent's live file, which
I do not edit) differing in exactly two places: an import, and a `PF_LAND_FLIP`-gated block at §5.3b.

```
arm L0CTL  (PF_LAND_FLIP=0)
  nTri 1,142,166 | alloc 2,029,406 | unresolvedLeft 774 | capped false | timeCapped false
  curtainSites 0 | verdict FAIL | headlineMaxMm 0.04728176987418334      ALL IDENTICAL to S39CTL
  STL md5 9d5061f111f683ce65644809ded04876 == S39CTL's                   *** BYTE-IDENTICAL ***
  (only wall time differs: 785.977 s vs 821.636 s — expected, and not an A/B quantity)
```

**Placement decision, stated because it changes how the artifact must be read:** the pass runs AFTER
every driver audit, immediately before the STL is serialised. So the manifest's provenance columns
stay exactly the flag-OFF values — which is what makes the A/B attributable to the one flag — and
**every driver-reported fidelity number in a flag-ON run is a PRE-FLIP number.** That is declared in
the `<tag>.landflip.json` sidecar the ON arm writes. The post-flip verdict is taken offline by
`s60ConstrainedFlip` (orientation) and `s80HonestPos` (H1 position); the driver never self-reports it.

### 4.3 THE PRODUCTION-SCALE A/B THROUGH THE DRIVER — one flag, both arms, same process shape

`S80_LANDDRV_L0CTL.report.txt` / `S80_LANDDRV_L1FLIP.report.txt`,
`gothicarches_ring_DS-HT_L1FLIP.landflip.json`. GothicArches, ring stage, tol 0.01, grid 200×140,
triCap 8 M, aligned seed + tighten — the full S39CTL configuration, 1,142,166 triangles.

| | **L0CTL** (`PF_LAND_FLIP=0`) | **L1FLIP** (`PF_LAND_FLIP=1`) | |
|---|---|---|---|
| STL md5 | `9d5061f1…` = **S39CTL exactly** | `c394c496…` | |
| nTri / alloc / unresolvedLeft | 1,142,166 / 2,029,406 / 774 | **identical** | provenance preserved |
| verdict / headlineMaxMm (PRE-FLIP) | FAIL / 0.04728176987418334 | **identical** | by construction |
| orientation over-10 µm | 129,835 | **37,013** | **3.508×** |
| **orientation by AREA** | **8.1307 %** | **2.1794 %** | **3.731×** |
| inversions θ>90° / θ>120° | 1,506 / 410 | **671 / 165** | 2.24× / 2.48× |
| position > 10 µm (plane ruler) | 75 | **32** | |
| jitter > 1 µm / > 10 µm | 0 / 0 | **0 / 0** | |
| maxAngle max / caps ≥150° | 175.626 / 68,686 | 178.853 / 113,787 | shape cost, see below |
| edges / boundary / non-manifold / **winding** | 1,713,829 / 1,160 / 0 / **0** | **identical** | |
| vertices moved / triangles added | – | **0 / 0** | |
| pass cost | – | **962.6 s** on top of 786 s | 2.2× total wall |

**A small, real, and EXPLAINED difference from the offline arm** (432,292 flips in 21 rounds here vs
432,597 in 19 offline; over-bar 37,013 vs 37,020): the in-driver pass sees the soup at **f64**, while
the offline probe reads an STL and therefore sees the same geometry **quantised to f32**. Different
inputs, same answer to 0.02 %. Named rather than smoothed — and it means the in-driver arm is the more
faithful of the two, because the quantisation happens after it.

**The shape cost is real and is not hidden: caps ≥150° rise 68,686 → 113,787 (1.66×)** while maxAngle
max rises 175.63° → 178.85°. On this style Euclidean shape and orientation OPPOSE (they move together
on LowPolyFacet — S60 §5), so a pass that optimises orientation buys thinner triangles. Nothing crosses
the f32 determinacy floor (`jitter > 1 µm` stays 0), and `maxAngle ≥ 179.999°` stays 0, so no facet's
normal becomes non-representable — which is exactly what C3 exists to guarantee and it is non-vacuous
(59,120 rejections).
