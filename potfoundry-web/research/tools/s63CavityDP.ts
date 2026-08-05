// s63CavityDP.ts — IS THE GAP BETWEEN GREEDY FLIPS AND THE CEILING A *SEARCH* FAILURE?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST RUN (S60_FLIP_FINDINGS.md §6).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S60 measured, on Voronoi: the constrained greedy flip fixes 24.6% of the orientation failures, while the
// S61 local enumeration says 47-67% of them could be covered by SOME admissible triangle over the SAME
// vertices. Either the greedy neighbourhood is too small (a SEARCH failure, and a bigger neighbourhood
// should recover part of the gap) or the gap is an artefact of the ceiling ignoring global consistency
// (in which case a bigger neighbourhood buys ~nothing). This probe separates them.
//
// THE NEIGHBOURHOOD. An edge flip is the exact optimum over the 2 triangulations of a QUAD. The next
// neighbourhood up with no interior vertices is the HEXAGON formed by a facet and its three edge-neighbours:
//     T=(a,b,c); d,e,f = the opposite vertices of the neighbours across (a,b),(b,c),(c,a)
//     boundary cycle a -> d -> b -> e -> c -> f -> a
// It has Catalan(4) = 14 triangulations, and the MIN-MAX one is computed EXACTLY by the classic O(k^3)
// polygon-triangulation DP. So this is not a heuristic with more knobs — it is the exact optimum over a
// strictly larger neighbourhood, and a flip is the k=4 special case of the same DP.
//
// H-S63: applied to quiescence on top of the constrained-flip output, the cavity DP reduces the residual
//        tangExc>10um count by a further >= 10%.
// KILL:  < 10% further reduction => the lookahead-2 neighbourhood adds nothing, the greedy flip is already
//        at the practical limit of LOCAL connectivity search, and the remaining gap to the S61 ceiling is
//        NOT reachable by local moves. That verdict is as useful as the other one, and it is cheap.
//
// EVERY S60 CONSTRAINT IS CARRIED OVER, unchanged and evaluated on all four new facets:
//   C2 position sag <= max(10 um, old cavity max)   [the driver's own sagAdaptiveRaw]
//   C3 jitterUm <= max(1 um, old cavity max)        [the derived f32 determinacy floor]
//   C4 no duplicate edge, no (theta,z) fold (enforced by requiring every DP diagonal to lie INSIDE the
//      hexagon), orientation-correct emission, boundary/non-manifold/winding counts unchanged.
//
// READ-ONLY over a finished STL. Usage: bash research/tools/run-s63-cavity-dp.sh <TAG>
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { writeBinarySTL } from '../bridge/labkit';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');
const STYLE = process.env.PF_S63_STYLE ?? 'Voronoi';
const PATH = process.env.PF_S63_PATH ?? 'research/exchange/_strataConformBisect/s60flip/voronoi_ring_D--_A2CON.stl';
const TAG = process.env.PF_S63_TAG ?? 'DP';
const ROUNDS = Math.round(envF('PF_S63_ROUNDS', 12));
const BAR = envF('PF_S63_BAR_UM', 10);
const JBAR = envF('PF_S63_JBAR_UM', 1);
const USE_POS = envB('PF_S63_POS', true);
const POS_STRIDE = Math.max(1, Math.round(envF('PF_S63_POS_STRIDE', 1)));
const DIMS: StyleDims = { H: envF('PF_S63_H', 120), Rb: envF('PF_S63_RB', 40), Rt: envF('PF_S63_RT', 50), expn: envF('PF_S63_EXPN', 1) };
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
const pq = (a: Float64Array | number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
mkdirSync(OUTDIR, { recursive: true });
const ck = (o: Record<string, unknown>): void => { appendFileSync(`${OUTDIR}/${TAG}.dp.ndjson`, `${JSON.stringify({ t: el(), ...o })}\n`); };

log('===== S63 — CAVITY DP: the EXACT min-max retriangulation of a 4-facet hexagonal cavity =====');
log(`style ${STYLE}   mesh ${PATH}   bar ${BAR} um   C2 pos ${USE_POS}   C3 jitter <= max(${JBAR}um, old)`);

// ── read + weld
const { xyz, nTri } = readMeshFloat64(PATH, false);
const SCRATCH = 4;
const VXa = new Float64Array(nTri * 3); const VYa = new Float64Array(nTri * 3); const VZa = new Float64Array(nTri * 3);
const ta = new Int32Array(nTri + SCRATCH); const tb = new Int32Array(nTri + SCRATCH); const tc = new Int32Array(nTri + SCRATCH);
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

// ── rulers, transcribed identically to s60ConstrainedFlip.ts
function sidesOf(a: number, b: number, c: number): [number, number, number] {
  return [
    Math.hypot(VXa[b] - VXa[c], VYa[b] - VYa[c], VZa[b] - VZa[c]),
    Math.hypot(VXa[a] - VXa[c], VYa[a] - VYa[c], VZa[a] - VZa[c]),
    Math.hypot(VXa[a] - VXa[b], VYa[a] - VYa[b], VZa[a] - VZa[b]),
  ];
}
function maxAngOf(a: number, b: number, c: number): number {
  const [la, lb, lc] = sidesOf(a, b, c);
  const g = (p1: number, p2: number, p3: number): number => {
    const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
    return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
  };
  return Math.max(g(la, lb, lc), g(lb, lc, la), g(lc, la, lb));
}
function ulpF32(R: number): number { const a = Math.abs(R); if (!(a > 0)) return 2 ** -149; return 2 ** (Math.floor(Math.log2(a)) - 23); }
function jitterUmOf(a: number, b: number, c: number): number {
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const ux = VXa[b] - ax; const uy = VYa[b] - ay; const uz = VZa[b] - az;
  const wx = VXa[c] - ax; const wy = VYa[c] - ay; const wz = VZa[c] - az;
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  const cr = Math.hypot(cx, cy, cz);
  const [la, lb, lc] = sidesOf(a, b, c);
  const diam = Math.max(la, lb, lc);
  const R = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az), Math.abs(VXa[b]), Math.abs(VYa[b]), Math.abs(VZa[b]), Math.abs(VXa[c]), Math.abs(VYa[c]), Math.abs(VZa[c]));
  if (cr <= 0) return Infinity;
  return (1.5 * ulpF32(R) * diam / (cr / Math.max(1e-300, diam))) * 1000;
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
  const [la, lb, lc] = sidesOf(a, b, c);
  return Math.sin(Math.acos(dot)) * Math.max(la, lb, lc) * 1000;
}
const posC = new Float64Array(nTri).fill(-1);
const posOf = (t: number): number => {
  const v = posC[t]; if (v >= 0) return v;
  const w = sagAdaptiveRaw(rA, MESH, t, 0.03, 12, 64, ARG) * 1000; posC[t] = w; return w;
};
function posOfCand(slot: number, a: number, b: number, c: number): number {
  const s = nTri + slot; ta[s] = a; tb[s] = b; tc[s] = c;
  return sagAdaptiveRaw(rA, MESH, s, 0.03, 12, 64, ARG) * 1000;
}

// ── census (both rulers, always)
interface Census { tangP99: number; tangMax: number; tangOver: number; posP99: number; posMax: number; posOver: number; maMax: number; cap150: number; jitOver1: number; jitOver10: number; }
function census(label: string): Census {
  const tang = new Float64Array(nTri); let tangOver = 0; let cap150 = 0; let jitOver1 = 0; let jitOver10 = 0; let maMax = 0;
  for (let t = 0; t < nTri; t += 1) {
    const g = tangExcOf(ta[t], tb[t], tc[t]); tang[t] = g;
    if (g > BAR) tangOver += 1;
    const m = maxAngOf(ta[t], tb[t], tc[t]); if (m >= 150) cap150 += 1; if (m > maMax) maMax = m;
    const j = jitterUmOf(ta[t], tb[t], tc[t]); if (j > 1) jitOver1 += 1; if (j > 10) jitOver10 += 1;
  }
  const pos: number[] = []; let posOver = 0; let posMax = 0;
  for (let t = 0; t < nTri; t += POS_STRIDE) { const p = posOf(t); pos.push(p); if (p > BAR) posOver += 1; if (p > posMax) posMax = p; }
  pos.sort((x, y) => x - y);
  const ts = Float64Array.from(tang).sort();
  const out: Census = { tangP99: pq(ts, 0.99), tangMax: ts[nTri - 1], tangOver, posP99: pq(pos, 0.99), posMax, posOver, maMax, cap150, jitOver1, jitOver10 };
  log('');
  log(`── ${label} ──`);
  log(`   ORIENT tangExc p99 ${out.tangP99.toFixed(2)}  max ${out.tangMax.toFixed(1)} um   over-${BAR}um ${tangOver} (${((100 * tangOver) / nTri).toFixed(3)}%)`);
  log(`   POSITION  sag  p99 ${out.posP99.toFixed(2)}  max ${posMax.toFixed(1)} um   over-${BAR}um ${posOver}`);
  log(`   SHAPE maxAngle max ${maMax.toFixed(3)}  caps>=150 ${cap150}   DETERM jitter>1um ${jitOver1}  >10um ${jitOver10}`);
  ck({ census: label, ...out });
  return out;
}

// ── topology
const KEY = NV + 1;
function buildEdges(): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const v = v3[(e + 1) % 3];
      const k = u < v ? u * KEY + v : v * KEY + u;
      const l = m.get(k); if (l === undefined) m.set(k, [t]); else l.push(t);
    }
  }
  return m;
}
function topo(label: string, em: Map<number, number[]>): { edges: number; bnd: number; nm: number; orientBad: number } {
  let bnd = 0; let nm = 0; let orientBad = 0;
  for (const [k, l] of em) {
    if (l.length === 1) { bnd += 1; continue; }
    if (l.length > 2) { nm += 1; continue; }
    const u = Math.floor(k / KEY); const v = k - u * KEY;
    const dir = [0, 0];
    for (let i = 0; i < 2; i += 1) {
      const v3 = [ta[l[i]], tb[l[i]], tc[l[i]]];
      for (let e = 0; e < 3; e += 1) { if (v3[e] === u && v3[(e + 1) % 3] === v) dir[i] = 1; else if (v3[e] === v && v3[(e + 1) % 3] === u) dir[i] = -1; }
    }
    if (dir[0] !== 0 && dir[0] === dir[1]) orientBad += 1;
  }
  log(`   TOPO ${label}: ${em.size} edges, boundary ${bnd}, non-manifold ${nm}, orientation-inconsistent ${orientBad}`);
  return { edges: em.size, bnd, nm, orientBad };
}

const before = census('BEFORE (control, measured in THIS process)');
const topoBefore = topo('before', buildEdges());

// ── the DP over one hexagonal cavity
const PX = new Float64Array(6); const PY = new Float64Array(6); const PV = new Int32Array(6);
const dpBest = new Float64Array(36); const dpArg = new Int32Array(36);
const triCost = new Float64Array(216);
const okDiag = new Uint8Array(36);
const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
/** does segment p0p1 properly intersect segment q0q1? */
function segInt(i0: number, i1: number, j0: number, j1: number): boolean {
  const d1 = cross(PX[i0], PY[i0], PX[i1], PY[i1], PX[j0], PY[j0]);
  const d2 = cross(PX[i0], PY[i0], PX[i1], PY[i1], PX[j1], PY[j1]);
  const d3 = cross(PX[j0], PY[j0], PX[j1], PY[j1], PX[i0], PY[i0]);
  const d4 = cross(PX[j0], PY[j0], PX[j1], PY[j1], PX[i1], PY[i1]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** is the midpoint of diagonal (i,j) inside the hexagon? ray-crossing in (theta,z). */
function midInside(i: number, j: number): boolean {
  const mx = (PX[i] + PX[j]) / 2; const my = (PY[i] + PY[j]) / 2;
  let inside = false;
  for (let k = 0, l = 5; k < 6; l = k, k += 1) {
    if ((PY[k] > my) !== (PY[l] > my)) {
      const xI = PX[k] + ((my - PY[k]) * (PX[l] - PX[k])) / (PY[l] - PY[k]);
      if (mx < xI) inside = !inside;
    }
  }
  return inside;
}

let nCav = 0; let nSimple = 0; let nImproved = 0; let nApplied = 0;
const rej = { dirty: 0, notSimple: 0, degen: 0, noImprove: 0, det: 0, pos: 0, dup: 0 };
log('');
log('CAVITY DP ROUNDS (independent set per round; the exact min-max triangulation of each 4-facet hexagon)');
for (let round = 0; round < ROUNDS; round += 1) {
  const rS = Date.now();
  const em = buildEdges();
  const dirty = new Uint8Array(nTri);
  const created = new Set<number>();
  let applied = 0;
  const r0 = { dirty: 0, notSimple: 0, degen: 0, noImprove: 0, det: 0, pos: 0, dup: 0 };
  for (let t = 0; t < nTri; t += 1) {
    if (dirty[t] === 1) { r0.dirty += 1; continue; }
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    // the three neighbours, in the order (across ab), (across bc), (across ca)
    const nb: number[] = []; const opp: number[] = [];
    let bad = false;
    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const l = em.get(u < v ? u * KEY + v : v * KEY + u);
      if (l === undefined || l.length !== 2) { bad = true; break; }
      const o = l[0] === t ? l[1] : l[0];
      if (o === t || dirty[o] === 1) { bad = true; break; }
      const A = [ta[o], tb[o], tc[o]];
      const w = A[0] !== u && A[0] !== v ? A[0] : A[1] !== u && A[1] !== v ? A[1] : A[2];
      nb.push(o); opp.push(w);
    }
    if (bad) { r0.dirty += 1; continue; }
    if (nb[0] === nb[1] || nb[1] === nb[2] || nb[0] === nb[2]) { r0.notSimple += 1; continue; }
    const d = opp[0]; const e = opp[1]; const f = opp[2];
    const six = [a, d, b, e, c, f];
    let dup6 = false;
    for (let i = 0; i < 6; i += 1) for (let j = i + 1; j < 6; j += 1) if (six[i] === six[j]) dup6 = true;
    if (dup6) { r0.notSimple += 1; continue; }
    nCav += 1;
    // (theta,z) coords unwrapped about a
    const th0 = VT[a];
    for (let i = 0; i < 6; i += 1) { PV[i] = six[i]; PX[i] = dThRaw(th0, VT[six[i]]); PY[i] = VZa[six[i]]; }
    // SIMPLICITY: the four original triangles must all carry the same (theta,z) orientation sign, and the
    // hexagon's boundary must be a simple closed polygon. Checking the boundary directly is cheapest.
    let sgn = 0; let simple = true;
    for (let i = 0; i < 6; i += 1) {
      const j = (i + 1) % 6;
      for (let k = i + 2; k < 6; k += 1) {
        const l = (k + 1) % 6;
        if (l === i) continue;
        if (segInt(i, j, k, l)) { simple = false; break; }
      }
      if (!simple) break;
    }
    if (simple) {
      let area = 0;
      for (let i = 0; i < 6; i += 1) { const j = (i + 1) % 6; area += PX[i] * PY[j] - PX[j] * PY[i]; }
      sgn = area > 0 ? 1 : -1;
      if (area === 0) simple = false;
    }
    if (!simple) { r0.notSimple += 1; continue; }
    nSimple += 1;
    // valid diagonals: inside the polygon and not crossing the boundary
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) okDiag[i * 6 + j] = 0;
    for (let i = 0; i < 6; i += 1) for (let j = i + 1; j < 6; j += 1) {
      if (j === i + 1 || (i === 0 && j === 5)) { okDiag[i * 6 + j] = 1; continue; }   // boundary edge
      let ok = true;
      for (let k = 0; k < 6 && ok; k += 1) {
        const l = (k + 1) % 6;
        if (k === i || k === j || l === i || l === j) continue;
        if (segInt(i, j, k, l)) ok = false;
      }
      if (ok && !midInside(i, j)) ok = false;
      okDiag[i * 6 + j] = ok ? 1 : 0;
    }
    // triangle costs: tangExc, or Infinity if wrongly oriented / not f32-determined
    let oldMax = 0; let oldJit = 0; let oldPos = 0;
    for (const q of [t, nb[0], nb[1], nb[2]]) {
      const g = tangExcOf(ta[q], tb[q], tc[q]); if (g > oldMax) oldMax = g;
      const j2 = jitterUmOf(ta[q], tb[q], tc[q]); if (j2 > oldJit) oldJit = j2;
    }
    const jAllow = Math.max(JBAR, oldJit);
    for (let i = 0; i < 6; i += 1) for (let k = i + 1; k < 6; k += 1) for (let j = k + 1; j < 6; j += 1) {
      const idx = (i * 6 + k) * 6 + j;
      if (okDiag[i * 6 + k] === 0 || okDiag[k * 6 + j] === 0 || okDiag[i * 6 + j] === 0) { triCost[idx] = Infinity; continue; }
      const ar = cross(PX[i], PY[i], PX[k], PY[k], PX[j], PY[j]);
      if (ar * sgn <= 0) { triCost[idx] = Infinity; continue; }
      if (jitterUmOf(PV[i], PV[k], PV[j]) > jAllow) { triCost[idx] = Infinity; continue; }
      triCost[idx] = tangExcOf(PV[i], PV[k], PV[j]);
    }
    // DP: dp[i][j] = min over k of max(dp[i][k], dp[k][j], cost(i,k,j))
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) { dpBest[i * 6 + j] = j <= i + 1 ? 0 : Infinity; dpArg[i * 6 + j] = -1; }
    for (let len = 2; len <= 5; len += 1) {
      for (let i = 0; i + len < 6; i += 1) {
        const j = i + len; let best = Infinity; let arg = -1;
        for (let k = i + 1; k < j; k += 1) {
          const cst = triCost[(i * 6 + k) * 6 + j];
          if (!Number.isFinite(cst)) continue;
          const l = dpBest[i * 6 + k]; const r = dpBest[k * 6 + j];
          if (!Number.isFinite(l) || !Number.isFinite(r)) continue;
          const m = Math.max(l, r, cst);
          if (m < best) { best = m; arg = k; }
        }
        dpBest[i * 6 + j] = best; dpArg[i * 6 + j] = arg;
      }
    }
    const bestMax = dpBest[5];
    if (!(bestMax < oldMax - 1e-9)) { r0.noImprove += 1; continue; }
    nImproved += 1;
    // materialise the winning triangulation
    const outTri: Array<[number, number, number]> = [];
    const rec = (i: number, j: number): void => {
      if (j <= i + 1) return;
      const k = dpArg[i * 6 + j];
      if (k < 0) return;
      outTri.push([PV[i], PV[k], PV[j]]);
      rec(i, k); rec(k, j);
    };
    rec(0, 5);
    if (outTri.length !== 4) { r0.degen += 1; continue; }
    // C4 duplicate-edge: any NEW internal diagonal must not already exist outside the cavity
    const oldInternal = new Set<number>();
    for (const q of [t, nb[0], nb[1], nb[2]]) {
      const v3 = [ta[q], tb[q], tc[q]];
      for (let x = 0; x < 3; x += 1) { const u = v3[x]; const v = v3[(x + 1) % 3]; oldInternal.add(u < v ? u * KEY + v : v * KEY + u); }
    }
    let dupBad = false;
    for (const [x, y, z] of outTri) {
      for (const [u, v] of [[x, y], [y, z], [z, x]] as Array<[number, number]>) {
        const k2 = u < v ? u * KEY + v : v * KEY + u;
        if (!oldInternal.has(k2) && (em.has(k2) || created.has(k2))) { dupBad = true; break; }
      }
      if (dupBad) break;
    }
    if (dupBad) { r0.dup += 1; continue; }
    // C2 position on all four new facets
    if (USE_POS) {
      for (const q of [t, nb[0], nb[1], nb[2]]) { const p = posOf(q); if (p > oldPos) oldPos = p; }
      const allow = Math.max(BAR, oldPos);
      let ok = true;
      const newPos: number[] = [];
      for (let i = 0; i < 4 && ok; i += 1) { const p = posOfCand(i, outTri[i][0], outTri[i][1], outTri[i][2]); newPos.push(p); if (p > allow) ok = false; }
      if (!ok) { r0.pos += 1; continue; }
      const slots = [t, nb[0], nb[1], nb[2]];
      for (let i = 0; i < 4; i += 1) posC[slots[i]] = newPos[i];
    } else { for (const q of [t, nb[0], nb[1], nb[2]]) posC[q] = -1; }
    // APPLY
    const slots = [t, nb[0], nb[1], nb[2]];
    for (let i = 0; i < 4; i += 1) { ta[slots[i]] = outTri[i][0]; tb[slots[i]] = outTri[i][1]; tc[slots[i]] = outTri[i][2]; dirty[slots[i]] = 1; }
    for (const [x, y, z] of outTri) for (const [u, v] of [[x, y], [y, z], [z, x]] as Array<[number, number]>) created.add(u < v ? u * KEY + v : v * KEY + u);
    applied += 1; nApplied += 1;
  }
  for (const k of Object.keys(rej) as Array<keyof typeof rej>) rej[k] += r0[k];
  log(`  round ${String(round + 1).padStart(2)}: ${String(applied).padStart(7)} cavities retriangulated   rej: notSimple ${r0.notSimple} noImp ${r0.noImprove} dup ${r0.dup} POS ${r0.pos} degen ${r0.degen}   [${((Date.now() - rS) / 1000).toFixed(1)}s]`);
  ck({ round: round + 1, applied, rej: { ...r0 } });
  if (applied === 0) break;
}
log('');
log(`cavities examined ${nCav}, simple hexagons ${nSimple}, DP found a strict improvement in ${nImproved}, APPLIED ${nApplied}`);
log(`CLAUSE REJECTIONS: notSimple ${rej.notSimple}  noImprove ${rej.noImprove}  dup-edge ${rej.dup}  C2 POS ${rej.pos}  degenerate ${rej.degen}`);

const after = census('AFTER');
const topoAfter = topo('after', buildEdges());
log('');
log('DELTA (both rulers, always)');
log(`   ORIENT over-${BAR}um  ${before.tangOver} -> ${after.tangOver}   (${(before.tangOver / Math.max(1, after.tangOver)).toFixed(3)}x, ${(((before.tangOver - after.tangOver) * 100) / Math.max(1, before.tangOver)).toFixed(2)}% further reduction)`);
log(`   POSITION over-${BAR}um ${before.posOver} -> ${after.posOver}   p99 ${before.posP99.toFixed(2)} -> ${after.posP99.toFixed(2)}  max ${before.posMax.toFixed(1)} -> ${after.posMax.toFixed(1)}`);
log(`   SHAPE caps>=150 ${before.cap150} -> ${after.cap150}   maxAngle max ${before.maMax.toFixed(3)} -> ${after.maMax.toFixed(3)}`);
log(`   DETERM jitter>1um ${before.jitOver1} -> ${after.jitOver1}   >10um ${before.jitOver10} -> ${after.jitOver10}`);
const drop = (before.tangOver - after.tangOver) / Math.max(1, before.tangOver);
log('');
log(`PRE-REGISTERED KILL-CRITERION  H-S63: >= 10% further reduction`);
log(`   ${(100 * drop).toFixed(2)}% -> ${drop >= 0.10 ? 'PASS — the lookahead-2 neighbourhood recovers real headroom (SEARCH failure)' : '*** FAIL — a strictly larger EXACT neighbourhood adds nothing; greedy flips are already at the practical limit of LOCAL connectivity search ***'}`);
const topoOk = topoAfter.bnd === topoBefore.bnd && topoAfter.nm === topoBefore.nm && topoAfter.orientBad === topoBefore.orientBad && topoAfter.edges === topoBefore.edges;
log(`   C4 topology preserved: ${topoOk ? 'PASS' : '*** FAIL ***'}`);
writeFileSync(`${OUTDIR}/${TAG}.dp.summary.json`, JSON.stringify({ style: STYLE, mesh: PATH, tag: TAG, nTri, NV, nCav, nSimple, nImproved, nApplied, rej, before, after, topoBefore, topoAfter, drop, topoOk }, null, 2));
if (envB('PF_S63_WRITE', true) && nApplied > 0) {
  const P = new Float32Array(nTri * 9); const I = new Uint32Array(nTri * 3);
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) { const v = v3[e]; P[9 * t + 3 * e] = VXa[v]; P[9 * t + 3 * e + 1] = VYa[v]; P[9 * t + 3 * e + 2] = VZa[v]; I[3 * t + e] = 3 * t + e; }
  }
  writeBinarySTL(`${OUTDIR}/${TAG}_dp.stl`, P, I);
  log(`   mesh written to ${OUTDIR}/${TAG}_dp.stl`);
}
log('');
log(`done  [${el()}]`);
