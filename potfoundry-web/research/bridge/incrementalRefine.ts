// incrementalRefine.ts — INCREMENTAL edge-bisection refinement of a live half-edge mesh.
//
// The batch kernel rebuilt the whole Delaunay (delaunator) AND re-flipped the whole mesh EVERY round — at 16M
// those two costs dominated (flip ~115s + rebuild ~33s of a 214s build). This refines the mesh IN PLACE:
// split each over-size edge at its midpoint (2 triangles → 4) and restore the true-3D Delaunay with LOCAL
// Lawson flips around the new vertex only. No rebuild, no global re-flip. Half-edge relink follows Delaunator's
// conventions (triangles[e] = start vertex; nextHE/prevHE within a triangle; halfedges[e] = twin or -1).
//
// Only INTERIOR edges are split (hull/boundary edges stay — the (u,t) patch boundary is artificial). The
// initial connectivity comes from one delaunator call on the seed; everything after is incremental.
import Delaunator from 'delaunator';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
export const nextHE = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);
export const prevHE = (e: number): number => (e % 3 === 0 ? e + 2 : e - 1);

export interface LiveMesh {
  pu: Float64Array; pt: Float64Array;             // point params (capacity-sized)
  px: Float64Array; py: Float64Array; pz: Float64Array; // 3D positions (capacity-sized)
  tri: Int32Array; he: Int32Array;                // half-edge arrays (capacity-sized, 3 per triangle)
  nv: number; nt: number;                         // current vertex / triangle counts
}

/** Max interior-angle cosine of triangle (a,b,c) from a LiveMesh's positions — proxy for its MIN angle. */
function maxCos(mesh: LiveMesh, a: number, b: number, c: number): number {
  const { px, py, pz } = mesh;
  const la2 = (px[b] - px[c]) ** 2 + (py[b] - py[c]) ** 2 + (pz[b] - pz[c]) ** 2;
  const lb2 = (px[c] - px[a]) ** 2 + (py[c] - py[a]) ** 2 + (pz[c] - pz[a]) ** 2;
  const lc2 = (px[a] - px[b]) ** 2 + (py[a] - py[b]) ** 2 + (pz[a] - pz[b]) ** 2;
  if (la2 < 1e-24 || lb2 < 1e-24 || lc2 < 1e-24) return 1;
  const cA = (lb2 + lc2 - la2) / (2 * Math.sqrt(lb2 * lc2));
  const cB = (la2 + lc2 - lb2) / (2 * Math.sqrt(la2 * lc2));
  const cC = (la2 + lb2 - lc2) / (2 * Math.sqrt(la2 * lb2));
  return Math.max(cA, cB, cC);
}

const link = (he: Int32Array, a: number, b: number): void => { he[a] = b; if (b !== -1) he[b] = a; };

/** Delaunator in-circle: < 0 iff p is inside the circumcircle of CCW triangle (a,b,c). */
function inCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): number {
  const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
  const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx);
}

/** Build a capacity-sized LiveMesh from seed (u,t) points via one delaunator call. */
export function buildLiveMesh(seedU: number[], seedT: number[], scaleU: number, rA: AnalyticRadiusFn, H: number, capVerts: number): LiveMesh {
  const n0 = seedU.length;
  const coords = new Float64Array(n0 * 2);
  for (let i = 0; i < n0; i++) { coords[2 * i] = seedU[i] * scaleU; coords[2 * i + 1] = seedT[i]; }
  const d = new Delaunator(coords);
  const nt0 = d.triangles.length / 3;
  const capTris = Math.max(2 * capVerts + 16, nt0 + 16);
  const mesh: LiveMesh = {
    pu: new Float64Array(capVerts), pt: new Float64Array(capVerts),
    px: new Float64Array(capVerts), py: new Float64Array(capVerts), pz: new Float64Array(capVerts),
    tri: new Int32Array(capTris * 3), he: new Int32Array(capTris * 3),
    nv: n0, nt: nt0,
  };
  for (let i = 0; i < n0; i++) {
    mesh.pu[i] = seedU[i]; mesh.pt[i] = seedT[i];
    const th = TAU * seedU[i], z = seedT[i] * H, r = rA(th, z);
    mesh.px[i] = r * Math.cos(th); mesh.py[i] = r * Math.sin(th); mesh.pz[i] = z;
  }
  mesh.tri.set(d.triangles.subarray(0, nt0 * 3));
  mesh.he.set(d.halfedges.subarray(0, nt0 * 3));
  return mesh;
}

/** Append a new vertex at (u,t); returns its index. */
function addVertex(mesh: LiveMesh, u: number, t: number, rA: AnalyticRadiusFn, H: number): number {
  const i = mesh.nv++;
  mesh.pu[i] = u; mesh.pt[i] = t;
  const th = TAU * u, z = t * H, r = rA(th, z);
  mesh.px[i] = r * Math.cos(th); mesh.py[i] = r * Math.sin(th); mesh.pz[i] = z;
  return i;
}

/**
 * Split interior edge `e` (twin must exist) at its midpoint M: the two incident triangles (apexes C, D) become
 * four — (A,M,C),(M,B,C),(B,M,D),(M,A,D) — reusing the two slots + appending two. Returns the 4 OUTER halfedges
 * (now opposite M) to seed the local flip stack, or null if `e` is a hull edge / capacity is exhausted.
 */
export function splitEdge(mesh: LiveMesh, e: number, rA: AnalyticRadiusFn, H: number): [number, number, number, number] | null {
  const he = mesh.he, tri = mesh.tri;
  const o = he[e];
  if (o === -1) return null;                 // hull edge: don't split
  if (mesh.nt + 2 > mesh.tri.length / 3 || mesh.nv + 1 > mesh.pu.length) return null; // capacity
  const en = nextHE(e), ep = prevHE(e), on = nextHE(o), op = prevHE(o);
  const A = tri[e], B = tri[en], C = tri[ep], D = tri[op];
  // preserved external twins of the four outer edges
  const tBC = he[en], tCA = he[ep], tAD = he[on], tDB = he[op];
  const M = addVertex(mesh, (mesh.pu[A] + mesh.pu[B]) / 2, (mesh.pt[A] + mesh.pt[B]) / 2, rA, H);
  // four triangle slots: reuse e's triangle (t0) and o's triangle (t1), append t2,t3
  const t0 = (e / 3) | 0, t1 = (o / 3) | 0, t2 = mesh.nt++, t3 = mesh.nt++;
  const set = (t: number, a: number, b: number, c: number): number => { const h = t * 3; tri[h] = a; tri[h + 1] = b; tri[h + 2] = c; return h; };
  const hAMC = set(t0, A, M, C);   // (A,M,C): A→M, M→C, C→A
  const hMBC = set(t1, M, B, C);   // (M,B,C): M→B, B→C, C→M
  const hBMD = set(t2, B, M, D);   // (B,M,D): B→M, M→D, D→B
  const hMAD = set(t3, M, A, D);   // (M,A,D): M→A, A→D, D→M
  // internal spokes (twin pairs)
  link(he, hAMC + 0, hMAD + 0);    // A→M  <-> M→A
  link(he, hAMC + 1, hMBC + 2);    // M→C  <-> C→M
  link(he, hMBC + 0, hBMD + 0);    // M→B  <-> B→M
  link(he, hBMD + 1, hMAD + 2);    // M→D  <-> D→M
  // outer edges → preserved external twins
  link(he, hAMC + 2, tCA);         // C→A
  link(he, hMBC + 1, tBC);         // B→C
  link(he, hBMD + 2, tDB);         // D→B
  link(he, hMAD + 1, tAD);         // A→D
  return [hAMC + 2, hMBC + 1, hBMD + 2, hMAD + 1]; // the four outer halfedges (opposite M)
}

/**
 * Local Lawson flips restoring the true-3D max-min-angle Delaunay around recent edits. `stack` holds outer
 * halfedges (each opposite the just-inserted vertex). A flip relinks per Delaunator `_legalize`; after a flip
 * the two new outer edges are pushed. `cap` bounds propagation (the final global pass cleans any residual).
 */
export function flipLocal(mesh: LiveMesh, stack: number[], cap: number, scaleU = 0): void {
  const he = mesh.he, tri = mesh.tri, pu = mesh.pu, pt = mesh.pt;
  let work = 0;
  while (stack.length > 0 && work < cap) {
    const a = stack.pop() as number;
    const b = he[a];
    if (b === -1) continue;
    work++;
    const a0 = a - (a % 3), b0 = b - (b % 3);
    const al = a0 + (a + 1) % 3, ar = a0 + (a + 2) % 3, bl = b0 + (b + 2) % 3;
    const pr = tri[a], pl = tri[al], p0 = tri[ar], p1 = tri[bl];
    // convex-quad validity: pr,pl straddle the candidate diagonal p0-p1 in (u,t)
    const dx = pu[p1] - pu[p0], dy = pt[p1] - pt[p0];
    const sPr = dx * (pt[pr] - pt[p0]) - dy * (pu[pr] - pu[p0]);
    const sPl = dx * (pt[pl] - pt[p0]) - dy * (pu[pl] - pu[p0]);
    if (sPr * sPl >= 0) continue;
    let doFlip: boolean;
    if (scaleU > 0) {
      // Euclidean in-circle on scaled (u·s, t) coords — provably local-flip-complete (maintains the Delaunay
      // triangulation exactly during incremental insertion; the 3D-angle criterion is NOT and drifts).
      doFlip = inCircle(pu[p0] * scaleU, pt[p0], pu[pr] * scaleU, pt[pr], pu[pl] * scaleU, pt[pl], pu[p1] * scaleU, pt[p1]) < 0;
    } else {
      const curWorst = Math.max(maxCos(mesh, pr, pl, p0), maxCos(mesh, pr, pl, p1));
      const flpWorst = Math.max(maxCos(mesh, p0, p1, pl), maxCos(mesh, p0, p1, pr));
      doFlip = flpWorst < curWorst - 1e-9;
    }
    if (!doFlip) continue;
    tri[a] = p1; tri[b] = p0;
    const hbl = he[bl], har = he[ar];
    link(he, a, hbl);
    link(he, b, har);
    link(he, ar, bl);
    // Delaunator _legalize propagation: re-examine `a` (now relinked) + `br` — the two edges now opposite the
    // pivot vertex. (NOT ar/bl: ar is the new diagonal.)
    stack.push(a, b0 + (b + 1) % 3);
  }
}

/** One global flip pass over the LiveMesh (push every interior lower-halfedge, propagate). Returns #flips seen. */
function flipGlobal(mesh: LiveMesh): void {
  const stack: number[] = [];
  for (let e = 0; e < mesh.nt * 3; e++) { const tw = mesh.he[e]; if (tw !== -1 && tw > e) stack.push(e); }
  flipLocal(mesh, stack, stack.length * 6 + 64);
}

export interface IncMeshOpts {
  tolMm: number; hMin: number; hMax: number;
  sizeRes?: number; gradeBeta?: number; seedN?: number; maxPoints?: number; splitThresh?: number; optimizeSweeps?: number;
  profile?: boolean;
}

/**
 * ⚠️ WIP (over-refines — do NOT use as the kernel yet). Incremental build: ONE delaunator on the seed, then
 * refine in place (edge-split + local in-circle Delaunay flips — no per-round rebuild). The PRIMITIVES are
 * correct (incrementalRefine.test.ts: integrity + empty-circumcircle pass), but as a drop-in this OVER-REFINES
 * (~4× the batch's triangle count, hits maxPoints): pure-Delaunay edge-split tolerates long edges that the batch
 * removes via its per-round max-min-angle reset, which insertion can't cheaply replicate (in-circle and
 * 3D-angle flips fight without a global rebuild). Fix path = connectivity-free metric point sampling → ONE
 * delaunator → global 3D-flip + smooth. See 2026-06-29-incremental-delaunay-findings.md. Kept for the reusable,
 * verified live-mesh primitives (buildLiveMesh/splitEdge/flipLocal).
 */
export function buildInhouseMetricMeshIncremental(rA: AnalyticRadiusFn, H: number, opts: IncMeshOpts): { ut: number[]; indices: Uint32Array; points: number; hitBudget: boolean } {
  const sizeRes = opts.sizeRes ?? 160;
  const seedN = opts.seedN ?? 12;
  const maxPoints = opts.maxPoints ?? 5_000_000;
  const splitThresh2 = (opts.splitThresh ?? 1.5) ** 2;
  const sweeps = opts.optimizeSweeps ?? 3;
  const prof = opts.profile === true;
  const now = (): number => Date.now();

  const mf = buildSurfaceMetricField(rA, H, { resU: sizeRes, resT: sizeRes, tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax, gradeBeta: opts.gradeBeta ?? 0.2 });
  const RU = mf.resU, RT = mf.resT, M = mf.m;
  const metricLen2 = (u0: number, t0: number, u1: number, t1: number): number => {
    const u = (u0 + u1) / 2, t = (t0 + t1) / 2;
    const fu = Math.min(Math.max(u, 0), 1) * (RU - 1), ft = Math.min(Math.max(t, 0), 1) * (RT - 1);
    const iu = Math.min(Math.floor(fu), RU - 2), it = Math.min(Math.floor(ft), RT - 2);
    const au = fu - iu, bt = ft - it;
    const c00 = (it * RU + iu) * 3, c10 = c00 + 3, c01 = ((it + 1) * RU + iu) * 3, c11 = c01 + 3;
    const w00 = (1 - au) * (1 - bt), w10 = au * (1 - bt), w01 = (1 - au) * bt, w11 = au * bt;
    const m00 = M[c00] * w00 + M[c10] * w10 + M[c01] * w01 + M[c11] * w11;
    const m01 = M[c00 + 1] * w00 + M[c10 + 1] * w10 + M[c01 + 1] * w01 + M[c11 + 1] * w11;
    const m11 = M[c00 + 2] * w00 + M[c10 + 2] * w10 + M[c01 + 2] * w01 + M[c11 + 2] * w11;
    const du = u1 - u0, dt = t1 - t0;
    return m00 * du * du + 2 * m01 * du * dt + m11 * dt * dt;
  };

  const ratios: number[] = [];
  for (let i = 0; i < RU * RT; i++) { const a = M[i * 3], c = M[i * 3 + 2]; if (a > 0 && c > 0) ratios.push(Math.sqrt(a / c)); }
  ratios.sort((x, y) => x - y);
  const s = ratios[Math.floor(ratios.length / 2)] || 1;

  const seedNt = Math.max(2, seedN), seedNu = Math.max(2, Math.round(seedN * s));
  const seedU: number[] = [], seedT: number[] = [];
  for (let i = 0; i <= seedNu; i++) for (let j = 0; j <= seedNt; j++) { seedU.push(i / seedNu); seedT.push(j / seedNt); }

  let z = now();
  const mesh = buildLiveMesh(seedU, seedT, s, rA, H, maxPoints + seedU.length + 16);
  const tBuild = now() - z;

  z = now();
  // snapshot passes: split every over-size interior edge midpoint in place + local flips; repeat until none.
  let hitBudget = false;
  for (let pass = 0; pass < 200; pass++) {
    const ntStart = mesh.nt;
    let splits = 0;
    for (let t = 0; t < ntStart && !hitBudget; t++) {
      for (let r = 0; r < 3; r++) {
        const e = 3 * t + r, tw = mesh.he[e];
        if (tw === -1 || tw < e) continue;                 // interior, lower halfedge
        const A = mesh.tri[e], B = mesh.tri[nextHE(e)];
        if (metricLen2(mesh.pu[A], mesh.pt[A], mesh.pu[B], mesh.pt[B]) <= splitThresh2) continue;
        const outer = splitEdge(mesh, e, rA, H);
        if (outer === null) { if (mesh.nv >= maxPoints) hitBudget = true; continue; }
        flipLocal(mesh, [outer[0], outer[1], outer[2], outer[3]], 64, s); // in-circle (maintains Delaunay)
        splits++;
        if (mesh.nv >= maxPoints) { hitBudget = true; break; }
      }
    }
    if (splits === 0 || hitBudget) break;
  }
  const tRefine = now() - z;

  // optimization: [on-surface smooth + global flip] sweeps (a few — connectivity is already near-optimal)
  z = now();
  for (let k = 0; k < sweeps; k++) {
    const nv = mesh.nv;
    const ut: number[] = new Array(nv * 2);
    const idx = new Uint32Array(mesh.nt * 3);
    for (let i = 0; i < nv; i++) { ut[2 * i] = mesh.pu[i]; ut[2 * i + 1] = mesh.pt[i]; }
    idx.set(mesh.tri.subarray(0, mesh.nt * 3));
    const sm = smoothSurfaceOnRadial(ut, idx, rA, H, { iterations: 3, relax: 0.5 });
    for (let i = 0; i < nv; i++) {
      mesh.pu[i] = sm[2 * i]; mesh.pt[i] = sm[2 * i + 1];
      const th = TAU * sm[2 * i], zz = sm[2 * i + 1] * H, rr = rA(th, zz);
      mesh.px[i] = rr * Math.cos(th); mesh.py[i] = rr * Math.sin(th); mesh.pz[i] = zz;
    }
    flipGlobal(mesh);
  }
  const tOpt = now() - z;

  if (prof) { /* eslint-disable-next-line no-console */ console.log(`  [inc-profile] build=${(tBuild / 1000).toFixed(1)}s refine=${(tRefine / 1000).toFixed(1)}s opt=${(tOpt / 1000).toFixed(1)}s`); }

  const ut: number[] = new Array(mesh.nv * 2);
  for (let i = 0; i < mesh.nv; i++) { ut[2 * i] = mesh.pu[i]; ut[2 * i + 1] = mesh.pt[i]; }
  return { ut, indices: Uint32Array.from(mesh.tri.subarray(0, mesh.nt * 3)), points: mesh.nv, hitBudget };
}
