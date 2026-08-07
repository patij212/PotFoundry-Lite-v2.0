# S115 — CELTICTRIQUETRA'S DEFECT IS **FOLDS**, THE MECHANISM IS NAMED, AND ONE OPERATOR CLEARED 54.7% BEFORE ITS OWN CONTROL KILLED IT

**2026-08-07.** 18 agents, 4.14 M tokens, 0 errors, ~137 min. Target: CelticTriquetra
(`celtictriquetra_ring_D--.stl`, 1,714,638 facets, 49,604.859 mm²).

---

## 0. THE HEADLINES

1. ***CELTICTRIQUETRA'S 2.06% IS REAL AND GROWS.*** At the h-stable rung it is **2.2973% of mesh**
   (1,139.57 mm²), and with **no curtain cut at all** — which needs no threshold — **2.61%**. Against
   Gothic's **0.0316%** on the same instrument at the same h: ***72.7×.*** The reproduction control passed
   to **16 digits**.
2. ***THE MECHANISM IS NAMED, AND IT IS NONE OF THE CANDIDATES.*** Not creases, not slivers, not
   under-resolution, not density. ***FLANK-ALIGNED NEEDLE PAIRS ("BLADES"/FOLDS):*** **67.67%** of the
   >45° class AREA is triangles standing within **1.2° of edge-on** to the radial direction over a surface
   whose actual slope is **1.46**, folded back-to-back at ~180°. ***72.76% of the class area carries a
   dihedral ABOVE the surface's own analytic ceiling of 163.41° — the surface provably cannot produce
   it.*** Gothic on the same instrument: **0.73%**.
3. ***IT IS NOT A REMESH PRIZE.*** A turn-equalised analytic grid at matched triangle count is **1.69×
   WORSE** than the shipping mesh (5.3969% vs 3.1969%); the pre-registered kill line fired by **3.4×**.
   The shipping mesh has **10× LESS** 45–90° cliff area than a matched grid (0.4674% vs 4.7196%).
   ***The generator already solves the cliff. It makes folds instead.*** The prize is **fold repair at
   ~0 triangle cost**, not a remesh and not density.
4. ***AN OPERATOR CLEARED 54.7% — AND THE AGENT'S OWN ADDED CONTROL REFUTED IT ON POSITION.***

## 1. ⛔ CORRECTION — MY S114 h-PANIC WAS OVER-CORRECTED, AND I AMPLIFIED IT

**S114's prediction that the Gothic funnel collapses at honest h is REFUTED.** Measured: the class
**shrinks 1.109× (0.1816% → 0.1638% of mesh)** and is **flat below h = 2e-6**. The published funnel
reproduces **exactly at every stage**. ***And the h-scar's own 5e-3 endpoint is VOID by its own negative
control*** — so S114's "4,656 of 6,193 facets are h-artifacts" was itself measured at a void endpoint.

Independently confirmed from the other direction: **S114's *accounting* was already h-converged even
though its raw `normDeg` statistic is not.** Gothic's reducible target is h-invariant to **1.0020×**
(12.14 → 12.17 mm²) across the very arms on which class `normDeg` collapses 68×, because the accounting
counts the ACCURATE bucket 100% irreducible by construction.

**What survives of the h scar:** `normDeg` as a raw statistic *is* h-dependent on conformed meshes
(Gothic p50 150.150 → 2.206, a 68.1× collapse) — but that is a fact about the statistic, not about the
published areas. ***I reported the stronger claim last session. It was wrong, and the correction is
measured, not rhetorical.***

**And the two routes still disagree:** the funnel and the interior-crease route differ **3.8× by area**,
with B a **97.7% subset** of A. Unresolved.

## 2. WHY GOTHIC AND CELTICTRIQUETRA DIFFER — CONFORMANCE, MEASURED AS INSET-COUPLING

At h = 2e-6, Gothic's class `normDeg` p50 falls **151.105 (inset 0) → 2.206 (inset 0.05)**, a **68.5×**
drop. CelticTriquetra's falls **64.277 → 62.159**, only **1.034×**.

***Gothic's reading lives on the footprint CORNERS — its vertices sit on the loci, which is what a
conformed mesh looks like. CelticTriquetra's lives in the footprint INTERIOR — which is what an
unconformed mesh spanning a turn looks like.*** Locus density is *not* the discriminator (both styles
carry loci inside 94–100% of their >45° footprints); **conformance is.**

Also settled: **h is NOT resolving the knot bands.** They are millimetre-scale (ribbon half-width
0.840–2.571 mm) — **168× larger than the largest h rung**. h is reaching **turn loci** that sit inside
97.7–100% of the footprints.

## 3. `graphRatio` FINALLY UNDERSTOOD — AND 57.5% OF THE CLASS SITS ON ITS POLE

***`graphRatio` is not one quantity: it is RADIAL TILT WITH A DEGENERACY POLE.*** **57.5% of
CelticTriquetra's >45° class area sits ON the pole** — 32,220 facets carrying **1.85% of the mesh's 3D
area while covering 0.0001% of the parameter domain**. Confirmed independently: they are **49.71%
orientation-inverted**, a dead 50/50 split, ***exactly as a shadow-collapsed class must be.***

***The K-ladder was never the unconverged knob — h was.*** The curtain irreducible share converges to
**21.12% at K = 16/32/64** once h ≤ 2e-7, against 28.74% at the campaign default h = 2e-4.

⚠ **A NEW HARD DEFECT, found by that agent's own C1 control: exhaustive PRECOND is 1,374.8 µm — 27× the
gate — on 4 facets.** The stride-sampled PRECOND (0.0253 µm) missed them entirely. ***Stride sampling
cannot find rare extremes; PRECOND must be exhaustive or declared as a sample.***

## 4. ⛔ CORRECTION — THE "2.994% INVERTED" I QUOTED WAS A SUB-CLASS SHARE

I reported CelticTriquetra's inverted area as **2.994% of mesh vs Gothic's 0.006–0.013%, "a 200×
anomaly."** ***That was wrong: 2.994% was a share OF THE SAMPLED SUB-CLASS. As a mesh share it is
0.0048%, and the Gothic gap is 8.3×, not 200×.***

But the **whole-mesh census — never run before in this campaign** — finds a genuinely larger class: the
h/inset/k-robust inverted population is **442.38 mm² = 0.8918% OF THE MESH**, surviving all 20 inset × h
configurations (92.67% of base area), **99.46% CURTAIN**, with **~1/3 ray-confirmed genuinely
inside-out**. ***It is NOT flippable at zero cost:*** winding reversal costs **2.386 new winding defects
per facet fixed**, and the 2-2 flip clears **4.98%** of target area against a **25%** kill line while
making 6.72% of targets worse.

## 5. THE OPERATORS

| operator | verdict | result |
|---|---|---|
| **DE-BLADE by fin excision** (apex weld) | ***PARTIAL — does not ship*** | clears **54.673%** of class area (1,585.8 → 718.8 mm²), **76.13%** of over-ceiling area, **83.91%** of blade area, at **−1.71% triangles**, watertight-equivalent, h/k/inset-stable to 1.000008×, placebo **2.24× WORSE** |
| **Constrained 2-2 FLIP** | ***REFUTED*** | unconditional arm **indistinguishable from random** (0.9933× vs placebo 0.9944×); guarded arm beats placebo but **1.0339× against a 2.0× line** |
| **ORACLE / structured remesh** | PARTIAL | the 2.65% reducible is real and bar-invariant, **but a matched-count analytic grid is 1.69× WORSE** |

### 5a. The de-blade almost shipped, and its author killed it

The operator **passed its own five-part pre-registered kill line**, then the control the same agent added
in the same file refuted it: restricted to where the radial position projector is **honest**
(`|rDot| > 0.2`), the weld pushes ***39.13% of its new honest facets over the 0.01 mm export bar***
against a 4.279% shipping baseline, **MAX 1.037 mm** against 0.03949 mm — **9.1× the rate, 26.3× the max**.

***K4 passed only because it was written on the UNRESTRICTED projector, which is dominated by curtain
facets that are 99.075% already over the bar and is therefore blind.*** Under the hard 0.01 mm bar the
operator does not ship. **This is the cleanest self-refutation the campaign has produced: a pre-registered
gate passed, and a better instrument built afterwards overturned it.**

An independent area control says the *direction* is right: analytic area **48,348.368 mm²** (converged),
the shipping mesh carries **1,256.491 mm² (2.5988%) of EXCESS**, and the weld removes **69.35%** of that
excess without undershooting. **The fins are real and they are garbage. The weld is the wrong way to
remove them.**

### 5b. The flip reproduced S100's scar exactly

Its **scoped** score reads a 1.0597× "win" while the **whole mesh gets WORSE (0.9933×)** — ***100.0 mm² of
defect RELOCATED into the 1-ring.*** Binding constraint is **REACH, not the accept rule**: **41.7% of
candidates are refused because the class's own needle/blade geometry makes the quad NON-CONVEX**, so the
guarded arm touches 11.24% of class area and only **6.78% of the blade mechanism that carries 67.7% of
it.** h-stable, k-converged, and flat across the class bar from 30–175°, so no instrument scar props the
verdict up.

## 6. CROSS-STYLE — THREE GROUPS, NOT ONE

They **do** share slivers (**15×–2,640× enriched** in the class), but ***one operator does not serve all
six***: on **4 of 7 styles 79–99% of the class area is CURTAIN**, where no analytic ruler is defined, and
***ArtDeco does not share the mechanism at all*** (enrichment **×0.96**, min-altitude p50 **363 µm**
against 5.9–8.7 µm everywhere else). **Three real groups exist.**

## 7. WHAT TO DO NEXT

1. ***Remove the fins without moving position.*** The excess is real (1,256 mm², 2.6%) and 69% of it is
   reachable; the apex weld is simply the wrong primitive. Try deletion-plus-retriangulation of the fin
   footprint, or prevent fin creation in the generator.
2. ***Find out why the generator makes folds.*** It already beats a structured grid 10× on cliffs. Folds
   above the analytic ceiling are provably mesh-made — this is a **generator bug**, not a refinement gap,
   and it is now localised to a named geometry.
3. **Fix PRECOND** to be exhaustive (4 facets at 1,374.8 µm hid behind a stride sample).
4. **Reconcile the funnel vs interior-crease routes** (3.8× apart, B ⊂ A at 97.7%).
5. Never quote a sub-class share as a mesh share again (§4).
