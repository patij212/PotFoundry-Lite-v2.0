// _h2PhaseA.ts — H2 PHASE A, extracted so the SERIAL path and every WORKER THREAD run the SAME code.
// RESEARCH ONLY.
//
// Phase A is the uniform coverage sweep of `surfaceToMeshMax`: every one of the U*V super-cells is scanned at
// `coveragePitch` and structure-probed exactly once, in a fixed order, with NO dependence between cells. It is
// embarrassingly parallel by cell block and it is 60-90% of an H2 audit. Phases B (worst-first heap
// refinement) and C (the wall sweep) are order-dependent / small and stay serial.
//
// PARALLELISING AN AUDITOR IS ONLY ALLOWED IF IT CANNOT MOVE A REPORTED NUMBER. Three properties buy that,
// and all three live HERE rather than in the caller — the same discipline as _facetTruthH1.ts:
//
//  (1) ONE LOOP BODY. `runH2PhaseA` is the only place a cell is scanned, probed and folded into an
//      accumulator. Serial and pooled differ ONLY in how they claim cell ranges. `h2Scan` / `h2Structure`
//      are called with an identical argument list either way — and phases B and C in `surfaceToMeshMax`
//      call the very same two functions, so there is no second copy of the cell kernel to drift.
//
//  (2) ORDER-INDEPENDENT REDUCTION WITH AN EXPLICIT TIE-BREAK. Everything phase A produces is a sum, a min,
//      a max, or a per-cell key written to its own slot:
//        queries / rEvalsStruct / overCount / overZHist  — sums
//        finestStruct                                    — min
//        keys[cell]                                      — written once, by index, so the phase-B heap is
//                                                          seeded in cell order however the work was split
//        max + its argument (th, z, r)                   — max by (value desc, CELL INDEX asc)
//      The cell-index tie-break is not decoration. These meshes read exactly 0.0 over large flat regions and
//      the serial walk resolves a tie by "whichever cell came first", i.e. lowest index. Without the
//      tie-break the reported witness LOCUS would depend on thread scheduling.
//
//  (3) A WORKER'S CELLS ARE ALWAYS IN INCREASING INDEX ORDER. Chunks are claimed from one atomic cursor with
//      Atomics.add, which is monotone, so each worker sees a strictly increasing subsequence of the walk.
//      Its running "first cell attaining my local max" is therefore the LOWEST-index such cell among its
//      own, and picking the lowest index among the per-worker winners gives exactly the serial answer.
//      This is why `mergeH2A` can be a simple pairwise reduction and still be exact.
//
// WHAT IS DELIBERATELY *NOT* HERE: the phase-A `rA` calls that `h2Scan` makes to re-derive `mR` at a new
// argmax are not counted by anything this file returns (the serial code never counted them either — only
// `rEvalsStruct` is reported). A caller that wraps rA in its own eval counter will therefore see a DIFFERENT
// total between serial and pooled, because the workers hold their own counters. That is a reporting
// artifact of the counter, not a difference in the measurement; every quantity in `H2APartial` is exact.
export type H2RadiusFn = (theta: number, z: number) => number;
export type H2DistFn = (x: number, y: number, z: number) => number;

const TAU = 2 * Math.PI;

/** Everything the cell kernel needs that is not `rA` or `distToMesh`. Plain JSON — thread-portable. */
export interface H2Geom {
  /** phase-A super-cell counts (theta, z). The full domain is swept, so U*V cells exactly. */
  U: number; V: number;
  /** audited z band */
  zLo: number; zHi: number;
  /** nominal radius used to convert an arc pitch into a theta pitch */
  rNom: number;
  /** phase-A query lattice spacing, mm of arc and of z */
  pitch0: number;
  tol: number;
  /** side of the cell-centred structure lattice */
  structM: number;
  /** number of z-histogram bins */
  NZB: number;
}

/** One walker's phase-A result. Every field is reduced commutatively by `mergeH2A`. */
export interface H2APartial {
  max: number;
  /** phase-A cell index of `max`, or -1 if this walker never improved on 0. THE TIE-BREAK KEY. */
  argCell: number;
  mTh: number; mZ: number; mR: number;
  queries: number; rEvalsStruct: number; overCount: number;
  overZHist: number[];
  finestStruct: number;
}

/**
 * The running accumulator shared by all three phases of `surfaceToMeshMax`. Phase A hands one of these to
 * every walker; phases B and C fold into the parent's.
 */
export class H2Acc {
  queries = 0; rEvalsStruct = 0; overCount = 0;
  readonly overZHist: number[];
  finestStruct = Infinity;
  max = 0; mTh = 0; mZ = 0; mR = 0; mOnWall = false;
  constructor(NZB: number) { this.overZHist = new Array<number>(NZB).fill(0); }
}

/**
 * ONE query: evaluate the true surface at (th,z), measure that point to the mesh, and book the exceedance.
 * Exactly the `D` closure the serial routine has always used.
 */
export function h2Query(acc: H2Acc, rA: H2RadiusFn, distToMesh: H2DistFn, g: H2Geom, th: number, z: number): number {
  const r = rA(th, z);
  acc.queries += 1;
  const d = distToMesh(r * Math.cos(th), r * Math.sin(th), z);
  if (d > g.tol) {
    acc.overCount += 1;
    const b = Math.min(g.NZB - 1, Math.max(0, Math.floor(((z - g.zLo) / Math.max(1e-9, g.zHi - g.zLo)) * g.NZB)));
    acc.overZHist[b] += 1;
  }
  return d;
}

/**
 * Cheap rA-only structure probe: the largest departure of the true radius from the cell's bilinear corner
 * interpolant, on a cell-centred structM x structM lattice. This is what betrays a ridge, groove or facet
 * edge living strictly between query samples. See the long note at the call site in _facetTruthLib.ts for
 * why it is an AREA lattice rather than a cross.
 */
export function h2Structure(acc: H2Acc, rA: H2RadiusFn, g: H2Geom, th0: number, th1: number, z0: number, z1: number): number {
  acc.finestStruct = Math.min(acc.finestStruct, Math.max(((th1 - th0) * g.rNom) / g.structM, (z1 - z0) / g.structM));
  const r00 = rA(th0, z0); const r10 = rA(th1, z0); const r01 = rA(th0, z1); const r11 = rA(th1, z1);
  const lin = (a: number, b: number): number => (1 - a) * (1 - b) * r00 + a * (1 - b) * r10 + (1 - a) * b * r01 + a * b * r11;
  let worst = 0;
  for (let i = 0; i < g.structM; i += 1) {
    const a = (i + 0.5) / g.structM;
    const th = th0 + (th1 - th0) * a;
    for (let j = 0; j < g.structM; j += 1) {
      const b = (j + 0.5) / g.structM;
      acc.rEvalsStruct += 1;
      const d = Math.abs(rA(th, z0 + (z1 - z0) * b) - lin(a, b));
      if (d > worst) worst = d;
    }
  }
  return worst;
}

/**
 * Sweep one cell on a uniform lattice at `pitch`; returns its max and where, and folds a new global maximum
 * into `acc`. `improved` is the phase-A argmax signal — see property (2) at the top of this file.
 */
export function h2Scan(
  acc: H2Acc, rA: H2RadiusFn, distToMesh: H2DistFn, g: H2Geom,
  th0: number, th1: number, z0: number, z1: number, pitch: number,
): { m: number; th: number; z: number; improved: boolean } {
  const nu = Math.max(1, Math.ceil(((th1 - th0) * g.rNom) / pitch));
  const nv = Math.max(1, Math.ceil((z1 - z0) / pitch));
  let m = 0; let cTh = th0; let cZ = z0;
  for (let i = 0; i <= nu; i += 1) {
    const th = th0 + ((th1 - th0) * i) / nu;
    for (let j = 0; j <= nv; j += 1) {
      const z = z0 + ((z1 - z0) * j) / nv;
      const d = h2Query(acc, rA, distToMesh, g, th, z);
      if (d > m) { m = d; cTh = th; cZ = z; }
    }
  }
  let improved = false;
  if (m > acc.max) { acc.max = m; acc.mTh = cTh; acc.mZ = cZ; acc.mR = rA(cTh, cZ); acc.mOnWall = false; improved = true; }
  return { m, th: cTh, z: cZ, improved };
}

/** The (th,z) bounds of phase-A cell `k`. ONE definition, so the walker and the heap-seeder cannot drift. */
export function h2CellBounds(g: H2Geom, k: number): { a0: number; a1: number; b0: number; b1: number } {
  const i = Math.floor(k / g.V); const j = k - i * g.V;
  return {
    a0: (TAU * i) / g.U,
    a1: (TAU * (i + 1)) / g.U,
    b0: g.zLo + ((g.zHi - g.zLo) * j) / g.V,
    b1: g.zLo + ((g.zHi - g.zLo) * (j + 1)) / g.V,
  };
}

/** Claim the next half-open cell range, or null when the sweep is exhausted or stopped. */
export type H2CellClaim = () => readonly [number, number] | null;

/**
 * Walk the phase-A cells under `claim`, scanning and structure-probing each one and writing its heap key.
 * Serial passes a claim that yields [0, U*V) once; a pooled worker passes a claim backed by an atomic cursor.
 *
 * `keys` MUST be length U*V and is written BY CELL INDEX, never appended — that is what makes the phase-B
 * heap seeding order-independent, and the heap's internal layout (hence its behaviour on equal keys) is what
 * would otherwise diverge between a serial and a pooled run.
 */
export function runH2PhaseA(
  rA: H2RadiusFn, distToMesh: H2DistFn, g: H2Geom, keys: Float64Array,
  claim: H2CellClaim,
  onCell?: (cell: number, acc: H2Acc) => void,
): H2APartial {
  const acc = new H2Acc(g.NZB);
  let argCell = -1;
  for (;;) {
    const c = claim();
    if (c === null) break;
    for (let k = c[0]; k < c[1]; k += 1) {
      const { a0, a1, b0, b1 } = h2CellBounds(g, k);
      const s = h2Scan(acc, rA, distToMesh, g, a0, a1, b0, b1, g.pitch0);
      if (s.improved) argCell = k;
      const bulge = h2Structure(acc, rA, g, a0, a1, b0, b1);
      keys[k] = s.m + bulge;
      onCell?.(k, acc);
    }
  }
  return {
    max: acc.max, argCell, mTh: acc.mTh, mZ: acc.mZ, mR: acc.mR,
    queries: acc.queries, rEvalsStruct: acc.rEvalsStruct, overCount: acc.overCount,
    overZHist: acc.overZHist.slice(), finestStruct: acc.finestStruct,
  };
}

/**
 * Reduce phase-A partials into one. Pure, commutative, and identical for 1 partial or W.
 *
 * THE ARGMAX RULE IS THE SERIAL RULE, RESTATED ORDER-INDEPENDENTLY. Serially the argmax is set by
 * `if (m > max)`, so it ends up on the FIRST cell (lowest index) attaining the final maximum, and it is
 * never set at all when the maximum is 0. Here: greatest `max` wins; among equal maxima the lowest
 * `argCell` wins; a partial that never improved on 0 carries argCell = -1 and cannot supply an argument.
 */
export function mergeH2A(parts: readonly H2APartial[], NZB: number): H2APartial {
  const out: H2APartial = {
    max: 0, argCell: -1, mTh: 0, mZ: 0, mR: 0,
    queries: 0, rEvalsStruct: 0, overCount: 0,
    overZHist: new Array<number>(NZB).fill(0), finestStruct: Infinity,
  };
  for (const p of parts) {
    out.queries += p.queries; out.rEvalsStruct += p.rEvalsStruct; out.overCount += p.overCount;
    for (let b = 0; b < NZB; b += 1) out.overZHist[b] += p.overZHist[b];
    if (p.finestStruct < out.finestStruct) out.finestStruct = p.finestStruct;
    if (p.argCell < 0) continue;
    if (out.argCell < 0 || p.max > out.max || (p.max === out.max && p.argCell < out.argCell)) {
      out.max = p.max; out.argCell = p.argCell; out.mTh = p.mTh; out.mZ = p.mZ; out.mR = p.mR;
    }
  }
  return out;
}

// ── SHARED-MEMORY WIRE FORMAT ───────────────────────────────────────────────────────────────────────────
// A worker cannot postMessage its partial back while the parent is blocked in Atomics.wait, so partials
// travel through a Float64Array slice. Reader and writer live HERE, next to the struct they encode, so a
// field added to H2APartial cannot be silently dropped by one side of the wire.

/** Float64 slots one partial occupies. */
export function h2PartialSlots(NZB: number): number { return 9 + NZB; }

export function writeH2Partial(dst: Float64Array, off: number, p: H2APartial, NZB: number): void {
  dst[off] = p.max; dst[off + 1] = p.argCell; dst[off + 2] = p.mTh; dst[off + 3] = p.mZ; dst[off + 4] = p.mR;
  dst[off + 5] = p.queries; dst[off + 6] = p.rEvalsStruct; dst[off + 7] = p.overCount; dst[off + 8] = p.finestStruct;
  for (let b = 0; b < NZB; b += 1) dst[off + 9 + b] = p.overZHist[b];
}

export function readH2Partial(src: Float64Array, off: number, NZB: number): H2APartial {
  const overZHist = new Array<number>(NZB);
  for (let b = 0; b < NZB; b += 1) overZHist[b] = src[off + 9 + b];
  return {
    max: src[off], argCell: src[off + 1], mTh: src[off + 2], mZ: src[off + 3], mR: src[off + 4],
    queries: src[off + 5], rEvalsStruct: src[off + 6], overCount: src[off + 7], finestStruct: src[off + 8],
    overZHist,
  };
}

/**
 * The verification probe set: (theta, z) points at which every worker's REBUILT `distToMesh` is diffed
 * against the parent's before a single pooled number is believed.
 *
 * It is not a uniform grid, for the same reason `radiusLattice` is not: a uniform grid on a style whose
 * relief is periodic in theta lands on the same phase in every column. Counts are prime, z walks on a
 * golden-ratio offset per column, and the set deliberately includes points OFF the graph (pushed in and out
 * radially) because the locator is a spatial hash whose bucket ring-expansion is exercised by exactly those.
 */
export function h2ProbeLattice(H: number): { th: Float64Array; z: Float64Array; push: Float64Array } {
  const th: number[] = []; const z: number[] = []; const push: number[] = [];
  const NT = 97; const NZ = 41;                    // both prime; 97*41 = 3977 stations
  const PHI = 0.6180339887498949;
  for (let i = 0; i < NT; i += 1) {
    const a = (TAU * i) / NT;
    for (let j = 0; j < NZ; j += 1) {
      const f = (j / NZ + PHI * i) % 1;
      // one station on the graph, one pushed 0.2 mm outward, one 0.5 mm inward — the ring expansion of the
      // locator is what a rebuilt CSR could get wrong, and only an off-surface point exercises it
      for (const p of [0, 0.2, -0.5]) { th.push(a); z.push(H * f); push.push(p); }
    }
  }
  return { th: Float64Array.from(th), z: Float64Array.from(z), push: Float64Array.from(push) };
}

/**
 * The phase-A entry point `surfaceToMeshMax` calls when `opts.phaseA` is supplied. Returns the merged
 * partial and fills `keys` (length U*V) with the per-cell heap keys, in cell-index order.
 *
 * It is declared HERE and not in _h2Pool.ts so that _facetTruthLib can accept a runner without importing the
 * pool — the pool pulls in esbuild and node:worker_threads, and the ruler must stay loadable in any
 * environment the validation suite runs in.
 */
export type H2PhaseARunner = (
  g: H2Geom, keys: Float64Array,
  onProgress?: (fracDone: number, queries: number, max: number) => void,
) => H2APartial;

/**
 * Slot layout of the pool's shared Int32 control block. It lives HERE, in the module BOTH the pool and the
 * worker already import, rather than in either of them: the worker cannot import the pool (that would drag
 * esbuild into its bundle) and the pool must not import the worker (its top level would execute in the
 * parent), so a shared neutral home is the only place the two cannot drift.
 */
export const H2CTRL = {
  /** next unclaimed phase-A cell index */ CURSOR: 0,
  /** non-zero once the run is being aborted */ STOP: 1,
  /** workers that have published their verification block */ READY: 2,
  /** parent's go-ahead, set only after every worker verified */ GO: 3,
  /** workers that have published their partial */ DONE: 4,
  /** non-zero if any worker failed */ ERR: 5,
  /** bytes of UTF-8 error text in the error buffer */ ERRLEN: 6,
  /** cells completed so far — PROGRESS ONLY */ CELLS: 7,
  /**
   * running max in NANOMETRES, CAS-maxed by the workers — PROGRESS ONLY.
   *
   * Nothing in `H2APartial` is derived from this and nothing reported ever reads it. It exists so a
   * multi-hundred-second pooled sweep prints a truthful live line instead of a zero, and it is deliberately
   * a lossy integer so that it can never be mistaken for the measurement: the reported max comes from
   * `mergeH2A` over the per-worker partials, in full double precision, after the sweep has joined.
   */
  MAXNM: 8,
  /** total Int32 slots */ N: 9,
} as const;

/** Evaluate the probe lattice against one (rA, distToMesh) pair. ONE definition, run by parent and worker. */
export function h2ProbeEval(
  rA: H2RadiusFn, distToMesh: H2DistFn, lat: { th: Float64Array; z: Float64Array; push: Float64Array },
  out: Float64Array,
): void {
  for (let i = 0; i < lat.th.length; i += 1) {
    const t = lat.th[i]; const zz = lat.z[i];
    const r = rA(t, zz) + lat.push[i];
    out[2 * i] = r;
    out[2 * i + 1] = distToMesh(r * Math.cos(t), r * Math.sin(t), zz);
  }
}
