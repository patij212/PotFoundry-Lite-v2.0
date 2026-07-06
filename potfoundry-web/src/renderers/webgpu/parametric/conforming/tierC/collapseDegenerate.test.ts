import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import {
  collapseDegenerateFaces,
  countZeroAreaFaces,
} from './collapseDegenerate';

// Smooth cylinder sampler (r=50, H=40): a vertical generator line (fixed u)
// lifts to a 3D STRAIGHT line, so a face built from three points on one
// generator is EXACTLY zero-area — the genuine degenerate class.
function cylinderSampler(): GpuSurfaceSampler {
  const R = 50;
  const H = 40;
  const RES_U = 256;
  const RES_T = 64;
  const TAU = 2 * Math.PI;
  const grid = new Float32Array(RES_U * RES_T * 3);
  for (let row = 0; row < RES_T; row++) {
    const t = row / (RES_T - 1);
    for (let col = 0; col < RES_U; col++) {
      const u = col / RES_U;
      const base = (row * RES_U + col) * 3;
      grid[base] = R * Math.cos(TAU * u);
      grid[base + 1] = R * Math.sin(TAU * u);
      grid[base + 2] = t * H;
    }
  }
  return new GpuSurfaceSampler(grid, RES_U, RES_T);
}

function nonManifoldByIndex(tris: number[]): number {
  const use = new Map<string, number>();
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of use.values()) if (n > 2) bad++;
  return bad;
}

describe('Tier-C degenerate-face collapse post-pass', () => {
  it('welds injected zero-area faces to 0, holding manifoldness', () => {
    const sampler = cylinderSampler();
    // Vertices: a—m—b on one vertical generator (m on the segment), d/e off.
    // Proper faces (a,m,d), (m,b,d), (a,d,e) + the INJECTED degenerate
    // (a,b,m): three collinear points, exact 3D area 0.
    const uv = [
      0.1, 0.4, // 0 = a
      0.1, 0.5, // 1 = m (on the a—b generator segment)
      0.1, 0.6, // 2 = b
      0.104, 0.5, // 3 = d
      0.108, 0.42, // 4 = e
    ];
    const tris = [
      0, 1, 3, // a m d
      1, 2, 3, // m b d
      0, 3, 4, // a d e
      0, 2, 1, // a b m — DEGENERATE (collinear)
    ];
    expect(countZeroAreaFaces(sampler, { uv, tris })).toBe(1);

    const out = collapseDegenerateFaces(sampler, { uv, tris });
    expect(out.collapsed).toBeGreaterThanOrEqual(1);
    expect(out.verticesMerged).toBeGreaterThanOrEqual(1);
    expect(countZeroAreaFaces(sampler, out)).toBe(0);
    expect(nonManifoldByIndex(out.tris)).toBe(0);
    // Non-degenerate geometry survives: at least the two clean faces remain.
    expect(out.tris.length / 3).toBeGreaterThanOrEqual(2);
  });

  it('no-op on a clean mesh (byte-identical triangles)', () => {
    const sampler = cylinderSampler();
    const uv = [0.1, 0.4, 0.12, 0.4, 0.11, 0.5];
    const tris = [0, 1, 2];
    const out = collapseDegenerateFaces(sampler, { uv, tris });
    expect(out.collapsed).toBe(0);
    expect(out.verticesMerged).toBe(0);
    expect(out.tris).toEqual(tris);
  });
});
