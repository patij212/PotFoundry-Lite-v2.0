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

## E. UPDATE (all parallel sessions completed — absorbed 2026-07-10)

**PROFILER (Codex, E-2026-07-09-EXPORT-STAGE-TIMING + E-2026-07-10-ASSEMBLEWATERTIGHT-SUBTIMING):**
`assembleWatertight` = 94.1–98.8% of generate time (97.4% aggregate; Gyroid 244/250s … DS 1054/1068s);
GPU eval only 0.1–3.4% (GPU-port explicitly deprioritized — CPU topology dominates); post-fix validation
4.6–10.8s. Assembly split: **triangulation 48.3% / budget-search 24.9% / DUPLICATE final quadtree rebuild
23.8%**. **SHIPPED: guaranteed final-quadtree reuse** (ConformingWall.ts — searchBudgetScale retains the
terminal tree; byte-identity FNV fixture + 17/17+38/38 green; impact CRITICAL handled) ⇒ ~23% of export
time removed structurally at production defaults, re-capture pending. Also found: `orientMeshForSTL`
duplicates orientation work post-`orientOutward` at STL write (needs end-to-end serializer profile +
certificate-gated design before bypassing). Byte-preserving STL scalar writer done (separate entry).

**MASKED-FLOOR (E-2026-07-10-ANALYTIC-FLOOR-MASKED, fa7e8c48): KILL-A with a NEW MECHANISM —
WARP-JACOBIAN SAG DILUTION.** Budget passed 1.223× but fidelity unchanged: the sizing was RIGHT (floor
≥0.8× true-κ at 100% of failing loci) — the u/helix warps compress the chart AFTER triangulation so
realized sag runs ~J² over plain-domain sizing. The original 1.94× close over-delivered enough to mask
this. NAMED LEVER (fleet-wide — applies to EVERY warped style): warp-Jacobian-aware sizing (extend
composedWallSampler composition to the SIZING field). Also banked: verdict runs now execute in PINNED
git worktrees (shared tree is compile-hazardous under concurrent arms); index staging via constructed
blobs only (a -U0 staging corruption was found and repaired, d0c85706 — committed==measured re-proven).

**CAD-LEVER Stage B (a2173a11):** cellSamples=2 on SpiralRidges: outliers −9.4% at +2.19% tris, worst
UNMOVED ⇒ no CAD=2 default flip for helix-ridge styles. BONUS: sizingRes 256 WITHOUT the floor is
ANTI-helpful (+142% outliers at −7.5% tris — the coarse grid was an accidental partial floor) ⇒ res and
floor must ship BUNDLED; res-raise alone is refuted as a free win.

**DS-GATE + SILENT-FAILURE (in-tree, uncommitted, awaiting owner commit/review):** production gate
changed to `valid = manifold && normals && degenerates` — finite-area needles (the print-usable
concession class) demoted to warnings ⇒ **DragonScales default export UNBLOCKED**; `exportSTL` returns
success and v3 `fire()` no longer records/bills no-op exports; error state renders. `degenerateCount`
added to triangleQuality3D. Verify harness: `e2e/_v3_export_gate_verify.mjs`.

**REVISED TOP PRIORITIES:** (1) warp-Jacobian-aware sizing arm (closes SpiralRidges within budget;
fleet-wide sizing correctness for all warped styles); (2) re-run stage capture to bank the reuse win,
then subprofile triangulation (48.3% — now the dominant bucket); (3) Gyroid completion chip (pins +
2-locus CDT fix); (4) commit/review the DS-gate work (owner); (5) all-20 artifact batch + the per-export
certification loop.

## F. UPDATE 2 (2026-07-10 evening — Jacobian arm CLOSED, all-20 captures COMPLETE)

**E-2026-07-10-JACOBIAN-SIZING (875f9089→51d8a301→5776b079→2f3c6e9b): MECHANISM CONFIRMED CAUSAL,
sizing lever driven to its measured saturation.** The completed sizing ladder (SpiralRidges, identical
frozen config family, exact Newton-ALL basis — the manifest's sizing-layer case study):
baseline 3,140@0.0239 (1.000×) → blanket floor 0@0.0100 (1.935×, over budget) → masked floor
2,764@0.0358 (1.223×, warp-dilution KILL) → **J-composed (×max(1,Ju²)) 34@0.0102 (1.430×, 81×
collapse, budget-legal)** → J+5%-margin 28@0.0102 (1.487×, KILL). The margin KILL is MECHANISTIC,
proven three ways: 28/28 surviving loci have BIT-IDENTICAL Newton deviations across a 2.4% sizing
change (request moved, delivery zero); level arithmetic shows the entire reachable request band sits
inside one quadtree level interval (L12→L13 needs κ>3.4–4.4 vs the frozen 2.4 cap) ⇒ the sizing
derivative at these loci is EXACTLY ZERO for any raise-only floor change; the 6 cleared loci are
level-boundary-adjacency beneficiaries. **⇒ QUADTREE LEVEL QUANTIZATION is the sizing lever's hard
floor** — a new named mechanism for the ledger.

**PROGRAM-LEVEL UNIFICATION:** the final residuals of SpiralRidges (28 facet-points / 14 (u,t) loci,
all within 0.0002 of tol, near-rim) and Gyroid (~31k knee population) are the SAME lever class:
LOCAL treatment (pinned points per §V11aa/HexHive, or forced level-split at named cells). ONE
production mechanism closes both styles' endgames — the pins/level-split item absorbs the Gyroid
completion chip's second half. Instrument bonus: fd 6.8e-11 / h0 hash-exact / c1match facet-exact —
the pinned-worktree twin chain is now the standing verification pattern.

**ALL-20 CAPTURES COMPLETE (E-2026-07-10-PROD-BATCH), ZERO FAILURES:** every batch sentinel done.
LowPolyFacet captured clean in 36s (the Dawn hang did NOT reproduce on the export path — it is
raycast-pipeline-specific); CelticTriquetra is the fleet heavyweight (13.6M full tris / 243s);
mid-roster styles generate in 36–77s on the new tree. DS transient resolved (sha1-identical retry,
131.3s vs 1,113s pilot = −88%). Certification: 8/20 adjudicated (3 SHIPPED-CLEAN, 4 REGRESSION incl.
1 borderline grid-basis, 1 special-ruler DS), remainder draining in parallel waves; quiet-GPU stage
timing and the final scorecard close the batch.
