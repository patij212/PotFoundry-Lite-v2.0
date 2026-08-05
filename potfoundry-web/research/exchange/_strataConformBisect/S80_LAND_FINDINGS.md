# S80 — LANDING THE CONSTRAINED FLIP (agent: LAND)

Living log. Appended continuously, newest block at the bottom. Owner files:
`research/tools/s60ConstrainedFlip.ts`, `s61FlipCeiling.ts`, `s66FlipRescore.ts`, `s8*`, `land*`,
and any driver fork I create.

> **STATUS BANNER — updated as arms land. Read this first.**
> *(nothing measured yet at the time of pre-registration; every line below is a HYPOTHESIS)*

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
| flips | 432,125 | 432,599 |
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
