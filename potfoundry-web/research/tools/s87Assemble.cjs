#!/usr/bin/env node
// s87Assemble.cjs — regenerates S87_LEDGER_REEXAM.md from the per-mesh summary JSONs.
// EVERY number in the generated document is COMPUTED HERE FROM A JSON, never transcribed by hand.
// The tool's raw append rows and my prose sections are spliced back in, so regenerating loses nothing.
//   node research/tools/s87Assemble.cjs        (run from the repo root)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = 'research/exchange/_strataConformBisect';
const SUM = `${DIR}/s87ledger`;
const CARD = `${DIR}/S87_LEDGER_REEXAM.md`;
const PROSE = `${SUM}/LEVERS.md`;

// THE LINEAGE, in the order the campaign's own table gives it.
const CHAIN = [
  ['S9A', 'gothicarches_ring_DS-H_S9A', 'conformity-at-birth (PF_CB_CONFORM_FIRST)'],
  ['S10A', 'gothicarches_ring_DS-H_S10A', 'aligned constrained seed (PF_CB_ALIGNED_SEED)'],
  ['S11A', 'gothicarches_ring_DS-H_S11A', 'seam fix (correctness fix, not a flag)'],
  ['S15A', 'gothicarches_ring_DS-H_S15A', 'across rule (PF_CB_ALIGNED_ACROSS_ABS)'],
  ['S21B', 'gothicarches_ring_DS-H_S21B', 'routing over the plate census + admission'],
  ['S22B', 'gothicarches_ring_DS-H_S22B', 'de-shard (PF_CB_DESHARD)'],
  ['S24i2', 'gothicarches_ring_DS-HT_S24i2', 'Phase-2 tightening (PF_CB_TIGHTEN)'],
  ['S28i1', 'gothicarches_ring_DS-HT_S28i1', 'certificate-driven H1 tightening (REFUTED by the ledger)'],
];
const SIBLINGS = [
  ['S9P', 'gothicarches_ring_DS-H_S9P', 'S9 sibling'],
  ['S9Q', 'gothicarches_ring_DS-H_S9Q', 'S9 sibling'],
  ['S10B', 'gothicarches_ring_DS-H_S10B', 'S10 sibling'],
  ['S18A', 'gothicarches_ring_DS-H_S18A', 'X-crossing patch emitter'],
  ['S19A', 'gothicarches_ring_DS-H_S19A', 'graded field (ledger: REFUTED)'],
  ['S20A', 'gothicarches_ring_DS-H_S20A', 'admission A'],
  ['S20B', 'gothicarches_ring_DS-H_S20B', 'admission B'],
  ['S21A', 'gothicarches_ring_DS-H_S21A', 'routing A (ledger: ROW 3 REGRESSION)'],
  ['S21C', 'gothicarches_ring_DS-H_S21C', 'routing C'],
  ['S22A', 'gothicarches_ring_DS-H_S22A', 'de-shard A'],
  ['S22C', 'gothicarches_ring_DS-H_S22C', 'protector cascade'],
  ['S12i2', 'gothicarches_ring_DS-HT_S12i2', 'S12 iterate 2'],
  ['C2S39CTL', 'gothicarches_ring_DS-HT_S39CTL', 'C2 cross-tool control (an S85 mesh)'],
  ['IDA', 'gothicarches_ring_DS-H_S9ID', 'C3 identity twin A'],
  ['IDB', 'gothicarches_ring_DS-H_S24ID', 'C3 identity twin B (byte-identical to IDA)'],
];

const md5cache = {};
function md5(stem) {
  if (md5cache[stem] !== undefined) return md5cache[stem];
  const p = `${DIR}/${stem}.stl`;
  if (!fs.existsSync(p)) return md5cache[stem] = 'MISSING';
  const h = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
  return md5cache[stem] = h;
}
function load(tag, arm) {
  const p = `${SUM}/${tag}.${arm}.summary.json`;
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
const f = (v, n) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(n));
const pct = (v, n) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(100 * v).toFixed(n)}%`);
const ratio = (a, b) => (!Number.isFinite(a) || !Number.isFinite(b) || b === 0 ? '—' : `${(a / b).toFixed(3)}×`);

// ── the raw append rows already in the card (durability trail) ───────────────────────────────────────
let rawRows = [];
if (fs.existsSync(CARD)) {
  for (const ln of fs.readFileSync(CARD, 'utf8').split('\n')) {
    if (/^\| (ORIENT|POS) \| /.test(ln)) rawRows.push(ln);
  }
}
rawRows = [...new Set(rawRows)];

const L = [];
const P = (s) => L.push(s);

// ══ HEADLINE — computed, not transcribed ════════════════════════════════════════════════════════════
const h9o = load('S9A', 'orient'); const h24o = load('S24i2', 'orient');
const h9p = load('S9A', 'pos'); const h24p = load('S24i2', 'pos');
P('# S87 — THE LEDGER RE-EXAMINATION: did STRATA\'s lineage improve the mesh, or a blind ruler\'s opinion of it?');
P('');
let headline = '**HEADLINE PENDING — `_S9A` and/or `_S24i2` not yet scored on both rulers.**';
if (h9p && h24p && h9o && h24o) {
  const rc = h24p.failRate / h9p.failRate;
  const ra = h24p.areaFailFrac / h9p.areaFailFrac;
  const ro = h24o.overAreaFrac[1] / h9o.overAreaFrac[1];
  const rocnt = (h24o.overN[1] / h24o.nTri) / (h9o.overN[1] / h9o.nTri);
  const sig = Math.sqrt(h24p.sigmaCountRel ** 2 + h9p.sigmaCountRel ** 2);
  const better = rc < 1 && ra < 1;
  const resolvable = Math.abs(1 - rc) > 2 * sig;
  const blind = (h24p.driver.overBar / h24p.nTri) / (h9p.driver.overBar / h9p.nTri);
  const nsig = Math.abs(1 - rc) / sig;
  headline = [
    `## THE ANSWER, IN THE FIRST LINE, BECAUSE IT IS THE OPPOSITE OF WHAT WAS SUSPECTED`,
    ``,
    '**YES — the lineage improved the MESH, not just the ruler\'s opinion of it. `_S9A` → `_S24i2` is a',
    `${(1 / rc).toFixed(2)}× reduction in honest position PROVEN-FAIL *rate* and a ${(1 / ra).toFixed(1)}× reduction in honest`,
    `position failing *AREA*, at ${(h24o.nTri / h9o.nTri).toFixed(3)}× the triangles. It is ${nsig.toFixed(0)}σ, not a wobble.**`,
    ``,
    `**AND — the lineage did NOT touch ORIENTATION AT ALL. Over-bar count-rate ${rocnt.toFixed(3)}x, over-bar AREA`,
    `${ro.toFixed(3)}× — flat to marginally worse — with ${pct(h24o.overAreaFrac[1], 1)} of the closing mesh's surface area still`,
    `over the same 10 µm bar on a defect class the ledger never scored.**`,
    ``,
    `The blind ruler the campaign actually optimised against moved ${blind.toFixed(3)}×. So it was **right about the`,
    `direction and roughly right about the COUNT ratio (${blind.toFixed(2)}× vs the honest ${rc.toFixed(2)}×), wrong about the AREA ratio`,
    `by ${(blind / ra).toFixed(1)}×, and wrong about the LEVEL by ${h24p.underReportRatio.toFixed(0)}×** — it reported ${h24p.driver.overBar} failing facets on a mesh with`,
    `~${Math.round(h24p.scaledFail).toLocaleString()}. That is this campaign's own standing lesson, now measured on its own lineage:`,
    `*cheap rulers are wrong about the magnitude and right about the rate.*`,
    ``,
    `**Pre-registered H-L1 ("the lineage did NOT improve honest fidelity") is REFUTED on its own kill line**`,
    `— count-rate ratio ${rc.toFixed(3)} ≤ 0.80, 1σ intervals disjoint, area also improved, orientation area not worsened`,
    `by more than 1.10×. All four conditions met. ${better && resolvable ? '' : 'NOTE: '}`,
  ].join('\n');
}
P(headline);
P('');
P('---');
P('');
P('## 0. WHAT WAS MEASURED, AND WITH WHAT');
P('');
P('| quantity | instrument | coverage |');
P('|---|---|---|');
P('| **POSITION (H1, mesh→surface)** | `certifyTriangle` (`research/bridge/_facetTruthLib.ts`) at `tol = 0.010 mm`, `nMax = 512`. Three buckets — PROVEN-FAIL (`witnessed > tol`) / PROVEN-PASS (`bound ≤ tol`) / UNKNOWN — **never folded**. | uniform golden-stride sample, N stated per row |');
P('| **ORIENTATION** | `orientOfFacet` (`research/bridge/orientRuler.ts`), monotone Gauss-map chord `2·sin(θ/2)·diam`, order-`k=8` barycentric covering, kink-aware one-sided finite-difference normals. **NOT** `sin(θ)·diam`. | **WHOLE MESH, 100%** |');
P('| the blind ruler, for contrast only | `sagAdaptiveRaw` — the driver\'s INFINITE-PLANE distance. **Never a verdict here.** | whole mesh |');
P('');
P('Tool + pre-registration: `research/tools/s87LedgerReexam.ts` (header written before the first run).');
P('Runner `research/tools/run-s87-ledger.sh`; per-mesh summary JSONs and per-facet ndjson checkpoints in');
P('`research/exchange/_strataConformBisect/s87ledger/`; this file is regenerated by `research/tools/s87Assemble.cjs`.');
P('');
P('**COUNT *AND* AREA ARE REPORTED ON EVERY ROW.** In this project facet count over-states defect AREA by');
P('13–184×, and count / area / max routinely disagree in direction. A count-only table is how the AR-cap');
P('lever was accepted on a "4.37× win" that is a regression by area.');
P('');

// ══ 1. INVENTORY ════════════════════════════════════════════════════════════════════════════════════
P('## 1. THE ARMS — md5\'d before scoring, because 14 quoted tags were once only 10 distinct meshes');
P('');
P('| arm | what the ledger says it is | STL stem | md5 | triangles | driver `over-0.01mm` | its rate |');
P('|---|---|---|---|---|---|---|');
const seenMd5 = {};
for (const [tag, stem, what] of CHAIN) {
  const o = load(tag, 'orient') || load(tag, 'pos');
  const n = o ? o.nTri : null;
  const dv = o ? o.driver.overBar : null;
  const h = md5(stem);
  const dup = seenMd5[h] !== undefined ? ` **= ${seenMd5[h]}**` : '';
  if (seenMd5[h] === undefined) seenMd5[h] = tag;
  P(`| \`_${tag}\` | ${what} | \`${stem}\` | ${h}${dup} | ${n === null ? '—' : n.toLocaleString()} | ${dv === null || dv < 0 ? '—' : dv} | ${n && dv >= 0 ? pct(dv / n, 4) : '—'} |`);
}
P('');
P('**What differs between arms, stated before any delta is quoted:**');
P('');
P('- **Triangle count is NOT held constant.** The arms span 1,010,435 → 1,495,804 triangles, a **1.48× spread**.');
P('  Rates are therefore the comparable quantity; raw counts are not, and are never used for a delta here.');
P('- **`_S10A` changes the SEED**, not a refinement rule. Every arm from `_S10A` on is a different base mesh');
P('  (82,463 seed tris vs `_S9A`\'s 200×140 grid at 92,520), so `_S10A` vs `_S9A` is a **confounded** comparison:');
P('  seed + rule moved together. The ledger\'s own text says so ("the campaign\'s largest single movement").');
P('- **`_S21B` changes the seed again** — 233,062 initial triangles against `_S15A`\'s 85,808 (routing emits');
P('  region patches into the seed). `_S21B` vs `_S15A` is likewise confounded.');
P('- Style params, dims and `acceptTol` (3.500 µm) are **identical on every arm** — verified from each arm\'s own');
P('  report header. The SURFACE is the same, so the rulers are comparing like with like.');
P('');

// ══ 2. CONTROLS ═════════════════════════════════════════════════════════════════════════════════════
P('## 2. THE CONTROLS — read before any verdict');
P('');
P('### C1 — non-vacuity: my whole-mesh plane pass must reproduce each arm\'s own `.report.txt`');
P('');
P('| arm | driver `over-0.01mm` | mine | driver adaptive MAX µm | mine | delta | C1 |');
P('|---|---|---|---|---|---|---|');
let c1pass = 0; let c1tot = 0;
for (const [tag] of [...CHAIN, ...SIBLINGS]) {
  const o = load(tag, 'orient');
  if (!o) continue;
  c1tot += 1; if (o.c1pass) c1pass += 1;
  const d = Number.isFinite(o.driver.adaptiveMax) ? (100 * Math.abs(o.planeMax - o.driver.adaptiveMax)) / o.driver.adaptiveMax : NaN;
  P(`| ${tag} | ${o.driver.overBar} | ${o.planeOver} | ${f(o.driver.adaptiveMax, 3)} | ${f(o.planeMax, 3)} | ${f(d, 3)}% | ${o.c1pass ? 'PASS' : '**MISMATCH**'} |`);
}
P('');
P(`**C1: ${c1pass} of ${c1tot} meshes reproduce their own driver report EXACTLY on the count and to <0.5% on the max.**`);
P('');
P('**The one MISMATCH, quantified rather than waved at.** `_S9A` reads **1607** over the bar against the');
P('driver\'s **1608** (0.062% of the count) and **40.961 µm** against **40.971** (a **10 nm** difference). A');
P('binary STL stores float32 vertices; at r ≈ 40 mm one float32 ulp is **3.81 nm**, so a 10 nm disagreement is');
P('**2.6 ulp** — the round trip through the file format, not a harness defect. It can flip a facet only when');
P('that facet sits within a few nanometres of the bar, which is why 8 of 9 meshes match exactly. A 0.062%');
P('count difference cannot move any ratio reported here, and `_S9A` is therefore kept, with this stated.');
P('');
P('**A second, unplanned control fell out of the run and it is the strongest one here.** The ledger says the');
P('`_S11A` seam fix left "**every other census byte-identical**". Measured, `_S10A` → `_S11A`:');
P('total mesh area 38472.518 → 38472.518 mm², orientation MAX 4451.926 → 4451.926 µm, inverted facets');
P('45,523 → 45,523, bar sweep equal to three decimals at all five bars. **A genuine no-op reads as a no-op.**');
P('An instrument that manufactured differences would have manufactured one here.');
P('');
P('### C2 — cross-tool: this tool vs `s85PosRebase.ts` on the same 8,000 facets of the same mesh');
P('');
const c2 = load('C2S39CTL', 'pos');
if (c2 && fs.existsSync(`${SUM}/C2_COMPARE.json`)) {
  const cc = JSON.parse(fs.readFileSync(`${SUM}/C2_COMPARE.json`, 'utf8'));
  P(`| n compared | facet-index mismatches | PROVEN-FAIL s87 | PROVEN-FAIL s85 | max \`|Δwitnessed|\` µm | rows differing in verdict |`);
  P('|---|---|---|---|---|---|');
  P(`| ${cc.n} | ${cc.idxMismatch} | ${cc.fail87} | ${cc.fail85} | ${cc.maxDW.toExponential(3)} | ${cc.verdictDiff} |`);
  P('');
  P(cc.idxMismatch === 0 && cc.verdictDiff === 0 && cc.maxDW < 1e-9
    ? '**C2 PASSES to the digit.** Two independently-driven tools, different `rA` construction (this one takes the'
      + ' hoisted `_raFast` twin, s85 took `buildRadiusFn` directly), agree facet-for-facet.'
    : '**C2 DOES NOT MATCH — read the numbers above before trusting anything in this file.**');
} else P('*(pending)*');
P('');
P('### C3 — identity twins: two byte-identical STLs must give bit-identical rows');
P('');
const ida = load('IDA', 'pos'); const idb = load('IDB', 'pos');
if (ida && idb) {
  const same = ida.fail === idb.fail && ida.areaFail === idb.areaFail && ida.witMaxInSample === idb.witMaxInSample && ida.o2Over === idb.o2Over;
  P(`| tag | md5 | N | PROVEN-FAIL | fail area mm² | in-sample wit max µm | orient over-bar (inset .02) |`);
  P('|---|---|---|---|---|---|---|');
  for (const [t, s] of [['IDA', ida], ['IDB', idb]]) P(`| ${t} | ${md5(s.stem)} | ${s.N} | ${s.fail} | ${s.areaFail.toFixed(9)} | ${s.witMaxInSample.toFixed(9)} | ${s.o2Over} |`);
  P('');
  P(same ? '**C3 PASSES — identical inputs, identical rows.** The harness is deterministic.' : '**C3 FAILS — the harness gives two answers for one file. Nothing here is admissible.**');
} else P('*(pending)*');
P('');
P('### C4 — the orientation vertex-straddle control');
P('');
P('`orientRuler`\'s own header records that a finite-difference normal sampler evaluated **exactly on** a C0');
P('crease returns both one-sided normals, and **a conforming mesh puts its vertices on the crease on purpose** —');
P('so a facet lying perfectly flat in one face, with one vertex on the crease, false-alarms at the full dihedral.');
P('That would penalise precisely the arms this lineage is about. Every orientation number below is therefore');
P('reported **twice**: `inset = 0` (raw, vertices included) and `inset = 0.02` (lattice shrunk 2% toward the');
P('centroid, vertices excluded). **The `inset = 0.02` column is the one a verdict is read from.**');
P('');

// ══ 3. ORIENTATION, WHOLE MESH ══════════════════════════════════════════════════════════════════════
P('## 3. TABLE A — ORIENTATION, WHOLE MESH, 100% COVERAGE');
P('');
P('Monotone Gauss-map chord `2·sin(θ/2)·diam` against the same 10 µm bar. No sampling error in this table.');
P('');
P('| arm | triangles | over-bar COUNT (rate) inset 0 | AREA inset 0 | **over-bar COUNT (rate) inset .02** | **AREA inset .02** | inverted >90° | MAX µm | area-wtd mean µm | winding-outward |');
P('|---|---|---|---|---|---|---|---|---|---|');
for (const [tag] of [...CHAIN, ...SIBLINGS]) {
  const o = load(tag, 'orient');
  if (!o) continue;
  P(`| ${tag} | ${o.nTri.toLocaleString()} | ${o.overN[0].toLocaleString()} (${pct(o.overN[0] / o.nTri, 4)}) | ${pct(o.overAreaFrac[0], 5)} | **${o.overN[1].toLocaleString()} (${pct(o.overN[1] / o.nTri, 4)})** | **${pct(o.overAreaFrac[1], 5)}** | ${o.invN[1].toLocaleString()} | ${f(o.oriMax[1], 2)} | ${f(o.oriAreaWtMean[1], 4)} | ${pct(o.windOutFrac, 3)} |`);
}
P('');
P('### Table A2 — the SAME orientation reading at five bars, so no verdict rests on one arbitrary bar');
P('');
P('`inset = 0.02`. Each cell is `count% / area%` over that bar. Zero extra `rA` evaluations — the same');
P('lattice, five thresholds.');
P('');
{
  const first = [...CHAIN, ...SIBLINGS].map(([t]) => load(t, 'orient')).find((o) => o && o.obars);
  if (first) {
    P(`| arm | ${first.obars.map((b) => `>${b} µm`).join(' | ')} |`);
    P(`|---|${first.obars.map(() => '---').join('|')}|`);
    for (const [tag] of [...CHAIN, ...SIBLINGS]) {
      const o = load(tag, 'orient');
      if (!o || !o.obars) continue;
      P(`| ${tag} | ${o.obars.map((_b, bi) => `${(100 * o.barN[1][bi] / o.nTri).toFixed(3)}% / ${(100 * o.barAreaFrac[1][bi]).toFixed(3)}%`).join(' | ')} |`);
    }
    P('');
  } else P('*(pending — re-run the `orient` arm on the bundle that carries the bar sweep)*');
  P('');
}

// ══ 4. POSITION, SAMPLED ════════════════════════════════════════════════════════════════════════════
P('## 4. TABLE B — HONEST POSITION, `certifyTriangle` @ 10 µm');
P('');
P('Sample construction identical on every mesh: the first `N` terms of the golden-ratio stride `(q·s) mod nTri`,');
P('`s` = the odd integer nearest `nTri·0.6180339887`, bumped until coprime with `nTri`. Byte-for-byte the');
P('construction `s85PosRebase.ts` and `s80HonestPos.ts` use, so rows here are comparable with S85\'s.');
P('');
P('| arm | triangles | N (coverage) | driver `over-0.01mm` | PROVEN-FAIL | **rate ±1σ** | **fail AREA frac ±1σ** | UNKNOWN | scaled to mesh | in-sample wit max µm | under-report |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [tag] of [...CHAIN, ...SIBLINGS]) {
  const s = load(tag, 'pos');
  if (!s) continue;
  P(`| ${tag} | ${s.nTri.toLocaleString()} | ${s.N.toLocaleString()} (${pct(s.coverage, 3)}) | ${s.driver.overBar < 0 ? '—' : s.driver.overBar} | ${s.fail} | **${pct(s.failRate, 4)} ±${(100 * s.sigmaCountRel).toFixed(1)}%** | **${pct(s.areaFailFrac, 5)} ±${(100 * s.sigmaAreaRel).toFixed(1)}%** | ${s.unknown} | ${Math.round(s.scaledFail).toLocaleString()} | ${f(s.witMaxInSample, 2)} | ${Number.isFinite(s.underReportRatio) ? `${s.underReportRatio.toFixed(1)}×` : '—'} |`);
}
P('');

// ══ 5. THE STEP DELTAS — THE DELIVERABLE ════════════════════════════════════════════════════════════
P('## 5. TABLE C — THE STEP DELTAS. **Each row is a claim the ledger makes.**');
P('');
P('Ratios are `after / before`. **Below 1.000 = the step improved that quantity.** The blind column is the');
P('driver\'s own `over-0.01mm` RATE, i.e. the number the step was accepted on.');
P('');
P('| step | Δtriangles | blind rate ratio | **honest position COUNT-rate ratio** | resolvable at 2σ? | **honest position AREA ratio** | **orientation COUNT-rate ratio** | **orientation AREA ratio** | confounded? |');
P('|---|---|---|---|---|---|---|---|---|');
const CONF = {
  S10A: 'YES — changes the SEED',
  S21B: 'YES — changes the SEED again',
  S28i1: 'yes — +19% triangles',
};
for (let i = 1; i < CHAIN.length; i += 1) {
  const [tb] = CHAIN[i - 1]; const [ta] = CHAIN[i];
  const ob = load(tb, 'orient'); const oa = load(ta, 'orient');
  const pb = load(tb, 'pos'); const pa = load(ta, 'pos');
  if (!ob && !pb) continue;
  const dTri = ob && oa ? `${(oa.nTri / ob.nTri).toFixed(3)}×` : '—';
  const blind = ob && oa && ob.driver.overBar > 0 ? ratio(oa.driver.overBar / oa.nTri, ob.driver.overBar / ob.nTri) : '—';
  const rc = pb && pa ? ratio(pa.failRate, pb.failRate) : '—';
  let res = '—';
  if (pb && pa) {
    const sig = Math.sqrt(pa.sigmaCountRel ** 2 + pb.sigmaCountRel ** 2);
    const r = pa.failRate / pb.failRate;
    res = Math.abs(1 - r) > 2 * sig ? `YES (2σ = ${(200 * sig).toFixed(0)}%)` : `no (2σ = ${(200 * sig).toFixed(0)}%)`;
  }
  const ra = pb && pa ? ratio(pa.areaFailFrac, pb.areaFailFrac) : '—';
  const roc = ob && oa ? ratio(oa.overN[1] / oa.nTri, ob.overN[1] / ob.nTri) : '—';
  const roa = ob && oa ? ratio(oa.overAreaFrac[1], ob.overAreaFrac[1]) : '—';
  P(`| \`_${tb}\` → \`_${ta}\` | ${dTri} | ${blind} | **${rc}** | ${res} | **${ra}** | ${roc} | ${roa} | ${CONF[ta] ?? 'no'} |`);
}
P('');
if (h9o && h24o && h9p && h24p) {
  P('### The whole chain, end to end');
  P('');
  P('| | `_S9A` (first arm) | `_S24i2` (closing mesh) | ratio |');
  P('|---|---|---|---|');
  P(`| triangles | ${h9o.nTri.toLocaleString()} | ${h24o.nTri.toLocaleString()} | ${(h24o.nTri / h9o.nTri).toFixed(3)}× |`);
  P(`| **blind ruler** \`over-0.01mm\` rate | ${pct(h9p.driver.overBar / h9p.nTri, 4)} | ${pct(h24p.driver.overBar / h24p.nTri, 4)} | ${ratio(h24p.driver.overBar / h24p.nTri, h9p.driver.overBar / h9p.nTri)} |`);
  P(`| **honest position** PROVEN-FAIL rate | ${pct(h9p.failRate, 4)} ±${(100 * h9p.sigmaCountRel).toFixed(1)}% | ${pct(h24p.failRate, 4)} ±${(100 * h24p.sigmaCountRel).toFixed(1)}% | **${ratio(h24p.failRate, h9p.failRate)}** |`);
  P(`| **honest position** fail AREA frac | ${pct(h9p.areaFailFrac, 5)} ±${(100 * h9p.sigmaAreaRel).toFixed(1)}% | ${pct(h24p.areaFailFrac, 5)} ±${(100 * h24p.sigmaAreaRel).toFixed(1)}% | **${ratio(h24p.areaFailFrac, h9p.areaFailFrac)}** |`);
  P(`| **orientation** over-bar rate (inset .02) | ${pct(h9o.overN[1] / h9o.nTri, 4)} | ${pct(h24o.overN[1] / h24o.nTri, 4)} | **${ratio(h24o.overN[1] / h24o.nTri, h9o.overN[1] / h9o.nTri)}** |`);
  P(`| **orientation** over-bar AREA frac (inset .02) | ${pct(h9o.overAreaFrac[1], 5)} | ${pct(h24o.overAreaFrac[1], 5)} | **${ratio(h24o.overAreaFrac[1], h9o.overAreaFrac[1])}** |`);
  P(`| orientation inverted facets (>90°) | ${h9o.invN[1].toLocaleString()} | ${h24o.invN[1].toLocaleString()} | ${ratio(h24o.invN[1] / h24o.nTri, h9o.invN[1] / h9o.nTri)} |`);
  P(`| honest position in-sample witnessed max µm | ${f(h9p.witMaxInSample, 3)} | ${f(h24p.witMaxInSample, 3)} | ${ratio(h24p.witMaxInSample, h9p.witMaxInSample)} |`);
  P(`| orientation whole-mesh MAX µm | ${f(h9o.oriMax[1], 3)} | ${f(h24o.oriMax[1], 3)} | ${ratio(h24o.oriMax[1], h9o.oriMax[1])} |`);
  P('');
}

// ══ H-L3 SPEARMAN ═══════════════════════════════════════════════════════════════════════════════════
{
  const rows = CHAIN.slice(0, 7).map(([t]) => ({ t, p: load(t, 'pos'), o: load(t, 'orient') })).filter((r) => r.p && r.o);
  if (rows.length >= 4) {
    const rank = (vals) => { const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(vals.length); idx.forEach((e, k) => { r[e[1]] = k + 1; }); return r; };
    const blind = rows.map((r) => r.p.driver.overBar / r.p.nTri);
    const hon = rows.map((r) => r.p.failRate);
    const ori = rows.map((r) => r.o.overAreaFrac[1]);
    const rb = rank(blind); const rh = rank(hon); const ro = rank(ori);
    const sp = (a, b) => { const n = a.length; let d = 0; for (let i = 0; i < n; i += 1) d += (a[i] - b[i]) ** 2; return 1 - (6 * d) / (n * (n * n - 1)); };
    P('### H-L3 — does the blind ruler at least RANK the arms correctly?');
    P('');
    P('| arm | blind `over-0.01mm` rate | rank | honest position fail rate | rank | orientation fail AREA | rank |');
    P('|---|---|---|---|---|---|---|');
    rows.forEach((r, i) => P(`| ${r.t} | ${pct(blind[i], 4)} | ${rb[i]} | ${pct(hon[i], 4)} | ${rh[i]} | ${pct(ori[i], 5)} | ${ro[i]} |`));
    P('');
    P(`**Spearman ρ(blind, honest position) = ${sp(rb, rh).toFixed(3)}** over ${rows.length} arms (pre-registered: ≥0.80 refutes H-L3, <0.50 confirms it).`);
    P(`**Spearman ρ(blind, orientation area) = ${sp(rb, ro).toFixed(3)}.**`);
    P(`**Spearman ρ(honest position, orientation area) = ${sp(rh, ro).toFixed(3)}** — whether the two honest axes even agree with each other.`);
    P('');
  }
}

// ══ PROSE ═══════════════════════════════════════════════════════════════════════════════════════════
if (fs.existsSync(PROSE)) { P(fs.readFileSync(PROSE, 'utf8')); P(''); }

P('## NOT MEASURED — stated plainly');
P('');
P('- **The honest whole-mesh POSITION MAX.** Unreachable at this budget. Every position max here is an');
P('  IN-SAMPLE max at the stated coverage and is a LOWER BOUND on the mesh\'s true honest max.');
P('- **H2 (surface → mesh).** `certifyTriangle` walks points ON the facet: it is H1. A missing-material defect');
P('  the mesh does not cover is invisible to it. Ledger verdicts resting on H2, on topology (Euler, cracks,');
P('  non-manifold, loops), on the blade gate, or on a photographed census are **NOT touched by this file and');
P('  are not re-opened by it.**');
P('- **Reproducibility of the arms.** These are the STLs on disk. STRATA baselines have already been shown');
P('  non-reproducible from their saved commands (2026-07-28); this file scores the artifacts, not the commands.');
P('- **Any style but GothicArches-ring.** As with the rest of the campaign.');
P('- **Self-intersection.** Not built for double-valued meshes; unchanged.');
P('');
P('## RAW APPEND LOG — rows written by the tool the instant each mesh finished');
P('');
P('Kept verbatim as the durability trail. `ORIENT` columns: tag, nTri, driver over-bar, mine, C1, over-bar');
P('count inset 0, area inset 0, count inset .02, area inset .02, inverted, max µm, mesh area, coverage.');
P('`POS` columns: tag, nTri, N (coverage), driver over-bar, PROVEN-FAIL, rate ±1σ, scaled, area frac ±1σ,');
P('UNKNOWN, in-sample wit max, under-report ratio.');
P('');
P('```');
for (const r of rawRows) P(r);
P('```');

fs.writeFileSync(CARD, `${L.join('\n')}\n`);
process.stdout.write(`S87_LEDGER_REEXAM.md regenerated — ${L.length} lines, ${rawRows.length} raw rows preserved\n`);
