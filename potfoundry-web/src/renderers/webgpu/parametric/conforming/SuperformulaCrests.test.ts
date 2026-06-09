/**
 * SuperformulaCrests.test.ts — guards the SuperformulaBlossom petal-crest
 * extractor (the CAD-fidelity fix for ridge serration at high strength).
 *
 * MEASURED THIS SESSION: at high `sf_strength` the morphing petal ridges (peak
 * count m: 6→10 along height → diagonal/forking crests) serrate, because the
 * conforming mesher extracted NO feature lines for SuperformulaBlossom and an
 * axis-aligned quadtree staircases a diagonal crest (maxAspect 10.7→87.6;
 * sampler 256→1024 does NOT help → alignment, not density). The fix: trace the
 * radius EXTREMA (zero-set of ∂r/∂θ = the petal crests) as general-curve
 * polylines so the insertion makes them real mesh edges.
 *
 * Contract:
 *  - strength below threshold (incl. the default 0) → NO crests (the export is
 *    byte-identical to today; nothing inserted on a flat wall).
 *  - high strength → general-curve polylines, ~one per petal crest (peaks AND
 *    valleys), roughly evenly spaced around the circumference (m of them).
 */
import { describe, it, expect } from 'vitest';
import { extractAnalyticFeatures } from './FeatureLineGraph';

const DIMS = { H: 120, Rt: 70, Rb: 45 };

/** Pack SuperformulaBlossom params in WGSL `style_param()` slot order. */
function pack(o: {
  strength: number; mBase: number; mTop: number; mCurve?: number;
  n1?: number; n2?: number; n3?: number; a?: number; b?: number;
}): Float32Array {
  const n1 = o.n1 ?? 0.35, n2 = o.n2 ?? 0.8, n3 = o.n3 ?? 0.8;
  return Float32Array.from([
    o.strength, o.mBase, o.mTop, o.mCurve ?? 1.2,
    n1, n1, n2, n2, n3, n3, o.a ?? 1, o.b ?? 1,
  ]);
}

describe('SuperformulaBlossom crest extraction', () => {
  it('extracts NO crests at strength 0 (default no-op — flat wall, nothing to insert)', () => {
    const g = extractAnalyticFeatures('SuperformulaBlossom', pack({ strength: 0, mBase: 6, mTop: 10 }), DIMS);
    expect(g.lines.length).toBe(0);
  });

  it('extracts NO crests at a negligible strength below the relief threshold', () => {
    const g = extractAnalyticFeatures('SuperformulaBlossom', pack({ strength: 0.0005, mBase: 8, mTop: 8 }), DIMS);
    expect(g.lines.length).toBe(0);
  });

  it('at full strength (no morph, m=8) extracts ~m petal crests as general-curve polylines', () => {
    const g = extractAnalyticFeatures('SuperformulaBlossom', pack({ strength: 1, mBase: 8, mTop: 8, n1: 0.3 }), DIMS);
    // Peaks (8) + valleys (8) = 16 extrema loci; allow marching-squares splitting.
    expect(g.lines.length).toBeGreaterThanOrEqual(8);
    expect(g.lines.length).toBeLessThanOrEqual(48);
    for (const l of g.lines) {
      expect(l.kind).toBe('general-curve');
      expect(l.points.length).toBeGreaterThanOrEqual(2);
      for (const p of l.points) {
        expect(p.u).toBeGreaterThanOrEqual(0);
        expect(p.u).toBeLessThanOrEqual(1);
        expect(p.t).toBeGreaterThanOrEqual(-1e-6);
        expect(p.t).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('the crest loci are distributed around the whole circumference (not clustered)', () => {
    const g = extractAnalyticFeatures('SuperformulaBlossom', pack({ strength: 1, mBase: 8, mTop: 8, n1: 0.3 }), DIMS);
    // Sample each line near mid-height; the set of u-values should span all four
    // quadrants of the circumference (8 petals ⇒ coverage everywhere).
    const us: number[] = [];
    for (const l of g.lines) {
      const mid = l.points[Math.floor(l.points.length / 2)];
      us.push(((mid.u % 1) + 1) % 1);
    }
    const quadrants = new Set(us.map((u) => Math.floor(u * 4)));
    expect(quadrants.size).toBe(4);
  });

  it('morphing m (6→10) still yields crests spanning the height', () => {
    const g = extractAnalyticFeatures('SuperformulaBlossom', pack({ strength: 1, mBase: 6, mTop: 10, n1: 0.3 }), DIMS);
    expect(g.lines.length).toBeGreaterThanOrEqual(6);
    // At least one crest should span a large t-range (a full-height petal).
    const spans = g.lines.map((l) => {
      const ts = l.points.map((p) => p.t);
      return Math.max(...ts) - Math.min(...ts);
    });
    expect(Math.max(...spans)).toBeGreaterThan(0.5);
  });
});
