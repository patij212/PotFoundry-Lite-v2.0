# STRATA-001 Research Plan — Stratified Screen + Shape-Agnostic Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **S0 runs before any kernel edit — measurement before fixes is doctrine.**

**Goal:** make the validated screen terminate and certify ≤ 0.01 mm on piecewise-smooth fields (Voronoi first) at smooth-style budget/wall-clock, then generalize to the shape-agnostic stratification pipeline.

**Architecture:** three independent layers — soundness from the screen, termination from the pivot+defect node rule, budget parity from conforming to the exactly-known kink graph. Spec: [2026-07-23-strata001-spec.md](2026-07-23-strata001-spec.md) (invariants P-INV-1..6, F-INV-1..6, predictions P1–P5 — cited below by ID).

**Tech stack:** TS + Vitest 4 fork-pool campaign configs (`potfoundry-web/`), validated f64 interval kernel (`src/geometry/targetSolid/`), research harnesses (`research/bridge/`).

## Global Constraints

- Every fidelity claim: MAX ≤ 0.010 mm vs exact analytic oracle; dense sampling is falsifier only (P-INV-1/2).
- All new screen behavior flag-gated; **flag OFF ⇒ byte-identical certification SHA** (F-INV-1). Method text + SHA pin updated in the same commit as any rule change (P-INV-5).
- **GitNexus discipline (CLAUDE.md):** `impact({target, direction:"upstream"})` before editing any production symbol and report blast radius; `detect_changes()` before every commit. Interpretation caveat: hub fan-out under the conforming/targetSolid families reads CRITICAL by construction — per `project_conforming_impact_interpretation`, trust `detect_changes` + run the heavy screen/conforming tests foreground before commit.
- Heavy runs: from `potfoundry-web/`, campaign config, heap flag on the CLI (`NODE_OPTIONS=--max-old-space-size=12288` — Vitest 4 ignores `poolOptions.forks.execArgv`). Bump spawned node jobs to `PriorityClass='AboveNormal'` (EcoQoS). jsdom unit suites run from repo root (two-vitest split lesson).
- Never `git stash`; `git -C <abspath>` with absolute paths; commit WIP rather than revert (preserve-work doctrine).
- ESLint 0-warnings hook fires after every TS edit — fix before moving on.
- Caps on every accumulation/recursion in kernel + harness code (Set-cap lesson); no hot-loop allocation (F-INV-5).

## ⚠️ RE-SEQUENCED 2026-07-24 after S0 (`E-2026-07-24-STRATA001-S0-CORRECTION`)

S0 ran and its gate fired, but its baseline was measured at `v_relief 0.04` / `v_morph 0` — the **certified roster's own** config (`_certRoster.ts:149`), which is 1/50th the registry-default relief in a non-default mode, with a **uniform** outer wall (no stations, no chords). Numbers void; process worked. Consequences for this plan:

1. **S1 and S2 SWAP.** Measured: the screen is *not* the blocker — the bound converges under subdivision at real relief (depth 24→30 ⇒ 9,500,024 → 9,500,001 pm), while **uniform tessellation cannot certify at any legal density** (still short at the 262,144 tri/patch cap). The binding constraint is triangle *placement*. **Do S2 (conforming chords) first**; S1 (pivot+defect node rule) is re-evaluated afterwards on evidence — conforming makes cells *touch* rather than straddle the bisector, which is exactly failure-mode #1's test.
2. **New mandatory S0 gate — REPRESENTATIVENESS.** Every baseline's first report line must declare *style params vs `src/styles/registry.ts` defaults* (flagging each reduced one) and *uniform vs conforming* tessellation. A certificate at reduced relief certifies a different shape. See `feedback_verify_registry_defaults`.
3. **P1/P2 are UNREGISTERED.** Both were evaluated on de-featured data. Re-register at defaults before citing.
4. **The independent ruler gate (was S3 Task 3.3) is promoted to a standing requirement on every fidelity claim** — the certified roster cannot serve as the scoreboard. But see the ruler caveat below: it is a **falsifier, not a certifier**, and it is *blind at creases* unless seeded with the exact feature geometry.
5. **Thesis correction.** The campaign was written against "the validated screen can't certify piecewise-smooth fields". Measured thesis: **"the tessellator can't represent features."** §4 (conform) and §7 (tape→strata→**emitter** dispatch) carry the value; §5 (node rule) is speculative until shown necessary.

### ⚠️ RULER CAVEAT — the Φ projector at 2048/1024 IS blind at creases (derived 2026-07-24)

**A grid-sampled ruler has the same defect as a grid-built mesh.** The max of `|mesh − surface|` across a crease sits exactly ON the crease; a grid ruler only sees the nearest sample.

Worked for Voronoi at registry defaults (H32/OD30 ⇒ r 15 mm, circumference 94.2 mm; `v_scale 8` ⇒ cell ≈ 11.8 mm; `v_relief 2.0`):
- Wall slope near a bisector: `relief · s′ · |∇f1|` = `2.0 × 1.5 × (1/11.8)` ≈ **0.25 mm/mm**; the gradient **jump** across the crease is σ ≈ **0.51 mm/mm**.
- Error profile across the crease is a tent peaking on the crease, flanks of slope ≈ σ/2.
- 2048 θ samples over 94.2 mm ⇒ Δ ≈ **0.046 mm**; worst crease-to-sample offset Δ/2.
- **Under-report ≈ (σ/2)(Δ/2) ≈ 0.25 × 0.023 ≈ 0.0059 mm ≈ 6 µm** — on a 10 µm budget.

So the Φ projector can read ~4 µm on a mesh whose true crease error is 10 µm. Worse, site jitter (`pcg2d`) makes crease positions incommensurate with the sample grid, so *which* creases land near a sample is luck — the reported MAX is not even stable across styles/seeds. **A grid ruler cannot arbitrate a crease at this tolerance.**

**Rules that follow:**
1. The **certificate is the authority** — it bounds over whole cells, not at points (P-INV-2: sampling is a falsifier only, never a bound). The ruler's job is to *refute*, and a passing ruler proves nothing about creases.
2. **Seed the ruler with the exact feature geometry.** Sample densely ALONG `voronoiBisectorSegmentsUv` (and each style's crease set) in addition to the grid. The same exact geometry that drives the chords must drive the ruler's sampling — one source, two consumers — otherwise a featureless-but-smooth mesh passes.
3. Report grid-MAX and crease-MAX **separately**. A ruler that reports one blended number hides exactly the failure mode we are chasing.

**Exemplars to copy (both put triangles ON features from a COARSE base — neither uses a dense uniform grid):**
- `WaveInterference_defaults_H32_OD30_certified` — **FULL DEFAULTS, relief 2.3 mm**, 1,267,712 tris: outer base 2^5 + 288-row rational ladder + fade-kink stations 3/20, 17/20. The existence proof that full-defaults certification is reachable.
- `GothicArches_p1_H32_OD30_certified` — 304,808 tris from a 256×32 base + `angularStations`/`verticalStationsByPatch` + **`conformingChordsByPatch: gothicChordsForPatch(...)`** on both walls. Method-exemplary (its `gaRelief 0.2` vs default 1.5 is not).

## Phase map

| Phase | Deliverable | Hard gate (invariants) | Probes |
|---|---|---|---|
| S0 | Baseline lock: Voronoi slack + fired-map vs order-1 graph | baseline pinned; P1 verdict recorded; **if P1 refuted → STOP, revise spec §3** | P1, P2 |
| S1 | Pivot+defect node rule, flag-gated | straddler node-slack p50 ≤ 2×; Voronoi screen terminates ≤ 10⁷ cells; OFF SHA identical; smooth ON: cells ≤ +1 %, wall ≤ +10 % | P3, P5 |
| S2 | Order-2 guides + chord chains → `conformingChordsByPatch` | firings off ulp-band ≈ 0; touching-cell defect h-sweep slope ≈ 2 | P4a |
| S3 | Voronoi bubble + web certified end-to-end | ≤ 10⁶ cells, ≤ 300 s, MAX ≤ 0.01, watertight, independent GPU ruler agrees | P4 |
| S4 | Stratification pass (tape walker) + telemetry | auto-inventory ⊇ hand inventory on Voronoi/Gothic/WI; zero false-negatives on known-kink styles | — |
| S5 | Tier-3 lazy cutting | un-recognized style (GeoStar pre-recognizer) terminates ≤ N_smooth + band; sliver% tracked | — |
| S6 | Tier-1 recognizers + Tier-2 tracer spike | lattice/layered families at parity; GeoStar closure; Gyroid tracer = spike only (caps, no closure promise) | — |
| S7 | Chain-driven emitter dispatch + codegen spike | Tier-C region mesher integration; source-contract batch re-pin green | — |

S0–S3 are specified as bite-sized tasks below. S4–S7 are gate-driven research blocks — each gets its own detailed plan authored at phase entry (scope-check rule: one plan per subsystem).

---

## Phase S0 — Baseline lock (no kernel edits)

### Task 0.1: Campaign vitest config

**Files:**
- Create: `potfoundry-web/vitest.strata.config.ts`

**Interfaces:**
- Produces: campaign runner for `research/bridge/_gothicScreenSlackAudit.test.ts` and future `research/bridge/_strata*.test.ts`.

- [ ] **Step 1: Write the config** (mirrors `vitest.gsprod.config.ts` — fork pool, singleFork, node env):

```ts
// vitest.strata.config.ts — DEV-ONLY config for STRATA-001 (E-2026-07-23-STRATA001-*).
// Mirrors vitest.gsprod.config.ts: pool 'forks' + singleFork, environment 'node'.
// Heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=12288);
// Vitest 4 ignores poolOptions.forks.execArgv.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'research/bridge/_gothicScreenSlackAudit.test.ts',
      'research/bridge/_strata*.test.ts',
    ],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
```

- [ ] **Step 2: Smoke-run (gated tests skip without env):**

Run (from `potfoundry-web/`): `npx vitest run --config vitest.strata.config.ts`
Expected: audit suite discovered, tests skipped (env gate off), exit 0.

- [ ] **Step 3: Commit**

```bash
git add vitest.strata.config.ts
git commit -m "research(strata): S0 campaign vitest config

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 0.2: Voronoi baseline slack run

**Files:**
- Read: `research/bridge/_gothicScreenSlackAudit.test.ts` (tunables block, ~lines 70–140; report `writeFileSync` target)
- Modify (research-grade, additive only): same file — per-cell CSV emission if absent

- [ ] **Step 1: Identify the harness env tunables** — the header documents "Gated PF_GOTHIC_SLACK=1; tunables via env" and a Voronoi mode ("classify cells … when STYLE is Voronoi at v_morph 0", `VORONOI_BUBBLE_LATTICE` = scale 8 / jitter 0.8 / pulse 0 / zStretch 1 / period 8). Record the exact env names for style selection, budget, maxDepth, cell caps, and the report output path.
- [ ] **Step 2: Extend per-cell output (if not already emitted)** to CSV rows: `uvBox, screenUpper, trueUpper, clarkeFired, straddleClass` where `straddleClass` ∈ {interior, order1-straddle} from `voronoiNearestCenterId` corner disagreement (already imported). Additive; keep the existing money-metrics unchanged. **MUST cap emitted cells** (audit lesson).
- [ ] **Step 3: Baseline run, Voronoi bubble, capped:**

```bash
NODE_OPTIONS=--max-old-space-size=12288 PF_GOTHIC_SLACK=1 <STYLE-env>=voronoi npx vitest run --config vitest.strata.config.ts
```

Expected: suite completes under the cell cap (no uncapped descent); report + CSV written.
- [ ] **Step 4: Pin the numbers.** Record into the spec §1/§9: straddler node-slack p50/p99/MAX, composed slack, slack-forced subdivision fraction, soundness self-check pass (P-INV-2). Append registry row `E-2026-07-23-STRATA001-S0-BASELINE` to `research/EXPERIMENT-REGISTRY.md` (match existing row format — read its header first).
- [ ] **Step 5: Commit** (`research(strata): S0 baseline — Voronoi slack + per-cell CSV`, same trailer).

### Task 0.3: Fired-map overlay — P1/P2 verdicts

**Files:**
- Create: `research/bridge/_strataFiredMapOverlay.test.ts` (analysis-only; reads Task 0.2 CSV + `voronoiBisectorSegmentsUv`)

- [ ] **Step 1: Write the overlay analysis** — for each `clarkeFired` cell, distance from its uvBox center to the nearest order-1 segment (`voronoiBisectorSegmentsUv(VORONOI_BUBBLE_LATTICE)`); bucket into on-graph (≤ 1 cell diag) vs off-graph.

```ts
const segs = voronoiBisectorSegmentsUv(VORONOI_BUBBLE_LATTICE);
const distToGraph = (u: number, v: number): number =>
  Math.min(...segs.map((s) => pointSegmentDistance(u, v, s.a, s.b)));
// P1 gate: >= 95% of fired cells on-graph (bubble mode).
// Off-graph residue is P2's candidate order-2 population (web mode run).
```

- [ ] **Step 2: Run bubble mode → P1 verdict; run web mode (morph=1) → P2 candidate map.** Expected under P1: fired cells concentrate on order-1 edges; centerline/clamp stations quiet. Record verdicts in spec §9.
- [ ] **Step 3: STOP/GO.** P1 confirmed → proceed to S1. P1 refuted → revise spec §3 first (audit-first doctrine), do not touch the kernel.
- [ ] **Step 4: Commit** analysis + verdict note.

---

## Phase S1 — Pivot + one-sided-defect node rule

### Task 1.1: Impact + wiring recon (no edits)

- [ ] **Step 1:** `impact({target: "fastEncloseCompiledValidatedResidualProgram", direction: "upstream"})` — report blast radius to the user (expect CRITICAL by hub fan-out; interpret per the memory caveat, plan foreground heavy tests).
- [ ] **Step 2:** Read the kink case sites: `FAST_OP_ABS` (~`validatedResidualProgram.ts:2245–2267`), `FAST_OP_MIN`/`FAST_OP_MAX` (~`:2530–2566`), and the thin-run (centroid) vs wide-run (cell hull) tape architecture. Confirm: (a) where per-slot **centroid** values are retained or how to retain them (new `Float64Array` alongside `valueLo/valueHi/duLo/duHi/dvLo/dvHi` if absent), (b) the per-op factor sites where `du/dv` channels are multiplied (defect channel multiplies by the *same* factors), (c) the `fastRunTapeHullOnly` downgrade path (defect fallback target).
- [ ] **Step 3:** Write the wiring note (10 lines, into the PR description draft): exact line anchors for each op family touched.

### Task 1.2: Flag + telemetry scaffolding (TDD)

**Files:**
- Create: `src/geometry/targetSolid/strataPivotDefect.test.ts`
- Modify: `src/geometry/targetSolid/validatedResidualProgram.ts`

**Interfaces:**
- Produces: `setScreenPivotDefect(enabled: boolean): void`, `getLastScreenDefectFired(): boolean` (exported; mirror `setScreenSecondOrder`/`getLastScreenClarkeFired` style).

- [ ] **Step 1: Failing test — OFF is byte-identical.** Mirror the existing SHA-pin pattern from `validatedResidualProgram.test.ts` (`canonicalizeCertificationJson` + `computeValidatedResidualProgramSha256`):

```ts
import {
  setScreenPivotDefect,
  getLastScreenDefectFired,
} from './validatedResidualProgram';

it('pivot-defect OFF leaves certification JSON byte-identical', () => {
  setScreenPivotDefect(false);
  // compile + canonicalize the same fixture the existing SHA-pin test uses;
  // expect(sha256).toBe(<current pinned value>);  // F-INV-1
});

it('defect telemetry defaults to false', () => {
  expect(getLastScreenDefectFired()).toBe(false);
});
```

- [ ] **Step 2:** Run: `npx vitest run --config vitest.strata.config.ts src/geometry/targetSolid/strataPivotDefect.test.ts` — Expected: FAIL (`setScreenPivotDefect` not exported). *(Unit file may instead run under the repo-root vitest — use whichever runner the sibling `validatedResidualProgram.test.ts` uses.)*
- [ ] **Step 3:** Implement flag + getter + `fastRunTapeDefectFired` plumbing (no behavioral change yet). Run test → PASS.
- [ ] **Step 4: Commit** (`feat(screen): pivot-defect flag + telemetry scaffolding (OFF byte-identical)`).

### Task 1.3: The node rule (TDD, math gates)

**Files:**
- Modify: `src/geometry/targetSolid/validatedResidualProgram.ts` (FAST_OP_MIN/MAX/ABS cases + defect-channel propagation)
- Test: `src/geometry/targetSolid/strataPivotDefect.test.ts`

**Rule (from spec §5):** at an overlapping kink node, emit pivot-branch channels (pivot = centroid argmin/argmax/sign; ties arbitrary — any pivot sound); defect `s = max(0, hi(ĝ))` from the triangle-exact centered enclosure of the smooth difference (thin-run centroid value + `∇g` hulled over the three exact vertex offsets); seed one-sided defect channel (min `[−s,0]`, max `[0,s]`, abs `[0, 2·max(0, −lo(Â))]`); propagate defect channels through every downstream op multiplied by the same partial-derivative range factors as the `du/dv` chain rule; add to the final residual enclosure. Lazily allocate; Clarke retained as fallback when the defect path refuses (nonfinite).

- [ ] **Step 1: Failing tests.** Fixture: real compiled Voronoi target (bubble defaults), two cell populations selected from the S0 CSV — (a) one-sided cells adjacent to a bisector, (b) straddling cells. Assertions:

```ts
// (a) SOUNDNESS on both populations (P-INV-2): screenUpper >= trueUpper
//     (trueUpper = dense barycentric oracle sweep, falsifier only).
// (b) TIGHTNESS, one-sided: h-sweep the same cell at h, h/2, h/4, h/8;
//     defect s must vanish at slope >= 1.9 on log-log (O(h^2) claim).
// (c) TIGHTNESS, straddling: screenUpper/trueUpper <= 2.0 (was 10-15x).
// (d) Telemetry: defectFired=true, clarkeFired=false on (a) and (b).
```

- [ ] **Step 2:** Run → FAIL (rule not implemented).
- [ ] **Step 3:** Implement per the wiring note: retain thin-run per-slot values; add lazily-allocated `defLo`/`defHi` channels; rewrite the three kink cases; multiply defect channels at every factor site identified in Task 1.1; add defect into the final enclosure assembly; `fastRunTapeDefectFired` set at first seed. Non-covered downstream op ⇒ widen by that op's value-range rule or downgrade to `fastRunTapeHullOnly` (sound path preserved).
- [ ] **Step 4:** Run → PASS all four assertion families. Also re-run the full `validatedResidualProgram.test.ts` suite → PASS (no regression).
- [ ] **Step 5: Commit** (`feat(screen): pivot+one-sided-defect rule at min/max/abs — Clarke demoted to fallback`).

### Task 1.4: Method text v2 + SHA re-pin (same-commit discipline)

- [ ] **Step 1:** Extend the prepared proof text (the `min`/`max`/`abs` lines near `validatedResidualProgram.ts:76`) with the pivot+defect rule statement and the five-line soundness lemma (spec §5). Update the pinned SHA in the test in the **same commit** (P-INV-5).
- [ ] **Step 2:** Run SHA test with flag ON semantics documented; OFF pin unchanged. → PASS.
- [ ] **Step 3:** `detect_changes()` — verify touched symbols are the screen family only. **Commit.**

### Task 1.5: A/B slack audit — P3 gate

**Files:**
- Create: `research/bridge/_strataVoronoiAbAudit.test.ts` (mirror `_gothicScreenSlackAudit.test.ts` request construction; env-gated `PF_STRATA_AB=1`)

- [ ] **Step 1:** Same cell population screened twice (OFF / ON): record straddler node-slack p50/p99/MAX, composed slack, accepted/subdivided deltas, soundness self-check both arms.
- [ ] **Step 2:** Termination probe: adaptive descent on the Voronoi patch, ON, cell cap 10⁷ — Expected: terminates below cap (P3); record final cell count + wall-clock.
- [ ] **Step 3: Gates:** p50 ≤ 2× on straddlers; terminate ≤ 10⁷ cells; zero soundness violations. Registry row `E-2026-07-23-STRATA001-S1-AB`; spec §9 P3 verdict. **Commit.**

### Task 1.6: Smooth-style regression — P5 gate

- [ ] **Step 1:** Gothic (and WI if wall permits) capped descent, ON vs OFF: cells Δ ≤ +1 %, wall Δ ≤ +10 % (F-INV-2). OFF: SHA byte-identical (F-INV-1).
- [ ] **Step 2:** Record in spec §9 P5; `detect_changes()`; **commit.** Phase S1 exit review vs gates.

---

## Phase S2 — Conforming: order-2 guides + chord chains

### Task 2.1: `voronoiSecondOrderSegmentsUv` (TDD)

**Files:**
- Modify: `src/geometry/targetSolid/voronoiBisectorGuides.ts`
- Test: `src/geometry/targetSolid/voronoiBisectorGuides.test.ts`

**Interfaces:**
- Produces: `voronoiSecondOrderSegmentsUv(params: VoronoiLatticeParams): UvSegment[]`; helper `voronoiSecondNearestCenterId(params, cx, cy): string` (mirrors `voronoiNearestCenterId`).

- [ ] **Step 1: Failing test** — for each emitted segment midpoint m and unit normal n: `voronoiSecondNearestCenterId(m ± εn)` differ while `voronoiNearestCenterId(m ± εn)` agree (ε = 1e-4); plus a negative probe set (random interior points near no emitted segment: second-nearest id locally constant). Run → FAIL.
- [ ] **Step 2:** Implement: per site i, clip i's order-1 cell by bisectors of all pairs (j,k), j,k ≠ i (puncture-clip; same `clipHalfPlane`); dedupe/clip to box exactly as order-1. Run → PASS.
- [ ] **Step 3: Commit** (`feat(guides): order-2 Voronoi segments — the web-mode kink strata`).

### Task 2.2: Chord assembly (TDD)

**Files:**
- Create: `src/geometry/targetSolid/voronoiConformingChords.ts` + `voronoiConformingChords.test.ts`

**Interfaces:**
- Produces: `assembleVoronoiConformingChords(params: VoronoiLatticeParams, opts: {includeOrder2: boolean; deltaMerge: number}): <the conformingChordsByPatch value type>` — rational grid-station chords per patch, consumable by `annularSolidReferenceTessellation` (validation at `:814/:825`; construction pattern = `chord(...)` helper in its test `:312`).

- [ ] **Step 1: Failing tests:** (a) every emitted chord passes the tessellation's own validation (denominator range, count caps); (b) chains crossing u = 0/1 are split at the seam and both halves present (periodicity); (c) synthetic near-degenerate pair (two centers δ apart) collapses under `deltaMerge` without emitting micro-chords; (d) junction vertices shared by index across incident chains.
- [ ] **Step 2:** Implement: snap → merge → chain → split-at-seam → emit. Run → PASS. **Commit.**

### Task 2.3: Wire + fired-map re-run — P4a gate

- [ ] **Step 1:** `impact` on the descent entry (`continuousMappedPatchDistance` accept/subdivide site, cMPD:983–987 anchor) — report. Plumb `conformingChordsByPatch` for STYLE=Voronoi into the certification tessellation options.
- [ ] **Step 2:** Re-run Task 0.3 overlay, rule ON + chords in: **gate** = defect/Clarke firings off the ulp-band ≈ 0; touching-cell defect h-sweep slope ≈ 2 (P4a). Record; registry row `…-S2-CONFORM`.
- [ ] **Step 3:** Sliver check on the conformed tessellation (track sliver% — decision point: constraint-aware msurf sizing if degraded; dsFeatureEdges precedent p99 0.009). `detect_changes()`; **commit.**

---

## Phase S3 — Voronoi end-to-end certification

- [ ] **Task 3.1 — bubble full defaults** (`PF_STRATA_E2E=1`): full-pot certify. **Gates:** every leaf ≤ tol; ≤ 10⁶ cells; ≤ 300 s wall (F-INV-3); watertight assembly green. Artifacts: certification JSON, ledger, registry row.
- [ ] **Task 3.2 — web full defaults** (requires order-2 chords): same gates.
- [ ] **Task 3.3 — independent ruler cross-check:** real-GPU pipeline diagnose at 2048/1024 with the Φ projector, MAX-first (`measureRadialFidelity`; prod-export-truth lesson — 1024/512 under-reports). Ruler is falsifier: MAX ≤ 0.01 must corroborate the certificate.
- [ ] **Task 3.4 — docs + memory:** spec §9 verdicts; all-20 truth row (Voronoi); UNIVERSAL-001 linkage (update, don't re-derive); memory entry update. `detect_changes()`; **commit** (`research(strata): S3 verdict — Voronoi certified end-to-end`).

---

## Phases S4–S7 — gate-driven research blocks (detailed plan authored at each entry)

**S4 — Stratification pass.** Entry: S3 green. Build the tape walker: per non-smooth op emit switch-functional sub-tape + class tag (spec §7 table); activity pruning; de minimis certification (interval jump bound < tol ⇒ drop from conforming); periodicity lint (interval-check Φ(0,t) ≡ Φ(1,t)); hierarchical (topological-order, branch-pinned) tracing hooks. **Exit:** auto-inventory ⊇ hand inventory on Voronoi/Gothic/WI; fired-map telemetry keyed by stratum id.

**S5 — Tier-3 lazy cutting.** Entry: S4 telemetry live. Cut defect-dominant cells by the zero line of the firing node's centered linear model. **Exit:** un-recognized style (GeoStar before its recognizer) terminates ≤ N_smooth + band with constant ≈ 1; soundness untouched (cutting changes the partition only).

**S6 — Tier-1 recognizers + Tier-2 tracer spike.** Recognizers: jittered-lattice Euclidean min (order-k), affine/separable stations, 1-D periodic profiles — lattice/layered families to parity; GeoStar conforming graph as an instance. Tracer: quadtree sign-localization + predictor–corrector on g sub-tapes, hard caps, Tier-3 fall-through; **scoped as a spike on Gyroid ridge walls — no closure promise** (envelope-v6 territory per `project_gyroid_named_wall`).

**S7 — Emitter dispatch + single-source codegen spike.** Chain-driven dispatch of strata → {grid, crease-constraint, curtain, cone-fan} (= PROD-TIERC region mesher integration); codegen spike tape → WGSL/CPU/f64 twin; `styleEvaluatorSourceContract` batch re-pin (standing RED loose end). **Exit:** one style certified with zero style-specific trusted code end-to-end.

---

## Risk register (mapped to spec §8)

| Risk | Phase | Mitigation in-plan |
|---|---|---|
| P1 refuted (inventory wrong) | S0 | hard STOP gate before kernel edits |
| Defect channel taxes smooth tapes | S1 | lazy alloc + Task 1.6 regression gate |
| SHA/method drift | S1 | Task 1.4 same-commit rule |
| Order-2 gap hangs web | S2 | Task 2.1 dedicated stratum + overlay gate |
| Seam/period mismatch, cdt2d spanner crash | S2 | Task 2.2 tests (b); planarize path |
| Degenerate junctions | S2 | δ-merge + caps (Task 2.2 c) |
| Sliver collapse | S2/S3 | tracked metric + msurf decision point |
| Ruler disagreement (certificate vs GPU truth) | S3 | Task 3.3 falsifier gate — disagreement = STOP, root-cause before any claim |
| Tracer runaway | S6 | caps + Tier-3 fall-through; spike scope |

## Ops appendix

- Fork-pool stdout is buffered — long-silent arms are normal; diagnose stalls by CPU-delta, not wall time; kill orphan vitest workers after aborted runs.
- Node `Map` cap 2^23 (Chrome 2^24) — keep harness dedupe bounded.
- Report artifacts under `research/bridge/` output dirs; ledger/registry rows per run (checkpointed, keyExists-guarded units ⇒ resumable across kills, gsprod precedent).

## Self-review (writing-plans checklist)

- Spec coverage: P-INV/F-INV all cited by a gate; P1–P5 each wired to a task; spec §4/§5/§7 map to S2/S1/S4-7. Gap accepted deliberately: S4–S7 tasks are authored at phase entry (scope-check rule), not here.
- Placeholders: none load-bearing — where an internal name is unverified (thin-run value retention, style env name), the step *is* the verification read with exact line anchors, before the edit step.
- Name consistency: `setScreenPivotDefect`/`getLastScreenDefectFired`/`fastRunTapeDefectFired` (1.2→1.3→1.5), `voronoiSecondOrderSegmentsUv`/`voronoiSecondNearestCenterId` (2.1→2.2), `assembleVoronoiConformingChords` (2.2→2.3), `vitest.strata.config.ts` + `PF_STRATA_AB`/`PF_STRATA_E2E` consistent throughout.
