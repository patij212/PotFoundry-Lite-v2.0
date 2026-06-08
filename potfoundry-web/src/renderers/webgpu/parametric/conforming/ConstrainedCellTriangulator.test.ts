import { describe, it, expect } from 'vitest';
import {
  triangulateConstrainedCell,
  type CellPoint,
} from './ConstrainedCellTriangulator';

/** Signed area of triangle p,q,r in (u,t); positive ⇒ CCW. */
function signedArea(p: CellPoint, q: CellPoint, r: CellPoint): number {
  return 0.5 * ((q.u - p.u) * (r.t - p.t) - (r.u - p.u) * (q.t - p.t));
}

/** How many triangles use the undirected edge (a,b). */
function countEdge(tris: Array<[number, number, number]>, a: number, b: number): number {
  let n = 0;
  for (const t of tris) {
    const s = new Set(t);
    if (s.has(a) && s.has(b)) n++;
  }
  return n;
}

function hasEdge(tris: Array<[number, number, number]>, a: number, b: number): boolean {
  return countEdge(tris, a, b) > 0;
}

function totalArea(res: { points: CellPoint[]; triangles: Array<[number, number, number]> }): number {
  return res.triangles.reduce(
    (s, [a, b, c]) => s + signedArea(res.points[a], res.points[b], res.points[c]),
    0,
  );
}

describe('triangulateConstrainedCell', () => {
  it('triangulates a plain square cell into CCW triangles covering it', () => {
    const boundary: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];
    const res = triangulateConstrainedCell({ boundary, interior: [], constraints: [] });

    const total = res.triangles.reduce(
      (s, [a, b, c]) => s + signedArea(res.points[a], res.points[b], res.points[c]),
      0,
    );
    expect(total).toBeCloseTo(1, 9); // unit-square area, all CCW
    for (const [a, b, c] of res.triangles) {
      expect(signedArea(res.points[a], res.points[b], res.points[c])).toBeGreaterThan(0);
    }
  });

  it('preserves every boundary vertex and the constraint edge (no T-junction)', () => {
    // Square cell with a mid-edge crossing on the south and north edges, and a
    // straight feature segment joining them (the curve crosses the cell vertically).
    const boundary: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 0.5, t: 0 }, // south crossing (index 1)
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0.5, t: 1 }, // north crossing (index 4)
      { u: 0, t: 1 },
    ];
    const res = triangulateConstrainedCell({ boundary, interior: [], constraints: [[1, 4]] });

    // Every boundary vertex must be referenced (else a T-junction would form
    // where a neighbour cell expects that vertex on the shared edge).
    const used = new Set(res.triangles.flat());
    for (let i = 0; i < boundary.length; i++) expect(used.has(i)).toBe(true);

    // Each boundary segment is a real polygon edge ⇒ used by exactly ONE triangle.
    for (let i = 0; i < boundary.length; i++) {
      expect(countEdge(res.triangles, i, (i + 1) % boundary.length)).toBe(1);
    }

    // The feature segment is a real mesh edge (sharp dihedral, not a chamfer),
    // shared by exactly two triangles (it is interior).
    expect(countEdge(res.triangles, 1, 4)).toBe(2);

    expect(totalArea(res)).toBeCloseTo(1, 9);
    for (const [a, b, c] of res.triangles) {
      expect(signedArea(res.points[a], res.points[b], res.points[c])).toBeGreaterThan(0);
    }
  });

  it('threads a bent (multi-segment) feature through an interior vertex', () => {
    // Curve enters west edge, bends at an interior point, exits east edge.
    const boundary: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 0.5 }, // east crossing (index 2)
      { u: 1, t: 1 },
      { u: 0, t: 1 },
      { u: 0, t: 0.5 }, // west crossing (index 5)
    ];
    const interior: CellPoint[] = [{ u: 0.5, t: 0.7 }]; // bend vertex (index 6)
    // Constraint chain: west(5) → bend(6) → east(2).
    const res = triangulateConstrainedCell({
      boundary,
      interior,
      constraints: [
        [5, 6],
        [6, 2],
      ],
    });

    const used = new Set(res.triangles.flat());
    for (let i = 0; i < boundary.length + interior.length; i++) expect(used.has(i)).toBe(true);
    expect(hasEdge(res.triangles, 5, 6)).toBe(true);
    expect(hasEdge(res.triangles, 6, 2)).toBe(true);
    expect(totalArea(res)).toBeCloseTo(1, 9);
    for (const [a, b, c] of res.triangles) {
      expect(signedArea(res.points[a], res.points[b], res.points[c])).toBeGreaterThan(0);
    }
  });
});
