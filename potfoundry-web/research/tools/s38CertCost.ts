// s38CertCost.ts — WHAT DOES A CERTIFIED ACCEPT TEST ACTUALLY COST, ACROSS THE WHOLE FACET
// DISTRIBUTION, AT EACH CANDIDATE TOLERANCE? Priced BEFORE the arm, not discovered inside it.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS RUNS FIRST
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S37 (d2febcda) showed 98.9% of the certified veto's refusals were radial-conservatism artifacts,
// and the arithmetic on a p50 facet suggested a certified test at the TRUE 10 um bar costs ~190
// evals against the blind ruler's 375 — i.e. cheaper AND sound. But 190 is a p50 number and
// `covRad` scales with edge length, so the LARGE-facet tail could dominate the total. I have been
// wrong on a cost estimate twice in this thread (the "+5.6%", then distPerp's real 23,500), so this
// prices the whole distribution instead of extrapolating from the median again.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE PIECE OF ARITHMETIC EVERYTHING TURNS ON
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Certification needs   max_lattice(reading) + covRad/n <= tol,   so   n >= covRad / (tol - reading).
//
// AND THE READING DOES NOT IMPROVE WITH n. It is a MAX over samples, so raising n can only hold it
// or push it UP. Therefore a facet whose radial reading already exceeds `tol` can NEVER certify at
// any n — it is INFEASIBLE for this ruler and must be refused (i.e. refined), however good the
// underlying geometry is. That population is the real cost driver, not the escalation.
//
// So three classes per facet, per tolerance:
//   CERTIFIABLE  reading < tol and n_req affordable  -> cost = lattice(n_req) evals
//   INFEASIBLE   reading >= tol                      -> refused, and S37 says ~99% of those refusals
//                                                       are artifacts, so this is WASTED refinement
//   CAPPED       n_req > NMAX                        -> refused, same waste
//
// Reported against the BLIND ruler's own cost, lattice(n_current) with n = clamp(le/0.03mm,12,64),
// so "cheaper or dearer than what we already pay" is answered directly rather than in the abstract.
//
// The INFEASIBLE class gets a `distPerpFrom` confirm (~360 evals) so its artifact rate is measured
// at EACH tolerance, not assumed from S37's 3.5 um figure.
//
// ⚠ Costs here are per ACCEPT TEST on the FINAL mesh. The driver runs the test many times per facet
// across refinement, so these are not a whole-run total — they are the per-test comparison, which is
// the quantity that decides whether the swap is affordable. Read-only against a finished STL.
//
// Usage:  bash research/tools/run-s38-cert-cost.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { distPerpFrom } from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const REF_HS = 0.03; const REF_NMIN = 12; const REF_NMAX = 64;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NMAX = Math.round(envF('PF_S38_NMAX', 256));
const STRIDE = Math.max(1, Math.round(envF('PF_S38_STRIDE', 1)));
const STL = process.env.PF_S38_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S36CTL.stl';
const TOLS = (process.env.PF_S38_TOLS ?? '3.5,5,7.5,10').split(',').map((s) => Number(s) / 1000);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const rA = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const rAc = (th: number, z: number): number => rA(canonTheta(th), z);
const lat = (n: number): number => ((n + 1) * (n + 2)) / 2;

/** exact farthest-vertex radius. Transcribed from _facetTruthLib:covRadius. */
function covRadius(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const la = Math.hypot(bx - cx, by - cy, bz - cz);
  const lb = Math.hypot(ax - cx, ay - cy, az - cz);
  const lc = Math.hypot(ax - bx, ay - by, az - bz);
  const mx = Math.max(la, lb, lc);
  const s1 = la * la; const s2 = lb * lb; const s3 = lc * lc;
  const sMax = Math.max(s1, s2, s3);
  if (sMax >= s1 + s2 + s3 - sMax - 1e-18) return mx / 2;
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const n2 = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (n2 < 1e-18) return mx / 2;
  return (la * lb * lc) / (2 * n2);
}

log('===== S38 — COST OF A CERTIFIED ACCEPT TEST, PRICED OVER THE WHOLE FACET DISTRIBUTION =====');
const t0 = Date.now();
const { xyz, nTri } = readMeshFloat64(STL, false);
log(`STL ${STL}`);
log(`     ${nTri} triangles   stride ${STRIDE}   n cap ${NMAX}   tols ${TOLS.map((t) => (t * 1000).toFixed(1)).join('/')} um`);

interface Acc {
  cert: number; infeasible: number; capped: number;
  certEvals: number; infeasArtifact: number; infeasReal: number; nReq: number[];
}
const acc: Acc[] = TOLS.map(() => ({
  cert: 0, infeasible: 0, capped: 0, certEvals: 0, infeasArtifact: 0, infeasReal: 0, nReq: [],
}));
let audited = 0; let blindEvals = 0; let perpCalls = 0;
const radialAll: number[] = []; const covAll: number[] = [];

for (let t = 0; t < nTri; t += STRIDE) {
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const le = Math.max(
    Math.hypot(bx - ax, by - ay, bz - az),
    Math.hypot(cx - bx, cy - by, cz - bz),
    Math.hypot(ax - cx, ay - cy, az - cz),
  );
  if (!(le > 0)) continue;
  audited += 1;
  const nCur = Math.max(REF_NMIN, Math.min(REF_NMAX, Math.ceil(le / REF_HS)));
  blindEvals += lat(nCur);
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
  covAll.push(cov);
  // the RADIAL reading at the current lattice level (the cheap sound-direction ruler)
  let radial = 0; let apx = 0; let apy = 0; let apz = 0;
  for (let i = 0; i <= nCur; i += 1) for (let j = 0; j <= nCur - i; j += 1) {
    const wa = i / nCur; const wb = j / nCur; const wc = 1 - wa - wb;
    const px = wa * ax + wb * bx + wc * cx;
    const py = wa * ay + wb * by + wc * cy;
    const pz = wa * az + wb * bz + wc * cz;
    const th = Math.atan2(py, px);
    const zc = pz < 0 ? 0 : pz > H ? H : pz;
    const r = rA(th, zc);
    const d = Math.hypot(px - r * Math.cos(th), py - r * Math.sin(th), pz - zc);
    if (d > radial) { radial = d; apx = px; apy = py; apz = pz; }
  }
  radialAll.push(radial);
  let perp = -1;                                   // computed lazily, once, shared across tolerances
  for (let k = 0; k < TOLS.length; k += 1) {
    const tol = TOLS[k]; const A = acc[k];
    if (radial >= tol) {
      // INFEASIBLE: the reading is a MAX over samples, so no n can bring it down.
      A.infeasible += 1;
      if (perp < 0) {
        const sth = Math.atan2(apy, apx);
        const sz = apz < 0 ? 0 : apz > H ? H : apz;
        perp = distPerpFrom(rA, H, apx, apy, apz, sth, sz).d;
        perpCalls += 1;
      }
      if (perp <= tol) A.infeasArtifact += 1; else A.infeasReal += 1;
      continue;
    }
    const nReq = Math.ceil(cov / (tol - radial));
    if (nReq > NMAX) { A.capped += 1; continue; }
    A.cert += 1; A.certEvals += lat(Math.max(nReq, REF_NMIN)); A.nReq.push(nReq);
  }
}

const secs = (Date.now() - t0) / 1000;
const pct = (a: number[], f: number): number => a[Math.min(a.length - 1, Math.floor(f * a.length))];
const dd = (nm: string, a: number[], sc: number, u: string): void => {
  if (a.length === 0) { log(`  ${nm.padEnd(24)} (empty)`); return; }
  const s = [...a].sort((x, y) => x - y);
  log(`  ${nm.padEnd(24)} p10 ${(pct(s, 0.1) * sc).toFixed(2).padStart(9)}  p50 ${(pct(s, 0.5) * sc).toFixed(2).padStart(9)}`
    + `  p90 ${(pct(s, 0.9) * sc).toFixed(2).padStart(9)}  p99 ${(pct(s, 0.99) * sc).toFixed(2).padStart(9)}`
    + `  max ${(s[s.length - 1] * sc).toFixed(2).padStart(10)} ${u}`);
};

log('');
log(`audited ${audited} facets in ${secs.toFixed(0)}s   (${perpCalls} perp confirms)`);
dd('radial reading', radialAll, 1000, 'um');
dd('covRad', covAll, 1000, 'mm/1000');
log(`  BLIND ruler cost (what we pay today): ${(blindEvals / 1e6).toFixed(1)} M evals`
  + `  = ${(blindEvals / audited).toFixed(0)} evals/facet`);
log('');
log('tol(um)   CERTIFIABLE          INFEASIBLE (reading>=tol)        CAPPED   cert evals/facet   vs BLIND');
for (let k = 0; k < TOLS.length; k += 1) {
  const A = acc[k]; const tol = TOLS[k];
  const cpf = A.cert > 0 ? A.certEvals / A.cert : 0;
  const infPct = (100 * A.infeasible) / Math.max(1, audited);
  const artPct = A.infeasible > 0 ? (100 * A.infeasArtifact) / A.infeasible : 0;
  log(`${(tol * 1000).toFixed(1).padStart(5)}   ${String(A.cert).padStart(9)} (${((100 * A.cert) / audited).toFixed(1)}%)`
    + `   ${String(A.infeasible).padStart(9)} (${infPct.toFixed(1)}%, ${artPct.toFixed(1)}% ARTIFACT)`
    + `   ${String(A.capped).padStart(6)}   ${cpf.toFixed(0).padStart(8)}`
    + `   ${(cpf / (blindEvals / audited)).toFixed(2)}x`);
}
log('');
for (let k = 0; k < TOLS.length; k += 1) {
  if (acc[k].nReq.length > 0) dd(`n_req @${(TOLS[k] * 1000).toFixed(1)}um`, acc[k].nReq, 1, '');
}
log('');
log('READ IT LIKE THIS:');
log('  The decisive column is INFEASIBLE, not the eval cost. Those facets can never certify with this');
log('  ruler at that tol, so they are REFUSED and refined — and the ARTIFACT % beside them says how');
log('  much of that refinement is chasing radial conservatism rather than real error.');
log('  A tol where INFEASIBLE is small AND cert evals/facet <= 1.0x blind is a free swap: sound and');
log('  cheaper than what the driver already pays.');
log('  A tol where INFEASIBLE is large is S36 repeating itself at a different number, however cheap');
log('  the per-facet evals look.');
