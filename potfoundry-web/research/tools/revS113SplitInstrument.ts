// revS113SplitInstrument.ts — REVIEW PROBE for S113-OP2 (the "conform split is REFUTED at 1.081x" claim).
//
// I am NOT re-deriving the operator. I copy its scanner / split / retriangulation VERBATIM from
// research/tools/s113opSplit.ts (so the arms are the same arms) and then attack the MEASUREMENT:
//
//  P0  IS THE PLACEBO ACTUALLY A PLACEBO? If the midpoint happens to land on the crease, "the crease
//      location bought 1.001x" is a coincidence of this mesh, not evidence. Measure |s_op - s_mid|*len.
//  P1  THE FINITE-DIFFERENCE STEP OF THE REFERENCE NORMAL IS A MEASUREMENT CHOICE, exactly like `inset`.
//      orientRuler.fdNormals uses hArc=hZ=2e-4 mm and returns BOTH one-sided normals whenever the stencil
//      straddles the crease; orientOfFacet takes the MAX over them. A child whose edge lies ON the crease
//      is therefore scored at the FULL dihedral unless (inset/3)*minAltitude > hArc. The operator's own
//      children have minEdge p50 8.2 um, so this is not hypothetical. SWEEP h and see whether the
//      operator/placebo gap opens.
//  P2  CENSUS of that sufficiency condition over parents and children, COUNT + AREA + MAX.
//  P3  spreadRad (h-FREE) before/after for both arms — a conformance signal the FD step cannot corrupt.
//  P4  INDEPENDENT corroboration of the "90% of crossings are at an existing vertex" reach claim, by a
//      different mechanism: evaluate the kink-aware sampler AT each welded target vertex at a small h and
//      ask whether the vertex itself sits on a crease.
//
// Every number is COUNT + AREA + MAX. Controls 1/2 and the scanner self-test are kept verbatim; if they
// fire this probe is VOID.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJ = process.env.PF_OPS_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const META = NDJ.replace(/\.ndjson$/, '.meta.json');
const STL = process.env.PF_OPS_STL ?? '';
const STYLE = process.env.PF_OPS_STYLE ?? 'GothicArches';
const TAG = process.env.PF_OPS_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_OPS_H', 120), Rb: envF('PF_OPS_RB', 40), Rt: envF('PF_OPS_RT', 50), expn: 1 };
const H = DIMS.H;

const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const SHAPE_AR = envF('PF_CB_SHAPE_AR', 50);
const GAP_FIND = envF('PF_OPS_GAPFIND', 2);
const REF_ITERS = Math.round(envF('PF_OPS_REFIT', 60));
const H_MIN = envF('PF_OPS_HMIN', 1e-7);
const SCAN_N = Math.round(envF('PF_OPS_N', 256));
const THR_PRIMARY = envF('PF_OPS_THR', 15);
const BAR_DEG = envF('PF_OPS_BAR', 45);
const INSET_PRIMARY = envF('PF_OPS_INSET', 0.05);
const K = Math.round(envF('PF_OPS_K', 8));
const HSWEEP = (process.env.PF_REV_HS ?? '2e-4,2e-5,2e-6,2e-7').split(',').map(Number);

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
mkdirSync(OUTDIR, { recursive: true });

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const dist = (v: number[], f = 4): string => (v.length === 0 ? '(empty)'
  : `min ${q(v, 0).toFixed(f)} p10 ${q(v, 0.1).toFixed(f)} p50 ${q(v, 0.5).toFixed(f)} p90 ${q(v, 0.9).toFixed(f)} max ${q(v, 0.999999).toFixed(f)}`);
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
const triArea = (t: ArrayLike<number>, o = 0): number => {
  const ux = t[o + 3] - t[o]; const uy = t[o + 4] - t[o + 1]; const uz = t[o + 5] - t[o + 2];
  const wx = t[o + 6] - t[o]; const wy = t[o + 7] - t[o + 1]; const wz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
/** min altitude = 2*area / longest edge. The lattice's closest approach to an edge is (inset/3)*altitude. */
function minAltitude(t: ArrayLike<number>, o = 0): number {
  const e0 = Math.hypot(t[o + 3] - t[o], t[o + 4] - t[o + 1], t[o + 5] - t[o + 2]);
  const e1 = Math.hypot(t[o + 6] - t[o + 3], t[o + 7] - t[o + 4], t[o + 8] - t[o + 5]);
  const e2 = Math.hypot(t[o] - t[o + 6], t[o + 1] - t[o + 7], t[o + 2] - t[o + 8]);
  const L = Math.max(e0, e1, e2);
  return L > 0 ? (2 * triArea(t, o)) / L : 0;
}

log('===== REV-S113OP2 — IS THE INSTRUMENT DOING THE WORK? =====');
log(`ndjson ${NDJ}`);
log(`arms rebuilt verbatim from s113opSplit.ts; crease bar ${THR_PRIMARY} deg, N ${SCAN_N}, inset ${INSET_PRIMARY}, k=${K}, winding`);
log(`FD-STEP SWEEP of fdNormals(hArc=hZ): ${HSWEEP.map((x) => x.toExponential(0)).join(', ')} mm   (campaign default 2e-4)`);
log('');

interface Row { e: number; f1: number; f2: number; normHi: number; area1: number; area2: number; tri1: number[]; tri2: number[] }
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
const meta = JSON.parse(readFileSync(META, 'utf8')) as { meshAreaMm2: number; uniqueFacets: number; targetAreaMm2: number; meshFacets: number };
log(`${rows.length} pairs read   (pinned 3282)   ${el()}`);

interface FacetRec { f: number; xyz: number[]; area: number }
const facets = new Map<number, FacetRec>();
let areaMismatch = 0;
for (const r of rows) {
  for (const [f, tri, area] of [[r.f1, r.tri1, r.area1], [r.f2, r.tri2, r.area2]] as Array<[number, number[], number]>) {
    const prev = facets.get(f);
    if (prev === undefined) { facets.set(f, { f, xyz: tri, area }); continue; }
    if (Math.abs(prev.area - area) > 0) areaMismatch += 1;
  }
}
let classArea = 0;
for (const fr of facets.values()) classArea += fr.area;
const meshArea = meta.meshAreaMm2;
log('── CONTROL 1 ──');
log(`  unique facets ${facets.size} (pinned ${meta.uniqueFacets});  class AREA ${classArea.toFixed(4)} mm2 (pinned ${meta.targetAreaMm2.toFixed(4)});  repeats disagreeing ${areaMismatch}`);
const CTRL1 = facets.size === meta.uniqueFacets && Math.abs(classArea - meta.targetAreaMm2) < 1e-9 && areaMismatch === 0;
log(`  ${CTRL1 ? 'OK' : '*** CONTROL 1 FIRED — VOID ***'}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
if (STL === '') { log('*** no PF_OPS_STL — REFUSING ***'); process.exit(4); }
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
let CTRL2 = true;
log('── CONTROL 2 ──');
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`  PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310)`);
  if (nTri !== meta.meshFacets || worst * 1000 > 0.05) CTRL2 = false;
  let coordBad = 0;
  for (const fr of facets.values()) for (let k = 0; k < 9; k += 1) if (!Object.is(xyz[fr.f * 9 + k], fr.xyz[k])) coordBad += 1;
  log(`  mesh ${nTri} facets;  ndjson tri coords vs STL: ${coordBad} disagree (must be 0)`);
  if (coordBad !== 0) CTRL2 = false;
  log(`  ${CTRL2 ? 'OK' : '*** CONTROL 2 FIRED — VOID ***'}`);
}
log('');

// ── the dense boundary scanner, verbatim ────────────────────────────────────────────────────────────────
const angOf = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let d = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  d = d > 1 ? 1 : d < -1 ? -1 : d;
  return (Math.acos(d) * 180) / Math.PI;
};
interface Cross { s: number; turnDeg: number; brWidthMm: number }
function makeScanner(R: (th: number, z: number) => number): (th0: number, z0: number, th1: number, z1: number, lenMm: number, N: number) => Cross[] {
  const nBuf = new Float64Array(3 * 1030);
  const n0 = new Float64Array(3); const n1 = new Float64Array(3);
  const normalAt = (th: number, z: number, h: number, out: Float64Array, o: number): void => {
    const r0 = R(th, z);
    const hTh = h / Math.max(1e-9, Math.abs(r0));
    const rt = (R(th + hTh, z) - R(th - hTh, z)) / (2 * hTh);
    let zLo = z - h; let zHi = z + h;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * h); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * h); }
    const rz = zHi > zLo ? (R(th, zHi) - R(th, zLo)) / (zHi - zLo) : 0;
    radialNormal(r0, rt, rz, th, out, o);
  };
  return (th0: number, z0: number, th1: number, z1: number, lenMm: number, N: number): Cross[] => {
    const out: Cross[] = [];
    if (!(lenMm > 0)) return out;
    const dth = th1 - th0; const dz = z1 - z0;
    const hScan = Math.max(H_MIN, lenMm / (8 * N));
    for (let k = 0; k <= N; k += 1) normalAt(th0 + dth * (k / N), z0 + dz * (k / N), hScan, nBuf, 3 * k);
    let k0 = -1; let acc = 0;
    const flush = (kEnd: number): void => {
      if (k0 < 0) return;
      let lo = k0 / N; let hi = (kEnd + 1) / N;
      const MM = 16;
      for (let lvl = 0; lvl < REF_ITERS; lvl += 1) {
        const wMm = lenMm * (hi - lo);
        if (!(wMm > 8 * H_MIN) || wMm <= 1e-6) break;
        const h = wMm / (8 * MM);
        for (let k = 0; k <= MM; k += 1) {
          const t = lo + ((hi - lo) * k) / MM;
          normalAt(th0 + dth * t, z0 + dz * t, h, nBuf, 3 * k);
        }
        let bg = -1; let bi = 0;
        for (let k = 0; k < MM; k += 1) { const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1)); if (g > bg) { bg = g; bi = k; } }
        const a2 = lo + ((hi - lo) * Math.max(0, bi - 1)) / MM;
        const b2 = lo + ((hi - lo) * Math.min(MM, bi + 2)) / MM;
        lo = a2; hi = b2;
      }
      const w = hi - lo;
      const h = Math.max(H_MIN, (lenMm * w) / 8);
      const tL = lo - w; const tR = hi + w;
      normalAt(th0 + dth * tL, z0 + dz * tL, h, n0, 0);
      normalAt(th0 + dth * tR, z0 + dz * tR, h, n1, 0);
      out.push({ s: 0.5 * (lo + hi), turnDeg: angOf(n0, 0, n1, 0), brWidthMm: lenMm * w });
      k0 = -1; acc = 0;
    };
    for (let k = 0; k < N; k += 1) {
      const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1));
      if (g > GAP_FIND) { if (k0 < 0) k0 = k; acc += g; } else flush(k - 1);
    }
    flush(N - 1);
    return out;
  };
}
let SELFTEST = true;
{
  const R0 = 40; const AMP = 2; const TH0 = 0.3; const W = 0.01;
  const sT = makeScanner((th) => R0 + AMP * Math.max(0, 1 - Math.abs(th - TH0) / W));
  const thA = 0.292; const thB = 0.318; const lenT = R0 * (thB - thA);
  const rawT = sT(thA, 50, thB, 50, lenT, 256);
  const gotT = rawT.filter((c) => c.turnDeg >= 5);
  const sCrest = (TH0 - thA) / (thB - thA); const sClamp = (TH0 + W - thA) / (thB - thA);
  const tCrest = (2 * Math.atan((AMP / W) / (R0 + AMP)) * 180) / Math.PI;
  const tClamp = (Math.atan((AMP / W) / R0) * 180) / Math.PI;
  const okN = gotT.length === 2;
  const okA = okN && Math.abs(gotT[0].s - sCrest) * lenT < 1e-3 && Math.abs(gotT[0].turnDeg - tCrest) < 0.5;
  const okB = okN && Math.abs(gotT[1].s - sClamp) * lenT < 1e-3 && Math.abs(gotT[1].turnDeg - tClamp) < 0.5;
  const sS = makeScanner((th) => R0 + AMP * Math.cos(60 * th));
  const overS = sS(thA, 50, thB, 50, lenT, 256).filter((c) => c.turnDeg >= 5);
  SELFTEST = okN && okA && okB && overS.length === 0;
  log(`── SCANNER SELF-TEST (two-sided): ${SELFTEST ? 'PASS' : '*** FAILED — VOID ***'} (count ${okN}, crest ${okA}, clamp ${okB}, smooth ${overS.length === 0})`);
  log('');
}
const scanEdge = makeScanner(rA);

// ── weld, edge use, target edges, scan — verbatim ────────────────────────────────────────────────────────
const isTarget = new Uint8Array(nTri);
for (const f of facets.keys()) isTarget[f] = 1;
const vKeyBuckets = new Map<number, number[]>();
const canX: number[] = []; const canY: number[] = []; const canZ: number[] = [];
const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
const hashOf = (x: number, y: number, z: number): number => {
  f32[0] = x; f32[1] = y; f32[2] = z;
  return ((u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35)) | 0;
};
const findV = (x: number, y: number, z: number): number => {
  const b = vKeyBuckets.get(hashOf(x, y, z));
  if (b === undefined) return -1;
  for (const c of b) if (canX[c] === x && canY[c] === y && canZ[c] === z) return c;
  return -1;
};
const addV = (x: number, y: number, z: number): number => {
  const h = hashOf(x, y, z);
  const b = vKeyBuckets.get(h);
  if (b !== undefined) { for (const c of b) if (canX[c] === x && canY[c] === y && canZ[c] === z) return c; }
  const id = canX.length; canX.push(x); canY.push(y); canZ.push(z);
  if (b === undefined) vKeyBuckets.set(h, [id]); else b.push(id);
  return id;
};
for (const fr of facets.values()) for (let k = 0; k < 3; k += 1) addV(fr.xyz[k * 3], fr.xyz[k * 3 + 1], fr.xyz[k * 3 + 2]);
const EK = (a: number, b: number): number => (a < b ? a * 2097152 + b : b * 2097152 + a);
const edgeUse = new Map<number, number[]>();
{
  const vid = new Int32Array(3);
  for (let f = 0; f < nTri; f += 1) {
    let nFound = 0;
    for (let k = 0; k < 3; k += 1) {
      vid[k] = findV(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3 + 2]);
      if (vid[k] >= 0) nFound += 1;
    }
    if (nFound < 2) continue;
    for (let k = 0; k < 3; k += 1) {
      const j = (k + 1) % 3;
      if (vid[k] < 0 || vid[j] < 0) continue;
      const key = EK(vid[k], vid[j]);
      const u = edgeUse.get(key);
      if (u === undefined) edgeUse.set(key, [f * 4 + k]); else u.push(f * 4 + k);
    }
  }
}
interface EdgeRec { key: number; vLo: number; vHi: number; lenMm: number; crosses: Cross[] }
const targetEdges = new Map<number, EdgeRec>();
for (const fr of facets.values()) {
  const t = fr.xyz;
  const v = [0, 1, 2].map((k) => findV(t[k * 3], t[k * 3 + 1], t[k * 3 + 2]));
  for (let k = 0; k < 3; k += 1) {
    const j = (k + 1) % 3;
    const key = EK(v[k], v[j]);
    if (targetEdges.has(key)) continue;
    const lo = Math.min(v[k], v[j]); const hi = Math.max(v[k], v[j]);
    targetEdges.set(key, { key, vLo: lo, vHi: hi, lenMm: Math.hypot(canX[hi] - canX[lo], canY[hi] - canY[lo], canZ[hi] - canZ[lo]), crosses: [] });
  }
}
for (const er of targetEdges.values()) {
  const thL = Math.atan2(canY[er.vLo], canX[er.vLo]);
  const thH = thL + dThRaw(thL, Math.atan2(canY[er.vHi], canX[er.vHi]));
  er.crosses = scanEdge(thL, canZ[er.vLo], thH, canZ[er.vHi], er.lenMm, SCAN_N);
}
log(`welded ${canX.length} target vertices; ${targetEdges.size} target edges scanned  ${el()}`);
log('');

type Arm = 'crease' | 'mid';
interface SplitPt { s: number; sLocal: number; x: number; y: number; z: number; turnDeg: number }
function buildSplits(thr: number, arm: Arm): Map<number, SplitPt[]> {
  const out = new Map<number, SplitPt[]>();
  for (const er of targetEdges.values()) {
    const accepted: number[] = []; const turns: number[] = [];
    const thL = Math.atan2(canY[er.vLo], canX[er.vLo]);
    const thH = thL + dThRaw(thL, Math.atan2(canY[er.vHi], canX[er.vHi]));
    for (const c of er.crosses) {
      if (!(c.turnDeg >= thr)) continue;
      if (c.s * er.lenMm < FLOOR_MM || (1 - c.s) * er.lenMm < FLOOR_MM) continue;
      if (accepted.some((p) => Math.abs(p - c.s) * er.lenMm < FLOOR_MM)) continue;
      accepted.push(c.s); turns.push(c.turnDeg);
    }
    if (accepted.length === 0) continue;
    const ord = accepted.map((_v, i) => i).sort((a, b) => accepted[a] - accepted[b]);
    const m = accepted.length;
    const keep: SplitPt[] = [];
    for (let i = 0; i < m; i += 1) {
      const sUse = arm === 'mid' ? (i + 1) / (m + 1) : accepted[ord[i]];
      const th = thL + sUse * (thH - thL);
      const zz = canZ[er.vLo] + sUse * (canZ[er.vHi] - canZ[er.vLo]);
      const r = rA(th, zz);
      keep.push({ s: sUse, sLocal: sUse, x: r * Math.cos(th), y: r * Math.sin(th), z: zz, turnDeg: turns[ord[i]] });
    }
    out.set(er.key, keep);
  }
  return out;
}
let fanFallbacks = 0;
const REF_X = [0, 1, 0.5]; const REF_Y = [0, 0, 0.8660254037844386];
function triMinAng(t: number[]): number {
  const ang = (px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number): number => {
    const ux = qx - px; const uy = qy - py; const uz = qz - pz;
    const wx = rx - px; const wy = ry - py; const wz = rz - pz;
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    return (Math.atan2(Math.hypot(cx, cy, cz), ux * wx + uy * wy + uz * wz) * 180) / Math.PI;
  };
  return Math.min(
    ang(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]),
    ang(t[3], t[4], t[5], t[6], t[7], t[8], t[0], t[1], t[2]),
    ang(t[6], t[7], t[8], t[0], t[1], t[2], t[3], t[4], t[5]),
  );
}
function retriangulate(tri: ArrayLike<number>, o: number, ptsPerCorner: SplitPt[][]): number[][] {
  const P: number[][] = []; const X: number[] = []; const Y: number[] = []; const SIDE: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    const j = (k + 1) % 3;
    P.push([tri[o + k * 3], tri[o + k * 3 + 1], tri[o + k * 3 + 2]]);
    X.push(REF_X[k]); Y.push(REF_Y[k]);
    SIDE.push((1 << k) | (1 << ((k + 2) % 3)));
    for (const p of ptsPerCorner[k]) {
      P.push([p.x, p.y, p.z]);
      X.push(REF_X[k] + p.sLocal * (REF_X[j] - REF_X[k]));
      Y.push(REF_Y[k] + p.sLocal * (REF_Y[j] - REF_Y[k]));
      SIDE.push(1 << k);
    }
  }
  const n = P.length;
  if (n === 3) return [[...P[0], ...P[1], ...P[2]]];
  const idx = P.map((_p, i) => i);
  const out: number[][] = [];
  while (idx.length > 3) {
    let best = -1; let bestQ = -Infinity; let bestCross = -Infinity; let bestCrossI = -1;
    for (let i = 0; i < idx.length; i += 1) {
      const a = idx[(i - 1 + idx.length) % idx.length]; const b = idx[i]; const c = idx[(i + 1) % idx.length];
      const cr = (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
      if ((SIDE[a] & SIDE[c]) !== 0) continue;
      if (cr > bestCross) { bestCross = cr; bestCrossI = i; }
      if (!(cr > 0)) continue;
      const qy = triMinAng([...P[a], ...P[b], ...P[c]]);
      if (qy > bestQ) { bestQ = qy; best = i; }
    }
    if (best < 0) { best = bestCrossI; fanFallbacks += 1; }
    const a = idx[(best - 1 + idx.length) % idx.length]; const b = idx[best]; const c = idx[(best + 1) % idx.length];
    out.push([...P[a], ...P[b], ...P[c]]);
    idx.splice(best, 1);
  }
  out.push([...P[idx[0]], ...P[idx[1]], ...P[idx[2]]]);
  return out;
}
interface Applied { splitFacets: Set<number>; childrenOf: Map<number, number[][]>; nSplitPts: number; nNew: number }
function applySplits(splits: Map<number, SplitPt[]>): Applied {
  const touched = new Map<number, SplitPt[][]>();
  const vid = new Int32Array(3);
  for (const [key, pts] of splits) {
    for (const u of edgeUse.get(key) ?? []) {
      const f = u >> 2; const corner = u & 3;
      let rec = touched.get(f);
      if (rec === undefined) { rec = [[], [], []]; touched.set(f, rec); }
      for (let k = 0; k < 3; k += 1) vid[k] = findV(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3 + 2]);
      const er = targetEdges.get(key) as EdgeRec;
      const forward = vid[corner] === er.vLo;
      rec[corner] = (forward ? pts : pts.slice().reverse()).map((p) => ({ ...p, sLocal: forward ? p.s : 1 - p.s }));
    }
  }
  const childrenOf = new Map<number, number[][]>();
  let extra = 0;
  for (const [f, per] of touched) { const kids = retriangulate(xyz, f * 9, per); childrenOf.set(f, kids); extra += kids.length - 1; }
  let nPts = 0; for (const p of splits.values()) nPts += p.length;
  return { splitFacets: new Set([...touched.keys()].filter((f) => isTarget[f] === 1)), childrenOf, nSplitPts: nPts, nNew: nTri + extra };
}

const spCrease = buildSplits(THR_PRIMARY, 'crease');
const spMid = buildSplits(THR_PRIMARY, 'mid');
const AC = applySplits(spCrease);
const AM = applySplits(spMid);
log('── ARMS REBUILT (must match the S113-OP2 report: 686 points, 741 class facets, +1372 tris) ──');
log(`  crease: points ${AC.nSplitPts}  class facets split ${AC.splitFacets.size}  tris +${AC.nNew - nTri}  fanFallbacks ${fanFallbacks}`);
log(`  mid   : points ${AM.nSplitPts}  class facets split ${AM.splitFacets.size}  tris +${AM.nNew - nTri}`);
const ARMS_OK = AC.nSplitPts === 686 && AC.splitFacets.size === 741 && AC.nNew - nTri === 1372 && AM.nSplitPts === AC.nSplitPts && AM.nNew === AC.nNew;
log(`  ${ARMS_OK ? 'REPRODUCED — the arms are the same arms' : '*** ARMS DID NOT REPRODUCE — this probe is VOID ***'}`);
log('');

// ── P0: IS THE PLACEBO A PLACEBO? ───────────────────────────────────────────────────────────────────────
log('── P0: HOW FAR IS THE PLACEBO FROM THE CREASE? (if the midpoint IS the crease, the control is vacuous) ──');
{
  const dmm: number[] = []; const dfrac: number[] = [];
  for (const [key, pc] of spCrease) {
    const pm = spMid.get(key) as SplitPt[];
    const er = targetEdges.get(key) as EdgeRec;
    for (let i = 0; i < pc.length; i += 1) { dmm.push(Math.abs(pc[i].s - pm[i].s) * er.lenMm); dfrac.push(Math.abs(pc[i].s - pm[i].s)); }
  }
  log(`  |s_crease - s_mid| * edgeLen, mm: ${dist(dmm, 6)}`);
  log(`  |s_crease - s_mid| (fraction):    ${dist(dfrac, 4)}`);
  for (const L of [FLOOR_MM, 0.005, 0.015]) log(`    placebo within ${(L * 1000).toFixed(1)} um of the crease: ${dmm.filter((x) => x < L).length} of ${dmm.length} = ${((dmm.filter((x) => x < L).length / dmm.length) * 100).toFixed(1)}%`);
  const acc: number[] = [];
  for (const [key, pc] of spCrease) { const er = targetEdges.get(key) as EdgeRec; for (const p of pc) acc.push(Math.min(p.s, 1 - p.s) * er.lenMm); }
  log(`  ACCEPTED crossings' distance to the nearest endpoint, mm: ${dist(acc, 6)}   (the report only printed this for ALL over-bar crossings)`);
}
log('');

// ── P1 + P2: the FD step is a measurement choice ────────────────────────────────────────────────────────
interface Agg { n: number; area: number; max: number; totN: number; totArea: number }
const emptyAgg = (): Agg => ({ n: 0, area: 0, max: 0, totN: 0, totArea: 0 });
const bump = (g: Agg, deg: number, area: number): void => {
  g.totN += 1; g.totArea += area;
  if (Number.isFinite(deg) && deg > BAR_DEG) { g.n += 1; g.area += area; }
  if (Number.isFinite(deg) && deg > g.max) g.max = deg;
};
const fmt = (g: Agg): string => `COUNT ${String(g.n).padStart(5)}  AREA ${g.area.toFixed(4).padStart(9)} mm2 (${((g.area / g.totArea) * 100).toFixed(2)}% of region)  MAX ${g.max.toFixed(2)} deg   [region ${g.totN} / ${g.totArea.toFixed(4)} mm2]`;
const scratch = new Float64Array(12);
function orientAt(ns: NormalSampler, t: ArrayLike<number>, o: number, inset: number): { normDeg: number; spreadDeg: number } {
  const a = Math.atan2(t[o + 1], t[o]);
  const b = a + dThRaw(a, Math.atan2(t[o + 4], t[o + 3]));
  const c = a + dThRaw(a, Math.atan2(t[o + 7], t[o + 6]));
  const r = orientOfFacet(ns, t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8], a, b, c, { k: K, inset, scratch });
  return { normDeg: r.normDeg, spreadDeg: (r.spreadRad * 180) / Math.PI };
}

log('── P1: FD-STEP SWEEP. Same facets, same inset 0.05, same k=8, same bar 45 deg — ONLY hArc/hZ moves. ──');
log('   (a child whose edge lies ON the crease is scored at the full dihedral unless (inset/3)*minAltitude > hArc)');
const table: Array<{ h: number; whole: Record<string, number>; reach: Record<string, number> }> = [];
for (const hh of HSWEEP) {
  const ns = fdNormals(rA, H, hh, hh);
  const gB = emptyAgg(); const gC = emptyAgg(); const gM = emptyAgg();
  const rB = emptyAgg(); const rC = emptyAgg(); const rM = emptyAgg();
  for (const fr of facets.values()) {
    const o = orientAt(ns, fr.xyz, 0, INSET_PRIMARY);
    bump(gB, o.normDeg, fr.area);
    const inReach = AC.splitFacets.has(fr.f);
    if (inReach) bump(rB, o.normDeg, fr.area);
    for (const [AA, gg, rr] of [[AC, gC, rC], [AM, gM, rM]] as Array<[Applied, Agg, Agg]>) {
      const kids = AA.childrenOf.get(fr.f);
      if (kids === undefined) { bump(gg, o.normDeg, fr.area); if (inReach) bump(rr, o.normDeg, fr.area); continue; }
      for (const kd of kids) { const ok = orientAt(ns, kd, 0, INSET_PRIMARY); bump(gg, ok.normDeg, triArea(kd)); if (inReach) bump(rr, ok.normDeg, triArea(kd)); }
    }
  }
  log(`  hArc = hZ = ${hh.toExponential(0)} mm`);
  log(`    WHOLE CLASS  BEFORE   ${fmt(gB)}`);
  log(`    WHOLE CLASS  CREASE   ${fmt(gC)}`);
  log(`    WHOLE CLASS  PLACEBO  ${fmt(gM)}`);
  log(`      ==> AREA ratio  crease ${(gB.area / Math.max(1e-12, gC.area)).toFixed(3)}x   placebo ${(gB.area / Math.max(1e-12, gM.area)).toFixed(3)}x   crease-over-placebo ${(gM.area / Math.max(1e-12, gC.area)).toFixed(3)}x`);
  log(`      ==> COUNT ratio crease ${(gB.n / Math.max(1, gC.n)).toFixed(3)}x   placebo ${(gB.n / Math.max(1, gM.n)).toFixed(3)}x`);
  log(`    REACH ONLY   BEFORE   ${fmt(rB)}`);
  log(`    REACH ONLY   CREASE   ${fmt(rC)}`);
  log(`    REACH ONLY   PLACEBO  ${fmt(rM)}`);
  log(`      ==> AREA ratio  crease ${(rB.area / Math.max(1e-12, rC.area)).toFixed(3)}x   placebo ${(rB.area / Math.max(1e-12, rM.area)).toFixed(3)}x   crease-over-placebo ${(rM.area / Math.max(1e-12, rC.area)).toFixed(3)}x`);
  log(`      ==> COUNT ratio crease ${(rB.n / Math.max(1, rC.n)).toFixed(3)}x   placebo ${(rB.n / Math.max(1, rM.n)).toFixed(3)}x   ${el()}`);
  table.push({
    h: hh,
    whole: { beforeArea: gB.area, creaseArea: gC.area, midArea: gM.area, beforeN: gB.n, creaseN: gC.n, midN: gM.n, beforeMax: gB.max, creaseMax: gC.max, midMax: gM.max },
    reach: { beforeArea: rB.area, creaseArea: rC.area, midArea: rM.area, beforeN: rB.n, creaseN: rC.n, midN: rM.n, beforeMax: rB.max, creaseMax: rC.max, midMax: rM.max },
  });
}
log('');

log('── P2: FD-SUFFICIENCY CENSUS — for how much of the measured population can the ruler SEE a conformed edge? ──');
log('   clearance = (inset/3) * minAltitude = the lattice\'s closest approach to any facet edge.');
log('   clearance <= hArc  =>  a crease lying on that edge is INSIDE the reference normal\'s own stencil,');
log('   so the facet is scored at the full dihedral NO MATTER how perfectly it conforms.');
for (const [nm, src] of [['PARENTS (the 6193 class facets)', 'p'], ['CHILDREN (crease arm)', 'c'], ['CHILDREN (placebo arm)', 'm']] as Array<[string, string]>) {
  const cl: number[] = []; const ar: number[] = [];
  const push = (t: ArrayLike<number>, o: number): void => { cl.push((INSET_PRIMARY / 3) * minAltitude(t, o)); ar.push(triArea(t, o)); };
  if (src === 'p') for (const fr of facets.values()) push(fr.xyz, 0);
  else {
    const AA = src === 'c' ? AC : AM;
    for (const kids of AA.childrenOf.values()) for (const kd of kids) push(kd, 0);
  }
  let tot = 0; for (const a of ar) tot += a;
  log(`  ${nm}: n ${cl.length}  area ${tot.toFixed(4)} mm2`);
  log(`    clearance mm: ${dist(cl, 8)}`);
  for (const hh of HSWEEP) {
    let n = 0; let a = 0;
    for (let i = 0; i < cl.length; i += 1) if (cl[i] <= hh) { n += 1; a += ar[i]; }
    log(`      blind at hArc ${hh.toExponential(0)}: COUNT ${String(n).padStart(5)} = ${((n / cl.length) * 100).toFixed(1)}%   AREA ${a.toFixed(4)} mm2 = ${((a / tot) * 100).toFixed(2)}%`);
  }
}
log('');

// ── P3: spreadRad — h-free conformance signal ───────────────────────────────────────────────────────────
log('── P3: spreadRad (h-FREE: 2*acos|mean n|) on the REACH. If the split conforms, the surface\'s own turn');
log('   inside each child must collapse — and this quantity cannot be corrupted by the FD step at one point. ──');
{
  const ns = fdNormals(rA, H, 2e-4, 2e-4);
  const sb: number[] = []; const sc: number[] = []; const sm: number[] = [];
  let ab = 0; let acA = 0; let amA = 0; let bn = 0; let cn = 0; let mn = 0;
  const BARS = 45;
  for (const f of AC.splitFacets) {
    const fr = facets.get(f) as FacetRec;
    const o = orientAt(ns, fr.xyz, 0, INSET_PRIMARY);
    sb.push(o.spreadDeg); if (o.spreadDeg > BARS) { bn += 1; ab += fr.area; }
    for (const [AA, arr] of [[AC, sc], [AM, sm]] as Array<[Applied, number[]]>) {
      for (const kd of AA.childrenOf.get(f) as number[][]) {
        const ok = orientAt(ns, kd, 0, INSET_PRIMARY); arr.push(ok.spreadDeg);
        if (ok.spreadDeg > BARS) { if (AA === AC) { cn += 1; acA += triArea(kd); } else { mn += 1; amA += triArea(kd); } }
      }
    }
  }
  log(`  BEFORE  spreadDeg ${dist(sb, 2)}   over ${BARS} deg: COUNT ${bn}  AREA ${ab.toFixed(4)} mm2`);
  log(`  CREASE  spreadDeg ${dist(sc, 2)}   over ${BARS} deg: COUNT ${cn}  AREA ${acA.toFixed(4)} mm2`);
  log(`  PLACEBO spreadDeg ${dist(sm, 2)}   over ${BARS} deg: COUNT ${mn}  AREA ${amA.toFixed(4)} mm2`);
  log(`  ==> spread AREA ratio crease ${(ab / Math.max(1e-12, acA)).toFixed(3)}x  placebo ${(ab / Math.max(1e-12, amA)).toFixed(3)}x  crease-over-placebo ${(amA / Math.max(1e-12, acA)).toFixed(3)}x   ${el()}`);
}
log('');

// ── P4: independent corroboration of "the crease already passes through the vertices" ───────────────────
log('── P4: INDEPENDENT REACH CHECK. Not the boundary scan: evaluate the KINK-AWARE sampler AT each welded');
log('   target vertex and ask whether the vertex itself sits on a crease (max pairwise candidate angle). ──');
{
  const buf = new Float64Array(12);
  const kinkAt = (hh: number, x: number, y: number, z: number): number => {
    const ns = fdNormals(rA, H, hh, hh);
    const th = Math.atan2(y, x);
    const nc = ns(th, z, buf);
    let mx = 0;
    for (let a = 0; a < nc; a += 1) for (let b = 0; b < a; b += 1) {
      let d = buf[3 * a] * buf[3 * b] + buf[3 * a + 1] * buf[3 * b + 1] + buf[3 * a + 2] * buf[3 * b + 2];
      d = d > 1 ? 1 : d < -1 ? -1 : d;
      mx = Math.max(mx, (Math.acos(d) * 180) / Math.PI);
    }
    return mx;
  };
  for (const hh of [1e-4, 1e-5, 1e-6]) {
    const onCrease = new Uint8Array(canX.length);
    let vN = 0;
    for (let v = 0; v < canX.length; v += 1) { if (kinkAt(hh, canX[v], canY[v], canZ[v]) > BAR_DEG) { onCrease[v] = 1; vN += 1; } }
    let fN = 0; let fA = 0; let f2N = 0; let f2A = 0;
    for (const fr of facets.values()) {
      let c = 0;
      for (let k = 0; k < 3; k += 1) { const v = findV(fr.xyz[k * 3], fr.xyz[k * 3 + 1], fr.xyz[k * 3 + 2]); if (v >= 0 && onCrease[v] === 1) c += 1; }
      if (c >= 1) { fN += 1; fA += fr.area; }
      if (c >= 2) { f2N += 1; f2A += fr.area; }
    }
    log(`  h ${hh.toExponential(0)} mm: vertices ON a crease (kink > ${BAR_DEG} deg) ${vN} of ${canX.length} = ${((vN / canX.length) * 100).toFixed(1)}%`);
    log(`    class facets with >=1 such vertex: COUNT ${fN} = ${((fN / facets.size) * 100).toFixed(1)}%   AREA ${fA.toFixed(4)} mm2 = ${((fA / classArea) * 100).toFixed(2)}% of the class`);
    log(`    class facets with >=2 (an EDGE on the crease): COUNT ${f2N} = ${((f2N / facets.size) * 100).toFixed(1)}%   AREA ${f2A.toFixed(4)} mm2 = ${((f2A / classArea) * 100).toFixed(2)}%   ${el()}`);
  }
}
log('');

log('── CONTROLS ──');
log(`  CTRL1 ${CTRL1 ? 'PASS' : 'FIRED'}   CTRL2 ${CTRL2 ? 'PASS' : 'FIRED'}   SELFTEST ${SELFTEST ? 'PASS' : 'FIRED'}   ARMS ${ARMS_OK ? 'REPRODUCED' : 'DRIFTED'}   fanFallbacks ${fanFallbacks} (must be 0)`);
log(`  aspect bar used only for reference: ${SHAPE_AR}`);
writeFileSync(`${OUTDIR}/REV_S113OP2_INSTRUMENT_${TAG}.summary.json`, `${JSON.stringify({ ctrl: { CTRL1, CTRL2, SELFTEST, ARMS_OK, fanFallbacks }, hsweep: table }, null, 2)}\n`);
log(`done ${el()}`);
