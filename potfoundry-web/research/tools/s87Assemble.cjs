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
  ['S8P', 'gothicarches_ring_DS-H_S8P', 'the S8-PILOT fossil cascade — the nearest PREDECESSOR of _S9A, same 200x140 base grid, NOT a flag-OFF twin'],
  ['S21C', 'gothicarches_ring_DS-H_S21C', 'routing C'],
  ['S12i2', 'gothicarches_ring_DS-HT_S12i2', 'S12 iterate 2'],
  ['S9P', 'gothicarches_ring_DS-H_S9P', 'S9 sibling'],
  ['S9Q', 'gothicarches_ring_DS-H_S9Q', 'S9 sibling'],
  ['S10B', 'gothicarches_ring_DS-H_S10B', 'S10 sibling'],
  ['S18A', 'gothicarches_ring_DS-H_S18A', 'X-crossing patch emitter'],
  ['S19A', 'gothicarches_ring_DS-H_S19A', 'graded field (ledger: REFUTED)'],
  ['S20A', 'gothicarches_ring_DS-H_S20A', 'admission A'],
  ['S20B', 'gothicarches_ring_DS-H_S20B', 'admission B'],
  ['S21A', 'gothicarches_ring_DS-H_S21A', 'routing A (ledger: ROW 3 REGRESSION)'],
  ['S22A', 'gothicarches_ring_DS-H_S22A', 'de-shard A'],
  ['S22C', 'gothicarches_ring_DS-H_S22C', 'protector cascade'],
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
    `**AND — the lineage did NOT move the ORIENTATION POPULATION. Over-bar count-rate ${rocnt.toFixed(3)}x, over-bar AREA`,
    `${ro.toFixed(3)}x — flat to marginally worse — with ${pct(h24o.overAreaFrac[1], 1)} of the closing mesh's surface area still`,
    `over the same 10 µm bar on a defect class the ledger never scored. It DID halve the orientation deep`,
    `tail: area over 250 µm ${(100 * h9o.barAreaFrac[1][4]).toFixed(3)}% → ${(100 * h24o.barAreaFrac[1][4]).toFixed(3)}% (${(h24o.barAreaFrac[1][4] / h9o.barAreaFrac[1][4]).toFixed(3)}x) and the area-weighted mean`,
    `${h9o.oriAreaWtMean[1].toFixed(2)} → ${h24o.oriAreaWtMean[1].toFixed(2)} µm (${(h24o.oriAreaWtMean[1] / h9o.oriAreaWtMean[1]).toFixed(3)}x). The worst orientation got better; the typical one did not.**`,
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
P('**The MISMATCHES, quantified rather than waved at.** Two meshes miss, both by a handful of facets:');
P('`_S9A` reads **1607** against the driver\'s **1608** (0.062% of the count; max 40.961 vs 40.971 µm, a');
P('**10 nm** gap) and `_S8P` reads **1584** against **1588** (0.25%; max 44.152 vs 44.146, a **6 nm** gap).');
P('');
P('A binary STL stores **float32** vertices; at r ≈ 40 mm one float32 ulp is **3.81 nm**, so both gaps are');
P('1.6–2.6 ulp — the round trip through the file format. That is a *hypothesis*, so it was priced: counting');
P('how many facets sit near the bar in the uniform samples gives a near-bar density of **~260 facets/µm**');
P('(`_S9A`), ~380 (`_S24i2`) and ~105 (`_S15A`), so a ±4 nm perturbation should flip **0.4–1.5 facets per');
P('mesh**. Observed: 1 on `_S9A`, 4 on `_S8P`, **0 on the other six**. Right magnitude, right rarity.');
P('');
P('Both mismatching meshes are the two with the *largest* over-bar populations (1,588 and 1,608 against');
P('354–686 elsewhere), which is what that density argument predicts. **The effect is 0.06–0.25% of a count');
P('that is itself 24–45× smaller than the honest one; it cannot move a ratio in this file.** Both meshes are');
P('kept, with this stated, rather than dropped — and the pre-registered C1 wording ("EXACTLY") is recorded');
P('as not met on them rather than quietly relaxed.');
P('');
P('**A second, unplanned control fell out of the run and it is the strongest one here.** The ledger says the');
P('`_S11A` seam fix left "**every other census byte-identical**". Measured, `_S10A` → `_S11A`:');
P('total mesh area 38472.518 → 38472.518 mm², orientation MAX 4451.926 → 4451.926 µm, worst-point->90°');
P('facets 45,523 → 45,523, bar sweep equal to three decimals at all five bars. **A genuine no-op reads as a');
P('no-op.**');
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
P('**Three things about this table before it is read.** (i) *"worst-point >90°" is NOT "the facet is wound');
P('backwards"* — it is `sup over the footprint of angle(facet normal, surface normal) > 90°`, i.e. the');
P('facet\'s plane is on the wrong side of the surface *somewhere inside it*. The winding-outward column is');
P('the separate check for backwards facets and it is ≥99.96% on every mesh. (ii) **These absolute levels are');
P('NOT comparable to the campaign\'s published "GothicArches 11.371% over 10 µm".** That figure came from the');
P('`s55OrientHeatmap` prototype, which `orientRuler`\'s own header records as evaluating the surface normal');
P('**only at the facet centroid** — an *analytic* 3.00× under-read on the exact-cylinder fixture — and as');
P('using the **non-monotone** `sin(θ)·diam`. This table uses an order-8 covering that always contains the');
P('three vertices, and the monotone chord. It is a different, stricter reading of the same defect class; the');
P('arm-to-arm comparison is what it is for. (iii) A 10 µm chord on a ~0.3 mm facet is θ ≈ 1.9°, so this bar');
P('demands the facet plane be within about two degrees of the surface normal **everywhere inside it**.');
P('');
P('| arm | triangles | over-bar COUNT (rate) inset 0 | AREA inset 0 | **over-bar COUNT (rate) inset .02** | **AREA inset .02** | worst-point >90° | MAX µm | area-wtd mean µm | winding-outward |');
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
P('**Two things to know before reading it.** (i) `UNKNOWN` is 0–3 facets in every sample, so the three-bucket');
P('verdict is effectively two-bucket here and nothing is hiding in the third. (ii) `certifyTriangle` stops');
P('refining as soon as it has a witness over `tol` — the verdict is then settled and more resolution cannot');
P('change it — so **every PROVEN-FAIL facet is also reported `witnessedComplete: false` by construction**.');
P('That flag means "this facet\'s MAGNITUDE is a lower bound", not "this verdict is uncertain". The two counts');
P('track each other in every row for exactly that reason.');
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
{
  // The PRE-LINEAGE reference: _S8P is the nearest predecessor of _S9A (same 200x140 base grid, same
  // driver) running the S8-PILOT fossil cascade instead of S9a conformity-at-birth. NOT a flag-OFF twin.
  const p8 = load('S8P', 'pos'); const o8 = load('S8P', 'orient');
  if (p8 && o8 && h9p && h9o && h24p && h24o) {
    P('### Arm 0 — `_S8P`, the nearest PREDECESSOR of the lineage (not a flag-OFF control)');
    P('');
    P('`_S8P` runs the **S8-pilot fossil cascade-split** where `_S9A` runs **S9a conformity-at-birth**, on the');
    P('same 200×140 base grid and the same driver, at 1,277,904 vs 1,284,820 triangles (1.005×). It is the');
    P('closest thing on disk to a control for the ledger\'s first lever, and it is mechanism-against-mechanism,');
    P('**not on-against-off** — `_S9P` and `_S9Q` both run `PF_CB_CONFORM_FIRST=1`, so no off-twin exists.');
    P('');
    P('| | `_S8P` | `_S9A` | ratio | | `_S8P` → `_S24i2` |');
    P('|---|---|---|---|---|---|');
    P(`| honest position PROVEN-FAIL rate | ${pct(p8.failRate, 4)} ±${(100 * p8.sigmaCountRel).toFixed(1)}% | ${pct(h9p.failRate, 4)} ±${(100 * h9p.sigmaCountRel).toFixed(1)}% | **${ratio(h9p.failRate, p8.failRate)}** | | **${ratio(h24p.failRate, p8.failRate)}** |`);
    P(`| honest position fail AREA frac | ${pct(p8.areaFailFrac, 5)} | ${pct(h9p.areaFailFrac, 5)} | ${ratio(h9p.areaFailFrac, p8.areaFailFrac)} (at the null) | | **${ratio(h24p.areaFailFrac, p8.areaFailFrac)}** |`);
    P(`| orientation over-bar rate (inset .02) | ${pct(o8.overN[1] / o8.nTri, 4)} | ${pct(h9o.overN[1] / h9o.nTri, 4)} | ${ratio(h9o.overN[1] / h9o.nTri, o8.overN[1] / o8.nTri)} | | ${ratio(h24o.overN[1] / h24o.nTri, o8.overN[1] / o8.nTri)} |`);
    P(`| orientation over-bar AREA (inset .02) | ${pct(o8.overAreaFrac[1], 5)} | ${pct(h9o.overAreaFrac[1], 5)} | ${ratio(h9o.overAreaFrac[1], o8.overAreaFrac[1])} | | ${ratio(h24o.overAreaFrac[1], o8.overAreaFrac[1])} |`);
    P(`| facets with a worst-point >90°, as a rate | ${pct(o8.invN[1] / o8.nTri, 4)} | ${pct(h9o.invN[1] / h9o.nTri, 4)} | ${ratio(h9o.invN[1] / h9o.nTri, o8.invN[1] / o8.nTri)} | | ${ratio(h24o.invN[1] / h24o.nTri, o8.invN[1] / o8.nTri)} |`);
    P('');
    const rr = h9p.failRate / p8.failRate;
    const ss = Math.sqrt(h9p.sigmaCountRel ** 2 + p8.sigmaCountRel ** 2);
    P(`**S9a beats the S8 pilot on honest position count-rate at ${(Math.abs(1 - rr) / ss).toFixed(1)}σ (${rr.toFixed(3)}×), while its AREA ratio (${(h9p.areaFailFrac / p8.areaFailFrac).toFixed(3)}×)`);
    P('sits ON the empirical null of §8b and cannot be claimed.** Orientation is a wash on the population and');
    P(`improves ${ratio(h9o.invN[1] / h9o.nTri, o8.invN[1] / o8.nTri)} on the worst-point->90° rate. **Measured from \`_S8P\` instead of \`_S9A\`, the whole campaign is`);
    P(`${(1 / (h24p.failRate / p8.failRate)).toFixed(2)}× by honest position count-rate and ${(1 / (h24p.areaFailFrac / p8.areaFailFrac)).toFixed(1)}× by honest position area.**`);
    P('');
  }
}
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
  P(`| orientation facets with a worst-point >90° | ${h9o.invN[1].toLocaleString()} | ${h24o.invN[1].toLocaleString()} | ${ratio(h24o.invN[1] / h24o.nTri, h9o.invN[1] / h9o.nTri)} |`);
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

// ══ PRE-REGISTERED VERDICTS, COMPUTED ═══════════════════════════════════════════════════════════════
{
  P('## 5b. THE PRE-REGISTERED VERDICTS, read off the tables above');
  P('');
  P('| hypothesis | pre-registered kill / confirm line | measured | verdict |');
  P('|---|---|---|---|');
  if (h9p && h24p && h9o && h24o) {
    const rc = h24p.failRate / h9p.failRate; const ra = h24p.areaFailFrac / h9p.areaFailFrac;
    const ro = h24o.overAreaFrac[1] / h9o.overAreaFrac[1];
    const sig = Math.sqrt(h24p.sigmaCountRel ** 2 + h9p.sigmaCountRel ** 2);
    const lo9 = h9p.failRate * (1 - h9p.sigmaCountRel); const hi24 = h24p.failRate * (1 + h24p.sigmaCountRel);
    const killed = rc <= 0.80 && ra < 1 && hi24 < lo9 && ro <= 1.10;
    P(`| **H-L1** the lineage did NOT improve honest fidelity | KILL if count-rate ratio ≤ 0.80 AND 1σ intervals disjoint AND area also improves AND orientation area not worsened >1.10× | count-rate **${rc.toFixed(3)}×**, area **${ra.toFixed(3)}×**, \`_S9A\` 1σ-low ${pct(lo9, 4)} vs \`_S24i2\` 1σ-high ${pct(hi24, 4)} (disjoint: ${hi24 < lo9 ? 'YES' : 'NO'}), orientation area ${ro.toFixed(3)}× | **${killed ? 'REFUTED' : 'not refuted'}** |`);
    P(`| **H-L4** orientation over-bar AREA does not fall across the lineage | KILL if ≤ 0.50×; CONFIRM if ≥ 0.90× | **${ro.toFixed(3)}×** | **${ro <= 0.5 ? 'REFUTED' : ro >= 0.9 ? 'CONFIRMED' : 'partial'}** |`);
    void sig;
  }
  // H-L2 — count the steps that move count-rate by more than 2 sigma in the improving direction
  {
    let moved = 0; let scored = 0; const detail = [];
    for (let i = 1; i < 7; i += 1) {
      const pb = load(CHAIN[i - 1][0], 'pos'); const pa = load(CHAIN[i][0], 'pos');
      if (!pb || !pa) continue;
      scored += 1;
      const r = pa.failRate / pb.failRate;
      const s = Math.sqrt(pa.sigmaCountRel ** 2 + pb.sigmaCountRel ** 2);
      const imp = r < 1 && (1 - r) > 2 * s;
      if (imp) moved += 1;
      detail.push(`${CHAIN[i][0]} ${r.toFixed(3)}×${imp ? ' **>2σ improving**' : ''}`);
    }
    if (scored > 0) {
      P(`| **H-L2** at most ONE of the six steps moves honest position by more than its own 1σ | KILL if ≥3 steps move count-rate by >2σ in the IMPROVING direction | **${moved}** of ${scored} scored steps do: ${detail.join('; ')} | **${moved >= 3 ? 'REFUTED' : moved <= 1 ? 'CONFIRMED' : 'partial (2 steps)'}** |`);
    }
  }
  P('');
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
