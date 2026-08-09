# S121 — BOTH FIXES BUILT, TESTED AND SAFE. NEITHER CLOSES AT THE SHIPPING BUDGET. THE ROOT CAUSES ARE ONE LEVEL UP.

**2026-08-09.** 5 agents, 1.56 M tokens, 0 errors. All work in the driver.
***The honest answer to "confirm outcome successfully" is: NO. Over-cap is still 714 at the shipping
budget; the target was zero.*** What the session did deliver is two precisely named root causes and one
large correction in our favour.

---

## 0. ⛔ FIRST, A CORRECTION TO MY OWN BRIEF

I told the agents *"both baselines are pure WALL meshes, so `stitchRings` is not exercised by either
committed STL."* ***THAT IS A NON-SEQUITUR AND IT IS WRONG.*** The treads are in the shipped STL and
always have been:

> wall alone re-welded → **4,794 boundary edges**. Whole mesh → **400**.
> ***The 4,394 tread facets REMOVE 4,394 boundary edges (91.66%). The treads are what CLOSES the wall.***

Confirmed by a from-scratch independent STL scanner sharing no code with the session's tools. Gothic
negative control: wall-only boundary 1,160 == whole-mesh 1,160, 0 treads. **I propagated this error from
S120's report into the S121 brief; every "wall-only" caveat in the S120 record is withdrawn.**

## 1. ⭐ THE ONE BIG WIN — 98% OF THE TREADS' POSITION FAILURE WAS THE RULER

Treads scored for the first time. They do carry **99.02% of the mesh's over-cap facets, at 29,377×
enrichment** — that part of S120 stands. But against the ***TRUE STEPPED SOLID***, rather than the graph
of `rA` which has no annulus in it:

> ***position failure collapses 42.5× by COUNT, 72× by AREA, 6.5× by MAX.***
> ***~98% of the treads' apparent position failure was the ruler not knowing the annulus exists.***

Reconciliation with published work is exact — wall + tread sums to S120's whole-mesh rows to the digit
(197,299 / 1,043,141 / 9,670.543 mm²). Every control fired clean, including a weld+CSR vs
`facetDihedralsBig` identity check and 0 violations of perpendicular ≤ radial.

## 2. ⛔ S120's TREAD DIAGNOSIS IS REFUTED — AND THE REAL CAUSE IS BETTER

***`stitchRings` is NOT a greedy 3-D zip.*** It is already a strict **θ-merge** that advances whichever
ring is behind in θ, so neither ring can run ahead (`:5213-5227`, read before any edit). ***S120's
proposed remedy "zip in the parameter domain" is already what the code does, and no choice function can
fix the defect.***

***THE ACTUAL CAUSE IS THE DRIVER'S OWN 8 µm z-GAP.*** `PF_CB_STEP_EPS_UM` holds the wall bands off each
detected C0 step by **4 µm per side**. Every triangle a strip between two polylines can contain has a ring
edge as its base, so ***aspect3 ≈ chord / 8 µm*** — over the cap for any chord above 50 × 8 µm = **0.4 mm**,
against a seed ring pitch of **1.51 mm**.

> Exhaustive, 1,282,394 facets, no stride: over-cap 714; **dz p50 8.0032e-3 mm, dz < 10 µm on 707 of 714**;
> altitude tracks dz on 409 and ***tracks the radial cliff dr on ZERO.***

***And `zSteps` is a SCALAR per step:*** the wall is cut at that z across **all θ**, including the θ where
`R` is smooth in z and the two loops are radially coincident to microns — **dr < 10 µm on 157 of 714 while
dr p50 is 0.43 mm**. There the "tread annulus" has zero width and is nothing but an 8 µm ribbon.

***This is a parameter/geometry-generation defect, not an emitter defect.***
**Pre-registered prediction (marked NOT A RESULT, its arm had not finished):** at
`PF_CB_STEP_EPS_UM = 16`, worst tread aspect = 190.93 × 4/16 = **47.7 — under the cap** — but with a 16 µm
position residual that fails 0.01 mm everywhere. **That is the trade to price next.**

## 3. FIX 1 — SAFE, TESTED, AND DENSITY-DEPENDENT

TDD verified end to end: the new tests ***genuinely fail against the committed emitter*** (exit 1,
`expected 174 to be +0`), and a bit-identity check proves `rounds:0` **is** git HEAD's `stitchRings`
(337 tris, **0 differing coordinates**). On the unit fixture the fix is total: **174 over-cap → 0**,
MAX 333.64 → 0.00, topology unchanged, wall area conserved to < 1e-12.

⚠ ***ITS FIRST DRIVER-SCALE VERSION REGRESSED THE MAX 77.7×*** (190.93 → 14,842.46) while improving COUNT
and AREA — caught by its own verifier *and* the independent scan. Mechanism: a mirrored θ lands near an
existing node, the wall fan-child would be a sliver, admission refuses it, **but the base on the other
ring has already been shortened**, so aspect blows up. It now carries a **monotone commit-or-rollback
guard** — a round commits only on strict improvement scored on the same walk that emits — so the worst
case is inert. ***That is regression-proof by construction, not by tuning.***

⭐ ***BUT "INERT" WAS A ONE-DENSITY ARTEFACT, AND THE INDEPENDENT TESTER CAUGHT IT:***

| triCap | result |
|---|---|
| **250,000** | ***2.77× / 4.17× / 1.59× BETTER on COUNT / AREA / MAX*** |
| **625,000** | ***COUNT WORSE (1,177 → 1,188)*** — the guard is **lexicographic, not componentwise** |
| **2,500,000** (shipping) | **INERT** — 714 over-cap, byte-identical to control |

***The "never A/B at one density" lesson bit again*** — the fix agent ran only the shipping budget.
A componentwise `better` is a one-line change and is **untested**.

## 4. FIX 2 — REFUTED 9-OF-9, AND IT IS GEOMETRY

The 3 over-cap seed facets are not a stray lattice row. They are ***TWO TRACED LOCI RUNNING 21–28 µm APART
IN z AT z = 18.0000***, both handed to `cdt2d` as constraints, forcing the triangulation to fill a 25 µm
ribbon that is millimetres long. Every vertex of every blade is a constraint endpoint.

> flips tried **9**, DONE **0** — refused: **on-locus 3, fold/non-convex 6**, no-strict-gain 0, illegal 0.
> ***The blades have no legal flip. It is geometry, not a conservative guard.***

⚠ **A guard defect caught and corrected mid-flight:** the first locus test asked `vFeat[p] && vFeat[q]`
("are both endpoints constraint endpoints"), which is true for all 9 edges — ***a VETO masquerading as a
gate***, which would have refused everything while proving nothing. Retested against the seed builder's
actual constraint **segments**, only **one edge per blade** is a real constraint, and the other two fail
for an independent geometric reason.

## 5. WHAT IS PROVEN SAFE

- ***Flag-OFF byte-identity at full scale, all 8 arms (2 styles × 4 flag combinations)***, re-verified
  independently by two agents: every CT arm `ca7e8bb32baec7a24b934e77eb6bb82c` = the published baseline;
  every Gothic arm `9d5061f111f683ce65644809ded04876` = the published baseline.
- ***Topology never degrades in any arm:*** non-manifold 0, reversed 0, seam-crack 0; boundary 400 (CT) /
  1,160 (Gothic), loops 2 — unchanged.
- ⚠ One verifier **REFUTED** the fix's central safety characterisation (the guard is lexicographic where
  the module comment claims componentwise) — falsified with a mesh it produced from the driver itself.

## 6. NEXT — THE ROOT CAUSES, NOW NAMED

1. ***PRICE `PF_CB_STEP_EPS_UM`.*** The 8 µm gap *is* the tread aspect defect (aspect ≈ chord/gap).
   Sweep it — 4 / 8 / 16 / 32 µm — against over-cap AND the position residual it buys. The prediction is
   47.7 aspect at 16 µm with a 16 µm position cost; **measure the whole curve, not one point.**
2. ***STOP CUTTING THE WALL WHERE THE STEP HAS NO RADIAL EXTENT.*** `zSteps` is a scalar applied at all θ;
   157 of 714 bad facets sit where `dr < 10 µm`. Make the cut θ-dependent and those facets never exist.
3. ***FIX THE SEED'S CONSTRAINT GENERATION, NOT ITS TRIANGULATION.*** Two loci 21–28 µm apart cannot be
   triangulated well; merge or snap them before `cdt2d` sees them.
4. **Make FIX 1's guard componentwise** (one line) and re-run the density ladder to find the crossover.
5. ***Re-score everything against the TRUE STEPPED SOLID*** — §1 shows the graph-of-`rA` ruler overstates
   tread position failure by ~50×.
