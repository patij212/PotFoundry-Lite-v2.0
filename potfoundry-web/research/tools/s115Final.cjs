// s115Final.cjs — the S115 authoritative table. Read-only; recomputes nothing.
// Combines the EXHAUSTIVE local census (CURTAIN, SLIVER — no sampling, no rA) with the SAMPLED
// rA-dependent buckets, and prints the edge-sample bias each style carries.
// Usage: node research/tools/s115Final.cjs <EX.json> <X.json> <B.json>
const fs = require('node:fs');
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const byStyle = (rows) => Object.fromEntries(rows.map((r) => [r.style, r]));
const EX = byStyle(load(process.argv[2]));
const X = byStyle(load(process.argv[3]));
const B = process.argv[4] ? byStyle(load(process.argv[4])) : {};
const ORDER = ['CelticTriquetra', 'HexagonalHive', 'ArtDeco', 'SpiralRidges', 'WaveInterference', 'Voronoi', 'Crystalline', 'GothicArches'];
const pad = (s, n) => String(s).padStart(n);
const padE = (s, n) => String(s).padEnd(n);
const f = (v, d = 2) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE A — THE EXHAUSTIVE LOCAL CENSUS  (every class facet; NO sampling, NO rA, NO h, NO inset)');
console.log('  These two buckets need only the facet\'s own coordinates, so they carry ZERO estimator error.');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style             class facets  class AREA% mesh | CURTAIN cnt%  CURTAIN AREA%class | SLIVER cnt%  SLIVER AREA%class  SLIVER AREA%mesh  SLIVER maxDih  minAlt p50 um');
for (const s of ORDER) {
  const e = EX[s]; if (!e || e.refused) continue;
  console.log(`${padE(s, 17)} ${pad(e.classCnt, 12)}  ${pad(f(e.classAreaPctMesh, 4), 15)} | ${pad(f(e.exCurtainCntPct), 12)}  ${pad(f(e.exCurtainAreaPct), 18)} | ${pad(f(e.exSliverCntPct), 11)}  ${pad(f(e.exSliverAreaPctClass), 17)}  ${pad(f(e.exSliverAreaPctMesh, 4), 16)}  ${pad(f(e.exSliverMaxDih, 3), 13)}  ${pad(f(e.exAltP50Um, 3), 13)}`);
}
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE B — EXHAUSTIVE SLIVER AREA% OF CLASS vs THE ALTITUDE CUT A');
console.log('  (S111 measured the "mesh adds turn" class at min altitude 5.94 um.)');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style              A=2um   A=5um  A=10um  A=20um  A=50um');
for (const s of ORDER) {
  const e = EX[s]; if (!e || !e.exSliverALadder) continue;
  console.log(`${padE(s, 17)} ${e.exSliverALadder.map((r) => pad(f(r.areaPctClass), 6)).join('  ')}`);
}
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE C — THE EDGE-SAMPLE BIAS, MEASURED (exhaustive vs the sampled arms)');
console.log('  STAGE 3 samples >45 EDGES, so facets carrying several >45 edges are over-represented. Quantified,');
console.log('  not assumed: a style whose sampled and exhaustive numbers agree has no bias worth pricing.');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style             CURTAIN AREA%class   EXHAUST / X-samp / B-samp | SLIVER AREA%class  EXHAUST / X-samp / B-samp');
for (const s of ORDER) {
  const e = EX[s]; if (!e || e.refused) continue;
  const xs = X[s] && X[s].partition ? X[s].partition : null;
  const bs = B[s] && B[s].partition ? B[s].partition : null;
  console.log(`${padE(s, 17)} ${pad(f(e.exCurtainAreaPct), 20)} / ${pad(xs ? f(xs.CURTAIN.areaPctClass) : '—', 7)} / ${pad(bs ? f(bs.CURTAIN.areaPctClass) : '—', 7)} | ${pad(f(e.exSliverAreaPctClass), 17)} / ${pad(xs ? f(xs.SLIVER.areaPctClass) : '—', 7)} / ${pad(bs ? f(bs.SLIVER.areaPctClass) : '—', 7)}`);
}
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE D — REPRODUCIBILITY: the X arm (2500 class edges) vs the B arm (15000 class edges)');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style             TARGET AREA%class X / B   REAL_TURN AREA%class X / B   dominant flagged X / B');
for (const s of ORDER) {
  const x = X[s]; const b = B[s];
  if (!x || x.refused || !x.partition) continue;
  const bs = b && b.partition ? b : null;
  console.log(`${padE(s, 17)} ${pad(f(x.flaggedAreaPctClass, 3), 10)} / ${pad(bs ? f(bs.flaggedAreaPctClass, 3) : '—', 8)}   ${pad(f(x.partition.REAL_TURN.areaPctClass, 3), 12)} / ${pad(bs ? f(bs.partition.REAL_TURN.areaPctClass, 3) : '—', 8)}   ${padE(x.dominantFlaggedByArea, 11)} / ${bs ? bs.dominantFlaggedByArea : '—'}`);
}
