// _sagKernel.ts — THE ONE DEFINITION of the conforming-bisection driver's barycentric sag ruler.
// RESEARCH ONLY. New 2026-07-29, for the parallel post-loop audit (_auditPool.ts).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS — and it is the same reason _sweepPredicate.ts and _facetTruthH1.ts exist.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// The driver's post-loop audit scores EVERY live triangle with `sagAdaptive` + `sagOfN`, then re-scores an
// adversarial tail at a denser oracle. Both are pure functions of (the three vertex coordinates, rA) and are
// independent per triangle, so the work parallelises exactly. But a worker thread cannot receive a closure:
// it has to rebuild rA from (style, params, dims) and re-run the SAME arithmetic. If the driver kept its
// inline copy of `sagOfN` and a worker carried a second one, a one-character divergence would silently make
// the pooled audit score a mesh against a different ruler, the report would be fully formatted and wrong,
// and NOTHING in it would say so. This repo has already paid for exactly that failure mode once (the Voronoi
// hash desync: a partial int-hash swap left 2 of 4 copies stale).
//
// It matters more here than anywhere else, because `sagOfN` is not only the audit ruler — `sagAdaptive` is
// also the DEFAULT heap key (PF_CB_RANK=plane) and the accept test. The lab's standing lesson is that THE
// REFINEMENT RULER MUST EQUAL THE AUDIT RULER; two copies would break that identity silently.
//
// NOTHING HERE IS NEW MATHS. Every line below is a VERBATIM transcription of the body that was inline in
// _strataConformBisect.test.ts as of 2026-07-29 (lines 464-500), with the closed-over mesh arrays turned
// into one view object and the closed-over `argWa..argDC` forensics turned into one record. The driver now
// calls these through two one-line wrappers, so `PF_CB_DRIVER=heap` — the control for every comparison in
// this campaign — must produce a BYTE-IDENTICAL STL across this extraction. That is the FIRST acceptance
// test in the change-list; it is verified, not assumed.
//
// TWO THINGS THAT ARE DELIBERATELY NOT HERE:
//   * `sagBoundedAtN` / `sagPtPerp` (PF_CB_RANK=bounded|ptperp). They are refinement-only, they are not on
//     the audit path, and extracting them would put a second hot path at risk for no parallel gain.
//   * `eLen`. The driver keeps its own (it is used in ~20 places); `sagAdaptiveRaw` carries a private copy
//     of the same one-line expression, in the same operand order. That duplication is named in RISKS.md.
import { canonTheta, dThRaw, type SweepRadiusFn } from './_sweepPredicate';

/**
 * The mesh as the ruler reads it: three corner-index arrays and four per-vertex coordinate arrays.
 *
 * `ArrayLike<number>` and not `number[]` on purpose — the DRIVER binds its growing `number[]` arrays, and a
 * WORKER binds Int32Array / Float64Array views over SharedArrayBuffers. Both index identically, so one body
 * serves both with no copy and no de-interleaving step.
 *
 * NOTE ON `t`: it is an index into ta/tb/tc, nothing more. The driver passes its own triangle id; a worker
 * passes a SLOT index into a compacted live-triangle list. Both are correct uses of the same pure function.
 */
export interface SagMesh {
  ta: ArrayLike<number>;
  tb: ArrayLike<number>;
  tc: ArrayLike<number>;
  vth: ArrayLike<number>;
  vz: ArrayLike<number>;
  vx: ArrayLike<number>;
  vy: ArrayLike<number>;
}

/**
 * RULER FORENSICS. Exactly the ten `argWa..argDC` closure variables the driver used to keep, moved into a
 * record so the same body can write into the driver's single instance or into a worker's scratch instance.
 * Written only when the running max improves, so the cost is negligible — unchanged from the inline version.
 */
export interface SagArgmax {
  wa: number; wb: number; wc: number;
  theta: number; z: number; r: number;
  nl: number; dd: number;
  dB: number; dC: number;
}

export function makeSagArgmax(): SagArgmax {
  return { wa: 0, wb: 0, wc: 0, theta: 0, z: 0, r: 0, nl: 0, dd: 0, dB: 0, dC: 0 };
}

/**
 * Distance from analytic surface points to the triangle's INFINITE PLANE, maxed over a level-`n` barycentric
 * lattice. VERBATIM the driver's `sagOfN`.
 *
 * The blindness of this quantity is a MEASURED, documented property (a crest above a tent of near-coincident
 * infinite planes reads ~0 at any n) and it is NOT fixed here: this file exists to make the ruler shareable,
 * not to change it. Changing what it measures would invalidate every committed baseline at once.
 */
export function sagOfNRaw(
  R: SweepRadiusFn, M: SagMesh, t: number, n: number, arg: SagArgmax,
): number {
  const ta = M.ta; const tb = M.tb; const tc = M.tc;
  const vth = M.vth; const vz = M.vz; const vx = M.vx; const vy = M.vy;
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  const ax = vx[a]; const ay = vy[a]; const az = vz[a];
  let nx = (vy[b] - ay) * (vz[c] - az) - (vz[b] - az) * (vy[c] - ay);
  let ny = (vz[b] - az) * (vx[c] - ax) - (vx[b] - ax) * (vz[c] - az);
  let nz = (vx[b] - ax) * (vy[c] - ay) - (vy[b] - ay) * (vx[c] - ax);
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-18) return 0;
  nx /= nl; ny /= nl; nz /= nl;
  const th0 = vth[a]; const dB = dThRaw(vth[a], vth[b]); const dC = dThRaw(vth[a], vth[c]);
  let s = 0;
  for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
    const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
    const theta = th0 + wb * dB + wc * dC;
    const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
    const r = R(canonTheta(theta), z);
    const dd = Math.abs((r * Math.cos(theta) - ax) * nx + (r * Math.sin(theta) - ay) * ny + (z - az) * nz);
    if (dd > s) {
      s = dd;
      // RULER FORENSICS: record the argmax sample so a suspicious reading can be attributed to
      // interpolation/wrap (theta,z outside the footprint), the evaluator (r off the local surface), or a
      // degenerate plane normal (nl). Written only on improvement, so the cost is negligible.
      arg.wa = wa; arg.wb = wb; arg.wc = wc; arg.theta = theta; arg.z = z; arg.r = r; arg.nl = nl; arg.dd = dd;
      arg.dB = dB; arg.dC = dC;
    }
  }
  return s;
}

/**
 * RESOLUTION-BOUNDED oracle. VERBATIM the driver's `sagAdaptive`, including the operand ORDER of the three
 * `eLen` calls inside `Math.max` (that order is what fixes which double wins a tie, and therefore which
 * lattice level `n` a triangle is scored at).
 */
export function sagAdaptiveRaw(
  R: SweepRadiusFn, M: SagMesh, t: number, hSample: number, nMin: number, nMax: number, arg: SagArgmax,
): number {
  const a = M.ta[t]; const b = M.tb[t]; const c = M.tc[t];
  const vx = M.vx; const vy = M.vy; const vz = M.vz;
  // The driver's `eLen`, expanded three times rather than called through a per-call closure: at ~1.4 M
  // triangles a fresh closure per call is churn for nothing. Arithmetic, operand order and the argument
  // order inside Math.max are unchanged, so the selected level `n` is the same double it always was.
  const le = Math.max(
    Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]),
    Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]),
    Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]),
  );
  const n = Math.max(nMin, Math.min(nMax, Math.ceil(le / hSample)));
  return sagOfNRaw(R, M, t, n, arg);
}
