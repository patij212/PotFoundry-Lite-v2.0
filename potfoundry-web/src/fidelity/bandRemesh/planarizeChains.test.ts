/**
 * planarizeChains.test.ts — TDD for the constraint planarizer that converts a
 * non-planar set of feature chains (crossing each other) into a planar PSLG so
 * `cdt2d` does not hit its unguarded `mergeHulls` crash ('upperIds') — the measured
 * Phase-2 whole-wall blocker (483 off-endpoint crossings → throw; planarize → pass).
 *
 * Contract under test (the weld-safe planarizer):
 *  - Resolve every PROPER (strict-interior, off-shared-endpoint) crossing BETWEEN
 *    chain segments by interning the intersection as ONE shared vertex (QSCALE-keyed)
 *    and splicing it into EVERY chain that passes through it, in along-segment order.
 *  - Chain ENDPOINTS (first/last id — the anchors/junctions) are preserved exactly.
 *  - The input point table + chains are NOT mutated (pure); intersections are appended.
 *  - Output is DETERMINISTIC (byte-stable) and IDEMPOTENT.
 *  - It does NOT touch boundary edges (it only takes chains) → no boundary-interior
 *    vertex is ever minted (the T-junction failure mode the design forbids).
 */
import { describe, it, expect } from 'vitest';
import { planarizeChains } from './planarizeChains';

/** Count proper off-endpoint crossings between all chain segments (test oracle). */
function countChainCrossings(points: Array<[number, number]>, chains: number[][]): number {
  const segs: Array<[number, number]> = [];
  for (const ch of chains) for (let i = 0; i + 1 < ch.length; i++) segs.push([ch[i], ch[i + 1]]);
  const orient = (a: [number, number], b: [number, number], c: [number, number]): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i];
      const [c, d] = segs[j];
      if (a === c || a === d || b === c || b === d) continue; // share a vertex
      const p1 = points[a], p2 = points[b], p3 = points[c], p4 = points[d];
      const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2);
      const d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
      if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) n++;
    }
  }
  return n;
}

describe('planarizeChains', () => {
  it('resolves two crossing chains into a shared vertex (no remaining crossing)', () => {
    // Chain A: (0,0)->(1,1); Chain B: (0,1)->(1,0). They cross at exactly (0.5,0.5).
    const points: Array<[number, number]> = [[0, 0], [1, 1], [0, 1], [1, 0]];
    const chains = [[0, 1], [2, 3]];
    expect(countChainCrossings(points, chains)).toBe(1); // sanity: they DO cross

    const r = planarizeChains(points, chains);

    expect(countChainCrossings(r.points, r.chains)).toBe(0);
    // The crossing point (0.5,0.5) is a NEW shared vertex referenced by BOTH chains.
    const idA = r.chains[0].find((id) => id >= points.length);
    const idB = r.chains[1].find((id) => id >= points.length);
    expect(idA).toBeDefined();
    expect(idA).toBe(idB); // SAME id → shared → weldable
    expect(r.points[idA as number][0]).toBeCloseTo(0.5, 9);
    expect(r.points[idA as number][1]).toBeCloseTo(0.5, 9);
    // Endpoints preserved.
    expect(r.chains[0][0]).toBe(0);
    expect(r.chains[0][r.chains[0].length - 1]).toBe(1);
    expect(r.chains[1][0]).toBe(2);
    expect(r.chains[1][r.chains[1].length - 1]).toBe(3);
  });

  it('leaves non-crossing chains untouched (no new points)', () => {
    const points: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const chains = [[0, 1], [2, 3]]; // two parallel horizontal-ish chains, no crossing
    const r = planarizeChains(points, chains);
    expect(r.points.length).toBe(points.length);
    expect(r.chains).toEqual(chains);
    expect(r.splitsAdded).toBe(0);
  });

  it('does not split at a SHARED endpoint (a junction is not a crossing)', () => {
    // Two chains meeting at the shared junction vertex 0 — a Y, not an X.
    const points: Array<[number, number]> = [[0.5, 0.5], [0, 0], [1, 0]];
    const chains = [[0, 1], [0, 2]];
    const r = planarizeChains(points, chains);
    expect(r.splitsAdded).toBe(0);
    expect(r.points.length).toBe(points.length);
  });

  it('is deterministic (byte-stable across runs)', () => {
    const points: Array<[number, number]> = [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0], [0.5, 1]];
    const chains = [[0, 1], [2, 3], [4, 5]]; // three mutually crossing chains
    const a = planarizeChains(points, chains);
    const b = planarizeChains(points, chains);
    expect(b.points).toEqual(a.points);
    expect(b.chains).toEqual(a.chains);
  });

  it('is idempotent (planarizing the output adds nothing)', () => {
    const points: Array<[number, number]> = [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0], [0.5, 1]];
    const chains = [[0, 1], [2, 3], [4, 5]];
    const once = planarizeChains(points, chains);
    expect(countChainCrossings(once.points, once.chains)).toBe(0);
    const twice = planarizeChains(once.points, once.chains);
    expect(twice.splitsAdded).toBe(0);
    expect(twice.chains).toEqual(once.chains);
  });

  it('interns three chains crossing near one point into a SINGLE shared vertex', () => {
    // Three chains all crossing exactly at (0.5,0.5): the QSCALE keying must merge the
    // three pairwise intersections into ONE shared id (else a triple point splinters).
    const points: Array<[number, number]> = [
      [0, 0], [1, 1],   // chain 0 through (0.5,0.5)
      [0, 1], [1, 0],   // chain 1 through (0.5,0.5)
      [0.5, 0], [0.5, 1], // chain 2 through (0.5,0.5)
    ];
    const chains = [[0, 1], [2, 3], [4, 5]];
    const r = planarizeChains(points, chains);
    const newIds = new Set<number>();
    for (const ch of r.chains) for (const id of ch) if (id >= points.length) newIds.add(id);
    expect(newIds.size).toBe(1); // exactly one shared crossing vertex
    expect(countChainCrossings(r.points, r.chains)).toBe(0);
  });
});
