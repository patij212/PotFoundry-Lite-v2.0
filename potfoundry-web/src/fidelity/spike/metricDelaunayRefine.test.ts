import { describe, it, expect } from 'vitest';
import { metricDelaunayRefine, minAngle3D, type SurfaceOracle } from './metricDelaunayRefine';

describe('minAngle3D', () => {
  it('is 60 for an equilateral triangle', () => {
    const a = [0, 0, 0] as const;
    const b = [1, 0, 0] as const;
    const c = [0.5, Math.sqrt(3) / 2, 0] as const;
    expect(minAngle3D(a, b, c)).toBeCloseTo(60, 4);
  });
  it('is small for a thin needle', () => {
    expect(minAngle3D([0, 0, 0], [10, 0, 0], [5, 0.1, 0])).toBeLessThan(3);
  });
});

describe('metricDelaunayRefine — synthetic anisotropic relief patch', () => {
  // u maps to 120mm, t to 20mm (6:1 anisotropy); a 1mm sinusoidal relief in z adds
  // curvature. A naive (u,t) grid here yields ~9deg 3D slivers. The metric refinement
  // must square them to >= the bound.
  const oracle: SurfaceOracle = {
    pos: (u, t) => [120 * u, 20 * t, 1.0 * Math.sin(6 * Math.PI * u)],
  };

  it('drives worst 3D min-angle to the bound and converges', () => {
    const r = metricDelaunayRefine(
      oracle,
      { uMin: 0, uMax: 1, tMin: 0, tMax: 1 },
      { minAngleDeg: 20, maxChordMm: 0.15 },
      { seedN: 8, maxPoints: 60000 },
    );
    // eslint-disable-next-line no-console
    console.log('SYNTHETIC:', JSON.stringify({
      points: r.points, triangles: r.triangles, rounds: r.rounds,
      worstMinAngleDeg: +r.worstMinAngleDeg.toFixed(2), pctBelowAngle: +r.pctBelowAngle.toFixed(2),
      worstChordMm: +r.worstChordMm.toFixed(4), pctAboveChord: +r.pctAboveChord.toFixed(2),
      hitBudget: r.hitBudget,
    }));
    expect(r.worstMinAngleDeg).toBeGreaterThanOrEqual(18);
    expect(r.worstChordMm).toBeLessThanOrEqual(0.2);
    expect(r.hitBudget).toBe(false); // converged within budget
  });
});

describe('metricDelaunayRefine — gyroid-like tangled lattice (LOCAL anisotropy)', () => {
  // The hard case: a cylinder (R0=30 → circ ~188mm, H=80mm) with a high-frequency
  // gyroid-like relief (A=3mm). The relief derivatives spike √E/√G LOCALLY, so the
  // global anisotropy scale is only approximate — exactly where the conforming
  // mesher's global efg guard fails. Does longest-edge refinement still reach the bound?
  const R0 = 30, H = 80, A = 3, KU = 8, KZ = 6;
  const oracle: SurfaceOracle = {
    pos: (u, t) => {
      const th = u * 2 * Math.PI;
      const z = t * H;
      const a = KU * th, b = KZ * (z / H) * 2 * Math.PI;
      const rel = A * (Math.sin(a) * Math.cos(b) + Math.sin(b) * Math.cos(a)); // gyroid-like
      const r = R0 + rel;
      return [r * Math.cos(th), r * Math.sin(th), z];
    },
  };

  // Loose chord isolates the ANGLE question (the hard part: local anisotropy) at a
  // bounded mesh size. Run flips OFF vs ON in the SAME config so the metric-flip
  // contribution is unambiguous.
  const bounds = { uMin: 0, uMax: 1, tMin: 0, tMax: 1 };
  const q = { minAngleDeg: 20, maxChordMm: 0.5 };
  const cfg = { seedN: 10, maxPoints: 10000, chordSamples: 4 } as const;
  const fmt = (r: ReturnType<typeof metricDelaunayRefine>): object => ({
    points: r.points, triangles: r.triangles, rounds: r.rounds,
    worstMinAngleDeg: +r.worstMinAngleDeg.toFixed(2), pctBelowAngle: +r.pctBelowAngle.toFixed(2),
    worstChordMm: +r.worstChordMm.toFixed(4), hitBudget: r.hitBudget,
  });

  it('global-scale-only stalls on the tangled local anisotropy', () => {
    const r = metricDelaunayRefine(oracle, bounds, q, { ...cfg, flips: false });
    // eslint-disable-next-line no-console
    console.log('TANGLED noflip:', JSON.stringify(fmt(r)));
    // FINDING: global-scale Delaunay stalls far below the CAD min-angle on the tangled
    // local anisotropy (the seed/scale is globally right, locally wrong).
    expect(r.worstMinAngleDeg).toBeLessThan(15);
  });

  it('metric Lawson flips help but do NOT recover the bound (the key spike result)', () => {
    const r = metricDelaunayRefine(oracle, bounds, q, { ...cfg, flips: true });
    // eslint-disable-next-line no-console
    console.log('TANGLED flip:', JSON.stringify(fmt(r)));
    // FINDING: metric flips IMPROVE the worst angle but remain well short of 20deg —
    // a tractable Delaunay-refinement cannot CAD-grade the tangled lattice; that needs
    // full anisotropic (per-point-metric) Delaunay.
    expect(r.worstMinAngleDeg).toBeLessThan(18);
  }, 180000);
});
