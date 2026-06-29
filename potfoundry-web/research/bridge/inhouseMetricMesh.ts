// inhouseMetricMesh.ts — performant IN-HOUSE metric-Delaunay mesher (no gmsh). The kernel rebuild core.
//
// Upgrades over the src/fidelity/spike (global anisotropy scale + per-triangle oracle chord sampling):
//   1. PER-NODE metric: density is driven by the precomputed surface metric field M=g/h₃D(u,t)²
//      (buildSurfaceMetricField). A triangle is "too big" when its longest edge exceeds the local metric
//      target — refine by METRIC edge length, not a global 3D length. Cheap (bilinear field lookups, no
//      per-triangle oracle chord sampling), so it scales past gmsh BAMG's ~1.8M cap.
//   2. FAST flips: a true-3D max-min-angle Lawson flip using a per-round precomputed xyz array + numeric edge
//      keys (no per-vertex oracle calls, no string keys) → flips stay cheap at millions of triangles.
//   3. Optimization: iterated [on-surface smooth + flip] (the pass the spike lacked).
//
// Connectivity: initial Euclidean Delaunay (shipped delaunator) in coords scaled by the global median
// anisotropy s=median(√(M00/M11)); the true-3D flips then correct the local diagonals the global scale misses.
import Delaunator from 'delaunator';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const RAD2DEG = 180 / Math.PI;

export interface InhouseMeshOpts {
  tolMm: number; hMin: number; hMax: number;
  sizeRes?: number; gradeBeta?: number; seedN?: number;
  maxPoints?: number; maxRounds?: number; splitThresh?: number; optimizeSweeps?: number; dedupeEps?: number;
}
export interface InhouseMesh { ut: number[]; indices: Uint32Array; points: number; rounds: number; hitBudget: boolean; }

/** Min interior 3D angle (deg) of triangle (a,b,c) given flat xyz arrays; 0 if degenerate. */
function minAngleXYZ(xyz: Float64Array, a: number, b: number, c: number): number {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  const lab = Math.hypot(ax - bx, ay - by, az - bz);
  const lbc = Math.hypot(bx - cx, by - cy, bz - cz);
  const lca = Math.hypot(cx - ax, cy - ay, cz - az);
  if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0;
  const ac = (j: number, k: number, opp: number): number => Math.acos(Math.max(-1, Math.min(1, (j * j + k * k - opp * opp) / (2 * j * k))));
  return Math.min(ac(lca, lab, lbc), ac(lab, lbc, lca), ac(lbc, lca, lab)) * RAD2DEG;
}

/** True-3D max-min-angle Lawson flips using a precomputed xyz array + numeric edge keys (fast at scale). */
function flipMaxMinAngle(uv: number[], triIn: Uint32Array, xyz: Float64Array, maxPasses: number): Uint32Array {
  const T = Uint32Array.from(triIn);
  const MULT = 134217728; // 2^27 > max vertex count here; numeric edge key
  for (let pass = 0; pass < maxPasses; pass++) {
    const edges = new Map<number, number>(); // key → (tri<<2 | localOppSlot) packed as tri*4+slot, first occurrence
    const second = new Map<number, number>();
    const nt = T.length / 3;
    const addEdge = (a: number, b: number, tri: number, oppSlot: number): void => {
      const k = a < b ? a * MULT + b : b * MULT + a;
      if (!edges.has(k)) edges.set(k, tri * 4 + oppSlot); else if (!second.has(k)) second.set(k, tri * 4 + oppSlot);
    };
    for (let t = 0; t < nt; t++) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; addEdge(a, b, t, 2); addEdge(b, c, t, 0); addEdge(c, a, t, 1); }
    let flips = 0; const touched = new Uint8Array(nt);
    for (const [k, e0] of edges) {
      const e1 = second.get(k); if (e1 === undefined) continue;
      const t0 = e0 >> 2, t1 = e1 >> 2;
      if (touched[t0] || touched[t1]) continue;
      const r = T[3 * t0 + (e0 & 3)], s = T[3 * t1 + (e1 & 3)];
      const a = Math.floor(k / MULT), b = k % MULT;
      // r,s must straddle edge a-b in (u,t) for a valid flip
      const ru = uv[r * 2], rt = uv[r * 2 + 1], su = uv[s * 2], st = uv[s * 2 + 1];
      const sideA = (su - ru) * (uv[a * 2 + 1] - rt) - (st - rt) * (uv[a * 2] - ru);
      const sideB = (su - ru) * (uv[b * 2 + 1] - rt) - (st - rt) * (uv[b * 2] - ru);
      if (sideA * sideB >= 0) continue;
      const curMin = Math.min(minAngleXYZ(xyz, a, b, r), minAngleXYZ(xyz, a, b, s));
      const flpMin = Math.min(minAngleXYZ(xyz, a, r, s), minAngleXYZ(xyz, b, r, s));
      if (flpMin > curMin + 1e-6) {
        T[3 * t0] = a; T[3 * t0 + 1] = r; T[3 * t0 + 2] = s;
        T[3 * t1] = b; T[3 * t1 + 1] = r; T[3 * t1 + 2] = s;
        touched[t0] = 1; touched[t1] = 1; flips++;
      }
    }
    if (flips === 0) break;
  }
  return T;
}

export function buildInhouseMetricMesh(rA: AnalyticRadiusFn, H: number, opts: InhouseMeshOpts): InhouseMesh {
  const sizeRes = opts.sizeRes ?? 160;
  const seedN = opts.seedN ?? 12;
  const maxPoints = opts.maxPoints ?? 5_000_000;
  const maxRounds = opts.maxRounds ?? 60;
  const splitThresh2 = (opts.splitThresh ?? 1.5) ** 2; // split if longest metric-edge² exceeds this
  const sweeps = opts.optimizeSweeps ?? 6;
  const dedupeEps = opts.dedupeEps ?? 1e-6;

  const mf = buildSurfaceMetricField(rA, H, { resU: sizeRes, resT: sizeRes, tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax, gradeBeta: opts.gradeBeta ?? 0.2 });
  const RU = mf.resU, RT = mf.resT, M = mf.m;
  const metricAt = (u: number, t: number): [number, number, number] => {
    const fu = Math.min(Math.max(u, 0), 1) * (RU - 1), ft = Math.min(Math.max(t, 0), 1) * (RT - 1);
    const iu = Math.min(Math.floor(fu), RU - 2), it = Math.min(Math.floor(ft), RT - 2);
    const au = fu - iu, bt = ft - it;
    const c00 = (it * RU + iu) * 3, c10 = c00 + 3, c01 = ((it + 1) * RU + iu) * 3, c11 = c01 + 3;
    const w00 = (1 - au) * (1 - bt), w10 = au * (1 - bt), w01 = (1 - au) * bt, w11 = au * bt;
    return [
      M[c00] * w00 + M[c10] * w10 + M[c01] * w01 + M[c11] * w11,
      M[c00 + 1] * w00 + M[c10 + 1] * w10 + M[c01 + 1] * w01 + M[c11 + 1] * w11,
      M[c00 + 2] * w00 + M[c10 + 2] * w10 + M[c01 + 2] * w01 + M[c11 + 2] * w11,
    ];
  };
  const metricLen2 = (u0: number, t0: number, u1: number, t1: number): number => {
    const [m00, m01, m11] = metricAt((u0 + u1) / 2, (t0 + t1) / 2);
    const du = u1 - u0, dt = t1 - t0;
    return m00 * du * du + 2 * m01 * du * dt + m11 * dt * dt;
  };

  // global anisotropy scale for the initial Euclidean Delaunay (flips fix the local residual)
  const ratios: number[] = [];
  for (let i = 0; i < RU * RT; i++) { const a = M[i * 3], c = M[i * 3 + 2]; if (a > 0 && c > 0) ratios.push(Math.sqrt(a / c)); }
  ratios.sort((x, y) => x - y);
  const s = ratios[Math.floor(ratios.length / 2)] || 1;

  const uv: number[] = [];
  const seen = new Set<number>();
  const keyOf = (u: number, t: number): number => Math.round(u / dedupeEps) * 1_500_000 + Math.round(t / dedupeEps);
  const addPoint = (u: number, t: number): boolean => { const k = keyOf(u, t); if (seen.has(k)) return false; seen.add(k); uv.push(u, t); return true; };

  const seedNt = Math.max(2, seedN), seedNu = Math.max(2, Math.round(seedN * s));
  for (let i = 0; i <= seedNu; i++) for (let j = 0; j <= seedNt; j++) addPoint(i / seedNu, j / seedNt);

  const scaledCoords = (): Float64Array => { const c = new Float64Array(uv.length); for (let k = 0; k < uv.length; k += 2) { c[k] = uv[k] * s; c[k + 1] = uv[k + 1]; } return c; };
  const computeXYZ = (): Float64Array => {
    const n = uv.length / 2, p = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const u = uv[2 * i], t = uv[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); p[3 * i] = r * Math.cos(th); p[3 * i + 1] = r * Math.sin(th); p[3 * i + 2] = z; }
    return p;
  };

  let tris = new Uint32Array(0); let rounds = 0; let hitBudget = false;
  for (; rounds < maxRounds; rounds++) {
    tris = new Delaunator(scaledCoords()).triangles;
    tris = flipMaxMinAngle(uv, tris, computeXYZ(), 4);
    let added = 0;
    for (let ti = 0; ti < tris.length; ti += 3) {
      const a = tris[ti] * 2, b = tris[ti + 1] * 2, c = tris[ti + 2] * 2;
      const eAB = metricLen2(uv[a], uv[a + 1], uv[b], uv[b + 1]);
      const eBC = metricLen2(uv[b], uv[b + 1], uv[c], uv[c + 1]);
      const eCA = metricLen2(uv[c], uv[c + 1], uv[a], uv[a + 1]);
      const mx = Math.max(eAB, eBC, eCA);
      if (mx <= splitThresh2) continue;
      let mu: number, mt: number;
      if (eAB >= eBC && eAB >= eCA) { mu = (uv[a] + uv[b]) / 2; mt = (uv[a + 1] + uv[b + 1]) / 2; }
      else if (eBC >= eCA) { mu = (uv[b] + uv[c]) / 2; mt = (uv[b + 1] + uv[c + 1]) / 2; }
      else { mu = (uv[c] + uv[a]) / 2; mt = (uv[c + 1] + uv[a + 1]) / 2; }
      if (addPoint(mu, mt)) added++;
      if (uv.length / 2 > maxPoints) { hitBudget = true; break; }
    }
    if (hitBudget || added === 0) { rounds++; break; }
  }

  // final connectivity + optimization sweeps (relocate on the surface, then re-flip to the true-3D Delaunay)
  tris = new Delaunator(scaledCoords()).triangles;
  tris = flipMaxMinAngle(uv, tris, computeXYZ(), 8);
  let cur = uv.slice();
  for (let k = 0; k < sweeps; k++) {
    cur = smoothSurfaceOnRadial(cur, tris, rA, H, { iterations: 3, relax: 0.5 });
    // recompute xyz for the relocated points, then flip
    const n = cur.length / 2, p = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const u = cur[2 * i], t = cur[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); p[3 * i] = r * Math.cos(th); p[3 * i + 1] = r * Math.sin(th); p[3 * i + 2] = z; }
    tris = flipMaxMinAngle(cur, tris, p, 6);
  }

  return { ut: cur, indices: tris, points: cur.length / 2, rounds, hitBudget };
}
