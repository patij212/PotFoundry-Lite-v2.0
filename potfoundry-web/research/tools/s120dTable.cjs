#!/usr/bin/env node
// s120dTable.cjs — S120 TASK D: build the LADDER TABLE from the driver logs + the STL censuses.
//
//   node research/tools/s120dTable.cjs <tagPrefix> <tag1> <tag2> ... > report.txt
//   e.g. node research/tools/s120dTable.cjs DCT DCT1 DCT2 DCT3 DCT4
//
// Reads, per rung tag T:
//   research/exchange/_strataConformBisect/s120d/DRV_<STYLE>_<T>OFF.log   (the driver's own report)
//   research/exchange/_strataConformBisect/s120d/DRV_<STYLE>_<T>ON.log
//   research/exchange/_strataConformBisect/s120d/POLE_<T>OFF.json          (s120dPole.cjs, per STL)
//   research/exchange/_strataConformBisect/s120d/POLE_<T>ON.json
//
// and prints COUNT + AREA-share + MAX per class per rung per arm, plus the GROWTH EXPONENT alpha from a
// least-squares fit of log(count) against log(triangles) ACROSS the rungs — which is the headline S119
// left at 1.992 (control) / 1.810 (param-metric), both >> 1.
//
// A rung whose driver log says [CAPPED] is FLAGGED and EXCLUDED from the alpha fit: a capped rung
// confounds density with the allocation cap, and Task C excluded such rungs from every verdict.
// Plain CJS, no imports beyond fs: safe to run while a vitest arm is live.
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join('research', 'exchange', '_strataConformBisect', 's120d');
const tags = process.argv.slice(2);
if (tags.length < 2) { console.log('usage: node s120dTable.cjs <tag1> <tag2> ...'); process.exit(2); }

const rd = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const findLog = (tag) => {
  for (const f of fs.readdirSync(DIR)) if (f.startsWith('DRV_') && f.endsWith(`_${tag}.log`)) return path.join(DIR, f);
  return null;
};
const m1 = (s, re, i = 1) => { const m = s.match(re); return m === null ? null : m[i]; };
const num = (v) => (v === null ? null : Number(String(v).replace(/,/g, '')));

function parseDriver(tag) {
  const p = findLog(tag);
  if (p === null) return { tag, missing: true };
  const s = rd(p);
  if (s === null) return { tag, missing: true };
  const o = { tag, log: p };
  o.style = path.basename(p).replace(/^DRV_/, '').replace(new RegExp(`_${tag}\\.log$`), '');
  o.tris = num(m1(s, /→\s*(\d+)\s*tris/));
  o.alloc = m1(s, /\(alloc\s*([\d/]+)\)/);
  o.capped = /\[CAPPED\]/.test(s);
  o.timeCapped = /TIME-CAPPED/.test(s);
  o.wallS = num(m1(s, /\]?\s*(\d+)s,\s*[\d.]+M rA evals/));
  o.rAevals = m1(s, /(\d+)M rA evals/);
  o.splits = num(m1(s, /^splits\s+(\d+)/m));
  o.heapLeft = num(m1(s, /^heap:\s*(\d+)\s*left/m));
  o.unresolved = num(m1(s, /^unresolved:\s*(\d+)\s*live over-tol/m));
  o.unresWorstPlane = num(m1(s, /^unresolved:.*?worst\s+([\d.]+)\s*µm\s*\(stored key/m));
  o.unresWorstEdge = num(m1(s, /^unresolved:.*?worst\s+([\d.]+)\s*µm\s*\(EDGE ruler/m));
  o.why = (m1(s, /^\s*unresolved by reason:\s*(.*)$/m) || 'none').trim();
  o.soupFacets = num(m1(s, /FINAL SOUP \(exhaustive, f64\):\s*(\d+)\s*facets,\s*([\d.]+)\s*mm2/, 1));
  o.soupArea = num(m1(s, /FINAL SOUP \(exhaustive, f64\):\s*(\d+)\s*facets,\s*([\d.]+)\s*mm2/, 2));
  o.minAltNm = num(m1(s, /mesh-wide MIN arc altitude\s+([\d.]+)\s*nm/));
  o.birthMinAltNm = num(m1(s, /min arc altitude at birth\s+([\d.]+)\s*nm/));
  o.t1c = num(m1(s, /T1 degenerate[^:]*:\s*COUNT\s*(\d+)\s*AREA\s*([\d.]+)/, 1));
  o.t1a = num(m1(s, /T1 degenerate[^:]*:\s*COUNT\s*(\d+)\s*AREA\s*([\d.]+)/, 2));
  o.t2c = num(m1(s, /T2 fold[^:]*:\s*COUNT\s*(\d+)/));
  o.t3c = num(m1(s, /T3 blade[^:]*:\s*COUNT\s*(\d+)\s*AREA\s*([\d.]+)/, 1));
  o.t3a = num(m1(s, /T3 blade[^:]*:\s*COUNT\s*(\d+)\s*AREA\s*([\d.]+)/, 2));
  o.headlineMax = num(m1(s, /HEADLINE MAX\s+([\d.]+)\s*µm/));
  o.adaptMax = num(m1(s, /^\s*MAX\s+([\d.]+)\s*µm\s+\w+\s+p99\s+([\d.]+)\s+p50\s+([\d.]+)\s+over-0\.01mm\s+(\d+)\/(\d+)/m, 1));
  o.p99 = num(m1(s, /^\s*MAX\s+([\d.]+)\s*µm\s+\w+\s+p99\s+([\d.]+)\s+p50\s+([\d.]+)\s+over-0\.01mm\s+(\d+)\/(\d+)/m, 2));
  o.p50 = num(m1(s, /^\s*MAX\s+([\d.]+)\s*µm\s+\w+\s+p99\s+([\d.]+)\s+p50\s+([\d.]+)\s+over-0\.01mm\s+(\d+)\/(\d+)/m, 3));
  o.over10um = num(m1(s, /over-0\.01mm\s+(\d+)\/(\d+)/, 1));
  o.over10den = num(m1(s, /over-0\.01mm\s+(\d+)\/(\d+)/, 2));
  o.nonManifold = num(m1(s, /non-manifold edges\s*:\s*(\d+)/));
  o.reversed = num(m1(s, /reversed facets\s*:\s*(\d+)/));
  o.seamCrack = num(m1(s, /seam-crack edges\s*:\s*(\d+)/));
  o.boundary = num(m1(s, /boundary edges\s*:\s*(\d+)/));
  o.soupLine = (m1(s, /^\s*soup:\s*(.*)$/m) || '').trim();
  o.arRefused = num(m1(s, /refused:\s*(\d+)\s*on aspect/));
  o.retriMode = m1(s, /1-ring retriangulation: PF_CB_S120_RETRI=(\S+)/);
  o.retriTried = num(m1(s, /attempted\s+([\d,]+)\s+FIRED\s+([\d,]+)/, 1));
  o.retriFired = num(m1(s, /attempted\s+([\d,]+)\s+FIRED\s+([\d,]+)/, 2));
  o.retriArMean = m1(s, /aspect3 over the patches it fired on: mean\s+(\S+)\s*->\s*(\S+)/, 1);
  o.retriArMeanAfter = m1(s, /aspect3 over the patches it fired on: mean\s+(\S+)\s*->\s*(\S+)/, 2);
  o.retriArWorst = m1(s, /WORST\s+([\d.]+)\s*->\s*([\d.]+)/, 1);
  o.retriArWorstAfter = m1(s, /WORST\s+([\d.]+)\s*->\s*([\d.]+)/, 2);
  o.retriNo = (m1(s, /^\s*refusals \(every one named[^:]*:\s*(.*)$/m) || '-').trim();
  return o;
}
function parsePole(tag) {
  const s = rd(path.join(DIR, `POLE_${tag}.json`));
  if (s === null) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function parseEdge(tag) {
  const s = rd(path.join(DIR, `EDGE_${tag}.json`));
  if (s === null) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/** least-squares slope of log(y) on log(x); returns null if fewer than 2 usable points. */
function alpha(xs, ys) {
  const X = []; const Y = [];
  for (let i = 0; i < xs.length; i += 1) if (xs[i] > 0 && ys[i] > 0) { X.push(Math.log(xs[i])); Y.push(Math.log(ys[i])); }
  if (X.length < 2) return null;
  const n = X.length;
  const mx = X.reduce((a, b) => a + b, 0) / n; const my = Y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < n; i += 1) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
  return sxx > 0 ? sxy / sxx : null;
}
const f = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const i0 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());

const rows = [];
for (const t of tags) {
  for (const arm of ['OFF', 'ON', 'PLA']) {
    const tag = arm === 'PLA' ? `${t}PLA` : `${t}${arm}`;
    const d = parseDriver(tag);
    if (d.missing) continue;
    rows.push({ rung: t, arm, d, pole: parsePole(tag), edge: parseEdge(tag) });
  }
}
if (rows.length === 0) { console.log('*** NO LOGS FOUND — nothing to table ***'); process.exit(1); }

const L = (s) => console.log(s);
L('═'.repeat(150));
L('S120 TASK D — THE DENSITY LADDER.  COUNT + AREA-share + MAX per class, per rung, per arm.');
L('  arms: OFF = control (a shape-refused facet is STRANDED) | ON = 1-ring min-max-aspect3 retriangulation | PLA = COST-MATCHED PLACEBO (same DP paid, random valid fan committed)');
L('═'.repeat(150));
L('');
L('── RUN IDENTITY ──');
L('rung arm  style                 tris        alloc     capped  wall_s   splits    heap_left  unresolved  by-reason');
for (const r of rows) {
  const d = r.d;
  L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)} ${String(d.style).padEnd(16)} ${i0(d.tris).padStart(11)}  ${String(d.alloc).padStart(15)}  ${(d.capped ? 'CAPPED' : d.timeCapped ? 'TIME' : '   -').padStart(6)}  ${String(d.wallS).padStart(6)}  ${i0(d.splits).padStart(8)}  ${i0(d.heapLeft).padStart(10)}  ${i0(d.unresolved).padStart(10)}  ${d.why}`);
}
L('');
L('── THE OPERATOR ITSELF ──');
L('rung arm  mode      attempted     FIRED     patch aspect3 mean      patch aspect3 WORST     refusals');
for (const r of rows) {
  const d = r.d;
  L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)} ${String(d.retriMode).padEnd(9)} ${i0(d.retriTried).padStart(9)} ${i0(d.retriFired).padStart(9)}     ${String(d.retriArMean).padStart(8)} -> ${String(d.retriArMeanAfter).padEnd(8)}   ${String(d.retriArWorst).padStart(8)} -> ${String(d.retriArWorstAfter).padEnd(8)}  ${d.retriNo}`);
}
L('');
L('── DEGENERACY POLES (graphRatio >= 100), from the STL, EXHAUSTIVE ──   *** alpha is the headline ***');
L('rung arm       tris     poleCOUNT   pole%tris     poleAREA mm2   pole%area    MAXgraphRatio');
for (const r of rows) {
  const p = r.pole;
  if (p === null) { L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)}  (no STL census)`); continue; }
  L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)} ${i0(p.facets).padStart(10)} ${i0(p.poleC).padStart(11)}  ${f((100 * p.poleC) / p.facets, 6).padStart(10)}%  ${f(p.poleA, 6).padStart(14)}  ${f((100 * p.poleA) / p.area3, 6).padStart(9)}%  ${p.poleGrInf > 0 ? `inf x${p.poleGrInf}` : f(p.poleGrMax, 1)}`);
}
L('');
L('── SCALE-FREE THIN (tau ladder, COUNT / AREA mm2) and ABSOLUTE NEEDLES (scale-DEPENDENT, reported separately) ──');
L('rung arm    tau.005          tau.01           tau.02           tau.05          needles<2um        minArcAlt_nm    3-D AR>50 (n/area/max)');
for (const r of rows) {
  const p = r.pole; const d = r.d;
  if (p === null) { L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)}  (no STL census)`); continue; }
  const tt = (k) => `${i0(p.thinC[k])}/${f(p.thinA[k], 2)}`;
  L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)} ${tt(0).padEnd(16)} ${tt(1).padEnd(16)} ${tt(2).padEnd(16)} ${tt(3).padEnd(15)} ${`${i0(p.ndlC)}/${f(p.ndlA, 2)}`.padEnd(17)} ${f(p.minAltUm * 1000, 4).padStart(12)}   ${i0(p.arOverC)}/${f(p.arOverA, 4)}/${f(p.arMax, 2)}   [driver: ${f(d.minAltNm, 3)} nm]`);
}
L('');
L('── PERPENDICULAR FACET POSITION (driver self-report, PLANE ruler — labelled, never quoted as the verdict) and TOPOLOGY ──');
L('rung arm   HEADLINE_MAX_um  adaptMAX  p99     p50     over10um/den    nonManif reversed seamCrack boundary   ar-refused-splits');
for (const r of rows) {
  const d = r.d;
  L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)} ${f(d.headlineMax).padStart(15)}  ${f(d.adaptMax).padStart(8)}  ${f(d.p99).padStart(6)}  ${f(d.p50).padStart(6)}  ${`${i0(d.over10um)}/${i0(d.over10den)}`.padStart(14)}  ${String(d.nonManifold).padStart(8)} ${String(d.reversed).padStart(8)} ${String(d.seamCrack).padStart(9)} ${String(d.boundary).padStart(8)}   ${i0(d.arRefused)}`);
}
L('');
L('── EDGE CONFORMANCE (Task B ruler, PERPENDICULAR; radial is a sound upper bound only) ──');
let anyEdge = false;
L('rung arm      edges       over 0.01mm (n / %)        over 0.001mm (n / %)       MAX mm');
for (const r of rows) {
  const e = r.edge;
  if (e === null) continue;
  anyEdge = true;
  L(`${r.rung.padEnd(5)}${r.arm.padEnd(4)} ${i0(e.edges).padStart(10)}  ${`${i0(e.overHi)} / ${f((100 * e.overHi) / e.edges, 4)}%`.padStart(24)}  ${`${i0(e.overLo)} / ${f((100 * e.overLo) / e.edges, 4)}%`.padStart(24)}  ${(e.maxPerp ?? e.max) == null ? "—" : Number(e.maxPerp ?? e.max).toPrecision(16)}`);
}
if (!anyEdge) L('   (no EDGE_*.json present — run the Task B ruler and drop its scalars here)');
L('');
L('── GROWTH EXPONENTS  count ~ tris^alpha  (least squares over the DRAINED rungs only; CAPPED rungs excluded and named) ──');
const excl = rows.filter((r) => r.d.capped || r.d.timeCapped).map((r) => `${r.rung}${r.arm}`);
L(`   excluded as CAPPED: ${excl.length === 0 ? 'none' : excl.join(' ')}`);
for (const arm of ['OFF', 'ON', 'PLA']) {
  const rs = rows.filter((r) => r.arm === arm && !r.d.capped && !r.d.timeCapped && r.pole !== null);
  if (rs.length < 2) { L(`   arm ${arm}: fewer than 2 drained rungs with an STL census — alpha UNKNOWN`); continue; }
  const N = rs.map((r) => r.pole.facets);
  L(`   arm ${arm}  (${rs.length} rungs, tris ${i0(Math.min(...N))} … ${i0(Math.max(...N))}, range ${f(Math.max(...N) / Math.min(...N), 2)}x)`);
  const classes = [
    ['degeneracy poles (gr>=100)', rs.map((r) => r.pole.poleC)],
    ['pole AREA mm2', rs.map((r) => r.pole.poleA)],
    ['thin tau<0.005', rs.map((r) => r.pole.thinC[0])],
    ['thin tau<0.01', rs.map((r) => r.pole.thinC[1])],
    ['thin tau<0.02', rs.map((r) => r.pole.thinC[2])],
    ['absolute needles <2um', rs.map((r) => r.pole.ndlC)],
    ['3-D aspect3 > 50', rs.map((r) => r.pole.arOverC)],
    ['unresolved (stranded)', rs.map((r) => r.d.unresolved)],
  ];
  for (const [name, ys] of classes) {
    const a = alpha(N, ys);
    L(`      ${name.padEnd(28)} alpha ${a === null ? 'UNKNOWN (a zero or missing count — say UNKNOWN, do not fit)' : a.toFixed(3)}   [${ys.map((v) => i0(v)).join(', ')}]`);
  }
}
L('');
L('═'.repeat(150));
