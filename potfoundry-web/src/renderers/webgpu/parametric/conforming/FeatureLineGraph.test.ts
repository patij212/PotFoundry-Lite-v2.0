/**
 * Tests for analytic feature-line extraction and the feature-resolution metric.
 *
 * These pin the CLOSED-FORM feature loci of the representative styles (derived
 * from the WGSL radius math in src/assets/shaders/styles.wgsl) and the
 * "resolved to tolerance" definition used to turn featuresExpected/Present/
 * Dropped into MEANINGFUL numbers for the conforming whole-mesh export.
 */
import { describe, it, expect } from 'vitest';
import {
  extractAnalyticFeatures,
  measureFeatureResolution,
  type FeatureLineGraph,
  type FeatureUTVertex,
} from './FeatureLineGraph';
import { STYLE_PARAM_CAPACITY } from '../../../../utils/styleParams';

const DIMS = { H: 100, Rt: 40, Rb: 30 };

/** Build a packed param array (WGSL style_param() slot order), zero-padded. */
function packed(values: number[]): Float32Array {
  const a = new Float32Array(STYLE_PARAM_CAPACITY);
  for (let i = 0; i < values.length && i < STYLE_PARAM_CAPACITY; i++) a[i] = values[i];
  return a;
}

/** Synthesize a perfectly-tracked vertex set: a DENSE column of vertices on each
 *  line's locus (mirrors a real ~256-row conforming mesh that tracks the crease).
 *  `keep` lets a test drop or offset specific lines. */
function trackedVertices(
  graph: FeatureLineGraph,
  keep: (lineIndex: number, t: number) => FeatureUTVertex | null = (_i, t) => ({ u: NaN, t }),
  density = 256,
): FeatureUTVertex[] {
  const out: FeatureUTVertex[] = [];
  graph.lines.forEach((line, idx) => {
    const tMin = Math.min(...line.points.map((p) => p.t));
    const tMax = Math.max(...line.points.map((p) => p.t));
    const lineU = line.kind === 'horizontal-band' ? null : line.points[0].u;
    for (let i = 0; i <= density; i++) {
      const t = tMin + (tMax - tMin) * (i / density);
      if (line.kind === 'horizontal-band') {
        // dense ring at constant t
        for (let j = 0; j < 64; j++) out.push({ u: j / 64, t });
        break;
      }
      const ov = keep(idx, t);
      if (ov === null) continue;
      out.push({ u: Number.isNaN(ov.u) ? (lineU as number) : ov.u, t });
    }
  });
  return out;
}

describe('extractAnalyticFeatures — ground-truth counts', () => {
  it('LowPolyFacet: N facet-edge creases (one per sector boundary)', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([12, 1, 0.12, 0.15, 0.15, 0]), DIMS);
    // 12 facets → 12 sharp C0 edges between adjacent flat faces.
    expect(g.groundTruthCount).toBe(12);
    expect(g.lines.length).toBe(12);
    for (const line of g.lines) expect(line.kind).toBe('vertical-crease');
  });

  it('LowPolyFacet: facet count scales with lp_facets', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([20, 1, 0.12, 0.15, 0.15, 0]), DIMS);
    expect(g.groundTruthCount).toBe(20);
  });

  it('LowPolyFacet: tiers multiply distinct crease lines (phase-shifted per tier)', () => {
    // 8 facets × 3 tiers with non-zero jitter → 24 distinct (phase-shifted) crease segments.
    const g = extractAnalyticFeatures('LowPolyFacet', packed([8, 3, 0.12, 0.15, 0.25, 0]), DIMS);
    expect(g.groundTruthCount).toBe(24);
    expect(g.lines.length).toBe(24);
  });

  it('LowPolyFacet: crease u-locus sits at sector boundaries (k+0.5)/N', () => {
    const N = 6;
    const g = extractAnalyticFeatures('LowPolyFacet', packed([N, 1, 0.12, 0.15, 0, 0]), DIMS);
    const us = g.lines.map((l) => l.points[0].u).sort((a, b) => a - b);
    for (let k = 0; k < N; k++) {
      const expectedU = ((k + 0.5) / N) % 1;
      // some crease must be within a tight band of each predicted boundary
      const hit = us.some((u) => Math.abs(u - expectedU) < 1e-6);
      expect(hit).toBe(true);
    }
  });

  it('GothicArches: N column-edge creases + N mullion creases + horizontal bands', () => {
    const g = extractAnalyticFeatures('GothicArches', packed([12, 1.5, 1.2, 0.5, 0, 0.15, 0.7, 0.04, 0.15, 4, 1, 0.04]), DIMS);
    const vertical = g.lines.filter((l) => l.kind === 'vertical-crease').length;
    const horizontal = g.lines.filter((l) => l.kind === 'horizontal-band').length;
    // 12 columns + 12 mullions
    expect(vertical).toBe(24);
    // bands on (base/mid/rim) when gaBands>0
    expect(horizontal).toBeGreaterThanOrEqual(2);
    expect(g.groundTruthCount).toBe(g.lines.length);
  });

  it('GothicArches: arch count scales with gaCounts', () => {
    const g = extractAnalyticFeatures('GothicArches', packed([8, 1.5, 1.2, 0.5, 0, 0.15, 0.7, 0.04, 0.15, 4, 1, 0.04]), DIMS);
    expect(g.lines.filter((l) => l.kind === 'vertical-crease').length).toBe(16);
  });

  it('GeometricStar: N sector-fold creases', () => {
    const g = extractAnalyticFeatures('GeometricStar', packed([8, 0.05, 0.5, 4, 1, 2, 0, 1, 0]), DIMS);
    expect(g.lines.filter((l) => l.kind === 'vertical-crease').length).toBe(8);
    expect(g.groundTruthCount).toBe(8);
  });

  it('GeometricStar: point count scales with gs_points', () => {
    const g = extractAnalyticFeatures('GeometricStar', packed([12, 0.05, 0.5, 4, 1, 2, 0, 1, 0]), DIMS);
    expect(g.groundTruthCount).toBe(12);
  });

  it('BambooSegments: node_count-1 interior node-ring horizontal creases', () => {
    // node_count=5 → rings at t=k/5; interior k=1..4 ⇒ 4 horizontal creases
    // (t=0 and t=1 are the boundary rings, already full-width / shared with caps).
    const g = extractAnalyticFeatures('BambooSegments', packed([5, 0.06, 0.08, 12, 0.015, 0.05, 0.1]), DIMS);
    const horizontal = g.lines.filter((l) => l.kind === 'horizontal-band');
    expect(horizontal.length).toBe(4);
    expect(g.lines.every((l) => l.kind === 'horizontal-band')).toBe(true);
    expect(g.groundTruthCount).toBe(4);
    // loci sit exactly at k/5
    const ts = horizontal.map((l) => l.points[0].t).sort((a, b) => a - b);
    expect(ts).toEqual([0.2, 0.4, 0.6, 0.8].map((x) => expect.closeTo(x, 9)));
  });

  it('BambooSegments: ring count scales with node_count', () => {
    const g = extractAnalyticFeatures('BambooSegments', packed([8, 0.06, 0.08, 12, 0.015, 0.05, 0.1]), DIMS);
    expect(g.groundTruthCount).toBe(7); // 8 segments → 7 interior boundaries
  });

  it('DragonScales: scale_rows-1 interior row-boundary horizontal creases', () => {
    // scale_rows=8 → boundaries at t=k/8; interior k=1..7 ⇒ 7 horizontal creases.
    const g = extractAnalyticFeatures('DragonScales', packed([8, 16, 0.12, 0.5, 1.5, 0.1, 1.2]), DIMS);
    const horizontal = g.lines.filter((l) => l.kind === 'horizontal-band');
    expect(horizontal.length).toBe(7);
    expect(g.lines.every((l) => l.kind === 'horizontal-band')).toBe(true);
    expect(g.groundTruthCount).toBe(7);
  });

  it('DragonScales: row count scales with scale_rows', () => {
    const g = extractAnalyticFeatures('DragonScales', packed([12, 16, 0.12, 0.5, 1.5, 0.1, 1.2]), DIMS);
    expect(g.groundTruthCount).toBe(11);
  });

  it('smooth styles (SuperellipseMorph/FourierBloom/WaveInterference/RippleInterference/Crystalline/ArtDeco) → empty', () => {
    for (const s of ['SuperellipseMorph', 'FourierBloom', 'WaveInterference', 'RippleInterference', 'Crystalline', 'ArtDeco']) {
      const g = extractAnalyticFeatures(s, packed([4, 1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]), DIMS);
      expect(g.groundTruthCount).toBe(0);
      expect(g.lines.length).toBe(0);
    }
  });

  it('HarmonicRipple: smooth — zero sharp feature lines (curvature-only)', () => {
    const g = extractAnalyticFeatures('HarmonicRipple', packed([7, 0.16, 0.3, 0.6, 31, 0.03, 0, 1, 0.05]), DIMS);
    expect(g.groundTruthCount).toBe(0);
    expect(g.lines.length).toBe(0);
  });

  it('SuperformulaBlossom: default smooth — zero sharp feature lines', () => {
    // sf_strength=0 default → plain base profile, no angular features.
    const g = extractAnalyticFeatures('SuperformulaBlossom', packed([0, 6, 10, 1.2, 0.35, 0.5]), DIMS);
    expect(g.groundTruthCount).toBe(0);
  });

  it('SpiralRidges: k helical ridge creases (one per integer ridge)', () => {
    // k=9, turns=1.15 (defaults). 9 constant-slope helical creases.
    const g = extractAnalyticFeatures('SpiralRidges', packed([9, 1.15, 0.15, 0.25, 1.3, 0.04, 3, 1.7]), DIMS);
    expect(g.groundTruthCount).toBe(9);
    expect(g.lines.length).toBe(9);
    for (const line of g.lines) expect(line.kind).toBe('helical-crease');
  });

  it('SpiralRidges: ridge count scales with k', () => {
    const g = extractAnalyticFeatures('SpiralRidges', packed([15, 1.0, 0.15, 0.25, 1.3, 0.04, 3, 1.7]), DIMS);
    expect(g.groundTruthCount).toBe(15);
  });

  it('SpiralRidges: each line is a constant-slope diagonal (u varies linearly with t, slope -turns/k)', () => {
    const k = 9;
    const turns = 1.15;
    const g = extractAnalyticFeatures('SpiralRidges', packed([k, turns, 0.15, 0.25, 1.3, 0.04, 3, 1.7]), DIMS);
    for (const line of g.lines) {
      expect(line.points.length).toBeGreaterThanOrEqual(2);
      // Recover the slope du/dt from the first two points (shortest-arc).
      const p0 = line.points[0];
      const p1 = line.points[1];
      let du = (p1.u - p0.u) % 1;
      if (du > 0.5) du -= 1;
      if (du < -0.5) du += 1;
      const slope = du / (p1.t - p0.t);
      expect(slope).toBeCloseTo(-turns / k, 6);
      // Spans the full t-range.
      const ts = line.points.map((p) => p.t);
      expect(Math.min(...ts)).toBeLessThanOrEqual(1e-9);
      expect(Math.max(...ts)).toBeGreaterThanOrEqual(1 - 1e-9);
    }
  });

  it('unknown / unsupported style → empty graph (honest zero)', () => {
    const g = extractAnalyticFeatures('Voronoi', packed([8, 0.8, 0.1, 2, 1]), DIMS);
    expect(g.groundTruthCount).toBe(0);
    expect(g.lines.length).toBe(0);
  });
});

describe('measureFeatureResolution — helical (diagonal) lines', () => {
  const k = 9;
  const turns = 1.15;
  const g = extractAnalyticFeatures('SpiralRidges', packed([k, turns, 0.15, 0.25, 1.3, 0.04, 3, 1.7]), DIMS);

  /** Dense vertices laid EXACTLY on each ridge's helix (mirrors a sheared mesh). */
  function helixTrackedVertices(rows = 256): FeatureUTVertex[] {
    const out: FeatureUTVertex[] = [];
    const phaseU = 0.25;
    for (let c = 0; c < k; c++) {
      for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        let u = (phaseU + c - turns * t) / k;
        u %= 1;
        if (u < 0) u += 1;
        out.push({ u, t });
      }
    }
    return out;
  }

  it('mesh vertices laid on the helices → all diagonal lines resolved, dropped 0', () => {
    const verts = helixTrackedVertices();
    const res = measureFeatureResolution(g, verts);
    expect(res.expected).toBe(k);
    expect(res.present).toBe(k);
    expect(res.dropped).toBe(0);
  });

  it('a COARSE vertical-column mesh does NOT resolve diagonal helices (the bug the warp fixes)', () => {
    // A coarse mesh with 32 vertical columns (Δu≈0.031 ≫ uTol≈0.0023): the
    // diagonal ridge crosses columns, so along most of its length no column sits
    // within uTol → coverage falls below 0.75 and the helix is dropped. (Note: a
    // *fine* 256-column mesh would track it by proximity — the real conforming
    // mesh is budget-coarsened, so the warp is what actually lands a column ON
    // each diagonal.)
    const verts: FeatureUTVertex[] = [];
    for (let j = 0; j < 32; j++) for (let r = 0; r <= 256; r++) verts.push({ u: j / 32, t: r / 256 });
    const res = measureFeatureResolution(g, verts);
    expect(res.present).toBe(0);
    expect(res.dropped).toBe(k);
  });

  it('seam-crossing helix is tracked across the u=0 wrap', () => {
    // Ridge 0 starts near u≈0.0028 and decreases, wrapping through u=0 as t grows.
    // The periodic interpolation + periodic uDist must still track it.
    const verts = helixTrackedVertices();
    const single: FeatureLineGraph = { styleId: g.styleId, lines: [g.lines[0]], groundTruthCount: 1 };
    const res = measureFeatureResolution(single, verts);
    expect(res.present).toBe(1);
  });
});

describe('extractAnalyticFeatures — line geometry', () => {
  it('vertical creases span the full t-range with multiple samples', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([6, 1, 0.12, 0.15, 0, 0]), DIMS);
    for (const line of g.lines) {
      expect(line.points.length).toBeGreaterThanOrEqual(2);
      const ts = line.points.map((p) => p.t);
      expect(Math.min(...ts)).toBeLessThanOrEqual(0.05);
      expect(Math.max(...ts)).toBeGreaterThanOrEqual(0.95);
      // constant u along a vertical crease (single tier → constant)
      const us = line.points.map((p) => p.u);
      expect(Math.max(...us) - Math.min(...us)).toBeLessThan(1e-9);
    }
  });

  it('tiered creases are piecewise-constant in u within each tier band', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([6, 2, 0.12, 0.15, 0.25, 0]), DIMS);
    // each tiered crease line is confined to its tier t-band
    for (const line of g.lines) {
      const ts = line.points.map((p) => p.t);
      const span = Math.max(...ts) - Math.min(...ts);
      expect(span).toBeLessThanOrEqual(0.5 + 1e-9); // half the height (2 tiers)
    }
  });
});

describe('measureFeatureResolution — resolved-to-tolerance', () => {
  it('all lines tracked by mesh vertices → present == expected, dropped == 0', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([12, 1, 0.12, 0.15, 0.15, 0]), DIMS);
    const verts = trackedVertices(g);
    const res = measureFeatureResolution(g, verts);
    expect(res.present).toBe(g.groundTruthCount);
    expect(res.dropped).toBe(0);
  });

  it('no mesh vertices near a crease → that line is dropped', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([12, 1, 0.12, 0.15, 0.15, 0]), DIMS);
    // Offset line 0's tracking vertices far in u so it has no nearby mesh vertex.
    const verts = trackedVertices(g, (idx, t) =>
      idx === 0 ? { u: (g.lines[0].points[0].u + 0.5) % 1, t } : { u: NaN, t },
    );
    const res = measureFeatureResolution(g, verts);
    expect(res.present).toBe(g.groundTruthCount - 1);
    expect(res.dropped).toBe(1);
  });

  it('partial coverage below the coverage threshold → dropped', () => {
    const g = extractAnalyticFeatures('LowPolyFacet', packed([6, 1, 0.12, 0.15, 0, 0]), DIMS);
    // Track only the BOTTOM HALF (t≤0.5) of every line.
    const verts = trackedVertices(g, (_idx, t) => (t <= 0.5 ? { u: NaN, t } : null));
    const res = measureFeatureResolution(g, verts, { minCoverage: 0.9 });
    // Only ~50% of each line covered → below 0.9 → all dropped.
    expect(res.present).toBe(0);
    expect(res.dropped).toBe(g.groundTruthCount);
  });

  it('empty graph → present 0, dropped 0 (vacuously resolved)', () => {
    const g = extractAnalyticFeatures('HarmonicRipple', packed([7, 0.16, 0.3, 0.6, 31, 0.03, 0, 1, 0.05]), DIMS);
    const res = measureFeatureResolution(g, []);
    expect(res.present).toBe(0);
    expect(res.dropped).toBe(0);
  });
});

describe('measureFeatureResolution — grid-alignment diagnostics', () => {
  it('reports the distinct mesh u-column count', () => {
    const g = extractAnalyticFeatures('GeometricStar', packed([8, 0.05, 0.5, 4, 1, 2, 0, 1, 0]), DIMS);
    // A uniform 100-column mesh.
    const verts: FeatureUTVertex[] = [];
    for (let j = 0; j < 100; j++) for (let r = 0; r <= 32; r++) verts.push({ u: j / 100, t: r / 32 });
    const res = measureFeatureResolution(g, verts);
    expect(res.meshUColumnCount).toBe(100);
  });

  it('a crease falling between columns has nearestColumnGapCells ≈ 0.5 → dropped', () => {
    // 8 folds at u=(k+0.5)/8. A uniform 8-column mesh at u=j/8 sits HALF a cell
    // off every fold → every fold ~0.5 cells from the nearest column.
    const g = extractAnalyticFeatures('GeometricStar', packed([8, 0.05, 0.5, 4, 1, 2, 0, 1, 0]), DIMS);
    const verts: FeatureUTVertex[] = [];
    for (let j = 0; j < 8; j++) for (let r = 0; r <= 64; r++) verts.push({ u: j / 8, t: r / 64 });
    // uTol (0.0375) < the half-cell gap (0.0625) so a between-columns crease misses.
    const res = measureFeatureResolution(g, verts, { uTol: 0.3 / 8, tTol: 1.5 / 64 });
    expect(res.present).toBe(0);
    for (const l of res.perLine) {
      expect(l.nearestColumnGapCells).toBeGreaterThan(0.4);
      expect(l.nearestColumnGapCells).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it('a column ON the crease has nearestColumnGapCells ≈ 0 → resolved', () => {
    // 8 folds at u=(k+0.5)/8; put a dense column exactly on each fold.
    const g = extractAnalyticFeatures('GeometricStar', packed([8, 0.05, 0.5, 4, 1, 2, 0, 1, 0]), DIMS);
    const verts: FeatureUTVertex[] = [];
    // 16 columns at j/16 → folds (k+0.5)/8 = (2k+1)/16 land exactly on odd columns.
    for (let j = 0; j < 16; j++) for (let r = 0; r <= 256; r++) verts.push({ u: j / 16, t: r / 256 });
    const res = measureFeatureResolution(g, verts, { uTol: 0.6 / 16, tTol: 1.5 / 256 });
    expect(res.present).toBe(8);
    for (const l of res.perLine) expect(l.nearestColumnGapCells).toBeLessThan(1e-6);
  });
});
