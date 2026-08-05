// s53NormalField.ts — THE DEFECT CLASS NO RULER IN THE PIPELINE SCORES.
//
// THE OBSERVATION THAT FORCED THIS. Across cap 50 / 65 / 90 / 90+cavity the driver's headline max
// fell 47.282 -> 5.655 um (8.4x) and the visible artefacts in Cura are UNCHANGED and in the SAME
// PLACES: long thin facets standing proud at the silhouette. Every ruler in this repo measures
// distance mesh<->surface. None measures ORIENTATION.
//
// THE HYPOTHESIS, and it has a classical name. Position (C0) error of a linear interpolant on an
// inscribed triangle is O(h^2) and needs only a diameter condition. GRADIENT (C1 / NORMAL) error is
// NOT controlled by h at all: Babuska-Aziz (1976) proved the MAXIMUM ANGLE CONDITION (max angle
// bounded away from pi) is necessary and sufficient for the gradient of the linear interpolant to
// converge. A driver that h-refines while jamming in an aspect-ratio corner therefore drives the
// position ruler to zero while the normal field does not converge at all — which is exactly the
// operator's report.
//
// *** AND NOTE WHICH ANGLE. *** This repo's standing quality metric is MIN angle
// (LAB-CHEATSHEET: "Slivers by minAngle"). A NEEDLE (1, 89.5, 89.5) has a tiny min angle and a
// perfectly bounded max angle, and its gradients converge fine. A CAP (1, 1, 178) has the same tiny
// min angle and its gradients do not converge at all. minAngle cannot tell them apart. If the visible
// class is a max-angle class, the project has been measuring the wrong angle.
//
// PRE-REGISTERED DISCRIMINATOR (written before running). Across the cap sweep:
//   * a quantity that FALLS >= 5x is measuring what the existing rulers already measure => NOT it.
//   * a quantity that stays FLAT (< 1.5x) tracks the visual => candidate missing instrument.
// KILL-CRITERION: if the normal-deviation tail falls >= 5x across the sweep, the G1 hypothesis is
// REFUTED and the visible class is something else.
//
// Usage:  bash research/tools/run-s53-normal-field.sh "S39CTL,S40AR65,S40AR90,S48CAV90,S48ADM90"
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
const TAGS = (process.env.PF_S53_TAGS ?? 'S39CTL,S40AR65,S40AR90,S48CAV90,S48ADM90').split(',');
const NS = Math.round(envF('PF_S53_N', 200000));
const REF_HS = envF('PF_S53_REF_HS', 0.03);
const REF_NMIN = Math.round(envF('PF_S53_REF_NMIN', 12));
const REF_NMAX = Math.round(envF('PF_S53_REF_NMAX', 64));

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
const q = (a: Float64Array, p: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(p * a.length))]);

/** analytic OUTWARD unit normal of the radial surface at (th,z). n = (r_th s + r c, r s - r_th c, -r r_z). 5 rA evals. */
function surfNormal(th: number, z: number): [number, number, number] {
  const hTh = 1e-5 / Math.max(1e-6, rA(th, z));
  const hZ = 1e-5;
  const r = rA(th, z);
  const rTh = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  const zp = Math.min(H, z + hZ); const zm = Math.max(0, z - hZ);
  const rZ = zp > zm ? (rA(th, zp) - rA(th, zm)) / (zp - zm) : 0;
  const c = Math.cos(th); const s = Math.sin(th);
  let nx = rTh * s + r * c; let ny = r * s - rTh * c; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  return [nx, ny, nz];
}

log('===== S53 — NORMAL-FIELD (G1) ERROR: THE CLASS NO RULER SCORES =====');
log(`sampling ${NS} facets per mesh (uniform stride); plane ruler at the driver's own REF_HS=${REF_HS} n in [${REF_NMIN},${REF_NMAX}]`);
log('');
log('  posUm   = sagAdaptiveRaw, the DRIVER\'S OWN plane ruler (the 8.4x quantity)');
log('  normDeg = angle(facet normal, analytic surface normal at the facet\'s parametric centroid)');
log('  tangUm  = sin(normDeg) x facet diameter — the PHYSICAL SIZE of the orientation defect, in um');
log('  maxAng  = largest interior angle (Babuska-Aziz: -> 180 kills gradient convergence)');
log('  minAng  = smallest interior angle (what this repo currently scores)');
log('');
const hdr = 'arm        tris     posUm p99 / max |  normDeg p50 / p99 / max | >30deg  |  tangUm p99 / max  | maxAng p99/max | minAng p1/min';
log(hdr); log('-'.repeat(hdr.length));

interface Row { tag: string; nTri: number; pos99: number; posMax: number; nd50: number; nd99: number; ndMax: number; n30: number; tg99: number; tgMax: number; ma99: number; maMax: number; mi1: number; miMin: number; tang10: number }
const rows: Row[] = [];
for (const tag of TAGS) {
  const path = `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_${tag}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`${tag.padEnd(10)} (missing ${path})`); continue; }
  const { xyz, nTri } = mesh;
  const step = Math.max(1, Math.floor(nTri / NS));
  const n = Math.floor(nTri / step);
  // compact SagMesh over just the sampled facets, so the DRIVER'S OWN ruler measures the position arm
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  const nd = new Float64Array(n); const tg = new Float64Array(n); const ma = new Float64Array(n); const mi = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    const o = (k * step) * 9;
    for (let v = 0; v < 3; v += 1) {
      vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2];
    }
    // unwrap theta off vertex A exactly as S44 validated (reproduced the driver on 100% of facets)
    const thA = Math.atan2(vy[3 * k], vx[3 * k]);
    vth[3 * k] = thA;
    vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
    vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
    ta[k] = 3 * k; tb[k] = 3 * k + 1; tc[k] = 3 * k + 2;
  }
  const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy };
  const ARG = makeSagArgmax();
  const pos = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    pos[k] = sagAdaptiveRaw(rA, SAGM, k, REF_HS, REF_NMIN, REF_NMAX, ARG) * 1000;
    const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
    const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
    const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
    // facet normal from winding, oriented outward against the centroid's radial direction
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-18) { nd[k] = 0; tg[k] = 0; ma[k] = 180; mi[k] = 0; continue; }
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }   // outward by construction
    const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
    const zc = (az + bz + cz) / 3;
    const sn = surfNormal(thc, zc < 0 ? 0 : zc > H ? H : zc);
    let dot = fx * sn[0] + fy * sn[1] + fz * sn[2];
    dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const ang = (Math.acos(dot) * 180) / Math.PI;
    nd[k] = ang;
    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    const diam = Math.max(la, lb, lc);
    tg[k] = Math.sin((ang * Math.PI) / 180) * diam * 1000;
    // interior angles by the law of cosines, clamped
    const ang3 = (p1: number, p2: number, p3: number): number => {
      const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
      return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
    };
    const A1 = ang3(la, lb, lc); const A2 = ang3(lb, lc, la); const A3 = ang3(lc, la, lb);
    ma[k] = Math.max(A1, A2, A3); mi[k] = Math.min(A1, A2, A3);
  }
  const n30 = nd.reduce((s, v) => s + (v > 30 ? 1 : 0), 0);
  const tang10 = tg.reduce((s, v) => s + (v > 10 ? 1 : 0), 0);
  pos.sort(); nd.sort(); tg.sort(); ma.sort(); mi.sort();
  const r: Row = {
    tag, nTri, pos99: q(pos, 0.99), posMax: pos[n - 1], nd50: q(nd, 0.5), nd99: q(nd, 0.99), ndMax: nd[n - 1],
    n30, tg99: q(tg, 0.99), tgMax: tg[n - 1], ma99: q(ma, 0.99), maMax: ma[n - 1], mi1: q(mi, 0.01), miMin: mi[0], tang10,
  };
  rows.push(r);
  log(`${tag.padEnd(10)} ${String(nTri).padStart(8)}  ${r.pos99.toFixed(2).padStart(7)} /${r.posMax.toFixed(1).padStart(8)} | ${r.nd50.toFixed(2).padStart(6)} /${r.nd99.toFixed(1).padStart(7)} /${r.ndMax.toFixed(1).padStart(6)} | ${String(n30).padStart(6)} | ${r.tg99.toFixed(1).padStart(7)} /${r.tgMax.toFixed(0).padStart(8)} | ${r.ma99.toFixed(1).padStart(5)}/${r.maMax.toFixed(2).padStart(6)} | ${r.mi1.toFixed(2).padStart(5)}/${r.miMin.toFixed(3).padStart(6)}`);
}

if (rows.length >= 2) {
  const a = rows[0]; const b = rows[rows.length - 1];
  const rat = (x: number, y: number): string => `${(x / Math.max(1e-12, y)).toFixed(2)}x`;
  log('');
  log(`SWEEP RATIO  ${a.tag} -> ${b.tag}   (the sweep over which the operator reports NO visual change)`);
  log(`   position (driver plane ruler)  p99 ${rat(a.pos99, b.pos99)}   max ${rat(a.posMax, b.posMax)}`);
  log(`   normal deviation               p99 ${rat(a.nd99, b.nd99)}   max ${rat(a.ndMax, b.ndMax)}   count>30deg ${rat(a.n30, b.n30)}`);
  log(`   tangential excursion (um)      p99 ${rat(a.tg99, b.tg99)}   max ${rat(a.tgMax, b.tgMax)}   count>10um ${rat(a.tang10, b.tang10)}`);
  log(`   max interior angle             p99 ${rat(a.ma99, b.ma99)}   max ${rat(a.maMax, b.maMax)}`);
  log('');
  log('   PRE-REGISTERED: >=5x means the quantity is what the existing rulers already measure.');
  log('                   <1.5x means it is FLAT across the sweep and tracks the unchanged visual.');
}
log('');
log('done');
