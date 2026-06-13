/**
 * verify_styleSharpnessClass.test.ts — final cross-style closure: classify each
 * style's sharpness LOCATION (radial u-feature vs t-band) and self-check the
 * bilinear sampler, cross-referenced with the EXTRACTORS coverage from code.
 *
 * Resolves the remaining loose ends with high-quality data:
 *  - z-discontinuity anomaly: are Bamboo/BasketWeave's bi1024-worse readings real
 *    t-STEPS (band edges)? -> measure max 3D radial step per L7 cell in t vs u.
 *  - smooth-style confirmation: the () => [] smooth styles should have LOW u&t
 *    steps (genuinely smooth); the () => [] GAP styles (ArtDeco/Crystalline) HIGH.
 *  - sampler faithfulness: bilinear-256 at GRID points must equal exact (~0), or
 *    the whole cross-style bi-deviation column is suspect.
 *
 * Per style: maxUStep (mm, sharpest radial jump across one L7 u-cell = needs a
 * crest/u-edge), maxTStep (mm, across one L7 t-cell = needs a t-band edge),
 * grid faithfulness (mm), and the extractor status from FeatureLineGraph.
 *
 * Pure CPU, read-only, no production change.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS, type StyleFunction } from '../geometry/styles';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
type V3 = readonly [number, number, number];
function pos(fn: StyleFunction, u: number, t: number): V3 {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const theta = 2 * Math.PI * u;
  const z = tc * H;
  const r0 = Rb + (Rt - Rb) * Math.pow(tc, expn);
  let r = fn(theta, z, r0, H, {});
  if (!Number.isFinite(r)) r = r0;
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Extractor status from FeatureLineGraph.ts EXTRACTORS (read 2026-06-13).
const STATUS: Record<string, string> = {
  LowPolyFacet: 'extractor', GeometricStar: 'extractor', GothicArches: 'partial(seam)',
  BambooSegments: 'extractor(t-rings)', DragonScales: 'extractor', BasketWeave: 'partial(axis-only)',
  SpiralRidges: 'extractor(helix)', CelticTriquetra: 'partial(3 rim rings)', HexagonalHive: 'extractor',
  CelticKnot: 'extractor', GyroidManifold: 'extractor', Voronoi: 'extractor',
  SuperformulaBlossom: 'partial(born dropped)',
  HarmonicRipple: 'EMPTY-smooth', SuperellipseMorph: 'EMPTY-smooth', FourierBloom: 'EMPTY-smooth',
  WaveInterference: 'EMPTY-smooth', RippleInterference: 'EMPTY-smooth',
  Crystalline: 'EMPTY-GAP(sharp!)', ArtDeco: 'EMPTY-GAP(sharp!)',
};

describe('VERIFY final cross-style sharpness classification + sampler faithfulness', () => {
  it('classifies u-feature vs t-band sharpness per style; validates the bilinear sampler', () => {
    const duCell = 1 / 512, dtCell = 1 / 128; // L7 cell extents (B=2)
    const rows: Array<{ id: string; uStep: number; tStep: number; gridErr: number; status: string }> = [];
    for (const [id, fn] of Object.entries(STYLE_FUNCTIONS) as Array<[string, StyleFunction]>) {
      let uStep = 0, tStep = 0;
      for (let it = 0; it <= 128; it++) {
        const t = it / 128;
        for (let iu = 0; iu < 600; iu++) {
          const u = iu / 600;
          uStep = Math.max(uStep, dist(pos(fn, u, t), pos(fn, u + duCell, t)));
          if (it < 128) tStep = Math.max(tStep, dist(pos(fn, u, t), pos(fn, u, t + dtCell)));
        }
      }
      // sampler faithfulness: bilinear-256 at grid points must equal exact.
      const res = 256;
      const grid = new Float32Array(res * res * 3);
      let w = 0;
      for (let row = 0; row < res; row++) for (let col = 0; col < res; col++) { const q = pos(fn, col / res, row / (res - 1)); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; }
      const bi = new GpuSurfaceSampler(grid, res, res);
      let gridErr = 0;
      for (let row = 0; row < res; row += 7) for (let col = 0; col < res; col += 7) {
        const a = pos(fn, col / res, row / (res - 1)), b = bi.position(col / res, row / (res - 1)) as V3;
        gridErr = Math.max(gridErr, dist(a, b));
      }
      rows.push({ id, uStep, tStep, gridErr, status: STATUS[id] ?? '?' });
    }
    rows.sort((a, b) => Math.max(b.uStep, b.tStep) - Math.max(a.uStep, a.tStep));

    /* eslint-disable no-console */
    console.log('\n===== FINAL cross-style sharpness class (radial jump per L7 cell) + sampler faithfulness =====');
    console.log('  style                    | uStep mm | tStep mm | gridErr mm | extractor');
    let maxGridErr = 0;
    for (const r of rows) {
      maxGridErr = Math.max(maxGridErr, r.gridErr);
      const cls = r.uStep > 0.1 && r.tStep > 0.1 ? 'u+t' : r.uStep > 0.1 ? 'u-feature' : r.tStep > 0.1 ? 't-band' : 'smooth';
      console.log(`  ${r.id.padEnd(24)} | ${r.uStep.toFixed(3).padStart(7)} | ${r.tStep.toFixed(3).padStart(7)} | ${r.gridErr.toExponential(1).padStart(9)} | ${cls.padEnd(9)} ${r.status}`);
    }
    console.log(`  SAMPLER FAITHFULNESS: max grid-point error across all styles = ${maxGridErr.toExponential(2)}mm (≈0 => the bi-deviation column is trustworthy)`);
    console.log('=============================================================================================\n');
    /* eslint-enable no-console */
    expect(rows.length).toBeGreaterThan(15);
    expect(maxGridErr).toBeLessThan(1e-3); // sampler must be exact at grid points
  }, 180000);
});
