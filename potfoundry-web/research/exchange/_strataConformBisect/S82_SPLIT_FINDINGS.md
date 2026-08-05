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
