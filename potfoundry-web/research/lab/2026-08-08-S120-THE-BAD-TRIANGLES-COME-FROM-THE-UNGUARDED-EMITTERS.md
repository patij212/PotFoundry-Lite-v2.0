# S120 — EVERY BAD TRIANGLE IN THE MESH COMES FROM AN UNGUARDED AUXILIARY EMITTER. THE REFINEMENT LOOP MAKES NONE.

**2026-08-08.** 6 agents, 1.75 M tokens, 0 errors. All work in the driver. ***The mechanism the user asked
for is isolated, and it is not where this campaign has been looking for nine sessions.***

---

## 0. THE ANSWER — "WHAT CREATES A BAD TRIANGLE?"

***NOT THE REFINEMENT LOOP. IT CONTRIBUTES ZERO.*** Every 3-D-bad facet in the shipped STL comes from one
of the two emitters that have **no admission test at all**:

| emitter | bad facets | worst 3-D aspect | vs the driver's own AR>50 cap |
|---|---|---|---|
| ***`stitchRings` (treads)*** | **707 of 4,394 = 16.09%** | **191.01** | ***3.82× over*** |
| ***the ALIGNED SEED*** (Gothic) | 3 of 254,926 | 85.13 | 1.70× over |
| **`bisectAt` (the refinement loop)** | ***0*** | ≤ 49.99 | **under, always** |

An **independent exhaustive STL scan in a separate process with a separate transcription of `aspect3`**
finds **714 over-cap facets mesh-wide on CelticTriquetra — and 707 of them sit in the three 0.1 mm z-bands
that are exactly the driver's three detected C0 steps.** The driver even says it out loud about the seed:
*"initial grid: 3 of 254926 facets over the cap, worst AR 85.13 … BORN OVER THE CAP … FROZEN into the STL."*

***`stitchRings` (`:4605-4635`) had never been audited once in this entire campaign.***

## 1. ⛔ THE "DEGENERACY POLE" IS NOT A BAD-TRIANGLE CLASS

Of **3,499 CelticTriquetra poles and 735 Gothic poles, NOT ONE exceeds the driver's own AR>50 cap** —
worst 49.99 / 45.07, min 3-D altitude 2.911 / 4.238 µm. ***`graphRatio ≥ 100` means "this facet stands on
a near-vertical piece of surface", not "this facet is a sliver".*** The class is also tiny: **0.1254%
(CT) / 0.0107% (Gothic)** of mesh area.

**S115–S119 chased a parameter-space artefact that corresponds to well-shaped 3-D triangles.**

## 2. ⛔ S119's DIAGNOSIS IS REFUTED BY COUNTING IT

S119's NO-GO rested on an *inferred* single-candidate escape hatch at `FLOOR_MM`. Counted exhaustively:

> ***`|cand|` is NEVER 0 and NEVER 1 in 1,060,746 pops across both styles.***
> `FLOOR_MM` rejected an edge in **30 pops total** (0.0036% / 0.0018%).
> Restricted to S119's own population (parent thin < 0.02): ***100% of pops had ≥ 2 candidates.***

***The reorder was never blocked.*** Exhaustiveness is **provable from the data, not asserted**: recorded
births equal the driver's own `alloc` exactly (2,500,000 / 2,029,406), seed count equals `seedTris`
exactly, and pop count equals the driver's `splits` counter exactly — so no birth was mis-filed and no pop
silently dropped.

## 3. THE CASCADE, MEASURED DIRECTLY — AND ITS STRUCTURAL CAUSE

Counted on **exact parent→child links taken inside `bisectAt`**, not inferred from a fitted exponent:

> **P(child pole | parent pole) = 66.26% (CT) / 79.47% (Gothic)**
> ***risk ratio 513.5× / 2,430.6×***, over 2,444,000 / 1,774,480 exact pairs.

**It has seeds:** the entire pole class descends from **409 of 56,000** seed facets on CT (0.73%) and
**156 of 254,926** on Gothic (0.061%).

⭐⭐ ***THE STRUCTURAL CEILING — THIS IS THE CASCADE'S CAUSE.*** `bisectAt` splits **every** triangle
incident to the chosen edge (that is what makes conformity structural). So ***~half of all births are
IMPOSED on a neighbour that never ran the candidate loop*** — no candidacy test, no aspect guard, no
floor, **no say in which of its own edges is cut**. That side carries ***70.0% (CT) and 77.3% (Gothic) of
ALL pole births, at 2.34× / 3.40× the pole rate.***

⇒ ***ANY REMEDY THAT TESTS ONLY THE POPPED FACET — every selector lever this campaign has tried, S119's
parameter metric included — CAN REACH AT MOST 23–30% OF POLE BIRTHS.***

## 4. THE EDGE RULER — THE USER'S STANDARD, MEASURED FOR THE FIRST TIME

Built, ***validated 9/9 two-sided***, both baselines scored exhaustively with a convergence ladder.

- ⭐ ***THE CAMPAIGN'S PUBLISHED POSITION MAXIMUM IS ALREADY AN EDGE POINT*** — **bit-identically on
  Gothic: 0.3326750914641975 mm from both rulers, 16 digits.** The per-facet ruler had been finding the
  worst edge by accident.
- It nonetheless **under-reads the true edge max by 1.0701× (Gothic) / 1.0024× (CT)**.
- ***THE EDGE STANDARD INVALIDATES NO PUBLISHED VERDICT:*** only **128 CT facets (0.0009% of area)** and
  ***ZERO Gothic facets*** pass per-facet while carrying a failing edge.
- ⚠ ***The driver's own rank key is 40.7% blind to edge conformance on CelticTriquetra.***
- ⚠ ***THE TREAD EMITTER IS STILL UNMEASURED AT THE EDGE STANDARD.*** Both baselines are pure WALL meshes
  (CT has exactly 400 boundary edges = 2 rims × 200 columns), so `stitchRings` is not exercised by either
  STL — **its edges have never been scored per-facet OR per-edge.** Given §0, that is now the top gap.

**On "every vertex and every edge on the surface":** vertices are on `rA` by construction (`addV`
`:481-495`) — that half is done and verified (PRECOND perpendicular max **0.334 µm** CT / **0.0138 µm**
Gothic). Edges are chords, so the achievable standard is max-along-edge ≤ tol, and by that standard the
wall meshes are **far closer than feared** — the failure is concentrated in the unaudited emitters.

## 5. THE FIX ATTEMPT — A REAL PARTIAL WIN, AND ITS VERIFIER REFUTED IT

1-ring **min-max-`aspect3` retriangulation at the strand site**, in the driver, default-off flag,
flag-OFF byte-identical (re-verified independently: `b739496a…` CT, `9f6547a1…` Gothic).

**What worked:** headline facet MAX cut ***2.36× (CT) / 1.71× (Gothic)*** at **+0.2% triangles**, no wall
cost, and the **stranded class halved on both styles**.

⛔ **What did not:**
- ***THE CASCADE IS UNCHANGED — pole α went UP: 2.401 → 2.537 (CT), 3.847 → 4.254 (Gothic).***
- ***EDGE-CONFORMANCE MAX DID NOT MOVE BY ONE BIT*** (0.8529409403771623 mm, 16 digits, both arms).
- **min arc altitude moved the wrong way.**
- ***A FOLD CLASS APPEARED FROM ZERO*** (99 CT / 29 Gothic) whose cause the agent's own guard refuted —
  the operator provably cannot emit one, `bisectAt`'s birth census reports fold 0 in both arms. **Unexplained.**
- ⚠ **Its verifier REFUTED it** on *"anything made worse and not reported"* and on the placebo comparison —
  scope, provenance, byte-identity and the 4-rung ladder all independently reproduced (all 18 arms print
  the same driver md5; exponents re-fit by hand), but *"the refutation is one line above the line the
  headline was quoted from."*

***Consistent with §3: a strand-site operator is still a popped-facet remedy, and §3 caps those at 23–30%.***

## 6. WHAT TO DO NEXT — AND IT IS NOW SHORT

1. ***FIX `stitchRings`.*** It emits **16.09% of its facets over the driver's own aspect cap, at up to
   3.82× the cap**, with no admission test and no parameter-space placement. ***It is the single largest
   source of genuinely bad triangles in the product, and it has never been touched.***
2. ***FIX THE ALIGNED SEED.*** It births facets over the cap that are **frozen into the STL** — the driver
   already prints this and nobody acted on it. A seed defect cannot be repaired downstream.
3. ***SCORE THE TREADS AT THE EDGE STANDARD.*** They are absent from both baselines, so every conformance
   number in this campaign describes a wall-only mesh.
4. ***STOP OPTIMISING THE ARC-SPACE POLE*** until §1 is re-examined — it contains no 3-D-bad triangles.
5. **If the cascade is still worth attacking, it must be attacked on the IMPOSED side** (§3): give the
   neighbour a say in which of its own edges is cut, or accept the 23–30% ceiling.
6. Explain the 99/29 folds before landing the retriangulation operator.
