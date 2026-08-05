// s55OrientHeatmap.ts — THE VISUAL A/B: the SAME mesh coloured by the POSITION ruler and by the
// ORIENTATION ruler, on one image, at one colour scale.
//
// S53/S54 measured that the driver's plane ruler and the orientation error are 90% disjoint
// populations and that the orientation error is flat across a sweep on which the position max fell
// 8.4x. This renders that claim so it can be judged by eye rather than by table — the lab rule being
// that if a render disagrees with a metric, the render wins.
//
// Both panels use the SAME ramp (`vertErrColors`, scale 0.05 mm) so green/red mean the same thing in
// both. Flat-shaded, because smooth vertex normals average sharp relief away.
//
// Usage:  bash research/tools/run-s55-orient-heatmap.sh [TAG]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { vertErrColors, dumpRenderBins } from '../bridge/labkit';
import { mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAG = process.env.PF_S55_TAG ?? 'S39CTL';
const OUT = process.env.PF_S55_OUT ?? 'research/exchange/_strataConformBisect/s55render';
const SCALE = envF('PF_S55_SCALE_MM', 0.05);
const MAXF = Math.round(envF('PF_S55_MAXF', 1200000));

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

log('===== S55 — ORIENTATION vs POSITION, SAME MESH, SAME RAMP =====');
mkdirSync(OUT, { recursive: true });
const path = `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_${TAG}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
const step = Math.max(1, Math.ceil(nTri / MAXF));
const n = Math.floor(nTri / step);
log(`${path}: ${nTri} tri -> rendering ${n} (stride ${step}), ramp 0..${SCALE} mm`);

const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
const P = new Float32Array(9 * n); const IDX = new Uint32Array(3 * n);
for (let k = 0; k < n; k += 1) {
  const o = (k * step) * 9;
  for (let v = 0; v < 3; v += 1) {
    vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2];
    P[9 * k + 3 * v] = xyz[o + 3 * v]; P[9 * k + 3 * v + 1] = xyz[o + 3 * v + 1]; P[9 * k + 3 * v + 2] = xyz[o + 3 * v + 2];
  }
  const thA = Math.atan2(vy[3 * k], vx[3 * k]);
  vth[3 * k] = thA;
  vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
  vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
  ta[k] = 3 * k; tb[k] = 3 * k + 1; tc[k] = 3 * k + 2;
  IDX[3 * k] = 3 * k; IDX[3 * k + 1] = 3 * k + 1; IDX[3 * k + 2] = 3 * k + 2;
}
const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy }; const ARG = makeSagArgmax();
const ePos = new Float64Array(3 * n); const eTan = new Float64Array(3 * n);
let posMax = 0; let tanMax = 0; let posOver = 0; let tanOver = 0;
for (let k = 0; k < n; k += 1) {
  const pos = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG);           // mm — the DRIVER'S ruler
  const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
  const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
  const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  let tan = 0;
  if (fl > 1e-18) {
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
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
    const diam = Math.max(
      Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
    // *** FIXED 2026-08-05. WAS `Math.sin(Math.acos(dot)) * diam`, WHICH IS NON-MONOTONE IN THE
    // ANGLE AND SCORES A FULLY INVERTED FACET AT ~ZERO. *** sin(theta) peaks at 90 deg and returns to
    // 0 at 180, so a facet whose normal points exactly BACKWARDS — the worst case there is — measured
    // 6.6e-16 mm. That is not a conservative reading, it is the wrong sign of wrong: the worst facets
    // scored best. This quantity is used as a RANKING KEY by the S56 flip pass, so the pass was being
    // steered away from precisely the facets it exists to repair.
    // The right quantity is the CHORD between the two unit normals, 2*sin(theta/2), which is monotone
    // on [0, pi] and reaches its maximum of 2 at full inversion. Found by GUARD (S61 F4b) reading the
    // formula rather than the output.
    tan = 2 * Math.sin(0.5 * Math.acos(dot)) * diam;                    // mm
  }
  if (pos > posMax) posMax = pos;
  if (tan > tanMax) tanMax = tan;
  if (pos > 0.01) posOver += 1;
  if (tan > 0.01) tanOver += 1;
  for (let v = 0; v < 3; v += 1) { ePos[3 * k + v] = pos; eTan[3 * k + v] = tan; }
}
log(`  POSITION (driver plane ruler): max ${(posMax * 1000).toFixed(1)} um   over-10um ${posOver} (${((100 * posOver) / n).toFixed(3)}%)`);
log(`  ORIENTATION (tangential exc.): max ${(tanMax * 1000).toFixed(1)} um   over-10um ${tanOver} (${((100 * tanOver) / n).toFixed(3)}%)`);
log(`  *** ${(tanOver / Math.max(1, posOver)).toFixed(1)}x more facets over the 10 um bar on the ruler nobody runs ***`);

dumpRenderBins(OUT, `${TAG}_A_position_radial`, P, IDX, {
  colors: vertErrColors(ePos, SCALE),
  meta: { ruler: 'radial', worstMm: posMax, p99Mm: 0, pctOver0_03: (100 * posOver) / n, nonMan: 0, cls: `POSITION sagAdaptive (driver key) max ${(posMax * 1000).toFixed(1)}um over10um ${posOver}` },
});
dumpRenderBins(OUT, `${TAG}_B_orientation_true3d`, P, IDX, {
  colors: vertErrColors(eTan, SCALE),
  meta: { ruler: 'true3d', worstMm: tanMax, p99Mm: 0, pctOver0_03: (100 * tanOver) / n, nonMan: 0, cls: `ORIENTATION tangExc (UNSCORED) max ${(tanMax * 1000).toFixed(1)}um over10um ${tanOver}` },
});
log(`bins written to ${OUT}`);
log('done');
