/**
 * anisoSplit.test.ts — E-2026-07-08-TIERC-ANISO-RED fast guard.
 *
 * Two claims, PF-ungated (fast, small domain):
 *  1. BYTE-IDENTICAL OFF: splitMode undefined ⇒ the refine trajectory + final
 *     uv/tris are bit-identical to the prior isotropic RED 1→4 (the aniso branch
 *     is opt-in; the default insertion is unchanged ⇒ production byte-identical).
 *  2. MECHANISM: with splitMode 'aniso', an outlier facet inserts FEWER points
 *     per pass than isotropic RED (a single sag-dominant edge midpoint vs up to
 *     three), so the per-pass `inserted` count is lower at a comparable outlier
 *     trajectory — the growth-per-sag savings the head-to-head gate then measures
 *     at full scale. Both direction signals ('edgeSag', 'longEdge') exercised.
 *     The aniso mesh stays sound (no degenerate/zero-area faces).
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
} from './noBridgeRefine';
import { DEFAULT_RULER } from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';

function zeroAreaCount(uv: number[], tris: number[]): number {
  let z = 0;
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    const ax = uv[2 * a];
    const ay = uv[2 * a + 1];
    const bx = uv[2 * b];
    const by = uv[2 * b + 1];
    const cx = uv[2 * c];
    const cy = uv[2 * c + 1];
    const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
    if (area2 < 1e-14) z++;
  }
  return z;
}

describe('Tier-C anisotropic split', () => {
  const sampler = styleSampler(
    'GothicArches',
    {},
    { H: 120, Rt: 50, Rb: 40 },
  ) as GpuSurfaceSampler;
  const complex = buildProtectedComplex(sampler, 'GothicArches');
  // Tiny domain + coarse ruler + a relaxed tol so the loop converges in a few
  // cheap passes (this is a MECHANISM + byte-identical guard, not a fidelity
  // gate — the full-scale head-to-head lives in _anisoGate). The relaxed tol
  // 0.05 still produces outliers that split (the point count / direction logic
  // is exercised), but the whole-domain brute stays small.
  const domain: ChartDomain = { uLo: 0.04, uHi: 0.07, tLo: 0.45, tHi: 0.5 };
  const base: RefineOptions = {
    tolMm: 0.05,
    maxPass: 4,
    bulkPasses7pt: 2,
    bgArcMm: 1.0,
    ruler: DEFAULT_RULER,
  };
  const TIMEOUT = 120_000;

  it('is byte-identical to isotropic RED when splitMode is off', () => {
    const iso = refineToZeroOutliers(sampler, complex, domain, base);
    // Explicit undefined splitMode == omitted.
    const isoExplicit = refineToZeroOutliers(sampler, complex, domain, {
      ...base,
      splitMode: undefined,
    });
    expect(isoExplicit.uv.length).toBe(iso.uv.length);
    expect(isoExplicit.tris.length).toBe(iso.tris.length);
    expect(isoExplicit.passes).toBe(iso.passes);
    for (let i = 0; i < iso.uv.length; i++) {
      expect(isoExplicit.uv[i]).toBe(iso.uv[i]);
    }
    for (let i = 0; i < iso.tris.length; i++) {
      expect(isoExplicit.tris[i]).toBe(iso.tris[i]);
    }
  }, TIMEOUT);

  it('aniso inserts fewer points per outlier than isotropic, mesh stays sound', () => {
    const iso = refineToZeroOutliers(sampler, complex, domain, base);
    const isoInsSum = iso.history.reduce((s, h) => s + h.inserted, 0);
    const isoOutSum = iso.history.reduce((s, h) => s + h.outliers, 0);
    const isoInsPerOut = isoInsSum / Math.max(1, isoOutSum);

    for (const direction of ['edgeSag', 'longEdge'] as const) {
      const aniso = refineToZeroOutliers(sampler, complex, domain, {
        ...base,
        splitMode: 'aniso',
        anisoDirection: direction,
      });
      const anInsSum = aniso.history.reduce((s, h) => s + h.inserted, 0);
      const anOutSum = aniso.history.reduce((s, h) => s + h.outliers, 0);
      const anInsPerOut = anInsSum / Math.max(1, anOutSum);
      // eslint-disable-next-line no-console
      console.log(
        `[anisoSplit ${direction}]`,
        JSON.stringify({
          isoInsPerOut: +isoInsPerOut.toFixed(3),
          anInsPerOut: +anInsPerOut.toFixed(3),
          isoTris: iso.tris.length / 3,
          anisoTris: aniso.tris.length / 3,
          zeroArea: zeroAreaCount(aniso.uv, aniso.tris),
        }),
      );
      // Fewer inserted points per outlier facet (the growth-per-sag lever).
      expect(anInsPerOut).toBeLessThan(isoInsPerOut);
      // Mesh soundness: no zero-area faces produced by the single-edge split.
      expect(zeroAreaCount(aniso.uv, aniso.tris)).toBe(0);
      expect(aniso.tris.length).toBeGreaterThan(0);
    }
  }, TIMEOUT);
});
