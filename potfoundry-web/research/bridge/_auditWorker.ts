// _auditWorker.ts — one post-loop AUDIT worker for the conforming-bisection driver. RESEARCH ONLY.
// New 2026-07-29. Pattern copied, deliberately and almost line-for-line, from _facetTruthH1Worker.ts and
// _sweepWorker.ts — both landed and measured in this repo; nothing here is invented.
//
// Runs as a PRE-BUNDLED .mjs (see _auditPool.ts): a worker thread does not go through Vitest's Vite pipeline
// and this repo's imports are extensionless TS, so handing Node this file directly would fail to resolve
// `./_sagKernel`. esbuild bundles it, Node runs the bundle. A bundle failure THROWS in the pool rather than
// silently falling back to serial and mis-reporting a speedup.
//
// It shares memory and copies nothing large:
//   * the four vertex coordinate arrays (theta, z, x, y) are SharedArrayBuffers, viewed READ-ONLY here;
//   * the three corner-index arrays of the LIVE triangle list are SharedArrayBuffers, viewed READ-ONLY;
//   * the result block is a SharedArrayBuffer written ONLY at the slots this worker claimed, so two workers
//     never touch the same bytes and no lock is needed;
//   * the claim cursor is an Int32Array advanced with Atomics.add.
//
// THE CURSOR IS ATOMIC, NOT A STATIC RANGE SPLIT, and that is load-bearing rather than stylistic. Per-facet
// audit cost is NOT uniform: `sagAdaptive` picks its lattice level from the triangle's LONGEST EDGE divided
// by PF_CB_AUD_HS, clamped to [12,64], so one facet costs lat(12)=91 rA evaluations and another costs
// lat(64)=2145 — a 23.6x spread from that clamp alone, and the mesh is adaptively refined so the two
// populations are spatially CLUSTERED (coarse initial-grid facets in the quiet bands, fine ones on the
// ribs). A static count/W split therefore hands one worker the expensive band and the pool finishes when
// that worker does. (_facetTruthH1Worker measured 181x per-facet spread on the same shape of argument.)
//
// WHAT THIS WORKER DELIBERATELY DOES NOT DO: anything stateful, and anything that touches the mesh. It
// evaluates two pure functions of (three vertex coordinates, rA) and writes one or two doubles per slot.
// Every reduction — the argmax, the percentile sort, the tail ordering, the over-tol count — stays on the
// main thread, in the order it has always run, reading the finished result block. That is why 1 worker and
// N produce an IDENTICAL report rather than merely similar numbers: see the long note in _auditPool.ts.
import { parentPort, workerData } from 'node:worker_threads';
import { buildSweepRadiusFn } from './_sweepRA';
import { sagOfNRaw, sagAdaptiveRaw, makeSagArgmax, type SagMesh } from './_sagKernel';
import type { StyleDims } from './runStyle';

/**
 * Slot layout of the shared control block. DUPLICATED in _auditPool.ts, exactly as _sweepPool.ts duplicates
 * _sweepWorker.ts's SW_CURSOR/SW_ABORT: the pool may only TYPE-import this module, because a value import
 * would execute the top-level worker body (which reads `workerData`) in the parent process.
 */
export const AU_CURSOR = 0;   // next unclaimed slot
export const AU_ABORT = 1;    // non-zero once any worker has failed, or the parent has given up

/** 'main' writes TWO doubles per slot (adaptive, fixed-N); 'tail' writes ONE (fixed-N at PF_CB_TAILN). */
export type AuditJobKind = 'main' | 'tail';

export interface AuditJob {
  kind: AuditJobKind;
  /** number of SLOTS in the triangle list = number of results to produce */
  count: number;
  /** 'main': the adaptive ruler's absolute pitch and its level clamp (PF_CB_AUD_HS / _NMIN / _NMAX) */
  audHs: number;
  audNmin: number;
  audNmax: number;
  /** 'main': the STRATA-comparable fixed level (PF_CB_ORACLE) */
  oracleN: number;
  /** 'tail': the adversarial re-measure level (PF_CB_TAILN) */
  tailN: number;
}

export interface AuditWorkerData {
  style: string;
  styleParams: Record<string, number>;
  dims: StyleDims;
  job: AuditJob;
  chunk: number;
  /** the four vertex coordinate arrays, Float64, one entry per vertex */
  vthSab: SharedArrayBuffer;
  vzSab: SharedArrayBuffer;
  vxSab: SharedArrayBuffer;
  vySab: SharedArrayBuffer;
  /** the live triangle list's three corner-index arrays, Int32, one entry per SLOT */
  taSab: SharedArrayBuffer;
  tbSab: SharedArrayBuffer;
  tcSab: SharedArrayBuffer;
  /** Float64 result block, stride 2 for 'main' and 1 for 'tail'; pre-filled with NaN by the parent */
  outSab: SharedArrayBuffer;
  /** Int32Array [cursor, abort] */
  ctrlSab: SharedArrayBuffer;
  /** the (theta,z) lattice the parent will diff this worker's rebuilt R against, BEFORE any facet is scored */
  latTh: Float64Array;
  latZ: Float64Array;
}

/**
 * TWO messages, and the order matters. The lattice goes back BEFORE the walk starts, so the parent can
 * refuse a mismatched surface in the first second instead of discovering it at the end of a 20-minute audit.
 */
export type AuditWorkerMsg =
  | {
    kind: 'lattice';
    /** R over the verification lattice — the parent proves this is bit-identical to its own before using anything */
    lat: Float64Array;
    /** R evals spent on the lattice check; EXCLUDED from `rEvals` so the reported cost matches a serial run */
    latEvals: number;
  }
  | {
    kind: 'result';
    /** slots this worker actually wrote. The parent requires the sum over workers to equal job.count. */
    slots: number;
    /** R evals spent scoring facets, lattice evals excluded */
    rEvals: number;
  }
  | { kind: 'failed'; message: string };

const d = workerData as AuditWorkerData;
const { R, evals } = buildSweepRadiusFn(d.style, d.styleParams, d.dims);

// VERIFICATION FIRST, before a single facet is scored, and REPORTED first: if the rebuilt surface is not the
// parent's surface, nothing this worker produces means anything and the parent must be able to say so
// immediately rather than after the audit. `buildSweepRadiusFn` is used and NOT `buildAuditRadiusFn`, because
// the DRIVER's `R` applies neither theta canonicalisation nor a z clamp — canon is applied at the call site
// inside `sagOfNRaw`. Wrapping it here would score against a different surface than the driver refined.
{
  const lat = new Float64Array(d.latTh.length);
  for (let i = 0; i < lat.length; i += 1) lat[i] = R(d.latTh[i], d.latZ[i]);
  parentPort?.postMessage({ kind: 'lattice', lat, latEvals: evals() } satisfies AuditWorkerMsg, [lat.buffer]);
}
const latEvals = evals();

const M: SagMesh = {
  ta: new Int32Array(d.taSab),
  tb: new Int32Array(d.tbSab),
  tc: new Int32Array(d.tcSab),
  vth: new Float64Array(d.vthSab),
  vz: new Float64Array(d.vzSab),
  vx: new Float64Array(d.vxSab),
  vy: new Float64Array(d.vySab),
};
const out = new Float64Array(d.outSab);
const ctrl = new Int32Array(d.ctrlSab);
// ONE scratch forensics record for this whole worker. Its contents are DISCARDED — the parent recovers the
// argmax sample by re-running `sagOfN` on the single winning triangle after the reduction (see _auditPool's
// header), which is exact because the ruler is pure. Shipping ten doubles per worker to save 91 rA
// evaluations would be a protocol for nothing.
const arg = makeSagArgmax();

let slots = 0;
let failed = false;
try {
  for (;;) {
    if (Atomics.load(ctrl, AU_ABORT) !== 0) break;
    const start = Atomics.add(ctrl, AU_CURSOR, d.chunk);
    if (start >= d.job.count) break;
    const end = Math.min(start + d.chunk, d.job.count);
    if (d.job.kind === 'main') {
      for (let i = start; i < end; i += 1) {
        // SAME ORDER AS THE SERIAL LOOP (adaptive first, then fixed-N). Both are pure, so the order cannot
        // change a value — it is kept so the rA EVAL COUNT is produced in the same sequence and the two arms
        // stay comparable line-for-line.
        // The literal 2 here IS `AUDIT_MAIN_STRIDE` in _auditPool.ts, which sizes the buffer and which the
        // driver indexes with. Three places, one number: change them together or the parent reads garbage.
        out[i * 2] = sagAdaptiveRaw(R, M, i, d.job.audHs, d.job.audNmin, d.job.audNmax, arg);
        out[i * 2 + 1] = sagOfNRaw(R, M, i, d.job.oracleN, arg);
        slots += 1;
      }
    } else {
      for (let i = start; i < end; i += 1) {
        out[i] = sagOfNRaw(R, M, i, d.job.tailN, arg);
        slots += 1;
      }
    }
  }
} catch (e) {
  // A throw must stop the SIBLINGS too, or the parent waits out the whole batch to learn about a failure it
  // could have refused immediately. EXACTLY ONE terminal message is posted either way, so the parent's
  // per-worker promise settles once and cannot be resolved by a 'result' that follows a 'failed'.
  failed = true;
  Atomics.store(ctrl, AU_ABORT, 1);
  parentPort?.postMessage({ kind: 'failed', message: String(e) } satisfies AuditWorkerMsg);
}

if (!failed) parentPort?.postMessage({ kind: 'result', slots, rEvals: evals() - latEvals } satisfies AuditWorkerMsg);
