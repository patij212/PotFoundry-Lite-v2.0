// s54G1Mechanism.ts — IS THE G1 DEFECT A MAX-ANGLE (Babuska-Aziz) DEFECT, IS IT IN THE SAME PLACES
// ACROSS ARMS, AND WOULD ANY EXISTING HEAP KEY EVER RANK IT?
//
// S53 established that orientation error is FLAT across the cap sweep while the position ruler's MAX
// falls, and that maxAngle p99 = 165 deg on every arm. Three follow-ups, all cheap:
//
//   Q1 MECHANISM   bin normal deviation by maxAngle and by minAngle. Babuska-Aziz predicts the
//                  gradient constant blows up like 1/sin(maxAngle) as maxAngle -> pi, and predicts
//                  NOTHING about minAngle on its own. If normDeg rises sharply with maxAngle and
//                  the same data binned by minAngle separates worse, the repo is measuring the
//                  wrong angle and this says so with numbers.
//   Q2 PLACES      the operator says the artefacts are "in the same places" across arms. Bucket the
//                  centroids of the >30 deg facets into a (theta,z) grid and take the Jaccard index
//                  between arms. High Jaccard = the same places, measured rather than eyeballed.
//   Q3 RANKABLE    overlap between the top 1% by the DRIVER'S plane ruler and the top 1% by
//                  tangential excursion. If the overlap is small, the heap can never reach this
//                  class no matter how long it runs — which is the difference between "not yet
//                  refined" and "unreachable by this driver".
//
// Usage:  bash research/tools/run-s54-g1-mechanism.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAGS = (process.env.PF_S54_TAGS ?? 'S39CTL,S40AR90,S48CAV90').split(',');
const NS = Math.round(envF('PF_S54_N', 300000));

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
const rAbase = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

interface Facet { nd: number; tg: number; pos: number; maxA: number; minA: number; diam: number; th: number; z: number }
function scan(tag: string): Facet[] {
  const path = `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_${tag}.stl`;
  const { xyz, nTri } = readMeshFloat64(path, false);
  const step = Math.max(1, Math.floor(nTri / NS));
  const n = Math.floor(nTri / step);
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  for (let k = 0; k < n; k += 1) {
    const o = (k * step) * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * k], vx[3 * k]);
    vth[3 * k] = thA;
    vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
    vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
    ta[k] = 3 * k; tb[k] = 3 * k + 1; tc[k] = 3 * k + 2;
  }
  const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy }; const ARG = makeSagArgmax();
  const out: Facet[] = [];
  for (let k = 0; k < n; k += 1) {
    const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
    const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
    const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) continue;
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
    const hTh = 1e-5 / Math.max(1e-6, rA(thc, zc)); const hZ = 1e-5;
    const r = rA(thc, zc);
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const nd = (Math.acos(dot) * 180) / Math.PI;
    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    const diam = Math.max(la, lb, lc);
    const ang3 = (p1: number, p2: number, p3: number): number => {
      const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
      return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
    };
    const A1 = ang3(la, lb, lc); const A2 = ang3(lb, lc, la); const A3 = ang3(lc, la, lb);
    out.push({
      nd, tg: Math.sin((nd * Math.PI) / 180) * diam * 1000,
      pos: sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000,
      maxA: Math.max(A1, A2, A3), minA: Math.min(A1, A2, A3), diam,
      th: canonTheta(thc), z: zc,
    });
  }
  return out;
}

const p = (a: number[], f: number): number => (a.length === 0 ? 0 : a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(f * a.length))]);
log('===== S54 — G1 MECHANISM / PLACES / RANKABILITY =====');
const data = new Map<string, Facet[]>();
for (const t of TAGS) { const d = scan(t); data.set(t, d); log(`scanned ${t}: ${d.length} facets`); }
const base = data.get(TAGS[0]) as Facet[];

// ── Q1 MECHANISM
log('');
log('Q1 MECHANISM — normal deviation binned by MAX angle, then the SAME facets binned by MIN angle.');
log('   Babuska-Aziz predicts the gradient constant ~ 1/sin(maxAngle) as maxAngle -> 180 and says');
log('   nothing about minAngle alone. If maxAngle separates and minAngle does not, this repo is');
log('   scoring the wrong angle.');
log('');
log('   maxAngle bin     n        normDeg p50 / p90 / p99      tangUm p50 / p99      posUm p99');
for (const [lo, hi] of [[0, 90], [90, 120], [120, 150], [150, 165], [165, 175], [175, 180.1]] as Array<[number, number]>) {
  const s = base.filter((f) => f.maxA >= lo && f.maxA < hi);
  if (s.length === 0) { log(`   [${lo},${hi})`.padEnd(18) + ' (empty)'); continue; }
  log(`   [${lo},${hi})`.padEnd(18) + `${String(s.length).padStart(7)}   ${p(s.map((f) => f.nd), 0.5).toFixed(2).padStart(6)} /${p(s.map((f) => f.nd), 0.9).toFixed(2).padStart(7)} /${p(s.map((f) => f.nd), 0.99).toFixed(1).padStart(7)}   ${p(s.map((f) => f.tg), 0.5).toFixed(2).padStart(7)} /${p(s.map((f) => f.tg), 0.99).toFixed(1).padStart(8)}   ${p(s.map((f) => f.pos), 0.99).toFixed(2).padStart(7)}`);
}
log('');
log('   minAngle bin     n        normDeg p50 / p90 / p99      tangUm p50 / p99      posUm p99');
for (const [lo, hi] of [[0, 1], [1, 5], [5, 15], [15, 30], [30, 45], [45, 61]] as Array<[number, number]>) {
  const s = base.filter((f) => f.minA >= lo && f.minA < hi);
  if (s.length === 0) { log(`   [${lo},${hi})`.padEnd(18) + ' (empty)'); continue; }
  log(`   [${lo},${hi})`.padEnd(18) + `${String(s.length).padStart(7)}   ${p(s.map((f) => f.nd), 0.5).toFixed(2).padStart(6)} /${p(s.map((f) => f.nd), 0.9).toFixed(2).padStart(7)} /${p(s.map((f) => f.nd), 0.99).toFixed(1).padStart(7)}   ${p(s.map((f) => f.tg), 0.5).toFixed(2).padStart(7)} /${p(s.map((f) => f.tg), 0.99).toFixed(1).padStart(8)}   ${p(s.map((f) => f.pos), 0.99).toFixed(2).padStart(7)}`);
}

// ── Q2 PLACES
log('');
log('Q2 PLACES — Jaccard index of the (theta,z) cells occupied by the >30deg facets, arm vs arm.');
log('   grid 360 x 120 cells (1 deg x 1 mm). 1.0 = literally the same places; 0 = disjoint.');
const cellsOf = (d: Facet[], thr: number): Set<number> => {
  const s = new Set<number>();
  for (const f of d) if (f.nd > thr) s.add(Math.floor((f.th / (2 * Math.PI)) * 360) * 1000 + Math.floor(f.z));
  return s;
};
for (const thr of [30, 60]) {
  const sets = TAGS.map((t) => cellsOf(data.get(t) as Facet[], thr));
  for (let i = 1; i < TAGS.length; i += 1) {
    const A = sets[0]; const B = sets[i];
    let inter = 0; for (const v of B) if (A.has(v)) inter += 1;
    const uni = A.size + B.size - inter;
    log(`   >${thr}deg  ${TAGS[0]} (${A.size} cells) vs ${TAGS[i]} (${B.size} cells):  Jaccard ${(inter / Math.max(1, uni)).toFixed(3)}   overlap ${((100 * inter) / Math.max(1, Math.min(A.size, B.size))).toFixed(1)}% of the smaller`);
  }
}

// ── Q3 RANKABILITY
log('');
log('Q3 RANKABILITY — could the driver\'s heap ever reach this class?');
const byPos = base.map((_, i) => i).sort((a, b) => base[b].pos - base[a].pos);
const byTg = base.map((_, i) => i).sort((a, b) => base[b].tg - base[a].tg);
for (const frac of [0.001, 0.01, 0.05]) {
  const k = Math.max(1, Math.floor(base.length * frac));
  const S = new Set(byPos.slice(0, k));
  let inter = 0; for (const i of byTg.slice(0, k)) if (S.has(i)) inter += 1;
  log(`   top ${(frac * 100).toFixed(1)}% (${k} facets): plane-ruler set vs tangential-excursion set share ${inter} facets = ${((100 * inter) / k).toFixed(1)}%`);
}
{
  const k = Math.max(1, Math.floor(base.length * 0.01));
  const worstTg = byTg.slice(0, k).map((i) => base[i]);
  log(`   the worst-1% BY TANGENTIAL EXCURSION read, on the DRIVER'S plane ruler:`);
  log(`     posUm p50 ${p(worstTg.map((f) => f.pos), 0.5).toFixed(2)}  p99 ${p(worstTg.map((f) => f.pos), 0.99).toFixed(2)}  max ${Math.max(...worstTg.map((f) => f.pos)).toFixed(2)}`);
  log(`     -> the driver sees this class as ${p(worstTg.map((f) => f.pos), 0.5) < 10 ? 'ALREADY PASSING' : 'failing'} (bar = 10 um)`);
  log(`     their maxAngle p50 ${p(worstTg.map((f) => f.maxA), 0.5).toFixed(1)} deg, minAngle p50 ${p(worstTg.map((f) => f.minA), 0.5).toFixed(2)} deg, diam p50 ${(p(worstTg.map((f) => f.diam), 0.5) * 1000).toFixed(0)} um`);
}
log('');
log('done');
