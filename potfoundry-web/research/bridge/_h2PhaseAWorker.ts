// _h2PhaseAWorker.ts — one H2 phase-A worker thread. RESEARCH ONLY.
//
// Runs as a PRE-BUNDLED .mjs (see _h2Pool.ts): a worker thread does not go through Vitest's Vite pipeline,
// and this repo's imports are extensionless TS, so handing Node this file directly would fail to resolve
// `./_facetTruthLib`. esbuild bundles it, Node runs the bundle.
//
// IT SHARES MEMORY AND COPIES NOTHING LARGE:
//   * the audited mesh (xyz + idx) lives in SharedArrayBuffers, viewed here read-only;
//   * the phase-A heap keys are one shared Float64Array, written BY CELL INDEX so writes are disjoint;
//   * the cell cursor, the barriers and the partials are shared too, because THE PARENT IS BLOCKED.
//
// WHY THE PARENT IS BLOCKED, and why that dictates the protocol. `surfaceToMeshMax` is synchronous and is
// called synchronously by _strataFacetTruth.test.ts; making it async would be a breaking change to the
// audit harness. So the parent joins with `Atomics.wait` instead of the event loop — which means postMessage
// is useless in both directions once the run starts, and every result must travel through shared memory.
// Two barriers keep the fail-fast property the H1 pool gets from message ordering:
//     READY  — every worker has published its verification block; the parent diffs BEFORE any work starts
//     GO     — the parent has verified and released the sweep
//     DONE   — every worker has published its partial
//
// TWO THINGS ARE REBUILT PER WORKER, AND BOTH ARE VERIFIED RATHER THAN ASSUMED:
//   * rA, from (style, params, dims) through the SHARED `buildAuditRadiusFn` — identity by construction,
//     then diffed against the parent over `radiusLattice` (C0-bracketed, clamp boundaries included);
//   * the locator, by calling `buildRefLocator` VERBATIM on the shared mesh. `counts`/`items` are rebuilt
//     rather than shared so that there is exactly ONE implementation of the point-to-triangle query in the
//     repo — a second copy of `pointTriDist2` is the same two-copies-of-one-definition hazard that already
//     cost this repo a Voronoi hash desync. MEASURED cost of the rebuild (see _h2Pool.ts).
//     Its answers are then diffed against the parent's over `h2ProbeLattice`, including OFF-graph points,
//     because a mis-sized bucket grid shows up in the ring expansion and not on the surface.
import { parentPort, workerData } from 'node:worker_threads';
import {
  H2CTRL, h2ProbeEval, h2ProbeLattice, runH2PhaseA, writeH2Partial,
  type H2Geom,
} from './_h2PhaseA';
import { buildAuditRadiusFn, radiusLattice } from './_facetTruthRA';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import type { StyleDims } from './runStyle';

export interface H2WorkerData {
  ctrlSab: SharedArrayBuffer;      // Int32Array, H2CTRL layout
  statSab: SharedArrayBuffer;      // BigInt64Array[1], queries so far — PROGRESS ONLY
  errSab: SharedArrayBuffer;       // Uint8Array, UTF-8 error text
  keysSab: SharedArrayBuffer;      // Float64Array(U*V), written by cell index
  partSab: SharedArrayBuffer;      // Float64Array(workers * h2PartialSlots(NZB))
  verifySab: SharedArrayBuffer;    // Float64Array(workers * verifyLen)
  xyzSab: SharedArrayBuffer;       // Float64Array, mesh vertex coordinates
  idxSab: SharedArrayBuffer;       // Uint32Array, mesh triangle indices
  nV: number; nF: number; locatorCell: number;
  style: string; styleParams: Record<string, number>; dims: StyleDims; H: number;
  zJumps: number[]; thJumps: number[];
  geom: H2Geom;
  chunk: number; nCells: number; index: number; workers: number;
  partialSlots: number; verifyLen: number; latLen: number;
}

const d = workerData as H2WorkerData;
const ctrl = new Int32Array(d.ctrlSab);
let readyPublished = false;
let donePublished = false;

function fail(e: unknown): never {
  const msg = `H2 worker ${d.index}: ${e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)}`;
  const bytes = new TextEncoder().encode(msg.slice(0, 3900));
  const err = new Uint8Array(d.errSab);
  // First failure wins the buffer; later ones only need to raise the flag, and the parent aborts on the
  // flag, not on the text.
  if (Atomics.compareExchange(ctrl, H2CTRL.ERR, 0, 1) === 0) {
    err.set(bytes, 0);
    Atomics.store(ctrl, H2CTRL.ERRLEN, bytes.length);
  }
  Atomics.store(ctrl, H2CTRL.STOP, 1);
  // Unblock the parent on BOTH barriers: it may be waiting on either, and a worker that dies silently is
  // the one failure mode a blocked parent cannot observe. Counted at most once each, so a late failure
  // cannot make a barrier read complete when it is not.
  if (!readyPublished) { readyPublished = true; Atomics.add(ctrl, H2CTRL.READY, 1); }
  Atomics.notify(ctrl, H2CTRL.READY);
  if (!donePublished) { donePublished = true; Atomics.add(ctrl, H2CTRL.DONE, 1); }
  Atomics.notify(ctrl, H2CTRL.DONE);
  parentPort?.close();
  throw e;
}

try {
  const xyz = new Float64Array(d.xyzSab);
  const idx = new Uint32Array(d.idxSab);
  const keys = new Float64Array(d.keysSab);
  const parts = new Float64Array(d.partSab);
  const verify = new Float64Array(d.verifySab);

  const { rA } = buildAuditRadiusFn(d.style, d.styleParams, d.dims, d.H);
  const ref: RefMesh = { xyz, idx, nV: d.nV, nF: d.nF };
  const loc = buildRefLocator(ref, d.locatorCell);

  // ── VERIFICATION, published BEFORE a single cell is swept ────────────────────────────────────────────
  const vOff = d.index * d.verifyLen;
  const lat = radiusLattice(d.H, d.zJumps, d.thJumps);
  for (let i = 0; i < lat.th.length; i += 1) verify[vOff + i] = rA(lat.th[i], lat.z[i]);
  const probe = h2ProbeLattice(d.H);
  h2ProbeEval(rA, loc.dist, probe, verify.subarray(vOff + d.latLen, vOff + d.verifyLen));
  readyPublished = true;
  Atomics.add(ctrl, H2CTRL.READY, 1);
  Atomics.notify(ctrl, H2CTRL.READY);

  // ── WAIT FOR THE PARENT'S GO ─────────────────────────────────────────────────────────────────────────
  for (;;) {
    if (Atomics.load(ctrl, H2CTRL.STOP) !== 0) { parentPort?.close(); throw new Error('aborted before GO'); }
    if (Atomics.load(ctrl, H2CTRL.GO) !== 0) break;
    Atomics.wait(ctrl, H2CTRL.GO, 0, 200);
  }

  // ── THE SWEEP ────────────────────────────────────────────────────────────────────────────────────────
  // ATOMIC CURSOR, NOT A STATIC RANGE SPLIT. Phase-A cells are nominally uniform in cost, but the locator
  // query is not: a cell over a feature-dense band walks more buckets than one over a smooth flank, and a
  // static split finishes when the unluckiest worker does. The cursor is also what makes property (3) in
  // _h2PhaseA.ts true — Atomics.add is monotone, so each worker sees an INCREASING subsequence of cells and
  // its local argmax tie-break is already the serial one.
  const claim = (): readonly [number, number] | null => {
    if (Atomics.load(ctrl, H2CTRL.STOP) !== 0) return null;
    const start = Atomics.add(ctrl, H2CTRL.CURSOR, d.chunk);
    if (start >= d.nCells) return null;
    return [start, Math.min(start + d.chunk, d.nCells)] as const;
  };
  // PROGRESS PUBLICATION, every 64 cells (~14k queries at the audit defaults, so the atomics are free).
  // Nothing here feeds a reported number — see the H2CTRL.MAXNM note in _h2PhaseA.ts.
  const stats = new BigInt64Array(d.statSab);
  let sinceReport = 0; let lastQ = 0;
  const publish = (acc: { queries: number; max: number }): void => {
    Atomics.add(ctrl, H2CTRL.CELLS, sinceReport); sinceReport = 0;
    Atomics.add(stats, 0, BigInt(acc.queries - lastQ)); lastQ = acc.queries;
    const nm = Math.min(2147483647, Math.round(acc.max * 1e6));
    for (;;) {
      const cur = Atomics.load(ctrl, H2CTRL.MAXNM);
      if (nm <= cur) break;
      if (Atomics.compareExchange(ctrl, H2CTRL.MAXNM, cur, nm) === cur) break;
    }
  };
  const partial = runH2PhaseA(rA, loc.dist, d.geom, keys, claim, (_k, acc) => {
    sinceReport += 1;
    if (sinceReport >= 64) publish(acc);
  });
  publish({ queries: partial.queries, max: partial.max });

  writeH2Partial(parts, d.index * d.partialSlots, partial, d.geom.NZB);
  donePublished = true;
  Atomics.add(ctrl, H2CTRL.DONE, 1);
  Atomics.notify(ctrl, H2CTRL.DONE);
  parentPort?.close();
} catch (e) {
  fail(e);
}
