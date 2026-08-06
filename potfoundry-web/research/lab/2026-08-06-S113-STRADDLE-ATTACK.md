# S113 — THE CREASE PROGRAMME HAS NO HEADROOM ON THIS CLASS, AND S112 NEEDS THREE CORRECTIONS

**2026-08-06.** 22 agents, 4.05 M tokens, 0 errors. Target: the pinned 3,282 straddling crease pairs
(`S113_STRADDLE_GOTH.ndjson`, 6,193 facets, 69.826 mm² = 0.1816% of mesh). Four candidate operators, each
adversarially verified by three refuters; three independent reviews of the S112 driver work.

---

## 0. THE HEADLINE

***THREE CONSTRUCTIVE OPERATORS WERE BUILT, RUN AND ALL THREE ARE REFUTED — AND THE ORACLE EXPLAINS WHY:
99.40% OF THE TARGET AREA SITS WHERE THE ANALYTIC SURFACE ITSELF TURNS ≥ 45°.*** A genuine crease in the
surface must appear in any correct mesh. The >45° dihedral test is therefore **not a defect detector on
this surface**, and the mesh proves it directly: **18,430 wall facets carrying 641.841 mm² — 94.83% of ALL
area the >45° test flags — are accurate to `normDeg` p50 1.95° / MAX 4.99° and still render a p50 159.76°
dihedral.**

Only **15.8233 mm² (0.0411% of mesh, 1,537 facets)** genuinely straddles in its interior, and there the
achievable win is a **FIDELITY** win of ~35–73×, **not a visibility win**.

***AND THE ALIGNED EDGE IS ALREADY THERE.*** On 67.95% of pairs (59.70% of class area) the crease lies
within the driver's own 1.5 µm split floor of the shared edge, *everywhere along it*. Only **303 facets =
1.54% of the class = 0.0028% of mesh** admit a legal NEW aligned edge under the shipping guards.

---

## 1. THE FOUR OPERATORS

| operator | cost | verdict | why |
|---|---|---|---|
| **FLIP** the shared edge | 0 tris | ***REFUTED*** | clears only **0.524%** of class area past 45°; the apparent 1.329× is **99.5% just facets getting smaller** (the two cuts of a non-planar quad differ in area); multiplies 1-ring over-bar area **10.2×**; and **destroys existing conformance, 38.32% → 3.45%** of flipped facets keeping an edge on the crease |
| **CONFORM SPLIT** at the crossing | +0.12% tris | ***REFUTED*** at 1.081× vs a 2.0× line | **90.0% of crease crossings land within 1.5 µm of an EXISTING VERTEX**, so it reaches only 10.08% of class area — and a **cost-matched midpoint PLACEBO scored 1.080×**, i.e. *the crease location itself bought 1.001×* |
| **VERTEX SNAP** onto the crease | 0 tris | ***REFUTED*** at every rung | **43.13% of target area already has a vertex ON the crease** (move3d p90 = 24 nm) and is *still* over bar ⇒ provably a no-op there; best reduction 1.921× < 2.0× while pushing **463 facets over 0.01 mm**, inverting 813, collapsing 252, and putting **102.7%** of the removed area back into the rest of the mesh |
| **ORACLE** (upper bound) | — | **CONFIRMED** | 99.40% of target area is **irreducible**; the reducible remainder is 0.0411% of mesh |

The split's **placebo control is the most important single number in this run.** An operator that scores
1.081× while a cost-matched random placebo scores 1.080× has not demonstrated that crease location does
anything. This campaign has accepted levers on smaller margins than that.

## 2. WHY — THE CHARACTERISATION

**The mesh is already conformed, in both senses.** 56.7% of target-facet area has a vertex on the locus at
the f32 floor (vs **0.0%** of centroids — a two-sided control), and the shared edges are already aligned in
*direction*: edge-vs-crease-tangent **p50 3.0°**, 98.9% of area under 15°, against a **shuffled control at
41.2°**. Only 6.0% of area has a crease crossing a facet interior transversally.

***The residual is CHORD SAG OF A CURVED LOCUS, not a straddle in the usual sense.*** 70.0% by count /
78.6% by area of pairs have **both** shared-edge endpoints on the crease, while 99.3% of that area has the
**midpoint off it by p50 3.0 µm** — on facets whose own perpendicular reach is only 31.9 µm. You cannot
fix that by putting an edge on the crease; the edge *is* on the crease at both ends. It is a
straight-chord-vs-curved-locus problem, and the only cures are more chords (density — which fixture H2
says cannot fix the *angle*) or a curved edge (which the format does not have).

**The driver never had one reason to touch them.** On the driver's own ruler the 6,193 target facets are
**0.876× BETTER positioned than the median mesh facet** (41.55th percentile), with only **0.49% of their
area over `acceptTol`** — while being **17× worse in angle** (`normDeg` p50 68.96° vs a 4.06° control;
58.00% of their area over 45° vs 0.14%). The demand is position-only and winding-invariant
(`Math.abs` at `_sagKernel.ts:98`); all three veto branches were inert; `CONFORM_FIRST` was **OFF**; and
had these facets been popped anyway, `SNAP` would have refused **86.27%** of their area on the
`SNAP_ALPHA` end-band guard.

## 3. THREE CORRECTIONS TO S112 — TWO OF THEM VERIFIED BY ME, NOT JUST ASSERTED BY A REVIEWER

### 3a. ***C4 IS REFUTED. THE DRIVER DOES CONTAIN AN ANGULAR QUANTITY.*** (I verified this by reading.)

`_strataConformBisectL.test.ts:3474-3492`, `shardOf`:

```
:3490   const d = admBestDot(cth, (pz + qq + sz) / 3, fx, fy, fz);
:3491   return Math.acos(Math.max(-1, Math.min(1, d))) * (180 / Math.PI) >= DESHARD_DEV;
```

That is an **angle in degrees** against `DESHARD_DEV` (default **45**, `:3353`) — not a sign test — and it
**drives triangle selection** in the DESHARD pass at `:4070`/`:4077`/`:4101`. It is flag-gated
(`PF_CB_DESHARD`, `:3341`, default OFF).

**The accurate claim is narrower than the one I published:** the driver's *refinement demand*
(`consider`/`_sagKernel`) has no angular term, and the one angular quantity the driver *does* contain sits
in a **default-off de-sharding pass**. ***Someone already built an angular selector into the driver and it
is switched off.*** My error was inheriting a **name-based grep** (`normDeg|normRad|orientOfFacet|dihedral|
supAngle` = 0 hits) from the deep review and repeating it without reading the code. The driver spells its
angle inline as `Math.acos(...)`, which no name in that list matches. I verified C1/C2/C3 by reading and
did not extend the same treatment to C4.

**C1, C2, C3 all VERIFIED from source** — and C1 additionally confirmed by measurement (zero sub-floor
facets in the class; min max-edge 5.642 µm = 3.76× `FLOOR_MM`).

### 3b. ***P3 WAS COMPUTED ON A CONTAMINATED POPULATION.*** (Reproduced independently: 58.98°.)

S112 published *"crease `normDeg − spreadDeg` p50 **0.20°** ⇒ at the median the facet is already as good as
any single plane over its footprint."* That was computed over the **whole wall crease class (11,146
pairs)** — of which **60.48% is the CONFORMED population S112 itself declares non-defective**, and whose
`normDeg` is ~0 *by construction*. On the pinned straddling target set the same statistic reads:

```
normDeg            p10  69.92   p50 135.77   p90 156.28
spreadDeg          p10  21.49   p50  75.27   p90  91.92
normDeg-spreadDeg  p10  25.28   p50  58.98   p90  84.51
```

***P3's stated evidence is void.*** Its *conclusion* — that the crease demand must be discharged by
geometry rather than scoring — survives, but only via §1's independent oracle route, not via P3.

### 3c. THE 12.7× IS CONTESTED IN BOTH DIRECTIONS AND IS NOT ADJUDICATED

Two reviewers moved it opposite ways, and I am recording both rather than picking:

- **Reviewer A (scope):** the **curtain leg is REFUTED** — that class is *continuous, on-surface steep
  wall* (analytic Jacobian up to 13.69), **not** non-graph, so scoping it out was wrong. Leg 2's stated
  mechanism ("a vertex sits on the crease") fails at 0.94× but its substance survives at 219.65× on a
  normal-free instrument. Honest figure **0.2400% of mesh — S112 is 1.28× LOW.**
- **Reviewer B (code):** class area is credited **per pair** while the claim is **per facet**; only 62% of
  pinned facets individually straddle, carrying 58.5% of the area ⇒ **0.1062% — S112 is 1.71× HIGH.**

**Unadjudicated.** What is *not* in dispute: the S108 figure of 2.3699% overstates the defect, and §1's
oracle bounds the genuinely-reducible part at **0.0411% of mesh** independently of either correction.

### 3d. `spreadRad` IS NOT CONVERGED IN LATTICE ORDER

p50 **90.1 / 75.3 / 58.8 / 44.5 / 36.7** at k = 4/8/16/32/64 — still falling 0.76–0.82× per doubling —
while `normDeg` is converged to 4 digits. **P1 and P3 both divide by or subtract `spreadRad`, so both are
quoted at an arbitrary k.** My published k-ladder showed only the converged column. Any future use of
`spreadRad` must carry its own ladder.

### 3e. P2 SURVIVES, BUT IT IS EVIDENCE FOR THE WRONG OPERATOR

The kill line survives every re-operationalisation attempted (worst case **3.26%** vs the 5% bar). But P2
measured a **flip/replace-fixable** population, whereas the veto at `:2816` **re-queues for refinement** —
it does not flip or replace. The verdict "do not wire an angular accept-side veto" stands; the *reasoning*
should be §1's (refinement cannot fix a straddle; H2, ×0.9968 over five halvings), not P2's.

## 4. A NEW DEFECT IN THE SHIPPED RULER — `locateTurn` / `locateTurnAdaptive` LOSE ASYMMETRIC CREASES

Beyond the known `:529` tie-break: the bisection probes **at the midpoint**, whose own finite-difference
window straddles the crease and returns an intermediate normal, so **the half containing the crease can
look like the smaller turn and the bracket discards it.** Symmetric kinks survive; asymmetric ones return
a plausible *"no crease"*.

Closed-form tent fixture `r = 40 + 2·max(0, 1−|θ−0.3|/0.01)`, edge θ 0.292→0.318, two expected crossings:
`s 0.30769 turn 156.28°` (symmetric crest) and `s 0.69231 turn 78.69°` (asymmetric outer clamp).
Bisection returned the crest exactly and read the clamp as `s 0.69266 turn 0.000°` while a scan across the
same bracket read **78.7°**. Replacing bisection with a re-scan (bracket widened one cell, turn read a full
bracket outside) recovers both exactly. ***This affects S99 and anything keyed to the locator.***

Also worth carrying: two independent crease detectors **disagree on WHERE the crease is** — dense scan vs
`locateTurnAdaptive` at a 15° bar: agree 6,834, scan-only 1,998, loc-only 1,217; where both fire, 146 of
6,834 differ by more than `FLOOR_MM` (max 0.68 mm). **An operator keyed to a single 1-D locator is placing
edges on a contested location.**

## 5. WHAT THIS MEANS FOR THE CAMPAIGN

1. ***Stop treating adjacent-facet dihedral as a defect metric on crease-bearing styles.*** 94.83% of the
   area it flags on Gothic is carried by facets accurate to `normDeg` MAX 4.99°.
2. ***The crease/aligned-edge programme is CLOSED for this class.*** The edge is already on the crease;
   three operators that move it are refuted; the oracle bounds the remainder at 0.0411% of mesh, where the
   prize is fidelity, not appearance.
3. **The one genuinely open item is small and now precisely located:** 1,537 facets / 15.8233 mm² with a
   true interior straddle, worth ~35–73× in fidelity. That is a *fidelity* target, and it should be
   attacked (if at all) with the ~59° of orientation headroom §3b exposes — not with a dihedral bar.
4. **Untouched, and still the biggest gap:** every number here is **Gothic**. The all-styles sweep on the
   honest ruler has still not been run.
