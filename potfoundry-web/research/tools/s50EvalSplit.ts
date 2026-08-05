// s50EvalSplit.ts — WHERE DO THE CERTIFICATE'S rA EVALS ACTUALLY GO? Measured, not reasoned.
//
// The full-coverage certificate spent 52,736 M rA evals against the mesher's 858 M (61x), so the
// split between its stages is the single highest-leverage number in the pipeline. This measures it
// on a sample of facets drawn in the certificate's OWN walk order, with ZERO instrumentation added
// to _facetTruthLib — which matters, because instrumenting the hot loop would change what is being
// priced.
//
// HOW THE SPLIT IS RECOVERED EXACTLY. `certifyTriangle` costs 1 rA eval per lattice point in pass 1
// (_facetTruthLib:483) and 1 more per lattice point in pass 2 (:509), and it accounts `samples += L`
// once after EACH pass (:488, :531). Therefore, with no counters inside the lib at all:
//     radial evals for a facet   ==  v.samples          (exact)
//     tighten evals for a facet  ==  (rA calls) - v.samples
//     RE-WALK WASTE              ==  v.samples - sum over entered levels of L(n)
// because `samples` double-counts exactly the levels where pass 2 ran, and those are exactly the
// levels whose pass-1 radial values were computed and thrown away.
//
// Usage:  bash research/tools/run-s50-eval-split.sh [TAG]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import {
  certifyTriangle, covRadius, distRadial, distLocal, distPerpFrom,
  detectZJumps, detectThetaJumps, type RadiusFn,
} from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = process.env.PF_S50_STYLE ?? 'GothicArches';
const STL = process.env.PF_S50_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const N = Math.round(envF('PF_S50_N', 1500));
// the certificate's settings, verbatim from _strataFacetTruth.test.ts:144-148,381
const TOL = envF('PF_S50_TOL_UM', 10) / 1000;
const NMAX = Math.round(envF('PF_S50_NMAX', 2048));
const SAMPCAP = envF('PF_S50_SAMPCAP', 4e6);

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

const pct = (a: number, b: number): string => `${((100 * a) / Math.max(1e-9, b)).toFixed(2)}%`;
const q = (a: number[], p: number): number => (a.length === 0 ? 0 : a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]);

log('===== S50 — CERTIFICATE rA EVAL BUDGET: WHERE IT GOES =====');
log(`style ${STYLE}  tol ${(TOL * 1000).toFixed(1)} um  nMax ${NMAX}  sampleCap ${SAMPCAP}`);
const { xyz, nTri } = readMeshFloat64(STL, false);
log(`mesh ${STL}  ${nTri} triangles; sampling ${N} in the certificate's golden-stride walk order`);

// the certificate detects the C0 loci once per style and passes them into every facet
let t0 = Date.now(); evals = 0;
const zJumps = detectZJumps(rA, H);
const thJumps = detectThetaJumps(rA, H);
const detectEvals = evals; const detectMs = Date.now() - t0;
log(`C0 loci: zJumps ${zJumps.length}  thJumps ${thJumps.length}   (one-time cost ${(detectEvals / 1e6).toFixed(2)} M evals, ${detectMs} ms)`);
if (zJumps.length === 0 && thJumps.length === 0) {
  log('  ⇒ the closure-wall terms are INERT on this style: no jump was detected, so distToZWall /');
  log('    distToThetaWall are never consulted and the whole H1 reading is one-sided (sound).');
}

// the certificate's walk: facet k is triangle (k*stride)%nTri, golden-ratio stride
const stride = Math.max(1, Math.round(nTri * 0.6180339887498949)) | 0;
const opts = { H, tol: TOL, nMax: NMAX, sampleCap: SAMPCAP, zJumps, thJumps };

let sumTot = 0; let sumRadial = 0; let sumWaste = 0;
let nPass2 = 0; let nCert = 0; let nOver = 0; let nIncomplete = 0;
const perFacet: number[] = []; const covs: number[] = []; const ns: number[] = [];
const witnessPts: Array<[number, number, number, number]> = []; // px,py,pz,radial
t0 = Date.now();
for (let k = 0; k < N; k += 1) {
  const t = ((k * stride) % nTri + nTri) % nTri;
  const o = t * 9;
  const e0 = evals;
  const v = certifyTriangle(rA,
    xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8], opts);
  const tot = evals - e0;
  const cov = covRadius(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8]);
  // reproduce the level ladder the lib walks (:425-429, :544) so the re-walk waste is exact
  let n0 = Math.min(NMAX, Math.max(2, Math.ceil(cov / TOL)));
  const nCap = Math.max(2, Math.floor((Math.sqrt(8 * SAMPCAP + 1) - 3) / 2));
  n0 = Math.min(n0, nCap);
  let latticeTotal = 0;
  for (let n = n0; ; n *= 2) { latticeTotal += ((n + 1) * (n + 2)) / 2; if (n >= v.n) break; }
  const waste = Math.max(0, v.samples - latticeTotal);
  sumTot += tot; sumRadial += v.samples; sumWaste += waste;
  if (waste > 0) nPass2 += 1;
  if (v.certified) nCert += 1;
  if (v.witnessed > TOL) nOver += 1;
  if (!v.witnessedComplete) nIncomplete += 1;
  perFacet.push(tot); covs.push(cov); ns.push(v.n);
  if (witnessPts.length < 400) witnessPts.push([v.px, v.py, v.pz, distRadial(rA, H, v.px, v.py, v.pz)]);
}
const wall = (Date.now() - t0) / 1000;
const sumTighten = sumTot - sumRadial;

log('');
log('1. THE SPLIT — over the sampled facets, exact.');
log(`   facets ${N}   wall ${wall.toFixed(1)} s   ${(N / wall).toFixed(1)} facets/s single-thread`);
log(`   total rA evals            ${(sumTot / 1e6).toFixed(2)} M      ${(sumTot / N).toFixed(0)} per facet`);
log(`     RADIAL LATTICE  (pass1+pass2)  ${(sumRadial / 1e6).toFixed(2)} M   ${pct(sumRadial, sumTot)}`);
log(`       of which RE-WALK WASTE       ${(sumWaste / 1e6).toFixed(2)} M   ${pct(sumWaste, sumTot)}  <-- recoverable BIT-IDENTICALLY`);
log(`     TIGHTEN (descent + Newton + walls)  ${(sumTighten / 1e6).toFixed(2)} M   ${pct(sumTighten, sumTot)}`);
log(`   facets that entered pass 2: ${nPass2} (${pct(nPass2, N)})   certified ${nCert} (${pct(nCert, N)})`);
log(`   witnessed > tol: ${nOver} (${pct(nOver, N)})   witnessedComplete=false: ${nIncomplete} (${pct(nIncomplete, N)})`);
log(`   per-facet evals  p50 ${q(perFacet, 0.5).toFixed(0)}  p90 ${q(perFacet, 0.9).toFixed(0)}  p99 ${q(perFacet, 0.99).toFixed(0)}  max ${Math.max(...perFacet).toFixed(0)}`);
log(`   covRad um        p50 ${(q(covs, 0.5) * 1000).toFixed(1)}  p90 ${(q(covs, 0.9) * 1000).toFixed(1)}  max ${(Math.max(...covs) * 1000).toFixed(1)}`);
log(`   final level n    p50 ${q(ns, 0.5)}  p90 ${q(ns, 0.9)}  max ${Math.max(...ns)}`);

// ── 2. INSIDE `tighten`: descent vs Newton, measured directly on the witness points.
log('');
log('2. INSIDE `tighten` — descent vs Newton, on the facets\' own witness points.');
let dlE = 0; let dpE = 0; let dlBetter = 0; let dpBetter = 0; let neither = 0;
const iters: number[] = []; let nConv = 0;
for (const [px, py, pz, radial] of witnessPts) {
  let e0 = evals;
  const seed = distLocal(rA, H, px, py, pz, Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz, Math.max(radial, TOL), 40, zJumps, thJumps);
  dlE += evals - e0;
  e0 = evals;
  const pol = distPerpFrom(rA, H, px, py, pz, seed.th, seed.z);
  dpE += evals - e0;
  iters.push(pol.iters); if (pol.converged) nConv += 1;
  if (seed.d < radial - 1e-15 && pol.d >= seed.d - 1e-15) dlBetter += 1;
  else if (pol.d < seed.d - 1e-15) dpBetter += 1;
  else neither += 1;
}
const M = witnessPts.length;
log(`   points ${M}`);
log(`   distLocal   (coordinate descent, 40 iters x 8 cands)  ${(dlE / M).toFixed(1)} evals/pt   ${pct(dlE, dlE + dpE)}`);
log(`   distPerpFrom(damped Newton, 3 frames x 5 evals/iter)  ${(dpE / M).toFixed(1)} evals/pt   ${pct(dpE, dlE + dpE)}`);
log(`   Newton iters  p50 ${q(iters, 0.5)}  p90 ${q(iters, 0.9)}  max ${Math.max(...iters)}   converged ${pct(nConv, M)}`);
log(`   who produced the final (smallest) value:  descent ${pct(dlBetter, M)}   Newton ${pct(dpBetter, M)}   neither/radial ${pct(neither, M)}`);
log(`   ⇒ implied tighten cost ${((dlE + dpE) / M).toFixed(0)} evals/tightened-point; the observed tighten`);
log(`     budget of ${(sumTighten / 1e6).toFixed(2)} M therefore covers ~${(sumTighten / Math.max(1, (dlE + dpE) / M)).toFixed(0)} tightened points`);
log(`     over ${N} facets = ${(sumTighten / Math.max(1, (dlE + dpE) / M) / N).toFixed(1)} tightened points per facet.`);

// ── 3. HOW MUCH OF WALL-CLOCK IS rA AT ALL? (upper bound on what any rA speedup can buy)
log('');
log('3. IS rA THE CYCLE, OR IS THE DISTANCE ARITHMETIC? — straight-line rA throughput.');
{
  const NB = 4_000_000;
  let acc = 0;
  const tb = Date.now();
  for (let i = 0; i < NB; i += 1) acc += rAbase(canonTheta((i * 0.7139) % 7), (i * 0.0173) % H);
  const ms = Date.now() - tb;
  const evalsPerSec = (NB / ms) * 1000;
  log(`   raw rAbase throughput ${(evalsPerSec / 1e6).toFixed(2)} M evals/s (checksum ${acc.toFixed(3)})`);
  log(`   sampled facets used ${(sumTot / 1e6).toFixed(2)} M evals in ${wall.toFixed(1)} s`);
  log(`   ⇒ rA accounts for ${pct(sumTot / evalsPerSec, wall)} of certify wall-clock; everything else`);
  log(`     (lattice arithmetic, hypot, branch) is the remainder. A 2x faster rA can buy at most that much.`);
  log(`   FULL-CERTIFICATE PROJECTION at this per-facet cost: ${((sumTot / N) * nTri / 1e9).toFixed(1)} G evals for ${nTri} facets`);
}
log('');
log('done');
