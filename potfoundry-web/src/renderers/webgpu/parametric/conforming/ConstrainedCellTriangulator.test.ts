import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  normalizeWinding,
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

  /**
   * Count edges used by exactly ONE triangle that are NOT cell-perimeter edges
   * (boundary loop `i↔i+1`, wrap `0↔nB-1`). In a watertight cell every interior
   * edge is shared by 2 triangles, so a non-zero count is a hole (missing triangle).
   */
  function interiorNakedCount(
    tris: Array<[number, number, number]>,
    nB: number,
  ): number {
    const isPerim = (lo: number, hi: number): boolean =>
      hi < nB && (hi === lo + 1 || (lo === 0 && hi === nB - 1));
    const count = new Map<string, number>();
    for (const [a, b, c] of tris) {
      for (const [x, y] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const lo = Math.min(x, y);
        const hi = Math.max(x, y);
        const k = `${lo}:${hi}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    let naked = 0;
    for (const [k, cnt] of count) {
      if (cnt !== 1) continue;
      const [lo, hi] = k.split(':').map(Number);
      if (!isPerim(lo, hi)) naked++;
    }
    return naked;
  }

  it('fills a closed feature loop inside a cell (cdt2d exterior-removal hole)', () => {
    // Real failing Voronoi outer-wall cell (u∈[79/128,80.5/128], t∈[14/128,15/128])
    // dumped from assembleConformingCPU('Voronoi'). The feature constraints form a
    // CLOSED LOOP among {7,8,9} (a Voronoi junction) plus a pendant edge 9↔5. cdt2d
    // with { exterior:false } classifies the loop interior as "exterior" and drops
    // the triangle (7,8,9), leaving a 3-naked-edge hole. The whole cell rectangle is
    // real surface, so the triangulation MUST cover it — no interior naked edges.
    const boundary: CellPoint[] = [
      { u: 0.6171875, t: 0.109375 }, // 0 SW
      { u: 0.619140625, t: 0.109375 }, // 1 S-mid
      { u: 0.62109375, t: 0.109375 }, // 2 SE
      { u: 0.62109375, t: 0.11328125 }, // 3 E-mid
      { u: 0.62109375, t: 0.1171875 }, // 4 NE
      { u: 0.618539683, t: 0.1171875 }, // 5 N feature crossing
      { u: 0.6171875, t: 0.1171875 }, // 6 NW
      { u: 0.6171875, t: 0.113502935 }, // 7 W feature crossing
    ];
    const interior: CellPoint[] = [
      { u: 0.61875, t: 0.11338815 }, // 8
      { u: 0.61875, t: 0.115210586 }, // 9
    ];
    // Feature edges: triangle 7-8-9 (closed loop) + pendant 9-5.
    const constraints: Array<[number, number]> = [[8, 7], [7, 9], [9, 8], [5, 9], [9, 7]];
    const res = triangulateConstrainedCell({ boundary, interior, constraints });

    // The cell must be watertight: no interior edge left with a single triangle.
    expect(interiorNakedCount(res.triangles, boundary.length)).toBe(0);

    // Full rectangle coverage (Δu·Δt), all triangles CCW.
    const rectArea = (0.62109375 - 0.6171875) * (0.1171875 - 0.109375);
    expect(totalArea(res)).toBeCloseTo(rectArea, 9);
    for (const [a, b, c] of res.triangles) {
      expect(signedArea(res.points[a], res.points[b], res.points[c])).toBeGreaterThan(0);
    }

    // Every boundary vertex is retained (no T-junction on a shared perimeter edge).
    const used = new Set(res.triangles.flat());
    for (let i = 0; i < boundary.length + interior.length; i++) expect(used.has(i)).toBe(true);

    // The closed-loop feature edges survive as real mesh edges (sharp creases).
    expect(hasEdge(res.triangles, 7, 8)).toBe(true);
    expect(hasEdge(res.triangles, 8, 9)).toBe(true);
    expect(hasEdge(res.triangles, 7, 9)).toBe(true);
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

describe('normalizeWinding — masking-channel counters', () => {
  const pts: CellPoint[] = [
    { u: 0, t: 0 }, { u: 1, t: 0 }, { u: 1, t: 1 }, { u: 0.5, t: 0 },
  ];

  it('passes CCW triangles through with zero counts', () => {
    const r = normalizeWinding(pts, [[0, 1, 2]]);
    expect(r.triangles).toEqual([[0, 1, 2]]);
    expect(r.inversionCount).toBe(0);
    expect(r.droppedCount).toBe(0);
  });

  it('counts a CW triangle as an inversion and flips it', () => {
    const r = normalizeWinding(pts, [[0, 2, 1]]);
    expect(r.triangles).toEqual([[0, 1, 2]]);
    expect(r.inversionCount).toBe(1);
  });

  it('counts a zero-area (collinear) triangle as a drop', () => {
    const r = normalizeWinding(pts, [[0, 3, 1]]); // 3 collinear points on t=0
    expect(r.triangles).toEqual([]);
    expect(r.droppedCount).toBe(1);
  });

  it('triangulateConstrainedCell reports zero counts on a clean square', () => {
    const boundary: CellPoint[] = [
      { u: 0, t: 0 }, { u: 1, t: 0 }, { u: 1, t: 1 }, { u: 0, t: 1 },
    ];
    const res = triangulateConstrainedCell({ boundary, interior: [], constraints: [] });
    expect(res.inversionCount).toBe(0);
    expect(res.droppedCount).toBe(0);
  });
});

describe('CDT incident replays (drop e2e dumps into __fixtures__/cdt-incidents/)', () => {
  const dir = join(__dirname, '__fixtures__', 'cdt-incidents');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  it.skipIf(files.length === 0)('replays every dumped incident and re-reports its counters', () => {
    for (const f of files) {
      const input = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const res = triangulateConstrainedCell(input);
      // The dump exists BECAUSE a channel fired — replay must reproduce it (causal repro).
      expect(res.inversionCount + res.droppedCount, f).toBeGreaterThan(0);
    }
  });
});
