// s58SecondStyle.ts — DOES THE ORIENTATION FINDING REPRODUCE OFF GothicArches? If not, it is a style
// fact and not a pipeline fact.
//
// TWO STYLES, CHOSEN AS CONTROLS RATHER THAN AS SAMPLES:
//
//  * Voronoi — CREASE class. Gothic's relief is C1 ribs running in ONE direction (vertical-ish arch
//    ribs), which is exactly the anisotropy S56 blamed for the flip refutation. Voronoi's relief is
//    C0 bisector creases running in EVERY direction, with triple junctions. If the orientation defect
//    is really about spanning a high-curvature direction, the two should behave differently in a
//    way the maxAngle binning can see.
//
//  * LowPolyFacet — the STRONGEST possible control, because the surface is piecewise FLAT. On a flat
//    patch the true normal is constant and a facet lying in it has EXACTLY zero orientation error.
//    So any large tangExc on LowPolyFacet cannot be blamed on curvature at all — it is the mesher
//    straddling a facet boundary, or it is the ruler. Either answer is worth having.
//
// *** INSTRUMENT-VALIDITY GATE, FIRST AND BLOCKING. *** These STLs are from earlier arms and their
// dims/params are not recorded beside them. If the rA I rebuild is not the surface the mesh was built
// against, every normal is wrong and every number below is noise. So the probe first measures
// |hypot(x,y) - rA(atan2(y,x), z)| over sampled VERTICES: the mesher puts its vertices ON the
// surface, so this must be ~0. Above the threshold the run is marked UNTRUSTED and the numbers are
// printed with that label rather than suppressed.
//
// Usage:  bash research/tools/run-s58-second-style.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NS = Math.round(envF('PF_S58_N', 250000));
const GATE = envF('PF_S58_GATE_MM', 0.05);
// style : stl-stem
const JOBS: Array<[string, string]> = (process.env.PF_S58_JOBS
  ?? 'Voronoi=voronoi_ring_D--,LowPolyFacet=lowpolyfacet_ring_D--,GothicArches=gothicarches_ring_DS-HT_S39CTL')
  .split(',').map((s) => { const [a, b] = s.split('='); return [a, b] as [string, string]; });

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

log('===== S58 — DOES THE ORIENTATION FINDING REPRODUCE OFF GothicArches? =====');
log(`gate: vertex-on-surface p99 must be <= ${GATE} mm or the row is UNTRUSTED`);

for (const [style, stem] of JOBS) {
  const path = `research/exchange/_strataConformBisect/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${style}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  // dims: the campaign standard. If wrong, the gate below will say so.
  const DIMS: StyleDims = { H: envF('PF_S58_H', 120), Rb: envF('PF_S58_RB', 40), Rt: envF('PF_S58_RT', 50), expn: envF('PF_S58_EXPN', 1) };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  log(`\n───────── ${style}  (${stem}, ${nTri} facets) ─────────`);
  // ── GATE
  const gres: number[] = [];
  const gstep = Math.max(1, Math.floor((nTri * 3) / 50000));
  for (let i = 0; i < nTri * 3; i += gstep) {
    const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
    gres.push(Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)));
  }
  gres.sort((a, b) => a - b);
  const gp99 = pq(gres, 0.99); const gmax = gres[gres.length - 1];
  const trusted = gp99 <= GATE;
  log(`  GATE vertex-on-surface: p50 ${pq(gres, 0.5).toFixed(5)}  p99 ${gp99.toFixed(5)}  max ${gmax.toFixed(5)} mm  -> ${trusted ? 'TRUSTED' : '*** UNTRUSTED (rebuilt rA is NOT this mesh\'s surface) ***'}`);

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
  const nd: number[] = []; const tg: number[] = []; const ma: number[] = []; const pos: number[] = [];
  const rows = new Map<string, { nd: number[]; tg: number[]; pos: number[] }>();
  const binOf = (m: number): string => (m < 90 ? '[0,90)  ' : m < 120 ? '[90,120)' : m < 150 ? '[120,150)' : m < 165 ? '[150,165)' : m < 175 ? '[165,175)' : '[175,180)');
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
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const ang = (Math.acos(dot) * 180) / Math.PI;
    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    const diam = Math.max(la, lb, lc);
    const g3 = (p1: number, p2: number, p3: number): number => {
      const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
      return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
    };
    const mA = Math.max(g3(la, lb, lc), g3(lb, lc, la), g3(lc, la, lb));
    const tgv = Math.sin((ang * Math.PI) / 180) * diam * 1000;
    const pv = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;
    nd.push(ang); tg.push(tgv); ma.push(mA); pos.push(pv);
    const b = binOf(mA); let rr = rows.get(b); if (rr === undefined) { rr = { nd: [], tg: [], pos: [] }; rows.set(b, rr); }
    rr.nd.push(ang); rr.tg.push(tgv); rr.pos.push(pv);
  }
  const over10 = tg.filter((v) => v > 10).length;
  const posOver = pos.filter((v) => v > 10).length;
  nd.sort((a, b) => a - b); tg.sort((a, b) => a - b); ma.sort((a, b) => a - b); pos.sort((a, b) => a - b);
  log(`  ${trusted ? '' : '[UNTRUSTED] '}sampled ${nd.length}`);
  log(`    posUm   p50 ${pq(pos, 0.5).toFixed(2)}  p99 ${pq(pos, 0.99).toFixed(2)}  max ${pos[pos.length - 1].toFixed(1)}   over-10um ${posOver} (${((100 * posOver) / pos.length).toFixed(3)}%)`);
  log(`    normDeg p50 ${pq(nd, 0.5).toFixed(2)}  p99 ${pq(nd, 0.99).toFixed(2)}  max ${nd[nd.length - 1].toFixed(1)}`);
  log(`    tangUm  p50 ${pq(tg, 0.5).toFixed(2)}  p99 ${pq(tg, 0.99).toFixed(2)}  max ${tg[tg.length - 1].toFixed(1)}   over-10um ${over10} (${((100 * over10) / tg.length).toFixed(3)}%)`);
  log(`    maxAng  p50 ${pq(ma, 0.5).toFixed(1)}  p99 ${pq(ma, 0.99).toFixed(1)}  max ${ma[ma.length - 1].toFixed(2)}`);
  log(`    *** tangExc over-bar / posErr over-bar = ${(over10 / Math.max(1, posOver)).toFixed(1)}x ***`);
  log(`    maxAngle bin        n      normDeg p99    tangUm p99    posUm p99`);
  for (const b of ['[0,90)  ', '[90,120)', '[120,150)', '[150,165)', '[165,175)', '[175,180)']) {
    const rr = rows.get(b); if (rr === undefined) continue;
    rr.nd.sort((a, c) => a - c); rr.tg.sort((a, c) => a - c); rr.pos.sort((a, c) => a - c);
    log(`    ${b.padEnd(12)} ${String(rr.nd.length).padStart(7)}   ${pq(rr.nd, 0.99).toFixed(2).padStart(9)}   ${pq(rr.tg, 0.99).toFixed(1).padStart(9)}   ${pq(rr.pos, 0.99).toFixed(2).padStart(8)}`);
  }
}
log('');
log('done');
