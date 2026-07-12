# PROD-TIERC Item 4 — Region-Layer CORE (the unifying full-pot mesher)

**Date:** 2026-07-12. **Program:** PROD-TIERC. **Owns:** roadmap item 4
(`research/lab/2026-07-12-existing-asset-roadmap.md`), architecture-v1 build item 4
(`research/lab/tierc/architecture-v1.md §6`), the OUTLINE promoted from
`docs/superpowers/plans/2026-07-12-tierc-wire-and-validate.md §5`.

**What this plan is.** A per-style **region orchestration layer** over the three proven kernels
(K1 conforming-quadtree+CDT; K2 protected-complex+analytic-refine; K3 native-3D structured rows).
It is the single vehicle for three things that just converged onto it:
1. **Full-pot Gothic/GeoStar literal-0.01** — proven CONVERGENT but superlinear/OOM monolithic
   (E-2026-07-12-TIERC-FULLPOT-TRACTABILITY, commit `6641e8ed`): full-pot MUST tile per-bay
   (Gothic 12 / GeoStar 8), embarrassingly parallel, bounds each CDT.
2. **DragonScales** — the doubled-ring K3 R-STRUCT embedding closing 3 DS sub-problems
   (`champion-spec-dragonscales.md`).
3. **A single production dispatch** replacing the current `COUNT_UNSTABLE_STYLES` styleId allow-list.

**Read-first grounding (do not re-derive):** `architecture-v1.md` (region model §2, services §3,
manifest §4, decisions A1–A10); `research/bridge/tierc_regionLayer.ts` (855 lines, EXISTS — the
research-side dispatch); `research/bridge/tierc_manifest.ts` (EXISTS — data-only, 4 styles);
`research/lab/tierc/B0-boundary-contract-verdict.md` (the adoption contract, CLOSED);
`research/bridge/_tierc_b1_lib.ts` (`buildDsChainCorrected`, EXISTS); `champion-spec-*.md`;
`gates-harness-spec.md`; the tractability entry (`EXPERIMENT-REGISTRY.md:13–30`).

---

## 0. Honest read of what already exists vs what this plan builds

The "region-layer core" is NOT greenfield. Two substantial research artifacts already exist and
this plan builds ON them, not from a markdown sketch.

| Asset | Status | What it gives us | What it still lacks |
|---|---|---|---|
| `tierc_manifest.ts` | **BUILT, data-only** | `RegionPlan`/`ChainSpec`/`FeatureAnatomy`/`EmbeddedCurve`/`PinSeed`/`SizingConfig` types; `getManifest()` for 4 styles; anatomy providers (FourierBloom/Gyroid/DS/Gothic) | every `ChainSpec.status='TODO'`, `adopter:null`; DS `dragonScalesAnatomy` carries a domain-overlap bug already FIXED in `_tierc_b1_lib.ts`; no PinSeed plumbing |
| `tierc_regionLayer.ts` | **BUILT, research-side** | `buildRegionOuterWall(manifest,dims)` dispatch → single-R-CDT / single-R-REFINE / RSTRUCT-RCDT-chain; drives REAL production kernels via the twin-injection seam (`AssemblyWallOptions`); `buildRegionWallGridCPU`, `evaluatePackedAssemblyToXyz` (full-pot CPU eval, run-1 double-map bug fixed), `mergeAdoptedChain`; `toHarnessManifest` adapter | **NO src edits, NO dev flag** (its own header: "src integration seam is Phase 2/3 scope"); chain path uses B0 `K1_TOY_DEFAULTS` (loose) not `AF_PROD_OPTS`; chain path unsupported curves/pins; NO per-bay parallel path; NO cross-region full-pot assembly |
| `_tierc_b0_toy_lib.ts` + B0 verdict | **BUILT, PROVEN** | contract (a) adoption CLOSED (`nRing`-pinned K1 boundary adopted by R-STRUCT ring band); `buildK1ZBand`/`adoptedThetas`/`buildRingBandRows`/`K1_TOY_DEFAULTS` | single-seam only; adjacent-region uBias interaction untested at >1 seam |
| `_tierc_b1_lib.ts` | **BUILT, research-side** | `buildDsChainCorrected` — full 7-ring/8-body DS chain, non-overlapping `bodyBoundaries` (fixes the manifest bug), `boundaryRimVsInterior` classifier | never gate-scored end-to-end at production-tight tolerances; outer-wall-only (no full-pot assembly) |
| `parallelScorer.ts` + `refineToZeroOutliersParallel` | **BUILT, sampler-only** | 2.94× parallel dense scoring, byte-identical mandate | `samplerGrid()` THROWS on an analytic sampler; `refineToZeroOutliersParallel:1071` hardcodes `radialSurfaceFromSampler` ⇒ **no analytic parallel path** — the Phase-B blocker |

**Net:** the dispatch skeleton, the adoption contract, the DS chain, and the full-pot CPU evaluator
are all built and (mostly) proven research-side. What is genuinely UNBUILT: (i) per-bay parallel
analytic full-pot (the tractability lever); (ii) the src-side production integration seam + dev
flag; (iii) cross-region/bay watertight assembly (glue inner wall/rim/base/cap); (iv) the
production dispatch replacing the allow-list; (v) flipping the DS `ChainSpec`s from TODO→DEFINED.

---

## 1. Resolution of the five OPEN design questions (rulings requested — see §7)

### Q1 — R-STRUCT↔R-CDT adoption contract (+ bay boundaries)

**RESOLVED for the DS seam by B0 (contract (a)).** The K1 (R-CDT) body region OWNS its
`nRing`-pinned boundary ring — production `ConformingWall` pins `t=0`/`t=1` for ANY `SurfaceSampler`
including a narrow z-sub-band, with zero awareness of "outer wall vs region" (B0 §1). The R-STRUCT
ring band ADOPTS by reading the K1 region's `topRing`/`bottomRing` thetas directly and
index-remapping into the combined buffer (`mergeAdoptedChain`, already in `tierc_regionLayer.ts`).
`buildStructuredWall`'s existing merge-strip dispatch handles the count mismatch (`nRing=512` vs
`nThetaRing=2400`) — **no new triangulation code, no `ConformingWall.ts` edit** (B0 verdict §3).
Concrete manifest change: DS `ChainSpec` → `owner = the K1 body region`, `adopter = the R-STRUCT
ring band`, `status:'DEFINED'`. Each K1 body region MUST call `computeUBias(sampler, false)` (B0 §4)
and MUST be chopped to straddle at most one ring (B0 §6.3 — DS's 8-body architecture already does).

**NEW for the full-pot bay boundary (R-REFINE↔R-REFINE).** Gothic/GeoStar full-pot tiles into bays
that share a **vertical u-column** boundary, not a horizontal ring. Ruling: a bay OWNS its
lower-u column; the adjacent bay ADOPTS it by locking an identical-t-station `ChainSpec` into its
protected complex — the SAME locked-column mechanism Item-3 T3.2 builds for the periodic u=0≡u=1
seam (`morseComplex.ts`), applied to internal bay seams instead of the wrap seam. Pre-register a
**B0-bay toy** (Phase B, task B-0) — 2-bay Gothic + 2-bay GeoStar, gate = watertight non-vacuous +
zero T-junction on the shared u-column — before spending on the 12/8-bay full build. This retires
the same historic T-junction/hang risk B0 retired for the DS seam.

### Q2 — Watertight assembly across regions/bays

The DS ring/body chain and the bay-tiled Gothic wall both assemble **outer-wall-only** first
(open top/bottom — B0/B1 proven via `mergeAdoptedChain`; bays via the Q1 u-column contract).
Gluing inner wall/rim/base/cap into one watertight pot is `WatertightAssembly.assembleWatertight`'s
job — **a Track-1-owned, CRITICAL-blast-radius file currently being edited by Item-3 T3.3** (the
Gothic seam-share ring reconciliation, gated behind `__pfPerfectMesher`+`__pfTierCAnalyticSurface`).
**Ruling / sequencing:** Phase D's cross-region assembly REUSES the exact outer→inner ring-adoption
contract Item-3 T3.3 lands (`outer.topRing.length === inner.topRing.length`, ascending-U,
`:578–582`/`:603–606`). Phase D therefore does not begin until Item-3's full T3 chain (T3.2→T3.3)
has landed. Until then Phases A–C validate outer-wall-only assembly research-side — exactly what
`tierc_regionLayer.ts`'s `mergeAdoptedChain` + `evaluatePackedAssemblyToXyz` already produce.

### Q3 — Per-region parallel build (the sampler-only blocker)

Two blockers, both from the tractability verdict (`EXPERIMENT-REGISTRY.md:28`):
1. **Analytic-in-worker.** `refineToZeroOutliersParallel` (`noBridgeRefine.ts:1071`) hardcodes
   `radialSurfaceFromSampler(sampler)`; `parallelScorer.samplerGrid()` throws on an analytic
   sampler. Fix (Phase B-1/B-2): thread `surfaceSource:'analytic'` through the parallel path
   mirroring the sequential `resolveSurfaceSource` (`:836`), and carry a **serializable worker
   payload `(styleId, params, dims)`** that each worker rebuilds into `rA` via
   `buildAnalyticRadiusFn` (`src/geometry/analyticRadius.ts` — a src-only twin, so **worker-legal**;
   no `research/` import crosses the boundary). Byte-identical `dev[]` vs the sequential analytic
   scorer is the gate (the existing `parallelScorer` byte-identical mandate, extended to analytic).
2. **Per-bay/region parallelism (the PRIMARY lever).** A worker pool over regions/bays; each bay's
   bounded CDT is independent ⇒ embarrassingly parallel, near-linear to cores, AND kills the
   monolithic `tris^1.35` blowup by bounding each CDT. Target: GeoStar batch <30 min at ~6–8 cores;
   Gothic honest-report (needs ~32 cores or GPU-offloaded scoring — do NOT silently degrade fidelity
   to hit a time number, per T7). Seam-share across bays = the Q1 u-column `ChainSpec`.

### Q4 — Manifest scope

Implement ONLY the fields the harness consumes now — all already present in `tierc_manifest.ts`:
`truth.{rA,bridgeClass}`, `budget.{maxOuterTris,maxFullTris}`, `gates.g7scope`, `ruler`, `anatomy`.
The ONLY manifest edit this plan makes: flip DS `ChainSpec.status` TODO→DEFINED with `adopter` set
(Q1), and repoint `dragonScalesAnatomy` body boundaries to the non-overlapping `_tierc_b1_lib.ts`
construction. **Deferred (named, not built):** `PinSeed` S-RESIDUAL plumbing (no production field
exists; `ConformingWall.ts` forbidden — Phase E); birth/death envelope; non-default-param anatomy
generalization; the `arc-length-cdf`/`uniform-ladder`/`jacobian-floor` sizing methods (data-typed
in the manifest, wired only where Item-5/Item-7 land them).

### Q5 — Flag / dispatch

New **default-OFF** src flag `__pfRegionLayer` (`isRegionLayerEnabled()`, mirrors
`isPerfectMesherEnabled`). Dispatch (Phase D-2, in `tierC/index.ts`): flag-on AND a manifest exists
for the style ⇒ route through the region layer; else ⇒ today's `COUNT_UNSTABLE_STYLES` allow-list
path, structurally unchanged. The region dispatch **augments then replaces** the allow-list: it does
not remove `COUNT_UNSTABLE_STYLES` — it wraps it, so flag-off is byte-identical (proven by
`rebaseline20.test.ts`'s FNV fixture). Full replacement of the allow-list is a later product decision
once the region layer is default-on for its covered styles.

---

## 2. Global constraints (apply to EVERY task)

1. **Flag-off byte-identity.** Every production-path change lands default-OFF behind
   `__pfRegionLayer` (or an existing default-OFF flag). Flag-off output MUST be byte-identical,
   proven by one of: (a) structurally-unreachable flag-off branch; (b) FNV/hash byte-identity fixture
   (`flagOff.byteIdentical.test.ts`/`rebaseline20.test.ts` pattern); (c) golden diff. No task in this
   plan changes a production default (unlike wire-and-validate T2.1).
2. **Per-file git staging only.** Tree is dirty/multi-session. `git add <path>` per owned file, never
   `-A`/`.`. Never commit/push unless the controller asks.
3. **ESLint 0 warnings** (`npm run lint`), **no NEW typecheck errors** (`npm run typecheck`).
4. **GitNexus** (`CLAUDE.md`, binding): `impact({target,direction:"upstream"})` before editing any
   symbol, report blast radius; `detect_changes({scope:"compare",base_ref:"apply/streamlit-fix"})`
   before committing. If MCP unavailable, say so; do not silently skip. Warn on HIGH/CRITICAL.
5. **TDD.** Named test file(s) FIRST (red), then implementation (green). Paths given per task.
6. **Heavy gates env-gated + forks-pooled.** Own `vitest.*.config.ts` (`pool:'forks'`, explicit
   `testTimeout`), env-gated OUT of fast CI, `PF_PT_BREADCRUMB` 30s crumbs, AboveNormal priority
   (Windows EcoQoS ~4–5×; `feedback_windows_ecoqos_throttle.md`).
7. **research/ ↔ src/ boundary is load-bearing.** `research/` never imported by `src/`. Workers that
   need `rA` rebuild it via the src twin `buildAnalyticRadiusFn`, never by importing `research/`.

### Shared-file serialization (file ownership vs running arms — HARD)

Three arms run in parallel and OWN shared files: **Item-3 wire-and-validate** (T3.2 `morseComplex.ts`,
T3.3 `WatertightAssembly.ts`, T3.4/T5.1 `tierC/index.ts`), **Gyroid P2.5b** and **FAC-3D**
(both edit `ConformingWall.ts` + `PeriodicBalancedQuadtree.ts`).

- **FORBIDDEN until the Gyroid/FAC arms land:** `ConformingWall.ts`, `PeriodicBalancedQuadtree.ts`.
  Any task discovering it needs these MUST STOP and escalate. (This blocks S-RESIDUAL pins → Phase E.)
- **`tierC/index.ts`** — serialize AFTER Item-3 T3.4/T5.1: Phase D-2 (dispatch) is last on this file.
- **`WatertightAssembly.ts`** — serialize AFTER Item-3 T3.3: Phase D-3 (cross-region assembly) reuses
  T3.3's landed ring-reconciliation. CRITICAL blast radius — `gitnexus_impact` mandatory, gate ALL
  logic behind `__pfRegionLayer`.
- **`tierC/noBridgeRefine.ts`** — the analytic sequential path already committed; Phase B-1's parallel
  analytic add is new surface but serialize behind Item-3 T3.4 (which last touched this call site).
- **`tierC/parallelScorer.ts`** — not touched by any other arm; Phase B owns it outright.

---

## 3. Dependency graph

```
Phase A (research-side, NO src, NO flag — validates the layer on the existing scaffolding):
  A-1 ─► A-2 ─► {A-3, A-4, A-5, A-6}          (arms parallel once harness is wired)

Phase B (per-bay parallel analytic full-pot; src edits to parallelScorer/noBridgeRefine only):
  B-0 (bay toy) ─► B-3
  B-1 (parallel analytic) ─► B-2 (worker payload) ─► B-3 (per-bay tiling) ─► B-4 (assemble bays) ─► B-5 (cost report)
        (B-1 serialize AFTER Item-3 T3.4 on noBridgeRefine.ts)

Phase C (DS R-STRUCT embedding, research-validated → src-callable behind flag):
  A-5 ─► C-1 ─► C-2                            (C reuses Phase A's DS validation)

Phase D (src integration: dispatch + flag + cross-region assembly + rebaseline):
  [Item-3 T3.3 LANDED] ─► D-3
  [Item-3 T3.4/T5.1 LANDED] ─► D-2
  D-1 (flag) ─► D-2 (dispatch) ─► D-3 (assembly) ─► D-4 (region tags) ─► D-5 (rebaseline) ─► D-6 (accept gate)
  C-1, B-4 feed D-2/D-3 (the region builders the dispatch calls)

Phase E: DEFERRED/NAMED (S-RESIDUAL pins — ConformingWall.ts forbidden; universal partitioner).
```

---

## 4. PHASE A — Region dispatch consolidation + end-to-end research validation

Goal: harden `tierc_regionLayer.ts` + `tierc_manifest.ts` and prove the 4-arm head-to-head runs
green through the gates harness, **entirely research-side** (no src, no flag), before any production
integration. This de-risks the whole architecture on the existing scaffolding.

### A-1 — Fix the DS anatomy overlap bug + flip ChainSpec TODO→DEFINED
- **Files:** `research/bridge/tierc_manifest.ts` (`dragonScalesAnatomy`), `research/bridge/tierc_regionLayer.ts` (`buildStructCdtChain` — consume the corrected non-overlapping z-boundaries + `AF_PROD_OPTS` where a body region wants production tightness instead of `K1_TOY_DEFAULTS`).
- **Interface:** repoint body-region `domain.{zLo,zHi}` to `_tierc_b1_lib.ts`'s proven
  `bodyBoundaries` construction (`[0, r0−hb, r0+hb, …, r6+hb, H]` paired) so ring/body regions are
  strictly disjoint (the manifest's own doc-comment already flags the prior raw-z overlap bug =
  `nonManifoldEdges=3584`). Set DS `ChainSpec.owner`=body region, `adopter`=ring band, `status:'DEFINED'`.
- **Test first:** extend `research/bridge/_tierc_regionLayer.test.ts` (or NEW if absent): assert the
  DS anatomy's ring/body domains are disjoint (no z-overlap), every DS `ChainSpec.status==='DEFINED'`
  with a non-null `adopter`, and `buildStructCdtChain` produces `nonManRawBig==0` non-vacuous on the
  assembled DS outer wall (regression-guards the 3584 bug).
- **Gate:** disjoint domains; ChainSpec DEFINED; assembled DS outer wall watertight non-vacuous.
- **GitNexus:** `impact` on `dragonScalesAnatomy`, `buildStructCdtChain` (both research-side, LOW).
- **Rollback:** revert both files (research-only).

### A-2 — Wire the composite gates harness over `buildRegionOuterWall`
- **Files:** `research/bridge/tierc_gatesHarness.ts` (loosen the placeholder `anatomy` signature per
  `tierc_manifest.ts`'s doc-comment, OR keep `toHarnessManifest`'s localized cast — pick one and
  state it), NEW `research/bridge/_tierc_regionLayer_gates.test.ts` + `vitest.tierc_regionlayer.config.ts`.
- **Interface:** for each arm, `buildRegionOuterWall(getManifest(id), TIERC_COMMON_DIMS)` →
  `{outer, full}` bins → `scoreAllGates(bins, styleTruth, toHarnessManifest(manifest), opts)`; append
  the ndjson row schema (`gates-harness-spec.md §3.3`), OPEN fields as `null`/`"OPEN"` never fabricated.
- **Gate:** harness runs green over all 4 arms, emits one ndjson row per (style,shard) + merged rows;
  non-vacuity witnesses (`nonManControlMoved`, `locatorSelfCheckMaxMm<1e-9`) present.
- **Rollback:** delete new files; revert the harness signature change.

### A-3 — Arm D control (FourierBloom, null case runs FIRST)
- **Files:** NEW `research/bridge/_tierc_armD_control.test.ts` (env-gated heavy).
- **Interface:** single-R-CDT dispatch; compare against the direct production twin build
  (`buildRegionWallGridCPU` + `assembleWatertight`) — the region layer's single-zero-curve R-CDT is
  by-construction the plain production-equivalent (`tierc_regionLayer.ts` header).
- **Gate:** all gates green at tol 0.01; tri count within ±5% of the batch capture
  (`FOURIER_BLOOM_BUDGET` outer 1,278,510 / full 3,143,106); no quality regression. Validates the
  orchestration null case before any champion mechanism (architecture-v1 A9).
- **Rollback:** delete test.

### A-4 — Arm A Gyroid A1 (doubled band-edge contours through the layer)
- **Files:** NEW `research/bridge/_tierc_armA_gyroid.test.ts` (env-gated heavy).
- **Interface:** `gyroidManifoldAnatomy` feeds doubled band-edge `EmbeddedCurve[]` as
  `outerFeatureLines` through single-R-CDT; reproduce `champion-spec-gyroid.md §5.4` (28,785 pts ±,
  outer 2,242,987 ±5%, Newton-worst 0.024917, 100% knee-adjacent, coverage max 0.0253 ±10%).
- **Gate:** §5.4 checklist reproduced within banked tolerances; report the 2-locus fan defect count
  (the A2 fan fix is Phase-E/out-of-scope here — `ConformingWall.ts` forbidden; REPORT, do not fix).
- **Rollback:** delete test.

### A-5 — Arm B DS B1 (full 7-ring/8-body chain)
- **Files:** NEW `research/bridge/_tierc_armB1_ds.test.ts` (env-gated heavy) driving
  `buildDsChainCorrected` via the region layer.
- **Interface:** 7 R-STRUCT ring bands + 8 R-CDT body bands + standalone (open top/bottom) assembly.
- **Gate (DS "reproduced" = T1∧T4∧T5, `champion-spec-dragonscales.md §5`):** T1 ring-band ≤3,300 +
  ≤100 tail, max ≤0.05, rate ≤1.0%, wall-coverage-over ≤10%; T4 outer ≤4,549,600 AND ring-local
  density measurably DOWN; T5 nonMan 0, zeroArea 0, %<20°<10%. Report T2/T3/T6/T7 regardless. Score
  under the §V11g composite ruler (`_ds_prodtruth_lib.ts`), body-vs-ring-band split, never blended.
  The 0.0461 sheet cliff is REPORTED as the known frontier, not claimed closed.
- **Rollback:** delete test.

### A-6 — Arm C Gothic C1 (patch through K2, + quality report)
- **Files:** NEW `research/bridge/_tierc_armC1_gothic.test.ts` (env-gated heavy) → single-R-REFINE.
- **Interface:** patch `u∈[0,0.125], t∈[0.48,0.52]`, `bgArcMm 0.6`, `nTheta 512`.
- **Gate:** reproduce the CI gate (outliers 0, max ≤0.0101, watertight non-vacuous, ≤9,917 tris /
  ≤7 passes) PLUS the quality report the current suite omits (`triangleQualityDistribution`,
  `needleCount`) — closes gothic-spec gap #1's reporting hole. G7 = patch-NA (deferred).
- **Rollback:** delete test.

**Phase A gate (architecture PROVEN research-side):** A3 clean ∧ A4 §5.4 ∧ A5 T1∧T4∧T5 ∧ A6 CI-match,
all under S-GATES with non-vacuity witnesses green. Any failure → mechanism-level diagnosis naming
the failed contract/kernel/service; iterate or KILL that arm.

---

## 5. PHASE B — Per-bay parallel analytic full-pot (Gothic/GeoStar)

Goal: make full-pot Gothic/GeoStar literal-0.01 tractable by tiling per-bay + threading
`buildAnalyticRadiusFn` into a worker pool. Src edits confined to `parallelScorer.ts` /
`noBridgeRefine.ts` (NOT the forbidden files).

### B-0 — Bay-boundary contract toy (R-REFINE↔R-REFINE u-column adoption)
- **Files:** NEW `research/bridge/_tierc_bay_toy.test.ts` + `vitest.tierc_bay.config.ts`.
- **Interface:** 2-bay Gothic (`u∈[0,0.0833]` + `[0.0833,0.1667]`) and 2-bay GeoStar; each bay a K2
  R-REFINE build; the shared u-column locked at identical t-stations (owner bay derives, adopter bay
  locks into its protected complex — the same lock mechanism as Item-3 T3.2's periodic seam).
- **Gate (pre-registered, mirrors B0):** watertight non-vacuous + zero T-junction on the shared
  u-column + literal-0 outliers ≤0.01 per bay. Retires the bay-seam T-junction/hang risk BEFORE the
  12/8-bay full build.
- **Rollback:** delete test.

### B-1 — Analytic surfaceSource in `refineToZeroOutliersParallel`
- **Files:** `src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine.ts` (serialize AFTER
  Item-3 T3.4). Extend the parallel path (`:1063–1071`) to honor `surfaceSource:'analytic'` mirroring
  the sequential `resolveSurfaceSource` (`:836`); pass `analyticRA` through instead of the hardcoded
  `radialSurfaceFromSampler(sampler)`.
- **Test first:** NEW `src/renderers/webgpu/parametric/conforming/tierC/parallelAnalytic.test.ts` —
  assert the parallel analytic `dev[]` is byte-identical to the SEQUENTIAL analytic scorer on a
  fixture (the existing `parallelScorer` byte-identical mandate, extended to analytic). Sampler-mode
  path unchanged ⇒ byte-identical to today.
- **Gate:** parallel-analytic ≡ sequential-analytic (byte-identical `dev[]`); sampler path untouched.
- **GitNexus:** `impact` on `refineToZeroOutliersParallel` (upstream) — report blast radius; it is
  Tier-C-only, flag-reachable ⇒ expect LOW/MEDIUM.
- **Rollback:** revert; sampler-only behavior restored.

### B-2 — Serializable analytic worker payload
- **Files:** `src/renderers/webgpu/parametric/conforming/tierC/parallelScorer.ts` (own it outright).
- **Interface:** the worker payload carries `(styleId, params, dims)`; the worker rebuilds `rA` via
  `buildAnalyticRadiusFn` (`src/geometry/analyticRadius.ts` — worker-legal src twin) instead of
  reconstructing the 512² grid (`samplerGrid()` currently throws on analytic). Keep the esbuild
  on-demand worker-bundle mechanism.
- **Test first:** extend `parallelScorer.test.ts` — analytic payload reconstructs a bit-identical
  `rA`; scoring byte-identical to the sequential analytic ruler across worker counts.
- **Gate:** byte-identical across `nWorkers∈{1,2,4}`; no `samplerGrid` throw on analytic.
- **Rollback:** revert; analytic parallel path removed.

### B-3 — Per-bay tiling dispatch
- **Files:** NEW `research/bridge/_tierc_fullpot_bays.test.ts` (env-gated heavy; own forks config).
- **Interface:** tile the full wall into bays (Gothic 12 / GeoStar 8, from `dsScaleRows`-analog / the
  style's angular period); each bay = a bounded R-REFINE region with its B-0 u-column `ChainSpec`;
  run bays across a worker pool (B-1/B-2). Bounds each CDT ⇒ kills the `tris^1.35` monolithic blowup.
- **Gate (cost model, tractability verdict):** tri-density scale-invariant (GeoStar ~2.0–2.1M/unit
  area, Gothic ~3.6M) ⇒ full-pot ≈ GeoStar 2.1M / Gothic 3.3–3.6M tris; per-bay CDT-remainder does
  NOT show the ×17 superlinear jump the monolithic path did (CI→BAND). Each bay literal-0 ≤0.01.
- **Rollback:** delete test.

### B-4 — Assemble bays into one outer wall
- **Files:** NEW `research/bridge/_tierc_fullpot_assemble.test.ts` (env-gated heavy).
- **Interface:** adopt every bay-boundary u-column by index (the B-0 contract, N-bay chain); one
  combined outer-wall buffer.
- **Gate:** full outer wall watertight non-vacuous, zero interior boundary edges (only the designed
  open top/bottom), literal-0 outliers ≤0.01 across all bays, tri budget within the cost-model
  projection (T4-analog: outer ≤ style budget).
- **Rollback:** delete test.

### B-5 — Cost/time honest report
- **Files:** NEW `research/exchange/tierc/fullpot_regionlayer_costmodel.json` (data) + a report note
  under `research/lab/tierc/`.
- **Gate:** report measured generate wall-time + parallel scaling: GeoStar batch <30 min at ~6–8
  cores is the reachable BAR; Gothic reported honestly (~32 cores / GPU-offload needed) — never
  degrade fidelity to hit a time number (T7 discipline). Amdahl note: `parallelScorer` alone is
  1.55×/1.88× (insufficient); per-bay parallelism is the near-linear lever.
- **Rollback:** delete note/data.

---

## 6. PHASE C — DS R-STRUCT embedding: research → src-callable behind flag

Goal: take the B0/B1-proven doubled-ring chain from research to a production-callable path.

### C-1 — Src-legal DS region builder behind `__pfRegionLayer`
- **Files:** NEW `src/renderers/webgpu/parametric/conforming/tierC/regionDs.ts` (a src port of
  `_tierc_b1_lib.ts`'s `buildDsChainCorrected` mechanism — K1 z-band bodies via the production
  `buildConformingWall`, R-STRUCT ring bands, `mergeAdoptedChain` index adoption). **Must NOT edit
  `ConformingWall.ts`** — it CALLS `buildConformingWall`/`computeUBias` (both already exported), never
  edits them. If a needed hook is missing, STOP and escalate.
- **Interface:** pure builder `buildDsOuterWall(rA, dims, opts)` → `ConformingOuterWallResult`-shaped
  output (so Phase D's dispatch and assembly can consume it uniformly). Reachable ONLY when
  `isRegionLayerEnabled()` (D-1) is true.
- **Test first:** NEW `regionDs.test.ts` — flag-off unreachable (byte-identical to today); flag-on the
  builder reproduces the A-5 research numbers (T1 ring-band population, watertight non-vacuous).
- **Gate:** flag-off byte-identical; flag-on DS outer wall matches A-5's T1/T5 within tolerance.
- **GitNexus:** `impact` on `buildConformingWall`, `computeUBias` (upstream, READ-only callers).
- **Rollback:** delete file; flag default-OFF.

### C-2 — DS outer-wall gate through the composite harness (src path)
- **Files:** NEW `research/bridge/_tierc_ds_srcpath.test.ts` (env-gated) driving `regionDs.ts` via a
  DEV hook, scored by the §V11g composite ruler.
- **Gate:** T1∧T4∧T5 held on the SRC builder's output (not just the research chain) — proves the port
  did not regress the champion mechanism. Report T2/T3/T6/T7.
- **Rollback:** delete test.

---

## 7. PHASE D — Src integration: dispatch + flag + cross-region assembly + rebaseline

Goal: the production seam. Serialized behind the running arms per §2.

### D-1 — New default-OFF flag `__pfRegionLayer`
- **Files:** NEW `src/renderers/webgpu/parametric/conforming/tierC/regionLayerFlag.ts`
  (`isRegionLayerEnabled()` reading `globalThis.__pfRegionLayer === true`, mirroring
  `isPerfectMesherEnabled`). Small, self-contained.
- **Test first:** `regionLayerFlag.test.ts` — default false; true only when explicitly set.
- **Gate:** flag defaults OFF; no other behavior.
- **Rollback:** delete file.

### D-2 — Region dispatch in `buildTierCOuterWall`
- **Files:** `src/renderers/webgpu/parametric/conforming/tierC/index.ts` (**serialize AFTER Item-3
  T3.4/T5.1**). When `isRegionLayerEnabled()` AND a manifest exists for the style, dispatch per-region
  (DS→`regionDs.ts` C-1; Gothic/GeoStar→the B-3/B-4 bay path when full-pot, else the existing K2
  patch); else fall through to today's `COUNT_UNSTABLE_STYLES` allow-list path unchanged.
- **Interface:** the region dispatch WRAPS, does not remove, `isCountUnstableStyle` — flag-off is the
  identical allow-list path.
- **Test first:** extend `rebaseline20.test.ts` (D-5) — flag-off byte-identical; flag-on dispatch
  selects the expected per-style kernel.
- **Gate:** flag-off 20-style byte-identical; flag-on routes DS/Gothic/GeoStar to the region path.
- **GitNexus:** `impact` on `buildTierCOuterWall` (upstream — MEDIUM/HIGH; report before editing).
- **Rollback:** revert; flag default-OFF.

### D-3 — Cross-region watertight assembly
- **Files:** `src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts` (**serialize AFTER
  Item-3 T3.3; CRITICAL blast radius — `gitnexus_impact` MANDATORY, gate ALL logic behind
  `__pfRegionLayer`**). Reuse T3.3's landed outer→inner ring-reconciliation contract to glue the
  region-layer outer wall (DS chain or bay-tiled Gothic) to inner wall/rim/base/cap.
- **Interface:** when the outer wall is a region-layer result AND `__pfRegionLayer` on, resample the
  outer ring at `inner.*Ring` u-stations so `outer.{top,bottom}Ring.length === inner.*` (the
  `:578–582` match), preserving ascending-U (`:603–606`). Flag-off: untouched (byte-identical).
- **Test first:** NEW `research/bridge/_tierc_regionlayer_assembly.test.ts` — assembled DS (and a
  bay-tiled Gothic full-pot) does not throw the ring-mismatch error; `nonManRawBig==0` non-vacuous on
  the ASSEMBLED full pot.
- **Gate:** assembled region-layer pot watertight non-vacuous, no ring-mismatch throw; every non-
  region-layer style's assembly untouched (D-5 fleet byte-identity).
- **Rollback:** revert; non-region-layer path structurally untouched.

### D-4 — Region-tag propagation through `assembleWatertight` (gates-spec Gap #8)
- **Files:** `WatertightAssembly.ts` (same serialization as D-3; may fold into D-3's edit).
- **Interface:** propagate `seamTriangles`/`bottomRing`/`topRing` region tags (already produced by
  `tierC/index.ts` `toOuterWallResult`) through assembly output, extended with region/bay membership,
  so S-GATES can score seam/rim/base/cap region-specifically (closes the OPEN G7 fields).
- **Test first:** extend D-3's test — assembled mesh carries per-region tags; a seam-specific
  boundary-edge count is distinguishable from a real hole.
- **Gate:** region tags survive assembly; G7 seam/rim/base/cap sub-checks report non-null.
- **Rollback:** revert tag plumbing (D-3 assembly still stands).

### D-5 — 20-style rebaseline (byte-identity + dispatch + region report)
- **Files:** extend `src/renderers/webgpu/parametric/conforming/tierC/rebaseline20.test.ts`
  (`PF_REBASELINE20=1`, test-only).
- **Assert:** (1) all 20 flag-off byte-identical (FNV fixture — proves D-2/D-3/D-4 did not disturb the
  default path); (2) with `__pfRegionLayer` on, dispatch routes exactly the manifest-covered styles
  through the region layer; (3) region-layer styles report `tris`, `passes`, `minAngleDeg`,
  `pctBelow20`, explicit `needleCount`.
- **Gate:** fleet byte-identity green (the fleet regression tripwire — must be green before D-6);
  dispatch correct; report rows emitted.
- **Rollback:** test-only.

### D-6 — Assembled watertight acceptance gate (scoped to region-layer styles)
- **Files:** `e2e/export-fidelity.spec.ts` (test-only) — scoped block: with `__pfRegionLayer=true`,
  assert `nonManifoldEdges==0`, `orientationMismatches==0`, `boundaryEdges==0` on the ASSEMBLED
  region-layer styles ONLY. Leave the fleet-wide `test.fail()` invariants intact.
- **Gate:** region-layer styles pass all three watertight invariants on the assembled export.
- **Rollback:** test-only, behind the flag.

---

## 8. PHASE E — Deferred / named (NOT built in this plan)

- **S-RESIDUAL pin plumbing** (`PinSeed` → `AssemblyWallOptions → ConformingWallOptions →
  FeatureConformingTriangulator`) — no production field exists (grep-confirmed); requires editing
  `ConformingWall.ts` (FORBIDDEN until Gyroid/FAC arms land). The verdict-driven `levelAt` seam
  (roadmap item 1, running in parallel) supersedes the knee-pin; S-RESIDUAL waits on both.
- **K1 2-locus fan fix (Gyroid A2)** — `ConformingWall.ts`/quadtree edits (forbidden). Report the
  count in A-4; fix after the running arms.
- **Universal partitioner generality**; parameter-envelope/birth-death sweeps (zero evidence for any
  champion); needle-quality element research; the DS sheet relief-cliff (EXCLUDE-class, not closed);
  the Gothic 0.117 production-band frontier (Item-5 `flankBand.ts` scope).

---

## 9. Task count per phase

| Phase | Tasks | Nature |
|---|---|---|
| A — dispatch consolidation + research validation | 6 (A-1…A-6) | research-side, no src, no flag |
| B — per-bay parallel analytic full-pot | 6 (B-0…B-5) | src: `parallelScorer.ts`, `noBridgeRefine.ts` only |
| C — DS R-STRUCT embedding to src | 2 (C-1, C-2) | NEW `regionDs.ts` + gate |
| D — src dispatch + flag + assembly + rebaseline | 6 (D-1…D-6) | shared-file, serialized behind running arms |
| E — deferred/named | 0 (named only) | — |
| **Total** | **20** | |

---

## 10. Top risks / uncertainties (rulings requested before execution)

1. **Sequencing coupling to three live arms.** Phase D cannot start until Item-3 (T3.3
   `WatertightAssembly.ts` + T3.4/T5.1 `tierC/index.ts`) AND the Gyroid/FAC `ConformingWall.ts` work
   land. If those slip, Phases A–C (all research-side / non-shared-file) still complete and de-risk the
   architecture, but the production seam stalls. **Ruling wanted:** is it acceptable to ship Phases
   A–C (research-proven layer) as a milestone while D waits on the running arms, or must D's landing be
   guaranteed in this window?
2. **Gothic full-pot may be compute-bound beyond this machine.** The tractability verdict projects
   Gothic ~18h single-thread / needs ~32 cores or GPU-offload; GeoStar is reachable (<30min at 6–8
   cores). **Ruling wanted:** is GeoStar-full-pot + Gothic-honest-report (not full-pot literal-0) an
   acceptable Phase-B deliverable, or is Gothic full-pot a hard requirement (⇒ needs a GPU-offloaded
   analytic scorer, a separate research arm not in this plan)?
3. **Cross-region assembly reuses an UNLANDED contract.** D-3 depends on Item-3 T3.3's exact
   outer→inner ring-reconciliation shape. If T3.3's escalation (risk #1 in the wire-and-validate plan
   — inner ring stations unmatchable without touching the forbidden `ConformingWall.ts`/quadtree)
   fires, the region layer inherits the same block. **Ruling wanted:** confirm the region layer should
   adopt whatever contract T3.3 lands, and defer if T3.3 itself defers.
4. **Bay-boundary contract is proven only by analogy, not measured.** Q1's R-REFINE↔R-REFINE u-column
   adoption is the SAME lock mechanism as Item-3 T3.2's periodic seam, but has never run at an
   INTERNAL bay boundary. B-0 (the bay toy) retires this before the full build — but if B-0 fails, the
   whole per-bay tiling premise (and thus Gothic/GeoStar full-pot tractability) is blocked. **Flagged
   as the single highest-leverage unknown; B-0 is the gate.**
5. **DS body sheet stays open by design.** The plan targets T1 (ring/riser) + T5 (watertight) as the
   DS "reproduced" bar per the champion kill rule, and REPORTS the ~5,552-facet sheet relief-cliff as
   the known EXCLUDE-class frontier — it does NOT claim to close it. **Ruling wanted:** confirm T1∧T4∧T5
   (not sheet closure) is the accepted DS success criterion for this plan.
6. **`__pfRegionLayer` vs `__pfPerfectMesher` interaction.** DS routes through the region layer but is
   NOT in `COUNT_UNSTABLE_STYLES`; Gothic/GeoStar are in both. The dispatch precedence (region layer
   wraps the allow-list) must be unambiguous. **Ruling wanted:** confirm region-layer-on takes
   precedence over the allow-list for manifest-covered styles, with `__pfPerfectMesher` still gating
   the K2 analytic lever the bay path calls.
