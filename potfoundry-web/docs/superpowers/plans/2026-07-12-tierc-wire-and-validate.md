# PROD-TIERC — Wire-and-Validate Existing Levers (items 3, 5, 6, +2, +7 spec, +4 outline)

**Date:** 2026-07-12. **Program:** PROD-TIERC. **Source of the item list:**
`research/lab/2026-07-12-existing-asset-roadmap.md` (§"Prioritized action list").
**Premise (roadmap meta-finding):** the open export-fidelity frontiers this plan touches are
*wiring + validation of already-built, flag-gated levers*, not new research.

This plan covers roadmap items **3 (headline), 5, 6**, a **conditional item-2 flip**, an
**item-7 research-arm spec (test-file-only)**, and an **OUTLINE ONLY for item 4**. It deliberately
does NOT cover roadmap items **1 (Gyroid levelAt targeting)** or the **featureAlignedCell true-3D
confirm** — those are the two research arms running in parallel right now and own their own tasks.

Implementers are fresh subagents who know only their extracted task brief. Every exact flag name,
threshold, style ID, domain, and file path needed is written INTO each task.

---

## 0. Sequencing constraint (HARD — read first)

Two research arms are running in parallel: **Gyroid `levelAt` targeting** (P2.5b — edits
`ConformingWallOptions.featureLevelAt` plumbing and the quadtree level dispatch) and the
**featureAlignedCell true-3D confirm** (FAC-3D). Their later tasks will edit:

- `src/renderers/webgpu/parametric/conforming/ConformingWall.ts`
- `src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.ts`

**No task in THIS plan may edit either of those two files until those arms' later tasks land.**
Any task that discovers it needs to edit them must STOP and escalate to the controller rather than
edit. Verified touch-points that make this bite:
- The featureAlignedCell sampler gate (`__pfConformingRefine`) is in `ConformingWall.ts:778-783`
  (`buildWallMeshAtScale` passes the sampler to `triangulateQuadtreeWithFeatures` only when
  `refineEnabled`). This is why **item-2 (T2.1) is doubly-blocked** (see T2.1).
- `railLines` are already threaded through `ConformingWall.ts` (`:846,903,908`) — item-6 (T6.x) is
  therefore a **measurement/exercise** task on the existing threading, NOT a re-wire.

Tasks in THIS plan that touch shared files and MUST be serialized (per-file staging, one implementer
at a time on each file):
- `src/renderers/webgpu/parametric/conforming/tierC/index.ts` — T3.2, T3.3, T3.4, T5.1 (serialize in
  that order; they all edit `buildTierCOuterWall`).
- `src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts` — T3.3 only (CRITICAL blast
  radius — see Global Constraints).

---

## 1. Global Constraints (apply to EVERY task)

1. **Flag-off byte-identity / golden-fixture proof.** Every production-path change lands **default-OFF
   behind its existing (or a new, default-OFF) dev flag**. With the flag off the output MUST be
   byte-identical to today, proven by one of: (a) the code no-op branch is structurally unreachable
   when the flag is off; (b) an FNV/hash byte-identity fixture over the mesh bins (the
   `flagOff.byteIdentical.test.ts` / `rebaseline20.test.ts` pattern); (c) a golden-fixture diff. A
   task that changes a **default** (T2.1 only) is a deliberate output change and instead requires a
   **golden re-baseline UPDATE** for exactly the affected style(s) plus an explicit note — never a
   silent change.
2. **Per-file git staging only.** The user tree is dirty and multi-session. Stage only the files your
   task owns (`git add <path>` per file), never `git add -A`/`.`. Never commit or push unless the
   controller asks.
3. **ESLint 0 warnings.** `npm run lint` must be clean (the repo enforces 0-warnings). No
   `eslint-disable` unless the surrounding file already establishes the pattern.
4. **Typecheck: no NEW errors.** `npm run typecheck` must introduce zero new errors vs the pre-task
   baseline (the tree may carry pre-existing errors; do not add to them).
5. **GitNexus workflow (CLAUDE.md §"GitNexus", binding):** run
   `gitnexus_impact({target:"<symbol>", direction:"upstream"})` **before editing any symbol** and
   report blast radius; run `gitnexus_detect_changes()` **before committing** to confirm only the
   expected symbols/flows changed. **If the GitNexus MCP is unavailable to you, say so explicitly in
   your task report and the controller will run it** — do not silently skip it. Warn on HIGH/CRITICAL.
6. **WGSL alignment / style-ID permanence.** No task here writes WGSL, but if a change ever touches a
   shader struct, honor std140/std430 alignment. Style IDs in `STYLE_REGISTRY` are permanent
   (serialized into localStorage) — never rename/renumber `GothicArches`/`GeometricStar`/etc.
7. **TDD.** Write the named test file(s) FIRST (red), then the implementation (green). Test file paths
   are given per task.
8. **Heavy runs are env-gated + forks-pooled.** Multi-minute gates run under their own
   `vitest.*.config.ts` (`pool:'forks'`, explicit `testTimeout`), env-gated OUT of the fast CI suite,
   with `PF_PT_BREADCRUMB` 30s watchdog crumbs and AboveNormal process priority (Windows EcoQoS ~4×).

---

## 2. Dependency graph (edges)

```
Item 3 (HEADLINE, serial chain):
  T3.1 ─► T3.2 ─► T3.3 ─► T3.4 ─► T3.5 ─► T3.6 ─► T3.7(USER GATE)
Item 5 (interleaves; shares tierC/index.ts → after T3.4):
  T5.1 ─► T5.2
  T5.1 ─► T5.3
Item 6 (fully disjoint — test/e2e only):
  T6.1     (independent; may run anytime)
Item 2 (one conditional task):
  T2.1     (BLOCKED behind: FAC-3D arm PASS  AND  running-arms' ConformingWall.ts work)
Item 7 (research spec; test-only, no src):
  T7.1     (independent; may run anytime)
Item 4: OUTLINE ONLY — no tasks (see §5).
```

---

## 3. Item 3 — Ship the C2 true-0.01 win for Gothic + GeoStar (HEADLINE)

**What's already proven (do not re-litigate):** the C2 `surfaceSource:'analytic'` lever is validated
end-to-end — Gothic full CI patch **18,045 tris / 8 passes / 0 outliers / max 0.009952 mm** vs the
exact `getManifest('GothicArches').truth.rA` (`C2-full-patch-verdict.md`), GeoStar **0/5071**
(`roadmap §Gothic/GeoStar`). The lever is off ONLY because the parent `__pfPerfectMesher` flag never
flips, which is blocked on **(a) seam-share integration, (b) a 20-style rebaseline, (c) the
finite-needle concession (a USER product decision).** This item builds/validates (a)+(b), threads the
analytic lever behind a new default-OFF sub-flag, and ISOLATES (c) as an explicit user gate.

### What "seam-share" concretely requires (dug out of the verdicts + code)

The analytic-surface K2 outer wall (`buildTierCOuterWall`, flag-on) emits a
`ConformingOuterWallResult { vertices, indices, seamTriangles, gridVertexCount, bottomRing, topRing }`
via `toOuterWallResult` (`tierC/index.ts:91-127`). For `assembleWatertight`
(`WatertightAssembly.ts`) to stitch it watertight to the rest of the pot, it must share vertices at
**three seams the current cdt2d-over-[0,1] build does NOT share:**

1. **Periodic u=0 / u=1 wrap seam.** `cdt2d` triangulates the full `[0,1]` u-domain but does **not**
   dedupe/share vertex indices across the u=0/u=1 seam (`tierC/index.ts:84-89` doc), unlike the
   production quadtree's shared-vertex contract. The two seam columns are not even guaranteed to sit
   at matching t-stations → they cannot simply be deduped; a **locked shared seam column** (identical
   t-stations both sides, single index set) must be built into the protected complex.
2. **t=1 rim/lip join (`topRing`).** `assembleWatertight` shares the wall rings **by index** and
   **requires matching counts**: `nRingActual = outer.bottomRing.length` and it throws if
   `inner.bottomRing.length !== nRingActual` (`WatertightAssembly.ts:578-582`); rings are then
   `remap`-shared (`:603-606`). So the K2 outer `topRing` must match the quadtree inner wall's top
   ring count AND u-ordering (ascending U).
3. **t=0 base/foot join (`bottomRing`).** Same contract as (2) for the base ring.

The inner wall / rim / base / cap remain `WatertightAssembly`-owned and unchanged; only the Tier-C
outer wall is reconciled to their ring contract. **Acceptance test = the existing watertight gate**
`e2e/export-fidelity.spec.ts` invariants `nonManifoldEdges==0`, `orientationMismatches==0`,
`boundaryEdges==0` on the ASSEMBLED Gothic/GeoStar export (these are RED / `test.fail()` at HEAD for
the whole fleet; this item flips them GREEN for Gothic+GeoStar as a scoped subset).

> None of item 3 edits `ConformingWall.ts`/`PeriodicBalancedQuadtree.ts`: the K2 outer wall uses
> `cdt2d`, not the quadtree, and the inner ring stations are READ (`inner.topRing`/`inner.bottomRing`,
> already exposed) and resampled — never re-derived by editing the quadtree.

---

### T3.1 — Characterize the seam-share gaps (probe, test-only)

- **Files:** NEW `research/bridge/_tierc_seamshare_probe.test.ts` (research/bridge; no src edit).
  Config: NEW `vitest.tierc_seamshare.config.ts` (`pool:'forks'`, env-gated, mirror
  `vitest.tierc_c2full.config.ts`).
- **Interface exercised:** `buildTierCOuterWall(sampler, opts, 'GothicArches')` with
  `globalThis.__pfPerfectMesher = true`, full domain `{uLo:0,uHi:1,tLo:0,tHi:1}`, and the production
  inner wall from `buildConformingWall` for the same dims (`{H:120,Rt:50,Rb:40}`).
- **Assert / record (ndjson to `research/exchange/tierc/seamshare_*.ndjson`):** (1) u=0 vs u=1
  boundary vertices are NOT index-shared and their t-stations differ; (2)
  `outer.bottomRing.length` vs `inner.bottomRing.length` and `outer.topRing.length` vs
  `inner.topRing.length` (the exact mismatch the assembler throws on); (3) each ring's u-ordering.
- **Gate (measurable):** the probe runs green and emits the three concrete gap measurements. This
  turns the prose contract above into pinned numbers the downstream tasks target.
- **Rollback:** delete the test file (no src touched).

### T3.2 — Lock a shared periodic u-seam column in the K2 outer wall

- **Files:** `tierC/morseComplex.ts` (`buildProtectedComplex` — add a locked periodic-seam ChainSpec
  at u=0≡u=1 with identical t-stations), `tierC/index.ts` (`toOuterWallResult` — dedupe the seam
  column to a single index set, remap `indices`). Both are `tierC/` (disjoint from forbidden files).
- **Interface:** the seam lock is active ONLY on the flag-on path (`isPerfectMesherEnabled()` true);
  flag-off `buildTierCOuterWall` still pure-delegates (byte-identical, unchanged).
- **Test first:** extend `research/bridge/_tierc_seamshare_probe.test.ts` to assert, on the flag-on
  Gothic outer wall: u=0/u=1 vertices are now a SINGLE shared index set (t-stations equal), and
  `nonManifoldByIndex(indices)==0` **non-vacuous** (injecting a duplicate triangle on a shared edge
  must move the count above 0). Re-run the analytic 0-outlier gate (research-side `surfaceSource:
  'analytic'` via `RefineOptions`, as C2-full did) to confirm the seam lock did NOT reopen fidelity
  outliers or new slivers.
- **Gate:** seam column single-indexed + outer-wall `nonManifoldByIndex==0` non-vacuous + analytic
  fidelity still 0 outliers.
- **Rollback:** revert both files; flag-off byte-identity fixture (T3.5) still green.

### T3.3 — Reconcile Tier-C outer rings to the assembly ring contract + stitch

- **Files:** `src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts` (a Tier-C-only
  pre-weld reconciliation of `outer.topRing`/`outer.bottomRing` to `inner.*Ring` count + ascending-U
  order), and `tierC/index.ts` (`toOuterWallResult` ring emission). **Impact analysis is MANDATORY:**
  `assembleWatertight` is 94-99% of export time and CRITICAL blast radius — run `gitnexus_impact` and
  gate ALL changes behind the flag.
- **Interface:** when the outer wall is a Tier-C result AND the flag is on, resample the analytic
  outer radius at the inner ring's u-stations so `outer.bottomRing.length === inner.bottomRing.length`
  and `outer.topRing.length === inner.topRing.length` (the `:578-582` match check), preserving
  ascending-U order (`:603-606`). Flag-off: untouched code path (byte-identical, proven by T3.5).
- **Test first:** NEW `research/bridge/_tierc_assembly_stitch.test.ts` — build the assembled Gothic
  mesh (flag-on) and assert `assembleWatertight` does not throw the ring-mismatch error and the
  rings share by index; `nonManRawBig`/`auditNonManByIndex==0` non-vacuous on the assembled mesh.
- **Gate:** assembled Gothic (and GeoStar) mesh: no ring-mismatch throw, watertight non-vacuous.
- **Rollback:** revert; every non-Tier-C style's assembly path is untouched (T3.5 fleet byte-id).

### T3.4 — Flip mechanics: thread `surfaceSource:'analytic'` behind a new default-OFF sub-flag

- **Files:** `tierC/index.ts` (`buildTierCOuterWall`'s `refineToZeroOutliers` call, currently
  `:173-184`).
- **Interface (exact):** add sub-flag `isTierCAnalyticSurfaceEnabled()` reading
  `globalThis.__pfTierCAnalyticSurface === true` (default OFF, mirroring `isPerfectMesherEnabled`).
  When BOTH `__pfPerfectMesher` and `__pfTierCAnalyticSurface` are on AND the style is count-unstable,
  pass to the existing (already-built) `RefineOptions` fields (`noBridgeRefine.ts:153-157`):
  `surfaceSource:'analytic'`, `analyticRA: getManifest(styleId).truth.rA`,
  `analyticH` (omit → defaults to `sampler.position(0,1)[2]-sampler.position(0,0)[2]`). Keep the
  existing call's `{ tolMm:0.01, maxPass:16, bulkPasses7pt:4, bgArcMm:0.35, ruler:DEFAULT_RULER }`.
  Note in a comment: `refineToZeroOutliersParallel` remains sampler-only (documented follow-up, out
  of scope). Sub-flag OFF ⇒ `resolveSurfaceSource` returns the sampler branch → byte-identical.
- **Test first:** NEW `research/bridge/_tierc_analytic_ship.test.ts` (config: reuse
  `vitest.tierc_c2full.config.ts` shape). PART A (sub-flag off) asserts byte-identical to the sampler
  build (9,917 tris / 7 passes). PART B (sub-flag on) reproduces the C2-full result: Gothic full CI
  patch (`u∈[0,0.125], t∈[0.48,0.52]`, `bgArcMm 0.6`, `nTheta 512`) → **18,045/18,045, 0 outliers,
  max ≤0.01000 mm** vs `getManifest('GothicArches').truth.rA`. Add a GeoStar part
  (`getManifest('GeometricStar').truth.rA`) targeting **0 outliers / 5,071** (roadmap figure).
- **Gate:** PART A byte-identical; PART B Gothic 0 outliers @ ≤0.01, GeoStar 0 outliers.
- **Rollback:** sub-flag default OFF; delete the analytic branch args.

### T3.5 — Rebaseline: 20-style byte-identity + dispatch-selects-2 + analytic fidelity/needle report

- **Files:** extend `src/renderers/webgpu/parametric/conforming/tierC/rebaseline20.test.ts`
  (test-only, `PF_REBASELINE20=1`).
- **Assert:** (1) all 20 styles **flag-off byte-identical** (existing FNV fixture — proves T3.2/T3.3
  did not disturb the default path); (2) dispatch selects **exactly** `{GothicArches, GeometricStar}`
  (`COUNT_UNSTABLE_STYLES`, `countUnstable.ts:54-57`); (3) with `__pfTierCAnalyticSurface` on, Gothic
  + GeoStar report `tris`, `passes`, `minAngleDeg`, `pctBelow20`, and explicit
  `needleCount = sliverCount − degenerateCount` — closing the reporting gap
  (`champion-spec-gothic.md §4 gap #1`; `triangleQualityDistribution`, depth-invariant).
- **Gate:** fleet byte-identity green, dispatch==2, analytic report row emitted (Gothic minAngle ~0.8°
  / %<20° ~19% expected — reported, NOT gated).
- **Rollback:** test-only.

### T3.6 — Assembled watertight acceptance gate (scoped Gothic + GeoStar)

- **Files:** `e2e/export-fidelity.spec.ts` (test-only) — add a **scoped** block: with
  `__pfPerfectMesher=true`, `__pfTierCAnalyticSurface=true`, and the T3.3 stitch active, assert for
  `GothicArches` and `GeometricStar` ONLY: `nonManifoldEdges==0`, `orientationMismatches==0`,
  `boundaryEdges==0`. Leave the fleet-wide `test.fail()` invariants (`:169-189`) intact — this task
  flips green a named subset, it does NOT claim the fleet.
- **Gate:** the two scoped styles pass all three watertight invariants on the assembled export.
- **Rollback:** test-only; behind the flags.

### T3.7 — USER GATE: finite-needle concession (product decision — NOT an engineering decision)

- **This task writes NO production default flip.** The finite-needle concession (minAngle 0.8° at
  C2-full; the banked 19.0% <20° / minAngle-0° figure; **13 sliver levers refuted**;
  positive-area / watertight / slicer-safe "print-usable concession class") is a USER product
  decision, per `2026-07-04-perfect-mesher-spec.md` and `program-consolidation.md §E`.
- **Deliverable:** a decision packet (a short doc under `research/lab/tierc/`) summarizing, for Gothic
  + GeoStar analytic-on: the measured `needleCount`, `minAngleDeg`, `pctBelow20`, tri/pass cost
  (Gothic 1.82× tris / 8.1× build wall-time vs sampler), watertight/orientation PASS (T3.6), and the
  13-levers-refuted history — then **STOP**. Implementers MUST NOT default-flip `__pfPerfectMesher`
  or `__pfTierCAnalyticSurface`; the flip awaits explicit USER ACCEPT of the concession.
- **Gate:** decision packet exists; both flags still default-OFF; controller routes to the user.
- **Rollback:** n/a (no code change).

---

## 4. Items 5, 6, 2, 7

### Item 5 — Wire `flankBand.ts` behind a dev flag + validate 4×/8× (Gothic band) + GeoStar overlap

`flankBand.ts` is BUILT + TESTED + **NOT WIRED** (imported only by `_flankBand.test.ts`); it is
consumable today ONLY via the optional `bandContours` 4th param of `buildProtectedComplex`
(`morseComplex.ts`), which `buildTierCOuterWall` calls with 3 args (byte-identical off).

#### T5.1 — Wire flankBand via a new default-OFF flag (uniform LADDER-4, NOT tapered)
- **Files:** `tierC/index.ts` (serialize AFTER T3.4 — same `buildTierCOuterWall`).
- **Interface:** add flag `isTierCFlankBandEnabled()` reading `globalThis.__pfTierCFlankBand === true`
  (default OFF). When on, build the LADDER rails via `extractLadder(sampler, domain, levels, march,
  stepMm)` with **uniform** `levels = [0.03, 0.08, 0.18, 0.40]` (the proven LADDER-4;
  `champion-spec-gothic.md §2.C2`) and pass them as `bandContours` to `buildProtectedComplex`.
  **CRITICAL — do NOT use `taperedLevels()`**: steepness-weighted placement REGRESSES 3.4× (worst
  0.396 vs 0.117) because the chord-sag floor lives at the LOW toe (af<0.15) where `|∇r|` is low.
- **Test first:** extend `src/renderers/webgpu/parametric/conforming/tierC/_flankBand.test.ts`
  (config `vitest.flankband.config.ts`): flag-off ⇒ `bandContours` omitted ⇒ byte-identical build;
  flag-on ⇒ the LADDER-4 toe contours are embedded as locked constraints (assert contour count > 0,
  watertight non-vacuous).
- **Gate:** flag-off byte-identical; flag-on embeds LADDER-4 rails.
- **Rollback:** flag default OFF.

#### T5.2 — Validate the 4× (Gothic production-band frontier)
- **Files:** NEW `research/bridge/_tierc_flankband_band.test.ts` (env-gated heavy;
  `vitest.tierc_*`-style forks config, `nTheta 1024`).
- **Interface:** production-band domain `u∈[0,0.1], t∈[0.38,0.62]`, `nTheta 1024`.
- **Gate (measurable):** with `__pfTierCFlankBand` on → **worst ≤ 0.117 mm, p99 ≤ 0.00907 mm,
  ~124-147 outliers, projected ≤ ~5.0M full-pot tris**, watertight non-vacuous; vs plain-kernel
  baseline **~0.469 mm** (the 4× win). This is a FRONTIER, not literal-0 (literal-0 >10M, out of
  scope).
- **Rollback:** test-only.

#### T5.3 — GeoStar overlap check (honest can-fail)
- **Files:** NEW `research/bridge/_tierc_flankband_geostar.test.ts` (env-gated).
- **Rationale:** the doubled-toe-contour has NEVER run on GeoStar; the R6 per-crest-strip sibling
  INTERPENETRATED on GeoStar (chevron spacing p50 0.088 mm < column half-width 0.044 mm ⇒
  non-watertight, `champion-spec-gothic.md §2.B2`). Check the same failure mode.
- **Gate:** extract GeoStar toe rails and assert either (PASS) watertight non-vacuous, no
  interpenetration, OR (honest FAIL) record the overlap failure — a FAIL here keeps flankBand
  Gothic-only and records the GeoStar band frontier as OPEN (no default change either way).
- **Rollback:** test-only.

### Item 6 — Exercise `railLines` on the default path for SFB slivers

`railLines` are already BUILT + THREADED. The offset-band rails are produced by
`src/fidelity/bandRemesh/integrate.ts` (`buildOffsetBandGrid` → `railLines:[footLine,crestLine]`,
`:326-348`) and consumed by the feature-mesher corridor behind the **two gates**
`__pfFeatureMesher` (`ParametricExportComputer.ts:2151-2156`) + `__pfByConstruction` (`:2141-2145`)
— featureMesher is a no-op without byConstruction (`e2e/feature-mesher-voronoi.spec.ts:12-13`).
The per-cell `featureAlignedCell` graft is REFUTED for SFB (net-negative, needs vertices ON shared
cell edges — `featureAlignedCell-crossstyle-verdict.md`); `railLines` is the correct lever.

#### T6.1 — Measure railLines sliver closure on SuperformulaBlossom
- **Files:** NEW `e2e/_sfb_railLines_slivers.spec.ts` (test/e2e only — mirror
  `e2e/feature-mesher-voronoi.spec.ts`). **Must NOT edit `ConformingWall.ts` or
  `PeriodicBalancedQuadtree.ts`** (blocked behind the running arms). If a wiring gap is found that
  requires editing those, STOP and escalate to the controller — do not edit.
- **Interface:** drive a real SFB export with `window.__pfByConstruction=true` +
  `window.__pfFeatureMesher=true` (both required), vs an OFF baseline; measure
  `triangleQualityDistribution` (`pctBelow20`, `pctBelow10`, `minAngleDeg`, depth-invariant) and
  `auditNonManByIndex`.
- **Gate (measurable):** corridor-ON SFB `pctBelow20` measurably DOWN vs OFF baseline, watertight
  non-vacuous held (nonMan 0), confirming railLines closes the SFB slivers the per-cell graft could
  not. Report the delta.
- **Rollback:** test-only.

### Item 2 — CONDITIONAL flip: `__pfFeatureAlignedCells` default-on for Gothic

#### T2.1 — Flip featureAlignedCell default-on for Gothic (guarded, conditional)
- **BLOCKED behind TWO preconditions:** (i) the running **FAC-3D confirm arm returns PASS**
  (true-3D fidelity via `featureLineChord3D` + real GPU export A/B, per
  `featureAlignedCell-crossstyle-verdict.md`); **and** (ii) the running arms' `ConformingWall.ts`
  sampler-on-default work has landed — because `featureAlignedOn` only fires when a `sampler` is
  supplied, gated by `__pfConformingRefine` in `ConformingWall.ts:778-783` (a FORBIDDEN file for this
  plan). Until BOTH hold, this task is NOT executed.
- **Files (when unblocked):** `src/renderers/webgpu/parametric/conforming/FeatureConformingTriangulator.ts`
  (the `featureAlignedOn` read at `:838-839`) — change the default so it is ON for `GothicArches`
  specifically (keep `targetEdgeMm: 0.45·cellShort3D`, `minEdgeDist: STEINER_MIN_EDGE_DIST`,
  keep-better semantics at `:1670-1688`). `FeatureConformingTriangulator.ts` is NOT forbidden; the
  BLOCK is the ConformingWall.ts sampler dependency in precondition (ii).
- **Test first:** extend `featureAlignedCell.test.ts` + a Gothic golden re-baseline.
- **Gate:** Gothic `%<20°` **1.9% → 1.1%** (−42% rel), `%<30°` 7.8% → 2.6%, `+~11.7%` tris,
  watertight held (nonMan 0), fidelity unchanged (by-construction interior-only Steiner; CONFIRM with
  `featureLineChord3D`); non-Gothic styles unaffected (still effectively off).
- **Deliberate output change:** flipping a default is NOT byte-identical — update the Gothic golden
  fixture and note it. Rollback: revert the default (one-line).

### Item 7 — SPEC only: prototype `surfaceMetricField` M=g/h² via the `curvatureFloor` hook (test-only, NO src)

#### T7.1 — Research-arm spec + probe for the M=g/h² sliver closer
- **Nature:** this is a **research-arm spec deliverable** — a prereg + a **test-only** probe under
  `research/bridge/`. **No `src/` change.** It is the registry's own recommended sliver closer
  (`surfaceMetricField.ts`, in-house kernel beats production ~2:1 on min-angle;
  `roadmap §general sliver concession`).
- **Injection point (exact):** `SizingOptions.curvatureFloor: (u,t)=>number` — wired end-to-end and
  consumed via `AnalyticCurvatureFloor` behind `__pfConformingAnalyticFloor` (default OFF;
  `ConformingWall`/`MetricSizingField` thread it at `curvatureFloor?`/`maxKappa?`). This is the SAME
  dormant hook the SpiralRidges analytic floor uses.
- **OPEN QUESTION the spec must state (do not resolve in code):** `curvatureFloor` is a **scalar,
  isotropic** κ floor, but `surfaceMetricField` (`research/bridge/surfaceMetricField.ts`) produces an
  **anisotropic tensor** `M = g/h₃D²` (packed `[M00,M01,M11]`). The prototype must reduce M to a
  scalar-equivalent κ floor for a first-cut injection (e.g. invert the chord sizing
  `h₃D = √(8·tol/κ)` from the M-implied max target edge) and NAME that the true anisotropic mesher
  cannot fully express through this scalar hook — the anisotropic gap is the spec's headline open
  question and the reason this is a spec, not a ship.
- **Deliverable:** NEW `research/bridge/_surfaceMetricFloor.probe.test.ts` (research/bridge) that
  builds the M-field for one sliver-heavy style (start SpiralRidges — has the analytic κ baseline in
  `AnalyticCurvatureFloor.ts`), derives the scalar floor, injects it via `curvatureFloor`, and
  measures sliver (`triangleQualityDistribution`) + fidelity vs the `AnalyticCurvatureFloor` scalar
  baseline. Env-gated config.
- **Gate:** the probe runs and records the M-floor vs analytic-floor comparison (min-angle, %<20°,
  fidelity, tri cost). No src touched.
- **Rollback:** delete the probe.

---

## 5. Item 4 — Region-layer core (OUTLINE ONLY — own plan later)

> This is an **architecture outline**, NOT a task list. It gets its own plan. Source:
> `research/lab/tierc/architecture-v1.md` (D0.3). Current state: **data-only — the manifest is a
> markdown sketch; RegionPlan/ChainSpec build + dispatch are UNBUILT** (`gates-harness-spec.md` Gap
> #5: grep of `research/`+`src/` for `StyleManifest` = zero implementations).

**Architecture sketch.** A per-style **region orchestration layer over the three existing kernels**
(K1 conforming-quadtree+CDT; K2 protected-complex+cdt2d+RED-refine; K3 native-3D structured rows) —
NOT a new mesher. `StyleManifest.anatomy(params,dims) → FeatureAnatomy { regions: RegionPlan[],
curves: EmbeddedCurve[], pins?: PinSeed[] }`; each `RegionPlan` is typed **R-CDT** (K1, the default),
**R-STRUCT** (K3, e.g. DS ring bands — leaves the (u,t) chart), or **R-REFINE** (K2, Gothic/GeoStar,
warp-limited). Every inter-region boundary is an immutable ordered **`ChainSpec`** owned by one region
and adopted-by-index by its neighbor (P2/P3 enforced by construction — no triangulation step sees both
sides as free space).

**Interfaces (from architecture-v1 §4):**
```ts
interface StyleManifest {
  styleId: StyleId;
  truth: { rA:(theta,z)=>number; bridgeClass:'exact'|'hash-int'|'KNOWN-BROKEN' };
  anatomy:(params,dims)=>FeatureAnatomy;
  ruler:'radial-newton'|'ds-composite-v11g'|'k2-interior';
  budget:{ maxOuterTris:number; maxFullTris:number };
  gates:{ g7scope:'full-pot'|'patch-NA' };
}
RegionPlan = { type:'R-STRUCT'|'R-CDT'|'R-REFINE'; domain; boundaryChains:ChainSpec[];
               sizing:SizingConfig; kernelOpts };
```

**Open questions (must be answered in item-4's own plan):**
1. **R-STRUCT↔R-CDT adoption contract** (the DS hard case): (a) structured transition bands + stitch
   strip; (b) `railLines`/`bandRegions` force-registration (the existing WIP spike — but that path
   lives in `ConformingWall.ts`, forbidden until the running arms land); (c) R-CDT-owns / R-STRUCT-
   adopts. Pre-registered as the DS **B0 toy** before any full DS build (watertight non-vacuous +
   zero T-junction gate).
2. **S-RESIDUAL pin plumbing** — `pinnedPoints`-class fields do not exist in any production interface
   (`AssemblyWallOptions → ConformingWallOptions → FeatureConformingTriangulator`, grep-confirmed
   zero fields) — new plumbing through `ConformingWall.ts` (forbidden-file dependency; sequence after
   the running arms).
3. **Region-tag propagation through `assembleWatertight`** (gates-spec Gap #8) — whether
   `seamTriangles`/`bottomRing`/`topRing` survive assembly is OPEN.
4. **Manifest scope** — implement only the fields the harness consumes now (`budget.maxTris`,
   `truth.fn`), defer `features`/`closer`.

---

## 6. Risks (top 5) + mitigations

1. **Seam-share ring-matching may be intractable without touching the inner-wall/quadtree path
   (forbidden `ConformingWall.ts`/`PeriodicBalancedQuadtree.ts`).** If the inner wall's ring stations
   cannot be matched by outer-side resampling alone, T3.3 would need quadtree edits → blocked.
   *Mitigation:* T3.1 characterizes the exact mismatch FIRST; do all matching on the OUTER side
   (resample analytic radius at `inner.*Ring` u-stations inside `assembleWatertight`); if that proves
   impossible, escalate and adopt the architecture-v1 §2(a) stitch-strip contract (adopt rings without
   editing the inner wall) — and if even that needs the forbidden files, DEFER item 3's seam-share to
   after the running arms rather than editing them.
2. **The locked periodic u-seam column (T3.2) perturbs the flag-ON K2 topology and reopens fidelity
   outliers or new slivers.** *Mitigation:* T3.2's gate re-runs the analytic 0-outlier check
   post-lock; if outliers reopen, treat as a mechanism finding (the seam lock competes with the
   RED-refine) and iterate the lock's t-station density before proceeding — do not ship a mesh the
   guard rejects (mirror `tierC/index.ts:185-190`).
3. **Item 2 is doubly-blocked (FAC-3D PASS + forbidden-file sampler wiring) and may never unblock in
   this program window.** *Mitigation:* keep T2.1 fully behind the flag and ship the golden fixture +
   fidelity/watertight gate NOW so the eventual flip is a reviewed one-line default change; do not let
   T2.1 block any item-3/5/6/7 progress (it is a leaf).
4. **flankBand on GeoStar (T5.3) reproduces the per-crest-strip interpenetration (non-watertight).**
   *Mitigation:* T5.3 is an explicit can-FAIL check; a FAIL keeps `__pfTierCFlankBand` Gothic-only and
   records the GeoStar band frontier OPEN — no default changes on either outcome, so a GeoStar failure
   cannot regress production.
5. **Editing `WatertightAssembly.ts` (T3.3 — 94-99% of export time, CRITICAL blast radius) regresses
   every style's assembly / breaks fleet byte-identity.** *Mitigation:* mandatory `gitnexus_impact`
   before the edit; gate ALL Tier-C assembly logic behind `__pfPerfectMesher`+`__pfTierCAnalyticSurface`
   so the non-Tier-C path is structurally untouched; T3.5's 20-style FNV byte-identity fixture
   (flag-off) is the fleet regression tripwire and must be green before T3.6.
