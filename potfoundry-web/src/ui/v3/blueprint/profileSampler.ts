/**
 * profileSampler — CPU cross-section math for the Blueprint SVG.
 *
 * Samples the outer profile r(z) (flare + bell, NO style displacement) and
 * derives the inner wall (rOuter − t_wall, floored at 0.5mm).
 *
 * Pure functions only — no store access, no React.
 */

import { baseRadius } from '../../../geometry/profile';
import { GeometryParams } from '../../../state/types';

export interface ProfileSample {
  z: number;
  rOuter: number;
  rInner: number;
}

export interface ProfileGeometry {
  /** n+1 points, z from 0 (base) to H (rim) */
  samples: ProfileSample[];
  /** maximum rOuter across all samples — for viewBox scaling */
  maxR: number;
  H: number;
  topOD: number;
  bottomOD: number;
}

/**
 * Sample the pot's outer + inner profile at n+1 evenly-spaced heights.
 *
 * @param g  - geometry parameters (must not be null/undefined)
 * @param n  - number of intervals (default 48 → 49 samples)
 */
export function sampleProfile(g: GeometryParams, n = 48): ProfileGeometry {
  const { H, top_od, bottom_od, t_wall, expn, bellAmp, bellCenter, bellWidth } = g;

  const Rb = bottom_od / 2;
  const Rt = top_od / 2;
  // bell params share the same camelCase keys as StyleOptions — no renaming needed
  const bellOpts = { bellAmp, bellCenter, bellWidth };

  const samples: ProfileSample[] = [];
  let maxR = 0;

  for (let i = 0; i <= n; i++) {
    const z = (i / n) * H;
    const rOuter = baseRadius(z, H, Rb, Rt, expn, bellOpts);
    const rInner = Math.max(rOuter - t_wall, 0.5);
    samples.push({ z, rOuter, rInner });
    if (rOuter > maxR) maxR = rOuter;
  }

  return { samples, maxR, H, topOD: top_od, bottomOD: bottom_od };
}
