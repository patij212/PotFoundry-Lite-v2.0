// revqCeilingAudit.cjs — price the FIDELITY-ceiling ratios against NON-circular reference classes.
const fs = require('node:fs');
const D = 'research/exchange/_strataConformBisect/straddle';
const rd = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const q = (v, p) => { const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const mx = (v) => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
const B = rd(`${D}/S113OPB_ORACLE_GOTH.ndjson`);
const C = rd(`${D}/S113OPC_ORACLE_GOTH.ndjson`);
const CREASE_MIN = 15, VIS = 45;
const ar = (v) => v.reduce((a, r) => a + r.area, 0);
const MESH = 38453.259;

const flaggedArea = ar(B);
const noIntCrease = B.filter((r) => !(r.sepDeg >= CREASE_MIN && r.minor >= 0.02));
const aligned = noIntCrease.filter((r) => r.n10 <= 5);
const rep = (name, v, circ) => {
  console.log(`${name}: COUNT ${v.length} (${((v.length / B.length) * 100).toFixed(2)}%)  AREA ${ar(v).toFixed(3)} mm2 = ${((ar(v) / flaggedArea) * 100).toFixed(2)}% of flagged / ${((ar(v) / MESH) * 100).toFixed(4)}% of mesh`);
  console.log(`   n10  p50 ${q(v.map((r) => r.n10), 0.5).toFixed(4)}  p90 ${q(v.map((r) => r.n10), 0.9).toFixed(3)}  MAX ${mx(v.map((r) => r.n10)).toFixed(3)} deg   ${circ}`);
  console.log(`   dih  p10 ${q(v.map((r) => r.dihDeg), 0.1).toFixed(2)} p50 ${q(v.map((r) => r.dihDeg), 0.5).toFixed(2)} MAX ${mx(v.map((r) => r.dihDeg)).toFixed(2)} deg;  over ${VIS}: ${v.filter((r) => r.dihDeg > VIS).length}/${v.length} = ${((v.filter((r) => r.dihDeg > VIS).length / v.length) * 100).toFixed(2)}%  AREA ${ar(v.filter((r) => r.dihDeg > VIS)).toFixed(3)}`);
};
console.log(`FLAGGED (>45 wall) ${B.length} facets  ${flaggedArea.toFixed(3)} mm2`);
rep('ALIGNED  (no-int-crease AND n10<=5)  [CIRCULAR for n10]', aligned, '<-- selected on n10<=5');
rep('NO-INTERIOR-CREASE (NOT selected on n10)', noIntCrease, '<-- non-circular');
console.log('');

// the observed side, from the pinned target set
const obs50 = q(C.map((r) => r.n05), 0.5);
const obsMax = mx(C.map((r) => r.n05));
const strad = C.filter((r) => r.intSep >= VIS && r.intMinor >= 0.05);
const strad50 = q(strad.map((r) => r.n05), 0.5);
console.log(`OBSERVED target n05: p50 ${obs50.toFixed(3)}  MAX ${obsMax.toFixed(2)};  interior straddlers ${strad.length} (${((strad.length / C.length) * 100).toFixed(2)}%) AREA ${ar(strad).toFixed(4)} = ${((ar(strad) / ar(C)) * 100).toFixed(2)}% of target, n05 p50 ${strad50.toFixed(2)}`);
console.log('');
const ceilA = q(aligned.map((r) => r.n10), 0.5), ceilAmax = mx(aligned.map((r) => r.n10));
const ceilN = q(noIntCrease.map((r) => r.n10), 0.5), ceilNmax = mx(noIntCrease.map((r) => r.n10)), ceilN90 = q(noIntCrease.map((r) => r.n10), 0.9);
console.log('RATIO TABLE — the claimed 35.2x / 73.5x / 36.0x, recomputed against each reference:');
console.log(`  vs CIRCULAR aligned ceiling (p50 ${ceilA.toFixed(4)}, MAX ${ceilAmax.toFixed(3)}):`);
console.log(`     whole-set median ${(obs50 / ceilA).toFixed(1)}x   straddler median ${(strad50 / ceilA).toFixed(1)}x   MAX ${(obsMax / ceilAmax).toFixed(1)}x`);
console.log(`  vs NON-CIRCULAR no-interior-crease ceiling (p50 ${ceilN.toFixed(4)}, p90 ${ceilN90.toFixed(2)}, MAX ${ceilNmax.toFixed(2)}):`);
console.log(`     whole-set median ${(obs50 / ceilN).toFixed(1)}x   straddler median ${(strad50 / ceilN).toFixed(1)}x   MAX ${(obsMax / ceilNmax).toFixed(2)}x   p90/p90 ${(q(C.map((r) => r.n05), 0.9) / ceilN90).toFixed(2)}x`);
