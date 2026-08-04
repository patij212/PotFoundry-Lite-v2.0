/** THROWAWAY exploration (delete after) — confirm the GN wrong-well overstatement
 * reproduces on the real Gyroid rA + measure magnitude. Run:
 * npx vitest run src/fidelity/_exploreGyroidWrongwell.test.ts */
import { describe, it } from 'vitest';
import { projectPointToRadialSurface, type AnalyticRadiusFn } from './analyticSurfaceGate';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';
import type { StyleId } from '../geometry/types';

const TAU = 2 * Math.PI;

function brute2D(px: number, py: number, pz: number, rA: AnalyticRadiusFn, zMin: number, zMax: number, nT: number, nZ: number): number {
  let best = Infinity;
  for (let i = 0; i < nT; i++) {
    const th = (i / nT) * TAU;
    for (let j = 0; j <= nZ; j++) {
      const z = zMin + (zMax - zMin) * (j / nZ);
      const r = rA(th, z);
      const dx = px - r * Math.cos(th), dy = py - r * Math.sin(th), dz = pz - z;
      const f = dx * dx + dy * dy + dz * dz;
      if (f < best) best = f;
    }
  }
  return Math.sqrt(best);
}

describe('explore gyroid wrong-well', () => {
  it('measures single-GN vs 2D brute on coarse-mesh centroids', () => {
    const H = 120, Rb = 40, Rt = 50;
    const rA = buildAnalyticRadiusFn('GyroidManifold' as StyleId, {}, { H, Rb, Rt });
    const nu = 26, nt = 26;
    const nUv = nu + 1, nTv = nt + 1;
    const V: [number, number, number][] = [];
    for (let it = 0; it < nTv; it++) for (let iu = 0; iu < nUv; iu++) {
      const u = iu / nu, t = it / nt, th = TAU * u, z = t * H, r = rA(th, z);
      V.push([r * Math.cos(th), r * Math.sin(th), z]);
    }
    const tris: [number, number, number][] = [];
    for (let it = 0; it < nt; it++) for (let iu = 0; iu < nu; iu++) {
      const a = it * nUv + iu, b = a + 1, c = a + nUv, d = c + 1;
      tris.push([a, b, d], [a, d, c]);
    }
    let worstOver = 0, worstGn = 0, worstBr = 0, count = 0, overCount = 0;
    for (const [a, b, c] of tris) {
      const cx = (V[a][0] + V[b][0] + V[c][0]) / 3;
      const cy = (V[a][1] + V[b][1] + V[c][1]) / 3;
      const cz = (V[a][2] + V[b][2] + V[c][2]) / 3;
      const gn = projectPointToRadialSurface(cx, cy, cz, rA).dist;
      const br = brute2D(cx, cy, cz, rA, 0, H, 1536, 360);
      count++;
      if (gn - br > 0.02) overCount++;
      if (gn - br > worstOver) { worstOver = gn - br; worstGn = gn; worstBr = br; }
    }
    // eslint-disable-next-line no-console
    console.log(`[explore] facets=${count} overCount=${overCount} worstOver=${worstOver.toFixed(4)} gn=${worstGn.toFixed(4)} brute=${worstBr.toFixed(4)} ratio=${(worstGn / Math.max(worstBr, 1e-6)).toFixed(2)}x`);
  }, 120000);
});
