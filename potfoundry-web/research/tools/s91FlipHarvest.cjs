// s91FlipHarvest.cjs — one row per S91 flip arm, from s60ConstrainedFlip's own summary.json.
//
// *** WHY THE ABSOLUTE mm2 COLUMN EXISTS, AND IT IS NOT COSMETIC (measured 2026-08-05 on GeometricStar).
// s60 reports orientation over-bar AREA as a PERCENT OF SURFACE. A constrained flip does NOT conserve
// total area — re-cutting the diagonal of a non-planar quad changes the two triangles' areas — so the
// denominator MOVES. On Gothic it moves 0.9998x and the percent is safe. On GeometricStar it moves
// 1.2909x, and the percent ratio reads 0.558x where the ABSOLUTE over-bar area ratio is 0.432x: the
// percentage UNDERSTATES the damage by 1.29x. Every AREA verdict here is quoted in ABSOLUTE mm2 with
// the areaAll ratio printed beside it, exactly as the campaign's rule 1 demands. ***
const fs = require('node:fs'); const path = require('node:path');
const DIR = 'research/exchange/_strataConformBisect/s60flip';
const only = process.argv[2] ?? 'ON';
const rows = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.summary.json')) continue;
  if (!f.includes(only)) continue;
  const o = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (!o.before || !o.after || o.arm !== 'con') continue;
  if (typeof o.before.tangAreaOver !== 'number' || typeof o.after.tangAreaOver !== 'number') { console.log(`(skipped ${o.tag}: pre-AREA summary, no tangAreaOver)`); continue; }
  if (!/^S91.*ON$/.test(o.tag)) continue;
  if (typeof b0 === 'undefined') { }
  const b = o.before; const a = o.after; const tb = o.topoBefore; const ta = o.topoAfter;
  rows.push({
    tag: o.tag, style: o.style, nTri: o.nTri, flips: o.totalFlips,
    areaRatio: a.areaAll / b.areaAll,
    ovAreaB: b.tangAreaOver, ovAreaA: a.tangAreaOver, areaAbsRatio: b.tangAreaOver / a.tangAreaOver,
    ovPctB: 100 * b.tangAreaOver / b.areaAll, ovPctA: 100 * a.tangAreaOver / a.areaAll,
    ovCntB: b.tangOver, ovCntA: a.tangOver, cntRatio: b.tangOver / Math.max(1, a.tangOver),
    posB: b.posOver, posA: a.posOver,
    invB: b.nOver90, invA: a.nOver90, inv120B: b.nOver120, inv120A: a.nOver120,
    cap150B: b.cap150, cap150A: a.cap150, cap179B: b.cap179, cap179A: a.cap179,
    jit1B: b.jitOver1, jit1A: a.jitOver1, jit10B: b.jitOver10, jit10A: a.jitOver10,
    topoSame: tb.edges === ta.edges && tb.bnd === ta.bnd && tb.nm === ta.nm && tb.orientBad === ta.orientBad,
    edges: tb.edges, bnd: tb.bnd, nm: ta.nm, orientBad: ta.orientBad,
    rejPos: o.rej.pos, rejDet: o.rej.det, rejFold: o.rej.fold,
  });
}
rows.sort((x, y) => y.areaAbsRatio - x.areaAbsRatio);
const P = (s, n) => String(s).padStart(n);
console.log('style               |   nTri  |  flips  | over-bar AREA mm2  before ->  after | **ABS ratio** | %surf b->a | areaAll x | over-bar CNT b->a | cnt x | plane pos b->a | inv>90 b->a | caps>=150 b->a | jit>1um b->a | topo | rejPos | rejDet');
for (const r of rows) {
  console.log([
    r.style.padEnd(19), P(r.nTri, 8), P(r.flips, 8),
    `${P(r.ovAreaB.toFixed(1), 10)} -> ${P(r.ovAreaA.toFixed(1), 9)}`,
    `**${P(r.areaAbsRatio.toFixed(3), 7)}x**`,
    `${r.ovPctB.toFixed(2)}->${r.ovPctA.toFixed(2)}`,
    `${r.areaRatio.toFixed(4)}`,
    `${P(r.ovCntB, 8)}->${P(r.ovCntA, 8)}`, `${r.cntRatio.toFixed(2)}x`,
    `${r.posB}->${r.posA}`, `${r.invB}->${r.invA}`, `${r.cap150B}->${r.cap150A}`,
    `${r.jit1B}->${r.jit1A}`,
    r.topoSame ? 'SAME' : '*** CHANGED ***', P(r.rejPos, 7), P(r.rejDet, 8),
  ].join(' | '));
}
const ars = rows.map((r) => r.areaAbsRatio).sort((x, y) => x - y);
if (ars.length > 0) {
  const med = ars.length % 2 ? ars[(ars.length - 1) / 2] : 0.5 * (ars[ars.length / 2 - 1] + ars[ars.length / 2]);
  console.log(`\nn=${ars.length}   ABSOLUTE over-bar AREA ratio: min ${ars[0].toFixed(3)}x  MEDIAN ${med.toFixed(3)}x  max ${ars[ars.length - 1].toFixed(3)}x`);
  console.log(`   >= 2.5x: ${rows.filter((r) => r.areaAbsRatio >= 2.5).length}/${rows.length}   >= 2.0x: ${rows.filter((r) => r.areaAbsRatio >= 2.0).length}   < 1.5x: ${rows.filter((r) => r.areaAbsRatio < 1.5).length}   WORSE (<1.0x): ${rows.filter((r) => r.areaAbsRatio < 1.0).length}`);
  console.log(`   topology CHANGED on: ${rows.filter((r) => !r.topoSame).map((r) => r.style).join(', ') || 'NONE'}`);
}
