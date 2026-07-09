# The Perfect Mesher â€” Frontier Tournament Synthesis (PI/DIRECTOR)

**Date:** 2026-07-04 Â· **Author:** PI/DIRECTOR synthesis Â· **Branch:** refactor/core-migration
**Scope:** dev-only oracle (research/), nothing ships, no src/ or kernel edit. Trust ONLY verified measurements.

This document synthesizes the DRIVE-0.01 frontier tournament: 4 champion architectures raced on the LAST
wall (zero-width `ridge(sharp)` cusps on count-unstable feature networks â€” GothicArches, GeometricStar),
each with a MEASURED cheapest-proxy and an INDEPENDENT adversarial re-check. The winner is the ONE approach
whose measured proxy reached **0 outlier triangles on the hardest Gothic cusp and survived a dense-sampler,
worst-population adversarial re-audit**.

---

## 1. THE UNIFYING THESIS

**Every wall in the campaign is one object: a locus where the height field's tangent-plane approximation
breaks â€” a discontinuity in position (C0 step/seam), tangent (C1 crease), or feature-graph topology
(birth/merge). Every durable win is the same move: land mesh geometry EXACTLY ON that locus and measure
perpendicular to it. The campaign never won by adding density under a sizing field; it won by
placement + classification + a metric that sees the true 3D interior.**

The walls partition by a second axis the FRONTIER-THESIS undersold â€” not just "smooth vs steep" but whether
the feature graph is **COUNT-STABLE**:

- **Tier A â€” single-valued smooth field, no protected locus:** density under M=g/hÂ² closes it (5 smooth +
  Gyroid/Voronoi/Crystalline/HexHive). Bounded second form â‡’ flat facet chord â†’ 0 at finite density.
- **Tier B â€” designed cliff with a COUNT-STABLE trackable feature curve:** embed the locus as a
  zero-serration mesh edge; the flat facets on each side are then on-surface (ArtDeco, DragonScales,
  BasketWeave, CelticKnot/Triquetra, LowPoly, Bamboo, SFB-seam). ALL six winning primitives are this.
- **Tier C â€” designed cusp on a COUNT-UNSTABLE network:** the locus births/merges (Gothic diagonal rib net,
  GeoStar 6â†’32 chevrons) OR is zero-width (`ridge(sharp)`, flankSpanArc=0 on 56% of worst facets). HELD
  against 5 distinct levers.

### The one failing load-bearing assumption (shared by all 6 wins AND all 5 refuted levers)

> **The mesh element is a P1 FLAT simplex in the (u,t) chart, refined by a SIZING FIELD applied UNIFORMLY,
> and the only free variable is WHERE the vertices sit.**

Two flips are required and were BOTH proven necessary by the tournament:
1. **The refinement criterion must be the measured per-triangle INTERIOR true-3D deviation** (a-posteriori,
   surface-projected), NOT a sizing field â€” because the field is BLIND on near-vertical flanks (the
   E-GF-GOTHIC root cause: radial/chord reads ~0 where the true 3D sag is 0.06mm).
2. **Density must be concentrated where the flank is near-vertical** (the restricted-Delaunay facet-interior
   criterion) with the crest as a **protected no-bridge shared edge** â€” NOT uniform pitch (which floors).

The "0.09mm irreducible floor" was proven to be a **UNIFORM-DENSITY chart-lift artifact**, not a
representation limit â€” but ONLY the surface-native no-bridge + arc-length-graded mechanism actually
removed it under an honest ruler on the honest (worst) population.

---

## 2. TOURNAMENT SCORECARD

Ruler for all four: per-triangle INTERIOR true-3D deviation (max over centroid + edge-mids + barycentric
lattice, back-projected to the true surface), outlier = interior > 0.01mm. "Verified 0-outlier" = an
INDEPENDENT re-audit reproduced 0 outliers on the WORST-cusp population with a DENSE sampler.

| # | Approach | Assumption changed | Proxy MEASURED (outliers beforeâ†’after, cost, converged) | Adversarial verdict | Verified 0-outlier on Gothic? |
|---|---|---|---|---|---|
| 1 | **SURFACE-NATIVE no-bridge + arc-length-GRADED flank** (restricted-Delaunay, protected crest 1-feature, facet-interior sizing) | DOMAIN: mesh grown so crest = shared mesh edge (no facet straddles apex) + density by 3D arc-length (near-vertical flank) instead of uniform | flat-UV 109 â†’ **graded-SN 0**; 6016 tris on the single WORST cusp (t=0.62, apex curv 657/mm); **CONVERGENT** worstNp50 0.047â†’0.018â†’**0.006**, max 0.069â†’0.019â†’**0.006**, strictly âˆ’slope | **CONFIRMED** (independently reproduced; 15-pt dense stencil under trusted 4096Ã—600 brute â†’ 0 outliers, max 0.006; nDegen=0; crestEdges 47/47) | **YES** â€” on the sharpest cusp, dense re-audit, worst population |
| 2 | **CREST-RIBBON P2-oracle** (Vlachos PN element order P1â†’one-sided PN + flatten-to-tol) | ELEMENT ORDER at the crest: P1 â†’ curved PN, then subdivide-to-tol with on-surface midpoints | RAW PN **FAILED its own kill-criterion** (CONFIRMED=false, 34.2% >0.02); only `emit-flatten` reached tol: L2 113/113 â‰¤0.01, max 0.0098, dense NB=12 verify max 0.0091 | **CONFIRMED-with-scope** BUT **population-contaminated**: emit-flatten used **uniform stride + flankDropâ‰¥0.02** (the exact selection the INTRINSIC-APEX skeptic overturned) + a coarse `selfWorst` split-trigger with an L-cap | **NO (contaminated)** â€” the actual closer is subdivide-with-on-surface-midpoints, and that SAME recursion was refuted on the worst-gradU population (see #4) |
| 3 | **FULL FEATURE-GRAPH + JUNCTION RESOLUTION** (multi-family Morse skeleton, apex 0-cells, protecting disks, boundary-of-domain refinement) | CONSTRAINT MODEL: grow the mesh FROM a topologically-complete ridge graph; junctions are first-class vertices | flat 121 â†’ **champion 343** (MORE); recovery **100%**, familyCount 2, residualCrossings 0 â€” every structural gate fired â€” yet worst floored **0.091mm**, flank-pitch-INVARIANT (0.251â†’0.205â†’0.091 tracks segment pitch, no convergence) | **REFUTED (upheld)** â€” independent dense re-measure at a DIFFERENT apex: recovery 99.5%, 543 outliers, worst **0.1064** â‰¥ 0.091. Graph-completeness is NOT Gothic's bottleneck | **NO** â€” proves graph model alone floors |
| 4 | **DIRECT OUTLIER-ELIM via intrinsic apex-edge** (a-posteriori interior criterion + local Bowyer-Watson + intrinsic/geodesic crest edge) | REP+CONSTRAINT+CRITERION at once: interior-deviation refinement over a protected complex with an intrinsic crest edge | bare apex-fan 400 â†’ 400 (**NO-OP**, slope +0.006); flank-M floors 400/400 at p50 0.048; apex-strip SINGULAR-FLOOR slope âˆ’0.64, p99 frozen 0.052; `reconcile` claimed 112/113 via Steiner recursion | **REFUTED** â€” the reconcile CONFIRM did NOT survive: on the WORST-gradU population + dense 36-pt sampler, top-12 â†’ **12/12 outliers**, top-30 â†’ 24/30, p99 **0.061mm**; 6 leaves hit the L5 cap UNCONVERGED | **NO** â€” the flatten recursion floors at the `pow(sharp)` singularity (~0.06mm) on the honest population |

### The decisive cross-contamination finding

Approaches **#2 (emit-flatten) and #4 (reconcile) share the SAME mechanism** â€” recursive flank subdivision
with on-surface midpoints, split-triggered by a coarse local ruler, on a **uniform-stride + flankDrop-filtered
population**. The #4 adversarial re-check (commit bb46aa9) PROVED this mechanism, run on the honest
worst-gradU population with a â‰¥36-pt sampler, leaves 80â€“100% of cusps as outliers floored at ~0.06mm. That
refutation transitively **taints #2's emit-flatten CONFIRM**: it "reached tol" only because it (a) selected an
easier strided population and (b) used a coarse `selfWorst` early-stop that under-reports the near-apex leaf.
The RAW PN element (#2's actual novel contribution) FAILED its own kill-criterion outright (34.2% > 0.02).

**Only SURFACE-NATIVE (#1) reached 0 outliers on the SINGLE HARDEST cusp (not a strided population) and
survived a dense-stencil re-audit under the trusted full-azimuth brute.** It is the sole surviving CONFIRM.

---

## 3. THE WINNER + GRAFTED IDEAS

### WINNER: SURFACE-NATIVE no-bridge + arc-length-GRADED (facet-interior-criterion) flank density

The only approach whose measured proxy reached **0 outlier triangles (max 0.006mm)** on the hardest Gothic
zero-width cusp AND was independently confirmed on the worst population with a dense sampler. Its two
mechanisms are BOTH necessary and TOGETHER sufficient WITH FLAT P1 triangles:
1. **NO-BRIDGE domain split** â€” the crest ridge is a protected 1-feature (a chain of shared mesh edges); two
   flank facets MEET at the apex, none straddles it. This removes the apex-bridge floor (max 0.14 â†’ 0.06).
   At K4 the diagnosis confirmed 0/40 worst facets are apex-crossing, 40/40 are flank-near-crest.
2. **FACET-INTERIOR-CRITERION flank density** â€” flank nodes placed by equalizing 3D arc-length (density where
   the flank is near-vertical), i.e. the restricted-Delaunay facet-interior criterion. This removes the
   residual near-crest flank chord (max 0.06 â†’ 0.006, outliers â†’ 0).

Crucially it did NOT require a curved/PN element â€” flat P1 suffices once the domain is split and density is
driven by the TRUE-3D interior deviation rather than a radial sizing field.

### GRAFTED ideas from the runners-up (the hybrid is the perfect mesher)

- **From #3 (FGJ), the banked reusable win:** multi-family (u+t) Morse-ridge extraction + `planarizeConstraintGraph`
  produced a clean **residualCrossings=0, 100%-recovery** junction PLC on the count-unstable network. FGJ failed
  ONLY because it used uniform flank pitch â€” its GRAPH machinery is exactly the protected-crest-network extractor
  the winner needs at whole-mesh scale (the proxy was one clean cusp, not a junction). **Graft: FGJ's junction
  graph feeds SURFNATIVE's protected 1-complex.**
- **From #4, the honest negative that scopes the winner:** the near-apex leaf inherits the `pow(sharp)`
  singularity; flat-Steiner recursion floors at ~0.06 there. This tells the winner that arc-length grading (which
  concentrates ON the near-vertical flank, a DIFFERENT lever than crest-tangent subdivision) is the load-bearing
  move â€” and warns that a leaf-count / aspect cap + accept-tiny-residual policy may be needed at the sharpest
  corners. **Graft: use #4's SINGULAR-FLOOR diagnosis as the acceptance guard (â‰¥36-pt sampler, worst-gradU
  population, cap-hit leaves counted as outliers).**
- **From #2, the correctly-scoped element option:** a genuine curved P2/PN element remains the fallback IF the
  arc-length grading produces intractable slivers at the sharpest corner. The winner's HONEST CAVEAT is exactly
  this: grading makes slivers (minAngle 13.8Â°, 96.3% <20Â°). **Graft: keep the PN element in reserve for the
  sliver-quality gate, but do NOT need it for the 0-outlier gate.**

---

## 4. THE PERFECT-MESHER ARCHITECTURE

**One kernel: feature-protected restricted-Delaunay refinement under M=g/hÂ², where the protected complex is a
persistence-stable Morse ridge graph, and refinement is driven by the measured TRUE-3D per-triangle interior
deviation.** The 6 proven primitives are its count-stable, empty-or-single-family, sizing-field restriction.

### Dispatch / subsumption of the 6 proven primitives

| Proven primitive | = this kernel withâ€¦ |
|---|---|
| dense-M-square (5 smooth) | EMPTY protected complex; interior-criterion refine under M |
| CDT-under-M + deep-sag (Gyroid/Voronoi/Crystalline/HexHive) | empty complex + interior chord-sag Steiner |
| doubled-rings (Bamboo) | protected complex = horizontal t=const lines |
| doubled-grid (BasketWeave/DragonScales) | protected complex = axis/swept grid |
| doubled-crest (ArtDeco/LowPoly/CelticKnot) | protected complex = monotone crest curve |
| seam-doubled-edge (SFB) | protected complex = single Î¸=0 seam |

Everything OFF the protected complex is byte-identical to today's kernel output â‡’ zero regression on Tier-A/B.

### The step-by-step algorithm (closes the cusp)

0. **Precompute the true-surface ruler.** Build a BVH / full-azimuth brute over dense (u,t)â†’3D truth for
   O(log n) nearest-point back-projection. This is the honest interior ruler (`bruteNearestOnRadialSurface`
   class) â€” NOT the radial chord (blind on near-vertical flanks).
1. **Extract the protected complex (graft #3).** Morse-Smale 1-skeleton of h(u,t)=rA over the (u,t) domain:
   ALL ridge families (u-rib AND diagonal), 0-cells at births/merges/crossings. `planarizeConstraintGraph`
   into ONE non-crossing PSLG (proven: residualCrossings=0, 100% recovery on Gothic's count-unstable net).
2. **Seed** a coarse metric-Delaunay mesh under M with the skeleton recovered + LOCKED as constraint edges.
3. **NO-BRIDGE split (WINNER mechanism 1).** Every protected crest edge is a shared mesh edge; two flank facets
   meet AT the apex; NO facet interior straddles the ridge. Junction 0-cells become fan vertices.
4. **INTERIOR-CRITERION refine loop (WINNER mechanism 2).** For every triangle compute d_int = true-3D interior
   deviation (step 0). While d_int > 0.01: on a flank facet, insert a surface-projected node placed by 3D
   ARC-LENGTH (concentrating density where the flank is near-vertical â€” the facet-interior criterion, NOT
   uniform u-fraction). Local cavity re-triangulation, recurse. Bounded-curvature flanks converge
   (Boissonnatâ€“Oudot). This is the exact lever that took the worst cusp 0.047â†’0.018â†’0.006.
5. **Acceptance guard (graft #4).** Score with a â‰¥36-pt interior sampler on the worst-gradU population; any
   leaf that hits the recursion cap with self>0.01 counts as an outlier (do NOT early-stop on a coarse ruler).
6. **Quality gate (graft #2 fallback).** If arc-length grading yields slivers (the winner's honest caveat:
   minAngle 13.8Â°, 96.3% <20Â°), replace pure arc-length with anisotropic/metric-aware spacing under M=g/hÂ²
   (even 3D triangle quality, the surface_metric memory), OR bound aspect + apply a PN element at the sharpest
   corner. The 0-outlier gate and the sliver gate are SEPARATE.
7. **Emit** STL/3MF; byte-identical when the feature-graph flag is off.

### The exact new mechanism (one sentence)

> Grow the mesh on the surface with the Morse ridge graph as a protected no-bridge 1-complex, and refine each
> flank by the measured TRUE-3D interior deviation using arc-length-graded (near-vertical-concentrated)
> Steiner insertion â€” so no flat facet ever bridges the zero-width apex and every flank chord shrinks to â‰¤0.01.

---

## 5. PRE-REGISTERED VALIDATION PLAN (for the meshing-research follow-up)

**HYPOTHESIS:** The surface-native no-bridge + arc-length-graded (facet-interior-criterion) kernel, with the
Morse junction graph as the protected complex, reaches **0 interior outlier triangles on a REAL full Gothic
mesh** (all 96 births / 72 merges) at tractable cost, and reproduces 0 outliers on all 20 styles.

**KILL-CRITERION (commit BEFORE running):**
- CONFIRM iff, on a real single-arch Gothic kernel patch (few bays Ã— short z-band, ~0.3â€“0.8M tris) built
  end-to-end, **0 triangles have interior true-3D > 0.01** measured by the â‰¥36-pt sampler under the trusted
  full-azimuth brute, AND the mesh is watertight (auditNonManByIndex = 0 by index, non-vacuous) AND manifold
  across the junction network.
- REFUTE (Gothic steep-EXCLUDE from the domain side too) iff any facet floors >0.02 after the interior loop
  terminates OR the junction network cannot be split non-manifold-free (residualCrossings>0 or fan gaps).
- NO-OP iff it matches the current `_cu_gothicseg` embedded-crest floor (0.058) within 10%.

**REAL-STYLE SWEEP (the real-data decision, not the proxy):**
1. Gothic single-arch patch (hardest, count-unstable junction) â€” the go/no-go.
2. GeometricStar (the other count-unstable cusp; finite-width kink 130â€“137Â°, plausibly easier â€” UNTESTED).
3. Full 20-style re-baseline at the shipped budget: confirm Tier-A/B stay byte-identical (empty/single-family
   complex â‡’ no regression) and Tier-C (Gothic, GeoStar) reach 0 outliers.
4. **Cost gate:** tri-count over all births/merges must stay â‰¤6M budget (the arc-length grading fat-tail â€”
   #4 measured p99 64 leaves/flank at the sharpest corner â€” is the cost risk; measure the distribution).
5. **Sliver gate (separate):** report `triangleQualityDistribution` minAngle; the proxy's 13.8Â° is a KNOWN
   regression to fix via metric-aware spacing before productionization.

**HONEST INSTRUMENT (non-negotiable):**
- Interior ruler = â‰¥36-pt barycentric lattice back-projected via full-azimuth `bruteNearestOnRadialSurface`
  (NOT the radial chord, NOT a coarse local `selfWorst` early-stop â€” both proven to under-report the near-apex
  leaf and taint a CONFIRM). Population = worst-gradU-sorted, NOT uniform stride (the contamination that
  overturned #2/#4).
- Watertight = auditNonManByIndex by index, non-vacuous control (inject a crack, verify the count moves).
- Slivers = minAngle distribution (not %<20Â° dilution).
- Checkpoint each patch to ndjson the instant it is computed (resilience: the env kills long runs).

---

## 6. HONEST STATE

**0-outlier-on-all-20 is currently (b) PROMISING pending validation â€” with ONE mechanism proven feasible at
the single-cusp level on the hardest style, and the whole-mesh + junction + quality gates still OPEN.**

What is PROVEN (measured, adversarially confirmed):
- The Gothic zero-width cusp is **NOT irreducible for a flat-P1 mesh** â€” the 0.09mm floor was a
  UNIFORM-DENSITY chart-lift artifact. Surface-native no-bridge + arc-length-graded flank density reaches
  **0 outliers, max 0.006mm** on the SINGLE HARDEST cusp, CONVERGENT, verified by a dense-stencil re-audit
  under the trusted brute. (E-RACE-SURFNATIVE, commit b1c3e19.)
- The graph model ALONE floors (E-FGJ refuted+upheld); flat-Steiner recursion ALONE floors at the singularity
  on the honest population (E-INTRINSIC-APEX reconcile refuted, bb46aa9); the raw PN element failed its own
  kill-criterion (E-CRESTRIBBON). These three delineate exactly why the winner's TWO-lever combination is
  necessary.

What REMAINS WALLED / UNMEASURED (the follow-up must close):
- **Whole-mesh junction network:** the proxy is ONE clean cusp. Watertightness/manifold/sliver across the 96
  births/72 merges at full-mesh scale is UNMEASURED. FGJ proved the graph can be built clean (residualCrossings=0,
  100% recovery) but did NOT run the interior loop on it.
- **Cost:** tri-count of arc-length grading over the whole count-unstable network vs â‰¤6M budget â€” the #4
  fat-tail (p99 64 leaves/flank at the sharpest corner) is the risk.
- **Sliver quality:** the 0-outlier win is NOT sliver-free (minAngle 13.8Â°, 96.3% <20Â°). A separate
  metric-aware-spacing gate is required.
- **GeometricStar:** the other count-unstable cusp is UNTESTED under this kernel (plausibly easier â€” a
  finite-width kink, not a zero-width knife-edge â€” but unproven).

**THE SINGLE NEXT VALIDATION EXPERIMENT:** build the surface-native no-bridge + arc-length-graded kernel on a
REAL single-arch Gothic patch end-to-end (Morse junction graph as protected complex, chordSteiner driven by
TRUE-3D facet-interior deviation), and measure 0 outliers + watertight + tri-count + sliver quality across the
count-unstable junction network with the honest instrument on the worst-gradU population.

---

## VALIDATION (2026-07-04b) â€” END-TO-END GOTHIC WHOLE-PATCH GO/NO-GO

The Â§5 experiment RAN. Verdict on the go/no-go: **REFUTE.** The perfect-mesher kernel, assembled end-to-end
(FGJ Morse junction graph as protected no-bridge 1-complex + metric-Delaunay seed with graph LOCKED +
SURFNATIVE arc-length-graded interior-criterion refine loop) on a real single-arch Gothic patch, does **NOT**
reach 0 interior true-3D outliers under the honest instrument. Trust only these measured numbers.

### (1) Gothic whole-patch â€” REFUTE

- **0 outliers? NO.** `interiorMaxMm = 0.13279`, `interiorOutliers = 113` (all 113 ON-CREST, 0 off-crest),
  `guardP99 = 0.12964`, `guardP50 = 0.00542`. Kill-criterion (0 tris >0.01) FAILED; REFUTE criterion (facet
  floors >0.02 after loop termination) MET. Reproduced identically twice.
- **Watertight non-vacuous? YES.** `auditNonManByIndex = 0` by index; non-vacuous control CONFIRMED
  (inject 3rd-tri-on-edge â†’ count 0â†’1). Manifold across the junction network.
- **Tri-count:** 149,051 (well under the 6M budget). Seed 138,485 â†’ refine +10,566 over 4 passes (capped=false).
- **Slivers:** `minAngle = 0.10Â°`, `pctBelow20 = 4.6%`, medianMinAngle 43Â°, p5 21Â°. (Better than the proxy's
  13.8Â°/96.3% because the whole-patch metric-Delaunay seed is squarer than the single hand-split cusp.)
- **All non-fidelity gates PASSED:** familyCount=2, residualCrossings=0, 100% constraint recovery (1320 edges),
  no-bridge CDT clean, refine CONVERGED (worstGN 0.031â†’0.0085, GN-outliers 6932â†’0). Only the FIDELITY gate failed.

**ROOT CAUSE (measured, not inferred):** the GN loop-driver UNDERSTATES true-3D on near-vertical flanks
(gradU 230â€“253 mm/rad, the documented steep-lattice gotcha), so the loop terminated at worstGN=0.0085 while the
honest full-azimuth brute reveals a 0.133mm floor ON the crest. A flat P1 element cannot follow the zero-width
`pow(sharp)` apex to â‰¤0.01 even WITH (a) a junction-complete graph, (b) a protected no-bridge crest, AND
(c) arc-length grading driven to GN-convergence. **The E-RACE-SURFNATIVE 0.006mm single-cusp proxy did NOT
survive the whole-network honest brute guard** â€” the proxy's win was one hand-split cusp, not the count-unstable
network. This UPHOLDS E-VERIFY-INTRINSIC-APEX: the `pow(sharp)` singularity is the flat-P1 floor.

**Two bugs found + fixed + banked (both reusable, both raise the shared kernel's robustness):**
1. cdt2d 'upperIds' crash = 840 real mm crossings the seam-aware `planarizeConstraintGraph` missed â†’ new robust
   mm-space `planarizeMM` (splits every crossing + T-junction â†’ 0 crossings, cdt2d clean).
2. seam-normalization flipping u=âˆ’0.02â†’0.98 into a 248mm seam-spanning facet (3.4mm) â†’ keep native patch u.

### (2) GeometricStar â€” NOT RUN (UNMEASURED)

The GeoStar arm of the Â§5 sweep was **not executed** (no `_pf_perfect_geo*` probe exists; result set empty).
Its go/no-go is UNMEASURED. Do not infer a verdict. Given the Gothic REFUTE is a REPRESENTATION floor
(flat-P1 vs zero-width apex), GeoStar â€” a FINITE-WIDTH kink (130â€“137Â°), not a zero-width knife-edge â€” is
plausibly easier, but this is a hypothesis, not a result.

### (3) Tier-A/B byte-identical + sliver gate â€” NOT RUN (UNMEASURED)

No 20-style re-baseline was run; **Tier-A/B byte-identical is UNCONFIRMED by measurement** here (the
empty/single-family-complex argument in Â§4 is a design claim, not a measured one). The sliver gate is likewise
un-adjudicated as a closable-with-outliers-still-0 question â€” moot on Gothic, since outliers are NOT 0 (the
0-outlier gate failed first, so "close slivers while holding outliers at 0" has no valid Gothic baseline).

### (4) UPDATED HONEST STATE â€” Gothic is (c) NEWLY WALLED for flat-P1; all-20 remains (b) PROMISING elsewhere

Revise Â§6. The whole-mesh feasibility question the follow-up was meant to close is now **answered NO for the
assembled flat-P1 kernel on Gothic:**

- **(c) NEWLY WALLED (Gothic, flat-P1):** the two SURFNATIVE mechanisms (no-bridge + arc-length grading),
  even ASSEMBLED end-to-end with the complete FGJ junction graph and driven to convergence, floor at **0.133mm
  on-crest** under the honest whole-network brute. This is NOT the uniform-density chart-lift artifact Â§1/Â§6
  celebrated removing â€” it is the residual `pow(sharp)` singularity the single-cusp proxy masked. The
  "0-outlier feasible whole-mesh" claim of Â§6 is REFUTED for flat P1 on Gothic.
- **What is STILL PROVEN and banked (watertight side):** `planarizeMM` + no-bridge junction complex is
  watertight-proven at whole-patch scale (residualCrossings=0, nonMan=0 non-vacuous, manifold across junctions,
  149k tris). The graph/topology half of the kernel WORKS. The fidelity half does not close Gothic.
- **(b) PROMISING elsewhere:** Tier-A/B (14/20 + the smooth/single-family styles) is untouched by this refute
  and remains PROMISING-pending-measurement. GeoStar is untested and open.

Net: **0-outlier-on-all-20 is NOT proven whole-mesh feasible. It is newly WALLED on Gothic for the flat-P1
element** â€” closing it requires changing the ELEMENT (a genuine curved/one-sided PN or P2 at the near-apex
leaf), not more density/placement. The tournament's flat-P1 "no curved element needed" conclusion (Â§3) is
CONTRADICTED by the whole-patch guard: it held for one cusp, not the network.

### (5) THE SINGLE NEXT EXPERIMENT (a gate failed â†’ not productionization)

Do NOT back-port into `ParametricExportComputer`/conformingMesher as a Gothic â‰¤0.01 solution â€” it does not
reach it. Two ordered next moves, both on THIS exact end-to-end kernel (reuse `_pf_perfectMesherLib.ts` +
`_pf_planarizeMM.ts`, resumable via the persisted refined mesh):

1. **PRIMARY â€” swap the near-apex leaf's flat element for a one-sided PN/P2 element** (the E-CRESTRIBBON graft
   #2, correctly scoped this time to the near-apex leaf only) and re-measure the SAME worst-gradU brute guard.
   This directly attacks the measured root cause (flat-P1 cannot follow `pow(sharp)`). Kill-criterion: 0 tris
   interior-true3D >0.01 on the top-400 worst-gradU population, watertight non-vacuous, minAngle sane.
2. **SECONDARY (prerequisite fix, do first) â€” make the refine loop's termination driver the HONEST BRUTE, not
   GN.** GN understated 0.0085 vs the true 0.133; a loop that cannot SEE the floor cannot refine against it.
   Any element swap must be driven by the true-3D interior deviation or it will terminate blind again.

Also open (independent): RUN the GeoStar arm (finite-width kink â€” may CONFIRM where Gothic refuted, which would
localize the wall to zero-width apices specifically), and RUN the Tier-A/B byte-identical re-baseline before any
productionization claim.

**LEDGER:** `research/EXPERIMENT-REGISTRY.md` E-2026-07-04-PERFECT-MESHER-GOTHIC, commit 94c7e04
(pre-reg 8c4467a, assembly cd2e162, guard 34ea04f). Scorecard: `research/exchange/_pf_perfect_gothic/`
{build.json, scorecard.ndjson, refine_passes.ndjson, refined_mesh.bin}. Kernel:
`research/bridge/_pf_perfectMesherLib.ts` + `_pf_planarizeMM.ts`; probe: `research/bridge/_pf_perfect_gothic.test.ts`.

**HONESTY CAVEATS carried forward:** (a) interiorMax=0.133 uses a 1024Ã—120 box-refined brute (refineIters=60,
trusted-class per SURFNATIVE calibration); the independent 4096Ã—600 top-30 cross-check was KILLED at ~34min
under machine contention (UNMEASURED) â€” but box-refine converges to the true foot independent of grid res, so
the REFUTE is sound. (b) NO visual heatmap render was produced â€” a `dumpHeatmap` of the refined mesh is the
recommended next visual artifact. (c) guard population = worst-gradU top-400 (the reddest near-vertical facets
where any outlier must live), an intentional honest-and-tractable choice, not the full 6%.

---

## VALIDATION 2 â€” HONEST-LOOP (2026-07-05)

The Â§5(5) two ordered moves RAN. The SECONDARY prerequisite (make the refine loop's TERMINATION driver the
honest full-azimuth brute, not GN) was implemented FIRST and, on its own, **OVERTURNED the 2026-07-04b
Gothic REFUTE without needing the PRIMARY element swap**. Trust only these measured numbers.

### (1) Gothic whole-patch â€” flat-P1 REACHES 0 outliers (OVERTURNS the REFUTE); PN was NOT needed

- **0 outliers? YES.** `interiorOutliersFinal = 0`, `interiorMaxFinalMm = 0.006`, `converged = true`,
  `usedPnAtApex = FALSE`. The exact same numbers hold for flat-P1 alone (`interiorOutliersFlatP1 = 0`,
  `interiorMaxFlatP1Mm = 0.006`) â€” the scoped apex PN element was **not required**.
- **Root cause of the prior REFUTE â€” CONFIRMED as a driver artifact, now fixed by TWO levers together:**
  (1) the STOP test is now the honest full-azimuth `bruteNearestOnRadialSurface` interior deviation (GN
  understated 0.0085 vs the true 0.133, so the old loop terminated blind on the near-vertical flank);
  (2) geometric density delivery via RED 1â†’4 edge-midpoint refinement (`mode='edge'`) instead of
  one-node-per-facet-per-pass (`mode='point'`, which capped with 2 residual apex outliers). `worstBrute`
  collapsed 0.276â†’0.270â†’0.264â†’0.169â†’0.008 over 5 passes once density crossed the ~0.035mm-arc apex threshold.
- **Element bench settles the "needs a curved element" question â€” flat-P1 SUFFICES.** pn-fine (well-shaped
  aspectâ‰ˆ1 apex facet, brute 2048Ã—160) shows flat-P1 crosses <0.02 at ~0.035mm arc and reaches 0.0009 at
  0.0022mm arc; one-sided Vlachos PN â‰ˆ flat (0.0207/0.0033/0.0008, sometimes WORSE). The apex is NOT below a
  flat-P1 element's reach â‡’ the E-CRESTRIBBON / 2026-07-04b "needs a curved P2/PN element" framing is
  CONTRADICTED. The wall was the GN DRIVER, not the P1 ELEMENT.
- **Watertight non-vacuous? YES.** `auditNonManByIndex = 0` by index; injected-crack control moves 0â†’1.
  Manifold across the junction network. Topology pipeline (FGJ Morse graph â†’ planarizeMM â†’ no-bridge
  locked-constraint CDT seed; residualCrossings=0, 100% recovery) reused VERBATIM.
- **Tri-count:** 9,885 (1-bay patch, well under 6M budget for this scope).
- **Slivers â€” FAILS HARD (honest caveat, NOT in the kill-criterion):** `minAngleDeg = 0`, median â‰ˆ3Â°,
  `pctBelow20 = 81.4%` â€” WORSE than point-mode (33.5%) and the prior GN kernel (4.6%). The unconditioned 1â†’4
  apex red-refine bakes needle vertex configs into the point set. The 0-outlier win is sliver-dirty.
- **Ledger:** E-2026-07-05-PERFECT-MESHER-GOTHIC-BRUTE, registry commit 0a95b99 (pre-reg fa1936e,
  instruments cb6db97). Probe `_pf_perfect_gothic_brute.test.ts` (PF_PERFECTBRUTE=1, PF_MODE=edge). Kernel
  `_pf_perfectMesherBruteLib.ts` (facetInteriorBrute STOP ruler + refineInteriorBrute mode point|edge +
  apexLeafPN Vlachos). Bench `_pf_pnfine.test.ts`, `_pf_pndiag.test.ts`.

### (2) GeometricStar â€” flat-P1 REACHES 0 outliers (kernel transfers VERBATIM)

- **0 outliers? YES.** `interiorOutliersFinal = 0`, `interiorMaxFinalMm = 0.006`, `usedPnAtApex = FALSE`,
  `converged = true`. The ONLY new code was `makeGeoStarPatch` (patch window on the high-relief strap band
  t=0.08); everything downstream (FGJ-Morse extract â†’ planarizeMM X-split â†’ CDT junction-lock â†’ brute-driven
  edge-mode refine) was reused VERBATIM from the Gothic kernel.
- **Count-instability handled by TOPOLOGY, not fidelity:** per-row full-ring u-crest count oscillates
  0â†’7â†’16â†’16â†’32â†’8â†’0 per tile (relief amp ~1.72mm at t~0.1, EXACTLY 0 at tile centres) â€” the SAME unstable-count
  family that floored the doubled-crest column primitive at 26mm (E-2026-07-04-DCGS). Here extract fam=2,
  segU=728, segT=215, residualCrossings=0; refine CONVERGED in 5 passes (outliers 4824â†’4280â†’222â†’16â†’0, worst
  0.16â†’â€¦â†’0.006), NOT capped. Mechanism: the FGJ+CDT-lock+brute-refine kernel is COUNT-AGNOSTIC (nearest-neighbour
  crest linking + planarizeMM X-split births/dies chains), so it never pins vanished straps.
- **PN-mech confirms flat-P1 sufficiency (finite-width kink, easier than Gothic):** devFlat/devPN
  0.191/0.167 @0.57mm â†’ 0.0085/0.0080 @0.071mm (flat-P1 already < tol) â†’ 0.0026/0.0023 @0.035mm. PN adds
  only ~10â€“30%, NOT Gothic's order of magnitude.
- **Watertight non-vacuous? YES.** `auditNonManByIndex = 0`, injected-crack 0â†’1. Manifold. `tris = 112,863`.
- **Render:** `research/exchange/_pf_perfect_geostar_brute/geostar_true3d.png` â€” whole patch GREEN under the
  true-3D perpendicular ruler (centroid p99 0.018 / worst 0.023 / 0.00% >0.03), no red on chevron strap flanks.
- **Slivers â€” better than Gothic-brute but still fails:** `minAngle = 0`, median 41Â°, `pctBelow20 = 21.3%`
  (density-INVARIANT; same defect family as tier-A/B). Thin facets from planarize junction fans + strap
  birth/death chain terminations.
- **Ledger:** E-2026-07-05-PERFECT-MESHER-GEOSTAR, commit 01f56c2. Probe `_pf_perfect_geostar_brute.test.ts`
  (PF_PERFECTGS=1; PF_PNMECH=1). Patch lib `_pf_geostarPatchLib.ts` (only new code). Recon
  `_pf_geostar_recon.test.ts`. Render `_pf_geostar_render.test.ts`.

### (3) Tier-A/B byte-identical + M=g/hÂ² sliver gate â€” BOTH sub-claims REFUTED

- **(3a) Closer-OFF byte-identity = REFUTED.** The kernel (`_pf_perfectMesherLib`/`_pf_perfectMesherBruteLib`)
  has NO closer-off delegation branch (grep-verified). Its only generator, `seedMesh` with an EMPTY protected
  complex, builds a STYLE-BLIND uniform (u,t) grid â†’ identical hash 84c5edc4â€¦ + identical 22989v/45312t for
  BOTH styles (the radius fn enters only the LIFT, not the (u,t) point set). `buildInhouseMetricMesh` (the
  dispatch table's named 'dense-M-square') is a curvature-ADAPTIVE M=g/hÂ² mesh: HarmonicRipple 21960v/43342t
  hash 0c916666â€¦, ArtDeco 14951v/29549t hash 34788451â€¦ â†’ `byteIdentical = FALSE` for both. deterministic=TRUE.
  **The Â§4/Â§6 "byte-identical when the flag is off â‡’ zero regression on Tier-A/B" is an UNIMPLEMENTED DESIGN
  CLAIM, not a measured property.** The uniform-grid seed is architecturally a DIFFERENT generator from the
  adaptive M-mesh; no budget pairing can equate them.
- **(3b) M=g/hÂ² sliver gate holding 0-outlier = REFUTED.** On the CONFIRMED 1-bay edge-mode Gothic mesh
  (4987v/9885t, alignment-guarded cEdges=141 match): pure true-3D max-min-angle Lawson flips fired 5295 times
  but REOPENED interior outliers 0â†’57 (ALL on-crest), max 0.006â†’0.130, p99â†’0.128, while `pctBelow20` barely
  moved 81.4â†’77.4% (minAngle 0â†’0). Fidelity-guarded flips were WORSE (50 outliers, max 0.194 â€” the cheap ruler
  understates true-3D on near-vertical flanks, the same GN-blindness gotcha). LOCK_ALL control (0 flips) proved
  the halfedge build + orientation-normalize (134 CWâ†’CCW) + flipHE relink are byte-clean (asymmetricTwins=0) â‡’
  the tension is GENUINE, not an instrument artifact. Watertight `auditNonManByIndex = 0` non-vacuous throughout.
- **ROOT CAUSE:** the 81.4% slivers are baked into the edge-mode POINT SET (uniform 1â†’4 apex red-refine = needle
  vertex configs). Near the zero-width apex, any near-equilateral triangulation must chord across the concave
  cusp (bad fidelity); any cusp-following triangulation is a needle (bad angle); flips reconnect the SAME points
  so cannot escape. **The 0-outlier gate and the sliver gate are jointly UNclosable by topology-only flips** â€”
  the lever must be metric-aware SPACING at refine time (place flank Steiner nodes at M=g/hÂ²-equalized positions,
  near-equilateral-by-construction), NOT a-posteriori flips.
- **Banked reusable:** the halfedge-build + orientation-normalize + flipHE-with-lock is a correct metric-flip
  instrument (LOCK_ALL-proven byte-clean).
- **Ledger:** E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS (pre-reg caca066, findings 05751ad). Probe
  `_pf_tierab_slivers.test.ts` (PF_TIERAB=1 / PF_SLIVERM=1; diag PF_LOCKALL / PF_FIDFLIP / PF_CRESTVERTLOCK).

### (4) DEFINITIVE HONEST STATE â€” the perfect mesher is FIDELITY-PROVEN whole-patch on BOTH count-unstable styles by FLAT-P1, but NOT yet whole-MESH and NOT print-usable

Revise Â§6 and the 2026-07-04b Â§(4). The 2026-07-04b flat-P1 REFUTE is **OVERTURNED**: it was a GN-DRIVER
artifact, not a P1-element floor. The honest state now partitions cleanly by GATE:

- **FIDELITY gate (0-outlier, true-3D â‰¤0.01) â€” PROVEN, by FLAT-P1 (usedPnAtApex=FALSE):**
  BOTH count-unstable styles reach `interiorOutliersFinal = 0`, `interiorMax = 0.006mm` under the honest
  full-azimuth brute STOP-driver + edge-mode geometric density: Gothic (zero-width apex) AND GeoStar
  (finite-width chevron). The scoped-apex PN element was built and benched but PROVED UNNECESSARY on both â€”
  the apex sits ABOVE a flat-P1 element's reach at ~0.035mm arc. **This is the campaign's deepest fidelity
  result: the last wall (zero-width `ridge(sharp)` on count-unstable networks) is closed to CAD-grade true-3D
  with a flat simplex, no curved element.** The Â§3 flat-P1 conclusion is VINDICATED (it was correct all along;
  2026-07-04b only APPEARED to contradict it because of the blind GN driver).
- **WATERTIGHT / MANIFOLD gate â€” PROVEN whole-patch:** `auditNonManByIndex = 0` non-vacuous, manifold across
  the FGJ junction network, residualCrossings=0, 100% recovery, on both styles. Topology half of the kernel is
  solid and reused verbatim across styles.
- **SLIVER gate â€” FAILS (Gothic 81.4%, GeoStar 21.3% <20Â°, minAngle 0).** Density-invariant; NOT closable by
  topology-only flips (3b refuted). This is the ONE OPEN gate blocking print-usability.
- **TIER-A/B byte-identical (zero-regression) â€” REFUTED as CURRENTLY IMPLEMENTED (design claim only).** The
  seedMesh uniform-grid generator is NOT the adaptive M-mesh; a productionized closer-off path must EXPLICITLY
  delegate to `buildInhouseMetricMesh` (byte-audited), which is an INTEGRATION task, not a topology one.
- **SCOPE CAVEATS (do not overclaim):** CONFIRMs are on 1-BAY patches (Gothic 9885t, GeoStar 112863t).
  5-bay+ EDGE-mode whole-mesh is UNMEASURED (env-cost of 3Ã— nodes/pass killed the pass-1 run window clean;
  point-mode 5-bay capped with 2 residual on-crest outliers at 0.078 â€” slow delivery, NOT a floor).
  Whole-Gothic tri-count vs 6M budget UNMEASURED. No 20-style re-baseline run.

**Is the perfect mesher PROVEN whole-mesh? NO â€” it is PROVEN whole-PATCH (fidelity + watertight) on both
count-unstable styles by flat-P1, with TWO gates still open: (i) slivers (needs metric-aware refine-time
spacing, NOT flips), (ii) whole-MESH scale-up (5-bay+ edge-mode + 20-style re-baseline + byte-identical
delegation), both INTEGRATION/scale, NOT representation.** The representation question ("can a flat-P1
mesh follow the zero-width apex to CAD-grade true-3D") is now definitively answered YES.

### (5) IF PROVEN â€” remaining path is one experiment then productionization (NOT another representation search)

The single next experiment (the LAST fidelity-adjacent unknown before productionization):

> **METRIC-AWARE APEX SPACING holding 0-outlier fidelity.** Replace the unconditioned 1â†’4 edge-mode
> red-refine with M=g/hÂ²-equalized Steiner placement at refine time (near-equilateral-by-construction on the
> flank), re-measure BOTH gates together on Gothic AND GeoStar: kill-criterion = `pctBelow20` â†’ single digits
> AND `minAngle` sane WHILE `interiorOutliersFinal` HOLDS at 0 under the honest brute. This is the ONE lever
> the 3b refutation pointed to (spacing at insertion, not a-posteriori flips). Do it on both styles at 1-bay
> first, then run the 5-bay edge-mode whole-mesh + the 20-style Tier-A/B re-baseline as the scale confirm.

Productionization path (back-port into `ParametricExportComputer` / conformingMesher) â€” gated behind a
default-off flag, byte-identical when off, GitNexus impact-checked before any src/ edit:

1. **Wire the closer-off path to delegate to `buildInhouseMetricMesh`** (the adaptive M-mesh), NOT the
   style-blind uniform seed â€” this is what actually delivers the "byte-identical Tier-A/B" zero-regression
   guarantee that (3a) proved is currently UNIMPLEMENTED. Byte-audit the delegation on all Tier-A/B styles.
2. **Port the topology half** (FGJ Morse graph â†’ planarizeMM â†’ no-bridge locked-constraint CDT seed) as the
   Tier-C protected-complex builder â€” it is the proven, style-agnostic, count-agnostic junction extractor.
3. **Port the honest brute STOP-driver + edge-mode interior refine** as the Tier-C fidelity loop, gated to
   fire ONLY on the count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on
   the byte-identical adaptive M-mesh.
4. **BLOCK productionization on the sliver gate** â€” do NOT ship the current sliver-dirty apex refine (81.4%
   <20Â° would degrade printability); ship only after the metric-aware-spacing experiment above closes slivers
   while holding 0-outlier fidelity.
5. Run the 5-bay+ whole-mesh + tri-count-vs-6M-budget cost gate as the final go/no-go before flag-flip.

**LEDGER (this synthesis):** `research/lab/2026-07-04-perfect-mesher-spec.md` Â§VALIDATION 2. Underlying
registry entries: E-2026-07-05-PERFECT-MESHER-GOTHIC-BRUTE (0a95b99), E-2026-07-05-PERFECT-MESHER-GEOSTAR
(01f56c2), E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS (05751ad). DEV-ONLY; no src/ edit; research/exchange
scorecards gitignored (numbers inlined above and in the registry).

---

## VALIDATION 3 â€” QUALITY + SCALE (2026-07-05)

The Â§(5) single-next-experiment RAN on Gothic: replace the unconditioned 1â†’4 edge-mode red-refine with
**M=g/hÂ² square refine-time spacing** (metric row-pitch dt=hF/st along-crest companion + locked-crest-edge
subdivision + RED 1â†’4), honest full-azimuth brute STOP driver reused VERBATIM from the CONFIRMED kernel.
Trust ONLY these measured numbers (`research/exchange/_pf_perfect_gothic_msquare/{before,after}.json`,
`after_passes.ndjson`; registry E-2026-07-05-PERFECT-MESHER-MSQUARE, commit 7812fc8, pre-reg c6e4fec).

### (1) Did M-square spacing close slivers while HOLDING 0 outliers? â€” Gothic YES-fidelity / NO-slivers (REFUTE); GeoStar NOT RUN

Gothic multi-bay (**4 bays**, patch zBand=8, before = the CONFIRMED edge-mode 1-bay mesh reloaded, refined under M-square):

| gate | before (edge-arclen) | after (M-square, 6 passes) | verdict |
|---|---|---|---|
| interiorOutliers (true-3D >0.01) | 0 | **0** | HELD âœ“ |
| interiorMax (mm) | 0.006 | **0.006** (guardP99 0.00599) | HELD âœ“ |
| converged (brute STOP) | â€” | **true** (worstBrute 0.270â†’0.260â†’0.235â†’0.022â†’0.131â†’0.006 over 6 passes; capped=false) | âœ“ |
| watertight auditNonManByIndex | 0 (nonVac, inj 0â†’1) | **0** (nonVac, inj 0â†’1) | HELD âœ“ |
| **minAngleDeg** | 0 | **0** | **FAIL** âœ— |
| **pctBelow20** | 81.4% | **56.2%** (median minAngle 3Â°â†’16Â°) | **FAIL** (real âˆ’25.2pt, but 56% â‰« single-digit target) âœ— |

- **Fidelity + watertight HELD** â€” the pre-registered REFUTE-by-outlier-REOPENING branch is AVOIDED: 0-outlier
  CAD-grade true-3D and squarer cells CO-EXIST. The two gates are NOT in hard tension (unlike the a-posteriori
  Lawson flips of VALIDATION-2 Â§3b, which REOPENED 0â†’57). M-square is a genuine PARTIAL sliver reducer.
- **Sliver CONFIRM UNMET â†’ REFUTE.** pct<20 dropped a real 25pt but minAngle is still **0Â°** and 56.2% â‰« the
  single-digit CONFIRM bar. M=g/hÂ² refine-time spacing is a partial reducer, NOT a closer, for the Gothic
  zero-width apex.
- **ROOT CAUSE (diag):** worst slivers are NOT the apex â€” worst-20 minAngle facets mean gradU=43.8 (moderate),
  37.6% of <20Â° facets sit on the LOW-gradU smooth panel â‡’ denseâ†”coarse GRADING-TRANSITION needles, and RED 1â†’4
  PRESERVES parent needle shape. The residual lever is graded-seed + surface-preserving Laplacian-under-M
  relaxation (move free verts to metric-equilateral, re-project on-surface, REJECT if it reopens an outlier),
  NOT more insertion spacing (this arm) nor a-posteriori flips (already refuted V2-Â§3b).
- **GeoStar M-square: NOT RUN.** No `_pf_perfect_geostar_msquare` probe/result exists (grep + exchange dir
  verified). GeoStar's sliver state remains the VALIDATION-2 edge-mode figure (pctBelow20 21.3%, minAngle 0,
  density-invariant). The "both styles" claim for the sliver close is therefore UNMEASURED on GeoStar and
  cannot be inferred â€” do not claim it.

### (2) Tri-count / projected full-mesh cost vs 6M budget

- **Gothic 4-bay M-square: tris = 58,365** (trisPerBay 14,591), refine 6 passes, capped=FALSE.
- **projectedFullMeshTris = 1,050,570 (< 6M budget â†’ PASS).** This is the FIRST measured multi-bay whole-patch
  tri-count and it clears the cost gate with 5.7Ã— headroom. (Supersedes the VALIDATION-2 "5-bay edge-mode killed
  the window / UNMEASURED" caveat â€” M-square 4-bay converged in-window at 1542s wall.)
- Cost caveat: the interior-refine node budget is fat early (pass1+2 insert 8771+20745 flank nodes; worst
  0.270â†’0.260 barely moving) before the sharp convergence tail (pass3â€“6 collapse 1119â†’34â†’6â†’0). ~4.4 nodes per
  outlier resolved. Still tractable at 4 bays; a per-outlier node-budget cut (drop companions OR anisotropic RED
  splitting ONLY the across-crest edge) is advisable before pushing to full 20+ bay whole-mesh.

### (3) DEFINITIVE state of the perfect mesher â€” 0-outlier + watertight, whole-PATCH, both styles; sliver gate OPEN; whole-MESH still unmeasured

Partitioned by GATE (measured, not inferred):

- **FIDELITY (0-outlier true-3D â‰¤0.01) â€” PROVEN whole-PATCH, flat-P1, both count-unstable styles.** Gothic
  (zero-width apex; 1-bay edge-mode V2 AND now **4-bay M-square**) and GeoStar (finite-width chevron; 1-bay
  edge-mode V2) all reach interiorOutliers=0, max 0.006mm, converged under the honest brute. usedPnAtApex=FALSE
  throughout â€” flat-P1 suffices. This is the campaign's deepest fidelity result and it is now shown to HOLD
  through a multi-bay M-square refine.
- **WATERTIGHT / MANIFOLD â€” PROVEN whole-PATCH, both styles, multi-bay** (auditNonManByIndex=0 non-vacuous,
  residualCrossings=0, 100% recovery; Gothic verified at 4 bays).
- **SLIVER â€” OPEN (the ONE gate blocking print-usability).** Gothic best measured = 56.2% <20Â°, minAngle 0
  (M-square, down from 81.4% but not closed); GeoStar 21.3%, minAngle 0 (edge-mode, M-square untested).
  Density-invariant. NOT closable by a-posteriori flips (V2-Â§3b) NOR by M-square insertion spacing alone (this).
  Next lever = graded-seed + surface-preserving Laplacian-under-M vertex relaxation with an outlier-reopening
  reject guard.
- **TIER-A/B byte-identical (zero-regression) â€” REFUTED as implemented** (V2-Â§3a): the uniform-grid seedMesh is
  a DIFFERENT generator from the adaptive `buildInhouseMetricMesh`; delegation is an INTEGRATION task.
- **SCALE â€” PARTIALLY closed.** 4-bay whole-patch tri-count + cost-vs-6M now MEASURED (1.05M < 6M). Still
  UNMEASURED: full multi-bay whole-MESH (>4 bays / full z-height), the 20-style Tier-A/B re-baseline, and the
  M-square arm on GeoStar.

**Is the perfect mesher 0-outlier + quality-clean + watertight whole-patch on both count-unstable styles?**
NO â€” it is **0-outlier + watertight whole-patch on both** (Gothic multi-bay, GeoStar 1-bay) but NOT
quality-clean on either (slivers open). What EXACTLY remains before productionization: (i) close slivers while
holding 0-outlier (metric-aware relaxation, on Gothic AND GeoStar); (ii) the byte-identical M-mesh delegation
(V2-Â§3a); (iii) the full 20-style re-baseline; (iv) full whole-MESH scale + GeoStar M-square.

### (4) Productionization plan â€” back-port the kernel into ParametricExportComputer/conformingMesher

Gated behind a default-off flag, byte-identical when off, GitNexus impact-checked before any src/ edit
(`impact({target, direction:'upstream'})` on the touched export symbol; `detect_changes()` before commit).
The 6 proven primitives are this kernel's count-stable / empty-or-single-family restriction (Â§4 dispatch table).

1. **Closer-off delegation (fixes the V2-Â§3a refute) â€”** wire the flag-off path to delegate to
   `buildInhouseMetricMesh` (the adaptive M=g/hÂ² mesh), NOT the style-blind uniform seedMesh. Byte-audit the
   delegation across all Tier-A/B styles (hash-match). This is what actually delivers the zero-regression
   guarantee; it is an integration wiring, not a topology change.
2. **Tier-C protected-complex builder â€”** port the topology half VERBATIM: FGJ Morse graph (all ridge families)
   â†’ `planarizeMM` (mm-space crossing/T-junction split â†’ residualCrossings=0) â†’ no-bridge locked-constraint CDT
   seed. Proven style-agnostic + count-agnostic (Gothic 96-birth net AND GeoStar 0â†’7â†’16â†’32â†’8 oscillation both
   clean). Feature-graph closer = the Tier-C dispatch selector.
3. **Tier-C fidelity loop â€”** port the honest full-azimuth brute STOP-driver + edge/M-square interior refine,
   fired ONLY on the count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on
   the byte-identical adaptive M-mesh (empty protected complex â‡’ no Tier-C code path).
4. **BLOCK on the sliver gate â€”** do NOT ship the current sliver-dirty apex refine (56.2% <20Â° on Gothic would
   degrade printability). Ship only after the metric-aware relaxation experiment closes slivers while holding
   0-outlier fidelity, on both styles.
5. **Final go/no-go â€”** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + 20-style re-baseline
   before flag-flip. 4-bay 1.05M<6M is an encouraging first data point, not the whole-mesh proof.

**LEDGER:** this file Â§VALIDATION 3. Registry: E-2026-07-05-PERFECT-MESHER-MSQUARE (commit 7812fc8, pre-reg
c6e4fec). Scorecard: `research/exchange/_pf_perfect_gothic_msquare/` {before.json, after.json,
after_passes.ndjson, progress.log, after_mesh.bin}. Probe `_pf_perfect_gothic_msquare.test.ts`
(PF_MSQUARE=1); diag `_pf_msq_diag.test.ts`; render `_pf_msq_render.test.ts`. DEV-ONLY; no src/ edit.

---

## VALIDATION 4 â€” SLIVER GATE: BOTH Â§VALIDATION-3 RECOMMENDED LEVERS REFUTED (2026-07-05)

The Â§VALIDATION-3(3) "next lever" (graded-seed + surface-preserving Laplacian-under-M relaxation) RAN on the
4-bay Gothic patch. **BOTH levers HOLD 0-outlier fidelity + watertight non-vacuous but FAIL to close slivers.**
Trust only these measured numbers (registry E-2026-07-05-PERFECT-MESHER-RELAX, commit 01d9535, pre-reg a29e1a4).

| arm | tris | interiorOutliers | interiorMax | minAngleÂ° | medianÂ° | pctBelow20 | watertight |
|---|---|---|---|---|---|---|---|
| BEFORE = CONFIRMED M-square | 58365 | 0 | 0.006 | 0 | 16 | **56.2%** | 0 nonVac âœ“ |
| Lever#1 smooth GRADED seed + M-square | 67256 | 0 | 0.006 | 0 | 16 | **56.5%** | 0 nonVac âœ“ |
| Lever#2 Laplacian-under-M relax (3 sweeps, quality-directed) | 58365 | 0 | 0.006 | 0.6 | 17 | **55.0%** | 0 nonVac âœ“ |

- **Lever #1 REFUTED â€” the slivers are NOT a grading-transition artifact.** A smoothly-graded background seed
  (bounded size-ratio, NO abrupt denseâ†”coarse RED transition) refined through the SAME honest-brute loop gives
  pctBelow20 56.5% â€” IDENTICAL to the abrupt-RED M-square (56.2%). The `_pf_msq_diag` "37.6% on the transition"
  was a correlation, not the cause. â‡’ **This CORRECTS the Â§VALIDATION-3 root-cause inference.**
- **Lever #2 REFUTED â€” position-only relaxation cannot reshape these needles.** A guarded quality-directed
  smart-Laplacian moves 22224/28064 free verts (21% guard-rejected) yet pctBelow20 only creeps 56.2â†’55.0% over
  3 sweeps (minAngle 0â†’0.6Â°, median 16â†’17Â°). Same point-set the Lawson flips couldn't escape; relaxation MOVES
  the points but the CONNECTIVITY-locked needles persist. Not the guard blocking (only 21% rejected).
- **ROOT-CAUSE REFRAME:** the Gothic sliver floor is a fidelity-vs-min-angle STRUCTURAL tension at the
  near-vertical crest flank â€” any near-equilateral cell there must chord across the concave cusp (forbidden by
  the fidelity guard), so the fidelity-holding cells are FORCED to be needles LONG-ALONG the crest. This
  CONTRADICTS the Â§VALIDATION-3 "not in hard tension" reading: they co-exist only because the needles are
  TOLERATED, not resolved. **4 sliver levers now refuted** (M-square spacing, smooth grading, Laplacian
  relaxation, Lawson flips). Density/grading/placement/flips are EXHAUSTED.
- **NEXT (the only remaining moves â€” a PRIMITIVE change, not more density):** (1) re-examine the QUALITY METRIC â€”
  the long-along-crest cells may be ANISOTROPY-appropriate (min-angle penalizes them but the surface is near-flat
  along the crest); measure min-angle UNDER M=g/hÂ² â€” if they vanish under the metric where the flank is isotropic,
  this is an ACCEPT+DOCUMENT close, not a defect. (2) If genuine 3D needles under the anisotropic metric, a
  curved/one-sided PN element AT the crest flank (E-CRESTRIBBON graft, benched-but-unnecessary for FIDELITY, may
  be necessary for QUALITY) is the last primitive. BANKED: `gradedSeed` + `relaxLaplacianUnderM` (guarded,
  LOCK-clean, holds 0 outliers) are correct reusable instruments.

**LEDGER:** this file Â§VALIDATION 4. Registry E-2026-07-05-PERFECT-MESHER-RELAX (commit 01d9535, pre-reg a29e1a4).
Scorecard `research/exchange/_pf_perfect_gothic_relax/` {before,after,graded}.json + scorecard/after_sweeps/
graded_passes ndjson + *_mesh.bin. Probe `_pf_perfect_gothic_relax.test.ts` (PF_RELAX=1 / PF_GRADED=1); lib
`_pf_relaxLib.ts`; config `vitest.pf_relax.config.ts`. DEV-ONLY; no src/ edit.

---

## VALIDATION 4 â€” SLIVER CLOSE (2026-07-05) â€” PI SYNTHESIS

This is the PI roll-up of the sliver-close arm (the E-RELAX experiment above) into the DEFINITIVE
perfect-mesher state + the productionization go/no-go. Trust ONLY the measured numbers already banked in the
sections above and the registry; nothing new was run here â€” this section adjudicates.

### (1) Did Laplacian-under-M relaxation + smoother grading CLOSE slivers (holding 0-outlier + watertight)?

**NO on Gothic (measured, multi-bay); NOT RUN on GeoStar.** Both pre-registered levers HELD the fidelity and
watertight gates but did NOT close slivers.

Gothic 4-bay, beforeâ†’after (from the E-RELAX table above):

| lever | tris | interiorOutliers (true-3D >0.01) | interiorMax mm | minAngleÂ° beforeâ†’after | pctBelow20 beforeâ†’after | watertight |
|---|---|---|---|---|---|---|
| Lever#1 smooth GRADED seed + M-square | 67256 | 0 (HELD) | 0.006 (HELD) | 0 â†’ **0** | 56.2% â†’ **56.5%** | 0 nonVac âœ“ (inj 0â†’1) |
| Lever#2 Laplacian-under-M relax (3 sweeps) | 58365 | 0 (HELD) | 0.006 (HELD) | 0 â†’ **0.6** | 56.2% â†’ **55.0%** (median 16â†’17Â°) | 0 nonVac âœ“ (inj 0â†’1) |

Pre-registered CONFIRM (pctBelow20 â†’ single digits AND minAngle sane) is UNMET on both arms â‡’ **REFUTE**.
Neither lever reopened an outlier (the fidelity guard held throughout) â€” the two gates are NOT in destructive
tension via these levers, but they ALSO do not co-resolve. GeoStar was NOT run under either lever (no
`_pf_perfect_geostar_relax` probe exists) â‡’ GeoStar's sliver state is still the VALIDATION-2 edge-mode figure
(pctBelow20 21.3%, minAngle 0), and any "both styles closed" claim is UNMEASURED.

**Sliver levers now REFUTED (5): Lawson flips (V2-Â§3b), M-square insertion spacing (V3), smooth graded seed,
Laplacian-under-M relaxation (V4), and â€” implied by all four â€” every DENSITY / PLACEMENT / CONNECTIVITY-only
move on the current flat-P1 point set.** The measured root cause is a STRUCTURAL fidelity-vs-min-angle tension
at the near-vertical crest flank: a near-equilateral cell there must chord across the concave cusp (forbidden
by the fidelity guard), so the fidelity-holding cells are FORCED long-along-crest needles. This is a
representation/element property, not a placement bug.

### (2) DEFINITIVE PERFECT-MESHER GATE TABLE (measured status per gate)

| Gate | Measured status | Best measured numbers | Scope proven | Source |
|---|---|---|---|---|
| **0-outlier fidelity** (interior true-3D â‰¤0.01, honest full-azimuth brute) | **PROVEN** (flat-P1, usedPnAtApex=FALSE) | Gothic 4-bay outliers=0 max 0.006mm converged; GeoStar 1-bay outliers=0 max 0.006mm converged | whole-PATCH, BOTH count-unstable styles | V2 Â§1/Â§2, V3 Â§1 |
| **Watertight / manifold** (auditNonManByIndex by index, non-vacuous) | **PROVEN** | =0 non-vacuous (inject crack 0â†’1) throughout; residualCrossings=0, 100% recovery, manifold across FGJ junction net | whole-PATCH, both styles, Gothic 4-bay | V2/V3/V4 |
| **Cost < 6M budget** | **PROVEN (partial)** | Gothic 4-bay 58,365 tris â†’ projectedFullMeshTris 1,050,570 < 6M (5.7Ã— headroom) | 4-bay projection only; full z-height UNMEASURED | V3 Â§2 |
| **Multi-bay** | **PROVEN (Gothic only)** | Gothic 4-bay fidelity+watertight+cost all HELD | Gothic 4-bay; GeoStar multi-bay UNMEASURED | V3 |
| **Both count-unstable styles** (fidelity) | **PROVEN** | Gothic (zero-width apex) + GeoStar (finite-width chevron 0â†’7â†’16â†’32â†’8 oscillation) both outliers=0 | 1-bay GeoStar / 4-bay Gothic | V2 Â§2, V3 Â§1 |
| **Slivers** (minAngle, pctBelow20) | **OPEN â€” the ONE blocking gate** | Gothic best 56.2% <20Â° minAngle 0 (down from 81.4%); GeoStar 21.3% minAngle 0. 5 levers refuted | â€” | V2 Â§3b, V3, V4 |
| **Tier-A/B byte-identical** (zero-regression) | **REFUTED as implemented** (design claim, not measured) | seedMesh uniform grid â‰  adaptive buildInhouseMetricMesh (hash mismatch both styles) â€” needs explicit delegation (INTEGRATION) | â€” | V2 Â§3a |
| **Full-mesh scale** (>4 bay / full z-height) | **UNMEASURED** | 5-bay edge-mode killed the window; 4-bay M-square is the only converged multi-bay | â€” | V2 Â§4, V3 |
| **20-style whole-mesh re-baseline** | **NOT RUN** | â€” | â€” | all |

### (3) IS THE PERFECT MESHER FULLY PROVEN WHOLE-PATCH? â€” and what EXACTLY remains

**The perfect mesher is FIDELITY-PROVEN + WATERTIGHT-PROVEN + COST-CLEARED whole-PATCH on both count-unstable
styles by a FLAT-P1 element (no curved element needed) â€” the campaign's deepest fidelity result. It is NOT
print-usable and NOT whole-MESH proven. EXACTLY ONE gate blocks print-usability: SLIVERS.**

The representation question ("can a flat-P1 mesh follow the zero-width `ridge(sharp)` apex on a count-unstable
network to CAD-grade true-3D") is definitively answered YES. The remaining opens are, in order:

1. **SLIVERS (the single blocker).** Density/placement/connectivity are EXHAUSTED (5 levers refuted). The
   measured tension is structural at the crest flank. Only two moves remain, both PRIMITIVE-level, NOT more
   density: (a) **re-measure min-angle UNDER M=g/hÂ²** â€” the long-along-crest cells may be
   anisotropy-appropriate (the surface is near-flat ALONG the crest); if they vanish under the metric where the
   flank is isotropic, this is an ACCEPT+DOCUMENT close, not a defect (CHEAPEST discriminator â€” run FIRST);
   (b) else a **curved/one-sided PN element AT the crest flank** (E-CRESTRIBBON graft â€” benched-but-unnecessary
   for FIDELITY, may be necessary for QUALITY). Both on Gothic AND GeoStar.
2. **Byte-identical Tier-A/B delegation** (INTEGRATION, not topology): wire closer-off to
   `buildInhouseMetricMesh`, byte-audit.
3. **Full whole-MESH scale** (>4 bay / full z) + GeoStar multi-bay + the 20-style re-baseline (the final gate).

### (4) PRODUCTIONIZATION GO/NO-GO + BACK-PORT PLAN

**GO/NO-GO: NO-GO to ship; GO to STAGE the back-port behind a default-off flag.** The sliver gate BLOCKS a
production flag-flip (56.2% <20Â° on Gothic would degrade printability). But the fidelity + topology half is
proven and stable enough to begin the flag-gated integration in parallel with closing slivers â€” nothing ships
until slivers close (via the Â§(3)-1 discriminator) AND the 20-style re-baseline passes.

Back-port plan (dev-only until the two gates close; GitNexus `impact({direction:'upstream'})` before ANY src/
edit, `detect_changes()` before commit, warn on HIGH/CRITICAL, byte-identical when the flag is off):

1. **Closer-OFF delegation (fixes V2-Â§3a):** wire the flag-off path to delegate to `buildInhouseMetricMesh`
   (adaptive M=g/hÂ² mesh), NOT the style-blind uniform seedMesh. Byte-audit (hash-match) across ALL Tier-A/B
   styles. This is the actual zero-regression guarantee â€” currently UNIMPLEMENTED. Integration wiring, not
   topology.
2. **Tier-C protected-complex builder (the 6 primitives = restriction):** port the topology half VERBATIM â€”
   FGJ Morse graph (all ridge families) â†’ `planarizeMM` (mm-space crossing/T-junction split â†’ residualCrossings=0)
   â†’ no-bridge locked-constraint CDT seed. Proven style-agnostic + count-agnostic. The feature-graph closer is
   the Tier-C dispatch selector; the 6 proven primitives are this kernel's count-stable / empty-or-single-family
   restriction (Â§4 dispatch table).
3. **Tier-C fidelity loop:** port the honest full-azimuth brute STOP-driver + edge/M-square interior refine,
   fired ONLY on count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on the
   byte-identical adaptive M-mesh (empty protected complex â‡’ no Tier-C code path â‡’ byte-identical delegation
   off-feature).
4. **BLOCK on the sliver gate:** do NOT ship until Â§(3)-1 closes slivers while holding 0-outlier fidelity on
   both styles (or the M-metric ACCEPT+DOCUMENT close is proven).
5. **Final gate before flag-flip:** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + the full
   20-style whole-mesh re-baseline (Tier-A/B byte-identical, Tier-C 0-outlier). 4-bay 1.05M<6M is an encouraging
   first data point, not the whole-mesh proof.

**LEDGER:** this file Â§VALIDATION 4 (PI SYNTHESIS). Underlying: E-2026-07-05-PERFECT-MESHER-RELAX (commit
01d9535, pre-reg a29e1a4); E-2026-07-05-PERFECT-MESHER-MSQUARE (7812fc8); E-2026-07-05-PERFECT-MESHER-GOTHIC-BRUTE
(0a95b99); E-2026-07-05-PERFECT-MESHER-GEOSTAR (01f56c2); E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS (05751ad).
DEV-ONLY; no src/ edit; exchange scorecards gitignored, numbers inlined. Reusable: `gradedSeed` +
`relaxLaplacianUnderM` (guarded, LOCK-clean, hold 0 outliers), the FGJâ†’planarizeMMâ†’no-bridge-CDT topology half,
and the honest full-azimuth brute STOP-driver.

---

## VALIDATION 6 â€” CURVED FLANK + DEFINITIVE STATE (2026-07-05) â€” PI SYNTHESIS

The last two open moves RAN: (a) the aniso-ruler metrology (is the sliver an isotropic-ruler artifact on
anisotropy-appropriate cells, or a GENUINE defect?), and (b) the curved-element STRUCTURED SQUARE crest-flank
strip (`refineCrestStrip`, PN-tangent arc-length column march) on BOTH count-unstable styles, with a
degenerate-face-COLLAPSE fallback. This section is the DEFINITIVE roll-up. Trust ONLY the measured numbers
banked in the registry rows cited; nothing new was run here â€” this adjudicates.

### (1) Did the curved crest-flank element close slivers (or at least make Gothic slicer-safe) while holding 0-outlier + watertight, both styles? â€” NO on quality (REFUTED both styles); YES on Gothic slicer-safety via COLLAPSE

**The sliver metrology FIRST settled that the slivers are a GENUINE defect, not a ruler artifact**
(E-ANISO-RULER, REFUTED the artifact hypothesis on BOTH metrics, both styles): the free-cell needles are
MIS-ORIENTED cross-curvature needles â€” worst-60 median longest-edge angle to the crest = **76.4Â° (Gothic) /
75.5Â° (GeoStar)** (i.e. LONG ACROSS the high-curvature flank, micro-thin 1â€“6Âµm ALONG the crest), and they score
WORSE under the curvature-aligned (II,I) metric (99.1% / 84.2% <20Â°), not better. Only **0.5% / 0.4%** of the
iso-<20Â° free cells are anisotropy-appropriate. The isotropic min-angle ruler is telling the truth â€” this is
NOT the "radial overstates near-vertical" class. **Slicer split:** GeoStar's needles are FINITE-area (min
8.5e-5 mmÂ², **zeroArea=0**) â‡’ print-usable as-is; Gothic has **36 zero-area degenerate faces** (UV-collinear,
undefined normal) + 77 sub-ÂµmÂ² â‡’ a genuine slicer risk until repaired.

**The curved STRUCTURED-SQUARE crest-strip then FAILED to close slivers on both styles (7th + 8th refuted
lever):**

| gate | Gothic (1-bay smoke, honest whole-mesh brute) | GeoStar (3-bay smoke) |
|---|---|---|
| interiorOutliers before â†’ after strip | 3* â†’ **14** (worst 0.199â†’0.211mm) â€” REOPENED | 0-guard / strip-brute CAPPED at **4** @0.082 (frozen p6â€“13) |
| pctBelow20 before â†’ after strip | 56.2% â†’ **64.3%** (WORSE) | 21.3% â†’ **50.4%** (WORSE, median 41Â°â†’19Â°) |
| minAngle after | 0.1Â° | 0Â° |
| zeroAreaFaces before â†’ after strip | 3 â†’ 0 | 0 â†’ 0 (already 0) |
| watertight (auditNonManByIndex, non-vac) | 0 âœ“ | 0 âœ“ |
| verdict | **REFUTED** (reopens outliers AND regresses angles) | **REFUTED** (caps outliers AND regresses angles) |

`*` The 3 (not 0) baseline outliers is a **metrology catch** banked in VALIDATION 6: the campaign's whole-patch
"0 interior outliers" was a **top-400-worst-gradU `acceptanceGuard` POPULATION artifact** â€” the CONFIRMED brute
baseline itself carries ~3 whole-mesh outliers (worst 0.199mm) at gradU 110â€“182 that the top-400 (all
gradU>208) never scores; both meshes read 0 under the guard. The GeoStar strip-brute CAP at out=4 (below even
the wide-2000 guard population, gradU min 190.8) RECONFIRMS the same artifact independently. This corrects the
absolute "0" claim (fidelity is ~3â€“4 residual MODERATE-gradU facets, not literally 0) WITHOUT changing any
prior direction (14>3, 4>0 â€” the strip is still strictly worse). **Fix the guard (whole-mesh score at â‰¤120k
tris, tractable, OR gradU-stratified sampling) before any future 0-outlier claim.** Root cause of the strip
failure is style-agnostic: it inserts structured POINTS then re-CDTs with free `cdt2d`, whose Delaunay
reconnects the dense strip points into cross-flank chords â€” the structured-quad intent is DEFEATED by the free
triangulation (identical failure mode on both styles).

**The ONE clean win â€” the degenerate-face COLLAPSE fallback makes Gothic slicer-safe** (on the REAL go/no-go
artifact, the 4-bay M-square 58,365t mesh that actually carries the 36 zero-area faces):

| gate | before | after collapse |
|---|---|---|
| zeroAreaFaces | 36 | **0** |
| subMicro (<1e-6 mmÂ²) | 41 | **0** (77 UV-collinear faces collapsed, 77 verts merged; 58365â†’58211t) |
| interiorOutliers (top-400) | 0 | **0** (max 0.006 HELD) |
| watertight (non-vac inj 0â†’1) | 0 âœ“ | **0 âœ“** |
| pctBelow20 | 56.2% | **56.1%** (collapse fixes only degenerates, not needles â€” as designed) |

â‡’ Gothic is now **PRINT-USABLE (zeroArea=0)** via the collapse post-pass, but NOT angle-clean. GeoStar was
already zeroArea=0, so the collapse adds no print-safety it didn't have and the strip merely regresses angles.

### (2) THE DEFINITIVE GATE TABLE (every gate, measured status)

| Gate | Measured status | Best measured numbers | Scope proven | Source |
|---|---|---|---|---|
| **0-outlier fidelity** (interior true-3D â‰¤0.01, honest full-azimuth brute) | **PROVEN (with guard-population caveat)** â€” flat-P1, usedPnAtApex=FALSE | Gothic 4-bay + GeoStar 1-bay: outliers=0 max 0.006mm converged under the top-400/wide-2000 guard. HONEST whole-mesh brute reveals ~**3 (Gothic) / 4 (GeoStar)** residual MODERATE-gradU facets â‰¤0.21mm the guard never scored | whole-PATCH, both count-unstable styles; guard-population caveat now banked | V2 Â§1/Â§2, V3 Â§1, **V6 (guard artifact)** |
| **Watertight / manifold** (auditNonManByIndex by index, non-vacuous) | **PROVEN** | =0 non-vacuous (inject crack 0â†’1) throughout; residualCrossings=0, 100% recovery, manifold across FGJ junction net | whole-PATCH, both styles, Gothic 4-bay + collapse | V2/V3/V4/V6 |
| **Zero-area / slicer-safe** (zeroArea faces, degenerate-normal) | **PROVEN via COLLAPSE post-pass** | Gothic 36â†’**0** (collapse, HOLDS 0-outlier + watertight); GeoStar **0** natively | whole-PATCH, both styles | V6 (E-ANISO-RULER + E-CRESTSTRIP collapse) |
| **Slivers** (minAngle, pctBelow20) | **OPEN â€” the ONE blocking gate; GENUINE defect (not a ruler artifact)** | Gothic best 56.1% <20Â° minAngle 0; GeoStar 21.3% minAngle 0. Mis-oriented cross-curvature needles (76Â° to crest). **8 levers refuted** | â€” | V2 Â§3b, V3, V4, **V6 (aniso-ruler + crest-strip)** |
| **Cost < 6M budget** | **PROVEN (partial)** | Gothic 4-bay 58,365 tris â†’ projectedFullMeshTris 1,050,570 < 6M (5.7Ã— headroom) | 4-bay projection; full z-height UNMEASURED | V3 Â§2 |
| **Multi-bay** | **PROVEN (Gothic only)** | Gothic 4-bay fidelity+watertight+cost+collapse all HELD | Gothic 4-bay; GeoStar multi-bay UNMEASURED | V3, V6 |
| **Both count-unstable styles** (fidelity) | **PROVEN** | Gothic (zero-width apex) + GeoStar (finite-width chevron, 0â†’7â†’16â†’32â†’8 oscillation) both outliers=0 (guard) | 4-bay Gothic / 1-bay GeoStar | V2 Â§2, V3 Â§1 |
| **Tier-A/B byte-identical** (zero-regression) | **REFUTED as implemented** (design claim, not measured) | seedMesh uniform grid â‰  adaptive buildInhouseMetricMesh (hash mismatch both styles) â€” needs explicit delegation (INTEGRATION) | â€” | V2 Â§3a |
| **Full-mesh scale** (>4 bay / full z-height) | **UNMEASURED** | 5-bay edge-mode killed the window; 4-bay M-square is the only converged multi-bay | â€” | V2 Â§4, V3 |
| **20-style whole-mesh re-baseline** | **NOT RUN** | â€” | â€” | all |

### (3) THE DEFINITIVE VERDICT â€” (b) FIDELITY-COMPLETE + PRINT-USABLE (slicer-safe), angle-imperfect

The perfect mesher is **(b) FIDELITY-COMPLETE whole-PATCH + PRINT-USABLE (slicer-safe) on both count-unstable
styles, but ANGLE-IMPERFECT (slivers open).** Precisely:

- **NOT (a) COMPLETE:** the sliver gate is OPEN and is a GENUINE defect (E-ANISO-RULER killed the "wrong-ruler /
  accept" escape â€” 76Â° cross-curvature needles, worse under the anisotropic metric). 8 levers refuted (Lawson
  flips, M-square spacing, smooth graded seed, Laplacian-under-M relaxation, aniso-ruler-escape, structured
  crest-strip Ã—2 styles, and collapse-doesn't-touch-them). Density / placement / connectivity / flips / free-CDT
  strips are EXHAUSTED.
- **IS (b) FIDELITY-COMPLETE + PRINT-USABLE:** 0-outlier true-3D â‰¤0.01 (flat-P1, no curved element) + watertight
  non-vacuous + slicer-safe (Gothic 36â†’0 zero-area via collapse; GeoStar natively 0) â€” whole-PATCH, both styles,
  Gothic multi-bay, cost 1.05M<6M. The representation question ("can a flat-P1 mesh follow the zero-width
  `ridge(sharp)` apex on a count-unstable network to CAD-grade true-3D") is definitively **YES**.
- **What EXACTLY remains** (in order): (i) **SLIVERS** â€” the only untried lever is a **scoped one-sided PN/P2
  crest-flank element with EXPLICIT structured-quad connectivity that BYPASSES `cdt2d`** (the free re-triangulation
  is what defeated every points-to-CDT strip), OR accept the finite-area needles + collapse as the print-usable
  concession; (ii) **fix the acceptanceGuard** (whole-mesh at â‰¤120k tris) before any further 0-outlier claim â€”
  the honest floor is ~3â€“4 moderate-gradU facets, not literally 0; (iii) **byte-identical Tier-A/B delegation**
  (INTEGRATION); (iv) **full whole-MESH scale** (>4 bay / full z) + GeoStar multi-bay + the 20-style re-baseline.

### (4) PRODUCTIONIZATION â€” GO to STAGE the flag-gated back-port; NO-GO to flag-flip until slivers close

**GO/NO-GO: GO to begin the dev-only, default-off, byte-identical-when-off back-port in parallel with the
sliver-close experiment; NO-GO to flip the flag / ship.** The fidelity + topology + slicer-safe half is proven
and stable; the sliver gate BLOCKS the flip (56% <20Â° would degrade printability, though Gothic-collapse +
GeoStar are watertight-and-printable). Nothing ships until slivers close (or the print-usable concession is
accepted+documented) AND the 20-style re-baseline passes. GitNexus `impact({direction:'upstream'})` before ANY
src/ edit; `detect_changes()` before commit; warn on HIGH/CRITICAL.

**Back-port task breakdown:**

1. **Closer-OFF delegation (fixes V2-Â§3a; the actual zero-regression guarantee) â€”** wire the flag-off path to
   delegate to `buildInhouseMetricMesh` (adaptive M=g/hÂ² mesh), NOT the style-blind uniform seedMesh.
   Byte-audit (hash-match) across ALL Tier-A/B styles. Integration wiring, not topology. *[~2â€“3 tasks: locate
   the export dispatch seam in `ParametricExportComputer`, add the flag + delegation branch, byte-audit harness.]*
2. **Tier-C protected-complex builder (the 6 primitives = restriction) â€”** port the topology half VERBATIM:
   FGJ Morse graph (all ridge families) â†’ `planarizeMM` (mm-space crossing/T-junction split â†’ residualCrossings=0)
   â†’ no-bridge locked-constraint CDT seed. Proven style-agnostic + count-agnostic (Gothic 96-birth net AND
   GeoStar 0â†’7â†’16â†’32 oscillation both clean). The **feature-graph closer is the Tier-C dispatch selector**. *[~3â€“4
   tasks: port `_pf_perfectMesherLib` graph half + `_pf_planarizeMM`; wire the Tier-C style predicate;
   watertight regression gate.]*
3. **Tier-C fidelity loop â€”** port the honest full-azimuth brute STOP-driver + edge/M-square interior refine,
   fired ONLY on count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on the
   byte-identical adaptive M-mesh (empty protected complex â‡’ no Tier-C code path â‡’ byte-identical off-feature
   delegation). **Fix the acceptanceGuard to whole-mesh (â‰¤120k) here** so production 0-outlier claims are honest.
   *[~2â€“3 tasks: port `_pf_pertMesherBruteLib` refine loop; whole-mesh guard; cost cap.]*
4. **Degenerate-face COLLAPSE post-pass (slicer-safety) â€”** port `collapseDegenerateFaces` (welds UV-collinear
   coincident verts; HOLDS 0-outlier + watertight) as a universal final pass so Gothic-class meshes are
   slicer-safe. *[~1 task.]*
5. **BLOCK on the sliver gate â€”** do NOT ship the current sliver-dirty apex refine. Ship only after the
   scoped-PN structured-quad crest-flank element (bypassing cdt2d) closes slivers while holding 0-outlier, on
   BOTH styles â€” OR after an explicit ACCEPT+DOCUMENT decision that finite-area needles + collapse are the
   print-usable concession (GeoStar-class already qualifies; Gothic qualifies post-collapse).
6. **Final go/no-go before flag-flip â€”** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + the full
   20-style whole-mesh re-baseline (Tier-A/B byte-identical, Tier-C 0-outlier under the FIXED whole-mesh guard).

**LEDGER:** this file Â§VALIDATION 6 (PI SYNTHESIS). Underlying registry rows:
E-2026-07-05-PERFECT-MESHER-ANISO-RULER (pre-reg 99ef82d â€” REFUTED artifact â‡’ GENUINE defect),
E-2026-07-05-PERFECT-MESHER-CRESTSTRIP (commit 9e3113a, pre-reg 0d8b91b â€” REFUTED strip; collapse=SLICER-SAFE),
E-2026-07-05-PERFECT-MESHER-GEOSTAR-CRESTSTRIP (result 9abfb17, pre-reg 910d7d0 â€” REFUTED strip). Reusable
banked: `_pf_anisoRulerLib` (honest anisotropic-quality ruler), `refineCrestStrip` +
`collapseDegenerateFaces` (`_pf_crestStripLib`), plus all prior banked instruments. DEV-ONLY; no src/ edit;
exchange scorecards gitignored, numbers inlined. **Guard-population caveat is load-bearing: the whole-patch "0
outliers" is a top-400-gradU population artifact â€” the honest floor is ~3â€“4 moderate-gradU facets; fix the
guard before any future 0-outlier claim.**

---

## VALIDATION 7 â€” GATE-2 SLIVERS via DIRECT-EMISSION STRUCTURED-QUAD STRIP (GeometricStar, 2026-07-05)

The V6 Â§(1) recommended "the only untried lever = a scoped structured-quad crest-flank element with EXPLICIT
connectivity that BYPASSES `cdt2d`" RAN on GeometricStar (which is already whole-mesh FIDELITY-PROVEN 0-outlier
by E-â€¦-GEOSTAR-WHOLEMESH gate1: outliers=0, max 0.01mm, watertight non-vacuous, but SLIVERY pctBelow20=21.7%).
Trust ONLY these measured numbers (registry E-2026-07-05-PERFECT-MESHER-GEOSTAR-STRUCTSTRIP).

### (1) Did the direct-emission structured-quad strip close slivers holding whole-mesh 0-outlier? â€” REFUTED (new mechanism)

The strip DOES bypass cdt2d (bgTris=0 â€” no Delaunay re-chording of strip interiors â‡’ the V6 defeat mode is
ELIMINATED). But it is REFUTED by a DIFFERENT, measured mechanism: **the strips OVERLAP on GeoStar's dense
count-unstable chevron field.**

- **Cheap discriminator FIRST (`_pf_gsstrip_spacing.test.ts`):** nearest-OTHER-crest 3D distance on the band =
  min 0.010 / p50 **0.088** / mean 0.117 mm â‡’ max non-overlapping strip half-width â‰ˆ **0.044mm = 0.7 columns**
  at h=0.06mm. The flank between adjacent straps is SUB-PITCH â€” no square column fits.
- **Measured builds (base = the CONFIRMED whole-mesh 0-outlier mesh):** width 0.9mm no-clamp â†’ 1.06M tris,
  **nonMan 284,102**, pct<20 17.3%, zeroArea 99. Valley-clamped at the Voronoi midline â†’ 738k tris, **nonMan
  219,536**, pct<20 **15.7%** (from 21.7%), minAngle 0, zeroArea 0. Both massively non-manifold: clamping stops
  each strip at the midline but adjacent strips place DIFFERENT (u,t) boundary vertices (their perpendicular
  marches originate from different crests), so faces INTERPENETRATE instead of sharing edges. The guard was not
  run (a non-watertight mesh cannot CONFIRM; FAST-REFUTE short-circuit).

**ROOT CAUSE (style-agnostic for dense count-unstable fields):** direct-emission strips assume feature spacing â‰«
strip width. GeoStar's chevron spacing (0.088mm) is FINER than one square column â‡’ any strip wide enough to be
square overlaps its neighbour. The needles are INTRINSIC at this spacing: crest-a-mesh-edge + sub-pitch flank â‡’
every crest-to-crest triangle is a chord (fidelity-forbidden) or a needle (long-along-crest) â€” the same tension
E-â€¦-ANISO-RULER measured (76Â° cross-curvature needles). pct<20 improved 21.7â†’15.7% (squarer where it fits) but
never watertight, never single-digit â‡’ REFUTE on all three counts.

### (2) NEXT PRIMITIVE (the strip is exhausted; a band-parametrization is the untried move)

Independent per-crest strips over a fixed crest-graph are refuted (they overlap). The next primitive is a
**VALLEY-PARTITIONED SHARED-BOUNDARY band mesh**: build ONE warped structured quad grid per flank BAND between
two consecutive crests, whose two u-edge columns ARE the two bounding crest chains â€” so adjacent bands SHARE the
crest columns â†’ watertight by construction, no overlap. This replaces "strips over a graph" with "bands between
graph edges", and must handle the count-unstable birth/death per band (a band terminates where a strap dies â€”
the 0â†’7â†’16â†’32â†’8â†’0 oscillation). Substantial build; deferred. The overlap refutation is the closing result for
the direct-emission-strip lever (10 sliver levers now refuted).

**BANKED reusable:** `buildStructStrips` (direct-emission structured strip + valley-clamp, `_pf_structStripLib.ts`)
and the crest-spacing discriminator. **LEDGER:** this file Â§VALIDATION 7; registry
E-2026-07-05-PERFECT-MESHER-GEOSTAR-STRUCTSTRIP. DEV-ONLY; no src/ edit.

---

## VALIDATION 7 â€” DIRECT-EMIT STRUCTURED CREST-STRIP (GATE-2 slivers, no cdt2d) â€” REFUTE (2026-07-05)

The GATE-2 task RAN: replace the greedy flat-P1 flank refinement (forced into cross-curvature needles) with an
EXPLICIT STRUCTURED-QUAD FLANK STRIP whose connectivity is EMITTED DIRECTLY â€” each quad â†’ 2 tris, NOT handed to free
cdt2d (the V6 Â§2 CRESTSTRIP re-chord failure mode: it inserted structured points then re-CDT'd â†’ needles). Trust ONLY
the measured numbers (registry E-2026-07-05-CRESTSTRIP-DIRECT, commits e0ff73c + 3648af2).

### (1) Did the direct-emit structured strip close slivers WHILE holding 0-outlier + watertight? â€” NO (REFUTE)

**A genuine method advance (kills two prior failure modes) but the pre-registered CONFIRM is UNMET.** Gothic, trusted
full-azimuth whole-mesh brute guard (`acceptanceGuardWhole`, EVERY free facet, 45-pt denseBary, 1-bay/4mm,
hCrest=dtRow=0.15 = the single-digit-sliver config):

| gate | measured | vs kill-criterion |
|---|---|---|
| pctBelow20 | **0.4%** (median 25Â°, minAngle 11.1Â°) | CLOSES slivers âœ“ |
| zeroAreaFaces | **0** (vs V6 crest-strip's 36) | âœ“ |
| watertight (non-vac inj 0â†’1) | **0** âœ“ | âœ“ |
| **wholeMeshOutliers** (true-3D >0.01, honest brute) | **236 (max 0.220mm)** | âœ— FAILS 0-outlier â‡’ **REFUTE** |

Density does NOT rescue fidelity (fast GN whole-mesh guard, GN EXACT on the single-valued Gothic field): hCrest
0.15â†’750 / 0.08â†’1234 / 0.05â†’1187 / 0.03â†’2472 / 0.02â†’3821 outliers â€” FINER across-crest INCREASES outliers AND
worsens slivers (0.9%â†’89%). The residual is the `pow(sharp)` apex chord, NOT reducible by uniform structured density.
GeoStar is WORSE on both gates (best 76.5% <20Â°; count-oscillating 45â€“65 crests/row breaks the single-crest arc
tracker) â€” the direct strip does not even close GeoStar slivers.

### (2) THE DECISIVE FINDING â€” connectivity was never the blocker; the fidelityâ†”angle tension is the wall

Two things are now PROVEN that were open in V6:
1. **The V6 cdt2d re-chord WAS a real bug and IS fixed.** `buildDirectCrestStrip` (crest-arc rows + crest-track
   columns + direct-emit monotone zipper, NO cdt2d) produces a genuinely clean STRUCTURED grid (render
   `_pf_creststrip_direct_gothic_smoke/window.png`: uniform quads, needles ONLY in a thin band AT each crest rib),
   watertight by construction, zeroArea=0. The diagonal-crest geometry (crests drift ~2.57mm/8mm in u, an
   X-junction) demanded rows spaced by along-CREST 3D arc length, not vertical t â€” the missing lever that took
   pctBelow20 92%â†’0.4%.
2. **Slivers STILL do not co-resolve with fidelity.** The structured strip and the CONFIRMED brute-driven adaptive
   edge-mode refine (Â§V2/WHOLEMESH) INVERT the SAME tension: direct-strip = 0.4% slivers / 236 outliers@0.22mm;
   edge-mode = 0 outliers / 19% slivers. Holding min-angle single-digit REQUIRES a coarse across-crest pitch
   (hCrestâ‰¥0.15), at which the near-vertical flank's first facet chords the concave `pow(sharp)` apex to 0.22mm. A
   FLAT non-adaptive structured facet cannot both stay near-equilateral AND chord the zero-width cusp to â‰¤0.01.

This UPHOLDS the V6 Â§(3) conclusion (the slivers are a GENUINE structural fidelity-vs-min-angle tension at the
near-vertical crest flank), now confirmed from the OTHER side: **9 sliver levers refuted; the direct-emit
structured strip is the 9th â€” it removes the cdt2d re-chord AND the zero-area faces, but not the tension.**

### (3) THE ONE REMAINING MOVE (a HYBRID, not more density)

Graft the honest-brute-DRIVEN adaptive apex refine (the Â§WHOLEMESH edge-mode that reaches 0 outliers) ON TOP of the
clean direct strip, splitting ONLY the outlier apex quads with DIRECT connectivity emission (no cdt2d), so the
structured panel keeps its 0.4% angles while the apex quads alone recurse to â‰¤0.01. Kill-criterion: wholeMeshOutliers
=0 AND pctBelow20 single-digit AND zeroArea=0 AND watertight, BOTH styles. If the apex subdivision re-introduces
needles (likely â€” the apex chord requires needle-fine cells), the zero-width `pow(sharp)` cusp is a PROVEN flat-P1
wall: the E-CRESTRIBBON one-sided PN/P2 element AT the apex leaf (benched unnecessary for FIDELITY) becomes NECESSARY
for QUALITY. Either way the direct strip is the correct STRUCTURED substrate to graft onto.

**BANKED reusable:** `buildDirectCrestStrip` (cdt2d-free, watertight, zeroArea=0 structured crest-strip mesher);
`_pf_direct_gnguard` (fast exact-on-single-valued whole-mesh outlier count); `_pf_direct_svg`/`_slivdiag` (needle
localization). **LEDGER:** registry E-2026-07-05-CRESTSTRIP-DIRECT (e0ff73c + 3648af2). DEV-ONLY; no src/ edit.

---

## VALIDATION 7 â€” LITERAL PERFECTION (PI SYNTHESIS, 2026-07-05)

This is the honest whole-mesh consolidation of the two GATE-1 (fidelity-to-literal-0) results and the two GATE-2
(sliver) refutations. **The load-bearing correction over ALL prior "0 outliers" claims in this document: every
0-outlier number BEFORE this section was scored by a top-N-worst-gradU guard population â€” proven BLIND to
moderate-gradU residual facets. The numbers below are scored over the WHOLE MESH (EVERY free facet, no gradU cap),
45-pt denseBary two-stage utBoundâ†’GN-screenâ†’full-azimuth `bruteNearestOnRadialSurface` ruler.** Trust ONLY these.

### (1) Did the whole-mesh guard drive BOTH count-unstable styles to LITERAL 0 interior outliers? â€” YES (both)

The V6-flagged "0 outliers = GUARD-POPULATION ARTIFACT" hypothesis was CONFIRMED, then CLOSED, on both styles: the
top-400-gradU guard was blind to a real residual set the honest whole-mesh brute exposed, and those residuals were
UNDER-REFINEMENT (not a new wall) â€” refining every facet >0.01 with the honest brute STOP drove them all to 0.

| style | guard-artifact exposed (whole-mesh, on the mesh whose top-N guard read 0) | AFTER whole-mesh refine | verdict |
|---|---|---|---|
| **GothicArches** (zero-width `pow(sharp)` apex) | dense phase-5 revealed **32** residuals, worst **0.216mm**, at gradU 81â€“135 â€” ENTIRELY below the top-400 floor (7-pt loop STOP read 0.00996 on the SAME mesh) | **wholeMeshOutliers = 0**, wholeMeshMax **0.01000** (p99 0.00824, worstGradU 45.2, outlierGradU EMPTY), converged, **30,323 tris** | **CONFIRMED** â€” LITERAL 0 |
| **GeometricStar** (finite-width chevron kink) | **791** residuals (NOT the spec's ~3â€“4), worst **0.02954**, onCrest 289/off 502, gradU 0.41â€“207 â€” ALL below the top-400 guard floor gradUmin 232.94 | **wholeMeshOutliers = 0** (raw max 0.01 = worst facet AT tolerance, 0 strictly >0.01; p99 0.00875, p50 0.00003), converged, **116,889 tris** | **CONFIRMED** â€” LITERAL 0 |

- **No REFUTE branch triggered on either** (pre-registered REFUTE = a facet floors >0.02 after termination): the
  residuals were UNDER-REFINED, driven to 0 in 2 (Gothic) / 5 (GeoStar) dense passes. Pass traces show the sharp
  convergence tail, NOT a floor: Gothic 32â†’0; GeoStar 0.0295/791 â†’ 0.0111/6 â†’ 0.0115/2 â†’ 0.0110/10 (a periodic
  whole-scan caught 10 facets a distant re-triangulation reshaped â€” proving the whole-mesh scan is NECESSARY) â†’
  0.0060/0.
- **Watertight non-vacuous on both:** `auditNonManByIndex = 0` by index, injected-crack control moves 0â†’1.
  Manifold across the FGJ junction network.
- **Both by FLAT P1** (`usedPnAtApex = FALSE`) â€” the scoped apex PN/P2 element was benched and PROVED UNNECESSARY.
- **Render agrees with metric on both:** `_pf_perfect_gothic_wholemesh/gothic_wholemesh_true3d.png` and
  `_pf_perfect_geostar_wholemesh/geostar_wholemesh_true3d.png` â€” whole patch GREEN under the true-3D perpendicular
  ruler, 0.00% >0.03, no red on crest/chevron flanks.

**Root-cause decisiveness (Gothic, the sharpest case):** on the SAME mesh, the loop's 7-pt STOP driver read worst
0.00996 (â‡’ "0") while the 45-pt guard read worst 0.224 / 17 outliers at gradU 81â€“135. The driver was BLIND to the
moderate-gradU residuals. The whole-mesh 45-pt guard both SEES and CLOSES them. **Mandate banked: no future
0-outlier claim on any style may use a top-N-gradU population â€” it is proven blind by 791 (GeoStar) and 32 (Gothic)
missed facets.**

### (2) Did the structured-quad strip close slivers holding literal-0 + slicer-safe? â€” NO (REFUTE, both styles, distinct mechanisms)

Two independent direct-emission structured-quad strip experiments (Gothic-primary CRESTSTRIP-DIRECT + GeoStar
STRUCTSTRIP) both REFUTED â€” but they ELIMINATED the V6 cdt2d re-chord failure mode (bgTris=0, zeroArea 36â†’0) and
advanced the method. The two refutations are from OPPOSITE sides of the same fidelityâ†”angle tension:

| style | strip result | closes slivers? | holds literal-0? | slicer-safe / watertight? | refuting mechanism |
|---|---|---|---|---|---|
| **GothicArches** | direct-emit crest-strip, hCrest=0.15 (single-digit config) | **YES â€” pctBelow20 0.4%** (median 25Â°) | **NO â€” 236 outliers, max 0.220mm** | zeroArea 0 âœ“, watertight 0 non-vac âœ“ | at the coarse pitch that makes squares, the near-vertical flank's FIRST facet chords the `pow(sharp)` apex to 0.22mm; finer pitch INCREASES outliers (0.15â†’236, 0.02â†’3821) AND worsens angles (0.4â†’89%) |
| **GeometricStar** | direct-emission valley-clamped strip | NO (best 15.7%) | moot (âˆ’1, guard skipped) | **NO â€” nonMan 219,536** âœ— | chevron spacing p50 **0.088mm** < one square column (0.044mm half-width) â‡’ adjacent strips place DIFFERENT (u,t) midline verts â†’ INTERPENETRATE, non-watertight |

**The decisive cross-style finding (11 sliver levers now refuted):** connectivity was NEVER the blocker. The
structured strip and the CONFIRMED brute-driven adaptive edge-mode refine (Â§1 above) INVERT the SAME structural
tension â€” Gothic: strip = 0.4% slivers / 236 outliers@0.22mm vs edge-mode = 0 outliers / 19% slivers. Holding
single-digit min-angle REQUIRES a coarse across-crest pitch, at which a FLAT structured facet chords the
zero-width cusp; holding 0-outlier REQUIRES apex-fine facets, which are needles. **A flat non-adaptive structured
facet cannot BOTH stay near-equilateral AND chord the zero-width `pow(sharp)` apex to â‰¤0.01.** On GeoStar the
strip fails EARLIER (sub-pitch overlap â†’ non-watertight). This UPHOLDS the GENUINE-cross-curvature-needle
conclusion from BOTH sides.

### (3) DEFINITIVE GATE TABLE â€” HONEST WHOLE-MESH NUMBERS (no guard-population caveat; every gate over ALL facets)

| GATE | GothicArches (zero-width apex) | GeometricStar (finite-width chevron) | status |
|---|---|---|---|
| **FIDELITY** â€” interiorOutliers (true-3D >0.01), WHOLE-MESH honest brute, EVERY facet | **0** (max 0.01000, p99 0.00824) | **0** (max 0.01, p99 0.00875) | **LITERAL 0 âœ“ both** |
| **WATERTIGHT** â€” auditNonManByIndex, non-vacuous | **0** (inj 0â†’1) | **0** (inj 0â†’1) | **âœ“ both** |
| **MANIFOLD** â€” across FGJ junction net | âœ“ (residualCrossings=0, 100% recovery) | âœ“ (fam=2, residualCrossings=0) | **âœ“ both** |
| **ELEMENT** â€” usedPnAtApex | FALSE (flat-P1) | FALSE (flat-P1) | **flat-P1 suffices âœ“ both** |
| **SLIVERS** â€” pctBelow20 / minAngle (best measured, holding fidelity) | 19.0% / 0Â° (edge-mode); M-square 56.2%; strip 0.4% but 236 outliers | 21.7% / 0Â° (whole-mesh); strip non-watertight | **OPEN â€” FAIL both** |
| **tri-count** (patch) | 30,323 (2-bay) | 116,889 | within 6M patch budget |
| **TIER-A/B byte-identical** (zero-regression) | â€” | â€” | **REFUTED as implemented (V2-Â§3a) â€” integration task** |

### (4) IS THE PERFECT MESHER LITERALLY COMPLETE? â€” NO. Precise honest remainder: ONE gate (slivers) + scale/integration.

**Three of the four print-critical gates are LITERALLY CLOSED whole-mesh on BOTH count-unstable styles by flat-P1:**
FIDELITY (literal whole-mesh 0-outlier, not a guard-population 0), WATERTIGHT (non-vacuous), MANIFOLD. This is the
campaign's deepest result: **the last REPRESENTATION wall (zero-width `pow(sharp)` on count-unstable networks) is
closed to CAD-grade true-3D with a FLAT simplex + honest-brute-driven interior refinement â€” no curved element.**
The prior GN-driver REFUTE and the guard-population "0" are both now superseded by an HONEST whole-mesh 0.

**The mesher is NOT literally complete. The precise, honest remainder:**

1. **SLIVERS (the ONE open print-usability gate).** minAngle=0Â°, best pctBelow20 = 19â€“21% under fidelity;
   density-INVARIANT. **Refuted levers (11):** a-posteriori Lawson flips (REOPEN outliers 0â†’57, V2-Â§3b),
   M=g/hÂ² insertion spacing (partial, 81â†’56% Gothic, V3), direct-emit structured strip (0.4% BUT 236 outliers /
   or non-watertight, this section), + 8 prior. The tension is GENUINE (metrology-confirmed cross-curvature
   needles), NOT an instrument artifact. The strip PROVED connectivity is not the blocker; the flat element at
   apex-fine density is. **The ONE untried move = HYBRID: graft the honest-brute-driven adaptive apex refine
   (reaches 0-outlier) onto the clean direct strip (reaches 0.4% angles), splitting ONLY outlier apex quads with
   direct connectivity emission.** If that re-introduces apex needles (likely), the E-CRESTRIBBON one-sided PN/P2
   element AT the apex leaf â€” benched UNNECESSARY for fidelity â€” becomes NECESSARY for QUALITY. This is the single
   next experiment. Alternative: ACCEPT+DOCUMENT finite-area needles + degenerate-collapse as the print-usable
   concession (GeoStar-class already qualifies; Gothic post-collapse).
2. **WHOLE-MESH SCALE (integration, not representation).** CONFIRMs are 2-bay (Gothic 30,323t) / patch-band
   (GeoStar 116,889t). >4-bay / full-z whole-MESH tri-count vs 6M budget under the DENSE whole-mesh guard is
   UNMEASURED (M-square 4-bay projected 1.05M < 6M is the closest datum, V3). No 20-style whole-mesh re-baseline.
3. **TIER-A/B byte-identical delegation (integration).** The seedMesh uniform grid â‰  `buildInhouseMetricMesh`
   adaptive M-mesh; the zero-regression guarantee is an UNIMPLEMENTED design claim (V2-Â§3a). Explicit delegation
   + byte-audit is required before any productionization claim.

### (5) PRODUCTIONIZATION BACK-PORT READINESS â€” BLOCKED on the sliver gate; topology + fidelity halves are port-ready

**Do NOT flag-flip yet.** The fidelity + topology halves of the kernel are proven and port-ready; the sliver gate
blocks print-usability. Readiness by component (all DEV-ONLY today; GitNexus `impact({direction:'upstream'})`
before ANY src/ edit, `detect_changes()` before commit, warn on HIGH/CRITICAL):

- **READY to port (proven, style-/count-agnostic):** (a) topology half â€” FGJ Morse graph (all ridge families) â†’
  `planarizeMM` (mm-space crossing/T-junction split â†’ residualCrossings=0) â†’ no-bridge locked-constraint CDT seed
  (Gothic 96-birth net AND GeoStar 0â†’7â†’16â†’32 oscillation both clean); (b) fidelity loop â€” honest full-azimuth
  brute STOP-driver + edge/M-square interior refine + the WHOLE-MESH acceptance guard (`refineInteriorBruteWhole`
  + `acceptanceGuardWhole`, banked â€” MANDATORY so production 0-outlier claims are honest); (c) degenerate-face
  collapse post-pass (slicer-safety, holds 0-outlier + watertight).
- **INTEGRATION prerequisite (not topology):** wire the closer-OFF path to delegate to `buildInhouseMetricMesh`
  (byte-audit all Tier-A/B) â€” this is the actual zero-regression guarantee that V2-Â§3a proved is unimplemented.
- **HARD BLOCKER:** ship only after slivers close (hybrid strip+brute-apex, or PN apex leaf) OR an explicit
  ACCEPT+DOCUMENT concession â€” the current sliver-dirty apex refine (19â€“21% <20Â°, minAngle 0) would degrade
  printability.
- **FINAL go/no-go:** whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + full 20-style whole-mesh
  re-baseline (Tier-A/B byte-identical, Tier-C literal-0 under the FIXED whole-mesh guard).

**BANKED reusable (this section):** `refineInteriorBruteWhole` + `acceptanceGuardWhole` + `facetInteriorGuardDense`
(`_pf_perfectMesherBruteLib.ts` / `_pf_wholeMeshGuardLib.ts`), `wholeMeshGuard`, `buildDirectCrestStrip` +
`buildStructStrips` (cdt2d-free structured strip meshers), the crest-spacing discriminators. **LEDGER:** this file
Â§VALIDATION 7 â€” LITERAL PERFECTION. Registry rows: E-2026-07-05-PERFECT-MESHER-WHOLEMESH-GOTHIC (pre-reg dce21de,
CONFIRM b928169, full-density 6c8b97f), E-2026-07-05-PERFECT-MESHER-GEOSTAR-WHOLEMESH (pre-reg 1bf283e, CONFIRM
f2dc55b), E-2026-07-05-PERFECT-MESHER-GEOSTAR-STRUCTSTRIP (fe8906e), E-2026-07-05-CRESTSTRIP-DIRECT (e0ff73c +
3648af2). DEV-ONLY; no src/ edit; exchange scorecards gitignored (numbers inlined).

---

## VALIDATION 8 â€” GeoStar HYBRID (strip + apex refine) REFUTED; slivers re-localized to the OFF-crest panel (2026-07-05)

The VALIDATION-7 Â§(3) "ONE remaining move = HYBRID" RAN on GeometricStar with the mandated prerequisite (fix the
strip pitch to respect the chevron sub-pitch â†’ watertight â†’ THEN localized apex refine). **REFUTED**, and the cheap
discriminator overturned the task's premise before any expensive build.

- **Strip prerequisite FAILS at sub-pitch (measured):** `buildStructStrips` valley-clamped at every sub-pitch config
  (h=0.03/w=0.12/0.06, h=0.02/w=0.04) stays NON-watertight (nonMan 246â†’737, never 0) and makes slivers WORSE
  (pct<20 24â€“26% vs 21.7%). Adjacent narrow per-crest strips place non-shared midline verts (architectural, not a
  pitch bug) + collapse to ~2 columns at sub-pitch. `buildDirectCrestStrip` (shares valley nodes) was already refuted
  on GeoStar (87% <20Â°) â€” its offset fan overshoots the 0.044mm valley at 45â€“65 crests/row.
- **DECISIVE re-localization (`_pf_geostar_hybrid_diag`):** of the 21.7% <20Â° facets, **91% are OFF-crest**
  grading-transition needles (edge-ratio p50 6.3, spread 1â€“2mm across the smooth panel), only 9% on-crest. IDENTICAL
  on the pre-refine brute mesh â‡’ baked into the seed+free-cdt2d, NOT the refine. The crest-strip+apex HYBRID targets
  only the 9% minority â‡’ cannot reach single-digit even if it perfectly closed the crest.
- **Re-scope:** GeoStar slivers are a DIFFERENT class than Gothic's (Gothic = crest-flank cross-curvature; GeoStar =
  off-crest panel grading-transition). Lever#1/#2 (graded seed + Laplacian-under-M relax) were refuted only on
  GOTHIC, NEVER run on GeoStar â€” and they target EXACTLY the off-crest grading class. **That is the correct next
  experiment on GeoStar, not the strip.** 12th refuted sliver lever. The gate table is unchanged (SLIVERS still the
  ONE open gate); only the GeoStar sliver ATTACK is re-pointed.

**LEDGER:** registry E-2026-07-05-PERFECT-MESHER-GEOSTAR-HYBRID. Probes `_pf_geostar_hybrid_diag[2].test.ts` +
`_pf_geostar_hybrid.test.ts`; config `vitest.pf_gshybrid.config.ts`. DEV-ONLY; no src/ edit.

---

## VALIDATION 8 â€” HYBRID / FINAL (2026-07-05) â€” PI SYNTHESIS (the definitive close of the sliver arm)

Both hybrid arms RAN â€” Gothic (structured strip + localized honest-brute apex refine) AND GeoStar (sub-pitch
strip + apex refine). This is the DEFINITIVE roll-up of the entire perfect-mesher campaign. Trust ONLY the
measured whole-mesh numbers banked in the registry rows cited; nothing new was run here â€” this adjudicates.

### (1) Did the HYBRID close BOTH gates (whole-mesh 0-outlier AND single-digit %<20 AND watertight AND slicer-safe) on both styles? â€” NO on BOTH (REFUTED); it is an INVERTED-TENSION FRONTIER, not a co-close

**REFUTED on both count-unstable styles, by two DISTINCT measured mechanisms â€” the 12th refuted sliver lever.**
The hybrid (clean direct-emit structured strip â†’ 0.4% angles + localized red-green 1â†’4 honest-brute apex refine)
does NOT co-resolve fidelity and slivers on either style:

| style | hybrid arm result (honest whole-mesh brute, cdt2d-free red-green refiner) | closes both gates? | refuting mechanism (MEASURED) |
|---|---|---|---|
| **GothicArches** (zero-width `pow(sharp)` apex) | GN-anchored STOP read "0" but full-azimuth 45-pt brute guard = **67 outliers max 0.219mm** at gradU 124â€“178; honest-brute STOP arm drove outliers 410â†’341â†’168 but the WORST **FROZE 0.471â†’0.386â†’0.393â†’0.399** while tris grew 4543â†’9931; pctBelow20 10.5%, zeroArea 0, watertight 0 non-vac âœ“ | **NO** (fidelity floors) | the direct strip's fixed crest-column connectivity BAKES IN an **apex-STRADDLING facet** (all 3 verts near-crest, radii 47.65/48.00/47.66 vs rMean 45); a RED 1â†’4 keeps a corner child touching the apex vertex â‡’ re-chords the zero-width cusp. The CONFIRMED whole-mesh edge-mode reaches 0 only because cdt2d **FLIPS** the straddler into two flank-only facets meeting AT the apex â€” the strip FORBIDS cdt2d, so local red-green cannot un-straddle. |
| **GeometricStar** (finite-width chevron, 0.088mm sub-pitch) | strip prerequisite **FAILS watertight at every sub-pitch config** (`buildStructStrips` valley-clamp h=0.03/w=0.12/0.06, h=0.02/w=0.04 â†’ nonMan 246â†’737, never 0; pct<20 24â€“26% WORSE). Apex refine MOOT (prerequisite unmet). Base whole-mesh mesh IS 0-outlier/watertight/21.7% slivers | **NO** (strip non-watertight + wrong target) | (a) adjacent narrow per-crest strips place NON-SHARED midline verts (architectural, not a pitch bug) â†’ interpenetrate; (b) **DECISIVE re-localization: 91% of the <20Â° facets are OFF-crest** grading-transition needles in the smooth panel (edge-ratio p50 6.3), only 9% on-crest â‡’ the crest-strip+apex hybrid targets a 9% minority and cannot reach single-digit even if it perfectly closed the crest. |

The two arms fail from OPPOSITE sides but confirm the SAME structural wall: **the honest final state is an
INVERTED-TENSION FRONTIER, not a co-close.** On Gothic the two mechanisms INVERT the SAME tension â€”
strip = 0.4% slivers / 236 outliers@0.22mm (fidelity fails) vs edge-mode = 0 outliers / 19% slivers (angles
fail); the hybrid graft cannot occupy both corners because the strip's structured connectivity is EXACTLY what
prevents un-straddling the zero-width apex, and un-straddling requires the cdt2d flip the strip forbids. On
GeoStar the strip fails EARLIER (sub-pitch overlap â†’ non-watertight) AND attacks the wrong 9% class.

**ROOT CAUSE (measured, not inferred) â€” a REPRESENTATION floor, not a connectivity/density/placement bug:**
a FLAT P1 element at the zero-width `pow(sharp)` apex must EITHER chord the concave cusp (fidelity-forbidden)
OR be a needle long-along-crest (angle-forbidden). Every connectivity/density/placement/flip lever reconnects
or moves the SAME point set and cannot escape. Closing BOTH gates on Gothic needs an ELEMENT change (one-sided
PN/P2 at the apex-straddling crest-column leaf), NOT more of the same substrate.

### (2) THE DEFINITIVE FINAL GATE TABLE â€” HONEST WHOLE-MESH (every free facet, no gradU-population cap)

Scored over the WHOLE MESH by the trusted 45-pt denseBary full-azimuth `bruteNearestOnRadialSurface` ruler
(the top-N-gradU guard is PROVEN blind â€” superseded in VALIDATION 7). Best measured numbers, holding fidelity.

| GATE | GothicArches (zero-width apex) | GeometricStar (finite-width chevron) | status |
|---|---|---|---|
| **FIDELITY** â€” interiorOutliers (true-3D >0.01), WHOLE-MESH, EVERY facet | **0** (max 0.01000, p99 0.00824), converged, 30,323t | **0** (max 0.01, p99 0.00875, p50 0.00003), converged, 116,889t | **LITERAL 0 âœ“ BOTH** |
| **WATERTIGHT** â€” auditNonManByIndex by index, non-vacuous (inj 0â†’1) | **0** âœ“ | **0** âœ“ | **âœ“ BOTH** |
| **MANIFOLD** â€” across FGJ junction net (residualCrossings=0, 100% recovery) | âœ“ (fam=2) | âœ“ (fam=2, segU 728/segT 215) | **âœ“ BOTH** |
| **SLICER-SAFE** â€” zeroArea / degenerate-normal faces | **0** (via collapse post-pass, 36â†’0, HOLDS fidelity+watertight) | **0** (natively) | **âœ“ BOTH** |
| **ELEMENT** â€” usedPnAtApex | FALSE (flat-P1) | FALSE (flat-P1) | flat-P1 suffices for fidelity âœ“ |
| **SLIVERS** â€” pctBelow20 / minAngle (best, holding fidelity) | **19.0% / 0Â°** (whole-mesh edge-mode; M-square 56.2%; strip 0.4% BUT 236 outliers; hybrid 10.5% BUT 67 outliers) | **21.7% / 0Â°** (whole-mesh; 91% OFF-crest panel needles; strip non-watertight; hybrid MOOT) | **OPEN â€” FAIL BOTH (12 levers refuted)** |
| **tri-count** (patch) | 30,323 (2-bay); 4-bay M-square 58,365 â†’ projected full-mesh **1,050,570 < 6M** | 116,889 (patch-band) | within 6M patch budget |
| **TIER-A/B byte-identical** (zero-regression) | â€” | â€” | **REFUTED as implemented (V2-Â§3a) â€” integration task, not topology** |
| **FULL whole-MESH scale** (>4 bay / full z) | 4-bay measured; >4-bay UNMEASURED | multi-bay UNMEASURED | **UNMEASURED** |
| **20-style whole-mesh re-baseline** | â€” | â€” | **NOT RUN** |

### (3) THE DEFINITIVE VERDICT â€” (b) FIDELITY-COMPLETE + WATERTIGHT + SLICER-SAFE whole-mesh, both styles; SLIVERS a documented print-usable concession (angle-imperfect); NOT literally complete

The perfect mesher is **NOT (a) literally complete.** It is **(b) FIDELITY-COMPLETE + WATERTIGHT + MANIFOLD +
SLICER-SAFE whole-mesh on BOTH count-unstable styles by a FLAT-P1 element**, with EXACTLY ONE quality gate open
(slivers) and two integration/scale items outstanding. Precisely:

- **FOUR of the five print-critical gates are LITERALLY CLOSED whole-mesh, both styles, flat-P1:** FIDELITY
  (literal whole-mesh 0-outlier, max 0.01mm â€” NOT a guard-population 0), WATERTIGHT (non-vacuous), MANIFOLD,
  SLICER-SAFE (zeroArea 0). **This is the campaign's deepest and final fidelity result: the last REPRESENTATION
  wall â€” zero-width `pow(sharp)` cusps on count-unstable feature networks â€” is closed to CAD-grade true-3D with
  a FLAT simplex + honest-brute-driven interior refinement, no curved element.** The 2026-07-04b GN-driver
  REFUTE, the guard-population "0", and the "needs a curved P2/PN" framing are ALL superseded.
- **The FIFTH gate â€” SLIVERS â€” is OPEN and is a GENUINE defect** (E-ANISO-RULER killed the wrong-ruler/accept
  escape: 76Â° cross-curvature needles, WORSE under the anisotropic metric; NOT the "radial overstates
  near-vertical" class). Best under fidelity: Gothic 19% / GeoStar 21.7% <20Â°, minAngle 0Â°, density-INVARIANT.
  **12 sliver levers now refuted** (Lawson flips, M-square spacing, smooth graded seed, Laplacian-under-M relax,
  aniso-ruler-escape, structured crest-strip Ã—2, collapse-doesn't-touch, direct-emit strip, GeoStar sub-pitch
  strip, Gothic hybrid apex, GeoStar hybrid). Density / placement / connectivity / flips / free-CDT strips /
  local red-green refine are EXHAUSTED. The hybrid PROVED connectivity was never the blocker â€” the flat element
  at the apex-straddling leaf is.
- **What EXACTLY remains** (in order): (i) **SLIVERS** â€” the SOLE untried representation move is a **scoped
  one-sided PN/P2 curved element AT the apex-straddling crest-column leaf on the direct strip** (benched
  UNNECESSARY for fidelity, now PROVEN necessary to hold BOTH gates on the structured substrate); on GeoStar the
  correct un-tried lever is **graded-seed + Laplacian-under-M relaxation** (refuted only on Gothic, targets
  exactly the 91% OFF-crest panel grading class â€” a DIFFERENT sliver class than Gothic's crest-flank). OR the
  **ACCEPT+DOCUMENT concession**: ship the finite-area needles + collapse as print-usable (GeoStar-class already
  zeroArea=0; Gothic post-collapse). (ii) **Byte-identical Tier-A/B delegation** (INTEGRATION). (iii) **Full
  whole-MESH scale** (>4 bay / full z) + GeoStar multi-bay + the 20-style whole-mesh re-baseline.

### (4) PRODUCTIONIZATION READINESS + BACK-PORT PLAN â€” GO to STAGE the flag-gated back-port; NO-GO to flag-flip until slivers close or the concession is accepted

**GO/NO-GO: GO to begin the dev-only, default-off, byte-identical-when-off back-port in parallel; NO-GO to flip
the flag / ship.** The fidelity + topology + slicer-safe halves are proven, stable, and port-ready; the sliver
gate BLOCKS the flip (19â€“21% <20Â°, minAngle 0 would degrade printability â€” unless the finite-area-needle
concession is explicitly accepted, in which case GeoStar and Gothic-post-collapse are watertight-and-printable
TODAY). GitNexus `impact({target, direction:'upstream'})` before ANY src/ edit; `detect_changes()` before
commit; warn on HIGH/CRITICAL; byte-identical when off.

Back-port task breakdown (the 6 proven primitives = this kernel's count-stable / empty-or-single-family
RESTRICTION per the Â§4 dispatch table; the feature-graph closer is the Tier-C dispatch selector):

1. **Closer-OFF delegation (fixes V2-Â§3a â€” the actual zero-regression guarantee) â€”** wire the flag-off path to
   delegate to `buildInhouseMetricMesh` (adaptive M=g/hÂ² mesh), NOT the style-blind uniform seedMesh.
   Byte-audit (hash-match) across ALL Tier-A/B styles. Integration wiring, not topology. *[~2â€“3 tasks.]*
2. **Tier-C protected-complex builder (topology half, VERBATIM) â€”** FGJ Morse graph (all ridge families) â†’
   `planarizeMM` (mm-space crossing/T-junction split â†’ residualCrossings=0) â†’ no-bridge locked-constraint CDT
   seed. Proven style-/count-agnostic (Gothic 96-birth net AND GeoStar 0â†’7â†’16â†’32â†’8 oscillation both clean).
   *[~3â€“4 tasks.]*
3. **Tier-C fidelity loop â€”** honest full-azimuth brute STOP-driver + edge/M-square interior refine + the
   WHOLE-MESH acceptance guard (`refineInteriorBruteWhole` + `acceptanceGuardWhole` â€” MANDATORY so production
   0-outlier claims are honest; the top-N-gradU guard is proven blind). Fire ONLY on count-unstable/high-relief
   protected-complex styles so Tier-A/B stays on the byte-identical adaptive M-mesh (empty protected complex â‡’
   no Tier-C path â‡’ byte-identical off-feature). *[~2â€“3 tasks.]*
4. **Degenerate-face COLLAPSE post-pass (slicer-safety) â€”** port `collapseDegenerateFaces` (welds UV-collinear
   coincident verts; HOLDS 0-outlier + watertight) as a universal final pass. *[~1 task.]*
5. **HARD BLOCKER on the sliver gate â€”** do NOT ship the current sliver-dirty apex refine. Ship only after
   EITHER the scoped one-sided PN/P2 apex-leaf element closes slivers holding 0-outlier on BOTH styles (Gothic)
   + graded-seed/Laplacian-under-M closes the OFF-crest panel class (GeoStar), OR an explicit ACCEPT+DOCUMENT
   decision that finite-area needles + collapse are the print-usable concession.
6. **FINAL go/no-go before flag-flip â€”** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate (4-bay
   1.05M<6M is an encouraging first datum, not the proof) + full 20-style whole-mesh re-baseline (Tier-A/B
   byte-identical, Tier-C literal-0 under the FIXED whole-mesh guard).

**LEDGER:** this file Â§VALIDATION 8 â€” HYBRID / FINAL. Underlying registry rows:
E-2026-07-05-HYBRID-APEX (Gothic hybrid REFUTED; pre-reg 4f243f3, result a80ef6b),
E-2026-07-05-PERFECT-MESHER-GEOSTAR-HYBRID (GeoStar hybrid REFUTED; commit 56f3415),
E-2026-07-05-PERFECT-MESHER-WHOLEMESH-GOTHIC (b928169), E-2026-07-05-PERFECT-MESHER-GEOSTAR-WHOLEMESH (f2dc55b),
E-2026-07-05-CRESTSTRIP-DIRECT (e0ff73c + 3648af2), E-2026-07-05-PERFECT-MESHER-ANISO-RULER,
E-2026-07-05-PERFECT-MESHER-RELAX (01d9535). Probes `_pf_hybrid_apex.test.ts` + `_pf_hybridApexLib.ts`
(buildHybridApex), `_pf_geostar_hybrid[_diag[2]].test.ts`; banked cdt2d-free red-green refiner + strip builders.
**BANKED MANDATE (load-bearing):** no future 0-outlier claim may use a top-N-gradU guard population â€” proven
blind by 791 (GeoStar) / 32 (Gothic) missed moderate-gradU facets; use `acceptanceGuardWhole` (every facet).
DEV-ONLY; no src/ edit; exchange scorecards gitignored, numbers inlined.

---

## VALIDATION 9 â€” SLIVER LEVER 13a: scoped apex Vlachos-PN element REFUTED (Gothic, 2026-07-05)

The V8 Â§(1) "SOLE untried representation move = a scoped one-sided PN/P2 curved element AT the apex-straddling
leaf" RAN on the CONFIRMED whole-mesh Gothic mesh (`refined_mesh.bin`, 30,323t, whole-mesh 0-outlier, 19% <20Â°).
**REFUTED (13th sliver lever)** â€” and the diagnosis overturned the task's premise + benched the specific element.
Trust ONLY these measured numbers (registry E-2026-07-05-GOTHIC-APEXPN, pre-reg d6b2cf1).

- **Localization refutes "apex rings":** the 5757 needles (19%) are NOT a thin apex ring â€” **5123 (89%) are
  high-gradU crest-flank** (centroid gradU p50 133.8) forming **6 large connected clusters** (~850 facets each),
  + 634 low-gradU panel needles. There is no thin apex ring to scope to; the needles are the whole near-vertical
  crest-flank BAND.
- **The re-tessellation is a NO-OP on slivers** (19.0â†’19.0) â€” only 5/5757 facets touched (large clusters have
  non-simple/pinched boundaries â†’ safe-skip) â€” while HOLDING whole-mesh 0-outlier (max 0.01, full 45-pt
  `acceptanceGuardWhole`) + watertight non-vacuous. The mechanism cannot even engage the population.
- **DECISIVE element-level discriminator (`pnFlipDiscriminator`): the Vlachos PN element is WORSE than the flat
  chord at riding the concave Gothic cusp.** Over 6069 near-apex-needle internal edges, 1801 flips are rounder
  (min-angle p50 7.0Â°â†’18.4Â°), but the flipped facets' true-3D dev is **flatDev p50/p90 0.0023/0.1287 vs pnDev
  0.0285/0.2602** â€” the PN cubic is ~12Ã— worse at p50; it rides within-tol where flat fails in only 3/200 cases.
  ROOT CAUSE: the one-sided Vlachos PN is built from the near-vertical flank normals and OVERSHOOTS the concave
  `pow(sharp)` knife-edge instead of following it â€” a convex-biased element cannot represent a concave cusp.

**This UPHOLDS the V8 structural-tension conclusion from the ELEMENT side.** The gate table is UNCHANGED: SLIVERS
remains the ONE open gate (Gothic 19% / GeoStar 21.7%, minAngle 0, print-usable-with-finite-area-needles +
collapse concession). The "needs a curved P2/PN at the apex" hope named in V8 Â§(1) is now SPECIFICALLY refuted for
the Vlachos PN element; the genuinely untried move is a CONCAVE-aware element (normal-sign-corrected / subdivision
surface), NOT the convex PN â€” but density/placement/connectivity/flips/PN are all exhausted, so this is a distant
option and the ACCEPT+DOCUMENT concession stands. **Reusable banked:** `_pf_apexPnLib` (buildApexPnTess cluster
re-tessellator + pnFlipDiscriminator element-level curved-vs-flat ruler + diagnoseNeedles localizer).

**LEDGER:** this file Â§VALIDATION 9 (13a). Registry E-2026-07-05-GOTHIC-APEXPN. Probe `_pf_apex_pn.test.ts`
(PF_APEXPN=1), lib `_pf_apexPnLib.ts`, config `vitest.pf_apexpn.config.ts`. Render
`research/exchange/_pf_apex_pn/apexpn_true3d.png`. DEV-ONLY; no src/ edit.

---

## VALIDATION 9 â€” 13TH SLIVER LEVER (BOTH CLASSES) + 20-STYLE WHOLE-MESH RE-BASELINE (2026-07-05)

The definitive roll-up. Two better-targeted 13th sliver levers RAN â€” one per sliver CLASS (Gothic apex-PN
above Â§13a; GeoStar OFF-crest panel-relax below Â§13b) â€” AND the first HONEST WHOLE-MESH 20-style re-baseline
scored every free facet with NO top-N guard cap. This section adjudicates the FINAL all-styles gate. Trust
ONLY the measured whole-mesh numbers in the registry rows cited.

### (1) Did the 13th sliver lever close Gothic (apex-PN) and/or GeoStar (panel-relax)? â€” NO on BOTH (13th refuted lever, each class)

**REFUTED on both count-unstable styles, from OPPOSITE mechanisms â€” confirming the classes are DISTINCT.**

| style | 13th lever (targeted to its OWN sliver class) | pctBelow20 beforeâ†’after | outliers held? | verdict + refuting mechanism (MEASURED, whole-mesh brute) |
|---|---|---|---|---|
| **GothicArches** (crest-flank BAND, 89% high-gradU) | scoped one-sided **Vlachos-PN** re-tess at the apex-straddling leaf (Â§13a) | 19.0 â†’ **19.0** (minAngle 0â†’0) | **YES** (max 0.01, `acceptanceGuardWhole` full 45-pt, watertight non-vac) | **REFUTE** â€” (a) NO thin apex ring: 5757 needles = 6 large connected crest-flank clusters (non-simple boundaries â†’ 5/5757 touched â†’ NO-OP on slivers); (b) DECISIVE `pnFlipDiscriminator`: PN true-3D dev p50 0.0285 vs flat 0.0023 (**~12Ã— WORSE**) â€” a convex-biased Vlachos PN OVERSHOOTS the concave `pow(sharp)` cusp. |
| **GeometricStar** (91% OFF-crest PANEL grading needles) | surface-preserving **Laplacian-under-M relaxation** (quality-directed, honest-brute reject-guard), targeting the panel class (Â§13b) | 21.7 â†’ **20.0** (minAngle 0â†’2.5Â°) | **NO â€” REOPENED 0â†’427** (max 0.0123, 236 on-crest/191 off; watertight held 0) | **REFUTE (both branches)** â€” quality snapshot PLATEAUS 19.7/19.7/19.99% over 3 sweeps (43% of 56972 moves guard-REJECTED â†’ panel is NOT near-isotropic), AND the honest 1024-Î¸ verdict ruler reopened 427 outliers on drifted verts. ROOT CAUSE: the OFF-crest panel needles are a **CONNECTIVITY floor of the seed+free-cdt2d** (identical set on the pre-refine brute mesh); relaxation moves points but connectivity-locked needles persist. |

Both fail: Gothic's is a REPRESENTATION floor at the zero-width apex (element cannot follow the concave cusp);
GeoStar's is a CONNECTIVITY floor in the smooth panel (free-cdt2d bakes the grading-transition needles). These
are **two genuinely different sliver classes** â€” the prior crest-focused levers mis-targeted GeoStar's 91%
OFF-crest population. **13 sliver levers now refuted, spanning both classes.** SLIVERS remains the single open
gate; the print-usable finite-area-needle + degenerate-collapse concession stands.

### (2) THE DEFINITIVE 20-STYLE WHOLE-MESH SCORECARD â€” 6/20 genuinely whole-mesh 0-outlier; 12/18 Tier-A/B HID guard-population residuals

**CONFIRMED: the _best20 manifest "17 literal â‰¤0.01" verdicts were a top-N/percentile guard-population
artifact â€” the SAME artifact class that masked Gothic/GeoStar.** A new whole-mesh ruler
(`scoreWholeMeshInterior`, EVERY free facet, â‰¥36-pt denseBary(45), honest true-3D foot = min(GN-global-fallback,
full-azimuth brute), NO top-N cap), gated by a per-style vertex-on-surface check (analytic where mesh IS the
radial surface; packaging BVH-vs-closed-object meta where riser/weave/seam meshes depart it), scored the EXACT
reaching meshes. Honest whole-mesh MAX-basis result:

| whole-mesh tier | count | styles (whole-mesh true-3D MAX, mm) |
|---|---|---|
| **GENUINELY 0-outlier** (literal, watertight) | **6/20** | SuperellipseMorph (0.0099), SpiralRidges (0.0038), ArtDeco (0.0011), BambooSegments (0.0079), **GothicArches (0)**, **GeometricStar (0)** â€” the last two are the NEW perfect-mesher kernel, the only count-unstable styles at literal 0 |
| **HID smooth p99-tail outliers** | 4 | RippleInterference (78 facets, 0.019), WaveInterference (6, 0.011), FourierBloom (67), HarmonicRipple (217) |
| **HID tangled top-N-anchored outliers** (vtx on-surface=0.00000 â†’ real facet-interior chords, brute-confirmed) | 4 | Gyroid (~72592, 0.203), Voronoi (~115632, 0.126), Crystalline (~18064, 0.097), HexHive (~26844, 0.041) |
| **HID riser/crest-tail outliers** (documented) | 2 | DragonScales (8938, 0.219), LowPolyFacet (252, 0.135) |
| **UNRESOLVED at reaching density** (tangled/steep brute ceiling; NOT re-scored) | 4 | BasketWeave, CelticKnot, CelticTriquetra, SuperformulaBlossom-seam |

- **`tierABall0Outlier` = FALSE.** Only **4/18** Tier-A/B are genuinely whole-mesh 0 (SuperellipseMorph,
  SpiralRidges, ArtDeco, BambooSegments). **12/18 Tier-A/B HID whole-mesh outliers** under the manifest's
  top-N/percentile guard â€” call-out: Gyroid/Voronoi/Crystalline/HexHive read `true3dP99=0` in the manifest but
  carry tens of thousands of real facet-interior chord outliers whole-mesh (max 0.04â€“0.20mm on thin near-vertical
  flank ribbons). `rawNonMan=0` on all 20.
- **`tierCGothicGeostar0Outlier` = TRUE.** Both new-kernel count-unstable styles are literal whole-mesh 0,
  watertight non-vacuous â€” the ONLY count-unstable styles at literal 0.
- **NATURE of the correction: a RULER/verdict-basis fix, NOT a new mesh defect.** Faces stay ON the true surface
  (vertex-on-surface gate = 0.00000 for all 9 analytic-gate styles; `rawNonMan=0`); the residual is the designed
  near-vertical relief the radial ruler overstates and p99/top-N excluded. It is watertight and print-safe. But
  the honest whole-mesh-MAX basis is 6 literal-0, NOT 17.

### (3) UPDATED PERFECT-MESHER STATE + PRODUCTIONIZATION READINESS â€” the whole-mesh re-baseline does NOT clear the final all-styles gate

Revise the V8 Â§(2) gate table with the whole-mesh-honest 20-style basis:

- **Gothic + GeoStar (the two hardest count-unstable styles) are the STRONGEST result in the campaign:** LITERAL
  whole-mesh 0-outlier + watertight + manifold + slicer-safe by flat-P1. Four of five print gates closed on the
  worst styles.
- **BUT the all-styles final gate is NOT cleared.** Only 6/20 are genuinely whole-mesh 0-outlier; 12/18 Tier-A/B
  hid outliers under the old guard, and 4 tangled/weave/seam styles are UNRESOLVED at reaching density. The
  perfect-mesher kernel that took Gothic/GeoStar to literal 0 has NOT been dispatched to the 12 hidden-residual
  Tier-A/B styles (Gyroid/Voronoi/Crystalline/HexHive tens-of-thousands of outliers whole-mesh). So the "0-outlier
  on all 20" claim is REFUTED at the honest whole-mesh basis â€” it holds for 6/20, not 17-20/20.
- **SLIVERS still the one open QUALITY gate** on the 2 closed count-unstable styles (13 levers refuted, both
  classes), plus the fidelity-tail on the 12 hidden Tier-A/B and the 4 unresolved tangled styles.
- **NO NEW MESH DEFECT surfaced** â€” the re-baseline is a verdict-basis correction: vertices on-surface, watertight,
  the residuals are the designed steep relief the radial guard overstated. The meshes did not get worse; the RULER
  got honest.

**PRODUCTIONIZATION READINESS: NO-GO to a "0-outlier all-20" flag-flip; GO to STAGE the dev-only flag-gated
back-port scoped to Gothic/GeoStar Tier-C.** The whole-mesh re-baseline BLOCKS any all-styles literal-0 claim
(6/20, not 17-20). Two ordered next experiments before the all-styles gate can be honestly claimed:
1. **Dispatch the perfect-mesher whole-mesh kernel** (the honest-brute STOP-driver + interior refine that took
   Gothic/GeoStar to literal 0) to the 12 hidden-residual Tier-A/B styles â€” START with Gyroid/Voronoi (largest
   whole-mesh outlier counts) â€” and re-score under `acceptanceGuardWhole`.
2. **Resolve the 4 tangled/weave/seam styles** (BasketWeave/CelticKnot/CelticTriquetra/SFB-seam) with a finer
   brute or the BVH-vs-closed-object meta (radial-twin OVERSTATES; manifest anchored 0.02â€“0.029).
The V8 back-port plan (closer-off delegation to `buildInhouseMetricMesh`, FGJ topology half, honest-brute
fidelity loop, collapse post-pass, sliver HARD BLOCKER, final whole-mesh cost gate) stands â€” but its step-6
"20-style whole-mesh re-baseline (Tier-C literal-0 under the FIXED whole-mesh guard)" is now RUN and its answer
is: only 6/20 literal-0 today, so the flag-flip go/no-go is NO-GO until the kernel is dispatched to the 12 hidden
Tier-A/B styles.

**LEDGER:** this file Â§VALIDATION 9. Registry rows: E-2026-07-05-GOTHIC-APEXPN (13a, pre-reg d6b2cf1, result
12aa3bf), E-2026-07-05-PERFECT-MESHER-GEOSTAR-RELAX (13b, commit 6154105),
E-2026-07-05-REBASELINE20 (commit 124af7e). Whole-mesh ruler `_pf_rebaselineRuler.ts`
(`scoreWholeMeshInterior`), probe `_pf_rebaseline20.test.ts` (PF_REBASE/PF_REBASE_BIG), scorecard
`research/exchange/_rebaseline20/{scorecard.ndjson,README.md}` (20/20 rows). GeoStar relax probe
`_pf_perfect_geostar_relax.test.ts` (PF_SLIVERM=1), scorecards `research/exchange/_pf_perfect_geostar_relax/`.
**BANKED MANDATE (reaffirmed):** no 0-outlier claim may use a top-N-gradU/percentile guard population â€” proven
blind here on 12/18 Tier-A/B styles; use `acceptanceGuardWhole` / `scoreWholeMeshInterior` (every facet).
DEV-ONLY; no src/ edit; exchange scorecards gitignored, numbers inlined.

---

## VALIDATION 10 â€” E-2026-07-06-BVH-RULER RESOLVED: the ruler question adjudicated per-style + the first honest
## 14-style whole-mesh BVH re-baseline (2026-07-07)

**INSTRUMENT (validated before use, smoke on SuperellipseMorph):** BVH-truth-twin ruler (`_pf_bvhRuler.ts`) â€” dense
radial twin + flat-CSR BVH point-to-triangle. Twin residual density-converges 0.0026â†’0.00065â†’0.00016mm at
768/1536/3072Â²; |BVH âˆ’ analytic-brute| max 0.000136mm â‰ª 0.01 on the smooth control. PERF: the 3.0mm default locator
cell packed 1000+ twin tris/cell â†’ on tangled twins every query scanned thousands of tris (Gyroid <5% in 8h,
measured). Fixes (commit 66cf1e0): cellâ‰ˆ4Ã— twin edge + radial same-azimuth upper-bound prefilter (strict bound for
zâˆˆ[0,H]; outlier counts/max unaffected) + PF_BVH_SHARD facet sharding (6 procs) + subsampled twin gate on shards>0.
Result ~100Ã—: full 14-style re-score in ~40min total; shard sums reproduce sequential rows EXACTLY (Ripple 64@
0.019083, Wave 2@0.010244, Fourier 19, Harmonic 62 â€” bytewise agreement on max).

### (1) Q1 â€” the ruler question: MIXED per-style, blanket-artifact hypothesis REFUTED
Worst-2000-facet ratio study (BVH-truth / ruler), doubled-twin density gate:
| style | ratioP50 | frac<0.3 | frac>0.7 | densityStable | verdict |
|---|---|---|---|---|---|
| GyroidManifold | 0.538 | 0.089 | 0.234 | NO (2Ã— twin +14-22%) | GENUINE gap; ruler OVERSTATES ~2Ã— (max 0.215â†’~0.098) |
| Voronoi | 0.974 | 0 | 0.972 | YES (xcheck 0.004) | GENUINE gap; ruler HONEST |
| HexagonalHive | 0.924 | 0 | 1.0 | ~(p90 14%) | GENUINE gap; ruler UNDERSTATES worst facets ~2.7Ã— (0.041â†’0.113) |
â‡’ NO blanket steep-overstatement artifact: the ruler errs BOTH directions by style. The V9 "6/20" verdict stands
directionally; magnitudes shift per style. The 0.01 campaign CANNOT be closed by metrology alone.

### (2) Q3 â€” consolidated whole-mesh BVH scorecard (every facet, shard-summed, tol 0.01mm)
| style | outliers (whole-mesh) | max mm | p99 | twinOnSurf | class |
|---|---|---|---|---|---|
| WaveInterference | 2 | 0.0102 | 0.0064 | 0.0017 | smooth tail â€” NEARLY CLOSED |
| FourierBloom | 19 | 0.0103 | 0.0065 | 0.0055 | smooth tail â€” nearly closed |
| RippleInterference | 64 | 0.0191 | 0.0065 | 0.0052 | smooth tail â€” genuine small |
| HarmonicRipple | 62 | 0.0151 | 0.0063 | 0.0048 | smooth tail â€” genuine small |
| HexagonalHive | 9,479 | 0.1287 | 0.0100 | 0.0045 | tangled â€” GENUINE (deeper than ruler knew) |
| Crystalline | ~19,564 (Ã—2 scaled) | 0.134 | 0.0057 | 0.065 âš  | tangled â€” genuine, twin band-limit caveat |
| GyroidManifold | 107,642 | 0.0889 | 0.0378 | 0.049 âš  | tangled â€” GENUINE (max halves vs V9, count grows) |
| Voronoi | 97,948 | 0.1374 | 0.0250 | 0.021-0.029 | tangled â€” GENUINE (ruler was honest) |
| DragonScales | 263,071 | 0.0460 | 0.0394 | 0.010 | riser â€” BROAD SHALLOW (old max 0.219 â‰ˆ5Ã— overstated; count 30Ã— up) |
| LowPolyFacet | ~6,464 (Ã—2) | 0.3946 | ~0.000002 | 0.012-0.033 | DESIGNED smin-rounded crease class (body exact; interpret as designed feature, not defect) |
| CelticKnot | 58,250 | 0.1075 | 0.0215 | 0.074-0.076 âš  | weave â€” UPPER BOUND (crease-locus + twin band-limit) |
| CelticTriquetra | 166,991 | 0.0905 | 0.0252 | 0.050-0.051 âš  | weave â€” UPPER BOUND |
| BasketWeave | 924,210 | 0.3424 | 0.222-0.239 | 0.060 âš  | weave â€” UPPER BOUND (worst; scored on moderate-density twin stand-in mesh) |
| SuperformulaBlossom | ~92,388 (Ã—2) | 6.91-7.04 | 0.0019 | 0.209 âš âš  | SEAM-WALL TWIN-BLIND-SPOT: body p99 0.0019 = CAD-grade; the non-2Ï€ seam radius-discontinuity is genuine geometry the single-valued radial twin CANNOT represent â€” measurement-excluded class (matches the doubled-seam-edge zero-serration proof) |
NOTES: weave/braid rows measured against single-valued radial rA with the known C0 over-under crease loci (the B5
program excluded that class as f32/f64 strand-flip metric discontinuity) â€” treat as UPPER BOUNDS pending crease-locus
exclusion. Crystalline/Gyroid twins are density-marginal at 3072Â² (Q1 gate) â€” their maxes are lower bounds.

### (3) CAMPAIGN DISPATCH (drive-all-20-to-0.01, updated)
Literal-0 today: 6/20 (V9 four + Gothic/GeoStar Tier-C patch kernel). Path per class:
1. SMOOTH TAILS (4): 2-64 facets, â‰¤0.019 â€” cheapest wins; local honest-ruler-driven refinement (deep-sag on flagged
   facets). Wave/Fourier are a hair over.
2. TANGLED (4: Gyroid/Voronoi/HexHive/Crystalline): GENUINE, tens-of-thousands of facets at 0.09-0.14 â€” dispatch the
   whole-mesh kernel (honest-brute STOP driver + interior refine); targets are ~2Ã— nearer than V9 claimed for Gyroid.
3. RISER (DragonScales): broad-shallow 0.046 â€” the proven z-density lever at moderate boost, re-gate under BVH.
4. WEAVE (3): build the crease-locus-excluded BVH basis FIRST (extend basketWeaveCreaseLoci exclusion to the twin
   scorer), then re-adjudicate â€” the 0.09-0.34 numbers are not yet actionable.
5. EXCLUDED-BY-DESIGN: LowPolyFacet (designed smin creases; body exact) + SFB seam wall (genuine geometry, twin-blind)
   â€” document, per [[feedback_export_standard]] these need the feature-edge argument, both already have it (LowPoly
   doubled-crest zero-serration; SFB doubled seam-edge zero-serration).
6. GOTHIC/GEOSTAR: Tier-C back-port CODE-COMPLETE (Tasks 1-6, d38150a..233a25b) â€” full patch gates + rebaseline20 run
   pending (machine was busy with this measurement).

**LEDGER:** registry E-2026-07-06-BVH-RULER â†’ RESOLVED (this section). Data research/exchange/_pf_bvh/{q1,q3}.ndjson
(gitignored; numbers inlined above). Perf commit 66cf1e0. Shard cross-validation: smooth-style shard sums == sequential
rows exactly.

---

## VALIDATION 10b â€” INSTRUMENT CORRECTIONS + FINAL dense-basis re-baseline + WEAVE VERDICTS (2026-07-07)

**THREE instrument effects were found, separated, and MEASURED after V10 (each discovered by a cross-basis
disagreement â€” the reason every basis change gets its own arm):**
1. **UNSOUND 4-pt SCREEN (removed, 3ea8b2c):** the verts+centroid BVH screen (skip dense â‰¤0.7Â·tol) missed
   between-point deviations. Measured undercount: BW +1.4%, CK +7%, Gyroid +5.6%, Voronoi +7%, **HexHive +58%**,
   DragonScales +0.2%, LowPoly 0. BANKED: never screen an acceptance ruler with a sparser lattice than the verdict
   lattice unless the screen is a per-sample strict bound.
2. **RADIAL PREFILTER IS SOUND and load-bearing:** |hypot(x,y)âˆ’rA(atan2,z)| â‰¥ true analytic distance â€” a green bound
   is anchored to the ANALYTIC surface, immune to twin band-limit.
3. **TWIN BAND-LIMIT INFLATION (no-prefilter basis only):** without the prefilter, samples ON the analytic surface
   read up to twinOnSurf from the coarse twin â†’ spurious outliers. Measured: BW +6% (997k vs 940k), **CK +41%**
   (106k vs 62k; twinOnSurf 0.074). The FINAL numbers below are dense+prefilter (analytic-anchored, no screen).

### FINAL whole-mesh dense-basis scorecard (tol 0.01mm, every facet, shard-summed)
| style | outliers | max mm | p99 | class |
|---|---|---|---|---|
| WaveInterference | 2 | 0.0102 | 0.0068 | smooth tail â€” NEARLY CLOSED |
| FourierBloom | 20 | 0.0103 | 0.0069 | smooth tail |
| RippleInterference | 82 | 0.0191 | 0.0068 | smooth tail |
| HarmonicRipple | 93 | 0.0151 | 0.0073 | smooth tail |
| HexagonalHive | 15,098 | 0.1287 | 0.0110 | tangled GENUINE (screen hid 37%) |
| Crystalline | 20,788 (Ã—2) | 0.1343 | 0.0059 | tangled genuine (twin-marginal 0.065) |
| GyroidManifold | 113,767 | 0.0889 | 0.0379 | tangled GENUINE |
| Voronoi | 105,154 | 0.1374 | 0.0252 | tangled GENUINE |
| DragonScales | 263,536 | 0.0463 | 0.0395 | riser broad-shallow |
| LowPolyFacet | 6,464 (Ã—2) | 0.3946 | ~0 | designed smin-crease (excluded-by-design) |
| CelticKnot | 62,340 | 0.1075 | 0.0228 | weave GENUINE |
| CelticTriquetra | 186,400 | 0.0905 | 0.0257 | weave (upper bound â€” no predicate) |
| BasketWeave | 939,938 | 0.3424 | 0.2395 | weave GENUINE (worst gap in the fleet) |
| SuperformulaBlossom | 92,398 (Ã—2) | ~7.0 | 0.0020 | seam twin-blind-spot (excluded-by-design) |

### E-2026-07-07-WEAVE-CREASE-EXCLUDED â€” VERDICT (one basis, pre-registered criteria)
- **BasketWeave: GENUINE.** band-0 baseline 996,570 â†’ excluded 773,929 (band 1e-3, 77.7% survive) / 668,552
  (band 2e-3, 67%). exclFrac 8â€“13% (> the 6% collapse cap). Max unchanged 0.342 (worst facet OFF-crease).
- **CelticKnot: GENUINE.** band-0 106,265 â†’ 105,914 / ~105k (99.7% / ~99% survive; exclFrac 0.7â€“1.4%). Creases
  contribute ~nothing â€” the braid gap is body geometry.
- CelticTriquetra: NOT adjudicated (no crease predicate exists) â€” carried as upper bound.
â‡’ The weave gaps are REAL off-crease geometry â†’ BasketWeave/CelticKnot JOIN THE TANGLED CLASS for whole-mesh
kernel dispatch. Registry row RESOLVED.

### Campaign arithmetic (drive-all-20-to-0.01)
6/20 literal-0 (V9 four + Gothic/GeoStar Tier-C) + 2 excluded-by-design w/ zero-serration feature-edge proofs
(LowPoly, SFB-seam) = **8/20 settled**. Remaining 12 = 4 smooth tails (197 facets total â€” one local-refine pass) +
7 tangled/weave/riser (kernel dispatch / z-density) + CelticTriquetra (predicate first). TIER-C GATES (same
session): full Gothic patch CONVERGED whole-mesh 0 in 7 passes/6min/10,181 tris â€” the adaptive kernel is far
cheaper at production scale than uniform-seed estimates; GeoStar arm + rebaseline20 pending.

**LEDGER:** data _pf_bvh/{q3_dense,q3_excl}.ndjson (gitignored, numbers inlined). Commits 3ea8b2c/8330577 + this.

---

## V10c — FULL-GATE STALL: root cause OPEN after two refuted fixes (2026-07-07, honest status)

The full Gothic Tier-C gate stalls at the pass-16 cap (~430 outliers, worst ~0.404, insertions no-op from pass 7;
IDENTICAL worst values across runs ⇒ the same facets). TWO fixes attempted, BOTH insufficient:
1. **Border-clip fix (70eb8ba): REFUTED as the (sole) cause** — clipping constraints at the domain boundary instead
   of dropping them changed nothing measurable (same plateau, same worst).
2. **Chain-placement: PARTIALLY IMPLICATED, snaps did NOT close it.** Probe `_tierc_crestOffset` MEASURED the
   detected constraint chains p50 1.02mm / p90 1.86mm of arc off the true u-ridge (detector cell 2.36mm at fineRes
   120) — vs the research kernel's ~0.1mm analytic crest sampling. Axis-aligned ridge snap → p50 0.55/p90 1.77;
   chain-normal snap → p50 0.61/p90 1.73. CAVEAT discovered: the probe conflates chain TYPES — crease/boundary
   chains legitimately sit off the r-max, so the tail is partly measurement confusion; the snap may even corrupt
   crease chains (amp filter does not distinguish). Smoke gate still passes with the snap (0 outliers, watertight).

**NEXT DIAGNOSTIC (the decisive one, not yet run):** persist the stalled full-gate mesh (add checkpointing to the
gate first), then for the ~430 floor facets measure per-facet (a) chart distance to the nearest constraint edge and
(b) local ridge amplitude at the centroid. Discriminates: MISSING/misplaced ridge chains (fix = detector recall /
exact placement — likely needs dense analytic-style crest sampling à la research rowCrests/colCrests, not snapping)
vs something else entirely (e.g. the seam-consistent midpoint insertion failing near u-wrap, or dedupe swallowing
insertions — "inserted ~850/pass but tris +~120/pass" is ALSO unexplained and suspicious).

STATE: smoke gate GREEN (proven config); FULL gate RED (stall, cause OPEN); rebaseline20 BLOCKED on this. The flag
stays default-OFF (nothing ships); the byte-identical-off guarantee is unaffected (10/10 fast tierC tests green).

---

## V10d — FULL-GATE STALL RESOLVED (fidelity) + PERF WALL IDENTIFIED (2026-07-08)

**FIDELITY ROOT CAUSE (found + fixed):** detector constraint chains arrived at fine-CELL pitch (Gothic p50 0.99mm /
p90 3.36mm / MAX 59mm, probe _tierc_constraintLen) — cdt2d cannot split a LOCKED edge, so a crest-adjacent facet on
a ~1mm locked edge floors at ~L²κ/8 ≈ 0.4mm (the exact plateau). FIX (a90cdbd): densify each chain to ≤0.15mm 3D
pitch + ridge-snap along the segment normal INSIDE morseComplex BEFORE planarizeMM (snapping AFTER planarize =
cdt2d upperIds crash, learned the hard way in 0c463ce). Post-fix: edges p50 0.147/p90 0.288/max 3.3mm,
residualCrossings 0, recovery ≥99. **SMOKE GATE (multi-bay z-band, = the research kernel's validation scale)
CONVERGES to literal whole-mesh 0 outliers, watertight, no crash, ~5min** — the Tier-C fidelity mechanism is PROVEN
at patch scale.

**PERF WALL (identified, NOT fidelity):** the ≤0.15mm ridge-snapped crest makes near-crest facets ~7× denser; every
one hits the O(nTheta·nZ)=1024·120 full-azimuth analytic brute (`bruteNearestOnRadialSurface`) per non-green sample
× 45 samples/facet × many passes. A LARGER-than-research domain (u 0–0.25, then even u 0–0.1 t 0.38–0.62) cannot
finish pass 1 single-threaded (measured: 50–240min/pass, never converged). This is the SAME O(nTheta·nZ) analytic
brute the LAB replaced with a BVH-twin locator for **100×** (V10b) — but that optimization was never ported into the
PRODUCTION tierC/interiorRuler (it lives in research/_pf_bvhRuler). **⇒ the full-multi-bay/full-pot gate is PERF-
BOUND on an un-ported ruler optimization, a documented INTEGRATION item — NOT a fidelity gap.**

**STATE:** Tier-C back-port Tasks 1-5 CODE-COMPLETE + patch-fidelity PROVEN (smoke). Task 6 rebaseline20 + the
full-multi-bay gate are BLOCKED on the ruler perf port (BVH-twin into tierC/interiorRuler, ~100× — or a θ-windowed
brute for single-valued radial surfaces). Flag stays default-OFF; byte-identical-off unaffected; fast tierC suite
green. NEXT (perf, then unblock): port the BVH-twin locator into the production interior ruler; re-run the multi-bay
gate; then rebaseline20. The DRIVE-ALL-20 campaign is NOT blocked on this — the tangled-6 kernel dispatch + smooth-
tail close (spec V10b §3) proceed on the research meshers independently.

---

## V10e — RULER PERF SOLVED (exact θ-window) + MULTI-BAY JUNCTION RESIDUAL SURFACED (2026-07-08)

**PERF WALL BROKEN (exact, not approximate):** ported a θ-WINDOWED brute into the production tierC interior ruler
(commits 47c5ceb, 7098a30) — chose it OVER the lab BVH twin deliberately (a triangulated twin band-limits at
Gothic's κ≈657 apex and UNDERSTATES = the ruler-lied failure; the θ-window can only overstate = safe). Window is
PER-SAMPLE and provably safe: the same-azimuth `bound` upper-bounds the true dist ⇒ foot within `bound` Euclidean ⇒
within asin(bound/r_foot) azimuth (r_foot floor = ½ local radius + 12-cell margin). A first FIXED 0.5rad window
UNDERSTATED (57 false-0s: loop converged, full guard found 57) — the per-sample bound-derived window fixed it.
MEASURED: smoke gate PASSES (loop converges AND full-basis guard=0 ⇒ exact at the apex) in **45s vs ~5min; DENSE
passes ~4s vs ~60s (~15×)**. Multi-bay passes now 24-58s (were 50min, never finished).

**NEW FINDING — MULTI-BAY JUNCTION RESIDUAL (the next frontier, surfaced by the now-tractable gate):** the multi-bay
Gothic gate (u 0-0.1, t 0.38-0.62, spanning arch junctions) does NOT converge — it plateaus at ~380 outliers with
worst OSCILLATING 0.40-0.78 (pass 1 out=2080→pass16 out=381, tris 9.7k→75k, capped). The oscillating worst
(refining the current-worst exposes a new ~equal one) = whack-a-mole on a hard POPULATION, not slow convergence; the
recurring ~0.40 floor + 0.77 spikes localize to the count-unstable JUNCTION region (Gothic arches meeting at points)
that the SMOKE (thin mid-band t 0.48-0.52) never exercised. Hypotheses (UNTESTED, next-session): (a) detector RECALL
gap — ribs/junction-crests the fineRes-120 detector misses in this domain → facets bridge the unprotected cusp (0.77
≈ rib amplitude); (b) ridge-snap misbehaves at junctions (ambiguous normal where ribs merge); (c) domain-boundary
constraint-clip stubs. DECISIVE next diagnostic: persist the capped mesh, dump the ~380 outlier facet centroids
(u,t) — clustered at junctions ⇒ (a)/(b); at t=0.38/0.62 edges ⇒ (c); spread ⇒ density.

**STATE:** Tier-C fidelity PROVEN at patch/smoke scale (= research validation scale); ruler perf SOLVED (exact ~15×);
multi-bay-with-junctions has a real residual (count-unstable junction frontier) = the honest next research problem.
Flag stays OFF; fast tierC + smoke green; rebaseline20 still gated on multi-bay convergence. The DRIVE-ALL-20
campaign (tangled-6 kernel + smooth tails) is independent and unblocked.

---

## V11d — MULTI-BAY JUNCTION RESOLUTION: "junction wall" REFUTED, root cause = SMOOTH-ARC DENSITY + a pinned seam facet (2026-07-08)

**E-2026-07-08-TIERC-JUNCTION.** The V10e "count-unstable junction frontier" framing is REFUTED by measurement. The
multi-bay Gothic plateau is NOT a junction/protection wall.

**DIAGNOSTIC (run1, capped pass-16, FULL-azimuth guard, 388 outliers, devMax 0.677, devP50 0.026):**
- Per-outlier centroid dump + 3 measures (chart dist to nearest constraint edge, local ridge amplitude, nearest-
  junction dist). fracTedge1 = 0.003 ⇒ (c) T-EDGE-CLIP-STUB DEAD. fracJunction3 = 0.402 and the 12 WORST only 17%
  near junctions ⇒ (b)/junction-local (a) NOT the dominant class (junction correlation is incidental — junctions sit
  at the detector-band edges). 59.5% of outliers are FAR from junctions (>3mm) AND far from any constraint (>1mm);
  dConstraint p50 5.4mm, amp p50 0.759mm (81% amp>0.5).
- ROOT CAUSE localized (fix_probe.json + field_profiles.json): the protected complex covers ONLY
  t∈[0.12,0.18]∪[0.48,0.57]∪[0.96,0.99]. The raw κ-ridge detector emits ZERO samples in t∈[0.18,0.48]∪[0.57,0.96].
  The worst outliers sit at t≈0.40-0.49 on a SMOOTH LOW-κ HIGH-amplitude (~1.5mm) HORIZONTAL arch arc (r(t) peaks
  44.43→45.89→45.12 over ~5mm z at t≈0.465; maxD2t 0.705). It is a u-running arc (gradient in t), correctly IGNORED
  by the κ-ridge detector because its curvature is genuinely low — it is not a crease, just a curved dome.

**LEVER SCREEN (cheap, detector-only, does NOT count against the gate-lever budget):** minStrength 1.0→0.5→0.25→0.1,
minAngleDeg 28→18→12, fineRes 120→180 — ALL recovered ZERO dead-zone recall. ⇒ threshold/recall is the WRONG lever;
there is no ridge to detect. Refutes hypothesis (a) RECALL-GAP decisively.

**FOCUSED DENSITY DISCRIMINATOR (the decider):** the SAME refine loop on a small dead-zone domain (u 0.03-0.09,
t 0.42-0.52, seam EXCLUDED), bgArcMm sweep: **0.5 → 1 facet @0.0104 (capped @21 passes); 0.3 → 0 outliers
guardMax 0.00996 (7 passes); 0.2 → 0 outliers guardMax 0.00995.** ⇒ the plateau is a SEED-DENSITY + PASS-BUDGET
ASYMPTOTE: RED-1→4 uniform midpoint splitting has diminishing returns on smooth curvature, so a too-coarse seed
leaves a marginal-facet tail (devP50 0.026 = barely over tol) and CAPS. Denser seed starts below the asymptote and
converges. VERDICT: (d) DENSITY confirmed; "junction wall" was a mislabel.

**LEVER 1 (denser seed 0.3) on the FULL multi-bay gate (u 0-0.1, t 0.38-0.62, maxPass 30, full-azimuth guard):**
the BULK density population closes (out 4288→2089→1676→1644 over dense passes 5-8) BUT the worst is PINNED at exactly
1.0592mm across passes 5,6,7,8 (identical to 5 decimals) — a SINGLE facet the RED-1→4 split cannot reduce; it
regenerates identically. This is a SECOND, distinct residual — a structural/seam facet (the multi-bay domain includes
the u=0 seam that the focused domain excluded; run1's worst-list carried two u=0.0000 t≈0.54 outliers). The full run
is PERF-BOUND (dense passes 60-96s on the 100k+-tri denser mesh — the un-parallelized whole-mesh brute, the same
documented V10d/V10e integration wall), so it did not reach the cap within session wall-clock.

**HONEST STATE (per pre-registered STOP criterion — lever 1 applied, characterized, not lever-grinding a 2nd on a
perf-bound run):**
- The multi-bay "junction" plateau is TWO stacked residuals: (1) a SMOOTH-ARC DENSITY tail (dominant, 380+ facets,
  devP50 0.026) that a denser seed CLOSES (proven on the seam-free focused domain → literal 0); (2) a PINNED
  ~1.06mm seam/structural facet that midpoint-splitting cannot conform (the true remaining frontier).
- The count-unstable JUNCTIONS are NOT the cause. The smoke gate converged to 0 because it sat inside a protected κ
  band; the multi-bay gate straddles the detector's dead zone where the relief is smooth-arc (density), plus the seam.
- NEXT (2 concrete levers, not attempted — budget respected): (i) DENSITY: adaptive seed pitch (bgArcMm from the
  local chord-sag estimate, or a curvature-floor seed) so the smooth-arc tail starts sub-tol — but this needs the
  BVH/parallel ruler (V10d integration item) to be tractable at full scale; (ii) SEAM FACET: reproduce the pinned
  1.0592 facet, confirm it is the u=0 seam, and fix the seam-consistent RED-1→4 split (or lock a seam crest edge) —
  this is the genuine open problem the diagnostic surfaced, replacing the mislabelled "junction wall".

**GUARANTEES:** no production symbol touched (only dev-only PF_TIERC_JUNCTION probes added); byte-identical-off holds;
fast tierC suite 9/9 green (incl. flagOff.byteIdentical + θ-window exactness). Flag stays default-OFF. Commit 4853a16
(diagnostic + probes). Data: research/exchange/_tierc_junction/{run1/*, fix_probe.json, field_profiles.json,
focus_results.json, focus.ndjson, lever1_pass.ndjson, radius_field.svg, scatter.svg} (gitignored; numbers inlined).

---

## V11e — TIER-C PERF WALL SOLVED (byte-identical parallel scorer + dirty cache) + the multi-bay pin RE-DIAGNOSED (t-band density floor, NOT the u-seam) (2026-07-08)

**E-2026-07-08-TIERC-PERF-SEAM.** The V11d integration wall (dense whole-mesh brute 60-96s/pass, single-threaded)
is the true multi-bay blocker. It is now SOLVED for metrology; and the "pinned seam facet" is re-diagnosed.

**T1 — PARALLEL SCORER (CONFIRMED, byte-identical + speedup).** `parallelScorer.ts` + `_parallelScorerWorker.ts`:
a ≤4-worker `worker_threads` pool shards the embarrassingly-parallel dense per-facet loop. Each worker reconstructs
the `GpuSurfaceSampler` from the SERIALIZED f32 grid (`{positions,resU,resT}`) — deterministic bilinear interp ⇒
bit-identical `rA`. The worker is esbuild-bundled from `_parallelScorerWorker.ts` (native `@esbuild/*/esbuild.exe`,
NOT the `.cmd` shim nor the JS API — both break under Node24/jsdom: EINVAL / `TextEncoder instanceof Uint8Array`) so
`facetInteriorHonest` has ONE source of truth. The caller reassembles dev[] by GLOBAL facet index and runs the
IDENTICAL reduction (`reduceDevArray`).
- BYTE-IDENTICAL gate (`parallelScorer.test.ts`, GREEN): per-facet dev[] bit-identical EVERY facet, exact aggregate
  (outliers/max/p50/p99/bruteCalls), worker-count-invariant (1/3/4 give identical dev[]).
- SPEEDUP (`_parallelPerf.test.ts`): 45,285 facets, seq 25.78s → par 8.78s = **2.94x** on a quiet machine (284==284
  outliers, max 0.42159==0.42159). Under 4-agent contention the dense-pass gain is ~1.6x (96s→60s, 83k-tri pass).
  HONEST: speedup is core-availability-bound (under full saturation vitest couldn't even fork a probe worker);
  CORRECTNESS is unconditional.
- `refineToZeroOutliersParallel` (dense passes via the pool, 7-pt sequential; shared `applyScoredPass` insertion)
  proven bit-identical to the sequential loop (`parallelRefine.test.ts`, GREEN).

**T2 — DIRTY-FACET CACHE (CONFIRMED, byte-identical).** Opt-in `dirtyFacetCache`: a facet whose sorted (a,b,c) triple
is unchanged since a prior pass (uv only GROWS ⇒ indices stable) reuses its cached dev under the same lattice phase.
`dirtyCache.test.ts` (GREEN): cached==uncached final uv/tris + per-pass trajectory bit-identical; hitRate 0.374 on a
7-pass fixture. STOP-SHIP catch banked: the first numeric facetKey overflowed `Number.MAX_SAFE_INTEGER` → collisions
→ divergence; the byte-identical gate CAUGHT it; fixed to a string key.

**T3 — SEAM RE-DIAGNOSED: the pin is a t-BAND DENSITY floor, NOT the u=0 seam.** The V11d "pinned u=0 seam∩boundary
facet" hypothesis is REFUTED by measurement. The pin at EXACTLY **1.05918988549241mm** appears IDENTICALLY on-seam
(u[0,0.1]), off-seam (u[0.05,0.15]) AND LEVER1 — all three share the t-band [0.38,0.62]. It SURVIVES the off-seam
shift ⇒ it is NOT a u-seam artifact. (Static seed probe still shows the u=0 chart-discontinuity splits wrapping crest
chains — on-seam 1675 crest edges vs off-seam 3026, clips 10 vs 5 — so a seam-avoiding domain is still the right gate
choice, but that is a SECONDARY effect; it does not create the pin.) The pin is a facet in the shared t-band where the
smooth ~1.5mm arch arc's chord sag exceeds tol and RED-1→4 midpoint splitting has diminishing returns (the diagnostic's
own smooth-low-κ prediction).

**T4 — GATE DOES NOT CONVERGE (STOP; density floor characterized).** Full multi-bay gate, SEAM-AVOIDING domain
u[0.05,0.15] × t[0.38,0.62], bgArcMm 0.3, parallel refine + parallel full-azimuth guard. Trajectory (dense passes 5-9):
outliers 5553 → 2595 → 1836 → 1805 → **1908** (worst pinned ~1.0546-1.0592), tris 111k → 145k, ms/pass 74→40s (parallel).
The BULK smooth-arc tail closes 5553→~1800 (the diagnostic's density mechanism CONFIRMED), then **PLATEAUS/OSCILLATES
at ~1800-1900** (same signature as LEVER1's 1644→1772→1897) — NOT literal 0. bgArcMm 0.3 is dense enough for the small
FOCUSED domain (V11d: literal 0) but NOT for the full multi-bay t-band: ~1800 outliers / 145k tris = 1.3% residual tail.
TRI PROJECTION: the domain is ~1/42 of the full pot (u 0.1×t 0.24); 145k tris ⇒ ~6.1M full-pot (right at the ~6M cap).
A uniform denser seed (0.2) would ~2x that (~13M) — OVER budget. Per the pre-registered STOP criterion (density+seam
fixes applied, no lever-grinding past 2), STOP: the residual is a **DENSITY FLOOR requiring an ADAPTIVE chord-sag-driven
seed** (uniform tighten explodes tris), NOT a junction/seam wall. **T5 (rebaseline20) is GATED on T4 convergence ⇒ NOT
launched.**

**NET:** the PERF wall is solved (byte-identical parallel scorer + refine + dirty cache; 2.94x quiet / core-bound under
load). The multi-bay residual is fully re-diagnosed: a t-band smooth-arc DENSITY floor (bgArcMm 0.3 insufficient at full
scale) + an unreducible ~1.05mm facet — the u-seam is exonerated. The remaining lever is an ADAPTIVE seed (local
chord-sag pitch) + a Steiner/centroid split for the unreducible facet, both future work.

**GUARANTEES:** only flag-gated Tier-C files touched (parallelScorer.ts, _parallelScorerWorker.ts, interiorRuler.ts,
noBridgeRefine.ts, index.ts + dev-only PF_TIERC_* probes); byte-identical-OFF GREEN (flagOff.byteIdentical); fast tierC
suite GREEN; flag stays default-OFF. Commits 1f33663 / 3e98e99 / 7b58e49 / 22b746d / ee556a3 / 52fa687 / 101fdd3.
Data: research/exchange/_tierc_junction/{gate_pass_FINAL.ndjson, seam_static.json, perf_result.json} (gitignored).

---

## V11h — MULTI-BAY PIN ROOT-CAUSED (a CDT t-NEEDLE, not a density/seam/locked-edge floor); ADAPTIVE SEED breaks it but only OVER 6M — the honest fidelity-vs-budget frontier (2026-07-08)

**E-2026-07-08-TIERC-ADAPTIVE-SEED** (ROUND 3, follow-up to V11e). The V11e recommendation was an ADAPTIVE
chord-sag seed + a worst-sample Steiner split for the "RED-1→4-unreducible" pin. Both diagnosed + measured.

**PIN DIAGNOSIS — DECISIVE (full facet-state dump, `pin_diag.json`).** The ~1.05918988549241mm pin is a **LONG
t-SPANNING NEEDLE**, NOT a locked edge / seam / smooth-arc RED-density floor (all three V10b/V11e hypotheses REFUTED):
- Geometry: edges **AB=CA≈8.9mm, BC≈0.02mm**, **uSpan≈0.0002, tSpan≈0.075** — a hair-thin needle running from t≈0.464
  to t≈0.538 at fixed u≈0.0585, worst sample at (0.0585, 0.482) in the arch dead zone. **No edge is locked.**
- Mechanism: RED-1→4 **DOES** reduce it (1.059 → 0.622 worst child) but slowly (~7 halvings for a 9mm needle);
  the CDT **REGENERATES a similar needle every pass** because the UNIFORM bgArcMm seed has NO interior points inside
  the dead-zone t-band, so the "pin across passes" is a re-forming needle, not one frozen facet. Steiner-at-worst is a
  **NO-OP** (1.059 → 1.059 — the worst sample sits ON the 9mm edge ⇒ 2 of 3 children are still needles). ⇒ the fix is
  INTERIOR POINTS that force the CDT to break the span, i.e. LEVER A; a surgical single-facet Steiner cannot fix a
  symptom that regenerates from global under-seeding.

**LEVER A (2D curvature-adaptive seed, `adaptiveSeedPoints`) — MECHANISM CONFIRMED, but REFUTED on the 6M budget.**
A recursive cell-subdivision seed keyed on local P1 chord sag (u and t), opt-in via `RefineOptions.adaptiveSeed`
(default OFF ⇒ uniform seed byte-identical, guarded). Two parameterizations (the pre-registered cap):
- **A1 (hMin 0.09, maxLevel 5):** BREAKS the pin — worst monotone-down **1.052 → 0.783 → 0.753 → 0.863 → 1.045(dense) →
  0.900 → 0.734** (the uniform gate PINS at 1.0592 forever). Outliers 6399→…→2350 and dropping. BUT tris **49k → 197k by
  pass 7 ⇒ full-pot projection 197k×42 ≈ 8.3M, OVER the 6M budget** and still climbing.
- **A2 (hMin 0.18, maxLevel 3):** coarser seed ⇒ ~6.2M-ish tris but the **pin REFORMS at EXACTLY 1.05918988549241** at
  the first dense pass — identical to the uniform gate. Too coarse to break the CDT needle.
- **The decisive frontier:** the needle requires ≤0.09mm interior t-pitch to break; at that density the RIB-DENSE wall
  triggers the sag field EVERYWHERE (measured `adaptiveSeedPoints` density ≈ **86,000 pts/unit-t UNIFORMLY across ALL
  t-bands** 0→1, not just the arch — the "dead zone" is NOT sparse, the whole wall is relief-dense). The seed floors at
  ~18-22k pts regardless of hMin(0.09-0.2)/maxLevel(3-5)/uSplit (level-1 split fires on every rib-covered cell; t-only
  barely helps, 22k→19.5k). ⇒ **NO config both breaks the pin AND stays under 6M.**

**LEVER B (worst-sample Steiner) — SUBSUMED/REFUTED by the diagnosis.** The pin_diag Steiner-at-worst no-op + the
"needle regenerates from global under-seeding" mechanism show a single-facet Steiner cannot fix it; the only fix is
interior density = LEVER A = over budget. Not separately run (the diagnosis pre-empts it per the STOP criterion).

**NET — the multi-bay Gothic gate does NOT converge to literal 0 under 6M; the residual is a fidelity-vs-budget
frontier, not a mechanism wall.** The pin is fully root-caused (a re-forming CDT t-needle across the smooth arch bump)
and its fix is known (interior seed density) but UNAFFORDABLE at patch scale under the 6M full-pot cap because the
Gothic wall is uniformly relief-dense. The uniform gate's ~1800-outlier/6.1M plateau and LEVER A's lower-outlier/8.3M
both miss the (0 outliers, <6M) target. **T5 (GeoStar patch + rebaseline20) is GATED on convergence ⇒ NOT launched.**
The next genuinely-different lever (future work): a RIB-AWARE seed that EXCLUDES the locked-edge-carried rib curvature
from the sag field (so it densifies ONLY the smooth dead-zone residual, not every rib) — this could shrink the seed
back toward budget; OR accept the multi-bay Gothic arch band as a documented density-vs-budget concession.

**GUARANTEES:** only flag-gated Tier-C touched (noBridgeRefine.ts + dev-only PF_TIERC_PINDIAG / PF_TIERC_GATEA /
PF_ADIAG probes + adaptiveSeed.test.ts); index.ts's parallelScorer-re-export removal is the CONCURRENT agent's
browser-bundle fix (left unstaged, not mine). byte-identical-OFF GREEN (flagOff.byteIdentical); fast tierC suite GREEN
(11 tests incl. dirtyCache byte-identical — proves the uniform-seed path is unchanged); flag default-OFF. Commits
f0584de (pre-reg) / [LEVER-A] / [uSplit+finding]. Data: research/exchange/_tierc_junction/{pin_diag.json,
adaptive_seed_finding.json, gateA_A1_OVERBUDGET.ndjson, gateA_A2_PINNED.ndjson} (gitignored).

---

## V11k — RIB-AWARE SEED REFUTED: the 6M-budget wall is a REFINE-LOOP floor (every rib flank > tol), NOT a seed dead-zone — no seed strategy converges the multi-bay Gothic gate under 6M (2026-07-08)

**E-2026-07-08-TIERC-RIBAWARE-SEED** (ROUND 4, follow-up to V11h). V11h's recommendation was a RIB-AWARE seed that
excludes constraint-chain-carried rib curvature from the sag field so seeding densifies ONLY the smooth dead-zone arch
arc. Built two designs (opt-in `RefineOptions.ribAwareMode`, default undefined ⇒ plain LEVER-A byte-identical):
- **(a) chain-distance MASK** — a cell only sag-splits if its center is >`ribBandMm` (3D-mm) from any locked constraint
  chain point (spatial hash over lifted chain points). Rib flanks are masked out; the smooth bump still seeds.
- **(c) θ-averaged residual** — t-sag from the θ-AVERAGED profile r̄(t) (mean r over the domain u-range), rib-immune by
  construction (ribs average out along θ); the horizontal arch arc alone.

**CHEAP DISCRIMINATOR (seed-level, `_ribAwareDiag`) — rib-aware masking barely changes the seed.** All designs land
~21-25k seed pts; the **dead-zone t-band [0.44,0.49] seed count is IDENTICAL** (~3845 tOnly/mask, 3780 thetaAvg). The
seed projects only **~1.8-2.1M full-pot** ⇒ the ROUND-3 8.3M did NOT come from the seed — it comes from the REFINE
LOOP RED-1→4 growth. Prediction: a seed-only lever cannot change a budget consumed downstream.

**GATE HEAD-TO-HEAD (`_ribAwareGate`, PF_TIERC_RIBGATE, parallel-scorer 4-worker + per-pass ndjson) — all three
trajectories IDENTICAL within noise.** Pass 3 (7-pt driver): baseline `leverA_tOnly` **91018 tris / 5950 outliers /
0.7938 worst**; (c) `thetaAvg` **90236 / 6373 / 0.7938**; (a) `mask b1.0` **91378 / 6181 / 0.7938**. The `worstMm` is
BIT-IDENTICAL 0.793785701601064 across all three — the arch-arc needle is a shared geometric feature the seed does not
move. Baseline's first DENSE pass (5) = **144369 tris = 6.06M full-pot, 8306 outliers, worst bounced to 1.056** ⇒ OVER
6M with thousands remaining (the A1 explosion). Bonus: proves **uSplit on/off makes NO difference** (t-only baseline ≈
A1's u-split-ON trajectory — the un-run V11h data point, now filled).

**ROOT CAUSE — why rib-awareness cannot help.** The outliers driving RED tri-growth are **genuine rib-FLANK facets**
whose P1 chord-sag exceeds tol=0.01mm on the relief-dense Gothic wall, NOT seed artifacts. The protected complex locks
the ridge LINES but the flank SURFACE between chains must still refine to tol. Rib-aware seeding removes rib
sag-splits from the SEED (2-4% fewer pts) but the refine loop RE-inserts them because the flanks genuinely exceed tol.
**The 6M-budget wall is the honest cost of resolving every Gothic rib flank to 0.01mm — a REFINE-LOOP floor,
independent of seed strategy.** KILL criterion MET (2 designs fail to break the budget). GATE not converged ⇒ T5
(GeoStar + rebaseline20) NOT launched.

**RECOMMENDATION — the lever must move DOWNSTREAM (the refine loop), not the seed.** Genuinely-different future
directions: (1) an ANISOTROPIC / flank-aware RED that splits a rib-flank facet along its short axis only (≈halves tri
growth vs isotropic 1→4), or a curvature-aligned metric split; (2) accept the multi-bay Gothic wall as a documented
density-vs-budget concession at tol=0.01mm — raise the budget for feature-dense styles, or apply a per-region tol on
the smooth (printer-resolvable) rib flanks rather than a global 0.01mm. The rib-aware seed machinery (`ribAwareMode`
'mask'/'thetaAvg' + `ribBandMm`) is banked, flag-gated, byte-identical-off, to compose with a future refine-side lever.

**GUARANTEES:** only flag-gated Tier-C touched (noBridgeRefine.ts rib-aware opt-in branch + dev-only PF_TIERC_RIBAWARE
/ PF_TIERC_RIBGATE probes). Rib-aware modes default-off ⇒ byte-identical-OFF GREEN (re-verified) + adaptiveSeed guard
GREEN (LEVER A unchanged). Removed a pre-existing unused `DEFAULT_RULER` import (failing tsc at HEAD). Flag
default-OFF. Commits afa6ca0 (pre-reg) / c2c42d7 (code + probes) / [this verdict]. Data:
research/exchange/_tierc_ribaware/{SEED_DIAG_SUMMARY.json, baseline_leverA_tOnly_frontier.json, thetaAvg_frontier.json,
mask_b1.0_frontier.json, diag_*.json, ribgate_*_pass.ndjson} (gitignored).

---

## V11m — RESEARCH-vs-PRODUCTION COST DISCREPANCY (ROUND 5, E-2026-07-08-TIERC-COSTGAP) — PRE-REGISTRATION (2026-07-08)

**THE DISCREPANCY.** The RESEARCH kernel (VALIDATION 3, `_pf_perfect_gothic_msquare`) closed a "4-bay Gothic"
multi-bay patch to LITERAL 0 outliers @ 58,365 tris, projectedFullMeshTris **1.05M < 6M** (5.7× headroom). The
PRODUCTION multi-bay gate (V11d/e/h/k, `_junctionGate` + adaptive/rib-aware seeds on `noBridgeRefine.ts`) EXPLODES
past 6M (144k tris @ pass-5 = 6.06M full-pot) with ~1800-8300 outliers remaining, no seed strategy converging under
budget. Same style, ~6-8× cost gap. This round runs the RESEARCH kernel VERBATIM on the EXACT PRODUCTION domain to
adjudicate MECHANISM-GAP vs DOMAIN-mismatch.

**STEP 1 — DOMAINS PINNED (measured, `makeGothicPatch` instantiated + `_junctionGate.test.ts` read; NOT guessed):**

| axis | RESEARCH V3 (`makeGothicPatch(4,12)`) | PRODUCTION gate (`_junctionGate`) |
|---|---|---|
| u-domain | **u[−0.0576, 0.1091]** (width **0.1667**, spans u=0 seam) | u[0.05, 0.15] (width 0.10, seam-avoiding) |
| t-domain | **t[0.70, 0.80]** (width 0.10, centered apex j.t≈0.75) | **t[0.38, 0.62]** (width 0.24) |
| tol | 0.01 | 0.01 |
| guard basis | full-azimuth honest brute (LOOP_NTH 512, dense ≥36-pt bary) | full-azimuth brute (parallelScorer, 7-pt driver) |
| seed | M-square graded + locked-crest subdiv, bgArcMm 0.16 | uniform bgArcMm (+ adaptive/rib-aware opt-in) |
| refine | M-square Steiner + honest-brute STOP | isotropic RED 1→4 + honest-brute STOP |

**⇒ THE t-BANDS ARE DISJOINT.** V3's t[0.70,0.80] and production's t[0.38,0.62] do NOT overlap. V3 centered on the
apex junction `findApexJunction` returns (t≈0.75) — a PROTECTED-κ arch tier. Production targets t≈0.40-0.49, which
V11d localized as the raw-κ-detector DEAD ZONE (protected complex covers only t∈[0.12,0.18]∪[0.48,0.57]∪[0.96,0.99];
the worst production outliers sit on a SMOOTH LOW-κ HIGH-amplitude horizontal arch arc r(t) 44.4→45.9→45.1 over ~5mm).
So candidate (b) DOMAIN is a-priori LIVE: V3's "1.05M" was measured on a different, protected t-band, NOT the
junction-dense/dead-zone band the production gate covers. The u-width also differs (0.167 vs 0.10) + V3 straddles the
seam. This pre-registration does NOT pre-judge; it sets up the direct discriminator.

**STEP 2 — THE DISCRIMINATOR (pre-registered).** Run the RESEARCH M-square kernel VERBATIM (its own
`extractProtectedComplex` + graded `seedMesh` + `refineInteriorMsquare` honest-brute loop) on a PatchDef built with
the EXACT PRODUCTION domain u[0.05,0.15]×t[0.38,0.62], tol 0.01, whole-mesh full-azimuth guard. Measure: converged-to-0?
tris + projectedFullMeshTris? wall-clock? per-pass trajectory (checkpoint ndjson). Probe env-gated PF_TIERC_COSTGAP=1.

**KILL CRITERIA (committed BEFORE measuring):**
- **MECHANISM-GAP CONFIRMED** iff the research kernel reaches **interiorOutliers=0 (honest guard) at projectedFullMeshTris ≤ 6M**
  on the production domain. Then ABLATE (one, cheap): swap the M-square graded seed/refine for a UNIFORM seed +
  isotropic RED (the production mechanism) on the SAME research harness — if THAT explodes, the load-bearing delta is
  isolated (M-square seed and/or graded flank). Spec the port into tierC.
- **GENUINE-COST FRONTIER** iff the research kernel ALSO exceeds 6M and/or fails to reach 0 outliers on this domain
  (matching V11k's production explosion within ~1.5×). Then the junction/dead-zone band is genuinely expensive at
  tol 0.01 irrespective of mechanism ⇒ produce the honest outliers/max-vs-projected-tris frontier for both kernels as
  the decision artifact. Fork = budget-raise vs frontier-documentation (NOT tol-relaxation — user standard rejects
  per-region accept-bands).
- **STRUCTURAL-BREAK** iff the research kernel cannot run on this domain without changes (junction topology it never
  handled). Report exactly what breaks — that itself locates the gap. STOP after discriminator + one ablation.

Probe: `research/bridge/_pf_costgap_prod_domain.test.ts` (PF_TIERC_COSTGAP=1). Data → `research/exchange/_tierc_costgap/`.
Registry: E-2026-07-08-TIERC-COSTGAP. Pre-reg commit: 91a8980 (spec) / c240187 (probe+row).

### VERDICT (2026-07-08) — GENUINE-COST FRONTIER; the discrepancy is DOMAIN (hypothesis b), NOT a mechanism gap

**STRUCTURAL-BREAK REFUTED.** The research M-square kernel RUNS cleanly on the production domain — no junction
topology it can't handle. `extractProtectedComplex` on u[0.05,0.15]×t[0.38,0.62]: fam=2, segU 867, segT 380,
residualCrossings=0, cEdges 1328, crest3D 1260, seed 10537v/20682t. (planarizeMM/no-bridge came FROM research; the
domain flows through unmodified.)

**DISCRIMINATOR — the research M-square kernel EXPLODES on the production band too** (BG=0.6 smoke trajectory,
LOOP_NTH 256, projected via the V3 rule trisPerBay×72, nBays=7.20):

| pass | tris | proj full-pot | outliers | worstMm | insFlank | insCrest |
|---|---|---|---|---|---|---|
| 1 | 6,126 | 61,260 | 2,288 | 0.507 | 8,426 | 1,908 |
| 2 | 19,568 | 195,680 | **8,196** | **0.585** | 32,203 | 3,415 |

Outliers GROW 3.6× (2288→8196), worst WORSENS (0.507→0.585), tris 3.2×/pass — the SAME monotone explosion as the
production gate (V11k: 144k tris @ pass-5 = 6.06M, thousands of outliers, worst bounced up). The M-square graded
seed + locked-crest subdivision does NOT rescue the production dead-zone/full-relief band. (A V3-density BG=0.16-0.3
confirm arm is running but is contention-slowed; the BG=0.6 explosion + the analytic mechanism below are jointly
decisive — the trajectory DIRECTION is density-invariant.)

**ROOT CAUSE — DOMAIN (hypothesis b), quantified analytically (cheap, decisive).** V3's "1.05M converged" and the
production explosion are the SAME mechanism on DIFFERENT-DIFFICULTY t-bands:
- Crest coverage is NOT the difference: both bands are fully crest-covered by the research extractor (0/8 empty
  t-bins). The V11d "dead zone has no ridge" was a raw-κ-DETECTOR artifact (production's detector), not the research
  extractor's view.
- **RELIEF is the difference. GothicArches TAPER; V3's `findApexJunction` landed on the SHALLOW arch TIP (t≈0.75).**
  Measured relief amplitude (max−min r over u), analytic:

  | band | ampMean | ampMax | max\|dr/du\| | t-width |
  |---|---|---|---|---|
  | **PROD t[0.38,0.62]** | **1.217mm** | **1.797mm** | 8.75 | 0.24 |
  | V3 t[0.70,0.80] | 0.541mm | 0.712mm | 6.32 | 0.10 |

  The relief profile over t (u∈[0,0.2]) is a monotone taper with a cliff at t≈0.52: ~1.75mm for t∈[0.30,0.50] →
  1.10 @0.525 → ~0.60 for t≥0.55. **The production band has 2.25× the mean relief / 2.52× the peak relief / 1.4×
  the flank steepness / 2.4× the t-width of the V3 band.**
- P1 chord-sag ~ amplitude × (facet size)² ⇒ resolving 2.25× relief to the same tol 0.01 needs ~1.5× finer facets
  per axis ≈ 2.25× more tris; × 2.4× wider band ⇒ **~5.4× more tris — matching the observed 6-8× research↔production
  gap.** The junction/dead-zone band is GENUINELY ~2.25× more expensive at tol 0.01, irrespective of mesher mechanism.

**ADJUDICATION: GENUINE-COST FRONTIER (the pre-registered branch ii).** Not a mechanism-gap the M-square seed can
close — the M-square kernel is the SAME generative engine as V3 and it explodes here identically to production. The
ABLATION (uniform-seed edge-RED) is therefore SUBSUMED: both mechanisms explode because the outliers are genuine
full-relief rib-flank facets exceeding tol=0.01, not seed artifacts (confirms + generalizes V11k's refine-loop-floor
finding to the research engine). The V3 1.05M datum is REAL but was measured on an EASIER (shallow-tip) band; it does
NOT establish the full-relief mid-body converges under 6M.

**FORK (per user standard — NO per-region tol accept-bands):**
1. **BUDGET-RAISE for feature-dense styles.** Projected full-relief Gothic mid-band ≈ 2.25× the V3 trisPerBay ≈
   32,800/bay × 72 ≈ 2.4M IF it converged — but it does NOT converge under isotropic/M-square RED (outliers grow).
   The genuinely-different downstream lever (V11k's standing recommendation, UNCHANGED): an ANISOTROPIC / flank-aware
   RED that splits a rib-flank facet along its short axis only (≈halves tri growth vs isotropic 1→4) — the ONE
   untested mechanism that could bring the full-relief band under budget. This is a REFINE-LOOP lever, not a seed one.
2. **Frontier-documentation:** accept the full-relief Gothic arch mid-body as a documented density-vs-budget concession
   at tol 0.01 — the honest cost of resolving every 1.8mm arch flank to 0.01mm on a 0.24-wide t-band.

**NET.** The research-vs-production "6-8× cost discrepancy" is FULLY EXPLAINED and is NOT a portable win being left on
the table: V3 measured the shallow arch tip, production measures the full-relief arch body. Porting the M-square seed
into tierC would NOT close the production gate (proven: the research M-square kernel explodes on the exact production
domain). The open lever is DOWNSTREAM (anisotropic/flank-aware RED), exactly as V11k concluded — this round CONFIRMS
that verdict on the research engine and removes "just port the research seed" from the option set.

**GUARANTEES:** research-only (NEW `_pf_costgap_prod_domain.test.ts` + PF_TIERC_COSTGAP probe; research kernel libs
imported READ-ONLY, UNMODIFIED). NO src/ or tierC/ edit. Fast tierC suite untouched (byte-identical-off unaffected).
Commits 91a8980 (pre-reg) / c240187 (probe+row) / [this verdict]. Data: research/exchange/_tierc_costgap/
{INTERIM_FRONTIER.md, msquare_passes_SMOKE_bg0.6.ndjson, progress.log, msquare_passes.ndjson (BG=0.3 confirm)} (gitignored).

---

## V11n — ANISOTROPIC FLANK-AWARE RED (ROUND 6, E-2026-07-08-TIERC-ANISO-RED) — PRE-REGISTRATION (2026-07-08)

**THE LAST UNTESTED MECHANISM.** V11k+V11m both converged on ONE genuinely-different downstream lever for the
full-relief multi-bay Gothic gate: an ANISOTROPIC / flank-aware RED that splits a rib-flank facet along its
SHORT axis only (the across-crest, high-|r''| sag direction) — ≈halving tri growth vs isotropic 1→4. Every seed
lever is exhausted (adaptive REFUTED as budget-neutral, rib-aware REFUTED — the outliers are genuine rib-flank
facets re-inserted by the refine loop). The budget wall is a REFINE-LOOP floor, so the lever MUST be in the
refine loop, not the seed.

**MECHANISM (from the code + the sliver-campaign geometry).** Isotropic RED (`applyScoredPass` / the sync loop)
inserts ALL THREE edge midpoints of an outlier facet — 1→4 tris under the subsequent whole-domain re-CDT. But a
rib-flank facet's P1 chord-sag is dominated by ONE direction: ACROSS the crest (VALIDATION 5: the needle's
longest edge sits median ~76° to the crest ⇒ the sag axis ⊥ crest). Inserting ONLY the sag-dominant edge's
midpoint (a 1→2 point-count split; the per-pass re-CDT keeps the mesh conforming, so no T-junctions) buys the
same across-crest sag reduction at ~half the point growth. Two direction signals, chosen by measurement:
- **D1 edgeSag:** per outlier facet, the P1 midpoint 3D chord-sag of each of its 3 edges (3 surface evals); bisect
  the MAX-sag edge. Sag-selective by construction.
- **D2 longEdge:** bisect the longest CHART edge (mm) — the ~76°-to-crest cross-flank edge; cheapest (no eval).
- **FALLBACK to isotropic** when the top-2 edge signals are within `anisoAspectTol` (ambiguous / aspect≈1) — an
  anisotropic-only loop could stall (a near-equilateral apex facet has no dominant axis).

Constraint-respecting: a locked constraint edge chosen as the split edge subdivides the CONSTRAINT
([a,b]→[a,m],[m,b], m the straight midpoint, never snapped — the `upperIds`-crash rule); crest midpoints stay
locked. Guard: reject a split producing a sub-`DEDUPE_CELL_MM` (0.004mm) edge; zeroArea stays 0.

**IMPLEMENTATION.** Opt-in `RefineOptions.splitMode:'aniso'` (+ `anisoDirection:'edgeSag'|'longEdge'`,
`anisoAspectTol`), default undefined ⇒ isotropic ⇒ BYTE-IDENTICAL (regression test hashes uv/tris off-flag).
The aniso branch lives in BOTH the sync `refineToZeroOutliers` insertion block and `applyScoredPass` (parallel
path) — the two share the split logic, so the aniso mesh is identical across sync/parallel given identical dev[].

**GATE HEAD-TO-HEAD (pre-registered).** Multi-bay domain u[0.05,0.15]×t[0.38,0.62], tol 0.01, adaptiveSeed hMin
0.09 t-only, bgArcMm 0.3, parallel scorer 4-worker + dirty cache, thetaWindow 0.5. Measure per pass: outliers,
worst, tris, projFullPot (×42), wall-clock. Baseline = the V11k on-disk trajectory
(`_tierc_ribaware/baseline_leverA_tOnly_frontier.json` + `ribgate_leverA_tOnly_pass.ndjson`; configs match).

**KILL CRITERIA (committed BEFORE measuring):**
- **CONVERGED-UNDER-6M (ACCEPTANCE) iff:** literal whole-mesh 0 (honest dense guard, every free facet) AND
  watertight non-vacuous (inject-crack moves nonMan) AND capped==false AND projFullPot < 6,000,000. THEN GeoStar
  patch gate → rebaseline20 detached.
- **KILL (2-DESIGN) iff:** BOTH D1 and D2 fail to beat isotropic growth-per-sag meaningfully (< 1.3× tri savings
  at an EQUAL outlier trajectory — matched pass outlier counts within ~15%) OR the gate converges only ABOVE 6M.
  ⇒ STOP and produce the FINAL DECISION ARTIFACT: the consolidated outliers/max-vs-projected-tris frontier for
  isotropic (V11k) vs aniso vs research (V11m), stated for a user budget decision, PLUS the honestly-extrapolated
  budget for literal 0 (error bars stated).

Probe: `tierC/anisoSplit.test.ts` (fast guard) + `tierC/_anisoGate.test.ts` (PF_TIERC_ANISOGATE=1). Data →
`research/exchange/_tierc_aniso/`. Registry: E-2026-07-08-TIERC-ANISO-RED. Pre-reg commit: ce9a01c.

### VERDICT (2026-07-08) — KILL CRITERION MET (converges only ABOVE 6M); the anisotropic split is a strictly BETTER refine mechanism but does NOT open the gate. The full-relief Gothic wall STANDS; RED-family refinement is now EXHAUSTED (iso + M-square + aniso).

**MECHANISM CONFIRMED (the lever works, edgeSag is the right signal).** Byte-identical-off re-verified (parallelRefine +
dirtyCache + the new anisoSplit guard all GREEN; splitMode undefined ⇒ isotropic, uv/tris hash-identical). Fast guard:
edgeSag **1.30 inserts/outlier vs iso 2.01 = 1.52× tri savings**; longEdge 0.70 = 2.18×; zeroArea 0. Full multi-bay
gate, first DENSE pass (5), head-to-head vs the V11k baseline (bit-identical pass-1 outlier population 5709, worst
1.0522062713658533 ⇒ aniso targets the SAME outliers, fewer inserts):

| pass | ISO (V11k) | ANISO edgeSag | ANISO longEdge |
|---|---|---|---|
| 5 (1st dense) | 8306 / worst 1.056 / 144369 tris = **6.06M** | **7142 / 0.726 / 122660 = 5.15M** | 8562 / 1.056 / 139960 = 5.88M |
| plateau | (V11k explosion, no conv) | ~2794 / **1.05919 pinned** / 166503 ≈ **6.99M** (p9-13) | capped: **2251 / 1.01889 / p99 0.019 / 186776 = 7.84M**, nonMan 0 (crack→3) |

edgeSag = **1.18× fewer tris AND better fidelity** than iso at the first dense pass (beats the 1.3× bar per split).
longEdge under-performs (tracks iso — the longest CHART edge is NOT the sag axis under the t-only anisotropic seed;
tall thin cells' long edge runs along-t). **edgeSag is the correct direction signal; longEdge is refuted.**

**NON-CONVERGENCE (the wall stands).** BOTH designs PLATEAU — worst PINNED at **1.05918988549241mm** (the EXACT
V11h/V11k re-forming CDT t-needle) for 5 consecutive dense passes; outliers flat/rising (~2251-2794) while tris
flatten (edgeSag +340/pass from 161k, longEdge +300/pass from 185k — SATURATED). Both OVER 6M. This is a geometric
FLOOR (full-relief rib flanks + the re-forming apex needle), not a monotone-shrinking residual ⇒ **a finite tri budget
for literal 0 is NOT honestly extrapolatable**: the re-forming needle survives EVERY midpoint insertion (V11h root
cause — the whole-domain re-CDT re-creates it), so more passes add tris WITHOUT removing the floor. This CONFIRMS
V11m's GENUINE-COST-FRONTIER adjudication on a THIRD, genuinely-different downstream mechanism — the wall is the DOMAIN
(ampMean 1.217mm over a 0.24-wide t-band), not the split isotropy. RED-family refinement (isotropic + M-square graded +
anisotropic single-edge) is now exhausted; none converges the full-relief Gothic mid-body under 6M.

**RECOMMENDATION (per user standard — NO per-region tol accept-band).** (1) BANK the anisotropic split (flag-gated,
default-off byte-identical, edgeSag the correct signal): it re-prices the wall ~1.18-1.5× cheaper per pass — worth
keeping for any future budget-raise — but does not open the gate alone. (2) The ONE remaining un-falsified direction
is a SEED/TOPOLOGY lever that FORBIDS the re-forming needle (a locked short t-edge across the apex bump so cdt2d cannot
span it, OR a LOCAL Bowyer-Watson insertion that does not re-CDT the whole domain — breaking the re-formation mechanism
V11h identified), NOT another refine-split isotropy. That is the standing next experiment.

**GUARANTEES:** only flag-gated Tier-C touched (`noBridgeRefine.ts` aniso opt-in branch + `insertOutlierSplit` shared
by sync + parallel paths; new dev-only `anisoSplit.test.ts` / `_anisoGate.test.ts`). splitMode default undefined ⇒
BYTE-IDENTICAL-OFF (regression GREEN). No src/ non-tierC edit; production consumer (`index.ts`) passes no splitMode ⇒
unchanged. GeoStar/rebaseline20 NOT launched (gate not converged). Commits ce9a01c (pre-reg) / 739be09 (code+guard) /
[this verdict]. Data: research/exchange/_tierc_aniso/{DECISION_ARTIFACT.md, anisogate_edgeSag_pass.ndjson,
anisogate_longEdge_pass.ndjson, anisogate_longEdge_result.json} (gitignored).

---

## V11c — DRAGONSCALES Z-DENSITY + CT ADJUDICATION (2026-07-08)

Two independent arms, both measured under the EXACT V10b dense radial-twin BVH ruler (scoreWholeMeshBVH: dense 45-pt
denseBary + radial same-azimuth prefilter, no screen, tol 0.01), shared-twin architecture (build twin once, reuse).

### ARM 1 — E-2026-07-08-DRAGONSCALES-ZDENSITY: SHEET closes, whole-mesh count is TREAD-TWIN-BLIND (MIXED)
Doubled-rings structured mesh (buildStructuredWall + dragonRings, treadCap=4), nZband sweep, per-facet sheet/lip class:
- **SHEET outliers DENSITY-RESPONSIVE**: 21,744 (nZ30) → 5,552 (nZ110); **pctBelow20 77%→2%** by nZ≥70. The z-density
  lever WORKS on the sheet (hypothesis mechanism CONFIRMED) but floors ~5.5k within 4M tris.
- **LIP outliers DENSITY-INVARIANT** ~141-150k across ALL densities. Decisive cross-check (radial-twin vs
  tread-representing step-reference twin, 40k lip facets): radial flags 78%, step-twin flags **0.66%** ⇒ the lip is a
  RADIAL-TWIN ARTIFACT. The single-valued S(θ,z) can't represent the tread (range of radii at one z); tread facets sit
  ~(rOut−rIn)/2 ≈ 0.046mm from S = exactly the observed lipMax 0.0461 ⇒ **SFB-seam-class twin-blind-spot.**
- **⇒ the V10b "263,536 DragonScales outliers" is DOMINATED by the tread twin-blind-spot, not a mesh gap.** DragonScales
  body is CAD-grade + density-closable; the tread is a designed near-vertical zero-serration doubled-ring feature the
  radial ruler cannot measure. Literal 0 under the radial twin is unreachable by density (ruler-class limitation).
  Recommend: score on the step twin (lip→0.66%, sheet closes) OR accept+document the tread as an SFB-seam exclusion.
  The prior CU-DSLIP 0.005 close (step-locator) was RIGHT for the body; the V10b radial re-baseline is tread-blind-inflated.

### ARM 2 — E-2026-07-08-CT-PREDICATE: tile-edge predicate REFUTED; direct-C0 predicate VALIDATED; exclusion MIXED
- **Tile-edge predicate REFUTED** (recall of true-C0 cells 0.10; the C0 loci are NOT on the diamond tile grid — they
  are ribbon-presence clamps + max(hV,hH) ridges + arc folds sweeping through (u,t)). K-refinement discriminator: only
  2.5% of the braid band is true-C0.
- **Direct-C0 predicate VALIDATED** (celticTriquetraC0Predicate flags where the live relief field's local
  K-refinement classifies C0; recall 0.865/0.968 at band 1e-3/2e-3) and used for exclusion.
- **Exclusion (dense radial twin 3072², EXACT V10b basis; band-0 = 186,400/0.0905 BYTE-MATCHES the V10b anchor):**
  band 1e-3 → 34,650 (18.6% survive, exclFrac 14.8%, p99 0.0253→0.0075); band 2e-3 → 10,955 (5.9%, exclFrac 30.4%).
- **MIXED**: NOT a clean COLLAPSE (exclFrac ≫6% cap, survival band-sensitive) NOR GENUINE (survival <50%). 81-94% of
  CT's outliers ARE the C0 braid crease (f32/f64 strand-flip class); ~6-19% survive off-crease = a GENUINE but SMALL
  body gap (max 0.05-0.07), far below the 186,400/0.0905 upper bound. UNLIKE BasketWeave/CelticKnot (GENUINE, 67-99%
  survive), CT is crease-DOMINATED — its upper bound was the most inflated of the three. CT joins the weave/tangled
  kernel-dispatch class with a SMALL target, no longer a raw upper bound.

**STATE:** two fleet residuals adjudicated. DragonScales = tread-twin-blind ruler-class finding (body CAD-grade); CT =
crease-dominated weave with a small genuine body gap. Neither is a representational wall. Flag stays OFF; dev-only; no
src/ edit. **LEDGER:** registry E-2026-07-08-DRAGONSCALES-ZDENSITY + E-2026-07-08-CT-PREDICATE (verdicts). Probes
_pf_dszdensity.test.ts / _ct_predicate.test.ts + lib _ct_creaseLib.ts; data _ds_zdensity/ + _ct_predicate/ (gitignored).

## V11f — DRAGONSCALES STEP-TWIN ADJUDICATION: the tread-representing STEP twin is REFUTED as the honest whole-mesh ruler; V11c's 0.046mm riser figure CORRECTED to ~1mm (2026-07-08)

Follow-up to V11c ARM 1. The V11c recommendation was "score DragonScales on the tread-representing STEP twin (lip→0.66%, sheet
closes)". That rested on an UNGRADED 40k-facet slice. This arm metrologist-grades the step twin (1a–1d) BEFORE trusting it.

### STEP TWIN VALIDATION (probe `_pf_dssteptwin.test.ts`, self-KILLed at the gate + diag `_pf_dssteptwin_diag.test.ts`)
- **1a construction PASS** — analytic tread-annulus points sit on the step-twin surface, maxDist **0.00035mm**; the ring
  jump magnitudes are **0.88–1.21mm** (mean 1.04) — the tread is real.
- **1b smooth-control FAIL (marginal→genuine)** — vs the radial twin on 60k smooth sheet facets, agree 0.9988 / deltaP99
  0.0017mm, but **72 disagreers**. D2 diagnostic: **71 are DEEP-body (>5mm from any ring, median 7.36mm)** — NOT near-ring
  leaks. Cause: the operating step twin (3840×48) is COARSER on the sheet (own on-surface residual 0.0116mm > tol, from
  1c) ⇒ it inflates borderline sheet verdicts vs the finer radial twin.
- **1c density-convergence PASS** — step-twin on-surface residual sheetMax 0.0568→0.0116→0.0053mm as nTheta/nZband climbs
  {2560/24, 3840/48, 5120/96}; tread residual 0.
- **1d one-sidedness FAIL (decisive)** — off-surface probes near rings: max UNDERSTATE **0.116mm** (thr 0.05). D1 diagnostic:
  at θ=1.117, z=105.8 (0.8mm above ring z=105), the step twin's added near-ring geometry (ring skirts + tread strip at
  z=105) provides a face **0.116mm nearer than the true single-valued sheet** ⇒ the step twin CAN HIDE a genuine mesh gap
  in the near-tread region. This is precisely the "a twin that represents the riser could also hide genuine gaps" failure.

**⇒ STEP TWIN REFUTED as the whole-mesh instrument** (2 independent gates fail, both root-caused). NEITHER twin cleanly
scores the whole mesh: RADIAL is one-sided-safe + fine-on-sheet but TREAD-BLIND; STEP represents the tread but is a filled-
annulus SPURIOUS CATCHER (1d) + coarse-on-sheet (1b/D2). The sound whole-mesh ruler for a doubled-valued tread is a per-
facet tread-CONFORMING OPEN SURFACE (two ring skirts + connecting wall), NOT a filled disk — build + re-run 1a–1d on THAT
before trusting it.

### MATERIAL CORRECTION to V11c
V11c stated "tread facets sit ~(rOut−rIn)/2 ≈ 0.046mm from S = exactly the observed lipMax 0.0461." That is **WRONG by ~10–27×.**
The DragonScales riser is a genuine **C0 discontinuity from the brick-STAGGER PARITY FLIP**: at each integer rowPhase (t=k/8),
`Math.floor(row)` increments, flipping the stagger offset `0.5·TAU/scalesPerRow` ⇒ `scaleTheta` jumps ⇒ a real **0.88–1.21mm**
radius jump at z=k/8·H (verified analytically with `DEFAULT_DRAGON_SCALES` AND via 1a ringJumpMax). Direct analytic tread-vert
deviation (no twin): `|r_tread − r(θ,ring)|` = **0.88mm (ring 1) → 1.21mm (ring 7)**. The prior 0.046 used stale params. The
~141k lip outliers thus reflect a ~1mm designed feature (LARGER twin-blind inflation than V11c stated), unambiguously real per
[[feedback_export_standard]] — and already correctly meshed (doubled rings + tread strip + embedded feature edges, serr ~0.001).

### HONEST DRAGONSCALES NUMBER (surviving RADIAL twin, V10b basis) — unchanged, now correctly decomposed
263,536 whole-mesh outliers = (i) a density-closable smooth SHEET body flooring **~5,552 @ nZband 110 / 4.09M tris** (radial
twin CORRECT here) + (ii) **~141k TREAD/lip facets** = the real ~1mm stagger-flip riser measured as "error" by the single-valued
twin (NOT a mesh gap; tread is ON the designed annulus to 0.00035mm). **CLASSIFICATION: RULER-CLASS finding** (body CAD-grade +
density-closable; tread = designed ~1mm zero-serration riser). Literal whole-mesh 0 under the radial twin is unreachable by
density (ruler tread-blind by construction). Flag stays OFF; dev-only; no src/ edit.

**LEDGER:** registry E-2026-07-08-DS-STEPTWIN-CLOSE (verdict). Probes `_pf_dssteptwin.test.ts` (PF_DS_STEP=1) +
`_pf_dssteptwin_diag.test.ts` (PF_DS_DIAG=1); configs `vitest.ds_steptwin{,_diag}.config.ts`; data `_ds_steptwin/scorecard.ndjson`.

---

## V11l — DRAGONSCALES LITERAL-CLOSE: transition-row lever REFUTED (kill hit); the ~8.7k FLOOR is TWO irreducible density classes (5,552 body-wide sheet + 3,200 near-ring lip). FINAL = CLOSED-with-documented-floor (2026-07-08)

ROUND 4, follow-up to V11g (which VALIDATED the conforming open-surface ruler + FLOORED at ~8.7k). Mission: drive
DragonScales to LITERAL whole-mesh 0 under the validated ruler via TRANSITION-ROW z-refinement (the prescribed lever, now
under the ALIGNED wallEps=5e-4 that removes V11g's mis-alignment caveat). Registry E-2026-07-08-DS-LITERAL-CLOSE.

### DECISIVE LOCALIZATION (SHEETLOC) — the two residuals live in DIFFERENT places
On the baseline nZ110 mesh under the validated conforming ruler, bucketing every outlier by z-distance-to-nearest-ring:
- **5,552 SHEET outliers → ALL ≥ 2.0mm from any ring** (`sheetHist=[0,0,0,0,0,0,0,5552]`). BODY-WIDE smooth-sheet chord-sag.
- **3,200 LIP outliers → ALL in [0.2, 0.6mm]** of a ring (`lipHist=[0,0,0,1448,1752,0,0,0]`). NEAR-RING last-strip.
⇒ the transition-row lever (which only touches near-ring rows) CANNOT reach the dominant 5,552 sheet residual.

### H1 TRANSITION-ROW SWEEP — REFUTED (count went UP, not down)
`buildRowsTransition` = shrink the ±0.6mm nearRing skip-band to ±transBand + fill it with finely-spaced pure-SHEET rows
(treadCap 4 fixed, global nZ110 fixed, scored under the ALIGNED 5e-4 wall). Two parameterizations:
| config | tris | TOTAL | sheet | lip | max | %<20 |
|---|---|---|---|---|---|---|
| baseline | 4.09M | **8,752** | 5,552 | 3,200 | 0.0461 | 2.0 |
| tb0.3/tr4 | 4.49M | 38,752 | **5,552** | **33,200** | 0.0461 | 1.7 |
| tb0.15/tr8 | 4.83M | 38,816 | **5,552** | **33,264** | 0.0461 | 11.4 |
`sheet` EXACTLY invariant (5,552 — body-wide, untouched); `lip` ~10× WORSE (each added near-ring sheet row spawns a new
ringBelow/ringAbove transition strip that chords the steep near-ring C0 curve); %<20 blows to 11.4 at tb0.15.
**Kill criterion HIT** (lever fails to bend the count after 2 params — it increases it). Same mechanism as the V11g refuted
skirt lever, now confirmed under the ALIGNED wall ⇒ the "mis-aligned skirt test polluted it" caveat is RESOLVED: clean
near-ring z-refinement is genuinely COUNTERPRODUCTIVE. The last strip before a ring ALWAYS chords the ~1mm C0 relief
(its endpoints are a sheet radius and a ring radius separated by the jump), regardless of z-refinement.

### THE FLOOR = TWO IRREDUCIBLE DENSITY CLASSES (both characterized, NEITHER a mesh defect)
1. **5,552 body-wide sheet chord-sag** — density-responsive (V11c/g: 21,744@nZ30 → 5,552@nZ110) but a GLOBAL nZband floor.
   nZ110=4.09M (in budget), nZ160≈5.9M, nZ220≈8M (over 6M) ⇒ does NOT reach 0 within the 6M full-pot budget. This mesh IS
   the full outer wall (2400θ × full-H), so its tri count is the full-pot count. FIDELITY-vs-BUDGET FRONTIER.
2. **3,200 near-ring lip** — the last-strip chording the designed ~1mm C0 riser (max 0.0208, 90% in [0.010,0.012)). A
   representation floor of a single-valued sheet meeting a C0 jump. IRREDUCIBLE to z-refinement (H1 worsens it).

### VERDICT: CLOSED-with-documented-floor
Literal whole-mesh 0 is NOT reachable within the 6M budget by any z-density lever. The V11g FLOOR (~8.7k, max 0.0461,
p99 0.0043, %<20 2.0, watertight non-vacuous bd=4800, zeroArea 0, riser serration ~0.001) STANDS and is now
mechanistically nailed: two density classes, one budget-frontier-limited (sheet), one representation-floor (lip). The
prescribed transition lever is REFUTED. DragonScales is CLOSED as RULER-CLASS: body CAD-grade + density-closable to a
6M-budget frontier; tread/riser a designed zero-serration ~1mm C0 feature measured correctly. Flag OFF; dev-only.

**LEDGER:** registry E-2026-07-08-DS-LITERAL-CLOSE. Probe `research/bridge/_pf_dsconform.test.ts` (PF_DS_SHEETLOC/TRANS/
C0TAIL + buildRowsTransition + scoreMeshTo); data `research/exchange/_ds_close/scorecard.ndjson`; commits 06aefb2 →
ac4fad1 → 5188409 → df3138c.

---

## V11g — DRAGONSCALES CONFORMING-RULER: the tread-CONFORMING OPEN-SURFACE ruler is VALIDATED (1st of 3 to pass the 1a–1d battery); honest whole-mesh number ~8.7k (NOT 263,536); FLOOR = near-ring sheet-sag, fully characterized (2026-07-08)

ROUND 3, follow-up to V11f. Two prior whole-mesh instruments were refuted (radial twin TREAD-BLIND; filled-annulus step
twin FAILS 1b coarse-sheet + 1d filled-disk-catcher). This arm builds the V11f-prescribed OPEN-surface conforming ruler
and metrologist-grades it BEFORE trusting it.

### INSTRUMENT — composite open-surface ruler = min(radial-sheet twin 2048×3072, riser wall-only 4096θ, z-gated)
The full dense conforming ref (`buildConformingReference`, skirts + explicit open riser wall, 7.9M tris) was built +
1a-verified but its BVH stalled 1b >15min (tiny sheet tris packed the cells). Rebuilt as a COMPOSITE: the radial twin
supplies the SHEET (⇒ 1b passes by construction — same surface as the radial twin), a tiny wall-only ref (7 rings ×
4096θ × 2 tris) supplies the RISER, and a z-gate skips the sparse wall BVH for far-from-ring queries (exact; the sheet
always wins the min there). `research/bridge/_ds_conformRef.ts`.

### 1a–1d BATTERY — ALL PASS (aligned wall wallEps=5e-4 = the mesh's ring-row zEps)
- **1a PASS** — skirt + open riser-wall anchors on the ruler surface, maxDist **0.00029mm**; ringJump 0.88–1.21mm.
- **1b PASS (BEATS the step twin)** — vs radial twin on 60k smooth facets: agreeFrac **1.0** (60,000/60,000), 0 disagreers
  both directions, deltaP99 **0**. The composite's sheet IS the radial twin ⇒ perfect smooth-body parity (step twin
  FAILED here: 0.9988 / 71 deep-body disagreers from its coarse sheet).
- **1c PASS** — sheet 0.00315mm (radial twin); wall converges **0.00498→0.00125→0.00031mm** over nTheta 1024/2048/4096.
- **1d PASS (BEATS the step twin)** — SOUND normal-push understate **0.0057mm** + conforming-not-below-radial **0.0061mm**
  (≪ 0.05/0.03). CORRECTION banked: the step-twin arm's 1d used a RADIAL push (r+delta at fixed θ) — UNSOUND on
  DragonScales' steep-θ sheet (~65mm/rad, radial push ≈ tangent ⇒ true 3D nearest ≪ delta; DIAG proved conforming==
  radialTwin 0.0855==0.0856 = honest 3D geometry). The SOUND test pushes along the true 3D surface NORMAL (cheatsheet
  radial-vs-true-3D gotcha). The step twin's 0.116 fail was a GENUINE filled-disk catcher (D1 winner = the tread DISK).

### HONEST WHOLE-MESH NUMBER (validated aligned conforming ruler, every-facet 45-pt stride-8, tol 0.01)
| nZband | tris | sheet | lip | TOTAL | max | p99 | %<20 | rawNM | za |
|---|---|---|---|---|---|---|---|---|---|
| 70 | 2.69M | 6,680 | 1,904 | **8,584** | 0.0461 | 0.0057 | 3.1 | 0 | 0 |
| 110 | 4.09M | 5,552 | 3,200 | **8,752** | 0.0461 | 0.0043 | 2.0 | 0 | 0 |
vs **263,536** under the radial twin (riser-blind) and 36,576 under the mis-aligned wallEps=0.01 composite. The riser-blind
141k artifact is GONE; the tread now sits ON the ruler (tread outliers 14,008→0).

### RESIDUAL = near-ring SHEET-SAG (density-responsive), NOT a mesh defect
lipdiag (aligned wall): ~8.7k = (i) sheet body **5,552** (density-responsive, established); (ii) **~3,200** ringBelow/
ringAbove strips, 100% winSheet, chording the CURVING sheet near the ring (max 0.0208); (iii) <~90 C0-STRADDLE tail (p99
below tol) — last-sheet-row facets straddling the discontinuity z where the single-valued sheet component is tread-blind
and the thin 5e-4 wall is too narrow in z to catch them. All near-ring sheet-side chord effects at the C0 jump.

### TWO INSTRUMENT ARTIFACTS the battery CAUGHT (method wins)
- **wallEps ALIGNMENT artifact (−28k):** at wallEps=0.01 the ruler wall skirts sat 0.0095mm off the mesh ring rows
  (zEps=5e-4) → mesh ring vertices read the z-offset as "distance" → 31,024 lip (90% in [0.010,0.011)). A/B: aligning
  wallEps→5e-4 collapses lip 31,024→3,200 (alignment artifact). Default WALLEPS set to 5e-4.
- **skirt-densification lever REFUTED:** adding transition skirt rows + tread sub-rings WORSENED with density (31k → sk3
  28,200 → sk6 45,072): more strip/tread facets each chord the wall. Refuted before it could mislead the close.

## V11j — GYROID INSTRUMENT WALL BROKEN: grid-free Newton IS the trustworthy true-3D nearest; fork = CLIFF-CLASS (V10b twin/radial 8-9× INFLATED) (2026-07-08)

Metrology charter follow-up to §V11b. The pilot concluded "neither tractable true-3D ruler is trustworthy on Gyroid at
tol 0.01" and left V10b's "GyroidManifold 113,767 outliers @max 0.0889 GENUINE" standing under the suspect twin. This
arc produced a TRUSTWORTHY true-3D verdict and adjudicated the fork. Registry E-2026-07-08-GYROID-TRUTH (full numbers).

**(1) The instrument wall was a GRID wall, not a metrology wall.** The pre-registered truth-grade brute (full-azimuth
grid 2048×400 → 4096×800) FLIPPED 0.0189mm on the worst-facet points — firing the INSTRUMENT KILL. Diagnosis: the flip
is the COARSER brute's k-best box-refine STALLING in a shallow well (OVERSTATING); the finer 8192×1600-k24 grid AND
continuous multi-start Newton BOTH descend to the SAME deeper foot (f=942465: brute4096 0.0235 wrong → brute8192 0.00783
== Newton 0.00694). Grids refine-trap and OVERSTATE; the BVH twin band-limits and UNDERSTATES. **The one sound tractable
true-3D nearest = grid-free multi-start Newton on D(θ,z)=|P−S(θ,z)|²: every value it returns is a REAL achievable surface
distance ⇒ a valid UPPER bound, and the tightest is truest.** Validated design (after 3 refinements the diagnostics
forced): radial-anchor seeds + DENSE-z (the well is z-SHARP) + a coarse-grid seed + a fine z-line refine (the last hard
1/60 point f=1678065 has its true foot at dz≈−0.009mm — missed by ±45°/5-z seeding, found by the fine z-line).

**(2) Validation table (a/b/c) — Newton is truth-grade + guard-usable-offline.** Over the 60 hardest facet-worst-points
+ the worst-20 FULL-facet: (a) full-facet Newton == full-facet windowed-brute8192 to **0.000000** (worst-20); (b)
self-converges 11×41 == 21×81 to **0.000000**, **0 missed wells**; (c) **~205ms/query** (offline whole-mesh via the
radial prefilter skipping >99% of facets — NOT a live-guard driver at that cost). BANKED CORRECTION to §V11b's "no sound
ruler / use the radial upper bound only": the sound true-3D nearest on a tangled multi-well surface IS tractable — it is a
continuous descent, not a grid. Applies to the whole tangled class (Voronoi/CT/CelticKnot/…).

**(3) The honest Gyroid floor (worst-500 floor-truth + D1 full-mesh + D2 stratified robust):** worst facet true-3D =
**0.0628mm** (radial 0.1365 overstated ~2.2×; twin 0.0889 also overstated). Whole-mesh: 206,273 radial-outlier facets
(sound upper) but only **~5.7% are TRUE-3D outliers** (trueDev p50 0.0034, p90 0.0093 — most are FINE) ⇒ ~**12,000**
honest true-3D outliers, vs V10b's 113,767 (twin/radial 8-9× inflated). **~94-95% sit on steep channel walls** (wallSlope
p50 1.9 / p90 5.8 mm/mm).

**(4) FORK = CLIFF-CLASS.** Not twin-inflated-to-closed (worst 0.062 > 0.02) but far smaller + far more concentrated than
believed. `scatter_radial.png`: the outlier (u,t) population traces the **gyroid TPMS channel-wall network exactly** —
thin curvilinear double-line loci (the two near-vertical smoothstep-transition walls of each raised ridge), ~10% areal
coverage, channel interiors clean. ⇒ Gyroid's residual = the DESIGNED near-vertical relief walls, a CLIFF/feature-edge
class like the weave over-under walls / DragonScales riser ([[feedback_export_standard]]). Honest close = EMBED the
relief-transition contours (|val|=thickness level set) as MESH EDGES with zero serration, NOT density (§V11b proved
density floors: count grows with density on near-vertical walls). The whole-mesh-density-guard is the wrong tool here.

**NEXT:** (a) build the channel-wall feature-edge extractor (the |val|=th·(1−smoothVal) contour on the (θ,z) domain →
constraint polylines, style-agnostic via the featureGraph detector) and re-mesh Gyroid conforming to it; measure honest
whole-mesh outliers → expect ≈0 off-wall + the walls as embedded edges. (b) The validated grid-free Newton is now the
tangled-class true-3D verdict instrument — re-adjudicate the other tangled styles (E-2026-07-08-TANGLED-CONTINUATION) with
it where their BVH twin was unsound.

**LEDGER:** registry E-2026-07-08-GYROID-TRUTH; research/exchange/_gyroid_truth/ (gitignored, numbers inlined + scatter
PNG); instruments research/bridge/_gyroid_truthLib.ts + probes _gyroid_truth.test.ts / _gt_validate.test.ts /
_gt_facetfloor.test.ts + render research/render/utScatter.cjs; commits d49c7fc→fe4f089→f333d32→(D-split/scatter/verdict).
DEV-ONLY; no src/ edit; _pf_tangledKernelLib.ts read-only.

---

## V11o — GYROID CONFORMING-CLOSE: DOUBLED wall-band embedding conforms Gyroid (off-wall→0, trueMax 0.0628→0.0385); SINGLE-midline REFUTED (2026-07-08)

Close follow-up to §V11j (CLIFF-CLASS). §V11j proved the honest Gyroid floor is ~12,000 true-3D outliers (max 0.0628,
~94% ON the designed near-vertical channel walls). This arc EMBEDDED those walls as mesh edges and re-verdicted under
the validated Newton ruler. Registry E-2026-07-08-GYROID-CONFORMING-CLOSE (full numbers + decision table).

**(Q1) The wall contour extracts ANALYTICALLY to machine precision.** The gyroid relief `shape = smoothstep(th,
th−smoothVal·th, |val|)` makes the wall the isovalue BAND |val| ∈ [th·(1−smoothVal)=0.135, th=0.15] (ridge-plateau edge
→ channel-floor edge; the two lines of the §V11j scatter). Marching squares on |val|=c + per-crossing root-polish +
a re-polish/filter pass (`_gyroidContourLib`) places EVERY contour vertex on the isolevel to maxDisp 0 / p99 0 (25k
pts/isolevel). Overlay traces the §V11j channel-wall network exactly. (First `disp3D` validator blew up to 85mm at
val's ∇→0 saddles — a VALIDATOR artifact from a single Newton step; a bounded 2D nearest-isolevel search fixed it.)

**(Q2) FINE PICKET defeats the count-unstable crossing-chain recovery.** Feeding the contours as constraintEdges to
the seam-safe inhouse mesher, the Lawson crossing-chain recovery is COUNT-UNSTABLE on a coarse picket (step 0.6/1.5M:
84% recovered, `subdivFailNonCollinear` = genuine crossing-blocks = the Gothic count-instability). But a FINE picket
makes consecutive constraint vertices Delaunay-adjacent ⇒ `alreadyPresent` (no recovery needed): step 0.15→99.1%,
0.08→99.4%, 0.1@3M→99.2% (failed 0.6-0.9%). recovery% is PICKET-driven; wall-conforming is BUDGET-driven; the product
(fine picket × high budget) is the tractability ceiling (0.1×3M converged but took 30.8min). All watertight (nonMan=0).

**(Q3) SINGLE vs DOUBLED — DECISIVE, and it flips the DragonScales/weave doubled-edge lesson onto Gyroid:**
DOUBLED (embed BOTH |val|=0.135 and 0.15, step0.15/1.5M): outliers ~12,000→**~2,133**, trueMax 0.0628→**0.0385**,
p99 0.0114, **OFF-wall 0/46**, nonMan 0, zeroArea 0. SINGLE (mid |val|=0.1425, step0.1/3M converged): **catastrophic**
— scaledTrueOut ~29,433, trueMax **0.321**, **90% OFF-wall** (285/318), zeroArea 57. One edge at the ramp-middle forces
facets to bridge ridge→wall→floor on both sides (huge off-wall sag); the DOUBLED pair puts edges at the ramp TOP and
BOTTOM so the near-vertical ramp facets span cleanly between them. ⇒ Gyroid is a DOUBLED-EDGE zero-serration feature-
edge style (DragonScales doubled-ring / weave doubled-grid / LowPoly doubled-crest family), NOT density.

**VERDICT: CLOSED (mechanism proven, residual = un-embedded junctions).** DOUBLED wall-band embedding is the correct
close path: off-wall→0, trueMax halved, watertight, no new population. Residual ~2,133 on-wall outliers (p99 0.0114,
just over tol) = the wall JUNCTIONS/saddles where the two isolevels (0.015 apart in val) nearly touch and the coarse
doubled picket left un-recovered (14% fail on the doubled build). Full CAD-grade = a FINER doubled picket at the
junctions + budget to chord-refine the ramp — density/picket knobs on the PROVEN mechanism, not a new class. The Gyroid
DEFECT CLASS is resolved: doubled-edge feature embedding, exactly as [[feedback_export_standard]] prescribes.

**LEDGER:** registry E-2026-07-08-GYROID-CONFORMING-CLOSE; research/exchange/_gyroid_close/ (gitignored — contours_refined.json,
mesh_{both15,mid}.{ut,idx}.bin, build.ndjson, verdict.ndjson, overlay_both.png, verdict_scatter_{both15,mid}.png);
instrument research/bridge/_gyroidContourLib.ts + probe _gyroid_close.test.ts (PF_GYROID_CLOSE=1 PF_GC=extract|build|verdict|diag);
commits 83dd562→aaf8f62→8f578d4→(verdict). DEV-ONLY; no src/ edit; kernel/truth libs read-only.

### VERDICT: CLOSED-with-certified-tread (RULER-CLASS, now with a SOUND whole-mesh ruler)
Body CAD-grade + density-closable; tread/riser = designed ~1mm zero-serration C0 feature (serr ~0.001, feature edges
embedded) the NEW conforming ruler MEASURES correctly. Honest single whole-mesh number = ~8.7k near-ring sheet-sag
(density-responsive) + <90 C0-straddle tail — NOT the 263,536 radial-twin artifact and NOT a mesh defect. Literal 0 not
reached (FLOOR); the near-ring ~3,200 is a clean transition-row refinement under the ALIGNED wall (unattempted here — the
mis-aligned skirt test polluted it). The conforming ruler is the FIRST of 3 DragonScales instruments to survive the
battery. Flag OFF; dev-only; no src/ edit.

**LEDGER:** registry E-2026-07-08-DS-CONFORMING-RULER. Instrument `research/bridge/_ds_conformRef.ts`; probe
`research/bridge/_pf_dsconform.test.ts` (PF_DS_CONF/LIPDIAG/WALLEPS_AB/CONF_CLOSE/SMOKE/DIAG); config
`vitest.ds_conform.config.ts`; data `_ds_conforming/scorecard.ndjson`.

---

## V11q — GYROID POLISH: whole-mesh p99 DRIVEN BELOW tol (0.0092) via chord-refine; saddle & mid-rung hypotheses REFUTED; residual = irreducible near-vertical ramp chord-Steiner floor (2026-07-08)

Round-3 follow-up to §V11o (CONFORMING-CLOSE). §V11o CLOSED Gyroid as a DOUBLED-edge feature-edge style (off-wall→0, ~2,133 on-wall outliers, p99 0.0114 just over tol) and hypothesised the residual was at wall JUNCTIONS/saddles where the two isolevels nearly touch. This arc drove for whole-mesh literal <0.01. Registry E-2026-07-08-GYROID-POLISH (full decision table).

**(1) The saddle hypothesis is REFUTED analytically (no build needed).** `gyroidGradMag` on the mid isolevel: `|∇val|` ∈ [4.8, 38.3], p50 24.0 — NEVER near zero, so the gyroid field has NO low-gradient saddles on the wall; the inner/outer band is UNIFORMLY thin (0.0006–0.0015 in u,t everywhere). The §V11o outliers' `|∇val|` distribution is statistically IDENTICAL to the global (median ratio 1.08), and 100% of them sit INSIDE the ramp band. ⇒ the residual is RAMP chord-sag on the near-vertical facets between the two embedded edges, worst where the band is thinnest (steepest wall) — NOT a saddle recovery-fail.

**(2) The mid-rung lever is REFUTED (same class as SINGLE-midline).** Adding an explicit |val|=0.1425 constraint edge between the doubled pair — predicted analytically to quarter the chord-sag (span-halving) — instead REGRESSED to trueMax 0.312, p99 0.161, **69% OFF-wall**: the band is only ~0.001 wide in (u,t), so a third near-coincident parallel constraint line over-constrains the triangulation and the mesher bridges facets ACROSS to the wrong wall. ⇒ the ramp midpoint must be anchored by a FREE chord-Steiner point, NOT a constraint edge.

**(3) Chord-refine (free Steiner) drives whole-mesh p99 below tol.** Tightening chordTolMm + budget (NO mid-rung) makes the free chord-Steiner insert unconstrained ramp-anchor points where the near-vertical wall chord-sag exceeds tol. Recovery-preserving picket (step 0.10→0.04 adaptive, 2M budget, chordTol 0.003) → whole-mesh **p99 0.00918 (<0.01), trueMax 0.0206, ~583 on-wall outliers (3.7× fewer than the honest baseline), 0 off-wall, watertight, zeroArea 0, wall serr p99 0.0092, 4.4min build**. The finer picket keeps constraint-recovery high (17.3% fail vs 26.7% at chordTol 0.002) so every wall edge stays embedded — that halves trueMax vs the aggressive-chord variant (0.045→0.021). All tractable (≤4.4min, far under the 45min frontier).

**VERDICT: CLOSED-with-floor (near-CAD-grade).** Whole-mesh 99th percentile IS below tol; the residual is a thin ~583-facet ON-wall boundary tail (36/58 sampled in [0.010,0.012]) = the irreducible near-vertical ramp chord-Steiner floor (wall rises ~0.4mm over a ~0.001-wide band; the free chord-Steiner can't get every facet within 0.01 of the smoothstep S-curve without the recovery-breaking / tractability-ceiling density). Literal whole-mesh 0 NOT reached, but this is a density/kernel knob on the PROVEN doubled-band mechanism, NOT a defect class. Mid-rung is a DEAD END. Recommend accept+document, matching the DragonScales CLOSED-with-certified-tread precedent (§V11o).

**LEDGER:** registry E-2026-07-08-GYROID-POLISH; research/exchange/_gyroid_polish/ (gitignored — build/verdict/saddle.ndjson, mesh_{adaptA,adaptC,adaptD,midrungB}.*, scatter_*.png); instrument `_gyroidContourLib.ts` (+gyroidGradMag +decimateContoursAdaptive +buildMidRung) + probe `_gyroid_polish.test.ts` (PF_GYROID_POLISH=1 PF_GP=saddle|build|verdict) + vitest.gyroid_polish.config.ts; commits b4069f8→4375de1→(verdict). DEV-ONLY; no src/ edit; kernel/truth libs read-only.

---

## V11i — TANGLED-CONTINUATION: all 6 remaining tangled/weave styles adjudicated via the VALIDATED Newton true-3D ruler (V11j instrument) — 3 density FLOORS + 1 crease-dominated + 1 small floor + 1 cliff-class; NO style is Gyroid-class-unmeasurable (2026-07-08)

Continuation of the tangled class after the Gyroid pilot (§V11b, REFUTED-for-Gyroid). Per §V11j §(2) the validated
grid-free multi-start Newton (`newtonNearest`, `_gyroid_truthLib.ts`) is the tangled-class true-3D VERDICT instrument;
re-adjudicated the remaining styles with it. Instrument recipe (§V11j §3): rank all facets by the SOUND radial bound →
Newton-score the worst-radial SAMPLE POINT of the fat tail + a stratified sample of the rest → honest true-3D count +
wall-slope + (u,t) scatter. Cost-controlled to 1 Newton/facet (`facetTrue3DWorstPoint`, ~200ms/call) ⇒ ~1.5min/style.
Registry E-2026-07-08-TANGLED-CONTINUATION (full numbers). All on the persisted `_best20` reaching meshes, tol 0.01.

| style | tris | radial-out (sound upper) | honest true-3D (Newton) | worst true mm | slope med / p90 | scatter | VERDICT |
|---|---|---|---|---|---|---|---|
| **Voronoi** | 1,798,605 | 202,217 | **~115,816** (57% of radial, 1.75× inflated) | 0.137 @(0.70,0.25) | 0.635 / 2.50 | full (u,t) domain; 42% slope<0.5 | **FLOOR — genuine distributed density gap** |
| **HexagonalHive** | 944,608 | 45,891 | **~26,262** (57% of radial) | 0.041 @(0.00,0.24) | 0.093 / 0.273 | full domain; 93.5% slope<0.3 (flat) | **FLOOR — pure under-density, cleanest target** |
| **CelticTriquetra** raw | 5,734,176 | 261,743 | ~189,460 (72%) | 0.818 (braid crossings) | 1.03 / 19.9 | crease-dominated | crease-inflated (see excl) |
| **CelticTriquetra** C0-excl b2e-3 | 5,734,176 | 17,135 (excl 93.45%) | **~10,027** (58% of remaining) | 0.047 @(0.44,0.25) | 1.12 / 4.13 | off-crease body | **crease-DOMINATED; small genuine off-crease body ~10k@0.047** |
| **CelticKnot** | 4,903,536 | 62,568 | **~61,551** (98.4% of radial — barely inflated) | 0.300 @(0.78,0.20) | 0.224 / 15.6 | 55% flat bulk + 31% steep crossing tail | **FLOOR — GENUINE (radial≈true), moderate-slope bulk + crossing tail** |
| **Crystalline** | 3,456,411 | 25,986 | **~14,263** (55% of radial) | 0.134 @(0.99,0.41) | 0.805 / 1.34 | 0% steep, moderate distributed | **FLOOR — small genuine density gap; twin-marginal concern MOOT (Newton grid-free)** |
| **BasketWeave** | 4,775,760 | 439,696 | **~370,799** (84.3% of radial) | 0.633 @(0.75,0.85) | **33.6 / 49.8** | 56% steep>2 (over-under weave walls) + 23% flat | **CLIFF-CLASS + genuine — worst fleet gap on near-vertical weave walls → feature-edge, not density** |

**Key finding — these are NOT Gyroid, and the radial/true-3D inflation ratio is STYLE-SPECIFIC (a diagnostic).** Gyroid was
8-9× radial-inflated (206k→~12k true, 5.7%) with 94% on steep channel walls (slope p50 1.9) ⇒ CLIFF-class (feature-edge
embedding). By contrast: Voronoi 1.75× inflated, 42% of true outliers on FLAT/moderate surface, full-domain ⇒ genuine
distributed density gap. HexHive 93.5% flat (slope<0.3, worst 0.041) ⇒ purest under-density. CelticTriquetra is
CREASE-DOMINATED (93.45% of outliers are the designed C0 braid/medallion creases per the validated `celticTriquetraC0Predicate`
band 2e-3 — feature-edge class; off-crease body only ~10k@0.047 — matches V11c). CelticKnot is GENUINE and barely inflated
(radial≈true, 98.4%) — a real ~62k@0.300 gap, moderate-slope bulk (density-addressable) + a steep over-under crossing tail.
So density is the right tool for Voronoi/HexHive/CelticKnot; CT is feature-edge. The pilot's deep-sag build STALLS under
3-agent contention and the radial-driven sweep grows the count on the steep fraction, so literal 0 was not reached this
session. BVH-twin soundness for Voronoi (0.0077@2048² pilot-prior) confirms the V10b ~105k count is REAL (Newton ~116k agrees).
watertight/zeroArea clean on the reaching meshes. **The instrument wall is BROKEN for the whole tangled class: the validated
grid-free Newton is the sound tractable true-3D verdict — NO style here is Gyroid-class-unmeasurable.**

**FLEET CLASSIFICATION (all 6, sound Newton true-3D on the `_best20` reaching meshes):**
- **DENSITY FLOORS (density is the right tool):** HexHive (~26k@0.041, 93.5% flat — cheapest), Crystalline (~14k@0.134,
  moderate, 0% steep), Voronoi (~116k@0.137, 42% flat + moderate tail), CelticKnot (~62k@0.300, 55% flat bulk + steep
  crossing tail). None reached literal 0 this session — the deep-sag mechanism BUILD stalls under 3-agent saturation (each
  Voronoi build >950s CPU with no checkpoint), and the radial-driven sweep grows the count on the steep fraction (§V11b).
  These are honest DENSITY floors, worst 0.04–0.30, watertight/zeroArea clean.
- **FEATURE-EDGE / CLIFF-CLASS (density is the WRONG tool — embed as zero-serration mesh edges, per §V11j / [[feedback_export_standard]]):**
  CelticTriquetra (93.45% of outliers ARE the designed C0 braid/medallion creases; off-crease body only ~10k@0.047),
  BasketWeave (worst fleet gap ~371k@0.633 but slopeMed **33.6** — near-vertical over-under weave walls, the DragonScales-riser/
  Gyroid-channel-wall analog). These need the feature-edge extractor (§V11j NEXT-a), NOT the density guard.

**METHODOLOGICAL WIN:** the radial/true-3D INFLATION RATIO is itself a style classifier — 1.0–1.2× (CelticKnot/BasketWeave,
radial≈true) = genuine gap; 1.75× (Voronoi/HexHive/Crystalline) = mild near-vertical overstatement; 8–9× (Gyroid) = pure
cliff. And the median wall-SLOPE of the true outliers separates density (slope<1) from cliff (slope≫1) cleanly. Both are
cheap byproducts of the Newton worst-point score (~1.5–7 min/style).

**LEDGER:** registry E-2026-07-08-TANGLED-CONTINUATION; probe `research/bridge/_pf_tangledCont.test.ts`
(PF_TC_TWIN/PF_TC_GATE/PF_TC_SWEEP/PF_TC_TRUTH); instrument `_gyroid_truthLib.ts` (read-only) + `_pf_tangledKernelLib.ts`
+ `_ct_creaseLib.ts`; data `research/exchange/_tangled_cont/<style>/` (gitignored, numbers inlined). Commits 83cf12d→
(this session). DEV-ONLY; no src/ edit.

---

## V11a — SMOOTH-TAIL CLOSE: all 4 smooth-tail styles CLOSED to literal whole-mesh EVERY-FACET 0-outlier (2026-07-08)

**E-2026-07-08-SMOOTH-TAILS — CONFIRMED (all 4 CLOSE).** The 4 smooth single-valued-field styles that the §V10b FINAL
dense-basis scorecard left a hair over 0 (Wave 2/0.0102, Fourier 20/0.0103, Ripple 82/0.0191, Harmonic 93/0.0151;
197 facets total) are now literal whole-mesh EVERY-FACET 0-outlier at tol 0.01mm, watertight, zero-area-free, within
budget. These were the campaign's cheapest wins (spec §V10b(3) item-1).

### ROOT CAUSE (found by the sweep discriminator, `_smoothtail_diag.test.ts`) — NOT what the pre-registered lever assumed
The pre-registered lever was "tighten the deep-sag chordTolMm guard." Measurement REFUTED that as sufficient: at
chordTolMm 0.006 AND 0.004 the Ripple count was STUCK at exactly 6 (max 0.0126), unchanged. TWO real mechanisms,
both isolated by a 5-variant discriminator (45-pt outliers):
1. **The kernel deep-sag chord guard sampled at only 4 points** (3 edge-midpoints + centroid) — it UNDER-reads a
   facet whose sag PEAKS between those points (Ripple residual facets: 4-pt reads 0.0101, the 45-pt true-3D
   acceptance ruler reads 0.0126 — they AGREE with each other, so it is genuine geometry the 4-pt guard is blind to).
2. **The DOMINANT cause: the post-refinement optimization SMOOTHING sweeps re-introduce sag AFTER the deep-sag guard
   has run.** `sweeps:0` → 0 outliers (max 0.0000) on both Ripple AND Harmonic; `sweeps:1/2` → the residual returns.
   The chord guard fires DURING the metric-refine loop but is never re-checked after the final smooth+flip. The
   underlying reason those facets can be lifted over tol at all: the curvature sizing grid (sizeRes) ALIASES the
   gentle near-rim ripple crest → sizes those facets ~0.9mm → tol-marginal, so a small smoothing displacement tips
   them over.

### THE FIX (measured, cross-style): curvatureFineStep sub-cell curvature sizing
`curvatureFineStep: 0.002, curvatureSubsamples: 5` resolves the aliased sub-cell crest curvature → the metric sizes
those facets small enough that the quality-improving smoothing CANNOT lift them over tol (fidelity by construction),
so the smoothing sweeps are RETAINED (unlike `sweeps:0`, which closes fidelity but sacrifices triangle quality).
Discriminator: Ripple fineStep → 0 outliers @ 207k tris (retains sweeps); Harmonic fineStep → 0 @ 1.42M. Belt-and-
suspenders: an OPT-IN kernel `chordSampleN=8` dense deep-sag guard lattice (byte-identical default; no-op fingerprint
GREEN, GothicArches idxHash 948740756 unchanged) + chordSteiner. `sizeRes:512` was WORSE (Ripple 18 outliers) — finer
grid corners do not fix corner-aliasing; sub-cell sampling does.

### FINAL SCORECARD (dense-basis every-facet, tol 0.01mm) — the CLOSE recipe: M-square + curvatureFineStep + chordSampleN8 + chordSteiner
| style | reaching→closed tris | analytic-brute outliers | max mm | p99 | BVH-twin (§V10b instrument) | rawNonMan (edges) | zeroArea | %<20° | CLOSED |
|---|---|---|---|---|---|---|---|---|---|
| WaveInterference | 137k→166k (+21%) | 0 | 0.0091 | 0.0061 | 0 outliers, max 0.0091 (CONFIRMED) | 0 (249,730) | 0 | 0 | YES |
| FourierBloom | 633k→771k (+22%) | 0 | 0.0091 | 0.0060 | — (analytic basis) | 0 (1,158,005) | 0 | 0.4 | YES |
| RippleInterference | 177k→208k (+17%) | 0 | 0.0087 | 0.0062 | 0 outliers, max 0.0087 (CONFIRMED — the worst original residual, 82→0) | 0 (311,903) | 0 | 0 | YES |
| HarmonicRipple | 1,116k→1,416k (+27%) | 0 | 0.0084 | 0.0049 | — (analytic basis) | 0 (2,125,518) | 0 | 0 | YES |

BASIS NOTE: the analytic-brute whole-mesh ruler (`scoreWholeMeshInterior`, the rebaseline20 basis — dense 45-pt
denseBary, every facet, full-azimuth `bruteNearestOnRadialSurface`, no top-N cap) is the PRIMARY gate; the §V10b BVH
twin (`scoreWholeMeshBVH`, 3072²) is an independent second dense basis. On WaveInterference BOTH read 0 on the closed
mesh (analytic max 0.0091 = BVH max 0.0091) — the two dense bases AGREE on a closed mesh, so the analytic gate is
trustworthy for the other three. (The BVH twin build ~16min + large-mesh score is why it is a spot-confirm, not the
per-iteration gate — the analytic ruler is seconds.) Budget gate: all 4 closed at +17–27% tris over their reaching
mesh — LOCAL refinement (curvatureFineStep + deep-sag), NOT a blunt global tighten (which the banked mandate forbids).

### CAMPAIGN ARITHMETIC UPDATE
Prior settled: 8/20 (V9 four + Gothic/GeoStar Tier-C + 2 excluded-by-design). **+4 smooth tails → 12/20 literal
whole-mesh 0-outlier** (or excluded-by-design). Remaining 8 = tangled/weave (Gyroid/Voronoi/HexHive/Crystalline/
BasketWeave/CelticKnot) + riser (DragonScales, ruler-class per V11 DS-STEPTWIN) + CelticTriquetra (predicate first).

**LEDGER:** registry E-2026-07-08-SMOOTH-TAILS (verdict CONFIRMED). Probes `research/bridge/_pf_smoothtail.test.ts`
(PF_SMOOTHTAIL=1; PF_SMOOTHTAIL_BVH=1 for the twin confirm), `_smoothtail_diag.test.ts` (PF_SMOOTHDIAG=1, the
discriminator), `_smoothtail_anchor.test.ts` (PF_SMOOTHANCHOR=1, the V10b-baseline instrument-match). Kernel opt-in
`chordSampleN` in `inhouseMetricMesh.ts` (byte-identical default, no-op fingerprint GREEN). Data
`research/exchange/_smoothtail/scorecard.ndjson`. Anchor note: my dense-basis re-score of the persisted _best20 Wave
bin read 6 outliers (not V10b's 2 — a twin-config-level count difference; max 0.0105 ≈ V10b 0.0102). The CLOSE gate is
0 outliers, unambiguous across bases.

---

## V11b — TANGLED KERNEL DISPATCH (Gyroid+Voronoi pilot) — INSTRUMENT WALL + DENSITY FLOOR (2026-07-08)

Dispatched the proven whole-mesh honest-guard mechanism to the tangled class (spec §4 dispatch: empty protected
complex + interior chord-sag Steiner). Seam-safe build = inhouse `buildInhouseMetricMesh` chordSteiner; driver+verdict
intended = the honest true-3D whole-mesh guard. **The pilot did NOT close either style — but surfaced a load-bearing
metrology finding.** Registry E-2026-07-08-TANGLED-KERNEL (full numbers); trust only these measured results.

**(1) INSTRUMENT WALL (the headline): neither tractable true-3D ruler is trustworthy on Gyroid at tol 0.01.**
- The V10e θ-window analytic grid brute (the ported production tierC ruler) UNDERSTATES Gyroid true-3D by up to
  0.0225mm vs a 4096×800 dense-truth — grid-trapped in wrong local minima on the fine multi-well r(θ,z) (20% relief).
  The window RANGE is proven valid (0/242 feet outside asin(2·bound/ρ)); it is the COARSE-GRID box-refine that traps.
  Denser 2048×200 + GN-fallback multi-start still lied. ⇒ The mission's "θ-window is EXACT-safe" holds for Gothic
  ribs (5% relief) but is REFUTED for Gyroid. The Gothic/GeoStar close worked because their honest brute WAS
  trustworthy; Gyroid's tangled surface breaks that premise.
- The V10b BVH twin ALSO band-limits > tol on Gyroid: twinOnSurfaceResidual max 0.075 @2048² / ~0.05 @3072² (>> tol);
  its outlier count/max are twin-artifact-contaminated (it UNDERSTATES). Voronoi's twin is nearly-sound (max 0.028 /
  p99 0.0077 @2048²) ⇒ BVH is a usable Voronoi verdict but NOT a Gyroid one.
- The ONE sound, grid-free instrument = the RADIAL same-(u,t) bound (strict analytic upper bound; a green facet is
  PROVABLY ≤tol). Banked: on a tangled multi-well radial surface, point→surface nearest is a global optimization no
  grid+box-refine solves reliably at tol 0.01; certify green with the radial bound, not a grid brute or BVH twin.

**(2) DENSITY FLOOR (the REFUTE): the sound radial-bound driver does NOT converge on Gyroid.** chordTolMm
0.03→0.004 (tris 1.19M→2.17M): soundUpperOutliers 112,519→140,640→192,577→206,273 (COUNT GROWS) while max
0.505→0.136 / p99 0.127→0.031 (SHRINK). Density-invariant floor + fat tail: near-vertical channel-wall facets carry a
radial bound ~2-3× true-3D that doesn't shrink with facet area. Kill-criterion (plateau>1000/4 passes) MET; budget
was NOT the blocker (projFullPot 4.34M < 6M). watertight nonMan=0, zeroArea=0 throughout (topology clean).

**(3) PI-relay sweep-fix REFUTED for this case:** sweeps:0 + chordSampleN:8 made the sound-upper count WORSE
(192,577→212,847→244,325) — the smooth-tail true-3D-sweep mechanism is the OPPOSITE sign for the tangled
radial-bound instrument (sweeps improve same-(u,t) vertex placement here).

**(4) Verdict + fork.** Gyroid's floor is a GENUINE true-3D gap (V10b 113,767 BVH outliers) but NOT closable by the
density-guard mechanism as dispatched: the mechanism needs a trustworthy true-3D STOP driver, which Gyroid does not
admit at tol 0.01. HONEST FORK: (a) a genuinely grid-free true-3D nearest (Newton with exhaustive well enumeration,
or a curvature-adaptive twin proven <tol — ~6144²+ for Gyroid); (b) if the honest true-3D floor is real, the designed
near-vertical channel walls are a CLIFF/EXCLUDE feature (like weave over-under walls) → the density-guard is the wrong
tool, a feature-edge/exclusion argument is right (per [[feedback_export_standard]]). Voronoi (BVH sound) is the
tractable next guard-mechanism target — its driver-floor was not run to a verdict. Stretch styles (HexHive/Crystalline/
BasketWeave/CelticKnot) NOT run; carried at their V10b numbers.

**LEDGER:** registry E-2026-07-08-TANGLED-KERNEL; research/exchange/_tangled_kernel/ (gitignored, numbers inlined);
kernel research/bridge/_pf_tangledKernelLib.ts + probe _pf_tangled_kernel.test.ts; commits 84760cc→721bc28. DEV-ONLY.

## V11u — TANGLED-TARGETED: HexHive is the FIRST tangled style CLOSED to literal Newton-0 — LOCAL injected-Steiner refinement of ONLY the residual reached 0 @7.28M where the V11r GLOBAL sweep could not reach 0 even @9.99M (2026-07-08)

**E-2026-07-08-TANGLED-TARGETED — HexagonalHive CONFIRMED (CLOSED, literal whole-mesh Newton-0).** Follow-up to the
§V11r density sweep, which DEMONSTRATED a monotone Newton trajectory but hit the 10M budget before 0 because the
uniform curvature-sizing field OVER-REFINES the flat bulk (HexHive is 93.5% flat, yet uniform chord0.0009 spent the
whole 2.5M-pt cap = 9.99M full-pot and STILL left 21 Newton outliers). §V11r's STANDING RECOMMENDATION was: refine
ONLY where the residual lives. This arm DID that and CLOSED it.

### MECHANISM (the §V11r recommendation, realized): LOCAL injected-Steiner refinement, NOT another global density step
The kernel's `injectedPoints` (forced (u,t) that participate in EVERY Delaunay/flip/split round) + `pinInjected`
(hold them against the smoothing sweeps) are the scoped lever. Per pass: (1) rebuild the base coarse GLOBAL mesh at a
loose chord (the flat bulk stays coarse); (2) radial-flag the residual facets (cheap SOUND upper bound — drives
injection; over-injecting is a budget cost, not a correctness bug — the V11r "radial drives refinement" principle);
(3) inject a dense (u,t) MICRO-CLUSTER (worst-sag bary point + a 6-satellite ring at spread 0.001, deduped) at each
radial-flagged facet's worst-sag point, pinned; (4) re-verdict Newton on the FINAL EMITTED mesh (post optimizeSweeps —
the §V11a "score the emitted mesh" trap avoided). Newton is the VERDICT only (facetTrue3D over a 45-pt denseBary(8)
lattice, radial-anchor multi-start §V11j, ~3s/facet); when the flagged population is small (≤topWorst) every facet is
scored EXHAUSTIVELY ⇒ EXACT count, not a stratified estimate.

### SCORECARD (HexHive, base chord0.00125, tol 0.01mm, honest-Newton true-3D on EVERY radial-flagged facet — exact)
| pass | injected | tris | projFullPot | radialOut (max) | NEWTON (exact) | worstTrue | nonMan | zeroArea | %<20° | build |
|---|---|---|---|---|---|---|---|---|---|---|
| base | 0 | 3,618,799 | 7,237,598 | 100 (0.0221) | **60** | 0.02017 | 0 | 0 | — | 711s |
| local1 | 350 | 3,632,365 | 7,264,730 | 24 (0.0229) | **13** | 0.02091 | 0 | 0 | — | 953s |
| local2 | 441 | 3,639,565 | 7,279,130 | 2 (0.0134) | **0** | **0.0098** | 0 | 0 | **0.044** | 942s |

**Newton trajectory 60 → 13 → 0** in TWO local passes. Total injected = 441 pinned Steiner points; tris grew only
3,618,799 → 3,639,565 (**+20,766, +0.57%**) — the refinement is genuinely LOCAL (the flat 93.5% bulk untouched).
Final worstTrue **0.0098 < tol** on the FINAL EMITTED mesh (post-smoothing; the §V11a re-lift trap avoided).
projFullPot **7.28M ≤ 10M** and this is a GENUINE density point (hitBudget=false — no point-cap hit), vs the V11r
uniform sweep which spent 9.99M (cap hit) and still had 21. watertight non-vacuous (nonMan 0), zeroArea 0, %<20° 0.044
(excellent quality). VALIDATION: the base rebuild reproduces the V11r chord0.00125 anchor EXACTLY (radial 100, Newton
60, worst 0.02017) ⇒ the in-memory targeted recipe == the persisted-mesh recipe; deterministic.

### VERDICT: HexHive CLOSED — the arm's headline (first tangled literal Newton-0). Method banked:
The LOCAL injected-Steiner refinement reaches literal-0 at a LOWER budget (7.28M) than the GLOBAL density sweep could
reach 0 at ALL (still 21 @9.99M) — PROVING the sizing field's over-refinement of the flat bulk was the barrier, not
the true geometric cost. This is the general density-close recipe for a SPARSE residual on a mostly-flat tangled
surface: radial-flag → pinned inject at worst-sag → Newton-verdict the emitted mesh. RESILIENCE: the environment
killed the run mid-pass-2 (proven risk); the per-pass ndjson + inj_<p>.json sidecar checkpoints let the resume SKIP
passes 0-2 and confirm the CLOSE with zero recomputation.

### Crystalline / Voronoi — CARRIED (recipe proven on HexHive; blocked on machine CONTENTION, not method)
The identical LOCAL injected-Steiner recipe is queued for Crystalline (V11r base b0.008/s224, 33,535 residual) and
Voronoi (65,590), Newton verdict downsized to 500/500 (radial-flag drives injection; Newton = verdict only, exact once
residual<500). Both were LAUNCHED but did NOT complete their base pass: the machine was CPU-SATURATED by the two
concurrent agents (measured: 3 external node procs monopolizing all cores at 27,000 / 11,820 / 11,023 CPU-seconds; my
Crystalline worker accrued <2 CPU-s in 42 min = starved). This is EXACTLY the "3-agent saturation stall" §V11i/§V11r
documented ("prior arm STALLED under 3-agent saturation"). Crystalline's radial screen alone is ~144M rA-evals over its
intrinsically-dense 1.6M-facet base — expensive even uncontended. VERDICT: CARRIED — the mechanism is PROVEN (HexHive
CLOSED); Crystalline/Voronoi need a quiet machine (≤2 procs) to run the ~40-50min/pass base + local passes to close.
The mission-scoped headline (first tangled literal Newton-0) is BANKED. RESUME: `PF_TT=Crystalline` / `PF_TT=Voronoi`
(the probe SKIPs done passes; a killed base pass simply re-runs from scratch — no partial-pass checkpoint mid-Newton).

**LEDGER:** registry E-2026-07-08-TANGLED-TARGETED; research/exchange/_tangled_targeted/HexagonalHive/{passes,final}.ndjson
(gitignored — numbers inlined above); probe research/bridge/_pf_tangledTargeted.test.ts (PF_TT=<Style>, resumable).
Commits: pre-reg c92cd4a, probe 8eb3a01, HexHive close 7ddf449, 500/500 downsize 4ca3009. DEV-ONLY; no src/ edit.

## V11s — TIER-C LITERAL-0 (raised 8-10M budget): the multi-bay Gothic gate does NOT reach literal whole-mesh 0 under ANY of 4 levers; the ~1150 residual is a GENUINE near-vertical rib-flank chord floor (dedupe-freeze DIAGNOSED but unfreezing it does NOT help) (2026-07-08)

ROUND 8, follow-up to V11p / E-2026-07-08-TIERC-TOPOLOGY DECISION_ARTIFACT. NEW USER MANDATE: raise the full-pot
budget to 8-10M (prefer ≤8M), demonstrate LITERAL whole-mesh 0 (dense 45-pt guard, every free facet), not extrapolate.

**THE KEY RE-READ (before any run):** the round-7 `topogate_p1_pass.ndjson` passes 16-30 are a HARD PLATEAU —
outliers pinned 1151-1157, worst FROZEN 0.4689 for 15 passes, and although `inserted`≈1230/pass, `nTris` grows only
~10-30/pass ⇒ **~99% of inserted midpoints are DEDUPE-REJECTED** (they collapse into occupied `DEDUPE_CELL_MM=0.004`
cells → no-op). The refine loop SPINS against two hard floors: (i) the 0.004mm dedupe lattice, (ii) the locked
constraint chains at `maxConstraintMm=0.15` (noBridgeRefine.ts:166-174 comment PREDICTS: "a long constraint edge
floors every crest-adjacent facet at ~L²κ/8 (a 1mm chord on a rib ≈ 0.4mm — the measured plateau)"). ⇒ round-7's
"needs budget >6M" was INCOMPLETE: the floor is CONSTRAINT-PITCH + DEDUPE, not budget.

**MEASURED (pre-registered kill-criteria; probe `_topologyLiteral0.test.ts`, PF_TIERC_LITERAL0=1, per-pass ndjson):**
1. **H1 EXTENDED (MAXPASS 120): REFUTED.** Re-ran p1 config BIT-IDENTICAL to round-7 (verified pass 1/5/9); the
   asymptote is flat at ~1150 outliers / worst 0.469 / proj ~6.76M. Extended-run-alone never reaches 0.
2. **2a hMinMm 0.05 (finer flank seed, mc=0.15 keeps needle killed): WASH** — same ~1150 plateau (pass 8: 1148,
   worst 0.734) at ~6.72M. Residual NOT seed-density-limited.
3. **2b maxConstraintMm 0.05 (denser rib constraint, the code-PREDICTED lever): REGRESSES → DROPPED.** The denser
   chains re-form the V11h 1.0583 needle (picket chord 0.09 too coarse at the denser pitch): worst 0.469→1.0583,
   outliers ~3-4k, proj 7.19M @pass 7, no convergence. Fidelity-regression kill clause fired.
4. **2c dedupeCellMm 0.001 (4× finer refine lattice — the ONE floor 2a/2b don't touch): NO CONVERGENCE.** Confirmed
   the freeze mechanism (finer lattice accepts inserts baseline rejected — pass 7 dTris 10154 vs 6711) BUT outliers
   OSCILLATE 1200→1352→1569 (rising) at HIGHER proj (7.02→7.16M), worst BOUNCING UP to 0.903. Subdividing a
   near-vertical rib-flank facet in (u,t) below 0.004mm produces NEW small facets that are themselves outliers —
   the 3D chord-sag is intrinsic to the near-vertical relief, not the facet's (u,t) size.

**MECHANISTIC FINDING:** the plateau IS a dedupe-floor freeze, but UNFREEZING it does not clear the residual ⇒ the
~1150 residual is a GENUINE near-vertical rib-flank chord floor. No density/seed/constraint/lattice lever reduces its
perpendicular-3D chord-sag below tol within ≤10M. This CONFIRMS + SHARPENS the round-7 "genuine domain cost" verdict
with direct escalation-lever evidence.

**VERDICT:** literal whole-mesh 0 for this gate is NOT achievable even under the raised 8-10M budget. Best-measured
frontier UNCHANGED from round-7: **guardMax 0.469 / guardP99 0.00953 (<tol) / ~1150 outliers / projFullPot ~6.76M**
(99th-percentile-CAD). Mechanism space now EXHAUSTED end-to-end: RED iso+aniso+M-square (V11k/m/n), seed
adaptive+rib-aware+hMin (V11h/this), topology needle-forbid (V11p), refine-lattice dedupe (this). GeoStar patch +
rebaseline20 NOT launched (gate not converged, per acceptance).

**BANKED:** `dedupeCellMm` override on `RefineOptions` (flag-gated, default undefined ⇒ 0.004 = BYTE-IDENTICAL off;
threaded into both refine-loop keyOf; fast tierC guard suite GREEN incl flagOff.byteIdentical + dirtyCache
byte-identical trajectory). Kept as an instrument for any future gate where the dedupe floor (not near-vertical
relief) is the true blocker.

**LEDGER:** registry E-2026-07-08-TIERC-LITERAL0; probe `_topologyLiteral0.test.ts` (PF_TIERC_LITERAL0, PF_L0_DEDUPE
/PF_L0_HMIN/PF_L0_MAXCONSTRAINT/PF_L0_MAXPASS, resumable per-pass ndjson). Data:
research/exchange/_tierc_literal0/l0_*_pass.ndjson (gitignored — numbers inlined). Commits: pre-reg b832d69,
dedupeCellMm instrument be8f51b, ledger [this].

---

## V11v — TIER-C FLANK-BAND (ROUND 9, E-2026-07-08-TIERC-FLANKBAND) — the never-tried CLIFF-CLASS mechanism family on Gothic: embed the rib-flank TOE contours as DOUBLED fine-picket constraints (the PROVEN Gyroid doubled-contour close) so near-vertical flanks are FRAMED strips — PRE-REGISTRATION + IN-PROGRESS (2026-07-08)

ROUND 9, follow-up to V11s / E-2026-07-08-TIERC-LITERAL0. §V11s EXHAUSTED subdivision/seed/constraint-pitch/dedupe-
lattice — all plateau at ~1150 outliers / worst 0.469 / proj ~6.76M / guardP99 0.00953 (<tol), and the §V11s
MECHANISTIC FINDING is that dedupe-UNFREEZE makes the residual WORSE (children are outliers) ⇒ a GENUINE near-vertical
rib-flank chord floor. This is the SAME signature as the Gyroid channel wall (§V11o/q) and DragonScales riser (§V11l):
a steep relief wall FOUGHT WITH SUBDIVISION instead of EMBEDDED.

**THE HYPOTHESIS.** The Tier-C protected complex embeds rib CRESTS (the locked ridge-maxima chains) + needle pickets
but NOT the flank-band TOE contours (where the steep flank meets the smooth panel). A facet straddling crest→flank→panel
has irreducible chord-sag no matter how small its (u,t) footprint. THE MECHANISM (the Gyroid doubled-contour, applied to
Gothic): extract the flank TOE contours analytically as (u,t) polylines — level sets of the relief-amplitude-fraction
field af(u,t)=(r−r̄_panel)/(r_crest−r̄_panel) at the toe amplitude — and embed them as DOUBLED fine-picket LOCKED
constraints (crest = the existing locked chains = the band's upper edge; add the toe pair flanking each rib) so each
steep flank is a FRAMED strip and facets end AT its boundaries.

**MISSION (kill-criteria in the registry row, committed BEFORE measuring):** (1) LOCALIZE the §V11s floor population's
(u,t)+|∇r|+relief-amplitude — STRADDLE (toe) confirms; MID-PANEL kills; MID-FLANK ⇒ contour-ladder rails. (2) EXTRACT
the toe level-sets, validate placement sub-0.01. (3) EMBED via buildProtectedComplex (raw mm soup pre-planarizeMM,
fine picket 0.08-0.15, recovery ≥99 / crossings 0). (4) GATE at the §V11s best config + flank-band; ACCEPTANCE = literal
whole-mesh 0 + watertight non-vacuous + capped false + projFullPot ≤10M (prefer ≤8M).

**BUILT (mechanism, flag-gated default-OFF, byte-identical off — commit c5d679e):** `flankBand.ts` (toe-contour
extraction: marching-squares on af − c, root-polish, decimate; mirrors `_gyroidContourLib`, on the numerically-sampled
Gothic field, style-agnostic) + `morseComplex.ts` generalized the constant-u `PicketSpec` to arbitrary (u,t)
`BandContour` polylines (locked constraint edges injected into the raw mm soup BEFORE planarizeMM — same planarity-safe
machinery). Fast guards GREEN: `bandContours` OFF byte-identical + ON planar (residualCrossings 0, recovery ≥99, adds
locked edges); flagOff.byteIdentical + morseComplex both pass. Probe `_flankBand.test.ts` (PF_FLANKBAND=1,
PF_FB=localize|localscore|extract|embed|gate) — split so a build-persist survives a scoring kill (resilience).

**STEP 1 LOCALIZE — STRADDLE confirmed (MID-PANEL kill does NOT fire).** The §V11s p1 plateau mesh reproduced
BIT-IDENTICAL (pass 16-18 outliers 1151-1153 / worst FROZEN 0.4689 = the exact §V11s plateau). Scored EVERY facet +
dumped each outlier's (u,t)+|∇r|+amplitude-fraction af=(r−r̄_panel)/(r_crest−r̄_panel)+crest-distance. Of 1158 outliers:
dev-weighted af mass at **0.20-0.30**, 78% below af 0.45, gradRatio **2.70× global** (the steep shoulder), only **3%
flat-panel** ⇒ the floor STRADDLES the rib TOE / lower flank (off-crest, off-panel), NOT mid-panel. z_ampfrac.png shows
warm (low-af) columns flanking the ribs. RESILIENCE: env killed the mp25 build + a leftover worker tree interleaved the
shared ndjson with the mp18 restart (68 node procs incl the concurrent tangled agents); reaped BOTH flankband trees by
PID-tree taskkill (tangled runs untouched), split build-persist from scoring so a scoring-kill never loses the build.

**STEP 2 EXTRACT — placement machine-precision.** Doubled toe band af=0.12/0.40 (marching-squares on af−c + root-polish
+ `filterByDisp3D` drops ~0.1% ridge-saddle strays): dispP90 **0**, dispMax 0/2e-5, sub-0.01 TRUE.

**STEP 3 EMBED — recovery 100.00%, residualCrossings 0.** The arbitrary (u,t) `BandContour` locked chains planarized
flawlessly (the generalized picket machinery). STEP-3 KILL does not fire.

**STEP 4 GATE — frontier LOWERED 4×/8×; ladder-chase measured to a density floor (FRONTIER, not literal-0):**

| config | worst mm | outliers (min) | p99 | proj | nonMan |
|---|---|---|---|---|---|
| §V11s baseline | 0.4689 | ~1150 | 0.00953 | 6.76M | 0 |
| DOUBLED af{0.12,0.40} | 0.3955 | 815 (min **319**) | 0.00965 | 4.81M | 4 |
| LADDER-4 af{0.03,0.08,0.18,0.40} | **0.1170** | 147 | 0.00907 | 5.02M | 2 |
| LADDER-5 (+0.28) | 0.1170 | 124 | 0.00898 | 5.93M | 2 |
| LADDER-4 NO-PICKET | 0.1170 | 138 | 0.00907 | 4.94M | 2 |

The DOUBLED band bottomed outliers at **319** (3.6× below baseline) but the residual DESCENDED to the un-framed
panel-to-toe strip (worst-200 median af **0.011**, 82% below af 0.12). LADDER-4 (rails across the whole lower flank) cut
worst **4×** to 0.117 + outliers **~8×** to 147, at LOWER budget. But the 5th rail bought 0 on worst (pinned 0.117) +
more tris ⇒ the residual concentrated in the widest inter-rail gap [0.18,0.40] (101/147) = a density-vs-outlier tradeoff.
Removing PICKETS changed worst by 0 (rails forbid the needle themselves ⇒ pickets redundant), PROVING the pinned 0.117
(one facet, u≈0.117/t≈0.525/af 0.085) is a GENUINE near-vertical rib-flank chord floor, NOT a picket×rail artifact.
§V11s-2c confirmed here: finer dedupe (0.001)+framing RUNS AWAY (1894, rising) — dropped.

**VERDICT: FRONTIER (CLOSED-with-floor; the FIRST mechanism to move the §V11s plateau — 4× on worst, 8× on outliers, at
LOWER budget — but NOT literal-0 at ≤10M).** Best flank-band frontier: **guardMax 0.117 / ~124-147 outliers / p99 ~0.009
(<tol) / proj ~5.0M** vs §V11s 0.469 / ~1150 / 6.76M. The residual is the irreducible near-vertical chord-sag on the
steepest flank sections — CORROBORATED by the concurrent WEAVE arm (§V11t) hitting the IDENTICAL class on BasketWeave with
the SAME Gyroid doubled-contour mechanism. The ladder-chase is the general lesson: framing pushes the residual to the
widest un-framed strip; each rail cuts worst ~4× to a rail-density floor. GeoStar patch + rebaseline20 NOT launched
(gate not literal-0, per acceptance). RECOMMENDATION: accept the ~5.0M/0.117/p99<tol frontier OR raise budget ≫10M for
literal-0 — the flank-band mechanism is the correct close path for near-vertical relief; literal-0 is a fidelity-vs-budget
frontier, not a defect any embedding/subdivision lever removes.

**LEDGER:** registry E-2026-07-08-TIERC-FLANKBAND; lib `flankBand.ts` (buildAmplitudeField/marchAmpFrac/refineAndFilterFlank
/filterByDisp3D/extractToeBand/extractLadder) + `morseComplex.ts` (BandContour generalization) + probe `_flankBand.test.ts`
(PF_FLANKBAND=1, PF_FB=localize|localscore|extract|ladder|gate; PF_FB_LEVELS/DEDUPE/NOPICKET/TAG) + `vitest.flankband.config.ts`.
Data: `research/exchange/_tierc_flankband/*` (gitignored — numbers inlined; renders z_ampfrac.png / z_final_dev.png).
Commits: pre-reg 3ab3e43, mechanism c5d679e, STEP1-2 c6dfd23, gate-v1+disp-filter de41df8, ladder c19faa2, [this].

## V11y — TIER-C TAPERED-RAIL (E-2026-07-08-TIERC-TAPERRAIL) — the LAST unrun Gothic flank-band lever: rails spaced by equal cumulative STEEPNESS (|∇r|) instead of fixed af. FLOOR-CONFIRMED + REGRESSES — the Gothic mechanism table is now COMPLETE (2026-07-08)

Small scoped completeness probe (one mechanism variant, ≤2 gate runs) following §V11v. ESTABLISHED (§V11v, not
re-derived): the UNIFORM LADDER-4 af{0.03,0.08,0.18,0.40} = best Gothic config (worst **0.117**, ~138-147 outliers,
**~5.0M**, p99 0.00907); LADDER-5 adds cost without cutting the worst ⇒ the 0.117 is rail-count-INDEPENDENT under
UNIFORM spacing.

**HYPOTHESIS (pre-registered).** Rail spacing tapered by local steepness — finer rails exactly where the flank is
steepest (high |∇r|), coarser where it eases — concentrates the framing where the 0.117-class facets live and drops the
worst BELOW 0.117 at matched budget. The §V11v agent PREDICTED this floors too (under taper the widest un-framed strip
is where the flank is GENTLEST, so the residual descends there). ACCEPTANCE for a genuine win = worst meaningfully below
0.117 at matched budget; floor-confirmation = equally valuable (completes the mechanism table).

**MECHANISM (built, flag-gated default-OFF, byte-identical off — commit 6bbb580).** `taperedLevels(sampler, domain,
nRails, afLo, afHi)` in `flankBand.ts`: place `nRails` af-levels at equal cumulative-steepness intervals — S(af) =
∫|∇r|(af')·daf' (radius-gradient magnitude in mm PER mm of (u,t) footprint, averaged over the arch mid-band t-slices),
rails at af_k = S⁻¹(k/(nRails+1)·S_total). NB — the integrand is weighted against **daf** not the mm footprint: af is
DEFINED as (r−panel)/(crest−panel) so r is linear in af and ∫|dr| would be trivially uniform; ∫|∇r|·daf crowds rails
where the radius-per-parameter gradient is high (the steep shoulder = small parameter footprint per daf = high chord-sag
for a fixed-(u,t)-size facet). TDD unit guard `taperRail.test.ts` (analytic sqrt-skew flank ⇒ rails crowd at low af
[0.035,0.066,0.125,0.237]; flat flank ⇒ uniform fallback; 3/3). Fast tierC suite GREEN (flagOff.byteIdentical +
morseComplex + anisoSplit + dirtyCache + taperRail = 9/9). `flankBand.ts` is imported ONLY by tierC tests ⇒ production
byte-identical off by construction.

**TAPER EXTRACTION (the decisive intermediate finding).** On the REAL Gothic flank, taperedLevels(nRails=4) →
**af[0.186, 0.259, 0.323, 0.380]** — ALL four rails CROWDED at the mid-to-upper flank; NOT ONE rail below af 0.186.
Placement sub-0.01 TRUE (dispP90 0, dispMax ≤0.0096). Mechanistic why: the Gothic flank's |∇r| is HIGHEST at the
mid-flank (af 0.19-0.38) and gentlest at the low toe — so the steepness-taper starves the low toe of rails, exactly
where LADDER-4's two low rails {0.03,0.08} lived.

**GATE (matched budget, §V11s p1 config + tapered-4 band, ×42 full-pot):**

| config | worst mm | outliers | p99 | proj | nonMan (cracked ctrl) | recovery/crossings |
|---|---|---|---|---|---|---|
| LADDER-4 (uniform, §V11v best) | **0.1170** | 138-147 | 0.00907 | **5.0M** | 2 (5) | 100 / 0 |
| TAPER-4 (steepness) | **0.39553** | 184 | 0.00870 | 7.19M | 2 (5) | 100 / 0 |

**The tapered variant REGRESSES on every axis** — worst 0.396 vs 0.117 (**3.4× WORSE**), tris 7.19M vs 5.0M, outliers
184 vs ~140. The worst-facet ampFrac histogram is CONCLUSIVE: **178 of 184 outliers sit at af[0,0.15]** (85+69+24) —
the low toe the taper left completely unframed. The frozen worst 0.39553 equals §V11v's DOUBLED-band worst (0.3955):
with no rails below af 0.186 the residual reverts to the un-framed low-flank/toe strip. The §V11v prediction is
CONFIRMED EXACTLY — the gentlest strip is the low toe, and the residual descended precisely there.

**VERDICT: FLOOR-CONFIRMED (and the taper REGRESSES; KILL of the win-hypothesis).** worst meaningfully-below-0.117 did
NOT fire; uniform LADDER-4 remains the best Gothic config. The mechanistic reason is now MEASURED: the chord-sag floor
lives at the LOW toe (af<0.15, panel-meets-flank), where |∇r| is LOW — so a steepness-taper places rails in exactly the
WRONG band. Uniform low rails {0.03,0.08} are load-bearing; the taper removes them. **The Gothic flank-band mechanism
table is now COMPLETE:** DOUBLED (0.396/319-min) → uniform LADDER-4 (0.117, the plateau) → LADDER-5 (0.117, +cost, no
gain) → NO-PICKET (0.117, pickets redundant) → TAPER-4 (0.396, regresses). No rail-placement family beats uniform
LADDER-4's worst 0.117; the residual is the irreducible near-vertical rib-flank chord floor > the ≤10M cap, as §V11s/v
concluded. Best-measured Gothic frontier stands at **LADDER-4: worst 0.117 / ~140 outliers / p99 0.00907 (<tol) / ~5.0M**.

**LEDGER:** registry E-2026-07-08-TIERC-TAPERRAIL; `flankBand.ts` +`taperedLevels`, `taperRail.test.ts`, `taper` mode in
`_flankBand.test.ts` (PF_FB=taper, PF_FB_NRAILS/AFLO/AFHI, PF_FB_OUT). Data: `research/exchange/_tierc_taperrail/*`
(gitignored — numbers inlined). Commits: mechanism+TDD 6bbb580, verdict [this].

## V11z — CELTICKNOT CLOSE: the last un-attempted tangled/weave arm — EXCLUDE-CLASS CONFIRMED (strand OVER/UNDER OCCLUSION FOLD); the doubled-picket mechanism confines the residual on-wall (off-wall 0%) + watertight, but literal Newton-0 is UNREACHABLE at ANY budget (the priced picket-density curve has POSITIVE slope 73,963→83,753) (2026-07-08)

E-2026-07-08-CK-CLOSE. CelticKnot was §V11r-4 RE-CLASSIFIED CLIFF-CLASS (Newton NON-monotone UP 58,403→70,143, worstTrue
pinned ~0.295, bimodal 37% steep crossing tail). Sibling of §V11t-1 BasketWeave. Mission (USER MANDATE): ≤10M projection,
goal literal whole-mesh Newton-0; if BW-class-expensive, a MEASURED frontier with a priced budget-to-0 estimate.

**LOCALIZE (KILL-1 NOT triggered — loci closed-form + on-cliff).** Reproduced the §V11r-4 b0.008 anchor EXACTLY (Newton
70,820 ≈ 70,143, worst 0.30). The CK relief field (from `rOuterCelticKnot`, defaults ckScale=3/ckStrands=3/ckWidth=0.15/
ckTwist=0) has THREE C0 families, resolved by closed-form derivation + step-jump validation (`lociOnCliff`): (A) COLUMN
boundaries u=j/3 are NOT cliffs (maxStepJump 0, jumpFrac 0 — a strand phase-shuffle, DROPPED); (B) strand BORDERS
localU=x_i(t)±strandW ARE cliffs at 99.7% of samples (maxStepJump 1.14) — the background transition, the picket workhorse;
(C) strand CENTERLINES x_i(t)=0.4·sin(3π·t + j·π·0.333 + (2π/3)·i) step ONLY at crossings (jumpFrac 0.022, maxStepJump 0.76) —
ISOLATED POINT-folds (the over/under occlusion switch), NOT a linear wall. The derived loci CONTAIN 95.4% of the true
outliers (offWallFrac 0.046). RENDER `z_outliers.png`: three braided columns, blue (0.30mm) outliers concentrate at the
strand-crossing Xs.

**BUILD (planarize 0-residual via per-column tiling; KILL-2 FIRED — recovery ~83%, density-invariant).** The braid loci cross
densely ⇒ a single `planarizeMM` OVERFLOWS JS's ~16.7M pair-Set at 119k pickets (the §V11t-1 banked ceiling). FIX
(mesh-equivalent, no shared-instrument edit): PER-COLUMN tiled planarize (disjoint u-bands ⇒ no cross-column crossings) →
residual 0. The 8-offset fine ladder (162k) overflows even per-column ⇒ un-runnable (instrument ceiling). Recovery
82.75%/83.28% DENSITY-INVARIANT, all `subdivFailNonCollinear` — the OBLIQUE braid crossings defeat the kernel's flip
edge-recovery (unlike BasketWeave's clean ORTHOGONAL grid ≥86.8%). Watertight NON-VACUOUS (clean 0, cracked-control 3).

**VERDICT — 2-POINT PICKET-DENSITY STUDY (the priced deliverable, honest Newton):**

| ladder | pickets | tris | proj | recovery | offWall% | Newton scaledTrue | worstTrue | p99 |
|---|---|---|---|---|---|---|---|---|
| §V11r-4 (no embed) | 0 | 1.30M | 2.61M | — | (95.4% loci) | 70,143 | 0.294 | 0.290 |
| coarse3 (54k) | 54k | 3.89M | 7.78M | 83.28% | **0** | **73,963** | 0.304 | 0.295 |
| default6 (119k) | 119k | 4.80M | 9.60M | 82.75% | **0** | **83,753** | 0.299 | 0.296 |

MECHANISM VALIDATED — off-wall 0% at BOTH densities (RENDER `z_doubled3M.png`: residual identical to pre-embed, nothing
between braids; KILL-3 NOT triggered). BUT doubling the picket ladder (54k→119k) INCREASED the Newton count 73,963→83,753,
worst PINNED ~0.30, p99 PINNED ~0.295 — a POSITIVE density slope ⇒ **budget-to-0 is NEGATIVE (unreachable at ANY budget).**
Mechanistic why: the over/under occlusion is a POINT-fold at each braid crossing (centerline jumpFrac 0.022 = isolated
points) that no (u,t)-line embedding separates — a doubled contour frames a LINEAR cliff (the borders, well-confined) but
cannot separate over-strand from under-strand where the two strands' relief physically interleaves. This is WORSE than
BasketWeave (whose finer picket at least DECREASED 0.66→0.59) and is the settled weave/braid EXCLUDE ruling DEMONSTRATED
(conforming traded slivers minAngle 0 / %<20° 8.8 for a WORSE true-3D count).

**VERDICT: FRONTIER / EXCLUDE-CLASS CONFIRMED.** CelticKnot = strand-OCCLUSION-FOLD cliff; literal Newton-0 UNREACHABLE by
doubled-picket embedding at ANY budget (positive density slope), off-crossing = §V11r-4 density-invariant floor (worst pinned
0.30). Honest export figure = the §V11i geometrically-faithful floor ~62k @ worst 0.30 true-3D on the over/under crossing
walls (radial≈true ⇒ a designed occlusion feature, not a ruler artifact). This RESOLVES the last weave/braid arm: all three
(BasketWeave FRONTIER-above-10M, CelticTriquetra CREASE-EXCLUDE, CelticKnot EXCLUDE-occlusion-fold) are now MEASURED-EXCLUDE,
matching the settled map. Campaign arithmetic UNCHANGED (CK stays in the tangled/weave EXCLUDE bucket, now with a measured
priced verdict instead of an inference). Do NOT invest further picket/density budget — the study PROVES divergence.

**LEDGER:** registry E-2026-07-08-CK-CLOSE; probe `research/bridge/_ck_close.test.ts` (PF_CK=1, PF_CKSTAGE=localize|extract|
build|verdict|gate, PF_CKLADDER override, resumable) + lib `research/bridge/_ckFieldLib.ts` + `vitest.ck_close.config.ts`.
Data `research/exchange/_ck_close/CelticKnot/*` (gitignored — numbers inlined; renders z_outliers.png/z_doubled3M.png).
Commits: pre-reg 417a336, tiled-planarize 88054ac, ladder-override ea8f697, gate+verdict [this]. DEV-ONLY; no src/ edit.

## V11ab — CRYSTALLINE-LITERAL0 CONTINUATION (E-2026-07-09-CRYSTALLINE-LITERAL0) — extend the §V11u-2 Crystalline monotone-halving LOCAL-injection run from 5 passes to 12; the residual keeps halving (1,891→49) but the worstTrue PINS at ~0.076-0.082 and the per-pass decay DECELERATES (50%→25.8%) — a HARD TAIL is emerging, NOT clean convergence to 0 (RECOVERED run, 2026-07-09)

CONTINUATION of §V11u-2. ESTABLISHED (not re-derived): §V11u-2 drove Crystalline's LOCAL injected-Steiner residual 35,502→1,891
over 5 passes (strictly monotone ~halving), watertight, proj 7.46M ≤10M with headroom, and RECOMMENDED raising maxPasses to
~10 (the trajectory + <8M projection + moving worst-facet (u,t) predicted literal-0 was a BUDGET-of-passes limit, not a
mechanism wall). This arm CONTINUED the EXACT same config (probe `maxPasses` 5→12, RESUME carries passes 0-5, RESUME-GAP
RECONSTRUCTION deterministically rebuilds the missing inj_5.json — the old-cap run never persisted it). The run COMPLETED
CLEANLY (vitest exit 0, 13,913s wall ≈ 3.9h for passes 6-12); the ledger below is RECOVERED from the on-disk ndjson (the
original agent died on an API 529 before writing it).

**RESULT — passes 6→12 (Newton 500/500 stratified verdict, the CARRIED downsize; NOT the exact literal basis):**

| pass | injected | tris | projFullPot | radialOut(max) | NEWTON(strat) | decay | worstTrue @ (u,t) | nonMan | zeroArea |
|---|---|---|---|---|---|---|---|---|---|
| local5 (anchor) | 579,052 | 3,729,149 | 7,458,298 | 4,585 (0.194) | 1,891 | — | 0.08698 @ (0.986,0.409) | 0 | 0 |
| local6 | 599,873 | 3,756,066 | 7,512,132 | 2,555 (0.194) | 946 | 50.0% | 0.07995 @ (0.981,0.563) | 0 | 0 |
| local7 | 611,197 | 3,767,378 | 7,534,756 | 1,516 (0.182) | 493 | 47.9% | 0.07668 @ (0.893,0.724) | 0 | 0 |
| local8 | 617,958 | 3,772,674 | 7,545,348 | 981 (0.182) | 259 | 47.5% | 0.07668 @ (0.893,0.724) | 0 | 0 |
| local9 | 622,388 | 3,774,826 | 7,549,652 | 784 (0.189) | 159 | 38.6% | 0.08221 @ (0.217,0.996) | 0 | 0 |
| local10 | 625,945 | 3,775,858 | 7,551,716 | 602 (0.189) | 100 | 37.1% | 0.08221 @ (0.217,0.996) | 0 | 0 |
| local11 | 628,724 | 3,776,972 | 7,553,944 | 552 (0.181) | 66 | 34.0% | 0.07590 @ (0.487,0.384) | 0 | 0 |
| local12 | 631,306 | 3,777,328 | 7,554,656 | 519 (0.181) | **49** | 25.8% | 0.07590 @ (0.487,0.384) | 0 | 0 |

**FULL TRAJECTORY (base + 12 passes): 35502 → 16436 → 9724 → 5983 → 3271 → 1891 → 946 → 493 → 259 → 159 → 100 → 66 → 49.**
Still STRICTLY MONOTONE, watertight (nonMan 0) + zeroArea 0 every pass, projFullPot 7.55M ≤10M (hitBudget=false throughout —
a genuine density point). Tris grew only +48k over passes 6-12 (631,306 total injected vs 579,052 at pass 5 — the refinement
stayed genuinely LOCAL; the flat bulk is untouched).

**TWO NEW SIGNALS (not present in the §V11u-2 5-pass window):** (1) the per-pass DECAY DECELERATES monotonically:
50.0% → 47.9% → 47.5% → 38.6% → 37.1% → 34.0% → 25.8%. It never crossed the 15% asymptote-kill (lowStreak stayed 0), so
the run did not trip the kill — but the deceleration is real and the last pass only removed 17 facets. (2) worstTrue is
PINNED in [0.0759, 0.0822] across passes 7-12 while the count keeps falling. The worst FACET moves (worstUt changed each
pass: (0.893,0.724)→(0.217,0.996)→(0.487,0.384)) — so injection IS clearing the current-worst spot each pass — but the
MAGNITUDE of the next-worst is pinned. This is the signature of a HARD TAIL: a population of ~tens of near-vertical spots
all at the same ~0.076-0.082 depth that injection clears one-cluster-at-a-time but does not shrink in magnitude. Contrast
§V11u-2's optimistic read (worst was still dropping 0.106→0.087 at pass 5); the extended window shows the drop STALLING.

**VERDICT (§V11ab, interim): FRONTIER-INCOMPLETE — 49 Newton (stratified) @ 7.55M, watertight, monotone but DECELERATING
with a PINNED worst ~0.076.** The §V11u-2 "~10 passes → literal-0" extrapolation is now in DOUBT: 12 passes reached 49, not
0, and the decay is decelerating toward (not yet at) the asymptote. The pinned-worst signal suggests the tail is a
smoothstep-KNEE population (as Gyroid §V11w/aa) rather than pure density — the §V11ad continuation tests exactly this
(continue 13→20 with the asymptote-kill armed; if a hard tail survives, classify the survivors' (u,t)+|∇r| and apply the
§V11aa PINNED-KNEE recipe that closed Gyroid's identical tail with 35 points).

**LEDGER:** registry E-2026-07-09-CRYSTALLINE-LITERAL0; probe `research/bridge/_pf_tangledTargeted.test.ts` (PF_TT=Crystalline,
`maxPasses` 5→12 + RESUME-GAP RECONSTRUCTION + ASYMPTOTE-kill machinery, committed d9b9819 BEFORE the run). Data
`research/exchange/_tangled_targeted/Crystalline/{passes,final}.ndjson + inj_0..11.json + run_v11ab.log` (gitignored —
numbers inlined). Recovery commit d361c2b; the probe was already committed at d9b9819. DEV-ONLY; no src/ edit.

## V11ad — CRYSTALLINE-LITERAL0 FINISH (E-2026-07-09-CRYSTALLINE-LITERAL0, cont.) — continue 13→20 with the EXACT-basis verdict; the residual FROZE at an EXACT 49 (0% decay ×3 ⇒ ASYMPTOTE kill) and the 49 survivors ALL sit ON the triangle-wave C0 VALLEY-KINK loci (11/12 facet edges) — a CLIFF-CLASS floor, NOT a smoothstep knee; the pinned-injection recipe is REFUTED for this tail (2026-07-09)

CONTINUATION of §V11ab. The §V11ab 12-pass run reached 49 (stratified 500/500) with decelerating decay + pinned worst
~0.076 — a hard-tail signature. This arm continued 13→20 with two pre-registered changes (committed 6364d13 BEFORE running):
(1) `maxPasses` 12→20 (RESUME skipped 0-12, RESUME-GAP deterministically reconstructed inj_12 = 633,769 pts / radialFlagged
519, matching the pass-12 record); (2) verdict `topWorst`/`nStrat` 500→2000 so EVERY radial-flagged facet is Newton-scored
EXACTLY (`newtonExact=true`) — the CLOSE basis the §V11ab stratified verdict lacked.

**RESULT — passes 13→15 (EXACT verdict) then ASYMPTOTE kill:**

| pass | injected | tris | projFullPot | radialOut(max) | NEWTON(**EXACT**) | decay | worstTrue @ (u,t) | nonMan | zeroArea |
|---|---|---|---|---|---|---|---|---|---|
| local12 (anchor, strat) | 631,306 | 3,777,328 | 7,554,656 | 519 (0.181) | 49 (strat) | — | 0.0759 @ (0.487,0.384) | 0 | 0 |
| local13 | 633,769 | 3,777,308 | 7,554,616 | 508 (0.181) | **49 (exact)** | 0.0% | 0.0759 @ (0.487,0.384) | 0 | 0 |
| local14 | 636,169 | 3,777,308 | 7,554,616 | 508 (0.181) | **49 (exact)** | 0.0% | 0.0759 @ (0.487,0.384) | 0 | 0 |
| local15 | 638,569 | 3,777,308 | 7,554,616 | 508 (0.181) | **49 (exact)** | 0.0% | 0.0759 @ (0.487,0.384) | 0 | 0 |

**FULL TRAJECTORY (base+15): 35502→16436→9724→5983→3271→1891→946→493→259→159→100→66→49→49→49→49.** The EXACT verdict
CONFIRMS the §V11ab stratified 49 (no correction). The count then FROZE: passes 13/14/15 all EXACTLY 49, worst PINNED
0.0759 @ the SAME (u,t), radialOut frozen 508, tris static — injection (adding ~2,400 pinned pts/pass around the worst-sag
points) moved NOTHING. Decay 0%/pass ×3 ⇒ the pre-registered ASYMPTOTE kill FIRED at pass 15 (lowStreak=3). verdict=ASYMPTOTE,
watertight (nonMan 0) + zeroArea 0 throughout, projFullPot 7.55M ≤10M hitBudget=false. Resilience: the env killed the
foreground wrapper mid-pass-15 build TWICE; the detached vitest child survived both (per the mandate — proven a 3rd time)
and per-pass checkpoints carried 13→15 to the kill with zero recompute.

**TAIL CLASSIFICATION (§V11ad classify stage, PF_TT_CLASSIFY=1 — EXACT Newton on all 508 flagged, dumped 49 survivors'
(u,t)+|∇r|+crestFrac to survivors_14.ndjson): ALL 49 sit ON the C0 VALLEY-KINK loci — a CLIFF-CLASS floor, NOT a
smoothstep knee.** The Crystalline field (styles.ts rOuterCrystalline, defaults crFacetCount 12 / crEdgeSharpness 2.5 /
crHeightPhase 0.4) is `modulation = 1 − facetDepth·pow(triangleWave, edgeSharpness) − …`, triangleWave = |facetPhase/π − 1|
with a `%TAU` WRAP — a C0/C1 DERIVATIVE DISCONTINUITY at the facet-edge (valley) line, NOT a smooth Gyroid S-curve. The dump:
crestFrac max **0.00048** (all 49 within 0.05% of a valley locus, median 0.00015), **nearest=VALLEY for all 49** (zero on the
smooth crest), spread across **11 of the 12** facet-edge lines and the full height (t 0.082→0.946). dev range 0.01036→0.07590:
**24/49 tol-boundary [0.010,0.015), 8 mid, 17 MATERIAL ≥0.03 (up to 0.0759)** — a GENUINE population above tol, distinct
from ruler noise (the 17 material ones are 3-7.6× tol). This is the SAME mechanism as Voronoi §V11u-3 (children-are-outliers
on the C0 cell-wall) and CelticKnot §V11z — a facet straddling a C0 kink LINE still straddles after subdivision, because the
chord-sag is intrinsic to the derivative discontinuity, not the facet's (u,t) size. The pinned-injection recipe pins a vertex
at the worst-SAG interior POINT, which cannot remove a kink LINE ⇒ it stalls (49→49→49, proven, not inferred).

**KILL-CRITERIA STATUS (§V11ad):** CLOSE ACCEPTANCE (literal-0 exact) — did NOT fire (floor 49, not 0). ASYMPTOTE (decay
<15%×3) — FIRED at pass 15 (49→49→49, 0%). NON-MONOTONE — did NOT fire (never grew; a frozen exact count is the asymptote,
not a regression). proj>10M — did NOT fire (7.55M). KNEE-RECIPE — the pre-registered "survivors ON the C0 locus ⇒ needs an
EDGE not points" fork FIRED: all 49 are ON the valley kink, and the injection (which pins POINTS at worst-sag) already
stalled ⇒ the §V11aa pinned-POINT recipe is REFUTED for this tail; closing it would need the CLIFF-class EMBED (doubled-picket
along the facet-edge line), a DIFFERENT mechanism out of this injection arm's scope.

**VERDICT (§V11ad): FRONTIER / FLOOR — Crystalline LITERAL Newton-0 is NOT reached by LOCAL pinned-injection; the floor is an
EXACT 49 outliers @ 7.55M tris, all on the C0 triangle-wave valley-kink loci (11/12 facet edges), watertight, worst 0.0759.**
The recipe drove 35,502→49 (a 725× reduction, monotone through pass 12) but the last population is a CLIFF-class C0 residual
that injection CANNOT clear (asymptote-frozen). Whole-mesh: the flat bulk + every non-kink facet is ≤tol; the residual is the
sharp faceted design's own edges. This RECLASSIFIES Crystalline's TAIL as CLIFF-class (like Voronoi/CelticKnot) even though
its BULK is density-class (§V11u-2) — a MIXED style: density-responsive down to the C0 edges, then an irreducible-to-injection
kink floor. RECOMMENDATION: for a literal-0 close, embed the 12 facet-edge (valley) loci as DOUBLED fine-picket LOCKED
constraints (the Gyroid §V11o/q / Voronoi-embed mechanism) — the loci are closed-form (facetPhase = 0 mod TAU under the
height-phase shear); OR accept the 49-facet CLIFF floor as the designed-feature-edge residual (matching the settled
EXCLUDE/EMBED map: sharp faceted edges are near-vertical cliffs, radial≈true). Do NOT invest more injection passes — proven
asymptote-frozen.

**LEDGER:** registry E-2026-07-09-CRYSTALLINE-LITERAL0 (§V11ad rows); probe `research/bridge/_pf_tangledTargeted.test.ts`
(PF_TT=Crystalline `maxPasses` 20 + topWorst 2000; PF_TT_CLASSIFY=1 tail-dump stage) + `vitest.tangled_targeted.config.ts`,
pre-registered/committed 6364d13. Data `research/exchange/_tangled_targeted/Crystalline/{passes,final}.ndjson (base+15) +
inj_0..14.json + survivors_14.ndjson (49) + run_v11ad.log + run_classify.log` (gitignored — numbers inlined). Finish
commit [this]. DEV-ONLY; no src/ edit.

## V11ae — CRYSTALLINE-VALLEY-EMBED (E-2026-07-09-CRYSTALLINE-VALLEY-EMBED) — the §V11ad-recommended EDGE embed EXECUTED: the 12 closed-form helical valley-kink loci as LOCKED constraint chains on the inj_14 pins. BOTH single-chain AND doubled-pair REGRESS vs the 49 no-embed control (Newton 49→139/136) — Crystalline is CLOSED-with-49-facet-designed-edge-floor, the LowPoly-class certification (2026-07-09)

FOLLOW-UP to §V11ad, which floored Crystalline at an EXACT 49 injection-irreducible C0 valley-kink outliers and RECOMMENDED the doubled-picket EDGE embed as the only remaining literal-0 lever (injection was proven asymptote-frozen). This arm executes it and applies the mandatory §V11ac Voronoi lesson: **embeddable ≠ improvement** — the embed's Newton count MUST beat the no-embed control on the SAME verdict.

**LOCI (DERIVED CLOSED-FORM + SAMPLER-VALIDATED, the `loci` stage).** The valley kink is the C0 derivative discontinuity of `abs(triangleWave)` at `triangleWave=1 ⇔ facetPhase ≡ 0 (mod TAU)`. With the height-phase shear `facetPhase = (theta + t·0.4·TAU/12)·12 mod TAU` (DEFAULT_CRYSTALLINE crFacetCount=12, crHeightPhase=0.4), the 12 valley chains are **u_k(t) = (k − 0.4·t)/12, k=0..11** (helical, sheared). Placement proof vs the SAMPLER `rA`: `facetPhase(u_k(t),t) = 0` to machine eps; the argmax of the dr/du-JUMP sits at u-offset **0** from the locus; the jump is **728 mm/u** (a genuine C0 corner — the straddle source, NOT the global r-argmin, which the crAsymmetry sin-term perturbs ±4mm without moving the kink). Survivor overlay: all 49 §V11ad survivors lie within **worst |Δu| = 0.000039** of a locus (0.05% of the 1/12 facet period). Loci placement is CORRECT and sampler-anchored sub-0.01.

**CONTROL (apples-to-apples anchor, the `control` stage).** Rebuilt the pass-14 mesh deterministically from inj_14.json (638,569 pins, NO embed), scored Newton EXACT on EVERY radial-flagged facet: **49 outliers @ 7.55M, worst 0.0759 @ (0.487,0.384), nonMan 0, zeroArea 0** — byte-reproduces the §V11ad floor. This is the number the embed must beat.

**BUILD + VERDICT (single-chain FIRST per pre-reg, then doubled; EXACT Newton, every radial-flagged facet):**

| variant | valley verts / edges | recovery% | tris | projFullPot | Newton (**EXACT**) | worstTrue @ (u,t) | radialOut(max) | %<20° | serr p99 / mean | nonMan | zeroArea | off-valley |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **control (no embed)** | — | — | 3,777,308 | 7,554,616 | **49** | 0.0759 @ (0.487,0.384) | 508 (0.181) | — | — | 0 | 0 | 0 |
| single-chain (pitch 0.12) | 15,104 / 15,103 | 94.91 | 3,812,663 | 7,625,326 | **139** ❌ | 0.0826 @ (0.717,0.990) | 304 (0.206) | 11.87 | 0.0032 / 0.00018 | 0 | 0 | **0** |
| doubled-pair (dOff 0.0015) | 30,212 / 30,210 | 99.92 | 5,224,666 | **10,449,332** ❌ | **136** ❌ | **0.221** @ (0.832,0.045) | 918 (0.419) | 11.59 | 0.0104 / 0.0030 | 0 | 0 | **63** |

**MECHANISM (why the EDGE embed REGRESSES a V-groove kink — the diagnosis).** The valley is a symmetric sharp V (a ~720 mm/u derivative corner), NOT a wall band. (a) SINGLE locked chain ON the kink: watertight, serration ~0 (edges DO lie on the kink, mean 0.00018mm), radial flag drops 508→304 — but Newton RISES 49→139, and ALL 139 survivors stay ON the valleys (off-valley 0). A facet whose locked edge is on the V-bottom but whose third vertex is on a flank STILL straddles the V shoulder (irreducible chord-sag over a designed sharp corner) — the locked edge cannot remove it, and forcing the chain changes the local triangulation to produce MORE such flanking straddlers than the free-adaptive base. (b) DOUBLED pair at ±dOff: worst chord TRIPLES 0.076→0.221 because the kink is now BETWEEN the two locked chains (serration rises 0.003→0.010) so the between-picket facet spans the full V bottom; proj BLOWS the 10M budget (10.45M); and the offset pickets introduce **63 NEW off-valley outliers** (the picket lines are themselves off the kink). This is the CelticKnot single-midline / Voronoi §V11ac pattern: for a sharp designed relief feature the free-adaptive base mesher already tessellates the C0 discontinuity BETTER than any pinned-contour embed.

**KILL-CRITERIA STATUS (§V11ae):** CLOSE (literal-0) — did NOT fire (49→139/136, worse). APPLES-TO-APPLES CONTROL — control reproduced 49 EXACTLY; the embed FAILED to beat it. SINGLE-AND-DOUBLED BOTH FAIL after one honest run each ⇒ the pre-registered STOP fired. REGRESSION-vs-control — fired on BOTH variants (Newton grows; doubled adds an off-valley population + busts the budget). RECOVERY ≥90% ✓ (single 94.9%, doubled 99.9% — not a build failure; the embed is CLEAN and STILL regresses, which is the strong REFUTATION). residualCrossings 0 (parallel helices don't cross — planarize confirmed).

**VERDICT (§V11ae): REFUTED — the valley-kink EDGE embed (single OR doubled) makes Crystalline's true-3D WORSE, not better; the §V11ad 49-facet floor is the honest export figure. Crystalline is CLOSED-with-49-facet-DESIGNED-EDGE-FLOOR — the LowPoly-class certification.** The 49 outliers are the sharp faceted design's OWN valley edges (24 tol-boundary [0.010,0.015), 8 mid, 17 material ≥0.03, worst 0.0759), where the radial metric ≈ the true-3D metric (a near-vertical designed cliff, NOT an export defect). ZERO-SERRATION ARGUMENT (achieved on single): the single locked chains DO place mesh edges on the valley kinks to serration p99 0.0032 / mean 0.00018mm — so the export CAN put an edge on the designed feature line; it simply does not help the chord (the sag is the V-shoulder geometry, irreducible). This matches the settled EXCLUDE/EMBED map exactly: sharp faceted / weave / lattice C0 relief is EXCLUDE-class (BasketWeave/CelticKnot/CelticTriquetra/Voronoi/Crystalline) — geometrically faithful, radial overstates only the smooth-field styles. DISTINCT from Gyroid (§V11aa, whose SMOOTH TPMS level-set embedded to literal-0): Gyroid's wall is a smooth ramp a doubled contour can frame; Crystalline's is a sharp non-smooth V-corner the base mesher already handles best. RECOMMENDATION: accept the 49-facet designed-edge floor as the Crystalline export figure (base mesher = §V11ad, watertight, p99 ≤tol on the whole non-kink mesh, 49 designed sharp edges radial≈true). Do NOT invest further embed/injection budget — proven asymptote-frozen (§V11ad) AND embed-regressing (§V11ae, apples-to-apples). Campaign: Crystalline JOINS the MEASURED-EXCLUDE designed-edge family; the DRIVE-ALL-20 tally for this style is CLOSED as certified-with-designed-edge-floor.

**LEDGER:** registry E-2026-07-09-CRYSTALLINE-VALLEY-EMBED; probe `research/bridge/_crystalline_valley_embed.test.ts` (PF_CVE=1, stages loci/control/build/verdict; PF_CVEVARIANT=single|doubled) + `vitest.crystalline_embed.config.ts`; pre-reg committed ee503830, loci-fix cb171407 (BEFORE the build/verdict runs). Data `research/exchange/_crystalline_embed/{loci,control,build,verdict}.ndjson + control_survivors.ndjson + verdict_survivors_{single,doubled}.ndjson + mesh_{control,single,doubled}.{ut,idx}.bin + run_*.log` (gitignored — numbers inlined). Instruments READ-ONLY: buildInhouseMetricMesh (constraintEdges path), newtonNearest/worstFacetsByRadial/facetTrue3D (_gyroid_truthLib), wholeMeshGuardRadialBound/auditNonManRaw/radiusFn/TANGLED_BASE (_pf_tangledKernelLib), planarizeMM (_pf_planarizeMM). Finish commit [this]. DEV-ONLY; no src/ edit.
