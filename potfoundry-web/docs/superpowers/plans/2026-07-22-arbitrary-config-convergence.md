# Arbitrary-config Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the convergence probe on an arbitrary (uncertified) config and produce a trustworthy per-patch refine-vs-redesign verdict, with trust established cert-free by verdict-stability across depth, and with station-ladder patches coarsened on both axes.

**Architecture:** Extend `_certRosterConvergenceLib.ts` with (a) `coarsenLadder` + ladder-aware `coarsenDivisions` (v2), (b) `convergePotSelfCalibrated` (verdict-stability loop, dependency-injected runner so the stability logic is unit-testable without a bake). Extend the convergence driver with a `PF_CONVERGE_CONFIG` arbitrary-config path emitting `selfCalibration`/`coarsenedAxes`. Add a `potscope convergeconfig` builder and wire `readConverge`/`doctor`/`dashboard` to accept the self-calibration method. Acceptance is real bakes (reproduce a certified config, a frontier config, Voronoi, roster re-validation).

**Tech Stack:** TypeScript + Vitest (`research/bridge/`, run via `npx vitest run`); zero-dep Node ESM + `node:test` (`research/tools/potscope/`, run via `node --test`). No new npm deps.

## Global Constraints

- **No new npm dependencies.** The bridge lib imports only from `src/`, `./_certRoster*`, and `node:*`. potscope stays zero-dep.
- **No re-implemented surface.** Reuse `convergePot`/`sampleWorstResidualByPatch`/the residual evaluator. This plan adds no new surface evaluation.
- **ESLint 0-max-warnings** on every `.ts` file (PostToolUse hook). No unused vars, no un-disabled `any`.
- **Ladder shape (fixed):** `VerticalStationLadder = { readonly log2Denominator: number; readonly numerators: readonly number[]; readonly oddDenominatorFactor?: number }`. Stations = `numerators[i] / (oddDenominatorFactor ?? 1) · 2^log2Denominator`, sorted ascending, first is `0`, last is the denominator. A coarsened ladder MUST keep both endpoints, stay sorted/strictly-increasing, and keep the SAME denominator (so the tessellator still accepts it).
- **Verdict-stability calibration (locked):** trust a result iff the per-patch verdicts agree across a one-depth step; escalate `startDepth..maxDepth`; bound by `maxDepth` (default 5) and optional `budgetMs`. `reason ∈ 'converged' | 'max-depth' | 'budget' | 'cannot-coarsen'`.
- **Never over-claim an axis.** A patch whose ladder could not be safely coarsened records `coarsenedAxes[patch]='angular'` (angular-only), never silently implying both axes were tested.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Live concurrency on the branch: record BASE=HEAD before each task; explicit `git add <paths>` only (never `-A`).

## File Structure

- `research/bridge/_certRosterConvergenceLib.ts` — add `coarsenLadder`, `coarsenedAxesReport`, `verdictsAgree`, `convergePotSelfCalibrated`; make `coarsenDivisions` coarsen ladders.
- `research/bridge/_certRosterConvergence.test.ts` — unit tests for the new pure helpers; the `PF_CONVERGE_CONFIG` arbitrary-config driver path; emit `selfCalibration`/`coarsenedAxes`.
- `research/tools/potscope/potscope.mjs` — `convergeconfig` command; `readConverge`/`converge`/`doctor`/`dashboard` self-calibration handling.
- `research/tools/potscope/_potscope.test.mjs` — reader + `convergeconfig` tests.

---

## Task 1: Ladder coarsening (`coarsenLadder`) + ladder-aware `coarsenDivisions` v2

**Files:**
- Modify: `research/bridge/_certRosterConvergenceLib.ts`
- Test: `research/bridge/_certRosterConvergence.test.ts`

**Interfaces:**
- Consumes: `VerticalStationLadder`, `rationalStationLadder`, `dyadicEdgeLadder` from `../../src/geometry/targetSolid/annularSolidReferenceTessellation`.
- Produces:
  - `coarsenLadder(ladder: VerticalStationLadder, step: number): VerticalStationLadder`
  - `coarsenedAxesReport(fine, coarse): Record<string, 'angular' | 'angular+vertical'>`
  - `coarsenDivisions` now also coarsens each `verticalStationsByPatch` ladder (return type unchanged: the coarsened options).

- [ ] **Step 1: Write the failing test** (append to the `pure helpers` describe in `_certRosterConvergence.test.ts`)

```ts
import {
  coarsenLadder,
  coarsenedAxesReport,
} from './_certRosterConvergenceLib';
import {
  dyadicEdgeLadder,
  rationalStationLadder,
  tessellateAnnularRadialSolidTargetForCertification as tessellateForLadderCheck,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';

it('coarsenLadder halves stations, keeps endpoints + denominator, stays valid', () => {
  const ladder = dyadicEdgeLadder(4, 0, 'v0'); // uniform 16-row: numerators 0..16
  const coarse = coarsenLadder(ladder, 1);
  expect(coarse.log2Denominator).toBe(ladder.log2Denominator); // same denominator
  expect(coarse.numerators[0]).toBe(0); // endpoint kept
  expect(coarse.numerators[coarse.numerators.length - 1]).toBe(
    ladder.numerators[ladder.numerators.length - 1]
  ); // top endpoint kept
  expect(coarse.numerators.length).toBeLessThan(ladder.numerators.length); // genuinely reduced
  for (let i = 1; i < coarse.numerators.length; i += 1) {
    expect(coarse.numerators[i]).toBeGreaterThan(coarse.numerators[i - 1]); // strictly increasing
  }
  // a rational (non-dyadic) ladder keeps its oddDenominatorFactor
  const rat = rationalStationLadder(6, [[5, 29], [13, 29], [21, 29]]);
  const ratCoarse = coarsenLadder(rat, 1);
  expect(ratCoarse.oddDenominatorFactor).toBe(rat.oddDenominatorFactor);
  expect(ratCoarse.numerators.length).toBeLessThan(rat.numerators.length);
});

it('coarsenLadder is a no-op below 3 stations (nothing safe to drop)', () => {
  const tiny = { log2Denominator: 3, numerators: [0, 8] };
  expect(coarsenLadder(tiny, 1).numerators).toEqual([0, 8]);
});

it('coarsenedAxesReport marks ladder patches vertical when the ladder shrank', () => {
  const fine = {
    angularDivisionsLog2: 8,
    verticalDivisionsLog2ByPatch: { 'outer-wall': 6, 'inner-wall': 6 },
    verticalStationsByPatch: { 'inner-wall': dyadicEdgeLadder(5, 0, 'v0') },
  } as unknown as Parameters<typeof coarsenedAxesReport>[0];
  const coarse = coarsenDivisions(fine, 1);
  const axes = coarsenedAxesReport(fine, coarse);
  expect(axes['outer-wall']).toBe('angular+vertical'); // uniform vertical knob dropped
  expect(axes['inner-wall']).toBe('angular+vertical'); // ladder was coarsened (v2)
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `potfoundry-web/`): `npx vitest run research/bridge/_certRosterConvergence.test.ts -t "coarsenLadder"`
Expected: FAIL — `coarsenLadder`/`coarsenedAxesReport` not exported.

- [ ] **Step 3: Implement** (add to `_certRosterConvergenceLib.ts`, and extend `coarsenDivisions`)

```ts
import type { VerticalStationLadder } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';

/**
 * The COARSE variant of a station ladder: drop alternate INTERIOR stations
 * (stride 2 by index), keeping the two endpoints and the SAME denominator, so
 * the result is still a valid VerticalStationLadder the tessellator accepts —
 * a genuinely lower-resolution vertical grid. `step` halvings; a no-op once only
 * the endpoints remain. This is the v2 fix so ladder-pinned patches coarsen
 * VERTICALLY too (not angular-only).
 */
export function coarsenLadder(ladder: VerticalStationLadder, step: number): VerticalStationLadder {
  let nums = [...ladder.numerators];
  for (let s = 0; s < step; s += 1) {
    if (nums.length <= 2) break; // only endpoints left — nothing safe to drop
    const last = nums.length - 1;
    const kept: number[] = [nums[0]];
    for (let i = 2; i < last; i += 2) kept.push(nums[i]); // keep even interior indices
    kept.push(nums[last]); // top endpoint
    nums = kept;
  }
  return {
    log2Denominator: ladder.log2Denominator,
    numerators: nums,
    ...(ladder.oddDenominatorFactor !== undefined
      ? { oddDenominatorFactor: ladder.oddDenominatorFactor }
      : {}),
  };
}

/**
 * Per-patch report of which axes the coarse variant actually reduced, so a
 * verdict never over-claims: 'angular+vertical' when the uniform vertical knob
 * dropped OR the patch's station ladder shrank; 'angular' otherwise (a ladder
 * that could not be coarsened — e.g. already at endpoints).
 */
export function coarsenedAxesReport(
  fine: AnnularSolidReferenceTessellationOptions,
  coarse: AnnularSolidReferenceTessellationOptions
): Record<string, 'angular' | 'angular+vertical'> {
  const out: Record<string, 'angular' | 'angular+vertical'> = {};
  const fineLadders = fine.verticalStationsByPatch ?? {};
  const coarseLadders = coarse.verticalStationsByPatch ?? {};
  for (const patchId of Object.keys(fine.verticalDivisionsLog2ByPatch)) {
    const fineLadder = fineLadders[patchId];
    if (fineLadder === undefined) {
      // no ladder: the uniform vertical knob governs — did it drop?
      out[patchId] =
        coarse.verticalDivisionsLog2ByPatch[patchId] < fine.verticalDivisionsLog2ByPatch[patchId]
          ? 'angular+vertical'
          : 'angular';
    } else {
      const coarseLadder = coarseLadders[patchId];
      out[patchId] =
        coarseLadder !== undefined &&
        coarseLadder.numerators.length < fineLadder.numerators.length
          ? 'angular+vertical'
          : 'angular';
    }
  }
  return out;
}
```

Then extend `coarsenDivisions` (keep its signature — it still returns the coarsened options) so `verticalStationsByPatch` ladders are coarsened. Replace the current pass-through:

```ts
  const verticalStationsByPatch =
    divisions.verticalStationsByPatch === undefined
      ? undefined
      : (Object.fromEntries(
          Object.entries(divisions.verticalStationsByPatch).map(([patchId, ladder]) => [
            patchId,
            coarsenLadder(ladder, coarseStep),
          ])
        ) as AnnularSolidReferenceTessellationOptions['verticalStationsByPatch']);
  return {
    ...divisions,
    angularDivisionsLog2: Math.max(floors.angular, divisions.angularDivisionsLog2 - coarseStep),
    verticalDivisionsLog2ByPatch,
    ...(verticalStationsByPatch === undefined ? {} : { verticalStationsByPatch }),
  };
```

- [ ] **Step 4: Update the existing coarsenDivisions passthrough test**

The prior test `coarsenDivisions: reduces the two uniform knobs, clamps at floors, passes ladders through` asserts `expect(coarse.verticalStationsByPatch).toBe(fine.verticalStationsByPatch)`. That is now WRONG (v2 coarsens ladders). Change that assertion to verify the ladder was coarsened instead:

```ts
    // v2: a laddered patch now coarsens VERTICALLY too (ladder subsetted, endpoints kept)
    const fineLadder = fine.verticalStationsByPatch!['inner-wall'];
    const coarseLadder = coarse.verticalStationsByPatch!['inner-wall'];
    expect(coarseLadder.numerators[0]).toBe(fineLadder.numerators[0]);
    expect(coarseLadder.numerators.length).toBeLessThanOrEqual(fineLadder.numerators.length);
```
(The synthetic ladder in that test is `{ log2Denominator: 6, numerators: [0, 64] }` — only 2 stations, so `coarsenLadder` is a no-op and length is EQUAL; use `toBeLessThanOrEqual`. To exercise real reduction, that test's ladder may be widened to `dyadicEdgeLadder(4,0,'v0')` — optional.)

- [ ] **Step 5: Verify a coarsened ladder still tessellates** (the safety property)

Add an assertion inside the `coarsenLadder` test that a divisions using the coarse ladder tessellates without throwing (reuse a tiny binding). If constructing a binding is heavy, instead assert the structural invariants already covered (endpoints/monotone/denominator) — those are what `resolveStations` validates. Prefer the structural assertions (fast, deterministic); note in the report that a real-bake tessellation of a coarsened-ladder pot happens in Task 6.

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run research/bridge/_certRosterConvergence.test.ts -t "coarsen"`
Expected: PASS (new + updated coarsen tests). ESLint clean.

- [ ] **Step 7: Commit**

```bash
git add research/bridge/_certRosterConvergenceLib.ts research/bridge/_certRosterConvergence.test.ts
git commit -m "research(convergence): ladder coarsening (v2) — station ladders coarsen on both axes + coarsenedAxes report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `convergePotSelfCalibrated` (verdict-stability, dependency-injected)

**Files:**
- Modify: `research/bridge/_certRosterConvergenceLib.ts`
- Test: `research/bridge/_certRosterConvergence.test.ts`

**Interfaces:**
- Consumes: `convergePot`, `ConvergePotResult`, `ConvergenceVerdict` (Task 0 existing); `coarsenedAxesReport` (Task 1).
- Produces:
  - `verdictsAgree(a: ConvergePotResult, b: ConvergePotResult): Record<string, boolean>` — per-patch verdict equality.
  - `convergePotSelfCalibrated(config, options, runAtDepth?): SelfCalibratedResult` where `runAtDepth(config, depth) => ConvergePotResult` defaults to the real `convergePot`, and
    ```ts
    interface SelfCalibrateOptions { startDepth?: number; maxDepth?: number; coarseStep?: number; floors?: CoarsenFloors; budgetMs?: number; nowMs?: () => number; }
    type SelfCalibratedResult = ConvergePotResult & { selfCalibration: {
      method: 'verdict-stability'; depthsRun: number[]; finalDepth: number;
      perPatchStable: Record<string, boolean>; stable: boolean;
      reason: 'converged' | 'max-depth' | 'budget' | 'cannot-coarsen';
    } };
    ```

- [ ] **Step 1: Write the failing test** (a new describe — uses a STUB runner, no bake)

```ts
import { convergePotSelfCalibrated, verdictsAgree } from './_certRosterConvergenceLib';

// minimal fake ConvergePotResult with only the fields the stability logic reads
function fakeResult(depth: number, perPatchVerdict: Record<string, string>) {
  const perPatch: Record<string, unknown> = {};
  for (const [p, verdict] of Object.entries(perPatchVerdict)) {
    perPatch[p] = { verdict, ratio: 0, fineMaxMm: 1, coarseMaxMm: 1, fineTris: 1, coarseTris: 1 };
  }
  return { name: 'fake', styleId: 'X', depth, coarseStep: 1, fineDivisions: {}, coarseDivisions: {},
    perPatch, fineGlobalMaxMm: 1, coarseGlobalMaxMm: 1, fineTrisTotal: 2, coarseTrisTotal: 1,
    fineMs: 0, coarseMs: 0, fineEnclosures: 0, coarseEnclosures: 0, fallbackCount: 0 } as unknown;
}

describe('convergence probe — self-calibration', () => {
  it('stops at the depth where per-patch verdicts first agree', () => {
    const scripted: Record<number, Record<string, string>> = {
      2: { 'inner-wall': 'partial', 'outer-wall': 'responsive' },
      3: { 'inner-wall': 'irreducible', 'outer-wall': 'responsive' }, // inner changed 2->3
      4: { 'inner-wall': 'irreducible', 'outer-wall': 'responsive' }, // stable 3->4
    };
    const runAtDepth = (_cfg: unknown, d: number) => fakeResult(d, scripted[d]);
    const r = convergePotSelfCalibrated({} as never, { startDepth: 2, maxDepth: 5 }, runAtDepth as never);
    expect(r.selfCalibration.stable).toBe(true);
    expect(r.selfCalibration.reason).toBe('converged');
    expect(r.selfCalibration.finalDepth).toBe(4); // reported at the upper of the stable pair
    expect(r.depth).toBe(4);
  });

  it('reports UNCALIBRATED when verdicts never stabilize by maxDepth', () => {
    const flip = (d: number) => ({ 'inner-wall': d % 2 ? 'responsive' : 'irreducible' });
    const runAtDepth = (_cfg: unknown, d: number) => fakeResult(d, flip(d));
    const r = convergePotSelfCalibrated({} as never, { startDepth: 2, maxDepth: 4 }, runAtDepth as never);
    expect(r.selfCalibration.stable).toBe(false);
    expect(r.selfCalibration.reason).toBe('max-depth');
  });

  it('verdictsAgree compares per patch', () => {
    const a = fakeResult(2, { p: 'responsive', q: 'partial' });
    const b = fakeResult(3, { p: 'responsive', q: 'irreducible' });
    expect(verdictsAgree(a as never, b as never)).toEqual({ p: true, q: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run research/bridge/_certRosterConvergence.test.ts -t "self-calibration"`
Expected: FAIL — `convergePotSelfCalibrated`/`verdictsAgree` not exported.

- [ ] **Step 3: Implement**

```ts
export function verdictsAgree(a: ConvergePotResult, b: ConvergePotResult): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const patchId of Object.keys(a.perPatch)) {
    out[patchId] = a.perPatch[patchId].verdict === b.perPatch[patchId]?.verdict;
  }
  return out;
}

export interface SelfCalibrateOptions {
  readonly startDepth?: number;
  readonly maxDepth?: number;
  readonly coarseStep?: number;
  readonly floors?: CoarsenFloors;
  readonly budgetMs?: number;
  readonly nowMs?: () => number;
}
export type SelfCalibratedResult = ConvergePotResult & {
  readonly selfCalibration: {
    readonly method: 'verdict-stability';
    readonly depthsRun: number[];
    readonly finalDepth: number;
    readonly perPatchStable: Record<string, boolean>;
    readonly stable: boolean;
    readonly reason: 'converged' | 'max-depth' | 'budget' | 'cannot-coarsen';
  };
};

export function convergePotSelfCalibrated(
  config: CertifiedPot,
  options: SelfCalibrateOptions = {},
  runAtDepth: (cfg: CertifiedPot, depth: number) => ConvergePotResult = (cfg, depth) =>
    convergePot(cfg, { depth, coarseStep: options.coarseStep, floors: options.floors })
): SelfCalibratedResult {
  const startDepth = options.startDepth ?? 2;
  const maxDepth = options.maxDepth ?? 5;
  const now = options.nowMs ?? (() => Date.now());
  const t0 = now();
  const depthsRun: number[] = [startDepth];
  let prev = runAtDepth(config, startDepth);

  // cannot-coarsen guard: if the coarse mesh did not actually shrink, the ratio
  // is a meaningless ~1 — refuse rather than emit a false 'irreducible'.
  if (prev.coarseTrisTotal >= prev.fineTrisTotal) {
    return {
      ...prev,
      selfCalibration: { method: 'verdict-stability', depthsRun, finalDepth: startDepth,
        perPatchStable: {}, stable: false, reason: 'cannot-coarsen' },
    };
  }

  for (let depth = startDepth + 1; depth <= maxDepth; depth += 1) {
    const cur = runAtDepth(config, depth);
    depthsRun.push(depth);
    const perPatchStable = verdictsAgree(prev, cur);
    const stable = Object.values(perPatchStable).every(Boolean);
    if (stable) {
      return { ...cur, selfCalibration: { method: 'verdict-stability', depthsRun,
        finalDepth: depth, perPatchStable, stable: true, reason: 'converged' } };
    }
    if (options.budgetMs !== undefined && now() - t0 > options.budgetMs) {
      return { ...cur, selfCalibration: { method: 'verdict-stability', depthsRun,
        finalDepth: depth, perPatchStable, stable: false, reason: 'budget' } };
    }
    prev = cur;
  }
  return { ...prev, selfCalibration: { method: 'verdict-stability', depthsRun,
    finalDepth: prev.depth, perPatchStable: {}, stable: false, reason: 'max-depth' } };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run research/bridge/_certRosterConvergence.test.ts -t "self-calibration"`
Expected: PASS (3 tests). ESLint clean.

- [ ] **Step 5: Commit**

```bash
git add research/bridge/_certRosterConvergenceLib.ts research/bridge/_certRosterConvergence.test.ts
git commit -m "research(convergence): convergePotSelfCalibrated — verdict-stability self-calibration (cert-free), DI runner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Arbitrary-config driver path (`PF_CONVERGE_CONFIG`) + emit self-calibration

**Files:**
- Modify: `research/bridge/_certRosterConvergence.test.ts`

**Interfaces:**
- Consumes: `convergePotSelfCalibrated`, `coarsenedAxesReport` (Tasks 1–2).
- Produces: a driver branch that, when `PF_CONVERGE_CONFIG=<path.json>` is set, reads the config, runs `convergePotSelfCalibrated`, and writes `<name>.converge.json` with `configSource:'arbitrary'`, `selfCalibration`, and `coarsenedAxes` (and `calibration:null` — no cert reference). Roster path (no env) is unchanged.

- [ ] **Step 1: Write a failing guard test** (structural — no bake) in the `pure helpers` describe

```ts
// A tiny structural check that the config-JSON parse + shape guard exists.
// (The full bake path is exercised by Task 6's real bakes.)
it('parseConvergeConfig accepts a valid config and rejects a missing field', () => {
  const good = { name: 'X', styleId: 'GeometricStar', styleParams: { gs_relief: 0.08 },
    geometry: { H: 32, top_od: 30, bottom_od: 30, r_drain: 6 },
    divisions: { angularDivisionsLog2: 8, verticalDivisionsLog2ByPatch: { 'outer-wall': 5 } } };
  expect(() => parseConvergeConfig(JSON.stringify(good))).not.toThrow();
  expect(() => parseConvergeConfig(JSON.stringify({ ...good, divisions: undefined }))).toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run research/bridge/_certRosterConvergence.test.ts -t "parseConvergeConfig"`
Expected: FAIL — `parseConvergeConfig` not defined.

- [ ] **Step 3: Implement the config parse + driver branch**

Add near the top of `_certRosterConvergence.test.ts` (exported for the test):

```ts
export interface ConvergeConfig {
  readonly name: string;
  readonly styleId: string;
  readonly styleParams: Readonly<Record<string, number>>;
  readonly geometry: unknown; // GeometryParams shape — validated by atlas() downstream
  readonly divisions: unknown; // AnnularSolidReferenceTessellationOptions
  readonly coarseStep?: number;
  readonly maxDepth?: number;
  readonly budgetMs?: number;
}
export function parseConvergeConfig(json: string): ConvergeConfig {
  const c = JSON.parse(json) as Partial<ConvergeConfig>;
  for (const key of ['name', 'styleId', 'styleParams', 'geometry', 'divisions'] as const) {
    if (c[key] === undefined) throw new Error(`convergeconfig: missing '${key}'`);
  }
  return c as ConvergeConfig;
}
```

Add a `describe` (or an `it` gated on `process.env.PF_CONVERGE_CONFIG`) that:
- reads + `parseConvergeConfig` the file,
- builds `config` = `{ name, styleId, styleParams, geometry, divisions }` (a `CertifiedPot`-shaped object; cast as needed — `atlas`/`tessellate` validate),
- runs `const result = convergePotSelfCalibrated(config, { startDepth: 2, maxDepth: config.maxDepth ?? 5, coarseStep: config.coarseStep ?? 1, budgetMs: config.budgetMs });`
- computes `const coarsenedAxes = coarsenedAxesReport(config.divisions, result.coarseDivisions);`
- writes `<name>.converge.json` with the SAME schema as the roster path PLUS `configSource:'arbitrary'`, `selfCalibration: result.selfCalibration`, `coarsenedAxes`, and `calibration: null`.
- logs a `[probe:converge] <name> selfCal stable=<...> reason=<...> finalDepth=<...>` line.
- asserts `result.perPatch` is non-empty and, when `stable`, `fineGlobalMaxMm > 0` (NO cert-tolerance gate — there is no certificate).

Also, in the ROSTER path, add `coarsenedAxes: coarsenedAxesReport(result.fineDivisions, result.coarseDivisions)` to its emitted JSON (so roster + arbitrary converge.json share the field) — a one-line addition, no behavior change.

- [ ] **Step 4: Run the structural test**

Run: `npx vitest run research/bridge/_certRosterConvergence.test.ts -t "parseConvergeConfig"`
Expected: PASS. (Full bake path validated in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add research/bridge/_certRosterConvergence.test.ts
git commit -m "research(convergence): PF_CONVERGE_CONFIG arbitrary-config driver path + coarsenedAxes emit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `potscope convergeconfig` builder command

**Files:**
- Modify: `research/tools/potscope/potscope.mjs`
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- Produces: `reliefKeyForStyle(styleId)` (a documented per-style relief-param table + `--relief-key` override), `buildConvergeConfig({styleId, relief, reliefKey, od, h, ang, vert, name})` (pure → the config object), and `cmdConvergeConfig(args)` — CLI `convergeconfig <styleId> --relief r --od mm --h mm --ang log2 --vert log2 [--relief-key k] [--name n] [--out path]`.

- [ ] **Step 1: Write the failing test** (append to `_potscope.test.mjs`)

```ts
import { buildConvergeConfig, reliefKeyForStyle } from './potscope.mjs';

test('reliefKeyForStyle maps known styles, throws helpfully on unknown', () => {
  assert.equal(reliefKeyForStyle('GeometricStar'), 'gs_relief');
  assert.equal(reliefKeyForStyle('Crystalline'), 'cr_facet_depth');
  assert.throws(() => reliefKeyForStyle('NoSuchStyle'), /relief-key/);
});

test('buildConvergeConfig produces a valid convergePot-shaped config', () => {
  const cfg = buildConvergeConfig({ styleId: 'GeometricStar', relief: 0.08, od: 30, h: 32, ang: 8, vert: 5 });
  assert.equal(cfg.styleId, 'GeometricStar');
  assert.equal(cfg.styleParams.gs_relief, 0.08);
  assert.equal(cfg.geometry.top_od, 30);
  assert.equal(cfg.divisions.angularDivisionsLog2, 8);
  assert.ok(cfg.divisions.verticalDivisionsLog2ByPatch['outer-wall'] === 5);
  assert.ok(cfg.name.includes('GeometricStar'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `potfoundry-web/`): `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `buildConvergeConfig`/`reliefKeyForStyle` not exported.

- [ ] **Step 3: Implement in `potscope.mjs`**

```js
// The one legitimately style-specific bit: which styleParam is "relief". Extend
// per src/styles/registry.ts as styles are probed. Unknown -> explicit error.
const RELIEF_KEY = {
  GeometricStar: 'gs_relief', Crystalline: 'cr_facet_depth', Voronoi: 'v_relief',
  WaveInterference: 'wi_relief_depth', RippleInterference: 'ri_relief_depth',
  HarmonicRipple: 'hr_petal_amp', SpiralRidges: 'spiral_amp_max',
  SuperformulaBlossom: 'sf_strength',
};
export function reliefKeyForStyle(styleId) {
  const key = RELIEF_KEY[styleId];
  if (!key) throw new Error(`convergeconfig: no relief-key known for '${styleId}' — pass --relief-key <param> (see src/styles/registry.ts)`);
  return key;
}
export function buildConvergeConfig({ styleId, relief, reliefKey, od, h, ang, vert, name }) {
  const key = reliefKey ?? reliefKeyForStyle(styleId);
  const verticalDivisionsLog2ByPatch = {
    'outer-wall': vert, 'inner-wall': vert, 'top-rim': 3,
    'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
  };
  return {
    name: name ?? `${styleId}_arb_od${od}_h${h}_rel${String(relief).replace('.', 'p')}_a${ang}v${vert}`,
    styleId,
    styleParams: { [key]: relief },
    geometry: { H: h, top_od: od, bottom_od: od, r_drain: Math.min(6, Math.round(od / 5)) },
    divisions: { angularDivisionsLog2: ang, verticalDivisionsLog2ByPatch },
  };
}
function cmdConvergeConfig(args) {
  const styleId = args._[0];
  if (!styleId) { console.error('usage: convergeconfig <styleId> --relief r --od mm --h mm --ang log2 --vert log2 [--relief-key k] [--name n] [--out path]'); process.exit(2); }
  const num = (flag, dflt) => { const v = argValue(args, flag); return v === undefined ? dflt : Number(v); };
  const cfg = buildConvergeConfig({
    styleId, relief: num('--relief', 0.08), reliefKey: argValue(args, '--relief-key'),
    od: num('--od', 30), h: num('--h', 32), ang: num('--ang', 8), vert: num('--vert', 5),
    name: argValue(args, '--name'),
  });
  const out = resolve(argValue(args, '--out') ?? `${cfg.name}.convergeconfig.json`);
  writeFileSync(out, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(`  bake:  PF_CONVERGE_CONFIG="${out}" node ${'research/tools/potscope/potscope.mjs'} run -- npx vitest run research/bridge/_certRosterConvergence.test.ts`);
}
```
Wire `convergeconfig` into `main()` switch + help.

- [ ] **Step 4: Run to verify pass**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS (all prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): convergeconfig builder — write an arbitrary-config JSON for the probe

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Reader / doctor / dashboard accept the self-calibration method

**Files:**
- Modify: `research/tools/potscope/potscope.mjs`
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- `readConverge(path)` derives `calibrated` and `calibrationMethod`: prefer the existing cert `calibration` (`calibrationRatio <= tolerance`); else fall back to `selfCalibration.stable` with method `'depth-stability'`; else `calibrated:false`.

- [ ] **Step 1: Write the failing test** (append to `_potscope.test.mjs`)

```ts
test('readConverge derives calibrated from selfCalibration when no cert calibration', () => {
  const scWrite = (name, sc) => { const p = join(DIR, name);
    writeFileSync(p, JSON.stringify({ magic:'potscope-converge/v1', variant:'X', style:'X',
      perPatch:{ 'inner-wall': { ratio: 1.0, verdict:'irreducible' } },
      calibration: null, selfCalibration: sc }) ); return p; };
  const stable = readConverge(scWrite('a.converge.json', { method:'verdict-stability', stable:true, reason:'converged', finalDepth:3 }));
  assert.equal(stable.calibrated, true);
  assert.equal(stable.calibrationMethod, 'depth-stability');
  const unstable = readConverge(scWrite('b.converge.json', { method:'verdict-stability', stable:false, reason:'max-depth', finalDepth:5 }));
  assert.equal(unstable.calibrated, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `readConverge` doesn't yet expose `calibrationMethod`/self-cal fallback.

- [ ] **Step 3: Implement** — in `readConverge`, after parsing, compute:

```js
  const cert = header.calibration;
  const sc = header.selfCalibration;
  let calibrated, calibrationMethod;
  if (cert && typeof cert.calibrationRatio === 'number' && typeof cert.tolerance === 'number') {
    calibrated = cert.calibrationRatio <= cert.tolerance; calibrationMethod = 'cert';
  } else if (sc && typeof sc.stable === 'boolean') {
    calibrated = sc.stable; calibrationMethod = 'depth-stability';
  } else { calibrated = false; calibrationMethod = 'none'; }
  return { ...parsed, calibrated, calibrationMethod, calibrationRatio: cert?.calibrationRatio, selfCalibration: sc ?? null };
```

Then in `cmdConverge`: when `calibrationMethod==='depth-stability'` and `!calibrated`, the existing UNCALIBRATED warning fires with the self-cal `reason` (e.g. "did not converge by maxDepth"). In `dashboardHtml`/`buildDoctorReport`: they key off `calibrated` (already), so they need no change beyond passing `calibrationMethod` through for the label — add a small "(self-cal)" / "(cert)" marker next to the convergence verdict. Keep all existing tests green.

- [ ] **Step 4: Run to verify pass**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): converge tools accept the depth-stability self-calibration method

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Validation bakes (the acceptance evidence — real compute)

**Files:** none modified — this task RUNS the machinery and records results.

- [ ] **Step 1: Reproduce a certified config (self-cal must agree with cert-based)**

Write a config JSON for the exact `GeometricStar_H32_OD30_fract` params (or add a temporary roster passthrough), then:
```bash
PF_CONVERGE_CONFIG="<gs-cert-config>.json" node research/tools/potscope/potscope.mjs run -- npx vitest run research/bridge/_certRosterConvergence.test.ts
```
Expected: `selfCalibration.stable=true`; inner-wall verdict `irreducible` (matching the roster result). This proves self-calibration agrees with the cert-based calibration where both exist. Record the depthsRun + per-patch verdicts.

- [ ] **Step 2: A frontier config (the payoff — a measured verdict on an open problem)**

```bash
node research/tools/potscope/potscope.mjs convergeconfig GeometricStar --relief 0.08 --od 30 --h 32 --ang 9 --vert 6
PF_CONVERGE_CONFIG="GeometricStar_arb_...json" node research/tools/potscope/potscope.mjs run -- npx vitest run research/bridge/_certRosterConvergence.test.ts
node research/tools/potscope/potscope.mjs converge <that-name>
```
Record the verdict: does the chevron cliff at 4× the certified relief respond to density (refine) or stay irreducible (→ the anisotropic-flank kernel)? This is real campaign intelligence — report whatever it says, no massaging.

- [ ] **Step 3: Voronoi self-flags as unmeasurable**

Build a Voronoi config and run it; confirm `selfCalibration.stable=false` (verdicts never stabilize — consistent with the depth-2 427× / 512-fallback blowup). Record `reason`.

- [ ] **Step 4: Vertical-coarsening re-validation on the roster**

Re-bake the roster convergence with the v2 ladder coarsening:
```bash
PF_CONVERGE=all node research/tools/potscope/potscope.mjs run -- npx vitest run research/bridge/_certRosterConvergence.test.ts
```
Compare the ladder-patch verdicts (GeometricStar inner-wall, Voronoi inner-wall, HarmonicRipple_production) to the pre-v2 values. Report which changed now that vertical is also coarsened (new information, not a regression). Regenerate the dashboard (`potscope dashboard`) and confirm it renders the updated map + the self-cal markers.

- [ ] **Step 5: Record findings** in `research/lab/2026-07-22-tooling-acceleration-program.md` (append) and a short `.superpowers/sdd/arb-converge-validation.md`: the 4 results above, plus the honest state of the frontier verdict.

---

## Spec coverage map (self-review)

| Spec section | Task |
|---|---|
| §A self-calibration by verdict-stability (bounded escalation, reasons) | Task 2 |
| — cannot-coarsen guard | Task 2 (`coarseTrisTotal >= fineTrisTotal`) |
| §B vertical-coarsening v2 (`coarsenLadder`, ladder-aware `coarsenDivisions`, `coarsenedAxes`, angular-only fallback recorded) | Task 1 |
| §C config input — JSON (`PF_CONVERGE_CONFIG`) | Task 3 |
| §C config input — `convergeconfig` builder + relief-key table | Task 4 |
| §D reader/doctor/dashboard calibration-method | Task 5 |
| output schema (`selfCalibration`, `coarsenedAxes`, `configSource`) | Task 3 (emit), Task 5 (read) |
| validation plan (reproduce cert / frontier / Voronoi / roster re-bake) | Task 6 |
| cost bounding (`maxDepth`, `budgetMs`) | Task 2 |

**Deferred (spec §Open risks):** the "two consecutive steps" stability tightening is left for Task 6 to trigger only if a single-step plateau is observed in the real bakes (do not build it speculatively).
