// s72OrientArmSweep.ts — RE-TEST THE "ORIENTATION IS FLAT ACROSS THE SWEEP" RESULT WITH A CORRECTED RULER.
//
// S53 measured five arms of the AR-cap sweep, found the position MAX moved 8.4x, and found every
// orientation statistic FLAT (normal deviation p99 x1.03, tangential excursion p99 x1.03, maxAngle p99
// x1.00). That was read with the s55 CENTROID ruler, which S61 has now measured to under-read by 1.01x
// (Voronoi) to 10.33x (GothicArches) — and, more importantly, read as a p99 OF A SUP, which S61 has
// measured to be DENSITY-INVARIANT on a turn (x0.9968 over five halvings).
//
// A density-invariant statistic is flat across a density sweep BY CONSTRUCTION. So "flat" was not evidence
// that the sweep did nothing to the orientation field; it was a property of the statistic. This re-runs the
// same arms on:
//   * the covering ruler (k=4 + inset) instead of one centroid sample,
//   * the MONOTONE mm form 2*sin(a/2)*diam instead of sin(a)*diam,
//   * and the AREA-TRUE statistic: the fraction of the SURFACE mis-oriented by more than a bar, which is
//     the one quantity in this family that a mesh CAN converge (a straddle band of width ~h around a
//     crease has area ~ creaseLength * h).
//
// PRE-REGISTERED KILL-CRITERION.
//   The S53 "blindness" reading survives  iff  the AREA-TRUE 5-deg fraction is ALSO flat (< 1.5x across
//   the arms). It is CORRECTED iff area-true moves >= 2x while the sup p99 stays < 1.5x — i.e. the sweep
//   did move the orientation field and the published statistic could not see it.
//
// Usage:  bash research/tools/run-s72-orient-arm-sweep.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NS = Math.round(envF('PF_S72_N', 400000));
const K = Math.round(envF('PF_S72_K', 4));
const INSET = envF('PF_S72_INSET', 0.01);
const STYLE = process.env.PF_S72_STYLE ?? 'GothicArches';
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S72_arm_sweep.ndjson`;
const DEG = 180 / Math.PI;
const STEMS = (process.env.PF_S72_STEMS ?? [
  'gothicarches_ring_DS-HT_S39CTL',
  'gothicarches_ring_DS-HT_S40AR55',
  'gothicarches_ring_DS-HT_S40AR65',
  'gothicarches_ring_DS-HT_S40AR90',
  'gothicarches_ring_DS-HT_S48ADM90',
  'gothicarches_ring_DS-HT_S48CAV90',
].join(',')).split(',');

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
const pq = (a: Float64Array, f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);

mkdirSync(OUTDIR, { recursive: true });
log('===== S72 — THE AR-CAP SWEEP, RE-READ ON THE CORRECTED ORIENTATION RULER =====');
log(`style ${STYLE}  k=${K}  inset=${INSET}  <= ${NS} facets/arm`);
log('');
log('arm                   tris    posP99  posMax  posOv10 |  normDeg p50   p90    p99     max  | AREA-TRUE >1deg  >5deg  >30deg | tangMm p99');

const rows: Array<Record<string, number | string>> = [];
for (const stem of STEMS) {
  const t0 = Date.now();
  const path = `${OUTDIR}/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`${stem}: MISSING`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_S72_H', 120), Rb: envF('PF_S72_RB', 40), Rt: envF('PF_S72_RT', 50), expn: envF('PF_S72_EXPN', 1) };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const ns = fdNormals(rA, H);
  const scratch = new Float64Array(12);
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
  const aND = new Float64Array(n); const aPOS = new Float64Array(n); const aTG = new Float64Array(n);
  let totA = 0; let b1 = 0; let b5 = 0; let b30 = 0;
  for (let k = 0; k < n; k += 1) {
    const i0 = 3 * k;
    const call = (bar: number): ReturnType<typeof orientOfFacet> => orientOfFacet(
      ns, vx[i0], vy[i0], vz[i0], vx[i0 + 1], vy[i0 + 1], vz[i0 + 1], vx[i0 + 2], vy[i0 + 2], vz[i0 + 2],
      vth[i0], vth[i0 + 1], vth[i0 + 2], { k: K, inset: INSET, orient: 'outward', scratch, barRad: (bar * Math.PI) / 180 },
    );
    const o5 = call(5);
    aND[k] = Number.isFinite(o5.normDeg) ? o5.normDeg : 0;
    aTG[k] = Number.isFinite(o5.tangMm) ? o5.tangMm * 1000 : 0;
    aPOS[k] = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;
    const ux = vx[i0 + 1] - vx[i0]; const uy = vy[i0 + 1] - vy[i0]; const uz = vz[i0 + 1] - vz[i0];
    const wx = vx[i0 + 2] - vx[i0]; const wy = vy[i0 + 2] - vy[i0]; const wz = vz[i0 + 2] - vz[i0];
    const ar = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    totA += ar;
    b5 += ar * (Number.isFinite(o5.overFrac) ? o5.overFrac : 0);
    const o1 = call(1); b1 += ar * (Number.isFinite(o1.overFrac) ? o1.overFrac : 0);
    const o30 = call(30); b30 += ar * (Number.isFinite(o30.overFrac) ? o30.overFrac : 0);
  }
  const sND = Float64Array.from(aND).sort(); const sPOS = Float64Array.from(aPOS).sort(); const sTG = Float64Array.from(aTG).sort();
  let posOv = 0; for (let i = 0; i < n; i += 1) if (aPOS[i] > 10) posOv += 1;
  const tag = stem.replace('gothicarches_ring_DS-HT_', '');
  log(`${tag.padEnd(12)} ${String(nTri).padStart(9)}  ${pq(sPOS, 0.99).toFixed(3).padStart(7)} ${sPOS[n - 1].toFixed(3).padStart(7)} ${String(posOv).padStart(6)}  | ${pq(sND, 0.5).toFixed(3).padStart(8)} ${pq(sND, 0.9).toFixed(3).padStart(7)} ${pq(sND, 0.99).toFixed(3).padStart(8)} ${sND[n - 1].toFixed(2).padStart(7)} | ${((100 * b1) / totA).toFixed(4).padStart(8)}% ${((100 * b5) / totA).toFixed(4).padStart(8)}% ${((100 * b30) / totA).toFixed(5).padStart(9)}% | ${pq(sTG, 0.99).toFixed(2).padStart(9)}`);
  rows.push({
    stem, tag, nTri, n, posP99: pq(sPOS, 0.99), posMax: sPOS[n - 1], posOver10: posOv,
    ndP50: pq(sND, 0.5), ndP90: pq(sND, 0.9), ndP99: pq(sND, 0.99), ndMax: sND[n - 1],
    area1: b1 / totA, area5: b5 / totA, area30: b30 / totA, tgP99: pq(sTG, 0.99), secs: (Date.now() - t0) / 1000,
  });
  appendFileSync(NDJSON, `${JSON.stringify({ ts: new Date().toISOString(), ...rows[rows.length - 1] })}\n`);
}
if (rows.length >= 2) {
  const f = (k: string): number[] => rows.map((r) => r[k] as number);
  const sp = (k: string): number => Math.max(...f(k)) / Math.max(1e-15, Math.min(...f(k)));
  log('');
  log('SPREAD ACROSS THE ARMS (max/min) — the pre-registered discriminator:');
  log(`  posMax        x${sp('posMax').toFixed(3)}      (S53 reported 8.4x on this)`);
  log(`  normDeg p99   x${sp('ndP99').toFixed(3)}      [S53's statistic, corrected ruler: FLAT if < 1.5x]`);
  log(`  tangMm  p99   x${sp('tgP99').toFixed(3)}`);
  log(`  AREA-TRUE >1  x${sp('area1').toFixed(3)}`);
  log(`  AREA-TRUE >5  x${sp('area5').toFixed(3)}      *** CORRECTED if >= 2x while normDeg p99 < 1.5x ***`);
  log(`  AREA-TRUE >30 x${sp('area30').toFixed(3)}`);
}
log(`\nndjson: ${NDJSON}`);
log('done');
