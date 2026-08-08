#!/usr/bin/env node
// s119t1Table.cjs — S119 TASK 1: pull the comparable numbers out of the arm logs into ONE table.
//
// Plain CommonJS on purpose: it must run while vitest holds the esbuild service (a CLI esbuild
// invocation kills every concurrent arm), so it may not be bundled.
//
//   node research/tools/s119t1Table.cjs research/exchange/_strataConformBisect/s119/CelticTriquetra_full_*.log
//
// EVERY ROW IS COUNT + AREA-share + MAX where the instrument reports all three. A row the log does not
// carry prints `-` rather than a zero — an absent measurement is not a measurement of zero.
const fs = require('node:fs');

const files = process.argv.slice(2);
if (files.length === 0) { console.log('usage: node s119t1Table.cjs <arm log>...'); process.exit(2); }

const grab = (txt, re, g = 1) => { const m = txt.match(re); return m === null ? null : m[g]; };

const rows = files.map((f) => {
  const t = fs.readFileSync(f, 'utf8');
  const arm = (f.match(/_([a-z0-9]+)\.log$/) || [null, f])[1];
  return {
    arm,
    mode: grab(t, /edge selection: PF_CB_S119_PARAMSEL=(\S+)/),
    tris: grab(t, /→ (\d+) tris/),
    alloc: grab(t, /\(alloc (\d+)\//),
    capped: /\[CAPPED\]/.test(t) ? 'CAPPED' : (/\[TIME-CAPPED\]/.test(t) ? 'TIME-CAPPED' : 'drained'),
    wall: grab(t, /\s(\d+)s, [\d.]+M rA evals/),
    evals: grab(t, /(\d[\d.]*)M rA evals/),
    splits: grab(t, /^splits (\d+)/m),
    unres: grab(t, /^unresolved: (\d+)/m),
    picks: grab(t, /triangles selected through it (\d+)/),
    guardDiff: grab(t, /parametric aspect guard changed (\d+)/),
    soup: grab(t, /FINAL SOUP \(exhaustive, f64\): (\d+) facets, ([\d.]+) mm2/),
    soupArea: grab(t, /FINAL SOUP \(exhaustive, f64\): \d+ facets, ([\d.]+) mm2/),
    t1n: grab(t, /T1 degenerate \|qP\| < [\d.]+:\s+COUNT (\d+)/),
    t1a: grab(t, /T1 degenerate \|qP\| < [\d.]+:\s+COUNT \d+\s+AREA ([\d.]+) mm2/),
    t1p: grab(t, /T1 degenerate \|qP\| < [\d.]+:\s+COUNT \d+\s+AREA [\d.]+ mm2 = ([\d.]+)%/),
    t2n: grab(t, /T2 fold \(sigma\*apS <= 0\):\s+COUNT (\d+)/),
    t3n: grab(t, /T3 blade \(arcAlt < [\d.]+ um\): COUNT (\d+)/),
    t3p: grab(t, /T3 blade \(arcAlt < [\d.]+ um\): COUNT \d+\s+AREA [\d.]+ mm2 = ([\d.]+)%/),
    minAlt: grab(t, /mesh-wide MIN arc altitude ([\d.]+|n\/a) nm/),
    bornMinAlt: grab(t, /min arc altitude at birth ([\d.]+) nm/),
    headline: grab(t, /HEADLINE MAX ([\d.]+) µm/),
    edgeWorst: grab(t, /worst ([\d.]+) µm \(EDGE ruler/),
    ladder: [0.1, 0.5, 1, 2, 5, 10, 20].map((b) => {
      const re = new RegExp(`arcAlt <\\s+${String(b).replace('.', '\\.')} um :\\s+COUNT\\s+(\\d+)\\s+AREA\\s+([\\d.]+) mm2 = ([\\d.]+)%`);
      const m = t.match(re);
      return m === null ? null : { bar: b, count: +m[1], area: +m[2], pct: +m[3] };
    }),
  };
});

const pad = (s, n) => String(s === null || s === undefined ? '-' : s).padStart(n);
console.log('');
console.log('══ S119 TASK 1 — DRIVER ARMS. COUNT + AREA-share + MAX, per facet. `-` = not measured, never 0. ══');
console.log('');
console.log('arm      mode      tris        splits    unres  capped      wall  rAevals  picks   guardDiff');
for (const r of rows) {
  console.log(`${pad(r.arm, 8)} ${pad(r.mode, 8)} ${pad(r.tris, 10)} ${pad(r.splits, 8)} ${pad(r.unres, 8)} ${pad(r.capped, 11)} ${pad(r.wall, 6)}s ${pad(r.evals, 7)}M ${pad(r.picks, 8)} ${pad(r.guardDiff, 8)}`);
}
console.log('');
console.log('── DRIVER S118 f64 CENSUS on the FINAL SOUP (exhaustive) ──');
console.log('arm      soupFacets  soupArea    T1deg(n/area%)      T2fold  T3blade(n/area%)     MINarcAlt nm  birthMIN nm');
for (const r of rows) {
  console.log(`${pad(r.arm, 8)} ${pad(r.soup, 11)} ${pad(r.soupArea, 11)} ${pad(r.t1n, 7)}/${pad(r.t1p, 9)}% ${pad(r.t2n, 7)} ${pad(r.t3n, 8)}/${pad(r.t3p, 9)}% ${pad(r.minAlt, 13)} ${pad(r.bornMinAlt, 12)}`);
}
console.log('');
console.log("── DRIVER'S OWN HEADLINE (its own rulers, NOT the honest perpendicular one) ──");
for (const r of rows) console.log(`${pad(r.arm, 8)}  adaptive/tail HEADLINE MAX ${pad(r.headline, 10)} µm   EDGE-ruler worst ${pad(r.edgeWorst, 10)} µm`);
console.log('');
console.log('── ARC-ALTITUDE THRESHOLD LADDER (swept, scar 4): COUNT / AREA-share OF MESH ──');
const bars = [0.1, 0.5, 1, 2, 5, 10, 20];
process.stdout.write('bar um   ');
for (const r of rows) process.stdout.write(pad(r.arm, 22));
process.stdout.write('\n');
for (let i = 0; i < bars.length; i += 1) {
  process.stdout.write(pad(bars[i], 6) + '   ');
  for (const r of rows) {
    const c = r.ladder[i];
    process.stdout.write(pad(c === null ? '-' : `${c.count}/${c.pct.toFixed(6)}%`, 22));
  }
  process.stdout.write('\n');
}
console.log('');
