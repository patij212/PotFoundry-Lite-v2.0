/**
 * densifyRail.test.ts — the densifyRail arc-length contract (Step-3 prerequisite).
 *
 * densifyRail's job is to insert points so that EVERY consecutive 3D spacing is
 * ≤ maxSpacingMm — that is the precondition buildStations enforces. The original
 * implementation sized the subdivision count from the input segment's 3D CHORD but
 * then inserted EQUAL-PARAMETER points. On a curved/relief path the chord
 * UNDER-estimates the true arclength, so the equal-parameter sub-segments exceed
 * maxSpacingMm and buildStations throws (measured on 88-99% of real-relief rails in
 * the Step-2 de-risk). This test pins the actual contract — max 3D spacing ≤ cap —
 * on a rippled cylinder where chord ≪ arc, so the fix (arc-length-correct
 * subdivision) is verifiable and protected against regression.
 *
 * @module fidelity/bandRemesh/densifyRail.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { densifyRail } from './stitch';
import type { StationPoint } from './stations';

/** Max consecutive 3D spacing (mm) along a (u,t) polyline. */
function maxSpacing3D(rail: StationPoint[], sampler: SyntheticCylinderSampler): number {
  let max = 0;
  for (let i = 1; i < rail.length; i++) {
    const a = sampler.position(rail[i - 1].u, rail[i - 1].t);
    const b = sampler.position(rail[i].u, rail[i].t);
    max = Math.max(max, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return max;
}

describe('densifyRail — arc-length spacing contract', () => {
  // A rippled cylinder: a straight (u,t) rail spanning a wide u-arc has chord ≪ arc,
  // and the ripple adds local bulging — the exact regime where equal-parameter
  // subdivision (sized from the chord) under-resolves.
  const sampler = new SyntheticCylinderSampler(50, 100, 8, 12);

  it('CONTRACT: every consecutive 3D spacing ≤ maxSpacingMm on a wide curved rail', () => {
    // 2-point rail spanning half the circumference at mid-height (chord = diameter
    // ≈ 100mm, true arc ≈ 157mm + ripple — chord badly under-estimates arclength).
    const rail: StationPoint[] = [{ u: 0, t: 0.5 }, { u: 0.5, t: 0.5 }];
    const maxSpacingMm = 2.0;
    const dense = densifyRail(rail, sampler, maxSpacingMm);

    expect(dense.length).toBeGreaterThan(2);
    // Allow a hair of f32/interp slack but nothing near a full extra cell.
    expect(maxSpacing3D(dense, sampler)).toBeLessThanOrEqual(maxSpacingMm * 1.02);
  });

  it('CONTRACT: holds for a tighter cap and a t-spanning rail too', () => {
    const rail: StationPoint[] = [{ u: 0.2, t: 0.1 }, { u: 0.55, t: 0.9 }];
    const maxSpacingMm = 1.0;
    const dense = densifyRail(rail, sampler, maxSpacingMm);
    expect(maxSpacing3D(dense, sampler)).toBeLessThanOrEqual(maxSpacingMm * 1.02);
  });

  it('preserves the original endpoints exactly (anchor preservation)', () => {
    const rail: StationPoint[] = [{ u: 0.1, t: 0.3 }, { u: 0.4, t: 0.7 }];
    const dense = densifyRail(rail, sampler, 1.5);
    expect(dense[0]).toEqual({ u: 0.1, t: 0.3 });
    expect(dense[dense.length - 1]).toEqual({ u: 0.4, t: 0.7 });
  });

  it('preserves original interior vertices (multi-segment rail)', () => {
    const rail: StationPoint[] = [
      { u: 0.0, t: 0.2 },
      { u: 0.15, t: 0.5 },
      { u: 0.3, t: 0.8 },
    ];
    const dense = densifyRail(rail, sampler, 1.5);
    // Each original vertex must still appear (exact) in the densified rail.
    for (const v of rail) {
      expect(dense.some((p) => p.u === v.u && p.t === v.t)).toBe(true);
    }
  });

  it('is a near no-op on an already-fine smooth rail (no spurious explosion)', () => {
    // A short rail whose single segment is already under the cap should not be
    // over-densified beyond what the arclength requires.
    const rail: StationPoint[] = [{ u: 0.5, t: 0.5 }, { u: 0.51, t: 0.5 }];
    const dense = densifyRail(rail, new SyntheticCylinderSampler(50, 100), 5.0);
    // ~0.01 u ≈ 3.1mm arc < 5mm cap ⇒ no interior points needed.
    expect(dense.length).toBe(2);
  });
});
