// _probe_loci.test.ts — DEV-ONLY cheapest discriminator (env PF_PROBE_LOCI=1).
// MEASURE-ONLY. Dumps the dense feature-truth loci composition for ArtDeco +
// GothicArches so we know whether vertex injection has loci to work with, and how
// the crest under-shoot relates to the relief-wall vs ridge vs crease families.
//
// Run: PF_PROBE_LOCI=1 npx vitest run research/bridge/_probe_loci.test.ts
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildFeatureTruth } from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
const TAU = 2 * Math.PI;

describe('probe loci', () => {
  it.skipIf(!process.env.PF_PROBE_LOCI)('dump truth families', () => {
    for (const style of ['ArtDeco', 'GothicArches', 'HarmonicRipple'] as StyleId[]) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
      const counts: Record<string, number> = {};
      let totalLenMm = 0;
      // sample crest depth: at each line midpoint, compare rA to row-mean
      const depths: number[] = [];
      for (const line of truth.lines) {
        const lbl = String(line.label ?? 'none');
        counts[lbl] = (counts[lbl] ?? 0) + 1;
        const p = line.points;
        if (p.length >= 2) {
          let du = p[1].u - p[0].u; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
          const dt = p[1].t - p[0].t;
          totalLenMm += Math.hypot(du * truth.uToMm, dt * truth.tToMm);
          const um = p[0].u + du / 2, tm = (p[0].t + p[1].t) / 2;
          const rHere = rA(TAU * um, tm * DIMS.H);
          // row mean
          let s = 0; const N = 256; const z = tm * DIMS.H;
          for (let i = 0; i < N; i++) s += rA(TAU * (i / N), z);
          depths.push(rHere - s / N);
        }
      }
      depths.sort((a, b) => a - b);
      const q = (f: number): number => depths.length ? depths[Math.min(depths.length - 1, Math.floor(f * depths.length))] : 0;
      // eslint-disable-next-line no-console
      console.log(`\n[${style}] lines=${truth.lines.length} totalLen=${totalLenMm.toFixed(0)}mm uToMm=${truth.uToMm.toFixed(1)} byLabel=${JSON.stringify(counts)}`);
      // eslint-disable-next-line no-console
      console.log(`  midpoint relief depth (rA-rowMean, mm): min=${q(0).toFixed(2)} p10=${q(0.1).toFixed(2)} median=${q(0.5).toFixed(2)} p90=${q(0.9).toFixed(2)} max=${q(0.999).toFixed(2)}`);
    }
    expect(true).toBe(true);
  }, 10 * 60 * 1000);
});
