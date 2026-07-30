// _sweepPool.ts — the sweep driver's predicate worker pool: bundle, spawn, verify, evaluate. RESEARCH ONLY.
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS SOUND — read this before changing anything here, and especially before "simplifying" it.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// The heap driver was inherently serial: a global priority queue whose pops mutate shared topology, so the
// key a triangle is popped at depends on everything popped before it. The Phase-1 FIFO SWEEP is not. Within
// ONE generation the work list is fixed, and `triangleNeed(t)` is READ-ONLY against the mesh and against rA
// and independent per triangle. It is also ~100 % of the cost (~130 rA evals per triangle, memoised per
// edge); applying a split is pointer work.
//
// BUT `triangleNeed` IS NOT PURE — and the whole design turns on separating the two halves that hide inside
// it. On a memo MISS it (a) MEASURES the edge (`edgeSag` + `locateKink` + one crossing solve), which is pure,
// and (b) runs the §3.3 JUMP-STICKINESS bookkeeping (`noteSite`), which reads and WRITES a cross-sweep site
// map and whose answer depends on WHAT THE PREVIOUS SWEEP SAW and on the order in which sites are first
// touched WITHIN a sweep. (b) is not a measurement; it is driver state.
//
// So the parallel half is EXACTLY (a). This pool computes `edgeVerdictRaw` — sag, kink, crossing point,
// conformance — and nothing else. The result is a PREFETCH TABLE, not a cache substitute: the main thread
// still runs `edgeVerdict` in the identical order, still misses the memo on exactly the same edges, still
// calls `noteSite` at exactly the same moments with exactly the current `sweep`, and still inserts into
// `edgeCache` itself. The only change is that the miss path is served a value that was computed earlier by
// a worker instead of computed here and now.
//
// THREE CONSEQUENCES, and they are what makes W=1 and W=8 produce ONE STL md5 rather than merely similar
// meshes:
//
//  1. STICKINESS IS UNAFFECTED — NOT "converges anyway", but bit-identical. §3.3 confirms a jump only when
//     the same quantised site read jump on the IMMEDIATELY PREVIOUS sweep. That rule is evaluated at
//     CONSUMPTION time on the main thread, never at measurement time. A verdict prefetched in sweep 5 and
//     first consumed in sweep 6 calls `noteSite` with sweep=6 — exactly as a serial run would, because a
//     serial run would also have first measured that edge in sweep 6. Nothing about the measurement carries
//     a sweep number.
//  2. SPECULATION IS FREE OF SEMANTICS. A generation's triangles can be killed by a neighbour's split before
//     they are popped, so some prefetched edges are never consumed. An unconsumed entry is DISCARDED at the
//     next generation boundary; it never reaches `noteSite`, never reaches `edgeCache`, never increments a
//     memo counter. Its only trace is rA evals, which is a COST number and is reported separately.
//  3. STALENESS CANNOT ARISE AT ALL, so the usual "re-evaluated on the next sweep, fixed point unchanged"
//     argument is not even needed here. `edgeVerdictRaw` is a pure function of the two endpoints'
//     coordinates, and the driver's own load-bearing invariant is that VERTICES ARE NEVER MOVED (spec §4.3's
//     vertex move is deferred; `killT`/`addT` never rewrite a live triangle's corners during refinement).
//     A verdict for edge (a,b) is therefore valid for the entire lifetime of that edge, whichever sweep it
//     is read in. `syncVertices` re-checks that invariant on a strided sample every generation and REFUSES
//     to run if a mirrored coordinate ever changed — because if the deferred vertex move ever lands, this
//     file is one of the places that silently stops being true.
//
// DETERMINISM IS BY CONSTRUCTION, NOT BY SORTING. Edge i's result is written to slot i and only to slot i,
// by whichever worker claimed the chunk containing i; claims come from one Atomics.add so every index is
// claimed exactly once. The output block is therefore a pure function of the input edge list, independent of
// how many workers ran or how they interleaved. The ACTIONS are then applied by the unchanged serial FIFO
// loop, in queue order — which is both deterministic and equal to the serial order, so no re-sort is needed
// and none is wanted (sorting by triangle index would be deterministic too, but it would NOT equal the
// serial order and the md5 acceptance test would be unmeetable).
//
// WHAT IS STILL ONLY CHECKED, NOT PROVEN:
//   * that a worker's REBUILT rA is the parent's rA — checked against `sweepRadiusLattice`, with brackets
//     around every detected C0 locus, before a single edge is measured; any deviation refuses the run;
//   * that the worker's ARITHMETIC matches the main thread's — same source file (_sweepPredicate.ts), same
//     V8 in the same process, and PF_CB_SWEEP_VERIFY=1 re-measures every prefetched edge on the main thread
//     and Object.is-compares all seven fields.
import { buildSync } from 'esbuild';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sweepRadiusLattice } from './_sweepRA';
import { VERT_STRIDE, RES_STRIDE, RES_STATUS, unpackVerdict, type SweepPredConst, type SweepRawVerdict } from './_sweepPredicate';
import type { StyleDims } from './runStyle';
import type { SweepWorkerData, SweepWorkerMsg } from './_sweepWorker';

const SW_CURSOR = 0;
const SW_ABORT = 1;

/**
 * PF_CB_SWEEP_WORKERS. Default = PHYSICAL cores (availableParallelism reports LOGICAL, hence the halving),
 * capped at 10. **1 selects the existing serial path and no worker is ever spawned** — that is deliberate, so
 * any regression is bisectable against a code path that did not change.
 *
 * WHY THE DEFAULT IS PHYSICAL AND NOT LOGICAL, on this 8-physical / 16-logical box: the H1 auditor measured
 * 5.26x at W=8 and 7.97x at W=16 on the same shape of work (branchy scalar libm with long dependent chains),
 * so SMT does buy more — but the default stays conservative because it leaves the machine usable while a
 * multi-hour mesher run is in flight, and because the campaign's timing discipline (Windows EcoQoS throttles
 * a detached node job ~4-5x unless the whole tree is pinned AboveNormal) makes an oversubscribed box the
 * easiest way to measure the scheduler instead of the pool. Set PF_CB_SWEEP_WORKERS=16 for a dedicated run.
 */
export function resolveSweepWorkers(): number {
  const raw = process.env.PF_CB_SWEEP_WORKERS;
  if (raw !== undefined && raw !== '') {
    const v = Number.parseInt(raw, 10);
    if (Number.isFinite(v) && v >= 0) return Math.max(1, v);
  }
  const logical = availableParallelism();
  return Math.max(1, Math.min(10, Math.floor(logical / 2)));
}

let bundledEntry: string | null = null;

/** Pre-bundle the worker entry with esbuild into a scratch .mjs. Once per process. */
function workerBundle(): string {
  if (bundledEntry !== null && existsSync(bundledEntry)) return bundledEntry;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '_sweepWorker.ts'), resolve('research', 'bridge', '_sweepWorker.ts')];
  const entry = candidates.find((p) => existsSync(p));
  if (entry === undefined) throw new Error(`sweep worker entry not found; looked in ${candidates.join(' , ')}`);
  const out = join(mkdtempSync(join(tmpdir(), 'pf-sweepworker-')), 'sweepworker.mjs');
  buildSync({
    entryPoints: [entry], outfile: out,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  bundledEntry = out;
  return out;
}

export interface SweepPoolCfg {
  workers: number;
  style: string;
  styleParams: Record<string, number>;
  dims: StyleDims;
  pred: SweepPredConst;
  H: number;
  /** detected C0 z-loci — the lattice brackets both sides of each */
  zJumps: readonly number[];
  /** detected C0 theta-loci — likewise */
  thJumps: readonly number[];
  /** THE DRIVER'S OWN rA (raw, uncounted). Every worker's rebuilt copy is diffed against this. */
  refRadius: (th: number, z: number) => number;
  workerHeapMb: number;
  chunkMax: number;
}

export interface SweepPoolStats {
  workers: number;
  bundleMs: number;
  /** worst |worker R - parent rA| over the verification lattice, in mm. Must be 0. */
  latMaxDev: number;
  /** lattice points where any worker's R was not bit-identical to the parent's. Must be 0. */
  latDiffCount: number;
  /** total (worker x lattice point) comparisons actually made — the non-vacuity witness for the check above */
  latPoints: number;
  /** rA evals spent inside the workers, INCLUDING speculatively-computed edges that were never consumed */
  workerEvals: number;
  /** edges dispatched across all generations */
  edgesDispatched: number;
  /** generations dispatched */
  generations: number;
  /** vertices currently mirrored into the shared buffer */
  verticesMirrored: number;
  /** peak bytes held in the three shared buffers */
  peakBytes: number;
}

/**
 * A pool of predicate workers plus the three shared buffers they read/write. The parent owns all layout;
 * workers only ever see indices.
 */
export class SweepPool {
  private readonly cfg: SweepPoolCfg;
  private readonly ws: Worker[] = [];
  private readonly ctrlSab = new SharedArrayBuffer(2 * 4);
  private readonly ctrl: Int32Array;
  private vSab: SharedArrayBuffer;
  private vBuf: Float64Array;
  private eSab: SharedArrayBuffer;
  private eBuf: Int32Array;
  private oSab: SharedArrayBuffer;
  /** the result block, read by `verdict(slot)` */
  out: Float64Array;
  private vCount = 0;
  private nEdges = 0;
  private gen = 0;
  private readonly resolvers = new Map<Worker, { res: () => void; rej: (e: Error) => void; gen: number }>();
  readonly stats: SweepPoolStats;

  private constructor(cfg: SweepPoolCfg, bundleMs: number) {
    this.cfg = cfg;
    this.ctrl = new Int32Array(this.ctrlSab);
    this.vSab = new SharedArrayBuffer(1 << 16);
    this.vBuf = new Float64Array(this.vSab);
    this.eSab = new SharedArrayBuffer(1 << 16);
    this.eBuf = new Int32Array(this.eSab);
    this.oSab = new SharedArrayBuffer(1 << 16);
    this.out = new Float64Array(this.oSab);
    this.stats = {
      workers: cfg.workers, bundleMs,
      latMaxDev: 0, latDiffCount: 0, latPoints: 0,
      workerEvals: 0, edgesDispatched: 0, generations: 0, verticesMirrored: 0, peakBytes: 0,
    };
  }

  /**
   * Spawn the pool and PROVE every worker's rebuilt surface before returning. Throws — never degrades to
   * serial silently — because a pool that quietly fell back would report a speedup it did not have, and a
   * pool whose surface differs would produce a fully formatted, entirely meaningless mesh.
   */
  static async open(cfg: SweepPoolCfg): Promise<SweepPool> {
    const tB = Date.now();
    const entry = workerBundle();
    const pool = new SweepPool(cfg, Date.now() - tB);

    const { th: latTh, z: latZ } = sweepRadiusLattice(cfg.H, cfg.zJumps, cfg.thJumps);
    const expect = new Float64Array(latTh.length);
    for (let i = 0; i < latTh.length; i += 1) expect[i] = cfg.refRadius(latTh[i], latZ[i]);

    let latChecked = 0; let latDiff = 0; let latMax = 0;
    const spawn = (): Promise<void> => new Promise<void>((res, rej) => {
      const data: SweepWorkerData = {
        style: cfg.style, styleParams: cfg.styleParams, dims: cfg.dims, pred: cfg.pred, latTh, latZ,
      };
      const w = new Worker(entry, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: cfg.workerHeapMb } });
      w.on('message', (m: SweepWorkerMsg) => {
        if (m.kind === 'lattice') {
          latChecked += 1;
          for (let i = 0; i < expect.length; i += 1) {
            if (!Object.is(expect[i], m.lat[i])) {
              latDiff += 1;
              const dv = Math.abs(expect[i] - m.lat[i]);
              if (!(dv <= latMax)) latMax = dv;
            }
          }
          pool.ws.push(w);
          res();
          return;
        }
        const pend = pool.resolvers.get(w);
        if (pend === undefined) return;
        pool.resolvers.delete(w);
        if (m.kind === 'failed') { pend.rej(new Error(`sweep worker failed in gen ${m.gen}: ${m.message}`)); return; }
        // A reply for the WRONG generation would mean the parent read a buffer a worker was still writing.
        // It cannot happen (the parent awaits every worker before the next dispatch) — so if it ever does,
        // the barrier is broken and the run must stop, not continue with a plausible number.
        if (m.gen !== pend.gen) { pend.rej(new Error(`sweep pool: worker replied for gen ${m.gen} while gen ${pend.gen} was in flight — the generation barrier is broken.`)); return; }
        pool.stats.workerEvals += m.rEvals;
        pend.res();
      });
      w.on('error', (e) => {
        Atomics.store(pool.ctrl, SW_ABORT, 1);
        const pend = pool.resolvers.get(w);
        if (pend !== undefined) { pool.resolvers.delete(w); pend.rej(e); }
        rej(e);
      });
      w.on('exit', (code) => {
        Atomics.store(pool.ctrl, SW_ABORT, 1);
        const pend = pool.resolvers.get(w);
        if (pend !== undefined) { pool.resolvers.delete(w); pend.rej(new Error(`sweep worker exited ${code} mid-generation`)); }
      });
    });

    const settled = await Promise.allSettled(Array.from({ length: cfg.workers }, spawn));
    const failed = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    pool.stats.latMaxDev = latMax;
    pool.stats.latDiffCount = latDiff;
    pool.stats.latPoints = expect.length * latChecked;

    if (failed.length > 0) {
      await pool.close();
      throw new Error(`sweep pool: ${failed.length}/${cfg.workers} workers failed to start — ${String(failed[0].reason)}`);
    }
    if (latChecked !== cfg.workers) {
      await pool.close();
      throw new Error(`sweep pool: only ${latChecked}/${cfg.workers} workers reported an rA verification lattice — refusing to mesh against unverified work.`);
    }
    if (latDiff > 0) {
      await pool.close();
      throw new Error(
        `sweep pool: a worker's rebuilt rA is NOT bit-identical to the driver's — ${latDiff} of ${expect.length * latChecked} `
        + `lattice points differ, worst ${(latMax * 1000).toFixed(6)} um. Every prefetched verdict would describe a `
        + `different surface than the one the mesher refines against. Refusing to run.`);
    }
    return pool;
  }

  /**
   * Append newly created vertices into the shared mirror, and RE-CHECK the append-only invariant on a strided
   * sample of the vertices already mirrored.
   *
   * THE CHECK IS THE POINT. Everything in this file rests on "vertices are never moved", which is true today
   * and stops being true the moment spec §4.3's snap-to-locus vertex move lands. A moved vertex would make
   * every prefetched verdict on its incident edges silently wrong — the exact shape of the Voronoi hash
   * desync. Golden-ratio stride so a capped sample is spread over the whole array rather than being a
   * low-index band.
   */
  syncVertices(vth: readonly number[], vz: readonly number[], vx: readonly number[], vy: readonly number[]): void {
    const n = vth.length;
    if (this.vCount > 0) {
      const step = Math.max(1, Math.floor(this.vCount / 256));
      for (let i = 0; i < this.vCount; i += step) {
        const o = i * VERT_STRIDE;
        if (!Object.is(this.vBuf[o], vth[i]) || !Object.is(this.vBuf[o + 1], vz[i])
          || !Object.is(this.vBuf[o + 2], vx[i]) || !Object.is(this.vBuf[o + 3], vy[i])) {
          throw new Error(
            `sweep pool: vertex ${i} MOVED since it was mirrored (${this.vBuf[o]},${this.vBuf[o + 1]},${this.vBuf[o + 2]},${this.vBuf[o + 3]})`
            + ` -> (${vth[i]},${vz[i]},${vx[i]},${vy[i]}). The prefetch is only valid while vertices are append-only.`
            + ` If spec §4.3's vertex move has landed, this pool must evict every edge incident to a moved vertex.`);
        }
      }
    }
    if (n * VERT_STRIDE * 8 > this.vSab.byteLength) {
      let bytes = this.vSab.byteLength;
      while (bytes < n * VERT_STRIDE * 8) bytes *= 2;
      const next = new SharedArrayBuffer(bytes);
      const nb = new Float64Array(next);
      nb.set(this.vBuf.subarray(0, this.vCount * VERT_STRIDE));
      this.vSab = next; this.vBuf = nb;
    }
    for (let i = this.vCount; i < n; i += 1) {
      const o = i * VERT_STRIDE;
      this.vBuf[o] = vth[i]; this.vBuf[o + 1] = vz[i]; this.vBuf[o + 2] = vx[i]; this.vBuf[o + 3] = vy[i];
    }
    this.vCount = n;
    this.stats.verticesMirrored = n;
  }

  /** Start a new edge batch with room for `maxEdges`. Discards the previous batch's results. */
  beginBatch(maxEdges: number): void {
    if (maxEdges * 2 * 4 > this.eSab.byteLength) {
      let bytes = this.eSab.byteLength;
      while (bytes < maxEdges * 2 * 4) bytes *= 2;
      this.eSab = new SharedArrayBuffer(bytes);
      this.eBuf = new Int32Array(this.eSab);
    }
    if (maxEdges * RES_STRIDE * 8 > this.oSab.byteLength) {
      let bytes = this.oSab.byteLength;
      while (bytes < maxEdges * RES_STRIDE * 8) bytes *= 2;
      this.oSab = new SharedArrayBuffer(bytes);
      this.out = new Float64Array(this.oSab);
    }
    this.nEdges = 0;
    this.stats.peakBytes = Math.max(this.stats.peakBytes, this.vSab.byteLength + this.eSab.byteLength + this.oSab.byteLength);
  }

  /** Queue edge (a,b) — CANONICAL ORDER IS THE CALLER'S JOB. Returns the slot its verdict will land in. */
  pushEdge(a: number, b: number): number {
    const i = this.nEdges;
    this.eBuf[i * 2] = a; this.eBuf[i * 2 + 1] = b;
    this.out[i * RES_STRIDE + RES_STATUS] = 0; // "no worker reached this slot" — never mistakable for a real zero
    this.nEdges = i + 1;
    return i;
  }

  get batchSize(): number { return this.nEdges; }

  /** Evaluate the queued batch across the pool. Resolves when EVERY worker has reported for this generation. */
  async run(): Promise<void> {
    if (this.nEdges === 0) return;
    this.gen += 1;
    this.stats.generations += 1;
    this.stats.edgesDispatched += this.nEdges;
    Atomics.store(this.ctrl, SW_CURSOR, 0);
    Atomics.store(this.ctrl, SW_ABORT, 0);
    // CHUNK: aim for >=64 chunks per worker so the tail is amortised, but never below 1. Per-edge cost spans
    // ~8x through edgeSag's absolute pitch alone, so a coarse chunk hands one worker the long-edge band.
    const chunk = Math.max(1, Math.min(this.cfg.chunkMax, Math.floor(this.nEdges / (64 * this.ws.length))));
    const waits = this.ws.map((w) => new Promise<void>((res, rej) => {
      this.resolvers.set(w, { res, rej, gen: this.gen });
      w.postMessage({
        kind: 'work', gen: this.gen,
        vSab: this.vSab, eSab: this.eSab, oSab: this.oSab, ctrlSab: this.ctrlSab,
        nEdges: this.nEdges, chunk,
      });
    }));
    await Promise.all(waits);
  }

  /** The verdict for slot `i`, or null if no worker wrote it (the caller must then measure it itself). */
  verdict(i: number): SweepRawVerdict | null {
    return unpackVerdict(this.out, i);
  }

  async close(): Promise<void> {
    Atomics.store(this.ctrl, SW_ABORT, 1);
    await Promise.all(this.ws.map(async (w) => { await w.terminate(); }));
    this.ws.length = 0;
    this.resolvers.clear();
  }
}
