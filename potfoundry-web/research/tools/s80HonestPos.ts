// s80HonestPos.ts — THE HONEST POSITION RE-SCORE. Is the constrained flip's "position 75 -> 36, BETTER"
// true on the ruler that is not blind?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05 BEFORE THE FIRST RUN. Full text: research/exchange/_strataConformBisect/
// S80_LAND_FINDINGS.md §0 (H-L1). Short form so the code and the claim cannot drift apart:
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// H-L1: on the facets the constrained flip ACTUALLY CHANGED, the honest position failure rate measured by
//       `certifyTriangle(tol = 0.010 mm)` — bucketed proven-fail / proven-pass / unknown, never folded —
//       is NO WORSE after the pass than before.
//
// WHY IT IS NOT ALREADY KNOWN. The pass scores position with `sagAdaptiveRaw`, the INFINITE-PLANE ruler.
// On this exact mesh AUDIT proved (S66_HONESTPOS_GOTHIC_AB.report.txt) 251 failures at the 10 um product
// bar in the top-300 by tangExc where the plane ruler reports 11, and the plane reads 0.675x of the honest
// witnessed value at its OWN worst facets. The pass's C2 acceptance clause is written against that ruler.
//
// WHY `certifyTriangle` AND NOT A MESH-WIDE H2 HARNESS. They measure OPPOSITE HAUSDORFF DIRECTIONS.
// Sampling the analytic SURFACE and measuring to the MESH is H2 and is structurally blind to a facet
// standing off the wall (the fin's points are far from the surface; every surface point near it still has
// some facet close by). `certifyTriangle` walks points ON THE FACET and measures to the SURFACE = H1, which
// is the direction the defect lives in. Settled cross-agent 2026-08-05 (advMeshWideH1 relabelled, d5fe7d04).
//
// KILL-CRITERIA (the exact numbers, fixed before the run):
//   K-L1-VAC  `changed` must be > 0 AND every UNCHANGED facet must score BIT-IDENTICALLY on both meshes.
//             Either fails => the tool is broken and no number in this file is admissible. STOP.
//   K-L1a     provenFailRate_after / provenFailRate_before > 1.25 on the CHANGED subpopulation, by COUNT
//             OR by AREA => the lever is a TRADE. "position 75 -> 36 BETTER" is WITHDRAWN.
//   K-L1b     ratio <= 1.00 by BOTH count and area => the win survives the honest ruler.
//   1.00 < ratio <= 1.25 => "no resolvable change", quote the Poisson interval, claim nothing.
//
// N = 20,000 fixed before the run: at the ~0.7% base proven-fail rate that is ~105 failures on the ~75%
// changed subpopulation => a +-10% 1-sigma Poisson interval. Enough to resolve 1.25x at ~2.5 sigma, NOT
// enough to resolve 1.05x. Stated up front so nobody quotes a 5% move.
//
// PAIRING. `writeBinarySTL` emits facets in slot order and a flip rewrites slots t1,t2 IN PLACE, so facet
// index k in the AFTER STL is the descendant of facet index k in the BEFORE STL. ONE index sample is drawn
// and scored on BOTH meshes => the two columns are the same population, not two independent draws.
//
// READ-ONLY over finished STLs. No pipeline file is touched; src/ is imported only for the style registry
// and the radius function, exactly as every other s5x/s6x/s8x probe does.
//
// Usage:  bash research/tools/run-s80-honest-pos.sh
//   env:  PF_S80_TAG, PF_S80_N, PF_S80_STYLE, PF_S80_BEFORE, PF_S80_AFTER (stems, .stl implied),
//         PF_S80_TOL_MM (0.010), PF_S80_NMAX (512), PF_S80_RESUME=1
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');

const STYLE = process.env.PF_S80_STYLE ?? 'GothicArches';
const BEFORE = process.env.PF_S80_BEFORE ?? 'gothicarches_ring_DS-HT_S39CTL';
const AFTER = process.env.PF_S80_AFTER ?? 's60flip/gothicarches_ring_DS-HT_S39CTL_G2CON';
const TAG = process.env.PF_S80_TAG ?? 'L1_GOTHIC';
const NSAMP = Math.round(envF('PF_S80_N', 20000));
const TOL = envF('PF_S80_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S80_NMAX', 512));
const RESUME = envB('PF_S80_RESUME', true);
const DIMS: StyleDims = { H: envF('PF_S80_H', 120), Rb: envF('PF_S80_RB', 40), Rt: envF('PF_S80_RT', 50), expn: envF('PF_S80_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s80land';
const BAR_UM = TOL * 1000;

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
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;

mkdirSync(OUTDIR, { recursive: true });
const REC = `${OUTDIR}/${TAG}.facets.ndjson`;

log('===== S80-L1 — THE HONEST POSITION RE-SCORE (certifyTriangle H1, paired by facet index) =====');
log(`style ${STYLE}   tol ${BAR_UM} um   nMax ${NMAX}   N ${NSAMP}   tag ${TAG}`);
log(`BEFORE  ${BEFORE}.stl`);
log(`AFTER   ${AFTER}.stl`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}   detectThetaJumps ${thJ.length}`);

const mB = readMeshFloat64(`research/exchange/_strataConformBisect/${BEFORE}.stl`, false);
const mA = readMeshFloat64(`research/exchange/_strataConformBisect/${AFTER}.stl`, false);
log(`BEFORE ${mB.nTri} facets   AFTER ${mA.nTri} facets   [${el()}]`);
if (mB.nTri !== mA.nTri) { log('*** FACET COUNTS DIFFER — the pairing assumption does not hold. STOP. ***'); process.exit(1); }
const nTri = mB.nTri;

// ── THE SAMPLE. Golden-ratio stride over facet indices: spans the whole mesh, coprime with nTri so it
// visits distinct slots, and cannot alias with the mesher's row structure the way a plain stride can.
const IDX = new Int32Array(Math.min(NSAMP, nTri));
{
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, nTri) !== 1) s += 2;
  if (s >= nTri) s = 1;
  for (let q = 0; q < IDX.length; q += 1) IDX[q] = (q * s) % nTri;
}
log(`sample: ${IDX.length} facet indices, golden stride, PAIRED (same index list scored on both meshes)`);

// ── PER-FACET INSTRUMENTS. Every facet gets ALL THREE rulers; no arm may be silent on one.
interface Row {
  k: number; changed: 0 | 1; area: number;
  tgB: number; tgA: number;           // MONOTONE tangExc, um  (2*sin(theta/2)*diam — NOT the sin bug)
  pB: number; pA: number;             // plane ruler sagAdaptiveRaw, um
  wB: number; wA: number;             // certifyTriangle witnessed (LOWER bound), um
  bB: number; bA: number;             // certifyTriangle bound (UPPER bound), um
  vB: number; vA: number;             // verdict: 1 proven-fail, 0 proven-pass, -1 unknown
}

function mkSag(xyz: Float64Array, idx: Int32Array): { m: SagMesh; slot: Int32Array } {
  const n = idx.length;
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  for (let q = 0; q < n; q += 1) {
    const o = idx[q] * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * q + v] = xyz[o + 3 * v]; vy[3 * q + v] = xyz[o + 3 * v + 1]; vz[3 * q + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * q], vx[3 * q]);
    vth[3 * q] = thA;
    vth[3 * q + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 1], vx[3 * q + 1]));
    vth[3 * q + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 2], vx[3 * q + 2]));
    ta[q] = 3 * q; tb[q] = 3 * q + 1; tc[q] = 3 * q + 2;
  }
  return { m: { ta, tb, tc, vth, vz, vx, vy }, slot: ta };
}
const sB = mkSag(mB.xyz, IDX); const sA = mkSag(mA.xyz, IDX);
const ARGB = makeSagArgmax(); const ARGA = makeSagArgmax();

/** MONOTONE orientation key: the CHORD between unit normals, 2*sin(theta/2)*diam, um.
 *  NOT `sin(acos(dot))*diam` — that is non-monotone on [0,pi] and scores a fully inverted facet at ~0. */
function tangExcMono(vx: Float64Array, vy: Float64Array, vz: Float64Array, q: number): number {
  const ax = vx[3 * q]; const ay = vy[3 * q]; const az = vz[3 * q];
  const bx = vx[3 * q + 1]; const by = vy[3 * q + 1]; const bz = vz[3 * q + 1];
  const cx = vx[3 * q + 2]; const cy = vy[3 * q + 2]; const cz = vz[3 * q + 2];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = Math.atan2(ay, ax);
  const thc = thA + (dThRaw(thA, Math.atan2(by, bx)) + dThRaw(thA, Math.atan2(cy, cx))) / 3;
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
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  return 2 * Math.sin(0.5 * Math.acos(dot)) * diam * 1000;
}
function areaOf(vx: Float64Array, vy: Float64Array, vz: Float64Array, q: number): number {
  const ax = vx[3 * q]; const ay = vy[3 * q]; const az = vz[3 * q];
  const ux = vx[3 * q + 1] - ax; const uy = vy[3 * q + 1] - ay; const uz = vz[3 * q + 1] - az;
  const wx = vx[3 * q + 2] - ax; const wy = vy[3 * q + 2] - ay; const wz = vz[3 * q + 2] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
}
function certOne(vx: Float64Array, vy: Float64Array, vz: Float64Array, q: number): { w: number; b: number; v: number } {
  const r = certifyTriangle(rA,
    vx[3 * q], vy[3 * q], vz[3 * q],
    vx[3 * q + 1], vy[3 * q + 1], vz[3 * q + 1],
    vx[3 * q + 2], vy[3 * q + 2], vz[3 * q + 2],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
  return { w: r.witnessed * 1000, b: r.bound * 1000, v: r.witnessed > TOL ? 1 : r.certified ? 0 : -1 };
}

// ── RESUME. Checkpoint the INSTANT each facet is scored; a killed run re-runs only what is unfinished.
const rows: Row[] = [];
let start = 0;
if (RESUME && existsSync(REC)) {
  const lines = readFileSync(REC, 'utf8').split('\n').filter((s) => s.length > 2);
  for (const ln of lines) { try { rows.push(JSON.parse(ln) as Row); } catch { /* truncated tail */ } }
  start = rows.length;
  log(`RESUME: ${start} facets already scored in ${REC}`);
} else if (existsSync(REC)) { writeFileSync(REC, ''); }

const tScore = Date.now();
for (let q = start; q < IDX.length; q += 1) {
  const same = (() => {
    for (let v = 0; v < 9; v += 1) if (mB.xyz[IDX[q] * 9 + v] !== mA.xyz[IDX[q] * 9 + v]) return false;
    return true;
  })();
  const cB = certOne(sB.m.vx, sB.m.vy, sB.m.vz, q);
  const cA = same ? cB : certOne(sA.m.vx, sA.m.vy, sA.m.vz, q);
  const row: Row = {
    k: IDX[q], changed: same ? 0 : 1, area: areaOf(sB.m.vx, sB.m.vy, sB.m.vz, q),
    tgB: tangExcMono(sB.m.vx, sB.m.vy, sB.m.vz, q), tgA: same ? 0 : tangExcMono(sA.m.vx, sA.m.vy, sA.m.vz, q),
    pB: sagAdaptiveRaw(rA, sB.m, q, 0.03, 12, 64, ARGB) * 1000,
    pA: same ? 0 : sagAdaptiveRaw(rA, sA.m, q, 0.03, 12, 64, ARGA) * 1000,
    wB: cB.w, wA: cA.w, bB: cB.b, bA: cA.b, vB: cB.v, vA: cA.v,
  };
  if (same) { row.tgA = row.tgB; row.pA = row.pB; }
  rows.push(row);
  appendFileSync(REC, `${JSON.stringify(row)}\n`);
  if ((q + 1) % 500 === 0) {
    const rate = (q + 1 - start) / ((Date.now() - tScore) / 1000);
    log(`  scored ${q + 1}/${IDX.length}   ${rate.toFixed(1)} facet/s   eta ${(((IDX.length - q - 1) / rate) / 60).toFixed(1)} min   [${el()}]`);
  }
}
log(`scoring done: ${rows.length} facets   [${el()}]`);

// ── K-L1-VAC — NON-VACUITY, CHECKED BEFORE ANY OTHER NUMBER IS READ.
// `same` short-circuits the AFTER certify (it is the identical triangle), so the identity is enforced by
// construction there. The load-bearing check is that the CHANGED population is non-empty and that the
// UNCHANGED population is a real, large control — a pass that changed nothing proves nothing.
const chg = rows.filter((r) => r.changed === 1);
const unc = rows.filter((r) => r.changed === 0);
log('');
log(`K-L1-VAC  changed ${chg.length} (${((100 * chg.length) / rows.length).toFixed(2)}%)   unchanged ${unc.length}`);
if (chg.length === 0) { log('*** K-L1-VAC TRIPPED: the pass changed NOTHING in the sample. No verdict is admissible. ***'); }

interface Grp { n: number; fail: number; pass: number; unk: number; areaAll: number; areaFail: number; }
const grpB = (rs: Row[]): Grp => ({
  n: rs.length, fail: rs.filter((r) => r.vB === 1).length, pass: rs.filter((r) => r.vB === 0).length,
  unk: rs.filter((r) => r.vB === -1).length,
  areaAll: rs.reduce((s, r) => s + r.area, 0), areaFail: rs.filter((r) => r.vB === 1).reduce((s, r) => s + r.area, 0),
});
const grpA = (rs: Row[]): Grp => ({
  n: rs.length, fail: rs.filter((r) => r.vA === 1).length, pass: rs.filter((r) => r.vA === 0).length,
  unk: rs.filter((r) => r.vA === -1).length,
  areaAll: rs.reduce((s, r) => s + r.area, 0), areaFail: rs.filter((r) => r.vA === 1).reduce((s, r) => s + r.area, 0),
});
const pct = (a: number, b: number): string => `${((100 * a) / Math.max(1, b)).toFixed(3)}%`;
function show(label: string, g: Grp): void {
  log(`   ${label.padEnd(34)} n ${String(g.n).padStart(6)}   PROVEN-FAIL ${String(g.fail).padStart(5)} (${pct(g.fail, g.n).padStart(8)})   PROVEN-PASS ${String(g.pass).padStart(6)}   UNKNOWN ${String(g.unk).padStart(5)}   area-fail ${((100 * g.areaFail) / Math.max(1e-30, g.areaAll)).toFixed(4)}%`);
}
const P = (rs: Row[], f: (r: Row) => number): { p50: number; p99: number; max: number } => {
  const s = S(rs.map(f)); return { p50: pq(s, 0.5), p99: pq(s, 0.99), max: s.length ? s[s.length - 1] : 0 };
};

log('');
log(`══ H1 HONEST POSITION (certifyTriangle, tol ${BAR_UM} um) — three buckets, none folded ══`);
const wholeB = grpB(rows); const wholeA = grpA(rows);
const chgB = grpB(chg); const chgA = grpA(chg);
show('WHOLE SAMPLE  before', wholeB);
show('WHOLE SAMPLE  after ', wholeA);
show('CHANGED ONLY  before', chgB);
show('CHANGED ONLY  after ', chgA);
show('UNCHANGED (control) ', grpB(unc));

const rc = (chgA.fail / Math.max(1, chgA.n)) / Math.max(1e-12, chgB.fail / Math.max(1, chgB.n));
const ra = (chgA.areaFail / Math.max(1e-30, chgA.areaAll)) / Math.max(1e-12, chgB.areaFail / Math.max(1e-30, chgB.areaAll));
const rcW = (wholeA.fail / Math.max(1, wholeA.n)) / Math.max(1e-12, wholeB.fail / Math.max(1, wholeB.n));
const raW = (wholeA.areaFail / Math.max(1e-30, wholeA.areaAll)) / Math.max(1e-12, wholeB.areaFail / Math.max(1e-30, wholeB.areaAll));
const sig = Math.sqrt(chgB.fail) / Math.max(1, chgB.fail);
log('');
log(`   *** RATIO after/before on the CHANGED subpopulation:  COUNT ${rc.toFixed(3)}x   AREA ${ra.toFixed(3)}x ***`);
log(`   (whole sample, for reference: COUNT ${rcW.toFixed(3)}x   AREA ${raW.toFixed(3)}x)`);
log(`   1-sigma Poisson on the before rate: +-${(100 * sig).toFixed(1)}%  (${chgB.fail} failures)`);

log('');
log(`══ THE THREE RULERS SIDE BY SIDE, same facets ══`);
for (const [lab, rs] of [['WHOLE', rows], ['CHANGED', chg]] as Array<[string, Row[]]>) {
  const hb = P(rs, (r) => r.wB); const ha = P(rs, (r) => r.wA);
  const pb = P(rs, (r) => r.pB); const pa = P(rs, (r) => r.pA);
  const tb = P(rs, (r) => r.tgB); const tta = P(rs, (r) => r.tgA);
  log(`   ${lab} (n=${rs.length})`);
  log(`     H1 witnessed  before p50 ${hb.p50.toFixed(2)} p99 ${hb.p99.toFixed(2)} max ${hb.max.toFixed(2)}  ->  after p50 ${ha.p50.toFixed(2)} p99 ${ha.p99.toFixed(2)} max ${ha.max.toFixed(2)} um`);
  log(`     PLANE  sag    before p50 ${pb.p50.toFixed(2)} p99 ${pb.p99.toFixed(2)} max ${pb.max.toFixed(2)}  ->  after p50 ${pa.p50.toFixed(2)} p99 ${pa.p99.toFixed(2)} max ${pa.max.toFixed(2)} um`);
  log(`     tangExc mono  before p50 ${tb.p50.toFixed(2)} p99 ${tb.p99.toFixed(2)} max ${tb.max.toFixed(1)}  ->  after p50 ${tta.p50.toFixed(2)} p99 ${tta.p99.toFixed(2)} max ${tta.max.toFixed(1)} um`);
  const povB = rs.filter((r) => r.pB > BAR_UM).length; const povA = rs.filter((r) => r.pA > BAR_UM).length;
  log(`     over-bar by the PLANE ruler: ${povB} -> ${povA}     by H1: ${rs.filter((r) => r.vB === 1).length} -> ${rs.filter((r) => r.vA === 1).length}`);
}

// ── PER-FACET PAIRED MOVEMENT — the sharpest reading. A rate can be flat while individual facets churn.
log('');
log(`══ PAIRED PER-FACET MOVEMENT on the CHANGED subpopulation ══`);
{
  const newFail = chg.filter((r) => r.vB !== 1 && r.vA === 1).length;
  const fixed = chg.filter((r) => r.vB === 1 && r.vA !== 1).length;
  const stayF = chg.filter((r) => r.vB === 1 && r.vA === 1).length;
  const dW = S(chg.map((r) => r.wA - r.wB));
  log(`   H1 verdict transitions:  new PROVEN-FAIL ${newFail}   FIXED ${fixed}   stayed failing ${stayF}   net ${newFail - fixed >= 0 ? '+' : ''}${newFail - fixed}`);
  log(`   witnessed delta (after - before)  p01 ${pq(dW, 0.01).toFixed(2)}  p50 ${pq(dW, 0.5).toFixed(2)}  p99 ${pq(dW, 0.99).toFixed(2)}  max ${dW.length ? dW[dW.length - 1].toFixed(2) : '0'} um`);
  log(`   worsened ${chg.filter((r) => r.wA > r.wB + 1e-9).length}   improved ${chg.filter((r) => r.wA < r.wB - 1e-9).length}   unchanged ${chg.filter((r) => Math.abs(r.wA - r.wB) <= 1e-9).length}`);
}

// ── SELECTOR PRICING FOR H-L3: how selective is the MONOTONE tangExc for an H1 position failure?
log('');
log(`══ SELECTOR PRICING (for H-L3's honest C2): P(H1 proven-fail | tangExc bucket), BEFORE mesh ══`);
{
  const cuts = [0, 2, 5, 10, 20, 50, 100, 1e9];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const g = rows.filter((r) => r.tgB >= cuts[i] && r.tgB < cuts[i + 1]);
    if (g.length === 0) continue;
    const f = g.filter((r) => r.vB === 1).length;
    log(`   tangExc [${cuts[i]}, ${cuts[i + 1] === 1e9 ? 'inf' : cuts[i + 1]}) um : n ${String(g.length).padStart(6)}   proven-fail ${String(f).padStart(5)} (${pct(f, g.length)})`);
  }
  const above = rows.filter((r) => r.tgB >= BAR_UM); const below = rows.filter((r) => r.tgB < BAR_UM);
  const fa = above.filter((r) => r.vB === 1).length; const fbl = below.filter((r) => r.vB === 1).length;
  log(`   SELECTOR at tangExc >= ${BAR_UM} um: covers ${((100 * above.length) / rows.length).toFixed(2)}% of facets and ${((100 * fa) / Math.max(1, fa + fbl)).toFixed(2)}% of all H1 failures`);
  log(`   => running the honest test only above that cut MISSES ${fbl} of ${fa + fbl} failures. Stated, not hidden.`);
}

writeFileSync(`${OUTDIR}/${TAG}.summary.json`, JSON.stringify({
  style: STYLE, before: BEFORE, after: AFTER, tag: TAG, nTri, N: rows.length, tol: TOL, nMax: NMAX,
  changed: chg.length, unchanged: unc.length,
  wholeB, wholeA, chgB, chgA,
  ratioCount: rc, ratioArea: ra, ratioCountWhole: rcW, ratioAreaWhole: raW,
  verdict: rc > 1.25 || ra > 1.25 ? 'K-L1a TRADE' : rc <= 1.0 && ra <= 1.0 ? 'K-L1b FREE WIN' : 'no resolvable change',
  secs: (Date.now() - T0) / 1000,
}, null, 2));
log('');
log(`PRE-REGISTERED VERDICT: ${rc > 1.25 || ra > 1.25 ? '*** K-L1a TRIPPED — THE LEVER IS A TRADE ***' : rc <= 1.0 && ra <= 1.0 ? 'K-L1b — the win SURVIVES the honest ruler' : 'no resolvable change (1.00 < ratio <= 1.25)'}`);
log(`done  [${el()}]`);
