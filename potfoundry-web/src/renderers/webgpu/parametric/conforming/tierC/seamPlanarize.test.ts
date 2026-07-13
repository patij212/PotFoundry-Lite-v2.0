// seamPlanarize.test.ts — the pre-triangulation planarity guard for the Tier-C refine loop.
//
// Regression for the cdt2d `upperIds` mergeHulls crash at high refine density: the interior
// loop's constraint-edge subdivision computes midpoints in SEAM-UNWRAPPED u (u can go >=1 or
// <0) and addPt stores that raw, so a seam-adjacent edge's midpoint ends up joined to its
// original wrapped opposite-seam endpoint — a segment that is tiny in wrapped topology but
// SPANS the whole chart in the flat mm space cdt2d triangulates. Chart-spanning constraint
// edges cross thousands of others -> non-planar PSLG -> cdt2d throws. planarizeChartMM restores
// planarity BEFORE triangulation: canonicalize u into [0,1), split seam-straddling constraint
// edges at the seam, and split any residual proper crossing into a T-junction.
import { describe, it, expect } from 'vitest';
import cdt2d from 'cdt2d';
import { planarizeChartMM } from './seamPlanarize';

const uToMm = 280;
const tToMm = 120;

/** Proper-crossing predicate in mm (matches morseComplex.properCross). */
function properCrossingCount(
  uv: number[],
  cEdges: Array<[number, number]>,
): number {
  const X = (i: number): number => uv[2 * i] * uToMm;
  const Y = (i: number): number => uv[2 * i + 1] * tToMm;
  const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const EPS = 1e-9;
  let n = 0;
  for (let i = 0; i < cEdges.length; i++) {
    for (let j = i + 1; j < cEdges.length; j++) {
      const [a, b] = cEdges[i];
      const [c, d] = cEdges[j];
      if (a === c || a === d || b === c || b === d) continue;
      const d1 = orient(X(c), Y(c), X(d), Y(d), X(a), Y(a));
      const d2 = orient(X(c), Y(c), X(d), Y(d), X(b), Y(b));
      const d3 = orient(X(a), Y(a), X(b), Y(b), X(c), Y(c));
      const d4 = orient(X(a), Y(a), X(b), Y(b), X(d), Y(d));
      if (
        ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
        ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
      ) {
        n++;
      }
    }
  }
  return n;
}

/** Widest constraint edge in mm — a chart spanner is > half the chart width. */
function widestEdgeMm(uv: number[], cEdges: Array<[number, number]>): number {
  let w = 0;
  for (const [a, b] of cEdges) {
    w = Math.max(w, Math.abs(uv[2 * a] * uToMm - uv[2 * b] * uToMm));
  }
  return w;
}

describe('planarizeChartMM — pre-triangulation seam planarity guard', () => {
  it('removes seam-spanning constraint edges and residual crossings so cdt2d succeeds', () => {
    // A seam-straddling constraint edge (v0 near u=1, v1 near u=0) that spans the flat chart and
    // crosses a vertical mid-chart constraint (v2-v3); plus out-of-range midpoints (v4 at u=1.0
    // exactly, v5 at negative u) exactly as the buggy addPt stores them. Corners give a hull.
    const uv = [
      0.99, 0.5, // v0 near u=1 seam
      0.01, 0.51, // v1 near u=0 seam
      0.5, 0.2, // v2 mid
      0.5, 0.8, // v3 mid
      1.0, 0.3, // v4 raw u==1 (out of [0,1))
      -0.02, 0.3, // v5 raw negative u (out of [0,1))
      0.0, 0.0, // corners
      1.0, 0.0,
      0.0, 1.0,
      1.0, 1.0,
    ];
    const cEdges: Array<[number, number]> = [
      [0, 1], // seam spanner
      [2, 3], // vertical crosser
      [4, 5], // out-of-range spanner
    ];

    // Sanity: the raw input IS pathological (spanners present + a crossing).
    expect(widestEdgeMm(uv, cEdges)).toBeGreaterThan(uToMm / 2);
    expect(properCrossingCount(uv, cEdges)).toBeGreaterThan(0);

    const changed = planarizeChartMM(uv, cEdges, uToMm, tToMm);
    expect(changed).toBe(true);

    // (1) Every vertex u in [0,1] — free points canonicalized into [0,1); the seam-split adds
    //     twins at exactly u=0 and u=1 (both valid: u=1 maps to x=uToMm in the flat mm space,
    //     the far seam, and is what keeps a near-u=1 edge from spanning the chart).
    for (let i = 0; i < uv.length / 2; i++) {
      expect(uv[2 * i]).toBeGreaterThanOrEqual(0);
      expect(uv[2 * i]).toBeLessThanOrEqual(1);
    }
    // (2) No constraint edge spans the chart anymore.
    expect(widestEdgeMm(uv, cEdges)).toBeLessThanOrEqual(uToMm / 2);
    // (3) Zero proper crossings — the exact invariant cdt2d requires.
    expect(properCrossingCount(uv, cEdges)).toBe(0);
    // (4) cdt2d now triangulates without throwing and returns a non-empty mesh.
    const nV = uv.length / 2;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < nV; i++) pts.push([uv[2 * i] * uToMm, uv[2 * i + 1] * tToMm]);
    let threw = false;
    let tris: number[][] = [];
    try {
      tris = cdt2d(pts, cEdges, { exterior: true }) as number[][];
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(tris.length).toBeGreaterThan(0);
  });

  it('is inert on an already-planar chart PSLG (no spurious splits)', () => {
    // A clean, non-straddling, non-crossing PSLG: two short in-domain constraint edges + corners.
    const uv = [
      0.3, 0.3,
      0.35, 0.35,
      0.6, 0.6,
      0.65, 0.62,
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      1.0, 1.0,
    ];
    const cEdges: Array<[number, number]> = [
      [0, 1],
      [2, 3],
    ];
    const before = JSON.stringify({ uv, cEdges });
    const changed = planarizeChartMM(uv, cEdges, uToMm, tToMm);
    expect(changed).toBe(false);
    expect(JSON.stringify({ uv, cEdges })).toBe(before);
  });
});
