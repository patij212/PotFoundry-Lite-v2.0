// s115PosBase.ts — S115 ADDENDUM 2: THE POSITION BASELINE, SPLIT BY WHERE THE PROJECTOR IS HONEST.
//
// WHY. The operator run reports, for the WELD arm, that 1,841 of its 4,705 "honest-projector" NEW facets
// (|rDot| > 0.2, i.e. not edge-on to the radial direction) exceed the 0.01 mm export bar, MAX 1.037 mm.
// That number is unreadable without the SAME statistic on the SHIPPING mesh: 39% over-bar is a disaster
// if the mesh at large is at 2%, and it is par if the mesh at large is at 40%. The operator tool measured
// the unrestricted whole-mesh base (10.73% over bar, MAX 1.439 mm) but not the restricted one.
//
// The ruler is identical to the operator tool's: max over a barycentric lattice of |r_pt - rA(th,z)|,
// an UPPER bound on the true distance to the surface (a radial segment reaching the surface), and the
// known-INFLATING projector on riser/curtain facets — which is exactly why it is split here.
//
// Usage: bash research/tools/run-s115-posbase.sh   (env PF_S115_STL absolute)
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const POS_BAR = envF('PF_S115_POSBAR', 0.01);
const POS_K = envI('PF_S115_POSK', 6);
const STRIDE = envI('PF_S115_PSTRIDE', 8);
if (STL.length === 0) { log('*** PF_S115_STL required ***'); process.exit(2); }
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
const q = (v: number[], p: number): number => { const s = v.slice().sort((a, b) => a - b); return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 ADDENDUM 2 — POSITION BASELINE SPLIT BY PROJECTOR HONESTY — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}   facets ${nTri}   stride ${STRIDE}   lattice k=${POS_K}   bar ${POS_BAR} mm`);
log('');
const bins = [0, 0.05, 0.1, 0.2, 0.4, 1.01];          // 5 half-open bands over |rDot|
const NB = bins.length - 1;
const cnt = new Array<number>(NB).fill(0);
const over = new Array<number>(NB).fill(0);
const mx = new Array<number>(NB).fill(0);
const devsHon: number[] = []; const devsAll: number[] = [];
let n = 0; let overAll = 0; let mxAll = 0; let areaHonOver = 0; let areaHon = 0; let areaAll = 0; let areaAllOver = 0;
for (let f = 0; f < nTri; f += STRIDE) {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const l = Math.hypot(nx, ny, nz); const area = 0.5 * l;
  if (l > 0) { nx /= l; ny /= l; }
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3; const gl = Math.hypot(gx, gy);
  const rDot = gl > 0 ? Math.abs((nx * gx + ny * gy) / gl) : 0;
  let worst = 0;
  for (let i = 0; i <= POS_K; i += 1) {
    for (let j = 0; i + j <= POS_K; j += 1) {
      const w0 = (POS_K - i - j) / POS_K; const w1 = i / POS_K; const w2 = j / POS_K;
      const x = w0 * ax + w1 * bx + w2 * cx; const y = w0 * ay + w1 * by + w2 * cy; const z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    }
  }
  let bi = NB - 1;
  for (let i = 0; i < NB; i += 1) if (rDot >= bins[i] && rDot < bins[i + 1]) { bi = i; break; }
  cnt[bi] += 1; if (worst > POS_BAR) over[bi] += 1; if (worst > mx[bi]) mx[bi] = worst;
  n += 1; areaAll += area; devsAll.push(worst);
  if (worst > POS_BAR) { overAll += 1; areaAllOver += area; }
  if (worst > mxAll) mxAll = worst;
  if (rDot > 0.2) { areaHon += area; devsHon.push(worst); if (worst > POS_BAR) areaHonOver += area; }
}
log('   |rDot| band        facets     over 0.01mm   over%      MAX dev mm');
for (let i = 0; i < cnt.length; i += 1) {
  const lo = i === 0 ? 0 : bins[i]; const hi = i < bins.length ? bins[i + 1] ?? 1 : 1;
  log(`   [${lo.toFixed(2)}, ${(i === bins.length ? 1 : hi).toFixed(2)})  ${String(cnt[i]).padStart(12)} ${String(over[i]).padStart(13)}  ${cnt[i] > 0 ? ((over[i] / cnt[i]) * 100).toFixed(3).padStart(7) : '   —   '}%  ${mx[i].toExponential(3).padStart(13)}`);
}
log('');
const nHon = devsHon.length;
const nOverHon = devsHon.filter((d) => d > POS_BAR).length;
log(`   ALL facets (stride):        n ${n}   over ${overAll} (${((overAll / n) * 100).toFixed(4)}%)   AREA over ${((areaAllOver / areaAll) * 100).toFixed(4)}%   MAX ${mxAll.toExponential(3)} mm`);
log(`   HONEST (|rDot| > 0.2):      n ${nHon}   over ${nOverHon} (${((nOverHon / Math.max(1, nHon)) * 100).toFixed(4)}%)   AREA over ${((areaHonOver / Math.max(1e-30, areaHon)) * 100).toFixed(4)}%   MAX ${q(devsHon, 1).toExponential(3)} mm`);
log(`   HONEST deviation quantiles: p50 ${q(devsHon, 0.5).toExponential(3)}  p90 ${q(devsHon, 0.9).toExponential(3)}  p99 ${q(devsHon, 0.99).toExponential(3)} mm`);
log('');
log('   READ: this is the SHIPPING mesh. Any operator arm must be compared against THESE numbers, not');
log('   against the unrestricted column, because the radial projector inflates on edge-on facets.');
