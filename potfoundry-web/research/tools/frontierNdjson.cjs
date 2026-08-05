#!/usr/bin/env node
/*
 * frontierNdjson.cjs — offline slices of `frontierTaxonomy`'s per-facet rows. NO re-run needed.
 *
 * The taxonomy run dumps every sampled facet, so any further cut of the same population is free and,
 * more importantly, is guaranteed to be the SAME population the headline numbers came from. Two cuts
 * are asked for here that the first pass did not print:
 *
 *   (1) FOLDED vs CREASE vs SMOOTH. `normDeg > 90` means the facet is BACK-FACING relative to the
 *       surface it is supposed to approximate — a folded/inverted facet, which §5.3 of the campaign doc
 *       says exists at 7.4% of children and which NO amount of refinement fixes (the children inherit
 *       the fold). It has to be separated from a crease straddle (`kink > 1 deg`, also refinement-proof
 *       in ANGLE but not in chord) and from the smooth-turning bulk (fixed by density).
 *   (2) The over-bar AREA reported per DECADE of orientation angle, so the "43% of the area is over bar"
 *       headline can be read as a distribution rather than a single number.
 *
 * usage: node research/tools/frontierNdjson.cjs <FR_TAX_*.ndjson> [barUm=10]
 */
const fs = require('node:fs');
const path = process.argv[2];
const BAR = Number(process.argv[3] ?? 10);
if (!path) { console.error('usage: frontierNdjson.cjs <ndjson> [barUm]'); process.exit(1); }
const rows = fs.readFileSync(path, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const areaAll = rows.reduce((s, r) => s + r.ar, 0);
const over = rows.filter((r) => r.tu > BAR);
const areaOver = over.reduce((s, r) => s + r.ar, 0);
const pc = (a) => `${((100 * a) / Math.max(1e-30, areaOver)).toFixed(2)}%`;
const pcAll = (a) => `${((100 * a) / Math.max(1e-30, areaAll)).toFixed(3)}%`;
const cls = (label, pred) => {
  const sel = over.filter(pred);
  const a = sel.reduce((s, r) => s + r.ar, 0);
  const aAll = rows.filter(pred).reduce((s, r) => s + r.ar, 0);
  console.log(`  ${label.padEnd(46)} cnt ${String(sel.length).padStart(6)}  defAREA ${pc(a).padStart(8)}  popAREA ${pcAll(aAll).padStart(8)}`);
};
console.log(`\n=== ${path} ===`);
console.log(`rows ${rows.length}   over-bar ${over.length} (${((100 * over.length) / rows.length).toFixed(2)}%)   over-bar AREA ${pcAll(areaOver)}`);
console.log('\n-- MUTUALLY EXCLUSIVE PARTITION of the over-bar area (folded > crease > smooth) --');
const folded = (r) => r.nd > 90;
const crease = (r) => !folded(r) && r.kk > 1;
const smooth = (r) => !folded(r) && !(r.kk > 1);
cls('FOLDED   normDeg > 90 (back-facing; density CANNOT fix)', folded);
cls('CREASE   kink > 1 deg (angle density-INVARIANT)', crease);
cls('SMOOTH-TURNING remainder (density DOES fix)', smooth);
console.log('\n-- over-bar AREA by orientation ANGLE decade --');
const edges = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 90, 181];
for (let i = 0; i < edges.length - 1; i += 1) {
  cls(`angle in (${edges[i]}, ${edges[i + 1]}] deg`, (r) => r.nd > edges[i] && r.nd <= edges[i + 1]);
}
console.log('\n-- over-bar AREA by the IMPLIED angular-deviation bar the chord bar sets on that facet --');
const abar = (r) => (r.dm > 0 ? (2 * Math.asin(Math.min(1, (BAR / 1000) / (2 * r.dm))) * 180) / Math.PI : 180);
const q = (arr, val, ps) => {
  const a = arr.map((r) => [val(r), r.ar]).filter((x) => Number.isFinite(x[0])).sort((x, y) => x[0] - y[0]);
  const tot = a.reduce((s, x) => s + x[1], 0);
  const out = []; let i = 0; let acc = 0;
  for (const p of ps) { const t = p * tot; while (i < a.length && acc + a[i][1] < t) { acc += a[i][1]; i += 1; } out.push(a[Math.min(i, a.length - 1)][0]); }
  return out;
};
const P = [0.05, 0.25, 0.5, 0.75, 0.95];
console.log(`  implied angular bar (deg) p05/25/50/75/95, over-bar: ${q(over, abar, P).map((x) => x.toFixed(4)).join('  ')}`);
console.log(`  implied angular bar (deg) p05/25/50/75/95, ALL     : ${q(rows, abar, P).map((x) => x.toFixed(4)).join('  ')}`);
console.log('\n-- what fraction of ALL area passes a plain ANGULAR-DEVIATION bar? (the CAD-export currency) --');
for (const deg of [30, 10, 5, 2, 1, 0.5, 0.25]) {
  const a = rows.filter((r) => r.nd > deg).reduce((s, r) => s + r.ar, 0);
  const c = rows.filter((r) => r.nd > deg).length;
  console.log(`  angle > ${String(deg).padStart(5)} deg :  AREA ${pcAll(a).padStart(9)}   count ${((100 * c) / rows.length).toFixed(3).padStart(7)}%`);
}
console.log('\n-- anisotropy of the turning tensor on the over-bar population --');
if (over.length > 0 && over[0].ka !== undefined) {
  console.log(`  kapA/kapB p05/25/50/75/95: ${q(over, (r) => r.ka / Math.max(1e-9, r.kb), P).map((x) => x.toFixed(2)).join('  ')}`);
  console.log(`  misalign  p05/25/50/75/95: ${q(over, (r) => r.mis, P).map((x) => x.toFixed(2)).join('  ')}`);
} else console.log('  (no turning-tensor columns in this file — re-run the taxonomy to add them)');
console.log('');
