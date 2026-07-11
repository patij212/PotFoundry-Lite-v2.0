import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import {
  MetricSizingField,
  MetricSizingWorkspace,
  type SizingOptions,
} from './MetricSizingField';
import {
  PeriodicBalancedQuadtree,
  QuadtreeRefinementEvidenceCache,
  QuadtreeRefinementHierarchy,
} from './PeriodicBalancedQuadtree';

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

describe('MetricSizingWorkspace — exact scale-probe reuse', () => {
  const sampler = new SyntheticCylinderSampler(50, 120, 8, 12);
  const opts: SizingOptions = {
    maxSagMm: 0.075,
    minEdgeMm: 0.2,
    maxEdgeMm: 9,
    gradeRatio: 1.35,
    resU: 33,
    resT: 11,
    curvatureFloor: (u, t) => 0.01 + 0.2 * u * t,
    maxKappa: 0.45,
  };
  const scales = [1 / 64, 0.125, 1, Math.SQRT2, 4];

  it('reproduces every legacy grid value exactly after scale, clamps, and grading', () => {
    const workspace = new MetricSizingWorkspace(sampler, opts);
    for (const targetScale of scales) {
      const legacy = new MetricSizingField(sampler, { ...opts, targetScale }).debugGrid();
      const reused = workspace.fieldAtScale(targetScale).debugGrid();
      expect(reused).toEqual(legacy);
    }
  });

  it('reproduces legacy balanced-quadtree leaf counts at every probe scale', () => {
    const workspace = new MetricSizingWorkspace(sampler, opts);
    const evidence = new QuadtreeRefinementEvidenceCache();
    const hierarchy = new QuadtreeRefinementHierarchy();
    const envelopeScale = 1 / 64;
    const envelopeTree = new PeriodicBalancedQuadtree(
      workspace.fieldAtScale(envelopeScale),
      sampler,
      {
        maxLevel: 7,
        pinBoundaryLevel: 4,
        refinementEvidenceCache: evidence,
        captureRefinementHierarchy: hierarchy,
      },
    );
    expect(hierarchy.nodeCount()).toBeGreaterThan(0);
    for (const targetScale of scales) {
      const legacyField = new MetricSizingField(sampler, { ...opts, targetScale });
      const legacyTree = new PeriodicBalancedQuadtree(legacyField, sampler, {
        maxLevel: 7,
        pinBoundaryLevel: 4,
      });
      const reusedTree = targetScale === envelopeScale
        ? envelopeTree
        : new PeriodicBalancedQuadtree(
            workspace.fieldAtScale(targetScale),
            sampler,
            {
              maxLevel: 7,
              pinBoundaryLevel: 4,
              refinementEvidenceCache: evidence,
              refinementHierarchy: hierarchy,
            },
          );
      expect(reusedTree.leafCount()).toBe(legacyTree.leafCount());
      expect(reusedTree.leaves()).toEqual(legacyTree.leaves());
    }
    const stats = evidence.stats();
    expect(stats.metricMisses).toBeGreaterThan(0);
    expect(stats.metricHits).toBeGreaterThan(0);
    expect(stats.metricSampleEvaluations).toBeGreaterThanOrEqual(stats.metricMisses);
  });

  it('materializes exact cap-mode probe frontiers from the scale=1 envelope', () => {
    const workspace = new MetricSizingWorkspace(sampler, opts);
    const evidence = new QuadtreeRefinementEvidenceCache();
    const hierarchy = new QuadtreeRefinementHierarchy();
    const envelope = new PeriodicBalancedQuadtree(workspace.fieldAtScale(1), sampler, {
      maxLevel: 7,
      pinBoundaryLevel: 4,
      refinementEvidenceCache: evidence,
      captureRefinementHierarchy: hierarchy,
    });
    for (const targetScale of [1, Math.sqrt(2), 2, 2 * Math.sqrt(2), 4]) {
      const legacy = new PeriodicBalancedQuadtree(
        new MetricSizingField(sampler, { ...opts, targetScale }),
        sampler,
        { maxLevel: 7, pinBoundaryLevel: 4 },
      );
      const materialized = targetScale === 1
        ? envelope
        : new PeriodicBalancedQuadtree(workspace.fieldAtScale(targetScale), sampler, {
            maxLevel: 7,
            pinBoundaryLevel: 4,
            refinementEvidenceCache: evidence,
            refinementHierarchy: hierarchy,
          });
      expect(materialized.leaves()).toEqual(legacy.leaves());
    }
  });

  it('reuses feature and crease predicates without changing exact leaf order', () => {
    const field = new MetricSizingField(sampler, { ...opts, targetScale: 0.5 });
    let featureCalls = 0;
    let creaseCalls = 0;
    const featureRefine = {
      level: 4,
      intersects: (u0: number, t0: number, size: number): boolean => {
        featureCalls++;
        return u0 <= 0.42 && u0 + size >= 0.42 && t0 < 0.8;
      },
    };
    const creaseRefine = {
      intersects: (u0: number, t0: number, size: number): boolean => {
        creaseCalls++;
        return t0 <= 0.55 && t0 + size >= 0.55 && u0 < 0.75;
      },
    };
    const treeOpts = {
      maxLevel: 6,
      pinBoundaryLevel: 4,
      uBias: 1,
      cellSamples: 2,
      featureRefine,
      creaseRefine,
    };
    const legacy = new PeriodicBalancedQuadtree(field, sampler, treeOpts);
    const evidence = new QuadtreeRefinementEvidenceCache();
    const first = new PeriodicBalancedQuadtree(field, sampler, {
      ...treeOpts,
      refinementEvidenceCache: evidence,
    });
    expect(first.leaves()).toEqual(legacy.leaves());

    const featureAfterFirst = featureCalls;
    const creaseAfterFirst = creaseCalls;
    const second = new PeriodicBalancedQuadtree(field, sampler, {
      ...treeOpts,
      refinementEvidenceCache: evidence,
    });
    expect(second.leaves()).toEqual(legacy.leaves());
    expect(featureCalls).toBe(featureAfterFirst);
    expect(creaseCalls).toBe(creaseAfterFirst);

    const stats = evidence.stats();
    expect(stats.featureMisses).toBeGreaterThan(0);
    expect(stats.featureHits).toBeGreaterThan(0);
    expect(stats.creaseMisses).toBeGreaterThan(0);
    expect(stats.creaseHits).toBeGreaterThan(0);
    expect(stats.metricMisses).toBeGreaterThan(0);
    expect(stats.metricHits).toBeGreaterThan(0);
  });

  it('preserves exact refinement when every evidence cache is saturated', () => {
    const field = new MetricSizingField(sampler, { ...opts, targetScale: 0.5 });
    const featureRefine = {
      level: 3,
      intersects: (u0: number, _t0: number, size: number): boolean =>
        u0 <= 0.42 && u0 + size >= 0.42,
    };
    const creaseRefine = {
      intersects: (_u0: number, t0: number, size: number): boolean =>
        t0 <= 0.55 && t0 + size >= 0.55,
    };
    const treeOpts = {
      maxLevel: 5,
      pinBoundaryLevel: 3,
      uBias: 1,
      cellSamples: 2,
      featureRefine,
      creaseRefine,
    };
    const legacy = new PeriodicBalancedQuadtree(field, sampler, treeOpts);
    const bounded = new QuadtreeRefinementEvidenceCache({
      maxMetricEntries: 0,
      maxMetricSamples: 0,
      maxPredicateEntries: 0,
    });
    const saturated = new PeriodicBalancedQuadtree(field, sampler, {
      ...treeOpts,
      refinementEvidenceCache: bounded,
    });
    expect(saturated.leaves()).toEqual(legacy.leaves());
    const stats = bounded.stats();
    expect(stats.metricSaturated).toBeGreaterThan(0);
    expect(stats.featureSaturated).toBeGreaterThan(0);
    expect(stats.creaseSaturated).toBeGreaterThan(0);
    expect(stats.metricEntries).toBe(0);
    expect(stats.metricSamplesStored).toBe(0);
    expect(stats.featureEntries).toBe(0);
    expect(stats.creaseEntries).toBe(0);
  });
});

describe('QuadtreeRefinementHierarchy — compact high-count storage', () => {
  it('stores one million nodes in bounded typed-array payloads', () => {
    const hierarchy = new QuadtreeRefinementHierarchy();
    const count = 1_000_000;
    for (let i = 0; i < count; i++) hierarchy.addNode(i % 25, i, i >>> 1);
    hierarchy.setFirstChild(123, 456);

    expect(hierarchy.nodeCount()).toBe(count);
    expect(hierarchy.level(count - 1)).toBe((count - 1) % 25);
    expect(hierarchy.iu(count - 1)).toBe(count - 1);
    expect(hierarchy.it(count - 1)).toBe((count - 1) >>> 1);
    expect(hierarchy.firstChild(123)).toBe(456);
    // 16 chunks × 65,536 capacity nodes × 13 typed-array bytes/node.
    expect(hierarchy.estimatedBytes()).toBeLessThan(14 * 1024 * 1024);
  });
});
