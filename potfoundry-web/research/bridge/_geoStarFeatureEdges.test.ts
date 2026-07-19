// _geoStarFeatureEdges.test.ts — GEOMETRIC CORRECTNESS of the GeometricStar chevron-strap conforming graph.
//
// RED-FIRST guard (PF_GEOSTAR_GRAPH=1): asserts the graph is NON-EMPTY, its edges index valid points, and EVERY
// emitted (u,t) point lies on a cliff LEVEL CURVE — |dStrap| < 1e-3 (strap-top, dStrap=0) OR |dStrap − edge| < 1e-3
// (gap-floor, dStrap=edge). This proves the marching-squares level-set trace is geometrically faithful BEFORE the
// graph is injected as hard constraints into buildInhouseMetricMesh.
import { describe, it, expect } from 'vitest';
import { buildGeometricStarConformingGraph, DEFAULT_GEOSTAR_STRAP } from './geoStarFeatureEdges';
import { geometricStarStrapField } from '../../src/fidelity/analyticSurfaceGate';

describe('GeometricStar chevron-strap conforming graph — geometric correctness', () => {
  it.skipIf(process.env.PF_GEOSTAR_GRAPH !== '1')('every point lies on a dStrap level curve (0 or edge)', () => {
    const p = DEFAULT_GEOSTAR_STRAP;
    const { field, hi: edge } = geometricStarStrapField(p.points, p.gap, p.detail, p.layers, p.roundness, p.zoom, p.shift);
    const g = buildGeometricStarConformingGraph();

    // (1) non-empty
    expect(g.pts.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.pts.length % 2).toBe(0);
    expect(g.edges.length % 2).toBe(0);

    // (2) edges index valid points
    const nPts = g.pts.length / 2;
    let minV = Infinity, maxV = -1;
    for (const v of g.edges) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    expect(minV).toBeGreaterThanOrEqual(0);
    expect(maxV).toBeLessThan(nPts);

    // (3) every point on a level curve (0 or edge)
    let worst = 0; let worstIsFloor = false; let nOff = 0;
    for (let i = 0; i < nPts; i++) {
      const u = g.pts[2 * i], t = g.pts[2 * i + 1];
      const d = field(u, t);
      const dTop = Math.abs(d), dFloor = Math.abs(d - edge);
      const m = Math.min(dTop, dFloor);
      if (m > worst) { worst = m; worstIsFloor = dFloor < dTop; }
      if (m >= 1e-3) nOff++;
    }
    // eslint-disable-next-line no-console
    console.log(`[geoStarGraph] pts=${nPts} edges=${g.edges.length / 2} edge=${edge} worstOffLevel=${worst.toExponential(3)} (${worstIsFloor ? 'floor' : 'top'}) nOff(>=1e-3)=${nOff}`);
    expect(nOff).toBe(0);
  });
});
