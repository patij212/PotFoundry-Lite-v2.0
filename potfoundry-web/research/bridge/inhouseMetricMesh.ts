// inhouseMetricMesh.ts — performant IN-HOUSE metric-Delaunay mesher (no gmsh). The kernel rebuild core.
//
// Upgrades over the src/fidelity/spike (global anisotropy scale + per-triangle oracle chord sampling):
//   1. PER-NODE metric: density is driven by the precomputed surface metric field M=g/h₃D(u,t)²
//      (buildSurfaceMetricField). A triangle is "too big" when its longest edge exceeds the local metric
//      target — refine by METRIC edge length, not a global 3D length. Cheap (bilinear field lookups, no
//      per-triangle oracle chord sampling), so it scales past gmsh BAMG's ~1.8M cap.
//   2. FAST flips: a true-3D max-min-angle Lawson flip over Delaunator's HALFEDGE structure (no per-pass edge
//      Map — the measured 84%-of-runtime bottleneck) with a per-round precomputed xyz array and an acos-free
//      squared-cosine comparison → flips stay cheap at millions of triangles.
//   3. Optimization: iterated [on-surface smooth + flip] (the pass the spike lacked).
//
// Connectivity: initial Euclidean Delaunay (shipped delaunator) in coords scaled by the global median
// anisotropy s=median(√(M00/M11)); the true-3D flips then correct the local diagonals the global scale misses.
import Delaunator from 'delaunator';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface InhouseMeshOpts {
  tolMm: number; hMin: number; hMax: number;
  sizeRes?: number; gradeBeta?: number; seedN?: number;
  maxPoints?: number; maxRounds?: number; splitThresh?: number; optimizeSweeps?: number; dedupeEps?: number;
  profile?: boolean;
  /** Also split any triangle whose DIRECT facet→surface chord-sag (sampled on the true surface) exceeds this —
   *  a fidelity guarantee that catches sharp/thin relief the grid-curvature metric aliases (e.g. GothicArches
   *  V-grooves). mm. */
  chordTolMm?: number;
}
export interface InhouseMesh { ut: number[]; indices: Uint32Array; points: number; rounds: number; hitBudget: boolean; }

/**
 * MAX interior-angle cosine of the 3D triangle (a,b,c) — monotone proxy for its MIN angle (largest cos ⇔
 * smallest angle), with no `acos` (the flip decision only needs to COMPARE worst angles). Returns 1
 * (cos 0°) for a degenerate triangle so it ranks as the worst.
 */
function maxCosXYZ(xyz: Float64Array, a: number, b: number, c: number): number {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  const la2 = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2; // opposite a
  const lb2 = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2; // opposite b
  const lc2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2; // opposite c
  if (la2 < 1e-24 || lb2 < 1e-24 || lc2 < 1e-24) return 1;
  const cosA = (lb2 + lc2 - la2) / (2 * Math.sqrt(lb2 * lc2));
  const cosB = (la2 + lc2 - lb2) / (2 * Math.sqrt(la2 * lc2));
  const cosC = (la2 + lb2 - lc2) / (2 * Math.sqrt(la2 * lb2));
  return Math.max(cosA, cosB, cosC);
}

const linkHE = (halfedges: Int32Array, a: number, b: number): void => { halfedges[a] = b; if (b !== -1) halfedges[b] = a; };

/**
 * In-place true-3D max-min-angle Lawson flips over Delaunator's halfedge structure — NO per-pass edge Map
 * (the 84%-of-runtime bottleneck). Each flip relinks a constant number of halfedges following Delaunator's own
 * `_legalize`, so a pass is O(edges) array iteration + O(flips) relink. Mutates `triangles` + `halfedges`.
 * Edge a (halfedge, twin b=halfedges[a]) has triangles T_a={pr,pl,p0}, T_b={pl,?,p1} sharing edge pr-pl with
 * apexes p0,p1; flipping swaps the diagonal to p0-p1 when that raises the worse of the two 3D min-angles.
 */
export function flipHE(
  triangles: Uint32Array, halfedges: Int32Array, xyz: Float64Array, uv: number[], maxPasses: number,
  shouldFlip?: (pr: number, pl: number, p0: number, p1: number) => boolean,
): void {
  const ne = triangles.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    let flips = 0;
    const touched = new Uint8Array(ne / 3);
    for (let a = 0; a < ne; a++) {
      const b = halfedges[a];
      if (b === -1 || b < a) continue; // each interior edge once, from its lower halfedge
      const t0 = (a / 3) | 0, t1 = (b / 3) | 0;
      if (touched[t0] || touched[t1]) continue;
      const a0 = a - (a % 3), b0 = b - (b % 3);
      const al = a0 + (a + 1) % 3, ar = a0 + (a + 2) % 3, bl = b0 + (b + 2) % 3;
      const pr = triangles[a], pl = triangles[al], p0 = triangles[ar], p1 = triangles[bl];
      // validity: pr,pl must straddle the new diagonal p0-p1 in (u,t) (convex quad, no inversion)
      const dx = uv[p1 * 2] - uv[p0 * 2], dy = uv[p1 * 2 + 1] - uv[p0 * 2 + 1];
      const sPr = dx * (uv[pr * 2 + 1] - uv[p0 * 2 + 1]) - dy * (uv[pr * 2] - uv[p0 * 2]);
      const sPl = dx * (uv[pl * 2 + 1] - uv[p0 * 2 + 1]) - dy * (uv[pl * 2] - uv[p0 * 2]);
      if (sPr * sPl >= 0) continue;
      let doFlip: boolean;
      if (shouldFlip !== undefined) {
        doFlip = shouldFlip(pr, pl, p0, p1);            // pluggable criterion (e.g. anisotropic metric in-circle)
      } else {
        // default: flip if it LOWERS the worst max-cos (raises the worse true-3D min-angle).
        const curWorstCos = Math.max(maxCosXYZ(xyz, pr, pl, p0), maxCosXYZ(xyz, pr, pl, p1));
        const flpWorstCos = Math.max(maxCosXYZ(xyz, p0, p1, pl), maxCosXYZ(xyz, p0, p1, pr));
        doFlip = flpWorstCos < curWorstCos - 1e-9;
      }
      if (!doFlip) continue;
      triangles[a] = p1; triangles[b] = p0;
      const hbl = halfedges[bl], har = halfedges[ar];
      linkHE(halfedges, a, hbl);
      linkHE(halfedges, b, har);
      linkHE(halfedges, ar, bl);
      touched[t0] = 1; touched[t1] = 1; flips++;
    }
    if (flips === 0) break;
  }
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
  // DIRECT facet→surface chord-sag of triangle (va,vb,vc): sample the TRUE surface at the 3 edge-midpoints +
  // centroid, return the max |deviation| from the facet plane. Robust to grid aliasing of sharp relief.
  const chordTolMm = opts.chordTolMm;
  const liftP = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
  const chordSag = (va: number, vb: number, vc: number): number => {
    const A = liftP(uv[2 * va], uv[2 * va + 1]), B = liftP(uv[2 * vb], uv[2 * vb + 1]), C = liftP(uv[2 * vc], uv[2 * vc + 1]);
    let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
    let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
    let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const p = liftP(w0 * uv[2 * va] + w1 * uv[2 * vb] + w2 * uv[2 * vc], w0 * uv[2 * va + 1] + w1 * uv[2 * vb + 1] + w2 * uv[2 * vc + 1]);
      const d = Math.abs((p[0] - A[0]) * nx + (p[1] - A[1]) * ny + (p[2] - A[2]) * nz);
      if (d > mx) mx = d;
    }
    return mx;
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

  const prof = opts.profile === true;
  const now = (): number => Date.now();
  let tDel = 0, tFlip = 0, tXYZ = 0, tSplit = 0, tSmooth = 0;

  let tris = new Uint32Array(0); let rounds = 0; let hitBudget = false;
  for (; rounds < maxRounds; rounds++) {
    let z = now(); const d = new Delaunator(scaledCoords()); tris = d.triangles; const he = d.halfedges; tDel += now() - z;
    z = now(); const xyzR = computeXYZ(); tXYZ += now() - z;
    z = now(); flipHE(tris, he, xyzR, uv, 3); tFlip += now() - z;
    z = now();
    let added = 0;
    // split EVERY over-size edge's midpoint this round (not just the longest per triangle) — shared edges dedup
    // via addPoint, and refining all over-size edges at once converges in ~log2(ratio) rounds, not ~60.
    for (let ti = 0; ti < tris.length; ti += 3) {
      const a = tris[ti] * 2, b = tris[ti + 1] * 2, c = tris[ti + 2] * 2;
      const eAB = metricLen2(uv[a], uv[a + 1], uv[b], uv[b + 1]);
      const eBC = metricLen2(uv[b], uv[b + 1], uv[c], uv[c + 1]);
      const eCA = metricLen2(uv[c], uv[c + 1], uv[a], uv[a + 1]);
      if (eAB > splitThresh2 && addPoint((uv[a] + uv[b]) / 2, (uv[a + 1] + uv[b + 1]) / 2)) added++;
      if (eBC > splitThresh2 && addPoint((uv[b] + uv[c]) / 2, (uv[b + 1] + uv[c + 1]) / 2)) added++;
      if (eCA > splitThresh2 && addPoint((uv[c] + uv[a]) / 2, (uv[c + 1] + uv[a + 1]) / 2)) added++;
      // fidelity guard: if the facet deviates from the TRUE surface > chordTolMm, split the longest edge
      // (catches sharp/thin relief the grid-curvature metric aliases). Skip if already metric-split this edge.
      if (chordTolMm !== undefined && Math.max(eAB, eBC, eCA) <= splitThresh2 && chordSag(tris[ti], tris[ti + 1], tris[ti + 2]) > chordTolMm) {
        if (eAB >= eBC && eAB >= eCA) { if (addPoint((uv[a] + uv[b]) / 2, (uv[a + 1] + uv[b + 1]) / 2)) added++; }
        else if (eBC >= eCA) { if (addPoint((uv[b] + uv[c]) / 2, (uv[b + 1] + uv[c + 1]) / 2)) added++; }
        else if (addPoint((uv[c] + uv[a]) / 2, (uv[c + 1] + uv[a + 1]) / 2)) added++;
      }
      if (uv.length / 2 > maxPoints) { hitBudget = true; break; }
    }
    tSplit += now() - z;
    if (hitBudget || added === 0) { rounds++; break; }
  }

  // final connectivity + optimization sweeps (relocate on the surface, then re-flip to the true-3D Delaunay).
  // Smoothing moves vertices but NOT connectivity, so the halfedge structure stays valid across sweeps.
  let z = now(); const dF = new Delaunator(scaledCoords()); tris = dF.triangles; const heF = dF.halfedges; tDel += now() - z;
  z = now(); flipHE(tris, heF, computeXYZ(), uv, 4); tFlip += now() - z;
  let cur = uv.slice();
  for (let k = 0; k < sweeps; k++) {
    z = now(); cur = smoothSurfaceOnRadial(cur, tris, rA, H, { iterations: 3, relax: 0.5 }); tSmooth += now() - z;
    z = now();
    const n = cur.length / 2, p = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const u = cur[2 * i], t = cur[2 * i + 1], th = TAU * u, zz = t * H, r = rA(th, zz); p[3 * i] = r * Math.cos(th); p[3 * i + 1] = r * Math.sin(th); p[3 * i + 2] = zz; }
    tXYZ += now() - z;
    z = now(); flipHE(tris, heF, p, cur, 4); tFlip += now() - z;
  }

  if (prof) {
    // eslint-disable-next-line no-console
    console.log(`  [profile] delaunay=${(tDel / 1000).toFixed(1)}s flip=${(tFlip / 1000).toFixed(1)}s smooth=${(tSmooth / 1000).toFixed(1)}s xyz=${(tXYZ / 1000).toFixed(1)}s split=${(tSplit / 1000).toFixed(1)}s`);
  }
  return { ut: cur, indices: tris, points: cur.length / 2, rounds, hitBudget };
}
