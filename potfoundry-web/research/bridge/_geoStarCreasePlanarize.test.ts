// _geoStarCreasePlanarize.test.ts — TDD for planarizeCreaseGraph (PF_GS_PLANAR=1).
//
// (1) NON-VACUOUS CONTROL: an injected synthetic X-crossing MUST be present in the raw graph
//     (countProperCrossings === 1) and MUST be removed by planarizeCreaseGraph (=== 0). A stub that
//     returns its input unchanged FAILS the second assertion ⇒ genuine RED→GREEN for the splitter.
// (2) DEFAULT chevron graph: the planar output has ZERO interior crossings AND every vertex still lies
//     on a dStrap level curve (|field|<1e-3 OR |field−edge|<1e-3) — the geometric-faithfulness gate before
//     the graph is fed as CDT-by-construction crease constraints.
// (3) DISJOINTNESS: decomposeChains yields vertex-DISJOINT simple chains (every used vertex appears in
//     exactly one chain, no chain repeats a vertex) — the property the double-valued mesher REQUIRES
//     (coincident/shared crease points drop triangles in cdt2d, measured).
import { describe, it, expect } from 'vitest';
import { buildGeometricStarConformingGraph, DEFAULT_GEOSTAR_STRAP } from './geoStarFeatureEdges';
import { geometricStarStrapField } from '../../src/fidelity/analyticSurfaceGate';
import { planarizeCreaseGraph, countProperCrossings, decomposeChains, creasesFromGraph } from './geoStarCreasePlanarize';

describe('geoStar crease planarize', () => {
  it.skipIf(process.env.PF_GS_PLANAR !== '1')('splits an injected crossing (non-vacuous control)', () => {
    // an explicit X: edge (0-1) and edge (2-3) cross at (0.5,0.5); no shared endpoint.
    const raw = { pts: [0, 0, 1, 1, 1, 0, 0, 1], edges: [0, 1, 2, 3] };
    expect(countProperCrossings(raw.pts, raw.edges)).toBe(1); // control: the crossing IS there
    const planar = planarizeCreaseGraph(raw);
    expect(countProperCrossings(planar.pts, planar.edges)).toBe(0); // FUNCTION removed it (stub would fail)
    expect(planar.stats.crossingsSplit).toBeGreaterThanOrEqual(1);
    expect(planar.pts.length / 2).toBe(5); // 4 corners + 1 shared centre vertex
    expect(planar.edges.length / 2).toBe(4); // each of the 2 edges split into 2
  });

  it.skipIf(process.env.PF_GS_PLANAR !== '1')('DEFAULT chevron graph → planar PSLG, all on-level, disjoint chains', () => {
    const sp = DEFAULT_GEOSTAR_STRAP;
    const { field, hi: edge } = geometricStarStrapField(sp.points, sp.gap, sp.detail, sp.layers, sp.roundness, sp.zoom, sp.shift);
    const raw = buildGeometricStarConformingGraph(); // default segLen 0.005
    const rawCross = countProperCrossings(raw.pts, raw.edges);
    const planar = planarizeCreaseGraph(raw);
    const planCross = countProperCrossings(planar.pts, planar.edges);

    // planarity
    expect(planCross).toBe(0);

    // every vertex on a level curve (0 or edge)
    const nPts = planar.pts.length / 2;
    let worst = 0, nOff = 0;
    for (let i = 0; i < nPts; i++) {
      const d = field(planar.pts[2 * i], planar.pts[2 * i + 1]);
      const m = Math.min(Math.abs(d), Math.abs(d - edge));
      if (m > worst) worst = m;
      if (m >= 1e-3) nOff++;
    }
    expect(nOff).toBe(0);

    // disjoint simple chains (the mesher requirement)
    const chains = decomposeChains(planar.pts, planar.edges);
    const occ = new Int32Array(nPts);
    let maxOcc = 0, selfRepeat = 0;
    for (const c of chains) {
      const seen = new Set<number>();
      for (const v of c) { occ[v]++; if (seen.has(v)) selfRepeat++; seen.add(v); }
    }
    for (let i = 0; i < nPts; i++) if (occ[i] > maxOcc) maxOcc = occ[i];
    expect(selfRepeat).toBe(0);       // no chain revisits a vertex (simple polyline)
    expect(maxOcc).toBe(1);           // every used vertex belongs to exactly one chain (disjoint)

    // report chain stats (informs crease sampling / budget)
    const { creases } = creasesFromGraph(raw);
    let minLen = Infinity, maxLen = 0, minTe = Infinity, maxTe = 0, sumTe = 0;
    for (const c of chains) {
      let len = 0; for (let i = 1; i < c.length; i++) len += Math.hypot(planar.pts[2 * c[i]] - planar.pts[2 * c[i - 1]], planar.pts[2 * c[i] + 1] - planar.pts[2 * c[i - 1] + 1]);
      if (len < minLen) minLen = len; if (len > maxLen) maxLen = len;
    }
    for (const cr of creases) { const te = Math.abs(cr.tRange[1] - cr.tRange[0]); if (te < minTe) minTe = te; if (te > maxTe) maxTe = te; sumTe += te; }
    // eslint-disable-next-line no-console
    console.log(`[planarize] rawCross=${rawCross} planCross=${planCross} welded=${planar.stats.welded} split=${planar.stats.crossingsSplit} pts=${nPts} edges=${planar.edges.length / 2} chains=${chains.length} creases=${creases.length} worstOffLevel=${worst.toExponential(2)} arcLen[min=${minLen.toFixed(4)},max=${maxLen.toFixed(4)}] tExtent[min=${minTe.toFixed(4)},max=${maxTe.toFixed(4)},mean=${(sumTe / creases.length).toFixed(4)}]`);
  });
});
