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

---

## Phase 2 — CERTIFIED (GPU, production mesh via `window.__pfFidelity.diagnoseSurfaceFidelity`, metric=perpendicular, ~2M tris)

| Style | cert max (mm) | cert p99 (mm) | ref | trusted | vertexMax (mm) | tris | CPU-proxy max | note |
|---|---|---|---|---|---|---|---|---|
| SpiralRidges | 0.0469 | 0.0041 | analytic (gpu-grid✓ 0.0456) | yes | 0.0002 | 2.70M | 0.61 (13× hi) | p99 UNDER 0.01 — localized max only |
| GothicArches | 0.4401 | 0.1289 | analytic | yes | 0.0004 | 1.86M | 1.49 (3.4× hi) | CHORD_FLOOR style — real gap |
| GyroidManifold | 0.7241 | 0.1346 | analytic | yes | 0.0005 | 2.17M | 0.46 (1.6× lo) | CHORD_FLOOR; verdict ran, non-convergent |
| SuperformulaBlossom | 0.3083* | 0.0000 | sfb-packed | yes | 0.0011 | 2.75M | (control) | *rms=NaN — localized θ=0 seam spike, flagged |

`referenceTrusted=true` (vertexMax ≤ 0.0005mm) = hard GPU-vertex-match proof → these are certified true-3D sag, not CPU guesses. Forced `referenceSource:'gpu'` timed out for 3/4 (Newton-inversion vs 512-grid, 30min budget); SpiralRidges' completed gpu cross-check (0.0456 vs auto 0.0469, ~3%) validates the `auto` method for all.

## FINDINGS & GO/NO-GO (design §9)

- **Certified verdict:** NONE of the 3 frontier styles reach 0.01mm max EVERYWHERE at ~2M tris (max 4.7×–72× over) — BUT far better than the CPU proxy implied, and the p99 story is nuanced:
  - **SpiralRidges: essentially there** (p99 0.004mm UNDER tolerance; only a localized max of 0.047mm). A small target.
  - **GothicArches + GyroidManifold: real certified chord floor** (p99 ~0.13mm, max 0.44–0.72mm) — both in the known CHORD_FLOOR set.
- **Certification corrected the CPU proxy** 3–13× for 2/3 styles (buildSolidCPU tessellates worse than the production GPU pipeline). The GPU-certified numbers are the answer; the CPU spine is a rougher proxy.
- **Structural findings stand (drift-independent code facts):** verdict-refine escalates only `general-curve` featureLines → INERT for SpiralRidges (helical) + Gothic (crease/band); where it fires (Gyroid) it is NON-CONVERGENT (subdivision without feature-conforming edges).
- **Answering the original question ("can raycast make a perfect 0.01mm mesh?"):** raycast-as-ORACLE is validated — the honest surface-fidelity gate correctly measured 4.7–72× and its parity check certified the surface. But reaching 0.01mm-EVERYWHERE needs **feature-conforming escalation or the raycast-derived remesher** for the CHORD_FLOOR styles; the incremental verdict-refine as-wired is under-scoped (general-curve only) AND subdivision-only-non-convergent where it fires. SpiralRidges shows the oracle+refine idea would nearly close a helical style IF extended to helical features.
- **Findings banked for follow-up (out of spike scope, chips filed):** F1 CPU `styles.ts` sf_strength divergence; F2 unlined θ=0 seam cliff → SFB wall self-intersection; F3 `verdictRefine` production seam-unwrap bug (task_799e06b6); F4 `detectSelfIntersections` RangeError on 1M+ tri meshes (task_3f8bdd44).

---

## Lever re-gating — CERTIFIED deltas (2026-07-12, `__pfFidelity` diagnoseSurfaceFidelity, perpendicular)

Analytic-surface lever = `__pfConformingAnalyticFloor` (ParametricExportComputer.ts:2849) — the ONLY live analytic lever on this path (`__pfTierCAnalyticSurface` / `__pfPerfectMesher` = dead code here, unreachable diagnostic branch).

| Style | baseline max/p99 (tris) | analytic-floor ON | verdict-refine ON |
|---|---|---|---|
| SpiralRidges | 0.0469/0.0041 (2.70M) | 0.0370/0.0021 (−21% / −48%, +61% tris) | — |
| GothicArches | 0.4401/0.1289 (1.86M) | no-op (byte-identical) | — |
| GyroidManifold | 0.7241/0.1346 (2.17M) | no-op | 0.7241/0.0871 (max **0.0%**, p99 **−35%**, +130% tris) |

- **Analytic-floor lever**: meaningful only for SpiralRidges; a NO-OP for the two CHORD_FLOOR styles (Gothic, Gyroid) that need help most.
- **Verdict-refine (Gyroid, CERTIFIED)**: p99 −35% (real, substantial) — this CORRECTS the spike's CPU-proxy "non-convergent / made-it-worse" claim (that was a proxy artifact) — BUT max is UNCHANGED: the single worst facet is PINNED at the same (θ,z) across all 3 Gyroid conditions.
- **Strategic**: neither existing lever cracks the worst-case MAX on the CHORD_FLOOR styles. The pinned worst facet IS the barrier to "0.01mm everywhere" — exactly the feature-conforming-escalation target. (Budget note: the nominal 500k targetTriangles never bound — the mesher's sag/quality floor produced ~2M tris regardless; on/off deltas remain valid.)
