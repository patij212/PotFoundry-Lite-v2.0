// audWitnessConfirm.ts — DOES AN INSTRUMENT OUTSIDE `_facetTruthLib` AGREE WITH MY OWN HEADLINE?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// I AM AUDITING MY OWN CLAIM HERE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// S62 FINDING 5 asserts: `certifyTriangle` PROVES 396 of 400 top-`tangExc` Voronoi facets over the
// 10 um product bar, witnessed up to 230.76 um, where the driver's plane ruler reports max 4.99 um and
// ZERO failures. That rests entirely on `FacetVerdict.witnessed` being a REAL distance — and
// `tighten` composes radial -> descent -> Newton -> closure, each an UPPER bound on d(p). The header
// claims *"values at or above tol are tightened and exact"*. **That is a claim in a comment.** If
// `tighten` over-states, my "PROVEN-FAIL" is not proven at all, and I would be doing exactly what I
// criticised SECTION 14 for.
//
// So: recompute the distance at `certifyTriangle`'s OWN WITNESS POINT with an instrument that shares
// no code with it — a multi-start global lattice scan plus a plain 8-neighbour coordinate descent
// written inline here. Both are UPPER bounds on d(p), so:
//    brute ~ witnessed  => neither is inflated relative to the other by two independent algorithms
//    brute << witnessed => *** `witnessed` IS INFLATED and my FINDING 5 is overstated ***
//    brute >> witnessed => the brute missed the basin (its own failure), reported not hidden
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// H-J. KILL: if the median of `brute / witnessed` over the sampled witnesses is < 0.5, `witnessed` is
//      inflated by more than 2x and FINDING 5's magnitudes must be withdrawn. CONFIRM: median in
//      [0.9, 1.1] AND >= 90 % of the witnesses have `brute > 0.010 mm` — then the over-bar verdict is
//      reproduced by an independent instrument and stands.
//
// HONEST LIMIT, stated in advance: the brute is an UPPER bound on d(p), never a lower one. It can
// therefore FALSIFY an inflated `witnessed`, and it can CORROBORATE it, but neither instrument alone
// PROVES d(p) > 10 um. The rigorous upper bound over the whole facet is `certifyTriangle`'s `bound`,
// which is already reported. What this probe removes is the single-instrument risk, which is the risk
// that actually bit this campaign twice tonight.
//
// Usage:  bash research/tools/run-aud-witness-confirm.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NS = Math.round(envF('PF_AUDWC_N', 250000));
const K = Math.round(envF('PF_AUDWC_K', 40));
const NU = Math.round(envF('PF_AUDWC_NU', 3072));
const NV = Math.round(envF('PF_AUDWC_NV', 1024));
const NSTART = Math.round(envF('PF_AUDWC_NSTART', 24));
const STYLE = process.env.PF_AUDWC_STYLE ?? 'Voronoi';
const STEM = process.env.PF_AUDWC_STEM ?? 'voronoi_ring_D--';
const OUT = 'research/exchange/_strataConformBisect/AUD_WITNESS.ndjson';

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

mkdirSync('research/exchange/_strataConformBisect', { recursive: true });
log('===== AUD-WITNESS-CONFIRM — an instrument outside _facetTruthLib, on my own headline =====');
log(`${STYLE} / ${STEM}   K ${K} witnesses   brute lattice ${NU}x${NV} = ${((NU * (NV + 1)) / 1e6).toFixed(2)}M evals/point, ${NSTART} restarts`);

const mesh = readMeshFloat64(`research/exchange/_strataConformBisect/${STEM}.stl`, false);
const { xyz, nTri } = mesh;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: zJumps ${zJ.length}  thJumps ${thJ.length}`);

const step = Math.max(1, Math.floor(nTri / NS));
const n = Math.floor(nTri / step);
const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
for (let k = 0; k < n; k += 1) {
  const o = (k * step) * 9;
  for (let v = 0; v < 3; v += 1) { vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2]; }
  const thA = Math.atan2(vy[3 * k], vx[3 * k]);
  vth[3 * k] = thA;
  vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
  vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
}
// tangExc, s58-exact, to select the same population FINDING 5 used
const tg = new Float64Array(n);
for (let k = 0; k < n; k += 1) {
  const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
  const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
  const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) { tg[k] = 0; continue; }
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
  const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
  const r = rA(thc, zc);
  const h1 = 1e-5 / Math.max(1e-6, r); const h2 = 1e-5;
  const rTh = (rA(thc + h1, zc) - rA(thc - h1, zc)) / (2 * h1);
  const zp = Math.min(H, zc + h2); const zm = Math.max(0, zc - h2);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  tg[k] = Math.sin(Math.acos(dot)) * diam * 1000;
}
const top = Array.from({ length: n }, (_v, i) => i).sort((p, q) => tg[q] - tg[p]).slice(0, Math.min(K, n));

/** INDEPENDENT distance-to-surface. Global lattice, NSTART restarts, plain descent. No library code. */
function brute(px: number, py: number, pz: number): { d: number; th: number; z: number } {
  const at = (t: number, zz: number): number => {
    const zc = zz < 0 ? 0 : zz > H ? H : zz;
    const r = rA(t, zc);
    return Math.hypot(px - r * Math.cos(t), py - r * Math.sin(t), pz - zc);
  };
  const bestD = new Float64Array(NSTART).fill(Number.POSITIVE_INFINITY);
  const bestT = new Float64Array(NSTART); const bestZ = new Float64Array(NSTART);
  const TAU = 2 * Math.PI;
  for (let i = 0; i < NU; i += 1) {
    const t = (TAU * i) / NU;
    for (let j = 0; j <= NV; j += 1) {
      const z = (H * j) / NV;
      const v = at(t, z);
      if (v < bestD[NSTART - 1]) {                       // insertion into the sorted top-NSTART
        let q = NSTART - 1;
        while (q > 0 && bestD[q - 1] > v) { bestD[q] = bestD[q - 1]; bestT[q] = bestT[q - 1]; bestZ[q] = bestZ[q - 1]; q -= 1; }
        bestD[q] = v; bestT[q] = t; bestZ[q] = z;
      }
    }
  }
  let gd = Number.POSITIVE_INFINITY; let gt = 0; let gz = 0;
  const ht0 = TAU / NU; const hz0 = H / NV;
  for (let s = 0; s < NSTART; s += 1) {
    if (!Number.isFinite(bestD[s])) continue;
    let d = bestD[s]; let bt = bestT[s]; let bz = bestZ[s];
    let ht = ht0; let hz = hz0;
    for (let it = 0; it < 400; it += 1) {
      let improved = false;
      for (let a = -1; a <= 1; a += 1) {
        for (let b = -1; b <= 1; b += 1) {
          if (a === 0 && b === 0) continue;
          const t = bt + a * ht; const z = bz + b * hz;
          if (z < -1e-9 || z > H + 1e-9) continue;
          const v = at(t, z);
          if (v < d - 1e-16) { d = v; bt = t; bz = z; improved = true; }
        }
      }
      if (!improved) { ht *= 0.5; hz *= 0.5; if (ht < 1e-13 && hz < 1e-13) break; }
    }
    if (d < gd) { gd = d; gt = bt; gz = bz; }
  }
  return { d: gd, th: gt, z: gz };
}

const hdr = 'idx    tangExc     H1 witnessed    H1 bound     BRUTE(indep)   brute/wit   over-10um';
log(''); log(hdr); log('-'.repeat(hdr.length));
const ratios: number[] = []; const brutes: number[] = []; const wits: number[] = [];
let overBarBrute = 0; let overBarWit = 0;
const t0 = Date.now();
for (const k of top) {
  const v = certifyTriangle(rA,
    vx[3 * k], vy[3 * k], vz[3 * k],
    vx[3 * k + 1], vy[3 * k + 1], vz[3 * k + 1],
    vx[3 * k + 2], vy[3 * k + 2], vz[3 * k + 2],
    { H, tol: 0.010, nMax: 512, zJumps: zJ, thJumps: thJ });
  const b = brute(v.px, v.py, v.pz);
  const wit = v.witnessed * 1000; const bd = b.d * 1000;
  ratios.push(bd / Math.max(1e-12, wit)); brutes.push(bd); wits.push(wit);
  if (bd > 10) overBarBrute += 1;
  if (wit > 10) overBarWit += 1;
  log(`${String(k).padStart(6)} ${tg[k].toFixed(1).padStart(9)} ${wit.toFixed(3).padStart(14)} ${(v.bound * 1000).toFixed(3).padStart(11)} ${bd.toFixed(3).padStart(14)} ${(bd / Math.max(1e-12, wit)).toFixed(4).padStart(11)}   ${bd > 10 ? 'YES' : 'no '}`);
  appendFileSync(OUT, `${JSON.stringify({ style: STYLE, facet: k, tangExc: tg[k], witnessed: wit, bound: v.bound * 1000, brute: bd, bruteTh: b.th, bruteZ: b.z, ratio: bd / Math.max(1e-12, wit) })}\n`);
}
const sr = S(ratios); const sb = S(brutes); const sw = S(wits);
log('');
log(`brute / witnessed        p10 ${pq(sr, 0.1).toFixed(4)}   p50 ${pq(sr, 0.5).toFixed(4)}   p90 ${pq(sr, 0.9).toFixed(4)}   min ${sr[0].toFixed(4)}   max ${sr[sr.length - 1].toFixed(4)}`);
log(`H1 witnessed             p50 ${pq(sw, 0.5).toFixed(2)}   max ${sw[sw.length - 1].toFixed(2)} um`);
log(`INDEPENDENT brute        p50 ${pq(sb, 0.5).toFixed(2)}   max ${sb[sb.length - 1].toFixed(2)} um`);
log(`over the 10 um bar:      H1 ${overBarWit}/${top.length}   INDEPENDENT BRUTE ${overBarBrute}/${top.length}`);
log('');
log(`H-J KILL: median brute/witnessed < 0.5 => witnessed inflated, FINDING 5 magnitudes withdrawn.`);
log(`H-J CONFIRM: median in [0.9,1.1] AND >=90% of brutes over 10 um => reproduced independently.`);
log(`  measured median ${pq(sr, 0.5).toFixed(4)}, brute over-bar ${((100 * overBarBrute) / top.length).toFixed(1)}%  => ${pq(sr, 0.5) < 0.5 ? '*** WITHDRAWN ***' : (pq(sr, 0.5) >= 0.9 && pq(sr, 0.5) <= 1.1 && overBarBrute >= 0.9 * top.length) ? 'CONFIRMED' : 'PARTIAL — read the table'}`);
log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
