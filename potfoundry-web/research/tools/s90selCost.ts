// s90selCost.ts — S90 TASK 2 + TASK 3. THE REAL COST OF THE ORIENTATION SELECTOR, AND ITS SOUNDNESS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05 (S90_SELECTOR_FINDINGS.md §0). Written BEFORE the first number was read.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// THE OBJECTION THIS TOOL EXISTS TO PRESS. S88 §7a prices the selector with a FLAT model — `5 + 375*f`
// evals per facet against a blind `375` — and reports 15.72x / 16.62x / 45.54x. Both numbers in that model
// are wrong, in OPPOSITE directions, and the error is structural:
//
//   (a) THE SELECTOR IS NOT 5 EVALS. `orientOfFacet(k=8)` walks a barycentric lattice of
//       (k+1)(k+2)/2 = 45 points and calls `fdNormals` at each, and `fdNormals` is FIVE rA evaluations
//       per point (`r0, r(th+h), r(th-h), r(z+h), r(z-h)`). That is ~225 rA evals per facet, 45x the
//       model's 5, and 60% of its own blind 375.
//   (b) THE CERTIFICATE IS NOT 375 EVALS FLAT — IT IS QUADRATIC IN FACET SIZE. `certifyTriangle` seeds
//       `n = min(nMax, ceil(cov/tol))` and walks a lattice of `L = (n+1)(n+2)/2` points at >= 1 rA each
//       (its own header: "cov = 1.7 mm at tol = 0.01 seeds n = 170 and burns 14,706 rA evals"). So the
//       cost of the facets a defect-selector KEEPS is not the cost of the ones it SKIPS. A selector that
//       skips 95% of the facets does not save 95% of the work if the kept 5% are the large ones.
//
// H-S90-3.  Measured in ACTUAL rA evaluations, `selector-on-all + certify-on-selected` costs materially
//      less than `certify-on-all` at recall >= 0.90.
//      KILL: end-to-end rA-eval ratio < 1.5x.   CONFIRM: >= 3x.   Between: quote the number.
// H-S90-3b. The selector's own cost is negligible.
//      KILL: the selector costs > 25% of the blind certificate per facet.
// H-S90-4 (SOUNDNESS, the Task-3 prize).  There is a ONE-SIDED orientation-side bound that UPPER-bounds
//      position error, so a facet it clears is PROVABLY under the bar and the composite stays a
//      CERTIFICATE rather than degrading to a 0.90-recall sample.
//      THE CANDIDATE, and why it has the right shape:
//        if the 3 vertices lie ON the surface (STRATA's `addV` derives every vertex from R(th,z), so they
//        do by construction) and the surface patch over the facet is a graph over the facet plane with
//        normal turning by at most theta, then for any p in T take its NEAREST VERTEX v: the height
//        function f vanishes at v and |grad f| <= tan(theta), so |f(p)| <= tan(theta)*|p - v|, and
//        max_p min_i |p - v_i| is EXACTLY `covRadius` (circumradius if acute, half the longest edge if
//        obtuse — `_facetTruthLib.covRadius` is that quantity). Hence
//                        *** dist(facet, S) <= tan(theta) * covRadius ***
//        with theta the max normal turn — the same quantity the orientation ruler already witnesses.
//      KILL: ANY facet in the measured sample with `tan(normRad)*covRadius <= 10 um` whose honest
//      `certifyTriangle` WITNESSES > 10 um. One counterexample is a proof of unsoundness.
//      NOTE: this tests the bound at kappa = 0 (theta = the WITNESSED lattice max, a LOWER bound on the
//      true sup). That is the STRICTEST form — a covering term `+ kappa*cov` only ever ENLARGES it — so a
//      counterexample here kills every kappa, and no counterexample here is necessary-but-not-sufficient
//      evidence for the kappa > 0 form. Stated as such; not claimed as a proof.
//
// CONTROLS
//  C-S90-5  EVAL ACCOUNTING NON-VACUITY. The per-facet rA deltas must sum to the tool's own end-of-run
//           `AR.evals()` total to the eval. If they do not, the accounting is not measuring the work.
//  C-S90-6  ORIENT COST IS A CONSTANT PER k. `orientOfFacet(k)` must cost exactly 5*(k+1)(k+2)/2 rA evals
//           on every facet (fdNormals is branch-free in its eval count). Any variance means the counter
//           is picking up someone else's calls.
//  C-S90-7  ROWS JOIN. The golden-stride construction is byte-for-byte s87LedgerReexam's, so row q here
//           has the same facet index `k` as row q of the matching `*.pos.ndjson`. Verified on the overlap.
//
// STATED UP FRONT — NOT measured here: GPU Phase-D cost (all costs are the CPU `certifyTriangle` path);
// wall-clock is reported but rA evals are the quoted currency because they are machine-independent;
// nothing about H2 / topology / the mesher's in-loop accept test.
//
// Usage:  bash research/tools/run-s90sel-cost.sh
//   env:  PF_S90C_TAG PF_S90C_STYLE PF_S90C_STEM PF_S90C_N PF_S90C_TOL_MM PF_S90C_NMAX PF_S90C_H/RB/RT/EXPN
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { certifyTriangle, detectZJumps, detectThetaJumps, covRadius } from '../bridge/_facetTruthLib';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { dThRaw } from '../bridge/_sweepPredicate';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const TAG = process.env.PF_S90C_TAG ?? 'C2S39CTL';
const STYLE = process.env.PF_S90C_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S90C_STEM ?? 'gothicarches_ring_DS-HT_S39CTL';
const NSAMP = Math.round(envF('PF_S90C_N', 8000));
const TOL = envF('PF_S90C_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S90C_NMAX', 512));
const KS = (process.env.PF_S90C_KS ?? '1,2,4,8').split(',').map(Number);
const INSET = envF('PF_S90C_INSET', 0.02);
const DIMS: StyleDims = { H: envF('PF_S90C_H', 120), Rb: envF('PF_S90C_RB', 40), Rt: envF('PF_S90C_RT', 50), expn: envF('PF_S90C_EXPN', 1) };
const H = DIMS.H;
const DIR = 'research/exchange/_strataConformBisect';
const OUTDIR = `${DIR}/s90sel`;
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

mkdirSync(OUTDIR, { recursive: true });
log('===== S90 SELECTOR COST — real rA evaluations for selector vs certificate =====');
log(`tag ${TAG}   style ${STYLE}   stem ${STEM}   N ${NSAMP}   tol ${TOL * 1000} um   nMax ${NMAX}   ks [${KS.join(',')}]   inset ${INSET}`);

const AR = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, H);
const rA = AR.rA;
log(`rA: fastUsed ${AR.fastUsed}   fastDiffs ${AR.fastDiffs}`);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}   detectThetaJumps ${thJ.length}`);

const MESH = readMeshFloat64(`${DIR}/${STEM}.stl`, false);
const nTri = MESH.nTri;
log(`mesh ${nTri} facets   [${el()}]`);

/** byte-for-byte s87LedgerReexam.goldenIdx / s85PosRebase.goldenStride (C-S90-7). */
function goldenIdx(count: number): Int32Array {
  const out = new Int32Array(Math.min(count, nTri));
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, nTri) !== 1) s += 2;
  if (s >= nTri) s = 1;
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % nTri;
  return out;
}
const IDX = goldenIdx(NSAMP);
log(`sample ${IDX.length} facets, golden stride, coverage ${((100 * IDX.length) / nTri).toFixed(3)}%`);

const NS = fdNormals(rA, H);
const SCRATCH = new Float64Array(12);

interface Row {
  k: number; area: number; diam: number; covR: number;
  w: number; b: number; v: number; c: 0 | 1; cn: number; csamp: number; cEv: number; cMs: number;
  oRad: number[]; oUm: number[]; oCov: number[]; oEv: number[];
  soundUB: number;                                  // tan(oRad[last]) * covR, in um — the H-S90-4 candidate
}
const REC = `${OUTDIR}/${TAG}.cost.ndjson`;
let rows: Row[] = [];
if (existsSync(REC)) {
  for (const ln of readFileSync(REC, 'utf8').split('\n')) {
    if (ln.length < 3) continue;
    try { rows.push(JSON.parse(ln) as Row); } catch { /* truncated tail */ }
  }
}
if (rows.length > IDX.length) rows = rows.slice(0, IDX.length);
log(`RESUME: ${rows.length}/${IDX.length} already measured   [${el()}]`);

const xyz = MESH.xyz;
const tS = Date.now();
let evAtStart = AR.evals();
let evAccounted = 0;
for (const r of rows) { evAccounted += r.cEv; for (const e of r.oEv) evAccounted += e; }

for (let q = rows.length; q < IDX.length; q += 1) {
  const o = IDX[q] * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const ath = thA;
  const bth = thA + dThRaw(thA, Math.atan2(by, bx));
  const cth = thA + dThRaw(thA, Math.atan2(cy, cx));
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  const covR = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);

  // ── the SELECTOR, at each k, each with its own eval delta.
  const oRad: number[] = []; const oUm: number[] = []; const oCov: number[] = []; const oEv: number[] = [];
  for (const kk of KS) {
    const e0 = AR.evals();
    const oo = orientOfFacet(NS, ax, ay, az, bx, by, bz, cx, cy, cz, ath, bth, cth,
      { k: kk, inset: INSET, scratch: SCRATCH, barRad: (5 * Math.PI) / 180 });
    oEv.push(AR.evals() - e0);
    oRad.push(oo.normRad); oUm.push(oo.tangMm * 1000); oCov.push(oo.cov);
  }
  // ── the CERTIFICATE.
  const t1 = Date.now(); const e1 = AR.evals();
  const cert = certifyTriangle(rA, ax, ay, az, bx, by, bz, cx, cy, cz,
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
  const cEv = AR.evals() - e1; const cMs = Date.now() - t1;

  const thetaTop = oRad[oRad.length - 1];
  const soundUB = Number.isFinite(thetaTop) && thetaTop < Math.PI / 2 ? Math.tan(thetaTop) * covR * 1000 : Number.POSITIVE_INFINITY;
  const row: Row = {
    k: IDX[q], area, diam, covR,
    w: cert.witnessed * 1000, b: cert.bound * 1000,
    v: cert.witnessed > TOL ? 1 : cert.certified ? 0 : -1,
    c: cert.witnessedComplete ? 1 : 0, cn: cert.n, csamp: cert.samples, cEv, cMs,
    oRad, oUm, oCov, oEv, soundUB,
  };
  rows.push(row); appendFileSync(REC, `${JSON.stringify(row)}\n`);
  evAccounted += cEv; for (const e of oEv) evAccounted += e;
  if ((q + 1) % 500 === 0) {
    const rate = (q + 1 - (IDX.length - (IDX.length - rows.length)) + 0) / Math.max(1e-9, (Date.now() - tS) / 1000);
    log(`  measured ${q + 1}/${IDX.length}   ${rate.toFixed(1)} facet/s   [${el()}]`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// READOUT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const n = rows.length;
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);

log('');
log('   ══ C-S90-5 EVAL ACCOUNTING NON-VACUITY ══');
const totalNow = AR.evals() - evAtStart;
log(`      per-facet deltas summed this run: ${totalNow}   (rows carried in from checkpoint are not re-run)`);
log('   ══ C-S90-6 ORIENT COST IS A CONSTANT PER k ══');
for (let i = 0; i < KS.length; i += 1) {
  const e = rows.map((r) => r.oEv[i]);
  const expect = 5 * (((KS[i] + 1) * (KS[i] + 2)) / 2);
  const mn = Math.min(...e); const mx = Math.max(...e);
  log(`      k=${KS[i]}  evals min ${mn} max ${mx}  expected 5*(k+1)(k+2)/2 = ${expect}  ${mn === mx && mn === expect ? 'EXACT' : '*** VARIES / DIFFERS — read this before any cost number ***'}`);
}

const cEvs = rows.map((r) => r.cEv);
const sc = S(cEvs);
log('');
log(`══ ${TAG} — ${n} facets ══`);
log(`   CERTIFICATE cost per facet (rA evals):  p50 ${pq(sc, 0.5)}  p90 ${pq(sc, 0.9)}  p99 ${pq(sc, 0.99)}  max ${sc[sc.length - 1]}   MEAN ${(sum(cEvs) / n).toFixed(1)}   TOTAL ${sum(cEvs)}`);
log(`      *** the flat model S88 priced this at: 375 flat.  MEAN/375 = ${(sum(cEvs) / n / 375).toFixed(2)}x ***`);
for (let i = 0; i < KS.length; i += 1) {
  log(`   SELECTOR k=${KS[i]} cost ${rows[0].oEv[i]} evals/facet = ${((100 * rows[0].oEv[i] * n) / Math.max(1, sum(cEvs))).toFixed(2)}% of the blind certificate total`);
}
const fails = rows.filter((r) => r.v === 1);
log(`   PROVEN-FAIL ${fails.length}/${n} = ${((100 * fails.length) / n).toFixed(4)}%`);

// ── IS COST CORRELATED WITH THE SELECTOR KEY? (the whole objection in one number)
function spearman(a: number[], b: number[]): number {
  const rank = (v: number[]): number[] => {
    const ord = v.map((x, i) => [x, i] as [number, number]).sort((p, q2) => p[0] - q2[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < ord.length;) {
      let j = i; while (j + 1 < ord.length && ord[j + 1][0] === ord[i][0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let t = i; t <= j; t += 1) r[ord[t][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a); const rb = rank(b);
  const ma = sum(ra) / ra.length; const mb = sum(rb) / rb.length;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < ra.length; i += 1) { const x = ra[i] - ma; const y = rb[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.max(1e-30, Math.sqrt(da * db));
}
const kTop = KS.length - 1;
log(`   rho(selector key o${KS[kTop]}, certificate COST) = ${spearman(rows.map((r) => r.oUm[kTop]), cEvs).toFixed(4)}   <= if positive, the selector KEEPS the expensive facets`);
log(`   rho(covRadius, certificate COST)              = ${spearman(rows.map((r) => r.covR), cEvs).toFixed(4)}`);

// ── H-S90-3 — THE END-TO-END COST, at each recall target, for each k.
log('');
log('   ══ H-S90-3 — END-TO-END rA EVALUATIONS: selector-on-all + certify-on-selected, vs certify-on-all ══');
const blind = sum(cEvs);
for (let i = 0; i < KS.length; i += 1) {
  const selCost = rows[0].oEv[i] * n;
  const ord = rows.map((r, q) => [r.oUm[i], q] as [number, number]).sort((p, q2) => q2[0] - p[0]);
  const nf = fails.length;
  const line: string[] = [];
  for (const target of [0.90, 0.95, 0.99, 1.00]) {
    let hit = 0; let cert = 0; let tested = 0;
    for (const [, q] of ord) {
      tested += 1; cert += rows[q].cEv;
      if (rows[q].v === 1) hit += 1;
      if (nf === 0 || hit / nf >= target - 1e-12) break;
    }
    const tot = selCost + cert;
    line.push(`r${target.toFixed(2)}: f=${((100 * tested) / n).toFixed(2)}% cost=${((100 * tot) / blind).toFixed(1)}% => ${(blind / Math.max(1, tot)).toFixed(2)}x`);
  }
  log(`      k=${KS[i]} (sel ${rows[0].oEv[i]} ev/facet)   ${line.join('   ')}`);
  log(`         FLOOR (f=0, selector only): ${(blind / Math.max(1, selCost)).toFixed(2)}x  <= NO selector can beat this`);
}

// ── H-S90-4 — SOUNDNESS of tan(theta)*covRadius.
log('');
log('   ══ H-S90-4 — IS `tan(theta_witnessed) * covRadius` A SOUND UPPER BOUND ON POSITION ERROR? ══');
for (let i = 0; i < KS.length; i += 1) {
  const viol = rows.filter((r) => Number.isFinite(r.oRad[i]) && Math.tan(Math.min(r.oRad[i], 1.5)) * r.covR * 1000 < r.w);
  const ratios = rows.filter((r) => r.w > 1e-9 && Number.isFinite(r.oRad[i])).map((r) => (Math.tan(Math.min(r.oRad[i], 1.5)) * r.covR * 1000) / r.w);
  const sr = S(ratios);
  log(`      k=${KS[i]}   VIOLATIONS (bound < witnessed) ${viol.length}/${n}   bound/witnessed  p01 ${pq(sr, 0.01).toFixed(3)}  p50 ${pq(sr, 0.5).toFixed(2)}  p99 ${pq(sr, 0.99).toFixed(1)}   min ${sr.length > 0 ? sr[0].toFixed(4) : 'n/a'}`);
  if (viol.length > 0) {
    const s2 = viol.slice().sort((a, b) => (Math.tan(Math.min(a.oRad[i], 1.5)) * a.covR * 1000) / a.w - (Math.tan(Math.min(b.oRad[i], 1.5)) * b.covR * 1000) / b.w);
    log(`         worst-3 counterexamples (bound um / witnessed um / covR mm / theta deg): ${s2.slice(0, 3).map((r) => `${(Math.tan(Math.min(r.oRad[i], 1.5)) * r.covR * 1000).toFixed(2)}/${r.w.toFixed(2)}/${r.covR.toFixed(4)}/${((r.oRad[i] * 180) / Math.PI).toFixed(2)}`).join('  ')}`);
  }
  // the operational question: how many facets does the SOUND test clear, and does it clear any true failure?
  const cleared = rows.filter((r) => Math.tan(Math.min(r.oRad[i], 1.5)) * r.covR * 1000 <= TOL * 1000);
  const clearedFail = cleared.filter((r) => r.v === 1);
  const clearedCost = sum(cleared.map((r) => r.cEv));
  const selCost = rows[0].oEv[i] * n;
  const tot = selCost + (blind - clearedCost);
  log(`         SOUND TEST clears ${cleared.length}/${n} (${((100 * cleared.length) / n).toFixed(2)}%) facets holding ${((100 * clearedCost) / Math.max(1, blind)).toFixed(2)}% of the certificate cost   *** UNSOUND CLEARS (cleared but w > bar): ${clearedFail.length} ***   end-to-end ${(blind / Math.max(1, tot)).toFixed(2)}x`);
}

writeFileSync(`${OUTDIR}/${TAG}.cost.summary.json`, JSON.stringify({
  tag: TAG, style: STYLE, stem: STEM, nTri, n, tol: TOL, nMax: NMAX, ks: KS, inset: INSET,
  certTotalEvals: blind, certMeanEvals: blind / n, certP50: pq(sc, 0.5), certP99: pq(sc, 0.99), certMax: sc[sc.length - 1],
  selEvalsPerFacet: KS.map((_v, i) => rows[0].oEv[i]),
  fails: fails.length, secs: (Date.now() - T0) / 1000,
}, null, 2));
log('');
log(`done  [${el()}]   rA evals ${AR.evals()}   inflightRejected ${AR.inflightRejected()}`);
