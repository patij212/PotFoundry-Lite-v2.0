// _strataVoronoiSolid.test.ts — STRATA-001 S7: CLOSED PRINTABLE Voronoi pot solid.
// Built in stages, all watertight-audited from the final 3D triangle soup (position-weld → every edge shared by
// exactly 2 ⇒ boundary edges 0 ⇒ closed 2-manifold):
//   Stage A (PF_SOLID_STAGE=ring): full outer wall RING, θ-periodic, seam welded. Boundary = top+bottom loops only.
//   Stage B (PF_SOLID_STAGE=solid): + inner wall + rim + base + floor ⇒ closed hollow pot, boundary edges 0.
//
// Seam handling: vertices are (θ, z); θ welded canonically in [0,2π); edge midpoints use the SHORTEST arc — so an edge
// straddling θ=0 bisects at θ=0, not the far side. The seam then welds with no special code.
//
// Gated PF_STRATA_SOLID=1. DEV/LAB only; never edits src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { voronoiCenterCellular, type VoronoiLatticeParams } from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import { baseRadius } from '../../src/geometry/profile';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_SOLID === '1';
const LATTICE: VoronoiLatticeParams = { scale: 8, jitter: 0.8, pulse: 0, zStretch: 1, period: 8 };
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const SCALE = 8;
const TWO_PI = 2 * Math.PI;
const TOL = 0.01;

type P2 = readonly [number, number];
type P3 = [number, number, number];

function envF(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

// ---- cell clipping in cellular (cx,cy) space ----
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
// Voronoi cell polygon clipped to the vertical strip cy∈[0,SCALE] (z∈[0,H]).
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
  poly = clipHalfPlane(poly, 0, -1, 0); // cy >= 0
  poly = clipHalfPlane(poly, 0, 1, SCALE); // cy <= SCALE
  return poly.length >= 3 ? poly : [];
}

describe('STRATA-001 S7: closed printable Voronoi solid', () => {
  it.runIf(RUN)('builds a seam-welded ring / closed solid and audits watertightness', () => {
    const morph = envF('PF_SOLID_MORPH', 0);
    const stage = process.env.PF_SOLID_STAGE ?? 'ring';
    const oracleN = Math.round(envF('PF_SOLID_ORACLE', 12));
    const acceptTol = envF('PF_SOLID_ACCEPT_TOL', 0.007);
    const triCap = Math.round(envF('PF_SOLID_TRICAP', 4_000_000));
    const wallT = envF('PF_SOLID_WALLT', 4); // inner wall thickness (mm)
    const floorZ = envF('PF_SOLID_FLOORZ', 10); // cavity floor height (mm)
    const innerDiv = Math.round(envF('PF_SOLID_INNERDIV', 256)); // inner-wall angular divisions
    const innerRings = Math.round(envF('PF_SOLID_INNERRINGS', 48));
    const rA = buildRadiusFn('Voronoi' as StyleId, { vMorph: morph, vRelief: 2.0, vScale: 8, vJitter: 0.8, vZStretch: 1, vPulse: 0 }, DIMS);
    const rInner = (z: number): number => baseRadius(z, H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1) - wallT;

    // ---- outer-wall mesh store in (θ, z), welded on canonical θ ----
    const vth: number[] = [];
    const vz: number[] = [];
    const vx: number[] = [];
    const vy: number[] = [];
    const vzz: number[] = [];
    const canon = (t: number): number => {
      let x = t % TWO_PI;
      if (x < 0) x += TWO_PI;
      return x;
    };
    // SPATIAL-HASH weld: adjacent cells compute a shared clip/bisector vertex with ~0.05um divergence (real, not ulp —
    // the z=0/z=H clip crossing is order-dependent), and the seam (θ=0≡2π) coincides in 3D. Exact-key welding splits
    // both; a merge-radius weld fuses them. WELD_MM well below the mesh min edge (verified) and far above the
    // divergence. Handles the seam for free (coincident 3D points merge).
    const WELD_MM = envF('PF_SOLID_WELD_UM', 0.5) / 1000;
    const gcell = new Map<string, number[]>();
    const gi = (v: number): number => Math.floor(v / WELD_MM);
    const addV = (thetaRaw: number, z: number): number => {
      const theta = canon(thetaRaw);
      const r = rA(theta, z);
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      const cx = gi(x);
      const cy = gi(y);
      const cz = gi(z);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const list = gcell.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (list === undefined) continue;
            for (const j of list) {
              if (Math.hypot(vx[j] - x, vy[j] - y, vzz[j] - z) <= WELD_MM) return j;
            }
          }
        }
      }
      const idx = vth.length;
      vth.push(theta);
      vz.push(z);
      vx.push(x);
      vy.push(y);
      vzz.push(z);
      const key = `${cx},${cy},${cz}`;
      const bucket = gcell.get(key);
      if (bucket === undefined) gcell.set(key, [idx]);
      else bucket.push(idx);
      return idx;
    };
    // Shortest-arc midpoint of two vertices (handles the θ=0 seam).
    const midV = (a: number, b: number): number => {
      let dth = vth[b] - vth[a];
      if (dth > Math.PI) dth -= TWO_PI;
      else if (dth < -Math.PI) dth += TWO_PI;
      return addV(vth[a] + dth / 2, (vz[a] + vz[b]) / 2);
    };

    const ta: number[] = [];
    const tb: number[] = [];
    const tc: number[] = [];
    const alive: boolean[] = [];
    const BIG = 1 << 27;
    const edgeMap = new Map<number, number[]>();
    const eKey = (a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);
    const eAdd = (a: number, b: number, t: number): void => {
      const k = eKey(a, b);
      const l = edgeMap.get(k);
      if (l === undefined) edgeMap.set(k, [t]);
      else l.push(t);
    };
    const eDel = (a: number, b: number, t: number): void => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return;
      const i = l.indexOf(t);
      if (i >= 0) l.splice(i, 1);
    };
    const addT = (a: number, b: number, c: number): number => {
      const t = ta.length;
      ta.push(a);
      tb.push(b);
      tc.push(c);
      alive.push(true);
      eAdd(a, b, t);
      eAdd(b, c, t);
      eAdd(c, a, t);
      return t;
    };
    const killT = (t: number): void => {
      alive[t] = false;
      eDel(ta[t], tb[t], t);
      eDel(tb[t], tc[t], t);
      eDel(tc[t], ta[t], t);
    };

    // ---- initial fan triangulation of every ring cell ----
    // Mesh one extra row above and below, clipped to cy∈[0,SCALE], so the z=0/z=H edges are FLAT (every column reaches
    // the clip line). Without the extra rows, high-jitter cells don't reach z=0 and the bottom loop is jagged (z 0–2mm).
    const cyLo = Math.round(envF('PF_SOLID_CYLO', -1));
    const cyHi = Math.round(envF('PF_SOLID_CYHI', SCALE + 1));
    let cells = 0;
    for (let cx = 0; cx < SCALE; cx += 1) {
      for (let cy = cyLo; cy <= cyHi; cy += 1) {
        const poly = cellPolygon(cx, cy);
        if (poly.length < 3) continue;
        cells += 1;
        let mcx = 0;
        let mcy = 0;
        for (const p of poly) {
          mcx += p[0];
          mcy += p[1];
        }
        mcx /= poly.length;
        mcy /= poly.length;
        const cV = addV(TWO_PI * (mcx / SCALE), (mcy / SCALE) * H);
        const ring = poly.map((p) => addV(TWO_PI * (p[0] / SCALE), (p[1] / SCALE) * H));
        for (let e = 0; e < ring.length; e += 1) addT(cV, ring[e], ring[(e + 1) % ring.length]);
      }
    }

    // ---- geometry + LEPP ----
    const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vzz[a] - vzz[b]);
    const longest = (t: number): number => {
      const l0 = eLen(ta[t], tb[t]);
      const l1 = eLen(tb[t], tc[t]);
      const l2 = eLen(tc[t], ta[t]);
      if (l0 >= l1 && l0 >= l2) return 0;
      if (l1 >= l0 && l1 >= l2) return 1;
      return 2;
    };
    const eVerts = (t: number, e: number): [number, number] => (e === 0 ? [ta[t], tb[t]] : e === 1 ? [tb[t], tc[t]] : [tc[t], ta[t]]);
    const sagOf = (t: number): number => {
      const a = ta[t];
      const b = tb[t];
      const c = tc[t];
      let nx = (vy[b] - vy[a]) * (vzz[c] - vzz[a]) - (vzz[b] - vzz[a]) * (vy[c] - vy[a]);
      let ny = (vzz[b] - vzz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vzz[c] - vzz[a]);
      let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // sample in (θ,z) using shortest-arc from vertex a
      const th0 = vth[a];
      const dthB = ((vth[b] - th0 + Math.PI + TWO_PI) % TWO_PI) - Math.PI;
      const dthC = ((vth[c] - th0 + Math.PI + TWO_PI) % TWO_PI) - Math.PI;
      let s = 0;
      for (let i = 0; i <= oracleN; i += 1) {
        for (let j = 0; j <= oracleN - i; j += 1) {
          const wa = i / oracleN;
          const wb = j / oracleN;
          const wc = 1 - wa - wb;
          const theta = th0 + wb * dthB + wc * dthC;
          const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
          const r = rA(canon(theta), z);
          const qx = r * Math.cos(theta);
          const qy = r * Math.sin(theta);
          const d = Math.abs((qx - vx[a]) * nx + (qy - vy[a]) * ny + (z - vzz[a]) * nz);
          if (d > s) s = d;
        }
      }
      return s;
    };
    const neighbor = (t: number, a: number, b: number): number => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return -1;
      for (const o of l) if (o !== t && alive[o]) return o;
      return -1;
    };
    const created: number[] = [];
    const bisect = (a: number, b: number): void => {
      const m = midV(a, b);
      const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
      for (const t of list) {
        if (!alive[t]) continue;
        const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
        const seq = [ta[t], tb[t], tc[t]];
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
        killT(t);
        created.push(addT(oa, m, apex));
        created.push(addT(m, ob, apex));
      }
    };
    const refineLongest = (t0: number): void => {
      let guard = 8_000_000;
      while (alive[t0] && guard-- > 0) {
        let t = t0;
        let inner = 8_000_000;
        for (;;) {
          if (inner-- <= 0) return;
          const e = longest(t);
          const [a, b] = eVerts(t, e);
          const nb = neighbor(t, a, b);
          if (nb === -1) {
            bisect(a, b);
            break;
          }
          const enb = longest(nb);
          const [na, nbv] = eVerts(nb, enb);
          if ((na === a && nbv === b) || (na === b && nbv === a)) {
            bisect(a, b);
            break;
          }
          t = nb;
        }
        if (!alive[t0]) break;
        const e0 = longest(t0);
        const [a0, b0] = eVerts(t0, e0);
        const nb0 = neighbor(t0, a0, b0);
        if (nb0 === -1) {
          bisect(a0, b0);
          break;
        }
        const enb0 = longest(nb0);
        const [na0, nv0] = eVerts(nb0, enb0);
        if ((na0 === a0 && nv0 === b0) || (na0 === b0 && nv0 === a0)) {
          bisect(a0, b0);
          break;
        }
      }
    };
    const stack: number[] = [];
    for (let t = 0; t < ta.length; t += 1) stack.push(t);
    let capped = false;
    while (stack.length > 0) {
      const t = stack.pop() as number;
      if (!alive[t]) continue;
      if (sagOf(t) <= acceptTol) continue;
      if (ta.length >= triCap) {
        capped = true;
        break;
      }
      created.length = 0;
      refineLongest(t);
      for (const nt of created) if (alive[nt]) stack.push(nt);
      if (alive[t]) stack.push(t);
    }

    // ---- collect outer-wall triangles as 3D soup ----
    const soup: Array<[P3, P3, P3]> = [];
    const P = (i: number): P3 => [vx[i], vy[i], vzz[i]];
    let outerCount = 0;
    for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      soup.push([P(ta[t]), P(tb[t]), P(tc[t])]);
      outerCount += 1;
    }

    // ---- position-welded topology (ONE source of truth; a slicer position-welds too) ----
    // Spatial-hash weld the soup, build edge adjacency, extract boundary loops. Everything downstream (cracks, loops
    // for caps, final closed-audit) reads THIS, not the mesh-index topology (which splits shared clip/seam vertices).
    const wCell = new Map<string, number[]>();
    const wpos: P3[] = [];
    const wgi = (v: number): number => Math.floor(v / WELD_MM);
    const wIndex = (p: P3): number => {
      const cx = wgi(p[0]);
      const cy = wgi(p[1]);
      const cz = wgi(p[2]);
      for (let dx = -1; dx <= 1; dx += 1)
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dz = -1; dz <= 1; dz += 1) {
            const l = wCell.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (l === undefined) continue;
            for (const j of l) if (Math.hypot(wpos[j][0] - p[0], wpos[j][1] - p[1], wpos[j][2] - p[2]) <= WELD_MM) return j;
          }
      const idx = wpos.length;
      wpos.push(p);
      const key = `${cx},${cy},${cz}`;
      const b = wCell.get(key);
      if (b === undefined) wCell.set(key, [idx]);
      else b.push(idx);
      return idx;
    };
    interface Topo {
      nonManifold: number;
      boundary: number;
      loops: number[][];
      interiorCracks: number;
    }
    const analyze = (tris: Array<[P3, P3, P3]>): Topo => {
      const ec = new Map<number, number>();
      const WB = 1 << 24;
      const bump = (a: number, b: number): void => {
        const k = a < b ? a * WB + b : b * WB + a;
        ec.set(k, (ec.get(k) ?? 0) + 1);
      };
      for (const [a, b, c] of tris) {
        const ia = wIndex(a);
        const ib = wIndex(b);
        const ic = wIndex(c);
        bump(ia, ib);
        bump(ib, ic);
        bump(ic, ia);
      }
      let nonManifold = 0;
      let boundary = 0;
      const bAdj = new Map<number, number[]>();
      for (const [k, cnt] of ec.entries()) {
        if (cnt === 2) continue;
        if (cnt > 2) {
          nonManifold += 1;
          continue;
        }
        boundary += 1;
        const a = Math.floor(k / WB);
        const b = k % WB;
        (bAdj.get(a) ?? (bAdj.set(a, []), bAdj.get(a) as number[])).push(b);
        (bAdj.get(b) ?? (bAdj.set(b, []), bAdj.get(b) as number[])).push(a);
      }
      const seen = new Set<number>();
      const loops: number[][] = [];
      for (const s of bAdj.keys()) {
        if (seen.has(s)) continue;
        const loop: number[] = [];
        let cur = s;
        let prev = -1;
        let guard = bAdj.size + 5;
        while (guard-- > 0) {
          loop.push(cur);
          seen.add(cur);
          let next = -1;
          for (const n of bAdj.get(cur) ?? []) if (n !== prev && (!seen.has(n) || n === s)) { next = n; break; }
          if (next === -1 || next === s) break;
          prev = cur;
          cur = next;
        }
        if (loop.length > 2) loops.push(loop);
      }
      let interiorCracks = 0;
      for (const loop of loops) {
        const mz = loop.reduce((sm, i) => sm + wpos[i][2], 0) / loop.length;
        if (mz > 1e-3 && mz < H - 1e-3) interiorCracks += loop.length;
      }
      return { nonManifold, boundary, loops, interiorCracks };
    };
    const outerTopo = analyze(soup);
    const loopZ = (loop: number[]): number => loop.reduce((s, i) => s + wpos[i][2], 0) / loop.length;
    const sortedLoops = outerTopo.loops.slice().sort((p, q) => loopZ(p) - loopZ(q));
    const botLoop = (sortedLoops[0] ?? []).map((i) => wpos[i]);
    const topLoop = (sortedLoops[sortedLoops.length - 1] ?? []).map((i) => wpos[i]);
    const seamCrackEdges = outerTopo.interiorCracks;

    // ---- Stage B caps: base disk, floor disk, inner wall, rim ----
    let capTris = 0;
    const ang = (p: P3): number => {
      const a = Math.atan2(p[1], p[0]);
      return a < 0 ? a + TWO_PI : a;
    };
    if (stage === 'solid') {
      const byAngle = (loop: P3[]): P3[] => loop.slice().sort((i, j) => ang(i) - ang(j));
      const bot = byAngle(botLoop);
      const top = byAngle(topLoop);
      // base disk (z=0): fan bottom loop to center.
      const cBot: P3 = [0, 0, 0];
      for (let i = 0; i < bot.length; i += 1) {
        soup.push([cBot, bot[(i + 1) % bot.length], bot[i]]);
        capTris += 1;
      }
      // inner rings (uniform innerDiv), θ from 0..2π.
      const innerLoopAtZ = (z: number): P3[] => {
        const r = rInner(z);
        const pts: P3[] = [];
        for (let d = 0; d < innerDiv; d += 1) {
          const th = (TWO_PI * d) / innerDiv;
          pts.push([r * Math.cos(th), r * Math.sin(th), z]);
        }
        return pts;
      };
      // rim (z=H planar annulus): stitch outer top loop (variable) to the uniform inner ring by angle merge.
      {
        const outer = top.map((p) => ({ th: ang(p), p }));
        const inner = innerLoopAtZ(H).map((p, d) => ({ th: (TWO_PI * d) / innerDiv, p }));
        const no = outer.length;
        const ni = inner.length;
        let io = 0;
        let ii = 0;
        while (io < no || ii < ni) {
          const oth = outer[io % no].th + (io >= no ? TWO_PI : 0);
          const ith = inner[ii % ni].th + (ii >= ni ? TWO_PI : 0);
          if (io < no && (ii >= ni || oth <= ith)) {
            soup.push([outer[io % no].p, outer[(io + 1) % no].p, inner[ii % ni].p]);
            io += 1;
          } else {
            soup.push([outer[io % no].p, inner[(ii + 1) % ni].p, inner[ii % ni].p]);
            ii += 1;
          }
          capTris += 1;
        }
      }
      // inner wall: uniform grid innerDiv × innerRings, z from H down to floorZ.
      const zrings: number[] = [];
      for (let k = 0; k <= innerRings; k += 1) zrings.push(H - ((H - floorZ) * k) / innerRings);
      for (let k = 0; k < innerRings; k += 1) {
        const z0 = zrings[k];
        const z1 = zrings[k + 1];
        const r0 = rInner(z0);
        const r1 = rInner(z1);
        for (let d = 0; d < innerDiv; d += 1) {
          const th0 = (TWO_PI * d) / innerDiv;
          const th1 = (TWO_PI * ((d + 1) % innerDiv)) / innerDiv;
          const A: P3 = [r0 * Math.cos(th0), r0 * Math.sin(th0), z0];
          const B: P3 = [r0 * Math.cos(th1), r0 * Math.sin(th1), z0];
          const C: P3 = [r1 * Math.cos(th1), r1 * Math.sin(th1), z1];
          const D: P3 = [r1 * Math.cos(th0), r1 * Math.sin(th0), z1];
          // inward-facing (cavity): wind so normals point toward the axis
          soup.push([A, C, B]);
          soup.push([A, D, C]);
          capTris += 2;
        }
      }
      // floor disk (z=floorZ): fan inner bottom ring to center (cavity floor).
      const cFloor: P3 = [0, 0, floorZ];
      const floorRing = innerLoopAtZ(floorZ);
      for (let d = 0; d < innerDiv; d += 1) {
        const a = floorRing[d];
        const b = floorRing[(d + 1) % innerDiv];
        soup.push([cFloor, a, b]); // cavity floor fan (a,b are P3)
        capTris += 1;
      }
    }

    // ---- final watertight audit (same position-weld topology as the loops) ----
    const finalTopo = stage === 'solid' ? analyze(soup) : outerTopo;
    const nonManifold = finalTopo.nonManifold;
    const boundary = finalTopo.boundary;

    // ---- outer-wall fidelity ----
    let maxSag = 0;
    let minEdge = Infinity;
    const sags: number[] = [];
    for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const s = sagOf(t);
      sags.push(s);
      if (s > maxSag) maxSag = s;
      const e0 = eLen(ta[t], tb[t]);
      const e1 = eLen(tb[t], tc[t]);
      const e2 = eLen(tc[t], ta[t]);
      minEdge = Math.min(minEdge, e0, e1, e2);
    }
    sags.sort((a, b) => a - b);
    const over = sags.filter((s) => s > TOL).length;
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const q = (p: number): number => sags[Math.min(sags.length - 1, Math.floor(p * sags.length))];

    // ---- emit STL ----
    const outDir = join('research', 'exchange', '_strataVoronoiSolid');
    mkdirSync(outDir, { recursive: true });
    const stlName = `voronoi_${morph === 0 ? 'bubble' : 'web'}_${stage}.stl`;
    const buf = Buffer.alloc(84 + soup.length * 50);
    buf.write(`STRATA-001 Voronoi ${stage} (watertight)`, 0, 'ascii');
    buf.writeUInt32LE(soup.length, 80);
    let o = 84;
    for (const [a, b, c] of soup) {
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz) || 1;
      buf.writeFloatLE(nx / nl, o);
      buf.writeFloatLE(ny / nl, o + 4);
      buf.writeFloatLE(nz / nl, o + 8);
      for (const [k, p] of [a, b, c].entries()) {
        buf.writeFloatLE(p[0], o + 12 + k * 12);
        buf.writeFloatLE(p[1], o + 16 + k * 12);
        buf.writeFloatLE(p[2], o + 20 + k * 12);
      }
      buf.writeUInt16LE(0, o + 48);
      o += 50;
    }
    writeFileSync(join(outDir, stlName), buf);

    const report = [
      '',
      `========== STRATA-001 S7: CLOSED VORONOI ${stage.toUpperCase()} ==========`,
      `file: ${stlName}  (${soup.length} triangles: ${outerCount} outer wall + ${capTris} caps)`,
      `Voronoi ${morph === 0 ? 'BUBBLE' : 'WEB'} vMorph ${morph}, vRelief 2.0, H120/Rb40/Rt50 — registry defaults`,
      `ring: ${cells} cells (cx 0..7 × cy ${cyLo}..${cyHi})${capped ? ' CAPPED' : ''}`,
      '',
      '--- WATERTIGHT AUDIT (3D position-weld) ---',
      `  non-manifold edges (>2)  : ${nonManifold}   ${nonManifold === 0 ? '✅' : '❌'}`,
      `  boundary edges           : ${boundary}   ${stage === 'solid' ? (boundary === 0 ? '✅ CLOSED SOLID' : '❌ open') : `(ring: top+bottom loops)`}`,
      `  seam-crack edges (ring)  : ${seamCrackEdges}   ${seamCrackEdges === 0 ? '✅ seam welded' : '❌ interior boundary'}`,
      `  boundary loops: ${finalTopo.loops.length}  (outer bottom n=${botLoop.length}, top n=${topLoop.length})`,
      '',
      '--- OUTER-WALL FIDELITY (oracle ' + oracleN + ') ---',
      `  MAX sag ${um(maxSag)} um  ${maxSag <= TOL ? '✅' : '❌'}   p99 ${um(q(0.99))}  p50 ${um(q(0.5))}  over-0.01mm ${over}/${sags.length}`,
      `  min edge ${um(minEdge)} um  (weld radius ${um(WELD_MM)} um — must be << min edge)  ${minEdge > 4 * WELD_MM ? '✅' : '⚠️'}`,
      '=========================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    writeFileSync(join(outDir, `${stlName}.report.txt`), report);

    expect(seamCrackEdges).toBe(0);
    expect(nonManifold).toBe(0);
    if (stage === 'solid') expect(boundary).toBe(0);
    expect(maxSag).toBeLessThanOrEqual(TOL);
  }, 6_000_000);
});
