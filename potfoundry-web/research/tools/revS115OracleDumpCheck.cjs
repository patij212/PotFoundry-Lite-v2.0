// revS115OracleDumpCheck.cjs — REVIEWER instrument check on the S113-OP oracle dumps. Read-only.
const fs = require('fs');
const D = 'research/exchange/_strataConformBisect/straddle/';
const rows = fs.readFileSync(D + 'S113OP_ORACLE_GOTH.ndjson', 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const q = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mx = (v) => v.reduce((a, b) => (b > a ? b : a), -Infinity);
console.log('=== S113OP_ORACLE_GOTH.ndjson  rows', rows.length, '===');
let eq = 0; let gap0 = 0; let irr = 0;
for (const r of rows) { if (Math.abs(r.sepCreaseDeg - r.diamDeg) < 1e-9) eq += 1; if (r.gapMm === 0) gap0 += 1; if (r.irreducible) irr += 1; }
console.log('sepCreaseDeg == diamDeg (exact, 1e-9):', eq, '=', (100 * eq / rows.length).toFixed(2) + '%');
console.log('gapMm == 0 exactly:', gap0, '=', (100 * gap0 / rows.length).toFixed(2) + '%');
console.log('irreducible pairs:', irr, '=', (100 * irr / rows.length).toFixed(2) + '%');
const dd = rows.map((r) => r.diamDeg - r.sepCreaseDeg);
console.log('diam - sepCrease: p10', q(dd, 0.1).toFixed(4), 'p50', q(dd, 0.5).toFixed(4), 'p90', q(dd, 0.9).toFixed(4), 'max', mx(dd).toFixed(4));
const dc = rows.map((r) => Math.abs(r.sepCentDeg - r.sepCreaseDeg));
console.log('|sepCent - sepCrease|: p10', q(dc, 0.1).toFixed(4), 'p50', q(dc, 0.5).toFixed(4), 'p90', q(dc, 0.9).toFixed(4), 'max', mx(dc).toFixed(4));
let a = 0; let b = 0; let c = 0; let d2 = 0;
for (const r of rows) { if (r.pairCrease && r.irreducible) a += 1; else if (r.pairCrease && !r.irreducible) b += 1; else if (!r.pairCrease && r.irreducible) c += 1; else d2 += 1; }
console.log('cross-tab pairCrease x irreducible:  both', a, '| crease-not-irr', b, '| irr-WITHOUT-crease-flag', c, '| neither', d2);

// Fidelity of the two facets on IRREDUCIBLE pairs
const buckets = { both: [], one: [], none: [] };
for (const r of rows) {
  if (!r.irreducible) continue;
  const lo = Math.min(r.f1ObsOut, r.f2ObsOut); const hi = Math.max(r.f1ObsOut, r.f2ObsOut);
  const ar = r.area1 + r.area2;
  if (hi <= 5) buckets.both.push(ar); else if (lo <= 5) buckets.one.push(ar); else buckets.none.push(ar);
}
const sum = (v) => v.reduce((x, y) => x + y, 0);
console.log('IRREDUCIBLE pairs split by the fidelity of BOTH member facets (normDeg outward inset 0.05):');
for (const k of ['both', 'one', 'none']) {
  console.log(`  ${k}<=5deg  COUNT ${buckets[k].length}  pair-AREA ${sum(buckets[k]).toFixed(4)} mm2`);
}

// OPC: irr vs interior straddle
const c2 = fs.readFileSync(D + 'S113OPC_ORACLE_GOTH.ndjson', 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
console.log('\n=== S113OPC (target facets)', c2.length, '===');
let irrA = 0; let irrN = 0; let tot = 0;
for (const r of c2) { tot += r.area; if (r.irr) { irrN += 1; irrA += r.area; } }
console.log('irr facets COUNT', irrN, 'AREA', irrA.toFixed(4), '=', (100 * irrA / tot).toFixed(2) + '% of', tot.toFixed(3));
const n10 = c2.map((r) => r.n10); const n05 = c2.map((r) => r.n05);
console.log('target n05 p50', q(n05, 0.5).toFixed(3), 'MAX', mx(n05).toFixed(2), '| n10 p50', q(n10, 0.5).toFixed(3), 'MAX', mx(n10).toFixed(2));

// OPB: the >45 wall class
const bb = fs.readFileSync(D + 'S113OPB_ORACLE_GOTH.ndjson', 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
console.log('\n=== S113OPB (wall facets, dihedral>45)', bb.length, '===');
let tA = 0; for (const r of bb) tA += r.area;
console.log('total AREA', tA.toFixed(3), 'mm2');
const dih = bb.map((r) => r.dihDeg);
console.log('dihDeg min', Math.min(...dih).toFixed(3), 'p10', q(dih, 0.1).toFixed(2), 'p50', q(dih, 0.5).toFixed(2), 'MAX', mx(dih).toFixed(2));
console.log('  >>> if min dihDeg > 45 the population is PRE-FILTERED on the very bar the kill line tests.');
// reproduce the ALIGNED class
let alN = 0; let alA = 0; const aln10 = [];
for (const r of bb) { if (r.sepDeg < 45 && r.n10 <= 5) { alN += 1; alA += r.area; aln10.push(r.n10); } }
console.log('ALIGNED (sepDeg<45 && n10<=5): COUNT', alN, 'AREA', alA.toFixed(3), '=', (100 * alA / tA).toFixed(2) + '% of the >45 class');
console.log('  their n10 p50', q(aln10, 0.5).toFixed(4), 'MAX', mx(aln10).toFixed(4), ' (bar was <=5 => MAX<=5 BY CONSTRUCTION)');
const aldih = bb.filter((r) => r.sepDeg < 45 && r.n10 <= 5).map((r) => r.dihDeg);
console.log('  their dihDeg MIN', Math.min(...aldih).toFixed(3), 'p50', q(aldih, 0.5).toFixed(2), ' (MIN>45 => "100% still over the cut" is a TAUTOLOGY)');
