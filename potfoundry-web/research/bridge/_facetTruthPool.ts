// _facetTruthPool.ts — the H1 worker pool: bundle, spawn, verify, reduce. RESEARCH ONLY.
//
// Four things have to be true before a pooled number is allowed to stand in for a serial one, and this file
// exists to make each of them checkable rather than assumed:
//
//  1. THE MESH IS NOT COPIED. A finished STL is up to 648 MB as a Float64Array; W copies is not an option and
//     `worker_threads` (not child processes) is the whole point. `sharedMeshBuffer` reads the STL straight
//     into a SharedArrayBuffer so every worker views the same bytes.
//  2. THE SURFACE IS REBUILT, SO IT MUST BE PROVEN IDENTICAL. rA is a closure and cannot be transferred; each
//     worker rebuilds it from (style, params, dims) via the SHARED `buildAuditRadiusFn`. That is identity by
//     construction — and this file still diffs every worker's rA against the parent's over a lattice that
//     brackets the C0 loci and the clamp boundaries, and REFUSES the run on any deviation. Reported.
//  3. THE WORKER ACTUALLY RUNS. A worker thread does not go through Vitest's Vite pipeline and this repo's
//     imports are extensionless TS, so the entry is pre-bundled with esbuild into a scratch .mjs. A bundle
//     failure throws here rather than silently falling back to serial and mis-reporting a speedup.
//  4. THE RESULT DOES NOT DEPEND ON INTERLEAVING. All reduction happens in `mergeH1`, which is commutative
//     and carries an explicit tie-break. See _facetTruthH1.ts.
import { buildSync } from 'esbuild';
import { Worker } from 'node:worker_threads';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeH1, type H1Job, type H1Partial } from './_facetTruthH1';
import type { StyleDims } from './runStyle';
import type { H1WorkerData, H1WorkerMsg } from './_facetTruthH1Worker';

const CTRL_CURSOR = 0;
const CTRL_STOP = 1;

/**
 * Default = PHYSICAL cores, capped at 10. `os.availableParallelism()` reports LOGICAL cores, hence the halving.
 * PF_FT_WORKERS overrides; 1 (or 0) selects the serial path.
 *
 * MEASURED, AND IT CONTRADICTS THE USUAL ARGUMENT, so it is recorded rather than assumed. The expectation was
 * that scalar libm would not scale past the physical core count because hyperthread siblings share FP units.
 * On this 8-physical / 16-logical box, one 512-facet walk of gothicarches_ring_l--B — same PF_FT_H1MAX, so
 * the SAME audited set, and every reported number byte-identical at every W:
 *      W=1  279 s        W=4  87 s (3.21x)        W=8  53 s (5.26x)        W=16  35 s (7.97x)
 * SMT bought a further 1.51x over the physical count. `certifyTriangle` is branchy scalar code with long
 * dependent chains — precisely the shape that leaves pipeline bubbles a sibling thread can fill — so this is
 * consistent, not anomalous. The default stays at the physical count (conservative, and it leaves the box
 * usable while a multi-hour audit runs); set PF_FT_WORKERS=16 when the audit is the only thing running.
 * Scaling is sub-linear mostly because of TAIL IMBALANCE at small walks: per-facet cost spans 181x, so a
 * 512-facet walk gives each of 16 workers only 32 facets and the last one dominates. It improves with N.
 *
 * MEASUREMENT HAZARD, and it is worth more than the numbers above. Windows EcoQoS throttles a detached node
 * job to ~47% of one core (MEASURED: cpu-delta 9.39 s / 20 s wall, rising to 19.25 s / 20 s the instant
 * PriorityClass was set to AboveNormal). Every timing here was taken with the whole process tree pinned to
 * AboveNormal on BOTH arms. An unpinned A/B measures the scheduler, not the pool.
 */
export function resolveWorkerCount(): number {
  const raw = process.env.PF_FT_WORKERS;
  if (raw !== undefined) {
    const v = Number.parseInt(raw, 10);
    if (Number.isFinite(v) && v >= 0) return Math.max(1, v);
  }
  const logical = availableParallelism();
  return Math.max(1, Math.min(10, Math.floor(logical / 2)));
}

/**
 * Binary STL -> flat Float64Array of 9 coords per triangle. Stored facet normals are ignored.
 * ONE reader, optionally backed by a SharedArrayBuffer — a second copy of this loop living next to the
 * pool would be the same two-copies-of-one-definition hazard the rA wrapper was extracted to avoid.
 */
export function readMeshFloat64(path: string, shared: boolean): { xyz: Float64Array; nTri: number; sab: SharedArrayBuffer | null } {
  const buf = readFileSync(path);
  if (buf.length < 84) throw new Error(`STL too short: ${path}`);
  const nTri = buf.readUInt32LE(80);
  if (buf.length !== 84 + nTri * 50) throw new Error(`STL size mismatch: ${buf.length} != 84 + ${nTri}*50`);
  const sab = shared ? new SharedArrayBuffer(nTri * 9 * 8) : null;
  const xyz = sab === null ? new Float64Array(nTri * 9) : new Float64Array(sab);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return { xyz, nTri, sab };
}

let bundledEntry: string | null = null;

/** Pre-bundle the worker entry with esbuild into a scratch .mjs. Once per process. */
function workerBundle(): string {
  if (bundledEntry !== null && existsSync(bundledEntry)) return bundledEntry;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '_facetTruthH1Worker.ts'), resolve('research', 'bridge', '_facetTruthH1Worker.ts')];
  const entry = candidates.find((p) => existsSync(p));
  if (entry === undefined) throw new Error(`H1 worker entry not found; looked in ${candidates.join(' , ')}`);
  const out = join(mkdtempSync(join(tmpdir(), 'pf-h1worker-')), 'h1worker.mjs');
  buildSync({
    entryPoints: [entry], outfile: out,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  bundledEntry = out;
  return out;
}

export interface PoolConfig {
  sab: SharedArrayBuffer;
  job: H1Job;
  chunkMax: number;
  budget: number;
  workers: number;
  style: string;
  styleParams: Record<string, number>;
  dims: StyleDims;
  /** the parent's own rA over `radiusLattice` — every worker's copy is diffed against this */
  expectLat: Float64Array;
  latTh: Float64Array;
  latZ: Float64Array;
  workerHeapMb: number;
}

export interface PoolOutcome {
  merged: H1Partial;
  /** worst |worker rA - parent rA| over the verification lattice, in mm. Must be 0. */
  latMaxDev: number;
  /** lattice points where any worker's rA was not bit-identical to the parent's. Must be 0. */
  latDiffCount: number;
  /** total (worker x lattice point) comparisons actually made — the non-vacuity witness for the check above */
  latPoints: number;
  chunk: number;
  workers: number;
  bundleMs: number;
}

/** Run the H1 walk across `cfg.workers` threads sharing one atomic cursor. */
export async function runH1Pool(cfg: PoolConfig): Promise<PoolOutcome> {
  const tB = Date.now();
  const entry = workerBundle();
  const bundleMs = Date.now() - tB;

  // CHUNK SIZE — adaptive, and small by default, because the cost regime says so.
  //
  // A fixed 256-facet chunk is the textbook answer and it is WRONG HERE. `certifyTriangle` costs ~100-600 ms
  // per facet on a production mesh, so one Atomics.add per facet is free while a 256-facet chunk is a ~50 s
  // atom of work that nobody can help finish. MEASURED, 8 workers, 512-facet walk on gothicarches_ring_l--B:
  // chunk 4 -> 71 s, chunk 1 -> 62 s (unpinned pair, but both arms alike).
  // The cap still matters for the opposite regime (tiny facets at a loose
  // tolerance, where a facet costs microseconds and the atomic would dominate), so it stays as a ceiling.
  // Target >=64 chunks per worker; on a full-mesh walk that ceiling binds instead and the tail is amortised.
  const chunk = Math.max(1, Math.min(cfg.chunkMax, Math.floor(cfg.job.kEnd / (64 * cfg.workers))));

  const ctrlSab = new SharedArrayBuffer(2 * 4);
  const ctrl = new Int32Array(ctrlSab);
  Atomics.store(ctrl, CTRL_CURSOR, 0); Atomics.store(ctrl, CTRL_STOP, 0);
  const sampleSab = new SharedArrayBuffer(8);

  // rA IDENTITY, CHECKED BEFORE THE WALK RATHER THAN AFTER IT. Each worker posts its rebuilt rA over the
  // verification lattice as its FIRST message, so a mismatched surface aborts the pool in the first second
  // instead of being discovered at the end of a multi-hour audit. Any deviation refuses the whole run: a
  // worker scoring the mesh against a different surface produces a fully formatted, entirely meaningless
  // report, which is precisely the failure this suite exists to eliminate.
  let latMaxDev = 0; let latDiffCount = 0; let latChecked = 0;
  const verifyLattice = (lat: Float64Array): void => {
    latChecked += 1;
    for (let i = 0; i < cfg.expectLat.length; i += 1) {
      const a = cfg.expectLat[i]; const b = lat[i];
      // Object.is so a NaN/NaN pair counts as identical and a +0/-0 pair does not.
      if (!Object.is(a, b)) { latDiffCount += 1; const dv = Math.abs(a - b); if (!(dv <= latMaxDev)) latMaxDev = dv; }
    }
    if (latDiffCount > 0) Atomics.store(ctrl, CTRL_STOP, 1);
  };

  const results: H1Partial[] = [];
  const spawn = (): Promise<H1Partial> => new Promise((res, rej) => {
    const data: H1WorkerData = {
      meshSab: cfg.sab, ctrlSab, sampleSab, job: cfg.job, chunk, budget: cfg.budget,
      style: cfg.style, styleParams: cfg.styleParams, dims: cfg.dims,
      latTh: cfg.latTh, latZ: cfg.latZ,
    };
    const w = new Worker(entry, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: cfg.workerHeapMb } });
    let got = false;
    w.on('message', (m: H1WorkerMsg) => {
      if (m.kind === 'lattice') { verifyLattice(m.lat); return; }
      got = true; res(m.partial); void w.terminate();
    });
    w.on('error', (e) => { Atomics.store(ctrl, CTRL_STOP, 1); rej(e); });
    w.on('exit', (code) => { if (!got) { Atomics.store(ctrl, CTRL_STOP, 1); rej(new Error(`H1 worker exited ${code} before reporting`)); } });
  });

  const settled = await Promise.allSettled(Array.from({ length: cfg.workers }, spawn));
  const failed = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
  for (const s of settled) if (s.status === 'fulfilled') results.push(s.value);

  if (latDiffCount > 0) {
    throw new Error(
      `H1 pool: a worker's rebuilt rA is NOT bit-identical to the parent's — ${latDiffCount} of `
      + `${cfg.expectLat.length * Math.max(1, latChecked)} lattice points differ, worst ${(latMaxDev * 1000).toFixed(6)} um. `
      + `Every pooled number would be scored against a different surface. Refusing to report.`);
  }
  if (failed.length > 0) throw new Error(`H1 pool: ${failed.length}/${cfg.workers} workers failed — ${String(failed[0].reason)}`);
  if (latChecked !== cfg.workers) {
    throw new Error(`H1 pool: only ${latChecked}/${cfg.workers} workers reported an rA verification lattice — refusing to report unverified work.`);
  }

  return {
    merged: mergeH1(results, cfg.job.topK, cfg.job.tol),
    latMaxDev, latDiffCount, latPoints: cfg.expectLat.length * latChecked,
    chunk, workers: cfg.workers, bundleMs,
  };
}
