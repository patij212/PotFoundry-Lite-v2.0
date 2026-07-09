import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { detectFeatures } from '../featureGraph/detectFeatures';
import { TIER_C_DETECT_OPTS } from './detectOpts';
import { countJunctionNodes } from './countUnstable';
import type { StyleId } from '../../../../../geometry/types';

// DEV DIAGNOSTIC (PF_DISPATCHDIAG=1): the rebaseline gate found 17/20 styles
// classified count-unstable by the production predicate. Confirm the junction
// counts per style + the degree distribution — is this a real over-trigger, and
// how far above 0 do the "should-be-stable" styles sit?
const GO = process.env.PF_DISPATCHDIAG === '1';
const STYLES: StyleId[] = [
  'HarmonicRipple', // smooth ripple — SHOULD be count-stable (no junctions)
  'SuperellipseMorph', // smooth morph — stable
  'FourierBloom', // stable (per the run)
  'GeometricStar', // count-UNSTABLE (chevron 6->32)
  'GothicArches', // count-UNSTABLE (rib net)
  'ArtDeco', // flagged unstable by the run — is it a TRUE junction or noise?
  'WaveInterference', // flagged unstable
  'Voronoi', // flagged unstable
];

describe.skipIf(!GO)('dispatch predicate junction diag', () => {
  it('junction node count per style', () => {
    for (const styleId of STYLES) {
      const sampler = styleSampler(styleId, {}, { H: 120, Rt: 50, Rb: 40 });
      const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
      // degree histogram
      const degree = new Array<number>(graph.nodes.length).fill(0);
      for (const e of graph.edges) {
        degree[e.endpoints[0]] += 1;
        degree[e.endpoints[1]] += 1;
      }
      const hist: Record<number, number> = {};
      let maxDeg = 0;
      for (const d of degree) {
        hist[d] = (hist[d] ?? 0) + 1;
        if (d > maxDeg) maxDeg = d;
      }
      const j = countJunctionNodes(graph);
      // eslint-disable-next-line no-console
      console.log(
        `[dispatchdiag] ${styleId}: nodes=${graph.nodes.length} edges=${graph.edges.length} junctions(deg>=3)=${j} maxDeg=${maxDeg} degHist=${JSON.stringify(hist)}`,
      );
    }
    expect(true).toBe(true);
  }, 10 * 60 * 1000);
});
