// _h2Equivalence.test.ts — 1 WORKER vs 8 MUST BE BYTE-EQUAL. Gated PF_H2EQ=1. RESEARCH ONLY.
//
//     cd potfoundry-web
//     PF_H2EQ=1 npx vitest run research/bridge/_h2Equivalence.test.ts -c vitest.h2eq.config.ts
//
// H2 phase A now runs on a worker-thread pool. Parallelism is only allowed in this suite if it CANNOT MOVE A
// REPORTED NUMBER, so this file exists to make that a measurement rather than an argument, on a REAL audited
// mesh (research/exchange/_strataConformBisect/gothicarches_ring_DS-.stl, 4,384 facets) with the REAL
// GothicArches surface at registry defaults.
//
// WHY A QUERY BUDGET AND NOT A TIME BUDGET. `surfaceToMeshMax` truncates phase B on `queries > budget` OR on
// a wall clock. A wall clock makes serial-vs-pooled a RACE: the two arms would refine different numbers of
// cells and then be compared for equality, which is either vacuous or spuriously red. Every arm here gets the
// same `budget` and a `timeBudgetMs` far beyond any plausible run, so the truncation point is a function of
// the arithmetic alone and the comparison is exact.
//
// TWO LEVELS, because passing only the second would leave the interesting failure mode uncovered:
//
//   E1  THE KERNEL. Call the phase-A runner directly, W=1 and W=8, on the same `H2Geom`, and compare all
//       131,072 PER-CELL HEAP KEYS element by element with Object.is, plus every field of the merged
//       partial. This is the sharp test: the keys are what seeds phase B's heap, and a merge that got the
//       argmax tie-break wrong, or a cursor that let two workers claim one cell, shows up here directly
//       instead of being laundered through a hundred thousand subsequent refinements.
//
//   E2  END TO END. `surfaceToMeshMax` three ways — no pool at all (today's exact path), pool at W=1, pool at
//       W=8 — and every field of the result compared with Object.is. `secs` is excluded and is the ONLY
//       exclusion; it is wall clock by definition.
//
// AND THE PARALLELISM ITSELF IS WITNESSED. A pool whose cursor was mis-wired so that worker 0 swept
// everything would produce a perfectly equal answer, a useless speedup, and a green test. `perWorkerQueries`
// is asserted to be non-zero for every worker, so "equal" cannot be bought by "not actually parallel".
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import {
  detectThetaJumps, detectZJumps, pickLocatorCell, surfaceToMeshMax,
  type SurfaceToMeshOpts, type SurfaceToMeshResult,
} from './_facetTruthLib';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { makeH2PhaseAPool, meshSoupShared, type H2PoolReport } from './_h2Pool';
import type { H2APartial, H2Geom } from './_h2PhaseA';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_H2EQ === '1';
const H = 120;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = process.env.PF_H2EQ_STYLE ?? 'GothicArches';
const STL = process.env.PF_H2EQ_STL
  ?? join('research', 'exchange', '_strataConformBisect', 'gothicarches_ring_DS-.stl');
const W_HI = Number.parseInt(process.env.PF_H2EQ_W ?? '8', 10);
const TAU = 2 * Math.PI;

// Local copy of the registry-defaults reader, as in every other _strata* harness. The one shared copy lives
// in _gpuRankBridge.ts, which imports playwright at module scope — not a dependency this test should take.
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

/** Object.is over two numbers, reported with enough context to identify WHICH field diverged. */
function same(what: string, a: unknown, b: unknown): void {
  if (!Object.is(a, b)) throw new Error(`${what}: 1 worker gave ${String(a)}, ${W_HI} workers gave ${String(b)}`);
}

describe('H2 phase-A pool — 1 worker vs W must be byte-equal', () => {
  it.runIf(RUN)(`reproduces the serial phase A exactly at ${W_HI} workers, on a real mesh`, () => {
    expect(existsSync(STL), `mesh not found: ${STL}`).toBe(true);
    expect(typeof SharedArrayBuffer).toBe('function');

    // ── THE INSTRUMENT, built once and SHARED by every arm ────────────────────────────────────────────
    const { xyz, nTri } = readMeshFloat64(STL, true);
    const soup = meshSoupShared(xyz, nTri);
    const idx = new Uint32Array(soup.idxSab);
    const ref: RefMesh = { xyz, idx, nV: soup.nV, nF: soup.nF };
    const locatorCell = pickLocatorCell(xyz, idx, nTri);
    const loc = buildRefLocator(ref, locatorCell);
    const styleParams = registryDefaults(STYLE);
    const { rA } = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
    const zJumps = detectZJumps(rA, H);
    const thJumps = detectThetaJumps(rA, H);
    // eslint-disable-next-line no-console
    console.log(`mesh ${STL}  ${nTri} facets   locator cell ${locatorCell.toFixed(4)} mm   style ${STYLE}   zJumps ${zJumps.length} thJumps ${thJumps.length}`);

    const recipe = {
      rA, distToMesh: loc.dist,
      style: STYLE, styleParams, dims: DIMS, H,
      xyzSab: soup.xyzSab, idxSab: soup.idxSab, nV: soup.nV, nF: soup.nF,
      locatorCell, zJumps, thJumps,
      waitMs: 30 * 60 * 1000,
    };
    const p1 = makeH2PhaseAPool({ ...recipe, workers: 1 });
    const pW = makeH2PhaseAPool({ ...recipe, workers: W_HI });

    // ── E1 — THE KERNEL, compared cell by cell ────────────────────────────────────────────────────────
    // rNom is derived exactly as `surfaceToMeshMax` derives it, because the arc pitch (and hence the query
    // lattice of every cell) depends on it.
    let rNom = 0;
    for (let i = 0; i < 128; i += 1) {
      const th = (TAU * i) / 128;
      for (let j = 0; j <= 64; j += 1) rNom = Math.max(rNom, rA(th, (H * j) / 64));
    }
    const geom: H2Geom = { U: 512, V: 256, zLo: 0, zHi: H, rNom, pitch0: 0.5, tol: 0.01, structM: 6, NZB: 24 };
    const nCells = geom.U * geom.V;

    const keysA = new Float64Array(nCells);
    const tA = Date.now();
    const partA = p1.runner(geom, keysA);
    const secsA = (Date.now() - tA) / 1000;

    const keysB = new Float64Array(nCells);
    const tB = Date.now();
    const partB = pW.runner(geom, keysB);
    const secsB = (Date.now() - tB) / 1000;

    let keyDiffs = 0; let firstDiff = -1;
    for (let k = 0; k < nCells; k += 1) {
      if (!Object.is(keysA[k], keysB[k])) { keyDiffs += 1; if (firstDiff < 0) firstDiff = k; }
    }
    // eslint-disable-next-line no-console
    console.log(`E1 kernel: ${nCells} cells   W=1 ${secsA.toFixed(1)}s   W=${W_HI} ${secsB.toFixed(1)}s   key diffs ${keyDiffs}`);
    expect(keyDiffs, `first differing cell ${firstDiff}`).toBe(0);
    // A run in which every key is 0 would satisfy the comparison vacuously.
    expect(keysA.some((v) => v > 0)).toBe(true);

    const fields: (keyof H2APartial)[] = ['max', 'argCell', 'mTh', 'mZ', 'mR', 'queries', 'rEvalsStruct', 'overCount', 'finestStruct'];
    for (const f of fields) same(`E1 partial.${String(f)}`, partA[f], partB[f]);
    for (let b = 0; b < geom.NZB; b += 1) same(`E1 partial.overZHist[${b}]`, partA.overZHist[b], partB.overZHist[b]);
    expect(partA.queries).toBeGreaterThan(0);
    expect(partA.rEvalsStruct).toBeGreaterThan(0);

    const rep = pW.report() as H2PoolReport;
    // eslint-disable-next-line no-console
    console.log(`E1 pool: ${rep.workers} workers, chunk ${rep.chunk} cells, bundle ${rep.bundleMs} ms, spawn ${rep.spawnMs} ms, sweep ${rep.sweepMs} ms`
      + `\n   rA verified bit-identical over ${rep.raPoints} (worker x lattice-point) comparisons: ${rep.raDiffCount} differing, worst ${rep.raMaxDev.toExponential(3)} mm`
      + `\n   locator verified bit-identical over ${rep.locPoints} (worker x probe-point) comparisons: ${rep.locDiffCount} differing, worst ${rep.locMaxDev.toExponential(3)} mm`
      + `\n   per-worker queries: ${rep.perWorkerQueries.join(' ')}`);
    expect(rep.workers).toBe(W_HI);
    expect(rep.raDiffCount).toBe(0);
    expect(rep.locDiffCount).toBe(0);
    expect(rep.raPoints).toBeGreaterThan(0);
    expect(rep.locPoints).toBeGreaterThan(0);
    // EVERY worker must have done real work, or "equal" was bought by "not actually parallel".
    expect(rep.perWorkerQueries.length).toBe(W_HI);
    for (const q of rep.perWorkerQueries) expect(q).toBeGreaterThan(0);
    expect(rep.perWorkerQueries.reduce((s, q) => s + q, 0)).toBe(partB.queries);

    // ── E2 — END TO END ───────────────────────────────────────────────────────────────────────────────
    // The budget truncates phase B (so the heap ORDER is exercised, not just phase A) and it is a QUERY
    // count, so the truncation point is identical in all three arms. `timeBudgetMs` is set far out of reach
    // precisely so the wall clock can never become the thing that stops the run.
    const base: SurfaceToMeshOpts = {
      H, tol: 0.01, coveragePitch: 0.5, minPitch: 0.03, structN: 8, structLines: 2,
      budget: 1.2e6, timeBudgetMs: 24 * 3600 * 1000, zJumps, thJumps,
    };
    const t0 = Date.now(); const serial = surfaceToMeshMax(rA, loc.dist, base);
    const t1 = Date.now(); const pooled1 = surfaceToMeshMax(rA, loc.dist, { ...base, phaseA: p1.runner });
    const t2 = Date.now(); const pooledW = surfaceToMeshMax(rA, loc.dist, { ...base, phaseA: pW.runner });
    const t3 = Date.now();
    // eslint-disable-next-line no-console
    console.log(`E2 end-to-end: no-pool ${((t1 - t0) / 1000).toFixed(1)}s   pool W=1 ${((t2 - t1) / 1000).toFixed(1)}s   pool W=${W_HI} ${((t3 - t2) / 1000).toFixed(1)}s`
      + `\n   max ${(serial.max * 1000).toFixed(6)} um @ th=${serial.th.toFixed(9)} z=${serial.z.toFixed(9)} r=${serial.r.toFixed(9)} onWall=${serial.onWall}`
      + `\n   queries ${serial.queries}  structEvals ${serial.rEvalsStruct}  overCount ${serial.overCount}  hotLeaves ${serial.hotLeaves}  capped ${serial.capped}`
      + `\n   zHist ${serial.overZHist.join(' ')}`);

    const scalar: (keyof SurfaceToMeshResult)[] = [
      'max', 'th', 'z', 'r', 'onWall', 'queries', 'rEvalsStruct', 'capped',
      'structPitch', 'structPitchUniform', 'structPitchAlong', 'hotLeaves', 'overCount', 'zLo', 'zHi',
    ];
    for (const arm of [['pool W=1', pooled1], ['pool W=' + String(W_HI), pooledW]] as [string, SurfaceToMeshResult][]) {
      for (const f of scalar) same(`E2 ${arm[0]} .${String(f)}`, serial[f], arm[1][f]);
      for (let b = 0; b < 24; b += 1) same(`E2 ${arm[0]} .overZHist[${b}]`, serial.overZHist[b], arm[1].overZHist[b]);
    }
    // Non-vacuity: the comparison is worthless unless the run actually witnessed something, actually
    // truncated phase B on the budget, and actually counted exceedances.
    expect(serial.max).toBeGreaterThan(0);
    expect(serial.queries).toBeGreaterThan(base.budget as number);
    expect(serial.capped).toBe(true);
    expect(serial.overCount).toBeGreaterThan(0);
  }, 60 * 60 * 1000);

  // ── E3 — THE GUARD MUST ACTUALLY FIRE ───────────────────────────────────────────────────────────────
  // "0 of 190,896 comparisons differ" proves the check RAN; it does not prove the check WOULD CATCH
  // ANYTHING. A verification loop with an inverted comparison, or one reading the wrong slice of the shared
  // buffer, reports exactly the same reassuring zero. So each half of the instrument is deliberately
  // desynchronised and the pool is required to REFUSE — which is also the only test that pins the pool's
  // failure path (abort at the first barrier) rather than its success path.
  it.runIf(RUN)('REFUSES to report when a worker rebuilds a different surface or a different locator', () => {
    const { xyz, nTri } = readMeshFloat64(STL, true);
    const idx = new Uint32Array(meshSoupShared(xyz, nTri).idxSab);
    const locatorCell = pickLocatorCell(xyz, idx, nTri);
    const loc = buildRefLocator({ xyz, idx, nV: nTri * 3, nF: nTri }, locatorCell);
    const styleParams = registryDefaults(STYLE);
    const { rA } = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
    let rNom = 0;
    for (let i = 0; i < 128; i += 1) {
      const th = (TAU * i) / 128;
      for (let j = 0; j <= 64; j += 1) rNom = Math.max(rNom, rA(th, (H * j) / 64));
    }
    // A tiny sweep — the guard fires before a single cell is scanned, so the domain size is irrelevant.
    const geom: H2Geom = { U: 8, V: 4, zLo: 0, zHi: H, rNom, pitch0: 4, tol: 0.01, structM: 3, NZB: 24 };
    const common = {
      rA, distToMesh: loc.dist, style: STYLE, dims: DIMS, H,
      ...meshSoupShared(xyz, nTri), locatorCell, workers: 2, waitMs: 5 * 60 * 1000,
    };

    // (a) THE SURFACE. The parent measures against GothicArches; the worker is handed a recipe naming a
    //     DIFFERENT registered style, so it rebuilds a genuinely different pot. A different STYLE rather
    //     than a bent parameter on purpose: a perturbed parameter can be ignored by the kernel, or can send
    //     it degenerate — and Object.is(NaN, NaN) is TRUE, so a surface that went NaN everywhere would slip
    //     through the very comparison this case is meant to exercise.
    const other = STYLE === 'SpiralRidges' ? 'HarmonicRipple' : 'SpiralRidges';
    expect(() => makeH2PhaseAPool({ ...common, style: other, styleParams: registryDefaults(other) })
      .runner(geom, new Float64Array(geom.U * geom.V))).toThrow(/NOT bit-identical/);

    // (b) THE LOCATOR. Same surface, same recipe, but the workers are given a mesh scaled 1.0005 radially
    //     (25 um at r = 50 mm) — the shape of a stale or mis-wired SharedArrayBuffer.
    //
    //     NOTE, because it is the obvious thing to try and it does NOT work: handing the workers a
    //     different `locatorCell` is not a detectable desync. `buildRefLocator`'s ring termination is
    //     EXACT, so a coarser or finer bucket grid scans a different set of triangles and still returns the
    //     same global minimum, bit for bit. That is a property of the locator worth knowing — the bucket
    //     size is a performance parameter and nothing else — and it is why this case perturbs the MESH.
    const scaled = Float64Array.from(xyz, (v, i) => (i % 3 === 2 ? v : v * 1.0005));
    expect(() => makeH2PhaseAPool({ ...common, styleParams, ...meshSoupShared(scaled, nTri) })
      .runner(geom, new Float64Array(geom.U * geom.V))).toThrow(/NOT bit-identical/);
  }, 30 * 60 * 1000);
});
