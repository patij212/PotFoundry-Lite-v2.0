// revCurtainTurnProbe.ts — REVIEW CONTROL. Is the CURTAIN class's dihedral ANALYTICALLY REQUIRED?
//
// S112 removes the `graphRatio > CURTAIN` pairs from the census on the ASSERTION that "a curtain facet at
// 160 deg is not a defect — a cliff is a real 3D feature the mesh is supposed to have". That assertion is
// never measured. It removes 0.6111% of mesh area at cut 8 and 2.1337% at cut 4 — i.e. between 26% and 90%
// of the 2.3699% that S112 withdraws. S110 ran exactly this control for the CREASE class ("the turn is
// REAL: the analytic surface genuinely bends 135-157 deg across those footprints"). Nobody ran it here.
//
// THE MEASUREMENT. For each high-dihedral pair, take the ANALYTIC normal at each facet's centroid
// parameter point and compare its turn to the MEASURED adjacent-facet dihedral.
//   * analytic turn ~ measured  => the surface really does bend there; the mesh is faithful; EXCLUDE is right.
//   * analytic turn << measured => the MESH is manufacturing the bend; excluding them HIDES real defect.
// `fdNormals` returns up to 4 one-sided candidates per point, so MAXTURN (max over the 4x4 pairings) is an
// UPPER bound on the analytic turn and MINTURN a lower one. An upper bound that is still far below the
// measured dihedral is a SOUND refusal of "the cliff is real".
//
// Usage: bash research/tools/run-rev-curtain-turn.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_REV_STYLE ?? 'GothicArches';
const STL = process.env.PF_REV_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const HI_DEG = envF('PF_REV_HI_DEG', 45);
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
const H = DIMS.H;

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
const nsA = fdNormals(rA, H, 2e-4, 2e-4);
const nsB = fdNormals(rA, H, 2e-3, 2e-3);   // 10x coarser — a step-sensitivity control
const sA = new Float64Array(12); const sB = new Float64Array(12);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log('===== REV — IS THE CURTAIN CLASS\'S DIHEDRAL ANALYTICALLY REQUIRED? =====');
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const dd = Math.abs(Math.hypot(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1]) - rA(Math.atan2(xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3]), xyz[f * 9 + k * 3 + 2]));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0; for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets ${meshArea.toFixed(1)} mm2`);

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
};
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const cen = (f: number): [number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [Math.atan2(cy, cx), cz / 3];
};
/** max & min angle between the analytic normal candidate sets at two parameter points, degrees. */
function turnBounds(th1: number, z1: number, th2: number, z2: number, ns: (t: number, z: number, o: Float64Array) => number, b1: Float64Array, b2: Float64Array): [number, number] {
  const n1 = ns(th1, z1, b1); const tmp = new Float64Array(12);
  const n2 = ns(th2, z2, tmp); b2.set(tmp);
  let hi = 0; let lo = Math.PI;
  for (let i = 0; i < n1; i += 1) for (let j = 0; j < n2; j += 1) {
    let dt = b1[3 * i] * b2[3 * j] + b1[3 * i + 1] * b2[3 * j + 1] + b1[3 * i + 2] * b2[3 * j + 2];
    dt = dt > 1 ? 1 : dt < -1 ? -1 : dt;
    const a = Math.acos(dt);
    if (a > hi) hi = a; if (a < lo) lo = a;
  }
  return [(hi * 180) / Math.PI, (lo * 180) / Math.PI];
}

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const qw = (v: number[], w: number[], p: number): number => {
  const idx = v.map((_, i) => i).filter((i) => Number.isFinite(v[i]));
  idx.sort((a, b) => v[a] - v[b]);
  let tot = 0; for (const i of idx) tot += w[i];
  let acc = 0;
  for (const i of idx) { acc += w[i]; if (acc >= p * tot) return v[i]; }
  return NaN;
};

const hiThr = (HI_DEG * Math.PI) / 180;
type Bucket = { meas: number[]; hi: number[]; lo: number[]; hiC: number[]; area: number[]; f: Set<number> };
const mk = (): Bucket => ({ meas: [], hi: [], lo: [], hiC: [], area: [], f: new Set<number>() });
const buckets: Record<string, Bucket> = { wall8: mk(), curt8: mk(), curt4to8: mk(), curt16: mk() };
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const g = Math.max(graphRatio(f1), graphRatio(f2));
  const [t1, z1] = cen(f1); const [t2raw, z2] = cen(f2);
  const t2 = t1 + dThRaw(t1, t2raw);
  const [aHi, aLo] = turnBounds(t1, z1, t2, z2, nsA, sA, sB);
  const [cHi] = turnBounds(t1, z1, t2, z2, nsB, sA, sB);
  const meas = (d.edgeAngRad[e] * 180) / Math.PI;
  const push = (b: Bucket): void => {
    b.meas.push(meas); b.hi.push(aHi); b.lo.push(aLo); b.hiC.push(cHi);
    b.area.push(d.areaMm2[f1] + d.areaMm2[f2]); b.f.add(f1); b.f.add(f2);
  };
  if (g <= 8) push(buckets.wall8); else push(buckets.curt8);
  if (g > 4 && g <= 8) push(buckets.curt4to8);
  if (g > 16) push(buckets.curt16);
}

log('');
log('── MEASURED adjacent dihedral vs the ANALYTIC normal turn between the two facet centroids ──');
log('   MAXTURN = max over the one-sided candidate pairings = an UPPER bound on the analytic turn.');
log('   If MAXTURN << measured, the surface does NOT bend that much and the MESH is making the bend.');
for (const [nm, b] of Object.entries(buckets)) {
  if (b.meas.length === 0) { log(`  ${nm}: empty`); continue; }
  let ar = 0; for (const f of b.f) ar += d.areaMm2[f];
  const rat = b.meas.map((m, i) => (b.hi[i] > 1e-9 ? m / b.hi[i] : Infinity));
  log(`  ${nm.padEnd(9)} n=${String(b.meas.length).padStart(6)}  AREA ${((100 * ar) / meshArea).toFixed(4)}% of mesh`);
  log(`     measDeg   p10 ${q(b.meas, 0.1).toFixed(2).padStart(7)} p50 ${q(b.meas, 0.5).toFixed(2).padStart(7)} p90 ${q(b.meas, 0.9).toFixed(2).padStart(7)}`);
  log(`     MAXTURN   p10 ${q(b.hi, 0.1).toFixed(2).padStart(7)} p50 ${q(b.hi, 0.5).toFixed(2).padStart(7)} p90 ${q(b.hi, 0.9).toFixed(2).padStart(7)}   (h=2e-4mm)`);
  log(`     MAXTURN   p10 ${q(b.hiC, 0.1).toFixed(2).padStart(7)} p50 ${q(b.hiC, 0.5).toFixed(2).padStart(7)} p90 ${q(b.hiC, 0.9).toFixed(2).padStart(7)}   (h=2e-3mm, 10x step control)`);
  log(`     MINTURN   p10 ${q(b.lo, 0.1).toFixed(2).padStart(7)} p50 ${q(b.lo, 0.5).toFixed(2).padStart(7)} p90 ${q(b.lo, 0.9).toFixed(2).padStart(7)}`);
  log(`     meas/MAXTURN  p10 ${q(rat, 0.1).toFixed(2)}  p50 ${q(rat, 0.5).toFixed(2)}  p90 ${q(rat, 0.9).toFixed(2)}   AREA-wtd p50 ${qw(rat, b.area, 0.5).toFixed(2)}`);
  const unex = b.meas.filter((m, i) => m > 45 && b.hi[i] < 0.5 * m).length;
  let unexA = 0; for (let i = 0; i < b.meas.length; i += 1) if (b.meas[i] > 45 && b.hi[i] < 0.5 * b.meas[i]) unexA += b.area[i];
  log(`     UNEXPLAINED (measured > 2x the analytic UPPER bound): ${unex} (${((100 * unex) / b.meas.length).toFixed(2)}%)  pair-area ${((100 * unexA) / meshArea).toFixed(4)}% of mesh`);
}
log('done');
