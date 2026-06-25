/**
 * corridorPave.planarize.test.ts — crossing feature chains must BOTH be followed.
 *
 * When two pinned feature chains CROSS inside the corridor, the raw constraint set is a
 * non-planar PSLG: `cdt2d` cannot honour both crossing edges — it drops one (and at the
 * production density it crashes outright: 'upperIds'). corridorPaveMulti must planarize
 * feature-vs-feature crossings into a SHARED vertex first, so every feature segment
 * survives as a mesh edge. This pins that: two crossing diagonals ⇒ both fully followed.
 *
 * Pure (u,t) geometry, no GPU/sampler dependence.
 */
import { describe, it, expect } from 'vitest';
import { corridorPaveMulti, type FeatureChainInput } from './corridorPave';
import type { HoleBoundary } from './seamFill';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';

const stubSampler: SurfaceSampler = { position: (u, t) => [u, t, 0] };

function meshEdgeSet(tris: Array<[number, number, number]>): Set<string> {
  const s = new Set<string>();
  for (const [a, b, c] of tris) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) s.add(i < j ? `${i}:${j}` : `${j}:${i}`);
  }
  return s;
}
function allFollowed(chains: number[][], edges: Set<string>): boolean {
  for (const ch of chains) {
    for (let i = 0; i + 1 < ch.length; i++) {
      const a = ch[i], b = ch[i + 1];
      if (!edges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) return false;
    }
  }
  return true;
}

describe('corridorPaveMulti — crossing feature chains', () => {
  // Unit-square hole: corners 0=(0,0) 1=(1,0) 2=(1,1) 3=(0,1).
  const vertexUT: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const boundary: HoleBoundary = { loops: [[0, 1, 2, 3]], complementDir: new Map() };
  // Two feature chains that CROSS at the hole centre (0.5,0.5): main + anti diagonal.
  const features: FeatureChainInput[] = [
    { polyline: [{ u: 0.1, t: 0.2 }, { u: 0.9, t: 0.8 }], start: { kind: 'snap-boundary' }, end: { kind: 'snap-boundary' } },
    { polyline: [{ u: 0.1, t: 0.8 }, { u: 0.9, t: 0.2 }], start: { kind: 'snap-boundary' }, end: { kind: 'snap-boundary' } },
  ];

  it('both crossing feature chains are fully followed as mesh edges', () => {
    const r = corridorPaveMulti({ boundary, vertexUT, features, sampler: stubSampler, targetEdgeUT: 5 });
    const edges = meshEdgeSet(r.triangles);
    // eslint-disable-next-line no-console
    console.log(`[planarize] chains=${JSON.stringify(r.featureChains)} followed=${allFollowed(r.featureChains, edges)}`);
    expect(allFollowed(r.featureChains, edges), 'every feature-chain segment is a mesh edge').toBe(true);
  });

  it('the crossing is a SHARED vertex (same id appears in both chains)', () => {
    const r = corridorPaveMulti({ boundary, vertexUT, features, sampler: stubSampler, targetEdgeUT: 5 });
    const inA = new Set(r.featureChains[0]);
    const shared = r.featureChains[1].filter((id) => inA.has(id));
    // The two chains share ONLY the interned crossing vertex (their snapped corners differ).
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });
});
