// _facetTruthH1Worker.ts — one H1 worker thread. RESEARCH ONLY.
//
// Runs as a PRE-BUNDLED .mjs (see _facetTruthPool.ts): a worker thread does not go through Vitest's Vite
// pipeline, and this repo's imports are extensionless TS, so handing Node this file directly would fail to
// resolve `./_facetTruthLib`. esbuild bundles it, Node runs the bundle.
//
// It shares memory with the parent and copies nothing large:
//   * the STL lives in a SharedArrayBuffer (a 648 MB mesh cannot be cloned W times), viewed here read-only;
//   * the walk cursor is an Int32Array in a second SharedArrayBuffer, advanced with Atomics.add.
//
// THE CURSOR IS ATOMIC, NOT A STATIC RANGE SPLIT, and that is load-bearing rather than stylistic: per-facet
// cost was MEASURED to span 181x (3.756 ms to 679 ms) on one mesh, so a static nTri/W split hands one worker
// a range that happens to hold the expensive facets and the pool finishes when that worker does — 2-3x
// instead of ~10x. With a shared cursor every worker keeps pulling until the walk is exhausted.
import { parentPort, workerData } from 'node:worker_threads';
import { runH1Walk, H1RowSink, type H1Job, type H1Partial, type H1RowShard } from './_facetTruthH1';
import { buildAuditRadiusFn } from './_facetTruthRA';
import type { StyleDims } from './runStyle';

/** Slot layout of the shared control block. */
export const CTRL_CURSOR = 0;   // next unclaimed walk index k
export const CTRL_STOP = 1;     // non-zero once any worker has hit the global budget/deadline

export interface H1WorkerData {
  meshSab: SharedArrayBuffer;   // Float64 xyz, 9 per triangle
  ctrlSab: SharedArrayBuffer;   // Int32Array [cursor, stop]
  sampleSab: SharedArrayBuffer; // BigInt64Array [total lattice samples spent across the pool]
  job: H1Job;
  chunk: number;
  budget: number;
  style: string;
  styleParams: Record<string, number>;
  dims: StyleDims;
  /** the (theta,z) lattice the parent will diff this worker's rebuilt rA against */
  latTh: Float64Array;
  latZ: Float64Array;
  /** collect a PER-FACET row for every certified facet and ship it back with the result. Default off. */
  emitRows?: boolean;
  /**
   * Allow `_raFast`'s hoisted twin (default true — the historical behaviour).
   *
   * SET IT FALSE WHEN THE CALLER'S SERIAL PATH DOES NOT USE THE TWIN AND THE ACCEPTANCE TEST IS EXACT
   * PER-FACET REPRODUCTION. The twin is guarded three ways and has never been caught diverging, but
   * `_facetTruthRA` documents its own mutation test showing a divergence confined to a window smaller than
   * the sampling pitch evades every upfront sweep — so "probably identical" is a speedup argument, not a
   * reproduction argument. A caller whose serial control used the shipped builder gets the shipped builder.
   */
  raFast?: boolean;
}

/**
 * TWO messages, and the order matters. The lattice goes back BEFORE the walk starts, so the parent can
 * refuse a mismatched surface in the first second instead of discovering it at the end of a multi-hour run.
 */
export type H1WorkerMsg =
  | {
    kind: 'lattice';
    /** rA over the verification lattice — the parent proves this is bit-identical to its own before using anything */
    lat: Float64Array;
    /** rA evals spent on the lattice check; excluded so the reported eval count matches a serial run */
    latEvals: number;
  }
  | {
    kind: 'result';
    partial: H1Partial;
    /** true if this worker stopped on the budget or the deadline rather than on an exhausted walk */
    stopped: boolean;
    /** per-facet rows for the k-ranges THIS worker claimed, present only when `emitRows` was set */
    rows?: H1RowShard;
  };

const d = workerData as H1WorkerData;
const xyz = new Float64Array(d.meshSab);
const ctrl = new Int32Array(d.ctrlSab);
const samples = new BigInt64Array(d.sampleSab);

const { rA, evals } = buildAuditRadiusFn(d.style, d.styleParams, d.dims, d.job.H, { allowFast: d.raFast !== false });

// Verification FIRST, before a single facet is certified, and REPORTED first: if the rebuilt surface is not
// the parent's surface, nothing this worker produces means anything and the parent must be able to say so
// immediately rather than after the walk.
const lat = new Float64Array(d.latTh.length);
for (let i = 0; i < lat.length; i += 1) lat[i] = rA(d.latTh[i], d.latZ[i]);
const latEvals = evals();
parentPort?.postMessage({ kind: 'lattice', lat, latEvals } satisfies H1WorkerMsg, [lat.buffer]);

let stopped = false;

const claim = (): readonly [number, number] | null => {
  if (Atomics.load(ctrl, CTRL_STOP) !== 0) { stopped = true; return null; }
  const start = Atomics.add(ctrl, CTRL_CURSOR, d.chunk);
  if (start >= d.job.kEnd) return null;
  return [start, Math.min(start + d.chunk, d.job.kEnd)] as const;
};

// Published per FACET, not per chunk, so the pooled sample budget has the same granularity the serial walk
// always had. One Atomics.add per ~186 ms of work is free.
const publish = (n: number): boolean => {
  const total = Atomics.add(samples, 0, BigInt(n)) + BigInt(n);
  if (Number(total) > d.budget) { Atomics.store(ctrl, CTRL_STOP, 1); stopped = true; return true; }
  if (Atomics.load(ctrl, CTRL_STOP) !== 0) { stopped = true; return true; }
  return false;
};

const sink = d.emitRows === true ? new H1RowSink() : null;
const partial = runH1Walk(rA, xyz, d.job, claim, publish, () => evals() - latEvals, sink?.emit);
// A worker that ran out of time must stop its siblings too, or the pool's wall clock is the slowest
// worker's own deadline plus one more chunk each.
if (Date.now() > d.job.deadlineMs) { Atomics.store(ctrl, CTRL_STOP, 1); stopped = true; }

if (sink === null) {
  parentPort?.postMessage({ kind: 'result', partial, stopped } satisfies H1WorkerMsg);
} else {
  const rows = sink.toShard();
  // TRANSFERRED, not cloned — the shard is the one thing this worker sends back that scales with the walk.
  // The casts are sound and narrow: `H1RowSink.toShard` builds every array with `TypedArray.from`, which
  // always allocates a fresh non-shared ArrayBuffer; TS only sees the wider `ArrayBufferLike`.
  const bufs = [rows.k.buffer, rows.tri.buffer, rows.witnessed.buffer, rows.bound.buffer, rows.flags.buffer] as ArrayBuffer[];
  parentPort?.postMessage({ kind: 'result', partial, stopped, rows } satisfies H1WorkerMsg, bufs);
}
