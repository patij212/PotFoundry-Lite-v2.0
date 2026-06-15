# Stage 2 / Phase 1b — efg-DP Diagonal Lever & Measurement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or subagent-driven-development. Steps use `- [ ]`.

**Goal:** Measure whether activating the max-min-angle (Klincsek DP) diagonal — the
mechanism Phase-1 isolated, dead by default because `efgSampler` is never injected —
lifts the **bulk** triangulation slivers on the catastrophic styles, watertight and
without chord regression; decide whether to promote it to default (Phase 2).

**Architecture:** A flag-gated dev lever `__pfConformingEfgDP` injects the existing
surface `sampler` as the quadtree's `efgSampler` (one wiring point, `ConformingWall.ts:270`),
so `efg` populates and the `aniso && efg` DP gate fires. Default off → byte-identical.
Then a quality sweep (off vs on) measures min-angle, with watertight + chord guarded.

**Tech Stack:** TypeScript, Vitest, Playwright/WebGPU probes, the `__pfFidelity` API.

**References:** design `2026-06-15-stage2-triangle-quality-design.md`; Phase-1 findings
`2026-06-10-export-endgame-evidence/stage2-phase1-findings.md`. Code anchors:
DP gate `QuadtreeTriangulator.ts:582/618/652` + `FeatureConformingTriangulator.ts:741`;
efg populate `PeriodicBalancedQuadtree.ts:608` (guarded by `if (this.efgSampler)`);
efg-suppress safety `EFG_MAX_REL_VARIATION=0.5`; default-no-inject `ConformingWall.ts:270`
(`buildQuadtreeAtScale`, `sampler` is param 1).

---

## File structure
- **Create** `potfoundry-web/src/renderers/webgpu/parametric/conforming/efgSamplerOverride.ts` — pure resolver (isolated, unit-tested).
- **Create** `…/efgSamplerOverride.test.ts`.
- **Modify** `potfoundry-web/src/renderers/webgpu/parametric/conforming/ConformingWall.ts:241-272` — read `__pfConformingEfgDP`, resolve the efgSampler at the quadtree construction.
- **Create** `potfoundry-web/src/renderers/webgpu/parametric/conforming/efgDpWatertight.test.ts` — flag-on topology verification.
- **Create** `potfoundry-web/e2e/_fidelity_quality_efgdp_sweep.cjs` — quality sweep probe.
- **Create (output)** `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1b-efgdp-{sweep.md,findings.md}`.

---

## Pre-flight
- [ ] **P1: gitnexus re-index.** This phase edits production triangulation code; refresh
  the stale index so impact analysis is accurate: `node .gitnexus/run.cjs analyze` (from
  repo root; fallback `npx gitnexus analyze`).
- [ ] **P2: Dev server** up on 3001 (probes pass `PF_BASE_URL=http://127.0.0.1:3001/?fidelity=1`).
- [ ] **P3: GPU hygiene** — let probes reach `browser.close()`; never hard-kill.

---

## Task 1: The `__pfConformingEfgDP` lever (TDD)

**Files:** create `efgSamplerOverride.ts` + `.test.ts`; modify `ConformingWall.ts:241-272`.

- [ ] **Step 1: Failing test.** Create `efgSamplerOverride.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveEfgSampler } from './efgSamplerOverride';

const A = { position: () => [0, 0, 0] as const } as unknown as object;
const B = { position: () => [1, 1, 1] as const } as unknown as object;

describe('resolveEfgSampler', () => {
  it('returns undefined when no opts sampler and flag off (production byte-identical)', () => {
    expect(resolveEfgSampler(undefined, B as never, false)).toBeUndefined();
  });
  it('injects the surface sampler when the flag is on and none was provided', () => {
    expect(resolveEfgSampler(undefined, B as never, true)).toBe(B);
  });
  it('always prefers an explicitly-provided opts sampler', () => {
    expect(resolveEfgSampler(A as never, B as never, true)).toBe(A);
    expect(resolveEfgSampler(A as never, B as never, false)).toBe(A);
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/renderers/webgpu/parametric/conforming/efgSamplerOverride.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement.** Create `efgSamplerOverride.ts`:

```typescript
import type { SurfaceSampler } from './SurfaceSampler';

/**
 * Resolves the quadtree `efgSampler` (which, when present, activates the max-min-angle
 * Klincsek DP diagonal selection). Production passes no opts sampler and the flag is
 * off → returns undefined → DP stays dead → byte-identical. The diagnostic flag
 * `__pfConformingEfgDP` injects the surface sampler so `efg` populates and the DP fires.
 */
export function resolveEfgSampler(
  optsEfgSampler: SurfaceSampler | undefined,
  surfaceSampler: SurfaceSampler,
  flagEnabled: boolean,
): SurfaceSampler | undefined {
  if (optsEfgSampler) return optsEfgSampler;
  return flagEnabled ? surfaceSampler : undefined;
}
```
(If `SurfaceSampler` is exported elsewhere, match the existing import path used in `ConformingWall.ts`.)

- [ ] **Step 4: Run → pass.** Same command → PASS (3 tests).

- [ ] **Step 5: gitnexus impact before the production edit.** Run
  `gitnexus_impact({ target: "buildQuadtreeAtScale", direction: "upstream", repo: "PotFoundry-Lite-v2.0" })`;
  report the blast radius. Stop + warn if HIGH/CRITICAL.

- [ ] **Step 6: Wire the lever** in `ConformingWall.ts`. Add the import near the other
  conforming imports:
```typescript
import { resolveEfgSampler } from './efgSamplerOverride';
```
In `buildQuadtreeAtScale` (the `return new PeriodicBalancedQuadtree(field, sampler, { … })`),
replace the `efgSampler: opts.efgSampler,` line (~:270) with:
```typescript
    efgSampler: resolveEfgSampler(
      opts.efgSampler,
      sampler,
      (globalThis as unknown as { __pfConformingEfgDP?: boolean }).__pfConformingEfgDP === true,
    ),
```

- [ ] **Step 7: Byte-identical-off verification.** Run the conforming suite (flag unset):
  `npx vitest run src/renderers/webgpu/parametric/conforming src/renderers/webgpu/ParametricExportConformingValidation.test.ts src/geometry/conformingTopologyGate.test.ts`
  → all pass unchanged (the resolver returns undefined when `opts.efgSampler` is undefined
  and the global is unset). Plus `npm run typecheck` clean. If any conforming snapshot
  changes, STOP — the default path is not byte-identical.

- [ ] **Step 8: Commit.** `gitnexus_detect_changes()` then:
```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/efgSamplerOverride.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/efgSamplerOverride.test.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/ConformingWall.ts
git commit -m "feat(fidelity): __pfConformingEfgDP lever — activate max-min-angle DP (flag-gated, byte-identical off)"
```

---

## Task 2: Watertight verification of the flag-ON path

**Files:** create `efgDpWatertight.test.ts` (mirror the build+validate helpers in
`src/geometry/conformingTopologyGate.test.ts`).

- [ ] **Step 1: Write the test.** Set `globalThis.__pfConformingEfgDP = true` in
  `beforeAll` (restore in `afterAll`), then run the SAME representative build+topology
  assertions the topology gate uses (bnd=0, nonManifold=0, orientation=0, sliver-topology
  count=0) on ≥3 catastrophic styles (e.g. GyroidManifold, BasketWeave, CelticKnot at
  default dims). Read `conformingTopologyGate.test.ts` for the exact builder/validator API
  and replicate it with the flag on.

- [ ] **Step 2: Run → confirm watertight.** `npx vitest run src/renderers/webgpu/parametric/conforming/efgDpWatertight.test.ts` → PASS (DP path is watertight/manifold/sliver-free-topology). If it FAILS, the DP breaks conformity — STOP, the lever cannot ship; record the failure as a finding.

- [ ] **Step 3: Commit.**
```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/efgDpWatertight.test.ts
git commit -m "test(fidelity): efg-DP flag-on watertight/topology verification"
```

---

## Task 3: efg-DP quality sweep (the decisive measurement)

**Files:** create `_fidelity_quality_efgdp_sweep.cjs`; output `stage2-phase1b-efgdp-sweep.md`.

- [ ] **Step 1: Write the probe** (copy `_fidelity_quality_ubias_sweep.cjs`, swap the lever):
  for `efgdp ∈ {off, on}` set `window.__pfConformingEfgDP = (efgdp === 'on')` in
  `addInitScript`; measure `diagnoseCrestQuality` (worst/p1/%<bar/band/bulk) and, with
  `PF_CHORD=1`, `diagnoseSurfaceFidelity(metric:'perpendicular', denseN:4)` as a chord
  regression check. Print one row per state.

- [ ] **Step 2: Smoke** on Gyroid:
  `PF_BASE_URL=http://127.0.0.1:3001/?fidelity=1 PF_STYLE=GyroidManifold node potfoundry-web/e2e/_fidelity_quality_efgdp_sweep.cjs`
  → two rows (off/on); the `on` row should change tris and/or angles (DP active). If
  identical, the flag isn't taking effect — check the wiring.

- [ ] **Step 3: Run** on the catastrophic styles + control (PF_CHORD=1):
  `for S in GyroidManifold BasketWeave ArtDeco DragonScales CelticKnot HexagonalHive SuperformulaBlossom Voronoi FourierBloom; do PF_BASE_URL=http://127.0.0.1:3001/?fidelity=1 PF_STYLE=$S PF_CHORD=1 node potfoundry-web/e2e/_fidelity_quality_efgdp_sweep.cjs; done`
  Interpret: `on` lifts bulk `%<bar` and/or worst min-angle → DP helps (promote candidate);
  flat → DP insufficient (the slivers are degenerate-cell/transition, needs Task-4 escalation);
  `chordP99` must not rise (regression sanity).

- [ ] **Step 4: Record + commit** the sweep table to `stage2-phase1b-efgdp-sweep.md` (+ json), per-style verdict.
```bash
git add potfoundry-web/e2e/_fidelity_quality_efgdp_sweep.cjs docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1b-efgdp-sweep.md
git commit -m "test(fidelity): efg-DP quality sweep — does the max-min-angle DP lift bulk slivers"
```

---

## Task 4: Findings + promote/escalate decision

**Files:** create `stage2-phase1b-efgdp-findings.md`.

- [ ] **Step 1: Write findings** sourced from the sweep: per-style Δ(worst min-angle, %<bar)
  off→on, the watertight result (Task 2), the chord-regression check; the decision —
  (a) DP lifts bulk slivers cleanly + watertight + no chord regression → **promote to
  default** (flip the flag in Phase 2, with full e2e/STL parity), or (b) DP helps some
  styles only → per-style; or (c) residual catastrophic-worst (<1°) cells survive →
  escalate to the transition-template/degenerate-cell investigation (and the Phase-3
  sharp-feature exclusion for input-forced loci).
- [ ] **Step 2: Commit.**
```bash
git add docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-phase1b-efgdp-findings.md
git commit -m "docs(fidelity): efg-DP findings — promote/escalate decision"
```

---

## Self-review
- **Spec coverage:** implements design §4 Approach A (the diagonal sub-lever, the one
  Phase-1 left standing after refuting anisotropy) + §6.2 measured-per-fix + the §7
  watertight/chord guardrails (Task 2 + Task 3 chord check). The degenerate-cell /
  input-forced residue routes to Task-4 escalation (Phase 3), not silently dropped.
- **Byte-identical:** Task 1 Step 7 proves flag-off is byte-identical (resolver returns
  undefined). Production untouched until a Phase-2 promotion.
- **No placeholders:** resolver + test + wiring + probe are concrete; Task 2's exact test
  code is filled by reading `conformingTopologyGate.test.ts` at execution (inline) — its
  shape (set global, run the existing build+validate assertions) is specified.
- **Mandates:** gitnexus re-index (P1) + impact before the edit (Task 1 Step 5) +
  detect_changes before commit (Task 1 Step 8); ESLint 0-warnings via hook.
```
