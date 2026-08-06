// revS115InsetMatch.cjs — the claim's headline FIDELITY ratio, recomputed at MATCHED inset.
// The claim divides the target set's normDeg p50 at inset 0.05 (68.564) by the ALIGNED class's
// normDeg p50 at inset 0.10 (1.9487) to get "35.2x", and 143.41 (inset 0.05) / 1.9487 (inset 0.10)
// to get "73.5x". Its own caveat says normDeg moves 70x across the inset default. Read-only.
const fs = require('fs');
const D = 'research/exchange/_strataConformBisect/straddle/';
const q = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const bb = fs.readFileSync(D + 'S113OPB_ORACLE_GOTH.ndjson', 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const cc = fs.readFileSync(D + 'S113OPC_ORACLE_GOTH.ndjson', 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const aligned = bb.filter((r) => r.sepDeg < 45 && r.n10 <= 5);
const a05 = q(aligned.map((r) => r.n05), 0.5); const a10 = q(aligned.map((r) => r.n10), 0.5);
console.log('ALIGNED class n =', aligned.length);
console.log('  normDeg p50 @ inset 0.05 =', a05.toFixed(4), ' | @ inset 0.10 =', a10.toFixed(4));
const t05 = q(cc.map((r) => r.n05), 0.5); const t10 = q(cc.map((r) => r.n10), 0.5);
console.log('TARGET SET n =', cc.length);
console.log('  normDeg p50 @ inset 0.05 =', t05.toFixed(4), ' | @ inset 0.10 =', t10.toFixed(4));
// the "genuine interior straddlers" class: OPC irr is the visible-metric label; the fidelity class in
// the report is intSep>=45 && intMinor>=0.02 (interior crease + real minority share).
const strad = cc.filter((r) => r.intSep >= 45 && r.intMinor >= 0.02);
const s05 = q(strad.map((r) => r.n05), 0.5); const s10 = q(strad.map((r) => r.n10), 0.5);
console.log('INTERIOR STRADDLERS n =', strad.length, '(report says 1537)');
console.log('  normDeg p50 @ inset 0.05 =', s05.toFixed(4), ' | @ inset 0.10 =', s10.toFixed(4));
console.log('');
console.log('CLAIMED (MIXED inset: numerator 0.05, denominator 0.10):');
console.log('  whole target   68.564 / 1.9487 =', (68.564 / 1.9487).toFixed(2) + 'x   <- the claim\'s "35.2x"');
console.log('  straddlers    143.41  / 1.9487 =', (143.41 / 1.9487).toFixed(2) + 'x   <- the claim\'s "73.5x"');
console.log('MATCHED inset 0.05:');
console.log('  whole target  ', t05.toFixed(3), '/', a05.toFixed(4), '=', (t05 / a05).toFixed(2) + 'x');
console.log('  straddlers    ', s05.toFixed(3), '/', a05.toFixed(4), '=', (s05 / a05).toFixed(2) + 'x');
console.log('MATCHED inset 0.10:');
console.log('  whole target  ', t10.toFixed(3), '/', a10.toFixed(4), '=', (t10 / a10).toFixed(2) + 'x');
console.log('  straddlers    ', s10.toFixed(3), '/', a10.toFixed(4), '=', (s10 / a10).toFixed(2) + 'x');
