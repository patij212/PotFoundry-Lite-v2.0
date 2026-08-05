// s101SplitModel.ts — IS `s/h` THE RIGHT MODEL FOR THE ROTATION A SPLIT MANUFACTURES?
//                     AND IS THERE A PLACEMENT THAT REFINES WITHOUT MANUFACTURING IT?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED IN research/exchange/_strataConformBisect/S82_SPLIT_FINDINGS.md §1, BEFORE THE FIRST RUN.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HANDED-DOWN MECHANISM: "the split inserts a vertex ON the surface; that vertex sits off the parent
// facet's plane by the parent's position sag `s`, so each child is rotated relative to the parent by
// roughly `s/h`; refinement therefore converts a BOUNDED position error into an UNBOUNDED orientation
// error." Everything the other two agents plan depends on it, so it is measured first.
//
// THE PART THAT IS ALGEBRA, NOT HYPOTHESIS. For a 1->2 split of parent (u,v,w) on edge u–v at a lifted
// midpoint M, the child (u,M,w) and the parent BOTH contain the line u–w. The child plane is therefore the
// parent plane ROTATED ABOUT u–w, and
//         tan(rho) = dPerp / aPerp        EXACTLY   (for |rho| < 90 deg)
// with dPerp = |(M - Mflat) . nPar| and aPerp = dist(proj_par(M), line(u,w)) — the child's altitude FROM
// THE NEW VERTEX TO THE SHARED EDGE. The hypothesis lives entirely in the two substitutions the campaign
// makes: dPerp ~ s (a max over the facet, so dPerp <= s always) and aPerp ~ h (the child's SIZE, which on
// a high-aspect facet is nothing like its altitude).
//
// H-S82-1 IDENTITY (self-check): p99 |rho - atan(dPerp/aPerp)| <= 1e-9 rad. NON-VACUOUS: the same check
//         against the child's DIAMETER must FAIL loudly.
// H-S82-2 PROXY: rho/(sPar/hChild) p50 in [0.5,2.0] and p90/p10 <= 100 => the campaign's proxy CONFIRMED.
// H-S82-3 CONSEQUENCE: children must be worse AGAINST THE SURFACE, not merely rotated against the parent.
// H-S82-4 STRATIFY by aspect3 and spreadRad; prediction on record: damage concentrates in aspect3 >= 50.
//
// ── ADDED AFTER RUN 1 (n=800+600), BECAUSE RUN 1 PRINTED THREE THINGS THE HYPOTHESES DID NOT ANTICIPATE:
//   (a) the identity holds to 2e-14 at p50 but reads ~pi at p99 — i.e. a TAIL OF CHILDREN IS INVERTED,
//       which atan(dPerp/aPerp) in [0,90deg) cannot express. So the split is not only rotating children,
//       it is FOLDING some of them. Run 1 could not say how many. Now counted.
//   (b) sum(child area) / parent area = 1.2786 on the MARKED population. A 1->2 split of a planar triangle
//       conserves area; it inflates ONLY when the new vertex leaves the segment u–v. So the lift has a
//       LARGE IN-PLANE component that the s/h model does not mention at all. Now decomposed (dPerp, dPar).
//   (c) the over-bar AREA ratio 1.263x is dominated by that inflation, not by a change in the over-bar
//       FRACTION (100% -> 98.8%). Reporting the ratio alone would have been a false CONFIRM. Both are now
//       printed side by side.
//
// ── PLACEMENT VARIANTS (the brief's first question: "what if the vertex were placed to minimise the
//    children's normal deviation rather than to lie on the surface?"). All four are measured on the SAME
//    facets with the SAME rulers, so the Pareto front is a measurement and not an argument:
//      P0 PARAM-LIFT  r = rA(theta_M, z_M) at the (theta,z) midpoint       — the mesher's/s65's rule.
//      P1 NO-LIFT     M = the 3D midpoint of u–v                          — zero rotation BY CONSTRUCTION
//                                                                            (children coplanar w/ parent).
//      P2 PERP-FOOT   M = Mflat + s*nPar, s solved so M lies ON the surface — keeps the vertex on the
//                     surface but removes the IN-PLANE slide entirely.
//      P3 PERP-ONLY   M = Mflat + dPerp*nPar (P0's perpendicular component, no root-find, no extra rA).
//
// The split rule for P0 is s65SplitAndFlip.ts's verbatim. A CONTROL re-computes s65's own census key over
// the whole mesh and must reproduce its published BEFORE numbers (241,489 over-bar, p99 1194.64 um) or this
// probe is not looking at the same experiment. [RUN 1: matched to all printed digits.]
//
// READ-ONLY. Writes only a report + ndjson. Usage: bash research/tools/run-s101-split-model.sh
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
const STYLE = process.env.PF_S101_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S101_STEM ?? 's60flip/voronoi_ring_D--_A2CON';
const TAG = process.env.PF_S101_TAG ?? 'V';
const BAR_UM = envF('PF_S101_BAR_UM', 10);          // the product CHORD bar
const BAR_DEG = envF('PF_S101_BAR_DEG', 1);         // the h-invariant ANGLE bar
const K = Math.round(envF('PF_S101_K', 4));
const INSET = envF('PF_S101_INSET', 0.01);          // same setting as the S70 census
const NMARK = Math.round(envF('PF_S101_NMARK', 6000));
const NALL = Math.round(envF('PF_S101_NALL', 4000));
const DOCENSUS = envF('PF_S101_CENSUS', 1) === 1;
const DIMS: StyleDims = { H: envF('PF_S101_H', 120), Rb: envF('PF_S101_RB', 40), Rt: envF('PF_S101_RT', 50), expn: envF('PF_S101_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S82_split_model.ndjson`;
const DEG = 180 / Math.PI;
const NP = 4;
const PNAME = ['P0 PARAM-LIFT', 'P1 NO-LIFT', 'P2 PERP-FOOT', 'P3 PERP-ONLY'];

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

log('===== S101 — THE `s/h` MODEL, AND THE SPLIT-PLACEMENT PARETO FRONT =====');
log(`style ${STYLE}   mesh ${STEM}.stl   k=${K} inset=${INSET}   bars ${BAR_UM}um / ${BAR_DEG}deg   placements ${PNAME.join(' | ')}`);

// ── read + weld (s65 idiom: exact f64 hash weld)
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

// ── GLOBAL WINDING CONVENTION. Fix it ONCE by majority vote so per-facet inversions stay VISIBLE
// (orientOfFacet's 'outward' mode would hide them, and 'winding' on an inward mesh reads 180 deg on all).
function windNormal(a: number, b: number, c: number, o: Float64Array): number {
  const ux = VX[b] - VX[a]; const uy = VY[b] - VY[a]; const uz = VZ[b] - VZ[a];
  const wx = VX[c] - VX[a]; const wy = VY[c] - VY[a]; const wz = VZ[c] - VZ[a];
  let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz); if (!(L > 0)) { o[0] = 0; o[1] = 0; o[2] = 0; return 0; }
  nx /= L; ny /= L; nz /= L; o[0] = nx; o[1] = ny; o[2] = nz; return 0.5 * L;
}
{
  const nb = new Float64Array(3); let outCount = 0; let tot = 0;
  const st = Math.max(1, Math.floor(nTri / 4000));
  for (let t = 0; t < nTri; t += st) {
    if (windNormal(ta[t], tb[t], tc[t], nb) <= 0) continue;
    const gx = (VX[ta[t]] + VX[tb[t]] + VX[tc[t]]) / 3; const gy = (VY[ta[t]] + VY[tb[t]] + VY[tc[t]]) / 3;
    tot += 1; if (nb[0] * gx + nb[1] * gy >= 0) outCount += 1;
  }
  const frac = outCount / Math.max(1, tot);
  log(`global winding: ${(100 * frac).toFixed(2)}% of ${tot} sampled facets wind OUTWARD`);
  if (frac < 0.5) { for (let t = 0; t < nTri; t += 1) { const s = tb[t]; tb[t] = tc[t]; tc[t] = s; } log('  -> mesh winds INWARD; swapped b/c globally (geometry unchanged)'); }
}

const MESH: SagMesh = { ta, tb, tc, vth: VT, vz: VZ, vx: VX, vy: VY };
const ARG = makeSagArgmax();
const NS = fdNormals(rA, H);
const scratch = new Float64Array(12);

function thetas3(a: number, b: number, c: number): [number, number, number] {
  const t0 = VT[a];
  return [t0, t0 + dThRaw(t0, VT[b]), t0 + dThRaw(t0, VT[c])];
}

// ── CONTROL: reproduce s65's own census key over the WHOLE mesh (non-monotone sin, centroid normal).
const tgKey = new Float64Array(nTri);
function s65Key(a: number, b: number, c: number): number {
  const nb = new Float64Array(3);
  if (windNormal(a, b, c, nb) <= 0) return 0;
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
  return Math.sin(Math.acos(dot)) * diam * 1000;
}
let nOverKey = 0;
if (DOCENSUS) {
  const all: number[] = [];
  for (let t = 0; t < nTri; t += 1) { const g = s65Key(ta[t], tb[t], tc[t]); tgKey[t] = g; all.push(g); if (g > BAR_UM) nOverKey += 1; }
  const sa = S(all);
  log(`CONTROL (s65 key, whole mesh): over-${BAR_UM}um ${nOverKey} (${((100 * nOverKey) / nTri).toFixed(3)}%)  p99 ${pq(sa, 0.99).toFixed(2)} um  max ${sa[sa.length - 1].toFixed(1)} um   [${el()}]`);
  log('  (s65 published BEFORE for A2CON: over 241489 / 29.933%, p99 1194.64, max 2238.7)');
} else {
  for (let t = 0; t < nTri; t += 1) { tgKey[t] = s65Key(ta[t], tb[t], tc[t]); if (tgKey[t] > BAR_UM) nOverKey += 1; }
}

// ── THE VIRTUAL SPLIT
interface Row {
  t: number;
  parTheta: number; parTang: number; parSpread: number; parAsp: number; parDiam: number; parArea: number; parSag: number;
  // per placement:
  ok: boolean[]; dPerp: number[]; dPar: number[]; dFull: number[]; areaInfl: number[]; nInv: number[]; nOutside: number[];
  rho: number[][]; rhoPred: number[][]; rhoPredDiam: number[][]; aPerp: number[][];
  chTheta: number[][]; chTang: number[][]; chArea: number[][]; chDiam: number[][]; chAsp: number[][]; chSag: number[][];
}
const CV = { x: new Float64Array(4), y: new Float64Array(4), z: new Float64Array(4), th: new Float64Array(4) };
const cta = new Int32Array(2); const ctb = new Int32Array(2); const ctc = new Int32Array(2);
const CMESH: SagMesh = { ta: cta, tb: ctb, tc: ctc, vth: CV.th, vz: CV.z, vx: CV.x, vy: CV.y };
const nPar = new Float64Array(3);

/** signed radial residual along the ray Mflat + s*n : |p|_xy - rA(theta(p), z(p)). Zero ON the surface. */
function radRes(ox: number, oy: number, oz: number, nx: number, ny: number, nz: number, s: number): number {
  const x = ox + s * nx; const y = oy + s * ny; const z = oz + s * nz;
  return Math.hypot(x, y) - rA(Math.atan2(y, x), z);
}
/** P2: walk along +-nPar from Mflat to the surface. Expanding bracket then 40 bisections. */
function perpFoot(ox: number, oy: number, oz: number, nx: number, ny: number, nz: number, span: number): number | null {
  const f0 = radRes(ox, oy, oz, nx, ny, nz, 0);
  if (f0 === 0) return 0;
  let lo = 0; let hi = 0; let found = false;
  for (let m = 0; m < 2 && !found; m += 1) {
    const sgn = m === 0 ? -Math.sign(f0) : Math.sign(f0);   // try the side that should close first
    let prevS = 0; let prevF = f0;
    for (let i = 1; i <= 24; i += 1) {
      const s = sgn * span * (i / 24) ** 2;
      const f = radRes(ox, oy, oz, nx, ny, nz, s);
      if (f === 0) return s;
      if ((f < 0) !== (prevF < 0)) { lo = prevS; hi = s; found = true; break; }
      prevS = s; prevF = f;
    }
  }
  if (!found) return null;
  let fl = radRes(ox, oy, oz, nx, ny, nz, lo);
  for (let i = 0; i < 40; i += 1) {
    const mid = 0.5 * (lo + hi);
    const fm = radRes(ox, oy, oz, nx, ny, nz, mid);
    if ((fm < 0) === (fl < 0)) { lo = mid; fl = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function splitOne(t: number): Row | null {
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  const parArea = windNormal(a, b, c, nPar);
  if (!(parArea > 0)) return null;
  const TH = thetas3(a, b, c);
  const I = [a, b, c];
  const eLen = [
    Math.hypot(VX[a] - VX[b], VY[a] - VY[b], VZ[a] - VZ[b]),
    Math.hypot(VX[b] - VX[c], VY[b] - VY[c], VZ[b] - VZ[c]),
    Math.hypot(VX[c] - VX[a], VY[c] - VY[a], VZ[c] - VZ[a])];
  let e = 0; if (eLen[1] > eLen[e]) e = 1; if (eLen[2] > eLen[e]) e = 2;
  const iu = e; const iv = (e + 1) % 3; const iw = (e + 2) % 3;
  const u = I[iu]; const v = I[iv]; const w = I[iw];
  const parDiam = eLen[e];
  const parAsp = aspect3(VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c]);
  const po = orientOfFacet(NS, VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c],
    TH[0], TH[1], TH[2], { k: K, inset: INSET, scratch, barRad: (BAR_DEG * Math.PI) / 180 });
  const parSag = sagAdaptiveRaw(rA, MESH, t, 0.03, 12, 64, ARG) * 1000;

  const fx = (VX[u] + VX[v]) / 2; const fy = (VY[u] + VY[v]) / 2; const fz = (VZ[u] + VZ[v]) / 2;
  // P0 — the mesher's rule, s65 verbatim
  const thU = TH[iu]; const thM = thU + dThRaw(thU, VT[v]) / 2;
  const zM = (VZ[u] + VZ[v]) / 2;
  const rM = rA(thM, Math.min(H, Math.max(0, zM)));
  const P0 = [rM * Math.cos(thM), rM * Math.sin(thM), zM];
  const d0 = [P0[0] - fx, P0[1] - fy, P0[2] - fz];
  const dPerp0 = d0[0] * nPar[0] + d0[1] * nPar[1] + d0[2] * nPar[2];
  // P2 — perpendicular foot
  const sFoot = perpFoot(fx, fy, fz, nPar[0], nPar[1], nPar[2], 0.5 * parDiam);
  const cand: Array<number[] | null> = [
    P0,
    [fx, fy, fz],
    sFoot === null ? null : [fx + sFoot * nPar[0], fy + sFoot * nPar[1], fz + sFoot * nPar[2]],
    [fx + dPerp0 * nPar[0], fy + dPerp0 * nPar[1], fz + dPerp0 * nPar[2]],
  ];

  const R: Row = {
    t, parTheta: po.normRad, parTang: po.tangMm * 1000, parSpread: po.spreadRad, parAsp, parDiam, parArea, parSag,
    ok: [], dPerp: [], dPar: [], dFull: [], areaInfl: [], nInv: [], nOutside: [],
    rho: [], rhoPred: [], rhoPredDiam: [], aPerp: [], chTheta: [], chTang: [], chArea: [], chDiam: [], chAsp: [], chSag: [],
  };
  // in-plane basis of the parent for the "is M outside the parent triangle" test
  const distToLine = (qx: number, qy: number, qz: number, i0: number, i1: number): number => {
    const ex = CV.x[i1] - CV.x[i0]; const ey = CV.y[i1] - CV.y[i0]; const ez = CV.z[i1] - CV.z[i0];
    const L = Math.hypot(ex, ey, ez); if (!(L > 0)) return 0;
    const wx = qx - CV.x[i0]; const wy = qy - CV.y[i0]; const wz = qz - CV.z[i0];
    return Math.hypot(wy * ez - wz * ey, wz * ex - wx * ez, wx * ey - wy * ex) / L;
  };
  for (let p = 0; p < NP; p += 1) {
    const M = cand[p];
    if (M === null) {
      R.ok.push(false); R.dPerp.push(NaN); R.dPar.push(NaN); R.dFull.push(NaN); R.areaInfl.push(NaN);
      R.nInv.push(NaN); R.nOutside.push(NaN);
      R.rho.push([NaN, NaN]); R.rhoPred.push([NaN, NaN]); R.rhoPredDiam.push([NaN, NaN]); R.aPerp.push([NaN, NaN]);
      R.chTheta.push([NaN, NaN]); R.chTang.push([NaN, NaN]); R.chArea.push([NaN, NaN]); R.chDiam.push([NaN, NaN]);
      R.chAsp.push([NaN, NaN]); R.chSag.push([NaN, NaN]);
      continue;
    }
    const dx = M[0] - fx; const dy = M[1] - fy; const dz = M[2] - fz;
    const dpS = dx * nPar[0] + dy * nPar[1] + dz * nPar[2];
    const dFull = Math.hypot(dx, dy, dz);
    const dParIn = Math.sqrt(Math.max(0, dFull * dFull - dpS * dpS));
    const px = M[0] - dpS * nPar[0]; const py = M[1] - dpS * nPar[1]; const pz = M[2] - dpS * nPar[2];
    CV.x[0] = VX[u]; CV.y[0] = VY[u]; CV.z[0] = VZ[u]; CV.th[0] = VT[u];
    CV.x[1] = VX[v]; CV.y[1] = VY[v]; CV.z[1] = VZ[v]; CV.th[1] = VT[v];
    CV.x[2] = VX[w]; CV.y[2] = VY[w]; CV.z[2] = VZ[w]; CV.th[2] = VT[w];
    CV.x[3] = M[0]; CV.y[3] = M[1]; CV.z[3] = M[2]; CV.th[3] = Math.atan2(M[1], M[0]);
    cta[0] = 0; ctb[0] = 3; ctc[0] = 2;
    cta[1] = 3; ctb[1] = 1; ctc[1] = 2;
    const rho: number[] = []; const rhoPred: number[] = []; const rhoPredDiam: number[] = []; const aPerp: number[] = [];
    const chTheta: number[] = []; const chTang: number[] = []; const chArea: number[] = [];
    const chDiam: number[] = []; const chAsp: number[] = []; const chSag: number[] = [];
    let inv = 0; let areaSum = 0; let bad = false;
    for (let ci = 0; ci < 2; ci += 1) {
      const p0 = cta[ci]; const p1 = ctb[ci]; const p2 = ctc[ci];
      const ux = CV.x[p1] - CV.x[p0]; const uy = CV.y[p1] - CV.y[p0]; const uz = CV.z[p1] - CV.z[p0];
      const wx2 = CV.x[p2] - CV.x[p0]; const wy2 = CV.y[p2] - CV.y[p0]; const wz2 = CV.z[p2] - CV.z[p0];
      let cx = uy * wz2 - uz * wy2; let cy = uz * wx2 - ux * wz2; let cz = ux * wy2 - uy * wx2;
      const cl = Math.hypot(cx, cy, cz); if (!(cl > 0)) { bad = true; break; }
      const area = 0.5 * cl; cx /= cl; cy /= cl; cz /= cl; areaSum += area;
      let d = nPar[0] * cx + nPar[1] * cy + nPar[2] * cz; d = d > 1 ? 1 : d < -1 ? -1 : d;
      const rr = Math.acos(d); rho.push(rr); if (rr > Math.PI / 2) inv += 1;
      const s0 = ci === 0 ? 0 : 1; const s1 = 2;
      const ap = distToLine(px, py, pz, s0, s1); aPerp.push(ap);
      rhoPred.push(Math.atan2(Math.abs(dpS), ap));
      const dia = Math.max(
        Math.hypot(CV.x[p1] - CV.x[p2], CV.y[p1] - CV.y[p2], CV.z[p1] - CV.z[p2]),
        Math.hypot(CV.x[p0] - CV.x[p2], CV.y[p0] - CV.y[p2], CV.z[p0] - CV.z[p2]),
        Math.hypot(CV.x[p0] - CV.x[p1], CV.y[p0] - CV.y[p1], CV.z[p0] - CV.z[p1]));
      rhoPredDiam.push(Math.atan2(Math.abs(dpS), dia));
      chDiam.push(dia); chArea.push(area);
      chAsp.push(aspect3(CV.x[p0], CV.y[p0], CV.z[p0], CV.x[p1], CV.y[p1], CV.z[p1], CV.x[p2], CV.y[p2], CV.z[p2]));
      const t0 = CV.th[p0];
      const co = orientOfFacet(NS, CV.x[p0], CV.y[p0], CV.z[p0], CV.x[p1], CV.y[p1], CV.z[p1], CV.x[p2], CV.y[p2], CV.z[p2],
        t0, t0 + dThRaw(t0, CV.th[p1]), t0 + dThRaw(t0, CV.th[p2]),
        { k: K, inset: INSET, scratch, barRad: (BAR_DEG * Math.PI) / 180 });
      chTheta.push(co.normRad); chTang.push(co.tangMm * 1000);
      chSag.push(sagAdaptiveRaw(rA, CMESH, ci, 0.03, 12, 64, ARG) * 1000);
    }
    if (bad) {
      R.ok.push(false); R.dPerp.push(NaN); R.dPar.push(NaN); R.dFull.push(NaN); R.areaInfl.push(NaN);
      R.nInv.push(NaN); R.nOutside.push(NaN);
      R.rho.push([NaN, NaN]); R.rhoPred.push([NaN, NaN]); R.rhoPredDiam.push([NaN, NaN]); R.aPerp.push([NaN, NaN]);
      R.chTheta.push([NaN, NaN]); R.chTang.push([NaN, NaN]); R.chArea.push([NaN, NaN]); R.chDiam.push([NaN, NaN]);
      R.chAsp.push([NaN, NaN]); R.chSag.push([NaN, NaN]);
      continue;
    }
    // "outside": proj(M) leaves the segment u–v's side of the parent, i.e. the children stop tiling it.
    // Detected by area: a planar 1->2 split conserves area exactly; > 1 + 1e-9 means M left the segment.
    R.ok.push(true); R.dPerp.push(Math.abs(dpS) * 1000); R.dPar.push(dParIn * 1000); R.dFull.push(dFull * 1000);
    R.areaInfl.push(areaSum / parArea); R.nInv.push(inv);
    R.nOutside.push(areaSum / parArea > 1 + 1e-9 ? 1 : 0);
    R.rho.push(rho); R.rhoPred.push(rhoPred); R.rhoPredDiam.push(rhoPredDiam); R.aPerp.push(aPerp);
    R.chTheta.push(chTheta); R.chTang.push(chTang); R.chArea.push(chArea); R.chDiam.push(chDiam);
    R.chAsp.push(chAsp); R.chSag.push(chSag);
  }
  return R;
}

function strideSample(pred: (t: number) => boolean, want: number): number[] {
  const hits: number[] = [];
  for (let t = 0; t < nTri; t += 1) if (pred(t)) hits.push(t);
  if (hits.length <= want) return hits;
  const out: number[] = []; const st = hits.length / want;
  for (let i = 0; i < want; i += 1) out.push(hits[Math.floor(i * st)]);
  return out;
}
const popMark = strideSample((t) => tgKey[t] > BAR_UM, NMARK);
const popAll = strideSample(() => true, NALL);
log(`populations: MARKED ${popMark.length} (of ${nOverKey})   ALL ${popAll.length} (of ${nTri})   [${el()}]`);

const spearman = (x: number[], y: number[]): number => {
  const n = x.length; if (n < 3) return NaN;
  const rank = (v: number[]): number[] => {
    const idx = Array.from({ length: n }, (_q, i) => i).sort((p, q) => v[p] - v[q]);
    const r = new Array<number>(n); let i = 0;
    while (i < n) { let j = i; while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j += 1; const avg = (i + j) / 2 + 1; for (let q = i; q <= j; q += 1) r[idx[q]] = avg; i = j + 1; }
    return r;
  };
  const rx = rank(x); const ry = rank(y);
  let mx = 0; let my = 0; for (let i = 0; i < n; i += 1) { mx += rx[i]; my += ry[i]; } mx /= n; my /= n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) { const dx2 = rx[i] - mx; const dy2 = ry[i] - my; sxy += dx2 * dy2; sxx += dx2 * dx2; syy += dy2 * dy2; }
  return sxy / Math.sqrt(Math.max(1e-300, sxx * syy));
};

function runPop(name: string, pop: number[]): void {
  const rows: Row[] = [];
  for (const t of pop) { const r = splitOne(t); if (r !== null) rows.push(r); }
  const barRad = (BAR_DEG * Math.PI) / 180;
  log('');
  log(`══════════════════ ${name}  (n=${rows.length}, ${el()}) ══════════════════`);
  const parT = S(rows.map((r) => r.parTheta));
  let areaPar = 0; let areaParOverDeg = 0; let areaParOverUm = 0; let nParOverDeg = 0; let nParOverUm = 0;
  for (const r of rows) {
    areaPar += r.parArea;
    if (r.parTheta > barRad) { areaParOverDeg += r.parArea; nParOverDeg += 1; }
    if (r.parTang > BAR_UM) { areaParOverUm += r.parArea; nParOverUm += 1; }
  }
  log(`PARENTS  theta p50 ${(pq(parT, 0.5) * DEG).toFixed(3)} p99 ${(pq(parT, 0.99) * DEG).toFixed(2)} deg   over-${BAR_DEG}deg ${((100 * nParOverDeg) / rows.length).toFixed(2)}% count / ${((100 * areaParOverDeg) / areaPar).toFixed(3)}% AREA   over-${BAR_UM}um ${((100 * nParOverUm) / rows.length).toFixed(2)}% / ${((100 * areaParOverUm) / areaPar).toFixed(3)}% AREA`);
  const asp = S(rows.map((r) => r.parAsp));
  log(`         aspect3 p50 ${pq(asp, 0.5).toFixed(2)} p90 ${pq(asp, 0.9).toFixed(1)} p99 ${pq(asp, 0.99).toFixed(1)}   diam p50 ${(pq(S(rows.map((r) => r.parDiam)), 0.5) * 1000).toFixed(1)} um   sag p50 ${pq(S(rows.map((r) => r.parSag)), 0.5).toFixed(2)} p99 ${pq(S(rows.map((r) => r.parSag)), 0.99).toFixed(2)} um`);

  for (let p = 0; p < NP; p += 1) {
    const rs = rows.filter((r) => r.ok[p]);
    if (rs.length === 0) { log(`\n── ${PNAME[p]}: NO VALID SPLITS`); continue; }
    // identity + inversions
    const errId: number[] = []; const errIdNoInv: number[] = []; const errDiam: number[] = [];
    let nInv = 0; let nCh = 0; let nOut = 0;
    for (const r of rs) {
      nOut += r.nOutside[p];
      for (let i = 0; i < 2; i += 1) {
        nCh += 1;
        const ei = Math.abs(r.rho[p][i] - r.rhoPred[p][i]);
        errId.push(ei); errDiam.push(Math.abs(r.rho[p][i] - r.rhoPredDiam[p][i]));
        if (r.rho[p][i] > Math.PI / 2) nInv += 1; else errIdNoInv.push(ei);
      }
    }
    const sEI = S(errId); const sEN = S(errIdNoInv); const sED = S(errDiam);
    // rotation + the denominator race
    const rr: number[] = []; const prox: number[] = []; const proxAlt: number[] = []; const exact: number[] = []; const ratio: number[] = [];
    for (const r of rs) for (let i = 0; i < 2; i += 1) {
      const sh = (r.parSag / 1000) / Math.max(1e-12, r.chDiam[p][i]);
      const sa = (r.parSag / 1000) / Math.max(1e-12, r.aPerp[p][i]);
      rr.push(r.rho[p][i]); prox.push(sh); proxAlt.push(sa);
      exact.push((r.dPerp[p] / 1000) / Math.max(1e-12, r.aPerp[p][i]));
      ratio.push(r.rho[p][i] / Math.max(1e-12, sh));
    }
    const sRho = S(rr); const sRatio = S(ratio);
    // consequence
    let areaCh = 0; let areaChOverDeg = 0; let areaChOverUm = 0; let nChOverDeg = 0; let nChOverUm = 0;
    let better = 0; let betterMax = 0; let aParHere = 0; let aParOverDegHere = 0; let aParOverUmHere = 0;
    let worsePos = 0;
    for (const r of rs) {
      aParHere += r.parArea;
      if (r.parTheta > barRad) aParOverDegHere += r.parArea;
      if (r.parTang > BAR_UM) aParOverUmHere += r.parArea;
      let aw = 0; let at = 0; let mx = 0;
      for (let i = 0; i < 2; i += 1) {
        areaCh += r.chArea[p][i]; at += r.chArea[p][i]; aw += r.chArea[p][i] * r.chTheta[p][i];
        mx = Math.max(mx, r.chTheta[p][i]);
        if (r.chTheta[p][i] > barRad) { areaChOverDeg += r.chArea[p][i]; nChOverDeg += 1; }
        if (r.chTang[p][i] > BAR_UM) { areaChOverUm += r.chArea[p][i]; nChOverUm += 1; }
      }
      if (aw / Math.max(1e-30, at) <= r.parTheta) better += 1;
      if (mx <= r.parTheta) betterMax += 1;
      if (Math.max(r.chSag[p][0], r.chSag[p][1]) > r.parSag) worsePos += 1;
    }
    // ── THE INEQUALITY THAT MAKES THIS A THEOREM RATHER THAN A TABLE.
    // Every child of a single-vertex EDGE split shares an EDGE with the parent, so its plane is the
    // parent's rotated about that edge by exactly rho. The child's FOOTPRINT is a subset of the parent's,
    // so the surface-normal set it is scored against is a subset too. Hence
    //        theta_par - max_i theta_child_i  <=  max_i rho_i
    // i.e. THE MOST A SPLIT CAN IMPROVE ORIENTATION IS THE ROTATION IT APPLIES. And rho = atan(dPerp/aPerp)
    // with dPerp <= s (the new vertex is ON the surface, so it cannot be further from the parent plane than
    // the parent's own sag). So `s/h` is NOT the error a split manufactures — it is the CEILING on the
    // correction a split can make. That reverses the sign of the handed-down interpretation, and it
    // predicts density-invariance directly: as h falls, s falls faster, the available correction vanishes,
    // and any error not caused by curvature (crease, or the facet's own shape) stays exactly where it was.
    const imp: number[] = []; const rot: number[] = []; let viol = 0; const slack: number[] = [];
    for (const r of rs) {
      const mx = Math.max(r.chTheta[p][0], r.chTheta[p][1]);
      const rmax = Math.max(r.rho[p][0], r.rho[p][1]);
      imp.push(r.parTheta - mx); rot.push(rmax); slack.push(rmax - (r.parTheta - mx));
      if (r.parTheta - mx > rmax + 1e-9) viol += 1;
    }
    const sImp = S(imp); const sRot = S(rot); const sSlack = S(slack);
    const infl = S(rs.map((r) => r.areaInfl[p]));
    const sDPerp = S(rs.map((r) => r.dPerp[p])); const sDPar = S(rs.map((r) => r.dPar[p]));
    const psag = S(rs.map((r) => r.parSag)); const csag = S(rs.flatMap((r) => r.chSag[p]));
    const parFracDeg = (100 * aParOverDegHere) / aParHere; const chFracDeg = (100 * areaChOverDeg) / areaCh;
    const parFracUm = (100 * aParOverUmHere) / aParHere; const chFracUm = (100 * areaChOverUm) / areaCh;
    log('');
    log(`── ${PNAME[p]}  (${rs.length}/${rows.length} valid) ───────────────────────────────────────────`);
    log(`   LIFT      dPerp p50 ${pq(sDPerp, 0.5).toFixed(3)} p99 ${pq(sDPerp, 0.99).toFixed(2)} um   dPar(IN-PLANE) p50 ${pq(sDPar, 0.5).toFixed(3)} p99 ${pq(sDPar, 0.99).toFixed(1)} um   dPar/dPerp p50 ${(pq(sDPar, 0.5) / Math.max(1e-12, pq(sDPerp, 0.5))).toFixed(2)}`);
    log(`   TILING    area(children)/area(parent)  p50 ${pq(infl, 0.5).toFixed(6)} p99 ${pq(infl, 0.99).toFixed(4)} TOTAL ${(areaCh / aParHere).toFixed(4)}   splits that leave the segment ${nOut} (${((100 * nOut) / rs.length).toFixed(2)}%)`);
    log(`   ROTATION  rho p50 ${(pq(sRho, 0.5) * DEG).toFixed(4)} p90 ${(pq(sRho, 0.9) * DEG).toFixed(3)} p99 ${(pq(sRho, 0.99) * DEG).toFixed(2)} deg   INVERTED children (rho>90) ${nInv}/${nCh} = ${((100 * nInv) / nCh).toFixed(3)}%`);
    log(`   IDENTITY  |rho-atan(dPerp/aPerp)| all p99 ${pq(sEI, 0.99).toExponential(2)}   NON-INVERTED p99 ${pq(sEN, 0.99).toExponential(2)} max ${(sEN.length ? sEN[sEN.length - 1] : NaN).toExponential(2)} rad   [vacuity: vs diam p50 ${pq(sED, 0.5).toExponential(2)}]`);
    log(`   PROXY s/h rho/(sPar/diamChild) p10 ${pq(sRatio, 0.1).toFixed(3)} p50 ${pq(sRatio, 0.5).toFixed(3)} p90 ${pq(sRatio, 0.9).toFixed(2)}   SPEARMAN exact ${spearman(rr, exact).toFixed(4)} | s/alt ${spearman(rr, proxAlt).toFixed(4)} | s/diam ${spearman(rr, prox).toFixed(4)}`);
    log(`   SURFACE   improve(area-mean) ${((100 * better) / rs.length).toFixed(2)}%   improve(worst child) ${((100 * betterMax) / rs.length).toFixed(2)}%`);
    log(`   *** CEILING  theta_par - max theta_child  p50 ${(pq(sImp, 0.5) * DEG).toFixed(4)} p99 ${(pq(sImp, 0.99) * DEG).toFixed(3)} deg   vs  max rho  p50 ${(pq(sRot, 0.5) * DEG).toFixed(4)} p99 ${(pq(sRot, 0.99) * DEG).toFixed(3)} deg   VIOLATIONS of (improvement <= rotation): ${viol}/${rs.length}   slack p50 ${(pq(sSlack, 0.5) * DEG).toFixed(4)} deg ***`);
    log(`   OVER-BAR  ${BAR_DEG}deg AREA FRACTION ${parFracDeg.toFixed(3)}% -> ${chFracDeg.toFixed(3)}%  (x${(chFracDeg / Math.max(1e-9, parFracDeg)).toFixed(3)})   ABSOLUTE AREA x${((areaChOverDeg / Math.max(1e-30, aParOverDegHere))).toFixed(3)}`);
    log(`             ${BAR_UM}um  AREA FRACTION ${parFracUm.toFixed(3)}% -> ${chFracUm.toFixed(3)}%  (x${(chFracUm / Math.max(1e-9, parFracUm)).toFixed(3)})   ABSOLUTE AREA x${((areaChOverUm / Math.max(1e-30, aParOverUmHere))).toFixed(3)}   COUNT ${nParOverUm} -> ${nChOverUm}`);
    log(`   POSITION  parent sag p99 ${pq(psag, 0.99).toFixed(3)} max ${psag[psag.length - 1].toFixed(2)}   children p99 ${pq(csag, 0.99).toFixed(3)} max ${csag[csag.length - 1].toFixed(2)} um   worse-than-parent ${((100 * worsePos) / rs.length).toFixed(2)}%`);
    // stratify
    const strat = (label: string, sel: (r: Row) => boolean): void => {
      const sub = rs.filter(sel); if (sub.length === 0) { log(`      ${label.padEnd(26)} n=0`); return; }
      let bc = 0; let apo = 0; let ap2 = 0; let aco = 0; let ac = 0; const rl: number[] = []; let iv = 0; let nc2 = 0;
      for (const r of sub) {
        let aw = 0; let at = 0;
        for (let i = 0; i < 2; i += 1) { at += r.chArea[p][i]; aw += r.chArea[p][i] * r.chTheta[p][i]; ac += r.chArea[p][i]; if (r.chTheta[p][i] > barRad) aco += r.chArea[p][i]; rl.push(r.rho[p][i]); nc2 += 1; if (r.rho[p][i] > Math.PI / 2) iv += 1; }
        ap2 += r.parArea; if (r.parTheta > barRad) apo += r.parArea;
        if (aw / Math.max(1e-30, at) <= r.parTheta) bc += 1;
      }
      const sr = S(rl);
      log(`      ${label.padEnd(26)} n=${String(sub.length).padStart(5)} improve ${((100 * bc) / sub.length).toFixed(1).padStart(5)}%  over-${BAR_DEG}deg AREA ${((100 * apo) / ap2).toFixed(2).padStart(6)}% -> ${((100 * aco) / ac).toFixed(2).padStart(6)}%  rho p50 ${(pq(sr, 0.5) * DEG).toFixed(3).padStart(8)} p99 ${(pq(sr, 0.99) * DEG).toFixed(1).padStart(6)} deg  inv ${((100 * iv) / nc2).toFixed(2)}%`);
    };
    strat('aspect3 < 4', (r) => r.parAsp < 4);
    strat('aspect3 4..50', (r) => r.parAsp >= 4 && r.parAsp < 50);
    strat('aspect3 >= 50 (sliver)', (r) => r.parAsp >= 50);
    strat('spread < .5*theta MIS-ORI', (r) => r.parSpread < 0.5 * r.parTheta);
    strat('spread >= .5*theta TURN', (r) => r.parSpread >= 0.5 * r.parTheta);
    appendFileSync(NDJSON, `${JSON.stringify({
      tag: TAG, style: STYLE, stem: STEM, pop: name, placement: PNAME[p], n: rs.length, k: K, inset: INSET,
      idP99: pq(sEI, 0.99), idNoInvP99: pq(sEN, 0.99), invPct: (100 * nInv) / nCh, outsidePct: (100 * nOut) / rs.length,
      dPerpP50: pq(sDPerp, 0.5), dParP50: pq(sDPar, 0.5), areaInflTotal: areaCh / aParHere, areaInflP50: pq(infl, 0.5),
      rhoP50deg: pq(sRho, 0.5) * DEG, rhoP99deg: pq(sRho, 0.99) * DEG,
      proxyP50: pq(sRatio, 0.5), spearExact: spearman(rr, exact), spearSagAlt: spearman(rr, proxAlt), spearSagDiam: spearman(rr, prox),
      improvePct: (100 * better) / rs.length, improveMaxPct: (100 * betterMax) / rs.length,
      parFracDeg, chFracDeg, parFracUm, chFracUm,
      absAreaRatioDeg: areaChOverDeg / Math.max(1e-30, aParOverDegHere), absAreaRatioUm: areaChOverUm / Math.max(1e-30, aParOverUmHere),
      posWorsePct: (100 * worsePos) / rs.length, chSagP99: pq(csag, 0.99), chSagMax: csag[csag.length - 1], parSagP99: pq(psag, 0.99),
      ceilViol: viol, impP50deg: pq(sImp, 0.5) * DEG, rotP50deg: pq(sRot, 0.5) * DEG, slackP50deg: pq(sSlack, 0.5) * DEG,
      secs: (Date.now() - T0) / 1000,
    })}\n`);
  }
  log(`   [checkpoint -> ${NDJSON}]`);
}

runPop('MARKED (s65 would split these)', popMark);
runPop('ALL (uniform control)', popAll);
log('');
log(`done  [${el()}]`);
