// s114TableA.cjs — assemble the S114 QUARTER-A per-style table + machine-readable roll-up.
// Reads the per-style JSON written by s114SweepA.ts. No measurement happens here; it only formats
// numbers that were already printed, so it cannot introduce one.
const { readdirSync, readFileSync, writeFileSync } = require('node:fs');
const DIR = process.env.PF_S114_OUTDIR || 'research/exchange/_strataConformBisect/s114sweepA';
const ORDER = ['CTL_Gothic', 'ArtDeco', 'BambooSegments', 'BasketWeave', 'BasketWeave_DIAG',
  'CelticKnot', 'CelticKnot_DIAG', 'CelticTriquetra'];
const rows = [];
for (const tag of ORDER) {
  let j; try { j = JSON.parse(readFileSync(`${DIR}/S114A_${tag}.json`, 'utf8')); } catch { continue; }
  rows.push({ tag, j });
}
const f = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');
const out = [];
const P = (s) => { out.push(s); console.log(s); };

P('════════════════════════════════════════════════════════════════════════════════════════════════════');
P('  S114 QUARTER A — THE ALL-STYLES SWEEP ON THE HONEST RULER');
P('  roster: the 20-style S91/S101 `*_ring_D--` family; quarter A = first 5 alphabetically');
P('  Gothic row is the INSTRUMENT CONTROL (gothicarches_ring_DS-HT_S39CTL), not part of quarter A');
P('════════════════════════════════════════════════════════════════════════════════════════════════════');
P('');
P('── TABLE 1: MESH + PRECOND ──');
P('style                 facets      area mm2   PRECOND MAX um   p99 um     >50um samples   admissible');
for (const { tag, j } of rows) {
  const p = j.precond || {};
  P(`${tag.padEnd(20)} ${String(j.stage1 ? j.stage1.facets : '—').padStart(9)}  ${f(j.stage1 && j.stage1.areaMm2, 1).padStart(10)}   ${f(p.maxUm, 4).padStart(12)}   ${(p.p99Um != null ? p.p99Um.toExponential(2) : '—').padStart(9)}   ${String(p.exceed50 ?? '—').padStart(6)}/${String(p.samples ?? '—').padStart(6)}   ${j.verdict === 'REFUSED-PRECOND' ? 'REFUSED' : 'yes'}`);
}
P('');
P('── TABLE 2: DIHEDRAL (analytic-free, EXHAUSTIVE) ──');
P('style                 edge p50   edge p99   facet p50  facet p99  facet MAX   >45 facets    >45 AREA mm2   >45 AREA % of mesh');
for (const { tag, j } of rows) {
  const s = j.stage1; if (!s) continue;
  P(`${tag.padEnd(20)} ${f(s.edgeDihP50, 3).padStart(8)}  ${f(s.edgeDihP99, 3).padStart(9)}  ${f(s.facetDihP50, 3).padStart(9)}  ${f(s.facetDihP99, 3).padStart(9)}  ${f(s.facetDihMax, 2).padStart(9)}   ${String(s.hiFacets).padStart(9)}   ${f(s.hiAreaMm2, 3).padStart(12)}   ${f(s.hiAreaPct, 4).padStart(8)}%`);
}
P('');
P('── TABLE 3: WHOLE-MESH normDeg (golden-stride sample, k=8, kink-aware fdNormals, winding) ──');
P('style                inset    p50      p90      p99      MAX     >1deg CNT%  >1deg AREA%  >5deg CNT%  >5deg AREA%');
for (const { tag, j } of rows) {
  const s = j.stage2; if (!s) continue;
  for (const ins of ['0', '0.05']) {
    const v = s[`inset${ins}`]; if (!v) continue;
    P(`${(ins === '0' ? tag : '').padEnd(20)} ${ins.padStart(6)}  ${f(v.p50, 3).padStart(7)}  ${f(v.p90, 3).padStart(7)}  ${f(v.p99, 3).padStart(7)}  ${f(v.max, 2).padStart(7)}  ${f(v.over1CountPct, 2).padStart(9)}  ${f(v.over1AreaPct, 2).padStart(10)}  ${f(v.over5CountPct, 2).padStart(9)}  ${f(v.over5AreaPct, 2).padStart(10)}`);
  }
}
P('');
P('── TABLE 4: THE S112 SCOPING OF THE >45 CLASS (share of >45 class AREA) ──');
P('style                CURTAIN%   ACCURATE%  CONFORMED%  STRADDLING%   graphRatio p50 of the class');
for (const { tag, j } of rows) {
  const s = j.stage3, s7 = j.stage7; if (!s || !s7) continue;
  const den = s7.curtainAreaMm2 + s7.accurateAreaMm2 + s7.conformedAreaMm2 + s7.straddlingAreaMm2;
  const pc = (x) => f((x / den) * 100, 4).padStart(9);
  const gl = (j.curtainLadder || []).find((r) => r.ratio === 8);
  P(`${tag.padEnd(20)} ${pc(s7.curtainAreaMm2)}  ${pc(s7.accurateAreaMm2)}  ${pc(s7.conformedAreaMm2)}   ${pc(s7.straddlingAreaMm2)}    wall-at-ratio8 ${f(gl && gl.wallAreaPctOfClass, 2)}% of class`);
}
P('');
P('── TABLE 5: *** THE QUESTION — DOES S113\'S GOTHIC CONCLUSION GENERALISE? *** ──');
P('   PR-A1 = irreducible share of the STRADDLING class AREA (S113\'s own class; Gothic reads 99.40%)');
P('   class-wide = the same question asked of the WHOLE >45 class (Stage 7)');
P('style                PR-A1%   crease-lab PR-A1%  class-wide%   reducible % of MESH   VERDICT');
for (const { tag, j } of rows) {
  const s4 = j.stage4 || {}, s7 = j.stage7 || {};
  P(`${tag.padEnd(20)} ${f(j.irrAreaPct, 2).padStart(7)}  ${f(s4.irrAreaPctCreaseLabelled, 2).padStart(16)}  ${f(s7.classWideIrrPct, 2).padStart(11)}   ${f(s7.reduciblePctOfMesh, 4).padStart(18)}   ${j.verdict}`);
}
P('');
P('── TABLE 6: CONTROLS (a run whose placebo fires is VOID) ──');
P('style                C2a S113 smooth%  C2b PLACEBO%  3b placebo%  3c K-ladder converged  C3 mismatch  inverted%');
for (const { tag, j } of rows) {
  const c2a = j.c2a || {}, c2b = j.c2b || {}, s3b = j.stage3b || {}, c4 = j.c4 || {};
  P(`${tag.padEnd(20)} ${f(c2a.creasePct, 2).padStart(15)}  ${f(c2b.creasePct, 2).padStart(12)}  ${f(s3b.placeboPct, 2).padStart(11)}  ${String(j._k3cConverged ?? 'see report').padStart(21)}  ${String(j.c3mismatch ?? '—').padStart(11)}  ${f(c4.invertedPct, 2).padStart(9)}`);
}
P('');
P('── TABLE 7: THE CURTAIN CLASS — what the >45 edge actually sits on (Stage 3b/3c) ──');
P('style                rA-JUMP AREA%  rA-KINK AREA%  NEITHER AREA%   3c analytic turn p50   3c IRREDUCIBLE AREA%');
for (const { tag, j } of rows) {
  const b = j.stage3b, c = j.stage3c; if (!b) continue;
  P(`${tag.padEnd(20)} ${f(b.jumpAreaPct, 2).padStart(13)}  ${f(b.kinkAreaPct, 2).padStart(13)}  ${f(b.noneAreaPct, 2).padStart(13)}   ${f(c && c.turnP50, 2).padStart(20)}   ${f(c && c.irrAreaPct, 2).padStart(19)}`);
}
P('');
writeFileSync(`${DIR}/S114A_ROLLUP.json`, `${JSON.stringify(rows.map(({ tag, j }) => ({
  tag, style: j.style, stl: j.stl, verdict: j.verdict,
  precond: j.precond, stage1: j.stage1, stage2: j.stage2, stage3: j.stage3,
  stage3b: j.stage3b, stage3c: j.stage3c, stage4: j.stage4, stage7: j.stage7,
  curtainLadder: j.curtainLadder, controls: { c2a: j.c2a, c2b: j.c2b, c3mismatch: j.c3mismatch, c4: j.c4 },
})), null, 2)}\n`);
writeFileSync(`${DIR}/S114A_TABLE.txt`, `${out.join('\n')}\n`);
console.log(`wrote ${DIR}/S114A_ROLLUP.json and ${DIR}/S114A_TABLE.txt`);
