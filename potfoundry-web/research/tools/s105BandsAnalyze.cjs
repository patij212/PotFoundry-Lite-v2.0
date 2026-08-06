#!/usr/bin/env node
/* eslint-disable no-console */
// s105BandsAnalyze.cjs — THE BANDS. Pure arithmetic on the per-parent pools; no rA, no re-meshing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DESIGN, RESTATED SO IT CAN BE CHECKED
//
// `goldenIdx(n, C)` = {q*s mod n : q = 0..C-1}, s coprime to n. Extend to NTOT and cut into
// R = floor(NTOT/C) CONSECUTIVE DISJOINT BLOCKS of length C. Block j = {(jC+q)*s mod n} is block 0
// TRANSLATED by (jC*s mod n): an EXACT phase-translate of the campaign's own sample — same stride, same
// structure, different phase. Blocks are disjoint; their union is the pool. NO distributional assumption
// is used anywhere in B1.
//
// EVERY quantity here is a RATIO OF SUMS  T = sum(num) / sum(den):
//     leaves/parent      num = leaves,   den = 1
//     uncleared %        num = uncleared, den = leaves   (x100)
//     cone/lepp          num = cone leaves, den = lepp leaves
// so one machine bands all of them, and the H1 ratio is banded directly rather than by differencing two
// independent bands.
//
// TWO DIFFERENT INTERVALS, AND THE DIFFERENCE MATTERS:
//   * SINGLE-RUN BAND (the headline; this is THE DEBT). "If we had run N=C once with a different phase,
//     what range would we have seen?" = the spread of the block estimates themselves. Reported as the
//     empirical min..max over disjoint blocks, the 2.5/97.5 percentiles over ALL sliding windows of
//     length C, and mean +- 1.96*SD_phase.
//   * CI FOR THE POPULATION VALUE. mean +- t(0.975,R-1)*SD_phase/sqrt(R). Tightens with R. Reported
//     second and labelled, because quoting it as "the band on 5.33x" would understate the debt by sqrt(R).
//
// THE MEAN IS THE RIGHT FUNCTIONAL AND IS NOT SUBSTITUTED (total triangles = facets x mean leaves/par).
// Robust statistics are printed alongside, labelled as DIFFERENT quantities.
//
// Usage:
//   node research/tools/s105BandsAnalyze.cjs <mode> <ndjson> [C ladder csv]
//     mode = refine | cone
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('node:fs');

const MODE = process.argv[2] || 'refine';
const PATHND = process.argv[3];
const LADDER = (process.argv[4] || '50,100,200,400,800,1600,3200,6400').split(',').map(Number);
const CMAIN = Number(process.argv[5] || (MODE === 'cone' ? 2000 : 2000));

if (!PATHND || !fs.existsSync(PATHND)) { console.error(`no ndjson at ${PATHND}`); process.exit(1); }
const rows = [];
{
  const txt = fs.readFileSync(PATHND, 'utf8');
  for (const line of txt.split('\n')) {
    if (line.length < 3) continue;
    try { rows.push(JSON.parse(line)); } catch { /* torn last line */ }
  }
}
console.log(`===== S105 BANDS — ${MODE} — ${PATHND} =====`);
console.log(`records ${rows.length}   raw sequence span q = ${rows[0].q} .. ${rows[rows.length - 1].q}`);

// ── the quantities ────────────────────────────────────────────────────────────────────────────
/** @type {{name:string,unit:string,num:(r:any)=>number,den:(r:any)=>number,scale:number}[]} */
let QTY;
if (MODE === 'refine') {
  QTY = [
    { name: 'position 10um leaves/par', unit: 'x', num: (r) => r.pT, den: () => 1, scale: 1 },
    { name: 'position 10um uncleared', unit: '%', num: (r) => r.pU, den: (r) => r.pT, scale: 100 },
    { name: 'chord 10um LEPP leaves/par', unit: 'x', num: (r) => r.lT, den: () => 1, scale: 1 },
    { name: 'chord 10um LEPP uncleared', unit: '%', num: (r) => r.lU, den: (r) => r.lT, scale: 100 },
    { name: 'chord 10um RED leaves/par', unit: 'x', num: (r) => r.rT, den: () => 1, scale: 1 },
    { name: 'chord 10um RED uncleared', unit: '%', num: (r) => r.rU, den: (r) => r.rT, scale: 100 },
    { name: '1deg angle leaves/par', unit: 'x', num: (r) => r.A[0][0], den: () => 1, scale: 1 },
    { name: '1deg angle uncleared', unit: '%', num: (r) => r.A[0][1], den: (r) => r.A[0][0], scale: 100 },
    { name: 'lev0 over-bar chord AREA', unit: '%', num: (r) => r.uO[0], den: (r) => r.uA[0], scale: 100 },
  ];
} else {
  const g = (r, op) => (r.op[`${op}@10`] ? r.op[`${op}@10`][0] : 0);
  QTY = [
    { name: 'lepp leaves/par', unit: 'x', num: (r) => g(r, 'lepp'), den: () => 1, scale: 1 },
    { name: 'cone leaves/par', unit: 'x', num: (r) => g(r, 'cone'), den: () => 1, scale: 1 },
    { name: 'red  leaves/par', unit: 'x', num: (r) => g(r, 'red'), den: () => 1, scale: 1 },
    { name: '*** cone / lepp  (H1) ***', unit: 'x', num: (r) => g(r, 'cone'), den: (r) => g(r, 'lepp'), scale: 1 },
    { name: 'coneOracle / lepp', unit: 'x', num: (r) => g(r, 'coneOracle'), den: (r) => g(r, 'lepp'), scale: 1 },
    { name: 'red / lepp', unit: 'x', num: (r) => g(r, 'red'), den: (r) => g(r, 'lepp'), scale: 1 },
    { name: 'lepp uncleared', unit: '%', num: (r) => (r.op['lepp@10'] ? r.op['lepp@10'][1] : 0), den: (r) => g(r, 'lepp'), scale: 100 },
    { name: 'cone uncleared', unit: '%', num: (r) => (r.op['cone@10'] ? r.op['cone@10'][1] : 0), den: (r) => g(r, 'cone'), scale: 100 },
  ];
}

const est = (arr, Q) => {
  let n = 0; let d = 0;
  for (const r of arr) { n += Q.num(r); d += Q.den(r); }
  return d > 0 ? (Q.scale * n) / d : NaN;
};
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => { if (v.length < 2) return NaN; const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1)); };
const pct = (v, p) => { const s = v.slice().sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
// two-sided t 0.975 (df 1..30 then normal)
const TT = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145,
  2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const tq = (df) => (df <= 0 ? NaN : df <= 30 ? TT[df] : 1.96 + 2.4 / df);

/** disjoint phase blocks of size C, keyed on the RAW golden-sequence index q. */
function blocks(C) {
  const map = new Map();
  for (const r of rows) {
    const b = Math.floor(r.q / C);
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(r);
  }
  // keep only FULL blocks: a block is full iff its q-range [bC,(b+1)C) is entirely inside the pool span
  const qmax = rows[rows.length - 1].q;
  const out = [];
  for (const [b, arr] of [...map.entries()].sort((a, x) => a[0] - x[0])) {
    if ((b + 1) * C - 1 <= qmax) out.push(arr);
  }
  return out;
}
/** ALL sliding windows of C consecutive RAW sequence indices — every one is a legal phase-translate. */
function slideEst(C, Q, step) {
  // rows are in q order; build prefix sums over q using an index map
  const qmax = rows[rows.length - 1].q;
  const N = qmax + 1;
  const pn = new Float64Array(N + 1); const pd = new Float64Array(N + 1);
  let k = 0;
  for (let q = 0; q < N; q += 1) {
    let nn = 0; let dd = 0;
    while (k < rows.length && rows[k].q === q) { nn += Q.num(rows[k]); dd += Q.den(rows[k]); k += 1; }
    pn[q + 1] = pn[q] + nn; pd[q + 1] = pd[q] + dd;
  }
  const out = [];
  for (let s = 0; s + C <= N; s += step) {
    const d = pd[s + C] - pd[s];
    if (d > 0) out.push((Q.scale * (pn[s + C] - pn[s])) / d);
  }
  return out;
}
let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

// ══ THE POOL VALUE (near-census reference) ════════════════════════════════════════════════════
console.log('');
console.log('══ POOL (near-census) VALUE, and the ROBUST statistics that answer a DIFFERENT question ══');
console.log('  POOL = the estimator on the whole pool. The columns to its RIGHT are per-parent statistics of the');
console.log('  NUMERATOR ONLY and are a DIFFERENT quantity (median leaves != mean leaves; do not substitute).');
console.log('  quantity                          POOL     numer mean  numer p50   p90     p99     max    top1% share of numer total');
for (const Q of QTY) {
  const per = rows.map((r) => (Q.den(r) > 0 ? Q.num(r) : 0));
  const s = per.slice().sort((a, b) => a - b);
  const tot = s.reduce((a, b) => a + b, 0);
  const n1 = Math.max(1, Math.round(0.01 * s.length));
  const top = s.slice(s.length - n1).reduce((a, b) => a + b, 0);
  console.log(`  ${Q.name.padEnd(30)} ${est(rows, Q).toFixed(4).padStart(10)}  ${(tot / s.length).toFixed(3).padStart(9)} ${pct(per, 0.5).toFixed(3).padStart(11)} ${pct(per, 0.9).toFixed(2).padStart(7)} ${pct(per, 0.99).toFixed(1).padStart(7)} ${s[s.length - 1].toFixed(0).padStart(7)}   ${((100 * top) / Math.max(1e-12, tot)).toFixed(2).padStart(6)}%`);
}

// ══ B1 — THE ASSUMPTION-FREE PHASE-BLOCK BAND AT THE CAMPAIGN'S WORKING N ═════════════════════
console.log('');
console.log(`══ B1  PHASE-BLOCK BAND AT C = ${CMAIN}  (the campaign's own sample size) ══`);
const B = blocks(CMAIN);
console.log(`   R = ${B.length} disjoint phase blocks, sizes ${B.map((b) => b.length).join(',')}`);
console.log('');
console.log('  quantity                        PUBLISHED   POOL     blk SD    MIN      MAX    max/min   +-1.96SD rel   [p2.5,p97.5] sliding   P(within +-10%)');
console.log('  (PUBLISHED = block 0 = the exact sample the campaign took and quoted.)');
for (const Q of QTY) {
  const v = B.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
  if (v.length < 2) continue;
  const m = mean(v); const s = sd(v);
  const sl = slideEst(CMAIN, Q, Math.max(1, Math.floor(CMAIN / 20)));
  const lo = pct(sl, 0.025); const hi = pct(sl, 0.975);
  const P0v = est(rows, Q);
  const within = sl.filter((x) => Math.abs(x - P0v) <= 0.1 * Math.abs(P0v)).length / Math.max(1, sl.length);
  const mn = Math.min(...v); const mx = Math.max(...v);
  const rr = mn > 1e-9 ? `${(mx / mn).toFixed(2)}x` : (mx > 0 ? 'INF' : '-');
  console.log(`  ${Q.name.padEnd(30)} ${v[0].toFixed(4).padStart(9)} ${P0v.toFixed(4).padStart(8)} ${s.toFixed(4).padStart(8)} ${mn.toFixed(4).padStart(8)} ${mx.toFixed(4).padStart(8)} ${rr.padStart(8)}  ${((100 * 1.96 * s) / Math.max(1e-12, m)).toFixed(1).padStart(8)}%   [${lo.toFixed(3)}, ${hi.toFixed(3)}]${' '.repeat(Math.max(1, 22 - `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`.length))}${(100 * within).toFixed(0)}%`);
}
console.log('');
console.log(`  ALL ${B.length} BLOCK ESTIMATES, printed (a summary statistic of 16 numbers is not the 16 numbers):`);
for (const Q of QTY) {
  const v = B.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
  if (v.length < 2) continue;
  console.log(`  ${Q.name.padEnd(30)} ${v.map((x) => x.toFixed(x > 20 ? 1 : 3)).join('  ')}`);
}
console.log('');
console.log('  CI FOR THE POPULATION VALUE (NOT the single-run band; tightens with R — do not quote as "the band"):');
for (const Q of QTY) {
  const v = B.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
  if (v.length < 2) continue;
  const m = mean(v); const s = sd(v); const h = (tq(v.length - 1) * s) / Math.sqrt(v.length);
  console.log(`  ${Q.name.padEnd(30)} ${m.toFixed(4).padStart(9)} +- ${h.toFixed(4).padStart(8)}  = [${(m - h).toFixed(4)}, ${(m + h).toFixed(4)}]  (+-${((100 * h) / Math.max(1e-12, m)).toFixed(2)}%)`);
}

// ══ TAIL MECHANICS — WHY THE BAND IS WIDE, PRINTED RATHER THAN ASSERTED ═══════════════════════
console.log('');
console.log(`══ TAIL MECHANICS  (C = ${CMAIN}) — the estimator is a mean over a heavy tail; this is what that means ══`);
console.log('  drop-1 / drop-10 = the POOL estimate recomputed without its 1 / 10 largest-numerator parents.');
console.log('  "blk max share"  = within each block, the largest single parent\'s share of that block\'s numerator.');
console.log('');
console.log('  quantity                        top1 share  drop-1 pool  drop-10 pool   blk max share p50 / MAX   P(sample hits a top-0.1% parent)');
for (const Q of QTY) {
  const num = rows.map((r) => Q.num(r));
  const ord = num.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]);
  const tot = num.reduce((a, b) => a + b, 0);
  if (!(tot > 0)) continue;
  const drop = (k) => {
    const kill = new Set(ord.slice(0, k).map(([, i]) => i));
    return est(rows.filter((_, i) => !kill.has(i)), Q);
  };
  const shares = B.map((b) => {
    let t = 0; let mx = 0;
    for (const r of b) { const x = Q.num(r); t += x; if (x > mx) mx = x; }
    return t > 0 ? mx / t : 0;
  });
  const pHit = 1 - (1 - 0.001) ** CMAIN;
  console.log(`  ${Q.name.padEnd(30)} ${((100 * ord[0][0]) / tot).toFixed(2).padStart(9)}% ${drop(1).toFixed(4).padStart(12)} ${drop(10).toFixed(4).padStart(13)}   ${(100 * pct(shares, 0.5)).toFixed(2).padStart(8)}% / ${(100 * Math.max(...shares)).toFixed(2).padStart(6)}%   ${(100 * pHit).toFixed(1)}%`);
}

// ══ B2 — DOES THE SYSTEMATIC SAMPLE BEHAVE LIKE A RANDOM ONE? ═════════════════════════════════
console.log('');
console.log(`══ B2  SYSTEMATIC vs RANDOM, and DOES THE BOOTSTRAP WORK HERE?  (C = ${CMAIN}) ══`);
console.log('  SD_iid = delta-method SD of the ratio estimator under SRS from the pool.  deff = (SD_phase/SD_iid)^2');
console.log('  bootstrap = 2000 resamples WITHIN ONE BLOCK (what an analyst with one sample would compute).');
console.log('');
console.log('  quantity                        SD_phase   SD_iid   SD_ph/SD_iid  deff   bootSD(mean over blocks)  boot95 COVERAGE of pool');
for (const Q of QTY) {
  const v = B.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
  if (v.length < 2) continue;
  const sPh = sd(v);
  // delta method for R = sum(num)/sum(den):  Var ~ (1/(n*Dbar^2)) * Var(num - R*den)
  const R0 = est(rows, Q) / Q.scale;
  const dev = rows.map((r) => Q.num(r) - R0 * Q.den(r));
  const Dbar = mean(rows.map((r) => Q.den(r)));
  const sIid = (Q.scale * sd(dev)) / (Dbar * Math.sqrt(CMAIN));
  // bootstrap inside each block
  let covered = 0; let bsSum = 0; let nb = 0;
  const poolV = est(rows, Q);
  seed = 0x9e3779b9;
  for (const b of B) {
    const bv = [];
    for (let t = 0; t < 2000; t += 1) {
      let nn = 0; let dd = 0;
      for (let i = 0; i < b.length; i += 1) { const r = b[(rnd() * b.length) | 0]; nn += Q.num(r); dd += Q.den(r); }
      if (dd > 0) bv.push((Q.scale * nn) / dd);
    }
    if (bv.length < 100) continue;
    const lo = pct(bv, 0.025); const hi = pct(bv, 0.975);
    if (poolV >= lo && poolV <= hi) covered += 1;
    bsSum += sd(bv); nb += 1;
  }
  console.log(`  ${Q.name.padEnd(30)} ${sPh.toFixed(4).padStart(9)} ${sIid.toFixed(4).padStart(8)}  ${(sPh / Math.max(1e-12, sIid)).toFixed(3).padStart(11)}  ${((sPh / Math.max(1e-12, sIid)) ** 2).toFixed(3).padStart(6)}  ${(bsSum / Math.max(1, nb)).toFixed(4).padStart(22)}   ${covered}/${nb} = ${((100 * covered) / Math.max(1, nb)).toFixed(0)}%`);
}

// ══ B3 — THE REQUIRED-N CURVE ═════════════════════════════════════════════════════════════════
console.log('');
console.log('══ B3  REQUIRED-N — the single-run relative half-width  1.96*SD_phase(C)/mean  at each C ══');
console.log('  (R = number of DISJOINT blocks available at that C; the SD itself is noisy when R is small —');
console.log('   its own 95% chi-square interval is printed so a row with R=5 is not read as precise.)');
console.log('');
let hdr = '  quantity                      ';
for (const C of LADDER) hdr += `${`C=${C}`.padStart(11)}`;
console.log(`${hdr}   N for +-10%`);
for (const Q of QTY) {
  let line = `  ${Q.name.padEnd(30)}`;
  let need = null;
  for (const C of LADDER) {
    const BB = blocks(C);
    const v = BB.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
    // *** R >= 6 OR THE ROW IS NOT PRINTED. *** An SD from 2-3 blocks is not an SD; an earlier draft of
    // this table read "N for +-10% = 8000" off an R=2 row. Refuse to print it rather than caveat it.
    if (v.length < 6) { line += `${'-'.padStart(11)}`; continue; }
    const rel = (100 * 1.96 * sd(v)) / Math.max(1e-12, mean(v));
    line += `${`${rel.toFixed(1)}%`.padStart(11)}`;
    if (need === null && rel <= 10) need = C;
  }
  // extrapolate on the 1/sqrt(C) law from the LARGEST C with R>=8, and flag it as an extrapolation
  let extra = '';
  if (need === null) {
    let bestC = null; let bestRel = null;
    for (const C of LADDER) {
      const BB = blocks(C);
      const v = BB.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
      if (v.length >= 10) { bestC = C; bestRel = (100 * 1.96 * sd(v)) / Math.max(1e-12, mean(v)); }
    }
    if (bestC) extra = `  > pool; EXTRAPOLATED on 1/sqrt(N) from C=${bestC} (R>=10): ~${Math.round(bestC * (bestRel / 10) ** 2).toLocaleString()}`;
  }
  console.log(`${line}   ${need === null ? `NOT REACHED${extra}` : String(need)}`);
}
console.log('');
console.log('  SD-of-SD sanity (chi-square 95% interval on SD_phase, main C):');
for (const Q of QTY) {
  const v = B.map((b) => est(b, Q)).filter((x) => Number.isFinite(x));
  if (v.length < 3) continue;
  const df = v.length - 1; const s = sd(v);
  // chi2 quantiles by Wilson-Hilferty
  const c2 = (p) => { const a = 2 / (9 * df); const z = p === 0.025 ? -1.96 : 1.96; return df * (1 - a + z * Math.sqrt(a)) ** 3; };
  console.log(`  ${Q.name.padEnd(30)} SD ${s.toFixed(4)}  95% [${(s * Math.sqrt(df / c2(0.975))).toFixed(4)}, ${(s * Math.sqrt(df / c2(0.025))).toFixed(4)}]  (df ${df})`);
}

// ══ B4 — VARIANCE REDUCTION BY STRATIFICATION ═════════════════════════════════════════════════
console.log('');
console.log('══ B4  STRATIFICATION ON A LEVEL-0 COVARIATE — honest split-half, no in-sample optimism ══');
console.log('  strata boundaries + sigma_h are fit on the EVEN blocks; the variance is evaluated on the ODD');
console.log('  blocks. deployment cost = rA evals per facet to compute the covariate for the WHOLE mesh.');
console.log('');
const COVS = MODE === 'refine'
  ? [['qs shape index', (r) => r.qs, '0 (STL only)'], ['dm diam mm', (r) => r.dm, '0 (STL only)'],
    ['mn lev0 minAngle', (r) => r.mn, '0 (STL only)'], ['sl chart slope', (r) => r.sl, '5'],
    ['g0 lev0 sup angle', (r) => r.g0, '225'], ['c0 lev0 chord um', (r) => r.c0, '225'],
    ['a0 lev0 area', (r) => r.a0, '0 (STL only)']]
  : [['qs shape index', (r) => r.qs, '0 (STL only)'], ['dm diam mm', (r) => r.dm, '0 (STL only)'],
    ['mn lev0 minAngle', (r) => r.mn, '0 (STL only)'], ['sl chart slope', (r) => r.sl, '5'],
    ['g0 lev0 sup angle', (r) => r.g0, '225'], ['c0 lev0 chord um', (r) => r.c0, '225'],
    ['cu coneUB deg', (r) => r.cu, '225']];
const HSTR = Number(process.env.PF_BD_STRATA || 8);
const BALL = blocks(CMAIN);
const TRAIN = []; const EVAL = [];
BALL.forEach((b, j) => (j % 2 === 0 ? TRAIN : EVAL).push(...b));
if (TRAIN.length > 0 && EVAL.length > 0) {
  for (const Q of QTY) {
    const R0 = est(rows, Q) / Q.scale;
    const y = (r) => Q.num(r) - R0 * Q.den(r);   // the linearized summand; Var of the ratio estimator ~ Var(y)
    const Dbar = mean(rows.map((r) => Q.den(r)));
    const sAll = sd(EVAL.map(y));
    let best = null;
    const lines = [];
    for (const [cname, cf, cost] of COVS) {
      // strata boundaries = quantiles of the covariate on TRAIN
      const tv = TRAIN.map(cf).sort((a, b) => a - b);
      const edges = [];
      for (let h = 1; h < HSTR; h += 1) edges.push(tv[Math.floor((h * tv.length) / HSTR)]);
      const binOf = (r) => { const x = cf(r); let h = 0; while (h < edges.length && x >= edges[h]) h += 1; return h; };
      // sigma_h from TRAIN, W_h from TRAIN (a deployable design knows both BEFORE sampling)
      const trH = Array.from({ length: HSTR }, () => []);
      for (const r of TRAIN) trH[binOf(r)].push(y(r));
      const W = trH.map((a) => a.length / TRAIN.length);
      const SIG = trH.map((a) => (a.length > 1 ? sd(a) : 0));
      // EVALUATE on the held-out half with the TRAIN-fitted sigma/W but EVAL's true within-stratum variance
      const evH = Array.from({ length: HSTR }, () => []);
      for (const r of EVAL) evH[binOf(r)].push(y(r));
      const Wev = evH.map((a) => a.length / EVAL.length);
      const SIGev = evH.map((a) => (a.length > 1 ? sd(a) : 0));
      // proportional allocation: Var*n = sum W_h sigma_h^2 (true sigma from EVAL, weights from EVAL population)
      let vProp = 0; for (let h = 0; h < HSTR; h += 1) vProp += Wev[h] * SIGev[h] * SIGev[h];
      // Neyman with TRAIN-fitted sigma (the deployable, honestly-suboptimal one), evaluated with EVAL sigma:
      //   n_h/n = W_h sigma_h^train / sum(W sigma^train);  Var*n = sum W_h^2 sigma_h^eval^2 / (n_h/n)
      const den = W.reduce((a, w, h) => a + w * SIG[h], 0);
      let vNey = 0;
      for (let h = 0; h < HSTR; h += 1) {
        const f = den > 0 ? (W[h] * SIG[h]) / den : Wev[h];
        if (f > 1e-9) vNey += (Wev[h] * Wev[h] * SIGev[h] * SIGev[h]) / f;
      }
      const vSrs = sAll * sAll;
      const gProp = vSrs / Math.max(1e-30, vProp);
      const gNey = vSrs / Math.max(1e-30, vNey);
      lines.push(`      ${cname.padEnd(20)} cost ${cost.padStart(12)} rA/facet   ESS gain: proportional ${gProp.toFixed(2)}x   Neyman(train-fit) ${gNey.toFixed(2)}x`);
      if (best === null || gNey > best[1]) best = [cname, gNey, gProp];
    }
    console.log(`   ${Q.name}   (linearized SD on held-out half = ${(Q.scale * sAll / Dbar).toFixed(4)} per parent)`);
    for (const l of lines) console.log(l);
    if (best) {
      console.log(`      => BEST ${best[0]}: Neyman ${best[1].toFixed(2)}x ESS   (KILL LINE: < 2.00x => not worth it)`);
      // *** EMPIRICAL CHECK — draw the stratified sample and MEASURE its spread. The formula assumes the
      // within-stratum sigmas are known; under a heavy tail they are estimated badly, so the formula can
      // be optimistic. This is the number to believe.
      const [cn, cf] = COVS.find((c) => c[0] === best[0]);
      const tv = TRAIN.map(cf).sort((a, b) => a - b);
      const edges = [];
      for (let h = 1; h < HSTR; h += 1) edges.push(tv[Math.floor((h * tv.length) / HSTR)]);
      const binOf = (r) => { const x = cf(r); let h = 0; while (h < edges.length && x >= edges[h]) h += 1; return h; };
      const trH = Array.from({ length: HSTR }, () => []);
      for (const r of TRAIN) trH[binOf(r)].push(y(r));
      const Wt = trH.map((a) => a.length / TRAIN.length);
      const St = trH.map((a) => (a.length > 1 ? sd(a) : 0));
      const dd = Wt.reduce((a, w, h) => a + w * St[h], 0);
      const alloc = Wt.map((w, h) => (dd > 0 ? (w * St[h]) / dd : w));
      const evH = Array.from({ length: HSTR }, () => []);
      for (const r of EVAL) evH[binOf(r)].push(r);
      const Wev = evH.map((a) => a.length / EVAL.length);
      for (const Csamp of [400, 2000]) {
        seed = 0xdeadbeef;
        const strat = []; const srs = [];
        for (let t = 0; t < 4000; t += 1) {
          let nn = 0; let ddn = 0;                                  // stratified: sum_h W_h * ybar_h
          for (let h = 0; h < HSTR; h += 1) {
            const nh = Math.max(1, Math.round(alloc[h] * Csamp));
            if (evH[h].length === 0) continue;
            let sn = 0; let sd2 = 0;
            for (let i = 0; i < nh; i += 1) { const r = evH[h][(rnd() * evH[h].length) | 0]; sn += Q.num(r); sd2 += Q.den(r); }
            nn += (Wev[h] * sn) / nh; ddn += (Wev[h] * sd2) / nh;
          }
          if (ddn > 0) strat.push((Q.scale * nn) / ddn);
          let an = 0; let ad = 0;
          for (let i = 0; i < Csamp; i += 1) { const r = EVAL[(rnd() * EVAL.length) | 0]; an += Q.num(r); ad += Q.den(r); }
          if (ad > 0) srs.push((Q.scale * an) / ad);
        }
        const gEmp = (sd(srs) / Math.max(1e-12, sd(strat))) ** 2;
        console.log(`      EMPIRICAL @ C=${Csamp} (4000 draws, held-out half): SRS SD ${sd(srs).toFixed(4)} vs STRATIFIED SD ${sd(strat).toFixed(4)}  => ESS gain ${gEmp.toFixed(2)}x   (stratified N=${Csamp} == unstratified N=${Math.round(Csamp * gEmp).toLocaleString()})`);
      }
    }
    console.log('');
  }
}

// ══ THE H1 OVERLAP TEST — the pre-registered kill ═════════════════════════════════════════════
if (MODE === 'cone') {
  console.log('');
  console.log('══ H1 OVERLAP TEST — *** KILL: if the 95% interval for cone/lepp CONTAINS 1.000, the ***');
  console.log('   *** refutation of H1 is NOT established at that N. *** Two ways, both printed.');
  const gl = (r) => (r.op['lepp@10'] ? r.op['lepp@10'][0] : 0);
  const gc = (r) => (r.op['cone@10'] ? r.op['cone@10'][0] : 0);
  for (const C of [500, 800, 1000, 2000, 4000]) {
    const BB = blocks(C);
    if (BB.length < 3) continue;
    // (a) UNPAIRED: ratio of block means, block by block
    const rat = BB.map((b) => {
      let a = 0; let l = 0;
      for (const r of b) { a += gc(r); l += gl(r); }
      return l > 0 ? a / l : NaN;
    }).filter(Number.isFinite);
    const m = mean(rat); const s = sd(rat);
    // (b) PAIRED: per-parent d = cone - lepp; t-test on the pool (same parents, so this is the sharp test)
    const d = rows.map((r) => gc(r) - gl(r));
    const md = mean(d); const sdd = sd(d) / Math.sqrt(d.length);
    const poolL = mean(rows.map(gl));
    const nWorse = rat.filter((x) => x > 1).length;
    // *** THE NORMAL INTERVAL IS THE WRONG INSTRUMENT ON A RIGHT-SKEWED POSITIVE RATIO. *** It is printed
    // because it is what a default analysis produces, next to the two that are not wrong here: the
    // EMPIRICAL percentile interval and the LOG-SPACE interval.
    const lg = rat.map(Math.log); const lm = mean(lg); const ls = sd(lg);
    console.log(`   C=${String(C).padStart(4)}  R=${String(BB.length).padStart(3)}  mean ${m.toFixed(3)} SD ${s.toFixed(3)}  min ${Math.min(...rat).toFixed(3)} max ${Math.max(...rat).toFixed(3)}   NORMAL+-1.96SD [${(m - 1.96 * s).toFixed(3)}, ${(m + 1.96 * s).toFixed(3)}]   LOG-SPACE [${Math.exp(lm - 1.96 * ls).toFixed(3)}, ${Math.exp(lm + 1.96 * ls).toFixed(3)}]   EMPIRICAL p2.5/p97.5 [${pct(rat, 0.025).toFixed(3)}, ${pct(rat, 0.975).toFixed(3)}]   cone WORSE in ${nWorse}/${rat.length} blocks`);
    if (C === 2000) {
      console.log(`         PAIRED (whole pool, n=${d.length}): mean(cone-lepp) = ${md.toFixed(4)} +- ${(1.96 * sdd).toFixed(4)} leaves/parent  => ratio ${(1 + md / poolL).toFixed(4)} [${(1 + (md - 1.96 * sdd) / poolL).toFixed(4)}, ${(1 + (md + 1.96 * sdd) / poolL).toFixed(4)}]   t = ${(md / sdd).toFixed(1)}`);
    }
  }
}

// ══ CROSS-CHECK: the trimmed pool must reproduce the FULL-BAR fidelity run on its first block ══
console.log('══ CROSS-CHECK — aggregate over the FIRST 2000 pool records (must equal the published run) ══');
{
  const first = rows.filter((r) => r.q < 2000);
  console.log(`   n = ${first.length}`);
  for (const Q of QTY) console.log(`   ${Q.name.padEnd(30)} ${est(first, Q).toFixed(4)}`);
}
console.log('');
console.log('done.');
