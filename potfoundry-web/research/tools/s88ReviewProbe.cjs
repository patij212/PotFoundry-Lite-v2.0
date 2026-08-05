// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// S88 — ADVERSARIAL REVIEW PROBE.  READ-ONLY POST-PROCESSING of S87's own per-facet checkpoints.
// No mesh is loaded, no rA is built, no certificate is re-run.  Plain node, no bundle, no runner:
// there is nothing to bundle, so the runner-collision hazard does not exist for this file.
//
//     node research/tools/s88ReviewProbe.cjs
//
// PRE-REGISTERED in research/exchange/_strataConformBisect/S88_REVIEW_FINDINGS.md §0 BEFORE this ran.
// Hypotheses H-R1b / H-R1c / H-R2a / H-R2b / H-R2c and controls C-S88-1/2/3.
//
// THE INPUT.  `s87ledger/<TAG>.pos.ndjson`, one row per sampled facet, written by s87LedgerReexam.ts:
//     k    facet index in the STL
//     area facet area (mm^2)
//     p    sagAdaptiveRaw  — THE BLIND PLANE RULER, um          (a good RANKER, banned as a magnitude)
//     w    certifyTriangle WITNESSED, um                        (honest, achieved)
//     b    certifyTriangle BOUND, um                            (honest, rigorous)
//     v    verdict 0 = PROVEN-PASS / 1 = PROVEN-FAIL / 2 = UNKNOWN
//     c    witnessedComplete
//     o0   orientation chord 2*sin(th/2)*diam, inset 0,    um
//     o2   orientation chord 2*sin(th/2)*diam, inset 0.02, um   (THE verdict column, vertex-safe)
//
// *** THAT SCHEMA IS WHY THIS FILE EXISTS.  The blind ruler, the honest verdict and the orientation
//     chord are ON THE SAME FACET.  Every correlation and every recall curve this review needs is
//     already on disk and has never been read off it: S87 computed its three Spearman rho's over SEVEN
//     ARM-LEVEL AGGREGATES, not over facets. ***
//
// NOTHING HERE IS A VERDICT.  Printed values only; the verdicts are read in the findings file against
// the criteria registered before the run.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'exchange', '_strataConformBisect', 's87ledger');
const BAR = 10.0;                 // um, the product bar, on BOTH rulers
const NBOOT = 4000;
const out = [];
const log = (s) => { out.push(s); console.log(s); };

// ── deterministic RNG so the bootstrap is reproducible to the digit ─────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadRows(tag) {
  const f = path.join(DIR, `${tag}.pos.ndjson`);
  if (!fs.existsSync(f)) return null;
  const txt = fs.readFileSync(f, 'utf8');
  const rows = [];
  for (const line of txt.split('\n')) { if (line.length > 2) rows.push(JSON.parse(line)); }
  return rows;
}
function loadSummary(tag) {
  const f = path.join(DIR, `${tag}.pos.summary.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

// ── Spearman rank correlation, average ranks on ties ────────────────────────────────────────────────
function ranks(x) {
  const n = x.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  const r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i; while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let q = i; q <= j; q++) r[idx[q]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return sab / Math.sqrt(saa * sbb);
}
const spearman = (x, y) => pearson(ranks(x), ranks(y));

// ════════════════════════════════════════════════════════════════════════════════════════════════════
log('════════════════════════════════════════════════════════════════════════════════════════════════');
log('S88 REVIEW PROBE — read-only post-processing of S87 per-facet checkpoints');
log(`bar ${BAR} um on both rulers · bootstrap reps ${NBOOT} · seeded mulberry32`);
log('════════════════════════════════════════════════════════════════════════════════════════════════');

const TAGS = ['S9A', 'S10A', 'S11A', 'S15A', 'S21B', 'S22B', 'S24i2', 'S28i1', 'S8P', 'C2S39CTL', 'IDA', 'IDB', 's88S10B'];
const R = {}, S = {};
for (const t of TAGS) { const r = loadRows(t); if (r) { R[t] = r; S[t] = loadSummary(t); } }
log(`\nloaded: ${Object.keys(R).map((t) => `${t}(${R[t].length})`).join(' ')}`);

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// C-S88-1 — NON-VACUITY. Recompute S87's own summary from the rows it wrote.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── C-S88-1  NON-VACUITY: my re-derivation vs S87\'s own pos.summary.json ────────────────────────');
log('tag        n     fail(mine/theirs)  areaFailFrac(mine/theirs)          o2Over(m/t)   o2AreaFrac(m/t)      C1');
let c1all = true;
for (const t of Object.keys(R)) {
  const rows = R[t], s = S[t]; if (!s) continue;
  const fail = rows.filter((r) => r.v === 1).length;
  const areaAll = rows.reduce((a, r) => a + r.area, 0);
  const areaFail = rows.filter((r) => r.v === 1).reduce((a, r) => a + r.area, 0);
  const o2o = rows.filter((r) => r.o2 > BAR).length;
  const o2a = rows.filter((r) => r.o2 > BAR).reduce((a, r) => a + r.area, 0) / areaAll;
  const ok = fail === s.fail && Math.abs(areaFail / areaAll - s.areaFailFrac) < 1e-12
    && o2o === s.o2Over && Math.abs(o2a - s.o2OverAreaFrac) < 1e-12;
  if (!ok) c1all = false;
  log(`${t.padEnd(9)} ${String(rows.length).padStart(6)}  ${String(fail).padStart(5)}/${String(s.fail).padEnd(5)}  `
    + `${(areaFail / areaAll * 100).toFixed(7)}%/${(s.areaFailFrac * 100).toFixed(7)}%  `
    + `${String(o2o).padStart(6)}/${String(s.o2Over).padEnd(6)}  ${(o2a * 100).toFixed(5)}%/${(s.o2OverAreaFrac * 100).toFixed(5)}%  ${ok ? 'PASS' : '*** FAIL ***'}`);
}
log(`C-S88-1: ${c1all ? 'PASS on every arm' : '*** FAILED — nothing below is admissible ***'}`);

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// C-S88-2 — IDENTITY. IDA/IDB are byte-identical meshes.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
if (R.IDA && R.IDB) {
  let diffs = 0;
  for (let i = 0; i < R.IDA.length; i++) {
    const a = R.IDA[i], b = R.IDB[i];
    if (a.k !== b.k || a.area !== b.area || a.w !== b.w || a.b !== b.b || a.v !== b.v || a.o0 !== b.o0 || a.o2 !== b.o2 || a.p !== b.p) diffs++;
  }
  log(`\n── C-S88-2  IDENTITY: IDA vs IDB over ${R.IDA.length} rows, all 8 columns  →  ${diffs} differing rows  ${diffs === 0 ? 'PASS' : '*** FAIL ***'}`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// H-R1b — THE INTERVAL ON THE 0.604x AREA RATIO, and what the "empirical null" is actually worth.
// Two-sample bootstrap: resample facets WITHIN each arm with replacement (the arms are different meshes
// with different facets, so this is the right resampling unit), recompute areaFailFrac, take the ratio.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// typed-array columns, built once per tag — the bootstrap is the hot loop
const COL = {};
function cols(tag) {
  if (COL[tag]) return COL[tag];
  const rows = R[tag]; const n = rows.length;
  const area = new Float64Array(n), fail = new Uint8Array(n);
  for (let i = 0; i < n; i++) { area[i] = rows[i].area; fail[i] = rows[i].v === 1 ? 1 : 0; }
  COL[tag] = { n, area, fail };
  return COL[tag];
}
// STAT = 0 -> failing-AREA fraction ; STAT = 1 -> failing COUNT rate
function statOn(c, idx, mode) {
  const n = c.n; let aAll = 0, aF = 0, f = 0;
  for (let q = 0; q < n; q++) { const i = idx[q]; aAll += c.area[i]; if (c.fail[i]) { aF += c.area[i]; f++; } }
  return mode === 0 ? aF / aAll : f / n;
}
function bootRatio(tagA, tagB, seed, mode) {
  const A = cols(tagA), B = cols(tagB);
  const rng = mulberry32(seed);
  const ia = new Int32Array(A.n), ib = new Int32Array(B.n);
  const rs = new Float64Array(NBOOT);
  for (let t = 0; t < NBOOT; t++) {
    for (let i = 0; i < A.n; i++) ia[i] = (rng() * A.n) | 0;
    for (let i = 0; i < B.n; i++) ib[i] = (rng() * B.n) | 0;
    rs[t] = statOn(B, ib, mode) / statOn(A, ia, mode);
  }
  const srt = Array.from(rs).sort((x, y) => x - y);
  const q = (p) => srt[Math.min(NBOOT - 1, Math.max(0, Math.round(p * (NBOOT - 1))))];
  const idA = new Int32Array(A.n), idB = new Int32Array(B.n);
  for (let i = 0; i < A.n; i++) idA[i] = i; for (let i = 0; i < B.n; i++) idB[i] = i;
  const point = statOn(B, idB, mode) / statOn(A, idA, mode);
  return { point, lo95: q(0.025), hi95: q(0.975), lo68: q(0.16), hi68: q(0.84), median: q(0.5) };
}

log('\n── H-R1b  BOOTSTRAP CONFIDENCE INTERVALS ON THE STEP RATIOS (20,000 reps, facet resampling) ─────');
log('step                       stat        point     95% CI                  68% CI              includes 1.000?');
const STEPS = [['S24i2', 'S28i1'], ['S10A', 's88S10B'], ['S28i1', 'C2S39CTL'], ['S24i2', 'C2S39CTL'],
  ['S10A', 'S11A'], ['S22B', 'S24i2'], ['S21B', 'S22B'], ['S15A', 'S21B'], ['S11A', 'S15A'], ['S9A', 'S10A']];
const boots = {};
let seed = 12345;
for (const [a, b] of STEPS) {
  if (!R[a] || !R[b]) continue;
  for (const [nm, st] of [['AREA', 0], ['COUNT-rate', 1]]) {
    const r = bootRatio(a, b, seed++, st);
    boots[`${a}->${b}|${nm}`] = r;
    const inc1 = (r.lo95 <= 1 && r.hi95 >= 1) ? '*** YES — unresolvable ***' : 'no';
    log(`${(a + ' -> ' + b).padEnd(20)} ${nm.padEnd(12)} ${r.point.toFixed(4)}x   [${r.lo95.toFixed(4)}, ${r.hi95.toFixed(4)}]   [${r.lo68.toFixed(4)}, ${r.hi68.toFixed(4)}]   ${inc1}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// C-S88-3 — the NULL's own interval. S87 treats 0.913x as "what nothing produces". It is ONE DRAW.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
const nullA = boots['S10A->S11A|AREA'];
if (nullA) {
  log(`\n── C-S88-3  THE "EMPIRICAL NULL", WITH ITS OWN INTERVAL ─────────────────────────────────────────`);
  log(`_S10A -> _S11A is a KNOWN 68-triangle no-op. Its AREA ratio: ${nullA.point.toFixed(4)}x`);
  log(`                                   its own 95% CI: [${nullA.lo95.toFixed(4)}, ${nullA.hi95.toFixed(4)}]`);
  log(`   contains 1.000? ${(nullA.lo95 <= 1 && nullA.hi95 >= 1) ? 'YES — so the null is CONSISTENT WITH 1.000 and 0.913 is a NOISE DRAW, not a floor' : 'NO — *** my interval is wrong, not the campaign\'s ***'}`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// H-R1c — is _S28i1 "the best artifact in the family by honest position AREA"?
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── H-R1c  EVERY SCORED ARTIFACT, RANKED BY HONEST POSITION AREA (S87 Table B, re-derived) ───────');
log('rank  tag        nTri        N       failRate    areaFailFrac    scaledFailFacets   in-sample witMax um');
const rankRows = Object.keys(R).filter((t) => !t.startsWith('ID') && S[t]).map((t) => {
  const s = S[t], rows = R[t];
  const areaAll = rows.reduce((a, r) => a + r.area, 0);
  const areaFail = rows.filter((r) => r.v === 1).reduce((a, r) => a + r.area, 0);
  return { t, nTri: s.nTri, N: rows.length, rate: s.fail / rows.length, af: areaFail / areaAll, scaled: s.scaledFail, wm: s.witMaxInSample };
}).sort((a, b) => a.af - b.af);
rankRows.forEach((r, i) => log(`${String(i + 1).padStart(4)}  ${r.t.padEnd(9)} ${String(r.nTri).padStart(9)} ${String(r.N).padStart(7)}  ${(r.rate * 100).toFixed(4)}%    ${(r.af * 100).toFixed(6)}%      ${r.scaled.toFixed(0).padStart(8)}          ${r.wm.toFixed(2)}`));

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// R1 — THE DECOMPOSITION.  areaFrac = countRate * (mean failing facet area / mean facet area).
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── R1  DECOMPOSITION: areaFrac = countRate x (mean FAILING facet area / mean facet area) ────────');
log('tag        nTri       countRate   relSize   areaFrac    absFailArea mm^2 (scaled to mesh)');
for (const t of ['S24i2', 'S28i1', 'S10A', 's88S10B', 'C2S39CTL']) {
  if (!R[t] || !S[t]) continue;
  const rows = R[t], s = S[t];
  const areaAll = rows.reduce((a, r) => a + r.area, 0);
  const fr = rows.filter((r) => r.v === 1);
  const areaFail = fr.reduce((a, r) => a + r.area, 0);
  const rate = fr.length / rows.length;
  const relSize = (areaFail / Math.max(1, fr.length)) / (areaAll / rows.length);
  const meshArea = areaAll / rows.length * s.nTri;
  log(`${t.padEnd(9)} ${String(s.nTri).padStart(9)}  ${(rate * 100).toFixed(4)}%   ${relSize.toFixed(5)}   ${(areaFail / areaAll * 100).toFixed(6)}%   ${(areaFail / areaAll * meshArea).toFixed(3)}`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// H-R1d — THE DENSITY ELASTICITY.  Fit  areaFailFrac ∝ nTri^(−α)  on each buy-triangles pair, and ask
// what the GENERIC arm predicts for the TARGETED arm's own dose. If the targeted arm's measured ratio
// sits inside its own CI around that prediction, its "lever" is indistinguishable from buying triangles.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── H-R1d  DENSITY ELASTICITY  areaFailFrac ∝ nTri^(−α)  ─────────────────────────────────────────');
log('pair                       dose(tris)  AREA ratio  alpha    COUNT-rate ratio  scaledFailFacets before->after');
const PAIRS = [['S10A', 's88S10B', 'GLOBAL accept 0.0035->0.00175, seed bit-identical'],
  ['S24i2', 'S28i1', 'TARGETED tighten field, 4,217 clusters']];
const alphas = {};
for (const [a, b, what] of PAIRS) {
  if (!R[a] || !R[b] || !S[a] || !S[b]) continue;
  const dose = S[b].nTri / S[a].nTri;
  const ar = (S[b].areaFailFrac) / (S[a].areaFailFrac);
  const cr = (S[b].fail / R[b].length) / (S[a].fail / R[a].length);
  const alpha = -Math.log(ar) / Math.log(dose);
  alphas[a + '->' + b] = { alpha, dose, ar, cr };
  log(`${(a + ' -> ' + b).padEnd(24)}  ${dose.toFixed(4)}x    ${ar.toFixed(4)}x   ${alpha.toFixed(3)}    ${cr.toFixed(4)}x            ${S[a].scaledFail.toFixed(0)} -> ${S[b].scaledFail.toFixed(0)}`);
  log(`        ${what}`);
}
{
  const g = alphas['S10A->s88S10B'], t = alphas['S24i2->S28i1'];
  if (g && t) {
    const pred = Math.pow(t.dose, -g.alpha);
    const bt = boots['S24i2->S28i1|AREA'];
    log(`\n   *** THE COUNTERFACTUAL: at the TARGETED arm's own dose of ${t.dose.toFixed(4)}x, the GENERIC`);
    log(`       buy-triangles elasticity (alpha ${g.alpha.toFixed(3)}) predicts an AREA ratio of ${pred.toFixed(4)}x.`);
    log(`       The targeted arm measured ${t.ar.toFixed(4)}x, 95% CI [${bt.lo95.toFixed(4)}, ${bt.hi95.toFixed(4)}].`);
    log(`       Prediction inside that CI?  ${(pred >= bt.lo95 && pred <= bt.hi95) ? '*** YES — the targeted field is NOT resolvably better than buying triangles ***' : 'NO — the field beats generic density at 95%'}`);
  }
}

// how concentrated is the AREA statistic itself? (a few big failing facets can own it)
log('\n── R1  IS THE AREA STATISTIC CARRIED BY A HANDFUL OF FACETS? (share of failing area, top-k) ─────');
log('tag        nFail   top1     top5     top10    top25    top50');
for (const t of ['S24i2', 'S28i1', 'S10A', 's88S10B', 'C2S39CTL']) {
  if (!R[t]) continue;
  const fa = R[t].filter((r) => r.v === 1).map((r) => r.area).sort((a, b) => b - a);
  const tot = fa.reduce((a, x) => a + x, 0);
  const cum = (k) => fa.slice(0, k).reduce((a, x) => a + x, 0) / tot;
  log(`${t.padEnd(9)} ${String(fa.length).padStart(5)}   ${(cum(1) * 100).toFixed(2)}%   ${(cum(5) * 100).toFixed(2)}%   ${(cum(10) * 100).toFixed(2)}%   ${(cum(25) * 100).toFixed(2)}%   ${(cum(50) * 100).toFixed(2)}%`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// H-R2a — THE PER-FACET CORRELATIONS.  S87's three rho's are n = 7 ARM-LEVEL aggregates.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── H-R2a  PER-FACET SPEARMAN, on the SAME facets, per arm (n = 50,000 each) ─────────────────────');
log('tag         rho(blind p, honest w)   rho(blind p, orient o2)   rho(honest w, orient o2)   n');
for (const t of ['S9A', 'S10A', 'S11A', 'S15A', 'S21B', 'S22B', 'S24i2', 'S28i1', 'S8P', 'C2S39CTL', 's88S10B']) {
  if (!R[t]) continue;
  const rows = R[t];
  const p = rows.map((r) => r.p), w = rows.map((r) => r.w), o = rows.map((r) => r.o2);
  log(`${t.padEnd(10)}  ${spearman(p, w).toFixed(4).padStart(10)}              ${spearman(p, o).toFixed(4).padStart(10)}              ${spearman(w, o).toFixed(4).padStart(10)}         ${rows.length}`);
}
// the arm-level n=7 rho with its own interval, by exact permutation
function spearmanArmLevel(xs, ys) { return spearman(xs, ys); }
log('\n   ARM-LEVEL (S87\'s own construction, n = 7) with a PERMUTATION null for scale:');
{
  const lin = ['S9A', 'S10A', 'S11A', 'S15A', 'S21B', 'S22B', 'S24i2'].filter((t) => R[t]);
  if (lin.length === 7) {
    const blind = lin.map((t) => S[t].driver.overBar / S[t].nTri);
    const hon = lin.map((t) => S[t].fail / R[t].length);
    const ori = lin.map((t) => S[t].o2OverAreaFrac);
    const rBH = spearmanArmLevel(blind, hon), rBO = spearmanArmLevel(blind, ori), rHO = spearmanArmLevel(hon, ori);
    log(`   rho(blind, honest position) = ${rBH.toFixed(4)}   rho(blind, orient area) = ${rBO.toFixed(4)}   rho(honest, orient area) = ${rHO.toFixed(4)}`);
    // exact permutation distribution of |rho| for n=7: 5040 permutations
    const perm = [];
    const idx = [0, 1, 2, 3, 4, 5, 6];
    const permute = (arr, l) => {
      if (l === arr.length) { perm.push(arr.slice()); return; }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; permute(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    permute(idx, 0);
    const base = ranks(hon);
    let ge = 0;
    for (const pmt of perm) { const y = pmt.map((j) => base[j]); if (Math.abs(pearson(ranks(ori), y)) >= Math.abs(rHO)) ge++; }
    log(`   two-sided permutation p for rho(honest, orient area) = ${(ge / perm.length).toFixed(4)}  (5040 exact permutations)`);
    const srt = [];
    for (const pmt of perm) { const y = pmt.map((j) => base[j]); srt.push(pearson(ranks(ori), y)); }
    srt.sort((a, b) => a - b);
    log(`   the n=7 null distribution of rho spans [${srt[Math.round(0.025 * 5039)].toFixed(3)}, ${srt[Math.round(0.975 * 5039)].toFixed(3)}] at 95%  <= ANY rho inside this band is indistinguishable from zero`);
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// H-R2b — THE RANKING-KEY CEILING.  A key's whole value is the CONCENTRATION of what it ranks.
// Lorenz curve of over-bar ORIENTATION AREA under a PERFECT (oracle) key.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── H-R2b  RANKING-KEY CEILING: what an ORACLE key can reach at a given budget ───────────────────');
log('For each arm: facets sorted by the TRUE defect, descending. "top q% of facets hold X% of the defect."');
log('Defect A = over-bar AREA (S87 headline).  Defect B = area x max(0, o2 - 10um)  [mm^2.um, the excess].');
for (const t of ['S24i2', 'C2S39CTL', 'S28i1']) {
  if (!R[t]) continue;
  const rows = R[t]; const n = rows.length;
  const areaAll = rows.reduce((a, r) => a + r.area, 0);
  const dA = rows.map((r) => (r.o2 > BAR ? r.area : 0));
  const dB = rows.map((r) => r.area * Math.max(0, r.o2 - BAR));
  const overCount = rows.filter((r) => r.o2 > BAR).length;
  for (const [nm, d] of [['A over-bar AREA', dA], ['B excess area*um', dB]]) {
    const s = d.slice().sort((a, b) => b - a); const tot = s.reduce((a, x) => a + x, 0);
    const cum = (q) => { const k = Math.max(1, Math.round(q * n)); return s.slice(0, k).reduce((a, x) => a + x, 0) / tot; };
    log(`${t.padEnd(9)} ${nm.padEnd(18)} over-bar facets ${(100 * overCount / n).toFixed(2)}% of mesh · over-bar area ${(100 * dA.reduce((a, x) => a + x, 0) / areaAll).toFixed(2)}%`);
    log(`          top 0.1% -> ${(cum(0.001) * 100).toFixed(2)}%   top 1% -> ${(cum(0.01) * 100).toFixed(2)}%   top 5% -> ${(cum(0.05) * 100).toFixed(2)}%   top 10% -> ${(cum(0.10) * 100).toFixed(2)}%   top 25% -> ${(cum(0.25) * 100).toFixed(2)}%   top 50% -> ${(cum(0.50) * 100).toFixed(2)}%`);
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// H-R2c — GUARD'S UNMEASURED NUMBER: SELECTOR RECALL vs FRACTION-TESTED.
// Target = honest position PROVEN-FAIL. Selectors = the blind plane ruler p, and the orientation chord o0
// (GUARD's `tangExc` family). Cost model is GUARD's own: 5 + 375*f evals/facet against a blind 375.
// ALSO the reverse: can a POSITION key find ORIENTATION failures?  That is R2's premise, at facet level.
// ────────────────────────────────────────────────────────────────────────────────────────────────────
function recallCurve(rows, keyFn, hitFn) {
  const idx = rows.map((r, i) => i).sort((a, b) => keyFn(rows[b]) - keyFn(rows[a]));
  const nHit = rows.filter(hitFn).length;
  const n = rows.length;
  const marks = [0.001, 0.005, 0.01, 0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 0.75, 1.0];
  const res = []; let seen = 0, mi = 0;
  for (let q = 0; q < n; q++) {
    if (hitFn(rows[idx[q]])) seen++;
    while (mi < marks.length && (q + 1) / n >= marks[mi]) { res.push([marks[mi], seen / Math.max(1, nHit)]); mi++; }
  }
  // fraction tested needed for recall thresholds
  let s2 = 0; const need = {};
  for (const R0 of [0.5, 0.9, 0.95, 0.99, 1.0]) need[R0] = 1.0;
  s2 = 0;
  for (let q = 0; q < n; q++) {
    if (hitFn(rows[idx[q]])) s2++;
    for (const R0 of [0.5, 0.9, 0.95, 0.99, 1.0]) if (need[R0] === 1.0 && s2 / Math.max(1, nHit) >= R0) need[R0] = (q + 1) / n;
  }
  return { nHit, base: nHit / n, res, need };
}
log('\n── H-R2c  SELECTOR RECALL vs FRACTION-TESTED  (GUARD S61 §13c: "recall, not selectivity, decides") ──');
for (const t of ['S24i2', 'C2S39CTL', 'S9A']) {
  if (!R[t]) continue;
  const rows = R[t];
  log(`\n  ${t}  n=${rows.length}`);
  for (const [nm, key, hit, hn] of [
    ['plane ruler p  -> honest POSITION fail', (r) => r.p, (r) => r.v === 1, 'position'],
    ['orient o0      -> honest POSITION fail', (r) => r.o0, (r) => r.v === 1, 'position'],
    ['orient o2      -> honest POSITION fail', (r) => r.o2, (r) => r.v === 1, 'position'],
    ['plane ruler p  -> ORIENTATION over-bar', (r) => r.p, (r) => r.o2 > BAR, 'orientation'],
    ['honest w       -> ORIENTATION over-bar', (r) => r.w, (r) => r.o2 > BAR, 'orientation'],
  ]) {
    const c = recallCurve(rows, key, hit);
    const f90 = c.need[0.9], f99 = c.need[0.99], f100 = c.need[1.0];
    const cost = (f) => 5 + 375 * f;
    log(`    ${nm}   base rate ${(c.base * 100).toFixed(3)}%  (${c.nHit} hits)`);
    log(`        recall@top1% ${(c.res.find((x) => x[0] === 0.01)[1] * 100).toFixed(1)}%   @5% ${(c.res.find((x) => x[0] === 0.05)[1] * 100).toFixed(1)}%   @10% ${(c.res.find((x) => x[0] === 0.10)[1] * 100).toFixed(1)}%   @50% ${(c.res.find((x) => x[0] === 0.50)[1] * 100).toFixed(1)}%`);
    log(`        f needed for recall 0.90 = ${(f90 * 100).toFixed(2)}%  (${cost(f90).toFixed(0)} evals/facet vs blind 375 = ${(375 / cost(f90)).toFixed(2)}x)`
      + `   |  0.99 = ${(f99 * 100).toFixed(2)}% (${(375 / cost(f99)).toFixed(2)}x)   |  1.00 = ${(f100 * 100).toFixed(2)}% (${(375 / cost(f100)).toFixed(2)}x)`);
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// R2 SUPPLEMENT — the 2x2: do the two defect classes even co-locate on facets?
// ────────────────────────────────────────────────────────────────────────────────────────────────────
log('\n── R2 SUPPLEMENT  THE 2x2 ON THE SAME FACETS: position-fail x orientation-over-bar ──────────────');
log('tag        posFail&oriOver   posFail&oriOK   posOK&oriOver   posOK&oriOK    lift(=P(ori|posfail)/P(ori))');
for (const t of ['S24i2', 'S28i1', 'C2S39CTL', 'S9A', 'S10A']) {
  if (!R[t]) continue;
  const rows = R[t];
  let a = 0, b = 0, c = 0, d = 0;
  for (const r of rows) { const pf = r.v === 1, oo = r.o2 > BAR; if (pf && oo) a++; else if (pf) b++; else if (oo) c++; else d++; }
  const pOri = (a + c) / rows.length, pOriGivenFail = a / Math.max(1, a + b);
  log(`${t.padEnd(9)} ${String(a).padStart(9)}     ${String(b).padStart(9)}      ${String(c).padStart(9)}     ${String(d).padStart(9)}    ${(pOriGivenFail / pOri).toFixed(3)}`);
}

fs.writeFileSync(path.join(__dirname, '..', 'exchange', '_strataConformBisect', 's88ReviewProbe.report.txt'), out.join('\n') + '\n');
log('\nreport written to research/exchange/_strataConformBisect/s88ReviewProbe.report.txt');
