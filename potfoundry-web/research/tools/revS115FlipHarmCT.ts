// revS115FlipHarmCT.ts — S115 REVIEW PROBE: the HARMS the flip report did NOT census.
//
// The S115 flip report (S115_OPFLIP_CT2) reports RELOCATION (net), FLOOR-3 normDeg harm, FLOOR-5
// diagonal-midpoint position, and per-accept AR parent/child percentiles. It does NOT census, on the
// AFTER mesh, any of:
//    H1  NEW BACK-FACING facets  (rDot<0 beyond the f32 fold band) — the campaign's named orientation
//        defect (S98/S101/S102/S103). `rDot` in the flip tool is computed ONCE on xyz0 and only ever
//        used as a BEFORE label; the accept guard `invert3d` is relative to the PARENT PAIR's average
//        normal, which is near-zero-length exactly on the BLADE class (dihedral ~180), so it is close
//        to vacuous there.
//    H2  NEW SLIVERS (aspect>=20) and NEW DEGENERATES (zero area / non-finite AR). The shape floor is
//        do-no-harm `arC <= max(50, arP1, arP2)`, and Infinity <= Infinity is TRUE, so a degenerate
//        parent licenses a degenerate child.
//    H3  GROSS 1-ring defect CREATION (facets that were UNDER the bar and are now OVER), split by
//        touched vs 1-ring-only. The report gives only the NET relocation figure.
//    H4  NEW BLADES (dihedral >= 175 deg) created.
//    H5  POSITION beyond the diagonal midpoint: the new triangles' own edge-midpoint/centroid
//        deviation vs the old triangles'. FLOOR-5 measured only the ONE new diagonal's midpoint.
//
// The arm logic below is COPIED VERBATIM from research/tools/s115opFlipCT.ts so the accept sets are
// provably identical; the self-check asserts arm A = 42050 flips and arm B = 20580 flips, and the
// PRIMARY ratios 0.99327x / 1.03393x, before any harm number is printed.
//
// Usage: bash research/tools/run-rev-s115-flipharm.sh
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DEG = 180 / Math.PI;
void readFileSync;

const STYLE = process.env.PF_RVH_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_RVH_STL
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_D--.stl';
const TAG = process.env.PF_RVH_TAG ?? 'REVHARM';
const K_REF = Math.round(envF('PF_RVH_K', 8));
const INSET_REF = envF('PF_RVH_INSET', 0.05);
const H_REF = envF('PF_RVH_H', 2e-6);
const HI_DEG = envF('PF_RVH_HI', 45);
const AR_CAP = envF('PF_RVH_ARCAP', 50);
const SEED = Math.round(envF('PF_RVH_SEED', 20260807));
const DIMS: StyleDims = { H: envF('PF_RVH_HDIM', 120), Rb: envF('PF_RVH_RB', 40), Rt: envF('PF_RVH_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s115flip';

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
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (a: ArrayLike<number>): number => {
  let m = -Infinity;
  for (let i = 0; i < a.length; i += 1) if (a[i] > m) m = a[i];
  return m;
};
const f2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a += 0x6d2b79f5; a >>>= 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 REVIEW — THE UNCENSUSED HARMS OF THE CONSTRAINED FLIP on ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log('probe H1 new back-facing | H2 new slivers/degenerates | H3 GROSS 1-ring creation | H4 new blades | H5 whole-triangle position');
log('');

const defs = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...defs }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsRef = fdNormals(rA, H, H_REF, H_REF);
const scratch = new Float64Array(12);

const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);

const idxIdentity = new Uint32Array(nTri * 3);
for (let i = 0; i < nTri * 3; i += 1) idxIdentity[i] = i;
const d0 = facetDihedrals(xyz0, idxIdentity);
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
const thrRef = (HI_DEG * Math.PI) / 180;
const BLADE_RAD = (175 * Math.PI) / 180;

// ── PRECOND (same gate as the tool under review) ──────────────────────────────────────────────────
const precondBad = new Set<number>();
{
  let worstS = 0;
  const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += 1) {
    let dm = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > dm) dm = dd;
    }
    if (f % step === 0 && dm > worstS) worstS = dm;
    if (dm * 1000 > 50) precondBad.add(f);
  }
  log(`── PRECOND: stride MAX ${(worstS * 1000).toFixed(4)} um (gate 50)  |  exhaustive facets over gate: ${precondBad.size}  ${el()}`);
  if (worstS * 1000 > 50) { log('*** REFUSING ***'); process.exit(4); }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SHAPE LABELS — as FUNCTIONS of an arbitrary xyz, so they can be recomputed on the AFTER mesh.
// Definitions copied verbatim from the tool under review.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const ulpOf = (x: number): number => {
  const a = Math.abs(x);
  if (!(a > 0)) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
};
interface Labels { minAlt: Float64Array; aspect: Float64Array; rDot: Float64Array; angUnc: Float64Array; degen: Uint8Array }
function labelsOf(xyz: Float64Array, dd: ReturnType<typeof facetDihedrals>): Labels {
  const minAlt = new Float64Array(nTri); const aspect = new Float64Array(nTri);
  const rDot = new Float64Array(nTri); const angUnc = new Float64Array(nTri);
  const degen = new Uint8Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const L = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    const a3 = dd.areaMm2[f];
    const alt = L > 0 ? (2 * a3) / L : 0;
    minAlt[f] = alt; aspect[f] = alt > 0 ? L / alt : Infinity;
    if (!(a3 > 0) || !Number.isFinite(aspect[f])) degen[f] = 1;
    const qz = Math.max(ulpOf(ax), ulpOf(ay), ulpOf(az), ulpOf(bx), ulpOf(by), ulpOf(bz), ulpOf(cx), ulpOf(cy), ulpOf(cz));
    angUnc[f] = alt > 0 ? Math.atan(qz / alt) * DEG : 180;
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 0) { nx /= nl; ny /= nl; }
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    const gl = Math.hypot(gx, gy);
    rDot[f] = gl > 0 ? (nx * gx + ny * gy) / gl : 0;
    void nz;
  }
  return { minAlt, aspect, rDot, angUnc, degen };
}
const foldBandL = (L: Labels, f: number): number => Math.sin(Math.min(Math.PI / 2, (3 * L.angUnc[f] * Math.PI) / 180));
const isInvertedL = (L: Labels, f: number): boolean => L.rDot[f] < 0 && Math.abs(L.rDot[f]) > foldBandL(L, f);
const isSliverL = (L: Labels, f: number): boolean => L.aspect[f] >= 20;
const L0 = labelsOf(xyz0, d0);
log(`── BEFORE shape labels computed  ${el()}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WELD + EDGES (verbatim)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function weldSoup(xyz: Float64Array, n: number): { id: Int32Array; vx: Float64Array; vy: Float64Array; vz: Float64Array; nV: number } {
  const nVin = n * 3;
  const id = new Int32Array(nVin);
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
  let next = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket !== undefined) for (const cc of bucket) if (cx[cc] === x && cy[cc] === y && cz[cc] === z) { found = cc; break; }
    if (found < 0) {
      found = next; next += 1;
      cx.push(x); cy.push(y); cz.push(z);
      if (bucket === undefined) buckets.set(h, [found]); else bucket.push(found);
    }
    id[v] = found;
  }
  return { id, vx: Float64Array.from(cx), vy: Float64Array.from(cy), vz: Float64Array.from(cz), nV: next };
}
const W = weldSoup(xyz0, nTri);
const EKEY = 67_108_864;
const ekey = (a: number, b: number): number => (a < b ? a * EKEY + b : b * EKEY + a);
const edgeMap = new Map<number, number[]>();
for (let f = 0; f < nTri; f += 1) {
  const a = W.id[f * 3]; const b = W.id[f * 3 + 1]; const c = W.id[f * 3 + 2];
  for (const k of [ekey(a, b), ekey(b, c), ekey(c, a)]) {
    const g = edgeMap.get(k);
    if (g === undefined) edgeMap.set(k, [f]); else g.push(f);
  }
}
const VT = new Float64Array(W.nV);
for (let v = 0; v < W.nV; v += 1) VT[v] = Math.atan2(W.vy[v], W.vx[v]);
function nrmOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const Ln = Math.hypot(nx, ny, nz);
  return Ln > 0 ? [nx / Ln, ny / Ln, nz / Ln] : [0, 0, 0];
}
const FN = new Float64Array(nTri * 3);
for (let f = 0; f < nTri; f += 1) {
  const n = nrmOf(xyz0[f * 9], xyz0[f * 9 + 1], xyz0[f * 9 + 2], xyz0[f * 9 + 3], xyz0[f * 9 + 4], xyz0[f * 9 + 5], xyz0[f * 9 + 6], xyz0[f * 9 + 7], xyz0[f * 9 + 8]);
  FN[f * 3] = n[0]; FN[f * 3 + 1] = n[1]; FN[f * 3 + 2] = n[2];
}
interface EdgeRec { u: number; v: number; f1: number; f2: number; ang: number }
const edges: EdgeRec[] = [];
for (const [k, g] of edgeMap) {
  if (g.length !== 2) continue;
  const u = Math.floor(k / EKEY); const v = k - u * EKEY;
  const f1 = g[0]; const f2 = g[1];
  let dp = FN[f1 * 3] * FN[f2 * 3] + FN[f1 * 3 + 1] * FN[f2 * 3 + 1] + FN[f1 * 3 + 2] * FN[f2 * 3 + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  edges.push({ u, v, f1, f2, ang: Math.acos(dp) });
}
let cand: EdgeRec[] = edges.filter((e) => e.ang > thrRef);
cand.sort((a, b) => b.ang - a.ang);
log(`── candidates ${cand.length} of ${edges.length} interior edges  ${el()}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE OPERATOR — verbatim
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function normDegXYZ(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const a = Math.atan2(ay, ax);
  const b = a + dThRaw(a, Math.atan2(by, bx));
  const c = a + dThRaw(a, Math.atan2(cy, cx));
  return orientOfFacet(nsRef, ax, ay, az, bx, by, bz, cx, cy, cz, a, b, c, { k: K_REF, inset: INSET_REF, scratch }).normDeg;
}
const normDegOf = (xyz: Float64Array, f: number): number => normDegXYZ(
  xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
  xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8],
);
function arOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const s = 0.5 * (ab + bc + ca);
  if (!(area > 0) || !(s > 0)) return Infinity;
  return Math.max(ab, bc, ca) / (2 * (area / s));
}
const devAt = (x: number, y: number, z: number): number => Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
/** H5: max |r-rA| over a triangle's 3 edge midpoints AND its centroid. */
function triDev(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  let m = devAt(0.5 * (ax + bx), 0.5 * (ay + by), 0.5 * (az + bz));
  m = Math.max(m, devAt(0.5 * (bx + cx), 0.5 * (by + cy), 0.5 * (bz + cz)));
  m = Math.max(m, devAt(0.5 * (cx + ax), 0.5 * (cy + ay), 0.5 * (cz + az)));
  m = Math.max(m, devAt((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3));
  return m;
}
const midDev = (p: number, qv: number): number => devAt(0.5 * (W.vx[p] + W.vx[qv]), 0.5 * (W.vy[p] + W.vy[qv]), 0.5 * (W.vz[p] + W.vz[qv]));

interface Acc { f1: number; f2: number; posOld: number; posNew: number; triOld: number; triNew: number; arP: number; arC: number }
interface ArmOut { xyz: Float64Array; touched: Uint8Array; acc: Acc[]; strictShape: number }
const ndBeforeCache = new Float64Array(nTri).fill(NaN);
const ndBeforeRef = (f: number): number => {
  if (Number.isNaN(ndBeforeCache[f])) ndBeforeCache[f] = normDegOf(xyz0, f);
  return ndBeforeCache[f];
};
function runArm(list: EdgeRec[], guard: boolean, cap: number): ArmOut {
  const xyz = Float64Array.from(xyz0);
  const touched = new Uint8Array(nTri);
  const created = new Set<number>();
  const acc: Acc[] = [];
  let strictShape = 0;
  const P = (id: number, k: number): number => (k === 0 ? W.vx[id] : k === 1 ? W.vy[id] : W.vz[id]);
  for (let i = 0; i < list.length; i += 1) {
    if (cap > 0 && acc.length >= cap) break;
    const r = list[i];
    const f1 = r.f1; const f2 = r.f2;
    if (precondBad.has(f1) || precondBad.has(f2)) continue;
    if (touched[f1] === 1 || touched[f2] === 1) continue;
    const A1 = [W.id[f1 * 3], W.id[f1 * 3 + 1], W.id[f1 * 3 + 2]];
    const A2 = [W.id[f2 * 3], W.id[f2 * 3 + 1], W.id[f2 * 3 + 2]];
    const u = r.u; const v = r.v;
    if (!(A1.includes(u) && A1.includes(v) && A2.includes(u) && A2.includes(v))) continue;
    const c = A1.find((x) => x !== u && x !== v) as number;
    const dv = A2.find((x) => x !== u && x !== v) as number;
    if (c === undefined || dv === undefined || c === dv) continue;
    if (edgeMap.has(ekey(c, dv)) || created.has(ekey(c, dv))) continue;
    const t0th = VT[u];
    const pux = 0; const puy = W.vz[u];
    const pvx = dThRaw(t0th, VT[v]); const pvy = W.vz[v];
    const pcx = dThRaw(t0th, VT[c]); const pcy = W.vz[c];
    const pdx = dThRaw(t0th, VT[dv]); const pdy = W.vz[dv];
    const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
    const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
    if (!(s1 * s2 < 0 && s3 * s4 < 0)) continue;
    let f1IsUV = false;
    for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
    const cc = f1IsUV ? c : dv; const dd2 = f1IsUV ? dv : c;
    const n1 = [cc, u, dd2]; const n2 = [cc, dd2, v];
    const g1 = nrmOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const g2 = nrmOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const smx = FN[f1 * 3] + FN[f2 * 3]; const smy = FN[f1 * 3 + 1] + FN[f2 * 3 + 1]; const smz = FN[f1 * 3 + 2] + FN[f2 * 3 + 2];
    if (!(Math.hypot(smx, smy, smz) > 0) || !(g1[0] * smx + g1[1] * smy + g1[2] * smz > 0 && g2[0] * smx + g2[1] * smy + g2[2] * smz > 0)) continue;
    const arC1 = arOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const arC2 = arOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const arP1 = arOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const arP2 = arOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    if (!(arC1 <= Math.max(AR_CAP, arP1, arP2) && arC2 <= Math.max(AR_CAP, arP1, arP2))) continue;
    if (!(arC1 <= AR_CAP && arC2 <= AR_CAP)) strictShape += 1;
    if (guard) {
      const ndB = Math.max(ndBeforeRef(f1), ndBeforeRef(f2));
      const ndA = Math.max(
        normDegXYZ(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2)),
        normDegXYZ(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2)),
      );
      if (!(ndA < ndB - 1e-9)) continue;
    }
    const triOld = Math.max(
      triDev(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]),
      triDev(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]),
    );
    for (let k = 0; k < 3; k += 1) {
      xyz[f1 * 9 + k * 3] = W.vx[n1[k]]; xyz[f1 * 9 + k * 3 + 1] = W.vy[n1[k]]; xyz[f1 * 9 + k * 3 + 2] = W.vz[n1[k]];
      xyz[f2 * 9 + k * 3] = W.vx[n2[k]]; xyz[f2 * 9 + k * 3 + 1] = W.vy[n2[k]]; xyz[f2 * 9 + k * 3 + 2] = W.vz[n2[k]];
    }
    touched[f1] = 1; touched[f2] = 1;
    created.add(ekey(c, dv));
    const triNew = Math.max(
      triDev(xyz[f1 * 9], xyz[f1 * 9 + 1], xyz[f1 * 9 + 2], xyz[f1 * 9 + 3], xyz[f1 * 9 + 4], xyz[f1 * 9 + 5], xyz[f1 * 9 + 6], xyz[f1 * 9 + 7], xyz[f1 * 9 + 8]),
      triDev(xyz[f2 * 9], xyz[f2 * 9 + 1], xyz[f2 * 9 + 2], xyz[f2 * 9 + 3], xyz[f2 * 9 + 4], xyz[f2 * 9 + 5], xyz[f2 * 9 + 6], xyz[f2 * 9 + 7], xyz[f2 * 9 + 8]),
    );
    acc.push({ f1, f2, posOld: midDev(u, v), posNew: midDev(c, dv), triOld, triNew, arP: Math.max(arP1, arP2), arC: Math.max(arC1, arC2) });
  }
  return { xyz, touched, acc, strictShape };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// HARM CENSUS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Harm {
  name: string; flips: number; primaryX: number;
  invB: { n: number; a: number }; invA: { n: number; a: number }; invNew: { n: number; a: number }; invFixed: { n: number; a: number };
  slvB: { n: number; a: number }; slvA: { n: number; a: number }; slvNew: { n: number; a: number };
  degB: number; degA: number; degNew: number;
  bldB: { n: number; a: number }; bldA: { n: number; a: number }; bldNew: { n: number; a: number };
  creTouch: { n: number; a: number }; creRing: { n: number; a: number }; cleTouch: { n: number; a: number }; cleRing: { n: number; a: number };
  triPosMaxNew: number; triPosMaxDelta: number; triPosOver: number; midPosMaxDelta: number;
  minAltNewP50: number; minAltNewMin: number;
}
const harms: Harm[] = [];
function census(name: string, R: ArmOut): void {
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`ARM ${name}   flips ${R.acc.length}`);
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  const d1 = facetDihedrals(R.xyz, idxIdentity);
  const L1 = labelsOf(R.xyz, d1);
  let a0 = 0; let a1 = 0;
  for (let f = 0; f < nTri; f += 1) { a0 += d0.areaMm2[f]; a1 += d1.areaMm2[f]; }
  // PRIMARY reproduction of the tool under review
  let cB = 0; let aB = 0; let cA = 0; let aA = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (d0.perFacetMaxRad[f] > thrRef) { cB += 1; aB += d0.areaMm2[f]; }
    if (d1.perFacetMaxRad[f] > thrRef) { cA += 1; aA += d1.areaMm2[f]; }
  }
  const primaryX = aB / aA;
  log(`  SELF-CHECK vs the tool under review: over-${HI_DEG} AREA ${aB.toFixed(4)} -> ${aA.toFixed(4)} = ${primaryX.toFixed(5)}x  (count ${cB} -> ${cA})`);
  log(`  mesh AREA ${a0.toFixed(3)} -> ${a1.toFixed(3)} mm2  (delta ${(a1 - a0).toFixed(4)})`);
  log('');
  // ── H1 BACK-FACING ──
  const acc0 = { n: 0, a: 0 }; const acc1 = { n: 0, a: 0 }; const accNew = { n: 0, a: 0 }; const accFix = { n: 0, a: 0 };
  for (let f = 0; f < nTri; f += 1) {
    const b = isInvertedL(L0, f); const a = isInvertedL(L1, f);
    if (b) { acc0.n += 1; acc0.a += d0.areaMm2[f]; }
    if (a) { acc1.n += 1; acc1.a += d1.areaMm2[f]; }
    if (!b && a) { accNew.n += 1; accNew.a += d1.areaMm2[f]; }
    if (b && !a) { accFix.n += 1; accFix.a += d0.areaMm2[f]; }
  }
  log('  ── H1  BACK-FACING (rDot<0 beyond the f32 fold band) — WHOLE MESH, NEVER CENSUSED BY THE REPORT ──');
  log(`     BEFORE n=${acc0.n} area=${acc0.a.toFixed(4)} mm2 (${((acc0.a / a0) * 100).toFixed(4)}%)  ->  AFTER n=${acc1.n} area=${acc1.a.toFixed(4)} mm2 (${((acc1.a / a1) * 100).toFixed(4)}%)`);
  log(`     *** NEWLY back-facing: n=${accNew.n} area=${accNew.a.toFixed(4)} mm2 ***   |  repaired: n=${accFix.n} area=${accFix.a.toFixed(4)} mm2   NET ${(accNew.a - accFix.a >= 0 ? '+' : '')}${(accNew.a - accFix.a).toFixed(4)} mm2`);
  // ── H2 SLIVERS + DEGENERATES ──
  const s0 = { n: 0, a: 0 }; const s1 = { n: 0, a: 0 }; const sN = { n: 0, a: 0 };
  let dg0 = 0; let dg1 = 0; let dgN = 0;
  const newAlts: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    const b = isSliverL(L0, f); const a = isSliverL(L1, f);
    if (b) { s0.n += 1; s0.a += d0.areaMm2[f]; }
    if (a) { s1.n += 1; s1.a += d1.areaMm2[f]; }
    if (!b && a) { sN.n += 1; sN.a += d1.areaMm2[f]; }
    if (L0.degen[f] === 1) dg0 += 1;
    if (L1.degen[f] === 1) dg1 += 1;
    if (L0.degen[f] === 0 && L1.degen[f] === 1) dgN += 1;
    if (R.touched[f] === 1) newAlts.push(L1.minAlt[f]);
  }
  log('  ── H2  SLIVERS (aspect>=20) + DEGENERATES — WHOLE MESH, NEVER CENSUSED BY THE REPORT ──');
  log(`     BEFORE n=${s0.n} area=${s0.a.toFixed(4)} mm2  ->  AFTER n=${s1.n} area=${s1.a.toFixed(4)} mm2`);
  log(`     *** NEWLY sliver: n=${sN.n} area=${sN.a.toFixed(4)} mm2 ***`);
  log(`     DEGENERATE (zero area / non-finite AR) ${dg0} -> ${dg1}   NEW ${dgN}`);
  let altMin = Infinity;
  for (const x of newAlts) if (x < altMin) altMin = x;
  log(`     minAlt of the flipped children: p50 ${(q(newAlts, 0.5) * 1000).toExponential(3)} um  MIN ${(altMin * 1000).toExponential(3)} um`);
  log(`     [the tool's own note: a STRICT AR<=${AR_CAP} rule would have refused ${R.strictShape} of these ${R.acc.length} accepts]`);
  // ── H4 BLADES ──
  const b0 = { n: 0, a: 0 }; const b1 = { n: 0, a: 0 }; const bN = { n: 0, a: 0 };
  for (let f = 0; f < nTri; f += 1) {
    const b = d0.perFacetMaxRad[f] >= BLADE_RAD; const a = d1.perFacetMaxRad[f] >= BLADE_RAD;
    if (b) { b0.n += 1; b0.a += d0.areaMm2[f]; }
    if (a) { b1.n += 1; b1.a += d1.areaMm2[f]; }
    if (!b && a) { bN.n += 1; bN.a += d1.areaMm2[f]; }
  }
  log('  ── H4  BLADES (dihedral >= 175 deg) ──');
  log(`     BEFORE n=${b0.n} area=${b0.a.toFixed(4)}  ->  AFTER n=${b1.n} area=${b1.a.toFixed(4)}   *** NEWLY blade n=${bN.n} area=${bN.a.toFixed(4)} mm2 ***`);
  // ── H3 GROSS creation, split touched vs 1-ring-only ──
  const creT = { n: 0, a: 0 }; const creR = { n: 0, a: 0 }; const cleT = { n: 0, a: 0 }; const cleR = { n: 0, a: 0 };
  for (let f = 0; f < nTri; f += 1) {
    const b = d0.perFacetMaxRad[f] > thrRef; const a = d1.perFacetMaxRad[f] > thrRef;
    if (b === a) continue;
    const t = R.touched[f] === 1;
    if (!b && a) { if (t) { creT.n += 1; creT.a += d1.areaMm2[f]; } else { creR.n += 1; creR.a += d1.areaMm2[f]; } }
    else if (t) { cleT.n += 1; cleT.a += d0.areaMm2[f]; } else { cleR.n += 1; cleR.a += d0.areaMm2[f]; }
  }
  log('  ── H3  GROSS over-bar CREATION vs CLEARING, split TOUCHED / 1-RING-ONLY (report gives only the NET) ──');
  log(`     CREATED  touched n=${creT.n} area=${creT.a.toFixed(4)} mm2  |  1-RING-ONLY (pure collateral) n=${creR.n} area=${creR.a.toFixed(4)} mm2`);
  log(`     CLEARED  touched n=${cleT.n} area=${cleT.a.toFixed(4)} mm2  |  1-RING-ONLY n=${cleR.n} area=${cleR.a.toFixed(4)} mm2`);
  log(`     *** pure-collateral BALANCE (created - cleared, 1-ring only): ${(creR.a - cleR.a >= 0 ? '+' : '')}${(creR.a - cleR.a).toFixed(4)} mm2 ***`);
  // ── H5 POSITION over the whole triangle ──
  let tpN = 0; let tpD = 0; let mpD = 0; let over = 0;
  for (const a of R.acc) {
    if (a.triNew > tpN) tpN = a.triNew;
    if (a.triNew - a.triOld > tpD) tpD = a.triNew - a.triOld;
    if (a.posNew - a.posOld > mpD) mpD = a.posNew - a.posOld;
    if (a.triNew - a.triOld > 0.01) over += 1;
  }
  log('  ── H5  POSITION — the WHOLE new triangle (3 edge midpoints + centroid), not just the new diagonal ──');
  log(`     old-pair triDev p50 ${q(R.acc.map((x) => x.triOld), 0.5).toExponential(3)} MAX ${mx(R.acc.map((x) => x.triOld)).toExponential(3)} mm`);
  log(`     new-pair triDev p50 ${q(R.acc.map((x) => x.triNew), 0.5).toExponential(3)} MAX ${tpN.toExponential(3)} mm`);
  log(`     *** worst INCREASE ${tpD.toExponential(3)} mm (FLOOR-5 bar 0.01); accepts breaching 0.01 mm: ${over} of ${R.acc.length} (${((over / R.acc.length) * 100).toFixed(2)}%) ***`);
  log(`     the report's diagonal-midpoint-only figure for comparison: worst increase ${mpD.toExponential(3)} mm`);
  log('');
  harms.push({
    name, flips: R.acc.length, primaryX,
    invB: acc0, invA: acc1, invNew: accNew, invFixed: accFix,
    slvB: s0, slvA: s1, slvNew: sN, degB: dg0, degA: dg1, degNew: dgN,
    bldB: b0, bldA: b1, bldNew: bN,
    creTouch: creT, creRing: creR, cleTouch: cleT, cleRing: cleR,
    triPosMaxNew: tpN, triPosMaxDelta: tpD, triPosOver: over, midPosMaxDelta: mpD,
    minAltNewP50: q(newAlts, 0.5), minAltNewMin: altMin,
  });
}

const RA = runArm(cand, false, 0);
census('A  UNCONDITIONAL', RA);
const RB = runArm(cand, true, 0);
census('B  GUARDED', RB);
{
  const rnd = rng(SEED ^ 0x5bf03635);
  const perm = cand.slice();
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const RP = runArm(perm, false, RB.acc.length);
  census('P2 PLACEBO-INCLASS', RP);
}

log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('SELF-CHECK — my copy of the operator must reproduce the tool under review EXACTLY');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
const okA = RA.acc.length === 42050 && Math.abs(harms[0].primaryX - 0.99327) < 5e-5;
const okB = RB.acc.length === 20580 && Math.abs(harms[1].primaryX - 1.03393) < 5e-5;
log(`  arm A ${RA.acc.length} flips @ ${harms[0].primaryX.toFixed(5)}x  (expect 42050 @ 0.99327x)  ${okA ? 'REPRODUCES' : '*** DIFFERS — my copy is not the operator, harms below are not attributable ***'}`);
log(`  arm B ${RB.acc.length} flips @ ${harms[1].primaryX.toFixed(5)}x  (expect 20580 @ 1.03393x)  ${okB ? 'REPRODUCES' : '*** DIFFERS ***'}`);
log('');
log('══ HARM SUMMARY — count / area / max, per facet ══');
log('  ARM                  flips   NEW back-facing        NEW sliver           NEW blade         1-ring-only collateral   triDev worst up');
for (const h of harms) {
  log(`  ${h.name.padEnd(20)} ${String(h.flips).padStart(6)}   ${String(h.invNew.n).padStart(6)}/${h.invNew.a.toFixed(3).padStart(9)}mm2  ${String(h.slvNew.n).padStart(6)}/${h.slvNew.a.toFixed(3).padStart(9)}mm2  ${String(h.bldNew.n).padStart(6)}/${h.bldNew.a.toFixed(3).padStart(8)}mm2  ${(h.creRing.a - h.cleRing.a).toFixed(3).padStart(9)}mm2   ${h.triPosMaxDelta.toExponential(2)}mm`);
}
writeFileSync(`${OUTDIR}/REV_S115_FLIPHARM_${TAG}.json`, `${JSON.stringify({ stl: STL, style: STYLE, harms, reproduces: { armA: okA, armB: okB } }, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/REV_S115_FLIPHARM_${TAG}.json`);
log(`done ${el()}`);
void f2;
