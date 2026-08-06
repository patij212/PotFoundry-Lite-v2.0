// revS113SnapAreaConserve.ts — REVIEW PROBE 2 for the S113 snap verdict.
//
// THE INSTRUMENT QUESTION: s113opSnap's kill-line metric sums POST-MOVE facet areas over the facets that
// are still over 45 deg. A facet that the operator COLLAPSED (it reports 252 degenerate + 813 flipped at
// rung 100% RAW) therefore contributes ~0 mm2 to the "after" whether or not it was repaired — so the
// reported AREA ratio can be an artefact of AREA DESTRUCTION rather than of defect removal.
//
// This tool re-applies the SAME rung (100% of L, RAW and GUARDED) and reports AREA CONSERVATION on the
// exact populations the verdict quotes: the 6,193 target facets, and the 1,499 REAL-snap facets that carry
// the "most generous possible reading" (3.076x RAW). If the total area of those populations is conserved,
// the ratios are honest; if it drops, the ratios are inflated IN THE OPERATOR'S FAVOUR and the operator is
// even weaker than reported. Either way the direction is what matters and it is measured, not assumed.
//
// Usage: bash research/tools/run-rev-s113-areaconserve.sh
import { mkdirSync, readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJSON = process.env.PF_S113_SET
  ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const TURN_THR_DEG = envF('PF_S113_TURN', 30);
const MOVE_EPS = envF('PF_S113_MOVE_EPS_UM', 1) / 1000;
const RUNG = envF('PF_REV_RUNG', 1.0);
const HI_DEG = envF('PF_S113_HI_DEG', 45);
const DIMS: StyleDims = { H: envF('PF_S113_H', 120), Rb: envF('PF_S113_RB', 40), Rt: envF('PF_S113_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';

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

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('===== REV-S113 PROBE 2 — IS THE AREA RATIO REAL, OR IS IT AREA DESTRUCTION? =====');
const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um`);
  if (worst * 1000 > 50) { log('*** REFUSING ***'); process.exit(4); }
}
const d0 = facetDihedrals(xyz0, new Uint32Array(nTri * 3).map((_, i) => i));
const nEdge = d0.edgeAngRad.length;

interface Row { e: number; f1: number; f2: number; measDeg: number }
const rows: Row[] = readFileSync(NDJSON, 'utf8').trim().split('\n').map((L) => JSON.parse(L) as Row);
const uniqF: number[] = [...new Set(rows.flatMap((r) => [r.f1, r.f2]))].sort((a, b) => a - b);

const th3 = (a: Float64Array, f: number): [number, number, number] => {
  const t = Math.atan2(a[f * 9 + 1], a[f * 9]);
  return [t, t + dThRaw(t, Math.atan2(a[f * 9 + 4], a[f * 9 + 3])), t + dThRaw(t, Math.atan2(a[f * 9 + 7], a[f * 9 + 6]))];
};
const rRefOf = (a: Float64Array, f: number): number => (
  Math.hypot(a[f * 9], a[f * 9 + 1]) + Math.hypot(a[f * 9 + 3], a[f * 9 + 4]) + Math.hypot(a[f * 9 + 6], a[f * 9 + 7])
) / 3;
const meanEdgeLen = (a: Float64Array, f: number): number => (
  Math.hypot(a[f * 9 + 3] - a[f * 9], a[f * 9 + 4] - a[f * 9 + 1], a[f * 9 + 5] - a[f * 9 + 2])
  + Math.hypot(a[f * 9 + 6] - a[f * 9 + 3], a[f * 9 + 7] - a[f * 9 + 4], a[f * 9 + 8] - a[f * 9 + 5])
  + Math.hypot(a[f * 9] - a[f * 9 + 6], a[f * 9 + 1] - a[f * 9 + 7], a[f * 9 + 2] - a[f * 9 + 8])
) / 3;

interface Plan { f: number; vi: number; th: number; z: number; move3d: number; L: number }
const edgeLoc = new Map<number, Array<{ s: number; turnDeg: number }>>();
function locsOf(a: Float64Array, f: number): Array<{ s: number; turnDeg: number }> {
  const hit = edgeLoc.get(f);
  if (hit !== undefined) return hit;
  const [ath, bth, cth] = th3(a, f);
  const ths = [ath, bth, cth]; const zs = [a[f * 9 + 2], a[f * 9 + 5], a[f * 9 + 8]];
  const rRef = rRefOf(a, f);
  const out: Array<{ s: number; turnDeg: number }> = [];
  for (let ei = 0; ei < 3; ei += 1) {
    const lt = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[(ei + 1) % 3], zs[(ei + 1) % 3], rRef, 14);
    out.push({ s: lt.s, turnDeg: (lt.turn * 180) / Math.PI });
  }
  edgeLoc.set(f, out); return out;
}
function planFor(a: Float64Array, f: number, thrDeg: number): Plan | null {
  const [ath, bth, cth] = th3(a, f);
  const ths = [ath, bth, cth]; const zs = [a[f * 9 + 2], a[f * 9 + 5], a[f * 9 + 8]];
  const rRef = rRefOf(a, f);
  const px = [rRef * ths[0], rRef * ths[1], rRef * ths[2]]; const py = [zs[0], zs[1], zs[2]];
  const el3 = locsOf(a, f);
  const cross: Array<{ ei: number; s: number; x: number; y: number }> = [];
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    if (el3[ei].turnDeg <= thrDeg) continue;
    cross.push({ ei, s: el3[ei].s, x: px[ei] + (px[j] - px[ei]) * el3[ei].s, y: py[ei] + (py[j] - py[ei]) * el3[ei].s });
  }
  if (cross.length === 0) return null;
  const L = meanEdgeLen(a, f);
  const cands: Array<{ m: number; x: number; y: number }> = [];
  for (let m = 0; m < 3; m += 1) {
    const inc = cross.filter((c) => c.ei === m || c.ei === (m + 2) % 3);
    if (inc.length < 2) continue;
    const [p1, p2] = inc;
    const ex = p2.x - p1.x; const ey = p2.y - p1.y; const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((px[m] - p1.x) * ex + (py[m] - p1.y) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    cands.push({ m, x: p1.x + ex * t, y: p1.y + ey * t });
  }
  if (cands.length === 0) {
    const c = cross[0]; const i = c.ei; const j = (c.ei + 1) % 3;
    const di = Math.hypot(px[i] - c.x, py[i] - c.y); const dj = Math.hypot(px[j] - c.x, py[j] - c.y);
    cands.push({ m: di <= dj ? i : j, x: c.x, y: c.y });
  }
  let best: Plan | null = null;
  for (const cd of cands) {
    let bx = cd.x; let by = cd.y;
    let dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
    if (dd > 1e-12) {
      const ux = (bx - px[cd.m]) / dd; const uy = (by - py[cd.m]) / dd;
      const dl = Math.max(1e-6, 0.5 * dd);
      const lt = locateTurnAdaptive(rA, H, (bx - ux * dl) / rRef, by - uy * dl, (bx + ux * dl) / rRef, by + uy * dl, rRef, 16);
      if ((lt.turn * 180) / Math.PI > thrDeg) {
        bx = bx - ux * dl + 2 * ux * dl * lt.s; by = by - uy * dl + 2 * uy * dl * lt.s;
        dd = Math.hypot(px[cd.m] - bx, py[cd.m] - by);
      }
    }
    const nth = bx / rRef; const nz = by < 0 ? 0 : by > H ? H : by;
    const nr = rA(nth, nz); const o = f * 9 + cd.m * 3;
    const m3 = Math.hypot(nr * Math.cos(nth) - a[o], nr * Math.sin(nth) - a[o + 1], nz - a[o + 2]);
    if (best === null || m3 < best.move3d) best = { f, vi: cd.m, th: nth, z: nz, move3d: m3, L };
  }
  return best;
}

const plans: Plan[] = [];
for (const f of uniqF) { const p = planFor(xyz0, f, TURN_THR_DEG); if (p !== null) plans.push(p); }
const realSet = new Set(plans.filter((p) => p.move3d >= MOVE_EPS).map((p) => p.f));
log(`plans ${plans.length}  REAL facets ${realSet.size}   ${el()}`);

// ── vertex incidence (exact-coordinate weld, same as s113opSnap) ────────────────────────────────────
const HB = new Float32Array(3); const HU = new Uint32Array(HB.buffer);
const vHash = (x: number, y: number, z: number): number => {
  HB[0] = x; HB[1] = y; HB[2] = z;
  return ((HU[0] * 0x9e3779b1) ^ (HU[1] * 0x85ebca6b) ^ (HU[2] * 0xc2b2ae35)) | 0;
};
type VKey = { key: [number, number, number]; corners: number[] };
const vertReg = new Map<number, VKey[]>();
function regVertex(x: number, y: number, z: number): VKey {
  const h = vHash(x, y, z);
  let list = vertReg.get(h);
  if (list === undefined) { list = []; vertReg.set(h, list); }
  for (const e of list) if (e.key[0] === x && e.key[1] === y && e.key[2] === z) return e;
  const e: VKey = { key: [x, y, z], corners: [] }; list.push(e); return e;
}
for (const p of plans) { const o = p.f * 9 + p.vi * 3; regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]); }
for (let f = 0; f < nTri; f += 1) for (let k = 0; k < 3; k += 1) {
  const o = f * 9 + k * 3;
  const list = vertReg.get(vHash(xyz0[o], xyz0[o + 1], xyz0[o + 2]));
  if (list === undefined) continue;
  for (const e of list) if (e.key[0] === xyz0[o] && e.key[1] === xyz0[o + 1] && e.key[2] === xyz0[o + 2]) { e.corners.push(o); break; }
}

function facetGeom(a: Float64Array): { nx: Float64Array; ny: Float64Array; nz: Float64Array; ar: Float64Array } {
  const nx = new Float64Array(nTri); const ny = new Float64Array(nTri); const nz = new Float64Array(nTri);
  const arr = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ux = a[o + 3] - a[o]; const uy = a[o + 4] - a[o + 1]; const uz = a[o + 5] - a[o + 2];
    const wx = a[o + 6] - a[o]; const wy = a[o + 7] - a[o + 1]; const wz = a[o + 8] - a[o + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const len = Math.hypot(cx, cy, cz);
    arr[f] = 0.5 * len;
    if (len > 0) { nx[f] = cx / len; ny[f] = cy / len; nz[f] = cz / len; }
  }
  return { nx, ny, nz, ar: arr };
}
const G0 = facetGeom(xyz0);
const work = new Float64Array(xyz0);
function facetOk(a: Float64Array, f: number): boolean {
  const o = f * 9;
  const ux = a[o + 3] - a[o]; const uy = a[o + 4] - a[o + 1]; const uz = a[o + 5] - a[o + 2];
  const wx = a[o + 6] - a[o]; const wy = a[o + 7] - a[o + 1]; const wz = a[o + 8] - a[o + 2];
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  const len = Math.hypot(cx, cy, cz);
  if (!(len > 1e-14)) return false;
  return (cx * G0.nx[f] + cy * G0.ny[f] + cz * G0.nz[f]) / len > 0;
}
function applyRung(rung: number, guarded: boolean): void {
  work.set(xyz0);
  const byVert = new Map<VKey, { th: number; z: number; move3d: number }>();
  for (const p of plans) {
    if (!(p.move3d <= rung * p.L)) continue;
    const o = p.f * 9 + p.vi * 3;
    const e = regVertex(xyz0[o], xyz0[o + 1], xyz0[o + 2]);
    const prev = byVert.get(e);
    if (prev !== undefined && p.move3d >= prev.move3d) continue;
    byVert.set(e, { th: p.th, z: p.z, move3d: p.move3d });
  }
  for (const [e, v] of byVert) {
    const z = v.z < 0 ? 0 : v.z > H ? H : v.z; const r = rA(v.th, z);
    const nx = Math.fround(r * Math.cos(v.th)); const ny = Math.fround(r * Math.sin(v.th)); const nz = Math.fround(z);
    const old: number[] = [];
    for (const o of e.corners) old.push(work[o], work[o + 1], work[o + 2]);
    for (const o of e.corners) { work[o] = nx; work[o + 1] = ny; work[o + 2] = nz; }
    if (guarded) {
      let ok = true;
      for (const o of e.corners) if (!facetOk(work, Math.floor(o / 9))) { ok = false; break; }
      if (!ok) for (let i = 0; i < e.corners.length; i += 1) {
        const o = e.corners[i];
        work[o] = old[i * 3]; work[o + 1] = old[i * 3 + 1]; work[o + 2] = old[i * 3 + 2];
      }
    }
  }
}
const sumAr = (g: { ar: Float64Array }, fs: Iterable<number>): number => { let s = 0; for (const f of fs) s += g.ar[f]; return s; };
function overSet(g: { nx: Float64Array; ny: Float64Array; nz: Float64Array }, only?: Set<number>): Set<number> {
  const uf = new Set<number>();
  for (const r of rows) {
    if (only !== undefined && !only.has(r.f1) && !only.has(r.f2)) continue;
    let dd = g.nx[r.f1] * g.nx[r.f2] + g.ny[r.f1] * g.ny[r.f2] + g.nz[r.f1] * g.nz[r.f2];
    dd = dd > 1 ? 1 : dd < -1 ? -1 : dd;
    if ((Math.acos(dd) * 180) / Math.PI > HI_DEG) { uf.add(r.f1); uf.add(r.f2); }
  }
  return uf;
}

for (const guarded of [false, true]) {
  applyRung(RUNG, guarded);
  const G = facetGeom(work);
  const bAll = sumAr(G0, uniqF); const aAll = sumAr(G, uniqF);
  const bReal = sumAr(G0, realSet); const aReal = sumAr(G, realSet);
  let mesh0 = 0; let mesh1 = 0;
  for (let f = 0; f < nTri; f += 1) { mesh0 += G0.ar[f]; mesh1 += G.ar[f]; }
  const oB = overSet(G0); const oA = overSet(G);
  const oBr = overSet(G0, realSet); const oAr = overSet(G, realSet);
  // the honest counterfactual: score the SAME "after" over-45 membership with BEFORE areas
  const aAllOverBeforeAreas = sumAr(G0, oA);
  const aRealOverBeforeAreas = sumAr(G0, oAr);
  log('');
  log(`══ RUNG ${(RUNG * 100).toFixed(0)}%  ARM ${guarded ? 'GUARDED' : 'RAW'} ══`);
  log(`  TOTAL AREA of the 6,193 target facets:  BEFORE ${bAll.toFixed(4)}  AFTER ${aAll.toFixed(4)} mm2  (kept ${((aAll / bAll) * 100).toFixed(2)}%)`);
  log(`  TOTAL AREA of the 1,499 REAL facets:    BEFORE ${bReal.toFixed(4)}  AFTER ${aReal.toFixed(4)} mm2  (kept ${((aReal / bReal) * 100).toFixed(2)}%)`);
  log(`  TOTAL MESH AREA:                        BEFORE ${mesh0.toFixed(2)}  AFTER ${mesh1.toFixed(2)} mm2  (kept ${((mesh1 / mesh0) * 100).toFixed(3)}%)`);
  log(`  over-${HI_DEG}deg set, AS S113 SCORES IT (post-move areas):   COUNT ${oB.size} -> ${oA.size} facets   AREA ${sumAr(G0, oB).toFixed(4)} -> ${sumAr(G, oA).toFixed(4)} mm2  = ${(sumAr(G0, oB) / Math.max(1e-12, sumAr(G, oA))).toFixed(3)}x`);
  log(`  over-${HI_DEG}deg set, SAME membership but BEFORE areas:      COUNT ${oB.size} -> ${oA.size} facets   AREA ${sumAr(G0, oB).toFixed(4)} -> ${aAllOverBeforeAreas.toFixed(4)} mm2  = ${(sumAr(G0, oB) / Math.max(1e-12, aAllOverBeforeAreas)).toFixed(3)}x   <- the ratio with AREA DESTRUCTION REMOVED`);
  log(`  RESTRICTED to REAL, as S113 scores it:  AREA ${sumAr(G0, oBr).toFixed(4)} -> ${sumAr(G, oAr).toFixed(4)} mm2 = ${(sumAr(G0, oBr) / Math.max(1e-12, sumAr(G, oAr))).toFixed(3)}x`);
  log(`  RESTRICTED to REAL, BEFORE areas:       AREA ${sumAr(G0, oBr).toFixed(4)} -> ${aRealOverBeforeAreas.toFixed(4)} mm2 = ${(sumAr(G0, oBr) / Math.max(1e-12, aRealOverBeforeAreas)).toFixed(3)}x   <- destruction removed`);
  log(`  ${el()}`);
}
log('');
log(`done ${el()}`);
