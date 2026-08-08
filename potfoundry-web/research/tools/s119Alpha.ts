// s119Alpha.ts — S119 TASK 2 DELIVERABLE 4: the GROWTH EXPONENT per artefact class.
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT alpha MEANS, and it is the whole point of the ladder
//   count(class) ~ N^alpha, N = facets in the mesh.
//     alpha ~ 0  the class does not grow with density — by-construction safety holds, the class is a
//                fixed feature of the seed/geometry and refinement does not manufacture more of it.
//     alpha ~ 1  a CONSTANT PER-SPLIT FAILURE RATE — every split has the same probability of producing
//                a member. A local emit bug: fix the emit site and the class goes away.
//     alpha > 1  POSITIVE FEEDBACK. Members beget members: a degenerate facet, once created, is more
//                likely than an average facet to be selected again and to produce more degenerates. That
//                is a STRUCTURAL RECURSION bug and no emit-site guard can close it.
// AREA exponents are reported alongside, because a class can grow in count while shrinking in area (it
// is being subdivided) and calling that "growth" would be the S118 mistake in a new costume.
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//
// TWO FITS, ALWAYS BOTH:
//   * OLS over log N / log count across ALL rungs — the headline, with R^2 so a bad fit cannot hide.
//   * the LOCAL exponent between each ADJACENT pair — a single OLS slope through a curved relation is a
//     number that means nothing, and only the pair sequence shows whether alpha is drifting.
//
// Usage: node research/bridge/out/_run_s119Alpha.cjs
//   env PF_S119A_JSONS = comma-separated ABS paths to LADDER_*.json, in any order
//       PF_S119A_LABEL
import { readFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

interface Rec { k: number; count: number; area: number; maxFacetArea: number; countWall: number; areaWall: number; countJump: number; areaJump: number }
interface Rung {
  tag: string; style: string; nTri: number; area3: number;
  minAltUm: number; minThin: number; maxGraphRatio: number; foldCount: number; foldArea: number;
  needle: Rec[]; thin: Rec[]; pole: Rec[];
  xtab: Array<{ bar: number; tau: number; nN: number; nT: number; aN: number; aT: number }>;
  adjudication: null | { set: number; jump: number; kinkOnly: number; none: number; perClass: Record<string, { n: number; jump: number; a: number; aJump: number }> };
}

const FILES = envS('PF_S119A_JSONS', '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
const LABEL = envS('PF_S119A_LABEL', 'LADDER');
if (FILES.length < 2) { log('*** need >= 2 rungs; PF_S119A_JSONS ***'); process.exit(2); }
if (FILES.length === 2) {
  log('*** TWO RUNGS ONLY. Every "alpha" below is a TWO-POINT SLOPE, not a fit: R^2 is 1.000 by');
  log('*** construction and carries NO information. Quote it as a local exponent, never as a fitted one.');
}

const rungs: Rung[] = FILES.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Rung).sort((a, b) => a.nTri - b.nTri);

/** OLS slope of log y on log x, plus R^2. */
function fit(x: number[], y: number[]): { a: number; r2: number; n: number } {
  const pts = x.map((v, i) => [Math.log(v), y[i]] as [number, number]).filter((p, i) => y[i] > 0 && x[i] > 0).map((p) => [p[0], Math.log(p[1])] as [number, number]);
  const n = pts.length;
  if (n < 2) return { a: NaN, r2: NaN, n };
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const p of pts) { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; }
  const a = sxx === 0 ? NaN : sxy / sxx;
  const r2 = sxx === 0 || syy === 0 ? NaN : (sxy * sxy) / (sxx * syy);
  return { a, r2, n };
}
const local = (x: number[], y: number[]): string => {
  const out: string[] = [];
  for (let i = 1; i < x.length; i += 1) {
    out.push(y[i] > 0 && y[i - 1] > 0 ? (Math.log(y[i] / y[i - 1]) / Math.log(x[i] / x[i - 1])).toFixed(3) : '  n/a');
  }
  return out.join(' ');
};

const N = rungs.map((r) => r.nTri);
log('═════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S119 GROWTH EXPONENTS — ${LABEL} =====`);
log('═════════════════════════════════════════════════════════════════════════════════════════════════');
log('RUNGS (sorted by facet count):');
log(`   ${'tag'.padEnd(24)} ${'facets N'.padStart(11)} ${'N/N1'.padStart(7)} ${'3D area mm2'.padStart(13)} ${'minAlt um'.padStart(12)} ${'minThin'.padStart(11)} ${'maxGR'.padStart(11)} ${'folds'.padStart(6)}`);
for (const r of rungs) {
  log(`   ${r.tag.padEnd(24)} ${r.nTri.toLocaleString().padStart(11)} ${(r.nTri / N[0]).toFixed(2).padStart(7)} ${r.area3.toFixed(3).padStart(13)} ${r.minAltUm.toExponential(3).padStart(12)} ${r.minThin.toExponential(3).padStart(11)} ${r.maxGraphRatio.toExponential(3).padStart(11)} ${r.foldCount.toString().padStart(6)}`);
}
log(`   AREA CONTROL: the 3D area must be ~constant across the ladder (same surface). spread ${(100 * (Math.max(...rungs.map((r) => r.area3)) / Math.min(...rungs.map((r) => r.area3)) - 1)).toFixed(4)}%`);
log('');

const HEAD = `   ${'class'.padEnd(22)} ${'counts across the ladder'.padEnd(56)} ${'alpha'.padStart(7)} ${'R^2'.padStart(6)}  local alphas`;
function section(title: string, key: 'needle' | 'thin' | 'pole', unit: string): void {
  log(`── ${title} ──`);
  log(HEAD);
  const ks = rungs[0][key].map((r) => r.k);
  for (let i = 0; i < ks.length; i += 1) {
    const c = rungs.map((r) => r[key][i].count);
    const a = rungs.map((r) => r[key][i].area);
    const cw = rungs.map((r) => r[key][i].countWall);
    const f = fit(N, c); const fa = fit(N, a); const fw = fit(N, cw);
    log(`   ${`${unit}${ks[i]}`.padEnd(22)} ${c.map((v) => v.toLocaleString().padStart(10)).join('').padEnd(56)} ${f.a.toFixed(3).padStart(7)} ${f.r2.toFixed(3).padStart(6)}  ${local(N, c)}`);
    log(`   ${'   ... AREA mm2'.padEnd(22)} ${a.map((v) => v.toExponential(2).padStart(10)).join('').padEnd(56)} ${fa.a.toFixed(3).padStart(7)} ${fa.r2.toFixed(3).padStart(6)}  ${local(N, a)}`);
    log(`   ${'   ... count dR<0.5mm'.padEnd(22)} ${cw.map((v) => v.toLocaleString().padStart(10)).join('').padEnd(56)} ${fw.a.toFixed(3).padStart(7)} ${fw.r2.toFixed(3).padStart(6)}  ${local(N, cw)}`);
  }
  log('');
}
section('(A) ABSOLUTE NEEDLE  arc minAlt < B um', 'needle', 'needle@');
section('(B) SCALE-FREE THIN  minAlt/longest arc edge < tau', 'thin', 'thin@');
section('(C) DEGENERACY POLE  graphRatio >= C', 'pole', 'pole>=');

log('── (D) THE DECIDING SPLIT: of the needle class, what fraction is MERELY SMALL (passes every tau)? ──');
log(`   ${'bar/tau'.padEnd(14)} ${'per rung: % of the needle class that is MERELY SMALL (by COUNT)'.padEnd(60)}`);
for (const bar of [...new Set(rungs[0].xtab.map((x) => x.bar))]) {
  for (const tau of [...new Set(rungs[0].xtab.map((x) => x.tau))]) {
    const vals = rungs.map((r) => { const x = r.xtab.find((q) => q.bar === bar && q.tau === tau)!; return x.nN === 0 ? NaN : (100 * (x.nN - x.nT)) / x.nN; });
    const av = rungs.map((r) => { const x = r.xtab.find((q) => q.bar === bar && q.tau === tau)!; return x.aN === 0 ? NaN : (100 * (x.aN - x.aT)) / x.aN; });
    log(`   ${`${bar}um/${tau}`.padEnd(14)} cnt ${vals.map((v) => `${v.toFixed(2)}%`.padStart(9)).join('')}   area ${av.map((v) => `${v.toFixed(2)}%`.padStart(9)).join('')}`);
  }
}
log('');

if (rungs.every((r) => r.adjudication !== null)) {
  log('── (E) EXACT CLIFF ADJUDICATION across the ladder (the driver\'s own C0 classifier) ──');
  const keys = Object.keys(rungs[0].adjudication!.perClass);
  log(`   ${'class'.padEnd(18)} ${'per rung: % of the class ON A GENUINE C0 CLIFF (count)'.padEnd(50)}`);
  for (const k of keys) {
    const v = rungs.map((r) => { const p = r.adjudication!.perClass[k]; return p.n === 0 ? NaN : (100 * p.jump) / p.n; });
    const nOn = rungs.map((r) => r.adjudication!.perClass[k].jump);
    const nOff = rungs.map((r) => r.adjudication!.perClass[k].n - r.adjudication!.perClass[k].jump);
    log(`   ${k.padEnd(18)} ${v.map((x) => `${x.toFixed(2)}%`.padStart(9)).join('')}`);
    log(`   ${'   ON-cliff count'.padEnd(18)} ${nOn.map((x) => x.toLocaleString().padStart(9)).join('')}   alpha ${fit(N, nOn).a.toFixed(3)} (R2 ${fit(N, nOn).r2.toFixed(3)})`);
    log(`   ${'   OFF-cliff count'.padEnd(18)} ${nOff.map((x) => x.toLocaleString().padStart(9)).join('')}   alpha ${fit(N, nOff).a.toFixed(3)} (R2 ${fit(N, nOff).r2.toFixed(3)})`);
  }
  log('');
}

log('── (F) EVERY CLASS THAT GREW, ranked by alpha (count). Anything with alpha > 1 is positive feedback. ──');
const all: Array<{ name: string; a: number; r2: number; first: number; last: number }> = [];
for (const [key, unit] of [['needle', 'needle@'], ['thin', 'thin@'], ['pole', 'pole>=']] as Array<['needle' | 'thin' | 'pole', string]>) {
  rungs[0][key].forEach((_, i) => {
    const c = rungs.map((r) => r[key][i].count);
    const f = fit(N, c);
    all.push({ name: `${unit}${rungs[0][key][i].k}`, a: f.a, r2: f.r2, first: c[0], last: c[c.length - 1] });
  });
}
all.sort((p, q) => q.a - p.a);
for (const c of all) log(`   ${c.name.padEnd(18)} alpha ${c.a.toFixed(3).padStart(7)}  R^2 ${c.r2.toFixed(3)}   ${c.first.toLocaleString()} -> ${c.last.toLocaleString()}  (x${(c.last / Math.max(1, c.first)).toFixed(2)} over x${(N[N.length - 1] / N[0]).toFixed(2)} facets)`);
log('');
log('S119 ALPHA DONE');
