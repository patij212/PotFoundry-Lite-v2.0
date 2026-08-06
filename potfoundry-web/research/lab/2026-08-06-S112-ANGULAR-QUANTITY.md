# S112 — THE ANGULAR QUANTITY: ALREADY BUILT, AND MEASURED NOT WORTH WIRING

**2026-08-06.** Tools: `research/tools/s112AngularDecomp.ts`, `research/tools/s112bOrientDiag.ts`.
Mesh: `gothicarches_ring_DS-HT_S39CTL.stl` (1,142,166 facets, 38,453.3 mm², PRECOND 0.0310 µm — S111's
exact reference). Instrument: `orientRuler.orientOfFacet`, 11/11 closed-form fixtures re-validated first.

---

## 0. THE HEADLINE

***THE VISIBLE CLASS IS 12.7× SMALLER THAN THE CAMPAIGN HAS BEEN QUOTING.*** S108's 2.3699% of shipping
AREA over 45° adjacent dihedral contains, once the ruler is scoped to where it is defined and the
crease-conformed facets are separated from the crease-straddling ones, **0.1872% of mesh area of genuine
defect.** The remainder is a **curtain class** the ruler cannot score and a **conformed class that is the
mesher's good work being indicted by a sampling artefact.**

***AND THE SESSION'S NAMED DELIVERABLE IS REFUTED BY ITS OWN PRE-REGISTERED KILL LINE.*** The population an
angular accept-side veto could fix is **0.57% of the visible class by area** against a registered 5% bar.
**Do not wire an angular veto into the driver.** The number is 0.02% / 0.84% / 0.57% at inset 0 / 0.02 /
0.05 — it is the one quantity in this session that does *not* move with the option that voided run 1, so
the kill is robust, not an artefact of a threshold choice.

---

## 1. THREE CORRECTIONS TO THE ENTRY BRIEF, BEFORE ANY MEASUREMENT

**(1) `:2807` DOES NOT EXPLAIN S20'S DEAD ACCEPT-SIDE VETO. THE MECHANISM IS WRONG.**
`_strataConformBisectL.test.ts:2807` reads `if (le < FLOOR_MM) { …; return; }` where `le` is the facet's
MAX edge. It returns for **sub-floor triangles only**; it does not shadow the accept-side veto at `:2816`
for any ordinary facet. **And the denominator is mislabelled.** `admitChecks` (`:1428`, incremented at
`:1458` inside `footBack`) is ONE counter shared by the split side (`:1524`/`:1525`, two calls per bisect
candidate), the hub path (`:4195`/`:4197`) and the census sweep (`:4859`–`:4880`). 5,313,594 is that
total; the accept-side denominator was never logged, so "0 of 5,313,594" is 0 out of an unknown number.
The likely real cause of `admitForcedPush == 0` is **composition** — `ADMIT_NORMAL_SPLIT` refused 38,133
back-facing children *at birth*, so none survived to be offered at the accept test.

**(2) S20 WAS NEVER AN ANGULAR QUANTITY.** `footBack` (`:1454`–`:1484`) is a **4-way AND of sign tests**
(`admBestDot >= 0` at the centroid and all three vertices). It can only catch fully inverted facets —
S98's 0.006–0.013% class. Repairing its ordering would not give the driver an angle. **"Fix `:2807`" is
not a route to the crease demand.**

**(3) THE ANGULAR QUANTITY IS ALREADY BUILT, VALIDATED AND SHIPPING.** `research/bridge/orientRuler.ts`
→ `orientOfFacet` returns `normRad`/`normDeg` (footprint-sup of ∠(facet normal, analytic normal),
order-*k* barycentric covering, winding-sensitive), plus `spreadRad`, `kinkRad`, `overFrac` and a sound
accept-side `bound`. 9 closed-form fixtures; ~30 tools import it. **The driver is the one thing that does
not.** The deep review's "0 hits in 5,670 lines" was scoped to the driver. ***The gap was WIRING, not
construction*** — and §0 is the measurement saying the wiring is not worth doing.

---

## 2. RUN 1 WAS VOID AND ITS OWN NEGATIVE CONTROL CAUGHT IT

Run 1 read `normDeg` **p50 154.9°** on the visible class and **p90 162.8°** on LOW-dihedral (<2°) pairs —
facets that are mutually flat and visibly fine. `S91_CENSUS_ALL20.log` reads `inverted>90deg 0` on every
mesh it censused with the same ruler at the same *k*. The control fired; the run was discarded.
`s112bOrientDiag.ts` found **two defects, both mine, neither in the ruler**:

- ***I USED `inset: 0`. THE ONLY KNOWN-GOOD CALLER (`s91StyleCensus.ts:341`) USES 0.02.*** Measured on
  this STL that single option moves `inverted>90deg` **1,485 → 195** and `normDeg` p99 **164.55 → 60.41**.
  It is the ruler's own documented false alarm (`orientRuler.ts:213-224`): a finite-difference normal
  evaluated *exactly on* a C0 crease returns the average of the two flanks — and a crease-conformed mesh
  puts its vertices exactly there **on purpose**.
- ***MY SELECTION WAS PERFECTLY CORRELATED WITH THE ARTEFACT.*** I conditioned on the high-dihedral class,
  which *is* the crease population — where the artefact is strongest. A whole-mesh reading would have
  shown `normDeg` p50 **4.76°** immediately.

**And the control bar itself was mis-specified**, which I am recording rather than deleting. It asserted an
ABSOLUTE bar (p90 < 5°) and fired at 6.48. The premise — "visibly fine ⇒ small `normDeg`" — is the exact
dissociation **S108 had already refuted**: two facets tilted the same way are mutually flat while both are
off the surface. The correct control is RELATIVE, and it now passes: low-dihedral p90 **6.082°** against a
whole-mesh p90 of **9.439°** — locally-flat facets read *better* than the mesh at large.

### 2b. The diagnostic's structural finding

| hypothesis | separator | verdict |
|---|---|---|
| H-A STL winding inverted vs analytic outward normal | sign of `f·n` at centroid | **EXCLUDED** — negative on 0.132%, p50 dot 0.9998 |
| H-B **curtain/cliff facets — not a graph of `rA`** | radial alignment `\|f·r̂\|` | **CONFIRMED** — p50 **0.1847** vs **0.7054**; `\|r_th\|/r` p50 **2.81** vs **0.83** |
| H-C finite-difference breakdown at large `r_th` | correlation | consistent with H-B, not separable from it |
| H-D θ=0 seam artefact | distance to seam | **EXCLUDED** — both populations spread over the circle |

The driver already knows this class exists: `locateKinkRaw` carries a `jump` flag and the driver calls
jump-class loci *"curtain material, never a snap"* (`:2886`).

---

## 3. THE SCOPED CENSUS (inset 0.05, k=8, kink-aware sampler, winding)

### 3a. Scope — is the ruler even defined here?

`graphRatio` = 3D area ÷ (r·θ, z) parameter-plane area. A wall facet tilted 60° reads 2.0; a vertical
curtain spans no parameter area and diverges.

| | n | % of class | AREA % of mesh |
|---|---|---|---|
| **WALL** (a graph of `rA` — scored) | 13,092 | 66.86% | 1.7602% |
| **CURTAIN** (not a graph — reported) | 6,490 | 33.14% | 0.6111% |

⚠ ***THE CURTAIN SHARE IS NOT ROBUST BY AREA AND MUST NOT BE QUOTED AS A SINGLE NUMBER.*** Cut sweep:
4× → 2.1337%, 8× → 0.6111%, 16× → 0.0256%, 64× → 0.0171% of mesh area. The *existence* of the class is
solid (H-B, two independent separators); its *size* moves 125× across a plausible threshold range. What
is safe to say: a curtain facet at 160° **is not a defect** — a cliff is a real 3D feature the mesh is
supposed to have — and S108 measured the dihedral without ever asking the question.

### 3b. P0 (new) — CONFORMED vs STRADDLING, from the inset drop

`normDeg(inset 0.05) / normDeg(inset 0)`. The class is **not converged in inset** (p50 157.079 → 93.055 →
39.358 → 2.442 at inset 0 / 0.01 / 0.02 / 0.05) while it **is converged in lattice order** (2.442 at
k = 4, 8 **and** 16). So the sup is attained on the footprint **boundary** — at the vertices — which is
precisely where a conformed mesh puts them.

| | n | % of wall class | AREA % of mesh |
|---|---|---|---|
| **CONFORMED** (falsely indicted) | 7,918 | 60.48% | 1.5731% |
| **STRADDLING** (genuine defect) | 5,174 | 39.52% | **0.1872%** |
| …straddling **and** crease-labelled | 3,282 | 25.07% | 0.1816% |

Inset-drop over the whole wall class: p10 0.006, **p50 0.018**, p90 0.999. The median facet in the
visible class loses **98.2%** of its `normDeg` to an inset — it is conformed, not defective.

***GENUINE DEFECT AREA 0.1872% OF MESH, AGAINST THE 2.3699% THE UNSCOPED CENSUS REPORTS — 12.7×.***
And fixture H2 proves refinement cannot fix what remains: the straddle angle is density-invariant
(×0.9968 over five halvings) against a smooth control at ×28.43.

### 3c. P1 — CONFIRMED as registered

`spreadDeg / normDeg`: **CREASE p50 0.911** vs **RESIDUAL p50 0.137** ⇒ **6.66× separation**
(registered: crease ≥ 0.50, residual ≤ 0.25, kill below 1.5×). The ruler's own documented dichotomy —
*surface turns inside the footprint* (split/align) versus *facet mis-oriented against a flat field*
(flip/re-place, zero triangle cost) — **holds, and gets stronger after scoping.**

### 3d. P2 — ***KILL LINE FIRED. DO NOT BUILD THE WIRING.***

Flip/replace-fixable (both facets `spreadDeg` < 5 **and** max `normDeg` > 10): **288 pairs = 0.57% of the
visible class by area**, against a registered 5% bar. Robust across the whole inset ladder
(**0.02% / 0.84% / 0.57%** at inset 0 / 0.02 / 0.05). ***An angular accept-side veto in the driver cannot
pay for itself.***

### 3e. P3 — the angular quantity does not reach the crease class

Crease-class `normDeg − spreadDeg`: p10 **−0.02°**, p50 **0.20°**, p90 65.67°. ***At the median the facet
is already as good as any single plane can be over that footprint.*** No veto that merely *reads* an angle
can improve it. **The crease demand must be discharged by GEOMETRY, and P3 is the measurement that says so
rather than the assumption that said so.**

### 3f. Ladders (subsample n=400, at inset 0.05)

- **k**: 2.442 at k=4, 8, 16 — converged.
- **sampler**: kink-aware vs central p50 **1.003**, p90 **1.011**. ***This corrects a suspicion I raised
  mid-session***: S111's `fdNormalsCentral` is **not** materially under-reading. The divergence visible at
  inset 0.02 (p90 2.573) was the inset artefact, not a sampler bias.
- **convention**: winding vs outward p50 identical; `signMargin` p10 0.542, so the outward decision is not
  a coin toss here. MAX still moves (161.45 vs 170.14) — *shares move a little, maxima move a lot* holds.

---

## 4. WHAT THIS CHANGES, AND WHAT IS STILL OPEN

1. ***Withdraw "2.37% of shipping area is visible defect."*** The scoped figure is **0.1872%**, and the
   difference is not refinement — it is a curtain class the analytic ruler cannot score plus a conformed
   class a sampling artefact indicted. **Any lever priced against the 2.37% denominator is mis-priced.**
2. ***The driver does not get an angular quantity.*** Not because it has one (it does not) and not because
   one does not exist (`orientOfFacet` does), but because the population it could fix is **0.57%** of the
   class, measured against a bar registered before the run.
3. ***The crease demand is confirmed as a GEOMETRY problem, not a scoring problem*** (P3, and H2's
   density-invariance). S100's finding stands and now has a mechanism: raising the demand cannot help when
   the facet is already plane-optimal over its footprint.
4. **Still open, and now better posed:** the **3,282 straddling crease-labelled pairs at 0.1816% of mesh
   area** are the whole remaining crease problem on Gothic. That is a small enough set to attack
   exhaustively, and it is 4.7× smaller than the 15,424 the campaign has been aiming at.
5. **Not done this session:** the all-styles sweep (everything here is Gothic), and the ~12% mesh-added
   class — whose S111 label is now itself suspect, since S111's `measDeg/footMax` used inset-free lattice
   sampling on crease vertices. **Re-run S111's dichotomy at inset 0.05 before building anything on it.**

## 5. METHOD SCAR, FOR THE NEXT SESSION

***AN OPTION DEFAULT IS A MEASUREMENT CHOICE.*** `inset` defaults to 0 in `OrientOpts`; the only
known-good caller passes 0.02; the honest value on this class is 0.05; and the quantity moves **64×**
across that range. I took the default, and the only thing that caught it was a negative control I had
written for a different reason — and whose bar was itself wrong. **Sweep every option that a prior caller
bothered to set explicitly, and diff PRINTED VALUES against that caller before trusting a verdict.**
