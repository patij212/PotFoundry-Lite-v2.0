// s61FlipCeiling.ts — K4: HOW MUCH OF THE ORIENTATION FAILURE IS REACHABLE BY CONNECTIVITY AT ALL?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED (S60_FLIP_FINDINGS.md §0, K4) BEFORE THIS FILE WAS RUN.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A greedy flip pass tells you what ONE search found. It does not tell you what the VERTEX SET admits. This
// probe answers the second question, which is the one that decides whether flips are the fix or a component.
//
// THE CONSTRUCTION. For every facet still over the 10 um orientation bar, take the failure point p = its
// centroid. Collect the K nearest welded vertices to p (K=12 default) and enumerate ALL C(K,3) triangles
// they can form. Keep the ones whose (theta,z) footprint CONTAINS p — those are exactly the triangles that
// could cover this spot in SOME triangulation of the existing vertex set. Score each with the same rulers:
//     admissible  <=>  tangExc <= BAR  AND  jitterUm <= 1 um (f32-determined)  [AND optionally position]
//
// WHY THIS IS A CEILING AND IN WHICH DIRECTION. The enumeration ignores global consistency — the winning
// triangles for two neighbouring points need not coexist in one triangulation. So "reachable" here is
// OPTIMISTIC: it is an UPPER bound on what any connectivity-only method can achieve, and therefore
//     fracUnreachable = 1 - reachable   is a LOWER BOUND on the share that PROVABLY needs new vertices.
// A ceiling that is optimistic is the useful direction: if even the optimistic bound says impossible, it is
// impossible. Caveat stated rather than buried: the K-neighbourhood is local, so a very large well-aligned
// triangle outside it is not considered. K is swept (12 / 20) to show the sensitivity.
//
// AND THE NUMBER THAT PRICES THE FIX. For every unreachable point the probe reports minTang = the best
// tangExc any locally-formable triangle achieves, and the diameter of that triangle. Orientation error goes
// like diam^alpha with alpha=2 on a smooth patch and alpha=1 across a C0 crease; both implied refinement
// multipliers are printed, so the team can price "how much denser must the mesh be here" without re-deriving.
//
// KILL-CRITERION (K4, pre-registered): fracUnreachable >= 0.5 => new vertices are mandatory for the majority
// of the residual and flips are only a component. <= 0.1 => it is a SEARCH failure, not a representation
// failure. In between => report the split, no verdict.
//
// READ-ONLY. Usage: bash research/tools/run-s61-flip-ceiling.sh <TAG>   (PF_S61_PATH=<stl relative path>)
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');
const STYLE = process.env.PF_S61_STYLE ?? 'Voronoi';
const PATH = process.env.PF_S61_PATH ?? 'research/exchange/_strataConformBisect/voronoi_ring_D--.stl';
const TAG = process.env.PF_S61_TAG ?? 'CEIL';
const K = Math.round(envF('PF_S61_K', 12));
const BAR = envF('PF_S61_BAR_UM', 10);
const JBAR = envF('PF_S61_JBAR_UM', 1);
const NPTS = Math.round(envF('PF_S61_NPTS', 20000));      // sample of the residual failure set
const USE_POS = envB('PF_S61_POS', true);                  // second-stage position feasibility on the best few
const EMPTY = envB('PF_S61_EMPTY', true);                  // reject candidates containing another vertex
/**
 * EXACT MODE. PF_S61_DMAX > 0 switches candidate selection from "K nearest" to "every vertex within DMAX",
 * and caps the candidate triangle's diameter at DMAX.
 *
 * WHY THIS IS THE ONLY HONEST WAY TO STATE THE CEILING. A K-nearest enumeration is TRUNCATED, and the
 * truncation is not a small effect: measured on Voronoi, reachable rose 38.2 -> 48.2 -> 54.2 -> 60.6 -> 67.5%
 * as K went 12 -> 20 -> 28 -> 40 -> 60, with no sign of saturating, because every extra vertex hands the
 * probe another bespoke long thin empty triangle. So 1-R_K is an UPPER bound on the unreachable share and
 * it keeps falling — it can never support "at least X% needs new vertices".
 * Under a diameter cap D the enumeration becomes EXACT and CONVERGED instead: if a triangle of diameter <= D
 * contains p, then every one of its vertices is within D of p, so "all vertices within D" is the COMPLETE
 * candidate set. Nothing is truncated and the answer does not move with a search parameter.
 */
// -1 = auto: DMAX := the mesh's OWN median facet diameter (resolved once the mesh is read).
let DMAX = envF('PF_S61_DMAX', 0);
const CAPN = Math.round(envF('PF_S61_CAPN', 80));          // safety cap on |candidates|; bind rate reported
const POSTOP = Math.round(envF('PF_S61_POSTOP', 5));
const DIMS: StyleDims = { H: envF('PF_S61_H', 120), Rb: envF('PF_S61_RB', 40), Rt: envF('PF_S61_RT', 50), expn: envF('PF_S61_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s60flip';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
mkdirSync(OUTDIR, { recursive: true });

log('===== S61 — K4: THE CONNECTIVITY CEILING (what the EXISTING VERTEX SET admits) =====');
log(`style ${STYLE}   mesh ${PATH}   K=${K} nearest vertices   bar ${BAR} um   posCheck ${USE_POS}   emptyTriangleFilter ${EMPTY}`);

// ── read + weld
const { xyz, nTri } = readMeshFloat64(PATH, false);
const VXa = new Float64Array(nTri * 3); const VYa = new Float64Array(nTri * 3); const VZa = new Float64Array(nTri * 3);
const ta = new Int32Array(nTri + 1); const tb = new Int32Array(nTri + 1); const tc = new Int32Array(nTri + 1);
let NV = 0;
{
  const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
  const map = new Map<number, number[]>(); const corner = new Int32Array(3);
  for (let t = 0; t < nTri; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const i = t * 3 + e;
      const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
      f64[0] = x; f64[1] = y; f64[2] = z;
      let h = 2166136261;
      for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
      h >>>= 0;
      const b = map.get(h); let found = -1;
      if (b !== undefined) { for (const v of b) if (VXa[v] === x && VYa[v] === y && VZa[v] === z) { found = v; break; } }
      if (found < 0) { found = NV; VXa[NV] = x; VYa[NV] = y; VZa[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
      corner[e] = found;
    }
    ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
  }
}
const VT = new Float64Array(NV);
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VYa[v], VXa[v]);
log(`${nTri} facets, ${NV} welded vertices  [${el()}]`);
const MESH: SagMesh = { ta, tb, tc, vth: VT, vz: VZa, vx: VXa, vy: VYa };
const ARG = makeSagArgmax();

// ── rulers (identical arithmetic to s60ConstrainedFlip.ts / S56 / S58)
function ulpF32(R: number): number { const a = Math.abs(R); if (!(a > 0)) return 2 ** -149; return 2 ** (Math.floor(Math.log2(a)) - 23); }
function jitterUmOf(a: number, b: number, c: number): number {
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const ux = VXa[b] - ax; const uy = VYa[b] - ay; const uz = VZa[b] - az;
  const wx = VXa[c] - ax; const wy = VYa[c] - ay; const wz = VZa[c] - az;
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  const cr = Math.hypot(cx, cy, cz);
  const diam = Math.max(
    Math.hypot(VXa[b] - VXa[c], VYa[b] - VYa[c], VZa[b] - VZa[c]),
    Math.hypot(ax - VXa[c], ay - VYa[c], az - VZa[c]),
    Math.hypot(ax - VXa[b], ay - VYa[b], az - VZa[b]));
  const R = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az), Math.abs(VXa[b]), Math.abs(VYa[b]), Math.abs(VZa[b]), Math.abs(VXa[c]), Math.abs(VYa[c]), Math.abs(VZa[c]));
  if (cr <= 0) return Infinity;
  return (1.5 * ulpF32(R) * diam / (cr / Math.max(1e-300, diam))) * 1000;
}
function diamOf(a: number, b: number, c: number): number {
  return Math.max(
    Math.hypot(VXa[b] - VXa[c], VYa[b] - VYa[c], VZa[b] - VZa[c]),
    Math.hypot(VXa[a] - VXa[c], VYa[a] - VYa[c], VZa[a] - VZa[c]),
    Math.hypot(VXa[a] - VXa[b], VYa[a] - VYa[b], VZa[a] - VZa[b]));
}
function tangExcOf(a: number, b: number, c: number): number {
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
  const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return Infinity;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
  const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
  const r = rA(thc, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  return Math.sin(Math.acos(dot)) * diamOf(a, b, c) * 1000;
}
const posOfCand = (a: number, b: number, c: number): number => {
  ta[nTri] = a; tb[nTri] = b; tc[nTri] = c;
  return sagAdaptiveRaw(rA, MESH, nTri, 0.03, 12, 64, ARG) * 1000;
};
/** unit surface normal at (theta,z). 5 rA evals. */
function surfN(th: number, z: number): [number, number, number] {
  const zc = Math.min(H, Math.max(0, z));
  const r = rA(th, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(th + hTh, zc) - rA(th - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(th, zp) - rA(th, zm)) / (zp - zm) : 0;
  const cc = Math.cos(th); const ss = Math.sin(th);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1;
  nx /= L; ny /= L; nz /= L;
  return [nx, ny, nz];
}
/**
 * WHY is a facet failing? Max pairwise angle between the TRUE surface normals at the facet's three
 * vertices (deg). A C0 crease running through the footprint gives a large spread at any density; smooth
 * curvature gives a spread that falls with the facet size. This is the discriminator between
 * "align edges to the crease" (needs crease vertices) and "refine" (needs density).
 */
function normSpreadDeg(a: number, b: number, c: number): number {
  const thA = VT[a];
  const ns = [
    surfN(thA, VZa[a]),
    surfN(thA + dThRaw(thA, VT[b]), VZa[b]),
    surfN(thA + dThRaw(thA, VT[c]), VZa[c]),
  ];
  let m = 0;
  for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) {
    let d = ns[i][0] * ns[j][0] + ns[i][1] * ns[j][1] + ns[i][2] * ns[j][2];
    d = d > 1 ? 1 : d < -1 ? -1 : d;
    const ang = (Math.acos(d) * 180) / Math.PI;
    if (ang > m) m = ang;
  }
  return m;
}

// ── the mesh's OWN facet-diameter distribution. It sets the diameter caps below.
//
// WHY A DIAMETER CAP AT ALL. Coverage + emptiness are necessary conditions, not sufficient ones, and on
// their own they are far too generous: the probe hands itself ever longer thin empty triangles as K grows
// (measured, K=12/20/28/40 -> reachable 38.2/48.2/54.2/60.3%), because a long sliver lying inside one flat
// Voronoi plateau has a tiny orientation error at any length. No triangulation can give EVERY failure point
// its own bespoke long triangle — they would have to tile the surface. So the reachable fraction is reported
// as a curve against a cap on the candidate's diameter, with the caps taken from THE MESH'S OWN facet sizes:
// the probe may not invent a triangle larger than the density it is auditing already produces.
const dAll = new Float64Array(nTri);
for (let t = 0; t < nTri; t += 1) dAll[t] = diamOf(ta[t], tb[t], tc[t]);
const dSorted = Float64Array.from(dAll).sort();
const DCAPS: Array<[string, number]> = [
  ['p50', pq(Array.from(dSorted), 0.5)],
  ['p90', pq(Array.from(dSorted), 0.9)],
  ['p99', pq(Array.from(dSorted), 0.99)],
  ['none', Infinity],
];
log(`mesh facet diameter: p50 ${DCAPS[0][1].toFixed(4)}  p90 ${DCAPS[1][1].toFixed(4)}  p99 ${DCAPS[2][1].toFixed(4)} mm  -> the candidate diameter caps`);
if (DMAX === -1) { DMAX = DCAPS[0][1]; log(`PF_S61_DMAX=-1 -> auto: exact mode at the mesh's own median facet diameter ${DMAX.toFixed(4)} mm`); }

// ── the residual failure set
const fails: number[] = [];
for (let t = 0; t < nTri; t += 1) if (tangExcOf(ta[t], tb[t], tc[t]) > BAR) fails.push(t);
log(`residual over-${BAR}um facets: ${fails.length} (${((100 * fails.length) / nTri).toFixed(3)}%)  [${el()}]`);
const stride = Math.max(1, Math.floor(fails.length / NPTS));
const sample: number[] = [];
for (let i = 0; i < fails.length; i += stride) sample.push(fails[i]);
log(`sampling ${sample.length} of them (stride ${stride})`);

// ── uniform grid over 3D for kNN
const CELL = envF('PF_S61_CELL', 0.8);
let minX = Infinity; let minY = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
for (let v = 0; v < NV; v += 1) {
  if (VXa[v] < minX) minX = VXa[v]; if (VXa[v] > maxX) maxX = VXa[v];
  if (VYa[v] < minY) minY = VYa[v]; if (VYa[v] > maxY) maxY = VYa[v];
  if (VZa[v] < minZ) minZ = VZa[v]; if (VZa[v] > maxZ) maxZ = VZa[v];
}
const NX = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
const NY = Math.max(1, Math.ceil((maxY - minY) / CELL) + 1);
const NZ = Math.max(1, Math.ceil((maxZ - minZ) / CELL) + 1);
const cellOf = (x: number, y: number, z: number): number => {
  const i = Math.min(NX - 1, Math.max(0, Math.floor((x - minX) / CELL)));
  const j = Math.min(NY - 1, Math.max(0, Math.floor((y - minY) / CELL)));
  const k = Math.min(NZ - 1, Math.max(0, Math.floor((z - minZ) / CELL)));
  return (k * NY + j) * NX + i;
};
const nCells = NX * NY * NZ;
const cnt = new Int32Array(nCells + 1);
for (let v = 0; v < NV; v += 1) cnt[cellOf(VXa[v], VYa[v], VZa[v]) + 1] += 1;
for (let i = 0; i < nCells; i += 1) cnt[i + 1] += cnt[i];
const cellStart = Int32Array.from(cnt);
const items = new Int32Array(NV);
{
  const fill = Int32Array.from(cellStart.subarray(0, nCells));
  for (let v = 0; v < NV; v += 1) { const c = cellOf(VXa[v], VYa[v], VZa[v]); items[fill[c]] = v; fill[c] += 1; }
}
log(`grid ${NX}x${NY}x${NZ} = ${nCells} cells, cell ${CELL} mm  [${el()}]`);

// ── the sweep
interface Row { t: number; tang: number; best: number; bestDiam: number; nCover: number; reach: boolean; reachPos: boolean; reachNoJit: boolean; spread: number; }
const rows: Row[] = [];
const cand: number[] = [];
const dist: number[] = [];
const knn = new Int32Array(Math.max(K, CAPN) + 3);
const bestUnderCap = new Float64Array(DCAPS.length).fill(Infinity);
const capReach = new Int32Array(DCAPS.length);
let capBind = 0;
let nCandSum = 0;
let nNoCover = 0;
for (const t of sample) {
  const a0 = ta[t]; const b0 = tb[t]; const c0 = tc[t];
  const px = (VXa[a0] + VXa[b0] + VXa[c0]) / 3;
  const py = (VYa[a0] + VYa[b0] + VYa[c0]) / 3;
  const pz = (VZa[a0] + VZa[b0] + VZa[c0]) / 3;
  const thA = VT[a0];
  const pth = thA + (dThRaw(thA, VT[b0]) + dThRaw(thA, VT[c0])) / 3;
  // K nearest vertices (3x3x3 cells, widened until >= K found)
  cand.length = 0; dist.length = 0;
  const radMin = DMAX > 0 ? Math.max(1, Math.ceil(DMAX / CELL)) : 1;
  for (let rad = radMin; rad <= 4 && (DMAX > 0 ? rad === radMin : cand.length < K); rad += 1) {
    cand.length = 0; dist.length = 0;
    const i0 = Math.min(NX - 1, Math.max(0, Math.floor((px - minX) / CELL)));
    const j0 = Math.min(NY - 1, Math.max(0, Math.floor((py - minY) / CELL)));
    const k0 = Math.min(NZ - 1, Math.max(0, Math.floor((pz - minZ) / CELL)));
    for (let dk = -rad; dk <= rad; dk += 1) for (let dj = -rad; dj <= rad; dj += 1) for (let di = -rad; di <= rad; di += 1) {
      const i = i0 + di; const j = j0 + dj; const k = k0 + dk;
      if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
      const c = (k * NY + j) * NX + i;
      for (let s = cellStart[c]; s < cellStart[c + 1]; s += 1) {
        const v = items[s];
        cand.push(v); dist.push(Math.hypot(VXa[v] - px, VYa[v] - py, VZa[v] - pz));
      }
    }
  }
  // The failing facet's OWN three vertices are force-included. Without this, a sliver whose third vertex
  // lies outside the K-nearest ball has NO covering triangle at all and would be scored "unreachable" by
  // an artefact of the probe rather than by the geometry. (First run of this probe: 6,698 of 20,021 —
  // 33.5% — had zero covers for exactly that reason. Fixed here; the K sweep bounds what is left.)
  const ord = cand.map((_, i) => i).sort((x, y) => dist[x] - dist[y]);
  let kk = 0;
  if (DMAX > 0) {
    // EXACT: every vertex within DMAX of p is a candidate, and nothing else can be one.
    for (let i = 0; i < ord.length; i += 1) {
      if (dist[ord[i]] > DMAX) break;
      if (kk >= CAPN) { capBind += 1; break; }
      knn[kk] = cand[ord[i]]; kk += 1;
    }
  } else {
    for (const v of [a0, b0, c0]) { let dup = false; for (let i = 0; i < kk; i += 1) if (knn[i] === v) dup = true; if (!dup) { knn[kk] = v; kk += 1; } }
    for (let i = 0; i < ord.length && kk < K; i += 1) {
      const v = cand[ord[i]];
      let dup = false; for (let q = 0; q < kk; q += 1) if (knn[q] === v) dup = true;
      if (!dup) { knn[kk] = v; kk += 1; }
    }
  }
  nCandSum += kk;
  // enumerate all triangles that COVER p in (theta,z)
  let best = Infinity; let bestDiam = 0; let nCover = 0; let reach = false; let reachNoJit = false;
  const covers: Array<[number, number, number, number]> = [];   // [tang, a, b, c]
  for (let i = 0; i < kk; i += 1) for (let j = i + 1; j < kk; j += 1) for (let m = j + 1; m < kk; m += 1) {
    const A = knn[i]; const B = knn[j]; const C = knn[m];
    if (DMAX > 0 && diamOf(A, B, C) > DMAX) continue;
    // (theta,z) coordinates unwrapped about p
    const ax = dThRaw(pth, VT[A]); const ay = VZa[A] - pz;
    const bx = dThRaw(pth, VT[B]); const by = VZa[B] - pz;
    const cx = dThRaw(pth, VT[C]); const cy = VZa[C] - pz;
    const d1 = (bx - ax) * (0 - ay) - (by - ay) * (0 - ax);
    const d2 = (cx - bx) * (0 - by) - (cy - by) * (0 - bx);
    const d3 = (ax - cx) * (0 - cy) - (ay - cy) * (0 - cx);
    if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
    // EMPTINESS. In a triangulation of the FULL vertex set every vertex is a corner, so no triangle may
    // strictly contain another vertex. Without this the probe hands itself huge triangles that span five
    // vertices' worth of surface and no triangulation could ever use — which is exactly why the first K
    // sweep looked K-sensitive (K=12 46.6% reachable -> K=20 57.6%). Tested against every vertex in the
    // local cell block, a superset of the K used to form candidates.
    if (EMPTY) {
      let bad = false;
      for (let q = 0; q < cand.length && !bad; q += 1) {
        const V = cand[q];
        if (V === A || V === B || V === C) continue;
        const vx = dThRaw(pth, VT[V]); const vy = VZa[V] - pz;
        const e1 = (bx - ax) * (vy - ay) - (by - ay) * (vx - ax);
        const e2 = (cx - bx) * (vy - by) - (cy - by) * (vx - bx);
        const e3 = (ax - cx) * (vy - cy) - (ay - cy) * (vx - cx);
        if ((e1 > 0 && e2 > 0 && e3 > 0) || (e1 < 0 && e2 < 0 && e3 < 0)) bad = true;
      }
      if (bad) continue;
    }
    nCover += 1;
    const g = tangExcOf(A, B, C);
    if (g <= BAR) reachNoJit = true;                              // would count if determinacy were ignored
    if (jitterUmOf(A, B, C) > JBAR) continue;                     // must be f32-determined to count
    const dcd = diamOf(A, B, C);
    if (g < best) { best = g; bestDiam = dcd; }
    for (let q = 0; q < DCAPS.length; q += 1) if (dcd <= DCAPS[q][1] && g < bestUnderCap[q]) bestUnderCap[q] = g;
    if (g <= BAR) { reach = true; covers.push([g, A, B, C]); }
  }
  for (let q = 0; q < DCAPS.length; q += 1) { if (bestUnderCap[q] <= BAR) capReach[q] += 1; bestUnderCap[q] = Infinity; }
  if (nCover === 0) nNoCover += 1;
  let reachPos = false;
  if (reach && USE_POS) {
    covers.sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < Math.min(POSTOP, covers.length); i += 1) {
      if (posOfCand(covers[i][1], covers[i][2], covers[i][3]) <= BAR) { reachPos = true; break; }
    }
  } else reachPos = reach;
  rows.push({ t, tang: tangExcOf(a0, b0, c0), best, bestDiam, nCover, reach, reachPos, reachNoJit, spread: normSpreadDeg(a0, b0, c0) });
}
log(`swept ${rows.length} failure points  [${el()}]`);

// ── report
const nReach = rows.filter((r) => r.reach).length;
const nReachPos = rows.filter((r) => r.reachPos).length;
const unreach = rows.filter((r) => !r.reach);
const bests = unreach.map((r) => r.best).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
const coverN = rows.map((r) => r.nCover).sort((a, b) => a - b);
log('');
log('── K4: THE CONNECTIVITY CEILING ──');
log(`   failure points sampled              ${rows.length}`);
log(`   candidate mode                      ${DMAX > 0 ? `EXACT radius <= DMAX ${DMAX.toFixed(4)} mm (complete set; nothing truncated)` : `K-nearest K=${K} (TRUNCATED — the answer moves with K)`}`);
log(`   candidates per point                mean ${(nCandSum / rows.length).toFixed(1)}   safety cap ${CAPN} bound on ${capBind} points (${((100 * capBind) / rows.length).toFixed(2)}%)`);
log(`   with NO covering triangle at all    ${nNoCover}   (K too small / point outside the local hull)`);
log(`   covering triangles per point        p50 ${pq(coverN, 0.5)}  p99 ${pq(coverN, 0.99)}  max ${coverN[coverN.length - 1]}`);
log(`   REACHABLE (some local triangle meets the ${BAR} um orientation bar and is f32-determined)`);
log(`        ${nReach}  = ${((100 * nReach) / rows.length).toFixed(2)}%`);
log(`   REACHABLE and that triangle also meets the ${BAR} um POSITION bar`);
log(`        ${nReachPos}  = ${((100 * nReachPos) / rows.length).toFixed(2)}%`);
const fracUnreachable = 1 - nReachPos / rows.length;
log(`   *** fracUnreachable = ${(100 * fracUnreachable).toFixed(2)}%  — PROVABLY needs new vertices ***`);
log(`   K4 verdict: ${fracUnreachable >= 0.5 ? 'NEW VERTICES MANDATORY for the majority of the residual' : fracUnreachable <= 0.1 ? 'a SEARCH failure, not a representation failure' : 'SPLIT — report both, no verdict'}`);
log('');
log('── THE CEILING AS A CURVE AGAINST THE CANDIDATE DIAMETER CAP (K-free: bigger K only adds vertices the cap then excludes) ──');
for (let q = 0; q < DCAPS.length; q += 1) {
  log(`   diam <= ${DCAPS[q][0].padEnd(4)} (${DCAPS[q][1] === Infinity ? 'unbounded' : `${DCAPS[q][1].toFixed(4)} mm`})   reachable ${capReach[q]} = ${((100 * capReach[q]) / rows.length).toFixed(2)}%   fracUnreachable ${(100 - (100 * capReach[q]) / rows.length).toFixed(2)}%`);
}
log('');
log('── WHY: crease-straddle vs plain curvature (normSpread = max pairwise angle of the TRUE surface normal at the 3 vertices) ──');
{
  const sp = rows.map((r) => r.spread).sort((a, b) => a - b);
  const hi = rows.filter((r) => r.spread >= 20); const lo = rows.filter((r) => r.spread < 20);
  const rr = (a: Row[]): string => (a.length === 0 ? 'n/a' : `${((100 * a.filter((r) => r.reachPos).length) / a.length).toFixed(1)}%`);
  log(`   normSpread over the failure set: p50 ${pq(sp, 0.5).toFixed(1)}  p90 ${pq(sp, 0.9).toFixed(1)}  max ${sp[sp.length - 1].toFixed(1)} deg`);
  log(`   CREASE-STRADDLE (spread >= 20 deg): ${hi.length} (${((100 * hi.length) / rows.length).toFixed(1)}%)   reachable ${rr(hi)}`);
  log(`   SMOOTH          (spread <  20 deg): ${lo.length} (${((100 * lo.length) / rows.length).toFixed(1)}%)   reachable ${rr(lo)}`);
  const nj = rows.filter((r) => r.reachNoJit && !r.reach).length;
  log(`   points reachable ONLY by an f32-undetermined triangle (excluded by C3): ${nj} (${((100 * nj) / rows.length).toFixed(2)}%)`);
}
log('');
log('── PRICING THE UNREACHABLE PART ──');
if (bests.length > 0) {
  const p50 = pq(bests, 0.5); const p90 = pq(bests, 0.9);
  const dm = unreach.map((r) => r.bestDiam).filter((v) => v > 0).sort((a, b) => a - b);
  log(`   best achievable tangExc on unreachable points: p50 ${p50.toFixed(1)}  p90 ${p90.toFixed(1)}  max ${bests[bests.length - 1].toFixed(1)} um`);
  log(`   diameter of that best triangle:                p50 ${pq(dm, 0.5).toFixed(4)} mm`);
  log(`   implied local refinement to reach ${BAR} um:`);
  log(`      if tang ~ diam^2 (smooth patch): h x ${Math.sqrt(BAR / p50).toFixed(3)}  => local triangle count x ${(p50 / BAR).toFixed(1)}`);
  log(`      if tang ~ diam^1 (C0 crease):    h x ${(BAR / p50).toFixed(4)}  => local triangle count x ${((p50 / BAR) ** 2).toFixed(1)}`);
}
writeFileSync(`${OUTDIR}/${TAG}.ceiling.json`, JSON.stringify({
  mesh: PATH, style: STYLE, K, BAR, JBAR, nTri, NV, nFail: fails.length, sampled: rows.length,
  nNoCover, nReach, nReachPos, fracUnreachable, EMPTY,
  capCurve: DCAPS.map(([n, d], q) => ({ cap: n, mm: d, reach: capReach[q], frac: capReach[q] / rows.length })),
  bestP50: bests.length ? pq(bests, 0.5) : null, bestP90: bests.length ? pq(bests, 0.9) : null,
}, null, 2));
appendFileSync(`${OUTDIR}/ceiling.ndjson`, `${JSON.stringify({ tag: TAG, mesh: PATH, K, nFail: fails.length, sampled: rows.length, nReach, nReachPos, fracUnreachable })}\n`);
log('');
log(`done  [${el()}]`);
