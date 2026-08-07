// s116RulerBridge.ts — S116 ADDENDUM: HOW MUCH DOES THE REFINEMENT DRIVER OVER-CHARGE?
//
// Both bills in this session (the ladder integral and the adaptive descent) drive refinement on the
// RADIAL GAP, because it is the only ruler cheap enough to run tens of millions of times. The radial
// gap is a PROVEN UPPER BOUND on the true distance to the surface, so a bill it produces is an upper
// bound on the true bill — but "an upper bound" is not a number, and on a steep relief flank the radial
// gap over-reads by 1/|n.rhat|, which is exactly where the bill is concentrated.
//
// This measures the correction. At each area-weighted location, find h* under BOTH rulers on the SAME
// first-fundamental-form quad ladder:
//    RADIAL  max over the barycentric lattice of |hypot(x,y) - rA(atan2(y,x), z)|
//    PERP    max over the same lattice of buildRadialSurfaceProjector(...).dist
// and report the ratio of the resulting bill densities E[2/h*^2]. That ratio is the factor by which
// every triangle count in this session should be divided to get the honest bill.
//
// The perpendicular ruler is ~200x slower per point, which is why this runs on a sample and the main
// bills do not. The sample is area-weighted and its block spread is reported, so the correction comes
// with an error bar rather than as a bare constant.
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S116_STL ?? '';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116_BARHI', 0.01);
const BAR_LO = envF('PF_S116_BARLO', 0.001);
const NLOC = envI('PF_S116_RBN', 12000);
const K = envI('PF_S116_LK', 4);
const HMAX = envF('PF_S116_HMAX', 8);
const HMIN = envF('PF_S116_HMIN', 2e-4);
const HRAT = envF('PF_S116_HRAT', Math.pow(2, 0.25));
const SEED = envI('PF_S116_SEED', 20260807);
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: envI('PF_S116_PNTH', 1024), nZ: envI('PF_S116_PNZ', 512), seedTopK: envI('PF_S116_PK', 6) });

const M = readMeshFloat64(STL, false);
let zLo = Infinity; let zHi = -Infinity;
for (let f = 0; f < M.nTri; f += 1) { const o = f * 9; for (let v = 0; v < 3; v += 1) { const z = M.xyz[o + v * 3 + 2]; if (z < zLo) zLo = z; if (z > zHi) zHi = z; } }

const hs: number[] = []; for (let h = HMAX; h >= HMIN; h /= HRAT) hs.push(h);
const NH = hs.length;
const LAT = ((k: number): Float64Array => { const o: number[] = []; for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) o.push((k - i - j) / k, i / k, j / k); return new Float64Array(o); })(K);
const NPL = LAT.length / 3;
const HFD_T = 1e-5; const HFD_Z = 1e-4;
const P = new Float64Array(12);

/** both rulers on the SAME quad; returns [radialMax, perpMax]. */
const quadBoth = (th0: number, z0: number, h: number, wantPerp: boolean): [number, number] => {
  const r0 = rA(th0, z0);
  const rt = (rA(th0 + HFD_T, z0) - rA(th0 - HFD_T, z0)) / (2 * HFD_T);
  const rz = (rA(th0, z0 + HFD_Z) - rA(th0, z0 - HFD_Z)) / (2 * HFD_Z);
  const dth = h / Math.max(1e-9, Math.sqrt(rt * rt + r0 * r0));
  const dz = h / Math.max(1e-9, Math.sqrt(rz * rz + 1));
  const ths = [th0, th0 + dth, th0, th0 + dth]; const zzs = [z0, z0, z0 + dz, z0 + dz];
  for (let i = 0; i < 4; i += 1) { const r = rA(ths[i], zzs[i]); P[i * 3] = r * Math.cos(ths[i]); P[i * 3 + 1] = r * Math.sin(ths[i]); P[i * 3 + 2] = zzs[i]; }
  let wr = 0; let wp = 0;
  for (const t of [[0, 1, 2], [1, 3, 2]]) {
    const a = t[0] * 3, b = t[1] * 3, c = t[2] * 3;
    for (let p = 0; p < NPL; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * P[a] + w1 * P[b] + w2 * P[c];
      const y = w0 * P[a + 1] + w1 * P[b + 1] + w2 * P[c + 1];
      const z = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2];
      const dr = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dr > wr) wr = dr;
      if (wantPerp) { const dp = proj.project(x, y, z).dist; if (dp > wp) wp = dp; }
    }
  }
  return [wr, wp];
};
const jac = (th: number, z: number): number => {
  const r = rA(th, z);
  const rt = (rA(th + HFD_T, z) - rA(th - HFD_T, z)) / (2 * HFD_T);
  const rz = (rA(th, z + HFD_Z) - rA(th, z - HFD_Z)) / (2 * HFD_Z);
  const c = Math.cos(th), s = Math.sin(th);
  const ax = rt * c - r * s, ay = rt * s + r * c;
  const bx = rz * c, by = rz * s, bz = 1;
  return Math.hypot(ay * bz - by * 0, 0 * bx - ax * bz, ax * by - ay * bx);
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 ADDENDUM — RADIAL-DRIVER vs PERPENDICULAR-DRIVER BILL CORRECTION — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`locations ${NLOC}   lattice k=${K}   ladder ${HMIN}..${HMAX} ratio ${HRAT.toFixed(5)}   bars ${BAR_HI} / ${BAR_LO}`);
log('');

let s0 = SEED >>> 0;
const rnd = (): number => { s0 ^= s0 << 13; s0 >>>= 0; s0 ^= s0 >>> 17; s0 ^= s0 << 5; s0 >>>= 0; return s0 / 4294967296; };
const NB = 8; const per = Math.floor(NLOC / NB);
const bRadHi = new Float64Array(NB); const bPerpHi = new Float64Array(NB);
const bRadLo = new Float64Array(NB); const bPerpLo = new Float64Array(NB);
let ratioSum = 0; let ratioN = 0; const ratios: number[] = [];
const t0 = Date.now();
for (let i = 0; i < NLOC; i += 1) {
  const th = rnd() * 2 * Math.PI; const z = zLo + rnd() * (zHi - zLo);
  const J = jac(th, z); const b = Math.min(NB - 1, Math.floor(i / per));
  let okRH = true, okRL = true, okPH = true, okPL = true;
  let rH = 0, rL = 0, pH = 0, pL = 0;
  for (let hi = NH - 1; hi >= 0; hi -= 1) {
    const [wr, wp] = quadBoth(th, z, hs[hi], true);
    if (okRL) { if (wr <= BAR_LO) rL = hs[hi]; else okRL = false; }
    if (okRH) { if (wr <= BAR_HI) rH = hs[hi]; else okRH = false; }
    if (okPL) { if (wp <= BAR_LO) pL = hs[hi]; else okPL = false; }
    if (okPH) { if (wp <= BAR_HI) pH = hs[hi]; else okPH = false; }
    if (!okRL && !okRH && !okPL && !okPH) break;
  }
  if (rH > 0) bRadHi[b] += (2 / (rH * rH)) * J;
  if (pH > 0) bPerpHi[b] += (2 / (pH * pH)) * J;
  if (rL > 0) bRadLo[b] += (2 / (rL * rL)) * J;
  if (pL > 0) bPerpLo[b] += (2 / (pL * pL)) * J;
  if (rL > 0 && pL > 0) { const rr = pL / rL; ratios.push(rr); ratioSum += rr; ratioN += 1; }
}
log(`${NLOC} locations in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
log('');
const red = (a: Float64Array): number => { let s = 0; for (const v of a) s += v; return s; };
const corr = (rr: Float64Array, pp: Float64Array): { c: number; sd: number } => {
  const cs: number[] = [];
  for (let b = 0; b < NB; b += 1) if (rr[b] > 0) cs.push(pp[b] / rr[b]);
  const m = cs.reduce((a, x) => a + x, 0) / cs.length;
  const sd = Math.sqrt(cs.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, cs.length - 1)) / Math.sqrt(cs.length);
  return { c: red(pp) / red(rr), sd };
};
const cH = corr(bRadHi, bPerpHi); const cL = corr(bRadLo, bPerpLo);
log('── THE CORRECTION FACTOR (perpendicular bill / radial bill) ──');
log(`   at 0.01  mm:  ${cH.c.toFixed(4)}  +/- ${cH.sd.toFixed(4)} (8-block s.e.)`);
log(`   at 0.001 mm:  ${cL.c.toFixed(4)}  +/- ${cL.sd.toFixed(4)}`);
log('   < 1 means the radial driver OVER-refines: every triangle count driven by it should be MULTIPLIED');
log('   by this factor to get the honest bill. = 1 means the two rulers agree and no correction is due.');
log('');
ratios.sort((a, b) => a - b);
const qa = (p: number): number => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * p))];
log(`── per-location h*_perp / h*_radial at the 0.001 mm bar (n=${ratios.length}) ──`);
log(`   p01 ${qa(0.01).toFixed(4)}  p10 ${qa(0.1).toFixed(4)}  p50 ${qa(0.5).toFixed(4)}  p90 ${qa(0.9).toFixed(4)}  p99 ${qa(0.99).toFixed(4)}  mean ${(ratioSum / ratioN).toFixed(4)}`);
log('   (>1 = the perpendicular ruler tolerates a COARSER cell than the radial one at the same location)');
log('S116 RULER BRIDGE DONE');
