/**
 * _ribAwareDiag.test.ts — E-2026-07-08-TIERC-RIBAWARE-SEED cheap discriminator.
 *
 * Before the multi-hour gate: for each rib-aware seed design, count the seed
 * points over the multi-bay Gothic domain and confirm the design (i) shrinks the
 * seed vs plain LEVER A (rib flanks excluded) WHILE (ii) still placing interior
 * points inside the smooth dead-zone bump at t≈0.465 (breaks the CDT t-needle).
 * A design that fails (i) cannot beat the 8.3M budget; a design that fails (ii)
 * re-forms the pin. PF_TIERC_RIBAWARE=1. Writes a JSON checkpoint the INSTANT
 * each design is computed.
 */
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { seedFromComplex, type ChartDomain } from './noBridgeRefine';
import { GpuSurfaceSampler } from '../SurfaceSampler';

const RUN = process.env.PF_TIERC_RIBAWARE === '1';
const OUT = 'research/exchange/_tierc_ribaware';

describe('rib-aware seed diagnostic', () => {
  it.skipIf(!RUN)('counts seed pts + dead-zone coverage per design', () => {
    mkdirSync(OUT, { recursive: true });
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const uToMm = complex.uToMm;
    const tToMm = complex.tToMm;

    // Nearest-neighbour spacing (mm) inside the dead-zone bump t≈0.465. If this
    // is < ~0.2mm the CDT cannot span the bump with a needle.
    const bumpNN = (uv: number[]): { nnMm: number; nInBand: number } => {
      const idx: number[] = [];
      for (let i = 0; i < uv.length / 2; i++) {
        const t = uv[2 * i + 1];
        const u = uv[2 * i];
        if (t > 0.44 && t < 0.49 && u > 0.06 && u < 0.14) idx.push(i);
      }
      let best = Infinity;
      for (let a = 0; a < idx.length; a++) {
        for (let b = a + 1; b < idx.length; b++) {
          const du = (uv[2 * idx[a]] - uv[2 * idx[b]]) * uToMm;
          const dt = (uv[2 * idx[a] + 1] - uv[2 * idx[b] + 1]) * tToMm;
          const d = Math.hypot(du, dt);
          if (d > 1e-6 && d < best) best = d;
        }
      }
      return { nnMm: best, nInBand: idx.length };
    };

    // Per-t-band seed count (bg points only, i.e. NOT on a constraint chain —
    // approximate by t-band; the interesting bands are the rib bands vs the
    // dead-zone t≈0.44-0.49). Reveals whether a design redistributes density.
    const tBands: Array<[number, number]> = [
      [0.38, 0.42],
      [0.42, 0.44],
      [0.44, 0.49],
      [0.49, 0.54],
      [0.54, 0.62],
    ];
    const bandHist = (uv: number[]): number[] =>
      tBands.map(([lo, hi]) => {
        let c = 0;
        for (let i = 0; i < uv.length / 2; i++) {
          const t = uv[2 * i + 1];
          if (t >= lo && t < hi) c++;
        }
        return c;
      });

    const measure = (
      tag: string,
      cfg: Parameters<typeof seedFromComplex>[5],
    ): Record<string, number | string | boolean | number[]> => {
      const t0 = Date.now();
      const s = seedFromComplex(complex, domain, 0.3, sampler, 0.15, cfg);
      const n = s.uv.length / 2;
      const projFull = Math.round((n * 2) * 42); // ~2 tris/pt at seed, ×42 pot
      const bump = bumpNN(s.uv);
      const rec = {
        tag,
        seedPts: n,
        cEdges: s.cEdges.length,
        bumpNNmm: +bump.nnMm.toFixed(4),
        bumpPts: bump.nInBand,
        tBandHist: bandHist(s.uv),
        seedTrisProjFull: projFull,
        ms: Date.now() - t0,
      };
      // eslint-disable-next-line no-console
      console.log(`[ribAware ${tag}]`, JSON.stringify(rec));
      writeFileSync(`${OUT}/diag_${tag}.json`, JSON.stringify(rec, null, 2));
      return rec;
    };

    const base = {
      tolMm: 0.01,
      hMinMm: 0.09,
      maxLevel: 5,
      uSplit: true,
    } as const;

    // Reference: plain LEVER A (u-split on = the 8.3M projection config).
    measure('leverA_uSplit', { ...base });
    // Reference: LEVER A t-only.
    measure('leverA_tOnly', { ...base, uSplit: false });
    // Design (a): chain-distance mask, band 1.0mm, u-split off (t-needle break).
    measure('mask_b1.0_tOnly', { ...base, uSplit: false, ribAwareMode: 'mask', ribBandMm: 1.0 });
    // Design (a): mask, band 0.5mm (tighter — more cells escape the rib band).
    measure('mask_b0.5_tOnly', { ...base, uSplit: false, ribAwareMode: 'mask', ribBandMm: 0.5 });
    // Design (a): mask, band 2.0mm (wider — fewer cells split; risk starving bump).
    measure('mask_b2.0_tOnly', { ...base, uSplit: false, ribAwareMode: 'mask', ribBandMm: 2.0 });
    // Design (c): θ-averaged residual t-sag (rib-immune by construction).
    measure('thetaAvg', { ...base, ribAwareMode: 'thetaAvg' });
  }, 30 * 60 * 1000);
});
