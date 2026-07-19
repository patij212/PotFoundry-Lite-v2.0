// _geoStarGraphDiag.test.ts — TEMPORARY diagnostic (PF_GSDIAG=1): measure the raw chevron graph
// structure (pairwise segment crossings, near-duplicate vertices, degree distribution, components)
// at several segLen values, to inform the planarization design. Delete after design is settled.
import { describe, it } from 'vitest';
import { buildGeometricStarConformingGraph, DEFAULT_GEOSTAR_STRAP } from './geoStarFeatureEdges';
import { geometricStarStrapField } from '../../src/fidelity/analyticSurfaceGate';

// proper segment crossing: interiors intersect, no shared endpoint index, not merely collinear-touch.
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
function properCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

describe('geoStar chevron graph — raw structure diagnostic', () => {
  it.skipIf(process.env.PF_GSDIAG !== '1')('crossings/degree/components vs segLen', () => {
    const p = DEFAULT_GEOSTAR_STRAP;
    const { field, hi: edge } = geometricStarStrapField(p.points, p.gap, p.detail, p.layers, p.roundness, p.zoom, p.shift);
    for (const segLen of [0.005, 0.002, 0.0009, 0]) {
      const g = buildGeometricStarConformingGraph({ segLen });
      const nPts = g.pts.length / 2;
      const nEdges = g.edges.length / 2;
      // degree
      const deg = new Int32Array(nPts);
      for (const v of g.edges) deg[v]++;
      const degHist = new Map<number, number>();
      for (let i = 0; i < nPts; i++) degHist.set(deg[i], (degHist.get(deg[i]) ?? 0) + 1);
      // components (union-find over edges)
      const uf = new Int32Array(nPts); for (let i = 0; i < nPts; i++) uf[i] = i;
      const find = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
      for (let e = 0; e < nEdges; e++) { const a = g.edges[2 * e], b = g.edges[2 * e + 1]; uf[find(a)] = find(b); }
      const comps = new Set<number>(); for (let i = 0; i < nPts; i++) if (deg[i] > 0) comps.add(find(i));
      // near-duplicate vertices (grid hash at 1e-6)
      const cell = new Map<string, number>(); let nearDup = 0;
      for (let i = 0; i < nPts; i++) {
        const k = `${Math.round(g.pts[2 * i] / 1e-6)}_${Math.round(g.pts[2 * i + 1] / 1e-6)}`;
        if (cell.has(k)) nearDup++; else cell.set(k, i);
      }
      // pairwise proper crossings (AABB-pruned brute force). Split edges by which level each is on.
      // build edge AABBs, sort by minU, sweep.
      const ex0: number[] = [], ey0: number[] = [], ex1: number[] = [], ey1: number[] = [], ea: number[] = [], eb: number[] = [];
      for (let e = 0; e < nEdges; e++) {
        const a = g.edges[2 * e], b = g.edges[2 * e + 1];
        ex0.push(g.pts[2 * a]); ey0.push(g.pts[2 * a + 1]); ex1.push(g.pts[2 * b]); ey1.push(g.pts[2 * b + 1]); ea.push(a); eb.push(b);
      }
      const order = Array.from({ length: nEdges }, (_, i) => i).sort((i, j) => Math.min(ex0[i], ex1[i]) - Math.min(ex0[j], ex1[j]));
      let crossings = 0; let interLevel = 0;
      // classify each vertex level: |field|<|field-edge| => level 0 else edge
      const lvl = new Int8Array(nPts);
      for (let i = 0; i < nPts; i++) { const d = field(g.pts[2 * i], g.pts[2 * i + 1]); lvl[i] = Math.abs(d) < Math.abs(d - edge) ? 0 : 1; }
      for (let ii = 0; ii < nEdges; ii++) {
        const i = order[ii];
        const iMaxU = Math.max(ex0[i], ex1[i]);
        const iMinT = Math.min(ey0[i], ey1[i]), iMaxT = Math.max(ey0[i], ey1[i]);
        for (let jj = ii + 1; jj < nEdges; jj++) {
          const j = order[jj];
          if (Math.min(ex0[j], ex1[j]) > iMaxU) break; // sweep prune
          if (Math.max(ey0[j], ey1[j]) < iMinT || Math.min(ey0[j], ey1[j]) > iMaxT) continue;
          if (ea[i] === ea[j] || ea[i] === eb[j] || eb[i] === ea[j] || eb[i] === eb[j]) continue; // shared endpoint
          if (properCross(ex0[i], ey0[i], ex1[i], ey1[i], ex0[j], ey0[j], ex1[j], ey1[j])) {
            crossings++;
            if (lvl[ea[i]] !== lvl[ea[j]] || lvl[eb[i]] !== lvl[eb[j]] || lvl[ea[i]] !== lvl[eb[i]]) interLevel++;
          }
        }
      }
      const degStr = [...degHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ');
      // eslint-disable-next-line no-console
      console.log(`[diag segLen=${segLen}] pts=${nPts} edges=${nEdges} comps=${comps.size} nearDup(1e-6)=${nearDup} crossings=${crossings} interLevelCross~=${interLevel} deg{${degStr}}`);
    }
  }, 120000);
});
