// s103Split1to4.ts — DOES A DIFFERENT SPLIT TOPOLOGY ESCAPE THE CEILING? (the brief's "1-to-4" question)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, WRITTEN BEFORE THE FIRST RUN (S82_SPLIT_FINDINGS.md §3).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S101 established the CEILING:  theta_par - max_i theta_child_i  <=  max_i rho_i.
//
// A CORRECTION TO MY OWN §2.4 DERIVATION, MADE BEFORE THIS RUN AND NOT AFTER IT. I justified the ceiling
// by "every child shares an EDGE with the parent". That is true of a 1->2 split and it is NOT what the
// proof needs. The proof needs only that the children's footprints TILE the parent's:
//     for p in F_child:  angle(n_ch, n_S(p)) >= angle(n_par, n_S(p)) - rho
//     => max_i theta_ch_i >= max_i sup_{F_i} angle(n_par, n_S) - max_i rho_i = theta_par - max_i rho_i.
// So the ceiling holds for ANY subdivision, 1->2, 1->4 or 1->k. The edge-sharing is what makes it TIGHT
// in the 1->2 case, because there rho = atan(dPerp/aPerp) with dPerp <= s: the anchor line pins it.
// A 1->4 split's MIDDLE child (the medial triangle of the three lifted midpoints) is anchored on NO parent
// vertex at all, so nothing pins its rho. THE CEILING STILL APPLIES — but its headroom can be much larger.
//
// H-S82-6  The 1->4 split's children achieve a materially larger rotation than the 1->2 split's, and
//          therefore a materially lower orientation error, ON THE SAME PARENTS.
//   CONFIRMED if the over-bar AREA FRACTION (10 um chord bar) after 1->4 is <= 0.8x the 1->2 value on at
//   least two of three styles. (0.8x, not 1.0x, because 1->4 spends 2x the triangles of 1->2 and a bare
//   improvement could be bought by size alone — see the NULL below, which prices exactly that.)
//   REFUTED if it is >= 0.95x, i.e. doubling the triangle spend on a smarter topology buys nothing.
//
// H-S82-7  The MIDDLE child is the only unpinned one, so if the topology matters at all it must show up
//          THERE. Reported separately from the three CORNER children on every row.
//   CONFIRMED if the middle child's rho p50 exceeds the corner children's by >= 2x.
//
// THE NULL IS AGAIN THE LOAD-BEARING CONTROL. `N4 NO-LIFT` performs the same 1->4 topology with all three
// midpoints left at the 3D edge midpoints: four COPLANAR children, surface bit-identical, pure
// re-labelling. Any comparison of 1->4 against 1->2 that is not quoted against BOTH nulls is measuring
// subdivision, not geometry. S101 §2.5 is why this is not optional.
//
// READ-ONLY over finished STLs. Usage: bash research/tools/run-s103-split-1to4.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S103_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S103_STEM ?? 's60flip/voronoi_ring_D--_A2CON';
const TAG = process.env.PF_S103_TAG ?? 'V';
const BAR_UM = envF('PF_S103_BAR_UM', 10);
const BAR_DEG = envF('PF_S103_BAR_DEG', 1);
const K = Math.round(envF('PF_S103_K', 4));
const INSET = envF('PF_S103_INSET', 0.01);
const NMARK = Math.round(envF('PF_S103_NMARK', 4000));
const DIMS: StyleDims = { H: envF('PF_S103_H', 120), Rb: envF('PF_S103_RB', 40), Rt: envF('PF_S103_RT', 50), expn: envF('PF_S103_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S82_split_1to4.ndjson`;
const DEG = 180 / Math.PI;
// modes: 0 = 1->2 LEB param-lift (the mesher), 1 = 1->4 param-lift, 2 = 1->4 NO-LIFT null, 3 = 1->4 perp-only
const MNAME = ['M0 1->2 LEB (mesher)', 'M1 1->4 PARAM-LIFT', 'M2 1->4 NO-LIFT (null)', 'M3 1->4 PERP-ONLY'];

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const pq = (a: number[], f: number): number => (a.length === 0 ? NaN : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
mkdirSync(OUTDIR, { recursive: true });
log('===== S103 — 1->2 vs 1->4: DOES A DIFFERENT SPLIT TOPOLOGY ESCAPE THE CEILING? =====');
log(`style ${STYLE}   mesh ${STEM}.stl   k=${K} inset=${INSET}   bars ${BAR_UM}um / ${BAR_DEG}deg`);

const { xyz, nTri } = readMeshFloat64(`${OUTDIR}/${STEM}.stl`, false);
const CAP_V = nTri * 3 + 16;
const VX = new Float64Array(CAP_V); const VY = new Float64Array(CAP_V); const VZ = new Float64Array(CAP_V);
const VT = new Float64Array(CAP_V);
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
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
      for (let q = 0; q < 6; q += 1) { h ^= u32[q]; h = Math.imul(h, 16777619); }
      h >>>= 0;
      const b = map.get(h); let found = -1;
      if (b !== undefined) { for (const v of b) if (VX[v] === x && VY[v] === y && VZ[v] === z) { found = v; break; } }
      if (found < 0) { found = NV; VX[NV] = x; VY[NV] = y; VZ[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
      corner[e] = found;
    }
    ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
  }
}
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VY[v], VX[v]);
log(`${nTri} facets, ${NV} welded vertices  [${el()}]`);
function windNormal(a: number, b: number, c: number, o: Float64Array): number {
  const ux = VX[b] - VX[a]; const uy = VY[b] - VY[a]; const uz = VZ[b] - VZ[a];
  const wx = VX[c] - VX[a]; const wy = VY[c] - VY[a]; const wz = VZ[c] - VZ[a];
  let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz); if (!(L > 0)) { o[0] = 0; o[1] = 0; o[2] = 0; return 0; }
  nx /= L; ny /= L; nz /= L; o[0] = nx; o[1] = ny; o[2] = nz; return 0.5 * L;
}
{
  const nb = new Float64Array(3); let outC = 0; let tot = 0;
  const st = Math.max(1, Math.floor(nTri / 4000));
  for (let t = 0; t < nTri; t += st) {
    if (windNormal(ta[t], tb[t], tc[t], nb) <= 0) continue;
    const gx = (VX[ta[t]] + VX[tb[t]] + VX[tc[t]]) / 3; const gy = (VY[ta[t]] + VY[tb[t]] + VY[tc[t]]) / 3;
    tot += 1; if (nb[0] * gx + nb[1] * gy >= 0) outC += 1;
  }
  if (outC / Math.max(1, tot) < 0.5) { for (let t = 0; t < nTri; t += 1) { const s = tb[t]; tb[t] = tc[t]; tc[t] = s; } log('mesh winds INWARD; swapped b/c globally'); }
}
const MESH: SagMesh = { ta, tb, tc, vth: VT, vz: VZ, vx: VX, vy: VY };
const ARG = makeSagArgmax();
const NS = fdNormals(rA, H);
const scratch = new Float64Array(12);
function thetas3(a: number, b: number, c: number): [number, number, number] {
  const t0 = VT[a]; return [t0, t0 + dThRaw(t0, VT[b]), t0 + dThRaw(t0, VT[c])];
}
// s65's marking key (non-monotone sin, centroid normal) — the rule that selects what gets split
const tgKey = new Float64Array(nTri);
{
  const nb = new Float64Array(3); let over = 0;
  for (let t = 0; t < nTri; t += 1) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    if (windNormal(a, b, c, nb) <= 0) { tgKey[t] = 0; continue; }
    let fx = nb[0]; let fy = nb[1]; let fz = nb[2];
    const gx = (VX[a] + VX[b] + VX[c]) / 3; const gy = (VY[a] + VY[b] + VY[c]) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const th = thetas3(a, b, c); const thc = (th[0] + th[1] + th[2]) / 3;
    const zc = Math.min(H, Math.max(0, (VZ[a] + VZ[b] + VZ[c]) / 3));
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const diam = Math.max(
      Math.hypot(VX[b] - VX[c], VY[b] - VY[c], VZ[b] - VZ[c]),
      Math.hypot(VX[a] - VX[c], VY[a] - VY[c], VZ[a] - VZ[c]),
      Math.hypot(VX[a] - VX[b], VY[a] - VY[b], VZ[a] - VZ[b]));
    tgKey[t] = Math.sin(Math.acos(dot)) * diam * 1000;
    if (tgKey[t] > BAR_UM) over += 1;
  }
  log(`marking key: over-${BAR_UM}um ${over} (${((100 * over) / nTri).toFixed(3)}%)   [${el()}]`);
}
const pop: number[] = [];
{
  const hits: number[] = [];
  for (let t = 0; t < nTri; t += 1) if (tgKey[t] > BAR_UM) hits.push(t);
  const st = hits.length / Math.min(NMARK, hits.length);
  for (let i = 0; i < Math.min(NMARK, hits.length); i += 1) pop.push(hits[Math.floor(i * st)]);
  log(`MARKED population ${pop.length} of ${hits.length}   [${el()}]`);
}

// scratch child mesh: up to 6 verts (a,b,c,mAB,mBC,mCA), up to 4 tris
const CV = { x: new Float64Array(6), y: new Float64Array(6), z: new Float64Array(6), th: new Float64Array(6) };
const cta = new Int32Array(4); const ctb = new Int32Array(4); const ctc = new Int32Array(4);
const CMESH: SagMesh = { ta: cta, tb: ctb, tc: ctc, vth: CV.th, vz: CV.z, vx: CV.x, vy: CV.y };
const nPar = new Float64Array(3);
const barRad = (BAR_DEG * Math.PI) / 180;

interface Acc {
  n: number; areaPar: number; areaParOverDeg: number; areaParOverUm: number;
  areaCh: number; areaChOverDeg: number; areaChOverUm: number; nCh: number; nChOverUm: number;
  rhoAll: number[]; rhoMid: number[]; rhoCorner: number[]; imp: number[]; viol: number; inv: number;
  better: number; chSag: number[]; areaInfl: number[];
  /** circumradius ratio child/parent — THE quantity arXiv:1911.03424 says the NORMAL error scales with. */
  rcRatio: number[]; rcPar: number[]; rcCh: number[];
}
/** circumradius of a 3D triangle = abc/(4A). Unbounded as the largest angle -> 180 deg. */
function circumR(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const a = Math.hypot(bx - cx, by - cy, bz - cz);
  const b = Math.hypot(ax - cx, ay - cy, az - cz);
  const c = Math.hypot(ax - bx, ay - by, az - bz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  return A > 0 ? (a * b * c) / (4 * A) : Infinity;
}
const mk = (): Acc => ({
  n: 0, areaPar: 0, areaParOverDeg: 0, areaParOverUm: 0, areaCh: 0, areaChOverDeg: 0, areaChOverUm: 0,
  nCh: 0, nChOverUm: 0, rhoAll: [], rhoMid: [], rhoCorner: [], imp: [], viol: 0, inv: 0, better: 0,
  chSag: [], areaInfl: [], rcRatio: [], rcPar: [], rcCh: [],
});
const ACC: Acc[] = [mk(), mk(), mk(), mk()];

/** lift the (theta,z) midpoint of i0–i1 by the requested rule; writes into CV at slot `out`. */
function placeMid(i0: number, i1: number, th0: number, th1: number, mode: number, out: number): void {
  const fx = (CV.x[i0] + CV.x[i1]) / 2; const fy = (CV.y[i0] + CV.y[i1]) / 2; const fz = (CV.z[i0] + CV.z[i1]) / 2;
  if (mode === 2) { CV.x[out] = fx; CV.y[out] = fy; CV.z[out] = fz; CV.th[out] = Math.atan2(fy, fx); return; }
  const thM = th0 + (th1 - th0) / 2;
  const zM = fz;
  const rM = rA(thM, Math.min(H, Math.max(0, zM)));
  const px = rM * Math.cos(thM); const py = rM * Math.sin(thM); const pz = zM;
  if (mode === 3) {   // perp-only: keep just the component along the parent normal
    const dp = (px - fx) * nPar[0] + (py - fy) * nPar[1] + (pz - fz) * nPar[2];
    CV.x[out] = fx + dp * nPar[0]; CV.y[out] = fy + dp * nPar[1]; CV.z[out] = fz + dp * nPar[2];
  } else { CV.x[out] = px; CV.y[out] = py; CV.z[out] = pz; }
  CV.th[out] = Math.atan2(CV.y[out], CV.x[out]);
}

for (const t of pop) {
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  const parArea = windNormal(a, b, c, nPar);
  if (!(parArea > 0)) continue;
  const TH = thetas3(a, b, c);
  const po = orientOfFacet(NS, VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c],
    TH[0], TH[1], TH[2], { k: K, inset: INSET, scratch, barRad });
  const parSag = sagAdaptiveRaw(rA, MESH, t, 0.03, 12, 64, ARG) * 1000;
  const parAsp = aspect3(VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c]);
  const parRc = circumR(VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c]);
  for (let mode = 0; mode < 4; mode += 1) {
    const A = ACC[mode];
    CV.x[0] = VX[a]; CV.y[0] = VY[a]; CV.z[0] = VZ[a]; CV.th[0] = VT[a];
    CV.x[1] = VX[b]; CV.y[1] = VY[b]; CV.z[1] = VZ[b]; CV.th[1] = VT[b];
    CV.x[2] = VX[c]; CV.y[2] = VY[c]; CV.z[2] = VZ[c]; CV.th[2] = VT[c];
    let nC = 0;
    if (mode === 0) {
      // 1->2 on the LONGEST edge, the mesher's rule
      const eL = [
        Math.hypot(VX[a] - VX[b], VY[a] - VY[b], VZ[a] - VZ[b]),
        Math.hypot(VX[b] - VX[c], VY[b] - VY[c], VZ[b] - VZ[c]),
        Math.hypot(VX[c] - VX[a], VY[c] - VY[a], VZ[c] - VZ[a])];
      let e = 0; if (eL[1] > eL[e]) e = 1; if (eL[2] > eL[e]) e = 2;
      const iu = e; const iv = (e + 1) % 3; const iw = (e + 2) % 3;
      placeMid(iu, iv, TH[iu], TH[iv], 0, 3);
      cta[0] = iu; ctb[0] = 3; ctc[0] = iw;
      cta[1] = 3; ctb[1] = iv; ctc[1] = iw;
      nC = 2;
    } else {
      placeMid(0, 1, TH[0], TH[1], mode, 3);   // mAB
      placeMid(1, 2, TH[1], TH[2], mode, 4);   // mBC
      placeMid(2, 0, TH[2], TH[0], mode, 5);   // mCA
      cta[0] = 0; ctb[0] = 3; ctc[0] = 5;
      cta[1] = 3; ctb[1] = 1; ctc[1] = 4;
      cta[2] = 5; ctb[2] = 4; ctc[2] = 2;
      cta[3] = 3; ctb[3] = 4; ctc[3] = 5;      // THE MIDDLE CHILD — anchored on no parent vertex
      nC = 4;
    }
    A.n += 1; A.areaPar += parArea;
    if (po.normRad > barRad) A.areaParOverDeg += parArea;
    if (po.tangMm * 1000 > BAR_UM) A.areaParOverUm += parArea;
    let mxTheta = 0; let mxRho = 0; let areaSum = 0; let aw = 0; let at = 0; let bad = false;
    for (let ci = 0; ci < nC; ci += 1) {
      const p0 = cta[ci]; const p1 = ctb[ci]; const p2 = ctc[ci];
      const ux = CV.x[p1] - CV.x[p0]; const uy = CV.y[p1] - CV.y[p0]; const uz = CV.z[p1] - CV.z[p0];
      const wx = CV.x[p2] - CV.x[p0]; const wy = CV.y[p2] - CV.y[p0]; const wz = CV.z[p2] - CV.z[p0];
      let cx = uy * wz - uz * wy; let cy = uz * wx - ux * wz; let cz = ux * wy - uy * wx;
      const cl = Math.hypot(cx, cy, cz); if (!(cl > 0)) { bad = true; break; }
      const area = 0.5 * cl; cx /= cl; cy /= cl; cz /= cl; areaSum += area;
      let d = nPar[0] * cx + nPar[1] * cy + nPar[2] * cz; d = d > 1 ? 1 : d < -1 ? -1 : d;
      const rho = Math.acos(d);
      A.rhoAll.push(rho); if (rho > Math.PI / 2) A.inv += 1;
      if (nC === 4 && ci === 3) A.rhoMid.push(rho); else A.rhoCorner.push(rho);
      if (rho > mxRho) mxRho = rho;
      const th0 = CV.th[p0];
      const co = orientOfFacet(NS, CV.x[p0], CV.y[p0], CV.z[p0], CV.x[p1], CV.y[p1], CV.z[p1], CV.x[p2], CV.y[p2], CV.z[p2],
        th0, th0 + dThRaw(th0, CV.th[p1]), th0 + dThRaw(th0, CV.th[p2]), { k: K, inset: INSET, scratch, barRad });
      if (co.normRad > mxTheta) mxTheta = co.normRad;
      A.areaCh += area; A.nCh += 1; at += area; aw += area * co.normRad;
      if (co.normRad > barRad) A.areaChOverDeg += area;
      if (co.tangMm * 1000 > BAR_UM) { A.areaChOverUm += area; A.nChOverUm += 1; }
      A.chSag.push(sagAdaptiveRaw(rA, CMESH, ci, 0.03, 12, 64, ARG) * 1000);
      const rc = circumR(CV.x[p0], CV.y[p0], CV.z[p0], CV.x[p1], CV.y[p1], CV.z[p1], CV.x[p2], CV.y[p2], CV.z[p2]);
      if (Number.isFinite(rc) && Number.isFinite(parRc) && parRc > 0) { A.rcCh.push(rc); A.rcPar.push(parRc); A.rcRatio.push(rc / parRc); }
    }
    if (bad) continue;
    A.areaInfl.push(areaSum / parArea);
    A.imp.push(po.normRad - mxTheta); A.rhoCorner.length >= 0 && 0;
    if (po.normRad - mxTheta > mxRho + 1e-9) A.viol += 1;
    if (aw / Math.max(1e-30, at) <= po.normRad) A.better += 1;
    if (parSag < 0) A.better += 0;   // parSag is reported below; keep it referenced
    if (parAsp < 0) A.better += 0;
  }
}

log('');
for (let m = 0; m < 4; m += 1) {
  const A = ACC[m];
  if (A.n === 0) { log(`${MNAME[m]}: no data`); continue; }
  const sRho = S(A.rhoAll); const sMid = S(A.rhoMid); const sCor = S(A.rhoCorner);
  const sImp = S(A.imp); const sInfl = S(A.areaInfl); const sSag = S(A.chSag);
  const parFracUm = (100 * A.areaParOverUm) / A.areaPar; const chFracUm = (100 * A.areaChOverUm) / A.areaCh;
  const parFracDeg = (100 * A.areaParOverDeg) / A.areaPar; const chFracDeg = (100 * A.areaChOverDeg) / A.areaCh;
  log(`── ${MNAME[m]}  (n=${A.n} parents, ${A.nCh} children = ${(A.nCh / A.n).toFixed(1)}x) ─────────────`);
  log(`   over-${BAR_UM}um AREA FRACTION ${parFracUm.toFixed(3)}% -> ${chFracUm.toFixed(3)}%  (x${(chFracUm / Math.max(1e-9, parFracUm)).toFixed(4)})   over-${BAR_DEG}deg ${parFracDeg.toFixed(3)}% -> ${chFracDeg.toFixed(3)}%  (x${(chFracDeg / Math.max(1e-9, parFracDeg)).toFixed(4)})`);
  log(`   rho ALL p50 ${(pq(sRho, 0.5) * DEG).toFixed(4)} p90 ${(pq(sRho, 0.9) * DEG).toFixed(3)} deg   MIDDLE child p50 ${(sMid.length ? pq(sMid, 0.5) * DEG : NaN).toFixed(4)}   CORNER children p50 ${(pq(sCor, 0.5) * DEG).toFixed(4)} deg   ratio ${(sMid.length ? pq(sMid, 0.5) / Math.max(1e-12, pq(sCor, 0.5)) : NaN).toFixed(3)}x`);
  log(`   improvement (theta_par - max theta_child) p50 ${(pq(sImp, 0.5) * DEG).toFixed(4)} p90 ${(pq(sImp, 0.9) * DEG).toFixed(3)} deg   CEILING violations ${A.viol}/${A.n}`);
  log(`   improve(area-mean) ${((100 * A.better) / A.n).toFixed(2)}%   INVERTED children ${A.inv}/${A.nCh} = ${((100 * A.inv) / A.nCh).toFixed(3)}%   area(ch)/area(par) TOTAL ${(A.areaCh / A.areaPar).toFixed(4)} p50 ${pq(sInfl, 0.5).toFixed(6)}`);
  {
    const sRc = S(A.rcRatio); const sRp = S(A.rcPar); const sRc2 = S(A.rcCh);
    log(`   *** CIRCUMRADIUS (arXiv:1911.03424: normal error ~ R_circ)  parent p50 ${pq(sRp, 0.5).toFixed(4)} mm  child p50 ${pq(sRc2, 0.5).toFixed(4)} mm   RATIO child/parent p50 ${pq(sRc, 0.5).toFixed(4)} p90 ${pq(sRc, 0.9).toFixed(3)} ***`);
  }
  log(`   child position sag p50 ${pq(sSag, 0.5).toFixed(3)} p99 ${pq(sSag, 0.99).toFixed(2)} max ${sSag[sSag.length - 1].toFixed(2)} um`);
  appendFileSync(NDJSON, `${JSON.stringify({
    tag: TAG, style: STYLE, stem: STEM, mode: MNAME[m], n: A.n, nCh: A.nCh, childPerParent: A.nCh / A.n,
    parFracUm, chFracUm, ratioUm: chFracUm / Math.max(1e-9, parFracUm),
    parFracDeg, chFracDeg, ratioDeg: chFracDeg / Math.max(1e-9, parFracDeg),
    rhoP50deg: pq(sRho, 0.5) * DEG, rhoMidP50deg: sMid.length ? pq(sMid, 0.5) * DEG : null, rhoCornerP50deg: pq(sCor, 0.5) * DEG,
    impP50deg: pq(sImp, 0.5) * DEG, ceilViol: A.viol, invPct: (100 * A.inv) / A.nCh,
    areaInflTotal: A.areaCh / A.areaPar, chSagP99: pq(sSag, 0.99), chSagMax: sSag[sSag.length - 1],
    rcRatioP50: pq(S(A.rcRatio), 0.5), rcRatioP90: pq(S(A.rcRatio), 0.9), rcParP50: pq(S(A.rcPar), 0.5),
    improvePct: (100 * A.better) / A.n, secs: (Date.now() - T0) / 1000,
  })}\n`);
}
log('');
log(`done  [${el()}]`);
