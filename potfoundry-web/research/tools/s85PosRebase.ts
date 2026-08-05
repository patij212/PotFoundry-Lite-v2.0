// s85PosRebase.ts — THE POSITION RE-BASELINE. Every "position over-bar" number this campaign published was
// measured with `sagAdaptiveRaw`, an INFINITE-PLANE distance. Two agents have now shown, on these exact
// meshes, that it under-reports by 30-48x and that no constant correction exists. This tool replaces every
// one of those numbers with a two-sided `certifyTriangle` reading at the 10 um PRODUCT bar.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05, WRITTEN BEFORE THE FIRST RUN. Nothing below was edited after a number was read.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// H-R1 (THE LOAD-BEARING ONE).  The AR-cap sweep's headline ordering — S39CTL/AR50 47.282 -> S40AR55 32.317
//      -> S40AR65 23.563 -> S40AR90 10.830 um, a 4.4x claimed improvement — is an artefact of the blind
//      plane ruler and does NOT survive an honest position measurement.
//      MEASURE: (a) honest PROVEN-FAIL rate by COUNT and by AREA on ONE uniform golden-stride sample per
//      mesh, identical construction, equal N across the four arms; (b) honest `witnessed` max over a
//      TARGETED union of the driver's own worst facets and the tangExc tail.
//      KILL (H-R1 REFUTED, the ordering SURVIVES): the honest proven-fail COUNT rate falls monotonically
//      across caps 50 -> 55 -> 65 -> 90 AND the AR90/AR50 ratio is <= 0.50 with the two 1-sigma Poisson
//      intervals disjoint. That would mean the blind ruler ranked the arms correctly even while mis-sizing
//      them, and the AR-cap result stands as a RANKING even if its magnitudes are withdrawn.
//      CONFIRM (H-R1 held, the ordering DIES): the honest count rate is flat within 1 sigma across the four
//      caps, OR its ordering differs from the blind ruler's. Then the 47.282 -> 10.830 headline measures the
//      ruler's opinion and not the mesh, and every arm comparison in the worklog must be re-run.
//      Anything else -> "ordering degraded, not reversed"; quote both and claim nothing stronger.
//
// H-R2. THE UNDER-REPORT RATIO IS NOT A CONSTANT, so old numbers cannot be salvaged by a factor.
//      MEASURE: per mesh, ratio = honest-PROVEN-FAIL-count-rate / driver-over-bar-count-rate, both on the
//      SAME mesh (driver's from its own .report.txt over-0.01mm line, whole mesh; honest scaled from the
//      uniform sample).
//      KILL (H-R2 REFUTED): max(ratio)/min(ratio) over the measured meshes <= 1.5. Then one factor corrects
//      the published numbers and the campaign keeps its history.
//      CONFIRM: > 1.5. The published numbers are only discardable, not correctable.
//
// H-R3 (NON-VACUITY — CHECKED BEFORE ANY VERDICT IS READ). My whole-mesh plane-ruler pass must REPRODUCE
//      the driver's own self-report on the same mesh: the adaptive-oracle MAX to within 0.5%, and the
//      `over-0.01mm` count EXACTLY. Both are parsed from the arm's .report.txt automatically and printed
//      side by side. If either differs, my mesh loading / theta unwrapping / rA construction is wrong and
//      NO number in this file is admissible. This is the control that makes the head-to-head non-vacuous:
//      the two rulers must be reading the SAME mesh with the SAME rA before their disagreement means
//      anything.
//
// WHAT THIS TOOL DOES NOT MEASURE, STATED UP FRONT:
//   * The honest WHOLE-MESH MAX. It is unreachable at this budget. The target arm's `witnessed` max is a
//     max over a 2 x TOPK targeted union and is therefore a LOWER BOUND on the mesh's true honest max.
//     It is reported as such and never as "the max".
//   * H2 (surface -> mesh). `certifyTriangle` walks points ON THE FACET and measures to the surface = H1.
//     A missing-material defect the mesh does not cover is invisible to it. Settled cross-agent 2026-08-05.
//   * Orientation. Position only.
//   * UNKNOWN is never folded into PASS. Three buckets, always printed.
//
// SAMPLE CONSTRUCTION, IDENTICAL ON EVERY MESH: the first N terms of the golden-ratio stride
// `(q * s) mod nTri`, `s` the odd integer nearest `nTri * 0.6180339887`, incremented until coprime with
// nTri. Byte-for-byte the construction `s80HonestPos.ts` uses, so this tool's S39CTL row and LAND's
// L1_GOTHIC "before" column are the SAME 50,000 facets and their agreement is a cross-tool check.
// An N=8,000 row is the 8,000-term PREFIX of the N=50,000 row: same construction, less coverage.
//
// Usage:  bash research/tools/run-s85-pos-rebase.sh
//   env:  PF_S85_ARM=target|uniform  PF_S85_TAG  PF_S85_STYLE  PF_S85_STEM  PF_S85_N  PF_S85_TOPK
//         PF_S85_TOL_MM(0.010)  PF_S85_NMAX(512)  PF_S85_H/RB/RT/EXPN  PF_S85_RESUME(1)  PF_S85_REPORT
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

const ARM = process.env.PF_S85_ARM ?? 'target';
const TAG = process.env.PF_S85_TAG ?? 'S39CTL';
const STYLE = process.env.PF_S85_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S85_STEM ?? 'gothicarches_ring_DS-HT_S39CTL';
const NSAMP = Math.round(envF('PF_S85_N', 50000));
const TOPK = Math.round(envF('PF_S85_TOPK', 300));
const TOL = envF('PF_S85_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S85_NMAX', 512));
const RESUME = envB('PF_S85_RESUME', true);
const DIMS: StyleDims = { H: envF('PF_S85_H', 120), Rb: envF('PF_S85_RB', 40), Rt: envF('PF_S85_RT', 50), expn: envF('PF_S85_EXPN', 1) };
const H = DIMS.H;
const BAR = TOL * 1000;
const DIR = 'research/exchange/_strataConformBisect';
const OUTDIR = `${DIR}/s85rebase`;
const CARD = `${DIR}/S85_POSITION_REBASELINE.md`;

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
log('===== S85 POSITION RE-BASELINE — certifyTriangle at the 10 um PRODUCT bar =====');
log(`arm ${ARM}   tag ${TAG}   style ${STYLE}   stem ${STEM}`);
log(`tol ${BAR} um   nMax ${NMAX}   N ${NSAMP}   topK ${TOPK}   dims H${DIMS.H} Rb${DIMS.Rb} Rt${DIMS.Rt}`);

// ── THE DRIVER'S OWN SELF-REPORT, parsed from its report so the contrast cannot be mis-transcribed.
interface DriverSay { headline: number; adaptiveMax: number; overBar: number; nTri: number; found: boolean }
function readDriver(stem: string): DriverSay {
  const p = process.env.PF_S85_REPORT ?? `${DIR}/${stem}.report.txt`;
  const d: DriverSay = { headline: NaN, adaptiveMax: NaN, overBar: -1, nTri: -1, found: false };
  if (!existsSync(p)) return d;
  const txt = readFileSync(p, 'utf8');
  const h = /HEADLINE MAX\s+([\d.]+)\s*µm/.exec(txt);
  if (h !== null) d.headline = Number(h[1]);
  const a = /MAX\s+([\d.]+)\s*µm\s+(?:FAIL|PASS|NOT-CONVERGED)\s+p99\s+[\d.]+\s+p50\s+[\d.]+\s+over-0\.01mm\s+(\d+)\/(\d+)/.exec(txt);
  if (a !== null) { d.adaptiveMax = Number(a[1]); d.overBar = Number(a[2]); d.nTri = Number(a[3]); }
  // Some driver reports (Voronoi, older runs) print only the adaptive-oracle block and no HEADLINE line.
  // Fall back so the contrast column is a number rather than NaN — it is the same quantity the headline is
  // a max over, and the substitution is announced in the log.
  if (!Number.isFinite(d.headline) && Number.isFinite(d.adaptiveMax)) d.headline = d.adaptiveMax;
  d.found = h !== null || a !== null;
  return d;
}
const DRV = readDriver(STEM);
log(`driver self-report: headline ${DRV.headline} um   adaptive MAX ${DRV.adaptiveMax} um   over-0.01mm ${DRV.overBar}/${DRV.nTri}   (${DRV.found ? 'parsed' : 'NOT FOUND — contrast column will be blank'})`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}   detectThetaJumps ${thJ.length}`);

const MESH = readMeshFloat64(`${DIR}/${STEM}.stl`, false);
const nTri = MESH.nTri;
log(`mesh ${nTri} facets loaded   [${el()}]`);
if (DRV.nTri > 0 && DRV.nTri !== nTri) log(`*** WARNING: report says ${DRV.nTri} facets, STL has ${nTri}. The report may belong to another arm. ***`);

/** THE sample construction. Identical to s80HonestPos so rows cross-check. */
function goldenIdx(count: number): Int32Array {
  const out = new Int32Array(Math.min(count, nTri));
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, nTri) !== 1) s += 2;
  if (s >= nTri) s = 1;
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % nTri;
  return out;
}

/** Pack a facet index list into a SagMesh with unwrapped theta. */
function mkSag(idx: Int32Array | Int32Array[] | number[]): SagMesh {
  const list = idx as ArrayLike<number>;
  const n = list.length;
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  const xyz = MESH.xyz;
  for (let q = 0; q < n; q += 1) {
    const o = list[q] * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * q + v] = xyz[o + 3 * v]; vy[3 * q + v] = xyz[o + 3 * v + 1]; vz[3 * q + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * q], vx[3 * q]);
    vth[3 * q] = thA;
    vth[3 * q + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 1], vx[3 * q + 1]));
    vth[3 * q + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 2], vx[3 * q + 2]));
    ta[q] = 3 * q; tb[q] = 3 * q + 1; tc[q] = 3 * q + 2;
  }
  return { ta, tb, tc, vth, vz, vx, vy };
}

/** MONOTONE orientation key, 2*sin(theta/2)*diam in um (NOT the non-monotone sin(acos(dot)) form). */
function tangExcMono(m: SagMesh, q: number): number {
  const { vx, vy, vz } = m;
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
function areaOf(m: SagMesh, q: number): number {
  const { vx, vy, vz } = m;
  const ax = vx[3 * q]; const ay = vy[3 * q]; const az = vz[3 * q];
  const ux = vx[3 * q + 1] - ax; const uy = vy[3 * q + 1] - ay; const uz = vz[3 * q + 1] - az;
  const wx = vx[3 * q + 2] - ax; const wy = vy[3 * q + 2] - ay; const wz = vz[3 * q + 2] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
}
function certOne(m: SagMesh, q: number): { w: number; b: number; v: number; c: 0 | 1 } {
  const { vx, vy, vz } = m;
  const r = certifyTriangle(rA,
    vx[3 * q], vy[3 * q], vz[3 * q],
    vx[3 * q + 1], vy[3 * q + 1], vz[3 * q + 1],
    vx[3 * q + 2], vy[3 * q + 2], vz[3 * q + 2],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
  return { w: r.witnessed * 1000, b: r.bound * 1000, v: r.witnessed > TOL ? 1 : r.certified ? 0 : -1, c: r.witnessedComplete ? 1 : 0 };
}

interface Row { k: number; area: number; tg: number; p: number; w: number; b: number; v: number; c: 0 | 1; sel?: string }
function loadRows(path: string): Row[] {
  const rows: Row[] = [];
  if (!(RESUME && existsSync(path))) { if (existsSync(path)) writeFileSync(path, ''); return rows; }
  for (const ln of readFileSync(path, 'utf8').split('\n')) {
    if (ln.length < 3) continue;
    try { rows.push(JSON.parse(ln) as Row); } catch { /* truncated tail — re-score it */ }
  }
  return rows;
}
interface Bucket { n: number; fail: number; pass: number; unk: number; areaAll: number; areaFail: number; incomplete: number }
function bucket(rs: Row[]): Bucket {
  return {
    n: rs.length,
    fail: rs.filter((r) => r.v === 1).length,
    pass: rs.filter((r) => r.v === 0).length,
    unk: rs.filter((r) => r.v === -1).length,
    areaAll: rs.reduce((s, r) => s + r.area, 0),
    areaFail: rs.filter((r) => r.v === 1).reduce((s, r) => s + r.area, 0),
    incomplete: rs.filter((r) => r.c === 0).length,
  };
}
function showBucket(label: string, g: Bucket): void {
  log(`   ${label.padEnd(30)} n ${String(g.n).padStart(6)}   PROVEN-FAIL ${String(g.fail).padStart(5)} (${((100 * g.fail) / Math.max(1, g.n)).toFixed(3)}%)   PROVEN-PASS ${String(g.pass).padStart(6)}   UNKNOWN ${String(g.unk).padStart(5)}   area-fail ${((100 * g.areaFail) / Math.max(1e-30, g.areaAll)).toFixed(5)}%   witnessedComplete-false ${g.incomplete}`);
}
function appendCard(line: string): void {
  if (!existsSync(CARD)) writeFileSync(CARD, '');
  appendFileSync(CARD, `${line}\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ARM `target` — the honest re-read of the DRIVER'S OWN HEADLINE, plus the tangExc tail it cannot see.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (ARM === 'target') {
  const SELF = `${OUTDIR}/${TAG}.sel.json`;
  const REC = `${OUTDIR}/${TAG}.target.ndjson`;
  interface Sel { idx: number[]; kind: string[]; pos: number[]; tg: number[]; planeMax: number; planeOver: number; planeArgmax: number; tgMax: number }
  let sel: Sel;
  if (RESUME && existsSync(SELF)) {
    sel = JSON.parse(readFileSync(SELF, 'utf8')) as Sel;
    log(`RESUME: selection reloaded from ${SELF} (${sel.idx.length} facets)`);
  } else {
    // WHOLE-MESH plane ruler + tangExc. This is also the H-R3 non-vacuity control.
    log('whole-mesh plane ruler + tangExc pass (this is the H-R3 control) ...');
    const all = new Int32Array(nTri); for (let k = 0; k < nTri; k += 1) all[k] = k;
    const M = mkSag(all); const ARG = makeSagArgmax();
    const pos = new Float64Array(nTri); const tg = new Float64Array(nTri);
    let pMax = 0; let pArg = 0; let pOver = 0; let tMax = 0;
    for (let k = 0; k < nTri; k += 1) {
      const p = sagAdaptiveRaw(rA, M, k, 0.03, 12, 64, ARG) * 1000;
      pos[k] = p; if (p > pMax) { pMax = p; pArg = k; } if (p > BAR) pOver += 1;
      const t = tangExcMono(M, k); tg[k] = t; if (t > tMax) tMax = t;
      if ((k + 1) % 200000 === 0) log(`   ${k + 1}/${nTri}   [${el()}]`);
    }
    log('');
    log('   ══ H-R3 NON-VACUITY CONTROL — my plane pass vs the driver\'s own self-report ══');
    log(`      adaptive MAX   mine ${pMax.toFixed(3)} um   driver ${DRV.adaptiveMax} um   delta ${(100 * Math.abs(pMax - DRV.adaptiveMax)) / Math.max(1e-9, DRV.adaptiveMax) >= 0 ? `${((100 * Math.abs(pMax - DRV.adaptiveMax)) / Math.max(1e-9, DRV.adaptiveMax)).toFixed(3)}%` : 'n/a'}`);
    log(`      over-0.01mm    mine ${pOver}                driver ${DRV.overBar}`);
    const vacOk = Number.isFinite(DRV.adaptiveMax)
      && Math.abs(pMax - DRV.adaptiveMax) / Math.max(1e-9, DRV.adaptiveMax) <= 0.005 && pOver === DRV.overBar;
    log(`      *** H-R3 ${vacOk ? 'PASSES — the two rulers are reading the same mesh with the same rA' : 'DOES NOT MATCH — read the two lines above before trusting anything below'} ***`);
    log('');
    const byPos = Array.from({ length: nTri }, (_v, i) => i).sort((a, b) => pos[b] - pos[a]).slice(0, TOPK);
    const byTg = Array.from({ length: nTri }, (_v, i) => i).sort((a, b) => tg[b] - tg[a]).slice(0, TOPK);
    const seen = new Set<number>(); const idx: number[] = []; const kind: string[] = [];
    for (const k of byPos) { seen.add(k); idx.push(k); kind.push('plane'); }
    for (const k of byTg) { if (seen.has(k)) { kind[idx.indexOf(k)] = 'both'; continue; } seen.add(k); idx.push(k); kind.push('tang'); }
    sel = {
      idx, kind, pos: idx.map((k) => pos[k]), tg: idx.map((k) => tg[k]),
      planeMax: pMax, planeOver: pOver, planeArgmax: pArg, tgMax: tMax,
    };
    writeFileSync(SELF, JSON.stringify(sel));
    log(`selection: ${idx.length} facets (plane top-${TOPK} U tangExc top-${TOPK}, overlap ${2 * TOPK - idx.length})   [${el()}]`);
  }

  const SM = mkSag(sel.idx);
  let rows = loadRows(REC);
  if (rows.length > sel.idx.length) rows = rows.slice(0, sel.idx.length);
  log(`RESUME: ${rows.length}/${sel.idx.length} already certified`);
  const tS = Date.now();
  for (let q = rows.length; q < sel.idx.length; q += 1) {
    const c = certOne(SM, q);
    const r: Row = { k: sel.idx[q], area: areaOf(SM, q), tg: sel.tg[q], p: sel.pos[q], w: c.w, b: c.b, v: c.v, c: c.c, sel: sel.kind[q] };
    rows.push(r); appendFileSync(REC, `${JSON.stringify(r)}\n`);
    if ((q + 1) % 50 === 0) {
      const rate = (q + 1 - 0) / ((Date.now() - tS) / 1000);
      log(`  certified ${q + 1}/${sel.idx.length}   ${rate.toFixed(2)} facet/s   [${el()}]`);
    }
  }

  const plane = rows.filter((r) => r.sel === 'plane' || r.sel === 'both');
  const tang = rows.filter((r) => r.sel === 'tang' || r.sel === 'both');
  log('');
  log(`══ TARGET ARM — ${TAG} — honest position on the two selectors ══`);
  showBucket('ALL SELECTED (union)', bucket(rows));
  showBucket(`plane top-${TOPK} (driver's own worst)`, bucket(plane));
  showBucket(`tangExc top-${TOPK}`, bucket(tang));
  const sw = S(rows.map((r) => r.w)); const sp = S(rows.map((r) => r.p));
  const swP = S(plane.map((r) => r.w)); const spP = S(plane.map((r) => r.p));
  const swT = S(tang.map((r) => r.w));
  log('');
  log(`   honest witnessed over the union   p50 ${pq(sw, 0.5).toFixed(3)}  p99 ${pq(sw, 0.99).toFixed(3)}  MAX ${sw[sw.length - 1].toFixed(3)} um   <= a LOWER BOUND on the mesh's honest max`);
  log(`   plane ruler over the union        p50 ${pq(sp, 0.5).toFixed(3)}  p99 ${pq(sp, 0.99).toFixed(3)}  MAX ${sp[sp.length - 1].toFixed(3)} um`);
  log(`   on the plane selector only:  honest MAX ${swP[swP.length - 1].toFixed(3)}   plane MAX ${spP[spP.length - 1].toFixed(3)} um`);
  log(`   on the tangExc selector only: honest MAX ${swT.length > 0 ? swT[swT.length - 1].toFixed(3) : 'n/a'} um`);
  const hdlRow = rows.find((r) => r.k === sel.planeArgmax);
  log('');
  log(`   *** THE HEADLINE FACET ITSELF (index ${sel.planeArgmax}, the plane ruler's argmax): plane ${sel.planeMax.toFixed(3)} um -> honest witnessed ${hdlRow === undefined ? 'NOT IN SELECTION' : `${hdlRow.w.toFixed(3)} um (bound ${hdlRow.b.toFixed(3)}, verdict ${hdlRow.v === 1 ? 'PROVEN-FAIL' : hdlRow.v === 0 ? 'PROVEN-PASS' : 'UNKNOWN'})`} ***`);
  log(`   *** DRIVER HEADLINE ${DRV.headline} um  vs  HONEST MAX-OVER-UNION ${sw[sw.length - 1].toFixed(3)} um   ratio ${(DRV.headline / Math.max(1e-9, sw[sw.length - 1])).toFixed(3)}x ***`);
  const planeOverInSel = plane.filter((r) => r.p > BAR).length;
  log(`   head-to-head on the plane selector: plane says ${planeOverInSel}/${plane.length} over bar, honest proves ${bucket(plane).fail}`);
  log(`   head-to-head on the tangExc selector: plane says ${tang.filter((r) => r.p > BAR).length}/${tang.length} over bar, honest proves ${bucket(tang).fail}`);

  const sum = {
    arm: 'target', tag: TAG, style: STYLE, stem: STEM, nTri, topK: TOPK, tol: TOL, nMax: NMAX,
    driver: DRV, planeMaxMine: sel.planeMax, planeOverMine: sel.planeOver,
    union: bucket(rows), plane: bucket(plane), tang: bucket(tang),
    honestMaxUnion: sw[sw.length - 1], honestMaxPlaneSel: swP[swP.length - 1],
    honestMaxTangSel: swT.length > 0 ? swT[swT.length - 1] : null,
    headlineFacet: hdlRow ?? null, secs: (Date.now() - T0) / 1000,
  };
  writeFileSync(`${OUTDIR}/${TAG}.target.summary.json`, JSON.stringify(sum, null, 2));
  appendCard(`| TARGET | ${TAG} | ${STYLE} | ${nTri} | ${DRV.headline} | ${sel.planeMax.toFixed(3)} | ${sel.planeOver} | ${sw[sw.length - 1].toFixed(3)} | ${swP[swP.length - 1].toFixed(3)} | ${bucket(plane).fail}/${plane.length} | ${bucket(tang).fail}/${tang.length} | ${(DRV.headline / Math.max(1e-9, sw[sw.length - 1])).toFixed(2)}x | union ${rows.length} of ${nTri} (${((100 * rows.length) / nTri).toFixed(4)}%), TARGETED not random |`);
  log('');
  log(`row appended to ${CARD}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ARM `uniform` — THE COMPARABLE ROW. One construction, one N, three buckets, count AND area.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (ARM === 'uniform') {
  const REC = `${OUTDIR}/${TAG}.uniform.ndjson`;
  const IDX = goldenIdx(NSAMP);
  const SM = mkSag(IDX); const ARG = makeSagArgmax();
  log(`sample: ${IDX.length} facets, golden stride, coverage ${((100 * IDX.length) / nTri).toFixed(3)}%`);
  let rows = loadRows(REC);
  if (rows.length > IDX.length) rows = rows.slice(0, IDX.length);
  log(`RESUME: ${rows.length}/${IDX.length} already scored   [${el()}]`);
  const tS = Date.now();
  for (let q = rows.length; q < IDX.length; q += 1) {
    const c = certOne(SM, q);
    const r: Row = {
      k: IDX[q], area: areaOf(SM, q), tg: tangExcMono(SM, q),
      p: sagAdaptiveRaw(rA, SM, q, 0.03, 12, 64, ARG) * 1000,
      w: c.w, b: c.b, v: c.v, c: c.c,
    };
    rows.push(r); appendFileSync(REC, `${JSON.stringify(r)}\n`);
    if ((q + 1) % 500 === 0) {
      const rate = (q + 1 - 0) / ((Date.now() - tS) / 1000);
      log(`  scored ${q + 1}/${IDX.length}   ${rate.toFixed(1)} facet/s   eta ${(((IDX.length - q - 1) / rate) / 60).toFixed(1)} min   [${el()}]`);
    }
  }
  const g = bucket(rows);
  const cov = rows.length / nTri;
  const sigCount = g.fail > 0 ? Math.sqrt(g.fail) / g.fail : 1;
  const areaSq = rows.filter((r) => r.v === 1).reduce((s, r) => s + r.area * r.area, 0);
  const sigArea = g.areaFail > 0 ? Math.sqrt(areaSq) / g.areaFail : 1;
  const scaledFail = g.fail / cov;
  const sw = S(rows.map((r) => r.w)); const sp = S(rows.map((r) => r.p));
  const planeOver = rows.filter((r) => r.p > BAR).length;
  log('');
  log(`══ UNIFORM ARM — ${TAG} — the COMPARABLE row ══`);
  showBucket('UNIFORM SAMPLE', g);
  log(`   coverage ${(100 * cov).toFixed(4)}%   PROVEN-FAIL rate ${(100 * g.fail / Math.max(1, g.n)).toFixed(4)}% +- ${(100 * sigCount).toFixed(1)}% (1 sigma Poisson, ${g.fail} failures)`);
  log(`   scaled to the whole mesh: ${Math.round(scaledFail)} PROVEN-FAIL facets  (driver's own over-0.01mm on this mesh: ${DRV.overBar})`);
  log(`   PROVEN-FAIL AREA fraction ${(100 * g.areaFail / Math.max(1e-30, g.areaAll)).toFixed(5)}% +- ${(100 * sigArea).toFixed(1)}% relative`);
  log(`   honest witnessed in-sample  p50 ${pq(sw, 0.5).toFixed(3)}  p99 ${pq(sw, 0.99).toFixed(3)}  max ${sw[sw.length - 1].toFixed(3)} um   (an in-sample max, NOT the mesh max)`);
  log(`   plane ruler in-sample       p50 ${pq(sp, 0.5).toFixed(3)}  p99 ${pq(sp, 0.99).toFixed(3)}  max ${sp[sp.length - 1].toFixed(3)} um   over-bar ${planeOver}/${rows.length}`);
  const ratio = DRV.overBar > 0 ? (scaledFail / DRV.overBar) : NaN;
  log(`   *** UNDER-REPORT RATIO (honest scaled count / driver over-bar count): ${Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : 'n/a (driver reports 0)'} ***`);
  log(`   *** in-sample head-to-head: plane says ${planeOver}, honest proves ${g.fail}  => ${planeOver > 0 ? `${(g.fail / planeOver).toFixed(2)}x` : 'infinite (plane says 0)'} ***`);
  const sum = {
    arm: 'uniform', tag: TAG, style: STYLE, stem: STEM, nTri, N: rows.length, coverage: cov, tol: TOL, nMax: NMAX,
    driver: DRV, bucket: g, failRate: g.fail / Math.max(1, g.n), sigmaCountRel: sigCount,
    areaFailFrac: g.areaFail / Math.max(1e-30, g.areaAll), sigmaAreaRel: sigArea,
    scaledFail, underReportRatio: ratio, planeOverInSample: planeOver,
    witP50: pq(sw, 0.5), witP99: pq(sw, 0.99), witMaxInSample: sw[sw.length - 1],
    secs: (Date.now() - T0) / 1000,
  };
  writeFileSync(`${OUTDIR}/${TAG}.uniform.summary.json`, JSON.stringify(sum, null, 2));
  appendCard(`| UNIFORM | ${TAG} | ${STYLE} | ${nTri} | ${DRV.overBar} | ${g.fail}/${g.n} | ${(100 * g.fail / Math.max(1, g.n)).toFixed(4)}% +-${(100 * sigCount).toFixed(1)}% | ${Math.round(scaledFail)} | ${(100 * g.areaFail / Math.max(1e-30, g.areaAll)).toFixed(5)}% +-${(100 * sigArea).toFixed(1)}% | ${g.unk} | ${sw[sw.length - 1].toFixed(2)} | ${Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : 'n/a'} | ${(100 * cov).toFixed(3)}% |`);
  log('');
  log(`row appended to ${CARD}`);
}
log(`done  [${el()}]`);
