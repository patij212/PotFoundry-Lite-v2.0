# Program Consolidation — 2026-07-10 (orchestration session, Claude Fable 5)

One-page state of the 0.01mm export program after the PROD-ARTIFACT-TRUTH pilot and the four delegated
arms (INTHASH spike → SWAP, DS-PRODTRUTH, GYROID-PRODCLOSE, GYROID-BANDEDGE), plus the parallel-session
results absorbed so far (ANALYTIC-FLOOR, CAD-LEVER-COMPLETION, labkit promotion, raycast Lipschitz march).
Every number below is measured, committed, and traceable to a prereg/verdict file in `research/lab/` or a
registry row. Basis is stated per claim. This document seeds the PER-STYLE PRODUCTION MANIFEST.

## A. Production fidelity state (real default-export artifacts, honest rulers)

| style (pilot set) | truth bridge (vtxOnSurf p99) | production fidelity (basis) | verdict class | close recipe (measured components) |
|---|---|---|---|---|
| HarmonicRipple | 0.00004 OK | **literal-0 two-sided ≤0.0055** (every-facet + coverage) | SHIPPED-CLEAN | none needed |
| SpiralRidges | 0.00006 OK | 3,145 over / Newton 0.0239 | REGRESSION → **closed at 1.94×** by analytic floor (KILL-2 budget); masked-floor arm targeting ≤1.5× | analytic κ-floor (fine-grid/masked) |
| Voronoi | was 0.065 **FAILED** → **0.00002 OK post-INTHASH-SWAP** (>3000×, FMA-immune on real GPU, +2.2× eval speed) | first honest numbers: ~64k over (stride 4), max 0.102 | TRUTH CLOSED; fidelity now measurable | int-hash shipped (03948af8); density/sizing arm next |
| GyroidManifold | 0.00010 OK | LITERAL 105,107 over / Newton-worst 0.0590 / coverage 0.0987 | REGRESSION → **mechanism confirmed**: band-edge contours −67.6% outliers / −56.8% worst / −74% coverage at **+18.5% tris** (dominates the κ-floor: −19%/+87%) | doubled band-edge general-curves (step 0.15) + knee-pin pass + 2-locus CDT fan fix |
| DragonScales | premise OK (composite ruler, 1a–1d PASS) | body p99 0.0046 (0.267% over; rim-attachment tail max 0.158); rings 6.35% over / max 0.070 (96% of the 17× regression) | REGRESSION (ring-chording) | doubled-ring feature edges (§V11o class) — also reclaims the measured 6–8× ring density waste |

Cross-style pattern (manifest item): worst loci cluster at wall↔rim/base ATTACHMENT zones
(SpiralRidges t≈0.98, DS t=0.999, Gyroid t≈0.05) — attachment bands need their own manifest entry.

## B. Per-style production manifest v1 (the universal-mesher dispatch design)

Replace ad-hoc allow-lists with a per-style manifest consumed by the conforming path:

```
StyleManifest {
  truth:    { fn: CPU-f64 rA | int-exact variant, gpuBridge: measured vtxOnSurf class }
  features: { extractors: [analytic loci | level-set contours (isolevels, step)], doubled: bool,
              attachmentBands: policy }
  closer:   { sizing: none | analytic-κ-floor(fine-grid) | qSizingRes/cellSamples,
              embed: general-curves | rings | crest-chains | none(free-adaptive wins: Voronoi/Crystalline class),
              residual: knee-pins | none }
  ruler:    { forward: prescreen+GN+Newton, reverse: coverage, special: composite (DS-tread class) }
  budget:   { measured price to ≤0.01, or priced frontier }
}
```

Templates proven end-to-end on Δ2-exact twins: SpiralRidges (κ-floor), Gyroid (band-edge contours),
DS (ring embedding — recipe from lab, production port pending), Voronoi (truth swap + density next),
smooth class (nothing). Certification layer stays per-export: prescreen (sound) + Newton tail + coverage,
displayed in the Certificate — the honest universal form for "all shapes".

## C. Perf ledger (measured)

SHIPPED: topologyMetric numeric accounting **27.3s→5.2s** (5.3×) + Map-cap crash class eliminated
(09216e5b); orientOutward capless (d43ef40b); int-hash **2.2× eval** (03948af8); raycast Lipschitz march
2–3× at grazing (parallel session); prescreen+shard scoring (36min→382s on Voronoi-class artifacts);
stratified Newton **71ms/query** (3× better than banked 205ms).
OPS (multiplies everything): **Windows EcoQoS throttle — AboveNormal priority = ~4× on every detached
node job** (bump by CreationDate; tinypool CommandLine filter matches nothing on vitest-4 Windows);
NODE_OPTIONS-on-CLI (vitest4 ignores config heap); Node Map cap 2^23 vs Chrome 2^24; appendFileSync
breadcrumbs = only live fork telemetry; sync bodies outlive testTimeout; fork children survive turn
boundaries, watchers don't (orchestrator polls + wakes).
MEASURED OPPORTUNITIES (ranked): (1) DS ring density waste 6–8× at 8.73M tris/18.5min — ring embedding
fixes fidelity AND cost; (2) generate-stage profile still owed (profiler session) — budget-search ~5×
rebuilds + per-cell CDT are the suspects; (3) band-edge ingest is FREE (92–95s vs 115–229s plain) —
feature embedding is not a cost center; (4) STL scalar writer (claimed by another session).

## D. Open engineering items (named, chipped where actionable)

1. Gyroid production recipe: band-edge curves via existing machinery (proven) + **knee-pin mechanism**
   (§V11aa precedent: 35 points; production lacks pins — design item) + **2-locus per-cell-CDT fan defect**
   (bit-identical (u,t) 0.6448/0.8931 and 0.4384/0.4421; remedies: featureLevel+1 on multi-curve cells or
   fan-consistency post-pass; `nonman_loci.json` banked).
2. DS ring embedding port + rim-attachment tail localization (t=0.999 class).
3. FeatureLineGraph stale hash22 replica (chip task_c0c837ec) — silently models the pre-swap Voronoi.
4. Awaited from parallel sessions: stage-profiler table; DS-gate/silent-failure fix (v3 quota burn);
   masked-floor C1 re-run under AboveNormal (its 125-min "pre-triangulation loop" stop is
   EcoQoS-suspect and must be re-judged).
5. Registry merge: the day's prereg/verdict files (`E-2026-07-10-*`) fold into EXPERIMENT-REGISTRY.md
   when the shared tree quiets (multiple sessions hold uncommitted registry rows).
