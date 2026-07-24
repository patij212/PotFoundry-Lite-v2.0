// _strataVoronoiLepp.test.ts — STRATA-001 S7: WATERTIGHT structured Voronoi mesh via conforming Rivara longest-edge
// bisection (LEPP). The recursive prototype reached 0.01mm fidelity but left T-junctions; LEPP refines a GLOBAL mesh
// with an edge→triangle adjacency map, so splitting a shared edge splits BOTH incident triangles → conforming →
// watertight by construction. Cells are welded across shared bisector edges (Voronoi vertices deduped by position),
// so the multi-cell patch is a single 2-manifold surface.
//
// Proves TWO things a generic mesher never did together: (1) every triangle ≤ 0.01mm from the analytic Voronoi
// surface, (2) 2-manifold (every interior edge shared by exactly 2 triangles, 0 non-manifold, 0 hanging nodes).
//
// Gated PF_STRATA_LEPP=1. DEV/LAB only; never edits src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { voronoiCenterCellular, type VoronoiLatticeParams } from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_LEPP === '1';
const LATTICE: VoronoiLatticeParams = { scale: 8, jitter: 0.8, pulse: 0, zStretch: 1, period: 8 };
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TOL = 0.01;

type P2 = readonly [number, number];

function envF(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

// ---- convex-cell clipping (same as the STL emitter) ----
function clipHalfPlane(poly: P2[], nx: number, ny: number, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - d;
    const db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const s = da / (da - db);
      out.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
    }
  }
  return out;
}
function cellPolygon(cx: number, cy: number): P2[] {
  const [sx, sy] = voronoiCenterCellular(LATTICE, cx, cy);
  const R = 2.5;
  let poly: P2[] = [[sx - R, sy - R], [sx + R, sy - R], [sx + R, sy + R], [sx - R, sy + R]];
  for (let ox = -3; ox <= 3; ox += 1) {
    for (let oy = -3; oy <= 3; oy += 1) {
      if (ox === 0 && oy === 0) continue;
      const [nx, ny] = voronoiCenterCellular(LATTICE, cx + ox, cy + oy);
      const dx = nx - sx;
      const dy = ny - sy;
      if (Math.hypot(dx, dy) > 2 * R) continue;
      const mx = (sx + nx) / 2;
      const my = (sy + ny) / 2;
      poly = clipHalfPlane(poly, dx, dy, dx * mx + dy * my);
      if (poly.length < 3) return [];
    }
  }
  return poly;
}

describe('STRATA-001 S7: watertight Voronoi mesh via LEPP', () => {
  it.runIf(RUN)('builds a conforming 2-manifold cell mesh ≤ 0.01mm and emits STL', () => {
    const morph = envF('PF_LEPP_MORPH', 1);
    const cxLo = Math.round(envF('PF_LEPP_CXLO', 4));
    const cxHi = Math.round(envF('PF_LEPP_CXHI', 4));
    const cyLo = Math.round(envF('PF_LEPP_CYLO', 4));
    const cyHi = Math.round(envF('PF_LEPP_CYHI', 4));
    const oracleN = Math.round(envF('PF_LEPP_ORACLE', 10));
    const triCap = Math.round(envF('PF_LEPP_TRICAP', 1_500_000));
    const rA = buildRadiusFn('Voronoi' as StyleId, { vMorph: morph, vRelief: 2.0, vScale: 8, vJitter: 0.8, vZStretch: 1, vPulse: 0 }, DIMS);

    // ---- mesh store ----
    const vu: number[] = []; // vertex u (cellular)
    const vv: number[] = []; // vertex v (cellular)
    const vx: number[] = []; // lifted x,y,z
    const vy: number[] = [];
    const vz: number[] = [];
    const weld = new Map<string, number>();
    const WELD = 1e6; // quantize to 1e-6 cellular
    const addVertex = (u: number, v: number): number => {
      const key = `${Math.round(u * WELD)},${Math.round(v * WELD)}`;
      const hit = weld.get(key);
      if (hit !== undefined) return hit;
      const idx = vu.length;
      vu.push(u);
      vv.push(v);
      const theta = 2 * Math.PI * (u / LATTICE.scale);
      const z = (v / (LATTICE.scale * LATTICE.zStretch)) * H;
      const r = rA(theta, z);
      vx.push(r * Math.cos(theta));
      vy.push(r * Math.sin(theta));
      vz.push(z);
      weld.set(key, idx);
      return idx;
    };

    const ta: number[] = [];
    const tb: number[] = [];
    const tc: number[] = [];
    const alive: boolean[] = [];
    // edge (a<b) numeric key → up to 2 live triangle indices
    const BIG = 1 << 26;
    const edgeMap = new Map<number, number[]>();
    const eKey = (a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);
    const edgeAdd = (a: number, b: number, t: number): void => {
      const k = eKey(a, b);
      const list = edgeMap.get(k);
      if (list === undefined) edgeMap.set(k, [t]);
      else list.push(t);
    };
    const edgeRemove = (a: number, b: number, t: number): void => {
      const list = edgeMap.get(eKey(a, b));
      if (list === undefined) return;
      const i = list.indexOf(t);
      if (i >= 0) list.splice(i, 1);
    };
    const addTri = (a: number, b: number, c: number): number => {
      const t = ta.length;
      ta.push(a);
      tb.push(b);
      tc.push(c);
      alive.push(true);
      edgeAdd(a, b, t);
      edgeAdd(b, c, t);
      edgeAdd(c, a, t);
      return t;
    };
    const killTri = (t: number): void => {
      alive[t] = false;
      edgeRemove(ta[t], tb[t], t);
      edgeRemove(tb[t], tc[t], t);
      edgeRemove(tc[t], ta[t], t);
    };

    // ---- initial mesh: fan each cell from its centroid; boundary corners welded across cells ----
    let cells = 0;
    for (let cx = cxLo; cx <= cxHi; cx += 1) {
      for (let cy = cyLo; cy <= cyHi; cy += 1) {
        const poly = cellPolygon(cx, cy);
        if (poly.length < 3) continue;
        cells += 1;
        let ccx = 0;
        let ccy = 0;
        for (const p of poly) {
          ccx += p[0];
          ccy += p[1];
        }
        const cIdx = addVertex(ccx / poly.length, ccy / poly.length);
        const ring = poly.map((p) => addVertex(p[0], p[1]));
        for (let e = 0; e < ring.length; e += 1) {
          addTri(cIdx, ring[e], ring[(e + 1) % ring.length]);
        }
      }
    }

    // ---- geometry helpers ----
    const edgeLen3 = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
    // Longest edge of a triangle → 0 (ab), 1 (bc), 2 (ca).
    const longestEdge = (t: number): number => {
      const lab = edgeLen3(ta[t], tb[t]);
      const lbc = edgeLen3(tb[t], tc[t]);
      const lca = edgeLen3(tc[t], ta[t]);
      if (lab >= lbc && lab >= lca) return 0;
      if (lbc >= lab && lbc >= lca) return 1;
      return 2;
    };
    const edgeVerts = (t: number, e: number): [number, number] =>
      e === 0 ? [ta[t], tb[t]] : e === 1 ? [tb[t], tc[t]] : [tc[t], ta[t]];
    const apexVert = (t: number, e: number): number => (e === 0 ? tc[t] : e === 1 ? ta[t] : tb[t]);
    // True-3D sag of a triangle vs the analytic surface.
    const sagOf = (t: number): number => {
      const a = ta[t];
      const b = tb[t];
      const c = tc[t];
      let nx = (vy[b] - vy[a]) * (vz[c] - vz[a]) - (vz[b] - vz[a]) * (vy[c] - vy[a]);
      let ny = (vz[b] - vz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vz[c] - vz[a]);
      let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let s = 0;
      for (let i = 0; i <= oracleN; i += 1) {
        for (let j = 0; j <= oracleN - i; j += 1) {
          const wa = i / oracleN;
          const wb = j / oracleN;
          const wc = 1 - wa - wb;
          const u = wa * vu[a] + wb * vu[b] + wc * vu[c];
          const v = wa * vv[a] + wb * vv[b] + wc * vv[c];
          const theta = 2 * Math.PI * (u / LATTICE.scale);
          const z = (v / (LATTICE.scale * LATTICE.zStretch)) * H;
          const r = rA(theta, z);
          const qx = r * Math.cos(theta);
          const qy = r * Math.sin(theta);
          const d = Math.abs((qx - vx[a]) * nx + (qy - vy[a]) * ny + (z - vz[a]) * nz);
          if (d > s) s = d;
        }
      }
      return s;
    };

    // ---- conforming longest-edge bisection ----
    const neighborAcross = (t: number, a: number, b: number): number => {
      const list = edgeMap.get(eKey(a, b));
      if (list === undefined) return -1;
      for (const other of list) if (other !== t) return other;
      return -1;
    };
    // Bisect the edge (a,b) shared by 1 or 2 triangles at its 3D-consistent midpoint (cellular midpoint).
    const created: number[] = [];
    const bisectEdge = (a: number, b: number): void => {
      const m = addVertex((vu[a] + vu[b]) / 2, (vv[a] + vv[b]) / 2);
      const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
      for (const t of list) {
        if (!alive[t]) continue;
        // apex is the vertex not on (a,b)
        const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
        // preserve orientation: find (a,b) direction in this triangle
        const seq = [ta[t], tb[t], tc[t]];
        // locate a then b consecutively (cyclically)
        let oa = a;
        let ob = b;
        for (let i = 0; i < 3; i += 1) {
          if (seq[i] === a && seq[(i + 1) % 3] === b) {
            oa = a;
            ob = b;
            break;
          }
          if (seq[i] === b && seq[(i + 1) % 3] === a) {
            oa = b;
            ob = a;
            break;
          }
        }
        killTri(t);
        created.push(addTri(oa, m, apex));
        created.push(addTri(m, ob, apex));
      }
    };
    // Conformingly bisect triangle t's longest edge (Rivara LEPP walk to a terminal edge).
    const refineLongest = (t0: number): void => {
      let guard = 4_000_000;
      while (alive[t0] && guard-- > 0) {
        // walk to terminal
        let t = t0;
        let inner = 4_000_000;
        for (;;) {
          if (inner-- <= 0) return;
          const e = longestEdge(t);
          const [a, b] = edgeVerts(t, e);
          const nb = neighborAcross(t, a, b);
          if (nb === -1) {
            bisectEdge(a, b);
            break;
          }
          // is (a,b) also nb's longest edge?
          const enb = longestEdge(nb);
          const [na, nbv] = edgeVerts(nb, enb);
          if ((na === a && nbv === b) || (na === b && nbv === a)) {
            bisectEdge(a, b);
            break;
          }
          t = nb;
        }
        // after one terminal bisection, has t0 been split? if t0 died, done.
        if (!alive[t0]) break;
        // if t0's current longest edge is now a boundary/shared-longest terminal, one more pass will split it;
        // loop continues until t0 is consumed.
        const e0 = longestEdge(t0);
        const [a0, b0] = edgeVerts(t0, e0);
        const nb0 = neighborAcross(t0, a0, b0);
        if (nb0 === -1) {
          bisectEdge(a0, b0);
          break;
        }
        const enb0 = longestEdge(nb0);
        const [na0, nbv0] = edgeVerts(nb0, enb0);
        if ((na0 === a0 && nbv0 === b0) || (na0 === b0 && nbv0 === a0)) {
          bisectEdge(a0, b0);
          break;
        }
      }
    };

    // ---- driver: refine any triangle over tol until none remain (or cap) ----
    const stack: number[] = [];
    for (let t = 0; t < ta.length; t += 1) stack.push(t);
    let capped = false;
    while (stack.length > 0) {
      const t = stack.pop() as number;
      if (!alive[t]) continue;
      if (sagOf(t) <= TOL) continue;
      if (ta.length >= triCap) {
        capped = true;
        break;
      }
      created.length = 0;
      refineLongest(t);
      for (const nt of created) if (alive[nt]) stack.push(nt);
      if (alive[t]) stack.push(t); // re-check if somehow still alive & over tol
    }

    // ---- audits ----
    const liveTris: number[] = [];
    for (let t = 0; t < ta.length; t += 1) if (alive[t]) liveTris.push(t);
    // manifold: every edge shared by 1 (boundary) or 2 (interior); >2 = non-manifold.
    let nonManifold = 0;
    let boundaryEdges = 0;
    let maxShare = 0;
    // CRACK DETECTOR: a boundary edge whose endpoint POSITIONS coincide with another boundary edge (different vertex
    // indices, same place) is a weld failure between two cells — the surface looks 2-manifold locally (each side is a
    // boundary edge) but there is a seam. A genuine open patch boundary appears exactly ONCE per position.
    const boundaryByPos = new Map<string, number>();
    const posKey = (v: number): string => `${Math.round(vx[v] * 1e4)},${Math.round(vy[v] * 1e4)},${Math.round(vz[v] * 1e4)}`;
    for (const [k, list] of edgeMap.entries()) {
      const live = list.filter((t) => alive[t]).length;
      if (live === 0) continue;
      if (live === 1) {
        boundaryEdges += 1;
        const a = Math.floor(k / BIG);
        const b = k % BIG;
        const pk = posKey(a) < posKey(b) ? `${posKey(a)}|${posKey(b)}` : `${posKey(b)}|${posKey(a)}`;
        boundaryByPos.set(pk, (boundaryByPos.get(pk) ?? 0) + 1);
      } else if (live > 2) nonManifold += 1;
      if (live > maxShare) maxShare = live;
    }
    let cracks = 0;
    for (const count of boundaryByPos.values()) if (count > 1) cracks += count;
    // fidelity over live triangles (dense verify oracle).
    let maxSag = 0;
    const sags: number[] = [];
    for (const t of liveTris) {
      const s = sagOf(t);
      sags.push(s);
      if (s > maxSag) maxSag = s;
    }
    sags.sort((a, b) => a - b);
    const over = sags.filter((s) => s > TOL).length;
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const q = (p: number): number => sags[Math.min(sags.length - 1, Math.floor(p * sags.length))];

    // ---- emit STL ----
    const outDir = join('research', 'exchange', '_strataVoronoiLepp');
    mkdirSync(outDir, { recursive: true });
    const stlName = `voronoi_${morph === 0 ? 'bubble' : 'web'}_LEPP_cx${cxLo}-${cxHi}_cy${cyLo}-${cyHi}.stl`;
    const buf = Buffer.alloc(84 + liveTris.length * 50);
    buf.write('STRATA-001 Voronoi watertight LEPP cell mesh', 0, 'ascii');
    buf.writeUInt32LE(liveTris.length, 80);
    let o = 84;
    for (const t of liveTris) {
      const a = ta[t];
      const b = tb[t];
      const c = tc[t];
      let nx = (vy[b] - vy[a]) * (vz[c] - vz[a]) - (vz[b] - vz[a]) * (vy[c] - vy[a]);
      let ny = (vz[b] - vz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vz[c] - vz[a]);
      let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
      const nl = Math.hypot(nx, ny, nz) || 1;
      buf.writeFloatLE(nx / nl, o);
      buf.writeFloatLE(ny / nl, o + 4);
      buf.writeFloatLE(nz / nl, o + 8);
      const verts = [a, b, c];
      for (let k = 0; k < 3; k += 1) {
        buf.writeFloatLE(vx[verts[k]], o + 12 + k * 12);
        buf.writeFloatLE(vy[verts[k]], o + 16 + k * 12);
        buf.writeFloatLE(vz[verts[k]], o + 20 + k * 12);
      }
      buf.writeUInt16LE(0, o + 48);
      o += 50;
    }
    writeFileSync(join(outDir, stlName), buf);

    const report = [
      '',
      '========== STRATA-001 S7: WATERTIGHT LEPP VORONOI MESH ==========',
      `file: ${stlName}  (${liveTris.length} triangles, ${vu.length} vertices)`,
      `Voronoi ${morph === 0 ? 'BUBBLE' : 'WEB'} vMorph ${morph}, vRelief 2.0, H120 — registry defaults`,
      `region: ${cells} cell(s) cx∈[${cxLo},${cxHi}] cy∈[${cyLo},${cyHi}]${capped ? '  (CAPPED)' : ''}`,
      '',
      '--- WATERTIGHT / MANIFOLD AUDIT ---',
      `  non-manifold edges (shared by >2 tris) : ${nonManifold}   ${nonManifold === 0 ? '✅' : '❌'}`,
      `  max edge share                          : ${maxShare}   (2 = clean interior)`,
      `  boundary edges (total)                  : ${boundaryEdges}`,
      `  inter-cell CRACKS (coincident boundary) : ${cracks}   ${cracks === 0 ? '✅ cells fully welded' : '❌ weld failed'}`,
      `  T-junctions/hanging nodes               : 0 by construction (conforming LEPP)`,
      '',
      '--- TRUE-3D FIDELITY (dense oracle ' + oracleN + ') ---',
      `  MAX sag : ${um(maxSag)} um   ${maxSag <= TOL ? '✅ ≤ 0.01mm' : '❌ OVER'}`,
      `  p99 ${um(q(0.99))} um   p50 ${um(q(0.5))} um   over-0.01mm: ${over}/${sags.length}`,
      '================================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    writeFileSync(join(outDir, `${stlName}.report.txt`), report);

    expect(nonManifold).toBe(0);
    expect(cracks).toBe(0);
    expect(maxSag).toBeLessThanOrEqual(TOL);
  }, 3_000_000);
});
