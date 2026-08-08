#!/usr/bin/env node
/* s119Decide2ArmTable.cjs — S119 THE DECIDING RUN: the side-by-side table.
 *
 *   node research/tools/s119Decide2ArmTable.cjs <LABEL> <rung:ctlTag:parTag> ...
 *
 * It READS the machine-readable JSON the two instruments already wrote:
 *   LADDER_<tag>.json      research/tools/s119ThinLadder.ts  (T2: thin / needle / DEGENERACY POLES)
 *   S119_CLIFF_<tag>.json  research/tools/s119CliffRuler.ts  (T3: perpendicular position vs the SOLID)
 * and prints COUNT + AREA-share + MAX for every class, per arm, per rung, plus a log-log growth
 * exponent per class per arm. It computes nothing the instruments did not already measure.
 *
 * A missing rung is printed as "not measured" and EXCLUDED from the fit. NOT MEASURED IS NOT ZERO.
 * A plain .cjs on purpose: it must never invoke esbuild while a driver arm is live.
 */
/* global process */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(process.cwd(), 'research/exchange/_strataConformBisect/s119');
const LABEL = process.argv[2] || 'RUN';
const SPECS = process.argv.slice(3).map((s) => {
  const [rung, ctl, par] = s.split(':');
  return { rung, ctl, par };
});

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const ladder = (t) => readJson(path.join(DIR, `LADDER_${t}.json`));
const cliff = (t) => readJson(path.join(DIR, `S119_CLIFF_${t}.json`));
const pick = (arr, k) => (Array.isArray(arr) ? arr.find((r) => Math.abs(r.k - k) < 1e-12) : undefined);
const n = (v, d = 0) => (v === undefined || v === null || !Number.isFinite(v) ? '     —' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(4)}%` : '   —');
const e3 = (v) => (Number.isFinite(v) ? v.toExponential(3) : '   —');

/** least-squares slope of log(y) on log(x); returns {a, r2, nPts}. Zero/absent y are dropped and counted. */
function fitAlpha(xs, ys) {
  const X = []; const Y = []; let dropped = 0;
  for (let i = 0; i < xs.length; i += 1) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i]) || xs[i] <= 0 || ys[i] <= 0) { dropped += 1; continue; }
    X.push(Math.log(xs[i])); Y.push(Math.log(ys[i]));
  }
  if (X.length < 2) return { a: NaN, r2: NaN, nPts: X.length, dropped };
  const mx = X.reduce((s, v) => s + v, 0) / X.length;
  const my = Y.reduce((s, v) => s + v, 0) / Y.length;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < X.length; i += 1) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  const a = sxy / sxx;
  const r2 = syy === 0 ? NaN : (sxy * sxy) / (sxx * syy);
  return { a, r2, nPts: X.length, dropped };
}

// ── the classes, each as a pure extractor over the two JSONs ──────────────────────────────────────
const CLASSES = [
  { id: 'pole>=100  count', get: (L) => pick(L.pole, 100)?.count, kind: 'count' },
  { id: 'pole>=100  area',  get: (L) => pick(L.pole, 100)?.area, kind: 'area' },
  { id: 'pole>=1000 count', get: (L) => pick(L.pole, 1000)?.count, kind: 'count' },
  { id: 'pole>=1000 area',  get: (L) => pick(L.pole, 1000)?.area, kind: 'area' },
  { id: 'pole>=10   count', get: (L) => pick(L.pole, 10)?.count, kind: 'count' },
  { id: 'pole>=10   area',  get: (L) => pick(L.pole, 10)?.area, kind: 'area' },
  { id: 'thin@0.02  count', get: (L) => pick(L.thin, 0.02)?.count, kind: 'count' },
  { id: 'thin@0.02  area',  get: (L) => pick(L.thin, 0.02)?.area, kind: 'area' },
  { id: 'thin@0.05  count', get: (L) => pick(L.thin, 0.05)?.count, kind: 'count' },
  { id: 'needle@2um count', get: (L) => pick(L.needle, 2)?.count, kind: 'count' },
  { id: 'needle@2um area',  get: (L) => pick(L.needle, 2)?.area, kind: 'area' },
  { id: 'needle@0.5 count', get: (L) => pick(L.needle, 0.5)?.count, kind: 'count' },
  { id: 'f32 folds   count', get: (L) => L.foldCount, kind: 'count' },
];

const arms = ['ctl', 'param'];
const rows = SPECS.map((s) => ({
  rung: s.rung,
  ctl: { tag: s.ctl, L: ladder(s.ctl), C: cliff(s.ctl) },
  param: { tag: s.par, L: ladder(s.par), C: cliff(s.par) },
}));

const hi = (C) => (C ? { cnt: C.off.hiC + C.on.hiC, area: C.off.hiCa + C.on.hiCa, max: Math.max(C.off.maxC, C.on.maxC) } : null);
const hiG = (C) => (C ? { cnt: C.off.hiG + C.on.hiG, area: C.off.hiGa + C.on.hiGa, max: Math.max(C.off.maxG, C.on.maxG) } : null);

const line = (s) => process.stdout.write(`${s}\n`);
line('═'.repeat(120));
line(`===== S119 THE DECIDING RUN — TWO-ARM DENSITY LADDER, DRIVER MESHES ONLY   ${LABEL} =====`);
line('═'.repeat(120));

// ── (1) the rungs ────────────────────────────────────────────────────────────────────────────────
line('');
line('── (1) THE RUNGS. Both arms out of the driver, ONE env var apart, at MATCHED ALLOCATION BUDGET. ──');
line(`   ${'rung'.padEnd(6)}${'arm'.padEnd(7)}${'tag'.padEnd(16)}${'facets'.padStart(11)}${'3D area mm2'.padStart(14)}${'minAlt nm'.padStart(13)}${'minThin'.padStart(12)}${'maxGraphRatio'.padStart(15)}${'f32 folds'.padStart(11)}`);
for (const r of rows) {
  for (const a of arms) {
    const L = r[a].L;
    if (!L) { line(`   ${r.rung.padEnd(6)}${a.padEnd(7)}${(r[a].tag || '?').padEnd(16)}   *** NOT MEASURED (not zero) ***`); continue; }
    line(`   ${r.rung.padEnd(6)}${a.padEnd(7)}${r[a].tag.padEnd(16)}${n(L.nTri).padStart(11)}${L.area3.toFixed(3).padStart(14)}${(L.minAltUm * 1000).toFixed(3).padStart(13)}${e3(L.minThin).padStart(12)}${e3(L.maxGraphRatio).padStart(15)}${n(L.foldCount).padStart(11)}`);
  }
}

// ── (2) per-class, per-rung, COUNT + AREA-share + MAX ────────────────────────────────────────────
line('');
line('── (2) EVERY CLASS, EVERY RUNG: COUNT + AREA-share + MAX-per-facet. Never a bare count, never a bare max. ──');
for (const cls of CLASSES.filter((c) => c.kind === 'count')) {
  const base = cls.id.replace(' count', '');
  line('');
  line(`   ${base}`);
  line(`   ${'rung'.padEnd(6)}${'N ctl'.padStart(11)}${'N par'.padStart(11)}  |${'cnt ctl'.padStart(10)}${'cnt par'.padStart(10)}${'x'.padStart(8)}  |${'%area ctl'.padStart(11)}${'%area par'.padStart(11)}${'x'.padStart(8)}  |${'maxFacetA ctl'.padStart(14)}${'par'.padStart(11)}`);
  for (const r of rows) {
    const Lc = r.ctl.L; const Lp = r.param.L;
    if (!Lc || !Lp) { line(`   ${r.rung.padEnd(6)}   *** one arm NOT MEASURED — no ratio printed ***`); continue; }
    const ac = CLASSES.find((c) => c.id === `${base} area`);
    const cc = cls.get(Lc); const cp = cls.get(Lp);
    const arc = ac ? ac.get(Lc) : undefined; const arp = ac ? ac.get(Lp) : undefined;
    const sc = arc === undefined ? NaN : arc / Lc.area3;
    const sp = arp === undefined ? NaN : arp / Lp.area3;
    let mc; let mp;
    if (base.startsWith('pole')) { const k = Number(base.split('>=')[1]); mc = pick(Lc.pole, k)?.maxFacetArea; mp = pick(Lp.pole, k)?.maxFacetArea; }
    else if (base.startsWith('thin')) { const k = Number(base.split('@')[1]); mc = pick(Lc.thin, k)?.maxFacetArea; mp = pick(Lp.thin, k)?.maxFacetArea; }
    else if (base.startsWith('needle')) { const k = Number(base.split('@')[1].replace('um', '')); mc = pick(Lc.needle, k)?.maxFacetArea; mp = pick(Lp.needle, k)?.maxFacetArea; }
    const rx = (x, y) => (Number.isFinite(x) && Number.isFinite(y) && x > 0 ? `${(y / x).toFixed(3)}` : '  —');
    line(`   ${r.rung.padEnd(6)}${n(Lc.nTri).padStart(11)}${n(Lp.nTri).padStart(11)}  |${n(cc).padStart(10)}${n(cp).padStart(10)}${rx(cc, cp).padStart(8)}  |${pct(sc).padStart(11)}${pct(sp).padStart(11)}${rx(sc, sp).padStart(8)}  |${e3(mc).padStart(14)}${e3(mp).padStart(11)}`);
  }
}

// ── (3) the cliff-aware position ruler ───────────────────────────────────────────────────────────
line('');
line('── (3) POSITION — T3 CLIFF-AWARE ruler (scored against the SOLID), with the GRAPH-only value beside it ──');
line(`   ${'rung'.padEnd(6)}${'arm'.padEnd(7)}${'facets'.padStart(11)} |${'>0.01 cnt'.padStart(11)}${'area mm2'.padStart(11)}${'%area'.padStart(10)}${'MAX mm'.padStart(11)} |${'GRAPH cnt'.padStart(11)}${'%area'.padStart(10)}${'MAX mm'.padStart(11)} | ctrl C1/C2R`);
for (const r of rows) {
  for (const a of arms) {
    const C = r[a].C;
    if (!C) { line(`   ${r.rung.padEnd(6)}${a.padEnd(7)}   *** CLIFF RULER NOT RUN (not zero) ***`); continue; }
    const h = hi(C); const g = hiG(C);
    line(`   ${r.rung.padEnd(6)}${a.padEnd(7)}${n(C.nTri).padStart(11)} |${n(h.cnt).padStart(11)}${h.area.toFixed(3).padStart(11)}${pct(h.area / C.areaTot).padStart(10)}${h.max.toFixed(5).padStart(11)} |${n(g.cnt).padStart(11)}${pct(g.area / C.areaTot).padStart(10)}${g.max.toFixed(5).padStart(11)} | ${C.controls.c1}/${C.controls.c2rViol}`);
  }
}

// ── (4) growth exponents, arm vs arm ─────────────────────────────────────────────────────────────
line('');
line('── (4) THE ANSWER: GROWTH EXPONENT alpha per class, per arm.  count ~ N^alpha.  alpha>1 = POSITIVE FEEDBACK ──');
line(`   ${'class'.padEnd(20)}${'alpha ctl'.padStart(11)}${'R2'.padStart(7)}${'alpha par'.padStart(11)}${'R2'.padStart(7)}${'d(alpha)'.padStart(10)}   verdict`);
for (const cls of CLASSES) {
  const f = {};
  for (const a of arms) {
    const xs = []; const ys = [];
    for (const r of rows) { const L = r[a].L; if (!L) continue; xs.push(L.nTri); ys.push(cls.get(L)); }
    f[a] = fitAlpha(xs, ys);
  }
  const d = f.param.a - f.ctl.a;
  const v = !Number.isFinite(d) ? 'insufficient rungs'
    : d < -0.05 ? (f.param.a < 1 ? 'BETTER and sub-linear' : 'BETTER but still amplifying')
      : d > 0.05 ? '*** WORSE — the class grows FASTER under the treatment ***' : 'no change';
  line(`   ${cls.id.padEnd(20)}${(Number.isFinite(f.ctl.a) ? f.ctl.a.toFixed(3) : '  —').padStart(11)}${(Number.isFinite(f.ctl.r2) ? f.ctl.r2.toFixed(3) : ' —').padStart(7)}${(Number.isFinite(f.param.a) ? f.param.a.toFixed(3) : '  —').padStart(11)}${(Number.isFinite(f.param.r2) ? f.param.r2.toFixed(3) : ' —').padStart(7)}${(Number.isFinite(d) ? d.toFixed(3) : '  —').padStart(10)}   ${v}${f.ctl.dropped || f.param.dropped ? `   [rungs dropped from fit: ctl ${f.ctl.dropped} / par ${f.param.dropped} — a zero cannot be logged]` : ''}`);
}

// ── (5) classes that grew ────────────────────────────────────────────────────────────────────────
line('');
line('── (5) EVERY CLASS THAT GREW UNDER THE TREATMENT, at any rung, by AREA-SHARE. Named per the discipline. ──');
let grew = 0;
for (const cls of CLASSES.filter((c) => c.kind === 'area')) {
  for (const r of rows) {
    const Lc = r.ctl.L; const Lp = r.param.L;
    if (!Lc || !Lp) continue;
    const sc = cls.get(Lc) / Lc.area3; const sp = cls.get(Lp) / Lp.area3;
    if (Number.isFinite(sc) && Number.isFinite(sp) && sp > sc) {
      grew += 1;
      line(`   ${r.rung.padEnd(6)} ${cls.id.padEnd(20)} area-share ${pct(sc)} -> ${pct(sp)}  (x${(sp / sc).toFixed(3)})`);
    }
  }
}
if (grew === 0) line('   (none by area-share at any measured rung)');
line('');
line('S119 DECIDE TABLE DONE');
