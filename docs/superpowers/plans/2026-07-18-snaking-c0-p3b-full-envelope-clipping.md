# Snaking-C0 P3b — full-envelope clipping (close the crossing-crest gap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one remaining P3 gap — the ~1.58mm facet chord at strand-crossing crests — by clipping each ribbon↔background cliff to only its **visible (non-occluded) sub-arcs**, so inside every overlap diamond the OVER strand's ribbon is a single continuous sheet the crest crease threads with **no cliff crossing**, and the full CelticKnot pot chords to **< 0.01mm everywhere**, watertight.

**Architecture:** The blocker (root-caused in the M6b report) is topological, not density: the visible crest crease geometrically crosses the neighbouring strands' cliffs inside each overlap diamond. The fix is the P1-deferred "full-envelope clipping" done in the standalone mesher (P1 stays untouched): compute, per ribbon↔background cliff, the t-intervals where its strand is the z-buffer top (visible) vs occluded by another strand; feed only the **visible sub-arcs** to the CDT as constraints; close each occlusion boundary with the already-proven M4 occlusion wall + M3 junction pinch. With the under-strand's cliffs gone inside the diamond, the over-strand's crest crease (M2/M6a) threads one sheet and conforms to < 0.01mm.

**Tech Stack:** TypeScript, Vitest, `cdt2d`, `buildAnalyticRadiusFn`, the existing `src/geometry/doubleValued/` module (M1–M6a).

## Global Constraints

- **Standalone only.** Work ONLY in `potfoundry-web/src/geometry/doubleValued/` (+ the untracked STL under `research/exchange/`). Do NOT modify P1 `celticKnotCliffComplex.ts`, `analyticRadius.ts`, or any production file (import them read-only). Do NOT touch files another agent holds (`parallelPatchProof*`, `_patchProofWorker.ts`, Gothic cert, `validatedResidualProgram.ts`, `FeatureLineGraph.ts`, `triangleExactMeanValueScreen.test.ts`, `_gothicVoronoiConformingSpike.test.ts`).
- **Builds on M1–M6a** (commits `6e504ad3..854a0045`). The M6a crest-crossing crease exists behind a flag; this plan makes it compose. Read the M6b root-cause report first: `…/scratchpad/p3-m6b-report.md`.
- **Precision bar (definition of done):** full pot at DEFAULT params (ckRoundness=0.5) — nonManifold 0, boundary open edges only on the t-rims, independent vertex cert (`certifyAgainstTrueSurface`) sheetDev & cliffDev < 0.01mm, and **facet maxChord to the true analytic surface < 0.01mm EVERYWHERE (including crossing crests)**. Cross-checked by the production `auditWatertight`.
- **Honest measurement:** facet chord vs `buildAnalyticRadiusFn` directly (crest value is continuous → edge-midpoint/barycentric vs `surface(u,t)` valid; keep skipping genuine cliff-straddle samples). NEVER a self-referential re-mesh as ground truth (that circularity was caught in M2). The independent `certifyAgainstTrueSurface` is the vertex gate.
- **Determinism** (no Date/Math.random/DOM); **lint 0-max-warnings** (`npx eslint src/geometry/doubleValued/*.ts --max-warnings=0`); module typechecks clean (whole-project `npm run typecheck` has PRE-EXISTING unrelated errors — add none).
- **Coordinate convention:** `theta=2π·u`, `z=t·H`, `pos=[r·cosθ, r·sinθ, z]`.
- **Concurrency:** `git -C "C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0"` absolute paths; NEVER `git add -A`/`.`/`commit -a` — explicit paths only; the STL is UNTRACKED (never commit it); BEFORE commit `status --short` (only your doubleValued files), AFTER commit `show --stat --oneline -1` (only your files, else STOP+report); never `git stash`. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- All commands from `potfoundry-web/`.

---

## File Structure

- **Create:** `src/geometry/doubleValued/visibleEnvelope.ts` — the pure clipping stage: from strand geometry, compute each ribbon↔background cliff's visible (non-occluded) sub-arcs + the occlusion-boundary t-values.
- **Create:** `src/geometry/doubleValued/visibleEnvelope.test.ts`.
- **Modify:** `src/geometry/doubleValued/doubleValuedMesh.ts` and/or `celticKnotMesh.ts` — consume the clipped cliffs (visible sub-arcs) as CDT constraints instead of full-band cliffs; close each occlusion boundary with the M4 occlusion wall + M3 junction pinch; carry the over-strand crest crease through the (now crossing-free) diamond.
- **Modify:** `celticKnotMesh.test.ts` (crossing-crest chord assertions), the dev-gated STL emitter test (re-emit at default params).
- Reuse read-only: P1 `buildCelticKnotCliffComplex` (its `segments` incl. `kind:'occlusion'`, `junctions`), `buildAnalyticRadiusFn`, and the M1–M6a helpers (`buildDoubleValuedMesh`, `certifyAgainstTrueSurface`, `auditManifold`, the facet-chord metric, the crest-crease code from M6a).

**Interfaces produced:**

```ts
// visibleEnvelope.ts
export interface VisibleSubArc { strand: number; side: 1 | -1; column: number; tRange: [number, number]; }
export interface OcclusionBoundary { strand: number; side: 1 | -1; column: number; t: number; /* under-strand dives under / emerges here */ overStrand: number; }
export interface VisibleEnvelope { visibleCliffs: VisibleSubArc[]; occlusionBoundaries: OcclusionBoundary[]; }
export function clipCliffsToVisibleEnvelope(params: CelticKnotCliffParams, dims: CliffDims): VisibleEnvelope;
```

(`CelticKnotCliffParams`/`CliffDims` are P1's exported types. The strand geometry — `centerline(col,strand,t)=0.4·sin(t·tightness·τ·3 + col·π·0.333 + strand·τ/strandCount)`, `zHeight(col,strand,t)= (strandCount odd? sin : cos)(arg·max(1,strandCount−1))`, `strandWidth` — is the same closed form P1 and the mesher already use; re-derive it locally, do not import P1 internals.)

---

## Task 1: Visible-envelope clipping (pure)

Compute, for each ribbon↔background cliff `(column, strand, side)`, the maximal t-intervals where the strand's edge is the z-buffer top (visible), and the boundary t-values where it dives under / emerges. A point on strand `s`'s edge at t is OCCLUDED iff some other strand `k` covers it with higher z: `|localUEdge_s(t) − centerline_k(t)| < strandWidth` AND `zHeight_k(t) > zHeight_s(t)`.

**Files:** Create `src/geometry/doubleValued/visibleEnvelope.ts`, `visibleEnvelope.test.ts`.

**Interfaces:** Produces `clipCliffsToVisibleEnvelope`, `VisibleSubArc`, `OcclusionBoundary`, `VisibleEnvelope` (above).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { clipCliffsToVisibleEnvelope } from './visibleEnvelope';

// CelticKnot defaults (derived as celticKnotOuterWallTarget.parameters()); 1 column, 3 strands ⇒ real crossings.
const PARAMS = { columnCount: 1, strandWidth: 0.15 * 0.15, strandCount: 3, tightness: 0.5, relief: 2.0, gap: 0.02, roundness: 0.5 };
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('visible-envelope clipping', () => {
  it('clips each ribbon-background cliff to non-occluded sub-arcs and reports occlusion boundaries', () => {
    const env = clipCliffsToVisibleEnvelope(PARAMS, DIMS);
    // every declared full-band cliff (col×strand×side = 1×3×2 = 6) yields ≥1 visible sub-arc
    const cliffKeys = new Set(env.visibleCliffs.map((c) => `${c.column}:${c.strand}:${c.side}`));
    expect(cliffKeys.size).toBe(6);
    // crossings exist ⇒ at least one cliff is split (its visible arcs do not cover the full [0.02,0.98] band)
    const someClipped = env.visibleCliffs.some(
      (c) => c.tRange[0] > 0.02 + 1e-6 || c.tRange[1] < 0.98 - 1e-6
    );
    expect(someClipped).toBe(true);
    expect(env.occlusionBoundaries.length).toBeGreaterThan(0);
    // no visible sub-arc is actually occluded at its midpoint (the core invariant)
    for (const c of env.visibleCliffs) {
      const tm = 0.5 * (c.tRange[0] + c.tRange[1]);
      // occludedAt is exported for the test to assert the invariant directly
      expect((clipCliffsToVisibleEnvelope as unknown as { occludedAt?: unknown })).toBeDefined();
    }
    // boundaries lie strictly inside the band and pair a real over/under
    for (const b of env.occlusionBoundaries) {
      expect(b.t).toBeGreaterThan(0.02); expect(b.t).toBeLessThan(0.98);
      expect(b.overStrand).not.toBe(b.strand);
    }
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run src/geometry/doubleValued/visibleEnvelope.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `visibleEnvelope.ts`**

```ts
import type { CelticKnotCliffParams, CliffDims } from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';

export interface VisibleSubArc { strand: number; side: 1 | -1; column: number; tRange: [number, number]; }
export interface OcclusionBoundary { strand: number; side: 1 | -1; column: number; t: number; overStrand: number; }
export interface VisibleEnvelope { visibleCliffs: VisibleSubArc[]; occlusionBoundaries: OcclusionBoundary[]; }

const TAU = 2 * Math.PI;
const T_LO = 0.02, T_HI = 0.98, SCAN = 0.0005;

export function clipCliffsToVisibleEnvelope(p: CelticKnotCliffParams, _dims: CliffDims): VisibleEnvelope {
  const { columnCount, strandCount, strandWidth, tightness } = p;
  const weave = Math.max(1, strandCount - 1);
  const arg = (col: number, s: number, t: number): number =>
    t * tightness * TAU * 3 + col * Math.PI * 0.333 + s * (TAU / strandCount);
  const centerline = (col: number, s: number, t: number): number => 0.4 * Math.sin(arg(col, s, t));
  const zHeight = (col: number, s: number, t: number): number => {
    const o = arg(col, s, t) * weave;
    return strandCount % 2 !== 0 ? Math.sin(o) : Math.cos(o);
  };
  // strand s's edge occluded at t iff some other strand k covers localUEdge with higher z. Returns overStrand or -1.
  const occluderAt = (col: number, s: number, side: 1 | -1, t: number): number => {
    const localUEdge = centerline(col, s, t) + side * strandWidth;
    let best = -1, bestZ = zHeight(col, s, t);
    for (let k = 0; k < strandCount; k += 1) {
      if (k === s) continue;
      if (Math.abs(localUEdge - centerline(col, k, t)) < strandWidth && zHeight(col, k, t) > bestZ) {
        bestZ = zHeight(col, k, t); best = k;
      }
    }
    return best;
  };
  const visibleCliffs: VisibleSubArc[] = [];
  const occlusionBoundaries: OcclusionBoundary[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    for (let strand = 0; strand < strandCount; strand += 1) {
      for (const side of [1, -1] as const) {
        let runStart: number | null = null;
        let prevOcc = occluderAt(column, strand, side, T_LO);
        if (prevOcc < 0) runStart = T_LO;
        for (let t = T_LO + SCAN; t <= T_HI + 1e-9; t += SCAN) {
          const occ = occluderAt(column, strand, side, t);
          const wasVisible = prevOcc < 0, nowVisible = occ < 0;
          if (wasVisible !== nowVisible) {
            // bisect the flip for a clean boundary t
            let lo = t - SCAN, hi = t;
            for (let b = 0; b < 40; b += 1) {
              const m = 0.5 * (lo + hi);
              if ((occluderAt(column, strand, side, m) < 0) === wasVisible) lo = m; else hi = m;
            }
            const tb = 0.5 * (lo + hi);
            const over = wasVisible ? occ : prevOcc; // the strand that starts/stops occluding
            occlusionBoundaries.push({ strand, side, column, t: tb, overStrand: Math.max(0, over) });
            if (wasVisible && runStart !== null) { visibleCliffs.push({ strand, side, column, tRange: [runStart, tb] }); runStart = null; }
            if (nowVisible) runStart = tb;
          }
          prevOcc = occ;
        }
        if (runStart !== null) visibleCliffs.push({ strand, side, column, tRange: [runStart, T_HI] });
      }
    }
  }
  return { visibleCliffs, occlusionBoundaries };
}
```

(If the test's `occludedAt` invariant assertion is awkward as written, export a small `occludedAt(p, column, strand, side, t): boolean` helper and assert `false` at every visible sub-arc midpoint — that is the load-bearing invariant; write it that way.)

- [ ] **Step 4: Run to pass; lint; commit**

Run: `npx vitest run src/geometry/doubleValued/visibleEnvelope.test.ts` → PASS. `npx eslint src/geometry/doubleValued/*.ts --max-warnings=0`.
Commit (first line `feat(mesh): P3b T1 — visible-envelope cliff clipping (TDD)`) — files `visibleEnvelope.ts`, `visibleEnvelope.test.ts` only.

---

## Task 2: Mesh from clipped cliffs + diamond closure (LOAD-BEARING PROOF)

Feed the **visible sub-arcs** (not full-band cliffs) to the mesher for the single-column crossing case; close each occlusion boundary with the M4 occlusion wall (over-foot → under-surface) welded to the terminating under-cliff, and the M3 junction pinch where cliffs meet; carry the over-strand crest crease through the now crossing-free diamond. This resolves the exact M6b blocker: with the under-strand cliffs clipped out inside the diamond, the crest no longer crosses a cliff.

**Files:** Modify `doubleValuedMesh.ts` / `celticKnotMesh.ts`; Test `celticKnotMesh.test.ts`.

**Interfaces:** Consumes `clipCliffsToVisibleEnvelope` (T1), the M1–M6a mesher (`buildDoubleValuedMesh`, crest crease, junction pinch, occlusion wall), `certifyAgainstTrueSurface`, the facet-chord metric.

- [ ] **Step 1: Write the failing test** — single-column CelticKnot (default params, ckRoundness=0.5, with crossings), built through the clipped-cliff path. Assert: `nonManifold === 0`; boundary open edges only on the window rims (`boundaryNonRim === 0`); `certifyAgainstTrueSurface` sheetDev & cliffDev < 0.01mm (the M6b failure was cliffDev 0.60 — this must now hold); **facet maxChord at the crossing crests < 0.01mm** (the M6b/M5 gap was ~1.5mm). (Full test code written at execution against the current mesher entry signatures; assert all four bounds explicitly with the honest chord metric.)

- [ ] **Step 2: Run, watch fail** (the current full-band path spans ~1.5mm at crossing crests / or the M6a flag path cracks — either way the four-bound assertion fails).

- [ ] **Step 3: Implement** — route cliff constraints through the clipped set; at each `OcclusionBoundary`, terminate the under-cliff and weld the M4 occlusion wall (already emitted by the one-sided lift) so the under-ribbon sheet closes to the over-surface watertight; keep the M3 junction pinch; enable the over-strand crest crease through the diamond (now no cliff crossing). Preserve M1–M5 when clipping is disabled (gate the new path so prior tests stay byte-identical, OR update them intentionally if clipping becomes the default — decide and record).

- [ ] **Step 4: Run to pass; keep M1–M5 green; lint; typecheck; commit** — first line `feat(mesh): P3b T2 — mesh from clipped envelope, diamond closure, crest through crossing (TDD)`.

---

## Task 3: Full pot < 0.01mm everywhere + re-emit STL (DELIVER)

**Files:** Modify `celticKnotMesh.ts`, `celticKnotMesh.test.ts`, the dev-gated STL emitter test.

- [ ] **Step 1: Failing test** — full multi-column pot at DEFAULT params through the clipped path: `nonManifold === 0`; boundary only on t-rims (periodic u-seam welded); `certifyAgainstTrueSurface` sheetDev & cliffDev < 0.01mm; **facet maxChord < 0.01mm EVERYWHERE**.
- [ ] **Step 2: Run, watch fail** (composition at full periodic scale — the M6b multi-column crack must now be gone because there are no crossing constraints).
- [ ] **Step 3: Implement** the full-pot compose over the clipped envelope + refine to tolerance; log pass count + final facet maxChord (no silent caps). Ensure the periodic u-seam still welds and the degenerate crossing-centre wall slivers (M6 concern) are eliminated or proven zero-area/harmless.
- [ ] **Step 4: Verify + cross-check + re-emit STL** — run the production `auditWatertight` (`src/fidelity/bandRemesh/audit.ts`) and reconcile with your own; re-emit `research/exchange/_p3_celtic/celtic_perfect.stl` via the `PF_P3_STL=1` emitter at DEFAULT params; log tris + facet maxChord + nonManifold + STL size. Lint; typecheck; commit (first line `feat(mesh): P3b T3 — full CelticKnot pot literal-0.01mm everywhere + STL (TDD)`).
- [ ] **Step 5: Deliver** the STL path + the verified report (tris, nonManifold 0, boundary t-rims only, facet maxChord < 0.01, production cross-check) to the user.

---

## Self-Review notes (fill during execution)

- **T1 is deterministic and concrete; T2 is the load-bearing proof.** If, after clipping, the crossing-crest facet chord still will not reach < 0.01mm OR a diamond boundary will not close watertight, STOP and report — the remaining issue is the diamond-closure topology, not the clipping premise (which T1 pins). Do not loosen the < 0.01 assertion.
- **Watch the occlusion boundary weld:** the under-cliff terminates mid-band; its endpoint must weld to the occlusion wall AND the over-sheet with a shared vertex (no crack, no T-junction). This is the analogue of the M3 junction pinch at a 2-way (not 3-way) occlusion boundary.
- **Determinism:** fixed scan/bisection; no Date/Math.random.

## Definition of Done (P3b)

- [ ] `clipCliffsToVisibleEnvelope` clips every ribbon↔background cliff to its visible sub-arcs (T1, tested).
- [ ] Single-column crossing meshes watertight with the over crest threading one sheet at facet chord < 0.01mm (T2 — the M6b blocker resolved).
- [ ] Full pot at DEFAULT params: nonManifold 0, boundary only on t-rims, vertex cert < 0.01mm, **facet maxChord < 0.01mm everywhere**, production `auditWatertight` agrees; STL re-emitted and delivered (T3).
- [ ] All changes isolated under `src/geometry/doubleValued/`; M1–M5 behavior preserved (or intentionally updated with the change recorded).
- **Follow-up (separate):** the pending final whole-branch review of the `doubleValued/` module; production wiring into `assembleWatertight`.
