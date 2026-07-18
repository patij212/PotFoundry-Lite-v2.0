# Snaking-C0 Crest-Crossing Planarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the CelticKnot diamond-corner crest/inner-edge bridge facet to **facet maxChord < 0.01mm EVERYWHERE** on the full periodic pot (watertight, vertex-certified) by planarizing the over-crest × emerging-inner-edge constraint crossing at each corner.

**Architecture:** Standalone `potfoundry-web/src/geometry/doubleValued/` (not production-wired). A new pure stage computes, per diamond corner, the (u,t) point where the over-strand crest crease crosses the emerging under-strand inner-edge cliff, plus the split points on both constraints; the full-pot clip mesher feeds the CDT the **planarized** (split, shared-vertex) constraint set instead of the crossing pair, so no flat facet bridges the ~0.6mm step. Proven on ONE corner, then composed over the pot (the M6a→P3b isolated-then-compose methodology).

**Tech Stack:** TypeScript, Vitest, `cdt2d`, the existing `doubleValued/` module (M1–M6a + P3b clip + `731e0592` final-review fixes), `buildAnalyticRadiusFn`.

**Design spec:** `docs/superpowers/specs/2026-07-18-snaking-c0-crest-crossing-planarization-design.md`.

## Global Constraints

- **Standalone.** Edit ONLY `potfoundry-web/src/geometry/doubleValued/` (+ the untracked STL under `research/exchange/`). Import P1 (`.../tierC/celticKnotCliffComplex`, `analyticRadius`) and the production `auditWatertight` (`src/fidelity/bandRemesh/audit.ts`) READ-ONLY; modify no production file. Do NOT touch the concurrent-agent files: `validatedResidualProgram.ts`, `triangleExactMeanValueScreen.test.ts`, `_gothicVoronoiConformingSpike.test.ts`, `_gothicScreenSlackAudit.test.ts`, `parallelPatchProof*`, `_patchProofWorker.ts`, Gothic cert, `research/tools/potscope/*`.
- **Precision bar (assert literally, NO loosening):** `nonManifold === 0`; boundary open edges only on t-rims (`seamOpenEdges === 0`, `tRimBoundaryEdges === boundary`, `boundaryNonRim === 0`); `certifyAgainstTrueSurface` `maxSheetDevMm` AND `maxCliffDevMm` < 0.01 with `cliffVertsSkipped === 0`; **facet maxChord < 0.01mm EVERYWHERE**; production `auditWatertight` agrees.
- **Honest measurement.** Facet chord via `facetChordToTrueSurface` (verify.ts) vs the exact analytic surface, straddle-guarded on genuine surface-VALUE discontinuities only; NEVER a self-referential re-mesh. `certifyAgainstTrueSurface` is the independent vertex gate.
- **STOP rule.** If a stage will not reach < 0.01mm OR a crossing will not planarize watertight (e.g. `cdt2d` crashes on a non-planar PSLG), STOP and report the exact measured, localized residual (Status DONE_WITH_CONCERNS/BLOCKED). Do NOT loosen the gate, cap passes, widen the straddle, substitute a self-referential reference, or emit a non-conforming STL. A measured residual is a valid deliverable.
- **Determinism** (no Date/Math.random/DOM); **lint 0-warnings** (`npx eslint src/geometry/doubleValued/*.ts --max-warnings=0`); module typecheck-clean (whole-project `npm run typecheck` has PRE-EXISTING unrelated errors — add none).
- **Coordinate convention:** `theta = 2π·u`, `z = t·H`, `pos = [r·cosθ, r·sinθ, z]`.
- **Concurrency:** absolute `git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0"`; NEVER `git add -A`/`.`/`commit -a` — explicit paths only; STL UNTRACKED (never commit any `.stl`); BEFORE commit `status --short -- <your files>`, AFTER commit `show --stat --oneline -1` (only your files, else STOP+report); never `git stash`. End commit messages `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Ops:** full-pot tests carry 600000ms timeouts — run FOREGROUND with the Bash tool `timeout: 600000` (NEVER background them; a prior agent stalled by backgrounding). All commands from `potfoundry-web/`.

**Reproduction config (CelticKnot DEFAULT).** Style `{ ckScale:1, ckWidth:0.15, ckRelief:2, ckGap:0.02, ckRoundness:0.5, ckTwist:0, ckStrands:3 }` (→ strandWidth 0.0225, tightness 0.5, jump 0.6); DIMS `{ H:120, Rb:40, Rt:50 }`. `ckScale:1` = single column (reproduces the corner residual, ~5–10× faster); the full pot is 3 columns. Entry `buildCelticKnotFullPotMesh(style, DIMS, { baseGridU, baseGridT, across, maxRefinePasses, clipToVisibleEnvelope:true })`. The over-crest crease is `localU = centre_over(t)`; the emerging under-strand inner-edge is `localU = centre_under(t) ± strandWidth` (inner side, toward the over strand); `centre(col,s,t) = 0.4·sin(t·tightness·2π·3 + col·π·0.333 + s·2π/strandCount)`.

---

## File Structure

- **Create:** `src/geometry/doubleValued/crestCrossingPlanarize.ts` — pure stage: from the clip envelope + crest creases + junctions, compute each diamond corner's over-crest × emerging-inner-edge (u,t) crossing and the split points. One responsibility.
- **Create:** `src/geometry/doubleValued/crestCrossingPlanarize.test.ts`.
- **Modify:** `celticKnotMesh.ts` — the full-pot clip branch (`buildCelticKnotFullPotMesh`) and, for the one-corner proof, the single-crossing path (`meshColumnCrossing`/`buildCelticKnotCrestCrossingMesh`): feed the CDT the planarized constraints via the P3b `buildClippedConstraints` seam.
- **Modify:** `celticKnotMesh.test.ts` (one-corner proof + un-skip the full-pot T3 block), `_celticMeshStl.test.ts` (re-emit).
- Reuse read-only: `clipCliffsToVisibleEnvelope`/`occludedAt` (P3b), `crestCreasesThroughDiamonds` (M6a), `buildClippedConstraints` (P3b final-review dedupe), `buildDoubleValuedMesh`, `certifyAgainstTrueSurface`, `facetChordToTrueSurface`, `auditManifold`.

**Interfaces produced (crestCrossingPlanarize.ts):**
```ts
export interface CrestCrossing {
  column: number; overStrand: number; underStrand: number;
  u: number; t: number;               // the (u,t) intersection point
  underSide: 1 | -1;                  // which inner-edge of the under strand crosses
}
export interface CrestPlanarization {
  crossings: CrestCrossing[];
  // split-t values keyed per constraint, so the mesher terminates/passes constraints at the shared vertex
  crestSplitsByStrand: Map<string, number[]>;      // key `${column}:${strand}`
  innerEdgeSplitsBySeg: Map<string, number[]>;     // key `${column}:${strand}:${side}`
}
export function planarizeCrestCrossings(
  params: CelticKnotCliffParams, dims: CliffDims, domain: DomainWindow,
): CrestPlanarization;
```

---

## Task 1: RED baseline on the corrected mesher (MEASUREMENT — no production code)

Re-measure the post-`731e0592` clip so the fix has an honest target and the open cliffDev question is resolved. Deliverable is a measurement, committed only as a report note in the (still-skipped) T3 test header — no production change.

**Files:** Modify `celticKnotMesh.test.ts` (comment only, optional). Otherwise a throwaway probe (delete before commit).

- [ ] **Step 1: Measure the corrected full-pot + single-column clip.** In a throwaway test (`_ccpBaseline.test.ts`), build `buildCelticKnotFullPotMesh(DEFAULT, DIMS, { baseGridU:90, baseGridT:150, across:16, maxRefinePasses:3, clipToVisibleEnvelope:true })` for single column (`ckScale:1`) AND the 3-column pot. Log: `facetMaxChordMm` + `facetMaxU`/`facetMaxT`, `certification.maxCliffDevMm` + which vertex, `nonManifold`, `boundaryNonRim`, `seamOpenEdges`, tris. Run FOREGROUND (`timeout:600000`).

- [ ] **Step 2: Resolve the cliffDev question.** Sweep density (baseGridT 110/150/200, passes 1/3): does `maxCliffDevMm` stay ~0.60 (a second real blocker) or drop < 0.01 (density-reducible)? For the worst cliff vertex, record whether it is a junction/centroid-fallback vertex (`dirCnt==0`) or a locus vertex. This is the definitive post-fix answer the P3b I1 fix left open.

- [ ] **Step 3: Record + clean up.** Write the baseline (facet + cliffDev + localization + the cliffDev verdict) to `.superpowers/sdd/ccp-task-1-report.md`. Optionally update the skipped T3 test header comment with the corrected post-fix numbers (comment only). DELETE the throwaway probe. Commit ONLY if the T3 comment changed (first line `docs(mesh): CCP T1 — post-fix clip RED baseline`); otherwise no commit (measurement recorded in the report).

**Gate:** the baseline numbers + the cliffDev verdict are recorded and reproducible. This task establishes what Tasks 3–4 must beat; it does not itself change behavior.

---

## Task 2: Pure crest × inner-edge crossing computation

Compute, per diamond corner, where the over-strand crest crease crosses the emerging under-strand inner-edge cliff, and the split points on both. Pure, deterministic, tested in isolation (like P3b T1).

**Files:** Create `crestCrossingPlanarize.ts`, `crestCrossingPlanarize.test.ts`.
**Interfaces:** Produces `planarizeCrestCrossings`, `CrestCrossing`, `CrestPlanarization` (above). Consumes P1 types + the closed-form `centre`/`zHeight` (re-derived locally, as `visibleEnvelope.ts` does).

- [ ] **Step 1: Write the failing test.**
```ts
import { describe, it, expect } from 'vitest';
import { planarizeCrestCrossings } from './crestCrossingPlanarize';

const PARAMS = { columnCount: 1, strandWidth: 0.15 * 0.15, strandCount: 3, tightness: 0.5, relief: 2.0, gap: 0.02, roundness: 0.5 };
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1.1 };
const DOMAIN = { tLo: 0.02, tHi: 0.98 };

describe('crest × inner-edge crossing planarization (pure)', () => {
  it('finds a shared crossing for each diamond corner where over-crest crosses an emerging inner-edge', () => {
    const p = planarizeCrestCrossings(PARAMS, DIMS, DOMAIN);
    // 3-strand single column has real crossings ⇒ at least one crest×inner-edge crossing
    expect(p.crossings.length).toBeGreaterThan(0);
    for (const c of p.crossings) {
      expect(c.overStrand).not.toBe(c.underStrand);
      expect(c.t).toBeGreaterThan(DOMAIN.tLo); expect(c.t).toBeLessThan(DOMAIN.tHi);
      // the crossing lies on the over-crest: its u equals the over strand centreline u at t (within scan tol)
      // and on the under inner-edge: |localU(cross) − (centre_under ± w)| ≈ 0. Asserted via exported helpers.
    }
    // every crossing produces a split on BOTH the over-crest and the under inner-edge at that t
    for (const c of p.crossings) {
      const crestKey = `${c.column}:${c.overStrand}`;
      const edgeKey = `${c.column}:${c.underStrand}:${c.underSide}`;
      expect((p.crestSplitsByStrand.get(crestKey) ?? []).some((t) => Math.abs(t - c.t) < 1e-4)).toBe(true);
      expect((p.innerEdgeSplitsBySeg.get(edgeKey) ?? []).some((t) => Math.abs(t - c.t) < 1e-4)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it, watch it fail.** `npx vitest run src/geometry/doubleValued/crestCrossingPlanarize.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `crestCrossingPlanarize.ts`.** Re-derive `centre`/`zHeight` locally (as `visibleEnvelope.ts`). For each column and each ordered strand pair (over = higher `zHeight` at the crossing, under = lower), over the diamond t-interval where they overlap (`|centre_over − centre_under| < 2·strandWidth`): the over-crest curve is `u = uOf(centre_over(t))`; the emerging under inner-edge is `u = uOf(centre_under(t) + underSide·strandWidth)` for the inner side (the side toward the over strand). Find the t where these two u-curves are equal (a sign change of their difference — fixed scan + bisection, deterministic). Emit a `CrestCrossing` at that (u,t) and record the split t on both `crestSplitsByStrand[over]` and `innerEdgeSplitsBySeg[under:underSide]`. Export any small helper the test asserts against (e.g. `crestUAt`, `innerEdgeUAt`). Keep it pure.

- [ ] **Step 4: Run to pass; lint; commit.** `npx vitest run ...crestCrossingPlanarize.test.ts` → PASS. `npx eslint src/geometry/doubleValued/*.ts --max-warnings=0`. Commit files `crestCrossingPlanarize.ts`, `crestCrossingPlanarize.test.ts` only (first line `feat(mesh): CCP T2 — pure crest × inner-edge crossing planarization (TDD)`).

---

## Task 3: One-corner planarization proof (LOAD-BEARING)

Feed the planarized (split, shared-vertex) constraints to the mesher for ONE isolated diamond corner and prove the bridging facet closes. This is the M6b-successor proof: if it will not close, the crossing geometry is the blocker (STOP + report), not density.

**Files:** Modify `celticKnotMesh.ts` (the single-crossing clip path — `buildCelticKnotCrestCrossingMesh`/`meshColumnCrossing`, injecting the Task-2 splits via `buildClippedConstraints`); Test `celticKnotMesh.test.ts`.
**Interfaces:** Consumes `planarizeCrestCrossings` (T2), `buildClippedConstraints` (P3b), the M1–M6a mesher, `facetChordToTrueSurface`, `certifyAgainstTrueSurface`.

- [ ] **Step 1: Write the failing test** — single-column CelticKnot DEFAULT (ckRoundness 0.5, ckStrands 3), built through the clipped + **crest-crossing-planarized** path, scoped to one crossing window. Assert all four literally: `nonManifold === 0`; `boundaryNonRim === 0`; `certifyAgainstTrueSurface` sheetDev & cliffDev < 0.01 with `cliffVertsSkipped === 0`; **facet maxChord at the corner < 0.01mm** (the un-planarized baseline is ~0.2–0.48mm — assert the fixed value < 0.01 AND that the un-planarized value is > 0.01, encoding the RED baseline in the test as M6a does). (Full test written at execution against the current entry signatures; assert the four bounds with the honest metric — do not loosen.)

- [ ] **Step 2: Run, watch fail** — the un-planarized corner bridges ~0.2–0.48mm, so the < 0.01 facet assertion fails (or, if the naïve planarization is non-planar, `cdt2d` crashes — that failure IS the signal that the split must be a clean shared vertex).

- [ ] **Step 3: Implement** — inject the Task-2 split points into the constraint set the CDT receives (via `buildClippedConstraints`): split the over-crest crease AND the emerging inner-edge arc at each `CrestCrossing.t`, and insert the shared `(u,t)` vertex so both constraints terminate/pass through it (no two constraints cross without a vertex ⇒ a clean planar PSLG ⇒ no `cdt2d` crash, no bridging facet). Keep M1–M6a + P3b T2 behavior gated (new path behind a `planarizeCrests` option, default OFF, so prior tests stay byte-identical — verify).

- [ ] **Step 4: Run to pass; keep M1–M6a + P3b T2 green; lint; typecheck; commit** — first line `feat(mesh): CCP T3 — one-corner crest-crossing planarization proof (TDD)`. If it will not close, STOP + report the measured residual per the STOP rule.

---

## Task 4: Compose over the periodic pot

Apply per-corner planarization across all diamonds/columns + the periodic seam in the full-pot clip build, and close facet < 0.01mm EVERYWHERE.

**Files:** Modify `celticKnotMesh.ts` (`buildCelticKnotFullPotMesh` clip branch), `celticKnotMesh.test.ts` (un-skip the P3b T3 block).

- [ ] **Step 1: Un-skip + strengthen the full-pot test** — change the P3b T3 `describe.skip` to `describe`, keeping its strict bounds: `nonManifold === 0`; boundary only t-rims (`seamOpenEdges === 0`, `tRimBoundaryEdges === boundary`, `boundaryNonRim === 0`); cert sheetDev & cliffDev < 0.01, `cliffVertsSkipped === 0`; **facet maxChord < 0.01mm EVERYWHERE**. (If Task 1 found cliffDev is a genuine second blocker, its < 0.01 assertion is part of this gate; if density-reducible, ensure the chosen default density resolves it — record which.)

- [ ] **Step 2: Run, watch fail** — the full-pot clip without per-corner planarization fails the facet (the P3b T3 residual).

- [ ] **Step 3: Implement** — run `planarizeCrestCrossings` globally over all columns; inject every corner's splits into the full-pot `buildClippedConstraints` call; the periodic u-seam still welds; the m4-harden junction-bind guard still holds (108/108). Log pass count + final facet maxChord (no silent caps). Ensure no degenerate crossing-centre slivers.

- [ ] **Step 4: Run to pass; lint; typecheck; commit** — first line `feat(mesh): CCP T4 — full-pot crest-crossing planarization, literal-0.01mm everywhere (TDD)`. STOP + report honestly if it will not compose.

---

## Task 5: Deliver — verify, cross-check, re-emit STL

**Files:** Modify `_celticMeshStl.test.ts`.

- [ ] **Step 1: Production cross-check** — run `auditWatertight` (`src/fidelity/bandRemesh/audit.ts`, read-only) on the full-pot planarized mesh; reconcile with `auditManifold`; report both.
- [ ] **Step 2: Re-emit the STL** — via the `PF_P3_STL=1` emitter at DEFAULT params, FRESH; log tris + facet maxChord + nonManifold + STL bytes. STL is UNTRACKED — do NOT commit it.
- [ ] **Step 3: Commit** the emitter change (explicit paths, no `.stl`) — first line `feat(mesh): CCP T5 — deliver planarized CelticKnot pot + STL`.
- [ ] **Step 4: Deliver** the STL path + verified report (tris, nonManifold 0, boundary t-rims only, facet maxChord < 0.01, cliffDev < 0.01, production cross-check) to the user.

---

## Definition of Done
- One diamond corner planarized to facet < 0.01mm, watertight, `cdt2d` stable (Task 3).
- Full pot at DEFAULT: facet maxChord < 0.01mm EVERYWHERE, cliffDev < 0.01, nonManifold 0, boundary only t-rims, cert < 0.01, production `auditWatertight` agrees; STL re-emitted (Tasks 4–5).
- All changes isolated under `src/geometry/doubleValued/`; M1–M6a + P3b T2 preserved (planarize OFF ⇒ byte-identical) or intentionally updated + recorded.
- **Follow-up (separate):** production wiring into `assembleWatertight`; the ledgered ride-Minors (P3b m3, m5).
