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
