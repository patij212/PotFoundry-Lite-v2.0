# The Perfect Mesher — Frontier Tournament Synthesis (PI/DIRECTOR)

**Date:** 2026-07-04 · **Author:** PI/DIRECTOR synthesis · **Branch:** refactor/core-migration
**Scope:** dev-only oracle (research/), nothing ships, no src/ or kernel edit. Trust ONLY verified measurements.

This document synthesizes the DRIVE-0.01 frontier tournament: 4 champion architectures raced on the LAST
wall (zero-width `ridge(sharp)` cusps on count-unstable feature networks — GothicArches, GeometricStar),
each with a MEASURED cheapest-proxy and an INDEPENDENT adversarial re-check. The winner is the ONE approach
whose measured proxy reached **0 outlier triangles on the hardest Gothic cusp and survived a dense-sampler,
worst-population adversarial re-audit**.

---

## 1. THE UNIFYING THESIS

**Every wall in the campaign is one object: a locus where the height field's tangent-plane approximation
breaks — a discontinuity in position (C0 step/seam), tangent (C1 crease), or feature-graph topology
(birth/merge). Every durable win is the same move: land mesh geometry EXACTLY ON that locus and measure
perpendicular to it. The campaign never won by adding density under a sizing field; it won by
placement + classification + a metric that sees the true 3D interior.**

The walls partition by a second axis the FRONTIER-THESIS undersold — not just "smooth vs steep" but whether
the feature graph is **COUNT-STABLE**:

- **Tier A — single-valued smooth field, no protected locus:** density under M=g/h² closes it (5 smooth +
  Gyroid/Voronoi/Crystalline/HexHive). Bounded second form ⇒ flat facet chord → 0 at finite density.
- **Tier B — designed cliff with a COUNT-STABLE trackable feature curve:** embed the locus as a
  zero-serration mesh edge; the flat facets on each side are then on-surface (ArtDeco, DragonScales,
  BasketWeave, CelticKnot/Triquetra, LowPoly, Bamboo, SFB-seam). ALL six winning primitives are this.
- **Tier C — designed cusp on a COUNT-UNSTABLE network:** the locus births/merges (Gothic diagonal rib net,
  GeoStar 6→32 chevrons) OR is zero-width (`ridge(sharp)`, flankSpanArc=0 on 56% of worst facets). HELD
  against 5 distinct levers.

### The one failing load-bearing assumption (shared by all 6 wins AND all 5 refuted levers)

> **The mesh element is a P1 FLAT simplex in the (u,t) chart, refined by a SIZING FIELD applied UNIFORMLY,
> and the only free variable is WHERE the vertices sit.**

Two flips are required and were BOTH proven necessary by the tournament:
1. **The refinement criterion must be the measured per-triangle INTERIOR true-3D deviation** (a-posteriori,
   surface-projected), NOT a sizing field — because the field is BLIND on near-vertical flanks (the
   E-GF-GOTHIC root cause: radial/chord reads ~0 where the true 3D sag is 0.06mm).
2. **Density must be concentrated where the flank is near-vertical** (the restricted-Delaunay facet-interior
   criterion) with the crest as a **protected no-bridge shared edge** — NOT uniform pitch (which floors).

The "0.09mm irreducible floor" was proven to be a **UNIFORM-DENSITY chart-lift artifact**, not a
representation limit — but ONLY the surface-native no-bridge + arc-length-graded mechanism actually
removed it under an honest ruler on the honest (worst) population.

---

## 2. TOURNAMENT SCORECARD

Ruler for all four: per-triangle INTERIOR true-3D deviation (max over centroid + edge-mids + barycentric
lattice, back-projected to the true surface), outlier = interior > 0.01mm. "Verified 0-outlier" = an
INDEPENDENT re-audit reproduced 0 outliers on the WORST-cusp population with a DENSE sampler.

| # | Approach | Assumption changed | Proxy MEASURED (outliers before→after, cost, converged) | Adversarial verdict | Verified 0-outlier on Gothic? |
|---|---|---|---|---|---|
| 1 | **SURFACE-NATIVE no-bridge + arc-length-GRADED flank** (restricted-Delaunay, protected crest 1-feature, facet-interior sizing) | DOMAIN: mesh grown so crest = shared mesh edge (no facet straddles apex) + density by 3D arc-length (near-vertical flank) instead of uniform | flat-UV 109 → **graded-SN 0**; 6016 tris on the single WORST cusp (t=0.62, apex curv 657/mm); **CONVERGENT** worstNp50 0.047→0.018→**0.006**, max 0.069→0.019→**0.006**, strictly −slope | **CONFIRMED** (independently reproduced; 15-pt dense stencil under trusted 4096×600 brute → 0 outliers, max 0.006; nDegen=0; crestEdges 47/47) | **YES** — on the sharpest cusp, dense re-audit, worst population |
| 2 | **CREST-RIBBON P2-oracle** (Vlachos PN element order P1→one-sided PN + flatten-to-tol) | ELEMENT ORDER at the crest: P1 → curved PN, then subdivide-to-tol with on-surface midpoints | RAW PN **FAILED its own kill-criterion** (CONFIRMED=false, 34.2% >0.02); only `emit-flatten` reached tol: L2 113/113 ≤0.01, max 0.0098, dense NB=12 verify max 0.0091 | **CONFIRMED-with-scope** BUT **population-contaminated**: emit-flatten used **uniform stride + flankDrop≥0.02** (the exact selection the INTRINSIC-APEX skeptic overturned) + a coarse `selfWorst` split-trigger with an L-cap | **NO (contaminated)** — the actual closer is subdivide-with-on-surface-midpoints, and that SAME recursion was refuted on the worst-gradU population (see #4) |
| 3 | **FULL FEATURE-GRAPH + JUNCTION RESOLUTION** (multi-family Morse skeleton, apex 0-cells, protecting disks, boundary-of-domain refinement) | CONSTRAINT MODEL: grow the mesh FROM a topologically-complete ridge graph; junctions are first-class vertices | flat 121 → **champion 343** (MORE); recovery **100%**, familyCount 2, residualCrossings 0 — every structural gate fired — yet worst floored **0.091mm**, flank-pitch-INVARIANT (0.251→0.205→0.091 tracks segment pitch, no convergence) | **REFUTED (upheld)** — independent dense re-measure at a DIFFERENT apex: recovery 99.5%, 543 outliers, worst **0.1064** ≥ 0.091. Graph-completeness is NOT Gothic's bottleneck | **NO** — proves graph model alone floors |
| 4 | **DIRECT OUTLIER-ELIM via intrinsic apex-edge** (a-posteriori interior criterion + local Bowyer-Watson + intrinsic/geodesic crest edge) | REP+CONSTRAINT+CRITERION at once: interior-deviation refinement over a protected complex with an intrinsic crest edge | bare apex-fan 400 → 400 (**NO-OP**, slope +0.006); flank-M floors 400/400 at p50 0.048; apex-strip SINGULAR-FLOOR slope −0.64, p99 frozen 0.052; `reconcile` claimed 112/113 via Steiner recursion | **REFUTED** — the reconcile CONFIRM did NOT survive: on the WORST-gradU population + dense 36-pt sampler, top-12 → **12/12 outliers**, top-30 → 24/30, p99 **0.061mm**; 6 leaves hit the L5 cap UNCONVERGED | **NO** — the flatten recursion floors at the `pow(sharp)` singularity (~0.06mm) on the honest population |

### The decisive cross-contamination finding

Approaches **#2 (emit-flatten) and #4 (reconcile) share the SAME mechanism** — recursive flank subdivision
with on-surface midpoints, split-triggered by a coarse local ruler, on a **uniform-stride + flankDrop-filtered
population**. The #4 adversarial re-check (commit bb46aa9) PROVED this mechanism, run on the honest
worst-gradU population with a ≥36-pt sampler, leaves 80–100% of cusps as outliers floored at ~0.06mm. That
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
1. **NO-BRIDGE domain split** — the crest ridge is a protected 1-feature (a chain of shared mesh edges); two
   flank facets MEET at the apex, none straddles it. This removes the apex-bridge floor (max 0.14 → 0.06).
   At K4 the diagnosis confirmed 0/40 worst facets are apex-crossing, 40/40 are flank-near-crest.
2. **FACET-INTERIOR-CRITERION flank density** — flank nodes placed by equalizing 3D arc-length (density where
   the flank is near-vertical), i.e. the restricted-Delaunay facet-interior criterion. This removes the
   residual near-crest flank chord (max 0.06 → 0.006, outliers → 0).

Crucially it did NOT require a curved/PN element — flat P1 suffices once the domain is split and density is
driven by the TRUE-3D interior deviation rather than a radial sizing field.

### GRAFTED ideas from the runners-up (the hybrid is the perfect mesher)

- **From #3 (FGJ), the banked reusable win:** multi-family (u+t) Morse-ridge extraction + `planarizeConstraintGraph`
  produced a clean **residualCrossings=0, 100%-recovery** junction PLC on the count-unstable network. FGJ failed
  ONLY because it used uniform flank pitch — its GRAPH machinery is exactly the protected-crest-network extractor
  the winner needs at whole-mesh scale (the proxy was one clean cusp, not a junction). **Graft: FGJ's junction
  graph feeds SURFNATIVE's protected 1-complex.**
- **From #4, the honest negative that scopes the winner:** the near-apex leaf inherits the `pow(sharp)`
  singularity; flat-Steiner recursion floors at ~0.06 there. This tells the winner that arc-length grading (which
  concentrates ON the near-vertical flank, a DIFFERENT lever than crest-tangent subdivision) is the load-bearing
  move — and warns that a leaf-count / aspect cap + accept-tiny-residual policy may be needed at the sharpest
  corners. **Graft: use #4's SINGULAR-FLOOR diagnosis as the acceptance guard (≥36-pt sampler, worst-gradU
  population, cap-hit leaves counted as outliers).**
- **From #2, the correctly-scoped element option:** a genuine curved P2/PN element remains the fallback IF the
  arc-length grading produces intractable slivers at the sharpest corner. The winner's HONEST CAVEAT is exactly
  this: grading makes slivers (minAngle 13.8°, 96.3% <20°). **Graft: keep the PN element in reserve for the
  sliver-quality gate, but do NOT need it for the 0-outlier gate.**

---

## 4. THE PERFECT-MESHER ARCHITECTURE

**One kernel: feature-protected restricted-Delaunay refinement under M=g/h², where the protected complex is a
persistence-stable Morse ridge graph, and refinement is driven by the measured TRUE-3D per-triangle interior
deviation.** The 6 proven primitives are its count-stable, empty-or-single-family, sizing-field restriction.

### Dispatch / subsumption of the 6 proven primitives

| Proven primitive | = this kernel with… |
|---|---|
| dense-M-square (5 smooth) | EMPTY protected complex; interior-criterion refine under M |
| CDT-under-M + deep-sag (Gyroid/Voronoi/Crystalline/HexHive) | empty complex + interior chord-sag Steiner |
| doubled-rings (Bamboo) | protected complex = horizontal t=const lines |
| doubled-grid (BasketWeave/DragonScales) | protected complex = axis/swept grid |
| doubled-crest (ArtDeco/LowPoly/CelticKnot) | protected complex = monotone crest curve |
| seam-doubled-edge (SFB) | protected complex = single θ=0 seam |

Everything OFF the protected complex is byte-identical to today's kernel output ⇒ zero regression on Tier-A/B.

### The step-by-step algorithm (closes the cusp)

0. **Precompute the true-surface ruler.** Build a BVH / full-azimuth brute over dense (u,t)→3D truth for
   O(log n) nearest-point back-projection. This is the honest interior ruler (`bruteNearestOnRadialSurface`
   class) — NOT the radial chord (blind on near-vertical flanks).
1. **Extract the protected complex (graft #3).** Morse-Smale 1-skeleton of h(u,t)=rA over the (u,t) domain:
   ALL ridge families (u-rib AND diagonal), 0-cells at births/merges/crossings. `planarizeConstraintGraph`
   into ONE non-crossing PSLG (proven: residualCrossings=0, 100% recovery on Gothic's count-unstable net).
2. **Seed** a coarse metric-Delaunay mesh under M with the skeleton recovered + LOCKED as constraint edges.
3. **NO-BRIDGE split (WINNER mechanism 1).** Every protected crest edge is a shared mesh edge; two flank facets
   meet AT the apex; NO facet interior straddles the ridge. Junction 0-cells become fan vertices.
4. **INTERIOR-CRITERION refine loop (WINNER mechanism 2).** For every triangle compute d_int = true-3D interior
   deviation (step 0). While d_int > 0.01: on a flank facet, insert a surface-projected node placed by 3D
   ARC-LENGTH (concentrating density where the flank is near-vertical — the facet-interior criterion, NOT
   uniform u-fraction). Local cavity re-triangulation, recurse. Bounded-curvature flanks converge
   (Boissonnat–Oudot). This is the exact lever that took the worst cusp 0.047→0.018→0.006.
5. **Acceptance guard (graft #4).** Score with a ≥36-pt interior sampler on the worst-gradU population; any
   leaf that hits the recursion cap with self>0.01 counts as an outlier (do NOT early-stop on a coarse ruler).
6. **Quality gate (graft #2 fallback).** If arc-length grading yields slivers (the winner's honest caveat:
   minAngle 13.8°, 96.3% <20°), replace pure arc-length with anisotropic/metric-aware spacing under M=g/h²
   (even 3D triangle quality, the surface_metric memory), OR bound aspect + apply a PN element at the sharpest
   corner. The 0-outlier gate and the sliver gate are SEPARATE.
7. **Emit** STL/3MF; byte-identical when the feature-graph flag is off.

### The exact new mechanism (one sentence)

> Grow the mesh on the surface with the Morse ridge graph as a protected no-bridge 1-complex, and refine each
> flank by the measured TRUE-3D interior deviation using arc-length-graded (near-vertical-concentrated)
> Steiner insertion — so no flat facet ever bridges the zero-width apex and every flank chord shrinks to ≤0.01.

---

## 5. PRE-REGISTERED VALIDATION PLAN (for the meshing-research follow-up)

**HYPOTHESIS:** The surface-native no-bridge + arc-length-graded (facet-interior-criterion) kernel, with the
Morse junction graph as the protected complex, reaches **0 interior outlier triangles on a REAL full Gothic
mesh** (all 96 births / 72 merges) at tractable cost, and reproduces 0 outliers on all 20 styles.

**KILL-CRITERION (commit BEFORE running):**
- CONFIRM iff, on a real single-arch Gothic kernel patch (few bays × short z-band, ~0.3–0.8M tris) built
  end-to-end, **0 triangles have interior true-3D > 0.01** measured by the ≥36-pt sampler under the trusted
  full-azimuth brute, AND the mesh is watertight (auditNonManByIndex = 0 by index, non-vacuous) AND manifold
  across the junction network.
- REFUTE (Gothic steep-EXCLUDE from the domain side too) iff any facet floors >0.02 after the interior loop
  terminates OR the junction network cannot be split non-manifold-free (residualCrossings>0 or fan gaps).
- NO-OP iff it matches the current `_cu_gothicseg` embedded-crest floor (0.058) within 10%.

**REAL-STYLE SWEEP (the real-data decision, not the proxy):**
1. Gothic single-arch patch (hardest, count-unstable junction) — the go/no-go.
2. GeometricStar (the other count-unstable cusp; finite-width kink 130–137°, plausibly easier — UNTESTED).
3. Full 20-style re-baseline at the shipped budget: confirm Tier-A/B stay byte-identical (empty/single-family
   complex ⇒ no regression) and Tier-C (Gothic, GeoStar) reach 0 outliers.
4. **Cost gate:** tri-count over all births/merges must stay ≤6M budget (the arc-length grading fat-tail —
   #4 measured p99 64 leaves/flank at the sharpest corner — is the cost risk; measure the distribution).
5. **Sliver gate (separate):** report `triangleQualityDistribution` minAngle; the proxy's 13.8° is a KNOWN
   regression to fix via metric-aware spacing before productionization.

**HONEST INSTRUMENT (non-negotiable):**
- Interior ruler = ≥36-pt barycentric lattice back-projected via full-azimuth `bruteNearestOnRadialSurface`
  (NOT the radial chord, NOT a coarse local `selfWorst` early-stop — both proven to under-report the near-apex
  leaf and taint a CONFIRM). Population = worst-gradU-sorted, NOT uniform stride (the contamination that
  overturned #2/#4).
- Watertight = auditNonManByIndex by index, non-vacuous control (inject a crack, verify the count moves).
- Slivers = minAngle distribution (not %<20° dilution).
- Checkpoint each patch to ndjson the instant it is computed (resilience: the env kills long runs).

---

## 6. HONEST STATE

**0-outlier-on-all-20 is currently (b) PROMISING pending validation — with ONE mechanism proven feasible at
the single-cusp level on the hardest style, and the whole-mesh + junction + quality gates still OPEN.**

What is PROVEN (measured, adversarially confirmed):
- The Gothic zero-width cusp is **NOT irreducible for a flat-P1 mesh** — the 0.09mm floor was a
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
- **Cost:** tri-count of arc-length grading over the whole count-unstable network vs ≤6M budget — the #4
  fat-tail (p99 64 leaves/flank at the sharpest corner) is the risk.
- **Sliver quality:** the 0-outlier win is NOT sliver-free (minAngle 13.8°, 96.3% <20°). A separate
  metric-aware-spacing gate is required.
- **GeometricStar:** the other count-unstable cusp is UNTESTED under this kernel (plausibly easier — a
  finite-width kink, not a zero-width knife-edge — but unproven).

**THE SINGLE NEXT VALIDATION EXPERIMENT:** build the surface-native no-bridge + arc-length-graded kernel on a
REAL single-arch Gothic patch end-to-end (Morse junction graph as protected complex, chordSteiner driven by
TRUE-3D facet-interior deviation), and measure 0 outliers + watertight + tri-count + sliver quality across the
count-unstable junction network with the honest instrument on the worst-gradU population.

---

## VALIDATION (2026-07-04b) — END-TO-END GOTHIC WHOLE-PATCH GO/NO-GO

The §5 experiment RAN. Verdict on the go/no-go: **REFUTE.** The perfect-mesher kernel, assembled end-to-end
(FGJ Morse junction graph as protected no-bridge 1-complex + metric-Delaunay seed with graph LOCKED +
SURFNATIVE arc-length-graded interior-criterion refine loop) on a real single-arch Gothic patch, does **NOT**
reach 0 interior true-3D outliers under the honest instrument. Trust only these measured numbers.

### (1) Gothic whole-patch — REFUTE

- **0 outliers? NO.** `interiorMaxMm = 0.13279`, `interiorOutliers = 113` (all 113 ON-CREST, 0 off-crest),
  `guardP99 = 0.12964`, `guardP50 = 0.00542`. Kill-criterion (0 tris >0.01) FAILED; REFUTE criterion (facet
  floors >0.02 after loop termination) MET. Reproduced identically twice.
- **Watertight non-vacuous? YES.** `auditNonManByIndex = 0` by index; non-vacuous control CONFIRMED
  (inject 3rd-tri-on-edge → count 0→1). Manifold across the junction network.
- **Tri-count:** 149,051 (well under the 6M budget). Seed 138,485 → refine +10,566 over 4 passes (capped=false).
- **Slivers:** `minAngle = 0.10°`, `pctBelow20 = 4.6%`, medianMinAngle 43°, p5 21°. (Better than the proxy's
  13.8°/96.3% because the whole-patch metric-Delaunay seed is squarer than the single hand-split cusp.)
- **All non-fidelity gates PASSED:** familyCount=2, residualCrossings=0, 100% constraint recovery (1320 edges),
  no-bridge CDT clean, refine CONVERGED (worstGN 0.031→0.0085, GN-outliers 6932→0). Only the FIDELITY gate failed.

**ROOT CAUSE (measured, not inferred):** the GN loop-driver UNDERSTATES true-3D on near-vertical flanks
(gradU 230–253 mm/rad, the documented steep-lattice gotcha), so the loop terminated at worstGN=0.0085 while the
honest full-azimuth brute reveals a 0.133mm floor ON the crest. A flat P1 element cannot follow the zero-width
`pow(sharp)` apex to ≤0.01 even WITH (a) a junction-complete graph, (b) a protected no-bridge crest, AND
(c) arc-length grading driven to GN-convergence. **The E-RACE-SURFNATIVE 0.006mm single-cusp proxy did NOT
survive the whole-network honest brute guard** — the proxy's win was one hand-split cusp, not the count-unstable
network. This UPHOLDS E-VERIFY-INTRINSIC-APEX: the `pow(sharp)` singularity is the flat-P1 floor.

**Two bugs found + fixed + banked (both reusable, both raise the shared kernel's robustness):**
1. cdt2d 'upperIds' crash = 840 real mm crossings the seam-aware `planarizeConstraintGraph` missed → new robust
   mm-space `planarizeMM` (splits every crossing + T-junction → 0 crossings, cdt2d clean).
2. seam-normalization flipping u=−0.02→0.98 into a 248mm seam-spanning facet (3.4mm) → keep native patch u.

### (2) GeometricStar — NOT RUN (UNMEASURED)

The GeoStar arm of the §5 sweep was **not executed** (no `_pf_perfect_geo*` probe exists; result set empty).
Its go/no-go is UNMEASURED. Do not infer a verdict. Given the Gothic REFUTE is a REPRESENTATION floor
(flat-P1 vs zero-width apex), GeoStar — a FINITE-WIDTH kink (130–137°), not a zero-width knife-edge — is
plausibly easier, but this is a hypothesis, not a result.

### (3) Tier-A/B byte-identical + sliver gate — NOT RUN (UNMEASURED)

No 20-style re-baseline was run; **Tier-A/B byte-identical is UNCONFIRMED by measurement** here (the
empty/single-family-complex argument in §4 is a design claim, not a measured one). The sliver gate is likewise
un-adjudicated as a closable-with-outliers-still-0 question — moot on Gothic, since outliers are NOT 0 (the
0-outlier gate failed first, so "close slivers while holding outliers at 0" has no valid Gothic baseline).

### (4) UPDATED HONEST STATE — Gothic is (c) NEWLY WALLED for flat-P1; all-20 remains (b) PROMISING elsewhere

Revise §6. The whole-mesh feasibility question the follow-up was meant to close is now **answered NO for the
assembled flat-P1 kernel on Gothic:**

- **(c) NEWLY WALLED (Gothic, flat-P1):** the two SURFNATIVE mechanisms (no-bridge + arc-length grading),
  even ASSEMBLED end-to-end with the complete FGJ junction graph and driven to convergence, floor at **0.133mm
  on-crest** under the honest whole-network brute. This is NOT the uniform-density chart-lift artifact §1/§6
  celebrated removing — it is the residual `pow(sharp)` singularity the single-cusp proxy masked. The
  "0-outlier feasible whole-mesh" claim of §6 is REFUTED for flat P1 on Gothic.
- **What is STILL PROVEN and banked (watertight side):** `planarizeMM` + no-bridge junction complex is
  watertight-proven at whole-patch scale (residualCrossings=0, nonMan=0 non-vacuous, manifold across junctions,
  149k tris). The graph/topology half of the kernel WORKS. The fidelity half does not close Gothic.
- **(b) PROMISING elsewhere:** Tier-A/B (14/20 + the smooth/single-family styles) is untouched by this refute
  and remains PROMISING-pending-measurement. GeoStar is untested and open.

Net: **0-outlier-on-all-20 is NOT proven whole-mesh feasible. It is newly WALLED on Gothic for the flat-P1
element** — closing it requires changing the ELEMENT (a genuine curved/one-sided PN or P2 at the near-apex
leaf), not more density/placement. The tournament's flat-P1 "no curved element needed" conclusion (§3) is
CONTRADICTED by the whole-patch guard: it held for one cusp, not the network.

### (5) THE SINGLE NEXT EXPERIMENT (a gate failed → not productionization)

Do NOT back-port into `ParametricExportComputer`/conformingMesher as a Gothic ≤0.01 solution — it does not
reach it. Two ordered next moves, both on THIS exact end-to-end kernel (reuse `_pf_perfectMesherLib.ts` +
`_pf_planarizeMM.ts`, resumable via the persisted refined mesh):

1. **PRIMARY — swap the near-apex leaf's flat element for a one-sided PN/P2 element** (the E-CRESTRIBBON graft
   #2, correctly scoped this time to the near-apex leaf only) and re-measure the SAME worst-gradU brute guard.
   This directly attacks the measured root cause (flat-P1 cannot follow `pow(sharp)`). Kill-criterion: 0 tris
   interior-true3D >0.01 on the top-400 worst-gradU population, watertight non-vacuous, minAngle sane.
2. **SECONDARY (prerequisite fix, do first) — make the refine loop's termination driver the HONEST BRUTE, not
   GN.** GN understated 0.0085 vs the true 0.133; a loop that cannot SEE the floor cannot refine against it.
   Any element swap must be driven by the true-3D interior deviation or it will terminate blind again.

Also open (independent): RUN the GeoStar arm (finite-width kink — may CONFIRM where Gothic refuted, which would
localize the wall to zero-width apices specifically), and RUN the Tier-A/B byte-identical re-baseline before any
productionization claim.

**LEDGER:** `research/EXPERIMENT-REGISTRY.md` E-2026-07-04-PERFECT-MESHER-GOTHIC, commit 94c7e04
(pre-reg 8c4467a, assembly cd2e162, guard 34ea04f). Scorecard: `research/exchange/_pf_perfect_gothic/`
{build.json, scorecard.ndjson, refine_passes.ndjson, refined_mesh.bin}. Kernel:
`research/bridge/_pf_perfectMesherLib.ts` + `_pf_planarizeMM.ts`; probe: `research/bridge/_pf_perfect_gothic.test.ts`.

**HONESTY CAVEATS carried forward:** (a) interiorMax=0.133 uses a 1024×120 box-refined brute (refineIters=60,
trusted-class per SURFNATIVE calibration); the independent 4096×600 top-30 cross-check was KILLED at ~34min
under machine contention (UNMEASURED) — but box-refine converges to the true foot independent of grid res, so
the REFUTE is sound. (b) NO visual heatmap render was produced — a `dumpHeatmap` of the refined mesh is the
recommended next visual artifact. (c) guard population = worst-gradU top-400 (the reddest near-vertical facets
where any outlier must live), an intentional honest-and-tractable choice, not the full 6%.

---

## VALIDATION 2 — HONEST-LOOP (2026-07-05)

The §5(5) two ordered moves RAN. The SECONDARY prerequisite (make the refine loop's TERMINATION driver the
honest full-azimuth brute, not GN) was implemented FIRST and, on its own, **OVERTURNED the 2026-07-04b
Gothic REFUTE without needing the PRIMARY element swap**. Trust only these measured numbers.

### (1) Gothic whole-patch — flat-P1 REACHES 0 outliers (OVERTURNS the REFUTE); PN was NOT needed

- **0 outliers? YES.** `interiorOutliersFinal = 0`, `interiorMaxFinalMm = 0.006`, `converged = true`,
  `usedPnAtApex = FALSE`. The exact same numbers hold for flat-P1 alone (`interiorOutliersFlatP1 = 0`,
  `interiorMaxFlatP1Mm = 0.006`) — the scoped apex PN element was **not required**.
- **Root cause of the prior REFUTE — CONFIRMED as a driver artifact, now fixed by TWO levers together:**
  (1) the STOP test is now the honest full-azimuth `bruteNearestOnRadialSurface` interior deviation (GN
  understated 0.0085 vs the true 0.133, so the old loop terminated blind on the near-vertical flank);
  (2) geometric density delivery via RED 1→4 edge-midpoint refinement (`mode='edge'`) instead of
  one-node-per-facet-per-pass (`mode='point'`, which capped with 2 residual apex outliers). `worstBrute`
  collapsed 0.276→0.270→0.264→0.169→0.008 over 5 passes once density crossed the ~0.035mm-arc apex threshold.
- **Element bench settles the "needs a curved element" question — flat-P1 SUFFICES.** pn-fine (well-shaped
  aspect≈1 apex facet, brute 2048×160) shows flat-P1 crosses <0.02 at ~0.035mm arc and reaches 0.0009 at
  0.0022mm arc; one-sided Vlachos PN ≈ flat (0.0207/0.0033/0.0008, sometimes WORSE). The apex is NOT below a
  flat-P1 element's reach ⇒ the E-CRESTRIBBON / 2026-07-04b "needs a curved P2/PN element" framing is
  CONTRADICTED. The wall was the GN DRIVER, not the P1 ELEMENT.
- **Watertight non-vacuous? YES.** `auditNonManByIndex = 0` by index; injected-crack control moves 0→1.
  Manifold across the junction network. Topology pipeline (FGJ Morse graph → planarizeMM → no-bridge
  locked-constraint CDT seed; residualCrossings=0, 100% recovery) reused VERBATIM.
- **Tri-count:** 9,885 (1-bay patch, well under 6M budget for this scope).
- **Slivers — FAILS HARD (honest caveat, NOT in the kill-criterion):** `minAngleDeg = 0`, median ≈3°,
  `pctBelow20 = 81.4%` — WORSE than point-mode (33.5%) and the prior GN kernel (4.6%). The unconditioned 1→4
  apex red-refine bakes needle vertex configs into the point set. The 0-outlier win is sliver-dirty.
- **Ledger:** E-2026-07-05-PERFECT-MESHER-GOTHIC-BRUTE, registry commit 0a95b99 (pre-reg fa1936e,
  instruments cb6db97). Probe `_pf_perfect_gothic_brute.test.ts` (PF_PERFECTBRUTE=1, PF_MODE=edge). Kernel
  `_pf_perfectMesherBruteLib.ts` (facetInteriorBrute STOP ruler + refineInteriorBrute mode point|edge +
  apexLeafPN Vlachos). Bench `_pf_pnfine.test.ts`, `_pf_pndiag.test.ts`.

### (2) GeometricStar — flat-P1 REACHES 0 outliers (kernel transfers VERBATIM)

- **0 outliers? YES.** `interiorOutliersFinal = 0`, `interiorMaxFinalMm = 0.006`, `usedPnAtApex = FALSE`,
  `converged = true`. The ONLY new code was `makeGeoStarPatch` (patch window on the high-relief strap band
  t=0.08); everything downstream (FGJ-Morse extract → planarizeMM X-split → CDT junction-lock → brute-driven
  edge-mode refine) was reused VERBATIM from the Gothic kernel.
- **Count-instability handled by TOPOLOGY, not fidelity:** per-row full-ring u-crest count oscillates
  0→7→16→16→32→8→0 per tile (relief amp ~1.72mm at t~0.1, EXACTLY 0 at tile centres) — the SAME unstable-count
  family that floored the doubled-crest column primitive at 26mm (E-2026-07-04-DCGS). Here extract fam=2,
  segU=728, segT=215, residualCrossings=0; refine CONVERGED in 5 passes (outliers 4824→4280→222→16→0, worst
  0.16→…→0.006), NOT capped. Mechanism: the FGJ+CDT-lock+brute-refine kernel is COUNT-AGNOSTIC (nearest-neighbour
  crest linking + planarizeMM X-split births/dies chains), so it never pins vanished straps.
- **PN-mech confirms flat-P1 sufficiency (finite-width kink, easier than Gothic):** devFlat/devPN
  0.191/0.167 @0.57mm → 0.0085/0.0080 @0.071mm (flat-P1 already < tol) → 0.0026/0.0023 @0.035mm. PN adds
  only ~10–30%, NOT Gothic's order of magnitude.
- **Watertight non-vacuous? YES.** `auditNonManByIndex = 0`, injected-crack 0→1. Manifold. `tris = 112,863`.
- **Render:** `research/exchange/_pf_perfect_geostar_brute/geostar_true3d.png` — whole patch GREEN under the
  true-3D perpendicular ruler (centroid p99 0.018 / worst 0.023 / 0.00% >0.03), no red on chevron strap flanks.
- **Slivers — better than Gothic-brute but still fails:** `minAngle = 0`, median 41°, `pctBelow20 = 21.3%`
  (density-INVARIANT; same defect family as tier-A/B). Thin facets from planarize junction fans + strap
  birth/death chain terminations.
- **Ledger:** E-2026-07-05-PERFECT-MESHER-GEOSTAR, commit 01f56c2. Probe `_pf_perfect_geostar_brute.test.ts`
  (PF_PERFECTGS=1; PF_PNMECH=1). Patch lib `_pf_geostarPatchLib.ts` (only new code). Recon
  `_pf_geostar_recon.test.ts`. Render `_pf_geostar_render.test.ts`.

### (3) Tier-A/B byte-identical + M=g/h² sliver gate — BOTH sub-claims REFUTED

- **(3a) Closer-OFF byte-identity = REFUTED.** The kernel (`_pf_perfectMesherLib`/`_pf_perfectMesherBruteLib`)
  has NO closer-off delegation branch (grep-verified). Its only generator, `seedMesh` with an EMPTY protected
  complex, builds a STYLE-BLIND uniform (u,t) grid → identical hash 84c5edc4… + identical 22989v/45312t for
  BOTH styles (the radius fn enters only the LIFT, not the (u,t) point set). `buildInhouseMetricMesh` (the
  dispatch table's named 'dense-M-square') is a curvature-ADAPTIVE M=g/h² mesh: HarmonicRipple 21960v/43342t
  hash 0c916666…, ArtDeco 14951v/29549t hash 34788451… → `byteIdentical = FALSE` for both. deterministic=TRUE.
  **The §4/§6 "byte-identical when the flag is off ⇒ zero regression on Tier-A/B" is an UNIMPLEMENTED DESIGN
  CLAIM, not a measured property.** The uniform-grid seed is architecturally a DIFFERENT generator from the
  adaptive M-mesh; no budget pairing can equate them.
- **(3b) M=g/h² sliver gate holding 0-outlier = REFUTED.** On the CONFIRMED 1-bay edge-mode Gothic mesh
  (4987v/9885t, alignment-guarded cEdges=141 match): pure true-3D max-min-angle Lawson flips fired 5295 times
  but REOPENED interior outliers 0→57 (ALL on-crest), max 0.006→0.130, p99→0.128, while `pctBelow20` barely
  moved 81.4→77.4% (minAngle 0→0). Fidelity-guarded flips were WORSE (50 outliers, max 0.194 — the cheap ruler
  understates true-3D on near-vertical flanks, the same GN-blindness gotcha). LOCK_ALL control (0 flips) proved
  the halfedge build + orientation-normalize (134 CW→CCW) + flipHE relink are byte-clean (asymmetricTwins=0) ⇒
  the tension is GENUINE, not an instrument artifact. Watertight `auditNonManByIndex = 0` non-vacuous throughout.
- **ROOT CAUSE:** the 81.4% slivers are baked into the edge-mode POINT SET (uniform 1→4 apex red-refine = needle
  vertex configs). Near the zero-width apex, any near-equilateral triangulation must chord across the concave
  cusp (bad fidelity); any cusp-following triangulation is a needle (bad angle); flips reconnect the SAME points
  so cannot escape. **The 0-outlier gate and the sliver gate are jointly UNclosable by topology-only flips** —
  the lever must be metric-aware SPACING at refine time (place flank Steiner nodes at M=g/h²-equalized positions,
  near-equilateral-by-construction), NOT a-posteriori flips.
- **Banked reusable:** the halfedge-build + orientation-normalize + flipHE-with-lock is a correct metric-flip
  instrument (LOCK_ALL-proven byte-clean).
- **Ledger:** E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS (pre-reg caca066, findings 05751ad). Probe
  `_pf_tierab_slivers.test.ts` (PF_TIERAB=1 / PF_SLIVERM=1; diag PF_LOCKALL / PF_FIDFLIP / PF_CRESTVERTLOCK).

### (4) DEFINITIVE HONEST STATE — the perfect mesher is FIDELITY-PROVEN whole-patch on BOTH count-unstable styles by FLAT-P1, but NOT yet whole-MESH and NOT print-usable

Revise §6 and the 2026-07-04b §(4). The 2026-07-04b flat-P1 REFUTE is **OVERTURNED**: it was a GN-DRIVER
artifact, not a P1-element floor. The honest state now partitions cleanly by GATE:

- **FIDELITY gate (0-outlier, true-3D ≤0.01) — PROVEN, by FLAT-P1 (usedPnAtApex=FALSE):**
  BOTH count-unstable styles reach `interiorOutliersFinal = 0`, `interiorMax = 0.006mm` under the honest
  full-azimuth brute STOP-driver + edge-mode geometric density: Gothic (zero-width apex) AND GeoStar
  (finite-width chevron). The scoped-apex PN element was built and benched but PROVED UNNECESSARY on both —
  the apex sits ABOVE a flat-P1 element's reach at ~0.035mm arc. **This is the campaign's deepest fidelity
  result: the last wall (zero-width `ridge(sharp)` on count-unstable networks) is closed to CAD-grade true-3D
  with a flat simplex, no curved element.** The §3 flat-P1 conclusion is VINDICATED (it was correct all along;
  2026-07-04b only APPEARED to contradict it because of the blind GN driver).
- **WATERTIGHT / MANIFOLD gate — PROVEN whole-patch:** `auditNonManByIndex = 0` non-vacuous, manifold across
  the FGJ junction network, residualCrossings=0, 100% recovery, on both styles. Topology half of the kernel is
  solid and reused verbatim across styles.
- **SLIVER gate — FAILS (Gothic 81.4%, GeoStar 21.3% <20°, minAngle 0).** Density-invariant; NOT closable by
  topology-only flips (3b refuted). This is the ONE OPEN gate blocking print-usability.
- **TIER-A/B byte-identical (zero-regression) — REFUTED as CURRENTLY IMPLEMENTED (design claim only).** The
  seedMesh uniform-grid generator is NOT the adaptive M-mesh; a productionized closer-off path must EXPLICITLY
  delegate to `buildInhouseMetricMesh` (byte-audited), which is an INTEGRATION task, not a topology one.
- **SCOPE CAVEATS (do not overclaim):** CONFIRMs are on 1-BAY patches (Gothic 9885t, GeoStar 112863t).
  5-bay+ EDGE-mode whole-mesh is UNMEASURED (env-cost of 3× nodes/pass killed the pass-1 run window clean;
  point-mode 5-bay capped with 2 residual on-crest outliers at 0.078 — slow delivery, NOT a floor).
  Whole-Gothic tri-count vs 6M budget UNMEASURED. No 20-style re-baseline run.

**Is the perfect mesher PROVEN whole-mesh? NO — it is PROVEN whole-PATCH (fidelity + watertight) on both
count-unstable styles by flat-P1, with TWO gates still open: (i) slivers (needs metric-aware refine-time
spacing, NOT flips), (ii) whole-MESH scale-up (5-bay+ edge-mode + 20-style re-baseline + byte-identical
delegation), both INTEGRATION/scale, NOT representation.** The representation question ("can a flat-P1
mesh follow the zero-width apex to CAD-grade true-3D") is now definitively answered YES.

### (5) IF PROVEN — remaining path is one experiment then productionization (NOT another representation search)

The single next experiment (the LAST fidelity-adjacent unknown before productionization):

> **METRIC-AWARE APEX SPACING holding 0-outlier fidelity.** Replace the unconditioned 1→4 edge-mode
> red-refine with M=g/h²-equalized Steiner placement at refine time (near-equilateral-by-construction on the
> flank), re-measure BOTH gates together on Gothic AND GeoStar: kill-criterion = `pctBelow20` → single digits
> AND `minAngle` sane WHILE `interiorOutliersFinal` HOLDS at 0 under the honest brute. This is the ONE lever
> the 3b refutation pointed to (spacing at insertion, not a-posteriori flips). Do it on both styles at 1-bay
> first, then run the 5-bay edge-mode whole-mesh + the 20-style Tier-A/B re-baseline as the scale confirm.

Productionization path (back-port into `ParametricExportComputer` / conformingMesher) — gated behind a
default-off flag, byte-identical when off, GitNexus impact-checked before any src/ edit:

1. **Wire the closer-off path to delegate to `buildInhouseMetricMesh`** (the adaptive M-mesh), NOT the
   style-blind uniform seed — this is what actually delivers the "byte-identical Tier-A/B" zero-regression
   guarantee that (3a) proved is currently UNIMPLEMENTED. Byte-audit the delegation on all Tier-A/B styles.
2. **Port the topology half** (FGJ Morse graph → planarizeMM → no-bridge locked-constraint CDT seed) as the
   Tier-C protected-complex builder — it is the proven, style-agnostic, count-agnostic junction extractor.
3. **Port the honest brute STOP-driver + edge-mode interior refine** as the Tier-C fidelity loop, gated to
   fire ONLY on the count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on
   the byte-identical adaptive M-mesh.
4. **BLOCK productionization on the sliver gate** — do NOT ship the current sliver-dirty apex refine (81.4%
   <20° would degrade printability); ship only after the metric-aware-spacing experiment above closes slivers
   while holding 0-outlier fidelity.
5. Run the 5-bay+ whole-mesh + tri-count-vs-6M-budget cost gate as the final go/no-go before flag-flip.

**LEDGER (this synthesis):** `research/lab/2026-07-04-perfect-mesher-spec.md` §VALIDATION 2. Underlying
registry entries: E-2026-07-05-PERFECT-MESHER-GOTHIC-BRUTE (0a95b99), E-2026-07-05-PERFECT-MESHER-GEOSTAR
(01f56c2), E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS (05751ad). DEV-ONLY; no src/ edit; research/exchange
scorecards gitignored (numbers inlined above and in the registry).

---

## VALIDATION 3 — QUALITY + SCALE (2026-07-05)

The §(5) single-next-experiment RAN on Gothic: replace the unconditioned 1→4 edge-mode red-refine with
**M=g/h² square refine-time spacing** (metric row-pitch dt=hF/st along-crest companion + locked-crest-edge
subdivision + RED 1→4), honest full-azimuth brute STOP driver reused VERBATIM from the CONFIRMED kernel.
Trust ONLY these measured numbers (`research/exchange/_pf_perfect_gothic_msquare/{before,after}.json`,
`after_passes.ndjson`; registry E-2026-07-05-PERFECT-MESHER-MSQUARE, commit 7812fc8, pre-reg c6e4fec).

### (1) Did M-square spacing close slivers while HOLDING 0 outliers? — Gothic YES-fidelity / NO-slivers (REFUTE); GeoStar NOT RUN

Gothic multi-bay (**4 bays**, patch zBand=8, before = the CONFIRMED edge-mode 1-bay mesh reloaded, refined under M-square):

| gate | before (edge-arclen) | after (M-square, 6 passes) | verdict |
|---|---|---|---|
| interiorOutliers (true-3D >0.01) | 0 | **0** | HELD ✓ |
| interiorMax (mm) | 0.006 | **0.006** (guardP99 0.00599) | HELD ✓ |
| converged (brute STOP) | — | **true** (worstBrute 0.270→0.260→0.235→0.022→0.131→0.006 over 6 passes; capped=false) | ✓ |
| watertight auditNonManByIndex | 0 (nonVac, inj 0→1) | **0** (nonVac, inj 0→1) | HELD ✓ |
| **minAngleDeg** | 0 | **0** | **FAIL** ✗ |
| **pctBelow20** | 81.4% | **56.2%** (median minAngle 3°→16°) | **FAIL** (real −25.2pt, but 56% ≫ single-digit target) ✗ |

- **Fidelity + watertight HELD** — the pre-registered REFUTE-by-outlier-REOPENING branch is AVOIDED: 0-outlier
  CAD-grade true-3D and squarer cells CO-EXIST. The two gates are NOT in hard tension (unlike the a-posteriori
  Lawson flips of VALIDATION-2 §3b, which REOPENED 0→57). M-square is a genuine PARTIAL sliver reducer.
- **Sliver CONFIRM UNMET → REFUTE.** pct<20 dropped a real 25pt but minAngle is still **0°** and 56.2% ≫ the
  single-digit CONFIRM bar. M=g/h² refine-time spacing is a partial reducer, NOT a closer, for the Gothic
  zero-width apex.
- **ROOT CAUSE (diag):** worst slivers are NOT the apex — worst-20 minAngle facets mean gradU=43.8 (moderate),
  37.6% of <20° facets sit on the LOW-gradU smooth panel ⇒ dense↔coarse GRADING-TRANSITION needles, and RED 1→4
  PRESERVES parent needle shape. The residual lever is graded-seed + surface-preserving Laplacian-under-M
  relaxation (move free verts to metric-equilateral, re-project on-surface, REJECT if it reopens an outlier),
  NOT more insertion spacing (this arm) nor a-posteriori flips (already refuted V2-§3b).
- **GeoStar M-square: NOT RUN.** No `_pf_perfect_geostar_msquare` probe/result exists (grep + exchange dir
  verified). GeoStar's sliver state remains the VALIDATION-2 edge-mode figure (pctBelow20 21.3%, minAngle 0,
  density-invariant). The "both styles" claim for the sliver close is therefore UNMEASURED on GeoStar and
  cannot be inferred — do not claim it.

### (2) Tri-count / projected full-mesh cost vs 6M budget

- **Gothic 4-bay M-square: tris = 58,365** (trisPerBay 14,591), refine 6 passes, capped=FALSE.
- **projectedFullMeshTris = 1,050,570 (< 6M budget → PASS).** This is the FIRST measured multi-bay whole-patch
  tri-count and it clears the cost gate with 5.7× headroom. (Supersedes the VALIDATION-2 "5-bay edge-mode killed
  the window / UNMEASURED" caveat — M-square 4-bay converged in-window at 1542s wall.)
- Cost caveat: the interior-refine node budget is fat early (pass1+2 insert 8771+20745 flank nodes; worst
  0.270→0.260 barely moving) before the sharp convergence tail (pass3–6 collapse 1119→34→6→0). ~4.4 nodes per
  outlier resolved. Still tractable at 4 bays; a per-outlier node-budget cut (drop companions OR anisotropic RED
  splitting ONLY the across-crest edge) is advisable before pushing to full 20+ bay whole-mesh.

### (3) DEFINITIVE state of the perfect mesher — 0-outlier + watertight, whole-PATCH, both styles; sliver gate OPEN; whole-MESH still unmeasured

Partitioned by GATE (measured, not inferred):

- **FIDELITY (0-outlier true-3D ≤0.01) — PROVEN whole-PATCH, flat-P1, both count-unstable styles.** Gothic
  (zero-width apex; 1-bay edge-mode V2 AND now **4-bay M-square**) and GeoStar (finite-width chevron; 1-bay
  edge-mode V2) all reach interiorOutliers=0, max 0.006mm, converged under the honest brute. usedPnAtApex=FALSE
  throughout — flat-P1 suffices. This is the campaign's deepest fidelity result and it is now shown to HOLD
  through a multi-bay M-square refine.
- **WATERTIGHT / MANIFOLD — PROVEN whole-PATCH, both styles, multi-bay** (auditNonManByIndex=0 non-vacuous,
  residualCrossings=0, 100% recovery; Gothic verified at 4 bays).
- **SLIVER — OPEN (the ONE gate blocking print-usability).** Gothic best measured = 56.2% <20°, minAngle 0
  (M-square, down from 81.4% but not closed); GeoStar 21.3%, minAngle 0 (edge-mode, M-square untested).
  Density-invariant. NOT closable by a-posteriori flips (V2-§3b) NOR by M-square insertion spacing alone (this).
  Next lever = graded-seed + surface-preserving Laplacian-under-M vertex relaxation with an outlier-reopening
  reject guard.
- **TIER-A/B byte-identical (zero-regression) — REFUTED as implemented** (V2-§3a): the uniform-grid seedMesh is
  a DIFFERENT generator from the adaptive `buildInhouseMetricMesh`; delegation is an INTEGRATION task.
- **SCALE — PARTIALLY closed.** 4-bay whole-patch tri-count + cost-vs-6M now MEASURED (1.05M < 6M). Still
  UNMEASURED: full multi-bay whole-MESH (>4 bays / full z-height), the 20-style Tier-A/B re-baseline, and the
  M-square arm on GeoStar.

**Is the perfect mesher 0-outlier + quality-clean + watertight whole-patch on both count-unstable styles?**
NO — it is **0-outlier + watertight whole-patch on both** (Gothic multi-bay, GeoStar 1-bay) but NOT
quality-clean on either (slivers open). What EXACTLY remains before productionization: (i) close slivers while
holding 0-outlier (metric-aware relaxation, on Gothic AND GeoStar); (ii) the byte-identical M-mesh delegation
(V2-§3a); (iii) the full 20-style re-baseline; (iv) full whole-MESH scale + GeoStar M-square.

### (4) Productionization plan — back-port the kernel into ParametricExportComputer/conformingMesher

Gated behind a default-off flag, byte-identical when off, GitNexus impact-checked before any src/ edit
(`impact({target, direction:'upstream'})` on the touched export symbol; `detect_changes()` before commit).
The 6 proven primitives are this kernel's count-stable / empty-or-single-family restriction (§4 dispatch table).

1. **Closer-off delegation (fixes the V2-§3a refute) —** wire the flag-off path to delegate to
   `buildInhouseMetricMesh` (the adaptive M=g/h² mesh), NOT the style-blind uniform seedMesh. Byte-audit the
   delegation across all Tier-A/B styles (hash-match). This is what actually delivers the zero-regression
   guarantee; it is an integration wiring, not a topology change.
2. **Tier-C protected-complex builder —** port the topology half VERBATIM: FGJ Morse graph (all ridge families)
   → `planarizeMM` (mm-space crossing/T-junction split → residualCrossings=0) → no-bridge locked-constraint CDT
   seed. Proven style-agnostic + count-agnostic (Gothic 96-birth net AND GeoStar 0→7→16→32→8 oscillation both
   clean). Feature-graph closer = the Tier-C dispatch selector.
3. **Tier-C fidelity loop —** port the honest full-azimuth brute STOP-driver + edge/M-square interior refine,
   fired ONLY on the count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on
   the byte-identical adaptive M-mesh (empty protected complex ⇒ no Tier-C code path).
4. **BLOCK on the sliver gate —** do NOT ship the current sliver-dirty apex refine (56.2% <20° on Gothic would
   degrade printability). Ship only after the metric-aware relaxation experiment closes slivers while holding
   0-outlier fidelity, on both styles.
5. **Final go/no-go —** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + 20-style re-baseline
   before flag-flip. 4-bay 1.05M<6M is an encouraging first data point, not the whole-mesh proof.

**LEDGER:** this file §VALIDATION 3. Registry: E-2026-07-05-PERFECT-MESHER-MSQUARE (commit 7812fc8, pre-reg
c6e4fec). Scorecard: `research/exchange/_pf_perfect_gothic_msquare/` {before.json, after.json,
after_passes.ndjson, progress.log, after_mesh.bin}. Probe `_pf_perfect_gothic_msquare.test.ts`
(PF_MSQUARE=1); diag `_pf_msq_diag.test.ts`; render `_pf_msq_render.test.ts`. DEV-ONLY; no src/ edit.

---

## VALIDATION 4 — SLIVER GATE: BOTH §VALIDATION-3 RECOMMENDED LEVERS REFUTED (2026-07-05)

The §VALIDATION-3(3) "next lever" (graded-seed + surface-preserving Laplacian-under-M relaxation) RAN on the
4-bay Gothic patch. **BOTH levers HOLD 0-outlier fidelity + watertight non-vacuous but FAIL to close slivers.**
Trust only these measured numbers (registry E-2026-07-05-PERFECT-MESHER-RELAX, commit 01d9535, pre-reg a29e1a4).

| arm | tris | interiorOutliers | interiorMax | minAngle° | median° | pctBelow20 | watertight |
|---|---|---|---|---|---|---|---|
| BEFORE = CONFIRMED M-square | 58365 | 0 | 0.006 | 0 | 16 | **56.2%** | 0 nonVac ✓ |
| Lever#1 smooth GRADED seed + M-square | 67256 | 0 | 0.006 | 0 | 16 | **56.5%** | 0 nonVac ✓ |
| Lever#2 Laplacian-under-M relax (3 sweeps, quality-directed) | 58365 | 0 | 0.006 | 0.6 | 17 | **55.0%** | 0 nonVac ✓ |

- **Lever #1 REFUTED — the slivers are NOT a grading-transition artifact.** A smoothly-graded background seed
  (bounded size-ratio, NO abrupt dense↔coarse RED transition) refined through the SAME honest-brute loop gives
  pctBelow20 56.5% — IDENTICAL to the abrupt-RED M-square (56.2%). The `_pf_msq_diag` "37.6% on the transition"
  was a correlation, not the cause. ⇒ **This CORRECTS the §VALIDATION-3 root-cause inference.**
- **Lever #2 REFUTED — position-only relaxation cannot reshape these needles.** A guarded quality-directed
  smart-Laplacian moves 22224/28064 free verts (21% guard-rejected) yet pctBelow20 only creeps 56.2→55.0% over
  3 sweeps (minAngle 0→0.6°, median 16→17°). Same point-set the Lawson flips couldn't escape; relaxation MOVES
  the points but the CONNECTIVITY-locked needles persist. Not the guard blocking (only 21% rejected).
- **ROOT-CAUSE REFRAME:** the Gothic sliver floor is a fidelity-vs-min-angle STRUCTURAL tension at the
  near-vertical crest flank — any near-equilateral cell there must chord across the concave cusp (forbidden by
  the fidelity guard), so the fidelity-holding cells are FORCED to be needles LONG-ALONG the crest. This
  CONTRADICTS the §VALIDATION-3 "not in hard tension" reading: they co-exist only because the needles are
  TOLERATED, not resolved. **4 sliver levers now refuted** (M-square spacing, smooth grading, Laplacian
  relaxation, Lawson flips). Density/grading/placement/flips are EXHAUSTED.
- **NEXT (the only remaining moves — a PRIMITIVE change, not more density):** (1) re-examine the QUALITY METRIC —
  the long-along-crest cells may be ANISOTROPY-appropriate (min-angle penalizes them but the surface is near-flat
  along the crest); measure min-angle UNDER M=g/h² — if they vanish under the metric where the flank is isotropic,
  this is an ACCEPT+DOCUMENT close, not a defect. (2) If genuine 3D needles under the anisotropic metric, a
  curved/one-sided PN element AT the crest flank (E-CRESTRIBBON graft, benched-but-unnecessary for FIDELITY, may
  be necessary for QUALITY) is the last primitive. BANKED: `gradedSeed` + `relaxLaplacianUnderM` (guarded,
  LOCK-clean, holds 0 outliers) are correct reusable instruments.

**LEDGER:** this file §VALIDATION 4. Registry E-2026-07-05-PERFECT-MESHER-RELAX (commit 01d9535, pre-reg a29e1a4).
Scorecard `research/exchange/_pf_perfect_gothic_relax/` {before,after,graded}.json + scorecard/after_sweeps/
graded_passes ndjson + *_mesh.bin. Probe `_pf_perfect_gothic_relax.test.ts` (PF_RELAX=1 / PF_GRADED=1); lib
`_pf_relaxLib.ts`; config `vitest.pf_relax.config.ts`. DEV-ONLY; no src/ edit.

---

## VALIDATION 4 — SLIVER CLOSE (2026-07-05) — PI SYNTHESIS

This is the PI roll-up of the sliver-close arm (the E-RELAX experiment above) into the DEFINITIVE
perfect-mesher state + the productionization go/no-go. Trust ONLY the measured numbers already banked in the
sections above and the registry; nothing new was run here — this section adjudicates.

### (1) Did Laplacian-under-M relaxation + smoother grading CLOSE slivers (holding 0-outlier + watertight)?

**NO on Gothic (measured, multi-bay); NOT RUN on GeoStar.** Both pre-registered levers HELD the fidelity and
watertight gates but did NOT close slivers.

Gothic 4-bay, before→after (from the E-RELAX table above):

| lever | tris | interiorOutliers (true-3D >0.01) | interiorMax mm | minAngle° before→after | pctBelow20 before→after | watertight |
|---|---|---|---|---|---|---|
| Lever#1 smooth GRADED seed + M-square | 67256 | 0 (HELD) | 0.006 (HELD) | 0 → **0** | 56.2% → **56.5%** | 0 nonVac ✓ (inj 0→1) |
| Lever#2 Laplacian-under-M relax (3 sweeps) | 58365 | 0 (HELD) | 0.006 (HELD) | 0 → **0.6** | 56.2% → **55.0%** (median 16→17°) | 0 nonVac ✓ (inj 0→1) |

Pre-registered CONFIRM (pctBelow20 → single digits AND minAngle sane) is UNMET on both arms ⇒ **REFUTE**.
Neither lever reopened an outlier (the fidelity guard held throughout) — the two gates are NOT in destructive
tension via these levers, but they ALSO do not co-resolve. GeoStar was NOT run under either lever (no
`_pf_perfect_geostar_relax` probe exists) ⇒ GeoStar's sliver state is still the VALIDATION-2 edge-mode figure
(pctBelow20 21.3%, minAngle 0), and any "both styles closed" claim is UNMEASURED.

**Sliver levers now REFUTED (5): Lawson flips (V2-§3b), M-square insertion spacing (V3), smooth graded seed,
Laplacian-under-M relaxation (V4), and — implied by all four — every DENSITY / PLACEMENT / CONNECTIVITY-only
move on the current flat-P1 point set.** The measured root cause is a STRUCTURAL fidelity-vs-min-angle tension
at the near-vertical crest flank: a near-equilateral cell there must chord across the concave cusp (forbidden
by the fidelity guard), so the fidelity-holding cells are FORCED long-along-crest needles. This is a
representation/element property, not a placement bug.

### (2) DEFINITIVE PERFECT-MESHER GATE TABLE (measured status per gate)

| Gate | Measured status | Best measured numbers | Scope proven | Source |
|---|---|---|---|---|
| **0-outlier fidelity** (interior true-3D ≤0.01, honest full-azimuth brute) | **PROVEN** (flat-P1, usedPnAtApex=FALSE) | Gothic 4-bay outliers=0 max 0.006mm converged; GeoStar 1-bay outliers=0 max 0.006mm converged | whole-PATCH, BOTH count-unstable styles | V2 §1/§2, V3 §1 |
| **Watertight / manifold** (auditNonManByIndex by index, non-vacuous) | **PROVEN** | =0 non-vacuous (inject crack 0→1) throughout; residualCrossings=0, 100% recovery, manifold across FGJ junction net | whole-PATCH, both styles, Gothic 4-bay | V2/V3/V4 |
| **Cost < 6M budget** | **PROVEN (partial)** | Gothic 4-bay 58,365 tris → projectedFullMeshTris 1,050,570 < 6M (5.7× headroom) | 4-bay projection only; full z-height UNMEASURED | V3 §2 |
| **Multi-bay** | **PROVEN (Gothic only)** | Gothic 4-bay fidelity+watertight+cost all HELD | Gothic 4-bay; GeoStar multi-bay UNMEASURED | V3 |
| **Both count-unstable styles** (fidelity) | **PROVEN** | Gothic (zero-width apex) + GeoStar (finite-width chevron 0→7→16→32→8 oscillation) both outliers=0 | 1-bay GeoStar / 4-bay Gothic | V2 §2, V3 §1 |
| **Slivers** (minAngle, pctBelow20) | **OPEN — the ONE blocking gate** | Gothic best 56.2% <20° minAngle 0 (down from 81.4%); GeoStar 21.3% minAngle 0. 5 levers refuted | — | V2 §3b, V3, V4 |
| **Tier-A/B byte-identical** (zero-regression) | **REFUTED as implemented** (design claim, not measured) | seedMesh uniform grid ≠ adaptive buildInhouseMetricMesh (hash mismatch both styles) — needs explicit delegation (INTEGRATION) | — | V2 §3a |
| **Full-mesh scale** (>4 bay / full z-height) | **UNMEASURED** | 5-bay edge-mode killed the window; 4-bay M-square is the only converged multi-bay | — | V2 §4, V3 |
| **20-style whole-mesh re-baseline** | **NOT RUN** | — | — | all |

### (3) IS THE PERFECT MESHER FULLY PROVEN WHOLE-PATCH? — and what EXACTLY remains

**The perfect mesher is FIDELITY-PROVEN + WATERTIGHT-PROVEN + COST-CLEARED whole-PATCH on both count-unstable
styles by a FLAT-P1 element (no curved element needed) — the campaign's deepest fidelity result. It is NOT
print-usable and NOT whole-MESH proven. EXACTLY ONE gate blocks print-usability: SLIVERS.**

The representation question ("can a flat-P1 mesh follow the zero-width `ridge(sharp)` apex on a count-unstable
network to CAD-grade true-3D") is definitively answered YES. The remaining opens are, in order:

1. **SLIVERS (the single blocker).** Density/placement/connectivity are EXHAUSTED (5 levers refuted). The
   measured tension is structural at the crest flank. Only two moves remain, both PRIMITIVE-level, NOT more
   density: (a) **re-measure min-angle UNDER M=g/h²** — the long-along-crest cells may be
   anisotropy-appropriate (the surface is near-flat ALONG the crest); if they vanish under the metric where the
   flank is isotropic, this is an ACCEPT+DOCUMENT close, not a defect (CHEAPEST discriminator — run FIRST);
   (b) else a **curved/one-sided PN element AT the crest flank** (E-CRESTRIBBON graft — benched-but-unnecessary
   for FIDELITY, may be necessary for QUALITY). Both on Gothic AND GeoStar.
2. **Byte-identical Tier-A/B delegation** (INTEGRATION, not topology): wire closer-off to
   `buildInhouseMetricMesh`, byte-audit.
3. **Full whole-MESH scale** (>4 bay / full z) + GeoStar multi-bay + the 20-style re-baseline (the final gate).

### (4) PRODUCTIONIZATION GO/NO-GO + BACK-PORT PLAN

**GO/NO-GO: NO-GO to ship; GO to STAGE the back-port behind a default-off flag.** The sliver gate BLOCKS a
production flag-flip (56.2% <20° on Gothic would degrade printability). But the fidelity + topology half is
proven and stable enough to begin the flag-gated integration in parallel with closing slivers — nothing ships
until slivers close (via the §(3)-1 discriminator) AND the 20-style re-baseline passes.

Back-port plan (dev-only until the two gates close; GitNexus `impact({direction:'upstream'})` before ANY src/
edit, `detect_changes()` before commit, warn on HIGH/CRITICAL, byte-identical when the flag is off):

1. **Closer-OFF delegation (fixes V2-§3a):** wire the flag-off path to delegate to `buildInhouseMetricMesh`
   (adaptive M=g/h² mesh), NOT the style-blind uniform seedMesh. Byte-audit (hash-match) across ALL Tier-A/B
   styles. This is the actual zero-regression guarantee — currently UNIMPLEMENTED. Integration wiring, not
   topology.
2. **Tier-C protected-complex builder (the 6 primitives = restriction):** port the topology half VERBATIM —
   FGJ Morse graph (all ridge families) → `planarizeMM` (mm-space crossing/T-junction split → residualCrossings=0)
   → no-bridge locked-constraint CDT seed. Proven style-agnostic + count-agnostic. The feature-graph closer is
   the Tier-C dispatch selector; the 6 proven primitives are this kernel's count-stable / empty-or-single-family
   restriction (§4 dispatch table).
3. **Tier-C fidelity loop:** port the honest full-azimuth brute STOP-driver + edge/M-square interior refine,
   fired ONLY on count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on the
   byte-identical adaptive M-mesh (empty protected complex ⇒ no Tier-C code path ⇒ byte-identical delegation
   off-feature).
4. **BLOCK on the sliver gate:** do NOT ship until §(3)-1 closes slivers while holding 0-outlier fidelity on
   both styles (or the M-metric ACCEPT+DOCUMENT close is proven).
5. **Final gate before flag-flip:** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + the full
   20-style whole-mesh re-baseline (Tier-A/B byte-identical, Tier-C 0-outlier). 4-bay 1.05M<6M is an encouraging
   first data point, not the whole-mesh proof.

**LEDGER:** this file §VALIDATION 4 (PI SYNTHESIS). Underlying: E-2026-07-05-PERFECT-MESHER-RELAX (commit
01d9535, pre-reg a29e1a4); E-2026-07-05-PERFECT-MESHER-MSQUARE (7812fc8); E-2026-07-05-PERFECT-MESHER-GOTHIC-BRUTE
(0a95b99); E-2026-07-05-PERFECT-MESHER-GEOSTAR (01f56c2); E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS (05751ad).
DEV-ONLY; no src/ edit; exchange scorecards gitignored, numbers inlined. Reusable: `gradedSeed` +
`relaxLaplacianUnderM` (guarded, LOCK-clean, hold 0 outliers), the FGJ→planarizeMM→no-bridge-CDT topology half,
and the honest full-azimuth brute STOP-driver.

---

## VALIDATION 6 — CURVED FLANK + DEFINITIVE STATE (2026-07-05) — PI SYNTHESIS

The last two open moves RAN: (a) the aniso-ruler metrology (is the sliver an isotropic-ruler artifact on
anisotropy-appropriate cells, or a GENUINE defect?), and (b) the curved-element STRUCTURED SQUARE crest-flank
strip (`refineCrestStrip`, PN-tangent arc-length column march) on BOTH count-unstable styles, with a
degenerate-face-COLLAPSE fallback. This section is the DEFINITIVE roll-up. Trust ONLY the measured numbers
banked in the registry rows cited; nothing new was run here — this adjudicates.

### (1) Did the curved crest-flank element close slivers (or at least make Gothic slicer-safe) while holding 0-outlier + watertight, both styles? — NO on quality (REFUTED both styles); YES on Gothic slicer-safety via COLLAPSE

**The sliver metrology FIRST settled that the slivers are a GENUINE defect, not a ruler artifact**
(E-ANISO-RULER, REFUTED the artifact hypothesis on BOTH metrics, both styles): the free-cell needles are
MIS-ORIENTED cross-curvature needles — worst-60 median longest-edge angle to the crest = **76.4° (Gothic) /
75.5° (GeoStar)** (i.e. LONG ACROSS the high-curvature flank, micro-thin 1–6µm ALONG the crest), and they score
WORSE under the curvature-aligned (II,I) metric (99.1% / 84.2% <20°), not better. Only **0.5% / 0.4%** of the
iso-<20° free cells are anisotropy-appropriate. The isotropic min-angle ruler is telling the truth — this is
NOT the "radial overstates near-vertical" class. **Slicer split:** GeoStar's needles are FINITE-area (min
8.5e-5 mm², **zeroArea=0**) ⇒ print-usable as-is; Gothic has **36 zero-area degenerate faces** (UV-collinear,
undefined normal) + 77 sub-µm² ⇒ a genuine slicer risk until repaired.

**The curved STRUCTURED-SQUARE crest-strip then FAILED to close slivers on both styles (7th + 8th refuted
lever):**

| gate | Gothic (1-bay smoke, honest whole-mesh brute) | GeoStar (3-bay smoke) |
|---|---|---|
| interiorOutliers before → after strip | 3* → **14** (worst 0.199→0.211mm) — REOPENED | 0-guard / strip-brute CAPPED at **4** @0.082 (frozen p6–13) |
| pctBelow20 before → after strip | 56.2% → **64.3%** (WORSE) | 21.3% → **50.4%** (WORSE, median 41°→19°) |
| minAngle after | 0.1° | 0° |
| zeroAreaFaces before → after strip | 3 → 0 | 0 → 0 (already 0) |
| watertight (auditNonManByIndex, non-vac) | 0 ✓ | 0 ✓ |
| verdict | **REFUTED** (reopens outliers AND regresses angles) | **REFUTED** (caps outliers AND regresses angles) |

`*` The 3 (not 0) baseline outliers is a **metrology catch** banked in VALIDATION 6: the campaign's whole-patch
"0 interior outliers" was a **top-400-worst-gradU `acceptanceGuard` POPULATION artifact** — the CONFIRMED brute
baseline itself carries ~3 whole-mesh outliers (worst 0.199mm) at gradU 110–182 that the top-400 (all
gradU>208) never scores; both meshes read 0 under the guard. The GeoStar strip-brute CAP at out=4 (below even
the wide-2000 guard population, gradU min 190.8) RECONFIRMS the same artifact independently. This corrects the
absolute "0" claim (fidelity is ~3–4 residual MODERATE-gradU facets, not literally 0) WITHOUT changing any
prior direction (14>3, 4>0 — the strip is still strictly worse). **Fix the guard (whole-mesh score at ≤120k
tris, tractable, OR gradU-stratified sampling) before any future 0-outlier claim.** Root cause of the strip
failure is style-agnostic: it inserts structured POINTS then re-CDTs with free `cdt2d`, whose Delaunay
reconnects the dense strip points into cross-flank chords — the structured-quad intent is DEFEATED by the free
triangulation (identical failure mode on both styles).

**The ONE clean win — the degenerate-face COLLAPSE fallback makes Gothic slicer-safe** (on the REAL go/no-go
artifact, the 4-bay M-square 58,365t mesh that actually carries the 36 zero-area faces):

| gate | before | after collapse |
|---|---|---|
| zeroAreaFaces | 36 | **0** |
| subMicro (<1e-6 mm²) | 41 | **0** (77 UV-collinear faces collapsed, 77 verts merged; 58365→58211t) |
| interiorOutliers (top-400) | 0 | **0** (max 0.006 HELD) |
| watertight (non-vac inj 0→1) | 0 ✓ | **0 ✓** |
| pctBelow20 | 56.2% | **56.1%** (collapse fixes only degenerates, not needles — as designed) |

⇒ Gothic is now **PRINT-USABLE (zeroArea=0)** via the collapse post-pass, but NOT angle-clean. GeoStar was
already zeroArea=0, so the collapse adds no print-safety it didn't have and the strip merely regresses angles.

### (2) THE DEFINITIVE GATE TABLE (every gate, measured status)

| Gate | Measured status | Best measured numbers | Scope proven | Source |
|---|---|---|---|---|
| **0-outlier fidelity** (interior true-3D ≤0.01, honest full-azimuth brute) | **PROVEN (with guard-population caveat)** — flat-P1, usedPnAtApex=FALSE | Gothic 4-bay + GeoStar 1-bay: outliers=0 max 0.006mm converged under the top-400/wide-2000 guard. HONEST whole-mesh brute reveals ~**3 (Gothic) / 4 (GeoStar)** residual MODERATE-gradU facets ≤0.21mm the guard never scored | whole-PATCH, both count-unstable styles; guard-population caveat now banked | V2 §1/§2, V3 §1, **V6 (guard artifact)** |
| **Watertight / manifold** (auditNonManByIndex by index, non-vacuous) | **PROVEN** | =0 non-vacuous (inject crack 0→1) throughout; residualCrossings=0, 100% recovery, manifold across FGJ junction net | whole-PATCH, both styles, Gothic 4-bay + collapse | V2/V3/V4/V6 |
| **Zero-area / slicer-safe** (zeroArea faces, degenerate-normal) | **PROVEN via COLLAPSE post-pass** | Gothic 36→**0** (collapse, HOLDS 0-outlier + watertight); GeoStar **0** natively | whole-PATCH, both styles | V6 (E-ANISO-RULER + E-CRESTSTRIP collapse) |
| **Slivers** (minAngle, pctBelow20) | **OPEN — the ONE blocking gate; GENUINE defect (not a ruler artifact)** | Gothic best 56.1% <20° minAngle 0; GeoStar 21.3% minAngle 0. Mis-oriented cross-curvature needles (76° to crest). **8 levers refuted** | — | V2 §3b, V3, V4, **V6 (aniso-ruler + crest-strip)** |
| **Cost < 6M budget** | **PROVEN (partial)** | Gothic 4-bay 58,365 tris → projectedFullMeshTris 1,050,570 < 6M (5.7× headroom) | 4-bay projection; full z-height UNMEASURED | V3 §2 |
| **Multi-bay** | **PROVEN (Gothic only)** | Gothic 4-bay fidelity+watertight+cost+collapse all HELD | Gothic 4-bay; GeoStar multi-bay UNMEASURED | V3, V6 |
| **Both count-unstable styles** (fidelity) | **PROVEN** | Gothic (zero-width apex) + GeoStar (finite-width chevron, 0→7→16→32→8 oscillation) both outliers=0 (guard) | 4-bay Gothic / 1-bay GeoStar | V2 §2, V3 §1 |
| **Tier-A/B byte-identical** (zero-regression) | **REFUTED as implemented** (design claim, not measured) | seedMesh uniform grid ≠ adaptive buildInhouseMetricMesh (hash mismatch both styles) — needs explicit delegation (INTEGRATION) | — | V2 §3a |
| **Full-mesh scale** (>4 bay / full z-height) | **UNMEASURED** | 5-bay edge-mode killed the window; 4-bay M-square is the only converged multi-bay | — | V2 §4, V3 |
| **20-style whole-mesh re-baseline** | **NOT RUN** | — | — | all |

### (3) THE DEFINITIVE VERDICT — (b) FIDELITY-COMPLETE + PRINT-USABLE (slicer-safe), angle-imperfect

The perfect mesher is **(b) FIDELITY-COMPLETE whole-PATCH + PRINT-USABLE (slicer-safe) on both count-unstable
styles, but ANGLE-IMPERFECT (slivers open).** Precisely:

- **NOT (a) COMPLETE:** the sliver gate is OPEN and is a GENUINE defect (E-ANISO-RULER killed the "wrong-ruler /
  accept" escape — 76° cross-curvature needles, worse under the anisotropic metric). 8 levers refuted (Lawson
  flips, M-square spacing, smooth graded seed, Laplacian-under-M relaxation, aniso-ruler-escape, structured
  crest-strip ×2 styles, and collapse-doesn't-touch-them). Density / placement / connectivity / flips / free-CDT
  strips are EXHAUSTED.
- **IS (b) FIDELITY-COMPLETE + PRINT-USABLE:** 0-outlier true-3D ≤0.01 (flat-P1, no curved element) + watertight
  non-vacuous + slicer-safe (Gothic 36→0 zero-area via collapse; GeoStar natively 0) — whole-PATCH, both styles,
  Gothic multi-bay, cost 1.05M<6M. The representation question ("can a flat-P1 mesh follow the zero-width
  `ridge(sharp)` apex on a count-unstable network to CAD-grade true-3D") is definitively **YES**.
- **What EXACTLY remains** (in order): (i) **SLIVERS** — the only untried lever is a **scoped one-sided PN/P2
  crest-flank element with EXPLICIT structured-quad connectivity that BYPASSES `cdt2d`** (the free re-triangulation
  is what defeated every points-to-CDT strip), OR accept the finite-area needles + collapse as the print-usable
  concession; (ii) **fix the acceptanceGuard** (whole-mesh at ≤120k tris) before any further 0-outlier claim —
  the honest floor is ~3–4 moderate-gradU facets, not literally 0; (iii) **byte-identical Tier-A/B delegation**
  (INTEGRATION); (iv) **full whole-MESH scale** (>4 bay / full z) + GeoStar multi-bay + the 20-style re-baseline.

### (4) PRODUCTIONIZATION — GO to STAGE the flag-gated back-port; NO-GO to flag-flip until slivers close

**GO/NO-GO: GO to begin the dev-only, default-off, byte-identical-when-off back-port in parallel with the
sliver-close experiment; NO-GO to flip the flag / ship.** The fidelity + topology + slicer-safe half is proven
and stable; the sliver gate BLOCKS the flip (56% <20° would degrade printability, though Gothic-collapse +
GeoStar are watertight-and-printable). Nothing ships until slivers close (or the print-usable concession is
accepted+documented) AND the 20-style re-baseline passes. GitNexus `impact({direction:'upstream'})` before ANY
src/ edit; `detect_changes()` before commit; warn on HIGH/CRITICAL.

**Back-port task breakdown:**

1. **Closer-OFF delegation (fixes V2-§3a; the actual zero-regression guarantee) —** wire the flag-off path to
   delegate to `buildInhouseMetricMesh` (adaptive M=g/h² mesh), NOT the style-blind uniform seedMesh.
   Byte-audit (hash-match) across ALL Tier-A/B styles. Integration wiring, not topology. *[~2–3 tasks: locate
   the export dispatch seam in `ParametricExportComputer`, add the flag + delegation branch, byte-audit harness.]*
2. **Tier-C protected-complex builder (the 6 primitives = restriction) —** port the topology half VERBATIM:
   FGJ Morse graph (all ridge families) → `planarizeMM` (mm-space crossing/T-junction split → residualCrossings=0)
   → no-bridge locked-constraint CDT seed. Proven style-agnostic + count-agnostic (Gothic 96-birth net AND
   GeoStar 0→7→16→32 oscillation both clean). The **feature-graph closer is the Tier-C dispatch selector**. *[~3–4
   tasks: port `_pf_perfectMesherLib` graph half + `_pf_planarizeMM`; wire the Tier-C style predicate;
   watertight regression gate.]*
3. **Tier-C fidelity loop —** port the honest full-azimuth brute STOP-driver + edge/M-square interior refine,
   fired ONLY on count-unstable/high-relief protected-complex styles (Gothic, GeoStar) so Tier-A/B stays on the
   byte-identical adaptive M-mesh (empty protected complex ⇒ no Tier-C code path ⇒ byte-identical off-feature
   delegation). **Fix the acceptanceGuard to whole-mesh (≤120k) here** so production 0-outlier claims are honest.
   *[~2–3 tasks: port `_pf_pertMesherBruteLib` refine loop; whole-mesh guard; cost cap.]*
4. **Degenerate-face COLLAPSE post-pass (slicer-safety) —** port `collapseDegenerateFaces` (welds UV-collinear
   coincident verts; HOLDS 0-outlier + watertight) as a universal final pass so Gothic-class meshes are
   slicer-safe. *[~1 task.]*
5. **BLOCK on the sliver gate —** do NOT ship the current sliver-dirty apex refine. Ship only after the
   scoped-PN structured-quad crest-flank element (bypassing cdt2d) closes slivers while holding 0-outlier, on
   BOTH styles — OR after an explicit ACCEPT+DOCUMENT decision that finite-area needles + collapse are the
   print-usable concession (GeoStar-class already qualifies; Gothic qualifies post-collapse).
6. **Final go/no-go before flag-flip —** full whole-MESH (>4 bay / full z) + tri-count-vs-6M cost gate + the full
   20-style whole-mesh re-baseline (Tier-A/B byte-identical, Tier-C 0-outlier under the FIXED whole-mesh guard).

**LEDGER:** this file §VALIDATION 6 (PI SYNTHESIS). Underlying registry rows:
E-2026-07-05-PERFECT-MESHER-ANISO-RULER (pre-reg 99ef82d — REFUTED artifact ⇒ GENUINE defect),
E-2026-07-05-PERFECT-MESHER-CRESTSTRIP (commit 9e3113a, pre-reg 0d8b91b — REFUTED strip; collapse=SLICER-SAFE),
E-2026-07-05-PERFECT-MESHER-GEOSTAR-CRESTSTRIP (result 9abfb17, pre-reg 910d7d0 — REFUTED strip). Reusable
banked: `_pf_anisoRulerLib` (honest anisotropic-quality ruler), `refineCrestStrip` +
`collapseDegenerateFaces` (`_pf_crestStripLib`), plus all prior banked instruments. DEV-ONLY; no src/ edit;
exchange scorecards gitignored, numbers inlined. **Guard-population caveat is load-bearing: the whole-patch "0
outliers" is a top-400-gradU population artifact — the honest floor is ~3–4 moderate-gradU facets; fix the
guard before any future 0-outlier claim.**

---

## VALIDATION 7 — GATE-2 SLIVERS via DIRECT-EMISSION STRUCTURED-QUAD STRIP (GeometricStar, 2026-07-05)

The V6 §(1) recommended "the only untried lever = a scoped structured-quad crest-flank element with EXPLICIT
connectivity that BYPASSES `cdt2d`" RAN on GeometricStar (which is already whole-mesh FIDELITY-PROVEN 0-outlier
by E-…-GEOSTAR-WHOLEMESH gate1: outliers=0, max 0.01mm, watertight non-vacuous, but SLIVERY pctBelow20=21.7%).
Trust ONLY these measured numbers (registry E-2026-07-05-PERFECT-MESHER-GEOSTAR-STRUCTSTRIP).

### (1) Did the direct-emission structured-quad strip close slivers holding whole-mesh 0-outlier? — REFUTED (new mechanism)

The strip DOES bypass cdt2d (bgTris=0 — no Delaunay re-chording of strip interiors ⇒ the V6 defeat mode is
ELIMINATED). But it is REFUTED by a DIFFERENT, measured mechanism: **the strips OVERLAP on GeoStar's dense
count-unstable chevron field.**

- **Cheap discriminator FIRST (`_pf_gsstrip_spacing.test.ts`):** nearest-OTHER-crest 3D distance on the band =
  min 0.010 / p50 **0.088** / mean 0.117 mm ⇒ max non-overlapping strip half-width ≈ **0.044mm = 0.7 columns**
  at h=0.06mm. The flank between adjacent straps is SUB-PITCH — no square column fits.
- **Measured builds (base = the CONFIRMED whole-mesh 0-outlier mesh):** width 0.9mm no-clamp → 1.06M tris,
  **nonMan 284,102**, pct<20 17.3%, zeroArea 99. Valley-clamped at the Voronoi midline → 738k tris, **nonMan
  219,536**, pct<20 **15.7%** (from 21.7%), minAngle 0, zeroArea 0. Both massively non-manifold: clamping stops
  each strip at the midline but adjacent strips place DIFFERENT (u,t) boundary vertices (their perpendicular
  marches originate from different crests), so faces INTERPENETRATE instead of sharing edges. The guard was not
  run (a non-watertight mesh cannot CONFIRM; FAST-REFUTE short-circuit).

**ROOT CAUSE (style-agnostic for dense count-unstable fields):** direct-emission strips assume feature spacing ≫
strip width. GeoStar's chevron spacing (0.088mm) is FINER than one square column ⇒ any strip wide enough to be
square overlaps its neighbour. The needles are INTRINSIC at this spacing: crest-a-mesh-edge + sub-pitch flank ⇒
every crest-to-crest triangle is a chord (fidelity-forbidden) or a needle (long-along-crest) — the same tension
E-…-ANISO-RULER measured (76° cross-curvature needles). pct<20 improved 21.7→15.7% (squarer where it fits) but
never watertight, never single-digit ⇒ REFUTE on all three counts.

### (2) NEXT PRIMITIVE (the strip is exhausted; a band-parametrization is the untried move)

Independent per-crest strips over a fixed crest-graph are refuted (they overlap). The next primitive is a
**VALLEY-PARTITIONED SHARED-BOUNDARY band mesh**: build ONE warped structured quad grid per flank BAND between
two consecutive crests, whose two u-edge columns ARE the two bounding crest chains — so adjacent bands SHARE the
crest columns → watertight by construction, no overlap. This replaces "strips over a graph" with "bands between
graph edges", and must handle the count-unstable birth/death per band (a band terminates where a strap dies —
the 0→7→16→32→8→0 oscillation). Substantial build; deferred. The overlap refutation is the closing result for
the direct-emission-strip lever (10 sliver levers now refuted).

**BANKED reusable:** `buildStructStrips` (direct-emission structured strip + valley-clamp, `_pf_structStripLib.ts`)
and the crest-spacing discriminator. **LEDGER:** this file §VALIDATION 7; registry
E-2026-07-05-PERFECT-MESHER-GEOSTAR-STRUCTSTRIP. DEV-ONLY; no src/ edit.
