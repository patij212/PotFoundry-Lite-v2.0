// _sweepWorker.ts — one predicate-evaluation worker for the Phase-1 FIFO sweep driver. RESEARCH ONLY.
//
// Runs as a PRE-BUNDLED .mjs (see _sweepPool.ts): a worker thread does not go through Vitest's Vite pipeline
// and this repo's imports are extensionless TS, so handing Node this file directly would fail to resolve
// `./_sweepPredicate`. esbuild bundles it, Node runs the bundle. A bundle failure THROWS in the pool rather
// than silently falling back to serial and mis-reporting a speedup.
//
// It shares memory and copies nothing large:
//   * the vertex mirror (theta,z,x,y per vertex) is a SharedArrayBuffer, viewed READ-ONLY here;
//   * the edge list (two vertex indices per edge) is a SharedArrayBuffer, viewed READ-ONLY here;
//   * the result block is a SharedArrayBuffer written ONLY at the slots this worker claimed, so two workers
//     never touch the same bytes and no lock is needed;
//   * the claim cursor is an Int32Array advanced with Atomics.add.
//
// THE CURSOR IS ATOMIC, NOT A STATIC RANGE SPLIT. Per-edge cost is NOT uniform: `edgeSagRaw` samples at an
// ABSOLUTE pitch, so a long initial-grid edge costs REF_NMAX samples and a freshly bisected one costs esN —
// an 8x spread before `locateKink`'s early `return null` on smooth edges widens it further. A static split
// hands one worker the expensive band and the generation finishes when that worker does.
//
// WHAT THIS WORKER DELIBERATELY DOES NOT DO: anything stateful. It computes `edgeVerdictRaw` and nothing else.
// The §3.3 jump-stickiness bookkeeping, the per-edge memo, the counters and every mesh mutation stay on the
// main thread, in the order they have always run. That is what makes the pooled mesh byte-identical to the
// serial one rather than merely similar — see the long note in _sweepPool.ts.
import { parentPort, workerData } from 'node:worker_threads';
import { buildSweepRadiusFn } from './_sweepRA';
import { edgeVerdictRaw, packVerdict, VERT_STRIDE, type SweepPredConst } from './_sweepPredicate';
import type { StyleDims } from './runStyle';

/** Slot layout of the shared control block. */
export const SW_CURSOR = 0;   // next unclaimed edge index
export const SW_ABORT = 1;    // non-zero once the parent has given up on this generation

export interface SweepWorkerData {
  style: string;
  styleParams: Record<string, number>;
  dims: StyleDims;
  pred: SweepPredConst;
  /** the (theta,z) lattice the parent will diff this worker's rebuilt R against, BEFORE any edge is measured */
  latTh: Float64Array;
  latZ: Float64Array;
}

export interface SweepWorkMsg {
  kind: 'work';
  gen: number;
  vSab: SharedArrayBuffer;   // Float64, VERT_STRIDE per vertex
  eSab: SharedArrayBuffer;   // Int32, 2 per edge
  oSab: SharedArrayBuffer;   // Float64, RES_STRIDE per edge
  ctrlSab: SharedArrayBuffer; // Int32Array [cursor, abort]
  nEdges: number;
  chunk: number;
}

export type SweepParentMsg = SweepWorkMsg | { kind: 'stop' };

export type SweepWorkerMsg =
  | {
    kind: 'lattice';
    /** R over the verification lattice — the parent proves this is bit-identical to its own before using anything */
    lat: Float64Array;
    /** R evals spent on the lattice check; reported separately so the mesher's cost line stays honest */
    latEvals: number;
  }
  | { kind: 'done'; gen: number; edges: number; rEvals: number }
  | { kind: 'failed'; gen: number; message: string };

const d = workerData as SweepWorkerData;
const { R, evals } = buildSweepRadiusFn(d.style, d.styleParams, d.dims);

// VERIFICATION FIRST, before a single edge is measured, and REPORTED first: if the rebuilt surface is not the
// parent's surface, nothing this worker produces means anything and the parent must be able to refuse in the
// first second rather than after a multi-minute generation.
{
  const lat = new Float64Array(d.latTh.length);
  for (let i = 0; i < lat.length; i += 1) lat[i] = R(d.latTh[i], d.latZ[i]);
  parentPort?.postMessage({ kind: 'lattice', lat, latEvals: evals() } satisfies SweepWorkerMsg, [lat.buffer]);
}

let baseEvals = evals();

parentPort?.on('message', (m: SweepParentMsg) => {
  if (m.kind === 'stop') { parentPort?.close(); return; }
  const vert = new Float64Array(m.vSab);
  const edges = new Int32Array(m.eSab);
  const out = new Float64Array(m.oSab);
  const ctrl = new Int32Array(m.ctrlSab);
  let done = 0;
  try {
    for (;;) {
      if (Atomics.load(ctrl, SW_ABORT) !== 0) break;
      const start = Atomics.add(ctrl, SW_CURSOR, m.chunk);
      if (start >= m.nEdges) break;
      const end = Math.min(start + m.chunk, m.nEdges);
      for (let i = start; i < end; i += 1) {
        const a = edges[i * 2]; const b = edges[i * 2 + 1];
        const oa = a * VERT_STRIDE; const ob = b * VERT_STRIDE;
        const v = edgeVerdictRaw(
          R,
          vert[oa], vert[oa + 1], vert[oa + 2], vert[oa + 3],
          vert[ob], vert[ob + 1], vert[ob + 2], vert[ob + 3],
          d.pred,
        );
        packVerdict(out, i, v);
        done += 1;
      }
    }
  } catch (e) {
    Atomics.store(ctrl, SW_ABORT, 1);
    parentPort?.postMessage({ kind: 'failed', gen: m.gen, message: String(e) } satisfies SweepWorkerMsg);
    return;
  }
  const spent = evals() - baseEvals;
  baseEvals = evals();
  parentPort?.postMessage({ kind: 'done', gen: m.gen, edges: done, rEvals: spent } satisfies SweepWorkerMsg);
});
