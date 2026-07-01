// _frontierBet2SizingProbe.test.ts — DEV-ONLY (env PF_BET2=1). FRONTIER Bet 2 mechanism discriminator.
// MEASURE-ONLY, NEW FILE, touches NO shared kernel/conforming file (isolated from the concurrent green push).
//
// Bet 2 claim: the kernel's sizing field (buildSurfaceMetricField) reads kappaMax via finite differences AT GRID
// STEP (du = 1/(resU-1), default resU=256 → a ~1.1mm cell in u), so it ALIASES a sub-cell sharp ridge (GothicArches
// apex half-width ~0.17mm ≪ cell) → under-reads curvature → h3D=sqrt(8*tol/kappa) too large → vertices miss the crest.
//
// v2 fix (locus-placement confound): grid-detected loci don't sit exactly on the sub-cell ridge, so a fixed-point
// fine stencil misses it. We take the WINDOW-MAX curvature — the peak over a small PERPENDICULAR window at each
// scale — which is placement-robust. DISCRIMINATOR: peak curvature at FINE step ≫ peak at GRID step on the sharp
// style (grid steps over the ridge) but ≈ on the smooth style. CONFIRM iff Gothic median(fineMax/gridMax) >= 2 AND
// Gyroid < 1.3. Implied sizing error = sqrt(ratio) (h3D ∝ 1/sqrt(kappa)).
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, buildFeatureTruth, type StyleDims } from './labkit';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const TOL = 0.004, HMIN = 0.008, HMAX = 8; // kernel defaults
const GRID_STEP = 1 / 256, FINE_STEP = 1 / 2048; // grid cell vs ~ridge-width stencil
const WIN_MM = 0.6, WIN_N = 24; // perpendicular search window ± mm

/** EXACT port of buildSurfaceMetricField's kappaMax (principal-curvature magnitude) at a chosen finite-diff step h. */
function kappaMaxAt(rA: AnalyticRadiusFn, H: number, u: number, t: number, h: number): number {
  const S = (uu: number, tt: number): number[] => { const th = TAU * uu, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: number[], b: number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: number[], b: number[]): number[] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const tt = Math.min(Math.max(t, h), 1 - h);
  const c = S(u, tt);
  const Su = sub(S(u + h, tt), S(u - h, tt)).map((v) => v / (2 * h));
  const St = sub(S(u, tt + h), S(u, tt - h)).map((v) => v / (2 * h));
  const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
  const Suu = sub(sub(S(u + h, tt), c), sub(c, S(u - h, tt))).map((v) => v / (h * h));
  const Stt = sub(sub(S(u, tt + h), c), sub(c, S(u, tt - h))).map((v) => v / (h * h));
  const pp = S(u + h, tt + h), pm = S(u + h, tt - h), mp = S(u - h, tt + h), mm = S(u - h, tt - h);
  const Sut = [0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm[k]) / (4 * h * h));
  let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl <= 1e-30) return 0;
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
  const a = E * G - F * F, b = -(E * N + G * L - 2 * F * Mn), cc = L * N - Mn * Mn;
  if (Math.abs(a) <= 1e-30) return 0;
  const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
  return Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a)));
}

const h3D = (kappa: number): number => Math.min(Math.max(kappa > 1e-9 ? Math.sqrt((8 * TOL) / kappa) : HMAX, HMIN), HMAX);
const median = (xs: number[]): number => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const pct = (xs: number[], p: number): number => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

describe('FRONTIER Bet 2 — sizing-field curvature aliasing (window-max)', () => {
  it.skipIf(process.env.PF_BET2 !== '1')('grid-step vs fine-step PEAK curvature across the ridge (Gothic sharp vs Gyroid smooth)', () => {
    // GothicArches = sharp thin ridge; GyroidManifold = sharp-crease lattice (NOT smooth — it's in the conform set);
    // HarmonicRipple + SuperellipseMorph = genuinely SMOOTH accept-class CONTROLS (must read ~1x if the instrument
    // is valid — else window-max-at-finer-step is an upward artifact and the probe is confounded).
    const STYLES: StyleId[] = ['GothicArches' as StyleId, 'GyroidManifold' as StyleId, 'HarmonicRipple' as StyleId, 'SuperellipseMorph' as StyleId];
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const truth = buildFeatureTruth(style, {}, DIMS, 384);
      const uToMm = truth.uToMm, tToMm = truth.tToMm;
      const ratios: number[] = []; const hGrid: number[] = [], hFine: number[] = []; const gridMax: number[] = [], fineMax: number[] = [];
      let nLoci = 0;
      for (const line of truth.lines) {
        const pl = line.points; if (pl.length < 2) continue;
        let du = pl[1].u - pl[0].u; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
        const dt = pl[1].t - pl[0].t;
        const txMm = du * uToMm, tyMm = dt * tToMm; const L = Math.hypot(txMm, tyMm) || 1;
        const perpU = (-tyMm / L) / uToMm, perpT = (txMm / L) / tToMm; // (u,t) delta per 1mm perpendicular move
        for (const p of pl) {
          if (nLoci++ % 3 !== 0) continue; // subsample for speed
          // window-max curvature perpendicular to the ridge, at grid vs fine step
          let kg = 0, kf = 0;
          for (let j = -WIN_N; j <= WIN_N; j++) {
            const s = (j / WIN_N) * WIN_MM;
            let uu = p.u + s * perpU; uu = ((uu % 1) + 1) % 1;
            const tt = p.t + s * perpT;
            const g = kappaMaxAt(rA, DIMS.H, uu, tt, GRID_STEP); if (g > kg) kg = g;
            const f = kappaMaxAt(rA, DIMS.H, uu, tt, FINE_STEP); if (f > kf) kf = f;
          }
          gridMax.push(kg); fineMax.push(kf);
          if (kg > 1e-9) ratios.push(kf / kg);
          hGrid.push(h3D(kg)); hFine.push(h3D(kf));
        }
      }
      const ratioMed = median(ratios), ratioP90 = pct(ratios, 0.9);
      const hOversize = median(hGrid) / Math.max(1e-9, median(hFine));
      const verdict = ratioMed >= 2 ? 'ALIASED (grid blind at ridge → under-sizes)' : ratioMed < 1.3 ? 'resolved (grid fine)' : 'partial';
      // eslint-disable-next-line no-console
      console.log(
        `${String(style).padEnd(15)} loci=${String(ratios.length).padStart(5)} | peakKappa grid=${median(gridMax).toFixed(2)} fine=${median(fineMax).toFixed(2)} ` +
        `| ratio fine/grid med=${ratioMed.toFixed(2)} p90=${ratioP90.toFixed(2)} | h3D grid=${median(hGrid).toFixed(4)} fine=${median(hFine).toFixed(4)} (grid ${hOversize.toFixed(2)}x coarser) | ${verdict}`,
      );
    }
    expect(true).toBe(true);
  }, 20 * 60 * 1000);
});
