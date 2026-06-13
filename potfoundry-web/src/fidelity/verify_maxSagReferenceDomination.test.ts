/**
 * verify_maxSagReferenceDomination.test.ts — #5, high accuracy: how much does the
 * curvature/maxSag refinement UNDER-refine crests because it reads the flattened
 * bilinear-256 surface instead of the true surface?
 *
 * The conforming refinement targets chord error <= maxSag, but evaluates the
 * surface via the bilinear GpuSurfaceSampler (DENSE_RES=256). At a crest, below
 * the grid spacing (1/256 in u) the bilinear surface is LOCALLY LINEAR, so the
 * chord error the refinement SEES collapses to ~0 while the TRUE chord error (vs
 * the exact cusp) stays large => the refinement is structurally BLIND to the
 * crest and stops refining there.
 *
 * Measures, for a crest flank cell of width du at the worst (outer, t=0.95) and a
 * mid (t=0.25) crest, the chord error of the SAME flat cell vs three surfaces:
 *   - bilinear-256 (what production maxSag sees)
 *   - bilinear-1024 (the proposed DENSE_RES fix)
 *   - exact f64 (the truth)
 * Dense barycentric sampling (N=28). If chord-vs-256 << chord-vs-exact at the
 * crest, maxSag cannot see the error at 256 and DENSE_RES must rise first.
 *
 * Pure CPU, read-only, no production change.
 */
import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { PositionSampler } from './metrics';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];

function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}
const bi256 = buildBilinear(256);
const bi1024 = buildBilinear(1024);

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}
function crestNear(t: number, uTarget: number): number {
  const m = mOf(t);
  let best = 0.5, bd = 9;
  for (let j = 1; (2 * j - 1) / (2 * m) < 1; j++) { const u = (2 * j - 1) / (2 * m); if (Math.abs(u - uTarget) < bd) { bd = Math.abs(u - uTarget); best = u; } }
  return best;
}

/** Max chord error of a flat triangle (vertices eval'd via `vertSurf`) vs the
 *  reference surface `refSurf`, dense barycentric N. */
function chord(vertSurf: PositionSampler, refSurf: PositionSampler, ua: number, ta: number, ub: number, tb: number, uc: number, tc: number, N: number): number {
  const Va = vertSurf.position(ua, ta) as V3, Vb = vertSurf.position(ub, tb) as V3, Vc = vertSurf.position(uc, tc) as V3;
  let m = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
    const a = i / N, b = j / N, c = 1 - a - b;
    const su = a * ua + b * ub + c * uc, st = a * ta + b * tb + c * tc;
    const r = refSurf.position(su, st) as V3;
    const d = Math.hypot(a * Va[0] + b * Vb[0] + c * Vc[0] - r[0], a * Va[1] + b * Vb[1] + c * Vc[1] - r[1], a * Va[2] + b * Vb[2] + c * Vc[2] - r[2]);
    if (d > m) m = d;
  }
  return m;
}

describe('VERIFY #5 maxSag reference-domination (bilinear-256 blindness at crests)', () => {
  it('chord error a crest flank cell shows vs 256 / 1024 / exact, swept by cell width', () => {
    const cases = [
      { name: 'WORST outer petal t=0.95', t: 0.95, uT: 0.974 },
      { name: 'MID petal         t=0.25', t: 0.25, uT: 0.518 },
    ];
    /* eslint-disable no-console */
    console.log('\n===== #5 maxSag REFERENCE-DOMINATION (flank chord vs sampler the refinement uses) =====');
    for (const c of cases) {
      console.log(`  ${c.name}:`);
      for (const k of [9, 10, 11, 12, 13]) {
        const du = 1 / (1 << k);
        const t0 = c.t, t1 = c.t + 1 / 128;
        const uc0 = crestNear(t0, c.uT), uc1 = crestNear(t1, c.uT);
        // flat flank triangle (crest edge -> +du), vertices ALWAYS eval'd via bi256
        // (production places vertices on the 256 grid); compare vs each reference.
        const vs256 = chord(bi256, bi256, uc0, t0, uc0 + du, t0, uc1 + du, t1, 28);
        const vs1024 = chord(bi256, bi1024, uc0, t0, uc0 + du, t0, uc1 + du, t1, 28);
        const vsExact = chord(bi256, exact, uc0, t0, uc0 + du, t0, uc1 + du, t1, 28);
        console.log(`     du=1/2^${k} (${(du * 471).toFixed(3)}mm circ): vs256(maxSag sees) ${vs256.toFixed(4)}mm | vs1024 ${vs1024.toFixed(4)}mm | vsEXACT(true) ${vsExact.toFixed(4)}mm`);
      }
    }
    console.log('  => if vs256 << vsEXACT at the crest, maxSag@256 is BLIND there; DENSE_RES must rise BEFORE refinement can help.');
    console.log('=======================================================================================\n');
    /* eslint-enable no-console */
    expect(cases.length).toBe(2);
  });
});
