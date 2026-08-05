// s65SplitAndFlip.ts — PRICE THE RECOMMENDATION. If connectivity is finished, what do NEW VERTICES cost?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST RUN (S60_FLIP_FINDINGS.md §11).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S60/S61/S63 established, on Voronoi: the constrained flip fixes 24.6% of the orientation failures; a
// strictly larger EXACT neighbourhood (the hexagon DP) adds 3.29%; and 47-67% of the failures could be
// covered by some triangle over the existing vertices, but not by any local move. Every remaining lever
// therefore needs NEW VERTICES. S61 priced that at a 1.6x error overshoot (best achievable tangExc p50
// 16.3 um against a 10 um bar), which under tang ~ diam^alpha means h x 0.78 (alpha=1) or x 0.88 (alpha=2)
// LOCALLY. That is a PREDICTION, and this probe is the falsification of it.
//
// THE MOVE, deliberately the dumbest one that could work: bisect the LONGEST EDGE of every facet over the
// orientation bar, put the new vertex ON THE ANALYTIC SURFACE (r = rA(theta,z) at the edge midpoint's
// parameter, which is what the mesher itself does), and keep the mesh conforming by splitting BOTH incident
// facets. No sizing field, no feature detection, no LEPP recursion — if the cheapest possible targeted
// refinement already closes it, nothing cleverer is needed to make the decision.
//
// H-S65: one round of targeted longest-edge bisection on the over-bar facets, followed by the S60
//        constrained flip, reduces Voronoi's over-bar count by >= 2x for <= 1.6x triangles.
// KILL:  < 2x reduction, OR > 1.6x triangles => the "targeted local density" recommendation is NOT
//        supported at that price and must be re-priced before anyone builds it into the mesher.
//
// The two rulers are reported for the split mesh BEFORE and AFTER, as always. Note the new vertices land
// exactly on the surface, so POSITION cannot get worse by construction — but it is measured anyway, because
// "cannot by construction" is how this campaign has been wrong before.
//
// READ-ONLY over a finished STL; writes a NEW STL. Usage: bash research/tools/run-s65-split.sh <TAG>
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { writeBinarySTL } from '../bridge/labkit';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S65_STYLE ?? 'Voronoi';
const PATH = process.env.PF_S65_PATH ?? 'research/exchange/_strataConformBisect/s60flip/voronoi_ring_D--_A2CON.stl';
const TAG = process.env.PF_S65_TAG ?? 'SPLIT';
const BAR = envF('PF_S65_BAR_UM', 10);
const ROUNDS = Math.round(envF('PF_S65_ROUNDS', 4));
const PASSES = Math.round(envF('PF_S65_PASSES', 1));     // how many times to re-mark and re-split
const POS_STRIDE = Math.max(1, Math.round(envF('PF_S65_POS_STRIDE', 1)));
const DIMS: StyleDims = { H: envF('PF_S65_H', 120), Rb: envF('PF_S65_RB', 40), Rt: envF('PF_S65_RT', 50), expn: envF('PF_S65_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s60flip';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
mkdirSync(OUTDIR, { recursive: true });

log('===== S65 — TARGETED LONGEST-EDGE BISECTION ON THE OVER-BAR FACETS (new vertices ON the surface) =====');
log(`style ${STYLE}   mesh ${PATH}   bar ${BAR} um   passes ${PASSES}`);

// ── read + weld into GROWABLE arrays
const { xyz, nTri: nTri0 } = readMeshFloat64(PATH, false);
const CAP_T = nTri0 * 4 + 16;                 // one bisection pass at most doubles; 4x is ample headroom
const CAP_V = nTri0 * 3 + 16;
const VXa = new Float64Array(CAP_V); const VYa = new Float64Array(CAP_V); const VZa = new Float64Array(CAP_V);
const VT = new Float64Array(CAP_V);
const ta = new Int32Array(CAP_T); const tb = new Int32Array(CAP_T); const tc = new Int32Array(CAP_T);
let NV = 0; let nTri = nTri0;
{
  const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
  const map = new Map<number, number[]>(); const corner = new Int32Array(3);
  for (let t = 0; t < nTri0; t += 1) {
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
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VYa[v], VXa[v]);
log(`${nTri0} facets, ${NV} welded vertices  [${el()}]`);
const MESH: SagMesh = { ta, tb, tc, vth: VT, vz: VZa, vx: VXa, vy: VYa };
const ARG = makeSagArgmax();

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
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
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
function census(label: string): { over: number; p99: number; max: number; posOver: number; posP99: number; posMax: number } {
  const tg: number[] = []; let over = 0; let mx = 0;
  for (let t = 0; t < nTri; t += 1) { const g = tangExcOf(ta[t], tb[t], tc[t]); tg.push(g); if (g > BAR) over += 1; if (g > mx) mx = g; }
  tg.sort((a, b) => a - b);
  const pos: number[] = []; let posOver = 0; let posMax = 0;
  for (let t = 0; t < nTri; t += POS_STRIDE) {
    const p = sagAdaptiveRaw(rA, MESH, t, 0.03, 12, 64, ARG) * 1000;
    pos.push(p); if (p > BAR) posOver += 1; if (p > posMax) posMax = p;
  }
  pos.sort((a, b) => a - b);
  log(`── ${label} ──  facets ${nTri}   vertices ${NV}`);
  log(`   ORIENT tangExc p99 ${pq(tg, 0.99).toFixed(2)}  max ${mx.toFixed(1)} um   over-${BAR}um ${over} (${((100 * over) / nTri).toFixed(3)}%)`);
  log(`   POSITION  sag  p99 ${pq(pos, 0.99).toFixed(2)}  max ${posMax.toFixed(1)} um   over-${BAR}um ${posOver}`);
  return { over, p99: pq(tg, 0.99), max: mx, posOver, posP99: pq(pos, 0.99), posMax };
}

const before = census('BEFORE (control, measured in THIS process)');
const KEY0 = CAP_V + 1;
function buildEdges(): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const v = v3[(e + 1) % 3];
      const k = u < v ? u * KEY0 + v : v * KEY0 + u;
      const l = m.get(k); if (l === undefined) m.set(k, [t]); else l.push(t);
    }
  }
  return m;
}
function topo(label: string): void {
  const em = buildEdges();
  let bnd = 0; let nm = 0; let orientBad = 0;
  for (const [k, l] of em) {
    if (l.length === 1) { bnd += 1; continue; }
    if (l.length > 2) { nm += 1; continue; }
    const u = Math.floor(k / KEY0); const v = k - u * KEY0;
    const dir = [0, 0];
    for (let i = 0; i < 2; i += 1) {
      const v3 = [ta[l[i]], tb[l[i]], tc[l[i]]];
      for (let e = 0; e < 3; e += 1) { if (v3[e] === u && v3[(e + 1) % 3] === v) dir[i] = 1; else if (v3[e] === v && v3[(e + 1) % 3] === u) dir[i] = -1; }
    }
    if (dir[0] !== 0 && dir[0] === dir[1]) orientBad += 1;
  }
  log(`   TOPO ${label}: ${em.size} edges, boundary ${bnd}, non-manifold ${nm}, orientation-inconsistent ${orientBad}`);
}
topo('before');

// ── the split: independent-set rounds of 1-to-2 edge bisection on BOTH incident facets
let totalSplits = 0;
for (let pass = 0; pass < PASSES; pass += 1) {
  for (let round = 0; round < ROUNDS; round += 1) {
    const em = buildEdges();
    const dirty = new Uint8Array(nTri);
    // mark: the LONGEST edge of every facet over the bar
    const want = new Set<number>();
    for (let t = 0; t < nTri; t += 1) {
      if (tangExcOf(ta[t], tb[t], tc[t]) <= BAR) continue;
      const v3 = [ta[t], tb[t], tc[t]];
      let bl = -1; let bk = -1;
      for (let e = 0; e < 3; e += 1) {
        const u = v3[e]; const v = v3[(e + 1) % 3];
        const L = Math.hypot(VXa[u] - VXa[v], VYa[u] - VYa[v], VZa[u] - VZa[v]);
        if (L > bl) { bl = L; bk = u < v ? u * KEY0 + v : v * KEY0 + u; }
      }
      if (bk >= 0) want.add(bk);
    }
    let splits = 0;
    for (const k of want) {
      const l = em.get(k);
      if (l === undefined || l.length !== 2) continue;          // boundary/non-manifold: skip
      const t1 = l[0]; const t2 = l[1];
      if (dirty[t1] === 1 || dirty[t2] === 1) continue;
      const u = Math.floor(k / KEY0); const v = k - u * KEY0;
      const A1 = [ta[t1], tb[t1], tc[t1]]; const A2 = [ta[t2], tb[t2], tc[t2]];
      const c = A1[0] !== u && A1[0] !== v ? A1[0] : A1[1] !== u && A1[1] !== v ? A1[1] : A1[2];
      const d = A2[0] !== u && A2[0] !== v ? A2[0] : A2[1] !== u && A2[1] !== v ? A2[1] : A2[2];
      if (c === d) continue;
      if (nTri + 2 > CAP_T || NV + 1 > CAP_V) break;
      // the new vertex: midpoint in (theta,z), lifted ONTO the analytic surface (what the mesher does)
      const thU = VT[u]; const thM = thU + dThRaw(thU, VT[v]) / 2;
      const zM = (VZa[u] + VZa[v]) / 2;
      const rM = rA(thM, Math.min(H, Math.max(0, zM)));
      const m = NV; NV += 1;
      VXa[m] = rM * Math.cos(thM); VYa[m] = rM * Math.sin(thM); VZa[m] = zM; VT[m] = Math.atan2(VYa[m], VXa[m]);
      // orientation-correct 1-to-2 on each side. f1 traverses u->v (or swap roles).
      let f1IsUV = false;
      for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
      const P = f1IsUV ? t1 : t2; const Q = f1IsUV ? t2 : t1;
      const cP = f1IsUV ? c : d; const cQ = f1IsUV ? d : c;
      // P was (u,v,cP) traversing u->v  ->  (u,m,cP) + (m,v,cP)
      ta[P] = u; tb[P] = m; tc[P] = cP;
      ta[nTri] = m; tb[nTri] = v; tc[nTri] = cP; nTri += 1;
      // Q was (v,u,cQ) traversing v->u  ->  (v,m,cQ) + (m,u,cQ)
      ta[Q] = v; tb[Q] = m; tc[Q] = cQ;
      ta[nTri] = m; tb[nTri] = u; tc[nTri] = cQ; nTri += 1;
      dirty[t1] = 1; dirty[t2] = 1;
      splits += 1; totalSplits += 1;
    }
    log(`  pass ${pass + 1} round ${round + 1}: marked ${want.size} edges, split ${splits}   facets now ${nTri}   [${el()}]`);
    if (splits === 0) break;
  }
}
log('');
log(`TOTAL splits ${totalSplits};  facets ${nTri0} -> ${nTri} (${(nTri / nTri0).toFixed(3)}x);  vertices ${NV}`);
const after = census('AFTER SPLIT (no flips yet)');
topo('after');
log('');
log(`DELTA (split only)  ORIENT over-${BAR}um ${before.over} -> ${after.over} (${(before.over / Math.max(1, after.over)).toFixed(3)}x)   POSITION over-bar ${before.posOver} -> ${after.posOver}`);
writeFileSync(`${OUTDIR}/${TAG}.split.summary.json`, JSON.stringify({ style: STYLE, mesh: PATH, tag: TAG, nTri0, nTri, NV, totalSplits, before, after, triRatio: nTri / nTri0 }, null, 2));
{
  const P = new Float32Array(nTri * 9); const I = new Uint32Array(nTri * 3);
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) { const v = v3[e]; P[9 * t + 3 * e] = VXa[v]; P[9 * t + 3 * e + 1] = VYa[v]; P[9 * t + 3 * e + 2] = VZa[v]; I[3 * t + e] = 3 * t + e; }
  }
  writeBinarySTL(`${OUTDIR}/${TAG}_split.stl`, P, I);
  log(`   split mesh written to ${OUTDIR}/${TAG}_split.stl  — now run the S60 constrained flip on it`);
}
log(`done  [${el()}]`);
