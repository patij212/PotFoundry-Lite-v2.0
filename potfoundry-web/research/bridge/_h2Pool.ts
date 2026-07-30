// _h2Pool.ts — the H2 phase-A worker pool: bundle, spawn, VERIFY, sweep, reduce. RESEARCH ONLY.
//
// This is the H1 pool's discipline (_facetTruthPool.ts) applied to phase A of `surfaceToMeshMax`, with one
// structural difference that drives everything else: `surfaceToMeshMax` IS SYNCHRONOUS and is called
// synchronously by the audit harness, so the parent joins its workers with `Atomics.wait` rather than the
// event loop. A blocked parent cannot receive postMessage, so every result travels through shared memory and
// the fail-fast verification is done at an explicit barrier instead of by message ordering.
//
// FOUR THINGS HAVE TO BE TRUE BEFORE A POOLED NUMBER MAY STAND IN FOR A SERIAL ONE:
//
//  1. THE MESH IS NOT COPIED. `xyz`/`idx` go into SharedArrayBuffers; W copies of a 108 MB soup is not an
//     option and `worker_threads` (not child processes) is the whole point.
//  2. THE SURFACE AND THE LOCATOR ARE REBUILT, SO BOTH MUST BE PROVEN IDENTICAL. rA and `distToMesh` are
//     closures and cannot be transferred. Each worker rebuilds rA from (style, params, dims) through the
//     SHARED `buildAuditRadiusFn`, and the locator by calling `buildRefLocator` VERBATIM on the shared mesh.
//     Both are then diffed against the parent's — rA over `radiusLattice` (C0-bracketed + clamp boundaries),
//     the locator over `h2ProbeLattice` (on the graph AND pushed off it, because a mis-sized bucket grid
//     shows up in the ring expansion, not on the surface). ANY deviation refuses the whole run.
//  3. THE WORKER ACTUALLY RUNS. A worker thread does not go through Vitest's Vite pipeline and this repo's
//     imports are extensionless TS, so the entry is pre-bundled with esbuild into a scratch .mjs. A bundle
//     failure throws here rather than silently falling back to serial and mis-reporting a speedup.
//  4. THE RESULT DOES NOT DEPEND ON INTERLEAVING. All reduction happens in `mergeH2A`, which is commutative
//     and carries an explicit (value desc, cell index asc) tie-break, and the phase-B heap keys are written
//     BY CELL INDEX into one shared array. See the header of _h2PhaseA.ts for the proof sketch.
//
// WHY THE LOCATOR IS REBUILT AND NOT SHARED. `buildRefLocator`'s big arrays (`counts`, `items`, `xyz`, `idx`)
// ARE read-only after construction — the only writes in `distTri` are to `stamp` and the `query` counter,
// both per-query scratch — so they COULD live in SharedArrayBuffers. Sharing them would require either a
// second implementation of the point-to-triangle query or a signature change to a file this work does not
// own; a second copy of `pointTriDist2` is precisely the two-copies-of-one-definition hazard that already
// cost this repo a Voronoi hash desync. The rebuild was MEASURED instead, on GothicArches ring meshes
// (`pickLocatorCell` defaults, one process):
//     4,384 tri   -> 0.08M buckets,   ~1 MB CSR,   24 ms
//   201,614 tri   -> 3.83M buckets,  ~28 MB CSR,  161 ms      <- the scale the campaign actually audits
// 1,504,648 tri   -> 40.4M buckets, ~157 MB CSR,  930 ms      <- at `pickLocatorCell`'s 4e7-bucket ceiling
// The per-worker cost is therefore BOUNDED by that ceiling (~160 MB + items) however large the mesh gets,
// and the build is <0.5% of a 200-500 s phase A and happens concurrently across workers. If a future audit
// runs at 3M+ triangles and 8 x 160 MB stops being acceptable, share the CSR — but do it by giving
// `buildRefLocator` an optional prebuilt-arrays parameter, never by copying the query.
import { buildSync } from 'esbuild';
import { Worker } from 'node:worker_threads';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  H2CTRL, h2PartialSlots, h2ProbeEval, h2ProbeLattice, mergeH2A, readH2Partial, runH2PhaseA,
  type H2DistFn, type H2PhaseARunner, type H2RadiusFn,
} from './_h2PhaseA';

export type { H2PhaseARunner } from './_h2PhaseA';
import { radiusLattice } from './_facetTruthRA';
import type { H2WorkerData } from './_h2PhaseAWorker';
import type { StyleDims } from './runStyle';

/**
 * Default = PHYSICAL cores, capped at 10, exactly as the H1 pool: `os.availableParallelism()` reports
 * LOGICAL cores, hence the halving. PF_FT_H2WORKERS overrides; 1 (or 0) selects TODAY'S EXACT SERIAL PATH —
 * not "a pool of one", but the same `runH2PhaseA` call the un-pooled `surfaceToMeshMax` makes, in-process,
 * with no worker spawned and nothing shared.
 *
 * The H1 measurement (scalar libm, same box, 8 physical / 16 logical) was 5.26x at W=8 and 7.97x at W=16;
 * it kept 8 as the default because the extra is SMT and because it leaves the box usable while an audit
 * runs. Phase A is the same shape of work (branchy scalar float with long dependent chains), so the same
 * default is used here. PF_FT_H2WORKERS=16 is available for a dedicated run.
 */
export function resolveH2Workers(): number {
  const raw = process.env.PF_FT_H2WORKERS;
  if (raw !== undefined) {
    const v = Number.parseInt(raw, 10);
    if (Number.isFinite(v) && v >= 0) return Math.max(1, v);
  }
  const logical = availableParallelism();
  return Math.max(1, Math.min(10, Math.floor(logical / 2)));
}

export interface H2PoolRecipe {
  /** the surface actually in play — the pool computes its OWN expectation from this, never a re-derived one */
  rA: H2RadiusFn;
  /** the locator actually in play, same reason */
  distToMesh: H2DistFn;
  /** rebuild recipe for rA inside a worker */
  style: string; styleParams: Record<string, number>; dims: StyleDims; H: number;
  /** the audited mesh, in SharedArrayBuffers. `readMeshSoupShared` builds these from an STL. */
  xyzSab: SharedArrayBuffer; idxSab: SharedArrayBuffer; nV: number; nF: number;
  /** the SAME cell size the parent's locator was built with — `pickLocatorCell(...)` */
  locatorCell: number;
  /** the C0 loci, for the rA verification lattice only */
  zJumps?: number[]; thJumps?: number[];
  workers?: number;
  /** ceiling on cells per claim. Default 256; the pool also targets >=64 chunks per worker. */
  chunkMax?: number;
  workerHeapMb?: number;
  /** hard ceiling on how long the parent will block at either barrier, ms. Default 6 h. */
  waitMs?: number;
}

export interface H2PoolReport {
  workers: number; chunk: number; bundleMs: number; spawnMs: number; sweepMs: number;
  /** lattice points where any worker's rebuilt rA was not bit-identical to the parent's. Must be 0. */
  raDiffCount: number; raMaxDev: number;
  /** probe points where any worker's rebuilt locator was not bit-identical to the parent's. Must be 0. */
  locDiffCount: number; locMaxDev: number;
  /** (worker x point) comparisons actually made — the non-vacuity witness for the two counts above */
  raPoints: number; locPoints: number;
  /**
   * queries each worker actually made. THE NON-VACUITY WITNESS FOR THE PARALLELISM ITSELF: a pool whose
   * cursor was mis-wired so that one worker swept everything would produce a perfectly equal answer and a
   * perfectly useless speedup, and an equivalence test that only compares numbers would pass it.
   */
  perWorkerQueries: number[];
}

/**
 * Present the audited mesh as a SHARED triangle soup — the exact shape `_strataFacetTruth` audits, where
 * every triangle carries its own three vertices and `idx` is the identity.
 *
 * If `xyz` is already backed by a SharedArrayBuffer (i.e. it came from `readMeshFloat64(path, true)`) it is
 * used in place; a 648 MB mesh is not copied twice to save a branch.
 */
export function meshSoupShared(xyz: Float64Array, nTri: number): { xyzSab: SharedArrayBuffer; idxSab: SharedArrayBuffer; nV: number; nF: number } {
  let xyzSab: SharedArrayBuffer;
  if (xyz.buffer instanceof SharedArrayBuffer && xyz.byteOffset === 0 && xyz.byteLength === xyz.buffer.byteLength) {
    xyzSab = xyz.buffer;
  } else {
    xyzSab = new SharedArrayBuffer(xyz.length * 8);
    new Float64Array(xyzSab).set(xyz);
  }
  const idxSab = new SharedArrayBuffer(nTri * 3 * 4);
  const idx = new Uint32Array(idxSab);
  for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
  return { xyzSab, idxSab, nV: nTri * 3, nF: nTri };
}

/**
 * Convenience wrapper for the audit harness, which already holds `xyz` (the STL as a flat Float64 soup),
 * `nTri` and the locator cell it built its own locator with. Three lines at the call site instead of ten,
 * and — more to the point — it cannot be called with a mesh that differs from the one the parent's locator
 * was built from, because it takes the same array.
 */
export function makeH2PhaseAPoolForSoup(
  o: Omit<H2PoolRecipe, 'xyzSab' | 'idxSab' | 'nV' | 'nF'> & { xyz: Float64Array; nTri: number },
): { runner: H2PhaseARunner; report: () => H2PoolReport | null } {
  const soup = meshSoupShared(o.xyz, o.nTri);
  return makeH2PhaseAPool({ ...o, ...soup });
}

let bundledEntry: string | null = null;

/** Pre-bundle the worker entry with esbuild into a scratch .mjs. Once per process. */
function workerBundle(): string {
  if (bundledEntry !== null && existsSync(bundledEntry)) return bundledEntry;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '_h2PhaseAWorker.ts'), resolve('research', 'bridge', '_h2PhaseAWorker.ts')];
  const entry = candidates.find((p) => existsSync(p));
  if (entry === undefined) throw new Error(`H2 worker entry not found; looked in ${candidates.join(' , ')}`);
  const out = join(mkdtempSync(join(tmpdir(), 'pf-h2worker-')), 'h2worker.mjs');
  buildSync({
    entryPoints: [entry], outfile: out,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  bundledEntry = out;
  return out;
}

/**
 * Build the phase-A runner for a given mesh + surface. Hand the result to `surfaceToMeshMax` as
 * `opts.phaseA`. `report()` is valid after the runner has been called once.
 *
 * W === 1 returns the IN-PROCESS serial kernel: no worker, no SharedArrayBuffer, no verification cost — the
 * same `runH2PhaseA(rA, distToMesh, ...)` call `surfaceToMeshMax` makes when `opts.phaseA` is absent. That
 * is what makes "PF_FT_H2WORKERS=1 is today's exact path" a code fact rather than a claim.
 */
export function makeH2PhaseAPool(recipe: H2PoolRecipe): { runner: H2PhaseARunner; report: () => H2PoolReport | null } {
  const workers = recipe.workers ?? resolveH2Workers();
  let rep: H2PoolReport | null = null;

  const runner: H2PhaseARunner = (g, keys, onProgress) => {
    if (workers <= 1 || typeof SharedArrayBuffer !== 'function') {
      let done = false;
      return runH2PhaseA(recipe.rA, recipe.distToMesh, g, keys,
        () => { if (done) return null; done = true; return [0, g.U * g.V] as const; },
        (k, acc) => { if ((k + 1) % g.V === 0) onProgress?.((k + 1) / (g.U * g.V), acc.queries, acc.max); });
    }

    const tB = Date.now();
    const entry = workerBundle();
    const bundleMs = Date.now() - tB;

    const nCells = g.U * g.V;
    const chunkMax = recipe.chunkMax ?? 256;
    // Same rule as the H1 pool: target >=64 claims per worker so the tail is amortised, with a ceiling so
    // the atomic cannot dominate when a cell is cheap.
    const chunk = Math.max(1, Math.min(chunkMax, Math.floor(nCells / (64 * workers))));

    // ── THE PARENT'S OWN EXPECTATION, computed from the closures ACTUALLY IN PLAY ──────────────────────
    const lat = radiusLattice(recipe.H, recipe.zJumps ?? [], recipe.thJumps ?? []);
    const probe = h2ProbeLattice(recipe.H);
    const latLen = lat.th.length;
    const probeLen = probe.th.length * 2;
    const verifyLen = latLen + probeLen;
    const expect = new Float64Array(verifyLen);
    for (let i = 0; i < latLen; i += 1) expect[i] = recipe.rA(lat.th[i], lat.z[i]);
    h2ProbeEval(recipe.rA, recipe.distToMesh, probe, expect.subarray(latLen, verifyLen));

    const partialSlots = h2PartialSlots(g.NZB);
    const ctrlSab = new SharedArrayBuffer(H2CTRL.N * 4);
    const ctrl = new Int32Array(ctrlSab);
    const statSab = new SharedArrayBuffer(8);
    const stats = new BigInt64Array(statSab);
    const errSab = new SharedArrayBuffer(4096);
    const keysSab = new SharedArrayBuffer(nCells * 8);
    const partSab = new SharedArrayBuffer(workers * partialSlots * 8);
    const verifySab = new SharedArrayBuffer(workers * verifyLen * 8);
    const sharedKeys = new Float64Array(keysSab);

    const deadline = Date.now() + (recipe.waitMs ?? 6 * 3600 * 1000);
    const errText = (): string => {
      const n = Atomics.load(ctrl, H2CTRL.ERRLEN);
      return n > 0 ? new TextDecoder().decode(new Uint8Array(errSab, 0, n)) : '(no message)';
    };
    /** Block until ctrl[slot] >= target, aborting on a worker error or the wall-clock ceiling. */
    const barrier = (slot: number, target: number, what: string, tick?: () => void): void => {
      for (;;) {
        const v = Atomics.load(ctrl, slot);
        if (Atomics.load(ctrl, H2CTRL.ERR) !== 0) {
          Atomics.store(ctrl, H2CTRL.STOP, 1);
          throw new Error(`H2 phase-A pool: a worker failed during ${what} — ${errText()}`);
        }
        if (v >= target) return;
        if (Date.now() > deadline) {
          Atomics.store(ctrl, H2CTRL.STOP, 1);
          throw new Error(`H2 phase-A pool: timed out waiting for ${what} (${v}/${target} workers reported). `
            + `A worker that dies without raising the error flag is invisible to a blocked parent; raise waitMs only if the run is genuinely this long.`);
        }
        tick?.();
        Atomics.wait(ctrl, slot, v, 250);
      }
    };

    let raDiffCount = 0; let raMaxDev = 0; let locDiffCount = 0; let locMaxDev = 0;
    const live: Worker[] = [];
    const finish = (): void => { for (const w of live) void w.terminate(); };
    let sweepMs = 0; let spawnMs = 0;
    try {
      const tS = Date.now();
      for (let i = 0; i < workers; i += 1) {
        const data: H2WorkerData = {
          ctrlSab, statSab, errSab, keysSab, partSab, verifySab,
          xyzSab: recipe.xyzSab, idxSab: recipe.idxSab, nV: recipe.nV, nF: recipe.nF,
          locatorCell: recipe.locatorCell,
          style: recipe.style, styleParams: recipe.styleParams, dims: recipe.dims, H: recipe.H,
          zJumps: recipe.zJumps ?? [], thJumps: recipe.thJumps ?? [],
          geom: g, chunk, nCells, index: i, workers,
          partialSlots, verifyLen, latLen,
        };
        live.push(new Worker(entry, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: recipe.workerHeapMb ?? 2048 } }));
      }
      spawnMs = Date.now() - tS;

      // ── BARRIER 1: every worker has published its rA + locator block. Verified BEFORE any sweeping, so a
      // mismatched surface or a mis-sized locator aborts in the first seconds rather than at the end of a
      // multi-hundred-second audit that would be fully formatted and entirely meaningless.
      barrier(H2CTRL.READY, workers, 'worker verification');
      const ver = new Float64Array(verifySab);
      for (let w = 0; w < workers; w += 1) {
        const off = w * verifyLen;
        for (let i = 0; i < latLen; i += 1) {
          // Object.is so a NaN/NaN pair counts as identical and a +0/-0 pair does not.
          if (!Object.is(expect[i], ver[off + i])) {
            raDiffCount += 1; const dv = Math.abs(expect[i] - ver[off + i]); if (!(dv <= raMaxDev)) raMaxDev = dv;
          }
        }
        for (let i = latLen; i < verifyLen; i += 1) {
          if (!Object.is(expect[i], ver[off + i])) {
            locDiffCount += 1; const dv = Math.abs(expect[i] - ver[off + i]); if (!(dv <= locMaxDev)) locMaxDev = dv;
          }
        }
      }
      if (raDiffCount > 0 || locDiffCount > 0) {
        Atomics.store(ctrl, H2CTRL.STOP, 1);
        throw new Error(
          `H2 phase-A pool: a worker's rebuilt instrument is NOT bit-identical to the parent's — `
          + `rA ${raDiffCount}/${workers * latLen} points differ (worst ${(raMaxDev * 1000).toExponential(3)} um), `
          + `locator ${locDiffCount}/${workers * probeLen} points differ (worst ${(locMaxDev * 1000).toExponential(3)} um). `
          + `Every pooled number would be measured with a different instrument. Refusing to report.`);
      }

      // ── RELEASE THE SWEEP ─────────────────────────────────────────────────────────────────────────────
      const tW = Date.now();
      Atomics.store(ctrl, H2CTRL.GO, 1);
      Atomics.notify(ctrl, H2CTRL.GO);
      barrier(H2CTRL.DONE, workers, 'the phase-A sweep', () => {
        if (onProgress === undefined) return;
        onProgress(
          Atomics.load(ctrl, H2CTRL.CELLS) / nCells,
          Number(Atomics.load(stats, 0)),
          Atomics.load(ctrl, H2CTRL.MAXNM) / 1e6);
      });
      sweepMs = Date.now() - tW;
    } finally {
      finish();
    }

    keys.set(sharedKeys);
    const parts = new Float64Array(partSab);
    const perWorker = Array.from({ length: workers }, (_, w) => readH2Partial(parts, w * partialSlots, g.NZB));
    const merged = mergeH2A(perWorker, g.NZB);
    rep = {
      workers, chunk, bundleMs, spawnMs, sweepMs,
      raDiffCount, raMaxDev, locDiffCount, locMaxDev,
      raPoints: workers * latLen, locPoints: workers * probeLen,
      perWorkerQueries: perWorker.map((p) => p.queries),
    };
    return merged;
  };

  return { runner, report: () => rep };
}
