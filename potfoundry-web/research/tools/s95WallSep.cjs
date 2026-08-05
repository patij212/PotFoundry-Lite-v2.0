#!/usr/bin/env node
/* eslint-disable no-console */
// s95WallSep.cjs — W1 FINAL: WHAT ACTUALLY SEPARATES VORONOI FROM GOTHIC?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE FACT THAT FORCES THIS FILE. s95WallCensus w2, 20,000 parents / 60,000 edges each, same tool,
// same bars, same build:
//        fold rate   Voronoi 5.8933% of edges (0.4602% of parent AREA)
//                    Gothic  0.1133% of edges (0.0095% of parent AREA)     = 52.0x / 48.4x
// and yet the WALL ANGLE runs the OTHER WAY -- Gothic's surface reaches BETA 85.23 deg against
// Voronoi's 76.10, and holds 8.24% of its area above 75 deg against Voronoi's 0.92%. In the
// BETA in [60,75) band the fold rates are 10.568% (Voronoi) vs 0.094% (Gothic): *** 112x apart at
// THE SAME WALL ANGLE. *** So "near-vertical wall" cannot be the cause of the fold. Something else is.
//
// ── PRE-REGISTERED (written before this file was run) ─────────────────────────────────────────────
// H-SEP: the separating variable is FACET SHAPE, not wall angle. Define the shape index
//        q = h_min / sqrt(area)   (equilateral = 1.3161, sliver -> 0; scale-free by construction).
//        The fold needs 2|dApex| >= h_min, and h_min is what q measures.
//   *** KILL: if, binned on q, Voronoi's fold rate is still >= 3x Gothic's in the bins where BOTH
//   have >= 200 edges, then shape does NOT explain the 52x and H-SEP is REFUTED. ***
// CONTROL: the same table binned on BETA must NOT collapse (it already does not -- 112x at equal
// BETA), so a collapse on q is informative and a collapse on BETA would have been the null.
//
// Usage: node research/tools/s95WallSep.cjs
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('node:fs');

const DIR = 'research/exchange/_strataConformBisect/s95';
const SETS = [
  { tag: 'VORONOI', f: `${DIR}/S95_W2_VOR_D.ndjson`, note: 'voronoi_ring_D--.stl  806,765 tris  SHAPE-OFF  (S93 measured LEPP 222x / 15.6% uncleared on THIS mesh)' },
  { tag: 'VOR_SHP', f: `${DIR}/S95_W2_VOR_S94CTL.ndjson`, note: 'voronoi_ring_D--H_S94CTL.stl  492,068 tris  SHAPE-ON  — SAME style, SAME rA, SAME params' },
  { tag: 'GOTHIC', f: `${DIR}/S95_W2_GOTH_S39CTL.ndjson`, note: 'gothicarches_ring_DS-HT_S39CTL.stl  LEPP 6.67x / 0.00% uncleared' },
];
const load = (f) => { const o = []; for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.length > 3) o.push(JSON.parse(l)); return o; };
const q = (r) => r.hmin / Math.sqrt(Math.max(1e-300, r.ar));
const D = {};
for (const S of SETS) D[S.tag] = load(S.f);

const quant = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };

console.log('='.repeat(112));
console.log('  S95 W1-FINAL — WHAT SEPARATES THE TWO CLASSES?   fold = a 3-D signed-area inversion of a');
console.log('  child under the mesher\'s own radial lift, measured in the PARENT plane. 60,000 edges each.');
console.log('='.repeat(112));
for (const S of SETS) {
  const R = D[S.tag]; const f = R.filter((r) => r.foldR === 1);
  console.log(`  ${S.tag.padEnd(9)} ${String(R.length).padStart(7)} edges   folds ${String(f.length).padStart(6)} = ${((100 * f.length) / R.length).toFixed(4)}%   ${S.note}`);
  console.log(`            shape q = h_min/sqrt(area)  count-p01/05/25/50 = ${[0.01, 0.05, 0.25, 0.5].map((p) => quant(R.map(q), p).toFixed(4)).join('  ')}   (equilateral = 1.3161)`);
  console.log(`            |dApex|/h_min               count-p50/90/99/999 = ${[0.5, 0.9, 0.99, 0.999].map((p) => quant(R.map((r) => Math.abs(r.dApex) / r.hmin), p).toExponential(3)).join('  ')}`);
  console.log(`            delta (mm)                  count-p50/90/99/999 = ${[0.5, 0.9, 0.99, 0.999].map((p) => quant(R.map((r) => r.delta), p).toExponential(3)).join('  ')}`);
}

const bins = (name, val, edges) => {
  console.log('');
  console.log(`── FOLD RATE binned on ${name} ──`);
  console.log(`   ${'bin'.padEnd(20)} ${'VOR n'.padStart(8)} ${'VOR fold%'.padStart(10)} ${'GOTH n'.padStart(8)} ${'GOTH fold%'.padStart(11)} ${'ratio'.padStart(8)}`);
  for (let i = 0; i < edges.length - 1; i += 1) {
    const lo = edges[i]; const hi = edges[i + 1];
    const out = {};
    for (const S of SETS) {
      const s = D[S.tag].filter((r) => val(r) >= lo && val(r) < hi);
      out[S.tag] = { n: s.length, r: (100 * s.filter((r) => r.foldR === 1).length) / Math.max(1, s.length) };
    }
    const both = out.VORONOI.n >= 200 && out.GOTHIC.n >= 200;
    const rat = out.GOTHIC.r > 0 ? out.VORONOI.r / out.GOTHIC.r : NaN;
    console.log(`   [${lo.toFixed(3)}, ${hi.toFixed(3)})`.padEnd(23)
      + `${String(out.VORONOI.n).padStart(8)} ${out.VORONOI.r.toFixed(4).padStart(10)} ${String(out.GOTHIC.n).padStart(8)} ${out.GOTHIC.r.toFixed(4).padStart(11)} ${(Number.isFinite(rat) ? rat.toFixed(2) : '  -  ').padStart(8)}${both ? '' : '   (thin)'}`);
  }
  const ok = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const lo = edges[i]; const hi = edges[i + 1];
    const v = D.VORONOI.filter((r) => val(r) >= lo && val(r) < hi);
    const g = D.GOTHIC.filter((r) => val(r) >= lo && val(r) < hi);
    if (v.length >= 200 && g.length >= 200) {
      const vr = (100 * v.filter((r) => r.foldR === 1).length) / v.length;
      const gr = (100 * g.filter((r) => r.foldR === 1).length) / g.length;
      ok.push(gr > 0 ? vr / gr : Infinity);
    }
  }
  if (ok.length > 0) {
    const med = quant(ok, 0.5);
    console.log(`   *** median VOR/GOTH fold-rate ratio over the ${ok.length} well-populated bins = ${Number.isFinite(med) ? med.toFixed(2) : 'inf'}   (bins: ${ok.map((x) => (Number.isFinite(x) ? x.toFixed(1) : 'inf')).join(', ')}) ***`);
  }
};

bins('SHAPE q = h_min/sqrt(area)  (H-SEP: KILL if ratio stays >= 3x)', q, [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.4]);
bins('WALL ANGLE beta (deg)  — the CONTROL, already known not to collapse', (r) => r.beta, [0, 5, 15, 30, 45, 60, 75, 91]);
bins('|dApex| / h_min  — the fold criterion itself (must collapse: it IS the mechanism)', (r) => Math.abs(r.dApex) / r.hmin, [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1e9]);
bins('delta (mm) — the raw lift displacement', (r) => r.delta, [0, 1e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e9]);

// how much of each mesh's edge population sits in the sliver corner, and how much of the FOLD does
console.log('');
console.log('── WHERE THE FOLDS LIVE: joint (shape q, wall angle beta) share of the FOLD population ──');
for (const S of SETS) {
  const R = D[S.tag]; const f = R.filter((r) => r.foldR === 1);
  const aAll = R.reduce((s, r) => s + r.ar, 0);
  const share = (pred) => { const s = f.filter(pred); const p = R.filter(pred);
    return `${((100 * s.length) / Math.max(1, f.length)).toFixed(1).padStart(5)}% of folds  |  pop ${((100 * p.length) / R.length).toFixed(1).padStart(5)}% cnt / ${((100 * p.reduce((a, r) => a + r.ar, 0)) / aAll).toFixed(2).padStart(5)}% area`; };
  console.log(`  ${S.tag}`);
  console.log(`    q < 0.4  (sliver)                    ${share((r) => q(r) < 0.4)}`);
  console.log(`    q < 0.4  AND beta >= 45              ${share((r) => q(r) < 0.4 && r.beta >= 45)}`);
  console.log(`    q >= 0.4 AND beta >= 45              ${share((r) => q(r) >= 0.4 && r.beta >= 45)}`);
  console.log(`    q >= 0.4 AND beta <  45              ${share((r) => q(r) >= 0.4 && r.beta < 45)}`);
}

// does a fold coincide with a BACK-FACING child? (validity check on the fold test itself)
console.log('');
console.log('── VALIDITY: does a "fold" (parent-plane signed-area inversion) coincide with a BACK-FACING');
console.log('   child (worse-child normDeg > 90 under the covering k=4 ruler)? ──');
for (const S of SETS) {
  const R = D[S.tag];
  let a = 0; let b = 0; let c = 0; let d = 0;
  for (const r of R) { const bf = r.ndR > 90; if (r.foldR === 1 && bf) a += 1; else if (r.foldR === 1) b += 1; else if (bf) c += 1; else d += 1; }
  console.log(`   ${S.tag.padEnd(9)} fold&back ${String(a).padStart(6)}   fold&front ${String(b).padStart(6)}   nofold&back ${String(c).padStart(6)}   neither ${String(d).padStart(6)}   P(back|fold) ${(a / Math.max(1, a + b)).toFixed(4)}   P(fold|back) ${(a / Math.max(1, a + c)).toFixed(4)}`);
}
