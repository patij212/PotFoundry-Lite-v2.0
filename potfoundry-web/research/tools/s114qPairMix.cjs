// s114qPairMix.cjs — the THIRD accounting defect in S112/S113's P1 and P3: the statistic is a PAIR MAX
// of normDeg minus a PAIR MAX of spreadDeg, and those two maxima need not come from the SAME FACET.
// Reads the pinned dump only; no mesh, no analytic. Usage: node research/tools/s114qPairMix.cjs
const fs = require('node:fs');
const NDJ = process.env.PF_S114Q_NDJSON
  || 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const rows = fs.readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const q = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const log = console.log;
log(`rows ${rows.length} from ${NDJ}`);
const dsp = rows.map((r) => Math.abs(r.spread1 - r.spread2));
log(`|spread1 - spread2| : p10 ${q(dsp, 0.1).toFixed(2)} p50 ${q(dsp, 0.5).toFixed(2)} p90 ${q(dsp, 0.9).toFixed(2)} MAX ${Math.max(...dsp).toFixed(2)} deg`);
log(`pairs whose two facets differ in spreadDeg by > 1 deg: ${dsp.filter((x) => x > 1).length} = ${((dsp.filter((x) => x > 1).length / rows.length) * 100).toFixed(2)}%`);
const exMax = rows.map((r) => r.normHi - Math.max(r.spread1, r.spread2));
const exMin = rows.map((r) => r.normHi - Math.min(r.spread1, r.spread2));
log(`P3 as published, normHi - max(spread1,spread2): p10 ${q(exMax, 0.1).toFixed(2)} p50 ${q(exMax, 0.5).toFixed(2)} p90 ${q(exMax, 0.9).toFixed(2)}`);
log(`same with the OTHER facet's spread            : p10 ${q(exMin, 0.1).toFixed(2)} p50 ${q(exMin, 0.5).toFixed(2)} p90 ${q(exMin, 0.9).toFixed(2)}`);
log(`  => the published statistic moves ${(q(exMin, 0.5) / q(exMax, 0.5)).toFixed(3)}x at the median purely on WHICH facet's spread is subtracted.`);
const pf = []; const seen = new Set();
for (const r of rows) {
  if (!seen.has(r.f1)) { seen.add(r.f1); pf.push(r.spread1); }
  if (!seen.has(r.f2)) { seen.add(r.f2); pf.push(r.spread2); }
}
log(`spreadDeg PER FACET (n=${pf.length}): p10 ${q(pf, 0.1).toFixed(2)} p50 ${q(pf, 0.5).toFixed(2)} p90 ${q(pf, 0.9).toFixed(2)}`);
log(`spreadDeg PAIR MAX  (n=${rows.length}): p50 ${q(rows.map((r) => Math.max(r.spread1, r.spread2)), 0.5).toFixed(2)}  => pair-max inflates the median ${(q(rows.map((r) => Math.max(r.spread1, r.spread2)), 0.5) / q(pf, 0.5)).toFixed(2)}x`);
