/**
 * _parallelScorerWorker.ts — worker entry for the whole-mesh parallel scorer.
 *
 * DEV-ONLY (Tier-C, flag-gated). This file is NOT imported by any production
 * path directly — it is bundled on demand by {@link ./parallelScorer.ts} (via
 * esbuild, a devDependency) into a self-contained `.mjs` that each pool worker
 * loads. Bundling is required because raw node ESM cannot resolve the src
 * chain's extensionless imports; esbuild inlines the SAME `facetInteriorHonest`
 * so the parallel path has EXACTLY ONE source of truth for the metrology (the
 * byte-identical mandate — a re-implemented ruler would drift).
 *
 * Protocol (one message, one reply):
 *  - workerData: { positions, resU, resT } — the serialized GpuSurfaceSampler
 *    grid (a Float32Array copy per worker; deterministic bilinear interp ⇒ the
 *    reconstructed surface is bit-identical to the main thread's).
 *  - message  : { xyz, uv, tris, fLo, fHi, bary8, opts } — one facet shard.
 *  - reply    : { dev: Float64Array, bruteCalls } — dev[k] for facet fLo+k,
 *    in shard-local index order (the caller reassembles by global facet index).
 *
 * @module conforming/tierC/_parallelScorerWorker
 */
import { parentPort, workerData } from 'node:worker_threads';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import {
  radialSurfaceFromSampler,
  facetInteriorHonest,
  denseBary,
  type RulerOptions,
} from './interiorRuler';

interface InitData {
  positions: Float32Array;
  resU: number;
  resT: number;
}

interface ShardTask {
  xyz: Float64Array;
  uv: number[];
  tris: number[];
  fLo: number;
  fHi: number;
  /** Barycentric lattice n (8 ⇒ the dense 45-pt guard; 0 ⇒ use BARY_STOP). */
  baryN: number;
  opts: RulerOptions;
}

const init = workerData as InitData;
const sampler = new GpuSurfaceSampler(init.positions, init.resU, init.resT);
const surface = radialSurfaceFromSampler(sampler);

// Precompute the dense lattice once (matches the main-thread guard lattice).
const dense = denseBary(8);
// BARY_STOP is not re-exported to keep the surface minimal; the parallel path
// is used ONLY for the dense guard/dense refine pass (baryN 8). A baryN other
// than 8 is rejected — the cheap 7-pt PHASE-A bulk passes stay sequential
// (they are already fast; parallelism pays off on the dense passes).

parentPort?.on('message', (task: ShardTask) => {
  if (task.baryN !== 8) {
    throw new Error(
      `_parallelScorerWorker: only baryN=8 (dense) supported, got ${task.baryN}`,
    );
  }
  const { xyz, uv, tris, fLo, fHi } = task;
  const n = fHi - fLo;
  const dev = new Float64Array(n);
  let bruteCalls = 0;
  for (let k = 0; k < n; k++) {
    const f = fLo + k;
    const g = facetInteriorHonest(
      surface,
      xyz,
      uv,
      tris[3 * f],
      tris[3 * f + 1],
      tris[3 * f + 2],
      dense,
      task.opts,
    );
    dev[k] = g.dev;
    bruteCalls += g.bruteCalls;
  }
  parentPort?.postMessage({ dev, bruteCalls }, [dev.buffer]);
});
