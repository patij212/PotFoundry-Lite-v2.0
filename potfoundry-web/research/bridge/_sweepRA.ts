// _sweepRA.ts — the ONE definition of the sweep driver's analytic surface, plus its verification lattice.
// RESEARCH ONLY.
//
// Same argument as _facetTruthRA.ts, for a different consumer. `rA` is a closure and cannot be transferred to
// a worker thread: each worker rebuilds it from (style, params, dims), which are plain JSON. If the parent and
// the worker each carried their own wrapper, a one-character divergence would silently produce two different
// surfaces, the pooled mesher would refine against a surface the serial mesher never used, and the report
// would say nothing. So there is one builder, imported by both sides — and it is still CHECKED at runtime,
// because "by construction" is an argument and this campaign runs on measurements.
//
// ONE DIFFERENCE FROM _facetTruthRA, AND IT IS DELIBERATE. The auditor's wrapper canonicalises theta and
// CLAMPS z into [0,H]. The conforming-bisection driver's `R` does NEITHER — it is a bare counting wrapper,
// and canonicalisation is applied at each call site (see the two different thetas in _sweepPredicate's
// `edgeSagRaw`). Wrapping it here would change the surface the driver has always refined against. This file
// therefore reproduces the DRIVER's convention exactly, not the auditor's.
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';
import type { SweepRadiusFn } from './_sweepPredicate';

const TWO_PI = 2 * Math.PI;

export interface SweepRadius {
  /** the driver's surface: RAW theta, RAW z, every call counted */
  R: SweepRadiusFn;
  /** R calls made so far */
  evals: () => number;
}

/** The driver's `R`, rebuilt. Verbatim: `const R = (th, z) => { rEvals += 1; return rA(th, z); }`. */
export function buildSweepRadiusFn(style: string, styleParams: Record<string, number>, dims: StyleDims): SweepRadius {
  const rA = buildRadiusFn(style as StyleId, styleParams, dims);
  let n = 0;
  const R: SweepRadiusFn = (th: number, z: number): number => { n += 1; return rA(th, z); };
  return { R, evals: () => n };
}

/**
 * THETA-LOCUS PROBE — a cheap, deterministic, shape-agnostic finder for the theta values where r(.,z) has a
 * gradient discontinuity, so the lattice below can BRACKET them.
 *
 * It exists because a lattice that only samples "somewhere" can agree to the last bit while the two copies of
 * rA disagree on WHICH SIDE OF A CLIFF a sample lands. The places where a one-ULP difference actually changes
 * a result are the C0 loci; a check that never goes near one is a check that cannot fail.
 *
 * Deterministic by construction: fixed scan count, fixed z probes, fixed top-K, no randomness, no env input.
 */
export function thetaJumpProbe(R: SweepRadiusFn, H: number, topK = 8): number[] {
  const N = 2048;
  const out: number[] = [];
  for (const frac of [0.37, 0.71]) {
    const z = H * frac;
    const rs = new Float64Array(N + 1);
    for (let k = 0; k <= N; k += 1) rs[k] = R((TWO_PI * k) / N, z);
    const cand: Array<[number, number]> = [];
    for (let k = 1; k < N; k += 1) cand.push([Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]), k]);
    // value desc, then index asc — a TOTAL order, so ties never depend on sort stability
    cand.sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
    for (let i = 0; i < Math.min(topK, cand.length); i += 1) {
      if (cand[i][0] <= 0) break;
      out.push((TWO_PI * cand[i][1]) / N);
    }
  }
  return out;
}

/**
 * The fixed (theta,z) lattice the parent and every worker evaluate R over, so the parent can prove the rebuilt
 * surface is BIT-identical to its own before it lets a single edge verdict into the mesher.
 *
 * Not a uniform grid, for the reason _facetTruthRA gives: a uniform grid on a style whose relief is periodic in
 * theta lands on the same phase in every column and can agree everywhere while disagreeing BETWEEN columns.
 * Counts are prime, z walks on an irrational offset per column, and there are tight brackets around every
 * detected C0 locus in both variables — plus out-of-domain probes, because this driver's R does NOT clamp and
 * that un-clamped behaviour is part of the surface definition it has always used.
 */
export function sweepRadiusLattice(H: number, zJumps: readonly number[], thJumps: readonly number[]): { th: Float64Array; z: Float64Array } {
  const th: number[] = []; const z: number[] = [];
  const NT = 181; const NZ = 91;                 // both prime; 181*91 = 16,471 points
  const PHI = 0.6180339887498949;
  for (let i = 0; i < NT; i += 1) {
    const a = (TWO_PI * i) / NT;
    for (let j = 0; j < NZ; j += 1) {
      const f = (j / NZ + PHI * i) % 1;
      th.push(a); z.push(H * f);
    }
  }
  for (const eps of [1e-9, 1e-7, 1e-5, 1e-3]) {
    for (const zj of zJumps) for (const s of [-1, 1]) for (let i = 0; i < 8; i += 1) { th.push((TWO_PI * i) / 8); z.push(zj + s * eps); }
    for (const tj of thJumps) for (const s of [-1, 1]) for (let j = 0; j <= 8; j += 1) { th.push(tj + s * eps); z.push((H * j) / 8); }
  }
  // out-of-domain probes: this driver's R applies NO canonicalisation and NO clamp, so a divergence in how the
  // rebuilt style function handles theta outside [0,2pi) or z outside [0,H] is a real divergence and must be seen.
  for (const t of [-7.3, -1e-12, 0, TWO_PI, TWO_PI + 1e-12, 19.7]) for (const v of [-3, -1e-12, 0, H / 3, H, H + 1e-12, H + 3]) { th.push(t); z.push(v); }
  return { th: Float64Array.from(th), z: Float64Array.from(z) };
}
