// s51TightenSeed.ts — CAN THE CACHED GLOBAL SEED GRID REPLACE THE 266-EVAL COORDINATE DESCENT?
//
// S50 measured: `tighten` is 95.2% of the certificate, `distLocal` is 88.4% of `tighten`, and
// `distLocal` produces the final (smallest) value on only 4% of points — Newton, seeded from it,
// produces it on 96%. So the descent is a 266-eval-per-point BASIN FINDER.
//
// `perpSeedGrid` (_facetTruthLib:1062) is already a memoised, query-independent global sweep of the
// whole (theta,z) domain that costs ZERO rA evals per call after the first. Finding the basin is
// exactly what it does, globally and exhaustively, where the descent does it locally and fallibly.
//
// THE HAZARD THIS PROBE IS BUILT AROUND. _facetTruthLib:390-399 records that a cheaper descent was
// once measured BIT-IDENTICAL on a 442-point sample and was still WRONG, because that sample did not
// contain the wrong-well regime. A uniform sample of facet centroids would repeat that mistake. So
// points are STRATIFIED by radial/perp inflation — the direct signature of "the radial foot is in
// the wrong basin" — and every arm is reported per stratum, with the hardest stratum decisive.
//
// PRE-REGISTERED KILL-CRITERION (written before running):
//   ARM B (grid seeds + Newton, no descent) is ACCEPTED only if, IN THE HARDEST STRATUM,
//     (i)  it costs < 50% of ARM A's evals/point, AND
//     (ii) d_B <= d_A + 1e-9 mm on >= 99% of points (it may be TIGHTER; it must not be LOOSER).
//   Any stratum where B is looser than A by > 1e-6 mm on > 1% of points REFUTES the swap.
//
// Usage:  bash research/tools/run-s51-tighten-seed.sh [TAG]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import {
  covRadius, distRadial, distLocal, distPerpFrom, perpSeedGrid,
  detectZJumps, detectThetaJumps, type RadiusFn,
} from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = process.env.PF_S51_STYLE ?? 'GothicArches';
const STL = process.env.PF_S51_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NF = Math.round(envF('PF_S51_FACETS', 400));
const TOL = envF('PF_S51_TOL_UM', 10) / 1000;

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
let evals = 0;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA: RadiusFn = (th: number, z: number): number => { evals += 1; return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z); };
const q = (a: number[], p: number): number => (a.length === 0 ? 0 : a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]);

log('===== S51 — CAN THE CACHED SEED GRID REPLACE THE COORDINATE DESCENT INSIDE `tighten`? =====');
const { xyz, nTri } = readMeshFloat64(STL, false);
const zJumps = detectZJumps(rA, H); const thJumps = detectThetaJumps(rA, H);
log(`mesh ${STL} ${nTri} tri;  zJumps ${zJumps.length} thJumps ${thJumps.length}`);

// ── build the point population: real LATTICE points from real facets, exactly as `tighten` sees them.
const stride = Math.max(1, Math.round(nTri * 0.6180339887498949)) | 0;
interface Pt { px: number; py: number; pz: number; radial: number }
const pts: Pt[] = [];
for (let k = 0; k < NF; k += 1) {
  const t = ((k * stride) % nTri + nTri) % nTri; const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (!(cov > 0)) continue;
  const n = Math.min(64, Math.max(2, Math.ceil(cov / TOL)));   // the lib's seed level, capped for probe cost
  const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
  const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
  const rho = cov / n; const thresh = TOL - rho;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n - i; j += 1) {
      const px = ax + ucx * i + ubx * j; const py = ay + ucy * i + uby * j; const pz = az + ucz * i + ubz * j;
      const d = distRadial(rA, H, px, py, pz);
      if (d > thresh) pts.push({ px, py, pz, radial: d });   // exactly `tighten`'s admission test
    }
  }
  if (pts.length > 4000) break;
}
log(`tighten-eligible lattice points collected: ${pts.length} (from the same admission test the lib uses)`);

// ── ARM A — the library's `tighten`, verbatim: descent(40) then Newton from its foot.
interface Arm { d: number[]; ev: number[] }
const armA: Arm = { d: [], ev: [] };
for (const p of pts) {
  const e0 = evals;
  let d = p.radial;
  const seed = distLocal(rA, H, p.px, p.py, p.pz, Math.atan2(p.py, p.px), p.pz < 0 ? 0 : p.pz > H ? H : p.pz,
    Math.max(p.radial, TOL), 40, zJumps, thJumps);
  if (seed.d < d) d = seed.d;
  const pol = distPerpFrom(rA, H, p.px, p.py, p.pz, seed.th, seed.z);
  if (pol.d < d) d = pol.d;
  armA.d.push(d); armA.ev.push(evals - e0);
}

/** ARM B — k best cells of the CACHED grid as Newton seeds, plus the radial foot. Zero sweep evals. */
function armBrun(nu: number, nv: number, kSeeds: number): Arm {
  const out: Arm = { d: [], ev: [] };
  const g = perpSeedGrid(rA, H, nu, nv);   // built once; free thereafter
  const bd = new Float64Array(kSeeds); const bt = new Float64Array(kSeeds); const bz = new Float64Array(kSeeds);
  for (const p of pts) {
    const e0 = evals;
    bd.fill(Infinity);
    for (let k = 0; k < g.x.length; k += 1) {
      const dx = p.px - g.x[k]; const dy = p.py - g.y[k]; const dz = p.pz - g.z[k];
      const v = dx * dx + dy * dy + dz * dz;
      if (v >= bd[kSeeds - 1]) continue;
      let s = kSeeds - 1;
      while (s > 0 && v < bd[s - 1]) { bd[s] = bd[s - 1]; bt[s] = bt[s - 1]; bz[s] = bz[s - 1]; s -= 1; }
      bd[s] = v; bt[s] = g.th[k]; bz[s] = g.z[k];
    }
    let d = p.radial;
    // the radial foot is a free seed and is what the descent starts from — keep it
    const r0 = distPerpFrom(rA, H, p.px, p.py, p.pz, Math.atan2(p.py, p.px), p.pz < 0 ? 0 : p.pz > H ? H : p.pz);
    if (r0.d < d) d = r0.d;
    for (let s = 0; s < kSeeds; s += 1) {
      if (!Number.isFinite(bd[s])) continue;
      const r = distPerpFrom(rA, H, p.px, p.py, p.pz, bt[s], bz[s]);
      if (r.d < d) d = r.d;
    }
    out.d.push(d); out.ev.push(evals - e0);
  }
  return out;
}

const arms: Array<[string, Arm]> = [['A  descent+Newton (SHIPPED)', armA]];
for (const [nu, nv, ks] of [[180, 120, 2], [180, 120, 4], [360, 240, 2], [360, 240, 4], [540, 360, 4]] as Array<[number, number, number]>) {
  arms.push([`B  grid ${nu}x${nv} k=${ks} + radial`, armBrun(nu, nv, ks)]);
}

log('');
log('RESULTS — whole population, then stratified by radial inflation (radial/d_A), the wrong-basin signature.');
const infl = pts.map((p, i) => p.radial / Math.max(1e-12, armA.d[i]));
const strata: Array<[string, number[]]> = [
  ['ALL            ', pts.map((_, i) => i)],
  ['infl < 1.5     ', pts.map((_, i) => i).filter((i) => infl[i] < 1.5)],
  ['infl 1.5 - 5   ', pts.map((_, i) => i).filter((i) => infl[i] >= 1.5 && infl[i] < 5)],
  ['infl >= 5 HARD ', pts.map((_, i) => i).filter((i) => infl[i] >= 5)],
];
for (const [sname, idx] of strata) {
  if (idx.length === 0) { log(`\n${sname} (empty)`); continue; }
  const evA = idx.reduce((s, i) => s + armA.ev[i], 0) / idx.length;
  log(`\n${sname} n=${idx.length}   ARM A ${evA.toFixed(0)} evals/pt   d_A p50 ${(q(idx.map((i) => armA.d[i]), 0.5) * 1000).toFixed(3)} um  max ${(Math.max(...idx.map((i) => armA.d[i])) * 1000).toFixed(3)} um`);
  for (const [name, arm] of arms.slice(1)) {
    const ev = idx.reduce((s, i) => s + arm.ev[i], 0) / idx.length;
    let looser = 0; let tighter = 0; let worstLoose = 0; let bestTight = 0;
    for (const i of idx) {
      const dd = arm.d[i] - armA.d[i];
      if (dd > 1e-9) { looser += 1; if (dd > worstLoose) worstLoose = dd; }
      else if (dd < -1e-9) { tighter += 1; if (-dd > bestTight) bestTight = -dd; }
    }
    log(`   ${name.padEnd(30)} ${ev.toFixed(0).padStart(5)} ev/pt  ${(evA / Math.max(1e-9, ev)).toFixed(2)}x cheaper   LOOSER ${String(looser).padStart(4)} (${((100 * looser) / idx.length).toFixed(2)}%, worst +${(worstLoose * 1000).toFixed(3)} um)   TIGHTER ${String(tighter).padStart(4)} (${((100 * tighter) / idx.length).toFixed(2)}%, best -${(bestTight * 1000).toFixed(3)} um)`);
  }
}
log('');
log('READ IT AS: LOOSER = the swap would report a LARGER (more pessimistic but still sound) number;');
log('TIGHTER = the shipped descent was over-reading and the grid found a nearer real surface point.');
log('The HARD stratum decides. Any flip must ALSO pass the V3/V7c thin-ridge unit fixtures.');
log('done');
