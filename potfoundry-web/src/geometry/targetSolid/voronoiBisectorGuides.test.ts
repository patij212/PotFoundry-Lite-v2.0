import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { compileGeneratedTargetProgramBackends } from './validatedResidualProgram';
import { createSinglePatchAnnularRadialSolidTargetBinding } from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import { integerPcg2dUnitHash } from './integerPcg2dHash';
import {
  voronoiBisectorSegmentsUv,
  voronoiCenterCellular,
  voronoiNearestCenterId,
  type VoronoiLatticeParams,
} from './voronoiBisectorGuides';

// Certified Voronoi-bubble lattice (gaugeable defaults: scale 8, jitter 0.8,
// pulse 0, zStretch 1 -> an 8x8 cellular lattice over the (u,v) unit square,
// period = max(1, floor(scale+0.5)) = 8).
const BUBBLE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};

function wrap(value: number, period: number): number {
  return value - Math.floor(value / period) * period;
}

// Distances from a cellular point to every center in the surrounding window,
// recomputed from the SAME hash the target uses (independent of the module's
// internal center enumeration).
function windowDistances(cx: number, cy: number): number[] {
  const dists: number[] = [];
  const baseX = Math.floor(cx);
  const baseY = Math.floor(cy);
  for (let oy = -2; oy <= 2; oy += 1) {
    for (let ox = -2; ox <= 2; ox += 1) {
      const cellX = baseX + ox;
      const cellY = baseY + oy;
      const [hx, hy] = integerPcg2dUnitHash(wrap(cellX, BUBBLE.period), cellY);
      const centerX = cellX + BUBBLE.jitter * hx;
      const centerY = cellY + BUBBLE.jitter * hy;
      dists.push(Math.hypot(centerX - cx, centerY - cy));
    }
  }
  dists.sort((a, b) => a - b);
  return dists;
}

describe('voronoi bisector guides', () => {
  it('places lattice centers exactly where the target program does', () => {
    // voronoiRadius: center = cell + jitter * pcg2dUnit(wrap(cellX, period), cellY).
    for (const [cellX, cellY] of [
      [3, 5],
      [0, 0],
      [7, 2],
    ] as const) {
      const [hx, hy] = integerPcg2dUnitHash(wrap(cellX, BUBBLE.period), cellY);
      const c = voronoiCenterCellular(BUBBLE, cellX, cellY);
      expect(c[0]).toBeCloseTo(cellX + BUBBLE.jitter * hx, 12);
      expect(c[1]).toBeCloseTo(cellY + BUBBLE.jitter * hy, 12);
    }
  });

  it('nearest-center id is constant off bisectors and flips across them', () => {
    // A lattice site is deep inside its own Voronoi cell -> its id is its cell.
    const site = voronoiCenterCellular(BUBBLE, 4, 4);
    expect(voronoiNearestCenterId(BUBBLE, site[0], site[1])).toBe('4,4');
    // Straddle a bisector: sample just off each side of a mid-segment point; the
    // two nearest-center ids must differ (that is what "straddle" means).
    const seg = voronoiBisectorSegmentsUv(BUBBLE).find((s) => {
      const mu = (s.a[0] + s.b[0]) / 2;
      const mv = (s.a[1] + s.b[1]) / 2;
      return mu > 0.15 && mu < 0.85 && mv > 0.15 && mv < 0.85;
    });
    expect(seg).toBeDefined();
    if (seg === undefined) return;
    const mu = ((seg.a[0] + seg.b[0]) / 2) * BUBBLE.scale;
    const mv = ((seg.a[1] + seg.b[1]) / 2) * BUBBLE.scale * BUBBLE.zStretch;
    let du = seg.b[0] - seg.a[0];
    let dv = seg.b[1] - seg.a[1];
    const len = Math.hypot(du, dv);
    [du, dv] = [(-dv / len) * BUBBLE.scale, (du / len) * BUBBLE.scale];
    const e = 0.05;
    expect(voronoiNearestCenterId(BUBBLE, mu + e * du, mv + e * dv)).not.toBe(
      voronoiNearestCenterId(BUBBLE, mu - e * du, mv - e * dv)
    );
  });

  it('emits Voronoi-edge segments: every point is equidistant to its two nearest centers, with none closer', () => {
    const segments = voronoiBisectorSegmentsUv(BUBBLE);
    expect(segments.length).toBeGreaterThan(8);
    for (const seg of segments) {
      // Sample interior points of the segment (endpoints can be triple points).
      for (const w of [0.25, 0.5, 0.75]) {
        const u = seg.a[0] + (seg.b[0] - seg.a[0]) * w;
        const v = seg.a[1] + (seg.b[1] - seg.a[1]) * w;
        // (u,v) -> cellular: cx = u*scale + pulse*scale, cy = v*scale*zStretch.
        const cx = u * BUBBLE.scale + BUBBLE.pulse * BUBBLE.scale;
        const cy = v * BUBBLE.scale * BUBBLE.zStretch;
        const d = windowDistances(cx, cy);
        // Two nearest centers tie (this is a bisector)...
        expect(d[1] - d[0]).toBeLessThan(1e-6);
        // ...and no third center is strictly closer than the tie (real Voronoi edge).
        expect(d[2]).toBeGreaterThan(d[0] - 1e-9);
      }
    }
  });

  it('stays inside the unit square', () => {
    for (const seg of voronoiBisectorSegmentsUv(BUBBLE)) {
      for (const p of [seg.a, seg.b]) {
        expect(p[0]).toBeGreaterThanOrEqual(-1e-9);
        expect(p[0]).toBeLessThanOrEqual(1 + 1e-9);
        expect(p[1]).toBeGreaterThanOrEqual(-1e-9);
        expect(p[1]).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('segments coincide with real C0 kinks of the compiled Voronoi bubble target', () => {
    // Bisector LOCATIONS are relief-independent (relief only scales the pattern
    // amplitude, not where f1 kinks), so verify with a prominent relief where the
    // C0 kink clears the base wall's smooth curvature. If BUBBLE's lattice
    // constants match the real defaults, the perpendicular second difference of
    // the wall point spikes on a bisector and is small at a random interior
    // point. Closes the loop from the center model to the certified program.
    const canonicalInput = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY, H: 32, top_od: 30, bottom_od: 30, r_drain: 6 },
      'Voronoi',
      { v_morph: 0, v_relief: 2.0 },
      { superformulaSeamBlendDegrees: 30 }
    );
    const binding = createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput)
    );
    const outer = binding.programs.find((p) => p.patchId === 'outer-wall');
    expect(outer).toBeDefined();
    if (outer === undefined) return;
    const backends = compileGeneratedTargetProgramBackends(outer.programCanonicalJson);
    const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
    const point = (u: number, v: number): readonly [number, number, number] =>
      backends.evaluateFloat64(clamp01(u), clamp01(v)) as [number, number, number];
    const eps = 2e-4;
    // Perpendicular second difference of the 3D point norm across a direction.
    const secondDiff = (u: number, v: number, du: number, dv: number): number => {
      const c = point(u, v);
      const p = point(u + eps * du, v + eps * dv);
      const m = point(u - eps * du, v - eps * dv);
      return Math.hypot(p[0] - 2 * c[0] + m[0], p[1] - 2 * c[1] + m[1], p[2] - 2 * c[2] + m[2]);
    };

    const segments = voronoiBisectorSegmentsUv(BUBBLE).filter((s) => {
      const mu = (s.a[0] + s.b[0]) / 2;
      const mv = (s.a[1] + s.b[1]) / 2;
      return mu > 0.1 && mu < 0.9 && mv > 0.1 && mv < 0.9; // away from seam/base edges
    });
    expect(segments.length).toBeGreaterThan(5);
    const kinkDiffs: number[] = [];
    for (const s of segments) {
      const mu = (s.a[0] + s.b[0]) / 2;
      const mv = (s.a[1] + s.b[1]) / 2;
      let du = s.b[0] - s.a[0];
      let dv = s.b[1] - s.a[1];
      const len = Math.hypot(du, dv);
      // Perpendicular unit direction (crosses the kink).
      [du, dv] = [-dv / len, du / len];
      kinkDiffs.push(secondDiff(mu, mv, du, dv));
    }
    // Smooth baseline: random interior points, averaged over both axes.
    const smoothDiffs: number[] = [];
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i += 1) {
      const u = 0.1 + 0.8 * rand();
      const v = 0.1 + 0.8 * rand();
      smoothDiffs.push(Math.max(secondDiff(u, v, 1, 0), secondDiff(u, v, 0, 1)));
    }
    kinkDiffs.sort((a, b) => a - b);
    smoothDiffs.sort((a, b) => a - b);
    const median = (xs: number[]): number => xs[Math.floor(xs.length / 2)];
    // Kinks spike well above the smooth interior at prominent relief.
    expect(median(kinkDiffs)).toBeGreaterThan(3 * median(smoothDiffs));
  });
});
