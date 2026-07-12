# Raycast-Oracle Fidelity Scorecard (2026-07-12)

**Cap (recorded/reasoned):** cap = production VERDICT_MAX_PASS(4) @ VERDICT_TOL_MM(0.01mm). Reasoned: 4 dyadic passes = up to 16x local refine over the base feature cell; non-convergence past that indicates a topology limit (chord-across-feature), i.e. a remesher signal, not insufficient density. Not silently truncated — per-style convergence recorded below.

**Bar:** A) max outer chord-sag ≤ 0.01mm everywhere; B2) feature-band facets satisfy A;
C) watertight/manifold/oriented + self-intersection-free (validator) + manual slice.
Triangle counts are reported, not gated. Drift (CPU-vs-certified-GPU) certifies A in Phase 2.

| Style | feature kinds | sag OFF | >tol OFF | sag ON | >tol ON | verdictRan | tris OFF | tris ON | worst(u,t) | C ok | bnd | nonMan | orient | selfX | drift max | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| __SmoothControl__ | none | 0.0051 | 0 | 0.0051 | 0 | false | 184320 | 184320 | (0.557,1.000) | true | 0 | 0 | 0 | 0 | pending | A+C met (oracle-refine viable) |
| SpiralRidges | helical-crease:9 | 0.6133 | 37389 | 0.6133 | 37389 | false | 1242458 | 1242458 | (0.119,1.000) | false | 0 | 0 | 0 | 0 | pending | BUILD FAILED — RangeError: Set maximum size exceeded     at Set.add (<anonymous>)     at detectSelfIntersections (C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/geometry/selfIntersection.ts:250:16)     at checkConditionC (C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research |
| GothicArches | vertical-crease:24 horizontal-band:3 | 1.4913 | 51056 | 1.4913 | 51056 | false | 613824 | 613824 | (0.893,0.439) | true | 0 | 0 | 0 | 0 | pending | A UNMET, verdict inert (feature kind not general-curve) |
| GyroidManifold | general-curve:10 | 0.4616 | 50977 | 0.4616 | 69976 | true | 965302 | 1669080 | (0.655,0.879) | false | 0 | 0 | 0 | 0 | pending | BUILD FAILED — RangeError: Set maximum size exceeded     at Set.add (<anonymous>)     at detectSelfIntersections (C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/geometry/selfIntersection.ts:250:16)     at checkConditionC (C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research |
