// planarizeSkeleton.test.ts — fast synthetic guard for the PSLG planarizer. No env gate (runs in ms).
// Non-vacuous: a proper crossing MUST produce a shared node + split both segments; a T-junction splits the crossed
// segment only; disjoint segments are untouched.
import { describe, it, expect } from 'vitest';
import { planarizeSegments } from './planarizeSkeleton';

const round = (u: number, t: number): string => `${Math.round(u / 1e-5)}_${Math.round(t / 1e-5)}`;
const hasPoint = (p: PSLGpts, u: number, t: number): boolean => { for (let i = 0; i < p.length; i += 2) if (round(p[i], p[i + 1]) === round(u, t)) return true; return false; };
type PSLGpts = number[];

describe('planarizeSegments', () => {
  it('splits a proper crossing into a shared node (X → 5 pts, 4 edges)', () => {
    const g = planarizeSegments([
      [0.2, 0.5, 0.8, 0.5], // horizontal
      [0.5, 0.2, 0.5, 0.8], // vertical — crosses at (0.5,0.5)
    ]);
    expect(g.points.length / 2).toBe(5); // 4 endpoints + 1 crossing
    expect(g.edges.length / 2).toBe(4);  // each segment split in two
    expect(hasPoint(g.points, 0.5, 0.5)).toBe(true); // the crossing is a node
    // the crossing node is shared (degree 4)
    const centerIdx = (() => { for (let i = 0; i < g.points.length; i += 2) if (round(g.points[i], g.points[i + 1]) === round(0.5, 0.5)) return i / 2; return -1; })();
    let deg = 0; for (let e = 0; e < g.edges.length; e += 2) if (g.edges[e] === centerIdx || g.edges[e + 1] === centerIdx) deg++;
    expect(deg).toBe(4);
  });

  it('splits a T-junction on the crossed segment only (3 edges, 4 pts)', () => {
    const g = planarizeSegments([
      [0.2, 0.5, 0.8, 0.5],  // horizontal
      [0.5, 0.5, 0.5, 0.8],  // vertical starting ON the horizontal's interior (T)
    ]);
    expect(g.points.length / 2).toBe(4);
    expect(g.edges.length / 2).toBe(3); // horizontal → 2, vertical → 1
    expect(hasPoint(g.points, 0.5, 0.5)).toBe(true);
  });

  it('leaves disjoint segments untouched (2 edges, 4 pts)', () => {
    const g = planarizeSegments([
      [0.1, 0.1, 0.3, 0.1],
      [0.6, 0.6, 0.9, 0.9],
    ]);
    expect(g.points.length / 2).toBe(4);
    expect(g.edges.length / 2).toBe(2);
  });

  it('shares a common endpoint without spurious splitting (2 edges, 3 pts)', () => {
    const g = planarizeSegments([
      [0.2, 0.2, 0.5, 0.5],
      [0.5, 0.5, 0.8, 0.2], // shares endpoint (0.5,0.5) — a legal shared node, no interior split
    ]);
    expect(g.points.length / 2).toBe(3);
    expect(g.edges.length / 2).toBe(2);
  });
});
