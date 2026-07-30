// _auditPool.ts — the conforming-bisection driver's POST-LOOP AUDIT worker pool: mirror, bundle, spawn,
// verify, score, reduce. RESEARCH ONLY. New 2026-07-29.
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS AND WHY IT IS SOUND — read this before changing anything here, especially before
// "simplifying" the reduction.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// MEASURED: a 2.5 M-cap GothicArches run spent ~1229 s in total and, at 200x140 / 5 M cap, the POST-LOOP
// phase dominated once refinement had finished. That phase is three things, in order:
//   1. score EVERY live triangle with `sagAdaptive` (PF_CB_AUD_HS pitch) and with `sagOfN` (PF_CB_ORACLE);
//   2. re-score the worst PF_CB_TAILK of them at PF_CB_TAILN;
//   3. (opt-in, PF_CB_LOCUS_AUDIT=1) re-run the kink locator on every triangle's three edges.
// (1) and (2) are embarrassingly parallel: every facet's score is a pure function of its three vertex
// coordinates and of rA, READ-ONLY against the mesh, independent of every other facet. (3) is left SERIAL —
// it is off by default, it needs the whole kink-locator constant block, and adding it here would widen the
// surface for no gain on the runs this was built for. That omission is stated in the change-list, not hidden.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE FOUR THINGS THAT HAVE TO BE TRUE BEFORE A POOLED NUMBER MAY STAND IN FOR A SERIAL ONE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//  1. THE MESH IS NOT COPIED. At 5 M triangles the corner arrays alone are 60 MB and the vertex arrays
//     ~80 MB; W copies is not an option, so this is `worker_threads` with SharedArrayBuffers, never child
//     processes. `mirrorAuditMesh` copies the four vertex arrays into SABs ONCE, `packAuditTris` writes the
//     live triangle list's three corner arrays into SABs once per job, and every worker views the same bytes.
//     THE MIRROR IS TAKEN AFTER the collapse/flip pass, which is the last thing that rewrites a corner index;
//     nothing between the mirror and the end of the audit mutates the mesh (the audit is read-only and the
//     STL is written from `soup`, which is built before it).
//  2. THE SURFACE IS REBUILT, SO IT MUST BE PROVEN IDENTICAL. rA is a closure and cannot be transferred; each
//     worker rebuilds it from (style, params, dims) via the SHARED `buildSweepRadiusFn` — the DRIVER's
//     convention (no theta canonicalisation, no z clamp; canon is applied inside the ruler at the call site),
//     not the auditor's. That is identity by construction, and this file still diffs every worker's R against
//     the parent's over `sweepRadiusLattice`, which brackets every detected C0 z-step and theta-jump, and
//     REFUSES the run on any deviation. Reported, with the comparison count, so the check cannot be vacuous.
//  3. THE WORKER ACTUALLY RUNS. A worker thread does not go through Vitest's Vite pipeline and this repo's
//     imports are extensionless TS, so the entry is pre-bundled with esbuild into a scratch .mjs. A bundle
//     failure THROWS here rather than silently falling back to serial and mis-reporting a speedup.
//  4. THE RESULT DOES NOT DEPEND ON INTERLEAVING. This is where the audit pool is STRONGER than the H1 pool
//     it copies: H1 needs a commutative merge with an explicit tie-break, because each worker reduces its own
//     partial. Here NO WORKER REDUCES ANYTHING. Slot i's score is written to slot i and only slot i, by
//     whichever worker claimed the chunk containing i (claims come from one Atomics.add, so every slot is
//     claimed exactly once), and the finished result block is therefore a PURE FUNCTION of the input
//     triangle list — independent of W and of how the threads interleaved. The parent then runs the
//     UNCHANGED serial reduction loop over that block, in the original `liveIdx` order: same argmax rule
//     (strict `>`, so the smallest index among ties wins, exactly as before), same `sags[]` array, same
//     percentile sort, same tail ordering. There is nothing left for a scheduler to influence.
//     THE TIE-BREAK IS THEREFORE NOT "ADDED" — IT IS THE ORIGINAL ONE, PRESERVED BY NOT MOVING THE
//     REDUCTION OFF THE MAIN THREAD. Stated explicitly because the obvious "optimisation" is to have each
//     worker keep a local max and merge; that would reintroduce exactly the ordering question this design
//     does not have.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE THING THE PARENT STILL RECOMPUTES, AND WHY IT IS FREE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// `sagOfN` records the argmax SAMPLE (the ten `argWa..argDC` forensics) as a side effect, and the serial
// audit captures them for the fixed-ruler winner. A worker's copy of those is meaningless to the parent, so
// the driver simply re-runs `sagOfN(maxFixedT, oracleN)` on the ONE winning triangle after the reduction.
// The ruler is pure and the vertices have not moved, so the re-run reproduces the identical ten doubles the
// serial arm captured inline. It costs lat(PF_CB_ORACLE) = 91 rA evaluations at the default, which the
// driver EXCLUDES from the reported total (it snapshots and restores `rEvals`) and reports on its own line —
// so the pooled and serial arms print the same `M rA evals` and the recomputation is still visible.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// ACCEPTANCE TEST (this is the contract, not an aspiration)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// PF_CB_AUDIT_WORKERS=1 and PF_CB_AUDIT_WORKERS=8 on otherwise identical flags must produce:
//   * the SAME STL, byte for byte — trivially, because the audit never touches the mesh; and
//   * the SAME report file, byte for byte, except the wall-clock seconds and the `audit:` line itself.
//     That includes HEADLINE MAX, the adaptive MAX / p99 / p50, the over-tol count, MAX-locus, the fixed-N
//     MAX and its locus, TAIL MAX and TAIL-locus, min edge, and the `M rA evals` total.
// A measurement that depends on thread scheduling is not a measurement.
import { buildSync } from 'esbuild';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sweepRadiusLattice } from './_sweepRA';
import type { StyleDims } from './runStyle';
import type { AuditJob, AuditWorkerData, AuditWorkerMsg } from './_auditWorker';

// RE-EXPORTED so the driver can name a job WITHOUT importing _auditWorker itself. That module has a
// top-level body which reads `workerData`, and a value import of it in the parent would execute that body;
// re-exporting the TYPE here removes the chance of someone reaching for the wrong module.
export type { AuditJob, AuditJobKind } from './_auditWorker';

// DUPLICATED from _auditWorker.ts on purpose — the pool may only TYPE-import that module, because a value
// import would execute its top-level body (which reads `workerData`) in the parent. Exactly the same
// duplication, for exactly the same reason, as _sweepPool.ts's SW_CURSOR / SW_ABORT.
const AU_CURSOR = 0;
const AU_ABORT = 1;

/** doubles written per slot by a 'main' job: [0] = adaptive ruler, [1] = fixed-N ruler. */
export const AUDIT_MAIN_STRIDE = 2;
/** doubles written per slot by a 'tail' job. */
export const AUDIT_TAIL_STRIDE = 1;

/**
 * PF_CB_AUDIT_WORKERS. Default = PHYSICAL cores (`availableParallelism` reports LOGICAL, hence the halving),
 * capped at 10. **1 (or 0) selects the existing serial path and no worker is ever spawned** — deliberate, so
 * any regression is bisectable against a code path that did not change, and so the acceptance test above has
 * a control that is literally today's code.
 *
 * THE DEFAULT IS PHYSICAL, AND THE MEASUREMENT SAYS SMT WOULD BE FASTER. Recorded rather than smoothed over:
 * _facetTruthPool.ts measured, on this same 8-physical / 16-logical box and on the same shape of work
 * (branchy scalar libm with long dependent chains), W=1 279 s / W=4 87 s (3.21x) / W=8 53 s (5.26x) /
 * W=16 35 s (7.97x) — i.e. SMT bought a further 1.51x over the physical count, which contradicts the usual
 * "scalar libm does not scale past physical cores" argument. The default nevertheless stays at the physical
 * count for the same two reasons the sweep pool's does: it leaves the box usable while a multi-hour run is in
 * flight, and an oversubscribed box is the easiest way to end up measuring the Windows scheduler instead of
 * the pool. Set PF_CB_AUDIT_WORKERS=16 for a dedicated run and expect roughly another 1.5x.
 *
 * MEASUREMENT HAZARD, worth more than the numbers above: Windows EcoQoS throttles a detached node job to
 * ~47 % of one core (MEASURED: cpu-delta 9.39 s / 20 s wall, rising to 19.25 s / 20 s the instant
 * PriorityClass was set to AboveNormal). Pin the whole process tree to AboveNormal on BOTH arms, or the A/B
 * measures the scheduler.
 */
export function resolveAuditWorkers(): number {
  const raw = process.env.PF_CB_AUDIT_WORKERS;
  if (raw !== undefined && raw !== '') {
    const v = Number.parseInt(raw, 10);
    if (Number.isFinite(v) && v >= 0) return Math.max(1, v);
  }
  const logical = availableParallelism();
  return Math.max(1, Math.min(10, Math.floor(logical / 2)));
}

export interface AuditMeshMirror {
  vthSab: SharedArrayBuffer;
  vzSab: SharedArrayBuffer;
  vxSab: SharedArrayBuffer;
  vySab: SharedArrayBuffer;
  nVerts: number;
  bytes: number;
}

/**
 * Copy the driver's four vertex coordinate arrays into SharedArrayBuffers, ONCE.
 *
 * Four separate buffers and not one interleaved block, so a worker's view is a plain Float64Array with the
 * SAME indexing the driver's `number[]` has — which is what lets `_sagKernel` bind either without a second
 * code path or a de-interleaving copy.
 */
export function mirrorAuditMesh(
  vth: readonly number[], vz: readonly number[], vx: readonly number[], vy: readonly number[],
): AuditMeshMirror {
  const n = vth.length;
  if (vz.length !== n || vx.length !== n || vy.length !== n) {
    throw new Error(`audit pool: vertex arrays disagree in length (th ${n}, z ${vz.length}, x ${vx.length}, y ${vy.length}).`);
  }
  const mk = (src: readonly number[]): SharedArrayBuffer => {
    const sab = new SharedArrayBuffer(n * 8);
    const view = new Float64Array(sab);
    for (let i = 0; i < n; i += 1) view[i] = src[i];
    return sab;
  };
  return { vthSab: mk(vth), vzSab: mk(vz), vxSab: mk(vx), vySab: mk(vy), nVerts: n, bytes: 4 * n * 8 };
}

export interface AuditTriList {
  taSab: SharedArrayBuffer;
  tbSab: SharedArrayBuffer;
  tcSab: SharedArrayBuffer;
  count: number;
  bytes: number;
}

/**
 * Pack a list of triangle ids into three COMPACTED corner-index arrays: slot i of the job is triangle
 * `ids[i]`, and a worker only ever sees the slot. Int32 is safe because vertex indices are bounded by the
 * driver's own `BIG = 1<<27` edge key packing, which already assumes < 2^27 vertices.
 */
export function packAuditTris(
  ids: ArrayLike<number>, ta: readonly number[], tb: readonly number[], tc: readonly number[],
): AuditTriList {
  const count = ids.length;
  const taSab = new SharedArrayBuffer(count * 4);
  const tbSab = new SharedArrayBuffer(count * 4);
  const tcSab = new SharedArrayBuffer(count * 4);
  const A = new Int32Array(taSab); const B = new Int32Array(tbSab); const C = new Int32Array(tcSab);
  for (let i = 0; i < count; i += 1) { const t = ids[i]; A[i] = ta[t]; B[i] = tb[t]; C[i] = tc[t]; }
  return { taSab, tbSab, tcSab, count, bytes: 3 * count * 4 };
}

export interface AuditPoolCfg {
  workers: number;
  /** ceiling on the atomic-cursor chunk (PF_CB_AUDIT_CHUNK) */
  chunkMax: number;
  workerHeapMb: number;
  style: string;
  styleParams: Record<string, number>;
  dims: StyleDims;
  H: number;
  /** detected C0 z-loci — the verification lattice brackets both sides of each */
  zJumps: readonly number[];
  /** detected C0 theta-loci — likewise */
  thJumps: readonly number[];
  /** THE DRIVER'S OWN rA (raw, UNCOUNTED). Every worker's rebuilt copy is diffed against this. */
  refRadius: (th: number, z: number) => number;
  mesh: AuditMeshMirror;
  tris: AuditTriList;
  job: AuditJob;
}

export interface AuditOutcome {
  /** THE RESULT BLOCK. stride 2 for a 'main' job, 1 for a 'tail' job. */
  out: Float64Array;
  /** rA evals spent inside the workers, lattice evals excluded — this is the number the driver folds into its own */
  rEvals: number;
  /** rA evals spent on the identity lattice, across all workers. A COST number, reported separately. */
  latEvals: number;
  /** worst |worker R - parent rA| over the verification lattice, in mm. Must be 0. */
  latMaxDev: number;
  /** lattice points where any worker's R was not bit-identical to the parent's. Must be 0. */
  latDiffCount: number;
  /** total (worker x lattice point) comparisons actually made — the non-vacuity witness for the check above */
  latPoints: number;
  workers: number;
  chunk: number;
  bundleMs: number;
  wallMs: number;
}

let bundledEntry: string | null = null;

/** Pre-bundle the worker entry with esbuild into a scratch .mjs. Once per process. */
function workerBundle(): string {
  if (bundledEntry !== null && existsSync(bundledEntry)) return bundledEntry;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '_auditWorker.ts'), resolve('research', 'bridge', '_auditWorker.ts')];
  const entry = candidates.find((p) => existsSync(p));
  if (entry === undefined) throw new Error(`audit worker entry not found; looked in ${candidates.join(' , ')}`);
  const out = join(mkdtempSync(join(tmpdir(), 'pf-auditworker-')), 'auditworker.mjs');
  buildSync({
    entryPoints: [entry], outfile: out,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  bundledEntry = out;
  return out;
}

/**
 * Score one job across `cfg.workers` threads sharing one atomic cursor. Spawn-and-die per job, exactly as
 * `runH1Pool` does — two jobs per run (main, tail) means the spawn + lattice cost is paid twice, which is
 * ~1-2 s against a phase measured in hundreds of seconds, and it buys a protocol with no generation barrier
 * to get wrong.
 *
 * THROWS on any of: a worker error, a worker exit before reporting, a rebuilt surface that is not
 * bit-identical, fewer lattice reports than workers, a slot total that does not match the job, or a NaN left
 * in the result block. It never degrades to serial silently — a pool that quietly fell back would report a
 * speedup it did not have, and a pool whose surface differed would produce a fully formatted, entirely
 * meaningless audit.
 */
export async function runAuditPool(cfg: AuditPoolCfg): Promise<AuditOutcome> {
  const t0 = Date.now();
  const tB = Date.now();
  const entry = workerBundle();
  const bundleMs = Date.now() - tB;

  const stride = cfg.job.kind === 'main' ? AUDIT_MAIN_STRIDE : AUDIT_TAIL_STRIDE;
  const outSab = new SharedArrayBuffer(cfg.job.count * stride * 8);
  const out = new Float64Array(outSab);
  // NaN IS THE "NO WORKER REACHED THIS SLOT" SENTINEL. A Float64Array over a fresh SAB is zero-filled, and
  // 0 is a perfectly legal sag (a flat facet that fits exactly), so a zero could never be distinguished from
  // a dropped chunk. This repo has already measured a silent-zeros failure once (a failed WebGPU dispatch
  // leaves zeros). The post-run scan below refuses on ANY NaN, which also catches a genuine NaN escaping
  // from rA — that conflation is deliberate and errs towards refusing.
  out.fill(Number.NaN);

  const ctrlSab = new SharedArrayBuffer(2 * 4);
  const ctrl = new Int32Array(ctrlSab);
  Atomics.store(ctrl, AU_CURSOR, 0);
  Atomics.store(ctrl, AU_ABORT, 0);

  // CHUNK — atomic cursor, sized so the tail is amortised. Aim for >= 64 chunks per worker, never below 1,
  // never above PF_CB_AUDIT_CHUNK. Per-facet cost spans >= 23x from the `sagAdaptive` level clamp alone
  // (lat(12)=91 vs lat(64)=2145 rA evals) and the two populations are spatially clustered, so a coarse chunk
  // hands one worker the expensive band.
  const chunk = Math.max(1, Math.min(cfg.chunkMax, Math.floor(cfg.job.count / (64 * Math.max(1, cfg.workers)))));

  const { th: latTh, z: latZ } = sweepRadiusLattice(cfg.H, cfg.zJumps, cfg.thJumps);
  const expect = new Float64Array(latTh.length);
  for (let i = 0; i < latTh.length; i += 1) expect[i] = cfg.refRadius(latTh[i], latZ[i]);

  let latChecked = 0; let latDiff = 0; let latMax = 0; let latEvals = 0;
  const verifyLattice = (lat: Float64Array): void => {
    latChecked += 1;
    for (let i = 0; i < expect.length; i += 1) {
      // Object.is so a NaN/NaN pair counts as identical and a +0/-0 pair does not.
      if (!Object.is(expect[i], lat[i])) {
        latDiff += 1;
        const dv = Math.abs(expect[i] - lat[i]);
        if (!(dv <= latMax)) latMax = dv;
      }
    }
    // A mismatched surface aborts the pool in the first second instead of at the end of the audit.
    if (latDiff > 0) Atomics.store(ctrl, AU_ABORT, 1);
  };

  let slotsWritten = 0; let rEvals = 0;
  const spawn = (): Promise<void> => new Promise<void>((res, rej) => {
    const data: AuditWorkerData = {
      style: cfg.style, styleParams: cfg.styleParams, dims: cfg.dims,
      job: cfg.job, chunk,
      vthSab: cfg.mesh.vthSab, vzSab: cfg.mesh.vzSab, vxSab: cfg.mesh.vxSab, vySab: cfg.mesh.vySab,
      taSab: cfg.tris.taSab, tbSab: cfg.tris.tbSab, tcSab: cfg.tris.tcSab,
      outSab, ctrlSab, latTh, latZ,
    };
    const w = new Worker(entry, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: cfg.workerHeapMb } });
    let settled = false;
    const finish = (fn: () => void): void => { if (settled) return; settled = true; fn(); void w.terminate(); };
    w.on('message', (m: AuditWorkerMsg) => {
      if (m.kind === 'lattice') { verifyLattice(m.lat); latEvals += m.latEvals; return; }
      if (m.kind === 'failed') { Atomics.store(ctrl, AU_ABORT, 1); finish(() => rej(new Error(`audit worker failed: ${m.message}`))); return; }
      slotsWritten += m.slots; rEvals += m.rEvals;
      finish(res);
    });
    w.on('error', (e) => { Atomics.store(ctrl, AU_ABORT, 1); finish(() => rej(e)); });
    w.on('exit', (code) => { Atomics.store(ctrl, AU_ABORT, 1); finish(() => rej(new Error(`audit worker exited ${code} before reporting`))); });
  });

  const settled = await Promise.allSettled(Array.from({ length: cfg.workers }, spawn));
  const failed = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');

  // ORDER OF THE REFUSALS MATTERS: report the SURFACE mismatch first, because it explains every other
  // symptom and is the one that would otherwise produce a plausible number.
  if (latDiff > 0) {
    throw new Error(
      `audit pool: a worker's rebuilt R is NOT bit-identical to the driver's — ${latDiff} of `
      + `${expect.length * Math.max(1, latChecked)} lattice points differ, worst ${(latMax * 1000).toFixed(6)} um. `
      + `Every pooled facet score would be measured against a different surface. Refusing to report.`);
  }
  if (failed.length > 0) throw new Error(`audit pool: ${failed.length}/${cfg.workers} workers failed — ${String(failed[0].reason)}`);
  if (latChecked !== cfg.workers) {
    throw new Error(`audit pool: only ${latChecked}/${cfg.workers} workers reported an R verification lattice — refusing to report unverified work.`);
  }
  if (slotsWritten !== cfg.job.count) {
    throw new Error(`audit pool: workers wrote ${slotsWritten} slots but the job has ${cfg.job.count}. A dropped or double-claimed chunk makes every reduction below it meaningless.`);
  }
  // The slot total above is an O(1) check on the CLAIM protocol; this is the O(n) check on the BYTES. Both,
  // because they fail differently: a mis-sized buffer passes the first and fails the second.
  for (let i = 0; i < cfg.job.count * stride; i += 1) {
    if (Number.isNaN(out[i])) {
      throw new Error(`audit pool: result slot ${Math.floor(i / stride)} (component ${i % stride}) is NaN after ${slotsWritten} reported writes — an unwritten slot, or rA returned NaN. Refusing to report.`);
    }
  }

  return {
    out, rEvals, latEvals, latMaxDev: latMax, latDiffCount: latDiff, latPoints: expect.length * latChecked,
    workers: cfg.workers, chunk, bundleMs, wallMs: Date.now() - t0,
  };
}
