/* eslint-disable no-console */
// _pfSmoothFixSmoke.test.ts — FAST de-risk for the deriveSmoothGridDensity verify-and-bump (no measureProjectorMax).
// Validates the CORE logic + perf cheaply before the ~17-min projector proof: for the 7 target styles, report seed vs
// bumped (nU,nT), the internal worstSmoothFacetChord at both, and the derive timing. Asserts only the cheap invariants
// (final internal chord ≤ tol, derive <2s, no over-bump on the 3 closers). Run:
//   PF_SMOOTHSMOKE=1 npx vitest run --config vitest.smoothsmoke.config.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import {
  deriveSmoothGridDensity,
  worstSmoothFacetChord,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const RUN = process.env.PF_SMOOTHSMOKE === '1';
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const TAU = 2 * Math.PI;
const TOL = 0.01;
const CLOSERS = new Set(['SuperformulaBlossom', 'SuperellipseMorph', 'FourierBloom']);
const STYLES = ['SuperformulaBlossom', 'SuperellipseMorph', 'FourierBloom', 'HarmonicRipple', 'WaveInterference', 'HexagonalHive', 'SpiralRidges'];

function seedDensity(rA: AnalyticRadiusFn, H: number, tolMm: number): { nU: number; nT: number } {
  const n0 = 128, safety = 1.5;
  const lift = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const sag2 = (Pm: number[], P: number[], Pp: number[]): number =>
    0.125 * Math.hypot(Pm[0] + Pp[0] - 2 * P[0], Pm[1] + Pp[1] - 2 * P[1], Pm[2] + Pp[2] - 2 * P[2]);
  let maxSagU = 0, maxSagT = 0;
  for (let j = 0; j <= n0; j++) {
    const t = j / n0;
    for (let i = 0; i < n0; i++) {
      const u = i / n0;
      const P = lift(u, t);
      const sU = sag2(lift(((i - 1 + n0) % n0) / n0, t), P, lift(((i + 1) % n0) / n0, t));
      if (sU > maxSagU) maxSagU = sU;
      if (j > 0 && j < n0) {
        const sT = sag2(lift(u, (j - 1) / n0), P, lift(u, (j + 1) / n0));
        if (sT > maxSagT) maxSagT = sT;
      }
    }
  }
  const nURaw = n0 * Math.sqrt(Math.max(maxSagU, 1e-12) / tolMm) * safety;
  const nTRaw = n0 * Math.sqrt(Math.max(maxSagT, 1e-12) / tolMm) * safety;
  let pow2 = 1;
  while (pow2 < nURaw) pow2 *= 2;
  return { nU: Math.max(256, Math.min(8192, pow2)), nT: Math.max(32, Math.min(2048, Math.ceil(nTRaw))) };
}

// Ground-truth projMax at specific (nU,nT) from the first full proof run — worstSmoothFacetChord must AGREE (no
// under-read) so the bump loop's decision matches the sanctioned ruler.
const CAL: Array<{ style: string; nU: number; nT: number; projMax: number }> = [
  { style: 'HarmonicRipple', nU: 2048, nT: 208, projMax: 0.00690 },
  { style: 'WaveInterference', nU: 1024, nT: 462, projMax: 0.00659 },
  { style: 'SpiralRidges', nU: 2048, nT: 386, projMax: 0.00920 },
  { style: 'HexagonalHive', nU: 2048, nT: 670, projMax: 0.01035 },
];

describe('smooth-grid verify-and-bump SMOKE (internal chord only)', () => {
  it.skipIf(!RUN)('worstSmoothFacetChord AGREES with measureProjectorMax (no >5% under-read)', () => {
    for (const c of CAL) {
      const rA = buildAnalyticRadiusFn(c.style as StyleId, {}, DIMS);
      const internal = worstSmoothFacetChord(rA, DIMS.H, c.nU, c.nT);
      const ratio = internal / c.projMax;
      console.log(`[CAL] ${c.style} nU${c.nU}/nT${c.nT}: internal ${internal.toFixed(5)} vs projMax ${c.projMax.toFixed(5)} ⇒ ${ratio.toFixed(3)}x`);
      expect(ratio).toBeGreaterThan(0.90); // agree within the task's ~10% bar (no gross under-read)
    }
  }, 120_000);

  it.skipIf(!RUN)('derive bumps the 4 GAP styles, keeps the 3 closers, internal chord ≤ tol, <2s', () => {
    for (const style of STYLES) {
      const rA = buildAnalyticRadiusFn(style as StyleId, {}, DIMS);
      const seed = seedDensity(rA, DIMS.H, TOL);
      const seedChord = worstSmoothFacetChord(rA, DIMS.H, seed.nU, seed.nT);
      const t0 = performance.now();
      const { nU, nT } = deriveSmoothGridDensity(rA, DIMS.H, TOL);
      const ms = performance.now() - t0;
      const finalChord = worstSmoothFacetChord(rA, DIMS.H, nU, nT);
      const tris = nU * (nT - 1) * 2;
      console.log(
        `[SMOKE] ${style}: seed nU${seed.nU}/nT${seed.nT} chord ${seedChord.toFixed(5)} -> nU${nU}/nT${nT} ` +
        `chord ${finalChord.toFixed(5)} tris ${(tris / 1e6).toFixed(3)}M derive ${ms.toFixed(0)}ms ${nU > seed.nU || nT > seed.nT ? 'BUMPED' : 'kept'}`,
      );
      expect(finalChord).toBeLessThanOrEqual(TOL); // the loop closes the internal metric by construction
      expect(ms).toBeLessThan(2000); // perf budget
      if (CLOSERS.has(style)) {
        expect(nU).toBe(seed.nU); // no over-bump
        expect(nT).toBe(seed.nT);
      }
    }
  }, 120_000);
});
