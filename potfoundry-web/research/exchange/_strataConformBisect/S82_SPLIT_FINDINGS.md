# S82 — SPLIT: can a refinement step refine WITHOUT manufacturing orientation error?

Agent: SPLIT. Owns `split*`, `s10*`, and any NEW driver fork. Read-only over finished STLs unless stated.
Everything below the PRE-REGISTRATION line was written BEFORE the first number was taken.

---

## 0. THE STATE I INHERIT (not re-derived, cited)

* `S60_FLIP_FINDINGS.md` §13: **H-S65 refuted** — one round of targeted longest-edge bisection on
  Voronoi's over-bar facets gave `+29.3% facets` and over-bar **241,489 → 374,584**; four rounds gave
  `3.368x facets` and **29.933% → 58.743%** of ALL facets over the bar.
* Same file, §13: `position p99 6.40 → 6.02 → 4.40` improves while orientation doubles. **That position
  column is the driver's BLIND plane ruler `sagAdaptiveRaw`** — S60 itself flags this (§15).
* S60 §14 (`s66FlipRescore`): the non-monotone `sin(θ)·diam` key was inert for the FLIP verdicts (≤0.5%),
  and **by AREA the count over-states the mis-oriented surface 1.4x (Gothic) / 3.0x (Voronoi) / 140x
  (LowPolyFacet)**. The SPLIT experiment was never re-scored by area.
* S60 §14: on Voronoi the failing population splits by `aspect3 = L·perim/4A`: **124,245 facets with
  aspect3 ≥ 50 are 98.31% over-bar and a flip cannot touch them**; the rest are 29.05%.
* S61 H2-real: the orientation ANGLE is DENSITY-INVARIANT on the crease population (×0.9968 over five
  halvings synthetic; ×1.001 over an 8x diam span real).
* `audTruePos`: at the 10 µm product bar `certifyTriangle` proves **251/300 Gothic** and **396/400
  Voronoi** top-facets FAIL where the plane ruler reports 11 and 0.
* Coordinator, mid-task: `advMeshWideH1`'s "22.190 µm" is **H2** (surface→mesh), not H1; relabelled in
  `d5fe7d04`. H1 and H2 are OPPOSITE Hausdorff directions and a rotated child raises H1 while its
  siblings keep H2 small.

## 0b. THE MECHANISM AS HANDED TO ME, AND THE PART OF IT THAT IS ALGEBRA

> "the split inserts a vertex ON the surface; that vertex sits off the parent facet's plane by the
> parent's position sag `s`, so each child is rotated relative to the parent by roughly `s/h`."

For a 1→2 split of parent `(u,v,c)` on edge `u–v` at a lifted midpoint `M`, child `(u,M,c)` and parent
BOTH contain the line `u–c`. So the child plane IS the parent plane rotated about `u–c`, and

        tan ρ  =  δ⊥ / a⊥          EXACTLY, not approximately

where `δ⊥ = |(M − M_flat)·n_par|` (perpendicular offset of the lifted midpoint from the parent plane) and
`a⊥ = dist(proj_par(M), line(u,c))` (the child's altitude from the new vertex to the SHARED edge). This is
a two-line identity, so it is not the hypothesis. **The hypothesis is in the two substitutions**:
`δ⊥ ≈ s` (the parent's position SAG, a max over the facet) and `a⊥ ≈ h` (the child's SIZE). Both can be
badly wrong: `δ⊥ ≤ s` always (one point vs a max), and `a⊥ << h` on a high-aspect facet — which is
exactly the class S60 §14 says owns 98% of Voronoi's failures. If the operative denominator is the
ALTITUDE rather than the SIZE, the conclusion changes from "refinement is unbounded" to "refinement is
unbounded ON SLIVERS", and the remedy changes from representation to shape.

---

## 1. PRE-REGISTRATION (written 2026-08-05, before `s101SplitModel.ts` was run)

### H-S82-1 — THE IDENTITY (a self-check on my own geometry, not a finding)
`ρ_measured = atan(δ⊥ / a⊥)` to machine precision on real facets.
**KILL:** p99 of `|ρ − atan(δ⊥/a⊥)|` > 1e-9 rad ⇒ my split geometry is wrong; STOP and fix before
reading any other column. (A non-vacuous check: it must also be visibly NOT satisfied when I substitute
the child's DIAMETER for `a⊥`, or the check is measuring nothing.)

### H-S82-2 — THE CAMPAIGN'S PROXY `s/h`
The handed-down model predicts `ρ ≈ s_parent / h_child`, with `s_parent` the parent's position sag and
`h_child` the child's diameter.
**CONFIRMED** if `ρ_measured / (s_par/h_child)` has p50 in [0.5, 2.0] AND p10–p90 inside [0.2, 5].
**REFUTED** if p50 falls outside [0.5, 2.0], or if the spread p90/p10 exceeds 100 (i.e. the proxy carries
no per-facet information even if its median happens to land).
Secondary, decisive between the two candidate denominators: report Spearman ρ of `ρ_measured` against
`δ⊥/a⊥` (must be ~1.0 by H-S82-1), against `s_par/h_child`, and against `s_par/a⊥`. **The denominator
that wins is the finding.**

### H-S82-3 — THE CONSEQUENCE (this is the load-bearing one)
"Refinement converts a bounded position error into an unbounded orientation error" requires the CHILDREN
to be worse AGAINST THE SURFACE, not merely rotated against the parent. Measure θ = the monotone
orientation angle (`orientOfFacet`, `fdNormals`, k=4) for parent and both children.
**REFUTED (the claim is a re-weighting artefact)** if, over a uniform sample of the facets the split
experiment actually marks, the AREA-weighted mean of `θ_child` is ≤ `θ_par` for ≥ 50% of splits AND the
total over-bar AREA does not rise.
**CONFIRMED** if over-bar AREA rises ≥ 1.2x under the virtual split.
Both the ANGLE bar (1°) and the product CHORD bar (`2·sin(θ/2)·diam > 10 µm`) are reported, by COUNT and
by AREA — four numbers per arm, because the chord bar shrinks with `diam` and the count does not.

### H-S82-4 — WHERE IT IS TRUE (stratification, decided before the run)
Same measurement stratified by parent `aspect3` (< 50 vs ≥ 50) and by `spreadRad` (surface TURNS inside
the facet vs not). **PREDICTION ON RECORD:** the worsening concentrates in `aspect3 ≥ 50`; well-shaped
parents improve. If the worsening is UNIFORM across aspect3, my shape explanation is refuted and the
handed-down density explanation stands.

### H-S82-5 — THE COORDINATOR'S DISCRIMINATOR (H1 ↑ while H2 ↓)
Across the three meshes that already exist on disk (BEFORE = `voronoi_ring_D--_A2CON.stl`, +1 round =
`V_SPLIT1R_split.stl`, +4 rounds = `V_SPLIT1_split.stl`):
* **H1** = `certifyTriangle(tol=0.010)` proven-fail rate on a uniform facet sample (count AND area).
* **H2** = distance from a FIXED set of analytic-surface points to each mesh (same points, all three).
**CONFIRMED** if H1 proven-fail area-fraction rises ≥ 1.3x while H2 p99 falls ≥ 1.3x.
**REFUTED** if they move the same way, or if neither moves ≥ 1.3x.

### CONTROLS
* Every arm reports the parent population it was drawn from and its size.
* The virtual split reproduces `s65SplitAndFlip.ts`'s rule EXACTLY (longest edge, midpoint in
  (θ,z) with `dThRaw` unwrapping, `r = rA(θ_M, z_M)`) — verified by re-computing s65's own `tangExc`
  key and matching its published BEFORE census (241,489 over-bar / p99 1194.64 µm) to ≤1%.
* Rulers: orientation ONLY via `orientOfFacet` (monotone `2·sin(θ/2)·diam`); position ONLY via
  `certifyTriangle` for verdicts, with `sagAdaptiveRaw` printed alongside as the blind control.

### WHAT WOULD MAKE ME REPORT A NO-OP
If H-S82-3 is confirmed AND the worsening is uniform in aspect3 AND H-S82-5 confirms, then naive
refinement really does manufacture the defect, no placement rule inside the 1→2 family can fix it, and
the honest finding is the obstruction — which I would then have to state as a theorem, not a table.

---

## 2. *** THE `s/h` MODEL IS REFUTED IN BOTH ITS FACTORS — AND THE SIGN OF ITS INTERPRETATION IS BACKWARDS ***

Tool `research/tools/s101SplitModel.ts`, runner `run-s101-split-model.sh`, reports
`s101SplitModel_{VORO,GOTH,LOWP}.report.txt`, checkpoints `S82_split_model.ndjson`.
READ-ONLY over three finished STLs. **CONTROL PASSED FIRST:** re-computing s65's own census key over the
whole A2CON mesh reproduces its published BEFORE row to every printed digit — `over-10um 241489
(29.933%) p99 1194.64 max 2238.7`. Same experiment, same facets.

### 2.1 The identity IS exact — so the algebra is right and only the substitutions are wrong

`|rho − atan(dPerp/aPerp)|` over non-inverted children, p99, three styles x four placements:
**4.9e−12 (Voronoi) / 1.3e−11 (Gothic) / 5.9e−11 (LowPoly)** rad. Vacuity twin (same check with the
child's DIAMETER in place of the altitude): p50 **4.4e−2 / 3.2e−2 / 1.2e−1** rad — ten orders apart, so the
check is not measuring nothing. **H-S82-1 CONFIRMED.** The child plane IS the parent plane rotated about
the shared edge, by exactly `atan(dPerp/aPerp)`.

### 2.2 FACTOR ONE — the denominator is the ALTITUDE TO THE SHARED EDGE, not the child's size

| population | `diamChild / aPerp` p50 | p99 | Spearman rho vs `s/diam` | vs `s/aPerp` | vs exact `dPerp/aPerp` |
|---|---|---|---|---|---|
| Voronoi MARKED | **17.2** | **9,654** | **−0.438** | +0.228 | +0.457 |
| Voronoi ALL | 3.42 | 3,026 | +0.102 | +0.697 | +0.910 |
| Gothic MARKED | — | — | +0.539 | +0.873 | +0.995 |

On the population the mesher actually splits, `s/diam` is **ANTI-CORRELATED** with the rotation it is
supposed to predict. The proxy ratio `rho / (sPar/diamChild)`: p50 **21.1** (Voronoi) / **3.29** (Gothic),
spread p90/p10 **12,214** / **74**. The pre-registered CONFIRM band was p50 in [0.5,2.0] and spread ≤ 100.
**H-S82-2 REFUTED on every style.**

### 2.3 FACTOR TWO — the lift is mostly IN-PLANE on the failing population, and it FOLDS the mesh

The model says the lifted vertex sits *off the parent plane*. It mostly does not. Decomposing the
displacement `M − Mflat` into perpendicular and in-plane parts (`dPerp`, `dPar`):

| population | dPerp p50 | dPar p50 | **dPar/dPerp p50** | area(children)/area(parent) | **children INVERTED (rho>90 deg)** |
|---|---|---|---|---|---|
| Voronoi MARKED | 0.524 um | 3.672 um | **7.01** | **1.2454** | **2,503 / 10,000 = 25.03%** |
| Voronoi ALL | 0.680 um | 0.646 um | 0.95 | 1.0221 | 747 / 10,000 = 7.47% |
| Gothic MARKED | 2.143 um | 1.504 um | 0.70 | 0.9979 | 113 / 10,000 = 1.13% |
| LowPoly MARKED | 3.331 um | 0.389 um | 0.12 | 1.0109 | 0 / 10,000 = 0.00% |

A radial lift decomposes against the facet's own orientation. On a near-radial facet (a step wall, a
sliver spanning relief) the radial direction lies almost IN the facet plane, so "put the vertex on the
surface" **slides it along the facet** instead of lifting it off it. When that slide exceeds the distance
from the midpoint to the opposite edge — microscopic on a sliver — `proj(M)` crosses the shared edge and
the child's normal flips: **the mesher's own split rule folds a QUARTER of the children it makes on
Voronoi** (40.3% within the `aspect3 >= 50` stratum), while the mesh stays combinatorially
orientation-consistent so no topology audit can see it. It also inflates surface area by **24.5%** —
a 1->2 split of a planar triangle conserves area exactly, so every part of that 24.5% is a tent or a
fold. s65's own STL round-trip reported only "120 inverted windings / 118,278" because a winding check
cannot see a fold whose winding is consistent.

### 2.4 *** THE CONSEQUENCE CLAIM IS REFUTED — AND `s/h` IS A CEILING ON THE CORRECTION, NOT THE DAMAGE ***

Every child of a single-vertex EDGE split shares an EDGE with its parent, so its plane is the parent's
rotated about that edge by `rho`, and its footprint is a SUBSET of the parent's, so it is scored against a
subset of the same surface normals. Therefore

>  **theta_par − max_i theta_child_i  <=  max_i rho_i**   — *the most a split can improve orientation is
>  the rotation it applies* — and `rho = atan(dPerp/aPerp)` with `dPerp <= s` whenever the new vertex is
>  required to lie ON the surface.

MEASURED: violations **1/5000 (Voronoi P0), 10/5000 (Gothic P0), 0/5000 (LowPoly P0)**. The NO-LIFT
control, where both sides are exactly zero, still shows 66–134/5000 "violations" of magnitude
0.005–0.012 deg, which calibrates the lattice-sup noise floor at ~0.01 deg; every measured violation is
inside it. **The inequality holds.**

So `s/h` is not the error refinement manufactures. **It is the ceiling on the correction refinement can
apply.** That reverses the handed-down interpretation, and it *derives* the density-invariance the other
agent measured: as h falls, `s` falls faster (quadratically on a smooth patch), so the available
correction `atan(s/h)` vanishes — and any error not produced by curvature (a crease dihedral, or the
facet's own degenerate shape) sits exactly where it was. Density-invariance is a **theorem of the 1->2
split family**, not an empirical curiosity, and no placement inside that family escapes it.

### 2.5 THE NULL NOBODY RAN: a GEOMETRICALLY EMPTY split moves the metric as much as the real one

`P1 NO-LIFT` puts the new vertex at the 3D midpoint of the edge. The children are COPLANAR with the
parent: the surface is bit-for-bit unchanged. It is not a mesh operation, it is a re-labelling. Yet:

| MARKED population, over-bar AREA FRACTION, 10 um chord bar | P0 = the mesher's rule | **P1 = the NULL** | P0's real gain |
|---|---|---|---|
| **Voronoi** | 100% -> 97.43% (x0.974) | 100% -> 99.17% (**x0.992**) | **1.8%** |
| **GothicArches** | 100% -> 70.31% (x0.703) | 100% -> 87.87% (**x0.879**) | **20.0%** |
| **LowPolyFacet** | 100% -> 74.31% (x0.743) | 100% -> 95.38% (**x0.954**) | **22.1%** |

The null moves because the metric is a SUP over a footprint times a DIAM, and subdivision shrinks both.
**Any before/after comparison of orientation across a refinement round must be quoted against this null.**
S65's was not, and neither was anything else in the campaign.

### 2.6 SO WHAT ACTUALLY HAPPENED IN S65 — the "+55% worse" is the split's own arithmetic

Over-bar COUNT, per 5,000 marked parents (10,000 children):

| style | P0 over-bar children | **P1 NULL over-bar children** |
|---|---|---|
| Voronoi | 9,766 (1.95x per parent) | 9,937 (1.99x) |
| Gothic | 6,498 (1.30x) | 8,515 (1.70x) |
| LowPoly | 7,366 (1.47x) | 9,044 (1.81x) |

A split makes two facets. On Voronoi 1.95 of them are still over the bar, against a null of 1.99. S65
observed 241,489 -> 374,584 = **1.55x for a 1.29x facet count** — i.e. FEWER over-bar facets than the
"nothing changed" null predicts. The "+55% worse" is the count doubling under a targeted selection rule.
By AREA FRACTION nothing got worse on any style. **H-S82-3 REFUTED.** The 4-round "58.7% of ALL facets"
is the same arithmetic compounded: targeted refinement multiplies the marked class and leaves the rest
alone, so the count fraction must climb toward 1 whatever the geometry does.

### 2.7 H-S82-4 CONFIRMED — the damage is entirely a SHAPE class, and it is the one the literature names

| Voronoi MARKED, by parent `aspect3` | n | improve | rho p50 | **inverted** |
|---|---|---|---|---|
| < 4 (well-shaped) | 94 | 71.3% | 0.65 deg | 0.00% |
| 4..50 | 689 | 75.2% | 1.05 deg | 11.90% |
| **>= 50 (sliver)** | **717** | **51.5%** | **33.2 deg** | **40.31%** |

Gothic has **ZERO** facets with `aspect3 >= 50` in its marked population — and Gothic is the style where
refinement works (x0.703 against a x0.879 null). Voronoi's marked population has `aspect3` p50 **44.6**,
p99 **11,283**.

**THIS IS A KNOWN THEOREM AND WE RE-DERIVED IT THE HARD WAY.** Shewchuk et al., *Approximation Bounds for
Interpolation and Normals on Triangulated Surfaces and Manifolds*
([arXiv:1911.03424](https://arxiv.org/abs/1911.03424)): the interpolation (POSITION) error varies
**quadratically with the radius of the smallest enclosing ball** — sensitive to size, nearly insensitive
to shape — while the **NORMAL error varies LINEARLY with the CIRCUMRADIUS**, which is unbounded as the
largest angle approaches 180 deg. Their own summary: *"in surface meshes, triangles with large angles are
undesirable because of problems with very inaccurate normals, not because of problems with interpolation
error."* That is this campaign's entire discovery, published in 2019. The governing shape condition for
the normal is the **circumradius condition** (Kobayashi–Tsuchiya, a Babuska–Aziz-type generalisation of
the maximum-angle condition), not the min-angle / sliver condition the mesher's guards are written
against.

**The operational consequence: the sizing field controls `h`, and `h` controls POSITION. Nothing in this
pipeline controls `R_circ`, and `R_circ` is what controls ORIENTATION.** Refinement reduces `h`; it does
not reduce `R_circ / h`. That is why density is inert here and why it always will be.

### 2.8 THE PLACEMENT PARETO FRONT — measured, four rules, same facets, same rulers

| Voronoi MARKED | folds | area(ch)/area(par) | over-bar AREA frac (10um) | child position sag p99 / max |
|---|---|---|---|---|
| P1 NO-LIFT (null) | 0% | 1.0000 | x0.992 | 6.88 / 9.95 um |
| **P0 PARAM-LIFT (the mesher)** | **25.03%** | **1.2454** | x0.974 | 6.51 / **15.99** um |
| P2 PERP-FOOT | 0% | 1.9974 | x0.981 | **117.8 / 378.9** um |
| **P3 PERP-ONLY** | **0%** | **1.0051** | **x0.968** | 19.07 / 154.5 um |

* **P2 (drop a perpendicular from the midpoint to the surface) is a trap** — on a facet nearly tangent to
  a steep wall the perpendicular ray travels a long way (dPerp p99 **388 um**) before it meets the
  surface, doubling the area and putting the child 379 um off. Measured, not argued; it was my first
  candidate fix.
* **P3 (keep only the perpendicular component of the mesher's own lift) is free** — zero extra `rA`
  evaluations, it is a projection of a vector the mesher already computes — and it removes **100% of the
  folds and 96% of the area inflation** on Voronoi, while scoring slightly BETTER on orientation than the
  current rule on all three styles (Voronoi x0.968 vs x0.974, Gothic x0.702 vs x0.703, LowPoly x0.746 vs
  x0.743). Its cost is POSITION: the vertex no longer lies on the surface, and child sag p99 goes
  6.5 -> 19.1 um on Voronoi (Gothic 3.42 -> 3.84 um; LowPoly unchanged). **That is the Pareto trade and it
  is a real one: P3 is a fold-free split that breaks the 10 um position bar on the sliver class.**
* On Gothic and LowPoly all four placements land within 0.6% of each other on orientation. **Placement
  only matters where the shape is already broken.**

### 2.9 WHAT I AM NOT CLAIMING

* I have NOT shown the split is harmless. It folds 25% of Voronoi's children and adds 24.5% surface area,
  and no instrument in the campaign currently detects that (topology stays manifold and consistently
  wound). That is a NEW defect, found by this probe, and it is the one thing in S65 that was real.
* The orientation angles on Voronoi's marked population (theta p50 **64.5 deg**, p99 **158.7 deg**) are
  scored by `orientOfFacet` against the analytic graph `r = rA(th,z)`. I did not verify that a facet on a
  near-vertical Voronoi cell wall is a legitimate target for that comparison. If part of that population
  is closure/wall geometry the graph does not contain, its orientation "failure" is a ruler artefact —
  and `orientRuler.ts` is not my file. **Flagged for AUDIT/GUARD.**
* Everything here is a VIRTUAL split of ONE round on a finished mesh. It does not model LEB propagation,
  the conformity closure, or what four rounds compound into. The P1 null and the ceiling inequality are
  round-independent; the placement table is not.

## 3. PRE-REGISTRATION 2 (written before `s103Split1to4.ts` ran) — DOES A DIFFERENT TOPOLOGY ESCAPE?

**A CORRECTION TO MY OWN §2.4 PROOF, MADE BEFORE THE RUN AND NOT AFTER IT.** I justified the ceiling with
"every child shares an EDGE with the parent". That is true of a 1->2 split and it is **not what the proof
needs**. The proof needs only that the children's footprints TILE the parent's:

    for p in F_child:  angle(n_ch, n_S(p)) >= angle(n_par, n_S(p)) - rho
    => max_i theta_ch_i >= max_i sup_{F_i} angle(n_par, n_S) - max_i rho_i = theta_par - max_i rho_i

So the ceiling holds for **any** subdivision — 1->2, 1->4, 1->k. Edge-sharing is what makes it TIGHT in the
1->2 case, because there `rho = atan(dPerp/aPerp)` with `dPerp <= s`: the anchor line pins it. The 1->4
split's MIDDLE child (the medial triangle of three lifted midpoints) is anchored on no parent vertex, so
nothing pins its `rho`. The ceiling still applies; its HEADROOM can be larger.

* **H-S82-6** 1->4 reaches an over-bar AREA FRACTION <= **0.8x** the 1->2 value on >= 2 of 3 styles.
  REFUTED if >= 0.95x.
* **H-S82-7** The MIDDLE child's `rho` p50 exceeds the CORNER children's by >= 2x (it is the only unpinned
  one, so if topology is the lever it must show up there).
* NULL: `M2 = 1->4 NO-LIFT` — four COPLANAR children, surface bit-identical. Mandatory after §2.5.

## 4. RESULT — *** THE OPERATOR IS WRONG, NOT THE PLACEMENT. LEB DOES NOT CONTROL THE CIRCUMRADIUS; 1->4 HALVES IT EXACTLY. ***

`s103Split1to4_{VORO,GOTH,LOWP}.report.txt`, 4,000 marked parents per style, four modes on the SAME parents.

### 4.1 The pre-registered verdicts, read from the printed numbers

| over-10um AREA FRACTION (child/parent) | Voronoi | Gothic | LowPoly |
|---|---|---|---|
| M0 1->2 LEB param-lift (**the mesher**) | x0.9756 | x0.7074 | x0.7401 |
| M1 1->4 param-lift | x0.8241 | x0.6971 | **x0.4124** |
| **M2 1->4 NO-LIFT (the null)** | x0.9456 | x0.8661 | x0.7802 |
| M3 1->4 perp-only | x0.8280 | x0.6993 | x0.4198 |
| **H-S82-6 test: M1 / M0** | 0.845 | **0.985** | 0.557 |

**H-S82-6 REFUTED** — the ratio is <= 0.8x on ONE style, not two, and on Gothic it is 0.985, inside my own
REFUTE band. I am reporting the pre-registered verdict as it fell.

**H-S82-7 REFUTED.** Middle-child `rho` p50 / corner p50: Gothic **1.72x**, LowPoly **1.00x**, Voronoi M3
**0.19x**. The one apparent confirm — Voronoi M1 at 67.9x — is the middle child reading **178.78 deg**,
i.e. INVERTED: a defect, not headroom. The unpinned middle child is NOT where the gain comes from.

### 4.2 But the ratio-of-ratios was the WRONG statistic, and §2.5 is why

M0 and M1 have DIFFERENT nulls (4-way subdivision shrinks the sup+diam metric more than 2-way does), so
`M1/M0` conflates geometry with subdivision. The null-corrected gain — the only comparison §2.5 permits —
is `1 - mode/null`:

| REAL gain per round, over-10um AREA fraction | Voronoi | Gothic | LowPoly |
|---|---|---|---|
| 1->2 LEB (M0 vs its S101 null x0.992) | **1.6%** | 19.5% | 22.4% |
| **1->4 (M1 vs M2)** | **12.9%** | 19.5% | **47.1%** |

**1->4 delivers 8x the real gain on Voronoi and 2.1x on LowPoly, and ties on Gothic** — for 2x the
triangles. I am flagging plainly that this is a DIFFERENT question from the one I pre-registered, posed
only after S101 established the null; the pre-registered question failed and I am not re-labelling it.

### 4.3 *** THE MECHANISM, AND IT IS THE PUBLISHED THEOREM MEASURED DIRECTLY ***

arXiv:1911.03424 says the normal error scales with the **CIRCUMRADIUS**. So measure what each operator
does to the circumradius. `R_circ(child)/R_circ(parent)`:

| | Voronoi p50 / **p90** | Gothic p50 / **p90** | LowPoly p50 / **p90** |
|---|---|---|---|
| **M0 1->2 LEB (the mesher)** | 0.674 / **2.855** | 0.449 / **1.635** | 0.486 / **1.080** |
| M1 1->4 param-lift | 0.523 / 1.687 | 0.500 / 0.548 | 0.498 / 0.505 |
| M2 1->4 no-lift | 0.500 / 0.500 | 0.500 / 0.500 | 0.500 / 0.500 |
| **M3 1->4 perp-only** | **0.4999 / 0.500** | **0.4998 / 0.500** | **0.4979 / 0.501** |

**Read the p90 column.** A 1->4 split is a SIMILARITY refinement: every child is the parent at half scale,
so `R_circ` halves EXACTLY — p50 and p90 both 0.500, on every style, deterministically. **Longest-edge
bisection does not control `R_circ` at all: for more than 10% of its children it makes the circumradius
LARGER, up to 2.86x on Voronoi.** Each child of an LEB keeps a full parent edge, and on a cap triangle
the circumradius is set by that edge over the small opposite altitude — halving the long edge does not help
the child that keeps the other two.

So the chain closes:
1. refinement's power over orientation is bounded by the rotation it applies (§2.4, measured);
2. the orientation error itself scales with `R_circ` (arXiv:1911.03424);
3. **LEB does not reduce `R_circ` and often raises it; 1->4 halves it exactly**;
4. therefore the mesher's refinement OPERATOR — not its vertex placement, and not its density — is what
   makes refinement inert against orientation. The fix is a topology (red / 1->4 refinement with a green
   closure), which is standard, not novel, and is a real engineering cost (2x triangles per round, hanging
   nodes on all three edges).

Note also that the in-plane slide DESTROYS the exact halving: M1 (param-lift) reads 0.523/1.687 on Voronoi
where M3 (perp-only) reads 0.4999/0.500. **The similarity property is only preserved if the new vertices
stay in the parent plane's projection** — which is exactly what P3/P4 do.

### 4.4 THE ONE COVERAGE DEFECT THIS EXPOSED, WHICH IS WORSE THAN A FOLD

`area(children)/area(parent)` for M1 (1->4 param-lift) on Voronoi is **0.9250** — the four children cover
**7.5% LESS** than the parent. A subdivision cannot lose area unless the pieces stop tiling: with all three
midpoints sliding in-plane, the medial triangle inverts (rho p50 178.78 deg) and the corner children
overlap it instead of tiling. M3 (perp-only) reads **1.0017**, M2 (null) exactly 1.0000. On Gothic and
LowPoly the effect is small (0.997–1.018). **A 1->4 upgrade must NOT be shipped with the current
parameter-midpoint lift; it must use a placement that preserves the parent-plane projection.**

## 5. *** THE OBSTRUCTION, AS A MEASURED NUMBER — AND IT SEPARATES THE STYLES CLEANLY ***

To cancel a parent's orientation error `theta` you must rotate a child by `theta`, which means displacing
the new vertex off the parent plane by `aPerp * tan(theta)`. The vertex must lie ON the surface, and the
surface is only `s` from the parent plane inside this footprint. So the child's altitude to the shared
edge would have to be at most

>   **aNeeded = s / tan(theta_par)**,  i.e. a child of aspect ratio at least **diam / aNeeded**.

Measured on the marked population (`s101SplitModel_{VORO2,GOTH2,LOWP2}.report.txt`, 4,000 parents each):

| style | theta_par p50 | s p50 | **altitude NEEDED** p50 | altitude the split GOT | **required child ASPECT** p50 / p90 |
|---|---|---|---|---|---|
| **GothicArches** | 7.46 deg | 2.47 um | **17.28 um** | 42.71 um | **17 / 49** |
| **LowPolyFacet** | 20.05 deg | 4.52 um | **12.30 um** | 20.15 um | **11 / 18** |
| **Voronoi** | 64.52 deg | 1.25 um | **0.299 um** | 24.79 um | **3,009 / 8.0e11** |

**This is the whole result in one table.**

* On Gothic and LowPoly the repair needs a child of aspect **11–49**. That is an ordinary triangle. So
  refinement CAN fix those facets — and §2.5/§4.2 measure it doing exactly that, 20–22% of the over-bar
  area per round against the null.
* On Voronoi the repair needs a child of aspect **3,009** at the MEDIAN. A triangle that thin has an
  unbounded circumradius, and by arXiv:1911.03424 its OWN normal error is unbounded. **The triangle that
  would fix the orientation is a triangle whose orientation cannot be trusted.** The repair is
  self-defeating, and it is self-defeating for EVERY rule that inserts vertices on the surface inside that
  facet — not just for the mesher's rule, and not just for the four placements I measured.

**THE OBSTRUCTION, STATED:** a facet's orientation error is repairable by refinement iff
`s / tan(theta) ` is a usable altitude — equivalently iff `theta <~ atan(s/h)`, i.e. iff the error is
CURVATURE-DRIVEN (`theta ~ kappa*h`, so `s ~ kappa*h^2/8` gives `atan(s/h) ~ theta/8`, the same order).
An error that is CREASE-driven (fixed dihedral, `theta` independent of `h`) or SHAPE-driven (the facet's
own circumradius) has no such `s` and is invariant under every refinement rule. **Refinement is a POSITION
instrument. Orientation is owned by vertex PLACEMENT and CONNECTIVITY, and is bounded below by the shape
of the facets you already have.** That is the redirect: Voronoi's class belongs to COLLAPSE (remove the
sliver) or LAND (move the existing vertices onto the crease), and no amount of SPLIT work will move it.

## 6. `P4 GUARDED-LIFT` — the one change I would ship, and it is nearly free

The mesher's rule folds because the radial lift's IN-PLANE component can push the new vertex past the
opposite edge. The guard is two cross products and no extra `rA` evaluations: compute the signed areas of
the two children **in the parent plane** using `proj(M)`; accept the on-surface placement iff both keep
>= 50% of their flat area (each child gets exactly half the parent's area when M is the flat midpoint);
otherwise fall back to `P3` (drop the in-plane component, keep the perpendicular one).

| MARKED population | P0 = the mesher | **P4 = guarded** | P1 null |
|---|---|---|---|
| **Voronoi** folds / tiling / over-10um area frac | **24.55%** / 1.2508 / x0.976 | **0.00%** / **1.0076** / **x0.970** | 0% / 1.0000 / x0.993 |
| Voronoi child sag p99 / max | 7.02 / 10.36 um | 19.43 / 129.86 um | 7.29 / 9.89 um |
| **Gothic** folds / tiling / over-10um | **1.10%** / 0.9980 / x0.707 | **0.00%** / 0.9990 / x0.708 | 0% / 1.0000 / x0.889 |
| Gothic child sag p99 / max | 3.42 / 27.24 um | **3.97** / 55.17 um | 3.48 / 12.06 um |
| **LowPoly** folds / tiling / over-10um | 0.00% / 1.0109 / x0.740 | 0.00% / 1.0109 / **x0.740** | 0% / 1.0000 / x0.956 |
| LowPoly child sag p99 / max | 4.983 / 5.03 um | **4.983 / 5.03 um** | 4.991 / 5.00 um |

* **LowPolyFacet: P4 is BIT-IDENTICAL to P0** (the guard never fires — there is nothing to guard).
* **Gothic: folds 1.10% -> 0.00% for +0.55 um of child sag p99 and no orientation cost** (x0.708 vs x0.707).
* **Voronoi: folds 24.55% -> 0.00%, tiling 1.2508 -> 1.0076, orientation slightly BETTER** — paid for with
  child sag p99 7.0 -> 19.4 um. That cost is REAL and it is concentrated exactly on the sliver class,
  because the facets whose slide would fold the mesh are the same facets whose vertex has to give up being
  on the surface. **Per §5 those facets are unfixable anyway**, so the trade is "a fold-free mesh that
  misses the 10 um bar on the sliver class" against "a folded mesh that meets it there". I am NOT calling
  that trade; it belongs to whoever owns the product bar. What is NOT a trade is Gothic and LowPoly, where
  the guard is free.

**What I did NOT do with P4:** I did not run it through a real mesher, so LEB propagation, the conformity
closure and multi-round compounding are unmeasured. It is a per-facet measurement on 12,000 parents.

## 7. H-S82-5 (the coordinator's H1↑/H2↓ discriminator) — **REFUTED AS STATED**, and its H1 arm independently confirms the FOLD

`s102SplitH1H2.ts` / `s102SplitH1H2.report.txt`. The three meshes S65 actually produced, 1,000 uniform
facets each through `certifyTriangle(tol=0.010)` (H1: two-sided, PROVEN-FAIL / PROVEN-PASS / UNKNOWN, and
UNKNOWN was **0** on all three so nothing is folded away), plus **the same 120,000 analytic-surface points**
measured to each mesh (H2 — paired, so a difference is a difference in the mesh).

| | facets | H1 PROVEN-FAIL by COUNT | **H1 PROVEN-FAIL by AREA** | H1 witnessed p99 / max | **H2 p99 / max / over-10um** |
|---|---|---|---|---|---|
| **R0 BEFORE** | 806,765 | 10.40% | **1.486%** | 120.95 / 157.33 um | 4.409 / 9.65 um / **0** |
| **R1 (+1 round)** | 1,043,321 | 10.20% | **3.603%** | 110.67 / 146.75 um | 4.408 / 9.21 um / **0** |
| **R4 (+4 rounds)** | 2,716,959 | 4.60% | **1.025%** | 26.27 / 51.13 um | 4.403 / 5.99 um / **0** |

**PRE-REGISTERED VERDICT: REFUTED.** The criterion was "H1 area rises >= 1.3x WHILE H2 p99 falls >= 1.3x".
H2 p99 moves **4.409 -> 4.408 -> 4.403 um — 0.14% across 3.4x the triangle count.** It is inert. The kill
clause "REFUTED if neither moves >= 1.3x / they move the same way" fires on the H2 arm.

**What the numbers actually say, which is more useful than the hypothesis:**

1. **H2 is already saturated and refinement cannot touch it.** Every one of 120,000 surface points is
   within 9.65 um of the BEFORE mesh and no point is over the 10 um bar on any of the three. The surface
   is COVERED; the defect is entirely in the other direction.
2. **H1 spikes at round 1 by AREA (1.486% -> 3.603%, x2.42) while its COUNT barely moves (10.40% ->
   10.20%)** — mesh that stands off the surface, created by the split, on bigger pieces. That is exactly
   what §2.3's fold/tent predicts (+24.5% of area that is not on the surface) and it is measured here by
   an independent instrument, in the product's own ruler, on the real S65 output. **The one real harm in
   S65 is the fold, and it shows up as H1 area, not as orientation.**
3. **By round 4 it converges anyway**: H1 area 1.025% (BELOW the baseline), witnessed p99 120.95 -> 26.27 um
   (**4.6x better**), max 157.33 -> 51.13 (3.1x). The tents get refined away.
4. **The blind plane ruler under-reports position ~19x at p99 on this mesh.** S65's own position column
   read `6.40 -> 6.02 -> 4.40 um`; the honest witness reads `120.95 -> 110.67 -> 26.27 um`. Both agree on
   the DIRECTION (improving) and disagree on the LEVEL by a factor of 19. S65's position claim was
   directionally right and quantitatively meaningless.

## 8. WHAT THIS LEAVES FOR THE TEAM

**For LAND and COLLAPSE — the `s/h` model you were told to build on is refuted, and here is the
replacement in one line:** a split can improve a facet's orientation by at most the angle it rotates a
child through, that rotation is `atan(dPerp/aPerp)` with `dPerp <= s`, and on Voronoi's failing class the
child that would deliver the needed rotation has aspect ratio **3,009**. Refinement is a position
instrument. **Voronoi's class is yours, not mine** — collapse the sliver or move the existing vertices.
On Gothic and LowPoly refinement DOES work (20–22% of the over-bar area per round against the null), so
those two do not need you.

**Three things I would change in files I do not own** (writing them down rather than making them):
1. `s65SplitAndFlip.ts` — the split rule needs the P4 guard (§6). As it stands it folds 24.55% of the
   children it makes on Voronoi and inflates area 25%. Two cross products, no extra `rA` evaluations, and
   BIT-IDENTICAL on LowPolyFacet.
2. Any before/after orientation comparison across a refinement round must be quoted against the **NO-LIFT
   NULL** (§2.5). Subdivision alone moves the metric x0.88–x0.99 with the surface bit-identical.
3. The orientation SIZING quantity should be the **circumradius**, not the diameter (§4.3 + arXiv:1911.03424).
   `aspect3` is already a proxy for it and is already computed; the sizing field is not.

## 9. WHAT I DID NOT DO — named, not glossed

* **No mesher arm.** Every number here is a VIRTUAL split on a finished STL. LEB propagation, the
  conformity closure, hanging-node handling and multi-round compounding are unmeasured for P3/P4/1->4.
  The only multi-round evidence is §7, and that is S65's mesh, not mine.
* **No render.** The fold claim rests on two independent certificates — `rho > 90 deg` against the parent
  normal (24.55% of children) and `sum(child area)/parent area = 1.2508 > 1`, which is a PROOF of
  non-tiling since a planar 1->2 split conserves area exactly — but I did not produce a picture of one.
  If anyone doubts the fold, that is the cheapest thing to add and I did not add it.
* **I did not adjudicate the orientation ruler on Voronoi.** `theta_par` p50 **64.5 deg** on the marked
  population is scored against the analytic graph `r = rA(th,z)`. Whether a facet on a near-vertical
  Voronoi cell wall is a legitimate target for that comparison is a question for `orientRuler.ts`'s owner.
  Every verdict of mine is a PAIRED before/after on the same facets with the same ruler, so a calibration
  error in `theta` cancels — but the ABSOLUTE Voronoi orientation level does not come from me.
* **The 1->4 arm is a per-facet measurement, not a refinement scheme.** Red-green closure, the cost of
  hanging nodes on all three edges, and what 1->4 does to the sliver class over multiple rounds are all
  unmeasured.
* **`P2 PERP-FOOT` uses a 24-step bracket + 40 bisections along the normal.** It failed to bracket on
  6.7% of Voronoi's marked facets (3,731/4,000 valid) and those are excluded from its row. A better root
  finder might change P2's numbers; it would not change the verdict, because P2's failure mode is a
  388 um p99 travel, not a missed root.
