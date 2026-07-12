# PROD-TIERC — Ship the Gyroid-Knee literal-0.01 Closure (verdict-driven local refine)

**Date:** 2026-07-12. **Program:** PROD-TIERC. **Roadmap item:** 1 (Gyroid knee — "drive
`levelAt` VERDICT-DRIVEN, two-pass, not a build-time predictor"), `2026-07-12-existing-asset-roadmap.md`
§1. **Proven recipe source:** `research/bridge/_tierc_p2_5c.test.ts` +
`research/exchange/tierc/p2_5c_summary.json` (VERDICT = COVERAGE-BUG-CONFIRMED). **Format mirror:**
`docs/superpowers/plans/2026-07-12-tierc-wire-and-validate.md`.

**Premise (do not re-derive — banked by P2.5c):** GyroidManifold's last fidelity outlier — the
band-edge "knee" at `(u,t)=(0.29138, 0.71997)`, true-3D chord **0.02491654 mm** — is a **coverage
bug**, not an irreducible curved-element floor. Driving the knee cell (and near-twins) deeper through
the committed `featureLevelAt` seam closes it to **≤0.01 (measured knee 0.00711 @ commanded L13)** at
**+0.055% tris**, watertight (`nonMan==0`), NO curved elements. The single-cell escalation leaves ONE
2:1-balance transition-apron sliver on a neighbour (`worst 0.0108`, `minAngle 2.31°`); escalating the
outlier cell's **1-ring** lands the apron in the smooth zone. This plan productionizes that recipe.

Implementers are fresh subagents who know only their extracted task brief. Every exact flag name,
threshold, symbol, and file path needed is written INTO each task.

---

## 0. Sequencing & file-ownership constraint (HARD — read first)

This track **OWNS exactly two production files**:

- `src/renderers/webgpu/parametric/conforming/ConformingWall.ts`
- `src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.ts`

…plus any NEW files it creates under `src/renderers/webgpu/parametric/conforming/` and under
`research/bridge/`.

**FORBIDDEN files (owned by the running Track-1 "wire-and-validate" headline — do NOT edit):**

- `src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts`
- everything under `src/renderers/webgpu/parametric/conforming/tierC/**`

This ownership drives the single most important architecture decision in this plan (see §3, "Where the
verdict lives"): the production Gyroid outer wall is built by
`WatertightAssembly.assembleWatertight → buildConformingWall(outerSampler, {featureLines, featureLevel})`
(`WatertightAssembly.ts:543-558`). `assembleWatertight` passes only **named** fields to
`buildConformingWall` — there is **no `...opts` spread** — so a new `featureLevelAt`/`verdictRefine`
option **cannot be threaded through `WatertightAssembly.ts` without editing it (forbidden).** Therefore
the entire verdict driver is **self-gated inside the owned files, activated by a `globalThis` dev
flag** (the exact convention `isDevWallStageTimingEnabled()` / `__pfConformingAnalyticFloor` already
use — `ConformingWall.ts:282`), reading nothing new from the assembly layer.

**Serialization with sibling chains.** This track edits `ConformingWall.ts`. Two later chains also edit
`ConformingWall.ts` and MUST run **after** this track lands (per-file staging, one implementer at a
time on that file):

- the **FAC sampler-default** change (Track-1 item-2 / `__pfConformingRefine` gate at
  `ConformingWall.ts:778-783`), and
- the **Item-4 region-core** plumbing (`pinnedPoints`-class fields through `ConformingWall.ts`).

Do not start either of those against `ConformingWall.ts` until T4/T7 of THIS plan are staged. If a
task in this plan discovers it must edit a FORBIDDEN file, it STOPS and escalates to the controller —
it does not edit.

---

## 1. Global Constraints (apply to EVERY task)

1. **Flag-off byte-identity.** Every production change lands **default-OFF behind the new flag
   `__pfConformingVerdictRefine`** (helper `isConformingVerdictRefineEnabled()`, mirroring
   `isDevWallStageTimingEnabled` at `ConformingWall.ts:282`). Flag-off output MUST be **byte-identical
   to today**, proven by BOTH: (a) structural unreachability — the quadtree decoupling (T1) executes
   ONLY on the `featureRefine.levelAt !== undefined` branch, and `buildConformingWall` sets a
   non-undefined `featureLevelAt` ONLY when the flag is on, so the new code is dead when the flag is
   off; AND (b) an FNV/hash byte-identity fixture over a representative fleet including `GyroidManifold`
   (T7, the `flagOff.byteIdentical.test.ts` / `rebaseline20.test.ts` pattern — but a NEW owned test,
   since those two files are FORBIDDEN to edit).
2. **Per-file git staging only.** The user tree is dirty and multi-session. `git add <path>` per file
   your task owns — never `git add -A`/`.`. Never commit or push unless the controller asks.
3. **ESLint 0 warnings.** `npm run lint` clean (repo enforces `--max-warnings=0`; a `PostToolUse` hook
   runs `eslint` on every `.ts` edit). No `eslint-disable` unless the file already establishes it.
4. **Typecheck: no NEW errors.** `npm run typecheck` introduces zero new errors vs the pre-task
   baseline.
5. **GitNexus workflow (CLAUDE.md, binding):** run
   `gitnexus_impact({target:"<symbol>", direction:"upstream"})` **before editing any symbol** and
   report the blast radius; run `gitnexus_detect_changes()` **before committing**. Warn on
   HIGH/CRITICAL. Symbols this plan edits are hot (see §6 risk 1) — impact analysis is not optional.
   If the GitNexus MCP is unavailable, say so explicitly in the task report; do not silently skip.
6. **TDD.** Write the named test file(s) FIRST (red), then implementation (green). Paths given per task.
7. **Heavy runs are env-gated + forks-pooled.** Multi-minute gates run under their own
   `vitest.*.config.ts` (`pool:'forks'`, explicit `testTimeout`), env-gated OUT of the fast CI suite,
   with breadcrumb watchdog crumbs and `os.setPriority(PRIORITY_ABOVE_NORMAL)` (Windows EcoQoS ~4×).
   Mirror `research/bridge/_tierc_p2_5c.test.ts` + `vitest.tierc_p2_5c.config.ts`.
8. **No curved elements.** The recipe is pure quadtree local refinement + CDT (existing kernel). No
   apexPn/crestStrip/P^n patches enter this plan.

---

## 2. Dependency graph (edges)

```
Foundations (owned files, serial on the two owned files):
  T0 (impact pre-flight) ─► T1 (quadtree decouple, PeriodicBalancedQuadtree.ts)
  T1 ─► T4
  T2 (verdict scorer, NEW verdictRefine.ts) ─► T3 (sparse 1-ring levelAt, verdictRefine.ts) ─► T4
  T5 (candidate hot-cell scope, verdictRefine.ts) ─► T4
  T4 (two-pass loop + flag, ConformingWall.ts)  ── the integration keystone
Gates (after T4):
  T4 ─► T6 (production knee-closure heavy gate)
  T4 ─► T7 (20-style flag-off byte-identity)
  T4 ─► T8 (perf: two-pass wall-time delta + default-ON viability decision)
  T4 ─► T9 (generalization can-fail: DragonScales smooth-C2 sheet)
```

`ConformingWall.ts` is touched only by **T4** (single writer). `PeriodicBalancedQuadtree.ts` only by
**T1**. `verdictRefine.ts` (NEW) by **T2, T3, T5** (serialize in that order). Tests are disjoint.

---

## 3. Where the verdict lives (the resolved open question — read before T2/T4)

**Decision: a build-time, two-pass VERDICT loop INSIDE `buildConformingWall` (owned), self-gated by
`__pfConformingVerdictRefine`, using a SPARSE targeted chord/max-sag scan over candidate hot cells —
NOT a full dense scan, NOT a build-time closed-form predictor. It ships DEV-FLAGGED default-OFF; a
perf-optimized candidate predictor / partial-rebuild is an explicit deferred follow-up (T8 decides
whether default-ON is ever viable).**

Justification, grounded in the code and the corpus:

- **Why two-pass, not a predictor.** P2.4 root cause (roadmap §1): the production base sizing field
  (`MetricSizingField`, FD curvature) **under-reads true curvature 1.2–20× broadly near features**, so
  NO build-time delta against it discriminates the knee — every predictor arm (P2.1–P2.4) failed. The
  roadmap's explicit ruling: *"drive `levelAt` from a Newton verdict pass (two-pass build), not a
  build-time predictor; the predictor is a later perf optimization, not the unblock."* The precedent is
  `refineToZeroOutliers` (`tierC/noBridgeRefine.ts`) — a verdict-driven iterate-to-zero loop that drove
  Gothic 32→0 / GeoStar 791→0 on the K2 path. This plan adapts its STRUCTURE (`tolMm`, `maxPass`,
  whole-candidate scoring, iterate-to-zero) for the **K1 conforming-quadtree** path — it does not call
  it (that code is cdt2d-chart-specific and lives in a FORBIDDEN dir; T2 reimplements the tiny scorer
  in the owned `verdictRefine.ts`, importing only pure leaf helpers if any).
- **Why inside `buildConformingWall`.** The two-pass must build → score → escalate → REBUILD the outer
  wall. The only place that can drive a rebuild WITHOUT editing the forbidden `WatertightAssembly.ts`
  is `buildConformingWall` itself (it already owns the search + final build). T4 extracts today's body
  into `buildConformingWallOnce(sampler, opts)` and wraps it in the loop; flag-off ⇒
  `buildConformingWall === buildConformingWallOnce ===` today (byte-identical).
- **Why the flag is a `globalThis` read, not a new opt.** `assembleWatertight` passes only named fields
  to `buildConformingWall` (`WatertightAssembly.ts:524-558`), and that file is FORBIDDEN, so a new opt
  cannot reach the outer wall. Reading `__pfConformingVerdictRefine` from `globalThis` inside the owned
  file (exact `isDevWallStageTimingEnabled` convention) needs zero assembly-layer change.
- **Why sparse, not dense.** The P2.5c instrument scored the WHOLE 2.24M-tri mesh per arm (~411 s / 8
  arms). A full dense-arc scan is unaffordable at export time. The scan is scoped to **candidate hot
  cells** (T5): facets adjacent to the band-edge `featureLines` AND/OR whose sizing-field curvature
  reads near-but-below the refine threshold — a cheap superset that provably contains the knee (the
  knee is band-edge-adjacent, `radial 0.287`). Newton/projection-confirm runs ONLY on that sparse set.
- **Reaching OFF-contour cells (T1).** Even scoped, the escalated cells are OFF the band-edge contour,
  so `belowFeatureFloorTest` short-circuits them at `PeriodicBalancedQuadtree.ts:718`
  (`if (!hitTest()) return false;`) BEFORE consulting `featureLevelAt`. T1 **decouples** `levelAt` from
  that short-circuit (the task-endorsed "cleaner" option over injecting feature-graph crosses): when
  `levelAt` is present, a cell that `levelAt` commands deeper than its current level refines **even
  off-contour**. Because `levelAt` is a sparse bounded-array lookup returning `0` everywhere except the
  handful of escalation targets, the per-cell cost is `O(log N_targets)`; T8 measures the aggregate.
- **Budget interaction is already handled.** `belowFeatureFloorTest` is deliberately SHARED between
  `searchBudgetScale` and the final build (P2.5 design, `ConformingWall.ts:885-895` passes
  `featureRefine` into the search), so escalated cells are NOT coarsened back by the `budgetMode:'cap'`
  budget. The loop fixes pass-0's `targetScale` and rebuilds only the FINAL quadtree per escalation
  round (no budget re-search) to bound cost to ~1 extra final-build/round (~2–3 rounds; P2.5c converges
  by commanded L13).

---

## 4. Tasks

### T0 — Impact pre-flight (analysis only, no edit)

- **Do:** `gitnexus_impact({target:"belowFeatureFloorTest", direction:"upstream"})`,
  `{target:"buildConformingWall"}`, `{target:"shouldSplitHierarchyNode"}`,
  `{target:"searchBudgetScale"}`. Report blast radius (direct callers, affected export flows, risk
  level) to the controller. Confirm `belowFeatureFloorTest` is reached from BOTH `refine` (fresh build)
  and `shouldSplitHierarchyNode` (budget-search) — both must stay correct after T1.
- **Gate:** blast-radius report delivered; HIGH/CRITICAL flagged. No code touched.

### T1 — Decouple `featureLevelAt` from the `intersects` short-circuit (PeriodicBalancedQuadtree.ts)

- **File:** `src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.ts` —
  `belowFeatureFloorTest` (currently lines ~696-725). **Owned file, single writer.**
- **Change (exact):** in the `featureRefine.levelAt !== undefined` branch (currently `:717-724`),
  replace the `if (!hitTest()) return false;` short-circuit so an off-contour cell can still refine
  toward a `levelAt` command. Target semantics:
  ```
  if (level >= cap) return false;
  const size = Math.max(uSize, tSize);
  const commanded = featureRefine.levelAt(iu * uSize, it * tSize, size);
  // On-contour: keep the featureLevel floor (existing behaviour). Off-contour:
  // still honour a levelAt escalation. levelAt returns <= featureLevel (typically 0)
  // for non-target cells, so off-contour non-targets never refine (byte-identical intent).
  const onContour = hitTest();
  const floor = onContour ? featureRefine.level : 0;
  const target = Math.max(floor, commanded);
  return level < Math.min(target, cap);
  ```
  Preserve the `levelAt === undefined` legacy branch (`:713-715`) EXACTLY (that is the production /
  flag-off path — byte-identical). Note in a comment that `hitTest()` is only evaluated when needed
  (short-circuit `commanded > level` first if cheaper, to avoid the cached-intersection cost on the
  vast non-target majority — measure in T8; correctness first).
- **GitNexus:** `impact` on `belowFeatureFloorTest` already done in T0 — report HIGH if flagged before
  editing.
- **Test first (owned, fast unit):** NEW
  `src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.verdictReach.test.ts`. Build a
  small quadtree with a `featureRefine` whose `intersects` returns FALSE for a chosen interior cell but
  whose `levelAt` commands that cell to `level+2`; assert the cell IS refined to the commanded level
  (off-contour reach). Second case: `levelAt` returns `0` for all cells ⇒ tree identical to a build
  with `levelAt: undefined` (the load-bearing non-regression). Third: `levelAt === undefined` path
  unchanged.
- **Gate:** off-contour `levelAt` reaches the cell; `levelAt`-returns-0 build ≡ `levelAt`-undefined
  build; legacy branch untouched.
- **Rollback:** revert the one branch; the `levelAt === undefined` path guarantees production safety
  regardless.

### T2 — Production chord/max-sag verdict scorer (NEW module)

- **File:** NEW `src/renderers/webgpu/parametric/conforming/verdictRefine.ts`. **Owned; do not import
  from `tierC/**` barrels** (the `tierC/index` barrel statically pulls `node:worker_threads` into the
  browser bundle — documented at `tierC/index.ts:55-62`; import only pure leaf helpers by direct path
  if reused, else reimplement the ~10-line dense-bary locally).
- **Interface:** `scoreCandidateFacets(mesh, liftSampler, candidates, tolMm) → OutlierCell[]` where the
  mesh is the `(u,t)` wall output (`vertices: Float32Array` of `(u,t,surfaceId?)`, `indices`), and
  `liftSampler` is the **fidelity** sampler that produces final geometry — `opts.efgSampler ?? sampler`
  (warp-composed if present, so the verdict measures the surface the emitted triangles ACTUALLY carry,
  not the plain sizing surface). For each candidate facet: dense-barycentric sample (start the P2.5c
  `denseBary(8)` lattice), lift each `(u,t)` via `liftSampler.position`, measure the max deviation of
  the true surface point from the planar triangle (the standard chord/max-sag metric — needs NO nearest
  -point projection; it is the same signal `maxSagMm` sizing already uses, so it is production-native
  and STYLE-AGNOSTIC — no manifest `rA` required, which is what makes T9 generalization possible).
  Return the cells (keyed by `featureLevel`-grid `(iu,it)`) whose worst > `tolMm`, with their worst.
- **Test first (owned, fast unit):** NEW `verdictRefine.scorer.test.ts` — on a `SyntheticCylinderSampler`
  perturbed by a known analytic bump, a coarse facet over the bump scores worst > tol and a fine facet
  scores ≤ tol; a flat facet scores ~0. Assert the metric matches a hand-computed sag on one triangle.
- **Gate:** scorer flags exactly the under-tessellated facets; flat facets clean; unit-exact on one
  triangle.
- **Rollback:** delete the module (nothing imports it until T4).

### T3 — Sparse **1-ring** `featureLevelAt` builder (verdictRefine.ts)

- **File:** `verdictRefine.ts` (append). **Owned; serialize after T2.**
- **Interface:** `buildOneRingLevelAt(outliers, featureLevel, uBias, maxLevel) →
  (u0,t0,size)=>number`. For each outlier cell, escalate the cell AND its **1-ring** (±1 cell in `iu`
  at the `featureLevel+uBias` u-resolution and ±1 in `it` at `featureLevel`) to `min(level+1, maxLevel)`
  — the recipe's #2 fix: the single-cell version left one 2:1-balance transition-apron sliver
  (`0.0108`, `minAngle 2.31°`); escalating the 1-ring lands the apron in the smooth zone. Reuse the
  P2.5c `makeSparseLevelAt` binary-search structure (`_tierc_p2_5c.test.ts:242-268`) but expand each
  flag to its 1-ring footprint. Wrap the periodic u-seam. Non-target cells return `0`.
- **Test first (owned, fast unit):** NEW `verdictRefine.oneRing.test.ts` — one outlier at a known
  `(u,t)` ⇒ the returned `levelAt` commands `level+1` on that cell and its 8 (periodic-wrapped)
  neighbours, `0` elsewhere; respects `maxLevel` cap; two adjacent outliers merge their rings without
  double-counting.
- **Gate:** 1-ring footprint correct + periodic-wrapped + `maxLevel`-capped; `0` off-target.
- **Rollback:** revert the appended function.

### T5 — Candidate hot-cell scope (verdictRefine.ts) — the sparse-scan selector

- **File:** `verdictRefine.ts` (append). **Owned; may land in parallel with T2/T3 but before T4.**
- **Interface:** `selectCandidateFacets(mesh, featureRefine, sizingField?) → number[]` (facet
  indices). A cheap superset of the potential outliers: facets whose feature-grid cell is **adjacent**
  (within 1 ring) to a band-edge `featureLines` crossing (the knee sits just off the contour —
  `contourCrossed=false` but `radial 0.287` puts it in the near-band), UNION facets whose sizing-field
  curvature reads within a margin below the refine threshold (the P2.4 "under-read" band). Must contain
  the knee cell `(0.29138, 0.71997)` for the Gyroid dims and be a SMALL fraction of total facets.
- **Test first (owned, fast unit):** NEW `verdictRefine.candidates.test.ts` — on a synthetic
  feature-lined wall, the candidate set (a) contains a hand-placed off-contour near-band facet, (b)
  excludes deep-smooth facets, (c) is < ~5% of facets. On the real Gyroid outer wall (guarded, heavier
  — may live in the T6 heavy config instead if too slow for the fast suite), assert the knee facet is
  in the candidate set.
- **Gate:** candidate set contains the knee, excludes deep-smooth, small fraction.
- **Rollback:** revert the appended function.

### T4 — Two-pass verdict loop + `__pfConformingVerdictRefine` flag (ConformingWall.ts) — KEYSTONE

- **File:** `src/renderers/webgpu/parametric/conforming/ConformingWall.ts`. **Owned, single writer.**
- **GitNexus:** `impact` on `buildConformingWall` (T0) — this is the export hot path; report before
  editing; gate ALL new behaviour behind the flag.
- **Change:**
  1. Add the flag helper next to `isDevWallStageTimingEnabled` (`:282`):
     ```
     function isConformingVerdictRefineEnabled(): boolean {
       return (globalThis as unknown as { __pfConformingVerdictRefine?: boolean })
         .__pfConformingVerdictRefine === true;
     }
     ```
  2. Extract today's `buildConformingWall` body verbatim into an internal
     `buildConformingWallOnce(sampler, opts)` (same signature/return). `buildConformingWall` becomes:
     ```
     if (!isConformingVerdictRefineEnabled()
         || opts.surfaceId !== 0            // outer wall only (features are outer-only)
         || (opts.featureLines?.length ?? 0) === 0
         || opts.featureLevelAt !== undefined) {   // an explicit caller levelAt wins; don't double-drive
       return buildConformingWallOnce(sampler, opts);   // ← byte-identical production/flag-off path
     }
     // flag-on verdict loop:
     let wall = buildConformingWallOnce(sampler, opts);
     const lift = opts.efgSampler ?? sampler;
     for (let pass = 0; pass < VERDICT_MAX_PASS; pass++) {
       const cands = selectCandidateFacets(wall, /*featureRefine*/…, /*sizingField*/…);
       const outliers = scoreCandidateFacets(wall, lift, cands, VERDICT_TOL_MM);
       if (outliers.length === 0) break;
       const levelAt = buildOneRingLevelAt(outliers, featureLevel, opts.uBias ?? 0, opts.maxLevel);
       wall = buildConformingWallOnce(sampler, { ...opts, featureLevelAt: levelAt });
     }
     return wall;
     ```
     with `VERDICT_MAX_PASS = 4` and `VERDICT_TOL_MM = 0.01` as named consts (comment the P2.5c
     convergence-by-L13 evidence). To bound cost, the escalation rebuilds may reuse pass-0's resolved
     `targetScale` (skip the budget re-search) — expose that from `buildConformingWallOnce` or thread a
     `fixedScale?` internal opt; keep it internal to the owned file.
- **Test first (owned, fast unit):** NEW `ConformingWall.verdictRefine.test.ts`. (a) **Flag off** ⇒
  `buildConformingWall` output hash === `buildConformingWallOnce` output hash for a
  `SyntheticCylinderSampler` outer feature wall (structural + hash). (b) **Flag on**, synthetic
  bump-on-a-feature-wall ⇒ outlier count DROPS vs flag-off and `nonMan==0` (small/fast surface, not the
  full Gyroid — that is T6). Restore `globalThis.__pfConformingVerdictRefine` in a `finally`.
- **Gate:** flag-off hash-identical; flag-on reduces outliers, stays watertight.
- **Rollback:** the flag default-OFF + the early-return guard make revert a one-branch removal; the
  extracted `buildConformingWallOnce` is behaviourally today's code.

### T6 — Production knee-closure heavy gate (research/bridge, end-to-end, NO injected crosses)

- **Files:** NEW `research/bridge/_gyroid_knee_ship.test.ts` + `vitest.gyroid_knee_ship.config.ts`
  (`pool:'forks'`, env-gated `PF_GYROID_KNEE_SHIP=1`, `testTimeout` ~44 min, AboveNormal + breadcrumbs
  — mirror `_tierc_p2_5c.test.ts` / `vitest.tierc_p2_5c.config.ts`).
- **Interface:** build the REAL production Gyroid outer wall via `buildConformingWall` with the exact
  production feature setup (band-edge `generalCurves` as `featureLines`, `featureLevel 11`,
  `TIERC_COMMON_DIMS`, `AF_PROD_OPTS`, `computeUBias`) — reuse the P2.5c `buildOuterDirect` harness but
  **drive closure through `globalThis.__pfConformingVerdictRefine = true`** (the shipped flag), NOT the
  P2.5c injected general-curve crosses. Score with the P2.5c dense-bary + `newtonNearest` instrument
  against `getManifest('GyroidManifold').truth.rA` for an apples-to-apples number vs the banked
  champion.
- **Gate (measurable, pre-registered):** with the flag ON: knee worst **≤ 0.01** (target ≈ 0.0071),
  **fleet worst ≤ 0.01** (the 1-ring apron closed — the number the single-cell P2.5c arm left at
  0.0108), `nonMan == 0`, tri cost **< 1%** vs the flag-off baseline; AND a flag-OFF baseline arm
  reproduces `worst ≈ 0.02491654` (non-vacuity). Bank arms to
  `research/exchange/tierc/gyroid_knee_ship_summary.json` (resumable, INSTANT-on-complete).
- **Rollback:** test-only.

### T7 — 20-style flag-off byte-identity fixture (owned test)

- **Files:** NEW `src/renderers/webgpu/parametric/conforming/verdictRefine.flagOff.byteIdentical.test.ts`
  (owned — `rebaseline20.test.ts`/`flagOff.byteIdentical.test.ts` are FORBIDDEN to edit, so this is a
  new, disjoint fixture). Config: fast suite if a small representative set is quick, else a dedicated
  env-gated `vitest.verdict_byteid.config.ts`.
- **Assert:** with `__pfConformingVerdictRefine` unset/false, an FNV/hash over the outer-wall (or full
  assembly) mesh bins is **identical** to a golden for a representative fleet that MUST include
  `GyroidManifold` (the target style), plus a smooth style (e.g. `SmoothProfile`) and a feature-dense
  style. This is the fleet regression tripwire proving T1+T4 did not disturb the default path.
- **Gate:** fleet flag-off byte-identical (green).
- **Rollback:** test-only.

### T8 — Perf gate + default-ON viability decision (research/bridge, measurement)

- **Files:** NEW `research/bridge/_gyroid_knee_perf.test.ts` (env-gated, forks).
- **Measure:** flag-ON vs flag-OFF **outer-wall build wall-time** on (a) Gyroid (knee present ⇒ ~2–3
  escalation rounds) and (b) a smooth no-feature/near-feature style (verdict loop should early-exit
  pass-0 ⇒ near-zero overhead). Break down: candidate-selection cost, sparse-scan cost, extra
  final-build cost. Include the T1 concern — the per-cell `levelAt` call over the whole tree during
  escalation rebuilds.
- **Gate (decision, not pass/fail):** record the wall-time multiplier and emit an explicit RECOMMENDATION
  to the controller: (i) default-ON viable (overhead within budget), or (ii) stays DEV-FLAGGED and a
  perf-optimized candidate predictor / partial-rebuild is the deferred follow-up (the roadmap's
  explicitly deferred "later perf optimization"). Do NOT flip any default — that is a controller/user
  call.
- **Rollback:** test-only.

### T9 — Generalization can-fail: DragonScales smooth-C2 sheet (research/bridge)

- **Files:** NEW `research/bridge/_ds_smoothsheet_verdict.test.ts` (env-gated, forks).
- **Rationale (roadmap §DragonScales):** the same local-refine is *mechanistically predicted* to close
  the DS **body-wide SMOOTH-C2 sheet** chord-sag (the ~5,552-facet component, all ≥2 mm from rings) —
  **UNTESTED**. Every DS refutation on record was GLOBAL/row-structured; true per-facet local refinement
  on the smooth-C2 sheet has never run.
- **Interface:** build the DS outer wall (its production feature setup) with
  `__pfConformingVerdictRefine` on; score the smooth-C2 sheet component against `getManifest('DragonScales')`
  truth (or the sampler-native max-sag verdict for a style-agnostic read).
- **Gate (honest can-fail):** EITHER (PASS) the sheet chord closes to ≤0.01 at sub-few-% tris,
  watertight — confirming the prediction and widening the win beyond Gyroid; OR (FAIL) record where the
  smooth-C2 rate stalls (the C2 boundary the roadmap reserves for curved elements "if at all"). Either
  way **no default changes**; the result feeds the roadmap.
- **Rollback:** test-only.

---

## 5. Deferred (explicitly OUT of scope — named so the controller can schedule them)

- **Perf-optimized candidate predictor / partial (non-full) rebuild** — deferred pending T8's
  recommendation; the roadmap's "later perf optimization, not the unblock."
- **`bruteAnchoredRedPerp` confirm of the 0.0247 champion** (roadmap caveat: `newtonNearest` can
  overstate true-3D up to ~7× on tangled lattices; the Gyroid number is "likely honest" on the
  bit-exact twin but unconfirmed) — a research nicety, not a ship blocker.
- **Threading `featureLevelAt` through `WatertightAssembly.ts` / `AssemblyWallOptions`** — would let a
  caller (or the region-core) drive `levelAt` explicitly; blocked because that file is FORBIDDEN here.
  If ever wanted, it sequences after Track-1 releases the file.
- **Default-ON flip of `__pfConformingVerdictRefine`** — a controller/user decision after T6+T8, not an
  engineering default.

---

## 6. Risks (top 6) + mitigations

1. **`belowFeatureFloorTest` / `buildConformingWall` are export hot-path symbols — a regression breaks
   every style's mesh.** *Mitigation:* the decoupling (T1) lives ONLY on the `levelAt !== undefined`
   branch and `buildConformingWall` sets a defined `featureLevelAt` ONLY flag-on ⇒ new code is
   structurally dead when the flag is off; T7's 20-style flag-off FNV fixture is the fleet tripwire and
   must be green before T6/T8. Mandatory `gitnexus_impact` (T0).
2. **Decoupling makes `levelAt` consulted on the whole tree during escalation rebuilds (T1) ⇒ cost blow
   -up.** *Mitigation:* `levelAt` is a sparse bounded-array lookup returning `0` off-target
   (`O(log N_targets)`); reuse pass-0's `targetScale` so escalation rebuilds skip the budget re-search;
   short-circuit `commanded > level` before the cached `hitTest()`; T8 measures and gates the
   default-ON decision on the real number.
3. **The sparse candidate scope (T5) MISSES the true worst cell ⇒ verdict loop declares convergence
   while an outlier survives.** *Mitigation:* T5's gate asserts the knee is in the candidate set on the
   real Gyroid wall; T6 scores with the FULL P2.5c instrument (dense-bary + Newton over the knee
   region) as the acceptance guard, so a missed cell fails T6 loudly. If T6 fails, widen the candidate
   band (a scope tune), not the mechanism.
4. **1-ring escalation still leaves a 2:1-balance apron sliver (recipe #2 under-delivers on the real
   balanced quadtree).** *Mitigation:* T6's fleet-worst ≤0.01 gate catches it directly; if it persists,
   escalate the 2-ring (bounded), still <1% tris — a parameter, not a redesign; record the min-angle vs
   the P2.5c `2.31°` apron.
5. **Budget `cap` mode coarsens the escalated cells back (undoing closure).** *Mitigation:*
   `belowFeatureFloorTest` is SHARED between `searchBudgetScale` and the final build by construction
   (P2.5 design), so the search already accounts for the escalation; T6's tri-count + knee-level
   assertions confirm the escalated cells survived. If they don't, the escalation rounds skip the
   budget re-search (T4's `fixedScale`) so the cap cannot re-coarsen them.
6. **Import hygiene: pulling scorer helpers from `tierC/**` drags `node:worker_threads` into the browser
   bundle (documented boot-crash, `tierC/index.ts:55-62`).** *Mitigation:* `verdictRefine.ts` imports
   NO `tierC` barrel; it reimplements the ~10-line dense-bary or imports only a pure leaf by direct
   path. ESLint + `npm run build` sanity on the owned module.

---

## 7. Definition of done

- T1 + T4 landed behind `__pfConformingVerdictRefine` (default-OFF), owned files only.
- T7 fleet flag-off byte-identity green (incl. GyroidManifold).
- T6 production gate: Gyroid knee ≤0.01, fleet worst ≤0.01, `nonMan==0`, <1% tris, non-vacuous baseline.
- T8 perf number recorded + default-ON recommendation delivered to the controller.
- T9 DS smooth-C2 sheet result recorded (pass or honest fail) — feeds the roadmap.
- No FORBIDDEN file touched; `ConformingWall.ts` released for the FAC + region-core chains.
