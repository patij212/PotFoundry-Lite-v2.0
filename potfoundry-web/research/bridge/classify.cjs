#!/usr/bin/env node
// classify.cjs — turn the all-20 re-baseline scorecard into the pre-registered H1/H2/H3 verdicts
// + a markdown table. Plain node (reads the scorecard JSON only; no src imports). Safe to run on a
// PARTIAL scorecard (it reports rows-so-far) — also a health check during the run.
//   node research/bridge/classify.cjs [path-to-scorecard.json]
const fs = require('fs');

const SCORECARD = process.argv[2] || 'research/exchange/_scorecard.json';
const TANGLED = ['GyroidManifold', 'BasketWeave', 'CelticKnot', 'CelticTriquetra', 'GothicArches'];
const ENGINES = ['triangle', 'gmsh-iso', 'gmsh-aniso'];
const CAD_CHORD = 0.1; // gate p99 (mm)
const CAD_QUAL = 5;    // gate %<20°

if (!fs.existsSync(SCORECARD)) { console.log(`scorecard not found yet: ${SCORECARD}`); process.exit(0); }
const rows = JSON.parse(fs.readFileSync(SCORECARD, 'utf8'));
const byStyle = {};
for (const r of rows) { (byStyle[r.style] ||= {})[r.config] = r; }
const fmt = (x, d = 3) => (x == null ? '—' : typeof x === 'number' ? x.toFixed(d) : String(x));
const cadGrade = (r) => r && !r.error && r.chordP99Mm <= CAD_CHORD && r.pctUnder20deg <= CAD_QUAL;
const qualOK = (r) => r && !r.error && r.pctUnder20deg <= CAD_QUAL;

console.log(`\n=== Scorecard (${rows.length}/60 rows) ===\n`);
console.log('| style | config | tris | chordP99 | chordMax | %<20° | minAng | ms |');
console.log('|---|---|---|---|---|---|---|---|');
for (const style of Object.keys(byStyle)) {
  for (const cfg of ENGINES) {
    const r = byStyle[style][cfg];
    if (!r) continue;
    if (r.error) { console.log(`| ${style} | ${cfg} | **ERR** | ${r.error.slice(0, 48)} | | | | |`); continue; }
    console.log(`| ${style} | ${cfg} | ${r.tris} | ${fmt(r.chordP99Mm)} | ${fmt(r.chordMaxMm)} | ${fmt(r.pctUnder20deg, 1)} | ${fmt(r.minAngleDeg, 1)} | ${Math.round(r.engineMs || 0)} |`);
  }
}

// H1 — no engine CAD-grades the tangled lattices (chord on the clean-chord Gyroid + quality on all 5)
let h1by = null;
for (const e of ENGINES) {
  const gyroidOK = cadGrade(byStyle.GyroidManifold && byStyle.GyroidManifold[e]);
  const allTangledQual = TANGLED.every((s) => qualOK(byStyle[s] && byStyle[s][e]));
  if (gyroidOK && allTangledQual) h1by = e;
}
console.log(`\nH1 (no engine CAD-grades the 5 tangled lattices): ${h1by ? `**REFUTED** by ${h1by} — an engine solves it (roadmap pivot)` : 'CONFIRMED so far (floor stands)'}`);
console.log('  tangled detail (chordP99 / %<20° per engine):');
for (const s of TANGLED) {
  console.log(`    ${s.padEnd(16)} ` + ENGINES.map((e) => { const r = byStyle[s] && byStyle[s][e]; return `${e}=${r && !r.error ? fmt(r.chordP99Mm) + '/' + fmt(r.pctUnder20deg, 1) : '—'}`; }).join('  '));
}

// H2 — engines competent on smooth styles (any engine CAD-grades any smooth style)
const smooth = Object.keys(byStyle).filter((s) => !TANGLED.includes(s));
let h2ok = null;
for (const s of smooth) for (const e of ENGINES) if (cadGrade(byStyle[s][e])) h2ok = `${e} on ${s}`;
console.log(`\nH2 (engines CAD-grade ≥1 smooth style): ${h2ok ? `CONFIRMED — ${h2ok}` : 'not yet (no smooth style CAD-graded)'}`);

// H3 — anisotropy saves triangles (gmsh-aniso tris ≤ 0.8 × gmsh-iso) on ≥3 styles
const h3 = [];
for (const s of Object.keys(byStyle)) {
  const a = byStyle[s]['gmsh-aniso'], i = byStyle[s]['gmsh-iso'];
  if (a && i && !a.error && !i.error && i.tris > 0 && a.tris <= 0.8 * i.tris) h3.push(`${s}(${(a.tris / i.tris).toFixed(2)}×)`);
}
console.log(`\nH3 (gmsh-aniso saves ≥20% tris on ≥3 styles): ${h3.length >= 3 ? 'SUPPORTED' : 'not yet'} — ${h3.length} styles: ${h3.join(', ')}`);
