import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';

const baseOpts: SizingOptions = {
  maxSagMm: 0.1,
  minEdgeMm: 0.1,
  maxEdgeMm: 20,
  gradeRatio: 2,
  resU: 33,
  resT: 9,
};

describe('MetricSizingField — sagitta law (flat cylinder)', () => {
  it('h ≈ sqrt(8·maxSag·R0) ≈ 6.32mm at R0=50, maxSag=0.1 within 5%', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const field = new MetricSizingField(s, baseOpts);
    // κ = 1/R0 = 0.02 → h = sqrt(8·0.1/0.02) = sqrt(40) = 6.3246
    const expected = Math.sqrt(8 * 0.1 * 50);
    const h = field.edgeLength(0.37, 0.5);
    expect(Math.abs(h - expected) / expected).toBeLessThan(0.05);
  });

  it('clamps to maxEdge when the raw sagitta length would exceed it', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const field = new MetricSizingField(s, { ...baseOpts, maxEdgeMm: 2 });
    const h = field.edgeLength(0.37, 0.5);
    expect(h).toBeLessThanOrEqual(2 + 1e-9);
  });
});

describe('MetricSizingField — Lipschitz grading', () => {
  it('every adjacent grid node ratio ≤ gradeRatio after construction', () => {
    // A high-amplitude, high-frequency ripple makes curvature (hence raw h)
    // vary sharply across u → exercises the grading clamp.
    const s = new SyntheticCylinderSampler(50, 120, 8, 12);
    const opts: SizingOptions = {
      maxSagMm: 0.05,
      minEdgeMm: 0.05,
      maxEdgeMm: 20,
      gradeRatio: 1.5,
      resU: 65,
      resT: 9,
    };
    const field = new MetricSizingField(s, opts);
    const grid = field.debugGrid();
    const { resU, resT } = opts;
    const at = (i: number, j: number): number => grid[j * resU + i];
    const ratioOk = (a: number, b: number): boolean =>
      Math.max(a, b) / Math.min(a, b) <= opts.gradeRatio + 1e-6;
    for (let j = 0; j < resT; j++) {
      for (let i = 0; i < resU; i++) {
        const h = at(i, j);
        // u neighbor (periodic)
        expect(ratioOk(h, at((i + 1) % resU, j))).toBe(true);
        // t neighbor (clamped)
        if (j + 1 < resT) expect(ratioOk(h, at(i, j + 1))).toBe(true);
      }
    }
  });
});

describe('MetricSizingField — curvatureFloor + maxKappa (STAGE-4 analytic floor, opt-in)', () => {
  it('curvatureFloor BELOW the sampler κ is a no-op (byte-identical grid)', () => {
    const s = new SyntheticCylinderSampler(50, 120); // κ = 1/50 = 0.02
    const base = new MetricSizingField(s, baseOpts).debugGrid();
    // Floor 0.001 ≪ 0.02 → max(κ, floor) = κ → grid unchanged.
    const floored = new MetricSizingField(s, { ...baseOpts, curvatureFloor: () => 0.001 }).debugGrid();
    expect(floored.length).toBe(base.length);
    for (let i = 0; i < base.length; i++) expect(floored[i]).toBeCloseTo(base[i], 12);
  });

  it('curvatureFloor ABOVE the sampler κ refines h to the floor sagitta', () => {
    const s = new SyntheticCylinderSampler(50, 120); // κ = 0.02 → h ≈ 6.32
    // Uniform floor κ=0.5 → h = sqrt(8·0.1/0.5) = sqrt(1.6) ≈ 1.265 (uniform → no grading shift).
    const field = new MetricSizingField(s, { ...baseOpts, curvatureFloor: () => 0.5 });
    const h = field.edgeLength(0.37, 0.5);
    expect(h).toBeCloseTo(Math.sqrt((8 * 0.1) / 0.5), 2);
  });

  it('maxKappa caps κ so a high-curvature ripple cannot drive h below the cap sagitta', () => {
    const s = new SyntheticCylinderSampler(50, 120, 8, 12); // sharp ripple → high κ → tiny h
    const uncapped = new MetricSizingField(s, baseOpts);
    const capped = new MetricSizingField(s, { ...baseOpts, maxKappa: 0.02 });
    // The capped field's minimum edge length must be no smaller than the uncapped one.
    const minOf = (f: MetricSizingField): number => {
      const g = f.debugGrid();
      let m = Infinity;
      for (let i = 0; i < g.length; i++) if (g[i] < m) m = g[i];
      return m;
    };
    expect(minOf(capped)).toBeGreaterThan(minOf(uncapped));
    // κ capped at 0.02 → h floored at sqrt(8·0.1/0.02) ≈ 6.32 (before grading/clamp).
    expect(minOf(capped)).toBeGreaterThan(0.9 * Math.sqrt((8 * 0.1) / 0.02));
  });
});
