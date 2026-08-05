// s89SelCost.ts — WHAT DOES THE SELECTOR ARCHITECTURE ACTUALLY COST? BOTH SIDES, ONE CURRENCY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED (S89_PLANREVIEW_FINDINGS.md §0). WRITTEN BEFORE THE FIRST RUN.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// S88 §7a measured the selector's RECALL vs FRACTION-TESTED and reported 15.72x / 16.62x / 45.54x
// against "a blind 375-eval test", using GUARD's cost model `5 + 375*f`. Both constants in that model
// are ASSUMPTIONS carried from S61 §13c, and the fraction `f` is a fraction OF FACETS.
//
// This probe replaces all three with measurements, in the ONE currency both sides are actually paid in
// (rA evaluations, which S50 measured at 84% of certificate wall-clock):
//
//   (1) SELECTOR PRICE.  `orientOfFacet` through `fdNormals` costs 5 rA evals per normal query and walks
//       an order-k barycentric covering = (k+1)(k+2)/2 points. At S87's KLAT=8 that is 45 points.
//       H-P1b KILL: > 15 evals/facet measured  =>  the model's `5` is wrong.
//   (2) CERTIFICATE PRICE.  `certifyTriangle` at the SAME (tol, nMax) S87 used, per facet, exactly.
//       H-P1a KILL: differs from 375 by > 3x  =>  the 15.7-45.5x is priced against a different test.
//   (3) COST WEIGHTING.  The certificate's per-facet cost is heavily skewed (S50: p50 11,635, p99
//       351,050 evals). If cost concentrates in the facets the selector KEEPS, skipping 99% of facets
//       by COUNT saves far less than 99% of COMPUTE.
//       H-P1c KILL: fCost >= 4 x fCount at recall 0.90.
//
//   THE ONLY QUOTABLE NUMBER:
//        speedup(recall) = TOTAL_cert_evals / ( N*selEvals + cert_evals_over_selected )
//   VERDICT BARS: P1 SURVIVES >= 10x at recall 1.00; WEAKENED 2-10x; REFUTED < 2x.
//
// ── CONTROLS ──────────────────────────────────────────────────────────────────────────────────────────
// C-S89-1  JOIN. Every row must reproduce S87's own `<TAG>.pos.ndjson` row for the same facet index k:
//          area, p, w, b, v, o0, o2. The sample construction is byte-for-byte `goldenIdx`/`mkSag` from
//          s87LedgerReexam.ts, and the golden stride is PREFIX-NESTED (out[q] = (q*s) % nTri with s a
//          function of nTri alone), so an N=12,000 run is exactly the first 12,000 rows of an N=50,000 one.
//          A cost measurement on a harness that cannot reproduce the verdict it prices is inadmissible.
// C-S89-2  COUNTER NON-VACUITY. Per-facet counts must be > 0, must sum to the wrapper's own evals(), and
//          the selector count must scale as (k+1)(k+2)/2 across k = 1,2,4,8. If it does not scale I am
//          not counting what I think I am counting.
// C-S89-3  RECALL REPRODUCTION. The count-weighted curve must reproduce S88's published f@recall0.90.
//
// ── WHAT THIS DOES NOT MEASURE ────────────────────────────────────────────────────────────────────────
//   * Wall clock. rA evals are the currency BOTH the campaign and GUARD's model use; wall-clock adds
//     the non-rA 16% (S50 1.2) and worker scheduling, neither of which either side priced.
//   * Voronoi. GothicArches only unless a second arm is run; base rate is stated on every row.
//   * Whether containment (posFail & orientOK = 0) survives off Gothic. That is SELECTOR's arm.
//
// Read-only over STLs already on disk. Usage: bash research/tools/run-s89-selcost.sh
//   env: PF_S89_TAG PF_S89_STEM PF_S89_STYLE PF_S89_N PF_S89_TOL_MM(0.010) PF_S89_NMAX(512) PF_S89_KS
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const TAG = process.env.PF_S89_TAG ?? 'C2S39CTL';
const STYLE = process.env.PF_S89_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S89_STEM ?? 'gothicarches_ring_DS-HT_S39CTL';
const NSAMP = Math.round(envF('PF_S89_N', 8000));
const TOL = envF('PF_S89_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S89_NMAX', 512));
const KS = (process.env.PF_S89_KS ?? '1,2,4,8').split(',').map((s) => Math.round(Number(s)));
const DIMS: StyleDims = { H: envF('PF_S89_H', 120), Rb: envF('PF_S89_RB', 40), Rt: envF('PF_S89_RT', 50), expn: envF('PF_S89_EXPN', 1) };
const H = DIMS.H;
const BAR = TOL * 1000;
const DIR = 'research/exchange/_strataConformBisect';
const OUTDIR = `${DIR}/s89cost`;
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;

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

log('===== S89 — THE SELECTOR ARCHITECTURE, PRICED ON BOTH SIDES IN rA EVALS =====');
log(`tag ${TAG}   stem ${STEM}   style ${STYLE}   N ${NSAMP}   tol ${BAR} um   nMax ${NMAX}   ks [${KS.join(',')}]`);

const PARAMS = registryDefaults(STYLE);
const AR = buildAuditRadiusFn(STYLE, { ...PARAMS }, DIMS, H);
const rAbase = AR.rA;
// The wrapper s87 uses: canonTheta + z clamp. Identical construction, so rows join.
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
log(`rA fast twin: ${AR.fastUsed ? 'YES' : 'no'}   fastDiffs ${AR.fastDiffs}`);

const zJ = detectZJumps(rA, H);
const thJ = detectThetaJumps(rA, H);
log(`C0 loci: zJumps ${zJ.length}  thJumps ${thJ.length}`);

const MESH = readMeshFloat64(`${DIR}/${STEM}.stl`, false);
const nTri = MESH.nTri;
log(`mesh ${nTri} facets loaded   [${el()}]`);

// ── byte-for-byte s87LedgerReexam.goldenIdx / mkSag / areaOf ─────────────────────────────────────────
function goldenIdx(count: number): Int32Array {
  const out = new Int32Array(Math.min(count, nTri));
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, nTri) !== 1) s += 2;
  if (s >= nTri) s = 1;
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % nTri;
  return out;
}
function mkSag(idx: ArrayLike<number>): SagMesh {
  const n = idx.length;
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  const xyz = MESH.xyz;
  for (let q = 0; q < n; q += 1) {
    const o = idx[q] * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * q + v] = xyz[o + 3 * v]; vy[3 * q + v] = xyz[o + 3 * v + 1]; vz[3 * q + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * q], vx[3 * q]);
    vth[3 * q] = thA;
    vth[3 * q + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 1], vx[3 * q + 1]));
    vth[3 * q + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 2], vx[3 * q + 2]));
    ta[q] = 3 * q; tb[q] = 3 * q + 1; tc[q] = 3 * q + 2;
  }
  return { ta, tb, tc, vth, vz, vx, vy };
}
function areaOf(m: SagMesh, q: number): number {
  const { vx, vy, vz } = m;
  const ax = vx[3 * q]; const ay = vy[3 * q]; const az = vz[3 * q];
  const ux = vx[3 * q + 1] - ax; const uy = vy[3 * q + 1] - ay; const uz = vz[3 * q + 1] - az;
  const wx = vx[3 * q + 2] - ax; const wy = vy[3 * q + 2] - ay; const wz = vz[3 * q + 2] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
}

const NS = fdNormals(rA, H);
const SCRATCH = new Float64Array(12);
function orientOne(m: SagMesh, q: number, inset: number, k: number): number {
  const { vx, vy, vz, vth } = m;
  const o = orientOfFacet(
    NS,
    vx[3 * q], vy[3 * q], vz[3 * q],
    vx[3 * q + 1], vy[3 * q + 1], vz[3 * q + 1],
    vx[3 * q + 2], vy[3 * q + 2], vz[3 * q + 2],
    vth[3 * q], vth[3 * q + 1], vth[3 * q + 2],
    { k, inset, scratch: SCRATCH, barRad: (5 * Math.PI) / 180 },
  );
  return o.tangMm * 1000;
}

interface Row {
  k: number; area: number; p: number; w: number; b: number; v: number; c: 0 | 1; o0: number; o2: number;
  /** rA evals spent by certifyTriangle on this facet — MEASURED, not modelled */
  ec: number;
  /** rA evals spent by the plane ruler sagAdaptiveRaw on this facet */
  ep: number;
  /** rA evals spent by the k=8 inset-0.02 selector (the one that produced the recall curve) */
  es: number;
  /** selector value + eval cost at each k in KS, inset 0.02 */
  ok: number[]; ek: number[];
}

const REC = `${OUTDIR}/${TAG}.cost.ndjson`;
const IDX = goldenIdx(NSAMP);
const SM = mkSag(IDX); const ARG = makeSagArgmax();
log(`sample: ${IDX.length} facets, golden stride, coverage ${((100 * IDX.length) / nTri).toFixed(3)}%`);

let rows: Row[] = [];
if (existsSync(REC)) {
  for (const ln of readFileSync(REC, 'utf8').split('\n')) {
    if (ln.length < 3) continue;
    try { rows.push(JSON.parse(ln) as Row); } catch { /* truncated tail */ }
  }
}
if (rows.length > IDX.length) rows = rows.slice(0, IDX.length);
log(`RESUME: ${rows.length}/${IDX.length} already scored   [${el()}]`);

const tS = Date.now();
for (let q = rows.length; q < IDX.length; q += 1) {
  const { vx, vy, vz } = SM;
  const e0 = AR.evals();
  const p = sagAdaptiveRaw(rA, SM, q, 0.03, 12, 64, ARG) * 1000;
  const e1 = AR.evals();
  const o0 = orientOne(SM, q, 0, 8);
  const e2 = AR.evals();
  const o2 = orientOne(SM, q, 0.02, 8);
  const e3 = AR.evals();
  const ok: number[] = []; const ek: number[] = [];
  for (const k of KS) {
    const a = AR.evals();
    ok.push(orientOne(SM, q, 0.02, k));
    ek.push(AR.evals() - a);
  }
  const e4 = AR.evals();
  const r = certifyTriangle(rA,
    vx[3 * q], vy[3 * q], vz[3 * q],
    vx[3 * q + 1], vy[3 * q + 1], vz[3 * q + 1],
    vx[3 * q + 2], vy[3 * q + 2], vz[3 * q + 2],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
  const e5 = AR.evals();
  const row: Row = {
    k: IDX[q], area: areaOf(SM, q), p,
    w: r.witnessed * 1000, b: r.bound * 1000,
    v: r.witnessed > TOL ? 1 : r.certified ? 0 : -1,
    c: r.witnessedComplete ? 1 : 0,
    o0, o2, ec: e5 - e4, ep: e1 - e0, es: e3 - e2, ok, ek,
  };
  rows.push(row); appendFileSync(REC, `${JSON.stringify(row)}\n`);
  if ((q + 1) % 500 === 0) {
    const rate = (q + 1 - 0) / ((Date.now() - tS) / 1000);
    log(`  scored ${q + 1}/${IDX.length}   ${rate.toFixed(1)} facet/s   eta ${(((IDX.length - q - 1) / rate) / 60).toFixed(1)} min   [${el()}]`);
  }
}
const n = rows.length;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// C-S89-1 — THE JOIN. Reproduce S87's own pos.ndjson row-for-row, or nothing below is admissible.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n───── C-S89-1  JOIN AGAINST S87 pos.ndjson ─────');
const S87 = `${DIR}/s87ledger/${TAG}.pos.ndjson`;
if (existsSync(S87)) {
  const ref: Array<Record<string, number>> = [];
  for (const ln of readFileSync(S87, 'utf8').split('\n')) { if (ln.length > 3) ref.push(JSON.parse(ln) as Record<string, number>); }
  const m = Math.min(ref.length, n);
  const flds = ['k', 'area', 'p', 'w', 'b', 'v', 'c', 'o0', 'o2'];
  const bad: Record<string, number> = {}; let worst = 0; let worstF = '';
  for (let i = 0; i < m; i += 1) {
    for (const f of flds) {
      const a = (rows[i] as unknown as Record<string, number>)[f]; const bq = ref[i][f];
      if (!Object.is(a, bq)) {
        bad[f] = (bad[f] ?? 0) + 1;
        const rel = Math.abs(a - bq) / Math.max(1e-12, Math.abs(bq));
        if (rel > worst) { worst = rel; worstF = f; }
      }
    }
  }
  const nb = Object.values(bad).reduce((s, x) => s + x, 0);
  log(`  compared ${m} rows x ${flds.length} fields`);
  log(`  differing: ${nb}   ${nb === 0 ? '*** BIT-EXACT — C-S89-1 PASS ***' : `by field ${JSON.stringify(bad)}  worst rel ${worst.toExponential(3)} on ${worstF}`}`);
} else log(`  ${S87} MISSING — join control could not run (STATE THIS IN THE FINDING)`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// C-S89-2 — COUNTER NON-VACUITY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n───── C-S89-2  EVAL-COUNTER NON-VACUITY ─────');
const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);
const ecs = rows.map((r) => r.ec); const eps = rows.map((r) => r.ep); const ess = rows.map((r) => r.es);
log(`  zero-cost facets: cert ${ecs.filter((x) => x === 0).length}   plane ${eps.filter((x) => x === 0).length}   selector ${ess.filter((x) => x === 0).length}`);
log('  selector cost by k (predicted = 5 evals/normal x (k+1)(k+2)/2 lattice points):');
for (let i = 0; i < KS.length; i += 1) {
  const k = KS[i]; const meas = sum(rows.map((r) => r.ek[i])) / n; const pred = 5 * ((k + 1) * (k + 2)) / 2;
  log(`    k=${String(k).padStart(2)}  measured ${meas.toFixed(2)} evals/facet   naive prediction ${pred}   ratio ${(meas / pred).toFixed(3)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PRICES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const qtl = (a: number[], f: number): number => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const totC = sum(ecs);
log('\n───── THE PRICES (rA evals per facet) ─────');
log(`  certifyTriangle @tol ${BAR}um nMax ${NMAX}:  mean ${(totC / n).toFixed(1)}   p50 ${qtl(ecs, 0.5)}   p90 ${qtl(ecs, 0.9)}   p99 ${qtl(ecs, 0.99)}   MAX ${Math.max(...ecs)}`);
log(`  plane ruler sagAdaptiveRaw:                mean ${(sum(eps) / n).toFixed(1)}   p50 ${qtl(eps, 0.5)}   p99 ${qtl(eps, 0.99)}`);
log(`  SELECTOR orientOfFacet k=8 inset .02:      mean ${(sum(ess) / n).toFixed(1)}   p50 ${qtl(ess, 0.5)}   p99 ${qtl(ess, 0.99)}`);
log(`  *** H-P1a: model said the honest test is 375 evals/facet. MEASURED ${(totC / n).toFixed(1)}. ratio ${(totC / n / 375).toFixed(2)}x ***`);
log(`  *** H-P1b: model said the selector is 5 evals/facet. MEASURED ${(sum(ess) / n).toFixed(1)}. ratio ${(sum(ess) / n / 5).toFixed(1)}x ***`);
log('\n  COST CONCENTRATION (Lorenz of certificate evals over facets, sorted by cost):');
{
  const s = [...ecs].sort((a, b) => b - a); let acc = 0; let i = 0;
  for (const f of [0.001, 0.01, 0.05, 0.1, 0.25, 0.5]) {
    const stop = Math.max(1, Math.round(f * n));
    while (i < stop) { acc += s[i]; i += 1; }
    log(`    top ${(100 * f).toFixed(1).padStart(5)}% of facets by cost hold ${((100 * acc) / totC).toFixed(2)}% of the certificate's evals`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CURVE — count-weighted (S88's) AND cost-weighted (the honest one)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function curve(key: (r: Row) => number, selEvalsPerFacet: number, label: string): void {
  const ord = rows.map((r, i) => i).sort((a, b) => key(rows[b]) - key(rows[a]));
  const fails = rows.filter((r) => r.v === 1).length;
  log(`\n───── SELECTOR CURVE: ${label}   (base rate ${((100 * fails) / n).toFixed(4)}%, ${fails} fails of ${n}) ─────`);
  if (fails === 0) { log('  0 failures in sample — curve undefined.'); return; }
  log('   recall  fCount%   fCost%   costRatio   |  selEv/facet  keptEv/facet  totalEv/facet  SPEEDUP');
  let got = 0; let cost = 0; const marks = [0.5, 0.8, 0.9, 0.95, 0.99, 1.0]; let mi = 0;
  for (let i = 0; i < ord.length && mi < marks.length; i += 1) {
    const r = rows[ord[i]];
    if (r.v === 1) got += 1;
    cost += r.ec;
    const rec = got / fails;
    while (mi < marks.length && rec >= marks[mi] - 1e-12) {
      const fCount = (i + 1) / n; const fCost = cost / totC;
      const tot = selEvalsPerFacet + cost / n;
      log(`   ${marks[mi].toFixed(2)}   ${(100 * fCount).toFixed(3).padStart(7)}  ${(100 * fCost).toFixed(3).padStart(7)}   ${(fCost / Math.max(1e-12, fCount)).toFixed(2).padStart(7)}x   |  ${selEvalsPerFacet.toFixed(1).padStart(9)}  ${(cost / n).toFixed(1).padStart(11)}  ${tot.toFixed(1).padStart(12)}  ${(totC / n / tot).toFixed(2).padStart(7)}x`);
      mi += 1;
    }
  }
}
const selK8 = sum(ess) / n;
curve((r) => r.o2, selK8, `orientation chord o2 (k=8, inset .02) -> honest POSITION  [S88's selector]`);
for (let i = 0; i < KS.length; i += 1) {
  const k = KS[i]; if (k === 8) continue;
  curve((r) => r.ok[i], sum(rows.map((r) => r.ek[i])) / n, `orientation chord (k=${k}, inset .02) -> honest POSITION`);
}
curve((r) => r.p, sum(eps) / n, 'blind plane ruler p -> honest POSITION  [the driver already pays this]');
curve((r) => r.area, 0, 'facet AREA -> honest POSITION  [a ZERO-rA-eval selector, the free control]');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const summary = {
  tag: TAG, stem: STEM, style: STYLE, nTri, N: n, tol: TOL, nMax: NMAX,
  fails: rows.filter((r) => r.v === 1).length,
  certEvalsMean: totC / n, certEvalsP50: qtl(ecs, 0.5), certEvalsP99: qtl(ecs, 0.99), certEvalsMax: Math.max(...ecs),
  planeEvalsMean: sum(eps) / n, selEvalsMeanK8: selK8,
  selEvalsByK: KS.map((k, i) => ({ k, evals: sum(rows.map((r) => r.ek[i])) / n })),
  totalCertEvals: totC, secs: (Date.now() - T0) / 1000,
};
writeFileSync(`${OUTDIR}/${TAG}.cost.summary.json`, JSON.stringify(summary, null, 2));
log(`\nwritten ${OUTDIR}/${TAG}.cost.{ndjson,summary.json}   [${el()}]`);
log(`rA evals total ${AR.evals()}   inflightRejected ${AR.inflightRejected()}`);
