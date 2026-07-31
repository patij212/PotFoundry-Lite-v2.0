# 2026-07-30 — FITTED SEED / THREE-WAY ROLE SEPARATION (operator idea, documented)

**Provenance.** The idea is the OPERATOR's, raised in the 2026-07-30 session that closed the fossil
campaign (S6–S9); the analysis below transcribes that session's assessment. This file was written by
the same-day review session while S10 runs, so the record exists independently of the S10 outcome.
**Status: DESIGN NOTE — nothing in this file is a new measurement.** Every number cites where it was
measured. S10 (in flight; pre-registration appended to the 2026-07-29 worklog by its own session) is
the first partial test of this architecture.

---

## THE IDEA (operator, verbatim)

> "i was thinking more of the seed being a non uniform starting point already prepared for the
> surface so that the strata only needs to refine it, something that would run cheap and fast but
> not able to converge on it's own but generating a mesh that already fits well to the 3d surface"

## THE ARCHITECTURE — split the roles three ways

SEEDER — cheap, approximate, NEVER TRUSTED. Lands close to the surface fast; cannot certify itself.
DRIVER — the strata refiner. Closes the gap from a good start instead of walking from a dumb grid.
AUDITOR — the certificate. Sound exactly once, at the end.

This is the campaign's own measured ranker lesson ("the honest quantity is an EXCELLENT judge and a
BAD driver... cheap biased ranker in the loop, honest certificate once at the end" — worklog, R1b /
weld-wall sections) extended one level up, to the starting mesh itself.

It is also the marriage of the two pipelines this repo currently treats as rivals: the app's
parametric export pipeline (feature extraction → chain linking → importance map → constrained
triangulation → tessellation) is exactly a "fits the surface well, cannot certify itself" generator —
its output failing the auditor is why STRATA-001 exists. Let the incumbent do what it is good at
(landing close, fast); let strata do what it is good at (closing and certifying).

## WHAT THE MEASURED RECORD SAYS IT BUYS

* **A better start alone already converges cheaper.** D50: production init grid vs 60×40 —
  903,506 tris / 1229 s → 750,702 tris / 776 s, converged to FEWER triangles in LESS time
  ("a better start means less LEPP cascading" — worklog, D50).
* **Even a tiny step toward a prepared seed was a strict Pareto improvement at negative cost.**
  S9a (gen-0 conformity only): back-facing ×0.84, parAR tail ×18 smaller, H1 witnessed 549→525 µm
  (first-ever fall), wall ×0.87 (worklog, S9 FINAL).
* **The refinement journey itself manufactures the artifact class.** The driver spends 54.5% of its
  split-candidate scoring on aspect refusals (968,731 of 1,778,625, D52/D53 arm) at sites a fitted
  seed would not create; the survivors censor against the AR cap until no legal split exists
  (S8-PROD2: self-block 18,102 of 18,102). A short journey never accumulates that population.
* Expectation, stated in advance: seed cost in seconds (R2 sizing field, Phase-0 class map, and CDT
  machinery all exist and are fast); refine phase substantially shorter than today's ~900–1500 s;
  artifact class down further than S9a's −16%, because the crossing-birth channel is deleted rather
  than 80%-discharged (S9a conformed 8,507+8 of 10,641 gen-0 crossings; 2,126 deadlocked).

## THE TWO THINGS NO SEED CAN DO (so this is not a mirage)

1. **It cannot smuggle junction anisotropy under the current gates.** The AR-50 census applies to
   seed facets too — the driver already prints the warning at birth
   (_strataConformBisect.test.ts:3372: "BORN OVER THE CAP... S1 refuses their splits, so they are
   FROZEN into the STL. Expect the blade gate to count them."). A sub-cap seed leaves the junction
   demand exactly where it is today — P5 is still needed — UNLESS the declared-patch provenance
   extension from the P5 plan lands first, in which case **the seed becomes P5's delivery vehicle**:
   junction patches and flank strips ship as declared regions of the seed, and refinement polishes
   around them. The elegant end-state is that the seeder and P5 are ONE build, not two.
2. **It does not make certification cheaper, and it adds a trust surface.** The accept-on-first-sight
   trap is real and measured (a blade is accepted on first sight and never re-queued — worklog,
   blade diagnosis (b)). So: the seed must be a LIFTED GRAPH — every vertex placed on the analytic
   R(θ,z), same semantics as addV; the seeder needs its own NEGATIVE CONTROL (a mistraced locus is a
   misplaced constraint, i.e. a brand-new artifact class); and it must be CPU-DETERMINISTIC
   (byte-reproducible controls are the campaign's spine — the GPU importance-map path is not a safe
   source of truth for a control lineage).

## THE CHEAP BUILDABLE VERSION = S10 (in flight)

Trace the loci into chains (Phase-0 cells → polylines — the one genuinely new, load-bearing
instrument); take h(θ,z) from R2's validated sizing field; run the existing CDT
(src/utils/geometry/ConstrainedTriangulator.ts) with the loci as constraints and Steiner points
graded by h (long-along / short-across, up to the AR cap); lift every vertex onto R; add a driver
ingestion path (flag-gated, byte-identical OFF) that initializes vFeat from the chains so conformity
semantics survive. First A/B: seed+refine vs `_S9A` on wall time, back-facing census, and the
two-sided audit. Pre-registered risk to watch: the TRACER. Everything it produces (traced loci,
junction disks) is input P5 needs anyway.

## REVIEWER'S ADDENDUM (2026-07-30 review session — additions beyond the transcribed analysis)

* **The seed may also attack the OFF-JUNCTION H1 tail, and the S10 A/B can watch for it.** On
  `_S9A`'s deep audit (FID_S9A.report.txt) the top-24 H1 witnesses sit mostly OFF the junction bands
  — worst 524.567 µm at z≈27.9 on an mm-scale chord (edges 800/2016/1544 µm, AR≈2.5) the plane ruler
  scores at ~41 µm. That is the 2026-07-28 handoff's ranking-function class, which refinement cannot
  reach because its ranker cannot see it. A field-graded seed allocates by R2's h(θ,z) instead of by
  the ruler, so it does not share that blindness. CAVEAT, so this is not oversold: R2 is a 1-D
  edge-sagitta LOWER bound, ±50% on feature-bearing styles — the field under-allocates exactly where
  it is uncertain. Watch whether the top-24 loci (z≈27.9/46.7/99.5) shrink; do not promise it.
* **Judge the visible class on the deviation TAIL, not only the gated count.** `_S9A` carries 6,613
  footprint-back-facing facets but 73,287 facets ≥15° off the analytic normal (5.7% of the mesh,
  same instrument's off-locus histogram). The operator's "blades visible everywhere non-uniform" is
  the tail population. A seed judged only on the ≥90° count can win while still looking bladed.
* **Cheap negative control for the whole thesis: grid-alignment ablation.** gcd(gridU=200,
  gaCounts=12)=4 gives every defect four congruent copies, and the 2,126 gen-0 deadlocks are
  shallow-ANGLE crossings — properties of the seed's alignment to the feature lattice. A grid
  offset/aspect sensitivity sweep on the uniform seed proves the birth channel is seed-determined,
  which is exactly the claim the fitted seed cashes.

## CROSS-REFERENCES

2026-07-29-strata-perf-convergence-worklog.md (blade diagnosis; D50; D52; S8-PROD2; S9 FINAL; R1b) ·
2026-07-28-strata001-handoff.md §0–§1 (ranking-function diagnosis, GPU-rank task — still unstarted) ·
research/exchange/_strataFacetTruth/FID_S9A.report.txt (the `_S9A` recorded audit) ·
S10 pre-registration: appended to the worklog by the S10 session (link when landed).
