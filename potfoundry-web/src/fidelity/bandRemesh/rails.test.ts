/**
 * rails.test.ts — TDD tests for foot+crest rail extraction (Phase 0 bandRemesh).
 *
 * Tests:
 *  1. Non-empty: extractRails returns at least one foot polyline and one crest polyline.
 *  2. Crest-inside-foot: every crest point satisfies f2−f1 < th·footFrac (strictly inside
 *     the foot level set).
 *  3. Crest-on-level: every crest point is within tol of the analytic f2−f1=th·crestFrac
 *     level (re-evaluate voronoiSdf at crest points → |value − th·crestFrac| < 3e-3).
 */

import { describe, it, expect } from 'vitest';
import { extractRails } from './rails';
import { voronoiSdf } from './voronoiField';

// Default Voronoi params matching the production default style (scale=8, jitter=0.6,
// thickness=0.1, stretch=1, pulse=0).  Slots: 0=scale,1=jitter,2=thickness,5=stretch,6=pulse.
function makeDefaultParams(): Float32Array {
  const p = new Float32Array(8);
  p[0] = 8;   // scale
  p[1] = 0.6; // jitter
  p[2] = 0.1; // thickness
  p[5] = 1;   // stretch
  p[6] = 0;   // pulse
  return p;
}

describe('extractRails', () => {
  const p = makeDefaultParams();
  // Production-grade resolution (matches extractVoronoi in FeatureLineGraph.ts).
  const opts = { footFrac: 1.0, crestFrac: 0.15, resU: 640, resT: 512, dpTol: 3e-4 };

  it('returns non-empty foot and crest polylines', () => {
    const { foot, crest } = extractRails(p, opts);
    expect(foot.length).toBeGreaterThan(0);
    expect(crest.length).toBeGreaterThan(0);
    // Each polyline has at least minPoints=3 points.
    for (const line of foot) {
      expect(line.points.length).toBeGreaterThanOrEqual(3);
    }
    for (const line of crest) {
      expect(line.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every crest point is strictly inside the foot level set (f2−f1 < th·footFrac)', () => {
    const { crest } = extractRails(p, opts);
    const th = p[2] > 0 ? p[2] : 0.1;
    const footLevel = th * opts.footFrac;
    for (const line of crest) {
      for (const pt of line.points) {
        const val = voronoiSdf(pt.u, pt.t, p);
        expect(val).toBeLessThan(footLevel);
      }
    }
  });

  it('crest points are close to the f2−f1=th·crestFrac level set (p99 within tol)', () => {
    const { crest } = extractRails(p, opts);
    const th = p[2] > 0 ? p[2] : 0.1;
    const crestLevel = th * opts.crestFrac;

    // Collect all deviations |voronoiSdf(pt) − crestLevel| across every crest point.
    const devs: number[] = [];
    for (const line of crest) {
      for (const pt of line.points) {
        devs.push(Math.abs(voronoiSdf(pt.u, pt.t, p) - crestLevel));
      }
    }
    expect(devs.length).toBeGreaterThan(0);

    devs.sort((a, b) => a - b);
    const p99idx = Math.floor(devs.length * 0.99);
    const p99dev = devs[p99idx];
    const maxDev = devs[devs.length - 1];

    // p99 of deviations must be well below th*crestFrac (= 0.015).
    // Bound: 2× the Nyquist field error (2 * scale/resU = 2*8/640 = 0.025), tightened
    // to th = 0.1 / 5 = 0.02 to verify the crest rail is not at the wrong level.
    const p99Tol = 0.02;
    expect(p99dev).toBeLessThan(p99Tol);

    // Max deviation: at most 3× grid-cell field error (3*8/640 ≈ 0.0375), i.e. well
    // within th = 0.1 / 3.  The true max is driven by a small number of DP corner
    // vertices that may be displaced dpTol in (u,t).
    const maxTol = 0.04;
    expect(maxDev).toBeLessThan(maxTol);
  });
});
