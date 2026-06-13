/**
 * verify_surface_fidelity.test.ts — ADVERSARIAL cross-check of the LINCHPIN
 * surface (SfbWallSampler) the 9 crest-mesher feasibility probes measure on.
 *
 * The feasibility verdict (min ~17deg, 0% sub-15deg, watertight) rests on
 * EVERY probe measuring 3D angles on the SAME surface the PRODUCTION mesh is
 * built on. This file quantifies, in MILLIMETRES, whether
 * `SfbWallSampler.position(u,t)` EQUALS:
 *
 *   (A) the EXACT production OUTER-wall surface formula the real mesh vertices
 *       get from the GPU `evaluate_vertices` kernel (adaptive_mesh.wgsl):
 *         theta = u_wrapped*TAU
 *         r     = r_base(t) * (0.9 + 0.35*sf_radius_rf)   [strength=1]
 *         th    = compute_twist(theta, t)                 [global spin]
 *         z     = t*H
 *         P     = (r*cos th, r*sin th, z)
 *       reproduced here in f64 (no f32 GPU available in vitest) so we isolate
 *       FORMULA divergence from f32 quantization.
 *
 *   (B) the CPU export-pipeline surface (geometry/styles.ts
 *       `rOuterSuperformulaBlossom` + profile.ts `rBaseOut`/`spinTwistRadians`).
 *
 *   (C) the BILINEAR GpuSurfaceSampler at resU=resT=256 — the ACTUAL sampler
 *       the production conforming metric (crestBandTriangleQuality) is fed.
 *       (Reproduced by evaluating the EXACT f64 surface on a 256x256 grid and
 *       bilinearly interpolating, mirroring SurfaceSampler.ts.)
 *
 *   (D) f32 quantization: the GPU computes the whole formula in f32. We round
 *       the exact f64 surface through Math.fround at every op-equivalent stage
 *       (a CONSERVATIVE bound) to estimate the f32 floor.
 *
 * It ALSO independently re-validates the 3D-angle core (triMinAngleDeg3 via
 * polygonBestMinAngle3D) on a NON-PLANAR quad with a hand-computed answer, and
 * confirms best-of-triangulations actually maximises the min angle.
 *
 * Pure CPU, READ-ONLY imports of production + probe modules. No production
 * change. A truthfully-reported divergence is the goal.
 */
import { describe, it, expect } from 'vitest';
import {
  SfbWallSampler,
  SFB1_PACKED,
  SFB_DIMS,
} from './snapPlacementAudit';
import { polygonBestMinAngle3D } from './cellTriangulationCeiling';
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import type { PositionSampler } from './metrics';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { rOuterSuperformulaBlossom } from '../geometry/styles';
import { rBaseOut, spinTwistRadians } from '../geometry/profile';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const TAU = 2 * Math.PI;

function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

// ───────────────────────────────────────────────────────────────────────────
// (A) EXACT production OUTER-wall formula in f64 — mirrors evaluate_vertices +
//     styles.wgsl sf_radius + r_base + compute_twist (adaptive_mesh.wgsl).
//     spinTurns/spinPhase default to 0 (DEFAULT_GEOMETRY) → twist is identity;
//     we ALSO test a non-zero-twist config to prove twist is angle-neutral.
// ───────────────────────────────────────────────────────────────────────────
function gpuOuterPosition(
  u: number,
  t: number,
  p: Float32Array,
  spin: { turns: number; phaseRad: number; curve: number },
): [number, number, number] {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const theta = wrapU(u) * TAU; // evaluate_vertices: u_wrapped*TAU
  // r_base(t): Rb + (Rt-Rb)*pow(t,expn), max(.,0.5) clamp (never bites here).
  const r0 = Math.max(
    SFB_DIMS.Rb + (SFB_DIMS.Rt - SFB_DIMS.Rb) * Math.pow(tc, SFB_DIMS.expn),
    0.5,
  );
  // sf_radius @ strength=1: r0*(0.9+0.35*rf). rf = sfRf (same f64 mirror the
  // production extractor + SfbWallSampler use; seam_offset folded inside sfRf).
  const r = r0 * (0.9 + 0.35 * sfRf(wrapU(u), tc, p));
  // compute_twist: theta + turns*TAU*pow(t,curve) + phase.
  const th = theta + spin.turns * TAU * Math.pow(tc, Math.max(spin.curve, 1e-4)) + spin.phaseRad;
  return [r * Math.cos(th), r * Math.sin(th), tc * SFB_DIMS.H];
}

// f32-rounded variant: fround the radius, theta, and final coords to bound the
// f32 quantization the real GPU mesh carries.
function f(x: number): number {
  return Math.fround(x);
}
function gpuOuterPositionF32(
  u: number,
  t: number,
  p: Float32Array,
): [number, number, number] {
  const tc = f(t < 0 ? 0 : t > 1 ? 1 : t);
  const theta = f(f(wrapU(u)) * f(TAU));
  const r0 = f(
    Math.max(f(SFB_DIMS.Rb + f(f(SFB_DIMS.Rt - SFB_DIMS.Rb) * f(Math.pow(tc, SFB_DIMS.expn)))), 0.5),
  );
  const r = f(r0 * f(0.9 + f(0.35 * f(sfRf(wrapU(u), tc, p)))));
  return [f(r * f(Math.cos(theta))), f(r * f(Math.sin(theta))), f(tc * SFB_DIMS.H)];
}

// ───────────────────────────────────────────────────────────────────────────
// (B) CPU export-pipeline surface (geometry/styles.ts + profile.ts).
// ───────────────────────────────────────────────────────────────────────────
const SFB_OPTS = {
  // Map SFB1_PACKED → StyleOptions field names (geometry/types.ts).
  sfMBase: SFB1_PACKED[1],
  sfMTop: SFB1_PACKED[2],
  sfMCurveExp: SFB1_PACKED[3],
  sfN1: SFB1_PACKED[4],
  sfN1Top: SFB1_PACKED[5],
  sfN2: SFB1_PACKED[6],
  sfN2Top: SFB1_PACKED[7],
  sfN3: SFB1_PACKED[8],
  sfN3Top: SFB1_PACKED[9],
  sfA: SFB1_PACKED[10],
  sfB: SFB1_PACKED[11],
  seamAngle: 0,
};
function cpuOuterPosition(u: number, t: number): [number, number, number] {
  const z = t * SFB_DIMS.H;
  const theta = wrapU(u) * TAU;
  const r0 = rBaseOut(z, SFB_DIMS.H, SFB_DIMS.Rb, SFB_DIMS.Rt, SFB_DIMS.expn);
  // styles.ts rf is independent of strength; rOuterSuperformulaBlossom already
  // applies r0*(0.9+0.35*rf) at full strength (no strength blend in CPU fn).
  const r = rOuterSuperformulaBlossom(theta, z, r0, SFB_DIMS.H, SFB_OPTS);
  const tw = spinTwistRadians(z, SFB_DIMS.H, {}); // spin 0 by default → 0
  const th = theta + tw;
  return [r * Math.cos(th), r * Math.sin(th), z];
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

interface Div {
  max: number;
  rms: number;
  worstUT: { u: number; t: number };
}
function sweepDivergence(
  fa: (u: number, t: number) => readonly number[],
  fb: (u: number, t: number) => readonly number[],
  nU = 256,
  nT = 256,
): Div {
  let max = 0;
  let sumSq = 0;
  let n = 0;
  let worstUT = { u: 0, t: 0 };
  for (let it = 0; it <= nT; it++) {
    const t = it / nT;
    for (let iu = 0; iu < nU; iu++) {
      const u = iu / nU;
      const d = dist3(fa(u, t), fb(u, t));
      if (d > max) {
        max = d;
        worstUT = { u, t };
      }
      sumSq += d * d;
      n++;
    }
  }
  return { max, rms: Math.sqrt(sumSq / n), worstUT };
}

describe('surface-fidelity: SfbWallSampler vs production surfaces', () => {
  const p = Float32Array.from(SFB1_PACKED);
  const sampler = new SfbWallSampler(p);
  const samplerPos = (u: number, t: number): readonly number[] => sampler.position(u, t);

  it('(A) EQUALS the exact GPU outer-wall formula (f64, default zero-twist) to ~0mm', () => {
    const noSpin = { turns: 0, phaseRad: 0, curve: 1 };
    const div = sweepDivergence(samplerPos, (u, t) => gpuOuterPosition(u, t, p, noSpin));
    // Same closed form, same f64 math → should be bit-for-bit (machine epsilon).
    // Hard ceiling well below any printer resolution.
    // eslint-disable-next-line no-console
    console.log(
      `[A f64 exact-formula] max=${(div.max * 1e6).toFixed(4)}um rms=${(div.rms * 1e6).toFixed(4)}um worst@u=${div.worstUT.u.toFixed(4)},t=${div.worstUT.t.toFixed(4)}`,
    );
    expect(div.max).toBeLessThan(1e-9);
  });

  // Helper: max best-min-angle difference between two surfaces over a population
  // of production-cell quads (256-grid u-cells × 64 t-rows).
  function maxQuadAngleDiff(sa: PositionSampler, sb: PositionSampler): number {
    let m = 0;
    for (let it = 0; it < 64; it++) {
      const t0 = it / 64;
      const t1 = t0 + 1 / 256;
      for (let iu = 0; iu < 64; iu++) {
        const u0 = iu / 256;
        const u1 = u0 + 1 / 256;
        const quad: CellPoint[] = [
          { u: u0, t: t0 },
          { u: u1, t: t0 },
          { u: u1, t: t1 },
          { u: u0, t: t1 },
        ];
        const d = Math.abs(polygonBestMinAngle3D(quad, sa) - polygonBestMinAngle3D(quad, sb));
        if (d > m) m = d;
      }
    }
    return m;
  }

  it('(A2a) PURE rotation (phase-only twist) IS angle-neutral', () => {
    // A CONSTANT-in-t twist (turns=0, phase≠0) is a rigid z-rotation → preserves
    // all 3D angles. This isolates the rotation part from the shear part.
    const rot = { turns: 0, phaseRad: 0.4, curve: 1 };
    const rotated: PositionSampler = { position: (u, t) => gpuOuterPosition(u, t, p, rot) };
    const sw: PositionSampler = { position: (u, t) => sampler.position(u, t) };
    const maxAngleDiffDeg = maxQuadAngleDiff(sw, rotated);
    // eslint-disable-next-line no-console
    console.log(`[A2a pure-rotation] max best-min-angle diff=${maxAngleDiffDeg.toExponential(3)}deg`);
    expect(maxAngleDiffDeg).toBeLessThan(1e-6);
  });

  it('(A2b) FINDING: t-dependent twist is a SHEAR — it CHANGES 3D angles', () => {
    // compute_twist adds turns*TAU*pow(t,curve) which VARIES with t → adjacent
    // rows rotate by DIFFERENT amounts → a SHEAR, NOT a rigid rotation. So at
    // NON-ZERO spinTurns the production surface is sheared and SfbWallSampler
    // (which omits twist) would measure DIFFERENT triangle angles. The pinned
    // SFB@1 config has spinTurns=spinPhase=0 (DEFAULT_GEOMETRY) so this does NOT
    // affect the published probe numbers — but it is a REAL divergence the
    // probes would carry on any twisted preset.
    const spin = { turns: 0.7, phaseRad: 0.4, curve: 1.1 };
    const twisted: PositionSampler = { position: (u, t) => gpuOuterPosition(u, t, p, spin) };
    const sw: PositionSampler = { position: (u, t) => sampler.position(u, t) };
    const maxAngleDiffDeg = maxQuadAngleDiff(sw, twisted);
    const posDiv = sweepDivergence(samplerPos, (u, t) => twisted.position(u, t));
    // eslint-disable-next-line no-console
    console.log(
      `[A2b t-twist SHEAR] positional max=${posDiv.max.toFixed(3)}mm, max best-min-angle diff=${maxAngleDiffDeg.toFixed(3)}deg`,
    );
    // Document the finding: the difference is LARGE, proving twist is NOT neutral.
    expect(maxAngleDiffDeg).toBeGreaterThan(1);
  });

  it('(B) EQUALS the CPU export-pipeline surface (styles.ts + profile.ts) to ~0mm', () => {
    const div = sweepDivergence(samplerPos, cpuOuterPosition);
    // eslint-disable-next-line no-console
    console.log(
      `[B CPU styles.ts] max=${(div.max * 1e6).toFixed(4)}um rms=${(div.rms * 1e6).toFixed(4)}um worst@u=${div.worstUT.u.toFixed(4)},t=${div.worstUT.t.toFixed(4)}`,
    );
    // Both are the same closed form in f64; the only divergence is the EPSILON
    // floor difference (styles.ts uses EPSILON=1e-9 in superformulaValue; the
    // WGSL/sfRf mirror uses 1e-4 for max(a,.)/max(n1,.)). At SFB@1 (a=b=1,
    // n1∈[0.35,0.5]) the 1e-4 floor never bites, so the gap is ~1e-5mm (10nm) —
    // utterly negligible vs the 0.082→0.021mm facet target. Reported, not gated.
    expect(div.max).toBeLessThan(1e-3);
  });

  it('(C) vs the BILINEAR GpuSurfaceSampler@256 — the ACTUAL conforming metric sampler', () => {
    // Build the EXACT f64 surface on a 256x256 grid (row-major, u=col/resU,
    // t=row/(resT-1)) exactly as ParametricExportComputer.buildWallSampler does,
    // then wrap it in the PRODUCTION GpuSurfaceSampler bilinear interpolant.
    const resU = 256;
    const resT = 256;
    const grid = new Float32Array(resU * resT * 3);
    let w = 0;
    for (let row = 0; row < resT; row++) {
      const t = row / (resT - 1);
      for (let col = 0; col < resU; col++) {
        const pos = sampler.position(col / resU, t);
        grid[w++] = pos[0];
        grid[w++] = pos[1];
        grid[w++] = pos[2];
      }
    }
    const bilinear = new GpuSurfaceSampler(grid, resU, resT);

    // Diagnostic: dump the worst INTERIOR (non-seam) cell separately from the
    // seam strip, because the bilinear sampler interpolates the u=255→0 seam
    // column across the WHOLE angular gap (col 255 ≈ 358.6deg, col 0 = 0deg) —
    // a known seam artefact of the 256-grid, NOT a surface-formula divergence.
    let maxInterior = 0;
    let maxInteriorUT = { u: 0, t: 0 };
    let maxSeam = 0;
    let maxSeamUT = { u: 0, t: 0 };
    const N = 512;
    for (let it = 0; it <= N; it++) {
      const t = it / N;
      for (let iu = 0; iu < N; iu++) {
        const u = iu / N;
        const d = dist3(sampler.position(u, t), bilinear.position(u, t));
        const inSeamCell = u >= 255 / 256; // the wrap cell [255/256, 1)
        if (inSeamCell) {
          if (d > maxSeam) {
            maxSeam = d;
            maxSeamUT = { u, t };
          }
        } else if (d > maxInterior) {
          maxInterior = d;
          maxInteriorUT = { u, t };
        }
      }
    }
    // RAW dump of the worst interior point to expose the mechanism.
    {
      const u = maxInteriorUT.u;
      const t = maxInteriorUT.t;
      const ex = sampler.position(u, t);
      const bi = bilinear.position(u, t);
      const uf = (u - Math.floor(u)) * resU;
      const u0 = Math.floor(uf) % resU;
      const tf = (t < 0 ? 0 : t > 1 ? 1 : t) * (resT - 1);
      const t0 = Math.min(Math.floor(tf), resT - 1);
      const c00 = sampler.position(u0 / resU, t0 / (resT - 1));
      // eslint-disable-next-line no-console
      console.log(
        `[C raw] u=${u.toFixed(5)} t=${t.toFixed(5)} u0=${u0} t0=${t0} | exact=(${ex.map((v) => v.toFixed(2)).join(',')}) bilinear=(${bi.map((v) => v.toFixed(2)).join(',')}) cornerSampler=(${c00.map((v) => v.toFixed(2)).join(',')})`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[C bilinear@256] INTERIOR max=${maxInterior.toFixed(4)}mm @u=${maxInteriorUT.u.toFixed(4)},t=${maxInteriorUT.t.toFixed(4)} | SEAM-CELL max=${maxSeam.toFixed(4)}mm @u=${maxSeamUT.u.toFixed(4)},t=${maxSeamUT.t.toFixed(4)}`,
    );
    // The INTERIOR chord error is the floor of how well a (u,t)→3D metric on the
    // GpuSurfaceSampler resolves a sharp crest (bilinear cuts cusps). The probes
    // do NOT use the bilinear sampler — they use the EXACT SfbWallSampler — so
    // this is the GAP between the probe surface and the conforming METRIC
    // surface, reported for honesty. The seam-cell number is a known 256-grid
    // wrap artefact (the metric never samples mid-seam-cell at a real vertex).
    expect(maxInterior).toBeLessThan(50); // report the real number in the log
  });

  it('(D) f32 quantization floor (GPU computes the formula in f32) — position AND angle', () => {
    const div = sweepDivergence(samplerPos, (u, t) => gpuOuterPositionF32(u, t, p));
    // The metric that matters is ANGLE: how much does f32 quantization move the
    // best-min-angle of a real production cell vs the probe's f64 surface?
    const f32s: PositionSampler = { position: (u, t) => gpuOuterPositionF32(u, t, p) };
    const sw: PositionSampler = { position: (u, t) => sampler.position(u, t) };
    let maxAngleDiff = 0;
    for (let it = 0; it < 64; it++) {
      const t0 = it / 64;
      const t1 = t0 + 1 / 256;
      for (let iu = 0; iu < 64; iu++) {
        const u0 = iu / 256;
        const u1 = u0 + 1 / 256;
        const quad: CellPoint[] = [
          { u: u0, t: t0 },
          { u: u1, t: t0 },
          { u: u1, t: t1 },
          { u: u0, t: t1 },
        ];
        const d = Math.abs(polygonBestMinAngle3D(quad, sw) - polygonBestMinAngle3D(quad, f32s));
        if (d > maxAngleDiff) maxAngleDiff = d;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[D f32] position max=${(div.max * 1e3).toFixed(6)}mm (${(div.max * 1e6).toFixed(3)}um) rms=${(div.rms * 1e6).toFixed(3)}um | best-min-angle max diff=${maxAngleDiff.toFixed(4)}deg`,
    );
    // f32 has ~7 sig digits; at r~90mm the ulp is ~1e-5mm. CONSERVATIVE bound
    // (we fround every intermediate, worse than real fma GPU).
    expect(div.max).toBeLessThan(1e-2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3D-ANGLE CORE independent re-validation (the shared linchpin used by 8/9
// probes). Build NON-PLANAR quads with a HAND-COMPUTED best min angle.
// ───────────────────────────────────────────────────────────────────────────
describe('surface-fidelity: 3D-angle core independent validation', () => {
  // A bespoke flat sampler that maps (u,t) directly to a supplied 3D point set,
  // so we control the exact 3D geometry of the quad (not the SFB surface).
  function planeSampler(pts: Record<string, [number, number, number]>): PositionSampler {
    return {
      position: (u: number, t: number): [number, number, number] => {
        const key = `${u},${t}`;
        const v = pts[key];
        if (!v) throw new Error(`planeSampler: unmapped (${u},${t})`);
        return v;
      },
    };
  }

  it('unit square (planar) → best min angle is exactly 45deg', () => {
    const pts: Record<string, [number, number, number]> = {
      '0,0': [0, 0, 0],
      '1,0': [1, 0, 0],
      '1,1': [1, 1, 0],
      '0,1': [0, 1, 0],
    };
    const quad: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];
    const best = polygonBestMinAngle3D(quad, planeSampler(pts));
    expect(best).toBeCloseTo(45, 6);
  });

  it('NON-PLANAR quad: best-of-triangulations matches independent brute force', () => {
    // A genuinely non-planar quad (one corner lifted in z). Compute the best
    // min-angle over BOTH diagonals by an INDEPENDENT hand triangulation and
    // compare to the core. The two diagonals give different min angles, so the
    // best-of must pick the larger — proving "best triangulation maximises".
    const A: [number, number, number] = [0, 0, 0];
    const B: [number, number, number] = [2, 0, 0];
    const C: [number, number, number] = [2.2, 1, 0.8]; // lifted in z → non-planar
    const D: [number, number, number] = [0.1, 0.9, -0.3];
    const pts: Record<string, [number, number, number]> = {
      '0,0': A,
      '1,0': B,
      '1,1': C,
      '0,1': D,
    };
    const quad: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];

    // Independent min-angle of a 3D triangle (no shared code).
    const triMin = (a: number[], b: number[], c: number[]): number => {
      const ang = (p1: number[], q: number[], r: number[]): number => {
        const v1 = [q[0] - p1[0], q[1] - p1[1], q[2] - p1[2]];
        const v2 = [r[0] - p1[0], r[1] - p1[1], r[2] - p1[2]];
        const l1 = Math.hypot(v1[0], v1[1], v1[2]);
        const l2 = Math.hypot(v2[0], v2[1], v2[2]);
        let cos = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (l1 * l2);
        cos = Math.max(-1, Math.min(1, cos));
        return (Math.acos(cos) * 180) / Math.PI;
      };
      return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
    };
    // Diagonal AC: triangles ABC, ACD.
    const diagAC = Math.min(triMin(A, B, C), triMin(A, C, D));
    // Diagonal BD: triangles ABD, BCD.
    const diagBD = Math.min(triMin(A, B, D), triMin(B, C, D));
    const independentBest = Math.max(diagAC, diagBD);

    const best = polygonBestMinAngle3D(quad, planeSampler(pts));
    // eslint-disable-next-line no-console
    console.log(
      `[core] diagAC=${diagAC.toFixed(4)} diagBD=${diagBD.toFixed(4)} independentBest=${independentBest.toFixed(4)} core=${best.toFixed(4)}`,
    );
    expect(best).toBeCloseTo(independentBest, 6);
    // And the core must NOT just return one fixed diagonal: it must equal the max.
    expect(best).toBeGreaterThanOrEqual(Math.min(diagAC, diagBD) - 1e-9);
  });

  it('measures angles in 3D, NOT in (u,t): a steep z-warp changes the answer', () => {
    // Same (u,t) square, but the surface lifts one edge steeply in z. If the
    // core measured (u,t) it would still say 45deg; in 3D it must differ.
    const flatPts: Record<string, [number, number, number]> = {
      '0,0': [0, 0, 0],
      '1,0': [1, 0, 0],
      '1,1': [1, 1, 0],
      '0,1': [0, 1, 0],
    };
    const warpedPts: Record<string, [number, number, number]> = {
      '0,0': [0, 0, 0],
      '1,0': [1, 0, 0],
      '1,1': [1, 1, 5], // huge z lift
      '0,1': [0, 1, 5],
    };
    const quad: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];
    const flat = polygonBestMinAngle3D(quad, planeSampler(flatPts));
    const warped = polygonBestMinAngle3D(quad, planeSampler(warpedPts));
    expect(flat).toBeCloseTo(45, 6);
    expect(Math.abs(warped - 45)).toBeGreaterThan(1); // genuinely 3D
  });
});
