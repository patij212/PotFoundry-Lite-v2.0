# S118 — DENSITY REPRODUCED AND AMPLIFIED THE ARTEFACTS, EXACTLY AS PREDICTED, AND IT NAMED THE MECHANISM

**2026-08-08.** 6 agents, 1.83 M tokens, 0 errors. Neither floor closed. ***That is the useful outcome:
the amplification separated the artefact classes and each one now has a named cause.***

---

## 0. MY DIAGNOSIS WAS WRONG, AND THE CORRECTION IS THE FOUNDATION

***`bisectAt` ALREADY HAS BOTH APCR PROPERTIES.*** It splits every live incident triangle in one loop, so
a hanging node never exists; and `edgeParam(a,b,t)` (`:501`) fed to `addV` (`:481-495`) **is** the exact
parameter midpoint lifted onto `rA`. My proposed "port APCR into bisectAt" is a **no-op** — it is exactly
`PF_CB_MID3D=0`. The sign property does not even need t=0.5, only t strictly interior, which every
placement satisfies.

***AND THE DRIVER EMITS ZERO PARAMETRIC FOLDS.*** In f64, at birth and in the finished soup, on both
styles: fold count **0**, area **0.0000 mm²**. ***The campaign's "fold class" is not a fold class.***
The 11 "folds" the offline census reads on the published STL are **f32 write-rounding of
exactly-degenerate facets** (f32 quantum at r=51 mm is 6.1 nm; the f64 census reports worst |qP| 5.6e-9).

***THE REAL ARTEFACT IS DEGENERACY, NOT INVERSION.*** APCR's argument forbids a *sign flip*; ***it does
not forbid walking into the degeneracy pole.*** Longest-**3D**-edge bisection on a genuine radius cliff
does exactly that: halving Δθ barely shortens a 3D edge that spans a step, so the parametric footprint is
driven toward zero while the 3D length stays large. CelticTriquetra's mesh-wide **min arc altitude is
exactly 0.000 nm**; Gothic's floor is 11.037 nm and its blade area 7.2× smaller.

## 1. ⭐ THE DENSITY LADDER — THE SESSION'S ACTUAL RESULT

**CelticTriquetra, analytic-free tests only** (CEIL is vacuous there):

| mesh | facets | needles (abs <2 µm) | sign inversions | degeneracy poles | min arc altitude |
|---|---|---|---|---|---|
| grid seed | 960,000 | **0** | **0** | **0** | 168,258 nm |
| GRIDM | 3,479,998 | **0** | **0** | **0** | 6,248 nm |
| PLACEBO | 3,479,999 | **0** | **0** | **0** | 24,998 nm |
| GRID2 | 10,479,996 | 4,931,230 (47.05%) | **0** | **905,689 (8.64%)** | 4.374 nm |
| OP2 | 10,641,194 | 8,995,821 (84.54%) | 94 (0.0009%) | **1,907,269 (17.92%)** | **0.000 nm** |

***ARTEFACTS WERE EXACTLY ZERO AT 3.48 M FACETS AND CAME BACK AT 10.5 M.*** By-construction placement
***held for the footprint sign at every density*** (0 inversions from the grid seed all the way up) but
***did not hold for altitude or for the degeneracy pole.***

**Gothic, same question, opposite answer:** 0 sign inversions, 0 poles, and **0 facets below any
scale-free thinness bar up to τ = 0.10** at both 2.37 M and 10.5 M — worst shape ratio 0.373 → **0.371**.
***The classes stay zero when density rises 4.43×, which no previous density increase in this campaign has
managed.***

### 1a. The instrument fix that makes the ladder readable

The campaign's needle test conflates two things, and at these densities the absolute bar stops being a
shape test at all. Split them:

- **NEEDLE — absolute** (arc min altitude < 2 µm). Scale-*dependent*.
- **THIN — scale-free** (arc minAlt / longest arc edge). ***This is the shape test.***

On Gothic, **100.0000%** of the 9,472 "absolute needles" are ***well-shaped facets that are merely
small*** (min 3D edge 1.834 µm = 481× the f32 quantum). ***So a large part of CelticTriquetra's needle
explosion is the bar, not the mesh.*** But not all of it: min altitude also fell **6,248 → 4.374 nm** for
only a 3.01× count rise, ***which shrinkage cannot explain.*** Both effects are present and were not
separated — ***that is the single most important measurement still owed.***

⭐ ***THE POLES ARE THE UNCONFOUNDED SIGNAL.*** `graphRatio ≥ 100` is scale-free, and it goes
**0 → 0 → 8.64% → 17.92%**. ***That is a genuine, scale-free amplification with density, and it is the
target.***

## 2. ⭐ THE CELTICTRIQUETRA CLIFF IS PROVEN IRREDUCIBLE — WITH A SIGNATURE

**73–83% of CT's surviving 0.01 mm residual is a 1.720469 mm analytic cliff that no mesh can remove.**

***PROVEN, NOT ASSUMED.*** On an **exact** mesh (every vertex on `rA`, so chord error only) refined 16×:

- **off-cliff residual falls 9.03×** (113.0069 → 12.5104 µm)
- ***cliff-straddling residual falls 1.002×*** (852.7 → 851.2 µm) — **dead flat**

**The mechanism:** the ruler's surface model is the *graph of `rA`* and contains **no points inside the
jump**, while any closed solid **must** span it — so a cliff facet reads ≈ jump/2 forever. The signature
is exact: the projector returns **847.437 µm at half cliff height** (predicted 860.2), **423.698 at
quarter** (430.1), **169.475 at 10%** (172.0), **33.894 at 2%** (34.4) — ***linear in height.***
The jump survived a bracket collapsing to **4.44e-16 rad**, and the same `Math.floor(angle/(CT_TAU/3))` is
in the shipping shader (`styles.wgsl:1765`) as well as `src/geometry/styles.ts:2263` — ***it is the shape
on both paths, not a CPU bug.*** Mesh-wide MAX is 0.851 mm on **every** arm, placebo and baseline included.

***THE REDUCIBLE CLASS DID CLOSE HARD: 0.2758% → 0.0354% of mesh area, 7.79×.***

⚠ ***AND THE SCALING LAW DOES NOT HOLD ON CT: error ~ h^0.79, NOT h².*** Sixteen-fold refinement bought
only 9.03×. CT's `rA` is built from `max`/`smax`. ***The 0.001 mm bill on this style is therefore far
worse than the 10× triangle estimate, and that estimate must be withdrawn for CT.***

## 3. GOTHIC — GENERATION, NOT REFINEMENT

***The agent stopped refining the driver's STL and generated the mesh instead*** (uniform (θ,z) seed →
Rivara LEPP in the **parameter** metric → exact parameter-midpoint radial lift, f32-rounded at birth).

- **0.01 mm did NOT close — 296 facets / 0.107 mm² / 0.000279% of area / MAX 0.0146 mm**
- ***109× less over-bar AREA than the STRATA baseline at 2.08× triangles***
- ***51,813× less than the cost-matched placebo at the same triangle count***
- topology: non-manifold **0**, inconsistent winding **0**; PRECOND exhaustive, 7,112,304 corners
- ⚠ **the radial ruler over-reads by 6.45× here** (9.4881% vs 0.000279%) — it would have been
  catastrophically wrong

**0.001 mm did not close and is not close.** At 1.05e7 facets ~11% of the scanned prefix is still over —
and ***the work list had not peaked*** (1.27 M at 9.0 M live, 1.32 M at 10.3 M live). Rung 1's peaked at
247,504 by 1.51 M and fell to zero by 2.37 M; ***rung 2 never turned that corner.***

⚠ ***AN UNADJUDICATED CONFLICT THAT MAY MEAN RUNG 1 ACTUALLY CLOSED.*** The drive's `perpUB` certifies
≤0.01 mm **with an explicit surface-point witness**; `buildRadialSurfaceProjector` reads up to 0.01461 mm
at the same lattice points. **Both are upper bounds, so the truth is ≤0.01** — one cheap local brute-force
evaluation decides whether Gothic's 0.01 mm floor is already met. ***It was not run.***

## 4. BOTH VERIFIERS REFUTED — AND BOTH FOUND REAL DEFECTS

- **Gothic:** refuted on ***"an artefact class that grew with density and was not reported"*** — the
  rung-2 paragraph is silent on the over-ceiling class. The verifier ran the dihedral pass on the 10.5 M
  mesh themselves and it **grew from 32**. Everything else reproduced to the digit.
- **CelticTriquetra:** refuted on a reproduced measurement defect — `s118CtApcr.ts:656` adjudicates worst
  corners under an ***undisclosed hard cap of 40,000*** while printing *"EXHAUSTIVE, every corner, no
  stride"*. Re-measured uncapped, OP2 has **213,252 corners over 0.02 µm** — 5.3× the cap. ***The printed
  PRECOND is a lower bound of an unfinished scan.***

## 5. WHAT TO DO NEXT — THE TARGETS ARE NOW NAMED

1. ***RUN THE SCALE-FREE THIN LADDER ON CELTICTRIQUETRA.*** Gothic's agent built it; CT was never scored
   with it. That one measurement separates "the 2 µm bar is absolute" from "the mesh really degenerated",
   and it is the largest open number in the session.
2. ***ATTACK THE DEGENERACY POLE, NOT THE FOLD.*** Poles are scale-free and amplify 0 → 8.64% → 17.92%.
   The cause is named: **longest-3D-edge selection on a radius cliff**. ***Select the longest edge in the
   PARAMETER metric instead*** — Gothic's generated arm already does exactly that and has zero poles at
   10.5 M facets.
3. ***STOP SCORING CLIFF FACETS AGAINST THE GRAPH OF `rA`.*** The ruler has no points inside the jump, so
   it reads ≈ jump/2 forever. A cliff needs a two-sided surface model or it must be excluded and reported
   separately — as S103 did for treads.
4. **Adjudicate Gothic's 296** (§3). It may already be zero.
5. **Fix the 40,000 cap** and re-issue CT's PRECOND.
6. ***Withdraw the "0.001 costs 10× triangles" estimate for CelticTriquetra*** — measured `h^0.79`.
