/**
 * parallelScorer.ts — worker-pool parallel whole-mesh facet scorer.
 *
 * DEV-ONLY (Tier-C, flag-gated). Parallelizes the embarrassingly-parallel dense
 * per-facet loop of {@link scoreWholeMesh} / the dense refine passes across a
 * small worker_threads pool. Facet scoring depends only on the facet's 3
 * vertices + the analytic radial surface, and the surface is a
 * {@link GpuSurfaceSampler} (a pre-evaluated f32 grid + deterministic bilinear
 * interpolation) ⇒ SERIALIZABLE ⇒ each worker reconstructs a bit-identical
 * surface ⇒ per-facet `dev[f]` is bit-identical to the sequential scorer,
 * regardless of shard assignment. The caller reassembles `dev[]` by global
 * facet index and runs the IDENTICAL reduction (max / count>tol / p50 / p99),
 * so the aggregate is byte-identical.
 *
 * The byte-identical mandate is load-bearing: metrology drives an accept/stop
 * gate. Any divergence from the sequential ruler is a STOP-SHIP defect. The
 * regression test parallelScorer.test.ts asserts exact equality on a fixture.
 *
 * WORKER LOADING: raw node ESM cannot resolve the src chain's extensionless
 * imports, so {@link _parallelScorerWorker} is bundled ON DEMAND with esbuild
 * (a devDependency) into a temp `.mjs` that inlines the SAME
 * `facetInteriorHonest` — one source of truth. The bundle is cached per
 * process. Node ≥22 could type-strip the worker directly but not the src chain;
 * bundling is the portable choice for both vitest and standalone node.
 *
 * @module conforming/tierC/parallelScorer
 */
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GpuSurfaceSampler } from '../SurfaceSampler';
import {
  liftChartMesh,
  reduceDevArray,
  type ChartMesh,
  type RulerOptions,
  type WholeMeshScore,
  DEFAULT_RULER,
} from './interiorRuler';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Serialized GpuSurfaceSampler grid (transferred to each worker). */
interface SamplerGrid {
  positions: Float32Array;
  resU: number;
  resT: number;
}

/**
 * Extract the serializable grid backing a GpuSurfaceSampler. Throws if the
 * sampler is not grid-backed (the parallel path requires a serializable
 * surface — analytic samplers stay sequential).
 */
export function samplerGrid(sampler: GpuSurfaceSampler): SamplerGrid {
  const s = sampler as unknown as {
    positions: Float32Array;
    resU: number;
    resT: number;
  };
  if (
    !(s.positions instanceof Float32Array) ||
    typeof s.resU !== 'number' ||
    typeof s.resT !== 'number'
  ) {
    throw new Error(
      'samplerGrid: parallel scorer requires a GpuSurfaceSampler (grid-backed)',
    );
  }
  return { positions: s.positions, resU: s.resU, resT: s.resT };
}

// --- worker bundle (built once per process) --------------------------------

let cachedBundle: string | null = null;

/**
 * Resolve the native esbuild BINARY (`.exe` on Windows), not the JS API and
 * not the `node_modules/.bin/esbuild.cmd` shim. Two Node/vitest hazards forced
 * this: (1) the esbuild JS API throws under vitest's jsdom (a polyfilled
 * TextEncoder breaks esbuild's `instanceof Uint8Array` invariant); (2)
 * `execFileSync` on the `.cmd` shim throws EINVAL on Node ≥20 Windows. The
 * platform binary at `@esbuild/<platform>-<arch>/...` is invoked directly.
 */
function resolveEsbuildBinary(): string {
  const require = createRequire(import.meta.url);
  const pkg =
    process.platform === 'win32'
      ? '@esbuild/win32-x64/esbuild.exe'
      : `@esbuild/${process.platform}-${process.arch}/bin/esbuild`;
  try {
    return require.resolve(pkg);
  } catch {
    // Fallback: derive from the esbuild package location.
    const esbuildMain = require.resolve('esbuild');
    const root = dirname(dirname(esbuildMain)); // …/node_modules/esbuild → node_modules
    return process.platform === 'win32'
      ? join(root, '@esbuild', 'win32-x64', 'esbuild.exe')
      : join(root, '@esbuild', `${process.platform}-${process.arch}`, 'bin', 'esbuild');
  }
}

/**
 * Bundle the worker entry to a temp `.mjs` (esbuild native binary, dev-only).
 * Cached per process. `--format=esm --platform=node` inlines the SAME
 * `facetInteriorHonest` chain ⇒ one source of truth for the byte-identical
 * metrology.
 */
function ensureWorkerBundle(): string {
  if (cachedBundle && existsSync(cachedBundle)) return cachedBundle;
  const dir = mkdtempSync(join(tmpdir(), 'pf-tierc-worker-'));
  const out = join(dir, 'scorerWorker.mjs');
  const entry = join(HERE, '_parallelScorerWorker.ts');
  execFileSync(
    resolveEsbuildBinary(),
    [entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`],
    { stdio: 'pipe' },
  );
  cachedBundle = out;
  return out;
}

// --- persistent pool --------------------------------------------------------

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

/**
 * A persistent worker pool bound to one sampler grid. Reuse across passes
 * amortizes the ~one-time grid transfer + bundle cost. Call {@link close} when
 * done (workers hold the event loop open otherwise).
 */
export class ParallelScorerPool {
  private readonly workers: PoolWorker[] = [];
  private readonly ready: Promise<void>;

  constructor(
    grid: SamplerGrid,
    readonly nWorkers: number,
  ) {
    const bundle = ensureWorkerBundle();
    const readies: Array<Promise<void>> = [];
    for (let i = 0; i < nWorkers; i++) {
      // Each worker gets its OWN copy of the grid (a Float32Array clone) so
      // reconstruction is independent + deterministic. Not transferred (we
      // reuse `grid` for every worker); the clone is one-time per worker.
      const positions = grid.positions.slice();
      const worker = new Worker(bundle, {
        workerData: { positions, resU: grid.resU, resT: grid.resT },
      });
      const pw: PoolWorker = { worker, busy: false };
      this.workers.push(pw);
      readies.push(
        new Promise<void>((resolve, reject) => {
          worker.once('online', () => resolve());
          worker.once('error', reject);
        }),
      );
    }
    this.ready = Promise.all(readies).then(() => undefined);
  }

  /**
   * Score every facet's dense-lattice interior deviation in parallel. Returns
   * `dev[]` indexed by GLOBAL facet index (bit-identical to the sequential
   * scorer) plus the summed bruteCalls. Facets are sharded contiguously.
   */
  async scoreDev(
    xyz: Float64Array,
    uv: number[],
    tris: number[],
    opts: RulerOptions,
  ): Promise<{ dev: Float64Array; bruteCalls: number }> {
    await this.ready;
    const nF = tris.length / 3;
    const dev = new Float64Array(nF);
    let bruteCalls = 0;
    const nShards = this.workers.length;
    // Contiguous shards; the reduction is order-independent (dev indexed by f).
    const bounds: Array<[number, number]> = [];
    for (let s = 0; s < nShards; s++) {
      const fLo = Math.floor((s * nF) / nShards);
      const fHi = Math.floor(((s + 1) * nF) / nShards);
      if (fHi > fLo) bounds.push([fLo, fHi]);
    }
    await Promise.all(
      bounds.map(
        ([fLo, fHi], i) =>
          new Promise<void>((resolve, reject) => {
            const pw = this.workers[i];
            const onMsg = (msg: { dev: Float64Array; bruteCalls: number }): void => {
              pw.worker.off('error', onErr);
              dev.set(msg.dev, fLo);
              bruteCalls += msg.bruteCalls;
              resolve();
            };
            const onErr = (e: Error): void => {
              pw.worker.off('message', onMsg);
              reject(e);
            };
            pw.worker.once('message', onMsg);
            pw.worker.once('error', onErr);
            pw.worker.postMessage({
              xyz,
              uv,
              tris,
              fLo,
              fHi,
              baryN: 8,
              opts,
            });
          }),
      ),
    );
    return { dev, bruteCalls };
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((pw) => pw.worker.terminate()));
  }
}

/**
 * One-shot parallel whole-mesh score: spins up a pool, scores every facet's
 * dense-lattice deviation across `nWorkers`, and runs the IDENTICAL reduction
 * as {@link scoreWholeMesh} (via {@link reduceDevArray} on a bit-identical
 * dev[]). The `sampler` must be a GpuSurfaceSampler (grid-backed). Convenience
 * wrapper — for multi-pass use, hold a {@link ParallelScorerPool} and call
 * {@link ParallelScorerPool.scoreDev} directly to amortize pool startup.
 */
export async function scoreWholeMeshParallel(
  sampler: GpuSurfaceSampler,
  mesh: ChartMesh,
  tolMm: number,
  nWorkers = 4,
  opts: RulerOptions = DEFAULT_RULER,
): Promise<WholeMeshScore> {
  const grid = samplerGrid(sampler);
  const pool = new ParallelScorerPool(grid, nWorkers);
  try {
    const xyz = liftChartMesh(sampler, mesh.uv);
    const { dev, bruteCalls } = await pool.scoreDev(xyz, mesh.uv, mesh.tris, opts);
    return reduceDevArray(dev, tolMm, bruteCalls);
  } finally {
    await pool.close();
  }
}
