// s57DescentTail.ts — HOW MUCH OF THE 266-EVAL COORDINATE DESCENT IS RECOVERABLE WITHOUT CHANGING A
// SINGLE READING?
//
// S50 measured `tighten` = 95.2% of the certificate, `distLocal` = 266.1 evals/pt = 88.4% of
// `tighten`, and Newton (seeded from the descent's foot) converging in 2 iterations and producing the
// final smallest value on 96% of points. S51 then REFUTED replacing the descent outright: from a cold
// grid seed Newton must walk at 15 evals/iteration and costs 1.4-3.6x MORE. So the descent stays —
// and the open question is its TAIL.
//
// `distLocal` runs a FIXED 40 iterations and halves its step whenever no neighbour improves, breaking
// only at s < 1e-8 mm (_facetTruthLib:278). Starting at step0 = max(radial, tol) ~ 0.01 mm, that is
// ~20 halvings down to a scale Newton then polishes in 2 iterations anyway. Each halving costs a full
// failed 8-candidate round. The hypothesis is that the tail is pure cost.
//
// *** THE MISTAKE THIS PROBE IS BUILT TO AVOID. *** _facetTruthLib:390-399 records a previous attempt
// that moved (descentIters, newtonIters) 40,40 -> 8,16, verified it BIT-IDENTICAL on 442 points, and
// was still WRONG — the sample omitted the wrong-well regime and the V3/V7c thin-ridge fixtures moved
// 12.041 -> 27.103 um. TWO THINGS ARE DIFFERENT HERE:
//   (1) ONE VARIABLE. Newton stays at its default 40. Only the descent's iteration cap moves.
//   (2) THE POPULATION IS STRATIFIED by radial inflation (radial / d), which IS the wrong-well
//       signature, and the hardest stratum decides.
//
// PRE-REGISTERED KILL-CRITERION: an iteration cap K is ACCEPTED only if, IN THE HARDEST STRATUM, the
// POST-NEWTON value is within 1e-9 mm of the K=40 value on >= 99.9% of points AND no point is looser
// by more than 1e-6 mm. Anything else is refused. AND: even an accepted K must then clear the V3/V7c
// unit fixtures before it may be landed — this probe cannot substitute for them.
//
// Usage:  bash research/tools/run-s57-descent-tail.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import {
  covRadius, distRadial, distLocal, distPerpFrom, detectZJumps, detectThetaJumps, type RadiusFn,
} from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = process.env.PF_S57_STYLE ?? 'GothicArches';
const STL = process.env.PF_S57_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NF = Math.round(envF('PF_S57_FACETS', 900));
const TOL = envF('PF_S57_TOL_UM', 10) / 1000;
const LADDER = (process.env.PF_S57_LADDER ?? '6,8,10,12,16,20,24,32,40').split(',').map(Number);

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

log('===== S57 — THE COORDINATE DESCENT`S HALVING TAIL: HOW MUCH IS RECOVERABLE? =====');
const { xyz, nTri } = readMeshFloat64(STL, false);
const zJumps = detectZJumps(rA, H); const thJumps = detectThetaJumps(rA, H);
log(`${STL} ${nTri} tri;  zJumps ${zJumps.length} thJumps ${thJumps.length};  ladder [${LADDER.join(',')}]  (Newton FIXED at 40)`);

// the point population: real tighten-eligible lattice points, the library's own admission test
const stride = Math.max(1, Math.round(nTri * 0.6180339887498949)) | 0;
interface Pt { px: number; py: number; pz: number; radial: number }
const pts: Pt[] = [];
for (let k = 0; k < NF && pts.length < 9000; k += 1) {
  const t = ((k * stride) % nTri + nTri) % nTri; const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz); if (!(cov > 0)) continue;
  const n = Math.min(64, Math.max(2, Math.ceil(cov / TOL)));
  const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
  const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
  const thresh = TOL - cov / n;
  for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
    const px = ax + ucx * i + ubx * j; const py = ay + ucy * i + uby * j; const pz = az + ucz * i + ubz * j;
    const d = distRadial(rA, H, px, py, pz);
    if (d > thresh) pts.push({ px, py, pz, radial: d });
  }
}
log(`tighten-eligible points: ${pts.length}`);

/** the SHIPPED tighten with only the descent's iteration cap varied. Newton untouched. */
function arm(iters: number): { d: Float64Array; ev: Float64Array } {
  const d = new Float64Array(pts.length); const ev = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]; const e0 = evals;
    let best = p.radial;
    const seed = distLocal(rA, H, p.px, p.py, p.pz, Math.atan2(p.py, p.px), p.pz < 0 ? 0 : p.pz > H ? H : p.pz,
      Math.max(p.radial, TOL), iters, zJumps, thJumps);
    if (seed.d < best) best = seed.d;
    const pol = distPerpFrom(rA, H, p.px, p.py, p.pz, seed.th, seed.z);
    if (pol.d < best) best = pol.d;
    d[i] = best; ev[i] = evals - e0;
  }
  return { d, ev };
}
const arms = new Map<number, { d: Float64Array; ev: Float64Array }>();
for (const K of LADDER) arms.set(K, arm(K));
const ref = arms.get(40) as { d: Float64Array; ev: Float64Array };
const infl = pts.map((p, i) => p.radial / Math.max(1e-12, ref.d[i]));
const strata: Array<[string, number[]]> = [
  ['ALL           ', pts.map((_, i) => i)],
  ['infl < 1.5    ', pts.map((_, i) => i).filter((i) => infl[i] < 1.5)],
  ['infl 1.5-5    ', pts.map((_, i) => i).filter((i) => infl[i] >= 1.5 && infl[i] < 5)],
  ['infl >=5 HARD ', pts.map((_, i) => i).filter((i) => infl[i] >= 5)],
];
for (const [sname, idx] of strata) {
  if (idx.length === 0) { log(`\n${sname} (empty)`); continue; }
  const evRef = idx.reduce((s, i) => s + ref.ev[i], 0) / idx.length;
  log(`\n${sname} n=${idx.length}   reference K=40: ${evRef.toFixed(1)} evals/pt`);
  log(`   K    evals/pt   saving   DIFFER(>1e-9mm)         LOOSER worst      TIGHTER best`);
  for (const K of LADDER) {
    if (K === 40) continue;
    const a = arms.get(K) as { d: Float64Array; ev: Float64Array };
    const ev = idx.reduce((s, i) => s + a.ev[i], 0) / idx.length;
    let diff = 0; let loose = 0; let tight = 0; let wl = 0; let bt = 0;
    for (const i of idx) {
      const dd = a.d[i] - ref.d[i];
      if (Math.abs(dd) > 1e-9) diff += 1;
      if (dd > 1e-9) { loose += 1; if (dd > wl) wl = dd; }
      else if (dd < -1e-9) { tight += 1; if (-dd > bt) bt = -dd; }
    }
    log(`  ${String(K).padStart(3)}   ${ev.toFixed(1).padStart(7)}   ${(evRef / Math.max(1e-9, ev)).toFixed(2)}x   ${String(diff).padStart(5)} (${((100 * diff) / idx.length).toFixed(3)}%)   ${String(loose).padStart(5)} +${(wl * 1000).toFixed(4)}um   ${String(tight).padStart(5)} -${(bt * 1000).toFixed(4)}um`);
  }
}
log('');
log('PRE-REGISTERED: accept K only if, in the HARD stratum, DIFFER <= 0.1% and no LOOSER > 1e-6 mm.');
log('An accepted K must STILL clear the V3/V7c thin-ridge fixtures before it is landed. This probe');
log('samples one production mesh and cannot stand in for them — that is exactly the mistake at');
log('_facetTruthLib:390-399.');
log('done');
