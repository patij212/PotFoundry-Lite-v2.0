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
